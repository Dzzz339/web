// public/js/pages/contractors.js - Справочники организаций: Заказчики, Поставщики и логистика, Подрядчики СМР

var contractorSearchTimeout = null;

function pageContractors() {
  S.contractorActiveTab = S.contractorActiveTab || 'subcontractor';
  S.contractorSearch = S.contractorSearch || '';

  // Загружаем актуальный список контрагентов
  api('/contractors').then(function(list) {
    S.contractors = list || [];
    renderContractorsView();
  });

  return `
    <div style="margin-bottom:1.25rem">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:1rem">
        <div>
          <h1 class="page-title" style="margin:0">Организации</h1>
          <div style="font-size:.82rem; color:var(--text-3); margin-top:2px">
            Справочник заказчиков, поставщиков материалов, логистики и подрядчиков СМР
          </div>
        </div>
        <div id="contractor_top_actions"></div>
      </div>

      <!-- ВЕРХНИЕ ВКЛАДКИ -->
      <div style="display:flex; gap:8px; border-bottom:1.5px solid var(--border); padding-bottom:6px; margin-bottom:1.25rem; flex-wrap:wrap">
        <button class="btn btn-sm ${S.contractorActiveTab === 'customer' ? '' : 'btn-ghost'}" onclick="setContractorTab('customer')">
          🏛️ Заказчики <span id="badge_count_customer" style="opacity:.8">(${getContractorCount('customer')})</span>
        </button>
        <button class="btn btn-sm ${S.contractorActiveTab === 'supplier' ? '' : 'btn-ghost'}" onclick="setContractorTab('supplier')">
          📦 Поставщики и логистика <span id="badge_count_supplier" style="opacity:.8">(${getContractorCount('supplier')})</span>
        </button>
        <button class="btn btn-sm ${S.contractorActiveTab === 'subcontractor' ? '' : 'btn-ghost'}" onclick="setContractorTab('subcontractor')">
          👷 Подрядчики СМР <span id="badge_count_subcontractor" style="opacity:.8">(${getContractorCount('subcontractor')})</span>
        </button>
      </div>
    </div>

    <!-- ФОРМА ДОБАВЛЕНИЯ ОРГАНИЗАЦИИ -->
    <div id="contractor_add_card" class="card p mb" style="display:${S.contractorFormOpen ? 'block' : 'none'}; border:1.5px solid var(--orange); animation: fadeIn 0.15s ease;">
      <div id="contractor_form_container"></div>
    </div>

    <!-- ТАБЛИЦА КОНТРАГЕНТОВ -->
    <div id="contractors_table_container">
      <div class="card p" style="text-align:center; padding:3rem; color:var(--text-3)">Загрузка организаций...</div>
    </div>
  `;
}

function getContractorCount(type) {
  if (!S.contractors) return '0';
  if (type === 'subcontractor') {
    return S.contractors.filter(c => c.type === 'subcontractor' || c.type === 'executor' || c.type === 'internal' || !c.type).length;
  }
  return S.contractors.filter(c => c.type === type).length;
}

function setContractorTab(tab) {
  S.contractorActiveTab = tab;
  S.contractorFormOpen = false;
  renderApp();
}

function toggleContractorForm(open) {
  S.contractorFormOpen = (open !== undefined) ? open : !S.contractorFormOpen;
  renderApp();
}

