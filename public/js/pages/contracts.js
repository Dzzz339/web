// public/js/pages/contracts.js - Справочник Договоров (Контрактов)

var CONTRACT_STATUSES = [
  { id: 'играется', label: 'Играется', color: '#b45309', bg: '#fef3c7', border: '#fde68a' },
  { id: 'проигран', label: 'Проигран', color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
  { id: 'выигран', label: 'Выигран', color: '#15803d', bg: '#dcfce7', border: '#86efac' },
  { id: 'заключен', label: 'Заключен', color: '#0369a1', bg: '#e0f2fe', border: '#7dd3fc' },
  { id: 'в работе', label: 'В работе', color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' },
  { id: 'на приемке', label: 'На приемке', color: '#6d28d9', bg: '#ede9fe', border: '#c4b5fd' },
  { id: 'завершен', label: 'Завершен', color: '#374151', bg: '#f3f4f6', border: '#d1d5db' },
  { id: 'расторгнут', label: 'Расторгнут', color: '#991b1b', bg: '#fef2f2', border: '#fecaca' }
];

function getContractStatusBadge(status) {
  var sLower = String(status || '').trim().toLowerCase();
  var found = CONTRACT_STATUSES.find(function(s) {
    return s.id === sLower || s.label.toLowerCase() === sLower;
  });

  if (found) {
    return `<span style="display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:12px; font-size:.72rem; font-weight:700; background:${found.bg}; color:${found.color}; border:1px solid ${found.border}">
      <span style="width:6px; height:6px; border-radius:50%; background:${found.color}"></span>
      ${found.label}
    </span>`;
  }

  // Fallback
  return `<span class="badge b-gray" style="font-size:.72rem; font-weight:700">${escHtml(status || 'Действует')}</span>`;
}

var contractSearchTimeout = null;

function pageContracts() {
  S.contractSearch = S.contractSearch || '';
  S.contractType = S.contractType || 'all';
  S.contractCustomer = S.contractCustomer || 'all';
  S.contractStatus = S.contractStatus || 'all';
  S.contractYear = S.contractYear || 'all';

  // Загружаем договоры с бэкенда
  fetchContracts();

  return `
    <div style="margin-bottom:1.25rem">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:1rem">
        <div>
          <h1 class="page-title" style="margin:0; display:flex; align-items:center; gap:8px">
            <span>Контракты</span>
            <span id="contracts_total_badge" class="badge b-gray" style="font-size:.78rem; font-weight:600">...</span>
          </h1>
          <div style="font-size:.82rem; color:var(--text-3); margin-top:2px">
            Реестр генеральных контрактов с заказчиками, условия, обеспечение и объекты работ
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost" onclick="triggerContractsImport()" title="Импортировать или обновить реестр из Excel файла">
            📥 Импорт реестра
          </button>
          <button class="btn btn-sm" onclick="openContractForm()" title="Создать новый контракт вручную">
            + Новый контракт
          </button>
        </div>
      </div>

      <!-- КОМПАКТНАЯ ПЛАШКА СВОДКИ (KPI) -->
      <div id="contracts_stats_widget" class="card" style="display:flex; align-items:center; flex-wrap:wrap; gap:12px 24px; padding:10px 16px; margin-bottom:1rem; background:#fff">
        <div style="display:flex; align-items:center; gap:8px">
          <span style="font-size:1.15rem">📄</span>
          <span style="font-size:.75rem; color:var(--text-3); text-transform:uppercase; font-weight:700">Всего:</span>
          <span id="stat_total_count" style="font-size:1.05rem; font-weight:800; color:var(--text)">—</span>
          <span id="stat_multi_lot" style="font-size:.72rem; color:var(--text-3); background:#f1f5f9; padding:2px 6px; border-radius:4px">(многолотовых: —)</span>
        </div>
        <div style="width:1px; height:20px; background:var(--border); opacity:.6"></div>
        <div style="display:flex; align-items:center; gap:8px">
          <span style="font-size:1.15rem">💰</span>
          <span style="font-size:.75rem; color:var(--text-3); text-transform:uppercase; font-weight:700">Портфель:</span>
          <span id="stat_total_amount" style="font-size:1.05rem; font-weight:800; color:var(--green)">—</span>
        </div>
        <div style="width:1px; height:20px; background:var(--border); opacity:.6"></div>
        <div style="display:flex; align-items:center; gap:8px">
          <span style="font-size:1.15rem">🛡️</span>
          <span style="font-size:.75rem; color:var(--text-3); text-transform:uppercase; font-weight:700">Обеспечение:</span>
          <span id="stat_total_security" style="font-size:1.05rem; font-weight:800; color:#3b82f6">—</span>
        </div>
      </div>

      <!-- ПАНЕЛЬ ПОИСКА И ФИЛЬТРОВ -->
      <div class="card p mb" style="display:flex; flex-direction:column; gap:10px">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center">
          <div style="position:relative; flex:1; min-width:280px">
            <input type="text" id="contract_search_input" value="${escHtml(S.contractSearch)}" 
                   placeholder="🔍 Поиск по номеру договора, заказчику, предмету, адресу или лоту..." 
                   style="width:100%; padding:9px 12px; border:1px solid var(--border); border-radius:8px; font-size:.88rem"
                   oninput="onContractSearchInput(this.value)">
            ${S.contractSearch ? `<button onclick="clearContractSearch()" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--text-3); font-size:1.1rem">&times;</button>` : ''}
          </div>

          <select id="contract_filter_type" style="padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:.82rem" onchange="onContractFilterChange('contractType', this.value)">
            <option value="all" ${S.contractType === 'all' ? 'selected' : ''}>О чем договор (Все)</option>
            <option value="СМР / СКС и ЛВС" ${S.contractType === 'СМР / СКС и ЛВС' ? 'selected' : ''}>СМР / СКС и ЛВС</option>
            <option value="Поставка" ${S.contractType === 'Поставка' ? 'selected' : ''}>Поставка</option>
            <option value="ПИР / Проектирование" ${S.contractType === 'ПИР / Проектирование' ? 'selected' : ''}>ПИР / Проектирование</option>
            <option value="СМР и Поставка" ${S.contractType === 'СМР и Поставка' ? 'selected' : ''}>СМР и Поставка</option>
            <option value="СМР / Монтаж" ${S.contractType === 'СМР / Монтаж' ? 'selected' : ''}>СМР / Монтаж</option>
            <option value="Видеонаблюдение" ${S.contractType === 'Видеонаблюдение' ? 'selected' : ''}>Видеонаблюдение</option>
            <option value="ПНР" ${S.contractType === 'ПНР' ? 'selected' : ''}>ПНР</option>
            <option value="ТО и Сервис" ${S.contractType === 'ТО и Сервис' ? 'selected' : ''}>ТО и Сервис</option>
            <option value="Логистика / ПРР" ${S.contractType === 'Логистика / ПРР' ? 'selected' : ''}>Логистика / ПРР</option>
            <option value="Прочее" ${S.contractType === 'Прочее' ? 'selected' : ''}>Прочее</option>
          </select>

          <select id="contract_filter_status" style="padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:.82rem" onchange="onContractFilterChange('contractStatus', this.value)">
            <option value="all" ${S.contractStatus === 'all' ? 'selected' : ''}>Статус (Все)</option>
            ${CONTRACT_STATUSES.map(function(st) {
              return `<option value="${st.id}" ${S.contractStatus === st.id ? 'selected' : ''}>${st.label}</option>`;
            }).join('')}
          </select>

          <select id="contract_filter_year" style="padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:.82rem" onchange="onContractFilterChange('contractYear', this.value)">
            <option value="all" ${S.contractYear === 'all' ? 'selected' : ''}>Год (Все)</option>
            <option value="2026" ${S.contractYear === '2026' ? 'selected' : ''}>2026</option>
            <option value="2025" ${S.contractYear === '2025' ? 'selected' : ''}>2025</option>
            <option value="2024" ${S.contractYear === '2024' ? 'selected' : ''}>2024</option>
            <option value="2023" ${S.contractYear === '2023' ? 'selected' : ''}>2023</option>
            <option value="2022" ${S.contractYear === '2022' ? 'selected' : ''}>2022</option>
            <option value="2021" ${S.contractYear === '2021' ? 'selected' : ''}>2021</option>
            <option value="2020" ${S.contractYear === '2020' ? 'selected' : ''}>2020</option>
            <option value="2019" ${S.contractYear === '2019' ? 'selected' : ''}>2019</option>
            <option value="2018" ${S.contractYear === '2018' ? 'selected' : ''}>2018</option>
            <option value="2017" ${S.contractYear === '2017' ? 'selected' : ''}>2017</option>
          </select>

          ${(S.contractSearch || S.contractType !== 'all' || S.contractStatus !== 'all' || S.contractYear !== 'all') ? `
            <button class="btn btn-sm btn-ghost" onclick="resetContractFilters()" style="color:var(--red); font-size:.78rem">
              ✕ Сбросить
            </button>
          ` : ''}
        </div>
      </div>
    </div>

    <!-- ТАБЛИЦА ДОГОВОРОВ -->
    <div id="contracts_table_container">
      <div class="card p" style="text-align:center; padding:3rem; color:var(--text-3)">
        <div class="spin" style="margin:0 auto 10px"></div>
        Загрузка договоров...
      </div>
    </div>

    <!-- МОДАЛЬНОЕ ОКНО ДЕТАЛЕЙ ДОГОВОРА -->
    <div id="contract_detail_modal_backdrop" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center; padding:16px" onclick="if(event.target===this) closeContractModal()">
      <div id="contract_detail_modal" class="card" style="width:100%; max-width:1060px; max-height:92vh; overflow-y:auto; background:#fff; border-radius:12px; box-shadow:0 20px 40px rgba(0,0,0,0.25); position:relative"></div>
    </div>

    <!-- МОДАЛЬНОЕ ОКНО СОЗДАНИЯ/РЕДАКТИРОВАНИЯ -->
    <div id="contract_form_modal_backdrop" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center; padding:16px" onclick="if(event.target===this) closeContractFormModal()">
      <div id="contract_form_modal" class="card" style="width:100%; max-width:820px; max-height:92vh; overflow-y:auto; background:#fff; border-radius:12px; box-shadow:0 20px 40px rgba(0,0,0,0.25); position:relative"></div>
    </div>

    <!-- МОДАЛЬНОЕ ОКНО СОЗДАНИЯ ЗАЯВКИ ПО ДОГОВОРУ -->
    <div id="contract_create_task_modal_backdrop" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:10001; align-items:center; justify-content:center; padding:16px" onclick="if(event.target===this) closeCreateTaskForContractModal()">
      <div id="contract_create_task_modal" class="card" style="width:100%; max-width:780px; max-height:92vh; overflow-y:auto; background:#fff; border-radius:12px; box-shadow:0 20px 45px rgba(0,0,0,0.3); position:relative"></div>
    </div>

    <!-- СКРЫТЫЙ ИНПУТ ДЛЯ ЗАГРУЗКИ EXCEL -->
    <input type="file" id="contract_excel_input" accept=".xlsx,.xls" style="display:none" onchange="handleContractExcelUpload(event)">
  `;
}

/**
 * Получение списка договоров с сервера
 */
function fetchContracts() {
  var params = [];
  if (S.contractSearch) params.push('q=' + encodeURIComponent(S.contractSearch));
  if (S.contractType && S.contractType !== 'all') params.push('type=' + encodeURIComponent(S.contractType));
  if (S.contractCustomer && S.contractCustomer !== 'all') params.push('customer=' + encodeURIComponent(S.contractCustomer));
  if (S.contractStatus && S.contractStatus !== 'all') params.push('status=' + encodeURIComponent(S.contractStatus));
  if (S.contractYear && S.contractYear !== 'all') params.push('year=' + encodeURIComponent(S.contractYear));

  var url = '/contracts' + (params.length ? '?' + params.join('&') : '');

  api(url).then(function(res) {
    if (res && res.contracts) {
      S.contracts = res.contracts;
      S.contractStats = res.stats || {};
    } else if (Array.isArray(res)) {
      S.contracts = res;
    }
    renderContractsTable();
    updateContractStatsWidgets();
  }).catch(function(err) {
    console.error('Failed to load contracts:', err);
    var container = document.getElementById('contracts_table_container');
    if (container) {
      container.innerHTML = `<div class="card p" style="text-align:center; padding:2rem; color:var(--red)">Ошибка загрузки договоров: ${escHtml(err.message)}</div>`;
    }
  });
}

function updateContractStatsWidgets() {
  var stats = S.contractStats || {};
  var totalCount = stats.total_count !== undefined ? stats.total_count : (S.contracts ? S.contracts.length : 0);
  var totalAmount = stats.total_amount !== undefined ? stats.total_amount : 0;
  var totalSecurity = stats.total_security !== undefined ? stats.total_security : 0;
  var multiLot = stats.multi_lot_count !== undefined ? stats.multi_lot_count : 0;

  var bTotal = document.getElementById('contracts_total_badge');
  if (bTotal) bTotal.textContent = totalCount + ' договоров';

  var elCount = document.getElementById('stat_total_count');
  if (elCount) elCount.textContent = fmtN(totalCount);

  var elMulti = document.getElementById('stat_multi_lot');
  if (elMulti) elMulti.textContent = 'В т.ч. многолотовых: ' + multiLot;

  var elAmt = document.getElementById('stat_total_amount');
  if (elAmt) elAmt.textContent = fmtMoney(totalAmount);

  var elSec = document.getElementById('stat_total_security');
  if (elSec) elSec.textContent = fmtMoney(totalSecurity);
}

function onContractSearchInput(val) {
  S.contractSearch = val;
  clearTimeout(contractSearchTimeout);
  contractSearchTimeout = setTimeout(function() {
    fetchContracts();
  }, 300);
}

function clearContractSearch() {
  S.contractSearch = '';
  var inp = document.getElementById('contract_search_input');
  if (inp) inp.value = '';
  fetchContracts();
}

function onContractFilterChange(key, val) {
  S[key] = val;
  fetchContracts();
}

function resetContractFilters() {
  S.contractSearch = '';
  S.contractType = 'all';
  S.contractCustomer = 'all';
  S.contractStatus = 'all';
  S.contractYear = 'all';
  renderApp();
}

/**
 * Клиентский расчет дедлайна (на случай если база еще не вернула deadline_date)
 */
function getContractDeadlineDate(c) {
  if (!c) return null;
  if (c.deadline_date) return c.deadline_date;
  if (!c.deadline_raw) return null;
  var raw = String(c.deadline_raw).trim();
  if (!raw || raw === '-' || /по заказ/i.test(raw)) return null;

  // 1. Ищем явную дату в строке (например (03.02.2017) или до 15.07.2017)
  var allDates = [];
  var re = /(\d{1,2})[./](\d{1,2})[./](\d{4})/g;
  var m;
  while ((m = re.exec(raw)) !== null) {
    var dt = new Date(Date.UTC(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10)));
    if (!isNaN(dt.getTime())) allDates.push(dt.toISOString().split('T')[0]);
  }
  if (allDates.length > 0) return allDates[allDates.length - 1];

  // Словесный месяц: 11 декабря 2023
  var ruMonths = {
    'январ': 0, 'феврал': 1, 'март': 2, 'апрел': 3, 'ма': 4, 'июн': 5,
    'июл': 6, 'август': 7, 'сентябр': 8, 'октябр': 9, 'ноябр': 10, 'декабр': 11
  };
  var mVerbal = raw.match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (mVerbal) {
    var dNum = parseInt(mVerbal[1], 10);
    var monStr = mVerbal[2].toLowerCase();
    var yNum = parseInt(mVerbal[3], 10);
    for (var k in ruMonths) {
      if (monStr.indexOf(k) === 0) {
        var dtV = new Date(Date.UTC(yNum, ruMonths[k], dNum));
        if (!isNaN(dtV.getTime())) return dtV.toISOString().split('T')[0];
      }
    }
  }

  // 2. Относительный срок от даты договора
  if (c.contract_date) {
    var baseDate = new Date(c.contract_date);
    if (!isNaN(baseDate.getTime())) {
      // Рабочие дни (например: 20 рабочих дней)
      var workMatch = raw.match(/(\d+)\s*(?:рабоч|раб)[^\s]*\s*дн/i);
      if (workMatch) {
        var days = parseInt(workMatch[1], 10);
        var cur = new Date(baseDate.getTime());
        var added = 0;
        while (added < days) {
          cur.setDate(cur.getDate() + 1);
          var dow = cur.getDay();
          if (dow !== 0 && dow !== 6) added++;
        }
        return cur.toISOString().split('T')[0];
      }

      // Календарные дни (например: 30 календарных дней, 60 дней)
      var calMatch = raw.match(/(\d+)\s*(?:календарн|календ)[^\s]*\s*дн/i) || raw.match(/(\d+)\s*дн/i);
      if (calMatch) {
        var cDays = parseInt(calMatch[1], 10);
        var resC = new Date(baseDate.getTime());
        resC.setDate(resC.getDate() + cDays);
        return resC.toISOString().split('T')[0];
      }

      // Месяцы
      var monthMatch = raw.match(/(\d+)\s*(?:месяц|мес)[^\s]*/i);
      if (monthMatch) {
        var mNum = parseInt(monthMatch[1], 10);
        var resM = new Date(baseDate.getTime());
        resM.setMonth(resM.getMonth() + mNum);
        return resM.toISOString().split('T')[0];
      }
    }
  }

  return null;
}

/**
 * Отрисовка таблицы договоров
 */
function renderContractsTable() {
  var container = document.getElementById('contracts_table_container');
  if (!container) return;

  var list = S.contracts || [];
  if (!list.length) {
    container.innerHTML = `
      <div class="card p" style="text-align:center; padding:3.5rem; color:var(--text-3)">
        <div style="font-size:2.5rem; margin-bottom:10px">📜</div>
        <div style="font-size:1.1rem; font-weight:600; color:var(--text)">Договоры не найдены</div>
        <div style="font-size:.85rem; margin-top:4px">Попробуйте изменить параметры поиска или нажмите «+ Новый договор»</div>
      </div>
    `;
    return;
  }

  var rowsHtml = list.map(function(c) {
    // Категория и бейдж
    var typeBadgeClass = 'b-blue';
    var type = c.contract_type_summary || 'Прочее';
    if (type.includes('Поставка')) typeBadgeClass = 'b-green';
    else if (type.includes('ПИР')) typeBadgeClass = 'b-purple';
    else if (type.includes('Видеонаблюдение')) typeBadgeClass = 'b-yellow';
    else if (type.includes('ПНР')) typeBadgeClass = 'b-gray';
    else if (type.includes('ТО')) typeBadgeClass = 'b-teal';
    else if (type.includes('Логистика')) typeBadgeClass = 'b-orange';

    // Проверяем многолотовость
    var lots = [];
    try {
      lots = typeof c.lots === 'string' ? JSON.parse(c.lots) : (c.lots || []);
    } catch(e) {}
    var hasLots = Array.isArray(lots) && lots.length > 0;

    // Статус бейдж
    var stClass = 'b-green';
    var stText = c.status || 'Действует';
    if (stText === 'Завершен') stClass = 'b-gray';
    else if (stText.includes('оплат')) stClass = 'b-yellow';
    else if (stText === 'Расторгнут') stClass = 'b-red';

    // Форматирование даты договора и дедлайна
    var dateFormatted = '—';
    if (c.contract_date) {
      var d = new Date(c.contract_date);
      if (!isNaN(d.getTime())) dateFormatted = d.toLocaleDateString('ru-RU');
    }

    var deadlineDateStr = getContractDeadlineDate(c);
    var deadlineFormatted = '';
    var isExpired = false;
    if (deadlineDateStr) {
      var dEndObj = new Date(deadlineDateStr);
      if (!isNaN(dEndObj.getTime())) {
        deadlineFormatted = dEndObj.toLocaleDateString('ru-RU');
        var now = new Date();
        now.setHours(0, 0, 0, 0);
        if (dEndObj < now && c.status !== 'Завершен' && c.status !== 'Расторгнут') {
          isExpired = true;
        }
      }
    }

    var deadlineSubtitle = '';
    if (c.deadline_raw && c.deadline_raw.trim()) {
      var rawClean = c.deadline_raw.replace(/\r?\n/g, ' ').trim();
      if (/календ|рабоч|дн|мес/i.test(rawClean)) {
        deadlineSubtitle = rawClean.length > 25 ? rawClean.slice(0, 25) + '…' : rawClean;
      }
    }

    var fallbackDeadline = c.deadline_raw || 'По заказам';
    var shortFallback = fallbackDeadline.replace(/\r?\n/g, ' ').trim();
    if (shortFallback.length > 25) {
      shortFallback = shortFallback.slice(0, 25) + '…';
    }

    var dateCellHtml = `
      <div style="font-weight:700; color:var(--text); font-size:.85rem; white-space:nowrap">
        📅 ${dateFormatted}
      </div>
      ${deadlineFormatted ? `
        <div style="margin-top:4px; font-size:.78rem; display:flex; align-items:center; gap:4px; ${isExpired ? 'color:var(--red); font-weight:600' : 'color:var(--text-2)'}; white-space:nowrap" title="${escHtml(c.deadline_raw || '')}">
          <span>⏳</span> <span>до ${deadlineFormatted}</span>
        </div>
        ${deadlineSubtitle ? `
          <div style="font-size:.68rem; color:var(--text-3); margin-top:1px; padding-left:18px; white-space:nowrap" title="${escHtml(c.deadline_raw)}">
            ${escHtml(deadlineSubtitle)}
          </div>
        ` : ''}
      ` : `
        <div style="margin-top:4px; font-size:.73rem; color:var(--text-3); display:flex; align-items:center; gap:4px; white-space:nowrap" title="${escHtml(c.deadline_raw || '')}">
          <span>⏳</span> <span>${escHtml(shortFallback)}</span>
        </div>
      `}
    `;

    // Ссылки
    var linksHtml = '';
    if (c.zakupki_url) {
      linksHtml += `<a href="${escHtml(c.zakupki_url)}" target="_blank" class="btn btn-sm btn-ghost" style="padding:3px 7px" title="Открыть закупку на zakupki.gov.ru / ЭТП">🔗 Закупка</a>`;
    }
    if (c.cloud_url) {
      linksHtml += `<a href="${escHtml(c.cloud_url)}" target="_blank" class="btn btn-sm btn-ghost" style="padding:3px 7px; color:var(--orange)" title="Открыть папку с документами договора в облаке">☁️ Облако</a>`;
    } else {
      linksHtml += `<button onclick="promptCloudUrl(${c.id})" class="btn btn-sm btn-ghost" style="padding:3px 7px; color:var(--text-3); font-size:.7rem" title="Прикрепить ссылку на облако">+ Облако</button>`;
    }

    // Совмещенный номер и действие подробностей спереди
    var numberHtml = `
      <div style="display:flex; flex-direction:column; gap:4px">
        <button class="btn-link" onclick="openContractModal(${c.id})" style="font-weight:800; font-family:monospace; font-size:.92rem; text-align:left; padding:0; color:var(--blue); border:none; background:none; cursor:pointer" title="Открыть подробности договора">
          Вн. № ${highlight(escHtml(c.internal_number || '—'), S.contractSearch)}
        </button>
        ${c.contract_number ? `
          <div style="font-size:.73rem; color:var(--text-3)">
            № ${highlight(escHtml(c.contract_number), S.contractSearch)}
          </div>
        ` : ''}
        <button class="btn btn-sm btn-ghost" onclick="openContractModal(${c.id})" style="padding:2px 8px; font-size:.75rem; border:1px solid var(--border); border-radius:6px; display:inline-flex; align-items:center; gap:4px; align-self:flex-start; margin-top:2px; font-weight:600; color:var(--text)" title="Открыть подробности договора">
          🔍 Подробности
        </button>
        ${hasLots ? `
          <div style="margin-top:2px">
            <span class="badge b-orange" style="font-size:.65rem; padding:1px 5px">🎯 ${lots.length} лотов</span>
          </div>
        ` : ''}
      </div>
    `;

    // Заказчик и сторона
    var customerHtml = `
      <div style="font-weight:700; font-size:.88rem; color:var(--text)">
        ${highlight(escHtml(c.customer_name || 'Не указан'), S.contractSearch)}
      </div>
      <div style="font-size:.72rem; color:var(--text-3); margin-top:2px">
        ${escHtml(c.our_entity_name || 'ООО «Ультима»')} ${c.our_entity_region ? '· ' + escHtml(c.our_entity_region) : ''}
      </div>
    `;

    // Предмет и место
    var subjectShort = c.subject ? (c.subject.length > 75 ? c.subject.slice(0, 75) + '…' : c.subject) : '—';
    var subjectHtml = `
      <div style="font-size:.82rem; font-weight:500; color:var(--text)" title="${escHtml(c.subject || '')}">
        ${highlight(escHtml(subjectShort), S.contractSearch)}
      </div>
      ${c.delivery_place ? `
        <div style="font-size:.72rem; color:var(--text-3); margin-top:3px; display:flex; align-items:center; gap:3px" title="${escHtml(c.delivery_place)}">
          <span>📍</span> <span>${highlight(escHtml(c.delivery_place.length > 55 ? c.delivery_place.slice(0, 55) + '…' : c.delivery_place), S.contractSearch)}</span>
        </div>
      ` : ''}
    `;

    // Финансы
    var amountHtml = `
      <div style="font-weight:700; font-size:.88rem; color:var(--text); white-space:nowrap">
        ${fmtMoney(c.amount)}
      </div>
      ${c.platform ? `<div style="font-size:.7rem; color:var(--text-3); margin-top:2px">${escHtml(c.platform)}</div>` : ''}
    `;

    // Обеспечение
    var securityHtml = c.security_amount > 0 ? `
      <div style="font-size:.82rem; font-weight:600; color:#3b82f6; white-space:nowrap">
        ${fmtMoney(c.security_amount)}
      </div>
      ${c.security_condition ? `<div style="font-size:.68rem; color:var(--text-3); margin-top:1px">${escHtml(c.security_condition.slice(0, 30))}</div>` : ''}
    ` : '<span style="color:var(--text-3)">—</span>';

    // Связанные заявки бейдж
    var linkedBadge = c.linked_tasks_count > 0 ? `
      <span class="badge b-blue" style="font-size:.7rem; cursor:pointer" onclick="openContractModal(${c.id}, 'tasks')" title="Объектов работ по договору">
        📋 ${c.linked_tasks_count} заявок
      </span>
    ` : '';

    return `
      <tr style="border-bottom: 1px solid var(--border); transition:background .15s" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background='transparent'">
        <td style="padding: 10px 12px; vertical-align:top; width:135px">${numberHtml}</td>
        <td style="padding: 10px 12px; vertical-align:top; width:130px">${dateCellHtml}</td>
        <td style="padding: 10px 12px; vertical-align:top">${customerHtml}</td>
        <td style="padding: 10px 12px; vertical-align:top; width:140px">
          <span class="badge ${typeBadgeClass}">${escHtml(type)}</span>
          <div style="margin-top:4px">${getContractStatusBadge(c.status)}</div>
        </td>
        <td style="padding: 10px 12px; vertical-align:top">${subjectHtml}</td>
        <td style="padding: 10px 12px; vertical-align:top; width:115px">${amountHtml}</td>
        <td style="padding: 10px 12px; vertical-align:top; width:105px">${securityHtml}</td>
        <td style="padding: 10px 12px; vertical-align:top; width:100px">
          <div style="display:flex; flex-direction:column; gap:4px">
            ${linksHtml}
            ${linkedBadge}
          </div>
        </td>
        <td style="padding: 10px 12px; vertical-align:middle; width:45px; text-align:center">
          ${(S.user && (S.user.role === 'admin' || S.user.role === 'director')) ? `
            <button class="btn btn-sm btn-ghost" style="color:var(--red); font-size:1.15rem; padding:2px 6px" onclick="deleteContract(${c.id})" title="Удалить договор">&times;</button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card tbl-wrap">
      <table>
        <thead>
          <tr style="background:var(--bg); border-bottom:1.5px solid var(--border)">
            <th style="width:135px">№ Договора</th>
            <th style="width:130px">Дата / Срок</th>
            <th style="min-width:200px">Заказчик / Стороны</th>
            <th style="width:140px">О чем договор</th>
            <th style="min-width:240px">Предмет и Место</th>
            <th style="width:115px">Сумма</th>
            <th style="width:105px">Обеспечение</th>
            <th style="width:100px">Ссылки</th>
            <th style="width:45px"></th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Открытие модалки карточки договора (просмотр со всеми вкладками)
 */
function openContractModal(id, activeTab) {
  activeTab = activeTab || 'main';
  var modalBackdrop = document.getElementById('contract_detail_modal_backdrop');
  var modalEl = document.getElementById('contract_detail_modal');
  if (!modalBackdrop || !modalEl) return;

  modalEl.innerHTML = `<div style="padding:3rem; text-align:center"><div class="spin" style="margin:0 auto 10px"></div>Загрузка договора...</div>`;
  modalBackdrop.style.display = 'flex';

  api('/contracts/' + id).then(function(c) {
    if (!c || c.error) {
      modalEl.innerHTML = `<div style="padding:2rem; color:var(--red)">Ошибка: ${escHtml(c ? c.error : 'Не найден')}</div>`;
      return;
    }

    window._activeContract = c;

    var lots = [];
    try {
      lots = typeof c.lots === 'string' ? JSON.parse(c.lots) : (c.lots || []);
    } catch(e) {}
    var hasLots = Array.isArray(lots) && lots.length > 0;

    var tasks = c.linked_tasks || [];

    var dDate = c.contract_date ? new Date(c.contract_date).toLocaleDateString('ru-RU') : '—';
    var dlDateStr = getContractDeadlineDate(c);
    var dEnd = dlDateStr ? ('до ' + new Date(dlDateStr).toLocaleDateString('ru-RU')) : (c.deadline_raw || 'По заказам');

    // Отрисовываем содержимое карточки
    modalEl.innerHTML = `
      <div style="padding:20px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px">
        <div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
            <span class="badge b-orange" style="font-size:.85rem; font-weight:800; font-family:monospace">Вн. № ${escHtml(c.internal_number || '—')}</span>
            ${c.contract_number ? `<span class="badge b-gray" style="font-size:.85rem; font-weight:700">№ ${escHtml(c.contract_number)}</span>` : ''}
            <span class="badge b-blue">${escHtml(c.contract_type_summary || 'Договор')}</span>

            <div style="display:inline-flex; align-items:center; gap:6px; background:#f8fafc; padding:3px 8px; border-radius:8px; border:1px solid var(--border)">
              <span style="font-size:.7rem; color:var(--text-3); font-weight:700; text-transform:uppercase">Статус:</span>
              <select id="modal_contract_status_select_${c.id}"
                      onchange="quickChangeContractStatus(${c.id}, this.value)"
                      style="border:none; background:transparent; font-size:.8rem; font-weight:700; cursor:pointer; outline:none; padding:2px; color:var(--text)"
                      title="Кликните для быстрой смены статуса договора">
                ${CONTRACT_STATUSES.map(function(st) {
                  var isSel = (String(c.status || '').trim().toLowerCase() === st.id) ? 'selected' : '';
                  return `<option value="${st.id}" ${isSel}>${st.label}</option>`;
                }).join('')}
              </select>
            </div>
          </div>
          <h2 style="margin:8px 0 2px; font-size:1.25rem">${escHtml(c.subject || 'Договор без названия')}</h2>
          <div style="font-size:.82rem; color:var(--text-3)">Заказчик: <b>${escHtml(c.customer_name || 'Не указан')}</b></div>
        </div>
        <div style="display:flex; gap:8px; align-items:center">
          <button class="btn btn-sm btn-ghost" onclick="openContractForm(${c.id})" title="Редактировать параметры договора">✏️ Изменить</button>
          <button class="btn btn-sm btn-ghost" onclick="closeContractModal()" style="font-size:1.2rem; line-height:1">&times;</button>
        </div>
      </div>

      <!-- ВНУТРЕННИЕ ВКЛАДКИ -->
      <div style="display:flex; gap:6px; padding:10px 24px; border-bottom:1px solid var(--border); background:#fafafa; overflow-x:auto">
        <button class="btn btn-sm ${activeTab === 'main' ? '' : 'btn-ghost'}" onclick="openContractModal(${c.id}, 'main')">Параметры и стороны</button>
        <button class="btn btn-sm ${activeTab === 'terms' ? '' : 'btn-ghost'}" onclick="openContractModal(${c.id}, 'terms')">Условия и оплата</button>
        ${hasLots ? `<button class="btn btn-sm ${activeTab === 'lots' ? '' : 'btn-ghost'}" onclick="openContractModal(${c.id}, 'lots')">Таблица лотов (${lots.length})</button>` : ''}
        <button class="btn btn-sm ${activeTab === 'tasks' ? '' : 'btn-ghost'}" onclick="openContractModal(${c.id}, 'tasks')">Объекты / Заявки (${tasks.length})</button>
      </div>

      <!-- СОДЕРЖИМОЕ АКТИВНОЙ ВКЛАДКИ -->
      <div style="padding:24px">
        ${activeTab === 'main' ? renderContractTabMain(c, dDate, dEnd) : ''}
        ${activeTab === 'terms' ? renderContractTabTerms(c) : ''}
        ${activeTab === 'lots' ? renderContractTabLots(c, lots) : ''}
        ${activeTab === 'tasks' ? renderContractTabTasks(c, tasks) : ''}
      </div>
    `;

    if (activeTab === 'main') {
      setTimeout(function() {
        initContractMap(c);
      }, 60);
    }
  });
}

function renderContractTabMain(c, dDate, dEnd) {
  var dgisUrl  = 'https://2gis.ru/search/' + encodeURIComponent('Россия, ' + (c.delivery_place || c.our_entity_region || ''));
  var yandexUrl = 'https://yandex.ru/maps/?text=' + encodeURIComponent('Россия, ' + (c.delivery_place || c.our_entity_region || ''));

  var managerBadge = c.manager_name ? `
    <div class="card p" style="display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:1.5px solid #bbf7d0; border-radius:8px; padding:10px 14px">
      <div style="display:flex; align-items:center; gap:10px">
        <span style="font-size:1.3rem">👤</span>
        <div>
          <div style="font-size:.68rem; color:var(--text-3); font-weight:700; text-transform:uppercase">Ответственный менеджер</div>
          <div style="font-weight:700; color:#15803d; font-size:.92rem">${escHtml(c.manager_name)}</div>
        </div>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="openAssignContractManagerModal(${c.id}, ${c.manager_id || 'null'})" style="font-size:.78rem">Изменить</button>
    </div>
  ` : `
    <div class="card p" style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:8px; padding:10px 14px">
      <div style="display:flex; align-items:center; gap:10px">
        <span style="font-size:1.3rem; opacity:.6">👤</span>
        <div>
          <div style="font-size:.68rem; color:var(--text-3); font-weight:700; text-transform:uppercase">Ответственный менеджер</div>
          <div style="color:var(--text-3); font-size:.85rem">Менеджер ещё не назначен</div>
        </div>
      </div>
      <button class="btn btn-sm" onclick="openAssignContractManagerModal(${c.id}, null)" style="font-size:.78rem; font-weight:600">+ Назначить менеджера</button>
    </div>
  `;

  var attachments = c.attachments || [];

  return `
    <!-- ДВУХКОЛОНОЧНАЯ СЕТКА: ИНФО СЛЕВА + КАРТА СПРАВА -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(360px, 1fr)); gap:16px; margin-bottom:20px; align-items:stretch">
      
      <!-- ЛЕВАЯ КОЛОНКА (Информационные параметры договора) -->
      <div style="display:flex; flex-direction:column; gap:12px">
        <!-- СТОРОНЫ ДОГОВОРА -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
          <div class="card p" style="background:#fcfcfc; padding:12px">
            <div style="font-size:.7rem; text-transform:uppercase; font-weight:700; color:var(--text-3); margin-bottom:4px">🏛️ Сторона 1 (Заказчик)</div>
            <div style="font-weight:700; font-size:.88rem; color:var(--text); line-height:1.3">${escHtml(c.customer_name || 'Не указан')}</div>
            ${c.customer_inn ? `<div style="font-size:.75rem; color:var(--text-3); margin-top:3px">ИНН: ${escHtml(c.customer_inn)}</div>` : ''}
            ${c.contacts_raw ? `
              <div style="font-size:.75rem; color:var(--text-2); margin-top:6px; background:#fff; padding:6px 8px; border-radius:6px; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:flex-start; gap:6px">
                <div style="line-height:1.35">📞 <b>Куратор:</b> ${escHtml(c.contacts_raw)}</div>
                <button class="btn btn-xs btn-ghost" onclick="promptEditContractContacts(${c.id})" title="Изменить контакты куратора" style="font-size:.7rem; padding:1px 4px; line-height:1">✏️</button>
              </div>
            ` : `
              <div style="margin-top:6px">
                <button class="btn btn-xs btn-ghost" onclick="promptEditContractContacts(${c.id})" style="font-size:.72rem; border:1px dashed var(--border); color:var(--text-3); width:100%; text-align:left; padding:4px 8px">
                  + Указать контакты куратора
                </button>
              </div>
            `}
          </div>

          <div class="card p" style="background:#fcfcfc; padding:12px">
            <div style="font-size:.7rem; text-transform:uppercase; font-weight:700; color:var(--text-3); margin-bottom:4px">🏢 Сторона 2 (Исполнитель)</div>
            <div style="font-weight:700; font-size:.88rem; color:var(--text)">${escHtml(c.our_entity_name || 'ООО «Ультима»')}</div>
            <div style="font-size:.78rem; color:var(--text-2); margin-top:3px">Филиал: <b>${escHtml(c.our_entity_region || 'Не указан')}</b></div>
          </div>
        </div>

        <!-- АДРЕС / МЕСТО ПОСТАВКИ -->
        <div class="card p" style="padding:12px">
          <div style="font-size:.7rem; color:var(--text-3); font-weight:700; text-transform:uppercase">📍 Место поставки / выполнения работ</div>
          <div style="font-size:.9rem; font-weight:600; color:var(--text); margin-top:3px; line-height:1.35">${escHtml(c.delivery_place || 'По региону')}</div>
        </div>

        <!-- ДАТЫ И СУММА -->
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px">
          <div class="card p" style="padding:10px">
            <div style="font-size:.68rem; color:var(--text-3); font-weight:700">📅 Заключение</div>
            <div style="font-size:.85rem; font-weight:700; color:var(--text); margin-top:3px">${dDate}</div>
          </div>
          <div class="card p" style="padding:10px">
            <div style="font-size:.68rem; color:var(--text-3); font-weight:700">⏳ Окончание</div>
            <div style="font-size:.85rem; font-weight:700; color:var(--text); margin-top:3px">${dEnd}</div>
            ${c.deadline_raw && dEnd.startsWith('до ') ? `<div style="font-size:.68rem; color:var(--text-3); margin-top:2px">${escHtml(c.deadline_raw)}</div>` : ''}
          </div>
          <div class="card p" style="padding:10px">
            <div style="font-size:.68rem; color:var(--text-3); font-weight:700">💰 Сумма</div>
            <div style="font-size:.95rem; font-weight:800; color:var(--green); margin-top:2px">${fmtMoney(c.amount)}</div>
            ${c.platform ? `<div style="font-size:.66rem; color:var(--text-3)">${escHtml(c.platform)}</div>` : ''}
          </div>
        </div>

        <!-- НАЗНАЧЕНИЕ МЕНЕДЖЕРА ДОГОВОРА -->
        ${managerBadge}
      </div>

      <!-- ПРАВАЯ КОЛОНКА (Интерактивный фрагмент карты) -->
      <div class="card p" style="display:flex; flex-direction:column; padding:14px; min-height:360px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
          <div style="font-weight:700; font-size:.85rem; display:flex; align-items:center; gap:6px">
            <span>🗺️ Фрагмент карты</span>
          </div>
          <div style="font-size:.72rem; color:var(--text-3); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${escHtml(c.delivery_place || '')}">
            ${escHtml(c.delivery_place || 'По региону')}
          </div>
        </div>

        <div id="contract_leafmap_${c.id}" style="flex:1; min-height:260px; border-radius:8px; overflow:hidden; background:#f0f0f0; display:flex; align-items:center; justify-content:center; color:#888; font-size:.82rem; border:1px solid var(--border)">
          Загрузка карты…
        </div>

        <div style="display:flex; gap:.5rem; margin-top:.6rem; flex-wrap:wrap">
          <a href="${dgisUrl}" target="_blank" class="btn btn-sm" style="background:#3069b0; gap:5px; font-size:.75rem">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="10" r="4"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg>
            2ГИС
          </a>
          <a href="${yandexUrl}" target="_blank" class="btn btn-sm" style="background:#fc3f1d; gap:5px; font-size:.75rem">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="10" r="4"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg>
            Яндекс.Карты
          </a>
        </div>
      </div>
    </div>

    <!-- НИЖНИЙ БЛОК: ФАЙЛЫ, ПРИЛОЖЕНИЯ И ПРЕДПРОСМОТР (НА ВСЮ ШИРИНУ) -->
    <div class="card p" style="background:#fff; border:1px solid var(--border); border-radius:10px">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding-bottom:12px; border-bottom:1px solid var(--border)">
        <div>
          <div style="font-weight:700; font-size:.92rem; display:flex; align-items:center; gap:8px">
            <span>📁 Файлы и материалы договора</span>
            <span class="badge b-gray" style="font-size:.75rem">${attachments.length}</span>
          </div>
          <div style="font-size:.78rem; color:var(--text-3); margin-top:2px">
            Ссылки на внешнюю документацию, торги и прикрепленные приложения к договору
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
          ${c.zakupki_url ? `<a href="${escHtml(c.zakupki_url)}" target="_blank" class="btn btn-sm btn-ghost" style="border:1px solid var(--border)">🔗 Закупки / ЭТП</a>` : ''}
          ${c.cloud_url ? `
            <a href="${escHtml(c.cloud_url)}" target="_blank" class="btn btn-sm btn-ghost" style="border:1px solid var(--border); color:var(--text)" title="Внешняя ссылка на Seafile / Диск">☁️ Папка Seafile</a>
            <button class="btn btn-xs btn-ghost" onclick="promptCloudUrl(${c.id})" title="Изменить внешнюю ссылку">✏️</button>
          ` : `
            <button class="btn btn-sm btn-ghost" onclick="promptCloudUrl(${c.id})" style="border:1px dashed var(--border); color:var(--text-3); font-size:.78rem" title="Если есть архив в Seafile или Яндекс.Диске">+ Ссылка Seafile/Облако</button>
          `}
          <button class="btn btn-sm" onclick="triggerContractAttachmentUpload(${c.id})" style="background:#2563eb; color:#fff; display:flex; align-items:center; gap:6px; font-weight:600" title="Загрузить приложения к договору (ТЗ, сметы, спецификации, схемы)">
            📂 Загрузить файл с ПК
          </button>
          <input type="file" id="contract_attachment_input_${c.id}" multiple style="display:none" onchange="handleContractAttachmentUpload(${c.id}, this)">
        </div>
      </div>

      ${renderContractAttachmentsListAndPreview(c, attachments)}
    </div>
  `;
}

function renderContractTabTerms(c) {
  return `
    <!-- КОМПАКТНЫЕ УСЛОВИЯ ОПЛАТЫ И ОБЕСПЕЧЕНИЕ -->
    <div class="card p" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; padding:10px 16px; margin-bottom:16px; background:#f8fafc; border:1px solid var(--border)">
      <div>
        <div style="font-size:.68rem; text-transform:uppercase; font-weight:700; color:var(--text-3)">💳 Условия оплаты</div>
        <div style="font-size:.88rem; font-weight:600; color:var(--text); margin-top:2px">${escHtml(c.payment_terms || 'В соответствии с условиями договора')}</div>
      </div>
      <div>
        <div style="font-size:.68rem; text-transform:uppercase; font-weight:700; color:var(--text-3)">🛡️ Обеспечение договора</div>
        <div style="font-size:.88rem; font-weight:700; color:#3b82f6; margin-top:2px">
          ${fmtMoney(c.security_amount)}
          <span style="font-size:.75rem; font-weight:normal; color:var(--text-2)">(${escHtml(c.security_condition || 'не установлено')})</span>
        </div>
      </div>
      ${c.discount_percent > 0 ? `
        <div>
          <div style="font-size:.68rem; text-transform:uppercase; font-weight:700; color:var(--text-3)">📉 Снижение на торгах</div>
          <div style="font-size:.88rem; font-weight:700; color:var(--green); margin-top:2px">${(c.discount_percent * 100).toFixed(2)}%</div>
        </div>
      ` : ''}
    </div>

    <!-- ИНТЕРАКТИВНЫЙ ЧЕК-ЛИСТ ТРЕБОВАНИЙ К СДАЧЕ / ЗАКРЫТИЮ -->
    ${renderContractChecklistSection(c)}

    <!-- ТЕКСТ УСЛОВИЙ ДОГОВОРА (РЕДАКТИРУЕМЫЙ) -->
    <div class="card p" style="margin-top:16px">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
        <div style="font-size:.85rem; font-weight:700">Текст и особые условия договора</div>
        <button class="btn btn-sm btn-ghost" onclick="toggleEditTermsText(${c.id})" id="btn_edit_terms">✏️ Редактировать текст</button>
      </div>
      <div id="terms_display_box" style="background:#fafafa; border:1px solid var(--border); border-radius:8px; padding:12px; font-size:.85rem; line-height:1.5; white-space:pre-wrap; min-height:70px; color:var(--text)">
        ${escHtml(c.terms_text || 'Особые условия договора не внесены. Нажмите «Редактировать текст», чтобы вписать гарантии, штрафы, условия сдачи или спецификацию.')}
      </div>
      <div id="terms_edit_box" style="display:none; margin-top:8px">
        <textarea id="terms_textarea" style="width:100%; min-height:120px; padding:10px; border:1.5px solid var(--orange); border-radius:8px; font-size:.85rem; line-height:1.4">${escHtml(c.terms_text || '')}</textarea>
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px">
          <button class="btn btn-sm btn-ghost" onclick="toggleEditTermsText(${c.id}, false)">Отмена</button>
          <button class="btn btn-sm" onclick="saveTermsText(${c.id})">Сохранить условия</button>
        </div>
      </div>
    </div>
  `;
}

function renderContractTabLots(c, lots) {
  var rows = lots.map(function(lot) {
    return `
      <tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 12px; font-weight:700">Лот ${escHtml(String(lot.lot_number))}</td>
        <td style="padding:8px 12px; font-weight:600">📍 ${escHtml(lot.place || '—')}</td>
        <td style="padding:8px 12px; font-family:monospace; color:var(--text-2)">
          ${lot.contract_number ? '№ ' + escHtml(lot.contract_number) : '—'}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card p mb" style="background:#fffbf7; border:1px solid #fed7aa; display:flex; justify-content:space-between; align-items:center">
      <div>
        <div style="font-weight:700; font-size:.88rem">Многолотовая закупка (${lots.length} лотов)</div>
        <div style="font-size:.78rem; color:var(--text-3); margin-top:2px">Каждый лот представляет отдельный регион / филиал и отдельный номер контракта</div>
      </div>
    </div>

    <div class="card tbl-wrap">
      <table>
        <thead>
          <tr style="background:var(--bg)">
            <th style="width:100px">Номер лота</th>
            <th>Город / Регион поставки</th>
            <th>Номер отдельного контракта</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderContractTabTasks(c, tasks) {
  var headerHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px">
      <div style="display:flex; align-items:center; gap:8px">
        <span style="font-weight:700; font-size:.95rem">Связанные заявки и объекты</span>
        <span class="badge ${tasks.length ? 'b-blue' : 'b-gray'}" style="font-size:.75rem">${tasks.length}</span>
      </div>
      <div style="display:flex; gap:8px">
        <button class="btn btn-sm btn-outline" onclick="goToScenario3WithContract(${c.id})" title="Создать через Сценарий 3 с загрузкой PDF или схемы">
          ✨ Создать через ИИ / PDF
        </button>
        <button class="btn btn-sm" onclick="openCreateTaskForContractModal(${c.id})" style="background:var(--blue); color:#fff">
          ➕ Создать заявку по договору
        </button>
      </div>
    </div>
  `;

  if (!tasks.length) {
    return `
      ${headerHtml}
      <div class="card p" style="text-align:center; padding:3rem 1.5rem; color:var(--text-3); background:#fafafa; border:1px dashed var(--border)">
        <div style="font-size:2.5rem; margin-bottom:10px">📋</div>
        <div style="font-weight:700; font-size:1.05rem; color:var(--text)">По этому договору пока нет привязанных заявок</div>
        <div style="font-size:.84rem; margin-top:6px; max-width:480px; margin-left:auto; margin-right:auto; line-height:1.4">
          Вы можете быстро создать заявку по кнопке выше — все основные реквизиты договора (заказчик, адрес, регион, тип работ, куратор) заполнятся автоматически.
        </div>
        <div style="margin-top:16px">
          <button class="btn" onclick="openCreateTaskForContractModal(${c.id})" style="background:var(--blue); color:#fff">
            ➕ Создать первую заявку
          </button>
        </div>
      </div>
    `;
  }

  var rows = tasks.map(function(t) {
    return `
      <tr style="border-bottom:1px solid var(--border); cursor:pointer" onclick="closeContractModal(); openCard('${t.id}')">
        <td style="padding:10px 12px; font-weight:700; font-family:monospace; color:var(--blue)">${escHtml(t.id)}</td>
        <td style="padding:10px 12px">${escHtml(t.region || '—')}</td>
        <td style="padding:10px 12px; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${escHtml(t.address || '')}">${escHtml(t.address || '—')}</td>
        <td style="padding:10px 12px">${escHtml(t.work_type || '—')}</td>
        <td style="padding:10px 12px; font-size:.82rem">
          ${t.assignee ? `<span style="font-weight:600; color:var(--text)">👷 ${escHtml(t.assignee)}</span>` : `<span style="color:var(--text-3); font-style:italic">Не назначен</span>`}
        </td>
        <td style="padding:10px 12px">${stBadge(t.status)}</td>
        <td style="padding:10px 12px; font-weight:700; text-align:right">${fmtMoney(t.amount)}</td>
      </tr>
    `;
  }).join('');

  return `
    ${headerHtml}
    <div class="card tbl-wrap">
      <table>
        <thead>
          <tr style="background:var(--bg)">
            <th>ID Заявки</th>
            <th>Регион</th>
            <th>Адрес объекта</th>
            <th>Вид работ</th>
            <th>Исполнитель / Субподрядчик</th>
            <th>Статус</th>
            <th style="text-align:right">Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function closeContractModal() {
  var modalBackdrop = document.getElementById('contract_detail_modal_backdrop');
  if (modalBackdrop) modalBackdrop.style.display = 'none';
}

/**
 * Редактирование условий договора
 */
function toggleEditTermsText(id, show) {
  var disp = document.getElementById('terms_display_box');
  var edit = document.getElementById('terms_edit_box');
  var btn = document.getElementById('btn_edit_terms');
  var isEdit = show !== undefined ? show : (edit.style.display === 'none');
  if (disp) disp.style.display = isEdit ? 'none' : 'block';
  if (edit) edit.style.display = isEdit ? 'block' : 'none';
  if (btn) btn.style.display = isEdit ? 'none' : 'block';
}

function saveTermsText(id) {
  var textarea = document.getElementById('terms_textarea');
  if (!textarea) return;
  var text = textarea.value.trim();

  api('/contracts/' + id, {
    method: 'PUT',
    body: JSON.stringify({ terms_text: text })
  }).then(function(res) {
    if (res && res.error) {
      showToast('Ошибка сохранения: ' + res.error, 'error');
    } else {
      showToast('Условия договора сохранены', 'success');
      openContractModal(id, 'terms');
      fetchContracts();
    }
  }).catch(function(err) {
    showToast('Ошибка: ' + err.message, 'error');
  });
}

/**
 * Быстрое прикрепление ссылки на облако
 */
function promptCloudUrl(id) {
  var c = S.contracts ? S.contracts.find(x => x.id === id) : null;
  var curUrl = c ? (c.cloud_url || '') : '';
  var newUrl = prompt('Введите ссылку на папку договора в облаке (Яндекс.Диск, Google Drive и т.д.):', curUrl);
  if (newUrl === null) return; // Нажали отмену

  api('/contracts/' + id, {
    method: 'PUT',
    body: JSON.stringify({ cloud_url: newUrl.trim() })
  }).then(function(res) {
    if (res && res.error) {
      showToast('Ошибка: ' + res.error, 'error');
    } else {
      showToast('Ссылка на облако сохранена', 'success');
      fetchContracts();
      var modalBackdrop = document.getElementById('contract_detail_modal_backdrop');
      if (modalBackdrop && modalBackdrop.style.display !== 'none') {
        openContractModal(id);
      }
    }
  }).catch(function(err) {
    showToast('Ошибка: ' + err.message, 'error');
  });
}

/**
 * Форма добавления / редактирования договора
 */
function openContractForm(id) {
  var modalBackdrop = document.getElementById('contract_form_modal_backdrop');
  var modalEl = document.getElementById('contract_form_modal');
  if (!modalBackdrop || !modalEl) return;

  S.contractFormPendingFiles = [];

  var isEdit = Boolean(id);
  var c = isEdit && S.contracts ? S.contracts.find(x => x.id === id) : null;

  var users = S.users || [];
  var managerOptions = '<option value="">-- Без ответственного менеджера --</option>';
  users.forEach(function(u) {
    var isSel = (c && c.manager_id === u.id) ? 'selected' : '';
    var roleName = (STOCK_ROLES[u.role] ? STOCK_ROLES[u.role].name : u.role) || '';
    var name = u.fullName || u.username || ('Пользователь #' + u.id);
    managerOptions += `<option value="${u.id}" data-name="${escHtml(name)}" ${isSel}>${escHtml(name + (roleName ? ' (' + roleName + ')' : ''))}</option>`;
  });

  modalEl.innerHTML = `
    <div style="padding:20px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center">
      <h2 style="margin:0; font-size:1.15rem">${isEdit ? 'Редактировать договор' : 'Новый договор'}</h2>
      <button class="btn btn-sm btn-ghost" onclick="closeContractFormModal()" style="font-size:1.2rem; line-height:1">&times;</button>
    </div>

    <form onsubmit="handleContractFormSubmit(event, ${id || 'null'})" style="padding:24px; display:flex; flex-direction:column; gap:14px">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
        <div>
          <label style="font-size:.78rem; font-weight:700">Внутренний номер (Вн./№) *</label>
          <input type="text" id="cf_internal_number" required value="${escHtml(c ? c.internal_number : '')}" placeholder="Например: 0224-05 или 7/12" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
        </div>
        <div>
          <label style="font-size:.78rem; font-weight:700">Внешний номер контракта</label>
          <input type="text" id="cf_contract_number" value="${escHtml(c ? c.contract_number : '')}" placeholder="Например: № 0504/25/282/24" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px">
        <div>
          <label style="font-size:.78rem; font-weight:700">Дата договора</label>
          <input type="date" id="cf_contract_date" value="${c && c.contract_date ? c.contract_date.split('T')[0] : ''}" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
        </div>
        <div>
          <label style="font-size:.78rem; font-weight:700">О чем договор (кратко) *</label>
          <select id="cf_type" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
            <option value="СМР / СКС и ЛВС" ${c && c.contract_type_summary === 'СМР / СКС и ЛВС' ? 'selected' : ''}>СМР / СКС и ЛВС</option>
            <option value="Поставка" ${c && c.contract_type_summary === 'Поставка' ? 'selected' : ''}>Поставка</option>
            <option value="ПИР / Проектирование" ${c && c.contract_type_summary === 'ПИР / Проектирование' ? 'selected' : ''}>ПИР / Проектирование</option>
            <option value="СМР и Поставка" ${c && c.contract_type_summary === 'СМР и Поставка' ? 'selected' : ''}>СМР и Поставка</option>
            <option value="СМР / Монтаж" ${c && c.contract_type_summary === 'СМР / Монтаж' ? 'selected' : ''}>СМР / Монтаж</option>
            <option value="Видеонаблюдение" ${c && c.contract_type_summary === 'Видеонаблюдение' ? 'selected' : ''}>Видеонаблюдение</option>
            <option value="ПНР" ${c && c.contract_type_summary === 'ПНР' ? 'selected' : ''}>ПНР</option>
            <option value="ТО и Сервис" ${c && c.contract_type_summary === 'ТО и Сервис' ? 'selected' : ''}>ТО и Сервис</option>
            <option value="Логистика / ПРР" ${c && c.contract_type_summary === 'Логистика / ПРР' ? 'selected' : ''}>Логистика / ПРР</option>
            <option value="Прочее" ${c && c.contract_type_summary === 'Прочее' ? 'selected' : ''}>Прочее</option>
          </select>
        </div>
        <div>
          <label style="font-size:.78rem; font-weight:700">Статус договора</label>
          <select id="cf_status" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem; font-weight:600">
            ${CONTRACT_STATUSES.map(function(st) {
              var isSel = (c && String(c.status || '').trim().toLowerCase() === st.id) ? 'selected' : (!c && st.id === 'заключен' ? 'selected' : '');
              return `<option value="${st.id}" ${isSel}>${st.label}</option>`;
            }).join('')}
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
        <div>
          <label style="font-size:.78rem; font-weight:700">Заказчик (Сторона 1) *</label>
          <input type="text" id="cf_customer_name" required value="${escHtml(c ? c.customer_name : '')}" placeholder="Например: ОСФР, Ростелеком, Сбербанк и др." style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
        </div>
        <div>
          <label style="font-size:.78rem; font-weight:700">Наша компания / Филиал (Сторона 2)</label>
          <input type="text" id="cf_our_entity" value="${escHtml(c ? (c.our_entity_name || 'ООО «Ультима»') : 'ООО «Ультима»')}" placeholder="ООО «Ультима»" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
        <div>
          <label style="font-size:.78rem; font-weight:700">Контакты куратора Заказчика (ФИО, телефон, email)</label>
          <input type="text" id="cf_contacts_raw" value="${escHtml(c ? c.contacts_raw : '')}" placeholder="Например: Тимченко А.Ю., 8 4162 44-15-19, mail@..." style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
        </div>
        <div>
          <label style="font-size:.78rem; font-weight:700">Ответственный менеджер договора</label>
          <select id="cf_manager_id" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
            ${managerOptions}
          </select>
        </div>
      </div>

      <div>
        <label style="font-size:.78rem; font-weight:700">Предмет договора (Краткое наименование работ) *</label>
        <textarea id="cf_subject" required style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem; min-height:60px" placeholder="Например: Построение СКС в зданиях филиалов...">${escHtml(c ? c.subject : '')}</textarea>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
        <div>
          <label style="font-size:.78rem; font-weight:700">Место поставки / выполнения работ</label>
          <input type="text" id="cf_place" value="${escHtml(c ? c.delivery_place : '')}" placeholder="г. Санкт-Петербург, Московский пр. 165" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
        </div>
        <div>
          <label style="font-size:.78rem; font-weight:700">Срок выполнения (текст и точная дата)</label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
            <input type="text" id="cf_deadline_raw" value="${escHtml(c ? c.deadline_raw : '')}" placeholder="например: 30 календарных дней" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
            <input type="date" id="cf_deadline_date" value="${c && c.deadline_date ? c.deadline_date.split('T')[0] : ''}" title="Точная дата дедлайна (рассчитывается автоматически)" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
          </div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px">
        <div>
          <label style="font-size:.78rem; font-weight:700">Сумма договора (₽)</label>
          <input type="number" step="0.01" id="cf_amount" value="${c ? c.amount : 0}" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
        </div>
        <div>
          <label style="font-size:.78rem; font-weight:700">Обеспечение договора (₽)</label>
          <input type="number" step="0.01" id="cf_security_amount" value="${c ? c.security_amount : 0}" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
        </div>
        <div>
          <label style="font-size:.78rem; font-weight:700">Снижение на торгах (%)</label>
          <input type="number" step="0.01" id="cf_discount" value="${c ? ((c.discount_percent || 0) * 100).toFixed(2) : 0}" placeholder="Например: 17.5" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
        <div>
          <label style="font-size:.78rem; font-weight:700">Ссылка на закупку (zakupki.gov.ru / ЭТП)</label>
          <input type="url" id="cf_zakupki_url" value="${escHtml(c ? c.zakupki_url : '')}" placeholder="https://..." style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
        </div>
        <div>
          <label style="font-size:.78rem; font-weight:700">Внешняя ссылка (Seafile / Облако, если нужно)</label>
          <input type="url" id="cf_cloud_url" value="${escHtml(c ? c.cloud_url : '')}" placeholder="Необязательно (файлы можно прикрепить прямо с ПК)" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
        </div>
      </div>

      <!-- ПРИКРЕПЛЕНИЕ ФАЙЛОВ С КОМПЬЮТЕРА -->
      <div style="padding:14px; background:#f8fafc; border:1px solid var(--border); border-radius:8px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
          <div>
            <div style="font-size:.82rem; font-weight:700; color:var(--text)">📎 Файлы и документы к договору с компьютера</div>
            <div style="font-size:.74rem; color:var(--text-3)">Сметы, ТЗ, спецификации, схемы, сканы (.pdf, .xlsx, .docx, изображения)</div>
          </div>
          <button type="button" class="btn btn-xs" onclick="document.getElementById('cf_files_input').click()" style="background:#2563eb; color:#fff; font-weight:600">
            + Выбрать файлы с ПК
          </button>
          <input type="file" id="cf_files_input" multiple style="display:none" onchange="handleContractFormFilesSelect(this)">
        </div>
        <div id="cf_files_preview" style="display:flex; flex-wrap:wrap; gap:6px; font-size:.78rem; color:var(--text-3); font-style:italic">
          Файлы пока не выбраны
        </div>
      </div>

      <div>
        <label style="font-size:.78rem; font-weight:700">Текст и условия договора</label>
        <textarea id="cf_terms_text" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem; min-height:60px" placeholder="Особые условия, спецификация, условия приёмки...">${escHtml(c ? c.terms_text : '')}</textarea>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px">
        <button type="button" class="btn btn-ghost" onclick="closeContractFormModal()">Отмена</button>
        <button type="submit" class="btn">${isEdit ? 'Сохранить изменения' : 'Создать договор'}</button>
      </div>
    </form>
  `;

  modalBackdrop.style.display = 'flex';
}

function handleContractFormFilesSelect(input) {
  var files = Array.from(input.files || []);
  if (!files.length) return;
  S.contractFormPendingFiles = (S.contractFormPendingFiles || []).concat(files);
  renderContractFormFilesChips();
}

function removeContractFormPendingFile(index) {
  if (S.contractFormPendingFiles && S.contractFormPendingFiles[index]) {
    S.contractFormPendingFiles.splice(index, 1);
    renderContractFormFilesChips();
  }
}

function renderContractFormFilesChips() {
  var box = document.getElementById('cf_files_preview');
  if (!box) return;
  var files = S.contractFormPendingFiles || [];
  if (!files.length) {
    box.innerHTML = '<span style="color:var(--text-3); font-style:italic">Файлы пока не выбраны</span>';
    return;
  }

  box.innerHTML = files.map(function(f, idx) {
    return `
      <span style="display:inline-flex; align-items:center; gap:6px; background:#eff6ff; border:1px solid #bfdbfe; padding:4px 8px; border-radius:6px; font-size:.78rem; font-weight:600; color:#1e40af">
        📄 ${escHtml(f.name)} (${formatFileSize(f.size)})
        <button type="button" onclick="removeContractFormPendingFile(${idx})" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:1rem; line-height:1; padding:0 2px">&times;</button>
      </span>
    `;
  }).join('');
}

function closeContractFormModal() {
  S.contractFormPendingFiles = [];
  var modalBackdrop = document.getElementById('contract_form_modal_backdrop');
  if (modalBackdrop) modalBackdrop.style.display = 'none';
}

function handleContractFormSubmit(e, id) {
  e.preventDefault();
  var isEdit = Boolean(id);

  var selMgr = document.getElementById('cf_manager_id');
  var mgrId = (selMgr && selMgr.value) ? parseInt(selMgr.value, 10) : null;
  var mgrName = (mgrId && selMgr && selMgr.selectedIndex >= 0) ? selMgr.options[selMgr.selectedIndex].getAttribute('data-name') : null;

  var payload = {
    internal_number: document.getElementById('cf_internal_number').value.trim(),
    contract_number: document.getElementById('cf_contract_number').value.trim(),
    contract_date: document.getElementById('cf_contract_date').value || null,
    contract_type_summary: document.getElementById('cf_type').value,
    status: document.getElementById('cf_status') ? document.getElementById('cf_status').value : 'заключен',
    customer_name: document.getElementById('cf_customer_name').value.trim(),
    our_entity_name: document.getElementById('cf_our_entity').value.trim(),
    contacts_raw: document.getElementById('cf_contacts_raw') ? document.getElementById('cf_contacts_raw').value.trim() : '',
    manager_id: mgrId,
    manager_name: mgrName,
    subject: document.getElementById('cf_subject').value.trim(),
    delivery_place: document.getElementById('cf_place').value.trim(),
    deadline_raw: document.getElementById('cf_deadline_raw').value.trim(),
    deadline_date: document.getElementById('cf_deadline_date') && document.getElementById('cf_deadline_date').value ? document.getElementById('cf_deadline_date').value : null,
    amount: parseFloat(document.getElementById('cf_amount').value) || 0,
    security_amount: parseFloat(document.getElementById('cf_security_amount').value) || 0,
    discount_percent: (parseFloat(document.getElementById('cf_discount').value) || 0) / 100,
    zakupki_url: document.getElementById('cf_zakupki_url').value.trim(),
    cloud_url: document.getElementById('cf_cloud_url').value.trim(),
    terms_text: document.getElementById('cf_terms_text').value.trim()
  };

  var method = isEdit ? 'PUT' : 'POST';
  var url = isEdit ? '/contracts/' + id : '/contracts';

  api(url, {
    method: method,
    body: JSON.stringify(payload)
  }).then(function(res) {
    if (res && res.error) {
      showToast('Ошибка: ' + res.error, 'error');
    } else {
      var contractId = isEdit ? id : (res && res.id);
      var pendingFiles = S.contractFormPendingFiles || [];

      if (pendingFiles.length && contractId) {
        var fd = new FormData();
        pendingFiles.forEach(function(f) { fd.append('files', f); });

        showToast('Сохранение файлов договора...', 'info');

        fetch('/api/contracts/' + contractId + '/attachments', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + S.token },
          body: fd
        }).then(function() {
          S.contractFormPendingFiles = [];
          showToast(isEdit ? 'Договор обновлен, файлы загружены' : 'Договор создан, файлы успешно прикреплены!', 'success');
          closeContractFormModal();
          fetchContracts();
          openContractModal(contractId, 'main');
        }).catch(function(err) {
          console.error(err);
          showToast('Договор сохранен, но произошла ошибка при загрузке файлов', 'warning');
          closeContractFormModal();
          fetchContracts();
          openContractModal(contractId, 'main');
        });
      } else {
        showToast(isEdit ? 'Договор успешно обновлен' : 'Договор создан', 'success');
        closeContractFormModal();
        fetchContracts();
        if (isEdit) openContractModal(id);
      }
    }
  }).catch(function(err) {
    showToast('Ошибка: ' + err.message, 'error');
  });
}

function deleteContract(id) {
  if (!confirm('Вы уверены, что хотите удалить этот договор?')) return;
  api('/contracts/' + id, { method: 'DELETE' }).then(function(res) {
    if (res && res.error) {
      showToast('Ошибка: ' + res.error, 'error');
    } else {
      showToast('Договор удален', 'success');
      closeContractModal();
      fetchContracts();
    }
  }).catch(function(err) {
    showToast('Ошибка: ' + err.message, 'error');
  });
}

function triggerContractsImport() {
  var inp = document.getElementById('contract_excel_input');
  if (inp) inp.click();
}

function handleContractExcelUpload(e) {
  var file = e.target.files && e.target.files[0];
  if (!file) return;

  var formData = new FormData();
  formData.append('file', file);

  showToast('Импорт реестра запущен, пожалуйста подождите...', 'info');

  var token = S.token;
  fetch('/api/contracts/import', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token
    },
    body: formData
  }).then(function(r){ return r.json(); }).then(function(res) {
    if (res && res.error) {
      showToast('Ошибка импорта: ' + res.error, 'error');
    } else {
      showToast(res.message || 'Импорт успешно завершен!', 'success');
      fetchContracts();
    }
  }).catch(function(err) {
    showToast('Ошибка импорта: ' + err.message, 'error');
  });
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 Б';
  var k = 1024;
  var sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function initContractMap(c) {
  var mapElId = 'contract_leafmap_' + c.id;
  var el = document.getElementById(mapElId);
  if (!el) return;

  var mapAddr = (c.delivery_place || c.our_entity_region || '').trim();
  if (!mapAddr) {
    el.innerHTML = '<div style="text-align:center;padding:1.5rem;color:#888">Место работ не указано в договоре</div>';
    return;
  }

  function cleanAddr(a) {
    if (!a) return '';
    return String(a)
      .replace(/\b(г\.|город|пгт|пос\.|с\.|село|д\.|дер\.|р-н|обл\.|область|край|респ\.|республика)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var queries = [
    'Россия, ' + (c.our_entity_region ? c.our_entity_region + ', ' : '') + cleanAddr(mapAddr),
    'Россия, ' + cleanAddr(mapAddr)
  ];
  if (c.our_entity_region) queries.push('Россия, ' + c.our_entity_region);

  function tryGeocode(qs, cb) {
    if (!qs.length) { cb(null); return; }
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru&accept-language=ru&q=' + encodeURIComponent(qs[0]);
    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d && d[0]) cb(d[0]);
        else tryGeocode(qs.slice(1), cb);
      })
      .catch(function() { tryGeocode(qs.slice(1), cb); });
  }

  function renderLeaflet() {
    tryGeocode(queries, function(result) {
      if (!result) {
        el.innerHTML = '<div style="text-align:center;padding:1.5rem 1rem;color:#64748b">' +
          '<div style="font-size:1.8rem;margin-bottom:.4rem">🗺️</div>' +
          '<div style="font-weight:600;font-size:.85rem">Координаты объекта не найдены</div>' +
          '<div style="font-size:.75rem;color:#94a3b8;margin-top:2px">Используйте ссылки Яндекс.Карты или 2ГИС ниже</div>' +
        '</div>';
        return;
      }
      var lat = parseFloat(result.lat);
      var lng = parseFloat(result.lon);
      el.innerHTML = '';
      if (window._activeContractMap) {
        try { window._activeContractMap.remove(); } catch(_) {}
      }
      var map = L.map(el).setView([lat, lng], 14);
      window._activeContractMap = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
      L.marker([lat, lng]).addTo(map).bindPopup(escHtml(mapAddr)).openPopup();
      setTimeout(function() { map.invalidateSize(); }, 200);
    });
  }

  if (window.L) {
    renderLeaflet();
  } else {
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);

    var s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = renderLeaflet;
    document.head.appendChild(s);
  }
}

