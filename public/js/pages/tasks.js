function clearFilters() {
  S.taskQ=''; S.taskSt=''; S.taskPr=''; S.taskReg=''; S.taskMgr=''; S.taskYear=''; S.taskOverdue='';
  S.taskCustomer=''; S.taskContractor='';
  S.taskArch='no'; S.taskStage=''; S.taskSort=''; S.taskView='all'; // Сбрасываем фильтры
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
  var q=S.taskQ, st=S.taskSt, pr=S.taskPr, reg=S.taskReg, mgr=S.taskMgr, yr=S.taskYear, ovd=S.taskOverdue, cust=S.taskCustomer, contr=S.taskContractor;
  
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

  var hasFilter = q||st||pr||reg||mgr||yr||ovd||cust||contr||S.taskArch==='yes'||S.taskStage||(S.taskView && S.taskView !== 'all');

  // Сетка totals изменена на 7 колонок (repeat(7,1fr))
  var totals = '<div class="card p mb" style="display:grid;grid-template-columns:repeat(7,1fr);gap:.5rem;padding:.75rem 1rem">' +
    statBox('Заявок', fmtN(filtered.length), 'из '+fmtN(S.tasks.length), 'var(--orange)') +
    statBox('Сумма', fmtMoney(sumAll), null, null) +
    statBox('Выполнено', fmtMoney(sumDone), null, 'var(--green)') +
    statBox('В работе', fmtMoney(sumAct), null, 'var(--orange)') +
    statBox('Просрочено', fmtN(cntOvd), null, cntOvd>0?'var(--red)':'var(--green)') +
    statBox('Портов', fmtN(portsDone)+'/'+fmtN(portsTotal), null, null) +
    statBox('Остаток портов', fmtN(portBalance), 'заказ - факт', portBalance > 0 ? 'var(--orange)' : 'var(--green)') +
  '</div>';

  // Подсчет заявок по Quick Views (быстрым ролевым табам)
  var qvCounts = {
    all: S.tasks.filter(function(t){ return !t.archived; }).length,
    montage: S.tasks.filter(function(t){ return !t.archived && (t.stageNum == null || t.stageNum <= 2); }).length,
    id_queue: S.tasks.filter(function(t){ return !t.archived && t.stageNum === 3; }).length,
    design: S.tasks.filter(function(t){ return !t.archived && t.stageNum === 4; }).length,
    sber: S.tasks.filter(function(t){ return !t.archived && (t.stageNum === 5 || t.stageNum === 6); }).length,
    remarks: S.tasks.filter(function(t){ return !t.archived && Number(t.openRemarksCount) > 0; }).length,
    payment: S.tasks.filter(function(t){ return !t.archived && (t.stageNum === 7 || t.stageNum === 8); }).length,
    done: S.tasks.filter(function(t){ return !t.archived && t.stageNum === 9; }).length,
  };

  var curView = S.taskView || 'all';
  var quickViews = [
    { id: 'all',      label: 'Все',                 cnt: qvCounts.all },
    { id: 'montage',  label: '🔧 В монтаже',        cnt: qvCounts.montage },
    { id: 'id_queue', label: '📦 Очередь ИД',       cnt: qvCounts.id_queue },
    { id: 'design',   label: '📐 В проектировании', cnt: qvCounts.design },
    { id: 'sber',     label: '📫 В Сбере',          cnt: qvCounts.sber },
    { id: 'remarks',  label: '⛔ Замечания Сбера',   cnt: qvCounts.remarks, isRed: qvCounts.remarks > 0 },
    { id: 'payment',  label: '💳 К оплате',         cnt: qvCounts.payment },
    { id: 'done',     label: '✅ Завершена',         cnt: qvCounts.done }
  ];

  var stageTabsHtml = '<div style="display:flex;gap:.35rem;overflow-x:auto;padding-bottom:.4rem;margin-bottom:.65rem">';
  quickViews.forEach(function(qv) {
    var isActive = (curView === qv.id);
    var btnCls = isActive ? 'btn btn-sm' : 'btn btn-sm btn-ghost';
    var badgeStyle = qv.isRed ? 'background:var(--red);color:#fff;border-radius:10px;padding:1px 6px;margin-left:4px' : 'opacity:.7;margin-left:3px';
    stageTabsHtml += '<button class="' + btnCls + '" onclick="setTaskViewFilter(\'' + qv.id + '\')" style="white-space:nowrap;font-size:.76rem;padding:3px 9px">' +
      qv.label + ' <span style="' + badgeStyle + '">(' + qv.cnt + ')</span>' +
    '</button>';
  });
  stageTabsHtml += '</div>';

  var tableRows = '';
  filtered.slice(0, 300).forEach(function(t) {
    var od = t.overdueDays > 0
      ? '<span style="color:var(--red);font-weight:600">+' + t.overdueDays + ' дн</span>'
      : '<span class="t3">—</span>';
    
    var tid = (t.id || '').replace(/'/g, "\\'");
    var fin = getTaskFinance(t);

    tableRows += '<tr>' +
      // Номер с подсветкой
      '<td><button class="btn-link" onclick="openCard(\'' + tid + '\')">⇒ ' + highlight(t.id, q) + '</button></td>' +
      
      // Дата (тут подсвечивать нечего, формат меняется)
      '<td style="white-space:nowrap;color:var(--text-2);font-size:.8rem">' + (t.dateZayavki ? t.dateZayavki.slice(0, 10).split('-').reverse().join('.') : '<span class="t3">—</span>') + '</td>' +
      
      // Регион
      '<td>' + highlight(t.region || '', q) + '</td>' +
      
      '<td style="white-space:nowrap; font-weight:600">' + (t.fact || 0) + ' / ' + (t.inOrder || 0) + '</td>' +

      // Контрагент — кликабельная ячейка, открывает попап выбора/добавления
      '<td><button class="btn-link" onclick="openContractorPicker(\'' + tid + '\')">' +
        (t.contractor ? escHtml(t.contractor) : '<span class="t3">+ Добавить</span>') +
      '</button></td>' +

      // Статусы и кнопки (тут подсветка не нужна, это бейджи)
      '<td>' + prBadge(t.priority) + '</td>' +
      '<td>' + od + '</td>' +
      '<td>' + idStageBadge(t.stageNum) + (Number(t.openRemarksCount) > 0 ? ' <span class="badge b-red" style="font-size:.68rem;padding:1px 5px" title="Открытые замечания Сбера">⚠️ ' + t.openRemarksCount + '</span>' : '') + '</td>' +
      '<td>' + stBadge(t.status) + '</td>' +

      '<td style="white-space:nowrap; font-weight:700; color:var(--blue)">' + fmtMoney(fin.total) + '</td>' +
      '<td style="white-space:nowrap; color:var(--text-3)">' + fmtMoney(t.amount) + '</td>' +
      '<td><button class="btn btn-sm btn-ghost btn-icon" onclick="exportTask(\'' + tid + '\')">&#x2B07;</button></td>' +
    '</tr>';
  });

  var more = filtered.length>300
    ? '<tr><td colspan="12" style="text-align:center;padding:1rem;color:var(--text-3)">… ещё '+(filtered.length-300)+' заявок — уточните фильтр</td></tr>'
    : '';

  return '<h1 class="page-title">Заявки</h1>' +
    '<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.75rem;align-items:center">' +
      '<input id="tq" type="text" placeholder="Поиск по номеру, адресу..." style="flex:2;min-width:200px" value="'+q+'">' +
      '<select id="tst"><option value="">Все статусы</option>' +
        '<option value="pending"'  + (st==='pending'?' selected':'')  + '>Не распределено</option>' +
        '<option value="progress"' + (st==='progress'?' selected':'') + '>В работе</option>' +
        '<option value="done"'     + (st==='done'?' selected':'')     + '>Готово</option>' +
        '<option value="paid"'     + (st==='paid'?' selected':'')     + '>Оплачен</option>' +
        '<option value="cancelled"'+ (st==='cancelled'?' selected':'')+ '>Отменен</option>' +
      '</select>' +
      '<select id="tpr"><option value="">Все приоритеты</option>' +
        '<option value="high"'+(pr==='high'?' selected':'')+'>🔴 Высокий</option>' +
        '<option value="medium"'+(pr==='medium'?' selected':'')+'>🟡 Средний</option>' +
        '<option value="low"'+(pr==='low'?' selected':'')+'>🟢 Низкий</option>' +
      '</select>' +
      '<select id="tcust"><option value="">Все заказчики</option>'+mkOpts(customers,cust)+'</select>' +
      '<select id="treg"><option value="">Все регионы</option>'+mkOpts(regions,reg)+'</select>' +
      '<select id="tmgr"><option value="">Все менеджеры</option>'+mkOpts(managers,mgr)+'</select>' +
      '<select id="tyr"><option value="">Все годы</option>'+mkOpts(years,yr)+'</select>' +
      '<select id="tovd"><option value="">Любые</option>' +
        '<option value="yes"'+(ovd==='yes'?' selected':'')+'>⛔ Просроченные</option>' +
        '<option value="no"'+(ovd==='no'?' selected':'')+'>✓ Без просрочки</option>' +
      '</select>' +
      // ВОТ ОН, СЕЛЕКТОР АРХИВА:
      '<select id="tarch">' +
        '<option value="no"' + (S.taskArch==='no'?' selected':'') + '>Активные</option>' +
        '<option value="yes"' + (S.taskArch==='yes'?' selected':'') + '>Архив</option>' +
        '<option value=""' + (S.taskArch===''?' selected':'') + '>Все (с архивом)</option>' +
      '</select>' +
      '<select id="tstage">' +
        '<option value="">Все этапы</option>' +
        '<option value="request"' + (S.taskStage==='request'?' selected':'') + '>Заявка</option>' +
        '<option value="survey"' + (S.taskStage==='survey'?' selected':'') + '>Обследование</option>' +
        '<option value="install"' + (S.taskStage==='install'?' selected':'') + '>Монтаж</option>' +
        '<option value="control"' + (S.taskStage==='control'?' selected':'') + '>Контроль</option>' +
        '<option value="acceptance"' + (S.taskStage==='acceptance'?' selected':'') + '>Приёмка</option>' +
        '<option value="payment"' + (S.taskStage==='payment'?' selected':'') + '>Оплата</option>' +
      '</select>' +
      '<select id="tsort">' +
        '<option value=""'+(S.taskSort===''?' selected':'')+'>Порядок по умолчанию</option>' +
        '<option value="date_desc"'+(S.taskSort==='date_desc'?' selected':'')+'>📅 Новые сначала</option>' +
        '<option value="date_asc"'+(S.taskSort==='date_asc'?' selected':'')+'>📅 Старые сначала</option>' +
      '</select>' +
      '<select id="tcontr"><option value="">Все контрагенты</option>' + mkOpts(contractors, contr) + '</select>' +
      (hasFilter||S.taskSort ? '<button class="btn btn-sm btn-ghost" onclick="clearFilters()">✕ Сбросить</button>' : '') +
    '</div>' +
    stageTabsHtml +
    totals +
    '<div class="card tbl-wrap">' +
      '<table><thead><tr>' +
        '<th>Номер</th><th>Дата</th><th>Регион</th><th>Порты</th><th>Контрагент</th>' +
        '<th>Приоритет</th><th>Просрочка</th><th>Этап</th><th>Статус</th>' +
        '<th title="Итого: ПО + ТМЦ">Платит Сбер</th><th title="Сумма из Excel">Сумма (спр.)</th><th></th>' +
      '</tr></thead><tbody>'+tableRows+more+'</tbody></table>' +
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
