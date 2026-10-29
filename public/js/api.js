// ─── API & RE-AUTHENTICATION ────────────────────────────────────────────────

var pendingAuthQueue = [];
var isReauthActive = false;

function showReauthModal() {
  if (isReauthActive) return;
  isReauthActive = true;

  var existing = document.getElementById('reauth_modal');
  if (existing) existing.remove();

  var userName = S.user ? (S.user.fullName || S.user.full_name || S.user.username || 'Пользователь') : 'Пользователь';
  var userLogin = S.user ? (S.user.username || '') : '';

  var modal = document.createElement('div');
  modal.id = 'reauth_modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.7);backdrop-filter:blur(4px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;';
  
  modal.innerHTML = 
    '<div style="background:#fff;border-radius:14px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);width:100%;max-width:440px;padding:24px;position:relative;animation:fadeIn 0.2s ease;">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">' +
        '<div style="width:42px;height:42px;border-radius:10px;background:#fef3c7;color:#d97706;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">🔒</div>' +
        '<div>' +
          '<h3 style="margin:0;font-size:1.15rem;font-weight:700;color:#1e293b;">Сессия завершена</h3>' +
          '<div style="font-size:0.85rem;color:#64748b;margin-top:2px;">Срок действия токена безопасности истёк</div>' +
        '</div>' +
      '</div>' +
      '<p style="font-size:0.9rem;color:#475569;line-height:1.45;margin:0 0 16px 0;">' +
        'Все ваши несохранённые данные <b>в безопасности и не потеряны</b>. Введите пароль для учётной записи <b>' + (userName.replace(/</g,'&lt;')) + '</b> (' + (userLogin.replace(/</g,'&lt;')) + '), чтобы отправить изменения в базу данных.' +
      '</p>' +
      '<div id="reauth_error" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:8px 12px;border-radius:6px;font-size:0.85rem;margin-bottom:12px;"></div>' +
      '<form id="reauth_form" onsubmit="event.preventDefault(); window._submitReauth();">' +
        (!userLogin ? '<div style="margin-bottom:10px;"><label style="font-size:0.8rem;color:#475569;display:block;margin-bottom:4px;">Логин</label><input type="text" id="reauth_login_input" style="width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" required></div>' : '') +
        '<div style="margin-bottom:16px;">' +
          '<label style="font-size:0.8rem;color:#475569;display:block;margin-bottom:4px;font-weight:500;">Пароль</label>' +
          '<input type="password" id="reauth_pass_input" placeholder="Введите ваш пароль" style="width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" required autocomplete="current-password">' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' +
          '<button type="submit" id="reauth_submit_btn" style="width:100%;padding:11px;background:#ea580c;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:0.95rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">' +
            '<span>Разблокировать и сохранить данные</span>' +
          '</button>' +
          '<button type="button" onclick="window._cancelReauthAndLogout()" style="width:100%;padding:8px;background:none;border:none;color:#64748b;font-size:0.85rem;cursor:pointer;text-decoration:underline;">' +
            'Выйти из аккаунта (несохранённые данные будут сброшены)' +
          '</button>' +
        '</div>' +
      '</form>' +
    '</div>';

  document.body.appendChild(modal);

  setTimeout(function() {
    var pInput = document.getElementById('reauth_pass_input');
    if (pInput) pInput.focus();
  }, 100);
}
window.showReauthModal = showReauthModal;

window._submitReauth = function() {
  var pInput = document.getElementById('reauth_pass_input');
  var uInput = document.getElementById('reauth_login_input');
  var errBox = document.getElementById('reauth_error');
  var btn = document.getElementById('reauth_submit_btn');

  var password = pInput ? pInput.value : '';
  var username = uInput ? uInput.value.trim() : (S.user ? S.user.username : '');

  if (!username || !password) {
    if (errBox) {
      errBox.textContent = 'Пожалуйста, введите пароль';
      errBox.style.display = 'block';
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Проверяем...';
  }
  if (errBox) errBox.style.display = 'none';

  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username, password: password })
  })
  .then(function(r) { return r.json().then(function(d){ return { ok: r.ok, status: r.status, data: d }; }); })
  .then(function(res) {
    if (!res.ok || !res.data || !res.data.token) {
      if (errBox) {
        errBox.textContent = (res.data && res.data.error) ? res.data.error : 'Неверный пароль. Попробуйте еще раз.';
        errBox.style.display = 'block';
      }
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>Разблокировать и сохранить данные</span>';
      }
      if (pInput) {
        pInput.focus();
        pInput.select();
      }
      return;
    }

    // Успешная повторная авторизация!
    S.token = res.data.token;
    if (res.data.user) {
      S.user = res.data.user;
      try { localStorage.setItem('user', JSON.stringify(S.user)); } catch(e){}
    }
    try { localStorage.setItem('token', S.token); } catch(e){}

    // Закрываем модальное окно
    var modal = document.getElementById('reauth_modal');
    if (modal) modal.remove();
    isReauthActive = false;

    if (typeof showToast === 'function') {
      showToast('🟢 Авторизация восстановлена! Сохраняем изменения...', 'success');
    }

    // Переигрываем все зависшие вызовы API с новым токеном!
    var queue = pendingAuthQueue.slice();
    pendingAuthQueue = [];
    queue.forEach(function(item) {
      item.opts = item.opts || {};
      item.opts.headers = item.opts.headers || {};
      item.opts.headers['Authorization'] = 'Bearer ' + S.token;
      api(item.url, item.opts).then(item.resolve).catch(item.reject);
    });
  })
  .catch(function(err) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>Разблокировать и сохранить данные</span>';
    }
    if (errBox) {
      errBox.textContent = 'Ошибка связи с сервером. Попробуйте еще раз.';
      errBox.style.display = 'block';
    }
  });
};

