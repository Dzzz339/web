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

          <!-- ИИ-ассистент -->
          <div onclick="openAiChat()" id="ai-sidebar-item"
               style="padding:12px 14px; border-bottom:1px solid var(--border); cursor:pointer; display:flex; align-items:center; gap:10px; background:${S.aiActive ? 'var(--orange-bg)' : '#fff'}"
               onmouseover="this.style.background='var(--orange-bg)'" onmouseout="if(!S.aiActive) this.style.background='#fff'">
            <div style="background:#7c3aed; color:#fff; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0;">🤖</div>
            <div>
              <div style="font-weight:700; font-size:.9rem">ИИ-ассистент</div>
              <div style="font-size:.72rem; color:var(--text-3)">Общий · Аналитика · Снабжение</div>
            </div>
          </div>

          <div style="padding:8px 14px; font-size:.7rem; font-weight:700; color:var(--text-3); text-transform:uppercase; margin-top:8px">Личные сообщения</div>
          <div id="chat-sidebar-users">Загрузка...</div>
        </div>
      </div>

      <!-- Правая колонка: Окно переписки -->
      <div style="display:flex; flex-direction:column; background:#fff; height:100%; min-height:0; overflow:hidden">
        ${S.aiActive ? `
        <!-- ИИ-ШАПКА -->
        <div style="padding:12px 16px; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:8px">
          <div style="display:flex; align-items:center; justify-content:space-between">
            <div style="font-weight:700; font-size:1rem">🤖 ИИ-ассистент <span id="ai-mode-label" style="font-size:.75rem; color:var(--text-3)"></span></div>
          </div>

          <!-- Переключатели режима -->
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            ${S.user && S.user.role === 'admin' ? `<button class="btn btn-sm" id="ai-mode-analytics" onclick="setAiMode('analytics')">📊 Аналитика</button>` : ''}
            ${S.user && S.user.role === 'admin' ? `<button class="btn btn-sm" id="ai-mode-forecast" onclick="setAiMode('forecast')">📦 Снабжение и прогноз</button>` : ''}
            <button class="btn btn-sm" id="ai-mode-tech" onclick="setAiMode('tech')">🔧 Техпомощь</button>
            <button class="btn btn-sm" id="ai-mode-general" onclick="setAiMode('general')">🤖 Общий</button>
            <button class="btn btn-sm" id="ai-mode-parse_devices" onclick="setAiMode('parse_devices')">🧮 Расчёт материалов</button>
          </div>

          <!-- Селектор заявки + вставить контекст -->
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
            <select id="ai-task-select" style="flex:1; min-width:180px"></select>
            <button class="btn btn-sm" onclick="insertAiCardContext()" title="Подставить данные заявки в вопрос">📎 Вставить контекст заявки</button>
          </div>
        </div>

        <!-- ИИ-сообщения -->
        <div id="ai-messages" style="flex:1; min-height:0; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; background:var(--bg)">
          <div style="text-align:center; color:var(--text-3); margin-top:2rem" id="ai-empty">Выберите режим и напишите вопрос</div>
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
          <input id="ai_text_input" type="text" placeholder="Задайте вопрос ассистенту..." style="flex:1" onkeydown="if(event.key==='Enter') sendAiMessage()">
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

// ─── ЛОГИКА ИИ-АССИСТЕНТА ───────────────────────────────────────────────────

function openAiChat() {
  S.aiActive = true;
  S.activeRoomId = null; // отключаем WebSocket-чат
  renderApp();
  // Подсветка активного пункта в сайдбаре
  var item = document.getElementById('ai-sidebar-item');
  if (item) item.style.background = 'var(--orange-bg)';
  initAiChat();
}

function setAiMode(mode) {
  S.aiMode = mode;
  var modes = ['analytics', 'forecast', 'tech', 'general', 'parse_devices'];
  var labels = {
    analytics: '📊 Аналитика',
    forecast: '📦 Снабжение и прогноз',
    tech: '🔧 Техпомощь',
    general: '🤖 Общий',
    parse_devices: '🧮 Расчёт материалов'
  };
  var desc = {
    analytics: 'Отвечает по данным из БД (статистика, регионы, подрядчики, остатки)',
    forecast: 'Прогноз дефицитов, дедлайны заказов под даты выхода, сроки поставки (Lead Times)',
    tech: 'Технические вопросы по монтажу сетей и стандарты СКС',
    general: 'Общий помощник с контекстом компании Stockeasy',
    parse_devices: 'Расчёт материалов по тексту заявки или сметы'
  };

  // Перекрашиваем кнопки режима
  modes.forEach(function(m) {
    var btn = document.getElementById('ai-mode-' + m);
    if (btn) {
      var isActive = (m === mode);
      btn.style.background = isActive ? 'var(--orange)' : '';
      btn.style.color = isActive ? '#fff' : '';
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
          ? 'Вставьте текст заявки или сметы: список оборудования, метражи, розетки...'
          : 'Напишите вопрос...';
    input.focus();
  }
}

function initAiChat() {
  // Заполняем селектор заявок
  var sel = document.getElementById('ai-task-select');
  if (sel && (!sel.options.length || !sel.options[0].getAttribute('data-init'))) {
    sel.setAttribute('data-init', '1');
    sel.innerHTML = '<option value="">— выберите заявку для контекста —</option>' +
      (S.tasks || []).map(function(t) {
        return '<option value="' + escHtml(String(t.id)) + '">' +
          escHtml((t.id || '') + (t.address ? ' — ' + t.address.slice(0, 40) : '') + (t.region ? ' [' + t.region + ']' : '')) +
          '</option>';
      }).join('');
  }
  setAiMode(S.aiMode || 'general');
  renderAiMessages();
}

function renderAiMessages() {
  var box = document.getElementById('ai-messages');
  if (!box) return;
  if (!S.aiMessages || !S.aiMessages.length) {
    box.innerHTML = '<div style="text-align:center; color:var(--text-3); margin-top:2rem" id="ai-empty">Выберите режим и напишите вопрос</div>';
    return;
  }
  var html = S.aiMessages.map(function(m) {
    var isUser = m.role === 'user';
    var bg = isUser ? 'var(--orange-bg)' : '#fff';
    var align = isUser ? 'flex-end' : 'flex-start';
    var border = isUser ? '1px solid #fed7aa' : '1px solid var(--border)';
    var contentHtml = m.isHtml ? m.isHtml : ('<div style="font-size:.85rem; color:var(--text); white-space:pre-wrap; word-break:break-word" class="ai-msg-content">' + escHtml(m.content) + '</div>');
    return `
      <div style="align-self:${align}; max-width:80%; background:${bg}; border:${border}; border-radius:10px; padding:8px 12px; box-shadow:var(--shadow)">
        <div style="font-size:.7rem; font-weight:700; color:${isUser ? 'var(--orange-dark)' : 'var(--blue)'}; margin-bottom:3px">
          ${isUser ? 'Вы' : '🤖 ИИ-ассистент'}
        </div>
        ${contentHtml}
        <div style="font-size:.65rem; color:var(--text-3); text-align:right; margin-top:4px">${m.time || ''}</div>
      </div>
    `;
  }).join('');
  box.innerHTML = html;
  scrollAiToBottom();
}

function renderAiStreamingReply() {
  var box = document.getElementById('ai-messages');
  if (!box) return;
  var streamEl = document.getElementById('ai-stream-box');
  if (!streamEl) {
    var div = document.createElement('div');
    div.id = 'ai-stream-box';
    div.className = 'ai-msg-content';
    div.style.cssText = 'align-self:flex-start; max-width:80%; background:#fff; border:1px solid var(--border); border-radius:10px; padding:8px 12px; box-shadow:var(--shadow)';
    div.innerHTML = '<div style="font-size:.7rem; font-weight:700; color:var(--blue); margin-bottom:3px">🤖 ИИ-ассистент</div><div style="font-size:.85rem; color:var(--text); white-space:pre-wrap; word-break:break-word"></div>';
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
  var sel = document.getElementById('ai-task-select');
  if (!sel || !sel.value) { alert('Сначала выберите заявку'); return; }
  var t = (S.tasks || []).find(function(x) { return String(x.id) === String(sel.value); });
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
  alert('Контекст заявки вставлен в поле ввода');
}

function sendAiMessage() {
  var input = document.getElementById('ai_text_input');
  if (!input) return;
  var text = input.value.trim();
  if (!text || S.aiLoading || S.aiStreaming) return;

  var mode = S.aiMode || 'general';
  var cardCtx = null;
  var sel = document.getElementById('ai-task-select');
  if (sel && sel.value) {
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(sel.value); });
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

  // ─── РЕЖИМ: parse_devices (обычный JSON, без streaming) ─────────────────────
  if (mode === 'parse_devices') {
    S.aiLoading = true;
    var sendBtn = document.getElementById('ai-send-btn');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '…'; }
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
      if (!data || !data.success) {
        throw new Error(data && data.error ? data.error : 'Пустой ответ сервера');
      }
      renderMaterialsCalculatorResponse(data);
    })
    .catch(function(err) {
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
  var sendBtn = document.getElementById('ai-send-btn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '…'; }

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
    function pump() {
      return reader.read().then(function(result) {
        if (result.done) {
          S.aiStreaming = false; S.aiLoading = false;
          resetAiSendBtn();
          S.aiMessages.push({ role: 'assistant', content: S.aiStreamText || '', time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) });
          renderAiMessages();
          return;
        }
        buffer += decoder.decode(result.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop(); // последняя неполная строка
        lines.forEach(function(line) {
          var s = line.trim();
          if (!s.startsWith('data:')) return;
          var payload = s.slice(5).trim();
          if (payload === '[DONE]') return;
          try {
            var obj = JSON.parse(payload);
            if (obj.error) throw new Error(obj.error);
            if (obj.delta) { S.aiStreamText += obj.delta; renderAiStreamingReply(); }
          } catch (e) { /* игнорируем */ }
        });
        return pump();
      });
    }
    return pump();
  }).catch(function(err) {
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
  if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Отправить ➔'; }
}

// ─── Умный калькулятор материалов (parse_devices) ────────────────────────────
function renderMaterialsCalculatorResponse(data) {
  var parsed = data.parsed || {};
  var materials = data.materials || {};
  var devicesStr = Object.keys(parsed).map(function(k) { return parsed[k] + ' ' + k; }).join(', ');
  var rowsHtml = Object.keys(materials).map(function(mat) {
    return '<tr class="mcalc-row"><td>' + escHtml(mat) + '</td><td style="text-align:right; font-weight:600">' + materials[mat] + '</td></tr>';
  }).join('');
  var html = '<div class="mcalc-root">' +
    '<div class="mcalc-devices">Распознанные устройства: <strong>' + escHtml(devicesStr || '—') + '</strong></div>' +
    '<table class="mcalc-table"><thead><tr><th>Материал</th><th style="text-align:right">Количество</th></tr></thead>' +
    '<tbody>' + (rowsHtml || '<tr><td colspan="2" class="t3">Материалы не определены</td></tr>') + '</tbody></table>' +
    '<button class="btn btn-sm mcalc-btn" onclick="reserveMaterials(this, ' + escHtml(JSON.stringify(materials).replace(/"/g, '&quot;')) + ')">📋 Зарезервировать под заявку</button>' +
    '</div>';
  S.aiMessages = S.aiMessages || [];
  S.aiMessages.push({ role: 'assistant', content: '', time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }), isHtml: html });
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
  var taskId = sel && sel.value ? sel.value : (S.cardId || null);
  if (!taskId) {
    alert('Пожалуйста, выберите заявку в выпадающем списке сверху для привязки и бронирования материалов.');
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Резервирование…';
  }
  fetch('/api/tasks/' + encodeURIComponent(taskId) + '/materials/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
    body: JSON.stringify({ materials: materials })
  })
  .then(function(r){ return r.json(); })
  .then(function(res) {
    if (res && res.success) {
      if (btn) {
        btn.textContent = '✅ Зарезервировано под заявку #' + taskId;
        btn.style.background = 'var(--green)';
        btn.style.color = '#fff';
      }
      alert('✅ Спецификация материалов успешно сохранена в заявку #' + taskId + ' и забронирована на складе!');
    } else {
      if (btn) { btn.disabled = false; btn.textContent = '📋 Зарезервировать под заявку'; }
      alert('Ошибка резервирования: ' + ((res && res.error) || 'не удалось сохранить'));
    }
  })
  .catch(function(err) {
    if (btn) { btn.disabled = false; btn.textContent = '📋 Зарезервировать под заявку'; }
    alert('Ошибка соединения: ' + err.message);
  });
}
