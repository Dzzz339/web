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

          <!-- Переключатели режима -->
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            ${S.user && S.user.role === 'admin' ? `<button class="btn btn-sm btn-analytics-styled" id="ai-mode-analytics" onclick="setAiMode('analytics')">${ICONS.analytics} <span>Аналитика</span></button>` : ''}
            ${S.user && S.user.role === 'admin' ? `<button class="btn btn-sm" id="ai-mode-forecast" onclick="setAiMode('forecast')">📦 Снабжение и прогноз</button>` : ''}
            <button class="btn btn-sm" id="ai-mode-tech" onclick="setAiMode('tech')">🔧 Техпомощь</button>
            <button class="btn btn-sm" id="ai-mode-general" onclick="setAiMode('general')">💬 Общий</button>
            <button class="btn btn-sm" id="ai-mode-parse_devices" onclick="setAiMode('parse_devices')">🧮 Расчёт материалов</button>
          </div>

          <!-- Поиск заявки для контекста -->
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <div class="ai-task-search-wrap" id="ai-task-search-container">
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
            <button class="btn btn-sm btn-ghost" onclick="insertAiCardContext()" title="Подставить данные заявки в вопрос">📎 Вставить контекст</button>
          </div>
        </div>

        <!-- ИИ-сообщения -->
        <div id="ai-messages" style="flex:1; min-height:0; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; background:var(--bg)">
          <div style="text-align:center; color:var(--text-3); margin-top:2rem" id="ai-empty">
            <div style="width:48px; height:48px; border-radius:12px; background:var(--orange-bg); color:var(--orange); display:inline-flex; align-items:center; justify-content:center; margin-bottom:8px;">
              ${ICONS.stocky}
            </div>
            <div style="font-weight:700; color:var(--text); font-size:1rem; margin-bottom:4px;">Привет! Я Стоки</div>
            <div style="font-size:.82rem;">Выберите режим сверху или задайте вопрос по заявкам, оборудованию и ТМЦ</div>
          </div>
        </div>

        <!-- Быстрые вопросы -->
        <div style="padding:6px 16px; display:flex; gap:6px; flex-wrap:wrap; background:#fff; border-top:1px solid var(--border)">
          <span style="font-size:.72rem; color:var(--text-3); align-self:center">Быстрый вопрос:</span>
          <button class="btn btn-sm btn-ghost" style="font-size:.72rem; padding:2px 8px" onclick="quickAiAsk('Какие материалы сейчас в дефиците и требуют срочного заказа?')">📉 Дефицит ТМЦ</button>
          <button class="btn btn-sm btn-ghost" style="font-size:.72rem; padding:2px 8px" onclick="quickAiAsk('Какой график заказов под ближайшие даты выхода на монтаж?')">📅 График под даты выхода</button>
          <button class="btn btn-sm btn-ghost" style="font-size:.72rem; padding:2px 8px" onclick="quickAiAsk('Каковы свободные остатки кабеля и патч-панелей на центральном складе?')">🏢 Остатки на складе</button>
          <button class="btn btn-sm btn-ghost" style="font-size:.72rem; padding:2px 8px" onclick="quickAiAsk('Какие поставки от поставщиков сейчас находятся в пути?')">🚚 Заказы в пути</button>
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
        <!-- Переключатели режима -->
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          ${S.user && S.user.role === 'admin' ? `<button class="btn btn-sm btn-analytics-styled" id="ai-mode-analytics" onclick="setAiMode('analytics')">${ICONS.analytics} <span>Аналитика</span></button>` : ''}
          ${S.user && S.user.role === 'admin' ? `<button class="btn btn-sm" id="ai-mode-forecast" onclick="setAiMode('forecast')">📦 Снабжение и прогноз</button>` : ''}
          <button class="btn btn-sm" id="ai-mode-tech" onclick="setAiMode('tech')">🔧 Техпомощь</button>
          <button class="btn btn-sm" id="ai-mode-general" onclick="setAiMode('general')">💬 Общий</button>
          <button class="btn btn-sm" id="ai-mode-parse_devices" onclick="setAiMode('parse_devices')">🧮 Расчёт материалов</button>
        </div>

        <!-- Поиск заявки для контекста -->
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <div class="ai-task-search-wrap" id="ai-task-search-container">
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
          <button class="btn btn-sm btn-ghost" onclick="insertAiCardContext()" title="Подставить данные заявки в вопрос">📎 Вставить контекст</button>
        </div>
      </div>

      <!-- ИИ-сообщения -->
      <div id="ai-messages" style="flex:1; min-height:0; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px; background:var(--bg);">
        <div style="text-align:center; color:var(--text-3); margin-top:2rem" id="ai-empty">
          <div style="width:48px; height:48px; border-radius:12px; background:var(--orange-bg); color:var(--orange); display:inline-flex; align-items:center; justify-content:center; margin-bottom:8px;">
            ${ICONS.stocky}
          </div>
          <div style="font-weight:700; color:var(--text); font-size:1rem; margin-bottom:4px;">Привет! Я Стоки</div>
          <div style="font-size:.82rem;">Выберите режим сверху или задайте вопрос по заявкам, оборудованию и ТМЦ</div>
        </div>
      </div>

      <!-- Быстрые вопросы -->
      <div style="padding:6px 16px; display:flex; gap:6px; flex-wrap:wrap; background:#fff; border-top:1px solid var(--border)">
        <span style="font-size:.72rem; color:var(--text-3); align-self:center">Быстрый вопрос:</span>
        <button class="btn btn-sm btn-ghost" style="font-size:.72rem; padding:2px 8px" onclick="quickAiAsk('Какие материалы сейчас в дефиците и требуют срочного заказа?')">📉 Дефицит ТМЦ</button>
        <button class="btn btn-sm btn-ghost" style="font-size:.72rem; padding:2px 8px" onclick="quickAiAsk('Какой график заказов под ближайшие даты выхода на монтаж?')">📅 График под даты выхода</button>
        <button class="btn btn-sm btn-ghost" style="font-size:.72rem; padding:2px 8px" onclick="quickAiAsk('Каковы свободные остатки кабеля и патч-панелей на центральном складе?')">🏢 Остатки на складе</button>
        <button class="btn btn-sm btn-ghost" style="font-size:.72rem; padding:2px 8px" onclick="quickAiAsk('Какие поставки от поставщиков сейчас находятся в пути?')">🚚 Заказы в пути</button>
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
  S.aiMode = mode;
  var modes = ['analytics', 'forecast', 'tech', 'general', 'parse_devices'];
  var desc = {
    analytics: 'Отвечает по данным из БД (статистика, регионы, подрядчики, остатки)',
    forecast: 'Прогноз дефицитов, дедлайны заказов под даты выхода, сроки поставки (Lead Times)',
    tech: 'Технические вопросы по монтажу сетей и стандарты СКС',
    general: 'Помощник Стоки с контекстом компании Stockeasy',
    parse_devices: 'Автоматический расчёт и бронирование материалов по спецификации'
  };

  // Перекрашиваем кнопки режима
  modes.forEach(function(m) {
    var btn = document.getElementById('ai-mode-' + m);
    if (btn) {
      var isActive = (m === mode);
      if (m === 'analytics') {
        if (isActive) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      } else {
        btn.style.background = isActive ? 'var(--orange)' : '';
        btn.style.color = isActive ? '#fff' : '';
      }
    }
  });

  var label = document.getElementById('ai-mode-label');
  if (label) label.textContent = '— ' + (desc[mode] || '');

  var input = document.getElementById('ai_text_input');
  if (input) {
    input.placeholder = mode === 'analytics'
      ? 'Например: сколько заявок в Москве? / какой регион просрочен?'
      : mode === 'forecast'
        ? 'Например: какие материалы в дефиците? / когда заказывать кабель под объекты?'
        : mode === 'parse_devices'
          ? 'Вставьте список оборудования: 5 АРМ, 2 точки WiFi, 4 камеры...'
          : 'Задайте вопрос Стоки...';
    input.focus();
  }
}