window._cancelReauthAndLogout = function() {
  var hasDraft = S.cardDraft && (
    Object.keys(S.cardDraft).filter(function(k){ return !k.startsWith('_'); }).length > 0 ||
    !!S.cardDraft._smrDirty ||
    !!S.cardDraft._tmcDirty
  );
  if (hasDraft) {
    if (!confirm('Внимание: у вас есть несохранённые данные в карточке! При выходе они будут потеряны. Вы действительно хотите выйти?')) {
      return;
    }
  }
  pendingAuthQueue = [];
  isReauthActive = false;
  var modal = document.getElementById('reauth_modal');
  if (modal) modal.remove();
  if (typeof doLogout === 'function') doLogout();
  else { localStorage.clear(); location.reload(); }
};

// Тихое продление активной сессии (Silent Refresh)
function refreshSessionToken() {
  if (!S.token || !S.isOnline) return Promise.resolve();
  return fetch('/api/refresh', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + S.token,
      'Content-Type': 'application/json'
    }
  }).then(function(r) {
    if (r.ok) {
      return r.json().then(function(data) {
        if (data && data.token) {
          S.token = data.token;
          try { localStorage.setItem('token', S.token); } catch(e){}
        }
      });
    }
  }).catch(function(e) {
    console.warn('[Session] Silent refresh skipped:', e);
  });
}
window.refreshSessionToken = refreshSessionToken;

// Автопродление сессии каждые 4 часа
setInterval(refreshSessionToken, 4 * 60 * 60 * 1000);

function api(url, opts) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  if (S.token) {
    opts.headers['Authorization'] = 'Bearer ' + S.token;
  }

  var method = (opts.method || 'GET').toUpperCase();

  // Если оффлайн и запрос на изменение данных (POST/PUT/DELETE)
  if (!S.isOnline && method !== 'GET') {
    return handleOfflineMutation(url, method, opts);
  }

  // Если оффлайн и GET-запрос: читаем из IndexedDB кэша
  if (!S.isOnline && method === 'GET') {
    var cacheKey = url.replace(/^\//, '').split('?')[0];
    return idbGet(cacheKey).then(function(cached) {
      if (cached !== null && cached !== undefined) {
        return cached;
      }
      return { error: 'Offline', cached: false };
    });
  }

  if (method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH') {
    if (!opts.headers['Content-Type'] && !(opts.body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
    }
  }

  return fetch('/api' + url, opts).then(function(r) { 
    if (r.status === 401) {
      // Запросы логина и рефреша не должны рекурсивно вызывать окно авторизации
      if (url === '/login' || url === '/refresh' || url === '/auth/refresh') {
        return r.json().then(function(errData) {
          var err = new Error((errData && errData.error) || 'Ошибка авторизации');
          err.status = 401;
          err.data = errData;
          err.isAuthError = true;
          throw err;
        });
      }

      // Если пользователь авторизован, но токен истек — открываем повторный вход БЕЗ потери данных
      if (S.token) {
        return new Promise(function(resolve, reject) {
          pendingAuthQueue.push({ url: url, opts: opts, resolve: resolve, reject: reject });
          showReauthModal();
        });
      }

      return r.json().then(function(errData) {
        var err = new Error((errData && errData.error) || 'Требуется авторизация');
        err.status = 401;
        err.data = errData;
        err.isAuthError = true;
        throw err;
      });
    }

    if (r.status === 403) {
      return r.json().catch(function(){ return { error: 'Доступ ограничен (403)' }; }).then(function(errData) {
        var msg = (errData && errData.error) || 'Доступ ограничен (403)';
        var err = new Error(msg);
        err.status = 403;
        err.data = errData;
        err.isAuthError = true;
        throw err;
      });
    }

    if (!S.isOnline) {
      S.isOnline = true;
      updateNetworkStatusUI();
    }

    return r.json().then(function(data) {
      if (method === 'GET' && r.ok) {
        var cleanKey = url.replace(/^\//, '').split('?')[0];
        if (['tasks', 'stats', 'chains', 'import-info', 'marches', 'users', 'contractors', 'contracts', 'subcontract-contracts', 'subcontract-pricelists'].indexOf(cleanKey) !== -1) {
          var toStore = cleanKey === 'contracts' && data && data.contracts ? data.contracts : data;
          idbSet(cleanKey, toStore);
        }
      }
      return data;
    });
  }).catch(function(err) {
    // ВАЖНО: ошибки авторизации (401/403) приходят с живого сервера и НЕ должны уводить сайт в оффлайн!
    if (err && (err.status === 401 || err.status === 403 || err.isAuthError)) {
      throw err;
    }

    console.warn("API Network Error:", url, err);
    S.isOnline = false;
    updateNetworkStatusUI();

    if (method !== 'GET') {
      return handleOfflineMutation(url, method, opts);
    } else {
      var cacheKey = url.replace(/^\//, '').split('?')[0];
      return idbGet(cacheKey).then(function(cached) {
        if (cached !== null && cached !== undefined) {
          return cached;
        }
        return { error: 'Network error' };
      });
    }
  });
}

function uploadAttachments(taskId, type, files, comment) {
  var fd = new FormData();
  for (var i = 0; i < files.length; i++) fd.append('files', files[i]);
  fd.append('type', type);
  if (comment) fd.append('comment', comment);
  return fetch('/api/tasks/' + taskId + '/attachments', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + S.token },
    body: fd
  }).then(function(r){ return r.json(); });
}

function loadAttachments(taskId) {
  return api('/tasks/' + taskId + '/attachments');
}

function deleteAttachment(attId) {
  return api('/attachments/' + attId, { method: 'DELETE' });
}