function renderContractAttachmentsListAndPreview(c, attachments) {
  if (!attachments || !attachments.length) {
    return `
      <div id="contract_dropzone_${c.id}"
           ondragover="handleContractDragOver(event, ${c.id})"
           ondragleave="handleContractDragLeave(event, ${c.id})"
           ondrop="handleContractDrop(event, ${c.id})"
           onclick="triggerContractAttachmentUpload(${c.id})"
           style="text-align:center; padding:2.2rem 1.5rem; background:#f8fafc; border-radius:10px; border:2px dashed #cbd5e1; margin-top:14px; transition:all .2s ease; cursor:pointer">
        <div style="font-size:2.4rem; margin-bottom:.5rem">📥</div>
        <div style="font-weight:700; font-size:.95rem; color:var(--text)">Перетащите файлы сюда или нажмите для выбора с компьютера</div>
        <div style="font-size:.8rem; color:var(--text-3); margin-top:4px">
          Любые документы по договору: ТЗ, сметы, спецификации, схемы, акты (.pdf, .xlsx, .docx, .png, .jpg)
        </div>
      </div>
    `;
  }

  var activeId = S.contractActivePreview;
  var activeFile = attachments.find(function(a){ return a.id === activeId; }) || attachments[0];

  var chips = attachments.map(function(att) {
    var cleanName = (typeof fixMojibake === 'function' ? fixMojibake(att.original_name) : att.original_name) || 'Файл';
    var isSelected = (activeFile && activeFile.id === att.id);
    var isPdf = att.mime_type === 'application/pdf' || cleanName.toLowerCase().endsWith('.pdf');
    var isImg = (att.mime_type && att.mime_type.startsWith('image/')) || /\.(png|jpe?g|webp)$/i.test(cleanName);
    var icon = isPdf ? '📄' : (isImg ? '🖼️' : '📊');

    return `
      <div style="display:inline-flex; align-items:center; gap:8px; padding:6px 12px; border-radius:8px; background:${isSelected ? '#eff6ff' : '#f8fafc'}; border:${isSelected ? '2px solid #3b82f6' : '1px solid var(--border)'}; font-size:.82rem; cursor:pointer; transition:all .15s" onclick="setContractActivePreview(${c.id}, ${att.id})">
        <span style="font-size:1.1rem">${icon}</span>
        <span style="font-weight:600; color:var(--text); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${escHtml(cleanName)}">${escHtml(cleanName)}</span>
        <span style="font-size:.72rem; color:var(--text-3)">${formatFileSize(att.size_bytes)}</span>
        <div style="display:flex; gap:4px; margin-left:4px" onclick="event.stopPropagation()">
          <a href="/uploads/${att.file_path}" download="${escHtml(cleanName)}" class="btn btn-xs btn-ghost" title="Скачать">📥</a>
          <button class="btn btn-xs btn-ghost" onclick="deleteContractAttachment(${c.id}, ${att.id})" title="Удалить" style="color:var(--red)">&times;</button>
        </div>
      </div>
    `;
  }).join('');

  var previewHtml = '';
  if (activeFile) {
    var cleanActiveName = (typeof fixMojibake === 'function' ? fixMojibake(activeFile.original_name) : activeFile.original_name) || 'Файл';
    var isPdf = activeFile.mime_type === 'application/pdf' || cleanActiveName.toLowerCase().endsWith('.pdf');
    var isImg = (activeFile.mime_type && activeFile.mime_type.startsWith('image/')) || /\.(png|jpe?g|webp)$/i.test(cleanActiveName);

    if (isPdf) {
      previewHtml = `
        <div style="margin-top:14px; border:1px solid var(--border); border-radius:8px; overflow:hidden; background:#fff">
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 14px; background:#f8fafc; border-bottom:1px solid var(--border); font-size:.82rem; font-weight:600">
            <div style="display:flex; align-items:center; gap:8px">
              <span>👁️ Предпросмотр: <strong>${escHtml(cleanActiveName)}</strong></span>
              <span class="badge b-blue" style="font-size:.7rem">${formatFileSize(activeFile.size_bytes)}</span>
            </div>
            <div style="display:flex; gap:8px">
              <a href="/uploads/${activeFile.file_path}" target="_blank" class="btn btn-xs btn-ghost">↗ Во весь экран</a>
              <a href="/uploads/${activeFile.file_path}" download="${escHtml(cleanActiveName)}" class="btn btn-xs">📥 Скачать</a>
            </div>
          </div>
          <iframe src="/uploads/${activeFile.file_path}" style="width:100%; height:480px; border:none; background:#525659"></iframe>
        </div>
      `;
    } else if (isImg) {
      previewHtml = `
        <div style="margin-top:14px; border:1px solid var(--border); border-radius:8px; overflow:hidden; background:#fff">
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 14px; background:#f8fafc; border-bottom:1px solid var(--border); font-size:.82rem; font-weight:600">
            <div style="display:flex; align-items:center; gap:8px">
              <span>👁️ Просмотр: <strong>${escHtml(cleanActiveName)}</strong></span>
            </div>
            <div style="display:flex; gap:8px">
              <a href="/uploads/${activeFile.file_path}" target="_blank" class="btn btn-xs btn-ghost">↗ Открыть оригинал</a>
              <a href="/uploads/${activeFile.file_path}" download="${escHtml(cleanActiveName)}" class="btn btn-xs">📥 Скачать</a>
            </div>
          </div>
          <div style="text-align:center; padding:1.5rem; background:#f8fafc; max-height:480px; overflow:auto">
            <img src="/uploads/${activeFile.file_path}" style="max-width:100%; max-height:440px; border-radius:6px; box-shadow:0 4px 14px rgba(0,0,0,0.1)" />
          </div>
        </div>
      `;
    } else {
      previewHtml = `
        <div style="margin-top:14px; padding:2rem; text-align:center; background:#f8fafc; border-radius:8px; border:1px solid var(--border)">
          <div style="font-size:2.2rem; margin-bottom:.5rem">📊</div>
          <div style="font-weight:700; font-size:.95rem">${escHtml(cleanActiveName)}</div>
          <div style="color:var(--text-3); font-size:.8rem; margin:4px 0 14px">Документ (${formatFileSize(activeFile.size_bytes)}) · Загрузил: ${escHtml(activeFile.uploader_display_name || 'Пользователь')}</div>
          <a href="/uploads/${activeFile.file_path}" download="${escHtml(cleanActiveName)}" class="btn btn-sm" style="background:#2563eb; color:#fff">📥 Скачать и открыть файл</a>
        </div>
      `;
    }
  }

  return `
    <div id="contract_dropzone_${c.id}"
         data-has-files="true"
         ondragover="handleContractDragOver(event, ${c.id})"
         ondragleave="handleContractDragLeave(event, ${c.id})"
         ondrop="handleContractDrop(event, ${c.id})"
         style="margin-top:14px; border:2px dashed transparent; border-radius:10px; padding:4px; transition:all .2s ease">
      <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center">
        ${chips}
        <button class="btn btn-xs btn-ghost" onclick="triggerContractAttachmentUpload(${c.id})" style="border:1.5px dashed #cbd5e1; font-size:.78rem; font-weight:600; padding:6px 12px; border-radius:8px" title="Перетащите файлы сюда или нажмите для выбора">
          + Добавить ещё файлы
        </button>
      </div>
      ${previewHtml}
    </div>
  `;
}

