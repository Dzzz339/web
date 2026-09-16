function init() {
  setupOfflineListeners();
  renderNav();
  if (!S.token) {
    renderApp();
    return;
  }

  loadNotifications();
  if (!window.notifInterval) {
    window.notifInterval = setInterval(loadNotifications, 30000);
  }

  initChatSocket();
  
  setApp('<div class="spin-wrap"><div class="spin"></div><p style="margin-top:.75rem">Загрузка…</p></div>');

  // Читаем локальный кэш из IndexedDB, чтобы приложение мгновенно работало даже без сети
  Promise.all([
    idbGet('stats'),
    idbGet('tasks'),
    idbGet('chains'),
    idbGet('import-info'),
    idbGet('marches'),
    idbGet('users'),
    idbGet('contractors')
  ]).then(function(cached) {
    var cachedStats = cached[0] || {};
    var cachedTasks = Array.isArray(cached[1]) ? cached[1] : [];
    var cachedChains = Array.isArray(cached[2]) ? cached[2] : [];
    var cachedImportInfo = cached[3] || null;
    var cachedMarches = Array.isArray(cached[4]) ? cached[4] : [];
    var cachedUsers = Array.isArray(cached[5]) ? cached[5] : [];
    var cachedContractors = Array.isArray(cached[6]) ? cached[6] : [];

    var requests = [api('/stats'), api('/tasks'), api('/chains'), api('/import-info'), api('/marches')];
    if (S.user && S.user.role === 'admin') {
      requests.push(api('/users'));
      requests.push(api('/contractors'));
    }

    Promise.all(requests).then(function(res) {
      var netStats = (res[0] && !res[0].error) ? res[0] : cachedStats;
      var netTasks = Array.isArray(res[1]) ? res[1] : cachedTasks;
      var netChains = Array.isArray(res[2]) ? res[2] : cachedChains;
      var netImportInfo = (res[3] && !res[3].error) ? res[3] : cachedImportInfo;
      var netMarches = Array.isArray(res[4]) ? res[4] : cachedMarches;
      var netUsers = Array.isArray(res[5]) ? res[5] : cachedUsers;
      var netContractors = Array.isArray(res[6]) ? res[6] : cachedContractors;

      S.stats = netStats;
      S.tasks = netTasks;
      S.chains = netChains;
      S.importInfo = netImportInfo;
      S.marches = netMarches;
      S.users = netUsers;
      S.contractors = netContractors;

      if (Array.isArray(S.chains) && S.chains.length) {
        var firstReal = S.chains.find(function(c){ return c.id && c.id !== '(без региона)'; });
        S.selChain = (firstReal || S.chains[0]).id;
      }

      refreshOutboxCount();
      renderApp();

      if (S.isOnline) {
        syncOutbox();
      }
    }).catch(function(err) {
      console.warn("Network init failed, loading from local offline cache:", err);
      S.isOnline = false;
      S.stats = cachedStats;
      S.tasks = cachedTasks;
      S.chains = cachedChains;
      S.importInfo = cachedImportInfo;
      S.marches = cachedMarches;
      S.users = cachedUsers;
      S.contractors = cachedContractors;

      if (Array.isArray(S.chains) && S.chains.length) {
        var firstReal = S.chains.find(function(c){ return c.id && c.id !== '(без региона)'; });
        S.selChain = (firstReal || S.chains[0]).id;
      }

      refreshOutboxCount();
      renderApp();
    });
  });
}

function go(page) {
  S.page = page;
  toggleMobileSidebar(false);
  renderNav();
  renderApp();
}

// ─── SIDEBAR & NAV ───────────────────────────────────────────────────────────

function handleLogoClick() {
  var sb = document.getElementById('sidebar');
  if (sb && sb.classList.contains('collapsed')) {
    toggleSidebarCollapse();
  }
}