function renderContractorsView() {
  var topActions = document.getElementById('contractor_top_actions');
  var container = document.getElementById('contractors_table_container');
  var formContainer = document.getElementById('contractor_form_container');
  var curTab = S.contractorActiveTab || 'subcontractor';

  // Обновляем счетчики на кнопках
  var bcCust = document.getElementById('badge_count_customer');
  if (bcCust) bcCust.textContent = '(' + getContractorCount('customer') + ')';
  var bcSup = document.getElementById('badge_count_supplier');
  if (bcSup) bcSup.textContent = '(' + getContractorCount('supplier') + ')';
  var bcSub = document.getElementById('badge_count_subcontractor');
  if (bcSub) bcSub.textContent = '(' + getContractorCount('subcontractor') + ')';

  var tabTitles = {
    customer: 'Заказчика',
    supplier: 'Поставщика / ТК',
    subcontractor: 'Подрядчика СМР'
  };

  if (topActions) {
    topActions.innerHTML = `
      <button class="btn" onclick="toggleContractorForm()">
        ${S.contractorFormOpen ? '✕ Закрыть форму' : '+ Добавить ' + (tabTitles[curTab] || 'организацию')}
      </button>
    `;
  }

  // Рендерим форму добавления с подсказками
  if (formContainer && S.contractorFormOpen) {
    renderContractorAddForm(formContainer, curTab);
  }

  // Фильтруем список организаций по текущей вкладке и строке поиска
  var q = (S.contractorSearch || '').toLowerCase();
  var list = (S.contractors || []).filter(function(c) {
    var matchesType = false;
    if (curTab === 'customer') matchesType = (c.type === 'customer');
    else if (curTab === 'supplier') matchesType = (c.type === 'supplier');
    else matchesType = (c.type === 'subcontractor' || c.type === 'executor' || c.type === 'internal' || !c.type);

    if (!matchesType) return false;
    if (!q) return true;
    var nameMatch = (c.name_short || '').toLowerCase().includes(q) || (c.name_full || '').toLowerCase().includes(q);
    var innMatch = (c.inn || '').toLowerCase().includes(q);
    var dirMatch = (c.director || '').toLowerCase().includes(q);
    var contractMatch = (c.contract_number || '').toLowerCase().includes(q);
    return nameMatch || innMatch || dirMatch || contractMatch;
  });

  if (!container) return;

  if (curTab === 'customer') {
    renderCustomersTable(container, list);
  } else if (curTab === 'supplier') {
    renderSuppliersTable(container, list);
  } else {
    renderSubcontractorsTable(container, list);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ТАБЛИЦА «🏛️ ЗАКАЗЧИКИ»
// ─────────────────────────────────────────────────────────────────────────────

function renderCustomersTable(container, list) {
  var rows = list.map(function(c) {
    var contractInfo = c.contract_number 
      ? `<div style="font-weight:700; color:var(--orange)">№ ${escHtml(c.contract_number)}</div>` 
      : '<span style="color:var(--text-3)">Не указан</span>';
    if (c.contract_date) {
      contractInfo += `<div style="font-size:.73rem; color:var(--text-3)">от ${new Date(c.contract_date).toLocaleDateString('ru')}</div>`;
    }

    var curatorInfo = '—';
    if (c.curator_name) {
      curatorInfo = `<div style="font-weight:600">${escHtml(c.curator_name)}</div>`;
      if (c.curator_phone) curatorInfo += `<div style="font-size:.73rem; color:var(--text-3)">📞 ${escHtml(c.curator_phone)}</div>`;
      if (c.curator_email) curatorInfo += `<div style="font-size:.73rem; color:var(--text-3)">✉️ ${escHtml(c.curator_email)}</div>`;
    }

    return `
      <tr style="border-bottom: 1px solid var(--border)">
        <td style="padding: 10px 12px; font-weight:700; font-family:monospace">${escHtml(c.inn)}</td>
        <td style="padding: 10px 12px">
          <div style="font-weight:700; font-size:.9rem">${escHtml(c.name_short)}</div>
          ${c.name_full ? '<div style="font-size:.74rem; color:var(--text-3); line-height:1.2; margin-top:2px">' + escHtml(c.name_full) + '</div>' : ''}
          ${c.address_legal ? '<div style="font-size:.72rem; color:var(--text-3); margin-top:3px">📍 ' + escHtml(c.address_legal) + '</div>' : ''}
        </td>
        <td style="padding: 10px 12px">${contractInfo}</td>
        <td style="padding: 10px 12px">${curatorInfo}</td>
        <td style="padding: 10px 12px">
          <span class="badge b-green">🟢 Активен</span>
        </td>
        <td style="padding: 10px 12px; text-align:right; white-space:nowrap">
          <button class="btn btn-sm btn-ghost" onclick="editContractor(${c.id})" title="Редактировать заказчика">✏️</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="deleteContractor(${c.id})" title="Удалить">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <!-- ПОИСК И ФИЛЬТР -->
    <div class="card p mb" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap">
      <input type="text" value="${escHtml(S.contractorSearch)}" placeholder="🔍 Поиск заказчика по названию, ИНН, договору или куратору..." 
             style="flex:1; min-width:280px; padding:8px 12px; border:1px solid var(--border); border-radius:8px"
             oninput="onContractorSearch(this.value)">
      <div style="font-size:.82rem; color:var(--text-3)">Заказчиков в базе: <b>${list.length}</b></div>
    </div>

    <div class="card tbl-wrap">
      <table>
        <thead>
          <tr style="background:var(--bg)">
            <th>ИНН</th>
            <th>Заказчик (Организация)</th>
            <th>Генеральный контракт / Договор</th>
            <th>Куратор и контакты</th>
            <th>Статус</th>
            <th style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--text-3)">Заказчики не найдены. Нажмите «+ Добавить Заказчика»</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ТАБЛИЦА «📦 ПОСТАВЩИКИ И ЛОГИСТИКА»
// ─────────────────────────────────────────────────────────────────────────────

function renderSuppliersTable(container, list) {
  var rows = list.map(function(c) {
    var contactDisplay = '—';
    if (c.phone || c.email) {
      contactDisplay = `
        ${c.phone ? '<div>📞 ' + escHtml(c.phone) + '</div>' : ''}
        ${c.email ? '<div style="font-size:.73rem; color:var(--text-3)">✉️ ' + escHtml(c.email) + '</div>' : ''}
      `;
    }

    var bankInfo = c.bank_name ? `<div style="font-size:.75rem; color:var(--text-2)">${escHtml(c.bank_name)} ${c.bik ? '· БИК ' + escHtml(c.bik) : ''}</div>` : '';

    return `
      <tr style="border-bottom: 1px solid var(--border)">
        <td style="padding: 10px 12px; font-weight:700; font-family:monospace">${escHtml(c.inn)}</td>
        <td style="padding: 10px 12px">
          <div style="font-weight:700; font-size:.9rem">${escHtml(c.name_short)}</div>
          ${c.name_full ? '<div style="font-size:.74rem; color:var(--text-3); margin-top:2px">' + escHtml(c.name_full.slice(0, 90)) + '</div>' : ''}
          ${bankInfo}
        </td>
        <td style="padding: 10px 12px">
          <span class="badge b-yellow">📦 Материалы / ТК</span>
        </td>
        <td style="padding: 10px 12px; font-size:.85rem">${contactDisplay}</td>
        <td style="padding: 10px 12px; font-size:.8rem; color:var(--text-3)">
          ${escHtml(c.address_legal ? c.address_legal.slice(0, 60) + '...' : '—')}
        </td>
        <td style="padding: 10px 12px; text-align:right; white-space:nowrap">
          <button class="btn btn-sm btn-ghost" onclick="viewContractorDetails(${c.id})" title="Доверенности на получение груза">📜 Доверенности</button>
          <button class="btn btn-sm btn-ghost" onclick="editContractor(${c.id})" title="Редактировать">✏️</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="deleteContractor(${c.id})" title="Удалить">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <!-- ПОИСК И ФИЛЬТР -->
    <div class="card p mb" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap">
      <input type="text" value="${escHtml(S.contractorSearch)}" placeholder="🔍 Поиск поставщика по названию, ИНН, телефону или городу..." 
             style="flex:1; min-width:280px; padding:8px 12px; border:1px solid var(--border); border-radius:8px"
             oninput="onContractorSearch(this.value)">
      <div style="font-size:.82rem; color:var(--text-3)">Поставщиков и ТК: <b>${list.length}</b></div>
    </div>

    <div class="card tbl-wrap">
      <table>
        <thead>
          <tr style="background:var(--bg)">
            <th>ИНН</th>
            <th>Поставщик / Транспортная компания</th>
            <th>Категория</th>
            <th>Контакты</th>
            <th>Склад / Юр. адрес</th>
            <th style="width:130px"></th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--text-3)">Поставщики и ТК не найдены</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ТАБЛИЦА «👷 ПОДРЯДЧИКИ СМР»
// ─────────────────────────────────────────────────────────────────────────────

function renderSubcontractorsTable(container, list) {
  var rows = list.map(function(c) {
    var specCount = Number(c.specialists_count || 0);
    var specBadge = specCount > 0 
      ? `<span class="badge b-blue" style="cursor:pointer; font-weight:700" onclick="viewContractorDetails(${c.id})">👷 ${specCount} монтажников</span>`
      : `<span class="badge b-gray" style="cursor:pointer" onclick="openAddInstallerModal(${c.id}, '${escHtml(c.name_short)}')">+ Привязать монтажника</span>`;

    var contractInfo = c.contract_number 
      ? `<div style="font-weight:600; font-size:.85rem">Договор № ${escHtml(c.contract_number)}</div>` 
      : '<span style="color:var(--text-3); font-size:.8rem">Договор не привязан</span>';

    return `
      <tr style="border-bottom: 1px solid var(--border)">
        <td style="padding: 10px 12px; font-weight:700; font-family:monospace">${escHtml(c.inn)}</td>
        <td style="padding: 10px 12px">
          <div style="font-weight:700; font-size:.9rem">${escHtml(c.name_short)}</div>
          ${c.director ? '<div style="font-size:.73rem; color:var(--text-3)">Директор: ' + escHtml(c.director) + '</div>' : ''}
          ${c.phone ? '<div style="font-size:.73rem; color:var(--text-3)">📞 ' + escHtml(c.phone) + '</div>' : ''}
        </td>
        <td style="padding: 10px 12px">${contractInfo}</td>
        <td style="padding: 10px 12px">
          ${specBadge}
        </td>
        <td style="padding: 10px 12px">
          <span class="badge b-green">🟢 Аккредитован</span>
        </td>
        <td style="padding: 10px 12px; text-align:right; white-space:nowrap">
          <button class="btn btn-sm btn-ghost" onclick="viewContractorDetails(${c.id})" title="Просмотр монтажников и доверенностей">👷 Бригада и документы</button>
          <button class="btn btn-sm btn-ghost" onclick="editContractor(${c.id})" title="Редактировать">✏️</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="deleteContractor(${c.id})" title="Удалить">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <!-- ПОИСК И ФИЛЬТР -->
    <div class="card p mb" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap">
      <input type="text" value="${escHtml(S.contractorSearch)}" placeholder="🔍 Поиск подрядчика по названию, ИНН, договору или директору..." 
             style="flex:1; min-width:280px; padding:8px 12px; border:1px solid var(--border); border-radius:8px"
             oninput="onContractorSearch(this.value)">
      <div style="font-size:.82rem; color:var(--text-3)">Подрядчиков СМР: <b>${list.length}</b></div>
    </div>

    <div class="card tbl-wrap">
      <table>
        <thead>
          <tr style="background:var(--bg)">
            <th>ИНН</th>
            <th>Подрядная организация СМР</th>
            <th>Договор субподряда</th>
            <th>Монтажники в штате</th>
            <th>Статус</th>
            <th style="width:160px"></th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--text-3)">Подрядчики СМР не найдены</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function onContractorSearch(val) {
  S.contractorSearch = val;
  renderContractorsView();
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ФОРМА ДОБАВЛЕНИЯ КОНТРАГЕНТА (С АВТОПОИСКОМ ПО DADATA)
// ─────────────────────────────────────────────────────────────────────────────

function renderContractorAddForm(container, curTab) {
  var labels = {
    customer: { title: '🏛️ Добавить нового Заказчика', typeText: 'Заказчик наших услуг (ПАО Сбербанк, ОСФР и др.)' },
    supplier: { title: '📦 Добавить Поставщика ТМЦ / Транспортную компанию', typeText: 'Поставщик кабеля, оборудования или логистический оператор' },
    subcontractor: { title: '👷 Добавить Подрядчика СМР', typeText: 'Монтажная организация или ИП для выполнения работ в полях' }
  };
  var curInfo = labels[curTab] || labels.subcontractor;

  container.innerHTML = `
    <div class="sec-title" style="margin-bottom:.75rem">${curInfo.title}</div>
    <div style="font-size:.82rem; color:var(--text-3); margin-bottom:1rem">${curInfo.typeText}</div>

    <!-- Блок быстрого поиска по названию / ИНН через DaData -->
    <div style="position:relative; margin-bottom:1.25rem">
      <label style="display:block; font-size:.78rem; font-weight:700; margin-bottom:4px">⚡ Быстрый поиск по названию или ИНН (DaData)</label>
      <input id="nc_search_input" type="text" placeholder="Начните вводить название компании или ИНН..." 
             style="width:100%; font-weight:600; padding:9px 12px; border:1.5px solid var(--orange); border-radius:8px"
             oninput="onContractorSearchInput(this.value, 'nc')">
      <div id="nc_suggestions_box" style="display:none; position:absolute; top:100%; left:0; right:0; background:#fff; border:1.5px solid var(--orange); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.15); z-index:100; max-height:240px; overflow-y:auto; margin-top:4px"></div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1.25rem; margin-bottom:1.25rem">
      <!-- Левая колонка -->
      <div>
        <div class="mb">
          <label style="font-size:.75rem; font-weight:600">Краткое наименование *</label>
          <input id="nc_name_short" type="text" placeholder="ПАО СБЕРБАНК / ООО Ультима" style="width:100%">
        </div>
        <div class="g2 mb">
          <div>
            <label style="font-size:.75rem; font-weight:600">ИНН *</label>
            <input id="nc_inn" type="text" placeholder="ИНН">
          </div>
          <div>
            <label style="font-size:.75rem; font-weight:600">КПП</label>
            <input id="nc_kpp" type="text" placeholder="КПП">
          </div>
        </div>
        <div class="mb">
          <label style="font-size:.75rem; font-weight:600">Полное наименование</label>
          <textarea id="nc_name_full" placeholder="Полное юр. наименование" style="width:100%; min-height:48px"></textarea>
        </div>
        <div class="mb">
          <label style="font-size:.75rem; font-weight:600">Юридический адрес</label>
          <textarea id="nc_address" placeholder="Адрес регистрации" style="width:100%; min-height:48px"></textarea>
        </div>
        <div class="mb">
          <label style="font-size:.75rem; font-weight:600">Руководитель (Директор)</label>
          <input id="nc_director" type="text" placeholder="ФИО Генерального директора" style="width:100%">
        </div>
      </div>

      <!-- Правая колонка: Специфика договора и контакты -->
      <div>
        <div class="g2 mb">
          <div>
            <label style="font-size:.75rem; font-weight:600">${curTab === 'customer' ? 'Генеральный контракт / Договор' : 'Договор субподряда'}</label>
            <input id="nc_contract_number" type="text" placeholder="№ 0224100001826000158">
          </div>
          <div>
            <label style="font-size:.75rem; font-weight:600">Дата договора</label>
            <input id="nc_contract_date" type="date">
          </div>
        </div>

        <div class="mb">
          <label style="font-size:.75rem; font-weight:600">Куратор / Ответственный контакт</label>
          <input id="nc_curator_name" type="text" placeholder="ФИО куратора" style="width:100%">
        </div>
        <div class="g2 mb">
          <div>
            <label style="font-size:.75rem; font-weight:600">Телефон</label>
            <input id="nc_phone" type="text" placeholder="+7 (999) 000-00-00">
          </div>
          <div>
            <label style="font-size:.75rem; font-weight:600">Email</label>
            <input id="nc_email" type="email" placeholder="mail@org.ru">
          </div>
        </div>

        <div class="g2 mb">
          <div>
            <label style="font-size:.75rem; font-weight:600">Банк</label>
            <input id="nc_bank" type="text" placeholder="Название банка">
          </div>
          <div>
            <label style="font-size:.75rem; font-weight:600">БИК</label>
            <input id="nc_bik" type="text" placeholder="БИК">
          </div>
        </div>
        <div class="mb">
          <label style="font-size:.75rem; font-weight:600">Расчетный счет</label>
          <input id="nc_acc_pay" type="text" placeholder="40702810..." style="width:100%">
        </div>
      </div>
    </div>

    <div style="text-align:right; border-top:1px solid var(--border); padding-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="toggleContractorForm(false)" style="margin-right:8px">Отмена</button>
      <button class="btn" onclick="saveNewContractor('${curTab}')">+ Сохранить ${curTab === 'customer' ? 'Заказчика' : (curTab === 'supplier' ? 'Поставщика' : 'Подрядчика')}</button>
    </div>
  `;
}

function saveNewContractor(tabType) {
  var inn = document.getElementById('nc_inn').value.trim();
  var nameShort = document.getElementById('nc_name_short').value.trim();

  if (!inn || !nameShort) {
    return alert('ИНН и Краткое наименование обязательны!');
  }

  var data = {
    inn: inn,
    kpp: document.getElementById('nc_kpp').value.trim(),
    name_short: nameShort,
    name_full: document.getElementById('nc_name_full').value.trim(),
    type: tabType,
    address_legal: document.getElementById('nc_address').value.trim(),
    director: document.getElementById('nc_director').value.trim(),
    contract_number: document.getElementById('nc_contract_number').value.trim(),
    contract_date: document.getElementById('nc_contract_date').value || null,
    curator_name: document.getElementById('nc_curator_name').value.trim(),
    phone: document.getElementById('nc_phone').value.trim(),
    email: document.getElementById('nc_email').value.trim(),
    bank_name: document.getElementById('nc_bank').value.trim(),
    bik: document.getElementById('nc_bik').value.trim(),
    account_pay: document.getElementById('nc_acc_pay').value.trim()
  };

  api('/contractors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(function(res) {
    if (res && res.error) return alert(res.error);
    S.contractorFormOpen = false;
    api('/contractors').then(function(list) {
      S.contractors = list;
      renderApp();
    });
  });
}

function editContractor(id) {
  var c = (S.contractors || []).find(x => x.id === id);
  if (!c) return;

  var contractDateStr = c.contract_date ? c.contract_date.slice(0, 10) : '';

  showModal('✏️ Редактировать организацию #' + id, [
    { key: 'nameShort', label: 'Краткое наименование', value: c.name_short, required: true },
    { key: 'type', label: 'Тип организации', type: 'select', value: c.type || 'subcontractor', options: [
        { value: 'customer', label: '🏛️ Заказчик (кто нам платит)' },
        { value: 'supplier', label: '📦 Поставщик ТМЦ / Транспортная компания' },
        { value: 'subcontractor', label: '👷 Подрядчик СМР (монтажная организация)' }
      ]
    },
    { key: 'inn', label: 'ИНН', value: c.inn, required: true },
    { key: 'kpp', label: 'КПП', value: c.kpp || '' },
    { key: 'contractNumber', label: 'Номер договора / контракта', value: c.contract_number || '' },
    { key: 'contractDate', label: 'Дата договора', type: 'date', value: contractDateStr },
    { key: 'curatorName', label: 'Куратор / Контактное лицо', value: c.curator_name || '' },
    { key: 'phone', label: 'Телефон', value: c.phone || '' },
    { key: 'email', label: 'Email', value: c.email || '' },
    { key: 'director', label: 'Директор', value: c.director || '' },
    { key: 'addressLegal', label: 'Юридический адрес', type: 'textarea', value: c.address_legal || '' },
    { key: 'bankName', label: 'Банк', value: c.bank_name || '' },
    { key: 'bik', label: 'БИК', value: c.bik || '' },
    { key: 'accountPay', label: 'Расчетный счет', value: c.account_pay || '' }
  ], function(d) {
    api('/contractors/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name_short: d.nameShort,
        type: d.type,
        inn: d.inn,
        kpp: d.kpp,
        contract_number: d.contractNumber,
        contract_date: d.contractDate || null,
        curator_name: d.curatorName,
        phone: d.phone,
        email: d.email,
        director: d.director,
        address_legal: d.addressLegal,
        bank_name: d.bankName,
        bik: d.bik,
        account_pay: d.accountPay
      })
    }).then(function(res) {
      if (res && res.error) return alert(res.error);
      api('/contractors').then(function(list) {
        S.contractors = list;
        renderApp();
      });
    });
  });
}

function deleteContractor(id) {
  if (!confirm('Удалить организацию? Это действие нельзя отменить.')) return;
  api('/contractors/' + id, { method: 'DELETE' }).then(function(res) {
    if (res && res.error) return alert(res.error);
    S.contractors = S.contractors.filter(c => c.id !== id);
    renderApp();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ДЕТАЛЬНАЯ КАРТОЧКА ПОДРЯДЧИКА / ПОСТАВЩИКА С МОНТАЖНИКАМИ
// ─────────────────────────────────────────────────────────────────────────────

function viewContractorDetails(contractorId) {
  var c = (S.contractors || []).find(function(x){ return x.id === contractorId; });
  if (!c) return;

  Promise.all([
    api('/contractors/' + contractorId + '/specialists').catch(() => []),
    api('/powers-of-attorney?contractorId=' + contractorId).catch(() => [])
  ]).then(function(results) {
    var specs = results[0] || [];
    var poas = results[1] || [];

    var existing = document.getElementById('_contractor_details_modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = '_contractor_details_modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(2px)';

    var specsHtml = specs.length ? specs.map(function(s) {
      var passSnippet = s.passport_raw ? `<div style="font-size:.72rem;color:var(--text-3)">Паспорт: ${escHtml(s.passport_raw.slice(0, 40))}...</div>` : '';
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--border);font-size:.85rem">
          <div>
            <b>${escHtml(s.full_name)}</b> <span class="t3" style="font-size:.75rem">(${escHtml(s.position || 'Монтажник')})</span>
            ${passSnippet}
          </div>
          <div style="text-align:right">
            <div style="font-size:.8rem;color:var(--text-2)">${s.phone ? '📞 ' + escHtml(s.phone) : '—'}</div>
          </div>
        </div>
      `;
    }).join('') : '<div style="color:var(--text-3);padding:1.5rem;text-align:center;font-size:.85rem">Нет привязанных монтажников в штате</div>';

    var poasHtml = poas.length ? poas.map(function(p) {
      var dStr = p.valid_until ? new Date(p.valid_until).toLocaleDateString('ru') : 'Бессрочно';
      var st = p.computed_status === 'expired' ? '<span class="badge b-red">Просрочена</span>' : '<span class="badge b-green">Действует</span>';
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--border);font-size:.85rem">
          <div>
            <b style="font-family:monospace">№ ${escHtml(p.number)}</b> &bull; ${escHtml(p.person_name)}
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:.75rem;color:var(--text-3)">до ${dStr}</span>
            ${st}
          </div>
        </div>
      `;
    }).join('') : '<div style="color:var(--text-3);padding:1rem;text-align:center;font-size:.85rem">Нет связанных доверенностей</div>';

    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:1.5rem;width:100%;max-width:680px;box-shadow:0 12px 48px rgba(0,0,0,.25);max-height:90vh;display:flex;flex-direction:column">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;border-bottom:1px solid var(--border);padding-bottom:10px">
          <div>
            <h2 style="margin:0;font-size:1.25rem">${escHtml(c.name_short)}</h2>
            <div style="font-size:.78rem;color:var(--text-3);margin-top:2px">
              ИНН: <b>${escHtml(c.inn)}</b> ${c.contract_number ? '· Договор № ' + escHtml(c.contract_number) : ''}
            </div>
          </div>
          <button onclick="document.getElementById('_contractor_details_modal').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-3);line-height:1">×</button>
        </div>

        <div style="overflow-y:auto;flex:1;padding-right:4px">
          <!-- БРИГАДА МОНТАЖНИКОВ ПОДРЯДЧИКА -->
          <div style="margin-bottom:1.5rem">
            <div style="font-weight:700;font-size:.9rem;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
              <span>👷 Монтажники субподрядчика (${specs.length} чел.)</span>
              <button class="btn btn-sm" onclick="openAddInstallerModal(${c.id}, '${escHtml(c.name_short)}')">+ Добавить монтажника</button>
            </div>
            <div style="background:var(--bg);border-radius:8px;border:1px solid var(--border);max-height:220px;overflow-y:auto">
              ${specsHtml}
            </div>
          </div>

          <!-- ДОВЕРЕННОСТИ -->
          <div>
            <div style="font-weight:700;font-size:.9rem;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
              <span>📜 Доверенности на получение груза / работы</span>
              <span class="badge b-gray" style="font-size:.72rem">${poas.length} шт.</span>
            </div>
            <div style="background:var(--bg);border-radius:8px;border:1px solid var(--border);max-height:180px;overflow-y:auto">
              ${poasHtml}
            </div>
          </div>
        </div>

        <div style="text-align:right;margin-top:1.25rem;border-top:1px solid var(--border);padding-top:10px">
          <button onclick="document.getElementById('_contractor_details_modal').remove()" class="btn btn-sm btn-ghost">Закрыть</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });
  });
}

function openAddInstallerModal(contractorId, contractorName) {
  showModal('👷 Новый монтажник в штат «' + contractorName + '»', [
    { key: 'fullName', label: 'ФИО монтажника (полностью)', required: true },
    { key: 'phone', label: 'Телефон монтажника', placeholder: '+7 (999) 000-00-00' },
    { key: 'position', label: 'Должность', value: 'Монтажник СКС' },
    { key: 'passportSeriesNumber', label: 'Серия и Номер паспорта', placeholder: '5014 123456' },
    { key: 'passportRaw', label: 'Полные паспортные данные (для допуска)', type: 'textarea', placeholder: 'Кем и когда выдан, код подразделения' }
  ], function(d) {
    api('/contractors/' + contractorId + '/specialists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: d.fullName,
        phone: d.phone,
        position: d.position,
        passportSeriesNumber: d.passportSeriesNumber,
        passportRaw: d.passportRaw
      })
    }).then(function(res) {
      if (res && res.error) return alert(res.error);
      alert('✅ Монтажник успешно прикреплен к подрядчику!');
      viewContractorDetails(contractorId);
      api('/contractors').then(list => { S.contractors = list; renderApp(); });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. DADATA ПОДСКАЗКИ
// ─────────────────────────────────────────────────────────────────────────────

function onContractorSearchInput(val, prefix) {
  prefix = prefix || 'nc';
  var box = document.getElementById(prefix + '_suggestions_box');
  if (!box) return;

  clearTimeout(contractorSearchTimeout);

  if (!val || val.trim().length < 3) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  contractorSearchTimeout = setTimeout(function() {
    api('/dadata/suggest-party?query=' + encodeURIComponent(val.trim())).then(function(list) {
      if (!list || !list.length) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
      }
      var itemsHtml = list.map(function(item) {
        var safeJson = encodeURIComponent(JSON.stringify(item));
        return `
          <div onclick="selectContractorSuggestion('${safeJson}','${prefix}')" 
               style="padding:10px 14px; border-bottom:1px solid #f4f4f5; cursor:pointer; transition:background .12s" 
               onmouseover="this.style.background='var(--orange-bg)'" 
               onmouseout="this.style.background='#fff'">
            <div style="font-weight:600; font-size:.85rem; color:var(--text)">${item.name_short}</div>
            <div style="font-size:.75rem; color:var(--text-3); margin-top:2px">
              ИНН: <strong>${item.inn || '—'}</strong> ${item.address_legal ? '· ' + item.address_legal.slice(0, 45) + '...' : ''}
            </div>
          </div>
        `;
      }).join('');
      box.innerHTML = itemsHtml;
      box.style.display = 'block';
    });
  }, 300);
}

function selectContractorSuggestion(encodedJson, prefix) {
  prefix = prefix || 'nc';
  var data = JSON.parse(decodeURIComponent(encodedJson));
  var box = document.getElementById(prefix + '_suggestions_box');
  if (box) box.style.display = 'none';

  var searchInput = document.getElementById(prefix + '_search_input');
  if (searchInput) searchInput.value = data.name_short;

  if (data.inn) document.getElementById(prefix + '_inn').value = data.inn;
  if (data.kpp) document.getElementById(prefix + '_kpp').value = data.kpp;
  if (data.name_short) document.getElementById(prefix + '_name_short').value = data.name_short;
  if (data.name_full) document.getElementById(prefix + '_name_full').value = data.name_full;
  if (data.address_legal) document.getElementById(prefix + '_address').value = data.address_legal;
  if (data.director) document.getElementById(prefix + '_director').value = data.director;

  [prefix+'_inn', prefix+'_kpp', prefix+'_name_short', prefix+'_name_full', prefix+'_address', prefix+'_director'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el && el.value) { 
      el.style.background = '#e8f5e9'; 
      setTimeout(function(){ el.style.background='#fff'; }, 1500); 
    }
  });
}

document.addEventListener('click', function(e) {
  var box = document.getElementById('nc_suggestions_box');
  if (box && !box.contains(e.target)) {
    box.style.display = 'none';
  }
});