function quickChangeContractStatus(contractId, newStatus) {
  api('/contracts/' + contractId + '/status', {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus })
  }).then(function(res) {
    if (res && res.error) {
      showToast('Ошибка: ' + res.error, 'error');
    } else {
      showToast('Статус договора изменен на: ' + newStatus, 'success');
      if (window._activeContract && window._activeContract.id === contractId) {
        window._activeContract.status = newStatus;
      }
      fetchContracts();
      openContractModal(contractId, 'main');
    }
  }).catch(function(err) {
    showToast('Ошибка: ' + err.message, 'error');
  });
}

function promptEditContractContacts(contractId) {
  var c = window._activeContract && window._activeContract.id === contractId ? window._activeContract : null;
  var currentVal = c && c.contacts_raw ? c.contacts_raw : '';
  var newVal = prompt('Контакты куратора Заказчика (ФИО, телефон, email, отдел):', currentVal);
  if (newVal === null) return;
  newVal = newVal.trim();

  api('/contracts/' + contractId + '/contacts', {
    method: 'PATCH',
    body: JSON.stringify({ contacts_raw: newVal })
  }).then(function(res) {
    if (res && res.error) {
      showToast('Ошибка сохранения: ' + res.error, 'error');
    } else {
      showToast('Контакты куратора обновлены', 'success');
      if (c) c.contacts_raw = newVal;
      openContractModal(contractId, 'main');
      fetchContracts();
    }
  }).catch(function(err) {
    showToast('Ошибка: ' + err.message, 'error');
  });
}