function toggleSidebarCollapse() {
  var sb = document.getElementById('sidebar');
  var logo = document.getElementById('sidebar-logo');
  if (!sb) return;
  var isCollapsed = sb.classList.toggle('collapsed');
  var icon = document.getElementById('collapse-icon');
  if (icon) icon.textContent = isCollapsed ? '▶' : '◀';
  if (logo) logo.title = isCollapsed ? 'Нажмите, чтобы развернуть меню' : 'Stockeasy';
  localStorage.setItem('sidebar_collapsed', isCollapsed ? 'true' : 'false');
}

function toggleMobileSidebar(open) {
  var sb = document.getElementById('sidebar');
  var backdrop = document.getElementById('sidebar-backdrop');
  if (!sb || !backdrop) return;
  if (open === undefined) {
    var isOpen = sb.classList.contains('mobile-open');
    sb.classList.toggle('mobile-open', !isOpen);
    backdrop.classList.toggle('active', !isOpen);
  } else {
    sb.classList.toggle('mobile-open', open);
    backdrop.classList.toggle('active', open);
  }
}

function renderNav() {
  var sb = document.getElementById('sidebar');
  var topbar = document.getElementById('topbar');
  var navEl = document.getElementById('sidebar-nav');
  var footerEl = document.getElementById('sidebar-footer');
  var topbarTitle = document.getElementById('topbar-title');
  var notifContainer = document.getElementById('notif-container');
  var logo = document.getElementById('sidebar-logo');

  // Если не авторизован — скрываем сайдбар и топбар
  if (!S.token) {
    if (sb) sb.style.display = 'none';
    if (topbar) topbar.style.display = 'none';
    return;
  }

  // Если авторизован — показываем сайдбар и топбар
  if (sb) sb.style.display = 'flex';
  if (topbar) topbar.style.display = 'flex';
  if (notifContainer) notifContainer.style.display = 'block';
  updateNetworkStatusUI();

  // Восстанавливаем сохраненное состояние сворачивания сайдбара
  var isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
  if (sb) {
    if (isCollapsed) {
      sb.classList.add('collapsed');
      var icon = document.getElementById('collapse-icon');
      if (icon) icon.textContent = '▶';
      if (logo) logo.title = 'Нажмите, чтобы развернуть меню';
    } else {
      sb.classList.remove('collapsed');
      var icon = document.getElementById('collapse-icon');
      if (icon) icon.textContent = '◀';
      if (logo) logo.title = 'Stockeasy';
    }
  }

  // Обновляем заголовок в топбаре
  var curItem = NAV.find(function(it){ return it.id === S.page; });
  if (topbarTitle) {
    if (S.page === 'profile') {
      topbarTitle.innerHTML = '<span class="topbar-title-icon">' + ICONS.profile + '</span><span>Мой профиль</span>';
    } else if (curItem) {
      topbarTitle.innerHTML = '<span class="topbar-title-icon">' + curItem.icon + '</span><span>' + escHtml(curItem.label) + '</span>';
    } else {
      topbarTitle.innerHTML = 'Stockeasy';
    }
  }

  // Рендерим категории навигации
  if (navEl) {
    navEl.innerHTML = '';
    NAV_SECTIONS.forEach(function(sec) {
      // Фильтруем пункты по роли пользователя
      var visibleItems = sec.items.filter(function(item) {
        if (S.user && S.user.role === 'worker' && (item.id === 'dashboard' || item.id === 'data' || item.id === 'supply')) {
          return false;
        }
        if ((item.id === 'users' || item.id === 'logs' || item.id === 'contractors') && (!S.user || S.user.role !== 'admin')) {
          return false;
        }
        return true;
      });

      if (!visibleItems.length) return;

      // Заголовок секции
      var secTitle = document.createElement('div');
      secTitle.className = 'sidebar-sec-title';
      secTitle.textContent = sec.title;
      navEl.appendChild(secTitle);

      // Кнопки разделов
      visibleItems.forEach(function(item) {
        var isDashSub = S.page.startsWith('dash-');
        var isActive = S.page === item.id || (item.id === 'dashboard' && isDashSub);
        var isDashOpen = S.dashMenuOpen !== undefined ? S.dashMenuOpen : (isActive || isDashSub);

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sidebar-item' + (isActive ? ' active' : '');
        btn.title = item.label;

        var arrowHtml = item.hasChildren ? '<span class="sidebar-arrow' + (isDashOpen ? ' open' : '') + '">▶</span>' : '';
        btn.innerHTML = '<span class="sidebar-item-icon">' + item.icon + '</span><span class="sidebar-item-label">' + item.label + '</span>' + arrowHtml;

        btn.onclick = function(e) {
          if (item.hasChildren) {
            var sb = document.getElementById('sidebar');
            if (sb && sb.classList.contains('collapsed')) {
              toggleSidebarCollapse();
            }
            S.dashMenuOpen = !isDashOpen;
            if (S.page !== 'dashboard' && !S.page.startsWith('dash-')) {
              go('dashboard');
            } else {
              renderNav();
            }
          } else {
            go(item.id);
          }
        };
        navEl.appendChild(btn);

        // Рендерим подменю для Обзора
        if (item.hasChildren && item.children && isDashOpen) {
          var subWrap = document.createElement('div');
          subWrap.className = 'sidebar-submenu';
          item.children.forEach(function(sub) {
            var subActive = (sub.id === 'dash-summary' && S.page === 'dashboard') || (S.page === sub.id);
            var subBtn = document.createElement('button');
            subBtn.type = 'button';
            subBtn.className = 'sidebar-subitem' + (subActive ? ' active' : '');
            subBtn.textContent = sub.label;
            subBtn.onclick = function() {
              if (sub.id === 'dash-summary') go('dashboard');
              else go(sub.id);
            };
            subWrap.appendChild(subBtn);
          });
          navEl.appendChild(subWrap);
        }
      });
    });
  }

  // Рендерим футер сайдбара (пользователь + выход)
  if (footerEl) {
    var userName = (S.user && (S.user.fullName || S.user.username)) || 'Пользователь';
    var userRole = (S.user && S.user.role === 'admin') ? 'Администратор' : 'Исполнитель';
    var initial = (userName.trim()[0] || 'U').toUpperCase();
    var isProfileActive = S.page === 'profile';
    var avatarInner = (S.user && S.user.avatarUrl) 
      ? '<img src="' + escHtml(S.user.avatarUrl) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.parentElement.innerHTML=\'' + initial + '\'">'
      : initial;

    footerEl.innerHTML = 
      '<div class="sidebar-user' + (isProfileActive ? ' active' : '') + '" onclick="go(\'profile\')" title="' + escHtml(userName) + ' (' + userRole + ') — Профиль">' +
        '<div class="sidebar-user-avatar">' + avatarInner + '</div>' +
        '<div class="sidebar-user-info">' +
          '<div class="sidebar-user-name">' + escHtml(userName) + '</div>' +
          '<div class="sidebar-user-role">' + userRole + '</div>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="sidebar-logout-btn" onclick="doLogout()" title="Выйти из аккаунта">' +
        '<span class="sidebar-item-icon">' + ICONS.logout + '</span>' +
        '<span class="sidebar-item-label">Выход</span>' +
      '</button>';
  }
}

