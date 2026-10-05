// server/routes/subcontractDms.js
// Маршруты для работы со справочниками «Собственные юрлица», договорами субподряда, прайс-листами и калькулятором СМР

import express from 'express';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { calculateSubcontractAmount } from '../services/subcontractDmsService.js';

const router = express.Router();

// 1. Получить список всех собственных юридических лиц группы («Собственные»)
router.get('/own-companies', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM own_companies 
      ORDER BY is_default DESC, name_short ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching own companies:', err);
    res.status(500).json({ error: 'Ошибка получения собственных юрлиц' });
  }
});

// 2. Получить договоры конкретного подрядчика (с привязкой к собственному юрлицу)
router.get('/contractors/:id/contracts', authenticateToken, async (req, res) => {
  try {
    const contractorId = parseInt(req.params.id, 10);
    const { rows } = await pool.query(`
      SELECT 
        cc.*,
        oc.name_short AS own_company_name,
        oc.inn AS own_company_inn,
        oc.director AS own_company_director,
        pl.id AS price_list_id,
        pl.name AS price_list_name,
        (SELECT COUNT(*) FROM price_list_items pli WHERE pli.price_list_id = pl.id) AS price_items_count
      FROM contractor_contracts cc
      LEFT JOIN own_companies oc ON cc.own_company_id = oc.id
      LEFT JOIN contractor_price_lists pl ON pl.contract_id = cc.id AND pl.is_active = true
      WHERE cc.contractor_id = $1
      ORDER BY cc.contract_date DESC, cc.id DESC
    `, [contractorId]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching contractor contracts:', err);
    res.status(500).json({ error: 'Ошибка получения договоров подрядчика' });
  }
});

// 3. Создать новый договор с подрядчиком
router.post('/contractors/:id/contracts', authenticateToken, async (req, res) => {
  try {
    const contractorId = parseInt(req.params.id, 10);
    const {
      own_company_id,
      contract_number,
      contract_date,
      title,
      customer_tag,
      subject,
      territory,
      valid_from,
      valid_to,
      scan_url,
      copy_from_contract_id
    } = req.body;

    if (!contract_number) {
      return res.status(400).json({ error: 'Номер договора обязателен' });
    }

    const { rows } = await pool.query(`
      INSERT INTO contractor_contracts (
        contractor_id, own_company_id, contract_number, contract_date, title,
        customer_tag, subject, territory, valid_from, valid_to, scan_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      contractorId,
      own_company_id || null,
      contract_number,
      contract_date || new Date(),
      title || `Договор подряда № ${contract_number}`,
      customer_tag || null,
      subject || 'Монтаж СКС и слаботочных систем',
      territory || '',
      valid_from || contract_date || new Date(),
      valid_to || null,
      scan_url || ''
    ]);

    const newContract = rows[0];

    // Если запрошено копирование прайс-листа с предыдущего договора:
    if (copy_from_contract_id) {
      const srcPlRes = await pool.query(`
        SELECT * FROM contractor_price_lists WHERE contract_id = $1 LIMIT 1
      `, [copy_from_contract_id]);
      if (srcPlRes.rows.length) {
        const srcPl = srcPlRes.rows[0];
        const newPlRes = await pool.query(`
          INSERT INTO contractor_price_lists (contract_id, name, customer_tag, region, is_active)
          VALUES ($1, $2, $3, $4, true)
          RETURNING id
        `, [newContract.id, srcPl.name, newContract.customer_tag || srcPl.customer_tag, srcPl.region]);
        const newPlId = newPlRes.rows[0].id;

        await pool.query(`
          INSERT INTO price_list_items (
            price_list_id, work_code, work_name, unit, price_tier_1, price_tier_2, tier_threshold, is_variable_cost, comment, sort_order
          )
          SELECT 
            $1, work_code, work_name, unit, price_tier_1, price_tier_2, tier_threshold, is_variable_cost, comment, sort_order
          FROM price_list_items
          WHERE price_list_id = $2
        `, [newPlId, srcPl.id]);
      }
    }

    res.json(newContract);
  } catch (err) {
    console.error('Error creating contractor contract:', err);
    res.status(500).json({ error: 'Ошибка создания договора: ' + err.message });
  }
});

// 4. Получить прайс-лист со всеми позициями
router.get('/contractor-contracts/:contractId/price-list', authenticateToken, async (req, res) => {
  try {
    const contractId = parseInt(req.params.contractId, 10);
    const plRes = await pool.query(`
      SELECT * FROM contractor_price_lists WHERE contract_id = $1 LIMIT 1
    `, [contractId]);

    if (!plRes.rows.length) {
      return res.json({ price_list: null, items: [] });
    }

    const priceList = plRes.rows[0];
    const itemsRes = await pool.query(`
      SELECT * FROM price_list_items WHERE price_list_id = $1 ORDER BY sort_order ASC, id ASC
    `, [priceList.id]);

    res.json({
      price_list: priceList,
      items: itemsRes.rows
    });
  } catch (err) {
    console.error('Error fetching price list:', err);
    res.status(500).json({ error: 'Ошибка получения прайс-листа' });
  }
});

// 5. Предыдущие подряды подрядчика (для быстрого копирования условий в 2 клика: Казанка -> Юргинское)
router.get('/contractors/:id/previous-subcontracts', authenticateToken, async (req, res) => {
  try {
    const contractorId = parseInt(req.params.id, 10);
    const { rows } = await pool.query(`
      SELECT 
        s.id,
        s.task_id,
        s.work_type,
        s.price_agreed,
        s.deadline,
        s.assigned_date,
        s.installer_fio,
        s.installer_phone,
        s.installer_passport,
        s.auto_number,
        s.specialist_id,
        s.own_company_id,
        s.contractor_contract_id,
        t.address,
        t.region,
        t.customer,
        oc.name_short AS own_company_name,
        cc.contract_number
      FROM task_subcontracts s
      JOIN tasks t ON s.task_id = t.id
      LEFT JOIN own_companies oc ON s.own_company_id = oc.id
      LEFT JOIN contractor_contracts cc ON s.contractor_contract_id = cc.id
      WHERE s.contractor_id = $1
      ORDER BY s.id DESC
      LIMIT 10
    `, [contractorId]);

    res.json(rows);
  } catch (err) {
    console.error('Error fetching previous subcontracts:', err);
    res.status(500).json({ error: 'Ошибка получения истории подрядов' });
  }
});

// 6. Калькулятор субподряда (порты по шкале + км сверх 10км + шкафы)
router.post('/subcontracts/calculate', authenticateToken, async (req, res) => {
  try {
    const { contractorId, customerTag, ports, portType, distanceKm, cabinetType } = req.body;
    if (!contractorId) {
      return res.status(400).json({ error: 'Не указан подрядчик' });
    }

    const result = await calculateSubcontractAmount(pool, {
      contractorId: parseInt(contractorId, 10),
      customerTag: customerTag || null,
      ports: parseInt(ports, 10) || 0,
      portType: portType || 'port_5e',
      distanceKm: parseFloat(distanceKm) || 0,
      cabinetType: cabinetType || null
    });

    res.json(result);
  } catch (err) {
    console.error('Error calculating subcontract:', err);
    res.status(500).json({ error: 'Ошибка расчёта стоимости: ' + err.message });
  }
});

// 7. Сохранение назначения подрядчика из Конструктора (Wizard)
router.post('/tasks/:taskId/subcontract-wizard', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const {
      contractor_id,
      contractor_name,
      own_company_id,
      contractor_contract_id,
      price_list_id,
      work_type,
      price_agreed,
      deadline,
      specialist_id,
      installer_fio,
      installer_phone,
      installer_passport,
      auto_number,
      calculation_details,
      ports_count,
      distance_km,
      comment
    } = req.body;

    if (!contractor_id && !contractor_name) {
      return res.status(400).json({ error: 'Необходимо указать подрядчика' });
    }

    let cId = contractor_id ? parseInt(contractor_id, 10) : null;
    let cName = contractor_name || '';

    if (cId && !cName) {
      const cRes = await pool.query('SELECT name_short FROM contractors WHERE id = $1', [cId]);
      if (cRes.rows.length) cName = cRes.rows[0].name_short;
    }

    // Проверяем, есть ли уже субподряд для этой задачи и этого подрядчика
    const existingSub = await pool.query(`
      SELECT id FROM task_subcontracts 
      WHERE task_id = $1 AND (contractor_id = $2 OR contractor_name = $3)
      LIMIT 1
    `, [taskId, cId, cName]);

    let subcontractId;
    if (existingSub.rows.length) {
      subcontractId = existingSub.rows[0].id;
      await pool.query(`
        UPDATE task_subcontracts SET
          contractor_id = $1,
          contractor_name = $2,
          own_company_id = $3,
          contractor_contract_id = $4,
          price_list_id = $5,
          work_type = COALESCE($6, work_type),
          price_agreed = $7,
          deadline = $8,
          specialist_id = $9,
          installer_fio = $10,
          installer_phone = $11,
          installer_passport = $12,
          auto_number = $13,
          calculation_details = $14,
          ports_count = $15,
          distance_km = $16,
          comment = COALESCE($17, comment),
          updated_at = NOW()
        WHERE id = $18
      `, [
        cId, cName, own_company_id || null, contractor_contract_id || null, price_list_id || null,
        work_type, price_agreed || 0, deadline || null, specialist_id || null,
        installer_fio || '', installer_phone || '', installer_passport || '', auto_number || '',
        calculation_details ? JSON.stringify(calculation_details) : '{}',
        ports_count || 0, distance_km || 0, comment || '', subcontractId
      ]);
    } else {
      const insRes = await pool.query(`
        INSERT INTO task_subcontracts (
          task_id, contractor_id, contractor_name, own_company_id, contractor_contract_id, price_list_id,
          work_type, price_agreed, deadline, specialist_id, installer_fio, installer_phone, installer_passport,
          auto_number, calculation_details, ports_count, distance_km, comment
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id
      `, [
        taskId, cId, cName, own_company_id || null, contractor_contract_id || null, price_list_id || null,
        work_type || 'Монтаж СКС', price_agreed || 0, deadline || null, specialist_id || null,
        installer_fio || '', installer_phone || '', installer_passport || '', auto_number || '',
        calculation_details ? JSON.stringify(calculation_details) : '{}',
        ports_count || 0, distance_km || 0, comment || ''
      ]);
      subcontractId = insRes.rows[0].id;
    }

    // Синхронизируем подрядчика и собственное юрлицо в таблице tasks
    await pool.query(`
      UPDATE tasks SET
        contractor = $1,
        own_company_id = COALESCE($2, own_company_id),
        amount = CASE WHEN (amount IS NULL OR amount = 0) THEN $3 ELSE amount END,
        updated_at = NOW()
      WHERE id = $4
    `, [cName, own_company_id || null, price_agreed || 0, taskId]);

    // Возвращаем полный объект субподряда
    const fullRes = await pool.query(`
      SELECT 
        s.*,
        oc.name_short AS own_company_name,
        cc.contract_number,
        c.inn AS contractor_inn
      FROM task_subcontracts s
      LEFT JOIN own_companies oc ON s.own_company_id = oc.id
      LEFT JOIN contractor_contracts cc ON s.contractor_contract_id = cc.id
      LEFT JOIN contractors c ON s.contractor_id = c.id
      WHERE s.id = $1
    `, [subcontractId]);

    res.json({
      success: true,
      subcontract: fullRes.rows[0]
    });
  } catch (err) {
    console.error('Error saving subcontract wizard:', err);
    res.status(500).json({ error: 'Ошибка сохранения назначения: ' + err.message });
  }
});

export default router;
