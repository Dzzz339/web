// public/js/pages/kanban.js - Операционный Канбан конвейер StockEasy
// Реализует полную воронку из 10 этапов процессов по регламенту Алексея Чайки (П0–П10)
// Поддерживает drag-and-drop, быстрые фильтры, двухъярусный футер карточек и раздельные суммы

var KANBAN_COLS = [
  {
    id: 'new',
    label: '1. Новые (за сегодня)',
    color: '#475569',
    badgeCls: 'b-gray',
    icon: '📥',
    processRange: 'П0',
    desc: 'Только поступили с портала Заказчика, утренний срез',
    macroStatuses: ['new'],
    targetMacro: 'new',
    stages: [0]
  },
  {
    id: 'review',
    label: '2. На проверке ТЗ',
    color: '#2563EB',
    badgeCls: 'b-blue',
    icon: '🔍',
    processRange: 'П1',
    desc: 'Сверка исходных данных, понятность ТЗ, соответствие договору',
    macroStatuses: ['review'],
    targetMacro: 'review',
    stages: []
  },
  {
    id: 'rejected',
    label: '3. Отклонены / Доработка',
    color: '#DC2626',
    badgeCls: 'b-red',
    icon: '⛔',
    processRange: 'П1 (возврат)',
    desc: 'Ошибки в ТЗ, нет схем/адреса, возврат Заказчику на уточнение',
    macroStatuses: ['rejected', 'cancelled'],
    targetMacro: 'rejected',
    stages: []
  },
  {
    id: 'in_progress',
    label: '4. В поиске подрядчика',
    color: '#7C3AED',
    badgeCls: 'b-purple',
    icon: '🤝',
    processRange: 'П2',
    desc: 'Принято в работу, подбор субподрядчиков (СКС/ВОЛС)',
    macroStatuses: ['in_progress'],
    targetMacro: 'in_progress',
    stages: [1]
  },
  {
    id: 'assigned',
    label: '5. Назначено / ТМЦ',
    color: '#DB2777',
    badgeCls: 'b-pink',
    icon: '📋',
    processRange: 'П3',
    desc: 'Подрядчик выбран, наряды, допуски, комплектация ТМЦ',
    macroStatuses: ['assigned'],
    targetMacro: 'assigned',
    stages: [2]
  },
  {
    id: 'install',
    label: '6. В монтаже (СМР)',
    color: '#D97706',
    badgeCls: 'b-install',
    icon: '🔧',
    processRange: 'П4',
    desc: 'СМР на объекте, прокладка кабеля, монтаж портов',
    macroStatuses: ['install'],
    targetMacro: 'install',
    stages: [3]
  },
  {
    id: 'smr_done',
    label: '7. СМР выполнено',
    color: '#059669',
    badgeCls: 'b-green',
    icon: '🏁',
    processRange: 'П5а',
    desc: 'Монтаж завершен, фотоотчеты и ТМЦ у куратора',
    macroStatuses: ['smr_done', 'correction'],
    targetMacro: 'smr_done',
    stages: []
  },
  {
    id: 'id_in_progress',
    label: '8. ИД в разработке',
    color: '#0891B2',
    badgeCls: 'b-cyan',
    icon: '📐',
    processRange: 'П5б',
    desc: 'Проектировщик готовит альбом ИД (норматив 3 дня)',
    macroStatuses: ['id_in_progress'],
    targetMacro: 'id_in_progress',
    stages: [4]
  },
  {
    id: 'accepted',
    label: '9. На приёмке Заказчиком',
    color: '#4F46E5',
    badgeCls: 'b-indigo',
    icon: '🏛️',
    processRange: 'П6–П7',
    desc: 'ИД и СМР переданы на портал, акты выставлены',
    macroStatuses: ['id_delivered', 'accepted'],
    targetMacro: 'accepted',
    stages: [5, 6]
  },
  {
    id: 'billing',
    label: '10. Оплата и Закрытие',
    color: '#16A34A',
    badgeCls: 'b-payment',
    icon: '💰',
    processRange: 'П8–П10',
    desc: 'Акты КС-2/КС-3, расчеты, оплачено, объект в архиве',
    macroStatuses: ['billing', 'paid', 'archived'],
    targetMacro: 'billing',
    stages: [7, 8, 9]
  }
];