function doLogout() {
  localStorage.clear();
  location.reload();
}

function setApp(html) { document.getElementById('app').innerHTML = html; }
// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderApp() {
  if (!S.token) {
    setApp(pageLogin());
    return;
  }
  // 1. ЗАПОМИНАЕМ ФОКУС (Безопасно)
  var activeEl = document.activeElement;
  var activeId = (activeEl && activeEl.id) ? activeEl.id : null;
  var start = null, end = null;
  
  // Проверяем, поддерживает ли элемент выделение (только для текстовых инпутов)
  try {
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      start = activeEl.selectionStart;
      end = activeEl.selectionEnd;
    }
  } catch (e) {
    // Игнорируем, если элемент не поддерживает выбор (например, чекбоксы)
  }

  // 2. Отрисовка страницы
  if      (S.page === 'dashboard' || S.page.startsWith('dash-')) setApp(pageDash());
  else if (S.page === 'users')     setApp(pageUsers());
  else if (S.page === 'logs')      setApp(pageLogs());
  else if (S.page === 'chat')      setApp(pageChat());
  else if (S.page === 'contractors') setApp(pageContractors());
  else if (S.page === 'supply')    setApp(pageSupply());
  else if (S.page === 'kanban')    setApp(pageKanban());
  else if (S.page === 'tasks')     setApp(pageTasks());
  else if (S.page === 'card')      setApp(pageCard());
  else if (S.page === 'data')      setApp(pageData());
  else if (S.page === 'marches')   setApp(pageMarches());
  else if (S.page === 'march-detail') setApp(pageMarchDetail());
  else if (S.page === 'profile')   setApp(pageProfile());
  else if (S.page === 'help')      setApp(pageHelp());

  // 3. Вешаем события заново
  bindEvents();

  // 4. ВОЗВРАЩАЕМ ФОКУС
  if (activeId) {
    var el = document.getElementById(activeId);
    if (el) {
      el.focus();
      if (start !== null && el.setSelectionRange) {
        try { el.setSelectionRange(start, end); } catch(e) {}
      }
    }
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
// Загрузка и показ уведомлений

function loadNotifications() {
  if (!S.token) return;
  api('/notifications').then(function(list) {
    if (!Array.isArray(list)) return;
    S.notifications = list;
    
    var unreadCount = list.filter(n => !n.is_read).length;
    var badge = document.getElementById('notif-badge');
    var container = document.getElementById('notif-container');

    if (container) container.style.display = 'block';
    
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
  });
}

function toggleNotifications() {
  var box = document.getElementById('notif-dropdown');
  if (!box) return;
  var isHidden = box.style.display === 'none';

  if (isHidden) {
    // 1. Сначала запрашиваем СВЕЖИЕ уведомления с сервера
    api('/notifications').then(function(list) {
      if (Array.isArray(list)) {
        S.notifications = list;
        
        // Обновляем бейдж с цифрой
        var unreadCount = list.filter(n => !n.is_read).length;
        var badge = document.getElementById('notif-badge');
        if (badge) {
          badge.textContent = unreadCount;
          badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        }

        // Рендерим список
        var items = list.map(function(n) {
          var bg = n.is_read ? '#fff' : 'var(--orange-bg)';
          var relatedTask = n.link ? S.tasks.find(function(x){ return String(x.id) === String(n.link); }) : null;
          var showActions = relatedTask && relatedTask.assignmentStatus === 'pending' && relatedTask.assignee === (S.user.fullName || '');
          var actionsHtml = showActions
            ? '<div style="display:flex;gap:.4rem;margin-top:6px" onclick="event.stopPropagation()">' +
                '<button class="btn btn-sm" onclick="acceptTaskFromNotif(\'' + n.link + '\')">✅ Принять</button>' +
                '<button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="declineTaskFromNotif(\'' + n.link + '\')">❌ Отказаться</button>' +
              '</div>'
            : '';
          return `
            <div style="padding:10px 14px; border-bottom:1px solid #f4f4f5; background:${bg}; cursor:pointer" onclick="openNotifLink('${n.link || ''}')">
              <div style="font-weight:600; color:var(--text); margin-bottom:2px">${n.title}</div>
              <div style="color:var(--text-2); font-size:.75rem">${n.body || ''}</div>
              <div style="color:var(--text-3); font-size:.65rem; margin-top:4px">${new Date(n.created_at).toLocaleString('ru')}</div>
              ${actionsHtml}
            </div>
          `;
        }).join('');
        
        document.getElementById('notif-list').innerHTML = items || '<div style="padding:15px; text-align:center; color:var(--text-3)">Нет уведомлений</div>';
      }
      box.style.display = 'block';
    });
  } else {
    box.style.display = 'none';
  }
}

function markNotifsRead() {
  api('/notifications/read-all', { method: 'PUT' }).then(function() {
    loadNotifications();
    var box = document.getElementById('notif-dropdown');
    if (box) box.style.display = 'none';
  });
}

function openNotifLink(link) {
  var box = document.getElementById('notif-dropdown');
  if (box) box.style.display = 'none';
  if (link) openCard(link); // Если в ссылке был ID заявки - открываем её
}

// Закрытие выпадашки при клике мимо
document.addEventListener('click', function(e) {
  var container = document.getElementById('notif-container');
  var box = document.getElementById('notif-dropdown');
  if (box && container && !container.contains(e.target)) {
    box.style.display = 'none';
  }
});


function pageLogin() {
  return `
    <div style="display:flex;align-items:center;justify-content:center;min-height:80vh">
      <div class="card p" style="width:100%;max-width:320px;text-align:center">
        <h1 class="page-title">Вход в Stockeasy</h1>
        <div id="lerr" style="color:var(--red);font-size:.8rem;margin-bottom:1rem"></div>
        <input id="luser" type="text" placeholder="Логин" style="width:100%;margin-bottom:.75rem">
        <input id="lpass" type="password" placeholder="Пароль" style="width:100%;margin-bottom:1.25rem">
        <button class="btn" style="width:100%" onclick="doLogin()">Войти</button>
      </div>
    </div>
  `;
}


function bindEvents() {
  // chain region rows
  document.querySelectorAll('[data-cid]').forEach(function(el) {
    el.addEventListener('click', function() { S.selChain = decodeURIComponent(el.dataset.cid); S.selChainStep = null; renderApp(); });
  });
  // chain step click
  document.querySelectorAll('[data-step]').forEach(function(el) {
    el.addEventListener('click', function() {
      var key = el.dataset.step;
      S.selChainStep = S.selChainStep === key ? null : key;
      renderApp();
    });
  });
  // chain manager filter
  var cmf = document.getElementById('chain_mgr_filter');
  if (cmf) cmf.addEventListener('change', function(){ S.chainMgr = this.value; renderApp(); });
  // kanban move
  document.querySelectorAll('.kmove').forEach(function(sel) {
    sel.addEventListener('change', function() { moveTask(sel.dataset.tid, sel.value); });
  });
  // kanban filters
  var kq = document.getElementById('kq');
  if (kq) kq.addEventListener('input', function(){ S.kanbanQ = this.value; renderApp(); });
  var kreg = document.getElementById('kreg');
  if (kreg) kreg.addEventListener('change', function(){ S.kanbanReg = this.value; renderApp(); });
  var kmgr = document.getElementById('kmgr');
  if (kmgr) kmgr.addEventListener('change', function(){ S.kanbanMgr = this.value; renderApp(); });
  var kcust = document.getElementById('kcust');
  if (kcust) kcust.addEventListener('change', function(){ S.kanbanCustomer = this.value; renderApp(); });
  // add task
  var tarch = document.getElementById('tarch');
  if (tarch) tarch.addEventListener('change', function(){ S.taskArch = this.value; renderApp(); });
  var tstage = document.getElementById('tstage');
  if (tstage) tstage.addEventListener('change', function(){ S.taskStage = this.value; renderApp(); });
  var tsort = document.getElementById('tsort');
  if (tsort) tsort.addEventListener('change', function(){ S.taskSort = this.value; renderApp(); });
  var tcontr = document.getElementById('tcontr');
  if (tcontr) tcontr.addEventListener('change', function(){ S.taskContractor = this.value; renderApp(); });
  var addBtn = document.getElementById('addBtn');
  if (addBtn) addBtn.addEventListener('click', addTask);
  var ntask = document.getElementById('ntask');
  if (ntask) ntask.addEventListener('keypress', function(e){ if(e.key==='Enter') addTask(); });
    // Живое редактирование карточки заявки
  var cardForm = document.getElementById('cardForm');
  if (cardForm) {
    cardForm.addEventListener('change', function(e) {
      var el = e.target;
      if (!el.name) return;
      var newVal = (el.type === 'checkbox') ? el.checked : el.value;
      var t = S.tasks.find(function(x){ return String(x.id) === String(S.cardId); });
      if (!t) return;
      var origVal = t[el.name];
      var isBool = typeof newVal === 'boolean';
      var same = isBool ? (!!origVal === newVal) : (String(origVal||'') === String(newVal));
      if (same) {
        delete S.cardDraft[el.name];
      } else {
        S.cardDraft[el.name] = newVal;
      }
      renderApp();
    });
  }
  var cardSaveBtn = document.getElementById('cardSaveBtn');
  if (cardSaveBtn) cardSaveBtn.addEventListener('click', function(){ S.cardConfirmOpen = true; renderApp(); });
  var cardResetBtn = document.getElementById('cardResetBtn');
  if (cardResetBtn) cardResetBtn.addEventListener('click', function(){ S.cardDraft = {}; S.cardConfirmOpen = false; renderApp(); });
  var cardConfirmCancelBtn = document.getElementById('cardConfirmCancelBtn');
  if (cardConfirmCancelBtn) cardConfirmCancelBtn.addEventListener('click', function(){ S.cardConfirmOpen = false; renderApp(); });
  var cardConfirmOkBtn = document.getElementById('cardConfirmOkBtn');
  if (cardConfirmOkBtn) cardConfirmOkBtn.addEventListener('click', saveCard);
  // task filters
  var tq = document.getElementById('tq');


   if (tq) {
    tq.addEventListener('input', function() {
      var val = this.value;
      // Очищаем старый таймер, если пользователь нажал клавишу быстрее, чем через 300мс
      clearTimeout(searchTimeout); 
      
      // Ставим новый таймер
      searchTimeout = setTimeout(function() {
        S.taskQ = val;
        renderApp(); 
      }, 300);
    });
  }
  var tst = document.getElementById('tst');
  if (tst) tst.addEventListener('change', function(){ S.taskSt = this.value; renderApp(); });
  var tpr = document.getElementById('tpr');
  if (tpr) tpr.addEventListener('change', function(){ S.taskPr = this.value; renderApp(); });
  var tcust = document.getElementById('tcust');
  if (tcust) tcust.addEventListener('change', function(){ S.taskCustomer = this.value; renderApp(); });
  var treg = document.getElementById('treg');
  if (treg) treg.addEventListener('change', function(){ S.taskReg = this.value; renderApp(); });
  var tmgr = document.getElementById('tmgr');
  if (tmgr) tmgr.addEventListener('change', function(){ S.taskMgr = this.value; renderApp(); });
  var tyr = document.getElementById('tyr');
  if (tyr) tyr.addEventListener('change', function(){ S.taskYear = this.value; renderApp(); });
  var tovd = document.getElementById('tovd');
  if (tovd) tovd.addEventListener('change', function(){ S.taskOverdue = this.value; renderApp(); });
  // file upload
  var ufile = document.getElementById('ufile');
  if (ufile) ufile.addEventListener('change', function(){ if(this.files[0]) doUpload(this.files[0]); });
  var uzone = document.getElementById('uzone');
  if (uzone) {
    uzone.addEventListener('dragover', function(e){ e.preventDefault(); uzone.classList.add('drag'); });
    uzone.addEventListener('dragleave', function(){ uzone.classList.remove('drag'); });
    uzone.addEventListener('drop', function(e){
      e.preventDefault(); uzone.classList.remove('drag');
      if (e.dataTransfer.files[0]) doUpload(e.dataTransfer.files[0]);
    });
  }
}

// ─── Парсинг Excel на стороне браузера ───────────────────────────────────────

function doLogin() {
  var u = document.getElementById('luser').value;
  var p = document.getElementById('lpass').value;
  if(!u || !p) return;

  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p })
  })
  .then(r => r.json().then(data => ({ status: r.status, data })))
  .then(res => {
    if (res.status !== 200) {
      document.getElementById('lerr').textContent = res.data.error;
    } else {
      S.token = res.data.token;
      S.user = res.data.user;
      localStorage.setItem('token', S.token);
      localStorage.setItem('user', JSON.stringify(S.user));
      location.reload();
       // Перезагружаем данные уже с токеном
    }
  });
}

// --- ЛОГИКА ПОДРЯДЧИКОВ ---


// Запуск приложения
init();
