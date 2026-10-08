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
  S.contractManager = S.contractManager || 'all';
  S.contractEntity = S.contractEntity || 'all';

  // Менеджеры для фильтра
  var usersList = (S.contractFilterOptions && S.contractFilterOptions.users) || S.users || [];
  var managerOptionsHtml = usersList.map(function(u) {
    var uName = u.name || u.fullName || u.username;
    var isSel = (String(S.contractManager) === String(u.id) || S.contractManager === uName) ? 'selected' : '';
    return `<option value="${u.id}" ${isSel}>👤 ${escHtml(uName)}</option>`;
  }).join('');

  // Сторона 2 (Юрлица / Исполнители)
  var entitiesList = (S.contractFilterOptions && Array.isArray(S.contractFilterOptions.entities)) ? S.contractFilterOptions.entities.slice() : ['ООО «Ультима»', 'ООО «К10»'];
  ['ООО «Ультима»', 'ООО «К10»', 'ООО «Кабельные Системы»'].forEach(function(e) {
    if (!entitiesList.includes(e)) entitiesList.push(e);
  });
  var entityOptionsHtml = entitiesList.map(function(e) {
    var isSel = (S.contractEntity === e) ? 'selected' : '';
    return `<option value="${escHtml(e)}" ${isSel}>${escHtml(e)}</option>`;
  }).join('');

  // Сторона 1 (Заказчики)
  var custList = (S.contractFilterOptions && Array.isArray(S.contractFilterOptions.customers)) ? S.contractFilterOptions.customers.slice() : [];
  if (S.contractCustomer && S.contractCustomer !== 'all' && !custList.includes(S.contractCustomer)) {
    custList.unshift(S.contractCustomer);
  }
  var customerOptionsHtml = custList.map(function(cust) {
    var isSel = (S.contractCustomer === cust) ? 'selected' : '';
    var label = cust.length > 45 ? cust.slice(0, 45) + '…' : cust;
    return `<option value="${escHtml(cust)}" title="${escHtml(cust)}" ${isSel}>${escHtml(label)}</option>`;
  }).join('');

  // Года
  var yearsList = (S.contractFilterOptions && Array.isArray(S.contractFilterOptions.years) && S.contractFilterOptions.years.length > 0)
    ? S.contractFilterOptions.years
    : [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];
  var yearOptionsHtml = yearsList.map(function(y) {
    var isSel = (String(S.contractYear) === String(y)) ? 'selected' : '';
    return `<option value="${y}" ${isSel}>${y}</option>`;
  }).join('');

  var hasActiveFilters = Boolean(
    S.contractSearch || 
    (S.contractType && S.contractType !== 'all') || 
    (S.contractCustomer && S.contractCustomer !== 'all') || 
    (S.contractStatus && S.contractStatus !== 'all') || 
    (S.contractYear && S.contractYear !== 'all') || 
    (S.contractManager && S.contractManager !== 'all') || 
    (S.contractEntity && S.contractEntity !== 'all')
  );

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

      <!-- ПАНЕЛЬ ПОИСКА И ФИЛЬТРОВ (ДВЕ СТРОКИ: ПОИСК СВЕРХУ, ОТБОРЫ СНИЗУ) -->
      <div class="card p mb" style="display:flex; flex-direction:column; gap:10px">
        <!-- СТРОКА 1: Поиск + Статус + Год + Сброс -->
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center">
          <div style="position:relative; flex:1; min-width:280px">
            <input type="text" id="contract_search_input" value="${escHtml(S.contractSearch)}" 
                   placeholder="🔍 Поиск по номеру договора, заказчику, менеджеру, предмету, адресу, компании..." 
                   style="width:100%; padding:9px 12px; border:1px solid var(--border); border-radius:8px; font-size:.88rem"
                   oninput="onContractSearchInput(this.value)">
            <button id="contract_search_clear_btn" onclick="clearContractSearch()" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--text-3); font-size:1.1rem; display:${S.contractSearch ? 'block' : 'none'}" title="Очистить поиск">&times;</button>
          </div>

          <select id="contract_filter_status" style="padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:.82rem" onchange="onContractFilterChange('contractStatus', this.value)">
            <option value="all" ${S.contractStatus === 'all' ? 'selected' : ''}>Статус (Все)</option>
            ${CONTRACT_STATUSES.map(function(st) {
              return `<option value="${st.id}" ${S.contractStatus === st.id ? 'selected' : ''}>${st.label}</option>`;
            }).join('')}
          </select>

          <select id="contract_filter_year" style="padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:.82rem" onchange="onContractFilterChange('contractYear', this.value)">
            <option value="all" ${S.contractYear === 'all' ? 'selected' : ''}>Год (Все)</option>
            ${yearOptionsHtml}
          </select>

          <div id="contract_reset_filters_wrap" style="display:${hasActiveFilters ? 'inline-flex' : 'none'}">
            <button class="btn btn-sm btn-ghost" onclick="resetContractFilters()" style="color:var(--red); font-size:.78rem; font-weight:600">
              ✕ Сбросить
            </button>
          </div>
        </div>

        <!-- СТРОКА 2: Отборы (Менеджер, Сторона 2, Сторона 1, О чем договор) -->
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; padding-top:6px; border-top:1px dashed var(--border)">
          <div style="display:inline-flex; align-items:center; gap:5px; font-size:.74rem; font-weight:700; color:var(--text-2); text-transform:uppercase; letter-spacing:0.5px">
            <span>🎯</span> <span>Отбор:</span>
          </div>

          <!-- МЕНЕДЖЕР (КТО ВЕДЕТ КОНТРАКТ) -->
          <select id="contract_filter_manager" style="padding:7px 10px; border:1px solid var(--border); border-radius:8px; font-size:.82rem; min-width:175px; flex:1" onchange="onContractFilterChange('contractManager', this.value)" title="Отбор по менеджеру договора">
            <option value="all" ${S.contractManager === 'all' ? 'selected' : ''}>👤 Менеджер (Все)</option>
            <option value="unassigned" ${S.contractManager === 'unassigned' ? 'selected' : ''}>👤 Без менеджера</option>
            <option value="assigned" ${S.contractManager === 'assigned' ? 'selected' : ''}>👤 Любой назначенный</option>
            ${managerOptionsHtml}
          </select>

          <!-- СТОРОНА 2 (ИСПОЛНИТЕЛЬ / НАША ОРГАНИЗАЦИЯ) -->
          <select id="contract_filter_entity" style="padding:7px 10px; border:1px solid var(--border); border-radius:8px; font-size:.82rem; min-width:185px; flex:1" onchange="onContractFilterChange('contractEntity', this.value)" title="Отбор по стороне 2 (Исполнитель / Наша организация)">
            <option value="all" ${S.contractEntity === 'all' ? 'selected' : ''}>🏢 Сторона 2: Исполнитель (Все)</option>
            ${entityOptionsHtml}
          </select>

          <!-- СТОРОНА 1 (ЗАКАЗЧИК) -->
          <select id="contract_filter_customer" style="padding:7px 10px; border:1px solid var(--border); border-radius:8px; font-size:.82rem; min-width:210px; max-width:320px; flex:1" onchange="onContractFilterChange('contractCustomer', this.value)" title="Отбор по стороне 1 (Заказчик)">
            <option value="all" ${S.contractCustomer === 'all' ? 'selected' : ''}>🏛️ Сторона 1: Заказчик (Все)</option>
            ${customerOptionsHtml}
          </select>

          <!-- О ЧЕМ ДОГОВОР -->
          <select id="contract_filter_type" style="padding:7px 10px; border:1px solid var(--border); border-radius:8px; font-size:.82rem; min-width:160px; flex:1" onchange="onContractFilterChange('contractType', this.value)" title="Отбор по предмету / типу работ">
            <option value="all" ${S.contractType === 'all' ? 'selected' : ''}>🏷️ О чем договор (Все)</option>
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

    <!-- МОДАЛЬНОЕ ОКНО ДОБАВЛЕНИЯ МАТЕРИАЛОВ (ПРОВОДНИК / БРАУЗЕР) -->
    <div id="contract_materials_modal_backdrop" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:10002; align-items:center; justify-content:center; padding:16px" onclick="if(event.target===this) closeAddContractMaterialsModal()">
      <div id="contract_materials_modal" class="card" style="width:100%; max-width:640px; background:#fff; border-radius:12px; box-shadow:0 20px 45px rgba(0,0,0,0.3); overflow:hidden"></div>
    </div>

    <!-- МОДАЛЬНОЕ ОКНО РЕДАКТИРОВАНИЯ/ДОБАВЛЕНИЯ ДОПСОГЛАШЕНИЙ (ДС) -->
    <div id="contract_agreement_modal_backdrop" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:10003; align-items:center; justify-content:center; padding:16px" onclick="if(event.target===this) closeAgreementModal()">
      <div id="contract_agreement_modal" class="card" style="width:100%; max-width:540px; background:#fff; border-radius:12px; box-shadow:0 20px 45px rgba(0,0,0,0.3); overflow:hidden"></div>
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
  if (S.contractManager && S.contractManager !== 'all') params.push('manager=' + encodeURIComponent(S.contractManager));
  if (S.contractEntity && S.contractEntity !== 'all') params.push('entity=' + encodeURIComponent(S.contractEntity));

  var url = '/contracts' + (params.length ? '?' + params.join('&') : '');

  api(url).then(function(res) {
    if (res && res.contracts) {
      S.contracts = res.contracts;
      S.contractStats = res.stats || {};
      if (res.filterOptions) {
        S.contractFilterOptions = res.filterOptions;
        updateContractFilterSelectOptions(res.filterOptions);
      }
    } else if (Array.isArray(res)) {
      S.contracts = res;
    }
    renderContractsTable();
    updateContractStatsWidgets();
    updateContractResetButton();
    if (typeof window.restorePageScroll === 'function') window.restorePageScroll();
  }).catch(function(err) {
    console.error('Failed to load contracts:', err);
    var container = document.getElementById('contracts_table_container');
    if (container) {
      container.innerHTML = `<div class="card p" style="text-align:center; padding:2rem; color:var(--red)">Ошибка загрузки договоров: ${escHtml(err.message)}</div>`;
    }
  });
}

function updateContractFilterSelectOptions(opts) {
  if (!opts) return;

  // 1. Сторона 1 (Заказчики)
  var selCust = document.getElementById('contract_filter_customer');
  if (selCust && Array.isArray(opts.customers)) {
    var curCust = S.contractCustomer || 'all';
    var custHtml = '<option value="all">🏛️ Сторона 1: Заказчик (Все)</option>';
    opts.customers.forEach(function(cName) {
      var isSel = (cName === curCust) ? 'selected' : '';
      var short = cName.length > 40 ? cName.slice(0, 40) + '…' : cName;
      custHtml += `<option value="${escHtml(cName)}" title="${escHtml(cName)}" ${isSel}>${escHtml(short)}</option>`;
    });
    selCust.innerHTML = custHtml;
  }

  // 2. Сторона 2 (Исполнитель / Юрлицо)
  var selEnt = document.getElementById('contract_filter_entity');
  if (selEnt && Array.isArray(opts.entities)) {
    var curEnt = S.contractEntity || 'all';
    var entList = opts.entities.slice();
    ['ООО «Ультима»', 'ООО «К10»', 'ООО «Кабельные Системы»'].forEach(function(x) {
      if (!entList.includes(x)) entList.push(x);
    });
    var entHtml = '<option value="all">🏢 Сторона 2: Исполнитель (Все)</option>';
    entList.forEach(function(eName) {
      var isSel = (eName === curEnt) ? 'selected' : '';
      entHtml += `<option value="${escHtml(eName)}" ${isSel}>${escHtml(eName)}</option>`;
    });
    selEnt.innerHTML = entHtml;
  }

  // 3. Менеджеры
  var selMgr = document.getElementById('contract_filter_manager');
  if (selMgr && Array.isArray(opts.users)) {
    var curMgr = S.contractManager || 'all';
    var mgrHtml = `
      <option value="all">👤 Менеджер (Все)</option>
      <option value="unassigned" ${curMgr === 'unassigned' ? 'selected' : ''}>👤 Без менеджера</option>
      <option value="assigned" ${curMgr === 'assigned' ? 'selected' : ''}>👤 Любой назначенный</option>
    `;
    opts.users.forEach(function(u) {
      var uName = u.name || u.username;
      var isSel = (String(curMgr) === String(u.id) || curMgr === uName) ? 'selected' : '';
      mgrHtml += `<option value="${u.id}" ${isSel}>👤 ${escHtml(uName)}</option>`;
    });
    selMgr.innerHTML = mgrHtml;
  }

  // 4. Года
  var selYr = document.getElementById('contract_filter_year');
  if (selYr && Array.isArray(opts.years) && opts.years.length > 0) {
    var curYr = S.contractYear || 'all';
    var yrHtml = '<option value="all">📅 Год (Все)</option>';
    opts.years.forEach(function(y) {
      var isSel = (String(curYr) === String(y)) ? 'selected' : '';
      yrHtml += `<option value="${y}" ${isSel}>${y}</option>`;
    });
    selYr.innerHTML = yrHtml;
  }
}