function openAssignContractManagerModal(contractId, currentManagerId) {
  var backdrop = document.getElementById('contract_manager_modal_backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'contract_manager_modal_backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
    backdrop.onclick = function(e) { if (e.target === backdrop) backdrop.style.display = 'none'; };
    document.body.appendChild(backdrop);
  }

  var users = S.users || [];
  var options = '<option value="">-- Без ответственного менеджера --</option>';
  users.forEach(function(u) {
    var isSel = (u.id === Number(currentManagerId)) ? 'selected' : '';
    var roleName = (STOCK_ROLES[u.role] ? STOCK_ROLES[u.role].name : u.role) || '';
    var roleLabel = roleName ? (' (' + roleName + ')') : '';
    var name = u.fullName || u.username || ('Пользователь #' + u.id);
    options += '<option value="' + u.id + '" data-name="' + escHtml(name) + '" ' + isSel + '>' + escHtml(name + roleLabel) + '</option>';
  });

  backdrop.innerHTML = `
    <div class="card p" style="max-width:440px;width:100%;border-radius:12px;background:#fff;box-shadow:0 20px 40px rgba(0,0,0,0.25)">
      <div style="font-weight:700;font-size:1.05rem;margin-bottom:6px">👤 Ответственный менеджер договора</div>
      <div style="font-size:.8rem;color:var(--text-3);margin-bottom:1rem">Выберите сотрудника, который курирует выполнение и закрытие данного договора</div>
      <select id="modal_contract_manager_select" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.85rem;margin-bottom:1.25rem">
        ${options}
      </select>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-sm btn-ghost" onclick="document.getElementById('contract_manager_modal_backdrop').style.display='none'">Отмена</button>
        <button class="btn btn-sm" onclick="saveContractManager(${contractId})">Сохранить</button>
      </div>
    </div>
  `;
  backdrop.style.display = 'flex';
}

