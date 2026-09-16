function pageSupply() {
  var STAGE_KEYS  = ['request','survey','install','control','acceptance','payment'];
  var STAGE_NAMES = ['Заявка','Обследование','Монтаж','Контроль','Приёмка','Оплата'];

  if (!S.chains.length) return '<h1 class="page-title">Цепи по регионам</h1>' +
    '<div class="card p" style="text-align:center;padding:3rem"><p class="t3">Нет данных.</p><button class="btn" style="margin-top:1rem" onclick="go(\'data\')">Загрузить</button></div>';

  var curMgr = S.chainMgr || '';
  var mgrList = Array.from(new Set(S.tasks.map(function(t){ return t.manager || ''; }).filter(Boolean))).sort();
  var regList = S.chains.map(function(c){ return c.id; });

  // Фильтруем задачи текущего выбранного региона (с учетом ведущего менеджера)
  var selRegionId = S.selChain || (S.chains[0] ? S.chains[0].id : '');
  var regionTasks = S.tasks.filter(function(t){
    if (t.region !== selRegionId || t.archived) return false;
    if (curMgr && t.manager !== curMgr) return false;
    return true;
  });

  // Расчет метрик выбранного региона с учетом менеджера
  var totalRegTasks = regionTasks.length;
  var doneRegTasks  = regionTasks.filter(function(t){ return t.status === 'done'; }).length;
  var inProgTasks   = regionTasks.filter(function(t){ return t.status === 'progress' || t.status === 'pending'; }).length;
  var cancTasks     = regionTasks.filter(function(t){ return t.status === 'cancelled'; }).length;
  var totalRegAmt   = regionTasks.reduce(function(acc, t){ return acc + Number(t.amount || 0); }, 0);
  var cp = pct(doneRegTasks, totalRegTasks);

  // Считаем заявки по этапам для выбранного региона и менеджера
  var stageCount = {};
  STAGE_KEYS.forEach(function(k){ stageCount[k] = 0; });
  regionTasks.forEach(function(t){
    if (t.stage && stageCount[t.stage] !== undefined) stageCount[t.stage]++;
  });

  var stepsHtml = '';
  STAGE_NAMES.forEach(function(s, i) {
    var stageKey = STAGE_KEYS[i];
    var cnt = stageCount[stageKey] || 0;
    var isSel = S.selChainStep === stageKey;
    // Определяем статус этапа
    var isDone = false;
    if (i === 0 && doneRegTasks > 0) isDone = true;
    var stepStyle = isSel ? 'outline:2px solid var(--orange);outline-offset:2px;cursor:pointer;flex-shrink:0;' : 'cursor:pointer;flex-shrink:0;';
    stepsHtml += '<div class="step ' + (cnt > 0 ? 'active' : '') + '" style="' + stepStyle + '" data-step="' + stageKey + '">' +
      '<div class="step-icon">' + (cnt > 0 ? '⏳' : '○') + '</div>' +
      s +
      '<div style="font-size:.75rem;margin-top:2px;color:var(--orange-dark);font-weight:700">' + cnt + ' з.</div>' +
    '</div>';
    if (i < STAGE_NAMES.length - 1) stepsHtml += '<span class="chain-arr">→</span>';
  });

  var listHtml = '';
  S.chains.forEach(function(c) {
    var cTasks = S.tasks.filter(function(t){
      if (t.region !== c.id || t.archived) return false;
      if (curMgr && t.manager !== curMgr) return false;
      return true;
    });
    var cTotal = cTasks.length;
    var cDone  = cTasks.filter(function(t){ return t.status === 'done'; }).length;
    var cProg  = cTasks.filter(function(t){ return t.status === 'progress' || t.status === 'pending'; }).length;
    var cCanc  = cTasks.filter(function(t){ return t.status === 'cancelled'; }).length;
    var cAmt   = cTasks.reduce(function(acc, t){ return acc + Number(t.amount || 0); }, 0);
    var rp = pct(cDone, cTotal);
    var isSel = c.id === selRegionId;

    listHtml += '<div class="rrow' + (isSel?' sel':'') + '" data-cid="' + encodeURIComponent(c.id) + '">' +
      '<span class="rname">' + escHtml(c.id) + '</span>' +
      '<div class="rstats">' +
        '<span style="color:var(--green)">✓ ' + cDone + '</span>' +
        '<span style="color:var(--orange)">⏳ ' + cProg + '</span>' +
        '<span class="t3">✗ ' + cCanc + '</span>' +
      '</div>' +
      '<div class="rprog">' + bar(cDone, cTotal) + '</div>' +
      '<span class="ramt">' + rp + '% · ' + fmtMoney(cAmt) + '</span>' +
    '</div>';
  });

  return '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:.75rem; flex-wrap:wrap; gap:.5rem">' +
      '<h1 class="page-title" style="margin:0">Цепи по регионам</h1>' +
      '<div style="display:flex; gap:.5rem; align-items:center">' +
        '<label style="font-size:.8rem; font-weight:600; color:var(--text-2)">Ведущий менеджер:</label>' +
        '<select id="chain_mgr_filter" style="min-width:180px">' +
          '<option value="">Все менеджеры</option>' +
          mgrList.map(function(m){ return '<option value="' + escHtml(m) + '"' + (curMgr === m ? ' selected' : '') + '>' + escHtml(m) + '</option>'; }).join('') +
        '</select>' +
        (curMgr ? '<button class="btn btn-sm btn-ghost" onclick="S.chainMgr=\'\';renderApp()">✕</button>' : '') +
      '</div>' +
    '</div>' +
    '<div class="g2">' +
      '<div>' +
        '<div class="card p mb">' +
          '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:.75rem">' +
            '<div class="fw7" style="font-size:1.1rem">' + escHtml(selRegionId) + ' (' + totalRegTasks + ' заявок)</div>' +
            '<button class="btn btn-sm btn-ghost" onclick="filterAndGoTasks({reg:\'' + escHtml(selRegionId) + '\', mgr:\'' + escHtml(curMgr) + '\'})" title="Перейти ко всем заявкам этого региона">Открыть в Заявках ➔</button>' +
          '</div>' +
          '<div class="row" style="flex-wrap:wrap;gap:.75rem;margin-bottom:.9rem;font-size:.82rem">' +
            '<span style="color:var(--green)">✓ Готово: <strong>' + doneRegTasks + '</strong></span>' +
            '<span style="color:var(--orange)">⏳ В работе: <strong>' + inProgTasks + '</strong></span>' +
            '<span class="t3">✗ Отменено: <strong>' + cancTasks + '</strong></span>' +
            '<span style="color:var(--blue)">💰 ' + fmtMoney(totalRegAmt) + '</span>' +
          '</div>' +
          '<div class="chain-steps" style="overflow-x:auto; padding-bottom:.5rem; flex-wrap:nowrap">' + stepsHtml + '</div>' +
          '<div style="margin-top:.75rem">' + bar(doneRegTasks, totalRegTasks) + '</div>' +
          '<div style="text-align:right;font-size:.75rem;color:var(--text-3);margin-top:3px">' + cp + '% выполнено</div>' +
        '</div>' +
        (S.selChainStep ? (function(){
          var stepIdx = STAGE_KEYS.indexOf(S.selChainStep);
          var stepName = STAGE_NAMES[stepIdx] || S.selChainStep;
          var stepTasks = regionTasks.filter(function(t){ return t.stage === S.selChainStep; });
          if (!stepTasks.length) return '<div class="card p mb"><div class="sec-title">' + stepName + ' — нет заявок</div></div>';
          var rows = stepTasks.slice(0,30).map(function(t){
            var tid = (t.id||'').replace(/'/g,"\\'");
            return '<div style="display:flex;align-items:center;gap:.75rem;padding:.4rem 0;border-bottom:1px solid var(--border)">' +
              '<button class="btn-link" style="min-width:100px" onclick="openCard(\'' + tid + '\')">' + (t.id||'') + '</button>' +
              '<span class="t3" style="flex:1;font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (t.address||'') + '</span>' +
              stBadge(t.status) +
              '<span class="t3" style="font-size:.75rem;white-space:nowrap">' + fmtMoney(t.amount) + '</span>' +
            '</div>';
          }).join('');
          var more = stepTasks.length > 30 ? '<div class="t3" style="font-size:.78rem;margin-top:.5rem">... ещё ' + (stepTasks.length-30) + ' заявок</div>' : '';
          return '<div class="card p mb"><div class="sec-title" style="margin-bottom:.5rem">' + stepName + ' (' + stepTasks.length + ' заявок) ' +
            '<button class="btn btn-sm btn-ghost" style="float:right;font-size:.7rem;padding:2px 8px" onclick="S.selChainStep=null;renderApp()">✕</button></div>' +
            rows + more + '</div>';
        })() : '') +
      '</div>' +
      '<div class="card p" style="max-height:70vh;overflow-y:auto">' +
        '<div class="sec-title">Все регионы (' + S.chains.length + ')</div>' +
        listHtml +
      '</div>' +
    '</div>';
}

// ─── PAGE: KANBAN ─────────────────────────────────────────────────────────────