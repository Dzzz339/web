function pageUsers() {
  api('/users').then(users => {
    S.users = users;
    var rows = users.map(u => {
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

    var el = document.getElementById('users-table');
    if (el) el.innerHTML = rows || '<tr><td colspan="8" style="text-align:center;padding:2rem">Нет сотрудников</td></tr>';
  });

  var formOpen = S.userFormOpen || false;

  return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; flex-wrap:wrap; gap:10px">
      <h1 class="page-title" style="margin:0">Управление командой</h1>
      <button class="btn" onclick="toggleUserForm()">
        ${formOpen ? '✕ Закрыть форму' : '+ Добавить сотрудника'}
      </button>
    </div>

    <!-- ФОРМА ДОБАВЛЕНИЯ (СКРЫТА ПО УМОЛЧАНИЮ) -->
    <div id="user_add_card" class="card p mb" style="display:${formOpen ? 'block' : 'none'}; border:1.5px solid var(--orange); animation: fadeIn 0.15s ease;">
      <div class="sec-title" style="margin-bottom:.75rem">Новый сотрудник</div>
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
          <tr><td colspan="8" style="text-align:center; padding:2rem">Загрузка...</td></tr>
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