function saveContractManager(contractId) {
  var sel = document.getElementById('modal_contract_manager_select');
  if (!sel) return;
  var mgrId = sel.value ? parseInt(sel.value, 10) : null;
  var opt = sel.options[sel.selectedIndex];
  var mgrName = (mgrId && opt) ? opt.getAttribute('data-name') : null;

  api('/contracts/' + contractId + '/manager', {
    method: 'PATCH',
    body: JSON.stringify({ manager_id: mgrId, manager_name: mgrName })
  }).then(function(res) {
    if (res && res.error) {
      showToast('Ошибка: ' + res.error, 'error');
    } else {
      showToast('Ответственный менеджер сохранен', 'success');
      var backdrop = document.getElementById('contract_manager_modal_backdrop');
      if (backdrop) backdrop.style.display = 'none';
      openContractModal(contractId, 'main');
      fetchContracts();
    }
  }).catch(function(err) {
    showToast('Ошибка: ' + err.message, 'error');
  });
}

function triggerContractAttachmentUpload(contractId) {
  var inp = document.getElementById('contract_attachment_input_' + contractId);
  if (inp) inp.click();
}

function uploadContractFiles(contractId, files) {
  if (!files || !files.length) return;

  var fd = new FormData();
  for (var i = 0; i < files.length; i++) {
    fd.append('files', files[i]);
  }

  showToast('Загрузка ' + files.length + ' файл(ов)...', 'info');

  fetch('/api/contracts/' + contractId + '/attachments', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + S.token
    },
    body: fd
  }).then(function(r) { return r.json(); })
    .then(function(res) {
      if (res && res.error) {
        showToast('Ошибка загрузки: ' + res.error, 'error');
      } else {
        showToast('Файлы успешно прикреплены к договору', 'success');
        if (Array.isArray(res) && res.length) {
          S.contractActivePreview = res[0].id;
        }
        openContractModal(contractId, 'main');
      }
    }).catch(function(err) {
      showToast('Ошибка: ' + err.message, 'error');
    });
}