function initAiChat() {
  initAiTaskPicker();
  setAiMode(S.aiMode || 'general');
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
      badge.textContent = '🟢 Ollama онлайн (' + (data.currentModel || 'qwen') + ')';
      badge.title = 'Базовый адрес: ' + data.baseUrl + '\nДоступные модели: ' + (data.availableModels || []).join(', ') + '\nНажмите для повторной проверки';
      if (showAlert) {
        alert('✅ Связь с Ollama установлена!\n\nБазовый URL: ' + data.baseUrl + '\nТекущая модель: ' + data.currentModel + '\nДоступные модели:\n' + (data.availableModels || []).join('\n'));
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

function renderAiStreamingReply() {
  removeAiLoadingIndicator();
  var box = document.getElementById('ai-messages');
  if (!box) return;
  var streamEl = document.getElementById('ai-stream-box');
  if (!streamEl) {
    var div = document.createElement('div');
    div.id = 'ai-stream-box';
    div.className = 'ai-msg-content';
    div.style.cssText = 'align-self:flex-start; max-width:82%; background:#fff; border:1px solid var(--border); border-radius:10px; padding:10px 14px; box-shadow:var(--shadow)';
    div.innerHTML = '<div style="font-size:.72rem; font-weight:700; color:var(--orange); margin-bottom:4px; display:flex; align-items:center; gap:6px;"><span style="width:16px;height:16px;display:inline-flex;">' + ICONS.stocky + '</span> Стоки</div><div style="font-size:.85rem; color:var(--text); white-space:pre-wrap; word-break:break-word"></div>';
    box.appendChild(div);
    streamEl = div;
  }
  var content = streamEl.lastElementChild;
  content.textContent = S.aiStreamText || '';
  scrollAiToBottom();
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

  // ─── СТРИМИНГОВЫЕ РЕЖИМЫ (SSE) ───────────────────────────────────────────────
  S.aiLoading = true;
  S.aiStreaming = true;
  S.aiStreamText = '';
  
  var loadSubtitle = mode === 'analytics'
    ? 'Запрашиваю аналитику и считаю показатели по базе...'
    : (mode === 'forecast' ? 'Прогнозирую дефициты и графики поставок ТМЦ...' : 'Формирую ответ...');
  showAiLoadingIndicator(loadSubtitle);

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
          removeAiLoadingIndicator();
          S.aiStreaming = false; S.aiLoading = false;
          resetAiSendBtn();
          var finalMsg = S.aiStreamText || '⚠️ Нейросеть не вернула текст ответа. Проверьте доступность модели Ollama.';
          S.aiMessages.push({ role: 'assistant', content: finalMsg, time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) });
          renderAiMessages();
          return;
        }

        if (!hasStreamStarted) {
          hasStreamStarted = true;
          removeAiLoadingIndicator();
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
