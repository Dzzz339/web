function pageChat() {
  // Запускаем подключение WebSockets если ещё не подключены
  initChatSocket();

  // Запрашиваем списки чатов с сервера
  api('/chats').then(function(res) {
    if (!res) return;
    S.chatList = res;

    // Генерируем список личек с поддержкой аватарок
    var usersHtml = (res.users || []).map(function(u) {
      var displayName = u.full_name || u.username;
      var initial = (displayName.trim()[0] || 'U').toUpperCase();
      var avatarContent = u.avatar_url 
        ? '<img src="' + escHtml(u.avatar_url) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.innerHTML=\'' + initial + '\'">'
        : initial;

      return `
        <div onclick="openDirectChat(${u.id}, '${escHtml(displayName)}', '${escHtml(u.avatar_url || '')}')" 
             style="padding:10px 14px; border-bottom:1px solid var(--border); cursor:pointer; display:flex; align-items:center; gap:10px;"
             onmouseover="this.style.background='var(--orange-bg)'" onmouseout="this.style.background='#fff'">
          <div style="background:var(--orange); color:#fff; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:.85rem; flex-shrink:0; overflow:hidden;">
            ${avatarContent}
          </div>
          <div style="overflow:hidden;">
            <div style="font-weight:600; font-size:.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(displayName)}</div>
            <div style="font-size:.7rem; color:var(--text-3)">${u.role === 'admin' ? 'Администратор' : 'Монтажник'}</div>
          </div>
        </div>
      `;
    }).join('');

    var sidebar = document.getElementById('chat-sidebar-users');
    if (sidebar) sidebar.innerHTML = usersHtml || '<div class="p t3">Нет других пользователей</div>';
  });

  if (S.aiActive) {
    setTimeout(initAiChat, 30);
  }

  return `
    <h1 class="page-title">Мессенджер</h1>
    <div class="card" style="display:grid; grid-template-columns: 280px 1fr; height:70vh; overflow:hidden">
      
      <!-- Левая колонка: Диалоги -->
      <div style="border-right:1px solid var(--border); display:flex; flex-direction:column; background:#fafafa">
        <div style="padding:12px 14px; border-bottom:1px solid var(--border); font-weight:700" class="sec-title">Чаты</div>
        <div style="overflow-y:auto; flex:1">
          
          <!-- Общий чат -->
          <div onclick="openGeneralChat()" 
               style="padding:12px 14px; border-bottom:1px solid var(--border); cursor:pointer; display:flex; align-items:center; gap:10px; background:${!S.aiActive && S.activeRoomId ? 'var(--orange-bg)' : '#fff'}"
               onmouseover="this.style.background='var(--orange-bg)'" onmouseout="if(S.aiActive || !S.activeRoomId) this.style.background='#fff'">
            <div style="background:#2563eb; color:#fff; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0;">📢</div>
            <div>
              <div style="font-weight:700; font-size:.9rem">Общий чат компании</div>
              <div style="font-size:.72rem; color:var(--text-3)">Все сотрудники</div>
            </div>
          </div>

          <!-- Стоки -->
          <div onclick="go('aichat')" id="ai-sidebar-item"
               style="padding:12px 14px; border-bottom:1px solid var(--border); cursor:pointer; display:flex; align-items:center; gap:10px; background:${S.aiActive ? 'var(--orange-bg)' : '#fff'}"
               onmouseover="this.style.background='var(--orange-bg)'" onmouseout="if(!S.aiActive) this.style.background='#fff'">
            <div style="background:var(--orange); color:#fff; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; padding:6px;">
              ${ICONS.stocky}
            </div>
            <div>
              <div style="font-weight:700; font-size:.9rem">Стоки</div>
              <div style="font-size:.72rem; color:var(--text-3)">Аналитика · Снабжение · Расчёт ТМЦ</div>
            </div>
          </div>

          <div style="padding:8px 14px; font-size:.7rem; font-weight:700; color:var(--text-3); text-transform:uppercase; margin-top:8px">Личные сообщения</div>
          <div id="chat-sidebar-users">Загрузка...</div>
        </div>
      </div>

      <!-- Правая колонка: Окно переписки -->
      <div style="display:flex; flex-direction:column; background:#fff; height:100%; min-height:0; overflow:hidden">
        ${S.aiActive ? `
        <!-- ШАПКА СТОКИ -->
        <div style="padding:12px 16px; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:8px">
          <div style="display:flex; align-items:center; justify-content:space-between">
            <div style="font-weight:700; font-size:1rem; display:flex; align-items:center; gap:8px;">
              <span style="width:20px;height:20px;display:inline-flex;color:var(--orange);">${ICONS.stocky}</span>
              <span>Стоки</span>
              <span id="ai-mode-label" style="font-size:.75rem; color:var(--text-3); font-weight:normal;"></span>
            </div>
            <div id="ai-health-status" style="font-size:.72rem; padding:3px 10px; border-radius:12px; background:#f3f4f6; color:#6b7280; font-weight:600; cursor:pointer;" onclick="checkAiHealth(true)" title="Проверить статус связи с Ollama">
              ⏳ Проверка связи...
            </div>
          </div>

          <!-- Панель управления Стоки: Автоматизация и контекст заявки -->
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            ${S.user && S.user.role === 'admin' ? `
              <button class="btn btn-sm btn-analytics-styled ${S.workflowOpen ? 'active' : ''}" id="wf-toggle-btn" onclick="toggleWorkflowPanel()" title="Построитель сценариев автоматизации">
                ⚡ <span>Автоматизация</span>
              </button>
              <button class="btn btn-sm btn-analytics-styled" onclick="openFullAutomationModal()" title="Центр полной автоматизации и типовых сценариев">
                🎛️ <span>Полная автоматизация</span>
              </button>
            ` : ''}

            <!-- Поиск заявки для контекста -->
            <div class="ai-task-search-wrap" id="ai-task-search-container" style="flex:1; min-width:220px;">
              <div id="ai-task-selected-wrap" style="display:none; align-items:center; gap:8px;">
                <div class="ai-task-selected-badge">
                  <span id="ai-task-selected-text"></span>
                  <span class="clear-btn" onclick="clearAiSelectedTask()" title="Снять выбор заявки">✕</span>
                </div>
              </div>
              <input type="text" id="ai-task-search-input" class="ai-task-search-input" placeholder="🔍 Поиск заявки для контекста (номер, адрес, регион...)" oninput="handleAiTaskSearch(this.value)" onfocus="handleAiTaskSearch(this.value)" autocomplete="off">
              <div id="ai-task-dropdown" class="ai-task-dropdown"></div>
              <select id="ai-task-select" style="display:none;"></select>
            </div>
            <button class="btn btn-sm btn-analytics-styled" onclick="insertAiCardContext()" title="Подставить данные заявки в вопрос">${ICONS.clip} <span>Вставить контекст</span></button>
          </div>
        </div>

        <!-- ПАНЕЛЬ АВТОМАТИЗАЦИИ (WORKFLOW) -->
        <div id="workflow-panel" class="workflow-panel" style="display:${S.workflowOpen ? 'block' : 'none'};"></div>

        <!-- ИИ-сообщения -->
        <div id="ai-messages" style="flex:1; min-height:0; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; background:var(--bg)">
          <div style="text-align:center; color:var(--text-3); margin-top:2rem" id="ai-empty">
            <div style="width:48px; height:48px; border-radius:12px; background:var(--orange-bg); color:var(--orange); display:inline-flex; align-items:center; justify-content:center; margin-bottom:8px;">
              ${ICONS.stocky}
            </div>
            <div style="font-weight:700; color:var(--text); font-size:1rem; margin-bottom:4px;">Привет! Я Стоки</div>
            <div style="font-size:.82rem;">Задайте любой вопрос по заявкам, аналитике, дефицитам ТМЦ, сметам или стандартам монтажа</div>
          </div>
        </div>


        <!-- ИИ-ввод -->
        <div id="ai-input-area" style="padding:10px 16px; border-top:1px solid var(--border); display:flex; gap:10px; background:#fff">
          <input id="ai_text_input" type="text" placeholder="Задайте вопрос Стоки..." style="flex:1" onkeydown="if(event.key==='Enter') sendAiMessage()">
          <button class="btn" id="ai-send-btn" onclick="sendAiMessage()">Отправить ➔</button>
        </div>
        ` : `
        <!-- Шапка активного чата -->
        <div style="padding:12px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between">
          <div style="font-weight:700; font-size:1rem; display:flex; align-items:center; gap:10px;" id="chat-title">
            <span>Выберите чат слева</span>
          </div>
        </div>

        <!-- Сообщения (скроллится ТОЛЬКО этот блок) -->
        <div id="chat-messages" style="flex:1; min-height:0; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; background:var(--bg)">
          <div style="text-align:center; color:var(--text-3); margin-top:2rem">Выберите собеседника слева, чтобы начать переписку</div>
        </div>

        <!-- Поле ввода (ВСЕГДА прижато к низу) -->
        <div id="chat-input-area" style="padding:12px 16px; border-top:1px solid var(--border); display:none; gap:10px; background:#fff">
          <input id="chat_text_input" type="text" placeholder="Напишите сообщение..." style="flex:1" onkeydown="if(event.key==='Enter') sendChatMessage()">
          <button class="btn" onclick="sendChatMessage()">Отправить ➔</button>
        </div>
        `}
      </div>

    </div>
  `;
}