function handleContractAttachmentUpload(contractId, input) {
  var files = input.files;
  if (!files || !files.length) return;
  uploadContractFiles(contractId, files);
  input.value = '';
}

function handleContractDragOver(e, contractId) {
  e.preventDefault();
  e.stopPropagation();
  var el = document.getElementById('contract_dropzone_' + contractId);
  if (el) {
    el.style.borderColor = '#2563eb';
    el.style.backgroundColor = '#eff6ff';
  }
}

function handleContractDragLeave(e, contractId) {
  e.preventDefault();
  e.stopPropagation();
  var el = document.getElementById('contract_dropzone_' + contractId);
  if (el) {
    var hasFiles = el.getAttribute('data-has-files');
    el.style.borderColor = hasFiles ? 'transparent' : '#cbd5e1';
    el.style.backgroundColor = hasFiles ? '' : '#f8fafc';
  }
}

function handleContractDrop(e, contractId) {
  e.preventDefault();
  e.stopPropagation();
  var el = document.getElementById('contract_dropzone_' + contractId);
  if (el) {
    var hasFiles = el.getAttribute('data-has-files');
    el.style.borderColor = hasFiles ? 'transparent' : '#cbd5e1';
    el.style.backgroundColor = hasFiles ? '' : '#f8fafc';
  }
  var files = e.dataTransfer && e.dataTransfer.files;
  if (files && files.length) {
    uploadContractFiles(contractId, files);
  }
}

