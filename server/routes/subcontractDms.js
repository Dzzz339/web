// server/routes/subcontractDms.js
// Маршруты для работы со справочниками «Собственные юрлица», договорами субподряда, прайс-листами и калькулятором СМР

import express from 'express';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { calculateSubcontractAmount } from '../services/subcontractDmsService.js';
import { uploadAttachment } from '../middleware/upload.js';
import { generateSubcontractAgreementDocx } from '../services/docxGenerator.js';

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

// 4.1. Получить ВСЕ договоры субподряда (для справочника «Договоры субподряда»)
router.get('/subcontract-contracts', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        cc.*,
        c.name_short AS contractor_name,
        c.inn AS contractor_inn,
        c.phone AS contractor_phone,
        c.director AS contractor_director,
        c.type AS contractor_type,
        oc.name_short AS own_company_name,
        oc.inn AS own_company_inn,
        pl.id AS price_list_id,
        pl.name AS price_list_name,
        (SELECT COUNT(*) FROM price_list_items pli WHERE pli.price_list_id = pl.id) AS price_items_count
      FROM contractor_contracts cc
      LEFT JOIN contractors c ON cc.contractor_id = c.id
      LEFT JOIN own_companies oc ON cc.own_company_id = oc.id
      LEFT JOIN contractor_price_lists pl ON (pl.contract_id = cc.id OR (pl.contractor_id = cc.contractor_id AND pl.contract_id IS NULL)) AND pl.is_active = true
      ORDER BY cc.contract_date DESC, cc.id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching subcontract contracts:', err);
    res.status(500).json({ error: 'Ошибка получения реестра договоров субподряда' });
  }
});

