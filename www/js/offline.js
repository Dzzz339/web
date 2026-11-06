function getOfflineDB() {
  if (_offlineDbPromise) return _offlineDbPromise;
  _offlineDbPromise = new Promise(function(resolve) {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('[OfflineDB] IndexedDB not available');
      return resolve(null);
    }
    var req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache');
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = function(e) {
      resolve(e.target.result);
    };
    req.onerror = function(err) {
      console.error('[OfflineDB] Open error:', err);
      resolve(null);
    };
  });
  return _offlineDbPromise;
}

function idbGet(key) {
  return getOfflineDB().then(function(db) {
    if (!db) return null;
    return new Promise(function(resolve) {
      try {
        var tx = db.transaction('cache', 'readonly');
        var store = tx.objectStore('cache');
        var req = store.get(key);
        req.onsuccess = function() { resolve(req.result !== undefined ? req.result : null); };
        req.onerror = function() { resolve(null); };
      } catch (e) {
        resolve(null);
      }
    });
  });
}

function idbSet(key, val) {
  return getOfflineDB().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve) {
      try {
        var tx = db.transaction('cache', 'readwrite');
        var store = tx.objectStore('cache');
        store.put(val, key);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { resolve(false); };
      } catch (e) {
        resolve(false);
      }
    });
  });
}

function idbAddOutbox(item) {
  return getOfflineDB().then(function(db) {
    if (!db) return null;
    return new Promise(function(resolve) {
      try {
        var tx = db.transaction('outbox', 'readwrite');
        var store = tx.objectStore('outbox');
        var req = store.add(item);
        req.onsuccess = function() {
          refreshOutboxCount();
          resolve(req.result);
        };
        req.onerror = function() { resolve(null); };
      } catch (e) {
        resolve(null);
      }
    });
  });
}

function idbGetOutbox() {
  return getOfflineDB().then(function(db) {
    if (!db) return [];
    return new Promise(function(resolve) {
      try {
        var tx = db.transaction('outbox', 'readonly');
        var store = tx.objectStore('outbox');
        var req = store.getAll();
        req.onsuccess = function() { resolve(req.result || []); };
        req.onerror = function() { resolve([]); };
      } catch (e) {
        resolve([]);
      }
    });
  });
}

function idbRemoveOutbox(id) {
  return getOfflineDB().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve) {
      try {
        var tx = db.transaction('outbox', 'readwrite');
        var store = tx.objectStore('outbox');
        store.delete(id);
        tx.oncomplete = function() {
          refreshOutboxCount();
          resolve(true);
        };
        tx.onerror = function() { resolve(false); };
      } catch (e) {
        resolve(false);
      }
    });
  });
}

function refreshOutboxCount() {
  return idbGetOutbox().then(function(items) {
    S.outboxCount = items ? items.length : 0;
    updateNetworkStatusUI();
    return S.outboxCount;
  });
}


function updateNetworkStatusUI() {
  var pill = document.getElementById('network-status-pill');
  var dot = document.getElementById('network-status-dot');
  var txt = document.getElementById('network-status-text');
  var banner = document.getElementById('offline-banner');
  var bannerText = document.getElementById('offline-banner-text');
  var outboxBadge = document.getElementById('outbox-badge');

  if (pill && dot && txt) {
    if (S.token) {
      pill.style.display = 'inline-flex';
    } else {
      pill.style.display = 'none';
    }

    if (S.syncing) {
      pill.style.background = 'rgba(59,130,246,0.15)';
      pill.style.color = '#2563eb';
      dot.style.background = '#3b82f6';
      txt.textContent = 'Синхронизация...';
    } else if (!S.isOnline) {
      pill.style.background = 'rgba(239,68,68,0.15)';
      pill.style.color = '#dc2626';
      dot.style.background = '#ef4444';
      txt.textContent = 'Оффлайн' + (S.outboxCount > 0 ? ' (' + S.outboxCount + ')' : '');
    } else if (S.outboxCount > 0) {
      pill.style.background = 'rgba(245,158,11,0.15)';
      pill.style.color = '#d97706';
      dot.style.background = '#f59e0b';
      txt.textContent = 'Очередь: ' + S.outboxCount;
    } else {
      pill.style.background = 'rgba(34,197,94,0.12)';
      pill.style.color = '#16a34a';
      dot.style.background = '#16a34a';
      txt.textContent = 'Онлайн';
    }
  }

  if (banner) {
    if (!S.isOnline && S.token) {
      banner.style.display = 'flex';
      if (bannerText) {
        bannerText.innerHTML = '<strong>⚡ Автономный режим:</strong> Связь с сервером прервана. Вы можете продолжать работу — все действия сохраняются на устройстве и отправятся автоматически.';
      }
    } else if (S.outboxCount > 0 && S.token) {
      banner.style.display = 'flex';
      if (bannerText) {
        bannerText.innerHTML = '<strong>⏳ В очереди отправки:</strong> Найдено ' + S.outboxCount + ' локальных изменений, ожидающих синхронизации с сервером.';
      }
    } else {
      banner.style.display = 'none';
    }
  }

  if (outboxBadge) {
    if (S.outboxCount > 0) {
      outboxBadge.style.display = 'inline-block';
      outboxBadge.textContent = S.outboxCount + ' в очереди';
    } else {
      outboxBadge.style.display = 'none';
    }
  }
}