function deleteContractAttachment(contractId, attachmentId) {
  if (!confirm('Удалить это приложение к договору?')) return;

  api('/contracts/' + contractId + '/attachments/' + attachmentId, {
    method: 'DELETE'
  }).then(function(res) {
    if (res && res.error) {
      showToast('Ошибка: ' + res.error, 'error');
    } else {
      showToast('Файл удален', 'success');
      if (S.contractActivePreview === attachmentId) {
        S.contractActivePreview = null;
      }
      openContractModal(contractId, 'main');
    }
  }).catch(function(err) {
    showToast('Ошибка: ' + err.message, 'error');
  });
}

function setContractActivePreview(contractId, attachmentId) {
  S.contractActivePreview = attachmentId;
  openContractModal(contractId, 'main');
}

var CONTRACT_DEFAULT_CHECKLIST_ITEMS = [
  { key: 'exec_doc', label: 'Исполнительная документация (ИД)' },
  { key: 'scheme_sks', label: 'Схема СКС / Структурная схема' },
  { key: 'cable_routes', label: 'План прокладки кабельных трасс' },
  { key: 'cable_journal', label: 'Кабельный журнал' },
  { key: 'manual', label: 'Инструкция по эксплуатации' },
  { key: 'warranty_cert', label: 'Системный сертификат / гарантия 15–25 лет' },
  { key: 'fluke_tests', label: 'Протоколы тестирования Fluke Networks' },
  { key: 'acts_ks', label: 'Акты КС-2, КС-3 / УПД подписанные' }
];

