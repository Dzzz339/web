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

  return `
    <h1 class="page-title">Мессенджер</h1>
    <div class="card" style="display:grid; grid-template-columns: 280px 1fr; height:70vh; overflow:hidden">
      
      <!-- Левая колонка: Диалоги -->
      <div style="border-right:1px solid var(--border); display:flex; flex-direction:column; background:#fafafa">
        <div style="padding:12px 14px; border-bottom:1px solid var(--border); font-weight:700" class="sec-title">Чаты</div>
        <div style="overflow-y:auto; flex:1">
          
          <!-- Общий чат -->
          <div onclick="openGeneralChat()" 
               style="padding:12px 14px; border-bottom:1px solid var(--border); cursor:pointer; display:flex; align-items:center; gap:10px; background:#fff"
               onmouseover="this.style.background='var(--orange-bg)'" onmouseout="this.style.background='#fff'">
            <div style="background:#2563eb; color:#fff; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0;">📢</div>
            <div>
              <div style="font-weight:700; font-size:.9rem">Общий чат компании</div>
              <div style="font-size:.72rem; color:var(--text-3)">Все сотрудники</div>
            </div>
          </div>

          <div style="padding:8px 14px; font-size:.7rem; font-weight:700; color:var(--text-3); text-transform:uppercase; margin-top:8px">Личные сообщения</div>
          <div id="chat-sidebar-users">Загрузка...</div>
        </div>
      </div>

      <!-- Правая колонка: Окно переписки (Зафиксировали высоту) -->
      <div style="display:flex; flex-direction:column; background:#fff; height:100%; min-height:0; overflow:hidden">
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
  S.activeRoomId = roomId;
  document.getElementById('chat-title').textContent = title;
  document.getElementById('chat-input-area').style.display = 'flex';

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
