function clearFilters() {
  S.taskQ=''; S.taskSt=''; S.taskPr=''; S.taskReg=''; S.taskMgr=''; S.taskYear=''; S.taskOverdue='';
  S.taskCustomer=''; S.taskContractor=''; S.taskDistanceFilter='';
  S.taskArch='no'; S.taskStage=''; S.taskSort=''; S.taskView='all'; // Сбрасываем фильтры
  renderApp();
}

function toggleTasksFilters() {
  S.tasksFiltersOpen = !S.tasksFiltersOpen;
  renderApp();
}

function applyTasksFilters() {
  var v = function(id) { var el = document.getElementById(id); return el ? el.value : ''; };
  S.taskReg = v('treg');
  S.taskCustomer = v('tcust');
  S.taskMgr = v('tmgr');
  S.taskStage = v('tstage');
  S.taskSt = v('tst');
  S.taskPr = v('tpr');
  S.taskOverdue = v('tovd');
  S.taskYear = v('tyr');
  S.taskContractor = v('tcontr');
  S.taskDistanceFilter = v('tdist');
  S.taskSort = v('tsort');
  S.taskArch = v('tarch') || 'no';
  var qEl = document.getElementById('tq');
  if (qEl) S.taskQ = qEl.value.trim();
  S.tasksFiltersOpen = false;
  renderApp();
}

function removeTaskFilter(key) {
  if (key === 'reg') S.taskReg = '';
  else if (key === 'cust') S.taskCustomer = '';
  else if (key === 'mgr') S.taskMgr = '';
  else if (key === 'stage') S.taskStage = '';
  else if (key === 'st') S.taskSt = '';
  else if (key === 'pr') S.taskPr = '';
  else if (key === 'ovd') S.taskOverdue = '';
  else if (key === 'dist') S.taskDistanceFilter = '';
  else if (key === 'contr') S.taskContractor = '';
  else if (key === 'yr') S.taskYear = '';
  else if (key === 'arch') S.taskArch = 'no';
  else if (key === 'sort') S.taskSort = '';
  renderApp();
}

function setTaskFinanceMode(mode) {
  S.taskFinanceMode = mode;
  renderApp();
}

function setTaskDistanceFilter(val) {
  S.taskDistanceFilter = val;
  renderApp();
}

function setTaskViewFilter(view) {
  S.taskView = view;
  renderApp();
}

function setTaskStageFilter(stg) {
  S.taskStage = stg;
  renderApp();
}

function statBox(lbl, val, sub, color) {
  return '<div style="text-align:center">' +
    '<div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-3)">' + lbl + '</div>' +
    '<div style="font-size:1.05rem;font-weight:700;' + (color ? 'color:' + color + ';' : '') + '">' + val + '</div>' +
    (sub ? '<div style="font-size:.7rem;color:var(--text-3)">' + sub + '</div>' : '') +
  '</div>';
}