function renderContractChecklistSection(c) {
  var cl = {};
  if (c && c.checklist) {
    try {
      cl = typeof c.checklist === 'string' ? JSON.parse(c.checklist) : (c.checklist || {});
    } catch(e) { cl = {}; }
  }

  var customItems = Array.isArray(cl._custom) ? cl._custom : [];
  var allItems = CONTRACT_DEFAULT_CHECKLIST_ITEMS.concat(customItems);
  var totalCount = allItems.length;

  var checkedCount = 0;
  allItems.forEach(function(item) {
    if (cl[item.key]) checkedCount++;
  });

  var percent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
  var isAllDone = totalCount > 0 && checkedCount === totalCount;

  var itemsHtml = allItems.map(function(item) {
    var isChecked = !!cl[item.key];
    var isCustom = !CONTRACT_DEFAULT_CHECKLIST_ITEMS.some(function(d) { return d.key === item.key; });

    return `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 12px; border-radius:8px; background:${isChecked ? '#f0fdf4' : '#fff'}; border:${isChecked ? '1.5px solid #86efac' : '1px solid var(--border)'}; transition:all .15s">
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; flex:1; margin:0; user-select:none">
          <input type="checkbox" style="width:17px; height:17px; cursor:pointer; accent-color:#16a34a" ${isChecked ? 'checked' : ''} onchange="toggleContractChecklistItem(${c.id}, '${item.key}', this.checked)">
          <span style="font-size:.85rem; font-weight:${isChecked ? '600' : '500'}; color:${isChecked ? '#15803d' : 'var(--text)'}">
            ${escHtml(item.label)}
          </span>
        </label>
        <div style="display:flex; align-items:center; gap:6px">
          ${isChecked ? `
            <span class="badge b-green" style="font-size:.7rem; padding:2px 8px">✓ Готово</span>
          ` : `
            <span class="badge b-gray" style="font-size:.7rem; padding:2px 8px; opacity:.7">Ожидается</span>
          `}
          ${isCustom ? `
            <button class="btn btn-xs btn-ghost" onclick="removeContractChecklistItem(${c.id}, '${item.key}')" title="Удалить это требование" style="color:var(--red); font-size:1rem; padding:0 4px; line-height:1">&times;</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="card p" style="background:#fff; border:1px solid var(--border)">
      <!-- ЗАГОЛОВОК И ПРОГРЕСС -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px">
        <div>
          <div style="display:flex; align-items:center; gap:8px">
            <span style="font-size:1.15rem">📋</span>
            <span style="font-weight:700; font-size:.95rem">Чек-лист закрывающих требований и документов</span>
            <span class="badge ${isAllDone ? 'b-green' : (checkedCount > 0 ? 'b-blue' : 'b-gray')}" style="font-size:.78rem; font-weight:700">
              ${checkedCount} из ${totalCount} выполнено (${percent}%)
            </span>
          </div>
          <div style="font-size:.78rem; color:var(--text-3); margin-top:2px">
            Контроль наличия исполнительной документации, сертификатов и подписанных актов для сдачи договора
          </div>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="promptAddContractChecklistItem(${c.id})" style="border:1px dashed var(--border); font-size:.8rem; font-weight:600">
          + Своё требование
        </button>
      </div>

      <!-- ПРОГРЕСС-БАР -->
      <div style="width:100%; height:8px; background:#f1f5f9; border-radius:999px; overflow:hidden; margin-bottom:14px; border:1px solid var(--border)">
        <div style="height:100%; width:${percent}%; background:${isAllDone ? '#10b981' : (percent >= 50 ? '#3b82f6' : '#f59e0b')}; transition:width .25s ease"></div>
      </div>

      ${isAllDone ? `
        <div style="padding:8px 12px; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:6px; color:#065f46; font-size:.82rem; font-weight:600; margin-bottom:12px; display:flex; align-items:center; gap:6px">
          <span>🎉</span> Все закрывающие требования и документы по договору закрыты!
        </div>
      ` : ''}

      <!-- СПИСОК ТРЕБОВАНИЙ -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:8px">
        ${itemsHtml}
      </div>
    </div>
  `;
}

function toggleContractChecklistItem(contractId, key, isChecked) {
  var c = window._activeContract && window._activeContract.id === contractId ? window._activeContract : null;
  var cl = {};
  if (c && c.checklist) {
    try {
      cl = typeof c.checklist === 'string' ? JSON.parse(c.checklist) : Object.assign({}, c.checklist);
    } catch(e) { cl = {}; }
  }

  cl[key] = isChecked;

  api('/contracts/' + contractId + '/checklist', {
    method: 'PATCH',
    body: JSON.stringify({ checklist: cl })
  }).then(function(res) {
    if (res && res.error) {
      showToast('Ошибка сохранения: ' + res.error, 'error');
    } else {
      if (c) c.checklist = cl;
      openContractModal(contractId, 'terms');
    }
  }).catch(function(err) {
    showToast('Ошибка: ' + err.message, 'error');
  });
}

function promptAddContractChecklistItem(contractId) {
  var label = prompt('Введите название закрывающего требования или документа:');
  if (!label || !label.trim()) return;
  label = label.trim();

  var c = window._activeContract && window._activeContract.id === contractId ? window._activeContract : null;
  var cl = {};
  if (c && c.checklist) {
    try {
      cl = typeof c.checklist === 'string' ? JSON.parse(c.checklist) : Object.assign({}, c.checklist);
    } catch(e) { cl = {}; }
  }

  if (!Array.isArray(cl._custom)) cl._custom = [];
  var customKey = 'cust_' + Date.now();
  cl._custom.push({ key: customKey, label: label });
  cl[customKey] = false;

  api('/contracts/' + contractId + '/checklist', {
    method: 'PATCH',
    body: JSON.stringify({ checklist: cl })
  }).then(function(res) {
    if (res && res.error) {
      showToast('Ошибка: ' + res.error, 'error');
    } else {
      showToast('Требование добавлено', 'success');
      if (c) c.checklist = cl;
      openContractModal(contractId, 'terms');
    }
  }).catch(function(err) {
    showToast('Ошибка: ' + err.message, 'error');
  });
}

function removeContractChecklistItem(contractId, key) {
  if (!confirm('Удалить это требование?')) return;

  var c = window._activeContract && window._activeContract.id === contractId ? window._activeContract : null;
  var cl = {};
  if (c && c.checklist) {
    try {
      cl = typeof c.checklist === 'string' ? JSON.parse(c.checklist) : Object.assign({}, c.checklist);
    } catch(e) { cl = {}; }
  }

  if (Array.isArray(cl._custom)) {
    cl._custom = cl._custom.filter(function(x) { return x.key !== key; });
  }
  delete cl[key];

  api('/contracts/' + contractId + '/checklist', {
    method: 'PATCH',
    body: JSON.stringify({ checklist: cl })
  }).then(function(res) {
    if (res && res.error) {
      showToast('Ошибка: ' + res.error, 'error');
    } else {
      showToast('Требование удалено', 'success');
      if (c) c.checklist = cl;
      openContractModal(contractId, 'terms');
    }
  }).catch(function(err) {
    showToast('Ошибка: ' + err.message, 'error');
  });
}

window.initContractMap = initContractMap;
window.openAssignContractManagerModal = openAssignContractManagerModal;
window.saveContractManager = saveContractManager;
window.triggerContractAttachmentUpload = triggerContractAttachmentUpload;
window.uploadContractFiles = uploadContractFiles;
window.handleContractAttachmentUpload = handleContractAttachmentUpload;
window.handleContractDragOver = handleContractDragOver;
window.handleContractDragLeave = handleContractDragLeave;
window.handleContractDrop = handleContractDrop;
window.deleteContractAttachment = deleteContractAttachment;
window.setContractActivePreview = setContractActivePreview;
window.renderContractChecklistSection = renderContractChecklistSection;
window.toggleContractChecklistItem = toggleContractChecklistItem;
window.promptAddContractChecklistItem = promptAddContractChecklistItem;
window.removeContractChecklistItem = removeContractChecklistItem;
window.handleContractFormFilesSelect = handleContractFormFilesSelect;
window.removeContractFormPendingFile = removeContractFormPendingFile;
window.renderContractFormFilesChips = renderContractFormFilesChips;
window.quickChangeContractStatus = quickChangeContractStatus;
window.promptEditContractContacts = promptEditContractContacts;
window.getContractStatusBadge = getContractStatusBadge;


/**
 * Переход в Сценарий 3 на вкладке Данные с предзаполнением договора
 */
function goToScenario3WithContract(contractId) {
  closeContractModal();
  S.prefillContractId = contractId;
  S.page = 'data';
  renderApp();
}

/**
 * Обеспечение наличия модалки создания заявки в DOM
 */
function ensureCreateTaskModalInDOM() {
  if (!document.getElementById('contract_create_task_modal_backdrop')) {
    var div = document.createElement('div');
    div.id = 'contract_create_task_modal_backdrop';
    div.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:10001; align-items:center; justify-content:center; padding:16px';
    div.onclick = function(e) { if (e.target === div) closeCreateTaskForContractModal(); };
    div.innerHTML = '<div id="contract_create_task_modal" class="card" style="width:100%; max-width:780px; max-height:92vh; overflow-y:auto; background:#fff; border-radius:12px; box-shadow:0 20px 45px rgba(0,0,0,0.3); position:relative"></div>';
    document.body.appendChild(div);
  }
}

/**
 * Открытие модалки создания новой заявки по договору (с предзаполнением)
 */
function openCreateTaskForContractModal(contractId) {
  ensureCreateTaskModalInDOM();
  var backdrop = document.getElementById('contract_create_task_modal_backdrop');
  var modal = document.getElementById('contract_create_task_modal');
  if (!backdrop || !modal) return;

  var c = (window._activeContract && String(window._activeContract.id) === String(contractId))
    ? window._activeContract
    : ((S.contracts || []).find(function(x) { return String(x.id) === String(contractId); }));

  if (!c) {
    api('/contracts/' + contractId).then(function(res) {
      if (res && !res.error) {
        window._activeContract = res;
        openCreateTaskForContractModal(contractId);
      } else {
        alert('Не удалось загрузить данные договора');
      }
    });
    return;
  }

  var existingCount = (c.linked_tasks && c.linked_tasks.length) ? c.linked_tasks.length : 0;
  var suggestedSuffix = existingCount + 1;
  var prefix = c.internal_number ? (c.internal_number + '-') : (c.contract_number ? (c.contract_number + '-') : 'З-');
  var suggestedId = prefix + suggestedSuffix;

  var todayStr = new Date().toISOString().slice(0, 10);
  var deadlineStr = c.deadline_date ? String(c.deadline_date).slice(0, 10) : '';

  // Опции заказчиков
  var custOptions = ['ПАО Сбербанк'];
  if (Array.isArray(S.contractors)) {
    S.contractors.filter(function(x){ return x.type === 'customer'; }).forEach(function(x){
      if (!custOptions.includes(x.name_short)) custOptions.push(x.name_short);
    });
  }
  if (c.customer_name && !custOptions.includes(c.customer_name)) {
    custOptions.unshift(c.customer_name);
  }

  modal.innerHTML = `
    <div style="padding:18px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:#fafafa; border-radius:12px 12px 0 0">
      <div>
        <div style="display:flex; align-items:center; gap:8px">
          <span class="badge b-blue" style="font-size:.78rem">Связка с договором</span>
          <span class="badge b-orange" style="font-size:.78rem; font-family:monospace; font-weight:700">Вн. № ${escHtml(c.internal_number || '—')}</span>
          ${c.contract_number ? `<span class="badge b-gray" style="font-size:.78rem">№ ${escHtml(c.contract_number)}</span>` : ''}
        </div>
        <h3 style="margin:6px 0 0; font-size:1.15rem; font-weight:700">➕ Создание новой заявки / объекта</h3>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="closeCreateTaskForContractModal()" style="font-size:1.3rem; line-height:1; color:var(--text-3)">&times;</button>
    </div>

    <form id="create_contract_task_form" onsubmit="event.preventDefault(); submitCreateTaskForContract(${c.id})" style="padding:20px 24px">
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 14px; margin-bottom:16px; font-size:.82rem; color:#166534; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px">
        <div>
          <span>✨ <b>Реквизиты предзаполнены из договора:</b> заказчик, регион, адрес объекта, вид работ и куратор.</span>
        </div>
        <button type="button" class="btn btn-sm btn-outline" style="background:#fff; border-color:#86efac; color:#166534; font-size:.75rem" onclick="goToScenario3WithContract(${c.id})">
          📄 Открыть в Сценарии 3 (ИИ / PDF)
        </button>
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; font-size:.85rem">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Номер заявки (ID) *</label>
            <input type="text" id="ct_id" value="${escHtml(suggestedId)}" required style="width:100%; font-weight:700; border-color:var(--orange)">
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">№ ВСП / Объекта</label>
            <input type="text" id="ct_vsp" placeholder="Например: ВСП 0128" style="width:100%">
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Заказчик (Организация)</label>
            <select id="ct_customer" style="width:100%">
              ${custOptions.map(function(opt) {
                var isSel = (opt.toLowerCase().trim() === (c.customer_name || '').toLowerCase().trim()) ? 'selected' : '';
                return `<option value="${escHtml(opt)}" ${isSel}>${escHtml(opt)}</option>`;
              }).join('')}
            </select>
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Регион</label>
            <input type="text" id="ct_region" value="${escHtml(c.our_entity_region || '')}" placeholder="Регион проведения работ" style="width:100%">
          </div>
        </div>

        <div>
          <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Адрес объекта</label>
          <input type="text" id="ct_address" value="${escHtml(c.delivery_place || '')}" placeholder="Точный адрес объекта" style="width:100%">
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Вид работ</label>
            <input type="text" id="ct_work_type" value="${escHtml(c.contract_type_summary || '')}" placeholder="СМР / СКС / Видеонаблюдение..." style="width:100%">
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Куратор / Менеджер заказчика</label>
            <input type="text" id="ct_manager" value="${escHtml(c.manager_name ? (c.manager_name + (c.contacts_raw ? ' (' + c.contacts_raw + ')' : '')) : (c.contacts_raw || ''))}" placeholder="ФИО / Контакты куратора" style="width:100%">
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px">
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Сумма заявки (₽)</label>
            <input type="number" id="ct_amount" value="0" style="width:100%">
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Дата заявки</label>
            <input type="date" id="ct_date_zayavki" value="${escHtml(todayStr)}" style="width:100%">
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Дедлайн (план)</label>
            <input type="date" id="ct_deadline" value="${escHtml(deadlineStr)}" style="width:100%">
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Ссылка на облако / диск</label>
            <input type="url" id="ct_tech_link" value="${escHtml(c.cloud_url || '')}" placeholder="https://..." style="width:100%">
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">В заказе (портов/ед.)</label>
            <input type="number" id="ct_in_order" value="0" style="width:100%">
          </div>
        </div>

        <div>
          <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Комментарий / Назначение</label>
          <textarea id="ct_comment" rows="2" style="width:100%; resize:vertical">${escHtml(c.subject ? ('По договору: ' + c.subject) : '')}</textarea>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; padding-top:14px; border-top:1px solid var(--border)">
        <button type="button" class="btn btn-ghost" onclick="closeCreateTaskForContractModal()">Отмена</button>
        <button type="submit" id="ct_submit_btn" class="btn btn-primary" style="padding:.6rem 1.4rem">
          ✓ Создать и привязать к договору
        </button>
      </div>
    </form>
  `;

  backdrop.style.display = 'flex';
}

function closeCreateTaskForContractModal() {
  var backdrop = document.getElementById('contract_create_task_modal_backdrop');
  if (backdrop) backdrop.style.display = 'none';
}

function submitCreateTaskForContract(contractId) {
  var idEl = document.getElementById('ct_id');
  if (!idEl || !idEl.value.trim()) {
    alert('Пожалуйста, укажите Номер заявки!');
    return;
  }

  var btn = document.getElementById('ct_submit_btn');
  var origText = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = 'Создание...'; btn.disabled = true; }

  var data = {
    id:           idEl.value.trim(),
    contractId:   contractId,
    contract_id:  contractId,
    vsp:          document.getElementById('ct_vsp').value.trim(),
    customer:     document.getElementById('ct_customer').value,
    region:       document.getElementById('ct_region').value.trim(),
    address:      document.getElementById('ct_address').value.trim(),
    workType:     document.getElementById('ct_work_type').value.trim(),
    manager:      document.getElementById('ct_manager').value.trim(),
    amount:       document.getElementById('ct_amount').value,
    dateZayavki:  document.getElementById('ct_date_zayavki').value,
    deadline:     document.getElementById('ct_deadline').value,
    techLink:     document.getElementById('ct_tech_link').value.trim(),
    inOrder:      document.getElementById('ct_in_order').value,
    comment:      document.getElementById('ct_comment').value.trim()
  };

  api('/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(function(res) {
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }

    if (res && res.error) {
      alert('Ошибка: ' + res.error);
      return;
    }

    closeCreateTaskForContractModal();
    showToast('✅ Заявка ' + res.id + ' успешно создана и привязана к договору', 'success');

    // Обновляем список задач
    api('/tasks').then(function(tasksList) {
      S.tasks = tasksList;
    });

    // Обновляем карточку договора на вкладке "Объекты/Заявки"
    openContractModal(contractId, 'tasks');
    fetchContracts();
  }).catch(function(err) {
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }
    alert('Ошибка сети при создании заявки: ' + err.message);
  });
}
