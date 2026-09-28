// public/js/pages/contracts.js - Справочник Договоров (Контрактов)

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
            <span>Договоры</span>
            <span id="contracts_total_badge" class="badge b-gray" style="font-size:.78rem; font-weight:600">...</span>
          </h1>
          <div style="font-size:.82rem; color:var(--text-3); margin-top:2px">
            Реестр генеральных договоров с заказчиками, условия, обеспечение и объекты работ
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost" onclick="triggerContractsImport()" title="Импортировать или обновить реестр из Excel файла">
            📥 Импорт реестра
          </button>
          <button class="btn btn-sm" onclick="openContractForm()" title="Создать новый договор вручную">
            + Новый договор
          </button>
        </div>
      </div>

      <!-- ВИДЖЕТЫ СВОДКИ -->
      <div id="contracts_stats_widget" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:1.25rem">
        <div class="card p" style="padding:14px; border-left:4px solid var(--orange)">
          <div style="font-size:.75rem; color:var(--text-3); text-transform:uppercase; font-weight:700">Всего договоров</div>
          <div id="stat_total_count" style="font-size:1.4rem; font-weight:800; color:var(--text); margin-top:4px">—</div>
          <div id="stat_multi_lot" style="font-size:.73rem; color:var(--text-3); margin-top:2px">В т.ч. многолотовых: —</div>
        </div>
        <div class="card p" style="padding:14px; border-left:4px solid var(--green)">
          <div style="font-size:.75rem; color:var(--text-3); text-transform:uppercase; font-weight:700">Сумма портфеля</div>
          <div id="stat_total_amount" style="font-size:1.4rem; font-weight:800; color:var(--green); margin-top:4px">—</div>
          <div style="font-size:.73rem; color:var(--text-3); margin-top:2px">Общий объём контрактов</div>
        </div>
        <div class="card p" style="padding:14px; border-left:4px solid #3b82f6">
          <div style="font-size:.75rem; color:var(--text-3); text-transform:uppercase; font-weight:700">Обеспечение договоров</div>
          <div id="stat_total_security" style="font-size:1.4rem; font-weight:800; color:#3b82f6; margin-top:4px">—</div>
          <div style="font-size:.73rem; color:var(--text-3); margin-top:2px">Замороженные гарантии</div>
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
            <option value="Действует" ${S.contractStatus === 'Действует' ? 'selected' : ''}>🟢 Действует</option>
            <option value="Завершен" ${S.contractStatus === 'Завершен' ? 'selected' : ''}>⚪ Завершен</option>
            <option value="Ожидает оплаты" ${S.contractStatus === 'Ожидает оплаты' ? 'selected' : ''}>🟡 Ожидает оплаты</option>
            <option value="Расторгнут" ${S.contractStatus === 'Расторгнут' ? 'selected' : ''}>🔴 Расторгнут</option>
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
      <div id="contract_detail_modal" class="card" style="width:100%; max-width:920px; max-height:92vh; overflow-y:auto; background:#fff; border-radius:12px; box-shadow:0 20px 40px rgba(0,0,0,0.25); position:relative"></div>
    </div>

    <!-- МОДАЛЬНОЕ ОКНО СОЗДАНИЯ/РЕДАКТИРОВАНИЯ -->
    <div id="contract_form_modal_backdrop" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center; padding:16px" onclick="if(event.target===this) closeContractFormModal()">
      <div id="contract_form_modal" class="card" style="width:100%; max-width:820px; max-height:92vh; overflow-y:auto; background:#fff; border-radius:12px; box-shadow:0 20px 40px rgba(0,0,0,0.25); position:relative"></div>
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

    // Форматирование даты
    var dateFormatted = '—';
    if (c.contract_date) {
      var d = new Date(c.contract_date);
      if (!isNaN(d.getTime())) dateFormatted = d.toLocaleDateString('ru-RU');
    }

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

    // Совмещенный номер
    var numberHtml = `
      <div style="font-weight:700; font-family:monospace; font-size:.9rem; color:var(--text)">
        ${highlight(escHtml(c.internal_number || '—'), S.contractSearch)}
      </div>
      ${c.contract_number ? `
        <div style="font-size:.73rem; color:var(--text-3); margin-top:2px">
          № ${highlight(escHtml(c.contract_number), S.contractSearch)}
        </div>
      ` : ''}
      ${hasLots ? `
        <div style="margin-top:3px">
          <span class="badge b-orange" style="font-size:.65rem; padding:1px 5px">🎯 ${lots.length} лотов</span>
        </div>
      ` : ''}
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
        <td style="padding: 10px 12px; vertical-align:top">${numberHtml}</td>
        <td style="padding: 10px 12px; vertical-align:top; font-size:.82rem; white-space:nowrap">${dateFormatted}</td>
        <td style="padding: 10px 12px; vertical-align:top">${customerHtml}</td>
        <td style="padding: 10px 12px; vertical-align:top">
          <span class="badge ${typeBadgeClass}">${escHtml(type)}</span>
          <div style="margin-top:4px"><span class="badge ${stClass}" style="font-size:.68rem">${escHtml(stText)}</span></div>
        </td>
        <td style="padding: 10px 12px; vertical-align:top">${subjectHtml}</td>
        <td style="padding: 10px 12px; vertical-align:top; font-size:.78rem; color:var(--text-2); max-width:140px">
          ${escHtml(c.deadline_raw || 'По заказам')}
        </td>
        <td style="padding: 10px 12px; vertical-align:top">${amountHtml}</td>
        <td style="padding: 10px 12px; vertical-align:top">${securityHtml}</td>
        <td style="padding: 10px 12px; vertical-align:top">
          <div style="display:flex; flex-direction:column; gap:4px">
            ${linksHtml}
            ${linkedBadge}
          </div>
        </td>
        <td style="padding: 10px 12px; vertical-align:top; text-align:right; white-space:nowrap">
          <button class="btn btn-sm btn-ghost" onclick="openContractModal(${c.id})" title="Просмотр карточки договора">👁️</button>
          <button class="btn btn-sm btn-ghost" onclick="openContractForm(${c.id})" title="Редактировать">✏️</button>
          ${(S.user && (S.user.role === 'admin' || S.user.role === 'director')) ? `
            <button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="deleteContract(${c.id})" title="Удалить">✕</button>
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
            <th style="width:130px">№ Договора</th>
            <th style="width:90px">Дата</th>
            <th style="min-width:190px">Заказчик / Стороны</th>
            <th style="width:140px">О чем договор</th>
            <th style="min-width:220px">Предмет и Место</th>
            <th style="width:120px">Срок работ</th>
            <th style="width:120px">Сумма</th>
            <th style="width:110px">Обеспечение</th>
            <th style="width:110px">Ссылки</th>
            <th style="width:90px"></th>
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

    var lots = [];
    try {
      lots = typeof c.lots === 'string' ? JSON.parse(c.lots) : (c.lots || []);
    } catch(e) {}
    var hasLots = Array.isArray(lots) && lots.length > 0;

    var tasks = c.linked_tasks || [];

    var dDate = c.contract_date ? new Date(c.contract_date).toLocaleDateString('ru-RU') : '—';
    var dEnd = c.deadline_date ? new Date(c.deadline_date).toLocaleDateString('ru-RU') : (c.deadline_raw || 'По заказам');

    // Отрисовываем содержимое карточки
    modalEl.innerHTML = `
      <div style="padding:20px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px">
        <div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
            <span class="badge b-orange" style="font-size:.85rem; font-weight:800; font-family:monospace">Вн. № ${escHtml(c.internal_number || '—')}</span>
            ${c.contract_number ? `<span class="badge b-gray" style="font-size:.85rem; font-weight:700">№ ${escHtml(c.contract_number)}</span>` : ''}
            <span class="badge b-blue">${escHtml(c.contract_type_summary || 'Договор')}</span>
            <span class="badge ${c.status === 'Завершен' ? 'b-gray' : (c.status && c.status.includes('оплат') ? 'b-yellow' : 'b-green')}">${escHtml(c.status || 'Действует')}</span>
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
  });
}

function renderContractTabMain(c, dDate, dEnd) {
  return `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-bottom:20px">
      <!-- СТОРОНА 1: ЗАКАЗЧИК -->
      <div class="card p" style="background:#fcfcfc">
        <div style="font-size:.72rem; text-transform:uppercase; font-weight:700; color:var(--text-3); margin-bottom:6px">🏛️ Сторона 1 (Заказчик)</div>
        <div style="font-weight:700; font-size:.95rem; color:var(--text)">${escHtml(c.customer_name || 'Не указан')}</div>
        ${c.customer_inn ? `<div style="font-size:.78rem; color:var(--text-3); margin-top:3px">ИНН: ${escHtml(c.customer_inn)}</div>` : ''}
        ${c.contacts_raw ? `<div style="font-size:.78rem; color:var(--text-2); margin-top:6px; background:#fff; padding:6px 8px; border-radius:6px; border:1px solid var(--border)">📞 Контакты: ${escHtml(c.contacts_raw)}</div>` : ''}
      </div>

      <!-- СТОРОНА 2: НАША КОМПАНИЯ -->
      <div class="card p" style="background:#fcfcfc">
        <div style="font-size:.72rem; text-transform:uppercase; font-weight:700; color:var(--text-3); margin-bottom:6px">🏢 Сторона 2 (Исполнитель / Наша компания)</div>
        <div style="font-weight:700; font-size:.95rem; color:var(--text)">${escHtml(c.our_entity_name || 'ООО «Ультима»')}</div>
        <div style="font-size:.82rem; color:var(--text-2); margin-top:3px">Филиал / Регион: <b>${escHtml(c.our_entity_region || 'Не указан')}</b></div>
      </div>
    </div>

    <!-- МЕСТО, ДАТЫ И ФИНАНСЫ -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px; margin-bottom:20px">
      <div class="card p" style="padding:12px">
        <div style="font-size:.72rem; color:var(--text-3); font-weight:700">📍 Место поставки / работ</div>
        <div style="font-size:.88rem; font-weight:600; color:var(--text); margin-top:4px">${escHtml(c.delivery_place || 'По региону')}</div>
      </div>
      <div class="card p" style="padding:12px">
        <div style="font-size:.72rem; color:var(--text-3); font-weight:700">📅 Дата заключения</div>
        <div style="font-size:.88rem; font-weight:600; color:var(--text); margin-top:4px">${dDate}</div>
      </div>
      <div class="card p" style="padding:12px">
        <div style="font-size:.72rem; color:var(--text-3); font-weight:700">⏳ Срок окончания работ</div>
        <div style="font-size:.88rem; font-weight:600; color:var(--text); margin-top:4px">${dEnd}</div>
      </div>
      <div class="card p" style="padding:12px">
        <div style="font-size:.72rem; color:var(--text-3); font-weight:700">💰 Сумма договора</div>
        <div style="font-size:1.1rem; font-weight:800; color:var(--green); margin-top:2px">${fmtMoney(c.amount)}</div>
        ${c.platform ? `<div style="font-size:.7rem; color:var(--text-3)">ЭТП: ${escHtml(c.platform)}</div>` : ''}
      </div>
    </div>

    <!-- ССЫЛКИ НА ЗАКУПКУ И ОБЛАКО -->
    <div class="card p" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:#fffbf7; border:1px solid #fed7aa">
      <div>
        <div style="font-weight:700; font-size:.88rem">Файлы и материалы договора</div>
        <div style="font-size:.78rem; color:var(--text-3); margin-top:2px">Ссылки на внешнюю документацию, торги и хранилище файлов</div>
      </div>
      <div style="display:flex; gap:10px; align-items:center">
        ${c.zakupki_url ? `<a href="${escHtml(c.zakupki_url)}" target="_blank" class="btn btn-sm">🔗 Открыть на Закупках / ЭТП</a>` : ''}
        ${c.cloud_url ? `
          <a href="${escHtml(c.cloud_url)}" target="_blank" class="btn btn-sm" style="background:var(--orange); color:#fff">☁️ Папка в облаке</a>
          <button class="btn btn-sm btn-ghost" onclick="promptCloudUrl(${c.id})">Изменить ссылку</button>
        ` : `
          <button class="btn btn-sm" onclick="promptCloudUrl(${c.id})" style="background:var(--orange); color:#fff">+ Прикрепить папку в облаке</button>
        `}
      </div>
    </div>
  `;
}

function renderContractTabTerms(c) {
  return `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-bottom:20px">
      <div class="card p">
        <div style="font-size:.75rem; text-transform:uppercase; font-weight:700; color:var(--text-3); margin-bottom:6px">💳 Условия оплаты</div>
        <div style="font-size:.9rem; line-height:1.4">${escHtml(c.payment_terms || 'В соответствии с условиями договора')}</div>
      </div>
      <div class="card p">
        <div style="font-size:.75rem; text-transform:uppercase; font-weight:700; color:var(--text-3); margin-bottom:6px">🛡️ Обеспечение договора</div>
        <div style="font-size:1.15rem; font-weight:800; color:#3b82f6">${fmtMoney(c.security_amount)}</div>
        <div style="font-size:.8rem; color:var(--text-2); margin-top:3px">${escHtml(c.security_condition || 'Обеспечение не установлено')}</div>
        ${c.discount_percent > 0 ? `<div style="font-size:.75rem; color:var(--text-3); margin-top:4px">Снижение на торгах: <b>${(c.discount_percent * 100).toFixed(2)}%</b></div>` : ''}
      </div>
    </div>

    <!-- ТЕКСТ УСЛОВИЙ ДОГОВОРА (РЕДАКТИРУЕМЫЙ) -->
    <div class="card p">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
        <div style="font-size:.85rem; font-weight:700">Текст и особые условия договора</div>
        <button class="btn btn-sm btn-ghost" onclick="toggleEditTermsText(${c.id})" id="btn_edit_terms">✏️ Редактировать текст</button>
      </div>
      <div id="terms_display_box" style="background:#fafafa; border:1px solid var(--border); border-radius:8px; padding:12px; font-size:.85rem; line-height:1.5; white-space:pre-wrap; min-height:80px; color:var(--text)">
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
  if (!tasks.length) {
    return `
      <div class="card p" style="text-align:center; padding:3rem; color:var(--text-3)">
        <div style="font-size:2rem; margin-bottom:8px">📋</div>
        <div style="font-weight:600; color:var(--text)">По этому договору пока нет привязанных заявок</div>
        <div style="font-size:.82rem; margin-top:4px">При создании заявки выберите этот договор в поле «Договор»</div>
      </div>
    `;
  }

  var rows = tasks.map(function(t) {
    return `
      <tr style="border-bottom:1px solid var(--border); cursor:pointer" onclick="closeContractModal(); openTaskCard('${t.id}')">
        <td style="padding:8px 12px; font-weight:700; font-family:monospace">${escHtml(t.id)}</td>
        <td style="padding:8px 12px">${escHtml(t.region || '—')}</td>
        <td style="padding:8px 12px">${escHtml(t.address || '—')}</td>
        <td style="padding:8px 12px">${escHtml(t.work_type || '—')}</td>
        <td style="padding:8px 12px">${stBadge(t.status)}</td>
        <td style="padding:8px 12px; font-weight:700">${fmtMoney(t.amount)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card tbl-wrap">
      <table>
        <thead>
          <tr style="background:var(--bg)">
            <th>ID Заявки</th>
            <th>Регион</th>
            <th>Адрес объекта</th>
            <th>Вид работ</th>
            <th>Статус</th>
            <th>Сумма</th>
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

  var isEdit = Boolean(id);
  var c = isEdit && S.contracts ? S.contracts.find(x => x.id === id) : null;

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

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
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
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
        <div>
          <label style="font-size:.78rem; font-weight:700">Заказчик (Сторона 1) *</label>
          <input type="text" id="cf_customer_name" required value="${escHtml(c ? c.customer_name : '')}" placeholder="Например: ПАО «Сбербанк России»" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
        </div>
        <div>
          <label style="font-size:.78rem; font-weight:700">Наша компания / Филиал (Сторона 2)</label>
          <input type="text" id="cf_our_entity" value="${escHtml(c ? (c.our_entity_name || 'ООО «Ультима»') : 'ООО «Ультима»')}" placeholder="ООО «Ультима»" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
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
          <label style="font-size:.78rem; font-weight:700">Срок выполнения (текст или дата)</label>
          <input type="text" id="cf_deadline_raw" value="${escHtml(c ? c.deadline_raw : '')}" placeholder="в течение 60 дней / до 15.12.2024" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
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
          <label style="font-size:.78rem; font-weight:700">Ссылка на облако (Яндекс.Диск / Google)</label>
          <input type="url" id="cf_cloud_url" value="${escHtml(c ? c.cloud_url : '')}" placeholder="https://disk.yandex.ru/..." style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; font-size:.85rem">
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

function closeContractFormModal() {
  var modalBackdrop = document.getElementById('contract_form_modal_backdrop');
  if (modalBackdrop) modalBackdrop.style.display = 'none';
}

function handleContractFormSubmit(e, id) {
  e.preventDefault();
  var isEdit = Boolean(id);

  var payload = {
    internal_number: document.getElementById('cf_internal_number').value.trim(),
    contract_number: document.getElementById('cf_contract_number').value.trim(),
    contract_date: document.getElementById('cf_contract_date').value || null,
    contract_type_summary: document.getElementById('cf_type').value,
    customer_name: document.getElementById('cf_customer_name').value.trim(),
    our_entity_name: document.getElementById('cf_our_entity').value.trim(),
    subject: document.getElementById('cf_subject').value.trim(),
    delivery_place: document.getElementById('cf_place').value.trim(),
    deadline_raw: document.getElementById('cf_deadline_raw').value.trim(),
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
      showToast(isEdit ? 'Договор успешно обновлен' : 'Договор создан', 'success');
      closeContractFormModal();
      fetchContracts();
      if (isEdit) openContractModal(id);
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
