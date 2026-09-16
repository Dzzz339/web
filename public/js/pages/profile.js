function pageProfile() {
  // Запрашиваем актуальные данные профиля с сервера
  api('/profile').then(function(res) {
    if (!res || res.error) {
      var errEl = document.getElementById('profile_info_status');
      if (errEl) errEl.innerHTML = '<span style="color:var(--red)">' + (res ? res.error : 'Ошибка загрузки профиля') + '</span>';
      return;
    }
    // Обновляем локальное состояние пользователя
    S.user = Object.assign({}, S.user, {
      fullName: res.fullName || res.full_name,
      email: res.email,
      avatarUrl: res.avatarUrl || res.avatar_url,
      contractorName: res.contractorName || res.contractor_name
    });
    localStorage.setItem('user', JSON.stringify(S.user));

    // Заполняем поля ввода
    var fnInput = document.getElementById('prof_full_name');
    var emInput = document.getElementById('prof_email');
    if (fnInput) fnInput.value = res.fullName || res.full_name || '';
    if (emInput) emInput.value = res.email || '';

    // Обновляем отображение аватара в профиле и сайдбаре
    updateProfileAvatarDisplay(res.avatarUrl || res.avatar_url || null);
    renderNav();
  }).catch(function(err) {
    console.error('Failed to load profile:', err);
  });

  var u = S.user || {};
  var userName = (u.fullName || u.username) || 'Пользователь';
  var userRole = u.role === 'admin' ? 'Администратор' : 'Исполнитель';
  var initial = (userName.trim()[0] || 'U').toUpperCase();

  return `
    <div style="max-width: 960px; margin: 0 auto;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
        <div>
          <h1 class="page-title" style="margin-bottom:4px;">Мой профиль</h1>
          <div style="font-size:0.85rem; color:var(--text-2);">Управление личными данными, фото и безопасностью аккаунта</div>
        </div>
      </div>

      <div class="g2" style="align-items:start;">
        <!-- КАРТОЧКА 1: ЛИЧНЫЕ ДАННЫЕ И АВАТАР -->
        <div class="card p" style="display:flex; flex-direction:column; gap:1.25rem;">
          <div style="font-weight:700; font-size:1.05rem; border-bottom:1px solid var(--border); padding-bottom:0.75rem; display:flex; align-items:center; gap:8px;">
            <span>👤</span> Личные данные
          </div>

          <!-- Секция аватара -->
          <div style="display:flex; align-items:center; gap:1.25rem; flex-wrap:wrap;">
            <div id="profile_avatar_preview" style="width:76px; height:76px; border-radius:50%; background:var(--orange); color:#fff; display:flex; align-items:center; justify-content:center; font-size:1.8rem; font-weight:700; flex-shrink:0; overflow:hidden; border:2px solid var(--border); box-shadow:0 2px 8px rgba(0,0,0,0.08);">
              ${u.avatarUrl ? `<img src="${escHtml(u.avatarUrl)}" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentElement.innerHTML='${initial}'">` : initial}
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <input type="file" id="avatar_file_input" accept="image/png, image/jpeg, image/webp" style="display:none;" onchange="handleAvatarSelected(this)">
                <button type="button" class="btn btn-sm" onclick="document.getElementById('avatar_file_input').click()">
                  📷 Загрузить фото
                </button>
                <button type="button" id="btn_delete_avatar" class="btn btn-sm btn-ghost" style="color:var(--red); border-color:var(--border); ${u.avatarUrl ? '' : 'display:none;'}" onclick="deleteAvatar()">
                  ✕ Удалить
                </button>
              </div>
              <div style="font-size:0.75rem; color:var(--text-3);">JPG, PNG или WebP до 5 МБ</div>
              <div id="avatar_upload_status" style="font-size:0.8rem; min-height:1.1rem;"></div>
            </div>
          </div>

          <!-- Поля профиля -->
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-3); margin-bottom:4px;">Логин (не изменяется)</label>
              <input type="text" value="${escHtml(u.username || '')}" disabled style="width:100%; background:var(--bg); color:var(--text-2); cursor:not-allowed;">
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-3); margin-bottom:4px;">Роль</label>
                <div style="padding:7px 11px; background:var(--bg); border:1.5px solid var(--border); border-radius:7px; font-weight:600; font-size:0.85rem;">
                  ${badge(u.role === 'admin' ? 'b-red' : 'b-gray', userRole)}
                </div>
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-3); margin-bottom:4px;">Контрагент</label>
                <div style="padding:7px 11px; background:var(--bg); border:1.5px solid var(--border); border-radius:7px; font-size:0.85rem; color:var(--text-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  ${escHtml(u.contractorName || '—')}
                </div>
              </div>
            </div>

            <div>
              <label for="prof_full_name" style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-3); margin-bottom:4px;">ФИО (как в Excel / отчетах)</label>
              <input type="text" id="prof_full_name" value="${escHtml(u.fullName || '')}" placeholder="Иванов Иван Иванович" style="width:100%;">
            </div>

            <div>
              <label for="prof_email" style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-3); margin-bottom:4px;">Email (для уведомлений и писем)</label>
              <input type="email" id="prof_email" value="${escHtml(u.email || '')}" placeholder="user@example.com" style="width:100%;">
            </div>
          </div>

          <div style="display:flex; align-items:center; justify-content:space-between; margin-top:0.5rem; flex-wrap:wrap; gap:8px;">
            <div id="profile_info_status" style="font-size:0.82rem;"></div>
            <button type="button" class="btn" onclick="saveProfileData()">💾 Сохранить изменения</button>
          </div>
        </div>

        <!-- КАРТОЧКА 2: БЕЗОПАСНОСТЬ (СМЕНА ПАРОЛЯ) -->
        <div class="card p" style="display:flex; flex-direction:column; gap:1.25rem;">
          <div style="font-weight:700; font-size:1.05rem; border-bottom:1px solid var(--border); padding-bottom:0.75rem; display:flex; align-items:center; gap:8px;">
            <span>🔒</span> Безопасность и пароль
          </div>

          <div style="font-size:0.82rem; color:var(--text-2);">
            Для смены пароля введите текущий пароль от аккаунта и укажите новый (не менее 6 символов).
          </div>

          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label for="prof_cur_pass" style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-3); margin-bottom:4px;">Текущий пароль</label>
              <input type="password" id="prof_cur_pass" placeholder="••••••••" style="width:100%;">
            </div>

            <div>
              <label for="prof_new_pass" style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-3); margin-bottom:4px;">Новый пароль</label>
              <input type="password" id="prof_new_pass" placeholder="Минимум 6 символов" style="width:100%;">
            </div>

            <div>
              <label for="prof_new_pass2" style="display:block; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-3); margin-bottom:4px;">Повторите новый пароль</label>
              <input type="password" id="prof_new_pass2" placeholder="Повторите новый пароль" style="width:100%;">
            </div>
          </div>

          <div style="display:flex; align-items:center; justify-content:space-between; margin-top:0.5rem; flex-wrap:wrap; gap:8px;">
            <div id="profile_pass_status" style="font-size:0.82rem;"></div>
            <button type="button" class="btn" style="background:#27272A;" onmouseover="this.style.background='#3F3F46'" onmouseout="this.style.background='#27272A'" onclick="changeProfilePassword()">
              🔑 Обновить пароль
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function updateProfileAvatarDisplay(url) {
  var previewEl = document.getElementById('profile_avatar_preview');
  var btnDel = document.getElementById('btn_delete_avatar');
  var userName = (S.user && (S.user.fullName || S.user.username)) || 'Пользователь';
  var initial = (userName.trim()[0] || 'U').toUpperCase();

  if (previewEl) {
    if (url) {
      previewEl.innerHTML = '<img src="' + escHtml(url) + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML=\'' + initial + '\'">';
    } else {
      previewEl.innerHTML = initial;
    }
  }
  if (btnDel) {
    btnDel.style.display = url ? 'inline-flex' : 'none';
  }
}