// ─── СТРАНИЦА «СТОКИ» (ОТДЕЛЬНАЯ ЯЧЕЙКА В МЕНЮ) ─────────────────────────────
function pageAiChat() {
  initChatSocket();
  setTimeout(function() {
    initAiChat();
  }, 30);

  return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:10px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:36px; height:36px; border-radius:10px; background:var(--orange); color:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0; padding:6px;">
          ${ICONS.stocky}
        </div>
        <div>
          <h1 class="page-title" style="margin:0; font-size:1.3rem;">Стоки</h1>
          <div style="font-size:.78rem; color:var(--text-3);" id="ai-mode-label">Умный помощник Stockeasy</div>
        </div>
      </div>
      <div id="ai-health-status" style="font-size:.75rem; padding:4px 12px; border-radius:12px; background:#f3f4f6; color:#6b7280; font-weight:600; cursor:pointer;" onclick="checkAiHealth(true)" title="Проверить статус связи с Ollama">
        ⏳ Проверка связи...
      </div>
    </div>

    <div class="card" style="display:flex; flex-direction:column; height:74vh; overflow:hidden; background:#fff;">
      <!-- ШАПКА РЕЖИМОВ И КОНТЕКСТА -->
      <div style="padding:12px 16px; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:10px; background:#fafafa;">
        <!-- Панель управления Стоки: Автоматизация и контекст заявки -->
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          ${S.user && S.user.role === 'admin' ? `
            <button class="btn btn-sm btn-analytics-styled ${S.workflowOpen ? 'active' : ''}" id="wf-toggle-btn" onclick="toggleWorkflowPanel()" title="Построитель сценариев автоматизации">
              ⚡ <span>Автоматизация</span>
            </button>
            <button class="btn btn-sm btn-analytics-styled" onclick="openFullAutomationModal()" title="Центр полной автоматизации и типовых сценариев">
              🎛️ <span>Полная автоматизация</span>
            </button>
          ` : ''}

          <!-- Поиск заявки для контекста -->
          <div class="ai-task-search-wrap" id="ai-task-search-container" style="flex:1; min-width:220px;">
            <div id="ai-task-selected-wrap" style="display:none; align-items:center; gap:8px;">
              <div class="ai-task-selected-badge">
                <span id="ai-task-selected-text"></span>
                <span class="clear-btn" onclick="clearAiSelectedTask()" title="Снять выбор заявки">✕</span>
              </div>
            </div>
            <input type="text" id="ai-task-search-input" class="ai-task-search-input" placeholder="🔍 Поиск заявки для контекста (номер, адрес, регион...)" oninput="handleAiTaskSearch(this.value)" onfocus="handleAiTaskSearch(this.value)" autocomplete="off">
            <div id="ai-task-dropdown" class="ai-task-dropdown"></div>
            <select id="ai-task-select" style="display:none;"></select>
          </div>
          <button class="btn btn-sm btn-analytics-styled" onclick="insertAiCardContext()" title="Подставить данные заявки в вопрос">${ICONS.clip} <span>Вставить контекст</span></button>
        </div>
      </div>

      <!-- ПАНЕЛЬ АВТОМАТИЗАЦИИ (WORKFLOW) -->
      <div id="workflow-panel" class="workflow-panel" style="display:${S.workflowOpen ? 'block' : 'none'};"></div>

      <!-- ИИ-сообщения -->
      <div id="ai-messages" style="flex:1; min-height:0; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px; background:var(--bg);">
        <div style="text-align:center; color:var(--text-3); margin-top:2rem" id="ai-empty">
          <div style="width:48px; height:48px; border-radius:12px; background:var(--orange-bg); color:var(--orange); display:inline-flex; align-items:center; justify-content:center; margin-bottom:8px;">
            ${ICONS.stocky}
          </div>
          <div style="font-weight:700; color:var(--text); font-size:1rem; margin-bottom:4px;">Привет! Я Стоки</div>
          <div style="font-size:.82rem;">Задайте любой вопрос по заявкам, аналитике, дефицитам ТМЦ, сметам или стандартам монтажа</div>
        </div>
      </div>


      <!-- Ввод -->
      <div id="ai-input-area" style="padding:10px 16px; border-top:1px solid var(--border); display:flex; gap:10px; background:#fff">
        <input id="ai_text_input" type="text" placeholder="Задайте вопрос Стоки..." style="flex:1" onkeydown="if(event.key==='Enter') sendAiMessage()">
        <button class="btn" id="ai-send-btn" onclick="sendAiMessage()">Отправить ➔</button>
      </div>
    </div>
  `;
}

// ─── ЛОГИКА МЕССЕНДЖЕРА ───────────────────────────────────────────────────────

function initChatSocket() {
  if (S.socket) return;
  if (typeof io === 'undefined') return console.error('Socket.io client script not loaded');

  S.socket = io();

  // При входе регистрируем ID нашего пользователя на сервере
  if (S.user && S.user.id) {
    S.socket.emit('init-user', S.user.id);
  }

  S.socket.on('new-message', function(msg) {
    if (String(msg.room_id) === String(S.activeRoomId)) {
      S.chatMessages = S.chatMessages || [];
      // Защита: добавляем только если такого сообщения еще нет в списке
      if (!S.chatMessages.some(m => m.id === msg.id)) {
        S.chatMessages.push(msg);
        renderChatMessages();
        scrollChatToBottom();
      }
    }
  });
  S.socket.on('ai-log', function(data) {
    var content = document.getElementById('ai_log_content');
    var box = document.getElementById('ai_log_box');
    if (content && box) {
      var time = new Date().toLocaleTimeString('ru', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
      var line = document.createElement('div');
      line.style.marginBottom = '2px';
      line.innerHTML = '<span style="color:#71717a">[' + time + ']</span> ' + escHtml(data.message);
      content.appendChild(line);
      box.scrollTop = box.scrollHeight;
    }
  });
  S.socket.on('ai-parse-result', function(data) {
    var btn = S.aiParserBtn;
    var inputEl = S.aiParserInput;
    
    var logBox = document.getElementById('ai_log_box');
    if (logBox) logBox.classList.remove('terminal-pulse');
    if (inputEl) inputEl.value = '';

    // Сброс кнопки (она крутила спиннер во время обработки)
    if (btn && S.aiParserBtnText) {
      btn.innerHTML = S.aiParserBtnText;
      btn.disabled = false;
    }

    if (data.error) {
      alert('Ошибка ИИ: ' + data.error);
      return;
    }

    // Автозаполнение полей
    if (data.id) document.getElementById('nt_id').value = data.id;
    if (data.vsp) document.getElementById('nt_vsp').value = data.vsp;
    if (data.region) document.getElementById('nt_region').value = data.region;
    if (data.address) document.getElementById('nt_address').value = data.address;
    if (data.workType) document.getElementById('nt_workType').value = data.workType;
    if (data.dateZayavki) document.getElementById('nt_dateZayavki').value = data.dateZayavki;
    if (data.amount) document.getElementById('nt_amount').value = data.amount;
    if (data.inOrder) document.getElementById('nt_inOrder').value = data.inOrder;
    if (data.manager) document.getElementById('nt_manager').value = data.manager;
    if (data.contact) document.getElementById('nt_contact').value = data.contact;
    if (data.comment) document.getElementById('nt_comment').value = data.comment;

    // Факт оставляем пустым!

    // Авторасчет: Стоимость за ед. = Сумма с НДС / Порты
    if (data.amount && data.inOrder && Number(data.inOrder) > 0) {
      document.getElementById('nt_pricePerUnit').value = Math.round(Number(data.amount) / Number(data.inOrder));
    }

    // Подсветка зеленым заполненных полей
    ['nt_id', 'nt_vsp', 'nt_region', 'nt_address', 'nt_manager', 'nt_contact', 'nt_workType', 'nt_inOrder', 'nt_dateZayavki', 'nt_amount', 'nt_pricePerUnit', 'nt_comment'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el && el.value) {
        el.style.backgroundColor = '#e8f5e9';
        setTimeout(function(){ el.style.backgroundColor = '#fff'; }, 2000);
      }
    });
  });
}

function openGeneralChat() {
  if (!S.chatList || !S.chatList.generalChat) return;
  openChatRoom(S.chatList.generalChat.id, '📢 Общий чат компании');
}

function openDirectChat(targetUserId, targetName) {
  api('/chats/direct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId: targetUserId })
  }).then(function(res) {
    if (res && res.roomId) {
      openChatRoom(res.roomId, '💬 ' + targetName);
    }
  });
}

function openChatRoom(roomId, title) {
  var wasAi = S.aiActive;
  S.aiActive = false;
  if (wasAi) {
    renderApp();
  }
  S.activeRoomId = roomId;
  var titleEl = document.getElementById('chat-title');
  if (titleEl) titleEl.textContent = title;
  var inputArea = document.getElementById('chat-input-area');
  if (inputArea) inputArea.style.display = 'flex';

  // Входим в комнату на сервере по WebSocket
  if (S.socket) S.socket.emit('join-room', roomId);

  // Качаем историю сообщений
  api('/chats/' + roomId + '/messages').then(function(messages) {
    S.chatMessages = messages || [];
    renderChatMessages();
    scrollChatToBottom();
  });
}

function renderChatMessages() {
  var box = document.getElementById('chat-messages');
  if (!box) return;

  if (!S.chatMessages || !S.chatMessages.length) {
    box.innerHTML = '<div style="text-align:center; color:var(--text-3); margin-top:2rem">Нет сообщений. Напишите первым!</div>';
    return;
  }

  var currentUserId = S.user ? S.user.id : null;

  var html = S.chatMessages.map(function(m) {
    var isMe = (m.sender_id === currentUserId || (S.user && m.username === S.user.username));
    var bg = isMe ? 'var(--orange-bg)' : '#fff';
    var align = isMe ? 'flex-end' : 'flex-start';
    var border = isMe ? '1px solid #fed7aa' : '1px solid var(--border)';
    var time = new Date(m.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

    return `
      <div style="align-self:${align}; max-width:70%; background:${bg}; border:${border}; border-radius:10px; padding:8px 12px; box-shadow:var(--shadow)">
        <div style="font-size:.7rem; font-weight:700; color:${isMe ? 'var(--orange-dark)' : 'var(--blue)'}; margin-bottom:3px">
          ${isMe ? 'Вы' : escHtml(m.full_name || m.username || 'Пользователь')}
        </div>
        <div style="font-size:.85rem; color:var(--text); word-break:break-word">${escHtml(m.message_text)}</div>
        <div style="font-size:.65rem; color:var(--text-3); text-align:right; margin-top:4px">${time}</div>
      </div>
    `;
  }).join('');

  box.innerHTML = html;
}

function sendChatMessage() {
  var input = document.getElementById('chat_text_input');
  if (!input) return;
  var text = input.value.trim();
  if (!text || !S.activeRoomId || !S.socket) return;

  var currentUserId = S.user ? (S.user.id || S.user.username) : null;

  // Отправляем по WebSocket
  S.socket.emit('send-message', {
    roomId: S.activeRoomId,
    senderId: currentUserId,
    text: text
  });

  input.value = '';
  input.focus();
}

function scrollChatToBottom() {
  var box = document.getElementById('chat-messages');
  if (box) setTimeout(function(){ box.scrollTop = box.scrollHeight; }, 50);
}

// ─── ЛОГИКА СТОКИ (ИИ-АССИСТЕНТ) ─────────────────────────────────────────────

function openAiChat() {
  go('aichat');
}

function setAiMode(mode) {
  S.aiMode = mode || 'general';
  var label = document.getElementById('ai-mode-label');
  if (label) label.textContent = '— универсальный помощник: аналитика, снабжение, ТМЦ, техпомощь';

  var input = document.getElementById('ai_text_input');
  if (input) {
    input.placeholder = 'Спросите Стоки: аналитика по объектам, дефициты ТМЦ, сметы, подрядчики или стандарты...';
    input.focus();
  }
}

function initAiChat() {
  initAiTaskPicker();
  setAiMode('general');
  if (S.workflowOpen) {
    renderWorkflowPanel();
    var btn = document.getElementById('wf-toggle-btn');
    if (btn) btn.classList.add('active');
  }
  renderAiMessages();
  checkAiHealth(false);
}

// ─── ЖИВОЙ ПОИСК ЗАЯВОК ДЛЯ КОНТЕКСТА ─────────────────────────────────────────

function initAiTaskPicker() {
  var sel = document.getElementById('ai-task-select');
  if (sel && (!sel.options.length || !sel.options[0].getAttribute('data-init'))) {
    sel.setAttribute('data-init', '1');
    sel.innerHTML = '<option value="">— выберите заявку для контекста —</option>' +
      (S.tasks || []).map(function(t) {
        return '<option value="' + escHtml(String(t.id)) + '">' +
          escHtml((t.id || '') + (t.address ? ' — ' + t.address.slice(0, 40) : '') + (t.region ? ' [' + t.region + ']' : '')) +
          '</option>';
      }).join('');
    if (S.aiSelectedTaskId) sel.value = S.aiSelectedTaskId;
  }

  if (S.aiSelectedTaskId) {
    var t = (S.tasks || []).find(function(x){ return String(x.id) === String(S.aiSelectedTaskId); });
    if (t) updateAiSelectedTaskUI(t);
  }

  if (!window._aiTaskDropdownListenerAttached) {
    window._aiTaskDropdownListenerAttached = true;
    document.addEventListener('click', function(e) {
      var container = document.getElementById('ai-task-search-container');
      var dd = document.getElementById('ai-task-dropdown');
      if (dd && container && !container.contains(e.target)) {
        dd.style.display = 'none';
      }
    });
  }
}

function handleAiTaskSearch(q) {
  var dd = document.getElementById('ai-task-dropdown');
  if (!dd) return;

  var tasks = S.tasks || [];
  var query = (q || '').trim().toLowerCase();
  var filtered = [];

  if (!query) {
    filtered = tasks.slice(0, 25);
  } else {
    var words = query.split(/\s+/).filter(Boolean);
    filtered = tasks.filter(function(t) {
      var text = (
        (t.id || '') + ' ' +
        (t.address || '') + ' ' +
        (t.region || '') + ' ' +
        (t.manager || '') + ' ' +
        (t.contractor || '') + ' ' +
        (t.assignee || '') + ' ' +
        (t.vsp || '')
      ).toLowerCase();
      return words.every(function(w){ return text.indexOf(w) > -1; });
    }).slice(0, 35);
  }

  if (!filtered.length) {
    dd.innerHTML = '<div style="padding:10px 12px; font-size:.8rem; color:var(--text-3); text-align:center;">Заявок не найдено</div>';
    dd.style.display = 'block';
    return;
  }

  dd.innerHTML = filtered.map(function(t) {
    var safeId = escHtml(String(t.id));
    var safeAddr = escHtml(t.address || t.title || 'Адрес не указан');
    var safeReg = escHtml(t.region || '—');
    var safeStat = escHtml(t.status || '');
    return `
      <div class="ai-task-option" onclick="selectAiTask('${safeId}')">
        <div class="ai-task-option-id">
          <span>#${safeId}</span>
          <span class="badge b-gray" style="font-size:.68rem;">${safeReg}</span>
        </div>
        <div class="ai-task-option-sub">${safeAddr} · ${safeStat}</div>
      </div>
    `;
  }).join('');
  dd.style.display = 'block';
}

function selectAiTask(taskId) {
  S.aiSelectedTaskId = taskId;
  var sel = document.getElementById('ai-task-select');
  if (sel) sel.value = taskId;

  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (t) updateAiSelectedTaskUI(t);

  var dd = document.getElementById('ai-task-dropdown');
  if (dd) dd.style.display = 'none';
}

function updateAiSelectedTaskUI(t) {
  var wrap = document.getElementById('ai-task-selected-wrap');
  var textEl = document.getElementById('ai-task-selected-text');
  var inp = document.getElementById('ai-task-search-input');
  if (wrap && textEl && inp) {
    textEl.textContent = '#' + t.id + ' (' + (t.address ? t.address.slice(0, 35) : (t.region || '')) + ')';
    wrap.style.display = 'flex';
    inp.style.display = 'none';
  }
}

function clearAiSelectedTask() {
  S.aiSelectedTaskId = null;
  var sel = document.getElementById('ai-task-select');
  if (sel) sel.value = '';

  var wrap = document.getElementById('ai-task-selected-wrap');
  var inp = document.getElementById('ai-task-search-input');
  if (wrap && inp) {
    wrap.style.display = 'none';
    inp.style.display = 'block';
    inp.value = '';
    inp.focus();
  }
}

function checkAiHealth(showAlert) {
  var badge = document.getElementById('ai-health-status');
  if (badge) {
    badge.style.background = '#f3f4f6';
    badge.style.color = '#6b7280';
    badge.textContent = '⏳ Проверка связи...';
  }
  fetch('/api/ai/health', {
    headers: { 'Authorization': 'Bearer ' + S.token }
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!badge) return;
    if (data.status === 'ok') {
      badge.style.background = '#dcfce7';
      badge.style.color = '#15803d';
      var cpuLabel = (data.cpuOnly || data.cpu) ? ' · CPU' : '';
      badge.textContent = '🟢 Ollama онлайн (' + (data.currentModel || 'qwen') + cpuLabel + ')';
      badge.title = 'Базовый адрес: ' + data.baseUrl + '\nТекущая модель: ' + data.currentModel + (cpuLabel ? ' (режим CPU)' : '') + '\nДоступные модели: ' + (data.availableModels || []).join(', ') + '\nНажмите для повторной проверки';
      if (showAlert) {
        alert('✅ Связь с Ollama установлена!\n\nБазовый URL: ' + data.baseUrl + '\nТекущая модель: ' + data.currentModel + (cpuLabel ? ' (работает на CPU)' : '') + '\nДоступные модели:\n' + (data.availableModels || []).join('\n'));
      }
    } else {
      badge.style.background = '#fee2e2';
      badge.style.color = '#b91c1c';
      badge.textContent = '🔴 Ollama недоступна';
      badge.title = 'Ошибка: ' + (data.error || 'не отвечает') + '\nURL: ' + data.baseUrl + '\nНажмите для подсказки';
      if (showAlert) {
        alert('⚠️ Ollama недоступна!\n\nБазовый URL: ' + data.baseUrl + '\nОшибка: ' + data.error + '\n\nИнструкция для исправления на сервере:\n1. Запустите Ollama на сервере.\n2. В Windows задайте системную переменную OLLAMA_HOST=0.0.0.0 и перезапустите Ollama.\n3. Пересоздайте контейнер web в терминале сервера: docker compose up -d');
      }
    }
  })
  .catch(function(err) {
    if (!badge) return;
    badge.style.background = '#fee2e2';
    badge.style.color = '#b91c1c';
    badge.textContent = '🔴 Ошибка связи';
    if (showAlert) alert('Не удалось выполнить проверку связи: ' + err.message);
  });
}

function showAiLoadingIndicator(subtitle) {
  removeAiLoadingIndicator();
  var box = document.getElementById('ai-messages');
  if (!box) return;

  var loader = document.createElement('div');
  loader.id = 'ai-loading-indicator';
  loader.className = 'stocky-loader-bubble';
  loader.innerHTML = `
    <span class="stocky-spinner stocky-spinner-lg"></span>
    <div style="display:flex; flex-direction:column; gap:2px;">
      <strong style="color:var(--orange); font-size:.85rem; display:flex; align-items:center; gap:6px;">
        <span style="width:16px;height:16px;display:inline-flex;">${ICONS.stocky}</span>
        Стоки думает…
      </strong>
      <span style="font-size:.75rem; color:var(--text-3);">${escHtml(subtitle || 'Формирую ответ...')}</span>
    </div>
  `;
  box.appendChild(loader);
  scrollAiToBottom();
}

function removeAiLoadingIndicator() {
  var loader = document.getElementById('ai-loading-indicator');
  if (loader) loader.remove();
}

function renderAiMessages() {
  var box = document.getElementById('ai-messages');
  if (!box) return;
  if (!S.aiMessages || !S.aiMessages.length) {
    box.innerHTML = `
      <div style="text-align:center; color:var(--text-3); margin-top:2rem" id="ai-empty">
        <div style="width:48px; height:48px; border-radius:12px; background:var(--orange-bg); color:var(--orange); display:inline-flex; align-items:center; justify-content:center; margin-bottom:8px;">
          ${ICONS.stocky}
        </div>
        <div style="font-weight:700; color:var(--text); font-size:1rem; margin-bottom:4px;">Привет! Я Стоки</div>
        <div style="font-size:.82rem;">Выберите режим сверху или задайте вопрос по заявкам, оборудованию и ТМЦ</div>
      </div>
    `;
    return;
  }
  var html = S.aiMessages.map(function(m) {
    var isUser = m.role === 'user';
    var bg = isUser ? 'var(--orange-bg)' : '#fff';
    var align = isUser ? 'flex-end' : 'flex-start';
    var border = isUser ? '1px solid #fed7aa' : '1px solid var(--border)';
    var contentHtml = m.isHtml ? m.isHtml : ('<div style="font-size:.85rem; color:var(--text); white-space:pre-wrap; word-break:break-word" class="ai-msg-content">' + escHtml(m.content) + '</div>');
    return `
      <div style="align-self:${align}; max-width:82%; background:${bg}; border:${border}; border-radius:10px; padding:10px 14px; box-shadow:var(--shadow)">
        <div style="font-size:.72rem; font-weight:700; color:${isUser ? 'var(--orange-dark)' : 'var(--orange)'}; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
          ${isUser ? 'Вы' : '<span style="width:16px;height:16px;display:inline-flex;">' + ICONS.stocky + '</span> Стоки'}
        </div>
        ${contentHtml}
        <div style="font-size:.65rem; color:var(--text-3); text-align:right; margin-top:6px">${m.time || ''}</div>
      </div>
    `;
  }).join('');
  box.innerHTML = html;
  scrollAiToBottom();
}

// ─── ПЛАВНЫЙ ВЫВОД ТЕКСТА СТОКИ (TYPEWRITER BUFFER) ──────────────────────────
var _aiSmoothTicker = null;
var _aiCurrentLength = 0;
var _aiStreamTargetText = '';
var _aiStreamIsDone = false;
var _aiStreamOnComplete = null;

function startAiSmoothTyping(onComplete) {
  stopAiSmoothTyping();
  _aiCurrentLength = 0;
  _aiStreamTargetText = '';
  _aiStreamIsDone = false;
  _aiStreamOnComplete = onComplete || null;

  _aiSmoothTicker = setInterval(function() {
    var box = document.getElementById('ai-messages');
    if (!box) {
      stopAiSmoothTyping();
      return;
    }

    var targetLen = _aiStreamTargetText.length;

    // Пока нейросеть думает и нет текста — кружок загрузки («Стоки думает...») крутится
    if (targetLen === 0) {
      if (_aiStreamIsDone) {
        removeAiLoadingIndicator();
        stopAiSmoothTyping();
        if (_aiStreamOnComplete) {
          var cb = _aiStreamOnComplete;
          _aiStreamOnComplete = null;
          cb('');
        }
      }
      return;
    }

    // Первый реальный текст пришел — убираем спиннер и создаем блок ответа
    var streamEl = document.getElementById('ai-stream-box');
    if (!streamEl) {
      removeAiLoadingIndicator();
      var div = document.createElement('div');
      div.id = 'ai-stream-box';
      div.className = 'ai-msg-content';
      div.style.cssText = 'align-self:flex-start; max-width:82%; background:#fff; border:1px solid var(--border); border-radius:10px; padding:10px 14px; box-shadow:var(--shadow)';
      div.innerHTML = '<div style="font-size:.72rem; font-weight:700; color:var(--orange); margin-bottom:4px; display:flex; align-items:center; gap:6px;"><span style="width:16px;height:16px;display:inline-flex;">' + ICONS.stocky + '</span> Стоки</div><div class="ai-stream-text" style="font-size:.85rem; color:var(--text); white-space:pre-wrap; word-break:break-word"></div>';
      box.appendChild(div);
      streamEl = div;
    }

    var textSlot = streamEl.querySelector('.ai-stream-text') || streamEl.lastElementChild;

    if (_aiCurrentLength < targetLen) {
      // Адаптивная скорость: чем больше накопилось в буфере, тем быстрее печатаем
      var diff = targetLen - _aiCurrentLength;
      var step = 1;
      if (diff > 120) step = 10;
      else if (diff > 60) step = 5;
      else if (diff > 25) step = 3;
      else if (diff > 8) step = 2;

      _aiCurrentLength = Math.min(_aiCurrentLength + step, targetLen);
      if (textSlot) {
        textSlot.textContent = _aiStreamTargetText.slice(0, _aiCurrentLength);
        var cursor = document.createElement('span');
        cursor.className = 'ai-stream-cursor';
        textSlot.appendChild(cursor);
      }
      scrollAiToBottom();
    } else if (_aiStreamIsDone && _aiCurrentLength >= targetLen) {
      if (textSlot) {
        textSlot.textContent = _aiStreamTargetText;
      }
      stopAiSmoothTyping();
      if (_aiStreamOnComplete) {
        var cb = _aiStreamOnComplete;
        _aiStreamOnComplete = null;
        cb(_aiStreamTargetText);
      }
    }
  }, 20);
}

function feedAiStreamText(text) {
  _aiStreamTargetText = text || '';
}

function finishAiStream(onComplete) {
  _aiStreamIsDone = true;
  if (onComplete) _aiStreamOnComplete = onComplete;
}

function stopAiSmoothTyping() {
  if (_aiSmoothTicker) {
    clearInterval(_aiSmoothTicker);
    _aiSmoothTicker = null;
  }
}

function renderAiStreamingReply() {
  removeAiLoadingIndicator();
  feedAiStreamText(S.aiStreamText || '');
}

function scrollAiToBottom() {
  var box = document.getElementById('ai-messages');
  if (box) setTimeout(function(){ box.scrollTop = box.scrollHeight; }, 30);
}

function insertAiCardContext() {
  var taskId = S.aiSelectedTaskId;
  if (!taskId) {
    var sel = document.getElementById('ai-task-select');
    if (sel && sel.value) taskId = sel.value;
  }
  if (!taskId) {
    alert('Пожалуйста, сначала найдите и выберите заявку для контекста');
    var inp = document.getElementById('ai-task-search-input');
    if (inp) inp.focus();
    return;
  }
  var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); });
  if (!t) { alert('Заявка не найдена'); return; }
  var ctx = [
    'Заявка #' + t.id,
    'Регион: ' + (t.region || '—'),
    'Адрес: ' + (t.address || '—'),
    'Тип объекта: ' + (t.tip_obj || t.tipObj || '—'),
    'Вид работ: ' + (t.work_type || t.workType || '—'),
    'ГСБ/ВСП: ' + (t.gosb || '—') + '/' + (t.vsp || '—'),
    'Статус: ' + (t.status || '—'),
    'Этап: ' + (t.stage || '—'),
    'Менеджер: ' + (t.manager || '—'),
    'Подрядчик: ' + (t.contractor || '—'),
    'Исполнитель: ' + (t.assignee || '—'),
    'Контролёр: ' + (t.controller || '—'),
    'Портов (заказ): ' + (t.inOrder != null ? t.inOrder : '—'),
    'Портов (факт): ' + (t.fact != null ? t.fact : '—'),
    'Дистанция (км): ' + (t.distanceKm != null ? t.distanceKm : '—'),
    'Цена за порт: ' + (t.pricePerUnit != null ? t.pricePerUnit : '—'),
    'Сумма договора: ' + (t.amount != null ? t.amount : '—'),
    'Срок: ' + (t.deadline || '—'),
    'Просрочка (дней): ' + (t.overdueDays != null ? t.overdueDays : '—'),
    'Комментарий: ' + (t.comment || '—')
  ].join('\n');
  
  var input = document.getElementById('ai_text_input');
  if (!input) return;
  var prefix = 'Контекст заявки:\n' + ctx + '\n\n';
  input.value = (input.value ? input.value + ' ' : '') + prefix.replace(/\n/g, ' | ');
  input.focus();
  alert('Контекст заявки #' + t.id + ' вставлен в поле ввода');
}

function sendAiMessage() {
  var input = document.getElementById('ai_text_input');
  if (!input) return;
  var text = input.value.trim();
  if (!text || S.aiLoading || S.aiStreaming) return;

  var mode = S.aiMode || 'general';
  var cardCtx = null;
  var taskId = S.aiSelectedTaskId;
  if (!taskId) {
    var sel = document.getElementById('ai-task-select');
    if (sel && sel.value) taskId = sel.value;
  }
  if (taskId) {
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); });
    if (t) {
      cardCtx = 'Заявка #' + t.id + ' [' + (t.region||'') + '] ' + (t.address||'') +
        ', статус: ' + (t.status||'') + ', этап: ' + (t.stage||'') +
        ', порты заказ/факт: ' + (t.inOrder||0) + '/' + (t.fact||0) +
        ', сумма: ' + (t.amount||0) + ', подрядчик: ' + (t.contractor||'') +
        ', исполнитель: ' + (t.assignee||'') + ', срок: ' + (t.deadline||'') +
        ', просрочка: ' + (t.overdueDays||0) + ' дн';
    }
  }

  // Добавляем сообщение пользователя
  S.aiMessages = S.aiMessages || [];
  S.aiMessages.push({ role: 'user', content: text, time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) });
  renderAiMessages();
  input.value = '';

  var sendBtn = document.getElementById('ai-send-btn');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="stocky-spinner" style="border-top-color:#fff;border-color:rgba(255,255,255,0.35);margin-right:5px;"></span> Думает…';
  }

  // Автоматическое определение расчёта спецификации оборудования / материалов
  var isDeviceCalc = (mode === 'parse_devices') ||
    /(?:расчёт|расчет|посчитай|рассчитай|смета).*(?:материал|тмц|оборудован|расходник)/i.test(text) ||
    /(?:\d+\s*(?:арм|wifi|wi-fi|точек|камер|коммутатор|шкаф|сервер))/i.test(text);

  if (isDeviceCalc) {
    mode = 'parse_devices';
  } else {
    mode = 'general';
  }

  // ─── РЕЖИМ: parse_devices (обычный JSON, без streaming) ─────────────────────
  if (mode === 'parse_devices') {
    S.aiLoading = true;
    showAiLoadingIndicator('Анализирую оборудование и считаю материалы по нормам СКС...');

    fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
      body: JSON.stringify({ message: text, mode: mode, cardContext: cardCtx })
    })
    .then(function(r) {
      if (r.status === 429) { throw { limit: true, message: 'Достигнут дневной лимит сообщений' }; }
      if (r.status === 403) { throw { message: 'Нет доступа к этому режиму' }; }
      if (!r.ok) { return r.json().then(function(j){ throw new Error(j.error || 'Ошибка сервера'); }); }
      return r.json();
    })
    .then(function(data) {
      removeAiLoadingIndicator();
      if (!data || !data.success) {
        throw new Error(data && data.error ? data.error : 'Пустой ответ сервера');
      }
      renderMaterialsCalculatorResponse(data);
    })
    .catch(function(err) {
      removeAiLoadingIndicator();
      S.aiMessages = S.aiMessages || [];
      S.aiMessages.push({ role: 'assistant', content: '⚠️ Ошибка: ' + (err.message || 'Неизвестная ошибка'), time: '' });
      renderAiMessages();
    })
    .finally(function() {
      S.aiLoading = false;
      resetAiSendBtn();
    });
    return;
  }

  // ─── СТРИМИНГОВЫЙ ЕДИНЫЙ РЕЖИМ (SSE) ─────────────────────────────────────────
  S.aiLoading = true;
  S.aiStreaming = true;
  S.aiStreamText = '';
  
  var loadSubtitle = 'Анализирую данные и формирую ответ...';
  showAiLoadingIndicator(loadSubtitle);

  startAiSmoothTyping(function(finalMsg) {
    removeAiLoadingIndicator();
    S.aiStreaming = false; S.aiLoading = false;
    resetAiSendBtn();
    finalMsg = finalMsg || '⚠️ Нейросеть не вернула текст ответа. Проверьте доступность модели Ollama.';
    S.aiMessages.push({ role: 'assistant', content: finalMsg, time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) });
    renderAiMessages();
  });

  fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
    body: JSON.stringify({ message: text, mode: mode, cardContext: cardCtx })
  }).then(function(r) {
    if (r.status === 429) { throw { limit: true, message: 'Достигнут дневной лимит сообщений' }; }
    if (r.status === 403) { throw { message: 'Нет доступа к этому режиму' }; }
    if (!r.ok) { return r.json().then(function(j){ throw new Error(j.error || 'Ошибка сервера'); }); }
    return r;
  }).then(function(res) {
    if (!res.body || !res.body.getReader) { throw new Error('Нет streaming-поддержки'); }
    var reader = res.body.getReader();
    var decoder = new TextDecoder('utf-8');
    var buffer = '';
    var hasStreamStarted = false;

    function pump() {
      return reader.read().then(function(result) {
        if (result.done) {
          finishAiStream(function(finalMsg) {
            removeAiLoadingIndicator();
            S.aiStreaming = false; S.aiLoading = false;
            resetAiSendBtn();
            finalMsg = finalMsg || '⚠️ Нейросеть не вернула текст ответа. Проверьте доступность модели Ollama.';
            S.aiMessages.push({ role: 'assistant', content: finalMsg, time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) });
            renderAiMessages();
          });
          return;
        }

        if (!hasStreamStarted) {
          hasStreamStarted = true;
        }

        buffer += decoder.decode(result.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop(); // последняя неполная строка
        for (var i = 0; i < lines.length; i++) {
          var s = lines[i].trim();
          if (!s.startsWith('data:')) continue;
          var payload = s.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            var obj = JSON.parse(payload);
            if (obj.error) {
              S.aiStreamText = '⚠️ Ошибка нейросети: ' + obj.error;
              renderAiStreamingReply();
              break;
            }
            if (obj.delta) {
              S.aiStreamText += obj.delta;
              renderAiStreamingReply();
            }
          } catch (e) {
            console.error('SSE parse error:', e);
          }
        }
        return pump();
      });
    }
    return pump();
  }).catch(function(err) {
    stopAiSmoothTyping();
    removeAiLoadingIndicator();
    if (err && err.limit) {
      S.aiMessages.push({ role: 'assistant', content: '⚠️ ' + err.message, time: '' });
    } else if (err && err.message) {
      S.aiMessages.push({ role: 'assistant', content: '⚠️ Ошибка: ' + err.message, time: '' });
    } else {
      S.aiMessages.push({ role: 'assistant', content: '⚠️ Ошибка соединения с сервером', time: '' });
    }
    S.aiStreaming = false; S.aiLoading = false;
    resetAiSendBtn();
    renderAiMessages();
  });
}

function resetAiSendBtn() {
  var sendBtn = document.getElementById('ai-send-btn');
  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.innerHTML = 'Отправить ➔';
  }
}

// ─── Умный калькулятор материалов (parse_devices) ────────────────────────────

function renderMaterialsCalculatorResponse(data) {
  var parsed = data.parsed || {};
  var materials = data.materials || {};
  var intro = data.reply || 'Рассчитан перечень материалов по нормам СКС на основе указанного оборудования:';
  var devicesStr = Object.keys(parsed).map(function(k) { return parsed[k] + ' ' + k; }).join(', ');
  var rowsHtml = Object.keys(materials).map(function(mat) {
    return '<tr class="mcalc-row"><td>' + escHtml(mat) + '</td><td style="text-align:right; font-weight:600">' + materials[mat] + '</td></tr>';
  }).join('');
  var matCount = Object.keys(materials).length;

  var html = '<div class="mcalc-root">' +
    '<div style="font-size:.85rem; color:var(--text); margin-bottom:8px; line-height:1.45;">' + escHtml(intro) + '</div>' +
    '<div class="mcalc-devices">Распознанные устройства: <strong>' + escHtml(devicesStr || '—') + '</strong></div>' +
    '<table class="mcalc-table"><thead><tr><th>Материал</th><th style="text-align:right">Количество</th></tr></thead>' +
    '<tbody>' + (rowsHtml || '<tr><td colspan="2" class="t3">Материалы не определены</td></tr>') + '</tbody></table>' +
    (matCount > 0 ? '<button class="btn btn-sm mcalc-btn" onclick="reserveMaterials(this, ' + escHtml(JSON.stringify(materials).replace(/"/g, '&quot;')) + ')">📋 Зарезервировать под заявку</button>' : '') +
    '<div class="mcalc-reserve-result-slot"></div>' +
    '</div>';

  S.aiMessages = S.aiMessages || [];
  S.aiMessages.push({
    role: 'assistant',
    content: intro,
    time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }),
    isHtml: html
  });
  renderAiMessages();
}



function quickAiAsk(q) {
  var inp = document.getElementById('ai_text_input');
  if (inp) {
    inp.value = q;
    sendAiMessage();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⚡ WORKFLOW BUILDER — Построитель сценариев автоматизации
// ═══════════════════════════════════════════════════════════════════════════════


// Инициализация состояния Workflow
function initWorkflowState() {
  if (!S.workflowSteps) S.workflowSteps = [];
  if (S.workflowOpen === undefined) S.workflowOpen = false;
  if (!S.workflowContext) S.workflowContext = {};
}

// Описания типов шагов
var WF_STEP_TYPES = {
  find: {
    label: 'Найти заявки',
    icon: '🔍',
    badge: 'wf-badge-find',
    desc: 'Фильтр по региону, статусу, подрядчику, просрочке',
    defaultParams: { region: '', status: '', contractor: '', overdue: false }
  },
  assign: {
    label: 'Назначить подрядчика',
    icon: '👤',
    badge: 'wf-badge-assign',
    desc: 'Массово обновить исполнителя / подрядчика',
    defaultParams: { assignee: '', contractor: '' }
  },
  status: {
    label: 'Изменить статус',
    icon: '🏷️',
    badge: 'wf-badge-status',
    desc: 'Перевести заявки в другой статус',
    defaultParams: { newStatus: 'progress' }
  },
  show: {
    label: 'Показать список',
    icon: '📋',
    badge: 'wf-badge-show',
    desc: 'Вывести результирующие заявки в чат таблицей',
    defaultParams: {}
  },
  ask: {
    label: 'Спросить Стоки',
    icon: '💬',
    badge: 'wf-badge-ask',
    desc: 'Передать заявки в ИИ для анализа',
    defaultParams: { question: '' }
  },
  notify_chat: {
    label: 'Написать в чат',
    icon: '💬',
    badge: 'wf-badge-chat',
    desc: 'Личное сообщение исполнителю по заявке',
    defaultParams: { recipient: '', message: 'Внимание по заявке #{id} ({address}): пожалуйста, обновите статус.' }
  },
  notify_email: {
    label: 'Сообщить на почту',
    icon: '📧',
    badge: 'wf-badge-email',
    desc: 'Email-оповещение о просрочке / статусе',
    defaultParams: { to: '', subject: 'Срочно: Просрочка по заявке #{id}', text: 'По заявке #{id} ({address}) зафиксирована просрочка {overdueDays} дн. Примите срочные меры.' }
  },
  notify_system: {
    label: 'Системное уведомление',
    icon: '🔔',
    badge: 'wf-badge-notify',
    desc: 'Колокольчик в системе',
    defaultParams: { title: 'Внимание по заявке #{id}', text: 'Заявка #{id}: требуется внимание.' }
  }
};

// ── Открыть/закрыть панель ───────────────────────────────────────────────────
function toggleWorkflowPanel() {
  initWorkflowState();
  S.workflowOpen = !S.workflowOpen;
  var btn = document.getElementById('wf-toggle-btn');
  if (btn) {
    btn.classList.toggle('active', S.workflowOpen);
  }
  var panel = document.getElementById('workflow-panel');
  if (panel) {
    panel.style.display = S.workflowOpen ? 'block' : 'none';
    if (S.workflowOpen) {
      renderWorkflowPanel();
    }
  }
}

// ── Рендер всей панели ───────────────────────────────────────────────────────
function renderWorkflowPanel() {
  var panel = document.getElementById('workflow-panel');
  if (!panel) return;
  initWorkflowState();

  var stepsHtml = renderWorkflowStepsHtml();
  var hasSteps = S.workflowSteps.length > 0;
  var running = !!S.workflowRunning;

  panel.innerHTML = `
    <div class="workflow-header">
      <div class="workflow-title">
        ⚡ Построитель сценариев
        <span style="font-size:.72rem; font-weight:400; color:var(--text-3);">(${S.workflowSteps.length} шаг${S.workflowSteps.length === 1 ? '' : (S.workflowSteps.length >= 2 && S.workflowSteps.length <= 4 ? 'а' : 'ов')})</span>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <button class="btn btn-sm" onclick="openFullAutomationModal()" style="font-size:.73rem; padding:3px 9px; border:1px solid var(--orange); color:var(--orange); background:#fff; border-radius:6px; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
          🎛️ Шаблоны и полная настройка
        </button>
        <span style="font-size:.72rem; color:var(--text-3);">Шаги выполняются слева направо</span>
      </div>
    </div>

    <div class="workflow-steps-row" id="wf-steps-row">
      ${stepsHtml}
    </div>

    <div class="workflow-actions" style="position:relative;">
      <button class="wf-btn-add" onclick="openAddStepMenu(event, this)" id="wf-add-btn">
        ＋ Добавить шаг
      </button>
      ${hasSteps ? `
        <button class="wf-btn-run" id="wf-run-btn" onclick="runWorkflow()" ${running ? 'disabled' : ''}>
          ${running ? '<span class="stocky-spinner" style="border-color:rgba(255,255,255,.35);border-top-color:#fff;margin-right:4px;"></span> Выполняется…' : '▶ Запустить'}
        </button>
        <button class="wf-btn-clear" onclick="clearWorkflow()" ${running ? 'disabled' : ''}>🗑 Очистить</button>
      ` : ''}
    </div>
    <div id="wf-progress-wrap" style="display:none;" class="wf-progress">
      <span id="wf-progress-text">Выполнение…</span>
      <div class="wf-progress-bar-wrap">
        <div class="wf-progress-bar" id="wf-progress-bar" style="width:0%"></div>
      </div>
    </div>
  `;

  // Закрытие меню шагов при клике вне
  if (!window._wfMenuListenerAttached) {
    window._wfMenuListenerAttached = true;
    document.addEventListener('click', function(e) {
      var menu = document.getElementById('wf-add-menu');
      var btn = document.getElementById('wf-add-btn');
      if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
        menu.remove();
      }
    });
  }
}

// ── Рендер строки шагов ──────────────────────────────────────────────────────
function renderWorkflowStepsHtml() {
  if (!S.workflowSteps.length) {
    return '<div style="font-size:.8rem; color:var(--text-3); padding:8px 0;">Нажмите «+ Добавить шаг», чтобы начать строить сценарий</div>';
  }
  return S.workflowSteps.map(function(step, idx) {
    var typeInfo = WF_STEP_TYPES[step.type] || {};
    var arrow = idx < S.workflowSteps.length - 1
      ? '<div class="workflow-step-arrow">→</div>'
      : '';
    var stateClass = step._state === 'running' ? ' wf-running'
      : step._state === 'done' ? ' wf-done'
      : step._state === 'error' ? ' wf-error' : '';
    var stateIcon = step._state === 'done' ? ' ✅' : step._state === 'error' ? ' ❌' : '';

    return `
      <div class="workflow-step-card${stateClass}" id="wf-card-${idx}">
        <button class="wf-step-remove" onclick="removeWorkflowStep(${idx})" title="Удалить шаг">✕</button>
        <div class="wf-step-type-badge ${typeInfo.badge || ''}">${typeInfo.icon || ''} ${typeInfo.label || step.type}${stateIcon}</div>
        <div class="wf-step-form">
          ${renderStepForm(step, idx)}
        </div>
        ${step._result ? `<div style="margin-top:5px; font-size:.72rem; color:#166534; font-weight:600;">${escHtml(step._result)}</div>` : ''}
      </div>
      ${arrow}
    `;
  }).join('');
}

// ── Форма параметров для каждого типа шага ───────────────────────────────────
function renderStepForm(step, idx) {
  var p = step.params || {};

  // Уникальные значения из S.tasks для подсказок
  var regions = [];
  var contractors = [];
  var assignees = [];
  (S.tasks || []).forEach(function(t) {
    if (t.region && regions.indexOf(t.region) === -1) regions.push(t.region);
    if (t.contractor && contractors.indexOf(t.contractor) === -1) contractors.push(t.contractor);
    if (t.assignee && assignees.indexOf(t.assignee) === -1) assignees.push(t.assignee);
  });
  regions.sort(); contractors.sort(); assignees.sort();

  var regionOptions = '<option value="">— Любой —</option>' +
    regions.slice(0, 60).map(function(r){ return '<option value="' + escHtml(r) + '"' + (p.region === r ? ' selected' : '') + '>' + escHtml(r) + '</option>'; }).join('');

  var statusOptions = [
    ['', '— Любой —'],
    ['pending', 'Ожидание'],
    ['progress', 'В работе'],
    ['done', 'Выполнено'],
    ['closed', 'Закрыто']
  ].map(function(s){ return '<option value="' + s[0] + '"' + (p.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('');

  var contractorOptions = '<option value="">— Любой —</option>' +
    contractors.slice(0, 40).map(function(c){ return '<option value="' + escHtml(c) + '"' + (p.contractor === c ? ' selected' : '') + '>' + escHtml(c) + '</option>'; }).join('');

  var assigneeOptions = '<option value="">— не менять —</option>' +
    assignees.slice(0, 40).map(function(a){ return '<option value="' + escHtml(a) + '"' + (p.assignee === a ? ' selected' : '') + '>' + escHtml(a) + '</option>'; }).join('');

  var assigneeContractorOptions = '<option value="">— не менять —</option>' +
    contractors.slice(0, 40).map(function(c){ return '<option value="' + escHtml(c) + '"' + (p.contractor === c ? ' selected' : '') + '>' + escHtml(c) + '</option>'; }).join('');

  var newStatusOptions = [
    ['pending', 'Ожидание'],
    ['progress', 'В работе'],
    ['done', 'Выполнено'],
    ['closed', 'Закрыто']
  ].map(function(s){ return '<option value="' + s[0] + '"' + (p.newStatus === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('');

  switch (step.type) {
    case 'find':
      return `
        <select onchange="updateWfParam(${idx},'region',this.value)">${regionOptions}</select>
        <select onchange="updateWfParam(${idx},'status',this.value)">${statusOptions}</select>
        <select onchange="updateWfParam(${idx},'contractor',this.value)">${contractorOptions}</select>
        <label style="display:flex;align-items:center;gap:5px;font-size:.75rem;cursor:pointer;">
          <input type="checkbox" ${p.overdue ? 'checked' : ''} onchange="updateWfParam(${idx},'overdue',this.checked)">
          Только просроченные
        </label>
        <label style="display:flex;align-items:center;gap:5px;font-size:.75rem;cursor:pointer;">
          <input type="number" min="0" style="width:55px;" placeholder="от" value="${p.minDays || ''}" onchange="updateWfParam(${idx},'minDays',this.value)">
          дн. просрочки и более
        </label>
      `;
    case 'assign':
      return `
        <div style="font-size:.72rem;color:var(--text-3);">Исполнитель:</div>
        <select onchange="updateWfParam(${idx},'assignee',this.value)">${assigneeOptions}</select>
        <div style="font-size:.72rem;color:var(--text-3);">Подрядчик:</div>
        <select onchange="updateWfParam(${idx},'contractor',this.value)">${assigneeContractorOptions}</select>
        <div style="font-size:.7rem;color:var(--text-3);margin-top:2px;">Применится ко всем найденным заявкам</div>
      `;
    case 'status':
      return `
        <div style="font-size:.72rem;color:var(--text-3);">Новый статус:</div>
        <select onchange="updateWfParam(${idx},'newStatus',this.value)">${newStatusOptions}</select>
        <div style="font-size:.7rem;color:var(--text-3);margin-top:2px;">Применится ко всем найденным заявкам</div>
      `;
    case 'show':
      return `<div style="font-size:.75rem;color:var(--text-3);">Выводит таблицу найденных заявок прямо в чат</div>`;
    case 'ask':
      return `
        <input type="text" placeholder="Вопрос Стоки по найденным заявкам…" value="${escHtml(p.question || '')}" oninput="updateWfParam(${idx},'question',this.value)" style="font-size:.76rem;">
      `;
    case 'notify_chat':
      return `
        <div style="font-size:.72rem;color:var(--text-3);">Кому (пусто = исполнителю заявки):</div>
        <input type="text" placeholder="Исполнитель из заявки или логин..." value="${escHtml(p.recipient || '')}" oninput="updateWfParam(${idx},'recipient',this.value)" style="font-size:.76rem;margin-bottom:4px;">
        <div style="font-size:.72rem;color:var(--text-3);">Шаблон сообщения ({id}, {address}, {overdueDays}):</div>
        <textarea rows="2" style="font-size:.75rem;width:100%;resize:vertical;" oninput="updateWfParam(${idx},'message',this.value)">${escHtml(p.message || '')}</textarea>
      `;
    case 'notify_email':
      return `
        <div style="font-size:.72rem;color:var(--text-3);">Email получателя (пусто = email исполнителя):</div>
        <input type="text" placeholder="name@company.ru или имя..." value="${escHtml(p.to || '')}" oninput="updateWfParam(${idx},'to',this.value)" style="font-size:.76rem;margin-bottom:4px;">
        <div style="font-size:.72rem;color:var(--text-3);">Тема письма:</div>
        <input type="text" placeholder="Тема письма..." value="${escHtml(p.subject || '')}" oninput="updateWfParam(${idx},'subject',this.value)" style="font-size:.76rem;margin-bottom:4px;">
        <div style="font-size:.72rem;color:var(--text-3);">Текст письма ({id}, {address}, {overdueDays}):</div>
        <textarea rows="2" style="font-size:.75rem;width:100%;resize:vertical;" oninput="updateWfParam(${idx},'text',this.value)">${escHtml(p.text || '')}</textarea>
      `;
    case 'notify_system':
      return `
        <div style="font-size:.72rem;color:var(--text-3);">Заголовок уведомления:</div>
        <input type="text" placeholder="Заголовок..." value="${escHtml(p.title || '')}" oninput="updateWfParam(${idx},'title',this.value)" style="font-size:.76rem;margin-bottom:4px;">
        <div style="font-size:.72rem;color:var(--text-3);">Текст ({id}, {address}):</div>
        <textarea rows="2" style="font-size:.75rem;width:100%;resize:vertical;" oninput="updateWfParam(${idx},'text',this.value)">${escHtml(p.text || '')}</textarea>
      `;
    default:
      return '<div style="font-size:.75rem;color:var(--text-3);">Нет параметров</div>';
  }
}

// ── Обновить параметр шага в реальном времени ────────────────────────────────
function updateWfParam(idx, key, value) {
  initWorkflowState();
  if (!S.workflowSteps[idx]) return;
  if (!S.workflowSteps[idx].params) S.workflowSteps[idx].params = {};
  S.workflowSteps[idx].params[key] = value;
}

// ── Меню добавления шага ─────────────────────────────────────────────────────
function openAddStepMenu(e, btn) {
  if (e && e.stopPropagation) e.stopPropagation();
  // Убираем уже открытое меню
  var existing = document.getElementById('wf-add-menu');
  if (existing) { existing.remove(); return; }

  var parent = (btn && btn.parentElement) ? btn.parentElement : document.body;

  var menu = document.createElement('div');
  menu.id = 'wf-add-menu';
  menu.className = 'wf-add-menu';

  var items = [
    { type: 'find',          icon: '🔍', label: 'Найти заявки',           sub: 'По региону, статусу, подрядчику' },
    { type: 'assign',        icon: '👤', label: 'Назначить подрядчика',    sub: 'Массовое обновление исполнителя' },
    { type: 'status',        icon: '🏷️', label: 'Изменить статус',         sub: 'Перевести в другой статус' },
    { type: 'notify_chat',   icon: '💬', label: 'Написать человеку в чат', sub: 'Личное сообщение исполнителю' },
    { type: 'notify_email',  icon: '📧', label: 'Сообщить на почту',       sub: 'Email о просрочке или статусе' },
    { type: 'notify_system', icon: '🔔', label: 'Системное уведомление',   sub: 'Колокольчик в шапке' },
    { type: 'show',          icon: '📋', label: 'Показать список',         sub: 'Вывести таблицу в чат' },
    { type: 'ask',           icon: '🤖', label: 'Спросить Стоки',          sub: 'ИИ-анализ найденных заявок' }
  ];

  menu.innerHTML = items.map(function(it) {
    return `
      <div class="wf-add-menu-item" onclick="addWorkflowStep('${it.type}', event)">
        <div class="wf-menu-icon">${it.icon}</div>
        <div>
          <div style="font-weight:600;">${it.label}</div>
          <div style="font-size:.7rem;color:var(--text-3);">${it.sub}</div>
        </div>
      </div>
    `;
  }).join('');

  parent.appendChild(menu);
}

// ── Добавить шаг ─────────────────────────────────────────────────────────────
function addWorkflowStep(type, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  initWorkflowState();
  var typeInfo = WF_STEP_TYPES[type];
  S.workflowSteps.push({
    type: type,
    params: Object.assign({}, typeInfo ? typeInfo.defaultParams : {}),
    _state: null,
    _result: null
  });
  // Закрыть меню
  var menu = document.getElementById('wf-add-menu');
  if (menu) menu.remove();
  renderWorkflowPanel();
}

// ── Удалить шаг ──────────────────────────────────────────────────────────────
function removeWorkflowStep(idx) {
  initWorkflowState();
  S.workflowSteps.splice(idx, 1);
  renderWorkflowPanel();
}

// ── Очистить все шаги ────────────────────────────────────────────────────────
function clearWorkflow() {
  initWorkflowState();
  S.workflowSteps = [];
  S.workflowContext = {};
  renderWorkflowPanel();
}

// ── Обновить прогресс-бар ────────────────────────────────────────────────────
function wfSetProgress(pct, text) {
  var wrap = document.getElementById('wf-progress-wrap');
  var bar = document.getElementById('wf-progress-bar');
  var label = document.getElementById('wf-progress-text');
  if (wrap) wrap.style.display = pct < 100 ? 'flex' : 'none';
  if (bar) bar.style.width = pct + '%';
  if (label) label.textContent = text || '';
}

// ── Пометить карточку шага ───────────────────────────────────────────────────
function wfMarkStep(idx, state, resultText) {
  initWorkflowState();
  if (S.workflowSteps[idx]) {
    S.workflowSteps[idx]._state = state;
    S.workflowSteps[idx]._result = resultText || null;
  }
  var card = document.getElementById('wf-card-' + idx);
  if (card) {
    card.className = 'workflow-step-card' + (state === 'running' ? ' wf-running' : state === 'done' ? ' wf-done' : state === 'error' ? ' wf-error' : '');
    var badge = card.querySelector('.wf-step-type-badge');
    if (badge) {
      var typeInfo = WF_STEP_TYPES[S.workflowSteps[idx].type] || {};
      var stateIcon = state === 'done' ? ' ✅' : state === 'error' ? ' ❌' : '';
      badge.textContent = (typeInfo.icon || '') + ' ' + (typeInfo.label || '') + stateIcon;
    }
    var resultEl = card.querySelector('[data-wf-result]');
    if (!resultEl && resultText) {
      var div = document.createElement('div');
      div.setAttribute('data-wf-result', '1');
      div.style.cssText = 'margin-top:5px;font-size:.72rem;color:#166534;font-weight:600;';
      div.textContent = resultText;
      card.appendChild(div);
    } else if (resultEl && resultText) {
      resultEl.textContent = resultText;
    }
  }
}

// ── Добавить сообщение в AI-чат (от имени Workflow) ─────────────────────────
function addWorkflowChatMessage(html, plainText) {
  S.aiMessages = S.aiMessages || [];
  var time = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  S.aiMessages.push({
    role: 'assistant',
    content: plainText || '',
    time: time,
    isHtml: `
      <div style="align-self:flex-start; max-width:92%; background:#fff; border:1.5px solid var(--orange); border-radius:10px; padding:10px 14px; box-shadow:0 2px 8px rgba(255,98,0,0.08);">
        <div style="font-size:.72rem; font-weight:700; color:var(--orange-dark); margin-bottom:6px; display:flex; align-items:center; gap:5px;">
          ⚡ Сценарий автоматизации
        </div>
        ${html}
        <div style="font-size:.65rem; color:var(--text-3); text-align:right; margin-top:6px;">${time}</div>
      </div>
    `
  });
  renderAiMessages();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⚡ ИСПОЛНИТЕЛИ ШАГОВ
// ═══════════════════════════════════════════════════════════════════════════════

// Шаг: Найти заявки
function executeStepFind(params) {
  var tasks = S.tasks || [];
  var filtered = tasks.filter(function(t) {
    if (params.region && t.region !== params.region) return false;
    if (params.status && t.status !== params.status) return false;
    if (params.contractor && t.contractor !== params.contractor) return false;
    if (params.overdue && !(t.overdueDays > 0)) return false;
    if (params.minDays && Number(params.minDays) > 0 && !(t.overdueDays >= Number(params.minDays))) return false;
    return true;
  });
  return Promise.resolve(filtered);
}

// Шаг: Назначить подрядчика / исполнителя
function executeStepAssign(params, tasks) {
  if (!tasks || !tasks.length) return Promise.resolve({ updated: 0 });
  if (!params.assignee && !params.contractor) return Promise.resolve({ updated: 0, skipped: true });

  var body = {};
  if (params.assignee) body.assignee = params.assignee;
  if (params.contractor) body.contractor = params.contractor;

  var done = 0;
  var total = tasks.length;

  // Батч-запросы с показом прогресса
  var promises = tasks.map(function(t, i) {
    return fetch('/api/tasks/' + encodeURIComponent(t.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
      body: JSON.stringify(body)
    }).then(function(r) {
      done++;
      var pct = Math.round((done / total) * 100);
      wfSetProgress(pct, 'Обновление ' + done + '/' + total + '…');
      return r.ok ? 1 : 0;
    }).catch(function() { done++; return 0; });
  });

  return Promise.all(promises).then(function(results) {
    var updated = results.reduce(function(s, v){ return s + v; }, 0);
    // Обновляем S.tasks локально чтобы данные не устарели
    tasks.forEach(function(t) {
      var local = (S.tasks || []).find(function(x){ return x.id === t.id; });
      if (local) {
        if (params.assignee) local.assignee = params.assignee;
        if (params.contractor) local.contractor = params.contractor;
      }
    });
    return { updated: updated, total: total };
  });
}

// Шаг: Изменить статус
function executeStepStatus(params, tasks) {
  if (!tasks || !tasks.length) return Promise.resolve({ updated: 0 });
  if (!params.newStatus) return Promise.resolve({ updated: 0, skipped: true });

  var body = { status: params.newStatus };
  var done = 0;
  var total = tasks.length;

  var promises = tasks.map(function(t) {
    return fetch('/api/tasks/' + encodeURIComponent(t.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
      body: JSON.stringify(body)
    }).then(function(r) {
      done++;
      var pct = Math.round((done / total) * 100);
      wfSetProgress(pct, 'Обновление ' + done + '/' + total + '…');
      return r.ok ? 1 : 0;
    }).catch(function() { done++; return 0; });
  });

  return Promise.all(promises).then(function(results) {
    var updated = results.reduce(function(s, v){ return s + v; }, 0);
    tasks.forEach(function(t) {
      var local = (S.tasks || []).find(function(x){ return x.id === t.id; });
      if (local && params.newStatus) local.status = params.newStatus;
    });
    return { updated: updated, total: total };
  });
}

// Шаг: Показать таблицу заявок в чат
function executeStepShow(tasks) {
  if (!tasks || !tasks.length) {
    addWorkflowChatMessage('<div style="color:var(--text-3);font-size:.82rem;">Нет заявок для отображения</div>', 'Нет заявок');
    return Promise.resolve();
  }

  var shown = tasks.slice(0, 50);
  var more = tasks.length > 50 ? tasks.length - 50 : 0;

  var rowsHtml = shown.map(function(t) {
    var statusLabels = { pending: 'Ожидание', progress: 'В работе', done: 'Выполнено', closed: 'Закрыто' };
    var overdueStr = (t.overdueDays > 0) ? '<span style="color:#b91c1c;font-weight:600;">+' + t.overdueDays + ' дн.</span>' : '—';
    return `<tr>
      <td style="font-weight:600;color:var(--orange-dark);">#${escHtml(String(t.id))}</td>
      <td>${escHtml(t.region || '—')}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(t.address || '—')}</td>
      <td>${escHtml(t.assignee || '—')}</td>
      <td>${escHtml(statusLabels[t.status] || t.status || '—')}</td>
      <td>${overdueStr}</td>
    </tr>`;
  }).join('');

  var tableHtml = `
    <div style="font-size:.82rem;color:var(--text);margin-bottom:6px;font-weight:600;">📋 Найдено заявок: <strong>${tasks.length}</strong>${more ? ' (показаны первые 50)' : ''}</div>
    <div style="overflow-x:auto;max-height:280px;overflow-y:auto;">
      <table class="wf-result-table">
        <thead><tr>
          <th>№</th><th>Регион</th><th>Адрес</th><th>Исполнитель</th><th>Статус</th><th>Просрочка</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    ${more ? '<div style="font-size:.72rem;color:var(--text-3);margin-top:4px;">... и ещё ' + more + ' заявок</div>' : ''}
  `;

  addWorkflowChatMessage(tableHtml, 'Найдено заявок: ' + tasks.length);
  return Promise.resolve();
}

// Шаг: Спросить Стоки с контекстом заявок
function executeStepAsk(params, tasks) {
  if (!params.question || !params.question.trim()) {
    return Promise.resolve({ skipped: true });
  }

  var tasksSummary = (tasks || []).slice(0, 30).map(function(t) {
    return '#' + t.id + ' [' + (t.region || '') + '] ' + (t.address || '') +
      ' · статус: ' + (t.status || '') +
      ' · исполнитель: ' + (t.assignee || '—') +
      ' · просрочка: ' + (t.overdueDays || 0) + ' дн.';
  }).join('\n');

  var message = 'Контекст: найдено ' + (tasks || []).length + ' заявок:\n' + tasksSummary + '\n\nВопрос: ' + params.question;

  // Устанавливаем режим general, добавляем сообщение пользователя
  S.aiMessages = S.aiMessages || [];
  S.aiMessages.push({
    role: 'user',
    content: '⚡ [Автоматизация] ' + params.question,
    time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  });
  renderAiMessages();

  return fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
    body: JSON.stringify({ message: message, mode: 'general' })
  }).then(function(r) {
    if (!r.ok) throw new Error('Ошибка запроса к ИИ');
    // Streaming SSE
    return new Promise(function(resolve) {
      if (!r.body || !r.body.getReader) { resolve(); return; }
      var reader = r.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buffer = '';
      S.aiStreamText = '';

      startAiSmoothTyping(function(finalMsg) {
        removeAiLoadingIndicator();
        finalMsg = finalMsg || '⚠️ Нет ответа от модели';
        S.aiMessages.push({ role: 'assistant', content: finalMsg, time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) });
        renderAiMessages();
        resolve();
      });

      function pump() {
        reader.read().then(function(result) {
          if (result.done) {
            finishAiStream(function(finalMsg) {
              removeAiLoadingIndicator();
              finalMsg = finalMsg || '⚠️ Нет ответа от модели';
              S.aiMessages.push({ role: 'assistant', content: finalMsg, time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) });
              renderAiMessages();
              resolve();
            });
            return;
          }
          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop();
          lines.forEach(function(line) {
            var s = line.trim();
            if (!s.startsWith('data:')) return;
            var payload = s.slice(5).trim();
            if (payload === '[DONE]') return;
            try {
              var obj = JSON.parse(payload);
              if (obj.delta) { S.aiStreamText += obj.delta; renderAiStreamingReply(); }
            } catch(e) {}
          });
          pump();
        });
      }
      pump();
    });
  });
}

// ── Подстановка переменных заявки в шаблон ───────────────────────────────────
function formatWfTemplate(template, task) {
  if (!template) return '';
  task = task || {};
  return template
    .replace(/\{id\}/g, task.id || '')
    .replace(/\{address\}/g, task.address || task.region || '')
    .replace(/\{region\}/g, task.region || '')
    .replace(/\{contractor\}/g, task.contractor || '')
    .replace(/\{assignee\}/g, task.assignee || '')
    .replace(/\{status\}/g, task.status || '')
    .replace(/\{deadline\}/g, task.deadline || '')
    .replace(/\{overdueDays\}/g, task.overdueDays || '0');
}

// Шаг: Отправка личного сообщения в чат исполнителю
function executeStepNotifyChat(params, tasks) {
  if (!tasks || !tasks.length) return Promise.resolve({ sent: 0, total: 0 });
  var total = tasks.length;
  var done = 0;
  var sent = 0;

  var promises = tasks.map(function(t) {
    var recipientName = (params.recipient && params.recipient.trim()) ? params.recipient.trim() : (t.assignee || t.contractor);
    var text = formatWfTemplate(params.message || 'Внимание по заявке #{id}: {address}', t);

    return fetch('/api/automation/send-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
      body: JSON.stringify({
        targetUserName: recipientName,
        text: text,
        taskId: t.id
      })
    }).then(function(r) {
      done++;
      wfSetProgress(Math.round((done / total) * 100), 'Отправка в чат ' + done + '/' + total);
      if (r.ok) sent++;
      return r.ok ? 1 : 0;
    }).catch(function() { done++; return 0; });
  });

  return Promise.all(promises).then(function() {
    return { sent: sent, total: total };
  });
}

// Шаг: Отправка email о просрочке / статусе
function executeStepNotifyEmail(params, tasks) {
  if (!tasks || !tasks.length) return Promise.resolve({ sent: 0, total: 0 });
  var total = tasks.length;
  var done = 0;
  var sent = 0;

  var promises = tasks.map(function(t) {
    var recipient = (params.to && params.to.trim()) ? params.to.trim() : (t.assignee || t.contractor);
    var subject = formatWfTemplate(params.subject || '⚠️ Уведомление по заявке #{id}', t);
    var text = formatWfTemplate(params.text || 'По заявке #{id} ({address}) зафиксирована просрочка {overdueDays} дн.', t);

    return fetch('/api/automation/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
      body: JSON.stringify({
        to: recipient,
        subject: subject,
        text: text,
        taskId: t.id
      })
    }).then(function(r) {
      done++;
      wfSetProgress(Math.round((done / total) * 100), 'Отправка email ' + done + '/' + total);
      if (r.ok) sent++;
      return r.ok ? 1 : 0;
    }).catch(function() { done++; return 0; });
  });

  return Promise.all(promises).then(function() {
    return { sent: sent, total: total };
  });
}

// Шаг: Создание системного колокольчик-уведомления
function executeStepNotifySystem(params, tasks) {
  if (!tasks || !tasks.length) return Promise.resolve({ created: 0, total: 0 });
  var total = tasks.length;
  var done = 0;
  var created = 0;

  var promises = tasks.map(function(t) {
    var title = formatWfTemplate(params.title || 'Внимание по заявке #{id}', t);
    var body = formatWfTemplate(params.text || 'Заявка #{id}: требуется внимание ({address}).', t);

    return fetch('/api/automation/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
      body: JSON.stringify({
        userName: t.assignee || null,
        title: title,
        body: body,
        taskId: t.id
      })
    }).then(function(r) {
      done++;
      if (r.ok) created++;
      return r.ok ? 1 : 0;
    }).catch(function() { done++; return 0; });
  });

  return Promise.all(promises).then(function() {
    return { created: created, total: total };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⚡ ГЛАВНЫЙ ОРКЕСТРАТОР СЦЕНАРИЯ
// ═══════════════════════════════════════════════════════════════════════════════

function runWorkflow() {
  initWorkflowState();

  if (!S.workflowSteps.length) {
    alert('Добавьте хотя бы один шаг перед запуском сценария');
    return;
  }

  // Проверяем, что есть хотя бы шаг «Найти» или уже есть контекст заявок
  var hasFindStep = S.workflowSteps.some(function(s){ return s.type === 'find'; });
  if (!hasFindStep && !(S.workflowContext.tasks && S.workflowContext.tasks.length)) {
    if (!confirm('Нет шага «Найти заявки». Другие шаги будут применены ко всем ' + (S.tasks || []).length + ' заявкам из базы. Продолжить?')) return;
    S.workflowContext.tasks = S.tasks || [];
  }

  S.workflowRunning = true;

  // Сброс состояния шагов
  S.workflowSteps.forEach(function(s) { s._state = null; s._result = null; });
  S.workflowContext = {};
  renderWorkflowPanel();

  var runBtn = document.getElementById('wf-run-btn');
  if (runBtn) { runBtn.disabled = true; runBtn.innerHTML = '<span class="stocky-spinner" style="border-color:rgba(255,255,255,.35);border-top-color:#fff;margin-right:4px;"></span> Выполняется…'; }

  // Сообщение старта в чат
  addWorkflowChatMessage(
    '<div style="font-size:.82rem;">🚀 Запуск сценария из <strong>' + S.workflowSteps.length + '</strong> шагов…</div>',
    'Запуск сценария'
  );

  // Последовательное выполнение через цепочку промисов
  var chain = Promise.resolve();
  var totalSteps = S.workflowSteps.length;

  S.workflowSteps.forEach(function(step, idx) {
    chain = chain.then(function() {
      wfMarkStep(idx, 'running', null);
      wfSetProgress(Math.round((idx / totalSteps) * 100), 'Шаг ' + (idx + 1) + '/' + totalSteps + ': ' + (WF_STEP_TYPES[step.type] || {}).label);

      var contextTasks = S.workflowContext.tasks || [];

      if (step.type === 'find') {
        return executeStepFind(step.params || {}).then(function(found) {
          S.workflowContext.tasks = found;
          var msg = 'Найдено: ' + found.length + ' заявок';
          wfMarkStep(idx, 'done', msg);
          addWorkflowChatMessage(
            '<div>🔍 <strong>Фильтрация заявок</strong><br><span style="color:var(--text-2);font-size:.8rem;">Результат: найдено <strong>' + found.length + '</strong> заявок по заданным критериям</span></div>',
            msg
          );
        });
      } else if (step.type === 'assign') {
        return executeStepAssign(step.params || {}, contextTasks).then(function(res) {
          var msg;
          if (res.skipped) {
            msg = 'Пропущено: не заданы исполнитель/подрядчик';
            wfMarkStep(idx, 'error', msg);
          } else {
            msg = 'Обновлено: ' + res.updated + '/' + res.total;
            wfMarkStep(idx, 'done', msg);
            var parts = [];
            if (step.params.assignee) parts.push('исполнитель → ' + step.params.assignee);
            if (step.params.contractor) parts.push('подрядчик → ' + step.params.contractor);
            addWorkflowChatMessage(
              '<div>👤 <strong>Назначение</strong><br><span style="font-size:.8rem;color:var(--text-2);">Обновлено <strong>' + res.updated + '</strong> из ' + res.total + ' заявок<br>' + parts.join(', ') + '</span></div>',
              msg
            );
          }
        });
      } else if (step.type === 'status') {
        return executeStepStatus(step.params || {}, contextTasks).then(function(res) {
          var statusLabels = { pending: 'Ожидание', progress: 'В работе', done: 'Выполнено', closed: 'Закрыто' };
          var newLabel = statusLabels[step.params.newStatus] || step.params.newStatus;
          var msg = res.skipped ? 'Пропущено: не задан статус' : 'Обновлено: ' + res.updated + '/' + res.total;
          wfMarkStep(idx, res.skipped ? 'error' : 'done', msg);
          if (!res.skipped) {
            addWorkflowChatMessage(
              '<div>🏷️ <strong>Смена статуса</strong><br><span style="font-size:.8rem;color:var(--text-2);">Обновлено <strong>' + res.updated + '</strong> заявок → <strong>' + newLabel + '</strong></span></div>',
              msg
            );
          }
        });
      } else if (step.type === 'notify_chat') {
        return executeStepNotifyChat(step.params || {}, contextTasks).then(function(res) {
          var msg = 'Отправлено: ' + res.sent + ' из ' + res.total + ' сообщений в чат';
          wfMarkStep(idx, 'done', msg);
          addWorkflowChatMessage(
            '<div>💬 <strong>Оповещение в личный чат</strong><br><span style="font-size:.8rem;color:var(--text-2);">' + msg + '</span></div>',
            msg
          );
        });
      } else if (step.type === 'notify_email') {
        return executeStepNotifyEmail(step.params || {}, contextTasks).then(function(res) {
          var msg = 'Отправлено: ' + res.sent + ' из ' + res.total + ' email';
          wfMarkStep(idx, 'done', msg);
          addWorkflowChatMessage(
            '<div>📧 <strong>Email-оповещение</strong><br><span style="font-size:.8rem;color:var(--text-2);">' + msg + '</span></div>',
            msg
          );
        });
      } else if (step.type === 'notify_system') {
        return executeStepNotifySystem(step.params || {}, contextTasks).then(function(res) {
          var msg = 'Создано ' + res.created + ' системных уведомлений';
          wfMarkStep(idx, 'done', msg);
          addWorkflowChatMessage(
            '<div>🔔 <strong>Системные уведомления</strong><br><span style="font-size:.8rem;color:var(--text-2);">' + msg + '</span></div>',
            msg
          );
        });
      } else if (step.type === 'show') {
        return executeStepShow(contextTasks).then(function() {
          wfMarkStep(idx, 'done', 'Показано: ' + contextTasks.length);
        });
      } else if (step.type === 'ask') {
        return executeStepAsk(step.params || {}, contextTasks).then(function() {
          wfMarkStep(idx, 'done', 'ИИ ответил');
        });
      }
      return Promise.resolve();
    }).catch(function(err) {
      wfMarkStep(idx, 'error', 'Ошибка: ' + (err && err.message ? err.message : 'неизвестно'));
      addWorkflowChatMessage(
        '<div style="color:#b91c1c;">❌ Ошибка на шаге ' + (idx + 1) + ': ' + escHtml(err && err.message ? err.message : 'неизвестная ошибка') + '</div>',
        'Ошибка'
      );
      // Продолжаем следующие шаги
    });
  });

  chain.then(function() {
    S.workflowRunning = false;
    wfSetProgress(100, '');
    renderWorkflowPanel();
    addWorkflowChatMessage(
      '<div style="color:#166534;font-weight:700;">✅ Сценарий завершён!</div>',
      'Сценарий завершён'
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🎛️ ЦЕНТР ПОЛНОЙ АВТОМАТИЗАЦИИ И ТИПОВЫХ СЦЕНАРИЕВ
// ═══════════════════════════════════════════════════════════════════════════════

var WF_PRESETS = [
  {
    id: 'preset_overdue',
    title: '🚨 Контроль и эскалация просрочек',
    desc: 'Находит просроченные заявки, отправляет email куратору, персональное сообщение в чат исполнителю и выводит список.',
    tags: ['Типовой', 'Просрочки', 'Email + Чат'],
    steps: [
      { type: 'find', params: { region: '', status: '', contractor: '', overdue: true, minDays: '1' } },
      { type: 'notify_email', params: { to: '', subject: '⚠️ Срочно: Просрочка по заявке #{id}', text: 'По объекту #{id} ({address}) зафиксирована задержка {overdueDays} дн. Срочно обновите статус.' } },
      { type: 'notify_chat', params: { recipient: '', message: 'Внимание по заявке #{id} ({address}): просрочка {overdueDays} дн. Подготовьте отчет.' } },
      { type: 'show', params: {} }
    ]
  },
  {
    id: 'preset_dispatch',
    title: '📦 Распределение новых типовых заявок',
    desc: 'Фильтрует новые заявки в ожидании (pending), назначает исполнителя/подрядчика, переводит в работу (progress) и уведомляет.',
    tags: ['Типовой', 'Маршрутизация', 'Статусы'],
    steps: [
      { type: 'find', params: { region: '', status: 'pending', contractor: '', overdue: false } },
      { type: 'assign', params: { assignee: '', contractor: '' } },
      { type: 'status', params: { newStatus: 'progress' } },
      { type: 'notify_chat', params: { recipient: '', message: 'Вам назначена новая заявка #{id} по адресу: {address}. Начинайте работы.' } },
      { type: 'show', params: {} }
    ]
  },
  {
    id: 'preset_remind_out',
    title: '🚚 Оповещение бригады о выезде на монтаж',
    desc: 'Напоминает монтажникам в личный чат о запланированном выезде на объект и проверяет ТМЦ.',
    tags: ['Монтажники', 'Чат', 'Колокольчик'],
    steps: [
      { type: 'find', params: { region: '', status: 'progress', contractor: '', overdue: false } },
      { type: 'notify_chat', params: { recipient: '', message: 'Напоминание: запланирован выезд по заявке #{id} ({address}). Проверьте наличие материалов.' } },
      { type: 'notify_system', params: { title: 'Выезд на объект #{id}', text: 'Заявка #{id}: запланирован выезд бригады ({address}).' } }
    ]
  },
  {
    id: 'preset_close_done',
    title: '🏁 Массовое закрытие и сдача объектов',
    desc: 'Переводит выполненные заявки (done) в статус «Закрыто» (closed) и выводит итоговую ведомость.',
    tags: ['Закрытие', 'Отчетность'],
    steps: [
      { type: 'find', params: { region: '', status: 'done', contractor: '', overdue: false } },
      { type: 'status', params: { newStatus: 'closed' } },
      { type: 'show', params: {} }
    ]
  }
];

// Открыть окно полной автоматизации
function openFullAutomationModal() {
  var existing = document.getElementById('wf-full-modal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'wf-full-modal';
  modal.className = 'wf-modal-overlay';
  modal.onclick = function(e) {
    if (e.target === modal) closeFullAutomationModal();
  };

  modal.innerHTML = `
    <div class="wf-modal-container" onclick="event.stopPropagation()">
      <div class="wf-modal-header">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:36px; height:36px; border-radius:10px; background:var(--orange-bg); color:var(--orange); display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
            🎛️
          </div>
          <div>
            <div style="font-weight:700; font-size:1.15rem; color:var(--text);">Центр полной автоматизации</div>
            <div style="font-size:.78rem; color:var(--text-3);">Управление сценариями обработки типовых заявок и рассылок</div>
          </div>
        </div>
        <button class="wf-modal-close" onclick="closeFullAutomationModal()">✕</button>
      </div>

      <div class="wf-modal-body" id="wf-modal-body">
        ${renderFullAutomationModalBody()}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