var KANBAN_PHASES = [
  { id: 'all', label: '🌐 Все 10 этапов', shortLabel: 'Все этапы', colIds: [] },
  { id: 'intake', label: '📥 1. Вход и ТЗ (1–3)', shortLabel: 'Вход и ТЗ', range: 'Этапы 1–3', colIds: ['new', 'review', 'rejected'] },
  { id: 'assign', label: '🤝 2. Назначение (4–5)', shortLabel: 'Назначение', range: 'Этапы 4–5', colIds: ['in_progress', 'assigned'] },
  { id: 'work', label: '🔧 3. СМР и ИД (6–8)', shortLabel: 'СМР и ИД', range: 'Этапы 6–8', colIds: ['install', 'smr_done', 'id_in_progress'] },
  { id: 'close', label: '🏛️ 4. Сдача и Оплата (9–10)', shortLabel: 'Сдача и Оплата', range: 'Этапы 9–10', colIds: ['accepted', 'billing'] }
];

function setKanbanPhase(phaseId) {
  S.kanbanPhase = phaseId || 'all';
  renderApp();
}

function toggleKanbanCol(colId) {
  if (!S.kanbanCollapsedCols) S.kanbanCollapsedCols = {};
  S.kanbanCollapsedCols[colId] = !S.kanbanCollapsedCols[colId];
  renderApp();
}

function toggleAutoCollapseEmpty() {
  S.kanbanAutoCollapseEmpty = !S.kanbanAutoCollapseEmpty;
  if (!S.kanbanAutoCollapseEmpty) {
    S.kanbanCollapsedCols = {};
  }
  renderApp();
}

function expandAllKanbanCols() {
  S.kanbanCollapsedCols = {};
  S.kanbanAutoCollapseEmpty = false;
  renderApp();
}

function scrollKanban(amount) {
  var b = document.querySelector('.kanban');
  if (b) b.scrollBy({ left: amount, behavior: 'smooth' });
}

function getTaskKanbanCol(t) {
  var ms = String(t.macroStatus || '').toLowerCase().trim();
  if (t.status === 'cancelled' || ms === 'rejected' || ms === 'cancelled') {
    return KANBAN_COLS[2]; // 'rejected'
  }
  if (ms) {
    for (var i = 0; i < KANBAN_COLS.length; i++) {
      if (KANBAN_COLS[i].macroStatuses.includes(ms)) return KANBAN_COLS[i];
    }
  }
  // Резервный поиск по legacy stageNum
  var sn = Number(t.stageNum != null ? t.stageNum : 0);
  for (var j = 0; j < KANBAN_COLS.length; j++) {
    if (KANBAN_COLS[j].stages.includes(sn)) return KANBAN_COLS[j];
  }
  return KANBAN_COLS[0];
}

function clearKanbanFilters() {
  S.kanbanQ = '';
  S.kanbanReg = '';
  S.kanbanMgr = '';
  S.kanbanCustomer = '';
  S.kanbanQuick = 'all';
  renderApp();
}

function setKanbanQuick(mode) {
  S.kanbanQuick = mode || 'all';
  renderApp();
}

// ─── DRAG AND DROP ЛОГИКА ────────────────────────────────────────────────────
var _kanbanDraggedId = null;

function kanbanCardDragStart(e, taskId) {
  _kanbanDraggedId = taskId;
  e.dataTransfer.setData('text/plain', taskId);
  e.dataTransfer.effectAllowed = 'move';
  var card = e.currentTarget;
  setTimeout(function() {
    if (card) card.classList.add('dragging');
  }, 0);
}

function kanbanCardDragEnd(e) {
  var card = e.currentTarget;
  if (card) card.classList.remove('dragging');
  _kanbanDraggedId = null;
  document.querySelectorAll('.kcol-cards.kcol-drop-hover').forEach(function(el) {
    el.classList.remove('kcol-drop-hover');
  });
}

function kanbanColDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  var container = e.currentTarget;
  if (!container.classList.contains('kcol-drop-hover')) {
    container.classList.add('kcol-drop-hover');
  }
}

function kanbanColDragLeave(e) {
  var rect = e.currentTarget.getBoundingClientRect();
  if (e.clientX <= rect.left || e.clientX >= rect.right || e.clientY <= rect.top || e.clientY >= rect.bottom) {
    e.currentTarget.classList.remove('kcol-drop-hover');
  }
}

function kanbanColDrop(e, colId) {
  e.preventDefault();
  e.currentTarget.classList.remove('kcol-drop-hover');
  var taskId = e.dataTransfer.getData('text/plain') || _kanbanDraggedId;
  _kanbanDraggedId = null;
  if (!taskId) return;
  moveKanbanTaskToCol(taskId, colId);
}

function moveKanbanTaskToCol(taskId, colId) {
  var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  var targetCol = KANBAN_COLS.find(function(c){ return c.id === colId; });
  if (!targetCol) return;
  var currentCol = getTaskKanbanCol(t);
  if (currentCol.id === targetCol.id) return;

  if (S.user && S.user.role === 'worker') {
    return alert('У рабочих нет прав на изменение этапа заявки');
  }

  var targetStatus = targetCol.targetMacro;
  changeTaskMacroStatus(taskId, targetStatus);
}

function moveTask(id, newStatusOrStage) {
  if (typeof newStatusOrStage === 'string' && MACRO_STATUSES[newStatusOrStage]) {
    changeTaskMacroStatus(id, newStatusOrStage);
  } else {
    alert('Перемещение заявки выполняется перетаскиванием карточки или выбором статуса в выпадающем списке на карточке.');
  }
}

function setTaskStage(newStage) {
  moveTask(S.cardId, newStage);
}

