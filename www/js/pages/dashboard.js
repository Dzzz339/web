function filterAndGoTasks(filterObj) {
  clearFilters();
  if (filterObj.q !== undefined) S.taskQ = filterObj.q;
  if (filterObj.st !== undefined) S.taskSt = filterObj.st;
  if (filterObj.reg !== undefined) S.taskReg = filterObj.reg;
  if (filterObj.mgr !== undefined) S.taskMgr = filterObj.mgr;
  if (filterObj.ovd !== undefined) S.taskOverdue = filterObj.ovd;
  if (filterObj.customer !== undefined) S.taskCustomer = filterObj.customer;
  if (filterObj.contractor !== undefined) S.taskContractor = filterObj.contractor;
  go('tasks');
}

function pageDash(subSection) {
  subSection = subSection || (S.page.startsWith('dash-') ? S.page.replace('dash-', '') : 'summary');

  var s = S.stats;
  var total   = s.tasks   && s.tasks.total    || 0;
  var done    = s.tasks   && s.tasks.done     || 0;
  var pend    = s.tasks   && s.tasks.pending  || 0;
  var overdue = s.supply  && s.supply.overdue || 0;
  var revenue = s.revenue && s.revenue.total  || 0;

  // 1. ПОДРАЗДЕЛ: ЗАКАЗЧИКИ
  if (subSection === 'customers') {
    var custMap = {};
    S.tasks.forEach(function(t) {
      var c = t.customer || 'ПАО Сбербанк';
      if (!custMap[c]) custMap[c] = { name: c, total: 0, done: 0, overdue: 0, inWork: 0, amount: 0 };
      custMap[c].total++;
      if (t.status === 'done') custMap[c].done++;
      else custMap[c].inWork++;
      if (t.overdueDays > 0) custMap[c].overdue++;
      custMap[c].amount += Number(t.amount || 0);
    });
    var custList = Object.values(custMap).sort(function(a,b){ return b.total - a.total; });

    var cardsHtml = custList.map(function(c) {
      var p = pct(c.done, c.total);
      return `
        <div class="card p" style="cursor:pointer; transition:transform 0.12s, box-shadow 0.12s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'" onclick="filterAndGoTasks({customer:'${escHtml(c.name)}'})">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:.75rem">
            <div>
              <span class="badge b-customer" style="margin-bottom:4px; display:inline-block">Заказчик</span>
              <div style="font-weight:700; font-size:1.1rem">${escHtml(c.name)}</div>
            </div>
            <div style="font-weight:700; font-size:1.15rem; color:var(--blue)">${fmtMoney(c.amount)}</div>
          </div>
          <div class="g3 mb" style="gap:.5rem; font-size:.85rem">
            <div style="background:var(--bg); padding:6px 8px; border-radius:6px">Всего: <b>${fmtN(c.total)}</b></div>
            <div style="background:var(--bg); padding:6px 8px; border-radius:6px; color:var(--green)">Готово: <b>${fmtN(c.done)}</b></div>
            <div style="background:var(--bg); padding:6px 8px; border-radius:6px; color:${c.overdue>0?'var(--red)':'var(--text-3)'}">Просрочено: <b>${fmtN(c.overdue)}</b></div>
          </div>
          ${bar(c.done, c.total)}
          <div style="text-align:right; font-size:.75rem; color:var(--text-3); margin-top:4px">${p}% завершено (клик для перехода к заявкам) ➔</div>
        </div>
      `;
    }).join('');

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem">
        <h1 class="page-title" style="margin:0; display:inline-flex; align-items:center; gap:8px"><span class="topbar-title-icon">${ICONS.analytics}</span><span>Аналитика: Заказчики</span></h1>
        <button class="btn btn-sm btn-ghost" onclick="go('dashboard')">← Назад в Обзор</button>
      </div>
      <p class="t3 mb" style="font-size:.85rem">Срез выполнения работ и объёмов в разрезе генеральных заказчиков.</p>
      <div class="g2" style="gap:1rem">${cardsHtml || '<div class="card p t3">Нет данных</div>'}</div>
    `;
  }

  // 2. ПОДРАЗДЕЛ: ИСПОЛНИТЕЛИ
  if (subSection === 'executors') {
    var execMap = {};
    S.tasks.forEach(function(t) {
      var e = t.assignee || t.contractor || 'Не назначен';
      if (!execMap[e]) execMap[e] = { name: e, total: 0, done: 0, inWork: 0, overdue: 0, pay: 0, ports: 0 };
      execMap[e].total++;
      if (t.status === 'done') execMap[e].done++;
      else execMap[e].inWork++;
      if (t.overdueDays > 0) execMap[e].overdue++;
      execMap[e].ports += (t.fact || t.inOrder || 0);

      var f = getTaskFinance(t);
      execMap[e].pay += f.po;
    });
    var execList = Object.values(execMap).sort(function(a,b){ return b.total - a.total; });

    var execRows = execList.map(function(e) {
      return `
        <tr style="cursor:pointer" onclick="filterAndGoTasks({contractor:'${escHtml(e.name)}'})" title="Перейти к заявкам исполнителя">
          <td style="padding:10px 12px; font-weight:600">${escHtml(e.name)}</td>
          <td style="padding:10px 12px; text-align:right; font-weight:600">${fmtN(e.total)}</td>
          <td style="padding:10px 12px; text-align:right; color:var(--green)">${fmtN(e.done)}</td>
          <td style="padding:10px 12px; text-align:right; color:var(--orange)">${fmtN(e.inWork)}</td>
          <td style="padding:10px 12px; text-align:right; color:${e.overdue>0?'var(--red)':'var(--text-3)'}"><b>${fmtN(e.overdue)}</b></td>
          <td style="padding:10px 12px; text-align:right">${fmtN(e.ports)}</td>
          <td style="padding:10px 12px; text-align:right; font-weight:700; color:var(--orange)">${fmtMoney(e.pay)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem">
        <h1 class="page-title" style="margin:0; display:inline-flex; align-items:center; gap:8px"><span class="topbar-title-icon">${ICONS.analytics}</span><span>Аналитика: Исполнители</span></h1>
        <button class="btn btn-sm btn-ghost" onclick="go('dashboard')">← Назад в Обзор</button>
      </div>
      <div class="card tbl-wrap">
        <table>
          <thead>
            <tr style="background:var(--bg)">
              <th>Исполнитель / Подрядчик</th>
              <th style="text-align:right">Заявок</th>
              <th style="text-align:right">Готово</th>
              <th style="text-align:right">В работе</th>
              <th style="text-align:right">Просрочено</th>
              <th style="text-align:right">Портов</th>
              <th style="text-align:right">К выплате (ПО)</th>
            </tr>
          </thead>
          <tbody>${execRows}</tbody>
        </table>
      </div>
    `;
  }

  // 3. ПОДРАЗДЕЛ: ОПЛАТЫ НАМ VS ОПЛАТЫ НАШИ
  if (subSection === 'payments-in' || subSection === 'payments-out') {
    var isIncoming = subSection === 'payments-in';
    var title = isIncoming ? 'Оплаты нам (Дебиторка от Заказчиков)' : 'Оплаты наши (Выплаты Исполнителям)';
    
    var totalSum = 0;
    var paidSum = 0;
    S.tasks.forEach(function(t) {
      if (isIncoming) {
        totalSum += Number(t.amount || 0);
        if (t.status === 'done' && (t.oplata || '').toLowerCase().includes('оплач')) {
          paidSum += Number(t.amount || 0);
        }
      } else {
        var f = getTaskFinance(t);
        totalSum += f.po;
        if ((t.oplata || '').toLowerCase().includes('оплач')) {
          paidSum += f.po;
        }
      }
    });

    var debt = Math.max(0, totalSum - paidSum);

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem">
        <h1 class="page-title" style="margin:0">${title}</h1>
        <button class="btn btn-sm btn-ghost" onclick="go('dashboard')">← Назад в Обзор</button>
      </div>
      <div class="g3 mb">
        <div class="card stat"><div class="stat-lbl">Общая сумма</div><div class="stat-val">${fmtMoney(totalSum)}</div></div>
        <div class="card stat"><div class="stat-lbl">Оплачено</div><div class="stat-val" style="color:var(--green)">${fmtMoney(paidSum)}</div></div>
        <div class="card stat"><div class="stat-lbl">Остаток к ${isIncoming?'получению':'выплате'}</div><div class="stat-val" style="color:var(--orange)">${fmtMoney(debt)}</div></div>
      </div>
      <div class="card p" style="text-align:center; padding:2rem">
        <button class="btn" onclick="filterAndGoTasks({st:'done'})">Перейти к выполненным заявкам с расчетами ➔</button>
      </div>
    `;
  }

  // 4. ПОДРАЗДЕЛ: МАТЕРИАЛЫ
  if (subSection === 'materials') {
    var totalTmc = S.tasks.reduce(function(acc, t){ return acc + (t.tmc || 0); }, 0);
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem">
        <h1 class="page-title" style="margin:0; display:inline-flex; align-items:center; gap:8px"><span class="topbar-title-icon">${ICONS.analytics}</span><span>Аналитика: Материалы (ТМЦ)</span></h1>
        <button class="btn btn-sm btn-ghost" onclick="go('dashboard')">← Назад в Обзор</button>
      </div>
      <div class="g3 mb">
        <div class="card stat"><div class="stat-lbl">Общая сумма ТМЦ в заявках</div><div class="stat-val" style="color:var(--blue)">${fmtMoney(totalTmc)}</div></div>
      </div>
      <div id="checklists_summary_box" class="card p mb">
        <div class="sec-title">Потребность по чек-листам обследования</div>
        <div class="t3">Загрузка данных обследований…</div>
      </div>
    `;
  }

  // 5. ПОДРАЗДЕЛ: КАЛЕНДАРЬ
  if (subSection === 'calendar') {
    var calMap = {};
    S.tasks.forEach(function(t) {
      if (!t.deadline) return;
      var m = t.deadline.slice(0,7);
      if (!calMap[m]) calMap[m] = { month: m, total: 0, done: 0, overdue: 0 };
      calMap[m].total++;
      if (t.status === 'done') calMap[m].done++;
      if (t.overdueDays > 0) calMap[m].overdue++;
    });
    var calList = Object.values(calMap).sort(function(a,b){ return a.month.localeCompare(b.month); });

    var calRows = calList.map(function(c) {
      return `
        <tr style="cursor:pointer" onclick="filterAndGoTasks({q:'${c.month}'})" title="Перейти к заявкам за ${c.month}">
          <td style="padding:10px 12px; font-weight:600">📅 ${c.month}</td>
          <td style="padding:10px 12px; text-align:right"><b>${fmtN(c.total)}</b></td>
          <td style="padding:10px 12px; text-align:right; color:var(--green)">${fmtN(c.done)}</td>
          <td style="padding:10px 12px; text-align:right; color:${c.overdue>0?'var(--red)':'var(--text-3)'}"><b>${fmtN(c.overdue)}</b></td>
          <td style="padding:10px 12px">${bar(c.done, c.total)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem">
        <h1 class="page-title" style="margin:0">Календарь дедлайнов</h1>
        <button class="btn btn-sm btn-ghost" onclick="go('dashboard')">← Назад в Обзор</button>
      </div>
      <div class="card tbl-wrap">
        <table>
          <thead><tr style="background:var(--bg)"><th>Месяц</th><th style="text-align:right">Всего заявок</th><th style="text-align:right">Выполнено</th><th style="text-align:right">Просрочено</th><th>Прогресс</th></tr></thead>
          <tbody>${calRows || '<tr><td colspan="5" style="text-align:center;padding:2rem">Нет данных по дедлайнам</td></tr>'}</tbody>
        </table>
      </div>
    `;
  }

  // 0. ГЛАВНАЯ СВОДКА ОБЗОРА (С ИНТЕРАКТИВНЫМИ ПЛИТКАМИ DRILL-DOWN)
  var top = '';
  var chainsArray = Array.isArray(S.chains) ? S.chains : [];
  var topChains = chainsArray.slice().sort(function(a,b){ return b.totalTasks - a.totalTasks; }).slice(0,8);
  topChains.forEach(function(c) {
    var cp = pct(c.doneTasks, c.totalTasks);
    top += '<div style="margin-bottom:.6rem; cursor:pointer; padding:4px 6px; border-radius:6px" onmouseover="this.style.background=\'var(--orange-bg)\'" onmouseout="this.style.background=\'none\'" onclick="filterAndGoTasks({reg:\'' + escHtml(c.id) + '\'})" title="Перейти к заявкам региона ' + escHtml(c.id) + '">' +
      '<div class="row" style="justify-content:space-between;margin-bottom:3px">' +
        '<span class="fw6" style="font-size:.82rem">📍 ' + c.id + ' <span style="font-size:.7rem; color:var(--orange)">➔</span></span>' +
        '<span class="t3" style="font-size:.75rem">' + c.doneTasks + '/' + c.totalTasks + ' · ' + cp + '% · ' + fmtMoney(c.totalAmount) + '</span>' +
      '</div>' + bar(c.doneTasks, c.totalTasks) + '</div>';
  });

  return '<h1 class="page-title">Дашборд</h1>' +
    importBanner() +
    '<div class="g4">' +
      // ПЛИТКА 1: Всего заявок (Интерактивная)
      '<div class="card stat" style="cursor:pointer; transition:transform 0.12s;" onmouseover="this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.transform=\'none\'" onclick="filterAndGoTasks({})" title="Перейти ко всем заявкам">' +
        '<div class="stat-lbl">Всего заявок ➔</div><div class="stat-val">' + fmtN(total) + '</div>' +
        '<div class="stat-sub">✓ Готово: <strong>' + fmtN(done) + '</strong> · ⏳ В работе: <strong>' + fmtN(pend) + '</strong></div>' +
        bar(done, total) + '</div>' +

      // ПЛИТКА 2: Просрочено (Интерактивная)
      '<div class="card stat" style="cursor:pointer; transition:transform 0.12s;" onmouseover="this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.transform=\'none\'" onclick="filterAndGoTasks({ovd:\'yes\'})" title="Показать только просроченные заявки">' +
        '<div class="stat-lbl">Просрочено ➔</div><div class="stat-val" style="color:' + (overdue>0?'var(--red)':'var(--green)') + '">' + fmtN(overdue) + '</div>' +
        '<div class="stat-sub">заявок с превышением срока (клик для отбора)</div></div>' +

      // ПЛИТКА 3: Регионы / цепи (Интерактивная)
      '<div class="card stat" style="cursor:pointer; transition:transform 0.12s;" onmouseover="this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.transform=\'none\'" onclick="go(\'supply\')" title="Перейти в цепочки">' +
        '<div class="stat-lbl">Регионы / цепи ➔</div><div class="stat-val">' + S.chains.length + '</div>' +
        '<div class="stat-sub">✓ Завершено: <strong>' + S.chains.filter(function(c){return c.status==='completed';}).length + '</strong></div></div>' +

      // ПЛИТКА 4: Сумма договоров (Интерактивная)
      '<div class="card stat" style="cursor:pointer; transition:transform 0.12s;" onmouseover="this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.transform=\'none\'" onclick="go(\'dash-customers\')" title="Посмотреть разбивку по заказчикам">' +
        '<div class="stat-lbl">Сумма договоров ➔</div><div class="stat-val" style="font-size:1.4rem">' + fmtMoney(revenue) + '</div>' +
        '<div class="stat-sub">по всем заявкам (клик для среза по Заказчикам)</div></div>' +
    '</div>' +
    '<div class="card p"><div class="sec-title" style="display:flex; justify-content:space-between; align-items:center"><span>Топ регионов (кликните для отбора заявок)</span><button class="btn btn-sm btn-ghost" onclick="go(\'dash-customers\')">Группировка по Заказчикам ➔</button></div>' + (top || '<p class="t3">Нет данных</p>') + '</div>';
}

// ─── PAGE: SUPPLY ─────────────────────────────────────────────────────────────