// public/js/pages/users.js - Команда: Специалисты, Доверенности, Учетные записи

function pageUsers() {
  S.teamActiveTab = S.teamActiveTab || 'users';
  S.specSearch = S.specSearch || '';
  S.specWithPassport = S.specWithPassport !== undefined ? S.specWithPassport : false;
  S.poaFilterStatus = S.poaFilterStatus || 'all';
  S.poaSearch = S.poaSearch || '';

  // Parallel fetch for badges / counts
  Promise.all([
    api('/users').catch(() => []),
    api('/specialists').catch(() => []),
    api('/powers-of-attorney').catch(() => [])
  ]).then(function(results) {
    S.users = results[0] || [];
    S.specialists = results[1] || [];
    S.powersOfAttorney = results[2] || [];
    renderTeamActiveTabContent();
  });

  return `
    <div style="margin-bottom:1rem">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:1rem">
        <div>
          <h1 class="page-title" style="margin:0">Люди</h1>
          <div style="font-size:.82rem; color:var(--text-3); margin-top:2px">Сотрудники компании (8 ролей), реестр доверенностей и база полевых монтажников</div>
        </div>
        <div id="team_top_actions"></div>
      </div>

      <!-- ВЕРХНИЕ ВКЛАДКИ -->
      <div style="display:flex; gap:8px; border-bottom:1.5px solid var(--border); padding-bottom:6px; margin-bottom:1.25rem; flex-wrap:wrap">
        <button class="btn btn-sm ${S.teamActiveTab === 'users' ? '' : 'btn-ghost'}" onclick="setTeamTab('users')">
          👥 Сотрудники (8 ролей) <span id="badge_users_count" style="opacity:.8">(${S.users ? S.users.length : '...'})</span>
        </button>
        <button class="btn btn-sm ${S.teamActiveTab === 'poa' ? '' : 'btn-ghost'}" onclick="setTeamTab('poa')">
          📜 Реестр доверенностей <span id="badge_poa_count" style="opacity:.8">(${S.powersOfAttorney ? S.powersOfAttorney.length : '...'})</span>
        </button>
        <button class="btn btn-sm ${S.teamActiveTab === 'specialists' ? '' : 'btn-ghost'}" onclick="setTeamTab('specialists')">
          👷 База полевых монтажников <span id="badge_specs_count" style="opacity:.8">(${S.specialists ? S.specialists.length : '...'})</span>
        </button>
      </div>
    </div>

    <!-- КОНТЕЙНЕР АКТИВНОЙ ВКЛАДКИ -->
    <div id="team_tab_content">
      <div class="card p" style="text-align:center; padding:3rem; color:var(--text-3)">Загрузка данных команды...</div>
    </div>
  `;
}

function setTeamTab(tab) {
  S.teamActiveTab = tab;
  renderApp();
}

