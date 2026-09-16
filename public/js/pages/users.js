// public/js/pages/users.js - Команда: Специалисты, Доверенности, Учетные записи

function pageUsers() {
  S.teamActiveTab = S.teamActiveTab || 'specialists';
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
          <h1 class="page-title" style="margin:0">Команда и Специалисты</h1>
          <div style="font-size:.82rem; color:var(--text-3); margin-top:2px">Единая база полевых сотрудников, паспортов, доверенностей и доступов к системе</div>
        </div>
        <div id="team_top_actions"></div>
      </div>

      <!-- ВЕРХНИЕ ВКЛАДКИ -->
      <div style="display:flex; gap:8px; border-bottom:1.5px solid var(--border); padding-bottom:6px; margin-bottom:1.25rem; flex-wrap:wrap">
        <button class="btn btn-sm ${S.teamActiveTab === 'specialists' ? '' : 'btn-ghost'}" onclick="setTeamTab('specialists')">
          👷 Специалисты и монтажники <span id="badge_specs_count" style="opacity:.8">(${S.specialists ? S.specialists.length : '...'})</span>
        </button>
        <button class="btn btn-sm ${S.teamActiveTab === 'poa' ? '' : 'btn-ghost'}" onclick="setTeamTab('poa')">
          📜 Реестр доверенностей <span id="badge_poa_count" style="opacity:.8">(${S.powersOfAttorney ? S.powersOfAttorney.length : '...'})</span>
        </button>
        <button class="btn btn-sm ${S.teamActiveTab === 'users' ? '' : 'btn-ghost'}" onclick="setTeamTab('users')">
          👤 Доступ в систему <span id="badge_users_count" style="opacity:.8">(${S.users ? S.users.length : '...'})</span>
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
      topActions.innerHTML = `<button class="btn" onclick="openAddSpecialistModal()">+ Добавить специалиста</button>`;
    }
    renderSpecialistsView(container);
  } else if (S.teamActiveTab === 'poa') {
    if (topActions) {
      topActions.innerHTML = `<button class="btn" onclick="openAddPoaModal()">+ Добавить доверенность</button>`;
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

  var list = (S.specialists || []).filter(function(s) {
    if (withPass && (!s.passport_raw || s.passport_raw.trim() === '')) return false;
    if (!q) return true;
    var matchName = (s.full_name || '').toLowerCase().includes(q);
    var matchPhone = (s.phone || '').toLowerCase().includes(q);
    var matchPass = (s.passport_raw || '').toLowerCase().includes(q) || (s.passport_series_number || '').toLowerCase().includes(q);
    var matchOrg = (s.organization || '').toLowerCase().includes(q);
    return matchName || matchPhone || matchPass || matchOrg;
  });

  var rows = list.map(function(s) {
    var poaBadge = '<span class="badge b-gray" style="font-size:.7rem">Нет</span>';
    if (s.active_poas && s.active_poas.length > 0) {
      var latest = s.active_poas[0];
      var dStr = latest.valid_until ? new Date(latest.valid_until).toLocaleDateString('ru') : '';
      poaBadge = `<span class="badge b-green" style="font-size:.72rem" title="${escHtml(latest.contractor || '')}">№ ${escHtml(latest.number)}${dStr ? ' (до ' + dStr + ')' : ''}</span>`;
      if (s.active_poas.length > 1) {
        poaBadge += ` <span style="font-size:.68rem; color:var(--text-3)">+${s.active_poas.length - 1}</span>`;
      }
    }

    var passDisplay = '—';
    if (s.passport_raw) {
      passDisplay = `<div style="font-size:.8rem; line-height:1.25">${escHtml(s.passport_raw)}</div>`;
    } else if (s.passport_series_number) {
      passDisplay = `<div style="font-weight:600; font-size:.8rem">${escHtml(s.passport_series_number)}</div>`;
      if (s.passport_issued_by) passDisplay += `<div style="font-size:.72rem; color:var(--text-3)">${escHtml(s.passport_issued_by)}</div>`;
    }

    return `
      <tr style="border-bottom: 1px solid var(--border)">
        <td style="padding: 10px 12px; font-weight:600">
          <div>${escHtml(s.full_name)}</div>
          <div style="font-size:.73rem; color:var(--text-3); font-weight:normal">${escHtml(s.position || 'Монтажник СКС')}</div>
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
  }).join('');

  container.innerHTML = `
    <!-- ФИЛЬТРЫ И ПОИСК -->
    <div class="card p mb" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap">
      <div style="display:flex; gap:10px; align-items:center; flex:1; min-width:260px">
        <input type="text" id="spec_search_input" value="${escHtml(S.specSearch)}" placeholder="🔍 Поиск по ФИО, телефону, паспорту или компании..." 
               style="flex:1; padding:8px 12px; border:1px solid var(--border); border-radius:8px"
               oninput="onSpecSearch(this.value)">
      </div>
      <label style="display:flex; align-items:center; gap:6px; font-size:.85rem; font-weight:600; cursor:pointer; user-select:none">
        <input type="checkbox" ${withPass ? 'checked' : ''} onchange="onSpecPassportToggle(this.checked)">
        Только с паспортными данными (${(S.specialists||[]).filter(x => x.passport_raw && x.passport_raw.trim() !== '').length})
      </label>
      <div style="font-size:.82rem; color:var(--text-3)">Показано: <b>${list.length}</b> из ${(S.specialists||[]).length}</div>
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
        <tbody>
          ${rows || '<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--text-3)">Специалисты не найдены</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function onSpecSearch(val) {
  S.specSearch = val;
  var container = document.getElementById('team_tab_content');
  if (container) renderSpecialistsView(container);
}

function onSpecPassportToggle(checked) {
  S.specWithPassport = checked;
  var container = document.getElementById('team_tab_content');
  if (container) renderSpecialistsView(container);
}

function openAddSpecialistModal() {
  showModal('👷 Новый специалист', [
    { key: 'fullName', label: 'ФИО специалиста', required: true },
    { key: 'position', label: 'Должность', value: 'Монтажник СКС' },
    { key: 'organization', label: 'Организация', value: 'ООО "Ультима"' },
    { key: 'phone', label: 'Номер телефона', placeholder: '+7 (999) 000-00-00' },
    { key: 'contractorId', label: 'Привязка к контрагенту (если субподряд)', type: 'select', value: '', options:
        [{ value: '', label: '— Собственный сотрудник (ООО Ультима) —' }].concat((S.contractors || []).map(function(c) { return { value: c.id, label: c.name_short }; }))
    },
    { key: 'passportRaw', label: 'Полные паспортные данные (для допуска в Word)', type: 'textarea', placeholder: 'Серия, номер, кем и когда выдан, код подразделения' },
    { key: 'passportSeriesNumber', label: 'Серия и Номер паспорта (кратко)', placeholder: '5014 252604' }
  ], function(d) {
    api('/specialists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: d.fullName,
        position: d.position,
        organization: d.organization,
        phone: d.phone,
        contractor_id: d.contractorId || null,
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

  showModal('✏️ Редактировать специалиста #' + id, [
    { key: 'fullName', label: 'ФИО специалиста', value: s.full_name, required: true },
    { key: 'position', label: 'Должность', value: s.position || 'Монтажник СКС' },
    { key: 'organization', label: 'Организация', value: s.organization || 'ООО "Ультима"' },
    { key: 'phone', label: 'Номер телефона', value: s.phone || '' },
    { key: 'contractorId', label: 'Привязка к контрагенту (если субподряд)', type: 'select', value: s.contractor_id || '', options:
        [{ value: '', label: '— Собственный сотрудник (ООО Ультима) —' }].concat((S.contractors || []).map(function(c) { return { value: c.id, label: c.name_short }; }))
    },
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
  var q = (S.poaSearch || '').toLowerCase();
  var filterStatus = S.poaFilterStatus || 'all';

  var list = (S.powersOfAttorney || []).filter(function(p) {
    if (filterStatus !== 'all' && p.computed_status !== filterStatus) return false;
    if (!q) return true;
    var matchNum = (p.number || '').toLowerCase().includes(q);
    var matchPerson = (p.person_name || '').toLowerCase().includes(q);
    var matchContr = (p.contractor_name || '').toLowerCase().includes(q);
    var matchOrg = (p.organization || '').toLowerCase().includes(q);
    return matchNum || matchPerson || matchContr || matchOrg;
  });

  var countActive = (S.powersOfAttorney || []).filter(x => x.computed_status === 'active').length;
  var countExpiring = (S.powersOfAttorney || []).filter(x => x.computed_status === 'expiring').length;
  var countExpired = (S.powersOfAttorney || []).filter(x => x.computed_status === 'expired').length;

  var rows = list.map(function(p) {
    var statusBadge = '';
    if (p.computed_status === 'expired') {
      statusBadge = '<span class="badge b-red">🔴 Просрочена</span>';
    } else if (p.computed_status === 'expiring') {
      statusBadge = '<span class="badge b-yellow">🟡 Истекает</span>';
    } else {
      statusBadge = '<span class="badge b-green">🟢 Действует</span>';
    }

    var issueDateStr = p.issue_date ? new Date(p.issue_date).toLocaleDateString('ru') : '—';
    var validUntilStr = p.valid_until ? new Date(p.valid_until).toLocaleDateString('ru') : 'Бессрочно';

    return `
      <tr style="border-bottom: 1px solid var(--border)">
        <td style="padding: 10px 12px; font-weight:700">
          <div style="font-family:monospace; font-size:.92rem">${escHtml(p.number)}</div>
        </td>
        <td style="padding: 10px 12px; font-size:.85rem; color:var(--text-2)">${issueDateStr}</td>
        <td style="padding: 10px 12px; font-weight:600; font-size:.85rem">
          <div>${validUntilStr}</div>
          <div style="margin-top:2px">${statusBadge}</div>
        </td>
        <td style="padding: 10px 12px">
          <div style="font-weight:600">${escHtml(p.person_name)}</div>
          ${p.specialist_phone ? '<div style="font-size:.72rem; color:var(--text-3)">📞 ' + escHtml(p.specialist_phone) + '</div>' : ''}
        </td>
        <td style="padding: 10px 12px; font-size:.85rem">${escHtml(p.organization || 'ООО "Ультима"')}</td>
        <td style="padding: 10px 12px; font-weight:600; font-size:.85rem">${escHtml(p.contractor_name || '—')}</td>
        <td style="padding: 10px 12px; text-align:right; white-space:nowrap">
          <button class="btn btn-sm btn-ghost" onclick="editPoa(${p.id})" title="Редактировать">✏️</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="deletePoa(${p.id})" title="Удалить">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <!-- ПАНЕЛЬ ФИЛЬТРОВ И СТАТУСОВ -->
    <div class="card p mb" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap">
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn btn-sm ${filterStatus === 'all' ? '' : 'btn-ghost'}" onclick="setPoaFilter('all')">Все (${(S.powersOfAttorney||[]).length})</button>
        <button class="btn btn-sm ${filterStatus === 'active' ? '' : 'btn-ghost'}" onclick="setPoaFilter('active')" style="color:var(--green)">🟢 Действующие (${countActive})</button>
        <button class="btn btn-sm ${filterStatus === 'expiring' ? '' : 'btn-ghost'}" onclick="setPoaFilter('expiring')" style="color:var(--orange)">🟡 Истекают (<30 дн) (${countExpiring})</button>
        <button class="btn btn-sm ${filterStatus === 'expired' ? '' : 'btn-ghost'}" onclick="setPoaFilter('expired')" style="color:var(--red)">🔴 Просроченные (${countExpired})</button>
      </div>
      <div style="flex:1; min-width:240px; max-width:360px">
        <input type="text" id="poa_search_input" value="${escHtml(S.poaSearch)}" placeholder="🔍 Поиск по номеру, ФИО или контрагенту..." 
               style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:8px"
               oninput="onPoaSearch(this.value)">
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
        <tbody>
          ${rows || '<tr><td colspan="7" style="text-align:center; padding:3rem; color:var(--text-3)">Доверенности не найдены</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function setPoaFilter(status) {
  S.poaFilterStatus = status;
  var container = document.getElementById('team_tab_content');
  if (container) renderPoaView(container);
}

function onPoaSearch(val) {
  S.poaSearch = val;
  var container = document.getElementById('team_tab_content');
  if (container) renderPoaView(container);
}

function openAddPoaModal() {
  showModal('📜 Новая доверенность', [
    { key: 'number', label: 'Номер доверенности', placeholder: '0УБП-000450', required: true },
    { key: 'personName', label: 'Подотчетное лицо (ФИО)', required: true },
    { key: 'contractorName', label: 'Контрагент (ЭТМ, Деловые линии и др.)', placeholder: 'АО Электротехмонтаж' },
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
      });
    });
  });
}

function editPoa(id) {
  var p = (S.powersOfAttorney || []).find(x => x.id === id);
  if (!p) return;

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
    return `
      <tr style="border-bottom: 1px solid var(--border)">
        <td style="padding: 10px 12px"><b>#${u.id}</b></td>
        <td style="padding: 10px 12px; font-weight:600">${escHtml(u.username)}</td>
        <td style="padding: 10px 12px">${badge(u.role === 'admin' ? 'b-red' : 'b-gray', u.role === 'admin' ? 'Админ' : 'Монтажник')}${u.contractor_name ? '<div style="font-size:.72rem;color:var(--text-3);margin-top:2px">' + escHtml(u.contractor_name) + '</div>' : ''}</td>
        <td style="padding: 10px 12px">
          <div style="font-weight:600">${escHtml(u.full_name || '—')}</div>
          ${passInfo}
        </td>
        <td style="padding: 10px 12px">${escHtml(u.phone || '—')}</td>
        <td style="padding: 10px 12px; color:var(--text-2)">${escHtml(u.email || '—')}</td>
        <td style="padding: 10px 12px; color:var(--text-3); font-size:.75rem">${new Date(u.created_at).toLocaleDateString('ru')}</td>
        <td style="padding: 10px 12px; text-align:right">
          <button class="btn btn-sm btn-ghost" onclick="editUser(${u.id})" title="Редактировать (вкл. паспорт)">✏️</button>
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
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:.75rem; margin-bottom:1rem">
        <input id="nu_name" type="text" placeholder="Логин *">
        <input id="nu_pass" type="password" placeholder="Пароль *">
        <input id="nu_full" type="text" placeholder="ФИО (как в Excel)">
        <input id="nu_phone" type="text" placeholder="Телефон для связи">
        <input id="nu_email" type="email" placeholder="Email для писем">
        <select id="nu_role">
          <option value="worker">Монтажник (Worker)</option>
          <option value="admin">Администратор (Admin)</option>
        </select>
        <select id="nu_contractor">
          <option value="">— Без контрагента —</option>
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

  var issueDateStr = user.passport_issue_date ? user.passport_issue_date.slice(0, 10) : '';

  showModal('✏️ Редактировать пользователя #' + id, [
    { key: 'username', label: 'Логин', value: user.username, required: true },
    { key: 'password', label: 'Новый пароль (оставьте пустым, если не меняется)', type: 'password', value: '' },
    { key: 'fullName', label: 'ФИО (как в Excel)', value: user.full_name || '' },
    { key: 'phone',    label: 'Телефон (для связи и допусков)', value: user.phone || '' },
    { key: 'email',    label: 'Email для писем', value: user.email || '' },
    { key: 'role',     label: 'Роль', type: 'select', value: user.role, options: [
        { value: 'worker', label: 'Монтажник (Worker)' },
        { value: 'admin',  label: 'Администратор (Admin)' }
      ]
    },
    { key: 'contractorId', label: 'Контрагент', type: 'select', value: user.contractor_id || '', options:
        [{ value: '', label: '— Без контрагента —' }].concat((S.contractors || []).map(function(c) { return { value: c.id, label: c.name_short }; }))
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
      api('/users').then(list => { S.users = list; renderApp(); });
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