// Закрыть окно полной автоматизации
function closeFullAutomationModal() {
  var m = document.getElementById('wf-full-modal');
  if (m) m.remove();
}

// Содержимое тела окна
function renderFullAutomationModalBody() {
  initWorkflowState();

  // Сохраненные пользовательские сценарии из localStorage
  var saved = [];
  try {
    saved = JSON.parse(localStorage.getItem('stockeasy_custom_scenarios') || '[]');
  } catch(e) {}

  var presetsHtml = WF_PRESETS.map(function(p) {
    var tagsHtml = (p.tags || []).map(function(t){ return '<span class="wf-preset-tag">' + escHtml(t) + '</span>'; }).join('');
    var stepsPills = p.steps.map(function(s, idx) {
      var info = WF_STEP_TYPES[s.type] || { icon: '⚙️', label: s.type };
      return '<span class="wf-preset-step-pill">' + info.icon + ' ' + escHtml(info.label) + '</span>';
    }).join(' → ');

    return `
      <div class="wf-preset-card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
          <div style="font-weight:700; font-size:.92rem; color:var(--text);">${escHtml(p.title)}</div>
        </div>
        <div style="font-size:.78rem; color:var(--text-2); line-height:1.45; margin-bottom:10px;">${escHtml(p.desc)}</div>
        <div style="margin-bottom:10px; display:flex; gap:5px; flex-wrap:wrap;">${tagsHtml}</div>
        <div style="font-size:.74rem; color:var(--text-3); margin-bottom:12px; background:#f9fafb; padding:8px 10px; border-radius:6px; border:1px solid #f3f4f6;">
          <strong>Цепочка шагов:</strong><br><div style="margin-top:4px; display:flex; gap:4px; align-items:center; flex-wrap:wrap;">${stepsPills}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-sm btn-analytics-styled" onclick="loadPresetWorkflow('${p.id}', false)" style="flex:1;">
            📥 Загрузить в конструктор
          </button>
          <button class="wf-btn-run" onclick="loadPresetWorkflow('${p.id}', true)" style="font-size:.78rem; padding:6px 12px;">
            ▶ Запустить сразу
          </button>
        </div>
      </div>
    `;
  }).join('');

  var savedHtml = saved.length ? saved.map(function(s, i) {
    var stepsPills = (s.steps || []).map(function(st) {
      var info = WF_STEP_TYPES[st.type] || { icon: '⚙️', label: st.type };
      return '<span class="wf-preset-step-pill">' + info.icon + ' ' + escHtml(info.label) + '</span>';
    }).join(' → ');

    return `
      <div class="wf-saved-item">
        <div style="flex:1;">
          <div style="font-weight:700; font-size:.88rem; color:var(--text);">${escHtml(s.name || 'Сценарий #' + (i+1))}</div>
          <div style="font-size:.72rem; color:var(--text-3); margin-top:2px;">Сохранено: ${escHtml(s.date || '—')} · ${s.steps.length} шаг(ов)</div>
          <div style="margin-top:6px; display:flex; gap:4px; align-items:center; flex-wrap:wrap;">${stepsPills}</div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn btn-sm" onclick="loadCustomWorkflow(${i})" style="font-size:.76rem; padding:4px 8px; border:1px solid var(--border); background:#fff;">Загрузить</button>
          <button class="btn btn-sm" onclick="deleteCustomWorkflow(${i})" style="font-size:.76rem; padding:4px 8px; border:1px solid #fee2e2; color:#b91c1c; background:#fff;">✕</button>
        </div>
      </div>
    `;
  }).join('') : '<div style="font-size:.8rem; color:var(--text-3); padding:12px; text-align:center;">У вас пока нет сохранённых сценариев. Настройте шаги в конструкторе и сохраните как шаблон.</div>';

  return `
    <div style="margin-bottom:20px;">
      <div style="font-weight:700; font-size:.96rem; margin-bottom:12px; display:flex; align-items:center; gap:6px; color:var(--text);">
        <span>⚡ Готовые типовые сценарии</span>
        <span style="font-size:.75rem; color:var(--text-3); font-weight:normal;">(нажмите, чтобы применить к вашим заявкам)</span>
      </div>
      <div class="wf-presets-grid">
        ${presetsHtml}
      </div>
    </div>

    <hr style="border:none; border-top:1px solid var(--border); margin:20px 0;">

    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
        <div style="font-weight:700; font-size:.96rem; color:var(--text);">
          💾 Мои сохранённые сценарии (${saved.length})
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="text" id="wf-save-name-input" placeholder="Название текущего сценария..." style="font-size:.78rem; padding:5px 10px; border:1px solid var(--border); border-radius:6px; min-width:200px;">
          <button class="btn btn-sm btn-analytics-styled" onclick="saveCurrentWorkflowAsPreset()">
            💾 Сохранить текущий
          </button>
        </div>
      </div>
      <div class="wf-saved-list">
        ${savedHtml}
      </div>
    </div>
  `;
}