function renderTeamActiveTabContent() {
  var container = document.getElementById('team_tab_content');
  var topActions = document.getElementById('team_top_actions');
  if (!container) return;

  // Update badge counters if elements exist
  var bSpecs = document.getElementById('badge_specs_count');
  if (bSpecs && S.specialists) bSpecs.textContent = '(' + S.specialists.length + ')';
  var bPoa = document.getElementById('badge_poa_count');
  if (bPoa && S.powersOfAttorney) bPoa.textContent = '(' + S.powersOfAttorney.length + ')';
  var bUsers = document.getElementById('badge_users_count');
  if (bUsers && S.users) bUsers.textContent = '(' + S.users.length + ')';

  if (S.teamActiveTab === 'specialists') {
    if (topActions) {
      topActions.innerHTML = `
        <input type="file" id="input_upload_specialists" accept=".docx,.xlsx,.xls" style="display:none" onchange="uploadSpecialistsFile(this)">
        <button class="btn btn-sm" style="background:#fff;border:1.5px solid var(--accent);color:var(--accent);font-weight:700;margin-right:8px" onclick="document.getElementById('input_upload_specialists').click()">📤 Загрузить специалистов (.docx / .xlsx)</button>
        <button class="btn btn-sm" onclick="openAddSpecialistModal()">+ Добавить специалиста</button>
      `;
    }
    renderSpecialistsView(container);
  } else if (S.teamActiveTab === 'poa') {
    if (topActions) {
      topActions.innerHTML = `
        <input type="file" id="input_upload_poa" accept=".xlsx,.xls" style="display:none" onchange="uploadPoaFile(this)">
        <input type="file" id="input_upload_poa_pdf" accept=".pdf,.png,.jpg,.jpeg" style="display:none" onchange="uploadAndParsePoaFile(this)">
        <button class="btn btn-sm btn-ghost" style="border:1px solid var(--border);margin-right:6px" onclick="downloadPoaTemplateExcel()" title="Скачать шаблон Excel">📄 Шаблон Excel</button>
        <button class="btn btn-sm btn-ghost" style="border:1px solid var(--border);margin-right:6px" onclick="exportPoaToExcel()" title="Экспорт реестра в Excel">📤 Экспорт (.xlsx)</button>
        <button class="btn btn-sm" style="background:#fff;border:1.5px solid var(--accent);color:var(--accent);font-weight:700;margin-right:6px" onclick="document.getElementById('input_upload_poa').click()" title="Импорт реестра из Excel">📥 Загрузить реестр (.xlsx)</button>
        <button class="btn btn-sm" style="background:#eff6ff;border:1.5px solid #3b82f6;color:#1d4ed8;font-weight:700;margin-right:8px" onclick="document.getElementById('input_upload_poa_pdf').click()" title="Авторазбор скана или PDF бланка доверенности М-2">📑 Разбор скана / PDF</button>
        <button class="btn btn-sm btn-primary" onclick="openAddPoaModal()">+ Добавить доверенность</button>
      `;
    }
    renderPoaView(container);
  } else {
    var formOpen = S.userFormOpen || false;
    if (topActions) {
      topActions.innerHTML = `<button class="btn" onclick="toggleUserForm()">${formOpen ? '✕ Закрыть форму' : '+ Добавить пользователя'}</button>`;
    }
    renderUsersView(container);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ВКЛАДКА «СПЕЦИАЛИСТЫ И МОНТАЖНИКИ»
// ─────────────────────────────────────────────────────────────────────────────

function renderSpecialistsView(container) {
  var q = (S.specSearch || '').toLowerCase();
  var withPass = S.specWithPassport;

  if ((!S.specialists || S.specialists.length === 0) && !q && !withPass) {
    container.innerHTML = `
      <div class="card p" style="text-align:center; padding:3.5rem 1.5rem; background:rgba(234,88,12,.03); border:1.5px dashed var(--accent); border-radius:14px; margin-top:.5rem">
        <div style="font-size:3rem; margin-bottom:12px">👷📋</div>
        <h2 style="margin:0 0 10px 0; font-size:1.3rem">База специалистов пуста</h2>
        <p style="color:var(--text-2); max-width:560px; margin:0 auto 1.5rem auto; font-size:.9rem; line-height:1.5">
          Загрузите официальный документ (Word <b>.docx</b>) или таблицу Excel (<b>.xlsx</b>) с данными монтажников и паспортами. Система автоматически распознает ФИО, паспорта, телефоны и сформирует справочник.
        </p>
        <button class="btn btn-lg" onclick="document.getElementById('input_upload_specialists').click()" style="background:var(--accent); color:#fff; font-weight:700; padding:.8rem 2rem; font-size:1rem; border-radius:8px; cursor:pointer">
          📤 Выбрать файл для загрузки (.docx / .xlsx)
        </button>
      </div>
    `;
    return;
  }

  var list = (S.specialists || []).filter(function(s) {
    if (withPass && (!s.passport_raw || s.passport_raw.trim() === '')) return false;
    if (!q) return true;
    var matchName = (s.full_name || '').toLowerCase().includes(q);
    var matchPhone = (s.phone || '').toLowerCase().includes(q);
    var matchPass = (s.passport_raw || '').toLowerCase().includes(q) || (s.passport_series_number || '').toLowerCase().includes(q);
    var matchOrg = (s.organization || '').toLowerCase().includes(q);
    return matchName || matchPhone || matchPass || matchOrg;
  });

  var rows = list.map(renderSpecialistRowHtml).join('');

  container.innerHTML = `
    <!-- ФИЛЬТРЫ И ПОИСК -->
    <div class="card p mb" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap">
      <div style="position:relative; flex:1; min-width:260px">
        <input type="text" id="spec_search_input" value="${escHtml(S.specSearch || '')}" placeholder="🔍 Поиск по ФИО, телефону, паспорту или компании..." 
               style="width:100%; padding:8px 32px 8px 12px; border:1px solid var(--border); border-radius:8px"
               oninput="onSpecSearch(this.value)">
        <button id="spec_search_clear_btn" onclick="clearSpecSearch()" 
                style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--text-3); font-size:1.1rem; display:${S.specSearch ? 'block' : 'none'}" 
                title="Очистить поиск">&times;</button>
      </div>
      <label style="display:flex; align-items:center; gap:6px; font-size:.85rem; font-weight:600; cursor:pointer; user-select:none">
        <input type="checkbox" ${withPass ? 'checked' : ''} onchange="onSpecPassportToggle(this.checked)">
        Только с паспортными данными (${(S.specialists||[]).filter(x => x.passport_raw && x.passport_raw.trim() !== '').length})
      </label>
      <div id="spec_count_badge" style="font-size:.82rem; color:var(--text-3)">Показано: <b>${list.length}</b> из ${(S.specialists||[]).length}</div>
    </div>

    <!-- ТАБЛИЦА СПЕЦИАЛИСТОВ -->
    <div class="card tbl-wrap">
      <table>
        <thead>
          <tr style="background:var(--bg)">
            <th>ФИО и Должность</th>
            <th>Организация / Подрядчик</th>
            <th>Телефон</th>
            <th>Паспортные данные (для допуска)</th>
            <th>Действующая доверенность</th>
            <th style="width:80px"></th>
          </tr>
        </thead>
        <tbody id="spec_table_body">
          ${rows || '<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--text-3)">Специалисты не найдены</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderSpecialistRowHtml(s) {
  var poaBadge = '<span class="badge b-gray" style="font-size:.7rem">Нет</span>';
  if (s.active_poas && s.active_poas.length > 0) {
    var latest = s.active_poas[0];
    var dStr = latest.valid_until ? new Date(latest.valid_until).toLocaleDateString('ru') : '';
    poaBadge = `<span class="badge b-green" style="font-size:.72rem" title="${escHtml(latest.contractor || '')}">№ ${escHtml(latest.number)}${dStr ? ' (до ' + dStr + ')' : ''}</span>`;
    if (s.active_poas.length > 1) {
      poaBadge += ` <span style="font-size:.68rem; color:var(--text-3)">+${s.active_poas.length - 1}</span>`;
    }
  }

  var empBadge = '';
  var empType = s.employment_type || 'subcontractor_worker';
  if (empType === 'staff') {
    empBadge = '<span class="badge b-green" style="font-size:.68rem">🏢 Штатный</span>';
  } else if (empType === 'self_employed') {
    empBadge = '<span class="badge b-blue" style="font-size:.68rem">💼 Самозанятый (СЗ)</span>';
  } else if (empType === 'sole_proprietor') {
    empBadge = '<span class="badge b-yellow" style="font-size:.68rem">🏛️ ИП</span>';
  } else {
    empBadge = '<span class="badge b-gray" style="font-size:.68rem">👷 Монтажник субподрядчика</span>';
  }

  var autoDisplay = s.auto_number 
    ? `<div style="font-size:.73rem; color:var(--text-2); margin-top:3px" title="Автотранспорт для допуска">🚗 <b>${escHtml(s.auto_number)}</b></div>` 
    : '';

  var passDisplay = '—';
  if (s.passport_raw) {
    passDisplay = `<div style="font-size:.8rem; line-height:1.25">${escHtml(s.passport_raw)}</div>`;
  } else if (s.passport_series_number) {
    passDisplay = `<div style="font-weight:600; font-size:.8rem">${escHtml(s.passport_series_number)}</div>`;
    if (s.passport_issued_by) passDisplay += `<div style="font-size:.72rem; color:var(--text-3)">${escHtml(s.passport_issued_by)}</div>`;
  }

  var basisDisplay = s.acting_basis
    ? `<div style="font-size:.7rem; color:var(--text-3); margin-top:2px">Осн: ${escHtml(s.acting_basis)}</div>`
    : '';

  return `
    <tr id="spec_row_${s.id}" data-spec-id="${s.id}" style="border-bottom: 1px solid var(--border); transition: background .2s">
      <td style="padding: 10px 12px; font-weight:600">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap">
          <span>${escHtml(s.full_name)}</span>
          ${empBadge}
        </div>
        <div style="font-size:.73rem; color:var(--text-3); font-weight:normal; margin-top:2px">
          ${escHtml(s.position || 'Монтажник СКС')}
        </div>
        ${basisDisplay}
        ${autoDisplay}
      </td>
      <td style="padding: 10px 12px">
        <div style="font-weight:600; font-size:.82rem">${escHtml(s.organization || 'ООО "Ультима"')}</div>
        ${s.contractor_name ? '<div style="font-size:.72rem; color:var(--text-3)">' + escHtml(s.contractor_name) + '</div>' : ''}
      </td>
      <td style="padding: 10px 12px; white-space:nowrap; font-size:.85rem">
        ${s.phone ? `<a href="tel:${escHtml(s.phone)}" style="color:var(--text); text-decoration:none">📞 ${escHtml(s.phone)}</a>` : '<span style="color:var(--text-3)">—</span>'}
      </td>
      <td style="padding: 10px 12px; max-width:320px">
        ${passDisplay}
      </td>
      <td style="padding: 10px 12px">
        ${poaBadge}
      </td>
      <td style="padding: 10px 12px; text-align:right; white-space:nowrap">
        <button class="btn btn-sm btn-ghost" onclick="editSpecialist(${s.id})" title="Редактировать">✏️</button>
        <button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="deleteSpecialist(${s.id})" title="Удалить">✕</button>
      </td>
    </tr>
  `;
}

function updateSpecialistsList() {
  var tbody = document.getElementById('spec_table_body');
  var badge = document.getElementById('spec_count_badge');
  if (tbody) {
    var q = (S.specSearch || '').toLowerCase();
    var withPass = S.specWithPassport;
    var list = (S.specialists || []).filter(function(s) {
      if (withPass && (!s.passport_raw || s.passport_raw.trim() === '')) return false;
      if (!q) return true;
      var matchName = (s.full_name || '').toLowerCase().includes(q);
      var matchPhone = (s.phone || '').toLowerCase().includes(q);
      var matchPass = (s.passport_raw || '').toLowerCase().includes(q) || (s.passport_series_number || '').toLowerCase().includes(q);
      var matchOrg = (s.organization || '').toLowerCase().includes(q);
      return matchName || matchPhone || matchPass || matchOrg;
    });
    tbody.innerHTML = list.map(renderSpecialistRowHtml).join('') || '<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--text-3)">Специалисты не найдены</td></tr>';
    if (badge) badge.innerHTML = 'Показано: <b>' + list.length + '</b> из ' + (S.specialists||[]).length;
  } else {
    var container = document.getElementById('team_tab_content');
    if (container) renderSpecialistsView(container);
  }
}

var _specSearchTimer = null;
function onSpecSearch(val) {
  S.specSearch = val;
  var btn = document.getElementById('spec_search_clear_btn');
  if (btn) btn.style.display = val ? 'block' : 'none';
  clearTimeout(_specSearchTimer);
  _specSearchTimer = setTimeout(function() {
    updateSpecialistsList();
  }, 100);
}

function clearSpecSearch() {
  S.specSearch = '';
  var inp = document.getElementById('spec_search_input');
  if (inp) { inp.value = ''; inp.focus(); }
  var btn = document.getElementById('spec_search_clear_btn');
  if (btn) btn.style.display = 'none';
  updateSpecialistsList();
}

function onSpecPassportToggle(checked) {
  S.specWithPassport = checked;
  updateSpecialistsList();
}

function openAddSpecialistModal() {
  showModal('👷 Новый специалист', [
    { 
      key: 'fullName', 
      label: 'ФИО специалиста', 
      required: true,
      placeholder: 'Начните вводить ФИО (например: Иванов Иван)...',
      hint: '💡 При вводе ФИО система ищет специалистов в базе и автоматически заполнит телефон, организацию и паспортные данные',
      autocomplete: {
        minChars: 2,
        search: function(q) {
          return api('/specialists?q=' + encodeURIComponent(q) + '&limit=15');
        },
        renderItem: function(s) {
          var cName = s.contractor_name || s.organization || 'ООО "Ультима"';
          var hasPass = s.passport_series_number || s.passport_raw;
          var passText = s.passport_series_number ? ('🪪 Паспорт: ' + s.passport_series_number) : (hasPass ? '🪪 Паспорт заполнен' : '⚠️ Паспорт не заполнен');
          var phone = s.phone || 'Нет тел.';
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px">
              <strong style="color:var(--text); font-size:.85rem">${escHtml(s.full_name)}</strong>
              <span class="badge b-gray" style="font-size:.68rem">${escHtml(s.position || 'Монтажник')}</span>
            </div>
            <div style="font-size:.75rem; color:var(--text-3); display:flex; gap:10px; align-items:center; flex-wrap:wrap">
              <span>📞 ${escHtml(phone)}</span>
              <span>${passText}</span>
              <span style="color:var(--text-2); margin-left:auto">🏢 ${escHtml(cName)}</span>
            </div>
          `;
        },
        getValue: function(s) { return s.full_name; },
        badgeText: function(s) {
          return `✓ Найден в базе (#${s.id}): <b>${escHtml(s.full_name)}</b> · Данные заполнены, запись обновится при сохранении`;
        },
        onSelect: function(s, inputs, modal) {
          modal._extraData.specialistId = s.id;
          if (inputs.position && s.position) inputs.position.value = s.position;
          if (inputs.organization && s.organization) inputs.organization.value = s.organization;
          if (inputs.phone && s.phone) inputs.phone.value = s.phone;
          if (inputs.contractorId && s.contractor_id != null) inputs.contractorId.value = String(s.contractor_id);
          if (inputs.employmentType && s.employment_type) inputs.employmentType.value = s.employment_type;
          if (inputs.autoNumber && s.auto_number) inputs.autoNumber.value = s.auto_number;
          if (inputs.actingBasis && s.acting_basis) inputs.actingBasis.value = s.acting_basis;
          if (inputs.passportRaw && s.passport_raw) inputs.passportRaw.value = s.passport_raw;
          if (inputs.passportSeriesNumber && s.passport_series_number) inputs.passportSeriesNumber.value = s.passport_series_number;
        },
        onClear: function(inputs, modal) {
          delete modal._extraData.specialistId;
        }
      }
    },
    { key: 'employmentType', label: 'Форма занятости / Статус', type: 'select', value: 'subcontractor_worker', options: [
        { value: 'subcontractor_worker', label: '👷 Монтажник субподрядчика' },
        { value: 'staff', label: '🏢 Штатный сотрудник' },
        { value: 'self_employed', label: '💼 Самозанятый (СЗ)' },
        { value: 'sole_proprietor', label: '🏛️ Индивидуальный предприниматель (ИП)' }
      ]
    },
    { key: 'position', label: 'Должность', value: 'Монтажник СКС' },
    { key: 'organization', label: 'Организация', value: 'ООО "Ультима"' },
    { key: 'phone', label: 'Номер телефона', placeholder: '+7 (999) 000-00-00' },
    { key: 'contractorId', label: 'Привязка к контрагенту (если субподряд)', type: 'select', value: '', options:
        [{ value: '', label: '— Собственный сотрудник (ООО Ультима) —' }].concat((S.contractors || []).map(function(c) { return { value: c.id, label: c.name_short }; }))
    },
    { key: 'autoNumber', label: 'Автотранспорт для допуска (марка, гос. номер)', placeholder: 'например: Газель А123ВС77' },
    { key: 'actingBasis', label: 'Основание полномочий (Устав / Доверенность)', placeholder: 'например: Устава / Доверенность №1 от 15.01.2025' },
    { key: 'passportRaw', label: 'Полные паспортные данные (для допуска в Word)', type: 'textarea', placeholder: 'Серия, номер, кем и когда выдан, код подразделения' },
    { key: 'passportSeriesNumber', label: 'Серия и Номер паспорта (кратко)', placeholder: '5014 252604' }
  ], function(d) {
    api('/specialists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        specialist_id: d.specialistId || null,
        full_name: d.fullName,
        position: d.position,
        organization: d.organization,
        phone: d.phone,
        contractor_id: d.contractorId || null,
        employment_type: d.employmentType,
        auto_number: d.autoNumber,
        acting_basis: d.actingBasis,
        passport_raw: d.passportRaw,
        passport_series_number: d.passportSeriesNumber
      })
    }).then(function(res) {
      if (res && res.error) return alert(res.error);
      api('/specialists').then(function(specs) {
        S.specialists = specs;
        renderTeamActiveTabContent();
      });
    });
  });
}

