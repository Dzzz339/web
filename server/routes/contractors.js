import express from 'express';
import { pool } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { syncContractorsFromPOA } from '../services/directoriesImporter.js';

const router = express.Router();

// Получить список всех подрядчиков (только для Админа)
router.get('/contractors', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    const { rows } = await pool.query('SELECT * FROM contractors ORDER BY name_short ASC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Создать нового подрядчика
router.post('/contractors', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    const d = req.body;
    const { rows } = await pool.query(`
      INSERT INTO contractors (
        inn, kpp, name_short, name_full, address_legal, director, 
        bank_name, bik, account_corr, account_pay, phone, email, type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      d.inn, d.kpp || null, d.name_short, d.name_full || null, d.address_legal || null, d.director || null,
      d.bank_name || null, d.bik || null, d.account_corr || null, d.account_pay || null, d.phone || null, d.email || null,
      d.type || 'executor'
    ]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Обновить данные подрядчика
router.put('/contractors/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    const d = req.body;
    await pool.query(`
      UPDATE contractors SET
        inn = COALESCE($2, inn),
        kpp = COALESCE($3, kpp),
        name_short = COALESCE($4, name_short),
        name_full = COALESCE($5, name_full),
        address_legal = COALESCE($6, address_legal),
        director = COALESCE($7, director),
        bank_name = COALESCE($8, bank_name),
        bik = COALESCE($9, bik),
        account_corr = COALESCE($10, account_corr),
        account_pay = COALESCE($11, account_pay),
        phone = COALESCE($12, phone),
        email = COALESCE($13, email),
        status = COALESCE($14, status),
        type = COALESCE($15, type),
        updated_at = NOW()
      WHERE id = $1
    `, [
      req.params.id, d.inn, d.kpp, d.name_short, d.name_full, d.address_legal, d.director,
      d.bank_name, d.bik, d.account_corr, d.account_pay, d.phone, d.email, d.status, d.type
    ]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Удалить подрядчика
router.delete('/contractors/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  try {
    await pool.query('DELETE FROM contractors WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Запрос к DaData по ИНН компании (Party)
router.get('/dadata/party', authenticateToken, async (req, res) => {
  const inn = req.query.inn;
  if (!inn || !process.env.DADATA_API_KEY) return res.json(null);
  
  try {
    const response = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Token ${process.env.DADATA_API_KEY}`
      },
      body: JSON.stringify({ query: inn, count: 1 })
    });

    if (!response.ok) throw new Error(await response.text());
    
    const result = await response.json();
    if (result && result.suggestions && result.suggestions[0]) {
      const s = result.suggestions[0].data;
      res.json({
        inn: s.inn,
        kpp: s.kpp || '',
        name_short: s.name.short_with_opf || s.name.short || result.suggestions[0].value,
        name_full: s.name.full_with_opf || s.name.full || '',
        address_legal: s.address ? s.address.value : '',
        director: s.management ? s.management.name : ''
      });
    } else {
      res.json(null);
    }
  } catch (e) {
    console.error("DaData Party error:", e.message);
    res.json(null);
  }
});

// Запрос к DaData по БИК банка
router.get('/dadata/bank', authenticateToken, async (req, res) => {
  const bik = req.query.bik;
  if (!bik || !process.env.DADATA_API_KEY) return res.json(null);
  
  try {
    const response = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/bank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Token ${process.env.DADATA_API_KEY}`
      },
      body: JSON.stringify({ query: bik, count: 1 })
    });

    if (!response.ok) throw new Error(await response.text());
    
    const result = await response.json();
    if (result && result.suggestions && result.suggestions[0]) {
      const s = result.suggestions[0].data;
      res.json({
        bank_name: result.suggestions[0].value,
        bik: s.bik,
        account_corr: s.correspondent_account || ''
      });
    } else {
      res.json(null);
    }
  } catch (e) {
    console.error("DaData Bank error:", e.message);
    res.json(null);
  }
});

// Живой поиск компаний по Названию или ИНН через DaData Suggestions
router.get('/dadata/suggest-party', authenticateToken, async (req, res) => {
  const query = req.query.query;
  if (!query || query.trim().length < 3 || !process.env.DADATA_API_KEY) return res.json([]);

  try {
    const response = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Token ${process.env.DADATA_API_KEY}`
      },
      body: JSON.stringify({ query: query, count: 5 })
    });

    if (!response.ok) throw new Error(await response.text());

    const result = await response.json();
    const suggestions = (result.suggestions || []).map(s => {
      const d = s.data || {};
      return {
        value: s.value,
        inn: d.inn || '',
        kpp: d.kpp || '',
        name_short: (d.name && (d.name.short_with_opf || d.name.short)) || s.value,
        name_full: (d.name && (d.name.full_with_opf || d.name.full)) || '',
        address_legal: d.address ? d.address.value : '',
        director: d.management ? d.management.name : ''
      };
    });

    res.json(suggestions);
  } catch (e) {
    console.error("DaData Suggest Party error:", e.message);
    res.json([]);
  }
});

// Синхронизация контрагентов из реестра доверенностей через DaData
router.post('/contractors/sync-from-poa', authenticateToken, async (req, res) => {
  try {
    const result = await syncContractorsFromPOA();
    res.json(result);
  } catch (e) {
    console.error("DaData Sync from POA error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