function saveProfileData() {
  var fullName = (document.getElementById('prof_full_name').value || '').trim();
  var email = (document.getElementById('prof_email').value || '').trim();
  var statusEl = document.getElementById('profile_info_status');

  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-2);">Сохранение…</span>';

  api('/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: fullName, email: email })
  }).then(function(res) {
    if (!res || res.error) {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">' + (res ? res.error : 'Ошибка сохранения') + '</span>';
      return;
    }

    // Обновляем локальное состояние пользователя
    S.user = Object.assign({}, S.user, {
      fullName: res.user.full_name,
      email: res.user.email
    });
    localStorage.setItem('user', JSON.stringify(S.user));

    renderNav();
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--green);font-weight:600;">✓ Данные успешно сохранены</span>';
    setTimeout(function() {
      if (statusEl) statusEl.innerHTML = '';
    }, 4000);
  }).catch(function(err) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Ошибка сети</span>';
  });
}

function changeProfilePassword() {
  var curPass = document.getElementById('prof_cur_pass').value;
  var newPass = document.getElementById('prof_new_pass').value;
  var newPass2 = document.getElementById('prof_new_pass2').value;
  var statusEl = document.getElementById('profile_pass_status');

  if (!curPass) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Введите текущий пароль</span>';
    return;
  }
  if (!newPass || newPass.length < 6) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Новый пароль должен быть не менее 6 символов</span>';
    return;
  }
  if (newPass !== newPass2) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Новые пароли не совпадают</span>';
    return;
  }

  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-2);">Проверка и смена…</span>';

  api('/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      currentPassword: curPass,
      newPassword: newPass
    })
  }).then(function(res) {
    if (!res || res.error) {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">' + (res ? res.error : 'Ошибка смены пароля') + '</span>';
      return;
    }

    document.getElementById('prof_cur_pass').value = '';
    document.getElementById('prof_new_pass').value = '';
    document.getElementById('prof_new_pass2').value = '';

    if (statusEl) statusEl.innerHTML = '<span style="color:var(--green);font-weight:600;">✓ Пароль успешно изменён!</span>';
    setTimeout(function() {
      if (statusEl) statusEl.innerHTML = '';
    }, 5000);
  }).catch(function(err) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Ошибка сети</span>';
  });
}

