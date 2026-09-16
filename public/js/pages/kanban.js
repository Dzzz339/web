function clearKanbanFilters() {
  S.kanbanQ = '';
  S.kanbanReg = '';
  S.kanbanMgr = '';
  S.kanbanCustomer = '';
  renderApp();
}

function pageKanban() {
  var q = (S.kanbanQ || '').toLowerCase().trim();
  var reg = S.kanbanReg || '';
  var mgr = S.kanbanMgr || '';
  var cust = S.kanbanCustomer || '';

  var regions = Array.from(new Set(S.tasks.map(function(t){ return t.region; }).filter(Boolean))).sort();
  var managers = Array.from(new Set(S.tasks.map(function(t){ return t.manager; }).filter(Boolean))).sort();
  var customers = Array.from(new Set(S.tasks.map(function(t){ return t.customer || 'ПАО Сбербанк'; }).filter(Boolean))).sort();

  function mkOpts(arr, cur) {
    return arr.map(function(v) {
      var safe = v.replace(/"/g, '&quot;');
      return '<option value="' + safe + '"' + (cur === v ? ' selected' : '') + '>' + v + '</option>';
    }).join('');
  }

  var cols = [
    { id: 'montage',  label: '1. Монтаж на объекте', cls: 'c-install',    desc: 'Стадии 0..2 (Монтаж и сбор фото)', stages: [0, 1, 2] },
    { id: 'queue',    label: '2. Очередь ИД',        cls: 'c-survey',     desc: 'Стадия 3 (Материалы переданы)',    stages: [3] },
    { id: 'design',   label: '3. Проектирование',    cls: 'c-control',    desc: 'Стадия 4 (Срок 3 раб. дня)',       stages: [4] },
    { id: 'sber',     label: '4. В Сбере на приёмке',cls: 'c-acceptance', desc: 'Стадии 5..6 (Согласование альбома)', stages: [5, 6] },
    { id: 'payment',  label: '5. Оплата и счета',    cls: 'c-payment',    desc: 'Стадии 7..8 (Бухгалтерия)',        stages: [7, 8] },
    { id: 'done',     label: '6. Завершена',         cls: 'c-request',    desc: 'Стадия 9 (ИД сдана, оплачено)',    stages: [9] }
  ];

  var filtered = S.tasks.filter(function(t) {
    if (t.archived) return false;
    if (reg && t.region !== reg) return false;
    if (mgr && t.manager !== mgr) return false;
    if (cust && (t.customer || 'ПАО Сбербанк') !== cust) return false;
    if (q) {
      var content = ((t.id || '') + ' ' + (t.address || '') + ' ' + (t.contractor || '') + ' ' + (t.assignee || '') + ' ' + (t.customer || '')).toLowerCase();
      if (!content.includes(q)) return false;
    }
    return true;
  });

  var board = '';
  cols.forEach(function(col) {
    var colTasks = filtered.filter(function(t){ 
      var sn = Number(t.stageNum != null ? t.stageNum : 0);
      return col.stages.includes(sn);
    });
    var colAmt = colTasks.reduce(function(sum, t){ return sum + Number(t.amount || 0); }, 0);

    var cards = '';
    colTasks.slice(0, 60).forEach(function(t) {
      var tid = (t.id || '').replace(/'/g, "\\'");
      var fin = getTaskFinance(t);
      var sn = Number(t.stageNum != null ? t.stageNum : 0);
      var nextStep = sn < 9 ? ID_STEPS[sn] : null;
      var canStep = canUserStep(S.user, t);
      var canUndo = canUserUndo(S.user, t) && sn > 0;
      var openRem = Number(t.openRemarksCount || 0);

      var dueBadge = '';
      if (t.stageDue) {
        var isOvd = new Date(t.stageDue) < new Date();
        dueBadge = '<span class="badge ' + (isOvd ? 'b-red' : 'b-survey') + '" style="font-size:.65rem;padding:1px 5px">' +
          '⏳ ' + t.stageDue.slice(5, 10).split('-').reverse().join('.') + (isOvd ? ' !' : '') +
        '</span>';
      }

      cards += '<div class="kcard" onclick="openCard(\'' + tid + '\')" style="cursor:pointer">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
          '<div style="display:flex;align-items:center;gap:4px">' +
            '<span style="font-weight:700;color:var(--orange);font-size:.82rem">№ ' + escHtml(t.id) + '</span>' +
            (openRem > 0 ? '<span class="badge b-red" style="font-size:.65rem;padding:1px 5px" title="Замечания Сбера">⚠️ ' + openRem + '</span>' : '') +
          '</div>' +
          prBadge(t.priority) +
        '</div>' +
        '<div class="kcard-title" style="font-size:.78rem;margin-bottom:4px;line-height:1.25">' + escHtml(t.address || t.title || 'Без адреса') + '</div>' +
        '<div style="font-size:.72rem;color:var(--text-3);margin-bottom:4px;display:flex;justify-content:space-between;align-items:center">' +
          '<span>📍 ' + escHtml(t.region || '—') + '</span>' +
          (t.overdueDays > 0 ? '<span style="color:var(--red);font-weight:700">+' + t.overdueDays + ' дн</span>' : dueBadge) +
        '</div>' +
        '<div style="font-size:.72rem;color:var(--text-2);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
          '👤 ' + escHtml(t.assignee || t.contractor || 'Не назначен') +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;font-size:.74rem;border-top:1px dashed var(--border);padding-top:4px;margin-top:4px">' +
          '<span style="font-weight:600">Порты: ' + (t.fact || 0) + ' / ' + (t.inOrder || 0) + '</span>' +
          '<span style="font-weight:700;color:var(--blue)">' + fmtMoney(fin.total) + '</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-top:6px" onclick="event.stopPropagation()">' +
          idStageBadge(sn) +
          '<div style="display:flex;gap:3px;align-items:center">' +
            (canUndo ? '<button class="btn btn-xs btn-ghost" onclick="undoIdStep(\'' + tid + '\')" title="Откатить шаг назад" style="padding:2px 5px;font-size:.72rem">↩</button>' : '') +
            (nextStep ? '<button class="btn btn-xs ' + (canStep ? '' : 'disabled') + '" onclick="advanceIdStep(\'' + tid + '\')" ' + (canStep ? '' : 'title="Требуется роль: ' + nextStep.role + '"') + ' style="padding:2px 7px;font-size:.7rem;font-weight:700;background:var(--orange);color:#fff;border:none">▶ ' + nextStep.action + '</button>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    });

    board += '<div class="kcol" style="min-width:240px;max-width:280px;flex:1">' +
      '<div class="kcol-hdr ' + col.cls + '" style="display:flex;justify-content:space-between;align-items:center">' +
        '<span>' + col.label + ' (' + colTasks.length + ')</span>' +
        '<span style="font-size:.68rem;opacity:.9;font-weight:600">' + fmtMoney(colAmt) + '</span>' +
      '</div>' +
      '<div style="font-size:.7rem;color:var(--text-3);margin:-.4rem 0 .5rem 2px">' + col.desc + '</div>' +
      cards +
      (colTasks.length === 0 ? '<div style="text-align:center;padding:1.5rem .5rem;color:var(--text-3);font-size:.75rem;border:1px dashed var(--border);border-radius:6px;background:#fafafa">Нет заявок</div>' : '') +
      (colTasks.length > 60 ? '<div style="text-align:center;padding:6px;color:var(--text-3);font-size:.72rem">... и ещё ' + (colTasks.length - 60) + '</div>' : '') +
    '</div>';
  });

  return '<h1 class="page-title">Канбан — Жизненный цикл ИД</h1>' +
    '<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1rem;align-items:center">' +
      '<input id="kq" type="text" placeholder="Поиск в канбане..." style="flex:2;min-width:170px" value="' + escHtml(S.kanbanQ || '') + '">' +
      '<select id="kreg"><option value="">Все регионы</option>' + mkOpts(regions, reg) + '</select>' +
      '<select id="kmgr"><option value="">Все менеджеры</option>' + mkOpts(managers, mgr) + '</select>' +
      '<select id="kcust"><option value="">Все заказчики</option>' + mkOpts(customers, cust) + '</select>' +
      (q || reg || mgr || cust ? '<button class="btn btn-sm btn-ghost" onclick="clearKanbanFilters()">✕ Сбросить</button>' : '') +
      '<input id="ntask" type="text" placeholder="Быстрая заявка…" style="flex:1;min-width:140px;max-width:220px">' +
      '<button class="btn btn-sm" id="addBtn">+ Добавить</button>' +
    '</div>' +
    '<div class="kanban" style="display:flex;gap:.8rem;overflow-x:auto;padding-bottom:1rem;align-items:flex-start">' + board + '</div>';
}


function moveTask(id, stage) {
  alert('Перемещение заявки выполняется строго по регламентным шагам жизненного цикла через кнопку «▶ Шаг» на карточке.');
}

function setTaskStage(newStage) {
  moveTask(S.cardId, newStage);
}

var contractorSearchTimeout = null;

// Обработка ввода в поисковую строку