function applyOptimisticMutation(url, method, body) {
  if (!body) body = {};

  // 1. Продвижение / откат шага ИД: /tasks/:id/advance, /tasks/:id/revert, /tasks/:id/step
  var advMatch = url.match(/^\/tasks\/([^\/]+)\/advance$/);
  var revMatch = url.match(/^\/tasks\/([^\/]+)\/revert$/);
  var stepMatch = url.match(/^\/tasks\/([^\/]+)\/step$/);
  if (advMatch || revMatch || stepMatch) {
    var taskId = decodeURIComponent(advMatch ? advMatch[1] : (revMatch ? revMatch[1] : stepMatch[1]));
    var isNext = !!advMatch || (stepMatch && body.action === 'next');
    var isRevert = !!revMatch || (stepMatch && body.action === 'revert');
    var task = S.tasks.find(function(t) { return String(t.id) === String(taskId); });
    if (task) {
      var ID_STEPS_LOCAL = [
        { num: 1, name: 'Сбор исходных данных', role: 'Инженер ПТО', stage: 'Монтаж на объекте' },
        { num: 2, name: 'Формирование комплекта', role: 'Инженер ПТО', stage: 'Очередь ИД' },
        { num: 3, name: 'Проверка ПТО', role: 'Инженер ПТО', stage: 'Проектирование' },
        { num: 4, name: 'Печать и сбор подписей', role: 'Инженер ПТО', stage: 'Проектирование' },
        { num: 5, name: 'Сдача в Сбер', role: 'Куратор/Менеджер', stage: 'В Сбере на приёмке' },
        { num: 6, name: 'Устранение замечаний', role: 'Инженер ПТО', stage: 'В Сбере на приёмке' },
        { num: 7, name: 'Получение акта сдачи', role: 'Куратор/Менеджер', stage: 'В Сбере на приёмке' },
        { num: 8, name: 'Передача в бухгалтерию', role: 'Куратор/Менеджер', stage: 'Оплата и счета' },
        { num: 9, name: 'Оплата получена', role: 'Бухгалтер', stage: 'Завершена' }
      ];

      var curNum = Number(task.stageNum != null ? task.stageNum : 0);
      if (isNext) {
        var nextNum = Math.min(9, curNum + 1);
        task.stageNum = nextNum;
        var stObj = ID_STEPS_LOCAL.find(function(s){ return s.num === nextNum; });
        if (stObj) {
          task.stage = stObj.stage;
          task.current_step_name = stObj.name;
          task.responsible_role = stObj.role;
        }
        if (body.link) {
          if (curNum === 2) task.materialsLink = body.link;
          if (curNum === 4) task.idLink = body.link;
        }
        if (nextNum === 9) task.status = 'done';
      } else if (isRevert) {
        var prevNum = Math.max(0, curNum - 1);
        task.stageNum = prevNum;
        var stObj2 = ID_STEPS_LOCAL.find(function(s){ return s.num === prevNum; });
        if (stObj2) {
          task.stage = stObj2.stage;
          task.current_step_name = stObj2.name;
          task.responsible_role = stObj2.role;
        }
        task.status = 'progress';
      }

      if (body.remarks) {
        if (!Array.isArray(task.remarks_history)) task.remarks_history = [];
        task.remarks_history.unshift({
          id: 'temp_' + Date.now(),
          task_id: taskId,
          remark_text: body.remarks,
          author_name: (S.user && (S.user.fullName || S.user.username)) || 'Пользователь',
          resolved: false,
          created_at: new Date().toISOString()
        });
        task.has_unresolved_remarks = true;
        task.openRemarksCount = (task.openRemarksCount || 0) + 1;
      }
    }
  }

  // 2. Обновление полей заявки: PUT /tasks/:id
  var taskPutMatch = url.match(/^\/tasks\/([^\/]+)$/);
  if (taskPutMatch && method === 'PUT') {
    var tId = taskPutMatch[1];
    var tObj = S.tasks.find(function(t) { return String(t.id) === String(tId); });
    if (tObj) {
      Object.assign(tObj, body);
    }
  }

  // 3. Создание новой заявки: POST /tasks
  if (url === '/tasks' && method === 'POST') {
    var newTask = Object.assign({}, body, {
      id: body.id || ('Л-' + Date.now().toString().slice(-4)),
      _offlineCreated: true
    });
    S.tasks.unshift(newTask);
  }

  // 4. Добавление замечания: POST /tasks/:id/remarks
  var remMatch = url.match(/^\/tasks\/([^\/]+)\/remarks$/);
  if (remMatch && method === 'POST') {
    var remTaskId = remMatch[1];
    var remTask = S.tasks.find(function(t) { return String(t.id) === String(remTaskId); });
    if (remTask) {
      if (!Array.isArray(remTask.remarks_history)) remTask.remarks_history = [];
      remTask.remarks_history.unshift({
        id: 'temp_' + Date.now(),
        task_id: remTaskId,
        remark_text: body.text || body.remark_text || '',
        link: body.link || null,
        author_name: (S.user && (S.user.fullName || S.user.username)) || 'Пользователь',
        resolved: false,
        created_at: new Date().toISOString()
      });
      remTask.has_unresolved_remarks = true;
      remTask.openRemarksCount = (remTask.openRemarksCount || 0) + 1;
    }
  }

  // 5. Закрытие замечания: POST /tasks/:id/remarks/:remId/resolve или PUT
  var remResolveMatch = url.match(/^\/tasks\/([^\/]+)\/remarks\/([^\/]+)(?:\/resolve)?$/);
  if (remResolveMatch && (method === 'POST' || method === 'PUT')) {
    var rTaskId = remResolveMatch[1];
    var rRemId = remResolveMatch[2];
    var rTask = S.tasks.find(function(t) { return String(t.id) === String(rTaskId); });
    if (rTask) {
      if (Array.isArray(rTask.remarks_history)) {
        var remItem = rTask.remarks_history.find(function(r) { return String(r.id) === String(rRemId); });
        if (remItem) {
          remItem.resolved = true;
          remItem.resolution = body.resolution || null;
          remItem.resolved_at = new Date().toISOString();
        }
      }
      rTask.openRemarksCount = Math.max(0, (rTask.openRemarksCount || 1) - 1);
      rTask.has_unresolved_remarks = rTask.openRemarksCount > 0;
    }
  }

  // 6. Контрагенты: POST /contractors
  if (url === '/contractors' && method === 'POST') {
    var newC = Object.assign({}, body, { id: 'temp_' + Date.now() });
    if (!Array.isArray(S.contractors)) S.contractors = [];
    S.contractors.push(newC);
    idbSet('contractors', S.contractors);
  }
}