// 4.2. Создать новый договор субподряда
router.post('/subcontract-contracts', authenticateToken, async (req, res) => {
  try {
    const {
      contractor_id,
      own_company_id,
      contract_number,
      contract_date,
      title,
      customer_tag,
      subject,
      territory,
      valid_from,
      valid_to,
      status,
      scan_url,
      create_price_list
    } = req.body;

    if (!contract_number) {
      return res.status(400).json({ error: 'Номер договора обязателен' });
    }
    if (!contractor_id) {
      return res.status(400).json({ error: 'Исполнитель обязателен' });
    }

    const { rows } = await pool.query(`
      INSERT INTO contractor_contracts (
        contractor_id, own_company_id, contract_number, contract_date, title,
        customer_tag, subject, territory, valid_from, valid_to, status, scan_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      contractor_id,
      own_company_id || null,
      contract_number,
      contract_date || new Date(),
      title || `Договор субподряда № ${contract_number}`,
      customer_tag || '',
      subject || 'Монтаж СКС и слаботочных систем',
      territory || '',
      valid_from || contract_date || new Date(),
      valid_to || null,
      status || 'active',
      scan_url || ''
    ]);

    const newContract = rows[0];

    // Опционально создаем привязанный прайс-лист со стандартными позициями
    if (create_price_list) {
      const plRes = await pool.query(`
        INSERT INTO contractor_price_lists (contract_id, contractor_id, name, customer_tag, is_active)
        VALUES ($1, $2, $3, $4, true)
        RETURNING id
      `, [newContract.id, contractor_id, `Прайс-лист к договору № ${contract_number}`, customer_tag || '']);
      const plId = plRes.rows[0].id;

      // Копируем позиции из базового прайса
      const defPl = await pool.query(`SELECT id FROM contractor_price_lists WHERE is_default = true LIMIT 1`);
      if (defPl.rows.length) {
        await pool.query(`
          INSERT INTO price_list_items (
            price_list_id, work_code, work_name, unit, price_tier_1, price_tier_2, tier_threshold, sort_order
          )
          SELECT $1, work_code, work_name, unit, price_tier_1, price_tier_2, tier_threshold, sort_order
          FROM price_list_items
          WHERE price_list_id = $2
        `, [plId, defPl.rows[0].id]);
      }
    }

    // Возвращаем контракт с обогащенными полями
    const enriched = await pool.query(`
      SELECT 
        cc.*,
        c.name_short AS contractor_name,
        c.inn AS contractor_inn,
        oc.name_short AS own_company_name,
        pl.id AS price_list_id,
        pl.name AS price_list_name
      FROM contractor_contracts cc
      LEFT JOIN contractors c ON cc.contractor_id = c.id
      LEFT JOIN own_companies oc ON cc.own_company_id = oc.id
      LEFT JOIN contractor_price_lists pl ON pl.contract_id = cc.id
      WHERE cc.id = $1
    `, [newContract.id]);

    res.json(enriched.rows[0]);
  } catch (err) {
    console.error('Error creating subcontract contract:', err);
    res.status(500).json({ error: 'Ошибка создания договора: ' + err.message });
  }
});

// 4.3. Обновить договор субподряда
router.put('/subcontract-contracts/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      contractor_id,
      own_company_id,
      contract_number,
      contract_date,
      title,
      customer_tag,
      subject,
      territory,
      valid_from,
      valid_to,
      status,
      scan_url
    } = req.body;

    const { rows } = await pool.query(`
      UPDATE contractor_contracts SET
        contractor_id = COALESCE($1, contractor_id),
        own_company_id = $2,
        contract_number = COALESCE($3, contract_number),
        contract_date = COALESCE($4, contract_date),
        title = COALESCE($5, title),
        customer_tag = $6,
        subject = $7,
        territory = $8,
        valid_from = $9,
        valid_to = $10,
        status = COALESCE($11, status),
        scan_url = $12,
        updated_at = NOW()
      WHERE id = $13
      RETURNING *
    `, [
      contractor_id,
      own_company_id || null,
      contract_number,
      contract_date,
      title,
      customer_tag || '',
      subject || '',
      territory || '',
      valid_from || null,
      valid_to || null,
      status || 'active',
      scan_url || '',
      id
    ]);

    if (!rows.length) return res.status(404).json({ error: 'Договор не найден' });

    const enriched = await pool.query(`
      SELECT 
        cc.*,
        c.name_short AS contractor_name,
        c.inn AS contractor_inn,
        oc.name_short AS own_company_name,
        pl.id AS price_list_id,
        pl.name AS price_list_name
      FROM contractor_contracts cc
      LEFT JOIN contractors c ON cc.contractor_id = c.id
      LEFT JOIN own_companies oc ON cc.own_company_id = oc.id
      LEFT JOIN contractor_price_lists pl ON pl.contract_id = cc.id
      WHERE cc.id = $1
    `, [id]);

    res.json(enriched.rows[0]);
  } catch (err) {
    console.error('Error updating subcontract contract:', err);
    res.status(500).json({ error: 'Ошибка обновления договора: ' + err.message });
  }
});

// 4.4. Удалить договор субподряда
router.delete('/subcontract-contracts/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.query('DELETE FROM contractor_contracts WHERE id = $1', [id]);
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error deleting contract:', err);
    res.status(500).json({ error: 'Ошибка удаления договора: ' + err.message });
  }
});

// 4.4.1. Загрузка файла (скана) договора субподряда
router.post('/subcontract-contracts/:id/upload', authenticateToken, uploadAttachment.single('file'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не передан' });
    }
    const scanUrl = '/uploads/' + req.file.filename;
    const { rows } = await pool.query(`
      UPDATE contractor_contracts SET
        scan_url = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [scanUrl, id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Договор не найден' });
    }

    res.json({
      success: true,
      scan_url: scanUrl,
      original_name: req.file.originalname,
      contract: rows[0]
    });
  } catch (err) {
    console.error('Error uploading contract scan:', err);
    res.status(500).json({ error: 'Ошибка загрузки скана договора: ' + err.message });
  }
});

// 4.4.2. Скачать официальную печатную форму договора субподряда (.docx)
router.get('/subcontract-contracts/:id/docx', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cRes = await pool.query('SELECT * FROM contractor_contracts WHERE id = $1', [id]);
    if (!cRes.rows.length) return res.status(404).json({ error: 'Договор субподряда не найден' });
    const contract = cRes.rows[0];

    const contrRes = await pool.query('SELECT * FROM contractors WHERE id = $1', [contract.contractor_id]);
    const contractor = contrRes.rows[0] || {};

    let ownCompany = {};
    if (contract.own_company_id) {
      const ownRes = await pool.query('SELECT * FROM own_companies WHERE id = $1', [contract.own_company_id]);
      if (ownRes.rows.length) ownCompany = ownRes.rows[0];
    }

    const buffer = await generateSubcontractAgreementDocx({
      contract,
      contractor,
      ownCompany
    });

    const safeNum = (contract.contract_number || id).replace(/[\s\/\\:*?"<>|]+/g, '_');
    const filename = `Dogovor_subpodryada_${safeNum}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  } catch (err) {
    console.error('Error generating subcontract docx:', err);
    res.status(500).json({ error: 'Ошибка генерации договора субподряда: ' + err.message });
  }
});

// 4.5. Получить ВСЕ прайс-листы субподряда (для справочника «Прайсы субподряда»)
router.get('/subcontract-pricelists', authenticateToken, async (req, res) => {
  try {
    const { rows: plRows } = await pool.query(`
      SELECT 
        pl.*,
        cc.contract_number,
        cc.contract_date,
        cc.title AS contract_title,
        COALESCE(pl.contractor_id, cc.contractor_id) AS effective_contractor_id,
        c.name_short AS contractor_name,
        c.inn AS contractor_inn,
        c.phone AS contractor_phone,
        oc.name_short AS own_company_name
      FROM contractor_price_lists pl
      LEFT JOIN contractor_contracts cc ON pl.contract_id = cc.id
      LEFT JOIN contractors c ON c.id = COALESCE(pl.contractor_id, cc.contractor_id)
      LEFT JOIN own_companies oc ON cc.own_company_id = oc.id
      ORDER BY pl.is_default DESC, pl.id ASC
    `);

    const { rows: itemRows } = await pool.query(`
      SELECT * FROM price_list_items ORDER BY price_list_id ASC, sort_order ASC, id ASC
    `);

    const itemsByPl = {};
    itemRows.forEach(it => {
      if (!itemsByPl[it.price_list_id]) itemsByPl[it.price_list_id] = [];
      itemsByPl[it.price_list_id].push(it);
    });

    const result = plRows.map(pl => {
      return {
        ...pl,
        items: itemsByPl[pl.id] || []
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Error fetching subcontract pricelists:', err);
    res.status(500).json({ error: 'Ошибка получения прайс-листов субподряда' });
  }
});

// 4.6. Создать новый прайс-лист
router.post('/subcontract-pricelists', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      contractor_id,
      contract_id,
      customer_tag,
      region,
      is_default,
      copy_from_id
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Название прайс-листа обязательно' });
    }

    const { rows } = await pool.query(`
      INSERT INTO contractor_price_lists (
        contract_id, contractor_id, name, customer_tag, region, is_active, is_default
      ) VALUES ($1, $2, $3, $4, $5, true, $6)
      RETURNING *
    `, [
      contract_id || null,
      contractor_id || null,
      name,
      customer_tag || '',
      region || '',
      Boolean(is_default)
    ]);

    const newPl = rows[0];

    // Копируем позиции из источника или из дефолтного прайса
    const srcId = copy_from_id || (await pool.query(`SELECT id FROM contractor_price_lists WHERE is_default = true LIMIT 1`)).rows[0]?.id;
    if (srcId) {
      await pool.query(`
        INSERT INTO price_list_items (
          price_list_id, work_code, work_name, unit, price_tier_1, price_tier_2, tier_threshold, sort_order
        )
        SELECT $1, work_code, work_name, unit, price_tier_1, price_tier_2, tier_threshold, sort_order
        FROM price_list_items
        WHERE price_list_id = $2
      `, [newPl.id, srcId]);
    }

    const itemRows = await pool.query(`SELECT * FROM price_list_items WHERE price_list_id = $1 ORDER BY sort_order ASC, id ASC`, [newPl.id]);
    res.json({
      ...newPl,
      items: itemRows.rows
    });
  } catch (err) {
    console.error('Error creating subcontract pricelist:', err);
    res.status(500).json({ error: 'Ошибка создания прайс-листа: ' + err.message });
  }
});

// 4.7. Обновить прайс-лист (метаданные или сделать дефолтным)
router.put('/subcontract-pricelists/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, customer_tag, region, is_active, is_default, contractor_id, contract_id } = req.body;

    const { rows } = await pool.query(`
      UPDATE contractor_price_lists SET
        name = COALESCE($1, name),
        customer_tag = COALESCE($2, customer_tag),
        region = COALESCE($3, region),
        is_active = COALESCE($4, is_active),
        is_default = COALESCE($5, is_default),
        contractor_id = $6,
        contract_id = $7,
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [
      name,
      customer_tag,
      region,
      is_active,
      is_default,
      contractor_id || null,
      contract_id || null,
      id
    ]);

    if (!rows.length) return res.status(404).json({ error: 'Прайс-лист не найден' });
    const itemRows = await pool.query(`SELECT * FROM price_list_items WHERE price_list_id = $1 ORDER BY sort_order ASC, id ASC`, [id]);
    res.json({
      ...rows[0],
      items: itemRows.rows
    });
  } catch (err) {
    console.error('Error updating subcontract pricelist:', err);
    res.status(500).json({ error: 'Ошибка обновления прайс-листа: ' + err.message });
  }
});