function handleAvatarSelected(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];

  if (file.size > 5 * 1024 * 1024) {
    alert('Размер файла превышает 5 МБ');
    input.value = '';
    return;
  }

  var statusEl = document.getElementById('avatar_upload_status');
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-2);">Загрузка…</span>';

  var fd = new FormData();
  fd.append('avatar', file);

  fetch('/api/profile/avatar', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + S.token },
    body: fd
  }).then(function(r) { return r.json(); })
    .then(function(res) {
      input.value = '';
      if (!res || res.error) {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">' + (res ? res.error : 'Ошибка загрузки') + '</span>';
        return;
      }

      // Обновляем состояние пользователя
      S.user = Object.assign({}, S.user, { avatarUrl: res.avatarUrl });
      localStorage.setItem('user', JSON.stringify(S.user));

      updateProfileAvatarDisplay(res.avatarUrl);
      renderNav();

      if (statusEl) statusEl.innerHTML = '<span style="color:var(--green);font-weight:600;">✓ Фото обновлено</span>';
      setTimeout(function() {
        if (statusEl) statusEl.innerHTML = '';
      }, 4000);
    }).catch(function(err) {
      input.value = '';
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Ошибка сети при загрузке фото</span>';
    });
}

function deleteAvatar() {
  if (!confirm('Вы уверены, что хотите удалить фото профиля?')) return;
  var statusEl = document.getElementById('avatar_upload_status');
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-2);">Удаление…</span>';

  api('/profile/avatar', { method: 'DELETE' })
    .then(function(res) {
      if (!res || res.error) {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">' + (res ? res.error : 'Ошибка удаления') + '</span>';
        return;
      }

      // Очищаем аватарку
      S.user = Object.assign({}, S.user, { avatarUrl: null });
      localStorage.setItem('user', JSON.stringify(S.user));

      updateProfileAvatarDisplay(null);
      renderNav();

      if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-2);">Фото удалено</span>';
      setTimeout(function() {
        if (statusEl) statusEl.innerHTML = '';
      }, 3000);
    }).catch(function(err) {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Ошибка сети</span>';
    });
}