function handleOfflineMutation(url, method, opts) {
  var parsedBody = null;
  if (opts && opts.body) {
    try {
      parsedBody = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
    } catch(e) {
      parsedBody = opts.body;
    }
  }

  var outboxItem = {
    url: url,
    method: method || 'POST',
    body: (opts && typeof opts.body === 'string') ? opts.body : JSON.stringify(parsedBody),
    createdAt: Date.now()
  };

  return idbAddOutbox(outboxItem).then(function() {
    applyOptimisticMutation(url, method, parsedBody);
    idbSet('tasks', S.tasks);
    renderApp();
    showToast('💾 Действие сохранено локально (в очереди: ' + S.outboxCount + ')', 'warning');
    return { ok: true, offline: true, message: 'Saved offline' };
  });
}

function syncOutbox() {
  if (S.syncing) return Promise.resolve();
  
  return idbGetOutbox().then(function(items) {
    if (!items || items.length === 0) {
      S.outboxCount = 0;
      updateNetworkStatusUI();
      return;
    }

    S.syncing = true;
    updateNetworkStatusUI();

    function processNext(idx) {
      if (idx >= items.length) {
        S.syncing = false;
        S.isOnline = true;
        refreshOutboxCount();
        showToast('✅ Все данные синхронизированы с сервером!', 'success');
        return fetchFreshServerData();
      }

      var item = items[idx];
      var headers = {
        'Authorization': 'Bearer ' + S.token,
        'Content-Type': 'application/json'
      };

      return fetch('/api' + item.url, {
        method: item.method,
        headers: headers,
        body: item.body
      }).then(function(res) {
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          return idbRemoveOutbox(item.id).then(function() {
            return processNext(idx + 1);
          });
        } else {
          console.warn('[Sync] Server responded with status:', res.status);
          S.syncing = false;
          refreshOutboxCount();
        }
      }).catch(function(err) {
        console.warn('[Sync] Network error during sync:', err);
        S.syncing = false;
        S.isOnline = false;
        refreshOutboxCount();
      });
    }

    return processNext(0);
  });
}