function updateContractResetButton() {
  var btnWrap = document.getElementById('contract_reset_filters_wrap');
  if (!btnWrap) return;
  var hasActive = Boolean(
    S.contractSearch || 
    (S.contractType && S.contractType !== 'all') || 
    (S.contractCustomer && S.contractCustomer !== 'all') || 
    (S.contractStatus && S.contractStatus !== 'all') || 
    (S.contractYear && S.contractYear !== 'all') || 
    (S.contractManager && S.contractManager !== 'all') || 
    (S.contractEntity && S.contractEntity !== 'all')
  );
  btnWrap.style.display = hasActive ? 'inline-flex' : 'none';
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
  var btn = document.getElementById('contract_search_clear_btn');
  if (btn) btn.style.display = val ? 'block' : 'none';
  updateContractResetButton();
  clearTimeout(contractSearchTimeout);
  contractSearchTimeout = setTimeout(function() {
    fetchContracts();
  }, 250);
}

function clearContractSearch() {
  S.contractSearch = '';
  var inp = document.getElementById('contract_search_input');
  if (inp) {
    inp.value = '';
    inp.focus();
  }
  var btn = document.getElementById('contract_search_clear_btn');
  if (btn) btn.style.display = 'none';
  updateContractResetButton();
  fetchContracts();
}

function onContractFilterChange(key, val) {
  S[key] = val;
  updateContractResetButton();
  fetchContracts();
}

function resetContractFilters() {
  S.contractSearch = '';
  S.contractType = 'all';
  S.contractCustomer = 'all';
  S.contractStatus = 'all';
  S.contractYear = 'all';
  S.contractManager = 'all';
  S.contractEntity = 'all';

  var inp = document.getElementById('contract_search_input');
  if (inp) inp.value = '';
  var selT = document.getElementById('contract_filter_type');
  if (selT) selT.value = 'all';
  var selS = document.getElementById('contract_filter_status');
  if (selS) selS.value = 'all';
  var selY = document.getElementById('contract_filter_year');
  if (selY) selY.value = 'all';
  var selM = document.getElementById('contract_filter_manager');
  if (selM) selM.value = 'all';
  var selE = document.getElementById('contract_filter_entity');
  if (selE) selE.value = 'all';
  var selC = document.getElementById('contract_filter_customer');
  if (selC) selC.value = 'all';

  updateContractResetButton();
  fetchContracts();
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

    // Проверяем многолотовость и ДС
    var lots = [];
    try {
      lots = typeof c.lots === 'string' ? JSON.parse(c.lots) : (c.lots || []);
    } catch(e) {}
    var hasLots = Array.isArray(lots) && lots.length > 0;
    var hasAgreements = Array.isArray(c.agreements) && c.agreements.length > 0;
    var isOpen = Boolean(window._openContractAgreements && window._openContractAgreements.has(c.id));

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
            № ${highlight(escHtml(cleanContractNumber(c.contract_number)), S.contractSearch)}
          </div>
        ` : ''}
        <button class="btn btn-sm btn-ghost" onclick="openContractModal(${c.id})" style="padding:2px 8px; font-size:.75rem; border:1px solid var(--border); border-radius:6px; display:inline-flex; align-items:center; gap:4px; align-self:flex-start; margin-top:2px; font-weight:600; color:var(--text)" title="Открыть подробности договора">
          🔍 Подробности
        </button>
        ${hasAgreements ? `
          <div style="margin-top:3px">
            <button id="btn_toggle_ag_${c.id}" class="btn btn-sm btn-ghost" onclick="toggleContractAgreements(${c.id})" 
                    style="padding:2px 8px; font-size:.73rem; border:1px solid #fed7aa; background:#fffbf7; color:#c2410c; border-radius:6px; display:inline-flex; align-items:center; gap:5px; font-weight:700; cursor:pointer" 
                    title="Показать / скрыть список дополнительных соглашений по регионам">
              <span>📑</span> <span>${c.agreements.length} ДС</span> <span id="icon_toggle_ag_${c.id}">${isOpen ? '▲' : '▼'}</span>
            </button>
          </div>
        ` : (hasLots ? `
          <div style="margin-top:2px">
            <span class="badge b-orange" style="font-size:.65rem; padding:1px 5px">🎯 ${lots.length} лотов</span>
          </div>
        ` : '')}
      </div>
    `;

    // Заказчик, сторона 2 и менеджер
    var mgrName = c.manager_display_name || c.manager_name;
    var managerChip = mgrName ? `
      <div style="margin-top:4px">
        <button class="btn-ghost" onclick="event.stopPropagation(); openAssignContractManagerModal(${c.id}, ${c.manager_id || 'null'})"
                style="padding:1px 6px; font-size:.72rem; border-radius:4px; border:1px solid #bbf7d0; background:#f0fdf4; color:#15803d; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px"
                title="Ответственный менеджер (кликните, чтобы изменить)">
          <span>👤</span> <span>${highlight(escHtml(mgrName), S.contractSearch)}</span>
        </button>
      </div>
    ` : `
      <div style="margin-top:3px">
        <button class="btn-ghost" onclick="event.stopPropagation(); openAssignContractManagerModal(${c.id}, null)"
                style="padding:1px 6px; font-size:.70rem; border-radius:4px; border:1px dashed #cbd5e1; background:transparent; color:var(--text-3); cursor:pointer; display:inline-flex; align-items:center; gap:4px"
                title="Назначить ответственного менеджера">
          <span>👤</span> <span style="opacity:0.8">+ Менеджер</span>
        </button>
      </div>
    `;

    var customerHtml = `
      <div style="font-weight:700; font-size:.88rem; color:var(--text)">
        ${highlight(escHtml(c.customer_name || 'Не указан'), S.contractSearch)}
      </div>
      <div style="font-size:.72rem; color:var(--text-3); margin-top:2px">
        ${highlight(escHtml(c.our_entity_name || 'ООО «Ультима»'), S.contractSearch)} ${c.our_entity_region ? '· ' + highlight(escHtml(c.our_entity_region), S.contractSearch) : ''}
      </div>
      ${managerChip}
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
      <tr id="contract_row_${c.id}" data-contract-id="${c.id}" style="border-bottom: 1px solid var(--border); transition:background .15s" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background='transparent'">
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
      ${hasAgreements ? `
        <tr id="contract_agreements_row_${c.id}" class="contract-agreements-subrow" style="display:${isOpen ? 'table-row' : 'none'}; background:#f8fafc; border-bottom:2px solid #cbd5e1">
          <td colspan="9" style="padding:12px 16px 16px 20px">
            ${renderContractAgreementsSubTable(c)}
          </td>
        </tr>
      ` : ''}
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
  if (typeof window.savePageScroll === 'function') window.savePageScroll('contract_row_' + id);
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
    var hasAgreements = Array.isArray(c.agreements) && c.agreements.length > 0;

    var tasks = c.linked_tasks || [];

    var dDate = c.contract_date ? new Date(c.contract_date).toLocaleDateString('ru-RU') : '—';
    var dlDateStr = getContractDeadlineDate(c);
    var dEnd = dlDateStr ? ('до ' + new Date(dlDateStr).toLocaleDateString('ru-RU')) : (c.deadline_raw || 'По заказам');

    // Отрисовываем содержимое карточки
    modalEl.innerHTML = `
      <div class="modal-header" style="padding:20px 24px; padding-right:200px; border-bottom:1px solid var(--border); position:relative">
        <div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
            <span class="badge b-orange" style="font-size:.85rem; font-weight:800; font-family:monospace">Вн. № ${escHtml(c.internal_number || '—')}</span>
            ${hasAgreements ? `<span class="badge b-yellow" style="font-size:.82rem; font-weight:700">📑 ${c.agreements.length} допсоглашений</span>` : (c.contract_number ? `<span class="badge b-gray" style="font-size:.85rem; font-weight:700">№ ${escHtml(cleanContractNumber(c.contract_number))}</span>` : '')}
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

        <!-- КНОПКИ УПРАВЛЕНИЯ СТРОГО В ПРАВОМ ВЕРХНЕМ УГЛУ ОКНА -->
        <div style="position:absolute; top:18px; right:20px; display:flex; align-items:center; gap:8px; z-index:10">
          <button class="btn btn-sm btn-ghost" onclick="openContractForm(${c.id})" title="Редактировать параметры договора" style="font-size:.78rem; border:1px solid var(--border)">✏️ Изменить</button>
          <div class="win-ctrls-wrap" style="display:inline-flex; align-items:center; gap:4px">
            <button type="button" class="win-ctrl-btn" onclick="var m=document.getElementById('contract_detail_modal'); if(m&&m._minimizeToDock) m._minimizeToDock(); else closeContractModal();" title="Свернуть окно в панель задач (внизу)">—</button>
            <button type="button" class="win-ctrl-btn" onclick="document.getElementById('contract_detail_modal').classList.toggle('modal-maximized')" title="Развернуть / Восстановить размер">▢</button>
            <button type="button" class="win-ctrl-btn btn-close" onclick="closeContractModal()" title="Закрыть окно (Esc)">&times;</button>
          </div>
        </div>
      </div>

      <!-- ВНУТРЕННИЕ ВКЛАДКИ -->
      <div style="display:flex; gap:6px; padding:10px 24px; border-bottom:1px solid var(--border); background:#fafafa; overflow-x:auto">
        <button class="btn btn-sm ${activeTab === 'main' ? '' : 'btn-ghost'}" onclick="openContractModal(${c.id}, 'main')">Параметры и стороны</button>
        <button class="btn btn-sm ${activeTab === 'terms' ? '' : 'btn-ghost'}" onclick="openContractModal(${c.id}, 'terms')">Условия и оплата</button>
        ${hasAgreements ? `<button class="btn btn-sm ${activeTab === 'agreements' ? '' : 'btn-ghost'}" onclick="openContractModal(${c.id}, 'agreements')">Дополнительные соглашения (${c.agreements.length})</button>` : (hasLots ? `<button class="btn btn-sm ${activeTab === 'lots' ? '' : 'btn-ghost'}" onclick="openContractModal(${c.id}, 'lots')">Таблица лотов (${lots.length})</button>` : '')}
        <button class="btn btn-sm ${activeTab === 'tasks' ? '' : 'btn-ghost'}" onclick="openContractModal(${c.id}, 'tasks')">Объекты / Заявки (${tasks.length})</button>
      </div>

      <!-- СОДЕРЖИМОЕ АКТИВНОЙ ВКЛАДКИ -->
      <div style="padding:24px">
        ${activeTab === 'main' ? renderContractTabMain(c, dDate, dEnd) : ''}
        ${activeTab === 'terms' ? renderContractTabTerms(c) : ''}
        ${activeTab === 'agreements' ? renderContractTabAgreements(c, c.agreements) : ''}
        ${activeTab === 'lots' ? renderContractTabLots(c, lots) : ''}
        ${activeTab === 'tasks' ? renderContractTabTasks(c, tasks) : ''}
      </div>
    `;

    if (activeTab === 'main') {
      setTimeout(function() {
        initContractMap(c);
      }, 60);
    } else if (activeTab === 'agreements') {
      setTimeout(function() {
        initContractAgreementsMap(c);
      }, 60);
    }
  });
}

function renderContractTabMain(c, dDate, dEnd) {
  var placeForMap = (c.delivery_place || c.our_entity_region || '');
  if (c.agreements && c.agreements.length > 0) {
    var primaryAgr = c.agreements.find(function(a) { return a.city || a.region; }) || c.agreements[0];
    if (primaryAgr && (primaryAgr.city || primaryAgr.region)) {
      placeForMap = (primaryAgr.city ? primaryAgr.city + (primaryAgr.region ? ', ' + primaryAgr.region : '') : primaryAgr.region);
    }
  }
  var dgisUrl  = 'https://2gis.ru/search/' + encodeURIComponent('Россия, ' + placeForMap);
  var yandexUrl = 'https://yandex.ru/maps/?text=' + encodeURIComponent('Россия, ' + placeForMap);

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
            ${(c.agreements && c.agreements.length > 0) ? `<span class="badge b-yellow" style="font-size:.7rem" id="contract_main_map_badge_${c.id}">${c.agreements.filter(function(a){ return a.geo_lat; }).length} рег. на карте</span>` : ''}
          </div>
          <div style="display:flex; align-items:center; gap:6px">
            ${(c.agreements && c.agreements.length > 0) ? `<button type="button" class="btn btn-xs btn-outline" onclick="resetContractMainMap(${c.id})" style="font-size:.7rem; padding:2px 6px" title="Показать все точки">Все точки</button>` : ''}
            <div style="font-size:.72rem; color:var(--text-3); max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${escHtml(c.delivery_place || '')}">
              ${escHtml(c.delivery_place || 'По региону')}
            </div>
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
            <a href="${escHtml(c.cloud_url)}" target="_blank" class="btn btn-sm" style="border:1.5px solid #93c5fd; background:#eff6ff; color:#1d4ed8; font-weight:600; display:inline-flex; align-items:center; gap:5px" title="Открыть веб-папку Seafile в браузере">☁️ Папка Seafile</a>
            <button class="btn btn-xs btn-ghost" onclick="openAddContractMaterialsModal(${c.id})" title="Изменить ссылку на Seafile" style="border:1px solid var(--border)">✏️</button>
          ` : ''}
          <button class="btn btn-sm" onclick="openAddContractMaterialsModal(${c.id})" style="background:#2563eb; color:#fff; display:inline-flex; align-items:center; gap:6px; font-weight:700; box-shadow:0 1px 3px rgba(37,99,235,0.3)" title="Добавить материалы: выбрать в Проводнике (ПК / Seafile) или указать ссылку в Браузере">
            ➕ Добавить материалы
          </button>
          <button class="btn btn-sm btn-ghost" onclick="triggerContractAttachmentUpload(${c.id})" style="border:1px solid var(--border); color:var(--text); display:inline-flex; align-items:center; gap:5px; font-weight:500" title="Быстрый выбор файлов с компьютера через Проводник">
            📁 Проводник
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

