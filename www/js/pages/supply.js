function pageSupply() {
  S.supplyTab = S.supplyTab || 'stages';

  var tabSwitcher = '<div style="display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap">' +
    '<button class="btn btn-sm ' + (S.supplyTab === 'stages' ? 'btn-primary' : 'btn-ghost') + '" onclick="S.supplyTab=\'stages\';renderApp()">🔗 Этапы по регионам</button>' +
    '<button class="btn btn-sm ' + (S.supplyTab === 'cpsat' ? 'btn-primary' : 'btn-ghost') + '" onclick="S.supplyTab=\'cpsat\';renderApp();loadSupplyWarehousesView()">📦 Склады и CP-SAT снабжение</button>' +
    '<button class="btn btn-sm ' + (S.supplyTab === 'forecast' ? 'btn-primary' : 'btn-ghost') + '" onclick="S.supplyTab=\'forecast\';renderApp();loadSupplyForecastView()">📈 Прогнозирование и Заказы (MRP)</button>' +
  '</div>';

  // ─── ВКЛАДКА 3: ПРОГНОЗИРОВАНИЕ И ЗАКАЗЫ (MRP) ─────────────────────────────
  if (S.supplyTab === 'forecast') {
    setTimeout(loadSupplyForecastView, 20);
    return '<h1 class="page-title">Прогнозирование поставок и Заказы (MRP)</h1>' +
      tabSwitcher +
      '<div id="supply-forecast-container">' +
        '<div class="t3" style="text-align:center;padding:3rem">Загрузка прогноза потребностей и заказов…</div>' +
      '</div>';
  }

  // ─── ВКЛАДКА 2: СКЛАДЫ И CP-SAT СНАБЖЕНИЕ ───────────────────────────────────
  if (S.supplyTab === 'cpsat') {
    setTimeout(loadSupplyWarehousesView, 20);
    return '<h1 class="page-title">Склады и Снабжение (CP-SAT)</h1>' +
      tabSwitcher +
      '<div class="g2 mb">' +
        '<div class="card p">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">' +
            '<div class="sec-title" style="margin:0">Остатки на складах и у подрядчиков</div>' +
            '<button class="btn btn-sm btn-ghost" onclick="loadSupplyWarehousesView()">🔄 Обновить</button>' +
          '</div>' +
          '<div id="supply-warehouses-list" class="t3">Загрузка складов…</div>' +
        '</div>' +
        '<div class="card p">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">' +
            '<div class="sec-title" style="margin:0">⚡ Оптимизатор CP-SAT (Google OR-Tools)</div>' +
            '<button class="btn btn-sm btn-primary" onclick="runCpSatSupplyOptimization()">Запустить расчет</button>' +
          '</div>' +
          '<p style="font-size:.82rem;color:var(--text-2);margin-bottom:1rem;line-height:1.4">' +
            'Решатель дискретной оптимизации вычисляет точный план отгрузок со складов под активные потребности подрядчиков с учетом кратности упаковок (бухты 305м, хлысты 2м) и минимизацией логистических затрат.' +
          '</p>' +
          '<div id="cpsat-results-container">' +
            '<div class="t3" style="text-align:center;padding:2rem;background:var(--bg);border-radius:6px">Нажмите «Запустить расчет» для построения оптимального плана отгрузок.</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // ─── ВКЛАДКА 1: ЭТАПЫ ПО РЕГИОНАМ ──────────────────────────────────────────
  var STAGE_KEYS  = ['request','survey','install','control','acceptance','payment'];
  var STAGE_NAMES = ['Заявка','Обследование','Монтаж','Контроль','Приёмка','Оплата'];

  if (!S.chains || !S.chains.length) return '<h1 class="page-title">Цепи по регионам</h1>' +
    tabSwitcher +
    '<div class="card p" style="text-align:center;padding:3rem"><p class="t3">Нет данных.</p><button class="btn" style="margin-top:1rem" onclick="go(\'data\')">Загрузить</button></div>';

  var curMgr = S.chainMgr || '';
  var mgrList = Array.from(new Set(S.tasks.map(function(t){ return t.manager || ''; }).filter(Boolean))).sort();

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

  return tabSwitcher +
    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:.75rem; flex-wrap:wrap; gap:.5rem">' +
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

// ─── ЛОГИКА СКЛАДОВ И ОПТИМИЗАТОРА CP-SAT ─────────────────────────────────────

function loadSupplyWarehousesView() {
  var el = document.getElementById('supply-warehouses-list');
  if (!el) return;
  fetch('/api/warehouses', { headers: { 'Authorization': 'Bearer ' + S.token } })
    .then(function(r){ return r.json(); })
    .then(function(whs) {
      if (!whs || !whs.length) {
        el.innerHTML = '<div class="t3">Склады не найдены</div>';
        return;
      }
      var html = '<div style="display:flex;flex-direction:column;gap:.6rem;max-height:60vh;overflow-y:auto">';
      whs.forEach(function(w) {
        var typeBadge = w.type === 'central' ? '<span class="badge b-blue">Центральный</span>' : (w.type === 'regional' ? '<span class="badge b-green">Региональный</span>' : '<span class="badge b-gray">Подрядчик</span>');
        html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;border:1px solid var(--border)">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<strong>' + escHtml(w.name) + '</strong>' +
            typeBadge +
          '</div>' +
          (w.contractor_name ? '<div style="font-size:.75rem;color:var(--text-3);margin-top:2px">Подрядчик: ' + escHtml(w.contractor_name) + '</div>' : '') +
          '<div id="wh_bal_' + w.id + '" style="font-size:.78rem;color:var(--text-2);margin-top:4px">Загрузка остатков…</div>' +
        '</div>';
      });
      html += '</div>';
      el.innerHTML = html;

      whs.forEach(function(w) {
        fetch('/api/warehouses/' + w.id + '/balances', { headers: { 'Authorization': 'Bearer ' + S.token } })
          .then(function(r){ return r.json(); })
          .then(function(bals) {
            var bEl = document.getElementById('wh_bal_' + w.id);
            if (!bEl) return;
            if (!bals || !bals.length) {
              bEl.innerHTML = '<span class="t3">Остатков нет (0)</span>';
              return;
            }
            var bText = bals.map(function(b){ return '<strong>' + b.quantity + ' ' + b.unit + '</strong> ' + escHtml(b.code); }).join(' · ');
            bEl.innerHTML = bText;
          });
      });
    });
}

function runCpSatSupplyOptimization() {
  var resCont = document.getElementById('cpsat-results-container');
  if (resCont) resCont.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--blue);font-weight:600">⚡ Google OR-Tools CP-SAT вычисляет оптимальный план снабжения…</div>';

  fetch('/api/supply/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
    body: JSON.stringify({})
  })
  .then(function(r){ return r.json(); })
  .then(function(res) {
    if (!res || !res.success) {
      if (resCont) resCont.innerHTML = '<div style="color:var(--red);padding:1rem">Ошибка CP-SAT: ' + (res.error || 'нет решения') + '</div>';
      return;
    }

    var html = '<div style="margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center">' +
      '<div>' +
        '<span class="badge b-green" style="font-size:.85rem;padding:4px 8px">Статус: ' + res.solver_status + '</span> ' +
        '<span style="font-size:.85rem;color:var(--text-3);margin-left:8px">Оптимизация логистики: ' + res.total_cost + ' у.е.</span>' +
      '</div>' +
    '</div>';

    if (!res.transfers || !res.transfers.length) {
      html += '<div class="card p" style="text-align:center;padding:1.5rem;color:var(--green)">✅ Все потребности подрядчиков полностью закрыты текущими остатками на местах! Дополнительных отгрузок не требуется.</div>';
    } else {
      html += '<div class="sec-title" style="margin-bottom:.5rem">🚚 Рекомендуемые отгрузки со складов (с учетом квантов упаковки):</div>' +
        '<div style="display:flex;flex-direction:column;gap:.6rem;margin-bottom:1rem">';

      res.transfers.forEach(function(tr) {
        html += '<div class="card p" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;border-left:4px solid var(--blue)">' +
          '<div>' +
            '<div style="font-weight:700;font-size:.9rem">' + escHtml(tr.source_warehouse_name) + ' ➔ ' + escHtml(tr.contractor_name) + '</div>' +
            '<div style="font-size:.82rem;color:var(--text-2);margin-top:3px">' +
              'Материал: <strong>' + escHtml(tr.material_name) + '</strong> | К отгрузке: <strong style="color:var(--blue)">' + tr.quantity + ' ' + tr.unit + '</strong>' +
              (tr.packages ? ' (' + tr.packages + ' ' + tr.package_unit + ')' : '') +
            '</div>' +
          '</div>' +
          '<button class="btn btn-sm" onclick="executeTransfer(' + tr.source_warehouse_id + ',' + tr.target_warehouse_id + ',' + tr.material_id + ',' + tr.quantity + ', \'' + escHtml(tr.material_name).replace(/'/g, "\\'") + '\')">📦 Оформить перемещение</button>' +
        '</div>';
      });

      html += '</div>';
    }

    if (res.unmet_demands && res.unmet_demands.length) {
      html += '<div class="sec-title" style="color:var(--red);margin-bottom:.5rem">⚠️ Дефицит сети (Требуется закупка у поставщиков):</div>' +
        '<div style="display:flex;flex-direction:column;gap:.5rem">';
      res.unmet_demands.forEach(function(u) {
        html += '<div class="card p" style="border-left:4px solid var(--red);display:flex;justify-content:space-between;align-items:center">' +
          '<div>' +
            '<div style="font-weight:600">' + escHtml(u.material_name) + ' для ' + escHtml(u.contractor_name) + '</div>' +
            '<div style="font-size:.8rem;color:var(--red)">Не хватает: ' + u.deficit_qty + ' ' + u.unit + '</div>' +
          '</div>' +
          '<span class="badge b-red">' + u.recommendation + '</span>' +
        '</div>';
      });
      html += '</div>';
    }

    if (resCont) resCont.innerHTML = html;
  })
  .catch(function(err) {
    if (resCont) resCont.innerHTML = '<div style="color:var(--red);padding:1rem">Ошибка запуска: ' + err.message + '</div>';
  });
}

function executeTransfer(srcWh, tgtWh, matId, qty, matName) {
  if (!tgtWh) {
    alert('У подрядчика не назначен виртуальный склад!');
    return;
  }
  if (!confirm('Подтвердить отгрузку ' + qty + ' ед. (' + matName + ')?')) return;

  fetch('/api/stock/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
    body: JSON.stringify({
      source_warehouse_id: srcWh,
      target_warehouse_id: tgtWh,
      items: [{ material_id: matId, quantity: qty }],
      comment: 'Отгрузка по оптимизации CP-SAT'
    })
  })
  .then(function(r){ return r.json(); })
  .then(function(res) {
    if (res.success) {
      alert('✅ Накладная перемещения успешно проведена!');
      runCpSatSupplyOptimization();
    } else {
      alert('Ошибка: ' + (res.error || 'не удалось провести перемещение'));
    }
  });
}