function manualSync() {
  if (S.syncing) return;
  showToast('🔄 Проверка связи с сервером...', 'info');
  fetch('/api/stats', { headers: { 'Authorization': 'Bearer ' + S.token } })
    .then(function(r) {
      if (r.ok) {
        S.isOnline = true;
        updateNetworkStatusUI();
        syncOutbox().then(function() {
          fetchFreshServerData();
        });
      } else {
        S.isOnline = false;
        updateNetworkStatusUI();
        showToast('❌ Сервер пока недоступен. Работаем в оффлайн-режиме.', 'error');
      }
    })
    .catch(function() {
      S.isOnline = false;
      updateNetworkStatusUI();
      showToast('❌ Сервер недоступен. Изменения сохраняются локально.', 'warning');
    });
}

function fetchFreshServerData() {
  if (!S.token || !S.isOnline) return Promise.resolve();
  var requests = [api('/stats'), api('/tasks'), api('/chains'), api('/import-info'), api('/marches')];
  if (S.user && S.user.role === 'admin') {
    requests.push(api('/users'));
    requests.push(api('/contractors'));
  }
  return Promise.all(requests).then(function(res) {
    if (res[0] && !res[0].error) S.stats = res[0];
    if (Array.isArray(res[1])) S.tasks = res[1];
    if (Array.isArray(res[2])) S.chains = res[2];
    if (res[3] && !res[3].error) S.importInfo = res[3];
    if (Array.isArray(res[4])) S.marches = res[4];
    if (Array.isArray(res[5])) S.users = res[5];
    if (Array.isArray(res[6])) S.contractors = res[6];
    renderApp();
  }).catch(function(e) {
    console.warn('[fetchFreshServerData] error:', e);
  });
}

function setupOfflineListeners() {
  if (window._offlineListenersSetup) return;
  window._offlineListenersSetup = true;

  window.addEventListener('online', function() {
    fetch('/api/stats', { headers: { 'Authorization': 'Bearer ' + S.token } })
      .then(function(r) {
        if (r.ok) {
          S.isOnline = true;
          updateNetworkStatusUI();
          showToast('🟢 Связь с сервером восстановлена!', 'success');
          syncOutbox();
        }
      })
      .catch(function() {
        console.warn('Browser online event fired, but server is still unreachable');
      });
  });

  window.addEventListener('offline', function() {
    S.isOnline = false;
    updateNetworkStatusUI();
    showToast('🟡 Переход в автономный режим (оффлайн)', 'warning');
  });

  setInterval(function() {
    if (!S.token) return;
    if (!S.isOnline || S.outboxCount > 0) {
      fetch('/api/stats', { headers: { 'Authorization': 'Bearer ' + S.token } })
        .then(function(r) {
          if (r.ok) {
            if (!S.isOnline) {
              S.isOnline = true;
              showToast('🟢 Сервер снова доступен!', 'success');
            }
            syncOutbox();
          } else {
            S.isOnline = false;
          }
          updateNetworkStatusUI();
        })
        .catch(function() {
          S.isOnline = false;
          updateNetworkStatusUI();
        });
    }
  }, 20000);

  refreshOutboxCount();
}

// ─── API ──────────────────────────────────────────────────────────────────────