function renderContractTabAgreements(c, agreements) {
  agreements = agreements || [];
  if (!agreements.length) {
    return `
      <div class="card p" style="text-align:center; padding:3rem; color:var(--text-3)">
        <div style="font-size:2.5rem; margin-bottom:10px">📑</div>
        <div style="font-weight:700; font-size:1.05rem; color:var(--text)">Нет дополнительных соглашений</div>
        <div style="margin-top:12px">
          <button class="btn btn-sm btn-outline" onclick="openAddAgreementModal(${c.id})">+ Добавить соглашение</button>
        </div>
      </div>
    `;
  }

  var rows = agreements.map(function(ag) {
    var agCode = ag.agreement_code || ('ДС-' + ag.agreement_number);
    var regCity = ag.city || ag.region || '—';
    var extNum = ag.external_number ? ('№ ' + escHtml(ag.external_number)) : '<span style="color:var(--text-3)">—</span>';
    var priceDisplay = (ag.price_unit && Number(ag.price_unit) > 0)
      ? `<span style="font-weight:700; color:var(--green)">${fmtMoney(ag.price_unit)}</span>` 
      : '<span style="color:var(--text-3); font-size:.78rem">Не задана</span>';
    var amountDisplay = (ag.amount && Number(ag.amount) > 0) ? fmtMoney(ag.amount) : '<span style="color:var(--text-3)">—</span>';
    var tasksCount = ag.linked_tasks_count || 0;

    return `
      <tr id="agr_row_${c.id}_${ag.id}" style="border-bottom:1px solid var(--border); transition:background .2s" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
        <td style="padding:10px 12px; font-weight:700; font-family:monospace; color:var(--blue)">${escHtml(agCode)}</td>
        <td style="padding:10px 12px; font-weight:600">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap">
            <span>📍 ${escHtml(regCity)}</span>
            ${(ag.geo_lat && ag.geo_lon) ? `
              <button type="button" class="btn btn-xs btn-ghost" 
                      onclick="focusAgreementOnMap(${c.id}, ${ag.id})" 
                      style="padding:1px 6px; font-size:.72rem; color:#2563eb; background:#eff6ff; border:1px solid #bfdbfe; border-radius:4px; cursor:pointer" 
                      title="Показать и приблизить на карте">📍 На карте</button>
            ` : ''}
          </div>
        </td>
        <td style="padding:10px 12px; font-family:monospace; color:var(--text-2); font-weight:600">${extNum}</td>
        <td style="padding:10px 12px">
          <div style="display:flex; align-items:center; gap:6px">
            ${priceDisplay}
            <button class="btn btn-xs btn-ghost" onclick="openEditAgreementModal(${c.id}, ${ag.id})" style="padding:1px 5px; font-size:.7rem; border:1px solid var(--border)" title="Изменить региональную цену / тариф">✏️</button>
          </div>
        </td>
        <td style="padding:10px 12px">${amountDisplay}</td>
        <td style="padding:10px 12px; text-align:center">
          ${tasksCount > 0 ? `<button class="badge b-blue" onclick="openContractModal(${c.id}, 'tasks')" style="border:none; cursor:pointer; font-size:.75rem">📋 ${tasksCount}</button>` : '<span style="color:var(--text-3); font-size:.75rem">0</span>'}
        </td>
        <td style="padding:10px 12px; text-align:right">
          <div style="display:inline-flex; gap:6px">
            <button class="btn btn-sm btn-ghost" onclick="openEditAgreementModal(${c.id}, ${ag.id})" style="font-size:.75rem; border:1px solid var(--border)">✏️ Настроить</button>
            <button class="btn btn-sm" onclick="closeContractModal(); openCreateTaskForContractModal(${c.id}, ${ag.id})" style="font-size:.75rem; background:#2563eb; color:#fff; font-weight:600">➕ Заявка</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  var geoCount = agreements.filter(function(a){ return a.geo_lat && a.geo_lon; }).length;

  return `
    <div class="card p mb" style="background:#fffbf7; border:1px solid #fed7aa; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px">
      <div>
        <div style="font-weight:700; font-size:.95rem">Дополнительные соглашения к договору (${agreements.length} регионов)</div>
        <div style="font-size:.8rem; color:var(--text-3); margin-top:2px">
          Каждое ДС закрепляет отдельный филиал/город, индивидуальный номер Сбербанка и региональную стоимость работ
        </div>
      </div>
      <div>
        <button class="btn btn-sm btn-outline" onclick="openAddAgreementModal(${c.id})">+ Добавить соглашение</button>
      </div>
    </div>

    <!-- ИНТЕРАКТИВНАЯ КАРТА ВСЕХ РЕГИОНОВ И ТОЧЕК ИЗ ДС -->
    <div id="contract_agreements_map_container_${c.id}" class="card p mb" style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px 16px">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px">
        <div style="display:flex; align-items:center; gap:8px">
          <span style="font-weight:700; font-size:.92rem; color:var(--text)">🗺️ География соглашений и филиалов</span>
          <span class="badge b-yellow" id="contract_agreements_map_badge_${c.id}" style="font-size:.74rem; font-weight:700">${geoCount} регионов на карте</span>
        </div>
        <div style="display:flex; gap:6px; align-items:center">
          <button type="button" class="btn btn-xs btn-outline" onclick="resetContractAgreementsMap(${c.id})" style="font-size:.75rem; padding:3px 8px" title="Охватить все регионы на карте">🌐 Все регионы</button>
          <button type="button" class="btn btn-xs btn-ghost" onclick="toggleContractAgreementsMap(${c.id})" id="btn_toggle_agreements_map_${c.id}" style="font-size:.75rem; border:1px solid var(--border); padding:3px 8px">Свернуть карту</button>
        </div>
      </div>
      <div id="contract_agreements_leafmap_${c.id}" style="height:320px; border-radius:8px; overflow:hidden; border:1px solid #cbd5e1; background:#f1f5f9; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:.85rem">
        Загрузка карты соглашений…
      </div>
    </div>

    <div class="card tbl-wrap">
      <table>
        <thead>
          <tr style="background:var(--bg)">
            <th style="width:90px">№ ДС</th>
            <th>Регион / Город</th>
            <th>Номер Сбербанка</th>
            <th>Региональная цена</th>
            <th>Лимит по ДС</th>
            <th style="text-align:center; width:90px">Заявок</th>
            <th style="text-align:right; width:170px">Действия</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

window._openContractAgreements = window._openContractAgreements || new Set();

function toggleContractAgreements(contractId) {
  var row = document.getElementById('contract_agreements_row_' + contractId);
  var icon = document.getElementById('icon_toggle_ag_' + contractId);
  if (!row) return;

  if (window._openContractAgreements.has(contractId)) {
    window._openContractAgreements.delete(contractId);
    row.style.display = 'none';
    if (icon) icon.textContent = '▼';
  } else {
    window._openContractAgreements.add(contractId);
    row.style.display = 'table-row';
    if (icon) icon.textContent = '▲';
  }
}

function filterContractAgreementsSubrow(contractId, query) {
  var tbody = document.getElementById('contract_agreements_tbody_' + contractId);
  if (!tbody) return;
  var q = (query || '').trim().toLowerCase();
  var items = tbody.querySelectorAll('.ag-subrow-item');
  items.forEach(function(el) {
    var search = el.getAttribute('data-search') || '';
    if (!q || search.includes(q)) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
}

function renderContractAgreementsSubTable(c) {
  var agreements = c.agreements || [];
  if (!agreements.length) {
    return `<div style="padding:12px; color:var(--text-3); font-size:.82rem">Нет дополнительных соглашений</div>`;
  }

  var rows = agreements.map(function(ag) {
    var agCode = ag.agreement_code || ('ДС-' + ag.agreement_number);
    var regCity = ag.city || ag.region || '—';
    var extNum = ag.external_number ? ('№ ' + escHtml(ag.external_number)) : '<span style="color:var(--text-3)">—</span>';
    var priceDisplay = (ag.price_unit && Number(ag.price_unit) > 0)
      ? `<span style="font-weight:700; color:var(--green)">${fmtMoney(ag.price_unit)}</span>` 
      : `<span style="color:var(--text-3); font-size:.75rem">Не задана</span>`;
    var amountDisplay = (ag.amount && Number(ag.amount) > 0) ? fmtMoney(ag.amount) : '<span style="color:var(--text-3)">—</span>';
    var tasksCount = ag.linked_tasks_count || 0;
    var tasksBadge = tasksCount > 0 
      ? `<button class="badge b-blue" onclick="openContractModal(${c.id}, 'tasks')" style="border:none; cursor:pointer; font-size:.72rem" title="Просмотреть заявки договора">📋 ${tasksCount}</button>`
      : `<span style="color:var(--text-3); font-size:.75rem">0</span>`;

    var searchData = ((agCode + ' ' + regCity + ' ' + (ag.external_number || '') + ' ' + (ag.comment || '')).toLowerCase());

    return `
      <tr class="ag-subrow-item" data-search="${escHtml(searchData)}" style="border-bottom:1px solid #e2e8f0; transition:background .1s" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
        <td style="padding:8px 10px; font-weight:700; font-family:monospace; color:var(--blue); font-size:.82rem; white-space:nowrap">${escHtml(agCode)}</td>
        <td style="padding:8px 10px; font-size:.84rem; font-weight:600; color:var(--text)">📍 ${escHtml(regCity)}</td>
        <td style="padding:8px 10px; font-size:.78rem; font-family:monospace; color:var(--text-2); font-weight:600; white-space:nowrap">${extNum}</td>
        <td style="padding:8px 10px; font-size:.82rem; white-space:nowrap">
          <div style="display:flex; align-items:center; gap:6px">
            ${priceDisplay}
            <button class="btn btn-xs btn-ghost" onclick="openEditAgreementModal(${c.id}, ${ag.id})" style="padding:1px 5px; font-size:.7rem; border:1px solid var(--border)" title="Изменить региональную цену / тариф">✏️</button>
          </div>
        </td>
        <td style="padding:8px 10px; font-size:.80rem; white-space:nowrap">${amountDisplay}</td>
        <td style="padding:8px 10px; text-align:center">${tasksBadge}</td>
        <td style="padding:8px 10px; text-align:center">
          <span class="badge b-green" style="font-size:.68rem">В работе</span>
        </td>
        <td style="padding:8px 10px; text-align:right; white-space:nowrap">
          <div style="display:inline-flex; gap:5px; align-items:center">
            <button class="btn btn-xs btn-ghost" onclick="openEditAgreementModal(${c.id}, ${ag.id})" style="font-size:.72rem; padding:2px 7px; border:1px solid var(--border)">
              ✏️ Настроить
            </button>
            <button class="btn btn-xs" onclick="openCreateTaskForContractModal(${c.id}, ${ag.id})" style="font-size:.72rem; padding:2px 7px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-weight:600">
              ➕ Заявка
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div style="background:#fff; border:1.5px solid #cbd5e1; border-radius:10px; padding:12px 16px; box-shadow:0 2px 6px rgba(0,0,0,0.04)">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #f1f5f9">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
          <span style="font-size:.9rem; font-weight:800; color:var(--text)">📑 Дополнительные соглашения к договору Вн. № ${escHtml(c.internal_number || '—')}</span>
          <span class="badge b-orange" style="font-size:.72rem; font-weight:700">${agreements.length} регионов</span>
          ${c.contract_number ? `<span style="font-size:.75rem; color:var(--text-3)">(${escHtml(c.contract_number)})</span>` : ''}
        </div>
        <div style="display:flex; align-items:center; gap:8px">
          <input type="text" placeholder="🔍 Фильтр по региону / номеру..." 
                 oninput="filterContractAgreementsSubrow(${c.id}, this.value)" 
                 style="padding:4px 8px; font-size:.78rem; border:1px solid var(--border); border-radius:6px; width:220px; background:#f8fafc">
          <button class="btn btn-xs btn-ghost" onclick="openAddAgreementModal(${c.id})" style="border:1px dashed var(--border); font-size:.75rem; font-weight:600">
            + Добавить ДС
          </button>
        </div>
      </div>

      <div style="overflow-x:auto">
        <table style="width:100%; border-collapse:collapse">
          <thead>
            <tr style="background:#f8fafc; border-bottom:1.5px solid #e2e8f0; text-align:left; font-size:.72rem; text-transform:uppercase; color:var(--text-3); letter-spacing:.5px">
              <th style="padding:6px 10px; width:80px">№ ДС</th>
              <th style="padding:6px 10px; min-width:140px">Регион / Город</th>
              <th style="padding:6px 10px; width:150px">Номер Сбербанка</th>
              <th style="padding:6px 10px; width:140px">Региональная цена</th>
              <th style="padding:6px 10px; width:120px">Лимит по ДС</th>
              <th style="padding:6px 10px; width:90px; text-align:center">Заявки</th>
              <th style="padding:6px 10px; width:90px; text-align:center">Статус</th>
              <th style="padding:6px 10px; width:140px; text-align:right">Действия</th>
            </tr>
          </thead>
          <tbody id="contract_agreements_tbody_${c.id}">
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openEditAgreementModal(contractId, agreementId) {
  var c = (S.contracts || []).find(function(x) { return String(x.id) === String(contractId); }) || window._activeContract;
  if (!c || !c.agreements) return;
  var ag = c.agreements.find(function(x) { return String(x.id) === String(agreementId); });
  if (!ag) return;

  var backdrop = document.getElementById('contract_agreement_modal_backdrop');
  var modal = document.getElementById('contract_agreement_modal');
  if (!backdrop || !modal) return;

  modal.innerHTML = `
    <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:#fafafa">
      <div>
        <div style="font-size:.72rem; text-transform:uppercase; font-weight:700; color:var(--text-3)">Редактирование дополнительного соглашения</div>
        <h3 style="margin:2px 0 0; font-size:1.1rem; font-weight:700">${escHtml(ag.agreement_code || 'ДС')} — ${escHtml(ag.city || ag.region)}</h3>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="closeAgreementModal()" style="font-size:1.2rem; line-height:1">&times;</button>
    </div>

    <form id="edit_agreement_form" onsubmit="event.preventDefault(); submitEditAgreement(${contractId}, ${agreementId})" style="padding:20px">
      <div style="display:flex; flex-direction:column; gap:12px">
        <div style="display:grid; grid-template-columns:1fr 2fr; gap:12px">
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Код ДС</label>
            <input type="text" id="ag_field_code" value="${escHtml(ag.agreement_code || '')}" style="width:100%" required>
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Регион / Город</label>
            <input type="text" id="ag_field_region" value="${escHtml(ag.city || ag.region || '')}" style="width:100%" required>
          </div>
        </div>

        <div>
          <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Номер Сбербанка (внешний № контракта)</label>
          <input type="text" id="ag_field_ext_num" value="${escHtml(ag.external_number || '')}" placeholder="Например: 50005595376" style="width:100%; font-family:monospace">
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Региональная цена / тариф (₽)</label>
            <input type="number" id="ag_field_price_unit" step="0.01" value="${ag.price_unit || ''}" placeholder="0.00" style="width:100%; font-weight:700; color:var(--green)">
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Лимит по ДС (₽)</label>
            <input type="number" id="ag_field_amount" step="0.01" value="${ag.amount || ''}" placeholder="0.00" style="width:100%">
          </div>
        </div>

        <div>
          <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Примечание по региону</label>
          <textarea id="ag_field_comment" rows="2" style="width:100%">${escHtml(ag.comment || '')}</textarea>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; padding-top:12px; border-top:1px solid var(--border)">
        ${(S.user && (S.user.role === 'admin' || S.user.role === 'director')) ? `
          <button type="button" class="btn btn-sm btn-ghost" onclick="deleteAgreement(${contractId}, ${agreementId})" style="color:var(--red)">
            🗑️ Удалить ДС
          </button>
        ` : '<div></div>'}
        <div style="display:flex; gap:8px">
          <button type="button" class="btn btn-sm btn-ghost" onclick="closeAgreementModal()">Отмена</button>
          <button type="submit" class="btn btn-sm btn-primary">Сохранить</button>
        </div>
      </div>
    </form>
  `;

  backdrop.style.display = 'flex';
}

function submitEditAgreement(contractId, agreementId) {
  var code = (document.getElementById('ag_field_code').value || '').trim();
  var region = (document.getElementById('ag_field_region').value || '').trim();
  var extNum = (document.getElementById('ag_field_ext_num').value || '').trim();
  var priceUnit = document.getElementById('ag_field_price_unit').value;
  var amount = document.getElementById('ag_field_amount').value;
  var comment = (document.getElementById('ag_field_comment').value || '').trim();

  api('/contracts/agreements/' + agreementId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agreement_code: code,
      region: region,
      city: region,
      external_number: extNum,
      price_unit: priceUnit,
      amount: amount,
      comment: comment
    })
  }).then(function(updatedAg) {
    closeAgreementModal();
    var c = (S.contracts || []).find(function(x) { return String(x.id) === String(contractId); });
    if (c && c.agreements) {
      var idx = c.agreements.findIndex(function(x) { return String(x.id) === String(agreementId); });
      if (idx !== -1) {
        c.agreements[idx] = updatedAg;
      }
    }
    if (window._activeContract && String(window._activeContract.id) === String(contractId)) {
      var idx2 = (window._activeContract.agreements || []).findIndex(function(x) { return String(x.id) === String(agreementId); });
      if (idx2 !== -1) {
        window._activeContract.agreements[idx2] = updatedAg;
      }
    }
    renderContractsTable();
    if (window._activeContract && document.getElementById('contract_detail_modal_backdrop') && document.getElementById('contract_detail_modal_backdrop').style.display === 'flex') {
      openContractModal(contractId, 'agreements');
    }
    if (typeof showToast === 'function') showToast('✅ Данные ДС сохранены', 'success');
  }).catch(function(err) {
    alert('Ошибка сохранения ДС: ' + err.message);
  });
}

function closeAgreementModal() {
  var backdrop = document.getElementById('contract_agreement_modal_backdrop');
  if (backdrop) backdrop.style.display = 'none';
}

function openAddAgreementModal(contractId) {
  var c = (S.contracts || []).find(function(x) { return String(x.id) === String(contractId); }) || window._activeContract;
  if (!c) return;

  var backdrop = document.getElementById('contract_agreement_modal_backdrop');
  var modal = document.getElementById('contract_agreement_modal');
  if (!backdrop || !modal) return;

  modal.innerHTML = `
    <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:#fafafa">
      <div>
        <div style="font-size:.72rem; text-transform:uppercase; font-weight:700; color:var(--text-3)">Добавление допсоглашения</div>
        <h3 style="margin:2px 0 0; font-size:1.1rem; font-weight:700">Новое ДС к договору Вн. № ${escHtml(c.internal_number || '—')}</h3>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="closeAgreementModal()" style="font-size:1.2rem; line-height:1">&times;</button>
    </div>

    <form id="add_agreement_form" onsubmit="event.preventDefault(); submitAddAgreement(${contractId})" style="padding:20px">
      <div style="display:flex; flex-direction:column; gap:12px">
        <div>
          <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Регион / Город *</label>
          <input type="text" id="add_ag_region" placeholder="Например: Иркутск" style="width:100%" required>
        </div>

        <div>
          <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Номер Сбербанка (внешний № контракта)</label>
          <input type="text" id="add_ag_ext_num" placeholder="Например: 50005595399" style="width:100%; font-family:monospace">
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Региональная цена (₽)</label>
            <input type="number" id="add_ag_price_unit" step="0.01" placeholder="0.00" style="width:100%; font-weight:700; color:var(--green)">
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Лимит по ДС (₽)</label>
            <input type="number" id="add_ag_amount" step="0.01" placeholder="0.00" style="width:100%">
          </div>
        </div>

        <div>
          <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Примечание</label>
          <textarea id="add_ag_comment" rows="2" style="width:100%"></textarea>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px; padding-top:12px; border-top:1px solid var(--border)">
        <button type="button" class="btn btn-sm btn-ghost" onclick="closeAgreementModal()">Отмена</button>
        <button type="submit" class="btn btn-sm btn-primary">Добавить ДС</button>
      </div>
    </form>
  `;

  backdrop.style.display = 'flex';
}

function submitAddAgreement(contractId) {
  var region = (document.getElementById('add_ag_region').value || '').trim();
  var extNum = (document.getElementById('add_ag_ext_num').value || '').trim();
  var priceUnit = document.getElementById('add_ag_price_unit').value;
  var amount = document.getElementById('add_ag_amount').value;
  var comment = (document.getElementById('add_ag_comment').value || '').trim();

  api('/contracts/' + contractId + '/agreements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      region: region,
      city: region,
      external_number: extNum,
      price_unit: priceUnit,
      amount: amount,
      comment: comment
    })
  }).then(function(newAg) {
    closeAgreementModal();
    window._openContractAgreements = window._openContractAgreements || new Set();
    window._openContractAgreements.add(contractId);

    var c = (S.contracts || []).find(function(x) { return String(x.id) === String(contractId); });
    if (c) {
      c.agreements = c.agreements || [];
      c.agreements.push(newAg);
    }
    if (window._activeContract && String(window._activeContract.id) === String(contractId)) {
      window._activeContract.agreements = window._activeContract.agreements || [];
      window._activeContract.agreements.push(newAg);
    }
    renderContractsTable();
    if (window._activeContract && document.getElementById('contract_detail_modal_backdrop') && document.getElementById('contract_detail_modal_backdrop').style.display === 'flex') {
      openContractModal(contractId, 'agreements');
    }
    if (typeof showToast === 'function') showToast('✅ Дополнительное соглашение добавлено', 'success');
  }).catch(function(err) {
    alert('Ошибка добавления ДС: ' + err.message);
  });
}

function deleteAgreement(contractId, agreementId) {
  if (!confirm('Вы уверены, что хотите удалить это дополнительное соглашение? Связанные заявки будут отвязаны от ДС.')) return;

  api('/contracts/agreements/' + agreementId, {
    method: 'DELETE'
  }).then(function() {
    closeAgreementModal();
    var c = (S.contracts || []).find(function(x) { return String(x.id) === String(contractId); });
    if (c && c.agreements) {
      c.agreements = c.agreements.filter(function(x) { return String(x.id) !== String(agreementId); });
    }
    if (window._activeContract && window._activeContract.agreements) {
      window._activeContract.agreements = window._activeContract.agreements.filter(function(x) { return String(x.id) !== String(agreementId); });
    }
    renderContractsTable();
    if (window._activeContract && document.getElementById('contract_detail_modal_backdrop') && document.getElementById('contract_detail_modal_backdrop').style.display === 'flex') {
      openContractModal(contractId, 'agreements');
    }
    if (typeof showToast === 'function') showToast('Дополнительное соглашение удалено', 'info');
  }).catch(function(err) {
    alert('Ошибка удаления ДС: ' + err.message);
  });
}

function renderContractTabTasks(c, tasks) {
  var headerHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px">
      <div style="display:flex; align-items:center; gap:8px">
        <span style="font-weight:700; font-size:.95rem">Связанные заявки и объекты</span>
        <span class="badge ${tasks.length ? 'b-blue' : 'b-gray'}" style="font-size:.75rem">${tasks.length}</span>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn btn-sm btn-outline" onclick="openLinkTaskToContractModal(${c.id})" style="display:inline-flex; align-items:center; gap:5px; font-weight:600" title="Выбрать и привязать существующую в системе заявку к этому договору">
          🔗 Привязать заявку
        </button>
        <button class="btn btn-sm btn-outline" onclick="goToScenario3WithContract(${c.id})" title="Создать через Сценарий 3 с загрузкой PDF или схемы" style="display:inline-flex; align-items:center; gap:5px">
          ✨ Создать через ИИ / PDF
        </button>
        <button class="btn btn-sm" onclick="openCreateTaskForContractModal(${c.id})" style="background:var(--blue); color:#fff; display:inline-flex; align-items:center; gap:5px; font-weight:600">
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
          Вы можете привязать уже заведенную ранее заявку или создать новую — основные реквизиты договора заполнятся автоматически.
        </div>
        <div style="margin-top:16px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap">
          <button class="btn btn-outline" onclick="openLinkTaskToContractModal(${c.id})" style="display:inline-flex; align-items:center; gap:6px; font-weight:600">
            🔗 Привязать существующую заявку
          </button>
          <button class="btn" onclick="openCreateTaskForContractModal(${c.id})" style="background:var(--blue); color:#fff; display:inline-flex; align-items:center; gap:6px; font-weight:600">
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
        <td style="padding:8px 10px; text-align:center" onclick="event.stopPropagation()">
          <button class="btn btn-xs btn-ghost" title="Отвязать заявку от договора" onclick="unlinkTaskFromContractPrompt('${escHtml(t.id)}', ${c.id})" style="color:var(--text-3); font-size:.85rem; padding:2px 6px">
            ✕
          </button>
        </td>
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
            <th style="width:36px; text-align:center" title="Отвязать от договора"></th>
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
  if (modalBackdrop) {
    modalBackdrop.style.display = 'none';
    modalBackdrop.classList.remove('is-floating');
  }
  if (typeof window.restorePageScroll === 'function') window.restorePageScroll();
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

/**
 * Модальное окно добавления материалов к договору (Проводник vs Браузер)
 */
function openAddContractMaterialsModal(contractId) {
  var c = (S.contracts || []).find(function(x) { return x.id === contractId; });
  if (!c && window._activeContract && window._activeContract.id === contractId) {
    c = window._activeContract;
  }
  if (!c) {
    showToast('Договор не найден', 'error');
    return;
  }

  var backdrop = document.getElementById('contract_materials_modal_backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'contract_materials_modal_backdrop';
    backdrop.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:10002; align-items:center; justify-content:center; padding:16px';
    backdrop.onclick = function(e) { if (e.target === backdrop) closeAddContractMaterialsModal(); };
    backdrop.innerHTML = '<div id="contract_materials_modal" class="card" style="width:100%; max-width:640px; background:#fff; border-radius:12px; box-shadow:0 20px 45px rgba(0,0,0,0.3); overflow:hidden"></div>';
    document.body.appendChild(backdrop);
  }

  var modal = document.getElementById('contract_materials_modal');
  if (!modal) return;

  var cleanNum = typeof cleanContractNumber === 'function' ? cleanContractNumber(c.contract_number) : (c.contract_number || '');
  var numBadge = cleanNum ? ('№ ' + escHtml(cleanNum)) : ('Вн. № ' + escHtml(c.internal_number || c.id));

  modal.innerHTML = `
    <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:#fafafa">
      <div>
        <div style="display:flex; align-items:center; gap:8px">
          <span style="font-weight:700; font-size:1.05rem">➕ Добавить материалы к договору</span>
          <span class="badge b-gray" style="font-weight:700; font-size:.8rem">${numBadge}</span>
        </div>
        <div style="font-size:.78rem; color:var(--text-3); margin-top:2px">
          Выберите источник: файлы на ПК / папке Seafile или веб-ссылка на облако
        </div>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="closeAddContractMaterialsModal()" style="font-size:1.3rem; line-height:1; color:var(--text-3)">&times;</button>
    </div>

    <div style="padding:20px; display:flex; flex-direction:column; gap:16px">
      <!-- ВАРИАНТ 1: ПРОВОДНИК -->
      <div style="border:1.5px solid #bfdbfe; background:#f0f7ff; border-radius:10px; padding:16px">
        <div style="display:flex; align-items:flex-start; gap:12px">
          <div style="font-size:2rem; line-height:1">📁</div>
          <div style="flex:1">
            <div style="font-weight:700; font-size:.95rem; color:#1e40af">1. Проводник (Файлы с компьютера / папки Seafile)</div>
            <div style="font-size:.8rem; color:#3b82f6; margin-top:4px; line-height:1.4">
              Загрузить локальные файлы (ТЗ, сметы, спецификации, схемы, акты, сканы договоров) из любой папки ПК или синхронизированной папки Seafile.
            </div>
            <div style="margin-top:12px">
              <button class="btn btn-primary" onclick="closeAddContractMaterialsModal(); triggerContractAttachmentUpload(${c.id})" style="display:inline-flex; align-items:center; gap:8px; font-weight:600; padding:8px 16px; background:#2563eb; color:#fff; border-radius:7px; box-shadow:0 1px 3px rgba(37,99,235,0.3)">
                📂 Открыть Проводник и выбрать файлы
              </button>
            </div>
            <div style="font-size:.72rem; color:var(--text-3); margin-top:8px">
              💡 Можно также перетаскивать файлы мышью (Drag & Drop) в окно карточки договора
            </div>
          </div>
        </div>
      </div>

      <!-- ВАРИАНТ 2: БРАУЗЕР -->
      <div style="border:1.5px solid #fed7aa; background:#fffaf5; border-radius:10px; padding:16px">
        <div style="display:flex; align-items:flex-start; gap:12px">
          <div style="font-size:2rem; line-height:1">🌐</div>
          <div style="flex:1">
            <div style="font-weight:700; font-size:.95rem; color:#9a3412">2. Браузер (Веб-ссылка на папку Seafile / Облако)</div>
            <div style="font-size:.8rem; color:#c2410c; margin-top:4px; line-height:1.4">
              Укажите прямую веб-ссылку на сетевую папку договора в браузере (Seafile, Яндекс.Диск, Google Drive). Кнопка ссылки появится в шапке карточки договора.
            </div>
            <div style="margin-top:12px; display:flex; flex-direction:column; gap:8px">
              <input type="text" id="modal_contract_cloud_url_input_${c.id}" 
                     value="${escHtml(c.cloud_url || '')}" 
                     placeholder="https://seafile... или https://disk.yandex.ru/..." 
                     style="width:100%; padding:9px 12px; border:1px solid #fdba74; border-radius:7px; font-size:.85rem; background:#fff"
                     onkeydown="if(event.key==='Enter'){ event.preventDefault(); saveContractCloudUrlModal(${c.id}); }">
              
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
                <button class="btn btn-sm" onclick="saveContractCloudUrlModal(${c.id})" style="background:#ea580c; color:#fff; font-weight:600; padding:7px 14px; border-radius:6px">
                  💾 Сохранить ссылку
                </button>
                ${c.cloud_url ? `
                  <a href="${escHtml(c.cloud_url)}" target="_blank" class="btn btn-sm btn-ghost" style="border:1px solid #fdba74; color:#c2410c; text-decoration:none; display:inline-flex; align-items:center; gap:4px">
                    🔗 Открыть в браузере
                  </a>
                  <button class="btn btn-sm btn-ghost" onclick="clearContractCloudUrlModal(${c.id})" style="color:#ef4444; font-size:.8rem">
                    Удалить ссылку
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style="padding:12px 20px; border-top:1px solid var(--border); background:#fafafa; display:flex; justify-content:flex-end">
      <button class="btn btn-sm btn-ghost" onclick="closeAddContractMaterialsModal()">Закрыть</button>
    </div>
  `;

  backdrop.style.display = 'flex';
  var inp = document.getElementById('modal_contract_cloud_url_input_' + c.id);
  if (inp && !c.cloud_url) {
    setTimeout(function() { inp.focus(); }, 150);
  }
}

function closeAddContractMaterialsModal() {
  var el = document.getElementById('contract_materials_modal_backdrop');
  if (el) el.style.display = 'none';
}

function saveContractCloudUrlModal(id) {
  var inp = document.getElementById('modal_contract_cloud_url_input_' + id);
  var newUrl = inp ? inp.value.trim() : '';

  api('/contracts/' + id, {
    method: 'PUT',
    body: JSON.stringify({ cloud_url: newUrl })
  }).then(function(res) {
    if (res && res.error) {
      showToast('Ошибка: ' + res.error, 'error');
    } else {
      showToast(newUrl ? 'Ссылка на облако сохранена' : 'Ссылка очищена', 'success');
      var c = S.contracts ? S.contracts.find(function(x){ return x.id === id; }) : null;
      if (c) c.cloud_url = newUrl;
      if (window._activeContract && window._activeContract.id === id) {
        window._activeContract.cloud_url = newUrl;
      }
      closeAddContractMaterialsModal();
      fetchContracts();
      var modalBackdrop = document.getElementById('contract_detail_modal_backdrop');
      if (modalBackdrop && modalBackdrop.style.display !== 'none') {
        openContractModal(id, 'main');
      }
    }
  }).catch(function(err) {
    showToast('Ошибка: ' + err.message, 'error');
  });
}

function clearContractCloudUrlModal(id) {
  if (!confirm('Удалить сохраненную ссылку на облако?')) return;
  var inp = document.getElementById('modal_contract_cloud_url_input_' + id);
  if (inp) inp.value = '';
  saveContractCloudUrlModal(id);
}

function promptCloudUrl(id) {
  // Перенаправляем на удобное модальное окно выбора материалов
  openAddContractMaterialsModal(id);
  return;

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
  if (id && typeof window.savePageScroll === 'function') window.savePageScroll('contract_row_' + id);
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
    <div class="modal-header" style="padding:20px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center">
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
  if (modalBackdrop) {
    modalBackdrop.style.display = 'none';
    modalBackdrop.classList.remove('is-floating');
  }
  if (typeof window.restorePageScroll === 'function') window.restorePageScroll();
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
          if (contractId && typeof window.savePageScroll === 'function') window.savePageScroll('contract_row_' + contractId);
          closeContractFormModal();
          fetchContracts();
          openContractModal(contractId, 'main');
        }).catch(function(err) {
          console.error(err);
          showToast('Договор сохранен, но произошла ошибка при загрузке файлов', 'warning');
          if (contractId && typeof window.savePageScroll === 'function') window.savePageScroll('contract_row_' + contractId);
          closeContractFormModal();
          fetchContracts();
          openContractModal(contractId, 'main');
        });
      } else {
        showToast(isEdit ? 'Договор успешно обновлен' : 'Договор создан', 'success');
        if (contractId && typeof window.savePageScroll === 'function') window.savePageScroll('contract_row_' + contractId);
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

function loadLeafletLib(cb) {
  if (window.L) {
    cb();
    return;
  }
  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(css);

  var s = document.createElement('script');
  s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  s.onload = cb;
  document.head.appendChild(s);
}

function buildAgreementPopupHtml(c, ag) {
  var agCode = ag.agreement_code || ('ДС-' + ag.agreement_number);
  var cityLabel = ag.city || ag.region || 'Регион';
  var priceText = (ag.price_unit && Number(ag.price_unit) > 0) ? fmtMoney(ag.price_unit) : 'не задана';
  var tasksCount = ag.linked_tasks_count || 0;
  var statusBadge = escHtml(ag.status || 'active');

  return `
    <div style="font-family:sans-serif; min-width:190px; padding:2px">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:8px">
        <span style="font-weight:800; color:#1d4ed8; font-size:.9rem">${escHtml(agCode)}</span>
        <span style="font-size:.7rem; background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:600; text-transform:uppercase">${statusBadge}</span>
      </div>
      <div style="font-weight:700; font-size:.88rem; color:#0f172a; margin-bottom:4px">
        📍 ${escHtml(cityLabel)}
      </div>
      ${ag.external_number ? `<div style="font-size:.74rem; color:#64748b; margin-bottom:4px">Сбербанк: <b>${escHtml(ag.external_number)}</b></div>` : ''}
      <div style="font-size:.8rem; margin-bottom:3px">
        💰 Тариф: <b>${priceText}</b>
      </div>
      ${ag.amount && Number(ag.amount) > 0 ? `<div style="font-size:.78rem; color:#475569; margin-bottom:3px">Лимит: <b>${fmtMoney(ag.amount)}</b></div>` : ''}
      <div style="font-size:.78rem; color:#475569; margin-bottom:8px">
        📋 Заявок: <b>${tasksCount}</b>
      </div>
      <div style="display:flex; gap:6px; border-top:1px solid #e2e8f0; padding-top:6px">
        <button type="button" class="btn btn-xs" style="background:#2563eb; color:#fff; font-size:.72rem; padding:3px 8px; border:none; border-radius:4px; cursor:pointer; font-weight:600" 
                onclick="closeContractModal(); openCreateTaskForContractModal(${c.id}, ${ag.id})">+ Заявка</button>
        <button type="button" class="btn btn-xs" style="background:#f8fafc; color:#1e293b; font-size:.72rem; padding:3px 8px; border:1px solid #cbd5e1; border-radius:4px; cursor:pointer" 
                onclick="openEditAgreementModal(${c.id}, ${ag.id})">✏️ Изменить</button>
      </div>
    </div>
  `;
}

function initContractMap(c) {
  var mapElId = 'contract_leafmap_' + c.id;
  var el = document.getElementById(mapElId);
  if (!el) return;

  var validAgreements = (c.agreements || []).filter(function(ag) {
    return ag.geo_lat && ag.geo_lon && !isNaN(Number(ag.geo_lat)) && !isNaN(Number(ag.geo_lon));
  });

  // Если есть соглашения с координатами - строим карту со всеми точками
  if (validAgreements.length > 0) {
    loadLeafletLib(function() {
      el.innerHTML = '';
      if (window._activeContractMap) {
        try { window._activeContractMap.remove(); } catch(_) {}
      }

      var map = L.map(el);
      window._activeContractMap = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);

      window._contractMainMarkersMap = window._contractMainMarkersMap || {};
      window._contractMainMarkersMap[c.id] = {};

      var bounds = [];
      validAgreements.forEach(function(ag) {
        var lat = parseFloat(ag.geo_lat);
        var lng = parseFloat(ag.geo_lon);
        bounds.push([lat, lng]);

        var marker = L.marker([lat, lng]).addTo(map);
        marker.bindPopup(buildAgreementPopupHtml(c, ag));
        window._contractMainMarkersMap[c.id][ag.id] = marker;
      });

      window._contractMainBounds = window._contractMainBounds || {};
      window._contractMainBounds[c.id] = bounds;

      if (bounds.length === 1) {
        map.setView(bounds[0], 12);
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [25, 25] });
      }

      setTimeout(function() { map.invalidateSize(); }, 200);
    });
    return;
  }

  // Если допсоглашений нет - работаем по одиночному адресу/городу
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

  var firstCityCandidate = '';
  if (mapAddr.includes(',') || mapAddr.includes(';')) {
    firstCityCandidate = mapAddr.split(/[,;\n]/)[0].replace(/и ещё.*/i, '').trim();
  }

  var queries = [];
  if (firstCityCandidate && firstCityCandidate !== mapAddr) {
    queries.push('Россия, ' + cleanAddr(firstCityCandidate));
  }
  queries.push('Россия, ' + (c.our_entity_region ? c.our_entity_region + ', ' : '') + cleanAddr(mapAddr));
  queries.push('Россия, ' + cleanAddr(mapAddr));
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

  loadLeafletLib(renderLeaflet);
}

function initContractAgreementsMap(c) {
  var mapElId = 'contract_agreements_leafmap_' + c.id;
  var el = document.getElementById(mapElId);
  if (!el) return;

  var validAgreements = (c.agreements || []).filter(function(ag) {
    return ag.geo_lat && ag.geo_lon && !isNaN(Number(ag.geo_lat)) && !isNaN(Number(ag.geo_lon));
  });

  if (!validAgreements.length) {
    el.innerHTML = '<div style="text-align:center;padding:1.5rem;color:#888">Координаты для соглашений не найдены</div>';
    return;
  }

  loadLeafletLib(function() {
    el.innerHTML = '';
    if (window._activeAgreementsMap) {
      try { window._activeAgreementsMap.remove(); } catch(_) {}
    }

    var map = L.map(el);
    window._activeAgreementsMap = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);

    window._contractAgreementsMarkersMap = window._contractAgreementsMarkersMap || {};
    window._contractAgreementsMarkersMap[c.id] = {};

    var bounds = [];
    validAgreements.forEach(function(ag) {
      var lat = parseFloat(ag.geo_lat);
      var lng = parseFloat(ag.geo_lon);
      bounds.push([lat, lng]);

      var marker = L.marker([lat, lng]).addTo(map);
      marker.bindPopup(buildAgreementPopupHtml(c, ag));
      window._contractAgreementsMarkersMap[c.id][ag.id] = marker;
    });

    window._contractAgreementsBounds = window._contractAgreementsBounds || {};
    window._contractAgreementsBounds[c.id] = bounds;

    if (bounds.length === 1) {
      map.setView(bounds[0], 12);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    setTimeout(function() { map.invalidateSize(); }, 200);
  });
}

function focusAgreementOnMap(contractId, agreementId) {
  var mapWrap = document.getElementById('contract_agreements_leafmap_' + contractId);
  if (mapWrap && mapWrap.style.display === 'none') {
    toggleContractAgreementsMap(contractId);
  }

  var map = window._activeAgreementsMap || window._activeContractMap;
  var markersMap = (window._contractAgreementsMarkersMap && window._contractAgreementsMarkersMap[contractId]) || 
                   (window._contractMainMarkersMap && window._contractMainMarkersMap[contractId]);

  if (!map || !markersMap || !markersMap[agreementId]) {
    showToast('Координаты для этого соглашения пока не заданы', 'info');
    return;
  }

  var marker = markersMap[agreementId];
  var latLng = marker.getLatLng();

  map.flyTo(latLng, 11, { duration: 0.8 });
  marker.openPopup();

  // Подсвечиваем строку соглашения в таблице
  var row = document.getElementById('agr_row_' + contractId + '_' + agreementId);
  if (row) {
    row.style.background = '#fef3c7';
    setTimeout(function() {
      row.style.background = '';
    }, 2000);
  }
}

function resetContractAgreementsMap(contractId) {
  var map = window._activeAgreementsMap;
  var bounds = window._contractAgreementsBounds && window._contractAgreementsBounds[contractId];
  if (map && bounds && bounds.length) {
    if (bounds.length === 1) map.setView(bounds[0], 12);
    else map.fitBounds(bounds, { padding: [30, 30] });
  }
}

function toggleContractAgreementsMap(contractId) {
  var el = document.getElementById('contract_agreements_leafmap_' + contractId);
  var btn = document.getElementById('btn_toggle_agreements_map_' + contractId);
  if (!el) return;
  if (el.style.display === 'none') {
    el.style.display = 'block';
    if (btn) btn.textContent = 'Свернуть карту';
    if (window._activeAgreementsMap) {
      setTimeout(function() { window._activeAgreementsMap.invalidateSize(); }, 100);
    }
  } else {
    el.style.display = 'none';
    if (btn) btn.textContent = 'Развернуть карту';
  }
}

function resetContractMainMap(contractId) {
  var map = window._activeContractMap;
  var bounds = window._contractMainBounds && window._contractMainBounds[contractId];
  if (map && bounds && bounds.length) {
    if (bounds.length === 1) map.setView(bounds[0], 12);
    else map.fitBounds(bounds, { padding: [25, 25] });
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
      var modalBackdrop = document.getElementById('contract_detail_modal_backdrop');
      if (modalBackdrop && modalBackdrop.style.display !== 'none' && window._activeContract && window._activeContract.id === contractId) {
        openContractModal(contractId, 'main');
      }
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
window.openAddContractMaterialsModal = openAddContractMaterialsModal;
window.closeAddContractMaterialsModal = closeAddContractMaterialsModal;
window.saveContractCloudUrlModal = saveContractCloudUrlModal;
window.clearContractCloudUrlModal = clearContractCloudUrlModal;
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
function openCreateTaskForContractModal(contractId, agreementId) {
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
        openCreateTaskForContractModal(contractId, agreementId);
      } else {
        alert('Не удалось загрузить данные договора');
      }
    });
    return;
  }

  var selectedAg = null;
  if (agreementId && c.agreements) {
    selectedAg = c.agreements.find(function(a) { return String(a.id) === String(agreementId); });
  }

  var existingCount = (c.linked_tasks && c.linked_tasks.length) ? c.linked_tasks.length : 0;
  var suggestedSuffix = existingCount + 1;
  var prefix = c.internal_number ? (c.internal_number + '-') : (c.contract_number ? (c.contract_number + '-') : 'З-');
  var suggestedId = prefix + suggestedSuffix;

  var todayStr = new Date().toISOString().slice(0, 10);
  var deadlineStr = c.deadline_date ? String(c.deadline_date).slice(0, 10) : '';

  var defaultRegion = selectedAg ? (selectedAg.city || selectedAg.region) : (c.our_entity_region || '');
  var defaultAddress = selectedAg ? (selectedAg.city || selectedAg.region) : (c.delivery_place || '');
  var defaultAmount = selectedAg && Number(selectedAg.price_unit) > 0 ? Number(selectedAg.price_unit) : 0;

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
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
          <span class="badge b-blue" style="font-size:.78rem">Связка с договором</span>
          <span class="badge b-orange" style="font-size:.78rem; font-family:monospace; font-weight:700">Вн. № ${escHtml(c.internal_number || '—')}</span>
          ${c.contract_number ? `<span class="badge b-gray" style="font-size:.78rem">№ ${escHtml(cleanContractNumber(c.contract_number))}</span>` : ''}
          ${selectedAg ? `<span class="badge b-purple" style="font-size:.78rem">📍 ${escHtml(selectedAg.agreement_code || ('ДС-' + selectedAg.agreement_number))} (${escHtml(selectedAg.city || selectedAg.region)})</span>` : ''}
        </div>
        <h3 style="margin:6px 0 0; font-size:1.15rem; font-weight:700">➕ Создание новой заявки / объекта</h3>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="closeCreateTaskForContractModal()" style="font-size:1.3rem; line-height:1; color:var(--text-3)">&times;</button>
    </div>

    <form id="create_contract_task_form" onsubmit="event.preventDefault(); submitCreateTaskForContract(${c.id})" style="padding:20px 24px">
      <input type="hidden" id="ct_agreement_id" value="${selectedAg ? selectedAg.id : ''}">
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
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Номер заявки (ID) * ${(typeof getHintIcon === 'function') ? getHintIcon('number') : ''}</label>
            <input type="text" id="ct_id" value="${escHtml(suggestedId)}" required style="width:100%; font-weight:700; border-color:var(--orange)">
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">№ ВСП / Объекта ${(typeof getHintIcon === 'function') ? getHintIcon('vsp') : ''}</label>
            <input type="text" id="ct_vsp" placeholder="Например: ВСП 0128" style="width:100%">
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Заказчик (Организация) ${(typeof getHintIcon === 'function') ? getHintIcon('customer') : ''}</label>
            <select id="ct_customer" style="width:100%">
              ${custOptions.map(function(opt) {
                var isSel = (opt.toLowerCase().trim() === (c.customer_name || '').toLowerCase().trim()) ? 'selected' : '';
                return `<option value="${escHtml(opt)}" ${isSel}>${escHtml(opt)}</option>`;
              }).join('')}
            </select>
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Регион ${(typeof getHintIcon === 'function') ? getHintIcon('region') : ''}</label>
            <input type="text" id="ct_region" value="${escHtml(defaultRegion)}" placeholder="Регион проведения работ" style="width:100%">
          </div>
        </div>

        <div>
          <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Адрес объекта ${(typeof getHintIcon === 'function') ? getHintIcon('address') : ''}</label>
          <input type="text" id="ct_address" value="${escHtml(defaultAddress)}" placeholder="Точный адрес объекта" style="width:100%">
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Вид работ ${(typeof getHintIcon === 'function') ? getHintIcon('workType') : ''}</label>
            <input type="text" id="ct_work_type" value="${escHtml(c.contract_type_summary || '')}" placeholder="СМР / СКС / Видеонаблюдение..." style="width:100%">
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Куратор / Менеджер заказчика ${(typeof getHintIcon === 'function') ? getHintIcon('manager') : ''}</label>
            <input type="text" id="ct_manager" value="${escHtml(c.manager_name ? (c.manager_name + (c.contacts_raw ? ' (' + c.contacts_raw + ')' : '')) : (c.contacts_raw || ''))}" placeholder="ФИО / Контакты куратора" style="width:100%">
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px">
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Сумма заявки (₽) ${(typeof getHintIcon === 'function') ? getHintIcon('amount') : ''}</label>
            <input type="number" id="ct_amount" value="${defaultAmount || 0}" style="width:100%">
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Дата заявки</label>
            <input type="date" id="ct_date_zayavki" value="${escHtml(todayStr)}" style="width:100%">
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Дедлайн (план) ${(typeof getHintIcon === 'function') ? getHintIcon('deadline') : ''}</label>
            <input type="date" id="ct_deadline" value="${escHtml(deadlineStr)}" style="width:100%">
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">Ссылка на облако / диск ${(typeof getHintIcon === 'function') ? getHintIcon('materialsLink') : ''}</label>
            <input type="url" id="ct_tech_link" value="${escHtml(c.cloud_url || '')}" placeholder="https://..." style="width:100%">
          </div>
          <div>
            <label class="fw6" style="font-size:.75rem; display:block; margin-bottom:4px">В заказе (портов/ед.) ${(typeof getHintIcon === 'function') ? getHintIcon('inOrder') : ''}</label>
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

  var agIdEl = document.getElementById('ct_agreement_id');
  var agId = (agIdEl && agIdEl.value) ? parseInt(agIdEl.value, 10) : null;

  var data = {
    id:                   idEl.value.trim(),
    contractId:           contractId,
    contract_id:          contractId,
    contractAgreementId:  agId,
    contract_agreement_id: agId,
    vsp:                  document.getElementById('ct_vsp').value.trim(),
    customer:             document.getElementById('ct_customer').value,
    region:               document.getElementById('ct_region').value.trim(),
    address:              document.getElementById('ct_address').value.trim(),
    workType:             document.getElementById('ct_work_type').value.trim(),
    manager:              document.getElementById('ct_manager').value.trim(),
    amount:               document.getElementById('ct_amount').value,
    dateZayavki:          document.getElementById('ct_date_zayavki').value,
    deadline:             document.getElementById('ct_deadline').value,
    techLink:             document.getElementById('ct_tech_link').value.trim(),
    inOrder:              document.getElementById('ct_in_order').value,
    comment:              document.getElementById('ct_comment').value.trim()
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

/**
 * =========================================================================
 * ПРИВЯЗКА СУЩЕСТВУЮЩИХ ЗАЯВОК К ДОГОВОРУ
 * =========================================================================
 */

var _linkTaskSearchTimeout = null;
window._activeLinkContractId = null;
window._availableTasksCache = [];

function ensureLinkTaskModalInDOM() {
  if (!document.getElementById('contract_link_task_modal_backdrop')) {
    var div = document.createElement('div');
    div.id = 'contract_link_task_modal_backdrop';
    div.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:10002; align-items:center; justify-content:center; padding:16px';
    div.onclick = function(e) { if (e.target === div) closeLinkTaskToContractModal(); };
    div.innerHTML = '<div id="contract_link_task_modal" class="card" style="width:100%; max-width:820px; max-height:90vh; display:flex; flex-direction:column; background:#fff; border-radius:12px; box-shadow:0 20px 45px rgba(0,0,0,0.3); overflow:hidden; position:relative"></div>';
    document.body.appendChild(div);
  }
}

function openLinkTaskToContractModal(contractId) {
  ensureLinkTaskModalInDOM();
  var backdrop = document.getElementById('contract_link_task_modal_backdrop');
  var modal = document.getElementById('contract_link_task_modal');
  if (!backdrop || !modal) return;

  window._activeLinkContractId = contractId;

  var c = (window._activeContract && String(window._activeContract.id) === String(contractId))
    ? window._activeContract
    : ((S.contracts || []).find(function(x) { return String(x.id) === String(contractId); }));

  if (!c) {
    api('/contracts/' + contractId).then(function(res) {
      if (res && !res.error) {
        window._activeContract = res;
        openLinkTaskToContractModal(contractId);
      } else {
        alert('Не удалось загрузить данные договора');
      }
    });
    return;
  }

  backdrop.style.display = 'flex';
  modal.innerHTML = `
    <div style="padding:18px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:#fafafa">
      <div>
        <div style="display:flex; align-items:center; gap:8px">
          <span class="badge b-blue" style="font-size:.78rem">Связка с договором</span>
          <span class="badge b-orange" style="font-size:.78rem; font-family:monospace; font-weight:700">Вн. № ${escHtml(c.internal_number || '—')}</span>
          ${c.contract_number ? `<span class="badge b-gray" style="font-size:.78rem">№ ${escHtml(cleanContractNumber(c.contract_number))}</span>` : ''}
        </div>
        <h3 style="margin:6px 0 0; font-size:1.15rem; font-weight:700">🔗 Привязка существующей заявки к договору</h3>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="closeLinkTaskToContractModal()" style="font-size:1.3rem; line-height:1; color:var(--text-3)">&times;</button>
    </div>

    <!-- ИНФО-ПАРАМЕТРЫ ДОГОВОРА -->
    <div style="background:#f8fafc; border-bottom:1px solid var(--border); padding:12px 24px; font-size:.83rem; display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px">
      <div>
        <div style="font-size:.68rem; text-transform:uppercase; font-weight:700; color:var(--text-3)">🏛️ Заказчик</div>
        <div style="font-weight:600; color:var(--text); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis" title="${escHtml(c.customer_name || '')}">
          ${escHtml(c.customer_name || 'Не указан')}
        </div>
      </div>
      <div>
        <div style="font-size:.68rem; text-transform:uppercase; font-weight:700; color:var(--text-3)">📍 Объект / Регион</div>
        <div style="font-weight:600; color:var(--text); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis" title="${escHtml(c.delivery_place || c.our_entity_region || '')}">
          ${escHtml(c.delivery_place || c.our_entity_region || '—')}
        </div>
      </div>
      <div>
        <div style="font-size:.68rem; text-transform:uppercase; font-weight:700; color:var(--text-3)">💰 Сумма договора</div>
        <div style="font-weight:700; color:var(--blue); margin-top:2px">${fmtMoney(c.amount)}</div>
      </div>
    </div>

    <!-- ПОИСКОВАЯ СТРОКА -->
    <div style="padding:14px 24px; border-bottom:1px solid var(--border); background:#fff">
      <div style="position:relative">
        <input type="text" id="link_task_search_inp" 
               placeholder="🔍 Поиск по номеру заявки (#...), адресу, городу или заказчику..." 
               oninput="handleLinkTaskSearchInput(${c.id})" 
               style="width:100%; padding:9px 14px 9px 36px; font-size:.88rem; border:1.5px solid var(--border); border-radius:8px; outline:none; transition:border-color .15s ease">
        <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:1rem; opacity:.5">🔍</span>
      </div>
    </div>

    <!-- СПИСОК ЗАЯВОК (СКРОЛЛИРУЕМЫЙ) -->
    <div id="link_task_modal_list" style="padding:16px 24px; overflow-y:auto; flex:1; max-height:450px; background:#fafafa">
      <div style="padding:2.5rem; text-align:center; color:var(--text-3)">
        <div class="spin" style="margin:0 auto 10px"></div>
        Поиск доступных заявок...
      </div>
    </div>

    <!-- ФУТЕР -->
    <div style="padding:12px 24px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:#fff">
      <div style="font-size:.78rem; color:var(--text-3)">
        Не нашли нужную заявку? Вы можете
        <button class="btn-link" onclick="closeLinkTaskToContractModal(); openCreateTaskForContractModal(${c.id})" style="font-weight:600; color:var(--blue); font-size:.78rem">создать новую заявку по договору</button>
      </div>
      <button class="btn btn-ghost" onclick="closeLinkTaskToContractModal()">Закрыть</button>
    </div>
  `;

  // Загружаем список доступных заявок
  api('/contracts/' + contractId + '/available-tasks').then(function(tasks) {
    window._availableTasksCache = tasks || [];
    renderLinkTaskModalList(c, window._availableTasksCache, '');
  }).catch(function(err) {
    var listEl = document.getElementById('link_task_modal_list');
    if (listEl) {
      listEl.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--red)">Ошибка загрузки заявок: ${escHtml(err.message)}</div>`;
    }
  });
}

function closeLinkTaskToContractModal() {
  var backdrop = document.getElementById('contract_link_task_modal_backdrop');
  if (backdrop) backdrop.style.display = 'none';
  window._activeLinkContractId = null;
}

function handleLinkTaskSearchInput(contractId) {
  var inp = document.getElementById('link_task_search_inp');
  var q = inp ? inp.value.trim() : '';
  
  clearTimeout(_linkTaskSearchTimeout);
  _linkTaskSearchTimeout = setTimeout(function() {
    var c = window._activeContract;
    if (!c) return;

    var listEl = document.getElementById('link_task_modal_list');
    if (listEl) {
      listEl.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--text-3)"><div class="spin" style="margin:0 auto 8px"></div>Поиск...</div>`;
    }

    api('/contracts/' + contractId + '/available-tasks?q=' + encodeURIComponent(q)).then(function(tasks) {
      renderLinkTaskModalList(c, tasks || [], q);
    }).catch(function(err) {
      if (listEl) {
        listEl.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--red)">Ошибка поиска: ${escHtml(err.message)}</div>`;
      }
    });
  }, 250);
}

function renderLinkTaskModalList(c, tasks, filterQuery) {
  var listEl = document.getElementById('link_task_modal_list');
  if (!listEl) return;

  if (!tasks || !tasks.length) {
    listEl.innerHTML = `
      <div class="card p" style="text-align:center; padding:3rem 1.5rem; background:#fff; border:1px dashed var(--border); border-radius:10px">
        <div style="font-size:2.2rem; margin-bottom:8px">🔍</div>
        <div style="font-weight:700; font-size:1rem; color:var(--text)">Подходящих заявок не найдено</div>
        <div style="font-size:.82rem; color:var(--text-3); margin-top:4px; max-width:440px; margin-left:auto; margin-right:auto">
          ${filterQuery ? 'Попробуйте изменить поисковый запрос или создайте новую заявку с реквизитами этого договора.' : 'В системе нет свободных заявок. Вы можете создать новую:'}
        </div>
        <div style="margin-top:14px">
          <button class="btn btn-sm" onclick="closeLinkTaskToContractModal(); openCreateTaskForContractModal(${c.id})" style="background:var(--blue); color:#fff; font-weight:600">
            ➕ Создать заявку по договору
          </button>
        </div>
      </div>
    `;
    return;
  }

  var cPrefix = c.internal_number ? c.internal_number.trim().toLowerCase() : '';
  var cCust = c.customer_name ? c.customer_name.trim().toLowerCase() : '';

  // Разделяем на рекомендуемые и остальные
  var recommended = [];
  var others = [];

  tasks.forEach(function(t) {
    var tid = String(t.id || '').toLowerCase();
    var tCust = String(t.customer || '').toLowerCase();
    var isRec = (cPrefix && tid.indexOf(cPrefix) !== -1) || 
                (cCust && tCust && (tCust.indexOf(cCust) !== -1 || cCust.indexOf(tCust) !== -1));
    if (isRec) {
      recommended.push(t);
    } else {
      others.push(t);
    }
  });

  function renderItem(t, isRec) {
    var isLinkedOther = !!t.linked_contract_num;
    var otherLabel = t.linked_contract_num || t.linked_contract_official_num || 'другой договор';
    var dDateStr = t.date_zayavki ? new Date(t.date_zayavki).toLocaleDateString('ru-RU') : '';

    return `
      <div class="card" style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; margin-bottom:8px; background:${isRec ? '#f0fdf4' : '#fff'}; border:${isRec ? '1.5px solid #86efac' : '1px solid var(--border)'}; border-radius:10px; transition:box-shadow .15s ease" onmouseover="this.style.boxShadow='0 3px 12px rgba(0,0,0,0.06)'" onmouseout="this.style.boxShadow='none'">
        <div style="flex:1; min-width:0; padding-right:16px">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
            <span style="font-weight:700; font-family:monospace; font-size:.92rem; color:var(--blue)">${escHtml(t.id)}</span>
            <span class="badge b-gray" style="font-size:.72rem">${escHtml(t.work_type || '—')}</span>
            ${stBadge(t.status)}
            ${isRec ? '<span class="badge b-green" style="font-size:.7rem; font-weight:700">✨ Рекомендуется</span>' : ''}
            ${isLinkedOther ? '<span class="badge b-orange" style="font-size:.7rem" title="Заявка уже связана с другим договором">⚠️ В договоре ' + escHtml(otherLabel) + '</span>' : ''}
          </div>

          <div style="font-weight:600; font-size:.85rem; color:var(--text); margin-top:5px; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis" title="${escHtml(t.address || '')}">
            📍 ${escHtml(t.address || 'Адрес не указан')}
          </div>

          <div style="font-size:.76rem; color:var(--text-3); margin-top:4px; display:flex; gap:14px; flex-wrap:wrap; align-items:center">
            ${t.customer ? '<span>🏛️ <b>' + escHtml(t.customer) + '</b></span>' : ''}
            ${t.region ? '<span>🌍 ' + escHtml(t.region) + '</span>' : ''}
            ${dDateStr ? '<span>📅 от ' + escHtml(dDateStr) + '</span>' : ''}
            <span style="color:var(--text); font-weight:700">💰 ' + fmtMoney(t.amount) + '</span>
          </div>
        </div>

        <div style="flex-shrink:0">
          ${isLinkedOther ? `
            <button class="btn btn-sm btn-outline" 
                    onclick="linkTaskToContract('${escHtml(t.id)}', ${c.id}, true, '${escHtml(otherLabel)}')" 
                    style="color:var(--orange); border-color:var(--orange); font-size:.78rem; font-weight:600; display:inline-flex; align-items:center; gap:5px" 
                    title="Заявка привязана к договору ${escHtml(otherLabel)}. Нажмите, чтобы перепривязать к этому.">
              🔄 Перепривязать
            </button>
          ` : `
            <button class="btn btn-sm" 
                    onclick="linkTaskToContract('${escHtml(t.id)}', ${c.id}, false)" 
                    style="background:var(--blue); color:#fff; font-size:.8rem; font-weight:600; display:inline-flex; align-items:center; gap:5px; box-shadow:0 1px 3px rgba(37,99,235,0.25)">
              🔗 Привязать
            </button>
          `}
        </div>
      </div>
    `;
  }

  var html = '';

  if (recommended.length > 0) {
    html += `
      <div style="margin-bottom:14px">
        <div style="font-size:.74rem; text-transform:uppercase; font-weight:700; color:#15803d; margin-bottom:8px; display:flex; align-items:center; gap:6px">
          <span>💡 Рекомендуемые к привязке (${recommended.length})</span>
          <span style="font-size:.7rem; font-weight:normal; color:var(--text-3); text-transform:none">совпадение по номеру или заказчику</span>
        </div>
        ${recommended.map(function(t) { return renderItem(t, true); }).join('')}
      </div>
    `;
  }

  if (others.length > 0) {
    html += `
      <div>
        <div style="font-size:.74rem; text-transform:uppercase; font-weight:700; color:var(--text-2); margin-bottom:8px">
          <span>📋 Все доступные заявки (${others.length})</span>
        </div>
        ${others.map(function(t) { return renderItem(t, false); }).join('')}
      </div>
    `;
  }

  listEl.innerHTML = html;
}

function linkTaskToContract(taskId, contractId, isRebind, oldContractNum) {
  if (isRebind) {
    var msg = 'Заявка ' + taskId + ' сейчас привязана к договору ' + (oldContractNum ? ('№ ' + oldContractNum) : '') + '.\nПерепривязать её к текущему договору?';
    if (!confirm(msg)) return;
  }

  api('/contracts/' + contractId + '/link-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: taskId })
  }).then(function(res) {
    if (res && res.error) {
      alert('Ошибка привязки: ' + res.error);
      return;
    }

    closeLinkTaskToContractModal();
    showToast('✅ Заявка ' + taskId + ' успешно привязана к договору', 'success');

    // Синхронизируем локальное состояние задач
    if (Array.isArray(S.tasks)) {
      var t = S.tasks.find(function(x) { return String(x.id) === String(taskId); });
      if (t) {
        t.contract_id = Number(contractId);
        t.contractId = Number(contractId);
      }
    }

    // Обновляем карточку договора
    openContractModal(contractId, 'tasks');
    fetchContracts();
  }).catch(function(err) {
    alert('Ошибка сети: ' + err.message);
  });
}