function pageTasks() {
  var q=S.taskQ, st=S.taskSt, pr=S.taskPr, reg=S.taskReg, mgr=S.taskMgr, yr=S.taskYear, ovd=S.taskOverdue, cust=S.taskCustomer, contr=S.taskContractor, distFilter=S.taskDistanceFilter;
  var isWorker = S.user && (S.user.role === 'worker' || S.user.role === 'contractor');
  var finMode = isWorker ? 'contractor' : (S.taskFinanceMode || 'customer');
  
  // 1. Фильтрация
  var filtered = S.tasks.filter(function(t) {
    // УМНЫЙ ПОИСК
    if (q) {
      var cleanQ = q.toLowerCase().replace(/[,;.]/g, ' ');
      var searchWords = cleanQ.split(/\s+/).filter(Boolean);
      // Собираем всё содержимое строки в одну кучу для поиска
      var content = (
        (t.id || '') + ' ' + 
        (t.title || '') + ' ' + 
        (t.region || '') + ' ' + 
        (t.address || '') + ' ' + 
        (t.manager || '') + ' ' +
        (t.customer || '') + ' ' +
        (t.contractor || '') + ' ' +
        (t.assignee || '') + ' ' +
        (t.contact || '') + ' ' +
        (t.workType || '') + ' ' +
        (t.vsp || '') + ' ' +
        (t.gosb || '') + ' ' +
        (t.deadline || '') + ' ' +
        (t.dateZayavki || '')
      ).toLowerCase();

      // Проверяем, что КАЖДОЕ слово из поиска есть в этой строке
      var isMatch = searchWords.every(function(word) {
        return content.indexOf(word) !== -1;
      });
      if (!isMatch) return false;
    }

    // Фильтр по Контрагенту / Исполнителю
    if (contr) {
      var tContr = (t.contractor || '').trim().toLowerCase();
      var tAssign = (t.assignee || '').trim().toLowerCase();
      var targetContr = contr.trim().toLowerCase();
      if (targetContr === 'не назначен') {
        if (tContr || tAssign) return false;
      } else {
        if (tContr !== targetContr && tAssign !== targetContr && !tContr.includes(targetContr) && !tAssign.includes(targetContr)) {
          return false;
        }
      }
    }

    // Фильтр по удаленности (транспортные расходы)
    if (distFilter) {
      var dKm = Number(t.distanceKm || 0);
      if (distFilter === 'has' && !(dKm > 0)) return false;
      if (distFilter === 'none' && dKm > 0) return false;
      if (distFilter === 'gt5k' && !(dKm >= 5000)) return false;
      if (distFilter === 'gt10k' && !(dKm >= 10000)) return false;
    }

    // Остальные фильтры (статус, приоритет и т.д. — оставляем как было)
    if (st  && t.status   !== st)  return false;
    if (pr  && t.priority !== pr)  return false;
    if (reg && t.region   !== reg) return false;
    if (mgr && t.manager  !== mgr) return false;
    if (yr  && t.sheet    !== yr)  return false;
    if (cust && (t.customer || 'ПАО Сбербанк') !== cust) return false;
    if (ovd==='yes' && !(t.overdueDays>0)) return false;
    if (ovd==='no'  && t.overdueDays>0)    return false;
    if (S.taskArch === 'no' && t.archived) return false;
    if (S.taskStage && t.stage !== S.taskStage) return false;
    if (S.taskView === 'montage' && (t.stageNum != null && t.stageNum > 2)) return false;
    if (S.taskView === 'id_queue' && t.stageNum !== 3) return false;
    if (S.taskView === 'design' && t.stageNum !== 4) return false;
    if (S.taskView === 'sber' && (t.stageNum !== 5 && t.stageNum !== 6)) return false;
    if (S.taskView === 'remarks' && !(Number(t.openRemarksCount) > 0)) return false;
    if (S.taskView === 'payment' && (t.stageNum !== 7 && t.stageNum !== 8)) return false;
    if (S.taskView === 'done' && t.stageNum !== 9) return false;
    if (S.user.role === 'worker' && t.assignmentStatus === 'pending') return false;

    return true;
  });

  // 2. Расчеты (добавляем Number() для защиты от склеивания строк)
  var sumAll     = filtered.reduce(function(s,t){ return s + Number(t.amount || 0); }, 0);
  var sumDone    = filtered.filter(function(t){return t.status==='done';}).reduce(function(s,t){ return s + Number(t.amount || 0); }, 0);
  var sumAct     = filtered.filter(function(t){return t.status==='progress';}).reduce(function(s,t){ return s + Number(t.amount || 0); }, 0);
  
  var cntOvd     = filtered.filter(function(t){return t.overdueDays > 0;}).length;
  
  var portsDone  = filtered.filter(function(t){return t.status==='done';}).reduce(function(s,t){return s + Number(t.fact || 0);}, 0);
  var portsTotal = filtered.reduce(function(s,t){return s + Number(t.inOrder || 0);}, 0);
  
  // Остаток портов (тоже через Number)
  var portBalance = filtered.reduce(function(acc, t) {
    var order = Number(t.inOrder || 0);
    var fact = Number(t.fact || 0);
    return acc + (order - fact);
  }, 0);

  var regions   = Array.from(new Set(S.tasks.map(function(t){return t.region||'';}).filter(Boolean))).sort();
  var managers  = Array.from(new Set(S.tasks.map(function(t){return t.manager||'';}).filter(Boolean))).sort();
  var customers = Array.from(new Set(S.tasks.map(function(t){return t.customer||'ПАО Сбербанк';}).filter(Boolean))).sort();
  var years     = Array.from(new Set(S.tasks.map(function(t){return t.sheet||'';}).filter(Boolean))).sort();

  var contractorSet = new Set();
  var hasUnassignedContr = false;
  S.tasks.forEach(function(t) {
    var c = (t.contractor || '').trim();
    var a = (t.assignee || '').trim();
    if (c) contractorSet.add(c);
    if (a) contractorSet.add(a);
    if (!c && !a) hasUnassignedContr = true;
  });
  var contractors = Array.from(contractorSet).sort();
  if (hasUnassignedContr) contractors.push('Не назначен');

  // Сортировка — dateZayavki хранится в YYYY-MM-DD, localeCompare даёт правильный порядок
  if (S.taskSort) {
    filtered = filtered.slice().sort(function(a, b) {
      var da = a.dateZayavki || '';
      var db = b.dateZayavki || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return S.taskSort === 'date_asc' ? da.localeCompare(db) : db.localeCompare(da);
    });
  }
  
  function mkOpts(arr,cur){return arr.map(function(v){
    var safe=v.replace(/"/g,'&quot;');
    return '<option value="'+safe+'"'+(cur===v?' selected':'')+'>'+v+'</option>';
  }).join('');}

  // Сбор активных фильтров для бейджа и чипсов
  var activeFilters = [];
  if (reg) activeFilters.push({ key: 'reg', label: '📍 ' + reg });
  if (cust) activeFilters.push({ key: 'cust', label: '🏛️ ' + cust });
  if (mgr) activeFilters.push({ key: 'mgr', label: '👔 ' + mgr });
  if (S.taskStage) {
    var stageLabels = {
      'new': '📥 Новые (за сегодня)',
      'review': '🔍 На проверке ТЗ',
      'rejected': '⛔ Отклонены',
      'in_progress': '🤝 Поиск подрядчика',
      'assigned': '📋 Назначено / ТМЦ',
      'install': '🔧 В монтаже',
      'smr_done': '🏁 СМР выполнено',
      'id_in_progress': '📐 ИД в разработке',
      'accepted': '🏛️ На приёмке',
      'billing': '💳 На оплате',
      'paid': '💰 Оплачено',
      'request': 'Заявка',
      'survey': 'Обследование',
      'control': 'Контроль'
    };
    activeFilters.push({ key: 'stage', label: '📋 ' + (stageLabels[S.taskStage] || S.taskStage) });
  }
  if (st) {
    var stLabels = { 'pending': 'Не распределено', 'progress': 'В работе', 'done': 'Готово', 'paid': 'Оплачен', 'cancelled': 'Отменен' };
    activeFilters.push({ key: 'st', label: 'Статус: ' + (stLabels[st] || st) });
  }
  if (pr) {
    var prLabels = { 'high': '🔴 Высокий', 'medium': '🟡 Средний', 'low': '🟢 Низкий' };
    activeFilters.push({ key: 'pr', label: 'Приоритет: ' + (prLabels[pr] || pr) });
  }
  if (ovd === 'yes') activeFilters.push({ key: 'ovd', label: '⏳ С просрочкой' });
  if (ovd === 'no') activeFilters.push({ key: 'ovd', label: '✓ Без просрочки' });
  if (distFilter === 'has') activeFilters.push({ key: 'dist', label: '🚗 С удаленностью' });
  if (distFilter === 'none') activeFilters.push({ key: 'dist', label: '🏢 Без удаленности' });
  if (distFilter === 'gt5k') activeFilters.push({ key: 'dist', label: '💰 Удаленность > 5 000 ₽' });
  if (distFilter === 'gt10k') activeFilters.push({ key: 'dist', label: '💰 Удаленность > 10 000 ₽' });
  if (contr) activeFilters.push({ key: 'contr', label: '👤 ' + contr });
  if (yr) activeFilters.push({ key: 'yr', label: '📅 ' + yr });
  if (S.taskArch === 'yes') activeFilters.push({ key: 'arch', label: '📦 Архив' });
  if (S.taskSort === 'date_desc') activeFilters.push({ key: 'sort', label: '↓ Свежие сначала' });
  if (S.taskSort === 'date_asc') activeFilters.push({ key: 'sort', label: '↑ Старые сначала' });

  var activeCount = activeFilters.length;
  var hasFilter = activeCount > 0 || !!q;

  var sumTransportAll = filtered.reduce(function(s,t){ return s + Number(t.distanceKm || 0); }, 0);
  var sumContAll = filtered.reduce(function(s, t) { return s + getTaskContractorFinance(t).total; }, 0);
  var sumContPaid = filtered.filter(function(t) { return getTaskContractorFinance(t).isPaid; }).reduce(function(s, t) { return s + getTaskContractorFinance(t).total; }, 0);
  var sumContPending = Math.max(0, sumContAll - sumContPaid);
  var sumContTransport = filtered.reduce(function(s, t) { return s + getTaskContractorFinance(t).transport; }, 0);
  var sumMargin = sumAll - sumContAll;
  var marginPct = sumAll > 0 ? Math.round(sumMargin / sumAll * 100) : 0;

  var modeSwitcher = isWorker ? '' : '<div style="display:flex;align-items:center;gap:4px;background:#f1f5f9;padding:3px 4px;border-radius:8px;border:1px solid var(--border)">' +
    '<button type="button" class="btn btn-sm ' + (finMode === 'customer' ? 'btn-primary' : 'btn-ghost') + '" onclick="setTaskFinanceMode(\'customer\')" style="font-size:.78rem;padding:4px 12px;height:auto">🏦 Заказчик (Сбер)</button>' +
    '<button type="button" class="btn btn-sm ' + (finMode === 'contractor' ? 'btn-primary' : 'btn-ghost') + '" onclick="setTaskFinanceMode(\'contractor\')" style="font-size:.78rem;padding:4px 12px;height:auto">🤝 Подрядчики</button>' +
  '</div>';

  var topControls = '<div style="display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:.65rem;align-items:center;justify-content:space-between">' +
    '<div style="display:flex;flex:1;min-width:300px;gap:.45rem;align-items:center">' +
      '<input id="tq" type="text" placeholder="🔍 Поиск по номеру, адресу, исполнителю..." style="flex:1;min-width:200px;height:36px" value="' + escHtml(q) + '">' +
      '<button type="button" class="btn btn-sm ' + (S.tasksFiltersOpen ? 'btn-primary' : (activeCount > 0 ? 'btn-secondary' : 'btn-ghost')) + '" onclick="toggleTasksFilters()" style="display:inline-flex;align-items:center;gap:6px;height:36px;white-space:nowrap;padding:0 12px">' +
        '⚙️ Фильтры' + (activeCount > 0 ? ' <span class="badge ' + (S.tasksFiltersOpen ? 'b-white' : 'b-blue') + '" style="font-size:.7rem;padding:2px 7px">' + activeCount + '</span>' : '') + ' ' + (S.tasksFiltersOpen ? '▴' : '▾') +
      '</button>' +
      (hasFilter ? '<button type="button" class="btn btn-sm btn-ghost" onclick="clearFilters()" title="Сбросить все фильтры" style="height:36px">✕ Сброс</button>' : '') +
    '</div>' +
    modeSwitcher +
  '</div>';

  var filtersPanelHtml = S.tasksFiltersOpen
    ? ('<div class="card p-3 mb-3" style="background:#f8fafc;border:1.5px solid var(--border);border-radius:10px;margin-bottom:1rem;padding:14px 18px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:8px">' +
          '<span style="font-weight:700;font-size:.85rem;color:var(--text);display:flex;align-items:center;gap:6px">' +
            '⚙️ Параметры отбора заявок' +
            (activeCount > 0 ? ' <span class="badge b-blue" style="font-size:.7rem;padding:2px 7px">' + activeCount + ' акт.</span>' : '') +
          '</span>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="toggleTasksFilters()">Свернуть ▴</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px">' +
          // Группа 1: География и Заказчик
          '<div style="display:flex;flex-direction:column;gap:8px">' +
            '<div style="font-size:.7rem;font-weight:700;text-transform:uppercase;color:var(--text-3);letter-spacing:.3px">📍 География и Заказчик</div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Заказчик</label><select id="tcust" style="width:100%"><option value="">Все заказчики</option>' + mkOpts(customers, cust) + '</select></div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Регион</label><select id="treg" style="width:100%"><option value="">Все регионы</option>' + mkOpts(regions, reg) + '</select></div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Менеджер Заказчика</label><select id="tmgr" style="width:100%"><option value="">Все менеджеры</option>' + mkOpts(managers, mgr) + '</select></div>' +
          '</div>' +
          // Группа 2: Статусы и Сроки
          '<div style="display:flex;flex-direction:column;gap:8px">' +
            '<div style="font-size:.7rem;font-weight:700;text-transform:uppercase;color:var(--text-3);letter-spacing:.3px">⏱️ Статусы и Сроки</div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Процесс / Этап регламента</label>' +
              '<select id="tstage" style="width:100%">' +
                '<option value="">Все этапы (любой)</option>' +
                '<option value="new"' + (S.taskStage==='new'?' selected':'') + '>📥 1. Новые (за сегодня)</option>' +
                '<option value="review"' + (S.taskStage==='review'?' selected':'') + '>🔍 2. На проверке ТЗ</option>' +
                '<option value="rejected"' + (S.taskStage==='rejected'?' selected':'') + '>⛔ 3. Отклонены / Доработка</option>' +
                '<option value="in_progress"' + (S.taskStage==='in_progress'?' selected':'') + '>🤝 4. В поиске подрядчика</option>' +
                '<option value="assigned"' + (S.taskStage==='assigned'?' selected':'') + '>📋 5. Назначено / ТМЦ</option>' +
                '<option value="install"' + (S.taskStage==='install'?' selected':'') + '>🔧 6. В монтаже (СМР)</option>' +
                '<option value="smr_done"' + (S.taskStage==='smr_done'?' selected':'') + '>🏁 7. СМР выполнено</option>' +
                '<option value="id_in_progress"' + (S.taskStage==='id_in_progress'?' selected':'') + '>📐 8. ИД в разработке</option>' +
                '<option value="accepted"' + (S.taskStage==='accepted'?' selected':'') + '>🏛️ 9. На приёмке Заказчиком</option>' +
                '<option value="billing"' + (S.taskStage==='billing'?' selected':'') + '>💳 10. На оплате</option>' +
                '<option value="paid"' + (S.taskStage==='paid'?' selected':'') + '>💰 11. Оплачено и закрыто</option>' +
              '</select>' +
            '</div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Статус задачи</label>' +
              '<select id="tst" style="width:100%">' +
                '<option value="">Все статусы</option>' +
                '<option value="pending"' + (st==='pending'?' selected':'') + '>Не распределено</option>' +
                '<option value="progress"' + (st==='progress'?' selected':'') + '>В работе</option>' +
                '<option value="done"' + (st==='done'?' selected':'') + '>Готово</option>' +
                '<option value="paid"' + (st==='paid'?' selected':'') + '>Оплачен</option>' +
                '<option value="cancelled"' + (st==='cancelled'?' selected':'') + '>Отменен</option>' +
              '</select>' +
            '</div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Соблюдение сроков</label>' +
              '<select id="tovd" style="width:100%">' +
                '<option value="">Любой срок</option>' +
                '<option value="yes"' + (ovd==='yes'?' selected':'') + '>⛔ С просрочкой</option>' +
                '<option value="no"' + (ovd==='no'?' selected':'') + '>✓ Без просрочки</option>' +
              '</select>' +
            '</div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Год / Лист импорта</label><select id="tyr" style="width:100%"><option value="">Все годы / листы</option>' + mkOpts(years, yr) + '</select></div>' +
          '</div>' +
          // Группа 3: Исполнители и Экономика
          '<div style="display:flex;flex-direction:column;gap:8px">' +
            '<div style="font-size:.7rem;font-weight:700;text-transform:uppercase;color:var(--text-3);letter-spacing:.3px">👤 Исполнители и Экономика</div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Контрагент / Субподрядчик</label><select id="tcontr" style="width:100%"><option value="">Все контрагенты</option>' + mkOpts(contractors, contr) + '</select></div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Удаленность</label>' +
              '<select id="tdist" style="width:100%">' +
                '<option value="">Удаленность: Все</option>' +
                '<option value="has"' + (distFilter==='has'?' selected':'') + '>🚗 С удаленностью (&gt;0 ₽)</option>' +
                '<option value="none"' + (distFilter==='none'?' selected':'') + '>🏢 Без удаленности (0 ₽)</option>' +
                '<option value="gt5k"' + (distFilter==='gt5k'?' selected':'') + '>💰 Удаленность &gt; 5 000 ₽</option>' +
                '<option value="gt10k"' + (distFilter==='gt10k'?' selected':'') + '>💰 Удаленность &gt; 10 000 ₽</option>' +
              '</select>' +
            '</div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Приоритет</label>' +
              '<select id="tpr" style="width:100%">' +
                '<option value="">Все приоритеты</option>' +
                '<option value="high"' + (pr==='high'?' selected':'') + '>🔴 Высокий</option>' +
                '<option value="medium"' + (pr==='medium'?' selected':'') + '>🟡 Средний</option>' +
                '<option value="low"' + (pr==='low'?' selected':'') + '>🟢 Низкий</option>' +
              '</select>' +
            '</div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Сортировка</label>' +
              '<select id="tsort" style="width:100%">' +
                '<option value=""' + (S.taskSort===''?' selected':'') + '>Порядок по умолчанию</option>' +
                '<option value="date_desc"' + (S.taskSort==='date_desc'?' selected':'') + '>📅 Свежие сначала</option>' +
                '<option value="date_asc"' + (S.taskSort==='date_asc'?' selected':'') + '>📅 Старые сначала</option>' +
              '</select>' +
            '</div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Архив</label>' +
              '<select id="tarch" style="width:100%">' +
                '<option value="no"' + (S.taskArch==='no'?' selected':'') + '>Только активные</option>' +
                '<option value="yes"' + (S.taskArch==='yes'?' selected':'') + '>Архив</option>' +
                '<option value=""' + (S.taskArch===''?' selected':'') + '>Все (с архивом)</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // Нижняя панель действий
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;flex-wrap:wrap;gap:8px">' +
          '<div>' +
            (hasFilter ? '<button type="button" class="btn btn-sm btn-ghost" onclick="clearFilters()">✕ Сбросить все фильтры</button>' : '') +
          '</div>' +
          '<div style="display:flex;gap:8px;align-items:center">' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="toggleTasksFilters()">Свернуть</button>' +
            '<button type="button" class="btn btn-sm btn-primary" style="font-weight:700;padding:6px 22px" onclick="applyTasksFilters()">' +
              '🔍 Показать (' + fmtN(filtered.length) + ')' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>')
    : '';

  var chipsHtml = (activeFilters.length > 0)
    ? ('<div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;margin-bottom:.65rem">' +
        '<span style="font-size:.72rem;color:var(--text-3);font-weight:600">Активные фильтры:</span>' +
        activeFilters.map(function(af) {
          return '<span class="badge" style="background:#e0f2fe;color:#0369a1;padding:3px 8px;font-size:.74rem;display:inline-flex;align-items:center;gap:5px;border-radius:6px;border:1px solid #bae6fd">' +
            escHtml(af.label) +
            ' <button type="button" style="background:none;border:none;cursor:pointer;color:#0369a1;font-weight:700;padding:0 2px;line-height:1" onclick="removeTaskFilter(\'' + af.key + '\')" title="Снять фильтр">✕</button>' +
          '</span>';
        }).join('') +
        '<button type="button" class="btn-link" style="font-size:.74rem;margin-left:4px" onclick="clearFilters()">Сбросить всё</button>' +
      '</div>')
    : '';

  var totals = '<div class="card p mb" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.5rem;padding:.75rem 1rem">' +
    (finMode === 'customer'
      ? (statBox('Заявок', fmtN(filtered.length), 'из '+fmtN(S.tasks.length), 'var(--orange)') +
         statBox('Общая стоимость', fmtMoney(sumAll), 'с удаленкой', null) +
         statBox('Выполнено', fmtMoney(sumDone), null, 'var(--green)') +
         statBox('В работе', fmtMoney(sumAct), null, 'var(--orange)') +
         statBox('Удаленность', fmtMoney(sumTransportAll), 'транспорт всего', null) +
         statBox('Портов', fmtN(portsDone)+'/'+fmtN(portsTotal), null, null) +
         statBox('Остаток портов', fmtN(portBalance) + ' шт.', 'в заказе минус факт', portBalance > 0 ? 'var(--orange)' : 'var(--green)'))
      : (statBox('Заявок', fmtN(filtered.length), 'из '+fmtN(S.tasks.length), 'var(--orange)') +
         statBox('Общая подрядчикам', fmtMoney(sumContAll), null, null) +
         statBox('Выплачено', fmtMoney(sumContPaid), null, 'var(--green)') +
         statBox('К выплате', fmtMoney(sumContPending), null, 'var(--orange)') +
         statBox('Транспортные', fmtMoney(sumContTransport), 'подрядчикам', null) +
         statBox('Портов', fmtN(portsDone)+'/'+fmtN(portsTotal), null, null) +
         statBox('План. маржа', fmtMoney(sumMargin), (marginPct + '% от Сбера'), 'var(--green)'))
    ) +
  '</div>';

  var tableRows = '';
  filtered.slice(0, 300).forEach(function(t) {
    var tid = (t.id || '').replace(/'/g, "\\'");
    var fin = getTaskFinance(t);
    var cFin = getTaskContractorFinance(t);

    // 1. Номер + статус + маркер высокого приоритета
    var isHighPr = (t.priority === 'high');
    var prMark = isHighPr ? '<span title="Высокий приоритет" style="color:var(--red);font-size:.85rem;margin-right:3px">🔴</span>' : '';
    var stBdg = '<div style="margin-top:3px">' + stBadge(t.status) + (Number(t.openRemarksCount) > 0 ? ' <span class="badge b-red" style="font-size:.65rem;padding:1px 4px" title="Замечания">⚠️ ' + t.openRemarksCount + '</span>' : '') + '</div>';
    var colNumber = '<td style="vertical-align:top;white-space:nowrap">' +
      prMark + '<button class="btn-link" style="font-weight:700;font-size:.84rem" onclick="openCard(\'' + tid + '\')">⇒ ' + highlight(t.id, q) + '</button>' +
      stBdg +
    '</td>';

    // 2. Дата заявки
    var dateFormatted = t.dateZayavki ? t.dateZayavki.slice(0, 10).split('-').reverse().join('.') : '<span class="t3">—</span>';
    var colDate = '<td style="vertical-align:top;white-space:nowrap;color:var(--text-2);font-size:.8rem">' + dateFormatted + '</td>';

    // 3. Дедлайн + просрочка
    var dlDate = t.deadline ? t.deadline.slice(0, 10).split('-').reverse().join('.') : '';
    var odBadge = (t.overdueDays > 0)
      ? '<div style="color:var(--red);font-weight:700;font-size:.72rem">+' + t.overdueDays + ' дн</div>'
      : '';
    var dlHtml = dlDate ? ('<div style="font-weight:600">' + dlDate + '</div>' + odBadge) : (odBadge || '<span class="t3">—</span>');
    var colDeadline = '<td style="vertical-align:top;white-space:nowrap;font-size:.8rem">' + dlHtml + '</td>';

    // 4. Адрес объекта (вместо неинформативного региона)
    var addrText = t.address || t.title || '—';
    var colAddress = '<td style="vertical-align:top;min-width:240px;max-width:380px">' +
      '<div style="font-weight:600;color:var(--text);line-height:1.25;font-size:.82rem" title="' + escHtml(addrText) + '">' +
        highlight(addrText, q) +
      '</div>' +
      (t.vsp ? '<div class="t3" style="font-size:.7rem;margin-top:2px">№ ВСП: ' + escHtml(t.vsp) + '</div>' : '') +
    '</td>';

    // 5. Что делать (вид работ)
    var wt = t.workType || 'СКС';
    var colWork = '<td style="vertical-align:top;white-space:nowrap">' +
      '<span class="badge b-gray" style="font-size:.74rem;font-weight:600" title="' + escHtml(wt) + '">' + escHtml(wt) + '</span>' +
    '</td>';

    // 6. Сколько (порты: факт / в заказе)
    var factPorts = Number(t.fact || 0);
    var inOrderPorts = Number(t.inOrder || 0);
    var colQty = '<td style="vertical-align:top;white-space:nowrap;font-weight:700;font-size:.82rem">' +
      factPorts + ' / ' + inOrderPorts + ' <span class="t3" style="font-size:.68rem;font-weight:normal">портов</span>' +
    '</td>';

    // 7. Подрядчик / Исполнитель
    var colContr = '<td style="vertical-align:top">' +
      '<button class="btn-link" style="text-align:left;max-width:180px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8rem" onclick="openContractorPicker(\'' + tid + '\')" title="' + escHtml(t.contractor || 'Назначить подрядчика') + '">' +
        (t.contractor ? ('👤 ' + escHtml(t.contractor)) : '<span class="t3" style="border-bottom:1px dashed var(--orange);color:var(--orange)">+ Назначить</span>') +
      '</button>' +
    '</td>';

    // 8 & 9. Почём и За сколько
    var colPrice = '';
    var colTotal = '';

    if (finMode === 'customer') {
      // Почём Заказчик
      colPrice = '<td style="vertical-align:top;white-space:nowrap;color:var(--text-2);font-size:.8rem" title="Тариф Заказчика за единицу">' +
        (fin.unitPrice > 0 ? (fmtMoney(fin.unitPrice) + '<span class="t3" style="font-size:.68rem">/ед</span>') : '<span class="t3">—</span>') +
      '</td>';
      // За сколько Заказчик
      colTotal = '<td style="vertical-align:top;white-space:nowrap">' +
        '<div style="font-weight:700;color:var(--blue);font-size:.84rem" title="Общая сумма договора Сбера">' + fmtMoney(fin.total) + '</div>' +
        (fin.transport > 0 ? '<div class="t3" style="font-size:.68rem" title="Удаленность (транспорт)">🚗 +' + fmtMoney(fin.transport) + '</div>' : '') +
      '</td>';
    } else {
      // Почём Подрядчик
      colPrice = '<td style="vertical-align:top;white-space:nowrap;color:var(--text-2);font-size:.8rem" title="Ставка подрядчика за единицу">' +
        (cFin.unitPrice > 0 ? (fmtMoney(cFin.unitPrice) + '<span class="t3" style="font-size:.68rem">/ед</span>') : '<span class="t3">—</span>') +
      '</td>';
      // За сколько Подрядчик (+ маржа)
      var marginRow = fin.total > cFin.total ? (fin.total - cFin.total) : 0;
      var marginPctRow = fin.total > 0 ? Math.round(marginRow / fin.total * 100) : 0;
      colTotal = '<td style="vertical-align:top;white-space:nowrap">' +
        '<div style="font-weight:700;color:var(--orange-dark);font-size:.84rem" title="Сумма к выплате подрядчику">' + (cFin.total > 0 ? fmtMoney(cFin.total) : '<span class="t3">—</span>') + '</div>' +
        (cFin.transport > 0 ? '<div class="t3" style="font-size:.68rem" title="Транспортные расходы подрядчику">🚗 ' + fmtMoney(cFin.transport) + '</div>' : '') +
        (marginRow > 0 ? '<div style="font-size:.68rem;color:var(--green);font-weight:600" title="Плановая маржа ГК (Заказчик минус Подрядчик)">маржа +' + fmtMoney(marginRow) + ' (' + marginPctRow + '%)</div>' : '') +
      '</td>';
    }

    // 10. Действия
    var colActions = '<td style="vertical-align:top;text-align:right"><button class="btn btn-sm btn-ghost btn-icon" onclick="exportTask(\'' + tid + '\')" title="Экспорт заявки / печать">&#x2B07;</button></td>';

    tableRows += '<tr>' +
      colNumber +
      colDate +
      colDeadline +
      colAddress +
      colWork +
      colQty +
      colContr +
      colPrice +
      colTotal +
      colActions +
    '</tr>';
  });

  var more = filtered.length > 300
    ? '<tr><td colspan="10" style="text-align:center;padding:1rem;color:var(--text-3)">… ещё ' + (filtered.length - 300) + ' заявок — уточните фильтр</td></tr>'
    : '';

  return '<h1 class="page-title">Заявки</h1>' +
    topControls +
    filtersPanelHtml +
    chipsHtml +
    totals +
    '<div class="card tbl-wrap">' +
      '<table class="tasks-table"><thead><tr>' +
        '<th style="min-width:130px">Номер</th>' +
        '<th style="min-width:85px">Дата</th>' +
        '<th style="min-width:95px">Дедлайн</th>' +
        '<th style="min-width:240px">Адрес объекта</th>' +
        '<th style="min-width:90px">Что делать</th>' +
        '<th style="min-width:95px">Сколько</th>' +
        '<th style="min-width:140px">Подрядчик</th>' +
        (finMode === 'customer'
          ? '<th style="min-width:105px" title="Стоимость за единицу / объем работ">Почём (Сбер)</th><th style="min-width:135px" title="Итоговая сумма договора Сбера с удаленностью">За сколько</th>'
          : '<th style="min-width:105px" title="Ставка подрядчика за единицу">Почём (Подряд)</th><th style="min-width:150px" title="Общая сумма к выплате подрядчику и плановая маржа генподрядчика">За сколько</th>'
        ) +
        '<th style="width:40px"></th>' +
      '</tr></thead><tbody>' + tableRows + more + '</tbody></table>' +
    '</div>' +
    renderContractorPicker();
}

function renderContractorPicker() {
  if (!S.cpTaskId) return '';
  var t = S.tasks.find(function(x){ return String(x.id) === String(S.cpTaskId); });
  if (!t) return '';

  var body = '';
  if (S.cpMode === 'new') {
    body =
      '<div class="g2 mb">' +
        '<input id="pc_inn" type="text" placeholder="ИНН" oninput="onContractorSearchInput(this.value,\'pc\')">' +
        '<input id="pc_kpp" type="text" placeholder="КПП (если есть)">' +
      '</div>' +
      '<div style="position:relative">' +
        '<div id="pc_suggestions_box" style="display:none; position:absolute; top:0; left:0; right:0; background:#fff; border:1.5px solid var(--orange); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.15); z-index:700; max-height:250px; overflow-y:auto"></div>' +
      '</div>' +
      '<div class="mb"><input id="pc_name_short" type="text" placeholder="Краткое название (ИП / ООО)" oninput="onContractorSearchInput(this.value,\'pc\')"></div>' +
      '<div class="mb"><textarea id="pc_name_full" placeholder="Полное наименование" style="width:100%; resize:vertical; min-height:50px"></textarea></div>' +
      '<div class="mb"><input id="pc_director" type="text" placeholder="ФИО Руководителя"></div>' +
      '<div class="mb"><textarea id="pc_address" placeholder="Юридический адрес" style="width:100%; resize:vertical; min-height:50px"></textarea></div>' +
      '<div class="mb"><input id="pc_bank" type="text" placeholder="Название Банка" style="width:100%"></div>' +
      '<div class="row mb">' +
        '<input id="pc_bik" type="text" placeholder="БИК" style="flex:1">' +
        '<button class="btn btn-sm btn-ghost" onclick="fillBankFromDaData(\'pc\')">🔍 Найти по БИК</button>' +
      '</div>' +
      '<div class="mb"><input id="pc_acc_corr" type="text" placeholder="Корр. счет" style="width:100%"></div>' +
      '<div class="mb"><input id="pc_acc_pay" type="text" placeholder="Расчетный счет" style="width:100%"></div>' +
      '<div class="g2 mb">' +
        '<input id="pc_phone" type="text" placeholder="Телефон">' +
        '<input id="pc_email" type="text" placeholder="Email">' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem">' +
        '<button class="btn btn-sm btn-ghost" onclick="S.cpMode=\'search\';renderApp()">← Назад к поиску</button>' +
        '<span><span id="pc_status" style="margin-right:1rem;color:var(--text-3);font-size:.8rem"></span>' +
        '<button class="btn" onclick="addContractorFromPicker(\'' + S.cpTaskId.replace(/'/g,"\\'") + '\')">+ Сохранить и назначить</button></span>' +
      '</div>';
  } else {
    var qy = (S.cpQuery || '').toLowerCase();
    var matches = (S.contractors || []).filter(function(c) {
      if (!qy) return true;
      return (c.name_short||'').toLowerCase().indexOf(qy) !== -1 ||
             (c.name_full||'').toLowerCase().indexOf(qy) !== -1 ||
             (c.inn||'').toLowerCase().indexOf(qy) !== -1;
    }).slice(0, 30);

    var list = matches.length
      ? matches.map(function(c) {
          return '<div class="field-row" style="cursor:pointer" onclick="assignContractorToTask(\'' + S.cpTaskId.replace(/'/g,"\\'") + '\',\'' + (c.name_short||'').replace(/'/g,"\\'") + '\')">' +
            '<div class="field-lbl">' + escHtml(c.name_short) + '</div>' +
            '<div class="field-val t3">ИНН ' + (c.inn||'—') + '</div>' +
          '</div>';
        }).join('')
      : '<div class="t3" style="padding:.5rem 0">Ничего не найдено</div>';

    body =
      '<input type="text" placeholder="Поиск по названию или ИНН..." value="' + (S.cpQuery||'').replace(/"/g,'&quot;') + '" ' +
        'oninput="S.cpQuery=this.value;renderApp()" style="width:100%;margin-bottom:.75rem" autofocus>' +
      '<div style="max-height:300px;overflow-y:auto">' + list + '</div>' +
      '<div style="text-align:right;margin-top:1rem">' +
        '<button class="btn btn-sm" onclick="S.cpMode=\'new\';renderApp()">+ Добавить нового</button>' +
      '</div>';
  }

  return '<div class="modal-overlay" onclick="if(event.target===this) closeContractorPicker()">' +
    '<div class="modal-box">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">' +
        '<h3>Контрагент — заявка ' + escHtml(t.id) + '</h3>' +
        '<button class="btn btn-sm btn-ghost" onclick="closeContractorPicker()">✕</button>' +
      '</div>' +
      body +
    '</div>' +
  '</div>';
}

function openContractorPicker(taskId) {
  S.cpTaskId = taskId;
  S.cpMode = 'search';
  S.cpQuery = '';
  renderApp();
}

function closeContractorPicker() {
  S.cpTaskId = null;
  renderApp();
}

function assignContractorToTask(taskId, nameShort) {
  var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  var now = new Date().toLocaleString('ru');
  var author = S.user ? (S.user.full_name || S.user.username) : 'Система';
  var hist = t._history || [];
  if ((t.contractor||'') !== nameShort) {
    hist.push({date:now, author:author, field:'Подрядчик', old:t.contractor||'', new:nameShort});
  }
  api('/tasks/' + taskId, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contractor: nameShort, _history: hist})})
    .then(function(){
      t.contractor = nameShort;
      t._history = hist;
      closeContractorPicker();
    })
    .catch(function(e){ alert('Ошибка: ' + e.message); });
}
function acceptTask(taskId) {
  api('/tasks/' + taskId + '/accept', { method: 'POST' }).then(function(res) {
    if (res.error) return alert(res.error);
    var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
    if (t) t.assignmentStatus = 'accepted';
    renderApp();
  });
}

function declineTask(taskId) {
  if (!confirm('Отказаться от заявки? Она станет неназначенной.')) return;
  api('/tasks/' + taskId + '/decline', { method: 'POST' }).then(function(res) {
    if (res.error) return alert(res.error);
    var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
    if (t) { t.assignmentStatus = 'declined'; t.assignee = ''; t.contractor = ''; }
    S.page = 'tasks';
    renderNav();
    renderApp();
  });
}
function acceptTaskFromNotif(taskId) {
  var box = document.getElementById('notif-dropdown');
  if (box) box.style.display = 'none';
  acceptTask(taskId);
}

function declineTaskFromNotif(taskId) {
  var box = document.getElementById('notif-dropdown');
  if (box) box.style.display = 'none';
  declineTask(taskId);
}

function addContractorFromPicker(taskId) {
  var data = {
    inn:           document.getElementById('pc_inn').value.trim(),
    kpp:           document.getElementById('pc_kpp').value.trim(),
    name_short:    document.getElementById('pc_name_short').value.trim(),
    name_full:     document.getElementById('pc_name_full').value.trim(),
    director:      document.getElementById('pc_director').value.trim(),
    address_legal: document.getElementById('pc_address').value.trim(),
    bank_name:     document.getElementById('pc_bank').value.trim(),
    bik:           document.getElementById('pc_bik').value.trim(),
    account_pay:   document.getElementById('pc_acc_pay').value.trim(),
    account_corr:  document.getElementById('pc_acc_corr').value.trim(),
    phone:         document.getElementById('pc_phone').value.trim(),
    email:         document.getElementById('pc_email').value.trim()
  };
  if (!data.inn || !data.name_short) return alert('ИНН и Краткое название обязательны!');

  api('/contractors', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)})
    .then(function(res){
      if (res.error) { alert(res.error); return; }
      S.contractors.push(res);
      assignContractorToTask(taskId, data.name_short);
    });
}

// ─── PAGE: DATA ───────────────────────────────────────────────────────────────

function switchDocTab(tabName) {
  ['pdf', 'scheme', 'checklist'].forEach(function(t) {
    var btn = document.getElementById('tab_btn_' + t);
    var content = document.getElementById('doc_tab_content_' + t);
    if (btn) {
      if (t === tabName) {
        btn.style.background = 'var(--orange-bg)';
        btn.style.borderColor = 'var(--orange)';
        btn.style.color = 'var(--orange-dark)';
      } else {
        btn.style.background = 'none';
        btn.style.borderColor = 'transparent';
        btn.style.color = 'inherit';
      }
    }
    if (content) {
      content.style.display = (t === tabName) ? 'block' : 'none';
    }
  });
  var body = document.getElementById('nt_docs_body');
  var toggleBtn = document.getElementById('btn_toggle_all_docs');
  if (body) body.style.display = 'block';
  if (toggleBtn) toggleBtn.textContent = 'Свернуть ▴';
}

function toggleAllDocs() {
  var body = document.getElementById('nt_docs_body');
  var btn = document.getElementById('btn_toggle_all_docs');
  if (!body || !btn) return;
  var isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  btn.textContent = isHidden ? 'Свернуть ▴' : 'Развернуть ▾';
}

function updateDocTabBadges() {
  var bPdf = document.getElementById('tab_badge_pdf');
  var bScheme = document.getElementById('tab_badge_scheme');
  var bChecklist = document.getElementById('tab_badge_checklist');

  if (bPdf) {
    if (S.pendingPdfFile) {
      bPdf.textContent = '1';
      bPdf.style.display = 'inline-block';
    } else {
      bPdf.style.display = 'none';
    }
  }
  if (bScheme) {
    if (S.pendingSchemeFiles && S.pendingSchemeFiles.length) {
      bScheme.textContent = S.pendingSchemeFiles.length;
      bScheme.style.display = 'inline-block';
    } else {
      bScheme.style.display = 'none';
    }
  }
  if (bChecklist) {
    if (S.pendingChecklistFiles && S.pendingChecklistFiles.length) {
      bChecklist.textContent = S.pendingChecklistFiles.length;
      bChecklist.style.display = 'inline-block';
    } else {
      bChecklist.style.display = 'none';
    }
  }
}

function handlePendingFiles(type, inputEl) {
  var arr = type === 'scheme' ? S.pendingSchemeFiles : S.pendingChecklistFiles;
  for (var i = 0; i < inputEl.files.length; i++) {
    arr.push(inputEl.files[i]);
  }
  inputEl.value = ''; // Сброс input, чтобы можно было выбрать тот же файл повторно
  renderPendingChips(type);
  switchDocTab(type);
  updateDocTabBadges();
  var emptyMsg = document.getElementById('nt_' + type + '_empty_msg');
  if (emptyMsg) emptyMsg.style.display = 'none';
  // Автоматически показываем превью последнего добавленного файла
  if (arr.length > 0) {
    previewPendingFile(type, arr[arr.length - 1]);
  }
}

function removePendingFile(type, index) {
  var arr = type === 'scheme' ? S.pendingSchemeFiles : S.pendingChecklistFiles;
  arr.splice(index, 1);
  renderPendingChips(type);
  updateDocTabBadges();
  // Если файлов не осталось — скрываем превью и возвращаем заглушку
  if (arr.length === 0) {
    var wrap = document.getElementById('nt_' + type + '_preview_wrap');
    var chips = document.getElementById('nt_' + type + '_chips');
    var emptyMsg = document.getElementById('nt_' + type + '_empty_msg');
    if (wrap) wrap.style.display = 'none';
    if (chips) chips.style.display = 'none';
    if (emptyMsg) emptyMsg.style.display = 'block';
  } else {
    // Показываем превью последнего оставшегося файла
    previewPendingFile(type, arr[arr.length - 1]);
  }
}

function renderPendingChips(type) {
  var arr = type === 'scheme' ? S.pendingSchemeFiles : S.pendingChecklistFiles;
  var el = document.getElementById('nt_' + type + '_chips');
  if (!el) return;
  if (!arr.length) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'block';
  var icon = type === 'scheme' ? '🗺️' : '📋';
  el.innerHTML = '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
    arr.map(function(f, idx) {
      var sizeKb = (f.size / 1024).toFixed(0);
      return '<div style="display:inline-flex; align-items:center; gap:4px; background:var(--orange-bg); border:1px solid var(--border); border-radius:6px; padding:3px 8px; font-size:.78rem;">' +
        '<span>' + icon + '</span>' +
        '<span style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + escHtml(f.name) + '">' + escHtml(f.name) + '</span>' +
        '<span class="t3">(' + sizeKb + ' КБ)</span>' +
        '<button type="button" style="background:none; border:none; cursor:pointer; font-size:.85rem; padding:0 2px;" onclick="previewPendingFile(\'' + type + '\', S.pending' + (type === 'scheme' ? 'Scheme' : 'Checklist') + 'Files[' + idx + '])" title="Предпросмотр">👁️</button>' +
        '<button type="button" style="background:none; border:none; cursor:pointer; font-size:.85rem; padding:0 2px; color:var(--red);" onclick="removePendingFile(\'' + type + '\',' + idx + ')" title="Убрать">✖</button>' +
      '</div>';
    }).join('') +
  '</div>';
}

function previewPendingFile(type, file) {
  if (!file) return;
  var wrap = document.getElementById('nt_' + type + '_preview_wrap');
  var content = document.getElementById('nt_' + type + '_preview_content');
  var emptyMsg = document.getElementById('nt_' + type + '_empty_msg');
  if (!wrap || !content) return;
  if (emptyMsg) emptyMsg.style.display = 'none';

  var url = URL.createObjectURL(file);
  var isImage = file.type.startsWith('image/');
  var isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isImage) {
    content.innerHTML = '<img src="' + url + '" style="max-width:100%; max-height:400px; object-fit:contain; border-radius:6px;" alt="' + escHtml(file.name) + '">';
  } else if (isPdf) {
    content.innerHTML = '<iframe src="' + url + '" style="width:100%; height:400px; border:none; border-radius:6px;"></iframe>';
  } else {
    // Для остальных форматов (xlsx, docx, dwg) — просто иконка с именем файла
    content.innerHTML = '<div style="padding:2rem; color:var(--text-2);">' +
      '<div style="font-size:2.5rem; margin-bottom:8px;">📄</div>' +
      '<div style="font-weight:600;">' + escHtml(file.name) + '</div>' +
      '<div class="t3" style="margin-top:4px;">Предпросмотр недоступен для этого формата</div>' +
    '</div>';
  }

  wrap.style.display = 'block';
  content.style.display = 'block';
}