// ─── ОСНОВНАЯ ФУНКЦИЯ СТРАНИЦЫ КАНБАН ─────────────────────────────────────────
function pageKanban() {
  var q = (S.kanbanQ || '').toLowerCase().trim();
  var reg = S.kanbanReg || '';
  var mgr = S.kanbanMgr || '';
  var cust = S.kanbanCustomer || '';
  var quick = S.kanbanQuick || 'all';

  var todayStr = new Date().toISOString().split('T')[0];

  var regions = Array.from(new Set(S.tasks.map(function(t){ return (t.region || '').trim(); }).filter(Boolean))).sort();
  var managers = Array.from(new Set(S.tasks.map(function(t){ return (t.manager || '').trim(); }).filter(Boolean))).sort();
  var customers = Array.from(new Set(S.tasks.map(function(t){ return (t.customer || '').trim(); }).filter(Boolean))).sort();

  function mkOpts(arr, cur) {
    return arr.map(function(v) {
      var safe = v.replace(/"/g, '&quot;');
      return '<option value="' + safe + '"' + (cur === v ? ' selected' : '') + '>' + v + '</option>';
    }).join('');
  }

  // Фильтрация заявок
  var filtered = S.tasks.filter(function(t) {
    if (t.archived) return false;
    if (reg && (t.region || '').trim() !== reg) return false;
    if (mgr && (t.manager || '').trim() !== mgr) return false;
    if (cust && (t.customer || '').trim() !== cust) return false;

    // Быстрый фильтр
    if (quick === 'today') {
      var isToday = (t.dateZayavki && t.dateZayavki === todayStr) || 
                    (t.currentDate && t.currentDate === todayStr);
      if (!isToday && (t.macroStatus || 'new') !== 'new') return false;
    } else if (quick === 'overdue') {
      var isOvd = t.overdueDays > 0 || (t.stageDue && new Date(t.stageDue) < new Date());
      if (!isOvd) return false;
    } else if (quick === 'remarks') {
      if (Number(t.openRemarksCount || 0) <= 0) return false;
    } else if (quick === 'mine') {
      var me = S.user ? (S.user.fullName || S.user.username || '') : '';
      var myId = S.user ? S.user.id : null;
      var isMine = (me && (t.manager === me || t.assignee === me)) ||
                   (myId && (t.managerId === myId || t.designerId === myId));
      if (!isMine) return false;
    }

    if (q) {
      var content = ((t.id || '') + ' ' + (t.address || '') + ' ' + (t.contractor || '') + ' ' + (t.assignee || '') + ' ' + (t.customer || '') + ' ' + (t.comment || '')).toLowerCase();
      if (!content.includes(q)) return false;
    }
    return true;
  });

  // Расчет сводной статистики для плашки
  var totalAmount = filtered.reduce(function(sum, t){ 
    var fin = getTaskFinance(t);
    return sum + Number(fin.total || t.amount || 0); 
  }, 0);
  var totalOverdue = filtered.filter(function(t){ 
    return t.overdueDays > 0 || (t.stageDue && new Date(t.stageDue) < new Date()); 
  }).length;
  var totalRemarks = filtered.reduce(function(sum, t){ 
    return sum + Number(t.openRemarksCount || 0); 
  }, 0);
  var todayCount = S.tasks.filter(function(t){
    return !t.archived && ((t.dateZayavki && t.dateZayavki === todayStr) || (t.currentDate && t.currentDate === todayStr) || (t.macroStatus || 'new') === 'new');
  }).length;

  // Расчет объектов по фазам для табов
  var curPhase = S.kanbanPhase || 'all';
  var phaseDef = KANBAN_PHASES.find(function(p){ return p.id === curPhase; }) || KANBAN_PHASES[0];

  var phaseCounts = {};
  KANBAN_PHASES.forEach(function(ph) {
    if (ph.id === 'all') {
      phaseCounts[ph.id] = filtered.length;
    } else {
      phaseCounts[ph.id] = filtered.filter(function(t) {
        var col = getTaskKanbanCol(t);
        return ph.colIds.includes(col.id);
      }).length;
    }
  });

  // Фильтрация отображаемых колонок по выбранной фазе
  var visibleCols = KANBAN_COLS.filter(function(col) {
    if (phaseDef.id === 'all' || !phaseDef.colIds || !phaseDef.colIds.length) return true;
    return phaseDef.colIds.includes(col.id);
  });

  var emptyColsCount = visibleCols.filter(function(col) {
    return filtered.filter(function(t){ return getTaskKanbanCol(t).id === col.id; }).length === 0;
  }).length;

  // Отрисовка колонок
  var board = '';
  visibleCols.forEach(function(col) {
    var colTasks = filtered.filter(function(t){ 
      return getTaskKanbanCol(t).id === col.id;
    });

    var colAmt = colTasks.reduce(function(sum, t){ 
      var fin = getTaskFinance(t);
      return sum + Number(fin.total || t.amount || 0); 
    }, 0);

    // Проверяем свернута ли колонка (пользователем или авто-сворачивание пустых)
    var isCollapsed = false;
    if (S.kanbanCollapsedCols && S.kanbanCollapsedCols[col.id] !== undefined) {
      isCollapsed = !!S.kanbanCollapsedCols[col.id];
    } else if (S.kanbanAutoCollapseEmpty && colTasks.length === 0) {
      isCollapsed = true;
    }

    if (isCollapsed) {
      board += '<div class="kcol kcol-collapsed" id="kcol-' + col.id + '" onclick="toggleKanbanCol(\'' + col.id + '\')" title="Нажмите, чтобы развернуть: ' + escHtml(col.label) + ' (' + colTasks.length + ' заявок)">' +
        '<div class="kcol-collapsed-bar" style="background:' + col.color + '">' +
          '<div style="font-size:1.1rem;margin-bottom:6px">' + col.icon + '</div>' +
          '<div class="kcol-collapsed-title">' + escHtml(col.label) + '</div>' +
          '<div class="kcol-cnt-badge" style="margin-top:6px">' + colTasks.length.toLocaleString('ru') + '</div>' +
        '</div>' +
      '</div>';
      return;
    }

    var cards = '';
    colTasks.slice(0, 80).forEach(function(t) {
      var tid = (t.id || '').replace(/'/g, "\\'");
      var fin = getTaskFinance(t);
      var sn = Number(t.stageNum != null ? t.stageNum : 0);
      var nextStep = sn < 9 ? ID_STEPS[sn] : null;
      var canStep = canUserStep(S.user, t);
      var canUndo = canUserUndo(S.user, t) && sn > 0;
      var openRem = Number(t.openRemarksCount || 0);
      var curMs = (t.macroStatus || 'new').toLowerCase();
      var custName = (t.customer || '').trim();

      var isTaskToday = (t.dateZayavki && t.dateZayavki === todayStr) || (t.currentDate && t.currentDate === todayStr);

      // Бейдж срока / просрочки
      var dueBadge = '';
      if (t.overdueDays > 0) {
        dueBadge = '<span class="badge b-red" style="font-size:.68rem;padding:1px 6px;font-weight:700" title="Просрочка ' + t.overdueDays + ' дн.">⏳ +' + t.overdueDays + ' дн</span>';
      } else if (t.stageDue) {
        var isOvd = new Date(t.stageDue) < new Date();
        dueBadge = '<span class="badge ' + (isOvd ? 'b-red' : 'b-survey') + '" style="font-size:.65rem;padding:1px 5px">' +
          '⏳ ' + t.stageDue.slice(5, 10).split('-').reverse().join('.') + (isOvd ? ' !' : '') +
        '</span>';
      } else if (t.deadline) {
        dueBadge = '<span style="font-size:.7rem;color:var(--text-3)">📅 ' + escHtml(t.deadline) + '</span>';
      }

      // Прогресс портов
      var portsHtml = '';
      if (t.inOrder > 0) {
        var pctVal = Math.min(100, Math.round(((t.fact || 0) / t.inOrder) * 100));
        portsHtml = '<div style="margin:4px 0 2px">' +
          '<div style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--text-3);margin-bottom:2px">' +
            '<span>Порты: <b>' + (t.fact || 0) + ' / ' + (t.inOrder || 0) + '</b></span>' +
            '<span>' + pctVal + '%</span>' +
          '</div>' +
          '<div style="height:3px;background:#e2e8f0;border-radius:2px;overflow:hidden">' +
            '<div style="height:100%;width:' + pctVal + '%;background:var(--orange)"></div>' +
          '</div>' +
        '</div>';
      } else {
        portsHtml = '<div style="font-size:.72rem;color:var(--text-3);margin:2px 0">' +
          'Порты: <b>' + (t.fact || 0) + '</b> шт.' +
        '</div>';
      }

      // Выпадающий список всех макро-статусов
      var statusOptions = Object.keys(MACRO_STATUSES).map(function(k){
        var msObj = MACRO_STATUSES[k];
        return '<option value="' + k + '"' + (curMs === k ? ' selected' : '') + '>' + msObj.icon + ' ' + msObj.name + '</option>';
      }).join('');

      // Примечание / комментарий для отклонённых заявок
      var rejectReasonHtml = '';
      if (col.id === 'rejected' && t.comment) {
        rejectReasonHtml = '<div style="font-size:.69rem;color:var(--red);background:#fef2f2;border:1px solid #fecaca;padding:3px 6px;border-radius:4px;margin:3px 0;line-height:1.25">' +
          '⚠️ ' + escHtml(t.comment) +
        '</div>';
      }

      cards += '<div class="kcard" draggable="true" ' +
        'ondragstart="kanbanCardDragStart(event, \'' + tid + '\')" ' +
        'ondragend="kanbanCardDragEnd(event)" ' +
        'onclick="openCard(\'' + tid + '\')" style="cursor:pointer">' +

        // 1. Верхняя строка: Номер заявки + Замечания, Приоритет справа
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">' +
          '<div style="display:flex;align-items:center;gap:4px">' +
            '<span style="font-weight:700;color:var(--orange);font-size:.82rem">№ ' + escHtml(t.id) + '</span>' +
            (isTaskToday && col.id === 'new' ? '<span class="badge b-blue" style="font-size:.62rem;padding:1px 5px">✨ Сегодня</span>' : '') +
            (openRem > 0 ? '<span class="badge b-red" style="font-size:.65rem;padding:1px 5px" title="Неустраненные замечания: ' + openRem + '">⚠️ ' + openRem + '</span>' : '') +
          '</div>' +
          prBadge(t.priority) +
        '</div>' +

        // 2. Вторая строка: Заказчик слева, Регион справа
        '<div style="display:flex;justify-content:space-between;align-items:center;font-size:.69rem;margin-bottom:3px;gap:4px">' +
          '<span class="kcard-customer-tag" title="Заказчик: ' + escHtml(custName || 'Заказчик') + '">' +
            '🏛️ ' + escHtml(custName || 'Заказчик') +
          '</span>' +
          '<span style="color:var(--text-3);white-space:nowrap">📍 ' + escHtml(t.region || '—') + '</span>' +
        '</div>' +

        // 3. Название / Адрес
        '<div class="kcard-title" title="' + escHtml(t.address || t.title || 'Без адреса') + '">' +
          escHtml(t.address || t.title || 'Без адреса') +
        '</div>' +

        rejectReasonHtml +

        // 4. Исполнитель слева, Срок / Просрочка справа
        '<div style="font-size:.72rem;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center">' +
          '<span style="color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;margin-right:6px" title="' + escHtml(t.contractor || t.assignee || 'Не назначен') + '">' +
            '👤 ' + escHtml(t.contractor || t.assignee || 'Не назначен') +
          '</span>' +
          dueBadge +
        '</div>' +

        // 5. Прогресс портов и Финансы
        portsHtml +
        '<div style="display:flex;justify-content:space-between;align-items:center;font-size:.74rem;border-top:1px dashed var(--border);padding-top:4px;margin-top:4px">' +
          '<span style="font-size:.7rem;color:var(--text-3)">Сумма:</span>' +
          '<span style="font-weight:700;color:var(--blue)">' + fmtMoney(fin.total || t.amount) + '</span>' +
        '</div>' +

        // 6. Подвал карточки (ДВУХЪЯРУСНЫЙ):
        // Ярус 1: Выпадающий список макро-статуса + кнопка отката
        '<div style="display:flex;align-items:center;gap:4px;margin-top:6px" onclick="event.stopPropagation()">' +
          '<select class="kcard-status-select" onchange="changeTaskMacroStatus(\'' + tid + '\', this.value)" title="Макро-статус процесса">' +
            statusOptions +
          '</select>' +
          (canUndo ? '<button type="button" class="btn btn-xs btn-ghost" onclick="undoIdStep(\'' + tid + '\')" title="Откатить шаг регламента назад" style="padding:3px 6px;font-size:.76rem;border:1px solid var(--border);border-radius:6px;background:#f8fafc;color:var(--text-2);flex-shrink:0">↩</button>' : '') +
        '</div>' +

        // Ярус 2: Кнопка шага регламента во ВСЮ ширину карточки (никогда не вылезает)
        (nextStep ? (
          '<div style="margin-top:4px" onclick="event.stopPropagation()">' +
            '<button type="button" class="kcard-step-btn ' + (canStep ? '' : 'disabled') + '" onclick="advanceIdStep(\'' + tid + '\')" ' +
            (canStep ? '' : 'title="Требуется роль: ' + nextStep.role + '"') + '>' +
              '▶ ' + escHtml(nextStep.action) +
            '</button>' +
          '</div>'
        ) : '') +

      '</div>';
    });

    board += '<div class="kcol" id="kcol-' + col.id + '">' +
      '<div class="kcol-hdr" style="background:' + col.color + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px">' +
          '<span style="font-weight:700;display:flex;align-items:center;gap:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            col.icon + ' ' + col.label +
          '</span>' +
          '<div style="display:flex;align-items:center;gap:4px">' +
            '<span class="kcol-cnt-badge">' + colTasks.length.toLocaleString('ru') + '</span>' +
            '<button type="button" class="kcol-collapse-btn" onclick="event.stopPropagation(); toggleKanbanCol(\'' + col.id + '\')" title="Свернуть колонку в компактную полоску">—</button>' +
          '</div>' +
        '</div>' +
        '<div class="kcol-sum-line">' +
          '<span style="opacity:.85">Объем:</span>' +
          '<span style="font-weight:700">' + fmtMoney(colAmt) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="kcol-desc-line" title="' + escHtml(col.desc) + '">' +
        '<b>' + col.processRange + ':</b> ' + escHtml(col.desc) +
      '</div>' +
      '<div class="kcol-cards" ' +
        'ondragover="kanbanColDragOver(event)" ' +
        'ondragleave="kanbanColDragLeave(event)" ' +
        'ondrop="kanbanColDrop(event, \'' + col.id + '\')">' +
        cards +
        (colTasks.length === 0 ? '<div style="text-align:center;padding:1.8rem .5rem;color:var(--text-3);font-size:.75rem;border:1px dashed var(--border);border-radius:6px;background:#fafafa">Нет объектов на этапе</div>' : '') +
        (colTasks.length > 80 ? '<div style="text-align:center;padding:6px;color:var(--text-3);font-size:.72rem">... и ещё ' + (colTasks.length - 80) + '</div>' : '') +
      '</div>' +
    '</div>';
  });

  // Быстрые фильтры chips
  var isAllActive = !quick || quick === 'all';
  var isTodayActive = quick === 'today';
  var isOvdActive = quick === 'overdue';
  var isRemActive = quick === 'remarks';
  var isMineActive = quick === 'mine';

  var quickFiltersHtml = '<div style="display:flex;gap:.4rem;align-items:center;margin-bottom:.45rem;flex-wrap:wrap">' +
    '<button type="button" class="quick-filter-chip' + (isAllActive ? ' active' : '') + '" onclick="setKanbanQuick(\'all\')">Все объекты (' + S.tasks.filter(function(t){ return !t.archived; }).length + ')</button>' +
    '<button type="button" class="quick-filter-chip' + (isTodayActive ? ' active' : '') + '" onclick="setKanbanQuick(\'today\')">📥 Новые сегодня (' + todayCount + ')</button>' +
    '<button type="button" class="quick-filter-chip' + (isOvdActive ? ' active' : '') + '" onclick="setKanbanQuick(\'overdue\')">⏳ С просрочкой (' + S.tasks.filter(function(t){ return !t.archived && (t.overdueDays > 0 || (t.stageDue && new Date(t.stageDue) < new Date())); }).length + ')</button>' +
    '<button type="button" class="quick-filter-chip' + (isRemActive ? ' active' : '') + '" onclick="setKanbanQuick(\'remarks\')">⚠️ С замечаниями (' + S.tasks.filter(function(t){ return !t.archived && Number(t.openRemarksCount || 0) > 0; }).length + ')</button>' +
    '<button type="button" class="quick-filter-chip' + (isMineActive ? ' active' : '') + '" onclick="setKanbanQuick(\'mine\')">👤 Мои объекты</button>' +
  '</div>';

  // Сводная информационная плашка
  var summaryHtml = '<div class="kanban-summary" style="margin-bottom:.4rem;padding:6px 12px">' +
    '<div class="kanban-summary-item">📋 Показано: <span class="kanban-summary-val">' + filtered.length + ' объектов</span></div>' +
    '<div class="kanban-summary-item">💰 Общий объем: <span class="kanban-summary-val" style="color:var(--blue)">' + fmtMoney(totalAmount) + '</span></div>' +
    (totalOverdue > 0 ? '<div class="kanban-summary-item" style="color:var(--red)">⏳ Нарушен срок: <span class="kanban-summary-val" style="color:var(--red)">' + totalOverdue + '</span></div>' : '') +
    (totalRemarks > 0 ? '<div class="kanban-summary-item" style="color:var(--orange-dark)">⚠️ Замечаний: <span class="kanban-summary-val" style="color:var(--orange-dark)">' + totalRemarks + '</span></div>' : '') +
  '</div>';

  // Фазовые вкладки (10 этапов разбиты по 4 фазам)
  var phaseTabsHtml = '<div class="kanban-phase-tabs">' +
    KANBAN_PHASES.map(function(ph) {
      var isActive = ph.id === curPhase;
      var count = phaseCounts[ph.id] || 0;
      return '<button type="button" class="kanban-phase-btn' + (isActive ? ' active' : '') + '" onclick="setKanbanPhase(\'' + ph.id + '\')">' +
        '<span>' + escHtml(ph.label) + '</span>' +
        '<span class="kanban-phase-cnt">' + count.toLocaleString('ru') + '</span>' +
      '</button>';
    }).join('') +
  '</div>';

  // Кнопка свернуть пустые колонки и кнопки скролла
  var collapseToggleBtn = emptyColsCount > 0
    ? ('<button type="button" class="btn btn-sm btn-ghost" style="font-size:.74rem;padding:3px 8px;border:1px solid var(--border);background:#fff" onclick="toggleAutoCollapseEmpty()" title="' + (S.kanbanAutoCollapseEmpty ? 'Развернуть все пустые колонки' : 'Свернуть пустые колонки с 0 заявок') + '">' +
        (S.kanbanAutoCollapseEmpty ? '⊞ Развернуть пустые' : '↕ Свернуть пустые (' + emptyColsCount + ')') +
      '</button>')
    : '';

  var scrollButtonsHtml = '<div style="display:flex;gap:3px;align-items:center">' +
    '<button type="button" class="btn btn-sm btn-ghost" style="padding:3px 8px;font-size:.74rem;border:1px solid var(--border);background:#fff" onclick="scrollKanban(-320)" title="Прокрутить доску влево (или используйте Shift+колесико мыши)">◀</button>' +
    '<button type="button" class="btn btn-sm btn-ghost" style="padding:3px 8px;font-size:.74rem;border:1px solid var(--border);background:#fff" onclick="scrollKanban(320)" title="Прокрутить доску вправо (или используйте Shift+колесико мыши)">▶</button>' +
  '</div>';

  var kanbanClass = 'kanban' + (curPhase !== 'all' ? ' phase-focused' : '');

  return '<div class="kanban-top-section">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.4rem">' +
        '<div style="display:flex;align-items:center;gap:.65rem;flex-wrap:wrap">' +
          '<h1 class="page-title" style="margin-bottom:0;font-size:1.15rem">Канбан</h1>' +
          phaseTabsHtml +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          collapseToggleBtn +
          scrollButtonsHtml +
        '</div>' +
      '</div>' +
      quickFiltersHtml +
      '<div style="display:flex;flex-wrap:wrap;gap:.4rem;align-items:center">' +
        '<input id="kq" type="text" placeholder="Поиск по ID, адресу, исполнителю..." style="flex:2;min-width:180px" value="' + escHtml(S.kanbanQ || '') + '">' +
        '<select id="kreg"><option value="">Все регионы (' + regions.length + ')</option>' + mkOpts(regions, reg) + '</select>' +
        '<select id="kmgr"><option value="">Все менеджеры (' + managers.length + ')</option>' + mkOpts(managers, mgr) + '</select>' +
        '<select id="kcust"><option value="">Все заказчики (' + customers.length + ')</option>' + mkOpts(customers, cust) + '</select>' +
        (q || reg || mgr || cust || quick !== 'all' ? '<button class="btn btn-sm btn-ghost" onclick="clearKanbanFilters()">✕ Сбросить</button>' : '') +
        '<input id="ntask" type="text" placeholder="Быстрая заявка…" style="flex:1;min-width:140px;max-width:200px">' +
        '<button class="btn btn-sm" id="addBtn">+ Добавить</button>' +
      '</div>' +
      summaryHtml +
    '</div>' +
    '<div class="' + kanbanClass + '">' + board + '</div>';
}