// 4.8. Добавить позицию в прайс-лист
router.post('/subcontract-pricelists/:id/items', authenticateToken, async (req, res) => {
  try {
    const priceListId = parseInt(req.params.id, 10);
    const { work_code, work_name, unit, price_tier_1, price_tier_2, tier_threshold, sort_order } = req.body;

    if (!work_name) return res.status(400).json({ error: 'Наименование позиции обязательно' });

    const { rows } = await pool.query(`
      INSERT INTO price_list_items (
        price_list_id, work_code, work_name, unit, price_tier_1, price_tier_2, tier_threshold, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      priceListId,
      work_code || `custom_${Date.now()}`,
      work_name,
      unit || 'шт',
      Number(price_tier_1) || 0,
      Number(price_tier_2) || Number(price_tier_1) || 0,
      Number(tier_threshold) || 1,
      Number(sort_order) || 50
    ]);

    res.json(rows[0]);
  } catch (err) {
    console.error('Error adding pricelist item:', err);
    res.status(500).json({ error: 'Ошибка добавления позиции: ' + err.message });
  }
});

// 4.9. Обновить позицию в прайс-листе
router.put('/subcontract-pricelists/:id/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    const { work_name, unit, price_tier_1, price_tier_2, tier_threshold } = req.body;

    const { rows } = await pool.query(`
      UPDATE price_list_items SET
        work_name = COALESCE($1, work_name),
        unit = COALESCE($2, unit),
        price_tier_1 = COALESCE($3, price_tier_1),
        price_tier_2 = COALESCE($4, price_tier_2),
        tier_threshold = COALESCE($5, tier_threshold)
      WHERE id = $6
      RETURNING *
    `, [work_name, unit, price_tier_1, price_tier_2, tier_threshold, itemId]);

    if (!rows.length) return res.status(404).json({ error: 'Позиция не найдена' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating pricelist item:', err);
    res.status(500).json({ error: 'Ошибка обновления позиции: ' + err.message });
  }
});

// 4.10. Удалить позицию из прайс-листа
router.delete('/subcontract-pricelists/:id/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    await pool.query('DELETE FROM price_list_items WHERE id = $1', [itemId]);
    res.json({ success: true, id: itemId });
  } catch (err) {
    console.error('Error deleting pricelist item:', err);
    res.status(500).json({ error: 'Ошибка удаления позиции: ' + err.message });
  }
});

// 4.11. Удалить прайс-лист
router.delete('/subcontract-pricelists/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.query('DELETE FROM contractor_price_lists WHERE id = $1', [id]);
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error deleting pricelist:', err);
    res.status(500).json({ error: 'Ошибка удаления прайс-листа: ' + err.message });
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

    // Синхронизируем подрядчика, собственное юрлицо и историю в таблице tasks
    const curTaskRes = await pool.query('SELECT history, contractor, amount FROM tasks WHERE id = $1', [taskId]);
    let tHist = (curTaskRes.rows[0] && Array.isArray(curTaskRes.rows[0].history)) ? [...curTaskRes.rows[0].history] : [];
    const nowRu = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const authorName = (req.user && (req.user.fullName || req.user.username)) || 'Система';

    tHist.push({
      date: nowRu,
      author: authorName,
      field: 'Смета СМР и поручение подрядчику',
      old: curTaskRes.rows[0] && curTaskRes.rows[0].contractor ? curTaskRes.rows[0].contractor : '—',
      new: `${cName} (Согласовано по смете: ${Math.round(price_agreed || 0).toLocaleString('ru-RU')} ₽)`
    });

    await pool.query(`
      UPDATE tasks SET
        contractor = $1,
        own_company_id = COALESCE($2, own_company_id),
        amount = CASE WHEN (amount IS NULL OR amount = 0) THEN $3 ELSE amount END,
        status = CASE WHEN status IN ('pending', 'new', 'cancelled') THEN 'progress' ELSE status END,
        macro_status = CASE WHEN (macro_status IS NULL OR macro_status = 'new') THEN 'assigned' ELSE macro_status END,
        stage_num = CASE WHEN (stage_num IS NULL OR stage_num = 0) THEN 1 ELSE stage_num END,
        history = $5::jsonb,
        updated_at = NOW()
      WHERE id = $4
    `, [cName, own_company_id || null, price_agreed || 0, taskId, JSON.stringify(tHist.slice(-500))]);

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

// ─────────────────────────────────────────────────────────────────────────────
// 🏛️ ТАРИФЫ СБЕРБАНКА 2026 И ВХОДНОЙ АУДИТ СМЕТ ЗАКАЗЧИКА
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeSberRegion(rawRegion, rawAddress) {
  const str = `${rawRegion || ''} ${rawAddress || ''}`.toLowerCase();
  if (str.includes('чита') || str.includes('забайкал')) return 'Чита';
  if (str.includes('бурят') || str.includes('улан-уд')) return 'Улан-Удэ';
  if (str.includes('томск')) return 'Томск';
  if (str.includes('ижевск') || str.includes('удмурт')) return 'Ижевск';
  if (str.includes('волог') || str.includes('череповец')) return 'Вологда';
  if (str.includes('курск')) return 'Курск';
  if (str.includes('липецк')) return 'Липецк';
  if (str.includes('анадыр') || str.includes('чукот')) return 'Анадырь';
  if (str.includes('барнаул') || str.includes('алтайский край')) return 'Барнаул';
  if (str.includes('смоленск')) return 'Смоленск';
  if (str.includes('архангельск') || str.includes('северодвинск')) return 'Архангельск';
  if (str.includes('сургут') || str.includes('ханты') || str.includes('хмао') || str.includes('югр')) return 'Ханты-Мансийск Сургут';
  if (str.includes('салехард') || str.includes('уренгой') || str.includes('янао') || str.includes('надым')) return 'Н Уренгой Салехард';
  if (str.includes('орел') || str.includes('орёл')) return 'Орел';
  if (str.includes('горно-алтайск') || str.includes('республика алтай')) return 'Горно-Алтайск';
  if (str.includes('калуг')) return 'Калуга';
  if (str.includes('омск')) return 'Омск';
  if (str.includes('курган')) return 'Курган';
  if (str.includes('ленинградск') || str.includes(' ло ') || str.includes('ло,') || str.includes('выборг') || str.includes('гатчин')) return 'ЛО Санкт-Петербург';
  if (str.includes('петербург') || str.includes('спб')) return 'Санкт-Петербург';
  if (str.includes('кемеров') || str.includes('кузбасс') || str.includes('новокузнецк') || str.includes('белово')) return 'Кемерово';
  if (str.includes('перм') || str.includes('березники')) return 'Пермь';
  if (str.includes('красноярск') || str.includes('норильск')) return 'Красноярск';
  if (str.includes('мурманск')) return 'Мурманск';
  if (str.includes('тула') || str.includes('тульск')) return 'Тула';
  if (str.includes('твер')) return 'Тверь';
  if (str.includes('абакан') || str.includes('хакас')) return 'Абакан';
  if (str.includes('кызыл') || str.includes('тыва') || str.includes('тува')) return 'Кызыл';
  if (str.includes('рязан')) return 'Рязань';
  if (str.includes('калининград')) return 'Калининград';
  if (str.includes('сыктывкар') || str.includes('коми') || str.includes('ухт') || str.includes('воркут') || str.includes('печор') || str.includes('усинск') || str.includes('нарьян-мар')) return 'Сыктывкар';
  if (str.includes('петрозаводск') || str.includes('карели')) return 'Петрозаводск';
  if (str.includes('псков') || str.includes('великие луки')) return 'Псков';
  if (str.includes('новгород') || str.includes('боровичи')) return 'Великий Новгород';
  if (str.includes('луганск') || str.includes('лнр')) return 'Луганск';
  if (str.includes('донецк') || str.includes('днр')) return 'Донецк';
  if (str.includes('крым') || str.includes('симферополь') || str.includes('севастополь')) return 'Симферополь';
  return null;
}

export async function performTariffAudit({ taskId, region, address, workType, portsCount, amount, distanceKm }) {
  const sberRegion = normalizeSberRegion(region, address);
  const actualAmount = Number(amount || 0);
  const ports = Number(portsCount || 1) > 0 ? Number(portsCount || 1) : 1;
  const dist = Number(distanceKm || 0);

  if (!sberRegion) {
    return {
      status: 'unknown_region',
      badge_class: 'bg-secondary text-white',
      label: 'ℹ️ Индивидуально',
      region: region || 'Не указан',
      sber_region: null,
      contract: null,
      expected_total: actualAmount,
      actual_amount: actualAmount,
      diff: 0,
      diff_percent: 0,
      message: 'Регион не входит в утвержденную сетку Сбербанка на 2026 год либо расценка договорная.'
    };
  }

  // Получаем номер контракта Сбера
  const regMeta = await pool.query(
    'SELECT contract_agreement_number, contract_title FROM customer_tariffs WHERE region = $1 LIMIT 1',
    [sberRegion]
  );
  const contractNumber = regMeta.rows[0]?.contract_agreement_number || 'ГК-СБЕР-2026';

  // 1. Проверяем удаленный населенный пункт
  let remoteItem = null;
  if (address) {
    const remTariffs = await pool.query(
      'SELECT * FROM customer_tariffs WHERE region = $1 AND is_remote_location = true',
      [sberRegion]
    );
    const addrLower = address.toLowerCase();
    for (const r of remTariffs.rows) {
      const loc = (r.location_name || '').toLowerCase();
      const keywords = loc.split(/[,.\s]+/).filter(w => w.length > 3 && !['россия', 'район', 'область', 'край', 'поселок', 'деревня', 'город', 'пгт'].includes(w));
      if (keywords.length > 0 && keywords.some(k => addrLower.includes(k))) {
        remoteItem = r;
        break;
      }
    }
  }

  // 2. СМР тариф
  let tier = 'до 48';
  if (ports >= 49 && ports <= 96) tier = '49-96';
  else if (ports >= 97 && ports <= 144) tier = '97-144';
  else if (ports > 144) tier = '145+';

  let category = 'СКС';
  const wtLower = (workType || '').toLowerCase();
  if (wtLower.includes('оптик') || wtLower.includes('волокн') || wtLower.includes('os2') || wtLower.includes('om3')) category = 'Оптика';
  else if (wtLower.includes('шкаф') || wtLower.includes('стойк')) category = 'Шкафы';

  const smrTariffRes = await pool.query(`
    SELECT * FROM customer_tariffs 
    WHERE region = $1 AND work_category = $2 AND tier_range = $3
    LIMIT 1
  `, [sberRegion, category, tier]);

  const smrTariff = smrTariffRes.rows[0];
  const smrUnitPrice = smrTariff ? Number(smrTariff.price) : 0;
  const smrExpected = smrUnitPrice * ports;

  // 3. Логистика / Дорога
  let roadExpected = 0;
  let roadDetails = null;

  if (remoteItem) {
    roadExpected = Number(remoteItem.price);
    roadDetails = {
      type: 'remote_fixed',
      location: remoteItem.location_name,
      price: roadExpected,
      work_name: remoteItem.work_name
    };
  } else if (dist > 0) {
    let distTier = '0-50 км';
    if (dist > 50 && dist <= 100) distTier = '50-100 км';
    else if (dist > 100 && dist <= 200) distTier = '100-200 км';
    else if (dist > 200 && dist <= 300) distTier = '200-300 км';
    else if (dist > 300) distTier = 'более 300 км';

    const distTariffRes = await pool.query(`
      SELECT * FROM customer_tariffs
      WHERE region = $1 AND work_category = 'Логистика (расстояние)' AND tier_range = $2
      LIMIT 1
    `, [sberRegion, distTier]);

    if (distTariffRes.rows[0]) {
      roadExpected = Number(distTariffRes.rows[0].price);
      roadDetails = {
        type: 'distance_tier',
        tier: distTier,
        km: dist,
        price: roadExpected
      };
    } else {
      roadExpected = dist * 70;
      roadDetails = {
        type: 'km_calc',
        km: dist,
        rate: 70,
        price: roadExpected
      };
    }
  }

  const expectedTotal = smrExpected + roadExpected;
  const diff = actualAmount - expectedTotal;
  const diffPercent = expectedTotal > 0 ? Math.round((diff / expectedTotal) * 100) : 0;

  const isDirectMatch = Math.abs(diff) <= 100;
  const isSmrOnlyMatch = Math.abs(actualAmount - smrExpected) <= 100;
  const isUnitMatch = Math.abs(actualAmount - smrUnitPrice) <= 100;

  let status = 'match';
  let badgeClass = 'bg-success text-white';
  let label = '✅ По тарифу Сбера';
  let message = `Смета соответствует утвержденному контракту Сбербанка 2026 (${contractNumber}).`;

  if (actualAmount === 0) {
    status = 'zero';
    badgeClass = 'bg-warning text-dark';
    label = '⚠️ Нет суммы';
    message = `Сумма в заявке не заполнена. Тариф Сбера: ${expectedTotal.toLocaleString('ru-RU')} ₽ (СМР: ${smrExpected.toLocaleString('ru-RU')} ₽ + Дорога: ${roadExpected.toLocaleString('ru-RU')} ₽).`;
  } else if (isDirectMatch || isSmrOnlyMatch || isUnitMatch) {
    status = 'match';
    badgeClass = 'bg-success text-white';
    label = '✅ По тарифу Сбера';
    message = `Смета ${actualAmount.toLocaleString('ru-RU')} ₽ полностью соответствует контракту Сбера (${contractNumber}).`;
  } else if (diff < -100) {
    status = 'underpriced';
    badgeClass = 'bg-danger text-white';
    label = `⚠️ Занижено на ${Math.abs(diffPercent)}% (${Math.abs(Math.round(diff)).toLocaleString('ru-RU')} ₽)`;
    message = `Внимание! Банк занизил смету на ${Math.abs(Math.round(diff)).toLocaleString('ru-RU')} ₽ относительно официального контракта Сбербанка ${contractNumber}. Утвержденный тариф: ${expectedTotal.toLocaleString('ru-RU')} ₽.`;
  } else if (diff > 100) {
    status = 'overpriced';
    badgeClass = 'bg-info text-white';
    label = `🟢 Выше тарифа (+${diffPercent}%)`;
    message = `Сумма в заявке (${actualAmount.toLocaleString('ru-RU')} ₽) выше расчетного тарифа (${expectedTotal.toLocaleString('ru-RU')} ₽). Включены доп. работы или согласованные компенсации.`;
  }

  return {
    status,
    badge_class: badgeClass,
    label,
    message,
    sber_region: sberRegion,
    contract_agreement_number: contractNumber,
    actual_amount: actualAmount,
    expected_total: expectedTotal,
    diff,
    diff_percent: diffPercent,
    smr: {
      category,
      tier,
      ports,
      unit_price: smrUnitPrice,
      expected: smrExpected,
      work_name: smrTariff?.work_name || 'Базовая стоимость работ СКС'
    },
    road: roadDetails || { type: 'none', price: 0 }
  };
}

// 1. Получить реестр тарифов Сбербанка 2026 (с фильтрацией и пагинацией)
router.get('/customer-tariffs', authenticateToken, async (req, res) => {
  try {
    const { region, category, search, limit = 100, offset = 0 } = req.query;
    let sql = 'SELECT * FROM customer_tariffs WHERE 1=1';
    const params = [];

    if (region && region !== 'all') {
      params.push(region);
      sql += ` AND region = $${params.length}`;
    }
    if (category && category !== 'all') {
      params.push(category);
      sql += ` AND work_category = $${params.length}`;
    }
    if (search) {
      params.push(`%${search.trim()}%`);
      sql += ` AND (work_name ILIKE $${params.length} OR location_name ILIKE $${params.length} OR contract_agreement_number ILIKE $${params.length})`;
    }

    const countRes = await pool.query(sql.replace('SELECT *', 'SELECT COUNT(*)'), params);
    const total = parseInt(countRes.rows[0].count, 10);

    params.push(parseInt(limit, 10));
    sql += ` ORDER BY is_remote_location ASC, work_category ASC, id ASC LIMIT $${params.length}`;
    params.push(parseInt(offset, 10));
    sql += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(sql, params);
    res.json({ total, rows });
  } catch (err) {
    console.error('Error fetching customer tariffs:', err);
    res.status(500).json({ error: 'Ошибка получения тарифов: ' + err.message });
  }
});

// 2. Получить список 37 регионов Сбербанка с номерами контрактов
router.get('/customer-tariffs/regions', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        region,
        min(contract_agreement_number) AS contract_agreement_number,
        min(contract_title) AS contract_title,
        count(*) AS total_items,
        count(*) FILTER (WHERE is_remote_location = true) AS remote_locations_count,
        min(price) FILTER (WHERE work_category = 'СКС' AND tier_range = 'до 48') AS base_port_price
      FROM customer_tariffs
      GROUP BY region
      ORDER BY region ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching tariff regions:', err);
    res.status(500).json({ error: 'Ошибка получения регионов тарифов' });
  }
});

// 3. Выполнить аудит сметы заявки по тарифной сетке Сбербанка
router.post('/customer-tariffs/audit', authenticateToken, async (req, res) => {
  try {
    const { taskId, region, address, workType, portsCount, amount, distanceKm } = req.body;
    const auditResult = await performTariffAudit({ taskId, region, address, workType, portsCount, amount, distanceKm });
    res.json(auditResult);
  } catch (err) {
    console.error('Error auditing tariff:', err);
    res.status(500).json({ error: 'Ошибка аудита тарифа: ' + err.message });
  }
});

// 4. Аудит конкретной заявки по ID
router.get('/customer-tariffs/audit-task/:id', authenticateToken, async (req, res) => {
  try {
    const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!taskRes.rows.length) return res.status(404).json({ error: 'Заявка не найдена' });
    const t = taskRes.rows[0];
    const auditResult = await performTariffAudit({
      taskId: t.id,
      region: t.region,
      address: t.address,
      workType: t.work_type,
      portsCount: t.in_order,
      amount: t.amount,
      distanceKm: t.distance_km
    });
    res.json(auditResult);
  } catch (err) {
    console.error('Error auditing task tariff:', err);
    res.status(500).json({ error: 'Ошибка аудита: ' + err.message });
  }
});

// 5. Создать прайс субподряда из тарифа Сбера по региону с целевой маржой
router.post('/customer-tariffs/generate-subcontract-price', authenticateToken, async (req, res) => {
  try {
    const {
      region,
      name,
      marginPercent = 60,
      contractorId = null,
      isDefault = false
    } = req.body;

    if (!region) return res.status(400).json({ error: 'Регион обязателен' });

    // Получаем тарифы Сбера для указанного региона
    const tariffsRes = await pool.query(`
      SELECT * FROM customer_tariffs 
      WHERE region = $1 AND is_remote_location = false
      ORDER BY id ASC
    `, [region]);

    if (!tariffsRes.rows.length) {
      return res.status(404).json({ error: `Тарифы Сбербанка для региона "${region}" не найдены` });
    }

    const subFactor = Math.max(0.1, (100 - Number(marginPercent || 60)) / 100);
    const plName = name || `Прайс субподряда 2026 (${region}) — маржа ${marginPercent}%`;

    // Создаем новый прайс-лист в contractor_price_lists
    const insPl = await pool.query(`
      INSERT INTO contractor_price_lists (name, customer_tag, region, contractor_id, is_default, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING id
    `, [plName, `ПАО Сбербанк (${region})`, region, contractorId ? parseInt(contractorId, 10) : null, !!isDefault]);

    const newPlId = insPl.rows[0].id;

    // Генерируем элементы прайса
    let sortOrder = 1;
    for (const t of tariffsRes.rows) {
      const origPrice = Number(t.price);
      let pTier1 = Math.round((origPrice * subFactor) / 50) * 50;
      let pTier2 = Math.round((pTier1 * 0.9) / 50) * 50;
      let isVar = t.work_category && t.work_category.includes('Логистика');

      let workCode = 'WORK_' + sortOrder;
      if (t.work_category === 'СКС') workCode = 'PORT_5E_' + (t.tier_range || '1');
      else if (t.work_category === 'Оптика') workCode = 'PORT_OPT_' + (t.tier_range || '1');
      else if (t.work_category === 'Шкафы') workCode = 'CAB_INSTALL_' + sortOrder;
      else if (t.work_category.includes('Логистика')) workCode = 'ROAD_KM_' + sortOrder;

      await pool.query(`
        INSERT INTO price_list_items (
          price_list_id, work_code, work_name, unit, price_tier_1, price_tier_2,
          tier_threshold, is_variable_cost, comment, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        newPlId,
        workCode,
        t.work_name,
        t.unit || 'шт',
        pTier1,
        pTier2,
        t.tier_range === 'до 48' ? 48 : (t.tier_range === '49-96' ? 96 : 3),
        isVar,
        `Сформирован из тарифа Сбера 2026: ${origPrice.toLocaleString('ru-RU')} ₽ (маржа: ${marginPercent}%)`,
        sortOrder++
      ]);
    }

    res.json({
      success: true,
      priceListId: newPlId,
      name: plName,
      itemsCount: tariffsRes.rows.length
    });
  } catch (err) {
    console.error('Error generating subcontract price from tariffs:', err);
    res.status(500).json({ error: 'Ошибка генерации прайса: ' + err.message });
  }
});

export default router;
