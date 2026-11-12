import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { UPLOADS_DIR } from '../middleware/upload.js';
import { pool as defaultPool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getBrowserPath() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function formatDateRu(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const day = dt.getDate();
  const m = months[dt.getMonth()];
  const y = dt.getFullYear();
  return `«${day}» ${m} ${y} г.`;
}

function esc(str) {
  return String(str === null || str === undefined ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function numericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function displayTestStatus(value) {
  if (value === null || value === undefined || value === '') return '';
  const normalized = String(value).toLowerCase();
  if (normalized.includes('pass') || normalized.includes('годен')) return 'PASS';
  if (normalized.includes('fail')) return 'FAIL';
  return String(value);
}

export async function generateIdPdfAlbum(opts) {
  const taskId = typeof opts === 'string' ? opts : opts?.taskId;
  const pool = (typeof opts === 'object' && opts?.pool) ? opts.pool : defaultPool;
  // 1. Загрузка данных задачи
  const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (!taskRes.rows.length) throw new Error(`Задача ${taskId} не найдена`);
  const task = taskRes.rows[0];

  // 2. Субподряд и монтажники
  const subRes = await pool.query(`
    SELECT s.*, c.name_short AS contractor_name, c.inn AS contractor_inn, c.director AS contractor_director,
           oc.name_short AS own_name, oc.inn AS own_inn, oc.director AS own_director
    FROM task_subcontracts s
    LEFT JOIN contractors c ON s.contractor_id = c.id
    LEFT JOIN own_companies oc ON s.own_company_id = oc.id
    WHERE s.task_id = $1
    ORDER BY s.id DESC LIMIT 1
  `, [taskId]);
  const sub = subRes.rows[0] || {};

  // 3. Порты (КЖ)
  const portsRes = await pool.query('SELECT * FROM task_ports WHERE task_id = $1 ORDER BY id ASC', [taskId]);
  const ports = portsRes.rows;

  // 4. Материалы
  const matRes = await pool.query(`
    SELECT tm.*, COALESCE(tm.item_name, m.name) AS name, COALESCE(tm.unit, m.unit) AS unit, COALESCE(tm.article, m.code) AS code, COALESCE(tm.price, m.price_default) AS price
    FROM task_materials tm
    LEFT JOIN materials m ON tm.material_id = m.id
    WHERE tm.task_id = $1
    ORDER BY tm.id ASC
  `, [taskId]);
  const materials = matRes.rows;

  // 5. Вложения (Исполнительная схема)
  const attRes = await pool.query(`
    SELECT * FROM task_attachments 
    WHERE task_id = $1 
    ORDER BY id DESC
  `, [taskId]);
  
  let schemeBase64 = null;
  for (const a of attRes.rows) {
    const nameStr = String(a.original_name || a.file_name || a.file_path || '').toLowerCase();
    const isScheme = (a.type === 'scheme' || a.category === 'scheme' || a.category === 'plan' || nameStr.includes('схем') || nameStr.includes('план'));
    const fullPath = a.file_path ? (path.isAbsolute(a.file_path) ? a.file_path : path.join(UPLOADS_DIR, a.file_path)) : null;
    if (isScheme && fullPath && fs.existsSync(fullPath)) {
      try {
        const ext = path.extname(fullPath).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
          const imgBuf = fs.readFileSync(fullPath);
          const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
          schemeBase64 = `data:${mime};base64,${imgBuf.toString('base64')}`;
          break;
        }
      } catch (e) {
        console.error('Error reading scheme image:', e);
      }
    }
  }

  const cableLengths = ports.map(p => numericValue(p.cable_length)).filter(value => value !== null);
  const totalCableLen = cableLengths.length > 0 ? cableLengths.reduce((sum, value) => sum + value, 0) : null;
  const passCount = ports.filter(p => displayTestStatus(p.testing_status) === 'PASS').length;
  const testedCount = ports.filter(p => displayTestStatus(p.testing_status) !== '').length;

  const browserPath = getBrowserPath();
  if (!browserPath) throw new Error('Не найден исполняемый браузер (Edge/Chrome) для Puppeteer');

  const customerName = ['—', '–', '-'].includes(String(task.customer || '').trim()) ? '' : (task.customer || '');
  const objectAddress = task.address || task.vsp || '';
  const edoNum = task.edo_number || task.edoNumber || (task.raw_data && task.raw_data.edoNumber) || '';
  const genContractor = sub.own_name || '';
  const genContractorDirector = sub.own_director || '';
  const subContractor = sub.contractor_name || task.contractor || '';
  const installerFio = sub.installer_fio || task.assignee || '';
  const completionDate = formatDateRu(task.smr_actual_end_date || task.data_vyhoda);

  // Генерация HTML альбома
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Альбом ИД — Заявка № ${esc(taskId)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 15mm 15mm 15mm;
    }
    @page landscape-page {
      size: A4 landscape;
      margin: 12mm 12mm 12mm 12mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 0;
      font-size: 11pt;
      line-height: 1.4;
      background: #fff;
    }
    .page-break { page-break-after: always; }
    .page-landscape {
      page: landscape-page;
      page-break-after: always;
    }

    /* Титульный лист */
    .cover-container {
      height: 98vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border: 3px double #0f172a;
      padding: 30px;
      text-align: center;
    }
    .cover-header {
      font-size: 13pt;
      font-weight: 700;
      letter-spacing: .5px;
      text-transform: uppercase;
      color: #0f172a;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 15px;
    }
    .cover-title-box {
      margin: 60px 0;
    }
    .cover-cipher {
      font-size: 12pt;
      font-weight: 600;
      color: #2563eb;
      margin-bottom: 12px;
    }
    .cover-main-title {
      font-size: 24pt;
      font-weight: 800;
      letter-spacing: .8px;
      margin-bottom: 10px;
      color: #0f172a;
    }
    .cover-sub-title {
      font-size: 14pt;
      font-weight: 600;
      color: #475569;
      margin-bottom: 25px;
    }
    .cover-object-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 16px;
      font-size: 11.5pt;
      text-align: left;
      line-height: 1.6;
    }
    .cover-footer {
      border-top: 1px solid #cbd5e1;
      padding-top: 20px;
      display: flex;
      justify-content: space-between;
      text-align: left;
      font-size: 10pt;
    }

    /* Общие стили разделов */
    .section-title {
      font-size: 14pt;
      font-weight: 800;
      color: #0f172a;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 6px;
      margin-top: 0;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .section-sub {
      font-size: 9pt;
      font-weight: 600;
      color: #64748b;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
      margin-bottom: 16px;
    }
    table.data-table th, table.data-table td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
    }
    table.data-table th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      text-align: left;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .badge-pass {
      background: #dcfce7;
      color: #166534;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
    }

    /* Подписи */
    .sign-block {
      margin-top: 30px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      font-size: 10pt;
    }
    .sign-item {
      line-height: 1.6;
    }
    .sign-line {
      border-bottom: 1px solid #000;
      margin-top: 25px;
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      color: #64748b;
    }
  </style>
</head>
<body>

  <!-- ЛИСТ 1. ТИТУЛЬНЫЙ ЛИСТ -->
  <div class="cover-container page-break">
    <div class="cover-header">
      <div>${esc(customerName)}</div>
      <div style="font-size:10pt;font-weight:400;color:#64748b;margin-top:4px">Генеральный подрядчик: ${esc(genContractor)} · Монтажная организация: ${esc(subContractor)}</div>
    </div>

    <div class="cover-title-box">
      <div class="cover-cipher">ШИФР: СКС-${esc(taskId)}-ИД</div>
      <div class="cover-main-title">АЛЬБОМ ИСПОЛНИТЕЛЬНОЙ ДОКУМЕНТАЦИИ</div>
      <div class="cover-sub-title">Структурированная кабельная система (СКС / ЛВС)</div>

      <div class="cover-object-box">
        <div><b>Объект:</b> ${esc(objectAddress)}</div>
        <div><b>ВСП / Подразделение:</b> ${esc(task.vsp)}</div>
        <div><b>Номер заявки в системе:</b> № ${esc(taskId)}</div>
        <div><b>Идентификатор в ЭДО:</b> ${esc(edoNum)}</div>
        <div><b>Количество смонтированных портов:</b> ${ports.length} шт.</div>
        <div><b>Дата завершения монтажа:</b> ${completionDate}</div>
      </div>
    </div>

    <div class="cover-footer">
      <div style="position:relative">
        <div><b>Генеральный подрядчик (${esc(genContractor)}):</b></div>
        <div style="margin-top:20px;border-bottom:1px solid #000;width:220px"></div>
        <div style="font-size:8pt;color:#64748b">/ ${esc(genContractorDirector)} /</div>
      </div>
      <div>
        <div><b>Ответственный производитель работ:</b></div>
        <div style="margin-top:20px;border-bottom:1px solid #000;width:220px"></div>
        <div style="font-size:8pt;color:#64748b">/ ${esc(installerFio)} /</div>
      </div>
      <div style="text-align:right">
        <div>${esc(task.city)}</div>
        <div></div>
      </div>
    </div>
  </div>

  <!-- ЛИСТ 2. ВЕДОМОСТЬ ДОКУМЕНТОВ ИД -->
  <div class="page-break" style="padding:10px 0">
    <div class="section-title">
      <span>1. ВЕДОМОСТЬ ДОКУМЕНТОВ КОМПЛЕКТА ИД</span>
      <span class="section-sub">Лист 2</span>
    </div>
    <p style="font-size:10pt;color:#475569;margin-bottom:14px">
      Настоящий комплект исполнительной документации сформирован по результатам завершения строительно-монтажных работ на объекте: <b>${esc(objectAddress)}</b>.
    </p>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width:40px" class="text-center">№</th>
          <th style="width:120px">Обозначение</th>
          <th>Наименование документа</th>
          <th style="width:70px" class="text-center">Листов</th>
          <th style="width:140px">Статус проверки</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="text-center">1</td>
          <td><b>ИД-${esc(taskId)}-01</b></td>
          <td>Титульный лист альбома исполнительной документации</td>
          <td class="text-center">1</td>
          <td></td>
        </tr>
        <tr>
          <td class="text-center">2</td>
          <td><b>ИД-${esc(taskId)}-02</b></td>
          <td>Ведомость документов исполнительной документации</td>
          <td class="text-center">1</td>
          <td></td>
        </tr>
        <tr>
          <td class="text-center">3</td>
          <td><b>ИД-${esc(taskId)}-03</b></td>
          <td>Акт освидетельствования скрытых работ (прокладка кабельных трасс СКС)</td>
          <td class="text-center">1</td>
          <td></td>
        </tr>
        <tr>
          <td class="text-center">4</td>
          <td><b>ИД-${esc(taskId)}-04</b></td>
          <td>Спецификация смонтированного оборудования и израсходованных материалов</td>
          <td class="text-center">1</td>
          <td></td>
        </tr>
        <tr>
          <td class="text-center">5</td>
          <td><b>ИД-${esc(taskId)}-05</b></td>
          <td>Исполнительная схема трасс СКС и размещения информационных розеток</td>
          <td class="text-center">1</td>
          <td></td>
        </tr>
        <tr>
          <td class="text-center">6</td>
          <td><b>ИД-${esc(taskId)}-06</b></td>
          <td>Кабельный журнал и таблица соединений (КЖ)</td>
          <td class="text-center">1</td>
          <td></td>
        </tr>
        <tr>
          <td class="text-center">7</td>
          <td><b>ИД-${esc(taskId)}-07</b></td>
          <td>Протокол измерений и тестирования параметров линий</td>
          <td class="text-center">1</td>
          <td></td>
        </tr>
        <tr>
          <td class="text-center">8</td>
          <td><b>ИД-${esc(taskId)}-08</b></td>
          <td>Сертификаты соответствия и паспорта качества на кабель и компоненты</td>
          <td class="text-center">1</td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <div class="sign-block">
      <div class="sign-item">
        <b>От Генерального подрядчика:</b><br>
        ${esc(genContractor)}<br>
        <div class="sign-line"><span>(подпись / печать)</span><span>/ ${esc(genContractorDirector)} /</span></div>
      </div>
      <div class="sign-item">
        <b>От Монтажной организации:</b><br>
        ${esc(subContractor)}<br>
        <div class="sign-line"><span>(подпись)</span><span>/ ${esc(installerFio)} /</span></div>
      </div>
    </div>
  </div>

  <!-- ЛИСТ 3. АКТ СКРЫТЫХ РАБОТ -->
  <div class="page-break" style="padding:10px 0">
    <div class="section-title">
      <span>2. АКТ ОСВИДЕТЕЛЬСТВОВАНИЯ СКРЫТЫХ РАБОТ</span>
      <span class="section-sub">Лист 3</span>
    </div>

    <div style="text-align:center;font-weight:700;font-size:11pt;margin-bottom:12px">
      АКТ № ${esc(taskId)}/СР<br>
      освидетельствования скрытых работ по прокладке кабельных трасс СКС
    </div>

    <div style="font-size:9.5pt;line-height:1.5">
      <p><b>Объект:</b> ${esc(objectAddress)}</p>
      <p><b>Дата проведения освидетельствования:</b> ${completionDate}</p>
      <p><b>Комиссия в составе:</b></p>
      <ul>
        <li>Представитель Заказчика: ${esc(customerName)}</li>
        <li>Представитель Генподрядчика: ${esc(genContractor)} ${esc(genContractorDirector)}</li>
        <li>Представитель Монтажной организации: ${esc(subContractor)} ${esc(installerFio)}</li>
      </ul>
      <p><b>произвела осмотр работ, выполненных подрядчиком:</b></p>
      <p style="background:#f8fafc;padding:8px 12px;border:1px solid #cbd5e1;border-radius:4px">${esc(task.work_type)}</p>
      <p><b>1. К освидетельствованию предъявлены работы:</b> Кабельных линий: ${ports.length}; общая протяженность: ${totalCableLen === null ? '' : totalCableLen.toFixed(1) + ' м'}</p>
      <p><b>2. Работы выполнены в соответствии с:</b></p>
      <p><b>3. Применены материалы:</b> ${esc(materials.map(m => m.name).filter(Boolean).join(', '))}</p>
      <p><b>4. Решение комиссии:</b></p>
    </div>

    <div class="sign-block" style="margin-top:20px">
      <div class="sign-item">
        <b>Представитель Заказчика:</b>
        <div class="sign-line"><span>(подпись)</span><span>/ _________________ /</span></div>
      </div>
      <div class="sign-item">
        <b>Представитель Подрядчика:</b>
        <div class="sign-line"><span>(подпись)</span><span>/ ${esc(installerFio)} /</span></div>
      </div>
    </div>
  </div>

  <!-- ЛИСТ 4. СПЕЦИФИКАЦИЯ ОБОРУДОВАНИЯ И МАТЕРИАЛОВ -->
  <div class="page-break" style="padding:10px 0">
    <div class="section-title">
      <span>3. СПЕЦИФИКАЦИЯ СМОНТИРОВАННЫХ МАТЕРИАЛОВ И ОБОРУДОВАНИЯ</span>
      <span class="section-sub">Лист 4</span>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width:35px" class="text-center">№</th>
          <th>Наименование материала / оборудования</th>
          <th style="width:60px" class="text-center">Ед. изм.</th>
          <th style="width:80px" class="text-right">План (норма)</th>
          <th style="width:80px" class="text-right">Факт расход</th>
          <th style="width:85px" class="text-right">Остаток</th>
          <th style="width:130px">Поставщик / Склад</th>
        </tr>
      </thead>
      <tbody>
        ${materials.map((m, idx) => {
          const plan = numericValue(m.plan_qty);
          const fact = numericValue(m.fact_qty);
          const rem = plan !== null && fact !== null ? plan - fact : null;
          return `<tr>
            <td class="text-center">${idx + 1}</td>
            <td><b>${esc(m.name)}</b></td>
            <td class="text-center">${esc(m.unit)}</td>
            <td class="text-right">${esc(plan)}</td>
            <td class="text-right"><b>${esc(fact)}</b></td>
            <td class="text-right">${esc(rem)}</td>
            <td>${esc(m.supplier)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <div class="sign-block" style="margin-top:20px">
      <div class="sign-item">
        <b>Ответственный за ТМЦ (Генподрядчик):</b>
        <div class="sign-line"><span>(подпись)</span><span>/  /</span></div>
      </div>
      <div class="sign-item">
        <b>Монтажная бригада:</b>
        <div class="sign-line"><span>(подпись)</span><span>/ ${esc(installerFio)} /</span></div>
      </div>
    </div>
  </div>

  <!-- ЛИСТ 5. ИСПОЛНИТЕЛЬНАЯ СХЕМА -->
  <div class="page-break" style="padding:10px 0">
    <div class="section-title">
      <span>4. ИСПОЛНИТЕЛЬНАЯ СХЕМА РАЗМЕЩЕНИЯ ОБОРУДОВАНИЯ И ТРАСС СКС</span>
      <span class="section-sub">Лист 5</span>
    </div>

    ${schemeBase64 ? `
      <div style="text-align:center;margin:15px 0">
        <img src="${schemeBase64}" style="max-width:100%;max-height:480px;border:1.5px solid #cbd5e1;border-radius:6px;object-fit:contain">
      </div>
    ` : ''}

    <div class="sign-block" style="margin-top:25px">
      <div class="sign-item">
        <b>Схему составил (Инженер СКС):</b>
        <div class="sign-line"><span>(подпись)</span><span>/  /</span></div>
      </div>
      <div class="sign-item">
        <b>Схему проверил (Монтажник):</b>
        <div class="sign-line"><span>(подпись)</span><span>/ ${esc(installerFio)} /</span></div>
      </div>
    </div>
  </div>

  <!-- ЛИСТ 6. КАБЕЛЬНЫЙ ЖУРНАЛ (LANDSCAPE) -->
  <div class="page-landscape">
    <div class="section-title">
      <span>5. КАБЕЛЬНЫЙ ЖУРНАЛ СКС (КЖ)</span>
      <span class="section-sub">Лист 6 (Альбомная ориентация)</span>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width:30px" class="text-center">№</th>
          <th style="width:65px">Порт</th>
          <th style="width:80px">Маркировка</th>
          <th>Помещение</th>
          <th style="width:75px">Шкаф</th>
          <th style="width:55px">Юнит</th>
          <th style="width:90px">Кросс / Панель</th>
          <th style="width:75px" class="text-right">Длина, м</th>
          <th style="width:70px">Обжим</th>
          <th style="width:90px" class="text-center">Результат</th>
        </tr>
      </thead>
      <tbody>
        ${ports.map((p, idx) => {
          const cableLength = numericValue(p.cable_length);
          return `<tr>
            <td class="text-center">${idx + 1}</td>
            <td><b>${esc(p.port_number)}</b></td>
            <td>${esc(p.marking)}</td>
            <td>${esc(p.room)}</td>
            <td>${esc(p.cabinet)}</td>
            <td>${esc(p.unit)}</td>
            <td>${esc(p.patch_panel)}</td>
            <td class="text-right">${esc(cableLength)}</td>
            <td>${esc(p.crimping)}</td>
            <td class="text-center">${esc(displayTestStatus(p.testing_status))}</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr style="background:#f8fafc;font-weight:700">
          <td colspan="7" class="text-right">ИТОГО ПО ОБЪЕКТУ:</td>
          <td class="text-right">${totalCableLen === null ? '' : totalCableLen.toFixed(1) + ' м'}</td>
          <td colspan="2" class="text-center">${testedCount > 0 ? `Годных: ${passCount} / ${testedCount}` : ''}</td>
        </tr>
      </tfoot>
    </table>

    <div class="sign-block" style="margin-top:20px">
      <div class="sign-item">
        <b>Ответственный за ведение КЖ:</b>
        <div class="sign-line"><span>(подпись)</span><span>/ ${esc(installerFio)} /</span></div>
      </div>
      <div class="sign-item">
        <b>Принял технический надзор Заказчика:</b>
        <div class="sign-line"><span>(подпись)</span><span>/ _________________ /</span></div>
      </div>
    </div>
  </div>

  <!-- ЛИСТ 7. ПРОТОКОЛ ИЗМЕРЕНИЙ FLUKE NETWORKS -->
  <div class="page-landscape">
    <div class="section-title">
      <span>6. ПРОТОКОЛ ТЕСТИРОВАНИЯ И ИЗМЕРЕНИЙ ПАРАМЕТРОВ ЛИНИЙ СКС</span>
      <span class="section-sub">Лист 7</span>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width:30px" class="text-center">№</th>
          <th style="width:70px">ID Линии</th>
          <th style="width:85px">Маркировка</th>
          <th style="width:75px" class="text-right">Длина, м</th>
          <th style="width:90px" class="text-center">WireMap</th>
          <th style="width:90px" class="text-right">Затухание (дБ)</th>
          <th style="width:95px" class="text-right">NEXT (дБ)</th>
          <th style="width:95px" class="text-right">Return Loss</th>
          <th style="width:80px" class="text-center">Статус</th>
        </tr>
      </thead>
      <tbody>
        ${ports.map((p, idx) => {
          const cableLength = numericValue(p.cable_length);
          const attenuation = numericValue(p.attenuation ?? p.attenuation_db);
          const next = numericValue(p.next ?? p.next_db);
          const returnLoss = numericValue(p.return_loss ?? p.return_loss_db);
          return `<tr>
            <td class="text-center">${idx + 1}</td>
            <td><b>${esc(p.port_number)}</b></td>
            <td>${esc(p.marking)}</td>
            <td class="text-right">${esc(cableLength)}</td>
            <td class="text-center">${esc(p.wiremap ?? p.wire_map)}</td>
            <td class="text-right">${esc(attenuation)}</td>
            <td class="text-right">${esc(next)}</td>
            <td class="text-right">${esc(returnLoss)}</td>
            <td class="text-center">${esc(displayTestStatus(p.testing_status))}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <div class="sign-block" style="margin-top:20px">
      <div class="sign-item">
        <b>Специалист по тестированию:</b>
        <div class="sign-line"><span>(подпись)</span><span>/  /</span></div>
      </div>
      <div class="sign-item">
        <b>Представитель службы эксплуатации:</b>
        <div class="sign-line"><span>(подпись)</span><span>/ _________________ /</span></div>
      </div>
    </div>
  </div>

</body>
</html>`;

  // 6. Запуск Puppeteer и рендеринг PDF
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
    });

    await browser.close();

    // 7. Сохранение файла на диск и регистрация в task_documents
    const docsDir = path.join(UPLOADS_DIR, 'documents');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    const fileName = `id_album_${taskId}_${Date.now()}.pdf`;
    const filePath = path.join(docsDir, fileName);
    fs.writeFileSync(filePath, pdfBuffer);

    const fileUrl = `/uploads/documents/${fileName}`;
    const docNumber = `ИД-${taskId}-СКС`;
    const title = `Альбом исполнительной документации (СКС) № ${docNumber}`;

    const insertRes = await pool.query(`
      INSERT INTO task_documents (
        task_id, subcontract_id, doc_type, doc_number, doc_date, title, file_url, file_type, meta, status
      ) VALUES ($1, $2, 'id_album', $3, CURRENT_DATE, $4, $5, 'pdf', $6, 'pending')
      RETURNING id
    `, [
      taskId,
      sub.id || null,
      docNumber,
      title,
      fileUrl,
      JSON.stringify({
        ports_count: ports.length,
        total_cable_len: totalCableLen,
        pass_count: passCount,
        moderation_status: 'pending',
        generator: 'puppeteer_id_engine'
      })
    ]);

    return {
      success: true,
      docId: insertRes.rows[0].id,
      fileUrl,
      docNumber,
      title,
      buffer: pdfBuffer
    };
  } catch (err) {
    if (browser) await browser.close();
    throw err;
  }
}