// Загрузить готовый пресет
function loadPresetWorkflow(presetId, andRun) {
  var preset = WF_PRESETS.find(function(p){ return p.id === presetId; });
  if (!preset) return;

  initWorkflowState();
  S.workflowSteps = JSON.parse(JSON.stringify(preset.steps));
  S.workflowOpen = true;

  var panel = document.getElementById('workflow-panel');
  if (panel) panel.style.display = 'block';

  var btn = document.getElementById('wf-toggle-btn');
  if (btn) btn.classList.add('active');

  renderWorkflowPanel();
  closeFullAutomationModal();

  if (andRun) {
    setTimeout(function() { runWorkflow(); }, 150);
  } else {
    alert('Сценарий «' + preset.title + '» загружен в конструктор. Проверьте параметры и нажмите «▶ Запустить».');
  }
}

// Сохранить текущую цепочку шагов как свой сценарий
function saveCurrentWorkflowAsPreset() {
  initWorkflowState();
  if (!S.workflowSteps.length) {
    alert('Конструктор пуст. Добавьте шаги перед сохранением.');
    return;
  }
  var inp = document.getElementById('wf-save-name-input');
  var name = (inp && inp.value.trim()) ? inp.value.trim() : ('Сценарий ' + new Date().toLocaleDateString('ru'));

  var saved = [];
  try { saved = JSON.parse(localStorage.getItem('stockeasy_custom_scenarios') || '[]'); } catch(e) {}

  saved.push({
    name: name,
    date: new Date().toLocaleString('ru', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }),
    steps: JSON.parse(JSON.stringify(S.workflowSteps))
  });

  try {
    localStorage.setItem('stockeasy_custom_scenarios', JSON.stringify(saved));
  } catch(e) {}

  var body = document.getElementById('wf-modal-body');
  if (body) body.innerHTML = renderFullAutomationModalBody();
  alert('Сценарий «' + name + '» успешно сохранён!');
}