function editSpecialist(id) {
  var s = (S.specialists || []).find(x => x.id === id);
  if (!s) return;
  if (window.savePageScroll) window.savePageScroll('spec_row_' + id);

  showModal('✏️ Редактировать специалиста #' + id, [
    { key: 'fullName', label: 'ФИО специалиста', value: s.full_name, required: true },
    { key: 'employmentType', label: 'Форма занятости / Статус', type: 'select', value: s.employment_type || 'subcontractor_worker', options: [
        { value: 'subcontractor_worker', label: '👷 Монтажник субподрядчика' },
        { value: 'staff', label: '🏢 Штатный сотрудник' },
        { value: 'self_employed', label: '💼 Самозанятый (СЗ)' },
        { value: 'sole_proprietor', label: '🏛️ Индивидуальный предприниматель (ИП)' }
      ]
    },
    { key: 'position', label: 'Должность', value: s.position || 'Монтажник СКС' },
    { key: 'organization', label: 'Организация', value: s.organization || 'ООО "Ультима"' },
    { key: 'phone', label: 'Номер телефона', value: s.phone || '' },
    { key: 'contractorId', label: 'Привязка к контрагенту (если субподряд)', type: 'select', value: s.contractor_id || '', options:
        [{ value: '', label: '— Собственный сотрудник (ООО Ультима) —' }].concat((S.contractors || []).map(function(c) { return { value: c.id, label: c.name_short }; }))
    },
    { key: 'autoNumber', label: 'Автотранспорт для допуска (марка, гос. номер)', value: s.auto_number || '', placeholder: 'например: Газель А123ВС77' },
    { key: 'actingBasis', label: 'Основание полномочий (Устав / Доверенность)', value: s.acting_basis || '', placeholder: 'например: Устава / Доверенность №1 от 15.01.2025' },
    { key: 'passportRaw', label: 'Полные паспортные данные (для письма на допуск)', type: 'textarea', value: s.passport_raw || '' },
    { key: 'passportSeriesNumber', label: 'Серия и Номер паспорта', value: s.passport_series_number || '' }
  ], function(d) {
    api('/specialists/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: d.fullName,
        position: d.position,
        organization: d.organization,
        phone: d.phone,
        contractor_id: d.contractorId || null,
        employment_type: d.employmentType,
        auto_number: d.autoNumber,
        acting_basis: d.actingBasis,
        passport_raw: d.passportRaw,
        passport_series_number: d.passportSeriesNumber
      })
    }).then(function(res) {
      if (res && res.error) return alert(res.error);
      api('/specialists').then(function(specs) {
        S.specialists = specs;
        renderTeamActiveTabContent();
        if (window.restorePageScroll) window.restorePageScroll('spec_row_' + id);
      });
    });
  });
}