// ─── ФУНКЦИИ ПРОГНОЗИРОВАНИЯ ПОСТАВОК И ЗАКАЗОВ (MRP & RUN-RATE) ─────────────

function loadSupplyForecastView() {
  var container = document.getElementById('supply-forecast-container');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:2.5rem;color:var(--text-3)">⏳ Выполняется расчет материальных потребностей и загрузка заказов…</div>';

  Promise.all([
    fetch('/api/forecast/mrp', { headers: { 'Authorization': 'Bearer ' + S.token } }).then(function(r){ return r.json(); }),
    fetch('/api/forecast/run-rate', { headers: { 'Authorization': 'Bearer ' + S.token } }).then(function(r){ return r.json(); }),
    fetch('/api/purchase-orders', { headers: { 'Authorization': 'Bearer ' + S.token } }).then(function(r){ return r.json(); }),
    fetch('/api/suppliers', { headers: { 'Authorization': 'Bearer ' + S.token } }).then(function(r){ return r.json(); })
  ])
  .then(function(results) {
    var mrp = results[0] || { summary: {}, items: [] };
    var runRate = results[1] || { period_stats: {}, materials_run_rate: [] };
    var orders = results[2] || [];
    var suppliers = results[3] || [];
    S._suppliersList = suppliers;

    var sum = mrp.summary || {};
    var inTransitOrders = orders.filter(function(o){ return o.status === 'ordered' || o.status === 'in_transit'; });

    var html = '';

    // ─── 1. KPI КАРТОЧКИ ─────────────────────────────────────────────────────
    html += '<div class="stats mb">' +
      '<div class="card stat">' +
        '<div class="stat-lbl">🔴 Критично к заказу</div>' +
        '<div class="stat-val" style="color:var(--red)">' + (sum.critical_count || 0) + ' поз.</div>' +
        '<div class="stat-sub">дедлайн заказа уже наступил</div>' +
      '</div>' +
      '<div class="card stat">' +
        '<div class="stat-lbl">🟡 Заказать на этой неделе</div>' +
        '<div class="stat-val" style="color:var(--orange)">' + (sum.warning_count || 0) + ' поз.</div>' +
        '<div class="stat-sub">до даты выхода &le; 7 дней + Lead Time</div>' +
      '</div>' +
      '<div class="card stat">' +
        '<div class="stat-lbl">🚚 Заказы в пути</div>' +
        '<div class="stat-val" style="color:var(--blue)">' + inTransitOrders.length + ' зак.</div>' +
        '<div class="stat-sub">ожидаются от поставщиков</div>' +
      '</div>' +
      '<div class="card stat">' +
        '<div class="stat-lbl">💰 Оценка бюджета закупки</div>' +
        '<div class="stat-val" style="font-size:1.35rem;color:var(--text)">' + fmtMoney(sum.total_estimated_cost || 0) + '</div>' +
        '<div class="stat-sub">под выявленный дефицит</div>' +
      '</div>' +
    '</div>';

    // ─── 2. БЛОК MRP: КАЛЕНДАРНЫЙ ПЛАН ПОСТАВОК ПОД ДАТЫ ВЫХОДА ──────────────
    html += '<div class="card p mb">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:.75rem">' +
        '<div>' +
          '<div class="sec-title" style="margin:0">📅 Календарный план поставок под даты выхода на монтаж (MRP)</div>' +
          '<div style="font-size:.8rem;color:var(--text-3);margin-top:2px">' +
            'Формула: <strong>К заказу = План проекта − Свободный остаток − В пути</strong>. Округлено вверх до складских квантов (бухты 305м, хлысты 2м).' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:.5rem">' +
          '<button class="btn btn-sm btn-primary" onclick="openCreatePurchaseOrderModal()">➕ Сформировать заказ поставщику</button>' +
          '<button class="btn btn-sm btn-ghost" onclick="loadSupplyForecastView()">🔄</button>' +
        '</div>' +
      '</div>';

    if (!mrp.items || !mrp.items.length) {
      html += '<div class="t3" style="text-align:center;padding:2rem;background:var(--bg);border-radius:6px">Дефицитов нет! Все плановые потребности проектов закрыты складскими запасами или поставками в пути.</div>';
    } else {
      html += '<div class="tbl-wrap" style="max-height:480px;overflow-y:auto"><table class="tbl">' +
        '<thead><tr>' +
          '<th>Заявка / Объект</th>' +
          '<th>Дата выхода</th>' +
          '<th>Материал</th>' +
          '<th style="text-align:right">План проекта</th>' +
          '<th style="text-align:right">Свободно</th>' +
          '<th style="text-align:right">В пути</th>' +
          '<th style="text-align:right;color:var(--blue)">К заказу</th>' +
          '<th>Дедлайн заказа</th>' +
          '<th>Срочность</th>' +
          '<th>Действие</th>' +
        '</tr></thead><tbody>';

      mrp.items.forEach(function(it) {
        var urgBadge = '';
        if (it.urgency === 'critical') {
          urgBadge = '<span class="badge b-red">🔴 Просрочен (' + it.days_until_order + ' дн)</span>';
        } else if (it.urgency === 'warning') {
          urgBadge = '<span class="badge b-orange">🟡 ' + it.days_until_order + ' дн</span>';
        } else {
          urgBadge = '<span class="badge b-green">🟢 ' + it.days_until_order + ' дн</span>';
        }

        var orderText = it.net_demand > 0
          ? ('<strong style="color:var(--blue)">' + it.rounded_order_qty + ' ' + it.unit + '</strong>' +
             (it.packages_to_order ? '<br><span style="font-size:.72rem;color:var(--text-3)">' + it.packages_to_order + ' ' + it.package_unit + '</span>' : ''))
          : '<span style="color:var(--green)">✓ 0</span>';

        html += '<tr>' +
          '<td>' +
            '<strong>#' + escHtml(it.task_id) + '</strong>' +
            (it.region ? ' <span class="t3">[' + escHtml(it.region) + ']</span>' : '') +
            (it.address ? '<div style="font-size:.75rem;color:var(--text-2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(it.address) + '</div>' : '') +
          '</td>' +
          '<td><span style="font-weight:600">' + (it.work_date || '—') + '</span></td>' +
          '<td>' +
            '<strong>' + escHtml(it.material_name) + '</strong>' +
            '<div style="font-size:.72rem;color:var(--text-3)">' + escHtml(it.material_code) + '</div>' +
          '</td>' +
          '<td style="text-align:right">' + it.gross_demand + ' ' + it.unit + '</td>' +
          '<td style="text-align:right">' + it.free_stock + ' ' + it.unit + '</td>' +
          '<td style="text-align:right">' + it.in_transit + ' ' + it.unit + '</td>' +
          '<td style="text-align:right">' + orderText + '</td>' +
          '<td><span style="font-size:.82rem;font-weight:600">' + (it.order_deadline || '—') + '</span></td>' +
          '<td>' + urgBadge + '</td>' +
          '<td>' +
            (it.net_demand > 0
              ? '<button class="btn btn-sm" style="font-size:.72rem;padding:3px 8px" onclick="openCreatePurchaseOrderModal(' + it.material_id + ', ' + it.rounded_order_qty + ')">➕ Заказать</button>'
              : '<span class="t3">—</span>') +
          '</td>' +
        '</tr>';
      });

      html += '</tbody></table></div>';
    }
    html += '</div>';

    // ─── 3. ДВУХКОЛОНОЧНЫЙ БЛОК: СТАТИСТИЧЕСКИЙ ПРОГНОЗ + ЗАКАЗЫ ПОСТАВЩИКАМ ──
    html += '<div class="g2 mb">' +
      // Левая колонка: Статистический прогноз по типовику
      '<div class="card p">' +
        '<div class="sec-title" style="margin-bottom:.5rem">📊 Статистический прогноз по типовику (Run-Rate)</div>' +
        '<div style="font-size:.8rem;color:var(--text-2);margin-bottom:.85rem">' +
          'На основе ' + (runRate.period_stats && runRate.period_stats.done_30d ? runRate.period_stats.done_30d : 0) + ' выполненных заявок за 30 дней. Рассчитан неснижаемый буфер (Safety Stock).' +
        '</div>' +
        '<div class="tbl-wrap"><table class="tbl">' +
          '<thead><tr>' +
            '<th>Материал</th>' +
            '<th style="text-align:right">Расход / заявка</th>' +
            '<th style="text-align:right">Прогноз / мес</th>' +
            '<th style="text-align:right;color:var(--orange-dark)">Мин. остаток</th>' +
          '</tr></thead><tbody>';

    (runRate.materials_run_rate || []).slice(0, 7).forEach(function(mr) {
      html += '<tr>' +
        '<td><strong>' + escHtml(mr.name) + '</strong></td>' +
        '<td style="text-align:right">' + mr.avg_per_task + ' ' + mr.unit + '</td>' +
        '<td style="text-align:right;font-weight:600">' + mr.projected_monthly + ' ' + mr.unit + '</td>' +
        '<td style="text-align:right;font-weight:700;color:var(--orange-dark)">' + mr.recommended_safety_stock + ' ' + mr.unit + '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div></div>' +

      // Правая колонка: Заказы поставщикам (Purchase Orders)
      '<div class="card p">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
          '<div class="sec-title" style="margin:0">🚚 Заказы поставщикам</div>' +
          '<button class="btn btn-sm" onclick="openCreatePurchaseOrderModal()">➕ Создать заказ</button>' +
        '</div>' +
        '<div style="font-size:.8rem;color:var(--text-2);margin-bottom:.85rem">' +
          'Учет поставок в пути и оприходование на склад в 1 клик.' +
        '</div>';

    if (!orders || !orders.length) {
      html += '<div class="t3" style="text-align:center;padding:2rem;background:var(--bg);border-radius:6px">Заказов поставщикам пока нет.</div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:.6rem;max-height:420px;overflow-y:auto">';
      orders.forEach(function(o) {
        var statusBadge = '';
        if (o.status === 'received') {
          statusBadge = '<span class="badge b-green">✅ Оприходован</span>';
        } else if (o.status === 'in_transit' || o.status === 'ordered') {
          statusBadge = '<span class="badge b-blue">🚚 В пути (до ' + (o.expected_delivery_date || '—') + ')</span>';
        } else {
          statusBadge = '<span class="badge b-gray">' + escHtml(o.status) + '</span>';
        }

        var itemsSummary = (o.items || []).map(function(it) {
          return it.quantity + ' ' + it.unit + ' ' + escHtml(it.name);
        }).join(', ');

        html += '<div style="padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem">' +
            '<div>' +
              '<div style="font-weight:700;font-size:.9rem">Заказ #' + escHtml(o.order_number) + '</div>' +
              '<div style="font-size:.8rem;color:var(--text-2);margin-top:2px">' +
                'Поставщик: <strong>' + escHtml(o.supplier_name || 'Не указан') + '</strong> → Склад: <strong>' + escHtml(o.warehouse_name || 'Центральный') + '</strong>' +
              '</div>' +
            '</div>' +
            '<div>' + statusBadge + '</div>' +
          '</div>' +
          (itemsSummary ? '<div style="font-size:.78rem;color:var(--text-3);margin-top:5px;line-height:1.3">Позиции: ' + escHtml(itemsSummary) + '</div>' : '') +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;border-top:1px dashed var(--border);padding-top:6px">' +
            '<span style="font-weight:700;font-size:.85rem">Сумма: ' + fmtMoney(o.total_amount || 0) + '</span>' +
            (o.status !== 'received'
              ? '<button class="btn btn-sm btn-primary" style="font-size:.75rem;padding:3px 10px" onclick="receivePurchaseOrder(' + o.id + ', \'' + escHtml(o.order_number) + '\')">📦 Оприходовать на склад</button>'
              : '<span style="font-size:.72rem;color:var(--green);font-weight:600">Поступило на баланс</span>') +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    html += '</div></div>';

    container.innerHTML = html;
  })
  .catch(function(err) {
    container.innerHTML = '<div style="color:var(--red);padding:2rem;text-align:center">Ошибка загрузки прогноза: ' + err.message + '</div>';
  });
}

function openCreatePurchaseOrderModal(prefillMatId, prefillQty) {
  fetch('/api/materials', { headers: { 'Authorization': 'Bearer ' + S.token } })
    .then(function(r){ return r.json(); })
    .then(function(mats) {
      var matOptions = (mats || []).map(function(m) {
        return { value: m.id, label: m.name + ' (' + (m.package_unit || m.unit) + ', ' + (m.price_default || 0) + ' руб.)' };
      });

      var suppOptions = (S._suppliersList || []).map(function(s) {
        return { value: s.id, label: s.name + ' (доставка ' + s.lead_time_days + ' дн)' };
      });
      if (!suppOptions.length) suppOptions.push({ value: '', label: 'Поставщик по умолчанию' });

      var defaultDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

      showModal('➕ Создать заказ поставщику', [
        { key: 'supplier_id', label: 'Поставщик', type: 'select', value: (suppOptions[0] ? suppOptions[0].value : ''), options: suppOptions },
        { key: 'material_id', label: 'Материал', type: 'select', value: prefillMatId || (mats[0] ? mats[0].id : ''), options: matOptions },
        { key: 'quantity', label: 'Количество', type: 'number', value: prefillQty || 100, required: true },
        { key: 'unit_price', label: 'Цена за ед. (руб.)', type: 'number', value: (mats.find(function(m){return m.id == (prefillMatId || (mats[0] ? mats[0].id : null));}) || {}).price_default || 45 },
        { key: 'expected_date', label: 'Ожидаемая дата поставки', type: 'date', value: defaultDate },
        { key: 'notes', label: 'Примечание к заказу', type: 'text', placeholder: 'Например: закупка кабеля под проект Сбера' }
      ], function(d) {
        var q = parseFloat(d.quantity) || 0;
        var p = parseFloat(d.unit_price) || 0;
        if (q <= 0) return alert('Укажите количество больше нуля');

        var mat = mats.find(function(m){ return m.id == d.material_id; });
        var pkgUnits = mat && mat.package_qty ? Math.ceil(q / mat.package_qty) : 1;

        var body = {
          supplier_id: d.supplier_id ? parseInt(d.supplier_id) : null,
          status: 'ordered',
          expected_delivery_date: d.expected_date,
          notes: d.notes,
          items: [{
            material_id: parseInt(d.material_id),
            quantity: q,
            unit_price: p,
            package_units: pkgUnits
          }]
        };

        fetch('/api/purchase-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
          body: JSON.stringify(body)
        })
        .then(function(r){ return r.json(); })
        .then(function(res) {
          if (res && res.success) {
            alert('✅ Заказ поставщику #' + res.purchase_order.order_number + ' успешно создан и запущен в доставку!');
            loadSupplyForecastView();
          } else {
            alert('Ошибка создания заказа: ' + ((res && res.error) || 'неизвестная ошибка'));
          }
        });
      });
    });
}

function receivePurchaseOrder(poId, orderNum) {
  if (!confirm('Оприходовать поставку #' + orderNum + ' на Центральный склад?\nМатериалы будут зачислены на баланс, а статус "В пути" закрыт.')) return;

  fetch('/api/purchase-orders/' + poId + '/receive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token }
  })
  .then(function(r){ return r.json(); })
  .then(function(res) {
    if (res && res.success) {
      alert('✅ ' + res.message);
      loadSupplyForecastView();
    } else {
      alert('Ошибка оприходования: ' + ((res && res.error) || 'неизвестная ошибка'));
    }
  })
  .catch(function(err) {
    alert('Ошибка соединения: ' + err.message);
  });
}