// Загрузить пользовательский сценарий
function loadCustomWorkflow(idx) {
  var saved = [];
  try { saved = JSON.parse(localStorage.getItem('stockeasy_custom_scenarios') || '[]'); } catch(e) {}
  if (!saved[idx]) return;

  initWorkflowState();
  S.workflowSteps = JSON.parse(JSON.stringify(saved[idx].steps || []));
  S.workflowOpen = true;

  var panel = document.getElementById('workflow-panel');
  if (panel) panel.style.display = 'block';

  var btn = document.getElementById('wf-toggle-btn');
  if (btn) btn.classList.add('active');

  renderWorkflowPanel();
  closeFullAutomationModal();
  alert('Пользовательский сценарий «' + saved[idx].name + '» загружен в конструктор.');
}

// Удалить пользовательский сценарий
function deleteCustomWorkflow(idx) {
  if (!confirm('Удалить этот сохранённый сценарий?')) return;
  var saved = [];
  try { saved = JSON.parse(localStorage.getItem('stockeasy_custom_scenarios') || '[]'); } catch(e) {}
  saved.splice(idx, 1);
  try { localStorage.setItem('stockeasy_custom_scenarios', JSON.stringify(saved)); } catch(e) {}

  var body = document.getElementById('wf-modal-body');
  if (body) body.innerHTML = renderFullAutomationModalBody();
}