function deleteSpecialist(id) {
  if (!confirm('Удалить специалиста из базы?')) return;
  api('/specialists/' + id, { method: 'DELETE' }).then(function(res) {
    if (res && res.error) return alert(res.error);
    api('/specialists').then(function(specs) {
      S.specialists = specs;
      renderTeamActiveTabContent();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ВКЛАДКА «РЕЕСТР ДОВЕРЕННОСТЕЙ»
// ─────────────────────────────────────────────────────────────────────────────

function renderPoaView(container) {
  var q = String(S.poaSearch || '').trim().toLowerCase();
  var filterStatus = S.poaFilterStatus || 'all';

  if ((!S.powersOfAttorney || S.powersOfAttorney.length === 0) && !q && filterStatus === 'all') {
    container.innerHTML = `
      <div class="card p" style="text-align:center; padding:3.5rem 1.5rem; background:rgba(234,88,12,.03); border:1.5px dashed var(--accent); border-radius:14px; margin-top:.5rem">
        <div style="font-size:3rem; margin-bottom:12px">📜📋</div>
        <h2 style="margin:0 0 10px 0; font-size:1.3rem">Реестр доверенностей пуст</h2>
        <p style="color:var(--text-2); max-width:560px; margin:0 auto 1.5rem auto; font-size:.9rem; line-height:1.5">
          Загрузите файл реестра доверенностей в формате Excel (<b>.xlsx</b>). Система автоматически загрузит номера, подотчетных лиц, сроки действия и свяжет их с контрагентами и специалистами.
        </p>
        <button class="btn btn-lg" onclick="document.getElementById('input_upload_poa').click()" style="background:var(--accent); color:#fff; font-weight:700; padding:.8rem 2rem; font-size:1rem; border-radius:8px; cursor:pointer">
          📤 Выбрать реестр доверенностей (.xlsx)
        </button>
      </div>
    `;
    return;
  }

  var list = (S.powersOfAttorney || []).filter(function(p) {
    if (filterStatus !== 'all' && p.computed_status !== filterStatus) return false;
    if (!q) return true;
    var matchNum = String(p.number || '').toLowerCase().includes(q);
    var matchPerson = String(p.person_name || p.specialist_name || '').toLowerCase().includes(q);
    var matchContr = String(p.contractor_name || '').toLowerCase().includes(q);
    var matchOrg = String(p.organization || '').toLowerCase().includes(q);
    var matchPhone = String(p.specialist_phone || '').toLowerCase().includes(q);
    return matchNum || matchPerson || matchContr || matchOrg || matchPhone;
  });

  var countActive = (S.powersOfAttorney || []).filter(x => x.computed_status === 'active').length;
  var countExpiring = (S.powersOfAttorney || []).filter(x => x.computed_status === 'expiring').length;
  var countExpired = (S.powersOfAttorney || []).filter(x => x.computed_status === 'expired').length;

  var rows = list.map(renderPoaRowHtml).join('');
  var countBadgeHtml = q 
    ? `<div id="poa_count_badge" style="font-size:.76rem;color:var(--text-3);margin-top:4px">Найдено: <b>${list.length}</b> из ${(S.powersOfAttorney||[]).length}</div>`
    : `<div id="poa_count_badge" style="font-size:.76rem;color:var(--text-3);margin-top:4px">Всего в реестре: <b>${(S.powersOfAttorney||[]).length}</b></div>`;

  container.innerHTML = `
    <!-- ПАНЕЛЬ ФИЛЬТРОВ И СТАТУСОВ -->
    <div class="card p mb" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap">
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn btn-sm ${filterStatus === 'all' ? '' : 'btn-ghost'}" data-poa-filter="all" onclick="setPoaFilter('all')">Все (${(S.powersOfAttorney||[]).length})</button>
        <button class="btn btn-sm ${filterStatus === 'active' ? '' : 'btn-ghost'}" data-poa-filter="active" onclick="setPoaFilter('active')" style="color:var(--green)">🟢 Действующие (${countActive})</button>
        <button class="btn btn-sm ${filterStatus === 'expiring' ? '' : 'btn-ghost'}" data-poa-filter="expiring" onclick="setPoaFilter('expiring')" style="color:var(--orange)">🟡 Истекают (<30 дн) (${countExpiring})</button>
        <button class="btn btn-sm ${filterStatus === 'expired' ? '' : 'btn-ghost'}" data-poa-filter="expired" onclick="setPoaFilter('expired')" style="color:var(--red)">🔴 Просроченные (${countExpired})</button>
      </div>
      <div style="position:relative; flex:1; min-width:240px; max-width:360px">
        <input type="text" id="poa_search_input" value="${escHtml(S.poaSearch || '')}" placeholder="🔍 Поиск по номеру, ФИО или контрагенту..." 
               style="width:100%; padding:8px 32px 8px 12px; border:1px solid var(--border); border-radius:8px"
               oninput="onPoaSearch(this.value)">
        <button id="poa_search_clear_btn" onclick="clearPoaSearch()" 
                style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--text-3); font-size:1.1rem; display:${S.poaSearch ? 'block' : 'none'}" 
                title="Очистить поиск">&times;</button>
        ${countBadgeHtml}
      </div>
    </div>

    <!-- ТАБЛИЦА ДОВЕРЕННОСТЕЙ -->
    <div class="card tbl-wrap">
      <table>
        <thead>
          <tr style="background:var(--bg)">
            <th>Номер</th>
            <th>Дата выдачи</th>
            <th>Срок действия</th>
            <th>Подотчетное лицо</th>
            <th>Организация</th>
            <th>Контрагент</th>
            <th style="width:80px"></th>
          </tr>
        </thead>
        <tbody id="poa_table_body">
          ${rows || '<tr><td colspan="7" style="text-align:center; padding:3rem; color:var(--text-3)">Доверенности не найдены</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  // input listener is directly inline oninput
}

function renderPoaRowHtml(p) {
  if (!p) return '';
  var statusBadge = '';
  if (p.computed_status === 'expired') {
    statusBadge = '<span class="badge b-red">⚠️ Просрочена</span>';
  } else if (p.computed_status === 'expiring') {
    statusBadge = '<span class="badge b-yellow">⏳ Истекает</span>';
  } else {
    statusBadge = '<span class="badge b-green">✓ Действует</span>';
  }

  var issueDateStr = '—';
  if (p.issue_date) {
    try {
      var d1 = new Date(p.issue_date);
      if (!isNaN(d1.getTime())) issueDateStr = d1.toLocaleDateString('ru');
    } catch(e) {}
  }

  var validUntilStr = 'бессрочно';
  if (p.valid_until) {
    try {
      var d2 = new Date(p.valid_until);
      if (!isNaN(d2.getTime())) validUntilStr = d2.toLocaleDateString('ru');
    } catch(e) {}
  }

  var personName = p.person_name || p.specialist_name || '—';
  var contractorName = p.contractor_name || '—';
  var orgName = p.organization || 'ООО "Ультима"';

  return `
    <tr id="poa_row_${p.id}" data-poa-id="${p.id}" style="border-bottom: 1px solid var(--border); transition: background .2s">
      <td style="padding: 10px 12px; font-weight:700">
        <div style="font-family:monospace; font-size:.92rem">${escHtml(p.number || '—')}</div>
      </td>
      <td style="padding: 10px 12px; font-size:.85rem; color:var(--text-2)">${issueDateStr}</td>
      <td style="padding: 10px 12px; font-weight:600; font-size:.85rem">
        <div>${validUntilStr}</div>
        <div style="margin-top:2px">${statusBadge}</div>
      </td>
      <td style="padding: 10px 12px">
        <div style="font-weight:600">${escHtml(personName)}</div>
        ${p.specialist_phone ? '<div style="font-size:.72rem; color:var(--text-3)">📞 ' + escHtml(p.specialist_phone) + '</div>' : ''}
      </td>
      <td style="padding: 10px 12px; font-size:.85rem">${escHtml(orgName)}</td>
      <td style="padding: 10px 12px; font-weight:600; font-size:.85rem">${escHtml(contractorName)}</td>
      <td style="padding: 10px 12px; text-align:right; white-space:nowrap">
        <button class="btn btn-sm btn-ghost" style="color:var(--accent);font-weight:700;margin-right:2px" onclick="openPoaInEditor(${p.id})" title="Открыть в Редакторе форму М-2 с печатью организации">📄 М-2</button>
        ${p.scan_url ? `<a href="${escHtml(p.scan_url)}" target="_blank" class="btn btn-sm btn-ghost" style="color:#1d4ed8;margin-right:2px" title="Открыть прикрепленный скан/PDF">📎 Скан</a>` : ''}
        <button class="btn btn-sm btn-ghost" onclick="editPoa(${p.id})" title="Редактировать">✏️</button>
        <button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="deletePoa(${p.id})" title="Удалить">🗑️</button>
      </td>
    </tr>
  `;
}

function updatePoaList() {
  var tbody = document.getElementById('poa_table_body');
  var badge = document.getElementById('poa_count_badge');
  if (tbody) {
    var q = String(S.poaSearch || '').trim().toLowerCase();
    var filterStatus = S.poaFilterStatus || 'all';
    var list = (S.powersOfAttorney || []).filter(function(p) {
      if (filterStatus !== 'all' && p.computed_status !== filterStatus) return false;
      if (!q) return true;
      var matchNum = String(p.number || '').toLowerCase().includes(q);
      var matchPerson = String(p.person_name || p.specialist_name || '').toLowerCase().includes(q);
      var matchContr = String(p.contractor_name || '').toLowerCase().includes(q);
      var matchOrg = String(p.organization || '').toLowerCase().includes(q);
      var matchPhone = String(p.specialist_phone || '').toLowerCase().includes(q);
      return matchNum || matchPerson || matchContr || matchOrg || matchPhone;
    });
    tbody.innerHTML = list.map(renderPoaRowHtml).join('') || '<tr><td colspan="7" style="text-align:center; padding:3rem; color:var(--text-3)">Доверенности не найдены</td></tr>';
    if (badge) {
      badge.innerHTML = q 
        ? ('Найдено: <b>' + list.length + '</b> из ' + (S.powersOfAttorney||[]).length)
        : ('Всего в реестре: <b>' + (S.powersOfAttorney||[]).length + '</b>');
    }
  } else {
    var container = document.getElementById('team_tab_content');
    if (container) renderPoaView(container);
  }
}

function setPoaFilter(status) {
  S.poaFilterStatus = status;
  var filterBtns = document.querySelectorAll('[data-poa-filter]');
  if (filterBtns && filterBtns.length) {
    filterBtns.forEach(function(btn) {
      if (btn.getAttribute('data-poa-filter') === status) {
        btn.classList.remove('btn-ghost');
      } else {
        btn.classList.add('btn-ghost');
      }
    });
    updatePoaList();
  } else {
    var container = document.getElementById('team_tab_content');
    if (container) renderPoaView(container);
  }
}

var _poaSearchTimer = null;
function onPoaSearch(val) {
  S.poaSearch = val;
  var btn = document.getElementById('poa_search_clear_btn');
  if (btn) btn.style.display = val ? 'block' : 'none';
  clearTimeout(_poaSearchTimer);
  _poaSearchTimer = setTimeout(function() {
    updatePoaList();
  }, 60);
}

function clearPoaSearch() {
  S.poaSearch = '';
  var inp = document.getElementById('poa_search_input');
  if (inp) { inp.value = ''; inp.focus(); }
  var btn = document.getElementById('poa_search_clear_btn');
  if (btn) btn.style.display = 'none';
  updatePoaList();
}

function openAddPoaModal() {
  showModal('📜 Новая доверенность', [
    { key: 'number', label: 'Номер доверенности', placeholder: '0УБП-000450', required: true },
    { 
      key: 'personName', 
      label: 'Подотчетное лицо (ФИО)', 
      required: true,
      placeholder: 'Начните вводить ФИО сотрудника...',
      hint: '💡 Выберите сотрудника или монтажника из справочника',
      autocomplete: {
        minChars: 2,
        search: function(q) {
          return api('/specialists?q=' + encodeURIComponent(q) + '&limit=15');
        },
        renderItem: function(s) {
          var cName = s.contractor_name || s.organization || 'ООО "Ультима"';
          return `
            <div style="font-weight:600; font-size:.85rem; color:var(--text)">${escHtml(s.full_name)}</div>
            <div style="font-size:.75rem; color:var(--text-3); margin-top:2px">
              ${escHtml(s.position || 'Специалист')} · 🏢 ${escHtml(cName)}
            </div>
          `;
        },
        getValue: function(s) { return s.full_name; },
        badgeText: function(s) {
          return `✓ Выбрано лицо: <b>${escHtml(s.full_name)}</b>`;
        },
        onSelect: function(s, inputs, modal) {
          if (inputs.organization && s.organization) {
            inputs.organization.value = s.organization;
          }
        }
      }
    },
    { 
      key: 'contractorName', 
      label: 'Контрагент (ЭТМ, Деловые линии и др.)', 
      placeholder: 'АО Электротехмонтаж',
      hint: '💡 Подсказка из списка контрагентов',
      autocomplete: {
        minChars: 2,
        search: function(q) {
          var low = q.toLowerCase();
          var matched = (S.contractors || []).filter(function(c) {
            return (c.name_short && c.name_short.toLowerCase().includes(low)) ||
                   (c.name_full && c.name_full.toLowerCase().includes(low)) ||
                   (c.inn && c.inn.includes(low));
          }).slice(0, 15);
          return Promise.resolve(matched);
        },
        renderItem: function(c) {
          return `
            <div style="font-weight:600; font-size:.85rem; color:var(--text)">${escHtml(c.name_short)}</div>
            <div style="font-size:.75rem; color:var(--text-3); margin-top:2px">ИНН: ${escHtml(c.inn || '—')}</div>
          `;
        },
        getValue: function(c) { return c.name_short; }
      }
    },
    { key: 'organization', label: 'Организация выдачи', value: 'ООО "Ультима"' },
    { key: 'issueDate', label: 'Дата выдачи', type: 'date' },
    { key: 'validUntil', label: 'Срок действия', type: 'date' }
  ], function(d) {
    api('/powers-of-attorney', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: d.number,
        person_name: d.personName,
        contractor_name: d.contractorName,
        organization: d.organization,
        issue_date: d.issueDate || null,
        valid_until: d.validUntil || null
      })
    }).then(function(res) {
      if (res && res.error) return alert(res.error);
      api('/powers-of-attorney').then(function(poas) {
        S.powersOfAttorney = poas;
        renderTeamActiveTabContent();
        if (res && res.id) {
          if (typeof showToast === 'function') {
            showToast('✓ Доверенность № ' + (res.number || '') + ' создана! <a href="javascript:void(0)" onclick="openPoaInEditor(' + res.id + ')" style="color:#fff;text-decoration:underline;font-weight:700;margin-left:8px">Открыть в Редакторе М-2 →</a>', 'success', 8000);
          }
        }
      });
    });
  });
}

function editPoa(id) {
  var p = (S.powersOfAttorney || []).find(x => x.id === id);
  if (!p) return;
  if (window.savePageScroll) window.savePageScroll('poa_row_' + id);

  var issueDateStr = p.issue_date ? p.issue_date.slice(0, 10) : '';
  var validUntilStr = p.valid_until ? p.valid_until.slice(0, 10) : '';

  showModal('✏️ Редактировать доверенность #' + id, [
    { key: 'number', label: 'Номер доверенности', value: p.number, required: true },
    { key: 'personName', label: 'Подотчетное лицо (ФИО)', value: p.person_name, required: true },
    { key: 'contractorName', label: 'Контрагент', value: p.contractor_name || '' },
    { key: 'organization', label: 'Организация выдачи', value: p.organization || 'ООО "Ультима"' },
    { key: 'issueDate', label: 'Дата выдачи', type: 'date', value: issueDateStr },
    { key: 'validUntil', label: 'Срок действия', type: 'date', value: validUntilStr }
  ], function(d) {
    api('/powers-of-attorney/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: d.number,
        person_name: d.personName,
        contractor_name: d.contractorName,
        organization: d.organization,
        issue_date: d.issueDate || null,
        valid_until: d.validUntil || null
      })
    }).then(function(res) {
      if (res && res.error) return alert(res.error);
      api('/powers-of-attorney').then(function(poas) {
        S.powersOfAttorney = poas;
        renderTeamActiveTabContent();
        if (window.restorePageScroll) window.restorePageScroll('poa_row_' + id);
      });
    });
  });
}

function deletePoa(id) {
  if (!confirm('Удалить доверенность из реестра?')) return;
  api('/powers-of-attorney/' + id, { method: 'DELETE' }).then(function(res) {
    if (res && res.error) return alert(res.error);
    api('/powers-of-attorney').then(function(poas) {
      S.powersOfAttorney = poas;
      renderTeamActiveTabContent();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ВКЛАДКА «ДОСТУП В СИСТЕМУ» (Учетные записи)
// ─────────────────────────────────────────────────────────────────────────────

function renderUsersView(container) {
  var users = S.users || [];
  var rows = users.map(function(u) {
    var passInfo = u.passport_series_number 
      ? '<div style="font-size:.72rem;color:var(--text-3);margin-top:2px">Паспорт: ' + escHtml(u.passport_series_number) + '</div>' 
      : '';
    var rInfo = getUserRoleInfo(u.role);
    var regBadge = u.assigned_regions ? '<div style="font-size:.72rem;color:var(--text-3);margin-top:2px" title="Закрепленные регионы">📍 ' + escHtml(u.assigned_regions) + '</div>' : '';

    return `
      <tr id="user_row_${u.id}" data-user-id="${u.id}" style="border-bottom: 1px solid var(--border); transition: background .2s">
        <td style="padding: 10px 12px"><b>#${u.id}</b></td>
        <td style="padding: 10px 12px; font-weight:600">${escHtml(u.username)}</td>
        <td style="padding: 10px 12px">
          <span class="badge ${rInfo.badgeClass}" style="white-space:nowrap" title="${escHtml(rInfo.description)}">${rInfo.icon} ${rInfo.name}</span>
          ${regBadge}
          ${u.contractor_name ? '<div style="font-size:.72rem;color:var(--text-3);margin-top:2px">' + escHtml(u.contractor_name) + '</div>' : ''}
        </td>
        <td style="padding: 10px 12px">
          <div style="font-weight:600">${escHtml(u.full_name || '—')}</div>
          ${passInfo}
        </td>
        <td style="padding: 10px 12px">${escHtml(u.phone || '—')}</td>
        <td style="padding: 10px 12px; color:var(--text-2)">${escHtml(u.email || '—')}</td>
        <td style="padding: 10px 12px; color:var(--text-3); font-size:.75rem">${new Date(u.created_at).toLocaleDateString('ru')}</td>
        <td style="padding: 10px 12px; text-align:right">
          <button class="btn btn-sm btn-ghost" onclick="editUser(${u.id})" title="Редактировать сотрудника">✏️</button>
          ${u.username !== S.user.username ? `<button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="deleteUser(${u.id})" title="Удалить">✕</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  var formOpen = S.userFormOpen || false;

  container.innerHTML = `
    <!-- ФОРМА ДОБАВЛЕНИЯ (СКРЫТА ПО УМОЛЧАНИЮ) -->
    <div id="user_add_card" class="card p mb" style="display:${formOpen ? 'block' : 'none'}; border:1.5px solid var(--orange); animation: fadeIn 0.15s ease;">
      <div class="sec-title" style="margin-bottom:.75rem">Новый сотрудник с доступом в программу</div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:.75rem; margin-bottom:1rem">
        <input id="nu_name" type="text" placeholder="Логин *">
        <input id="nu_pass" type="password" placeholder="Пароль *">
        <input id="nu_full" type="text" placeholder="ФИО (как в паспорте)">
        <input id="nu_phone" type="text" placeholder="Телефон для связи">
        <input id="nu_email" type="email" placeholder="Email для писем">
        <select id="nu_role">
          ${STOCK_ROLE_LIST.map(function(r) { return '<option value="' + r.code + '">' + r.icon + ' ' + r.name + ' (' + r.description + ')</option>'; }).join('')}
        </select>
        <input id="nu_regions" type="text" placeholder="Закрепленные регионы (для Менеджера)">
        <select id="nu_contractor">
          <option value="">— Без контрагента (Штатный) —</option>
          ${(S.contractors || []).map(function(c) { return '<option value="' + c.id + '">' + escHtml(c.name_short) + '</option>'; }).join('')}
        </select>
      </div>
      <div style="text-align:right">
        <button class="btn btn-ghost btn-sm" onclick="toggleUserForm(false)" style="margin-right:8px">Отмена</button>
        <button class="btn" onclick="addUser()">+ Сохранить сотрудника</button>
      </div>
    </div>

    <div class="card tbl-wrap">
      <table>
        <thead>
          <tr style="background:var(--bg)">
            <th>ID</th>
            <th>Логин</th>
            <th>Роль</th>
            <th>ФИО</th>
            <th>Телефон</th>
            <th>Email</th>
            <th>Дата создания</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="users-table">
          ${rows || '<tr><td colspan="8" style="text-align:center; padding:2rem">Нет сотрудников</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function toggleUserForm(open) {
  S.userFormOpen = (open !== undefined) ? open : !S.userFormOpen;
  renderApp();
}

function editUser(id) {
  var user = (S.users || []).find(u => u.id === id);
  if (!user) return;
  if (window.savePageScroll) window.savePageScroll('user_row_' + id);

  var issueDateStr = user.passport_issue_date ? user.passport_issue_date.slice(0, 10) : '';

  showModal('✏️ Редактировать пользователя #' + id, [
    { key: 'username', label: 'Логин', value: user.username, required: true },
    { key: 'password', label: 'Новый пароль (оставьте пустым, если не меняется)', type: 'password', value: '' },
    { key: 'fullName', label: 'ФИО (полностью)', value: user.full_name || '' },
    { key: 'phone',    label: 'Телефон (для связи и допусков)', value: user.phone || '' },
    { key: 'email',    label: 'Email для писем', value: user.email || '' },
    { key: 'role',     label: 'Роль в системе (8 ролей)', type: 'select', value: user.role || 'installer', options:
        STOCK_ROLE_LIST.map(function(r) { return { value: r.code, label: r.icon + ' ' + r.name + ' — ' + r.description }; })
    },
    { key: 'assignedRegions', label: 'Закрепленные регионы (для Менеджера)', value: user.assigned_regions || '', placeholder: 'Москва, Тюмень, Санкт-Петербург' },
    { key: 'contractorId', label: 'Привязка к контрагенту', type: 'select', value: user.contractor_id || '', options:
        [{ value: '', label: '— Без контрагента (Штатный) —' }].concat((S.contractors || []).map(function(c) { return { value: c.id, label: c.name_short }; }))
    },
    { key: 'passportSeriesNumber', label: 'Паспорт: Серия и Номер', value: user.passport_series_number || '' },
    { key: 'passportIssuedBy',     label: 'Паспорт: Кем выдан', value: user.passport_issued_by || '' },
    { key: 'passportIssueDate',    label: 'Паспорт: Дата выдачи', type: 'date', value: issueDateStr },
    { key: 'passportCode',         label: 'Паспорт: Код подразделения', value: user.passport_code || '' },
    { key: 'passportScanUrl',      label: 'Ссылка на скан паспорта (или файл)', value: user.passport_scan_url || '' }
  ], function(d) {
    api('/users/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d)
    }).then(function(res) {
      if (res && res.error) return alert(res.error);
      api('/users').then(list => {
        S.users = list;
        renderApp();
        if (window.restorePageScroll) window.restorePageScroll('user_row_' + id);
      });
    });
  });
}

function addUser() {
  var data = {
    username: document.getElementById('nu_name').value.trim(),
    password: document.getElementById('nu_pass').value,
    fullName: document.getElementById('nu_full').value.trim(),
    phone:    document.getElementById('nu_phone') ? document.getElementById('nu_phone').value.trim() : null,
    email:    document.getElementById('nu_email').value.trim(),
    role:     document.getElementById('nu_role').value,
    assignedRegions: document.getElementById('nu_regions') ? document.getElementById('nu_regions').value.trim() : null,
    contractorId: document.getElementById('nu_contractor').value || null
  };
  if(!data.username || !data.password) return alert('Заполните логин и пароль');

  api('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(function(res) {
    if (res && res.error) return alert(res.error);
    S.userFormOpen = false;
    api('/users').then(list => { S.users = list; renderApp(); });
  });
}

function deleteUser(id) {
  if(!confirm('Удалить пользователя?')) return;
  api('/users/' + id, { method: 'DELETE' }).then(() => renderApp());
}

function uploadSpecialistsFile(input) {
  if (!input || !input.files || !input.files[0]) return;
  var file = input.files[0];
  var formData = new FormData();
  formData.append('file', file);

  var banner = document.getElementById('upload_spec_status');
  if (banner) banner.innerHTML = '<div style="color:var(--accent);font-weight:600">⏳ Загрузка и распознавание специалистов...</div>';

  var token = S.token || localStorage.getItem('token') || '';
  fetch('/api/directories/upload-specialists', {
    method: 'POST',
    headers: token ? { 'Authorization': 'Bearer ' + token } : {},
    body: formData
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    if (res && res.error) {
      alert('Ошибка при загрузке: ' + res.error);
    } else {
      alert('✅ Специалисты успешно загружены!\nДобавлено новых: ' + (res.inserted || 0) + '\nОбновлено: ' + (res.updated || 0) + '\nВсего в файле: ' + (res.total || 0));
      api('/specialists').then(function(specs) {
        S.specialists = Array.isArray(specs) ? specs : [];
        var bSpecs = document.getElementById('badge_specs_count');
        if (bSpecs) bSpecs.textContent = '(' + S.specialists.length + ')';
        var container = document.getElementById('team_tab_content');
        if (container) renderSpecialistsView(container);
      });
    }
  })
  .catch(function(err) {
    alert('Ошибка сети при загрузке файла: ' + (err.message || err));
  })
  .finally(function() {
    input.value = '';
    if (banner) banner.innerHTML = '';
  });
}

function uploadPoaFile(input) {
  if (!input || !input.files || !input.files[0]) return;
  var file = input.files[0];
  var formData = new FormData();
  formData.append('file', file);

  var banner = document.getElementById('upload_poa_status');
  if (banner) banner.innerHTML = '<div style="color:var(--accent);font-weight:600">⏳ Загрузка реестра доверенностей и сопоставление контрагентов...</div>';

  var token = S.token || localStorage.getItem('token') || '';
  fetch('/api/directories/upload-poa', {
    method: 'POST',
    headers: token ? { 'Authorization': 'Bearer ' + token } : {},
    body: formData
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    if (res && res.error) {
      alert('Ошибка при загрузке: ' + res.error);
    } else {
      var p = res.poa || {};
      var c = res.contractors || {};
      alert('✅ Реестр доверенностей успешно загружен!\nДоверенностей добавлено: ' + (p.inserted || 0) + '\nДоверенностей обновлено: ' + (p.updated || 0) + '\nКонтрагентов связано/обновлено: ' + ((c.added || 0) + (c.updated || 0)));
      api('/powers-of-attorney').then(function(poas) {
        S.powersOfAttorney = Array.isArray(poas) ? poas : [];
        var bPoa = document.getElementById('badge_poa_count');
        if (bPoa) bPoa.textContent = '(' + S.powersOfAttorney.length + ')';
        var container = document.getElementById('team_tab_content');
        if (container) renderPoaView(container);
      });
    }
  })
  .catch(function(err) {
    alert('Ошибка сети при загрузке файла: ' + (err.message || err));
  })
  .finally(function() {
    input.value = '';
    if (banner) banner.innerHTML = '';
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// РАБОТА С ДОВЕРЕННОСТЯМИ М-2 (Редактор, распознавание, экспорт/шаблон)
// ─────────────────────────────────────────────────────────────────────────────

function openPoaInEditor(poaId) {
  var p = (S.powersOfAttorney || []).find(function(x) { return x.id === poaId; });
  var num = p ? p.number : poaId;
  if (typeof window.openDocumentEditor !== 'function') {
    return alert('Редактор документов временно недоступен');
  }
  window.openDocumentEditor({
    templateCode: 'poa_m2',
    poaId: poaId,
    title: 'Доверенность № ' + num + ' (форма М-2)',
    onSaved: function() {
      api('/powers-of-attorney').then(function(poas) {
        S.powersOfAttorney = poas;
        renderTeamActiveTabContent();
      });
    }
  });
}

function uploadAndParsePoaFile(input) {
  var file = input.files && input.files[0];
  if (!file) return;

  var fd = new FormData();
  fd.append('file', file);

  if (typeof showToast === 'function') {
    showToast('⏳ Распознавание формы доверенности М-2...', 'info', 4000);
  }

  fetch('/api/powers-of-attorney/parse-file', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + (S.token || '') },
    body: fd
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    input.value = '';
    if (!res || !res.ok) {
      return alert(res && res.error ? res.error : 'Не удалось распознать документ доверенности');
    }

    var d = res.data || {};
    var fileUrl = res.file_url || '';

    // Открываем модальное окно для сверки распознанных данных и создания
    showModal('📑 Распознана доверенность (Форма М-2)', [
      { key: 'number', label: 'Номер доверенности', value: d.number || '', required: true },
      { key: 'organization', label: 'Организация выдачи', value: d.organization || 'ООО "Ультима"', required: true },
      { key: 'personName', label: 'Подотчетное лицо (ФИО)', value: d.person_name || '', required: true },
      { key: 'contractorName', label: 'Контрагент (Поставщик)', value: d.contractor_name || '' },
      { key: 'issueDate', label: 'Дата выдачи', type: 'date', value: d.issue_date || '' },
      { key: 'validUntil', label: 'Срок действия', type: 'date', value: d.valid_until || '' },
      { key: 'scanUrl', label: 'Файл / скан', value: fileUrl, readonly: true }
    ], function(formData) {
      api('/powers-of-attorney', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: formData.number,
          person_name: formData.personName,
          contractor_name: formData.contractorName,
          organization: formData.organization,
          issue_date: formData.issueDate || null,
          valid_until: formData.validUntil || null,
          scan_url: fileUrl,
          specialist_id: d.specialist_id || null
        })
      }).then(function(newPoa) {
        if (newPoa && newPoa.error) return alert(newPoa.error);
        api('/powers-of-attorney').then(function(poas) {
          S.powersOfAttorney = poas;
          renderTeamActiveTabContent();
          if (newPoa && newPoa.id) {
            openPoaInEditor(newPoa.id);
          }
        });
      });
    }, {
      submitLabel: '✓ Добавить в реестр и открыть в Редакторе'
    });
  })
  .catch(function(err) {
    input.value = '';
    alert('Ошибка при распознавании файла: ' + (err.message || err));
  });
}

function exportPoaToExcel() {
  var list = S.powersOfAttorney || [];
  if (!list.length) {
    return alert('Реестр доверенностей пуст.');
  }

  var q = String(S.poaSearch || '').trim().toLowerCase();
  var filterStatus = S.poaFilterStatus || 'all';
  var filtered = list.filter(function(p) {
    if (filterStatus !== 'all' && p.computed_status !== filterStatus) return false;
    if (!q) return true;
    var matchNum = String(p.number || '').toLowerCase().includes(q);
    var matchPerson = String(p.person_name || p.specialist_name || '').toLowerCase().includes(q);
    var matchContr = String(p.contractor_name || '').toLowerCase().includes(q);
    var matchOrg = String(p.organization || '').toLowerCase().includes(q);
    var matchPhone = String(p.specialist_phone || '').toLowerCase().includes(q);
    return matchNum || matchPerson || matchContr || matchOrg || matchPhone;
  });

  if (!filtered.length) {
    return alert('Нет доверенностей, соответствующих условиям фильтра.');
  }

  if (window.XLSX) {
    var rows = [
      ['Номер доверенности', 'Дата выдачи', 'Срок действия', 'Статус', 'Подотчетное лицо', 'Телефон', 'Организация', 'Контрагент']
    ];
    filtered.forEach(function(p) {
      var st = p.computed_status === 'expired' ? 'Просрочена' : (p.computed_status === 'expiring' ? 'Истекает' : 'Действует');
      var iDate = p.issue_date ? p.issue_date.slice(0, 10).split('-').reverse().join('.') : '';
      var vDate = p.valid_until ? p.valid_until.slice(0, 10).split('-').reverse().join('.') : 'Бессрочно';
      rows.push([
        p.number || '',
        iDate,
        vDate,
        st,
        p.person_name || '',
        p.specialist_phone || '',
        p.organization || '',
        p.contractor_name || ''
      ]);
    });

    var ws = window.XLSX.utils.aoa_to_sheet(rows);
    var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Доверенности');
    var filename = 'Reestr_Doverennostey_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    window.XLSX.writeFile(wb, filename);
  } else {
    var csvContent = 'data:text/csv;charset=utf-8,\uFEFF' +
      'Номер;Дата выдачи;Срок действия;Статус;Подотчетное лицо;Организация;Контрагент\n' +
      filtered.map(function(p) {
        var st = p.computed_status === 'expired' ? 'Просрочена' : (p.computed_status === 'expiring' ? 'Истекает' : 'Действует');
        var iDate = p.issue_date ? p.issue_date.slice(0, 10).split('-').reverse().join('.') : '';
        var vDate = p.valid_until ? p.valid_until.slice(0, 10).split('-').reverse().join('.') : 'Бессрочно';
        return [
          `"${p.number || ''}"`,
          `"${iDate}"`,
          `"${vDate}"`,
          `"${st}"`,
          `"${p.person_name || ''}"`,
          `"${p.organization || ''}"`,
          `"${p.contractor_name || ''}"`
        ].join(';');
      }).join('\n');
    var encodedUri = encodeURI(csvContent);
    var link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'Reestr_Doverennostey_' + new Date().toISOString().slice(0, 10) + '.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

function downloadPoaTemplateExcel() {
  if (window.XLSX) {
    var rows = [
      ['Номер доверенности', 'Дата выдачи', 'Срок действия', 'Подотчетное лицо', 'Организация', 'Контрагент'],
      ['0УБП-000450', '30.10.2026', '31.12.2026', 'Чайка Алексей Николаевич', 'ООО "Ультима"', 'АО Электротехмонтаж'],
      ['0УБП-000451', '30.10.2026', '31.12.2026', 'Иванов Иван Иванович', 'ООО "Кабельные Системы"', 'ООО "СДЭК Бизнес Пост"']
    ];
    var ws = window.XLSX.utils.aoa_to_sheet(rows);
    var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Шаблон доверенностей');
    window.XLSX.writeFile(wb, 'Shablon_Reestra_Doverennostey.xlsx');
  } else {
    alert('Библиотека XLSX загружается. Попробуйте через пару секунд.');
  }
}

window.pageUsers = pageUsers;
window.setTeamTab = setTeamTab;
window.renderTeamActiveTabContent = renderTeamActiveTabContent;
window.onPoaSearch = onPoaSearch;
window.clearPoaSearch = clearPoaSearch;
window.setPoaFilter = setPoaFilter;
window.updatePoaList = updatePoaList;
window.uploadPoaFile = uploadPoaFile;
window.openAddPoaModal = openAddPoaModal;
window.editPoa = editPoa;
window.deletePoa = deletePoa;
window.openPoaInEditor = openPoaInEditor;
window.uploadAndParsePoaFile = uploadAndParsePoaFile;
window.exportPoaToExcel = exportPoaToExcel;
window.downloadPoaTemplateExcel = downloadPoaTemplateExcel;
window.uploadSpecialistsFile = uploadSpecialistsFile;
window.openAddSpecialistModal = openAddSpecialistModal;
window.editSpecialist = editSpecialist;
window.deleteSpecialist = deleteSpecialist;
window.onSpecSearch = onSpecSearch;
window.clearSpecSearch = clearSpecSearch;
window.onSpecPassportToggle = onSpecPassportToggle;