function unlinkTaskFromContractPrompt(taskId, contractId) {
  var msg = 'Вы уверены, что хотите отвязать заявку ' + taskId + ' от этого договора?\nЗаявка останется в общем списке заявок, но больше не будет отображаться в этом контракте.';
  if (!confirm(msg)) return;

  api('/contracts/' + contractId + '/unlink-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: taskId })
  }).then(function(res) {
    if (res && res.error) {
      alert('Ошибка: ' + res.error);
      return;
    }

    showToast('Заявка ' + taskId + ' отвязана от договора', 'info');

    // Синхронизируем локальное состояние
    if (Array.isArray(S.tasks)) {
      var t = S.tasks.find(function(x) { return String(x.id) === String(taskId); });
      if (t) {
        t.contract_id = null;
        t.contractId = null;
      }
    }

    // Обновляем карточку договора
    openContractModal(contractId, 'tasks');
    fetchContracts();
  }).catch(function(err) {
    alert('Ошибка сети: ' + err.message);
  });
}

// Экспорт функций в глобальную область
window.openLinkTaskToContractModal = openLinkTaskToContractModal;
window.closeLinkTaskToContractModal = closeLinkTaskToContractModal;
window.handleLinkTaskSearchInput = handleLinkTaskSearchInput;
window.linkTaskToContract = linkTaskToContract;
window.unlinkTaskFromContractPrompt = unlinkTaskFromContractPrompt;
window.openCreateTaskForContractModal = openCreateTaskForContractModal;
window.closeCreateTaskForContractModal = closeCreateTaskForContractModal;
window.initContractAgreementsMap = initContractAgreementsMap;
window.focusAgreementOnMap = focusAgreementOnMap;
window.resetContractAgreementsMap = resetContractAgreementsMap;
window.toggleContractAgreementsMap = toggleContractAgreementsMap;
window.resetContractMainMap = resetContractMainMap;