function reserveMaterials(btn, materials) {
  var sel = document.getElementById('ai-task-select');
  var taskId = (sel && sel.value) ? sel.value : (S.aiSelectedTaskId || S.cardId || null);
  if (!taskId) {
    alert('Пожалуйста, выберите заявку в поле поиска сверху для привязки и бронирования материалов.');
    var searchInp = document.getElementById('ai-task-search-input');
    if (searchInp) searchInp.focus();
    return;
  }
  var targetTask = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  var taskAddr = targetTask ? (targetTask.address || targetTask.region || '') : '';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="stocky-spinner" style="margin-right:5px;"></span> Резервирование…';
  }

  fetch('/api/tasks/' + encodeURIComponent(taskId) + '/materials/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
    body: JSON.stringify({ materials: materials })
  })
  .then(function(r){ return r.json(); })
  .then(function(res) {
    if (res && res.success) {
      var matCount = Object.keys(materials).length;
      var matList = Object.keys(materials).map(function(k){ return k + ' (' + materials[k] + ')'; }).join(', ');

      if (btn) {
        btn.disabled = true;
        btn.style.background = '#15803d';
        btn.style.color = '#ffffff';
        btn.style.borderColor = '#15803d';
        btn.style.opacity = '1';
        btn.innerHTML = '✅ Зарезервировано под заявку #' + escHtml(taskId);
      }

      var slot = btn ? btn.parentElement.querySelector('.mcalc-reserve-result-slot') : null;
      var successCard = `
        <div class="mcalc-success-box">
          <div style="font-weight:700; font-size:.9rem; display:flex; align-items:center; gap:6px; color:#15803d;">
            <span>✅ Материалы успешно забронированы!</span>
          </div>
          <div style="margin-top:6px; font-size:.82rem; line-height:1.45; color:#166534;">
            <div>📋 Заявка: <strong>#${escHtml(taskId)}</strong> ${taskAddr ? '— ' + escHtml(taskAddr) : ''}</div>
            <div>🏢 Склад: <strong>Центральный склад (Stockeasy)</strong></div>
            <div>📦 Забронировано: <strong>${matCount} наим.</strong> (${escHtml(matList)})</div>
            <div>⏱️ Время фиксации: <strong>${new Date().toLocaleTimeString('ru', {hour:'2-digit', minute:'2-digit'})}</strong></div>
          </div>
        </div>
      `;
      if (slot) {
        slot.innerHTML = successCard;
      }

      S.aiMessages = S.aiMessages || [];
      S.aiMessages.push({
        role: 'assistant',
        content: '✅ Спецификация материалов успешно забронирована на складе и привязана к заявке #' + taskId + (taskAddr ? ' (' + taskAddr + ')' : '') + '.',
        time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
      });
      renderAiMessages();
    } else {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '📋 Зарезервировать под заявку';
      }
      alert('Ошибка резервирования: ' + ((res && res.error) || 'не удалось сохранить'));
    }
  })
  .catch(function(err) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '📋 Зарезервировать под заявку';
    }
    alert('Ошибка соединения: ' + err.message);
  });
}