// Создание одиночной заявки с вкладки Данные
function createSingleTask() {
  var data = {
    id:           document.getElementById('nt_id').value.trim(),
    region:       document.getElementById('nt_region').value.trim(),
    address:      document.getElementById('nt_address').value.trim(),
    workType:     document.getElementById('nt_workType').value.trim(),
    amount:       document.getElementById('nt_amount').value,
    pricePerUnit: document.getElementById('nt_pricePerUnit').value,
    inOrder:      document.getElementById('nt_inOrder').value,
    fact:         document.getElementById('nt_fact').value,
    dateZayavki:  document.getElementById('nt_dateZayavki').value,
    deadline:     document.getElementById('nt_deadline').value,
    techLink:     document.getElementById('nt_techLink').value.trim(),
    invoiceInfo:  document.getElementById('nt_invoiceInfo').value.trim(),
    comment:      document.getElementById('nt_comment').value.trim(),
    vsp:          document.getElementById('nt_vsp').value.trim(),
    customer:     (document.getElementById('nt_customer') ? document.getElementById('nt_customer').value : 'ПАО Сбербанк'),
    manager:      document.getElementById('nt_manager').value.trim(),
    contact:      document.getElementById('nt_contact').value.trim()
  };

  if (!data.id) {
    return alert('Пожалуйста, укажите Номер заявки!');
  }

  // Меняем текст кнопки, чтобы показать процесс
  var btn = event.target;
  var originalBtnText = btn.innerHTML;
  btn.innerHTML = 'Создание...';
  btn.disabled = true;

  api('/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(function(res) {
    btn.innerHTML = originalBtnText;
    btn.disabled = false;

    if (res.error) {
      alert('Ошибка: ' + res.error);
      return;
    }
    
    // 1. Очищаем все поля формы
    var fieldsToClear = ['nt_id', 'nt_vsp', 'nt_region', 'nt_address', 'nt_manager', 'nt_contact', 'nt_workType', 'nt_amount', 'nt_pricePerUnit', 'nt_inOrder', 'nt_fact', 'nt_dateZayavki', 'nt_deadline', 'nt_techLink', 'nt_invoiceInfo', 'nt_comment'];
    fieldsToClear.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });

    // Очищаем и сворачиваем превью PDF, если оно было открыто
    var previewWrap = document.getElementById('ai_pdf_preview_wrap');
    var previewFrame = document.getElementById('ai_pdf_preview_frame');
    if (previewWrap && previewFrame) {
      previewFrame.src = '';
      previewWrap.style.display = 'none';
    }
    // Очищаем превью Схемы и Чек-листа
    ['scheme', 'checklist'].forEach(function(docType) {
      var w = document.getElementById('nt_' + docType + '_preview_wrap');
      var c = document.getElementById('nt_' + docType + '_preview_content');
      var ch = document.getElementById('nt_' + docType + '_chips');
      if (w) w.style.display = 'none';
      if (c) c.innerHTML = '';
      if (ch) { ch.style.display = 'none'; ch.innerHTML = ''; }
    });

    // 2. Прикрепляем все загруженные файлы к созданной заявке
    var attachPromises = [];
    if (S.pendingPdfFile) {
      attachPromises.push(uploadAttachments(res.id, 'order_pdf', [S.pendingPdfFile]));
    }
    if (S.pendingSchemeFiles.length) {
      attachPromises.push(uploadAttachments(res.id, 'scheme', S.pendingSchemeFiles));
    }
    if (S.pendingChecklistFiles.length) {
      attachPromises.push(uploadAttachments(res.id, 'checklist', S.pendingChecklistFiles));
    }
    var attachPromise = attachPromises.length ? Promise.all(attachPromises) : Promise.resolve();

    attachPromise.then(function() {
      S.pendingPdfFile = null;
      S.pendingSchemeFiles = [];
      S.pendingChecklistFiles = [];
      updateDocTabBadges();

      var pdfEmpty = document.getElementById('ai_pdf_empty_msg');
      if (pdfEmpty) pdfEmpty.style.display = 'block';
      ['scheme', 'checklist'].forEach(function(docType) {
        var em = document.getElementById('nt_' + docType + '_empty_msg');
        if (em) em.style.display = 'block';
      });
      switchDocTab('pdf');

      // 3. Показываем всплывающее уведомление (Toast) об успехе
      var toast = document.createElement('div');
      toast.innerHTML = '✅ Заявка ' + res.id + ' успешно создана!';
      toast.style.cssText = 'position:fixed; bottom:20px; right:20px; background:var(--green); color:#fff; padding:12px 24px; border-radius:8px; box-shadow:var(--shadow); z-index:9999; font-weight:600; transition:opacity 0.3s;';
      document.body.appendChild(toast);
      setTimeout(function() { toast.style.opacity = '0'; setTimeout(function(){ toast.remove(); }, 300); }, 3000);

      // 4. Обновляем список задач с сервера и открываем карточку новой заявки
      api('/tasks').then(function(tasksList) {
        S.tasks = tasksList;
        openCard(res.id);
      });
    }).catch(function(err) {
      console.error('Ошибка прикрепления файлов:', err);
      S.pendingPdfFile = null;
      S.pendingSchemeFiles = [];
      S.pendingChecklistFiles = [];
      updateDocTabBadges();
      var pdfEmpty = document.getElementById('ai_pdf_empty_msg');
      if (pdfEmpty) pdfEmpty.style.display = 'block';
      ['scheme', 'checklist'].forEach(function(docType) {
        var em = document.getElementById('nt_' + docType + '_empty_msg');
        if (em) em.style.display = 'block';
      });
      switchDocTab('pdf');

      // Даже если файлы не прикрепились, заявку всё равно открываем
      api('/tasks').then(function(tasksList) {
        S.tasks = tasksList;
        openCard(res.id);
      });
    });

  }).catch(function(e) {
    btn.innerHTML = originalBtnText;
    btn.disabled = false;
    alert('Системная ошибка: ' + e.message);
  });
}

// --- ЛОГИКА МЕССЕНДЖЕРА ---

function addTask() {
  var inp = document.getElementById('ntask');
  if (!inp) return;
  var title = inp.value.trim();
  if (!title) return;
  api('/tasks', {
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ title: title, status: 'pending', stage: 'request', priority: 'medium' })
  })
  .then(function(t){ S.tasks.push(t); inp.value = ''; renderApp(); });
}
