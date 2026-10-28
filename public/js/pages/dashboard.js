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

function filterAndGoContracts(filterObj) {
  if (typeof clearContractFilters === 'function') {
    clearContractFilters();
  } else {
    S.contractSearch = '';
    S.contractType = 'all';
    S.contractCustomer = 'all';
    S.contractStatus = 'all';
    S.contractYear = 'all';
    S.contractManager = 'all';
    S.contractEntity = 'all';
  }
  if (filterObj && filterObj.customer !== undefined) {
    S.contractCustomer = filterObj.customer;
  }
  go('contracts');
}
window.filterAndGoContracts = filterAndGoContracts;
window.filterAndGoTasks = filterAndGoTasks;

function pageDash(subSection) {
  subSection = subSection || (S.page.startsWith('dash-') ? S.page.replace('dash-', '') : 'summary');

  var s = S.stats;
  var total   = s.tasks   && s.tasks.total    || 0;
  var done    = s.tasks   && s.tasks.done     || 0;
  var pend    = s.tasks   && s.tasks.pending  || 0;
  var overdue = s.supply  && s.supply.overdue || 0;
  var revenue = s.revenue && s.revenue.total  || 0;

  // 1. ПОДРАЗДЕЛ: ЗАКАЗЧИКИ (Строковый табличный вид с поиском, фильтрами и сортировкой)
  if (subSection === 'customers') {
    var custMap = {};

    // 1. Инициализируем всеми действующими контрактами
    (S.contracts || []).forEach(function(ct) {
      if (!ct.customer_name) return;
      var cName = ct.customer_name.trim();
      if (!cName) return;
      if (!custMap[cName]) {
        custMap[cName] = {
          name: cName,
          total: 0,
          done: 0,
          overdue: 0,
          inWork: 0,
          amount: Number(ct.amount || 0),
          contractsCount: 1
        };
      } else {
        custMap[cName].amount += Number(ct.amount || 0);
        custMap[cName].contractsCount = (custMap[cName].contractsCount || 1) + 1;
      }
    });

    // 2. Дополняем и агрегируем заявки с авто-резолвом Заказчика по контракту
    var tasksSumByCust = {};
    (S.tasks || []).forEach(function(t) {
      var c = t.customer;
      var cid = t.contract_id != null ? t.contract_id : t.contractId;
      if ((!c || c.toLowerCase().includes('сбер')) && cid) {
        var linkedC = (S.contracts || []).find(function(x){ return String(x.id) === String(cid); });
        if (linkedC && linkedC.customer_name && !linkedC.customer_name.toLowerCase().includes('сбер')) {
          c = linkedC.customer_name;
        }
      }
      c = (c && c.trim()) || 'ПАО Сбербанк';

      if (!custMap[c]) {
        custMap[c] = { name: c, total: 0, done: 0, overdue: 0, inWork: 0, amount: 0, contractsCount: 0 };
      }
      custMap[c].total++;
      if (t.status === 'done' || t.macroStatus === 'paid' || t.macroStatus === 'billing') custMap[c].done++;
      else custMap[c].inWork++;
      if (t.overdueDays > 0) custMap[c].overdue++;

      tasksSumByCust[c] = (tasksSumByCust[c] || 0) + Number(t.amount || 0);
    });

    // Если у заказчика есть заявки с суммами, берем сумму заявок (если она больше или контракт не имел суммы)
    Object.keys(custMap).forEach(function(cName) {
      if (tasksSumByCust[cName] && tasksSumByCust[cName] > 0) {
        if (!custMap[cName].amount || tasksSumByCust[cName] > custMap[cName].amount) {
          custMap[cName].amount = tasksSumByCust[cName];
        }
      }
    });

    var custList = Object.values(custMap);

    // Параметры фильтрации и поиска
    S.dashCustQ = S.dashCustQ || '';
    S.dashCustFilter = S.dashCustFilter || 'all';
    S.dashCustSort = S.dashCustSort || 'amount_desc';

    var filteredCust = custList.filter(function(c) {
      if (S.dashCustQ) {
        var qLower = S.dashCustQ.toLowerCase().trim();
        if (!c.name.toLowerCase().includes(qLower)) return false;
      }
      if (S.dashCustFilter === 'active' && c.inWork === 0) return false;
      if (S.dashCustFilter === 'done' && (c.done === 0 || c.inWork > 0)) return false;
      if (S.dashCustFilter === 'overdue' && c.overdue === 0) return false;
      return true;
    });

    // Сортировка
    filteredCust.sort(function(a, b) {
      if (S.dashCustSort === 'amount_desc') return b.amount - a.amount;
      if (S.dashCustSort === 'amount_asc') return a.amount - b.amount;
      if (S.dashCustSort === 'total_desc') return b.total - a.total;
      if (S.dashCustSort === 'total_asc') return a.total - b.total;
      if (S.dashCustSort === 'inwork_desc') return b.inWork - a.inWork;
      if (S.dashCustSort === 'overdue_desc') return b.overdue - a.overdue;
      if (S.dashCustSort === 'contracts_desc') return b.contractsCount - a.contractsCount;
      if (S.dashCustSort === 'name_asc') return a.name.localeCompare(b.name);
      return b.amount - a.amount;
    });

    var sumTotalAmt = custList.reduce(function(acc, c) { return acc + c.amount; }, 0);
    var sumTotalTasks = custList.reduce(function(acc, c) { return acc + c.total; }, 0);
    var sumDoneTasks = custList.reduce(function(acc, c) { return acc + c.done; }, 0);
    var sumInWorkTasks = custList.reduce(function(acc, c) { return acc + c.inWork; }, 0);
    var sumOverdueTasks = custList.reduce(function(acc, c) { return acc + c.overdue; }, 0);
    var sumContracts = custList.reduce(function(acc, c) { return acc + c.contractsCount; }, 0);

    window.onDashCustSearch = function(val) {
      S.dashCustQ = val;
      renderApp();
    };
    window.setDashCustFilter = function(filterVal) {
      S.dashCustFilter = filterVal;
      renderApp();
    };
    window.sortDashCust = function(field) {
      if (S.dashCustSort === field + '_desc') S.dashCustSort = field + '_asc';
      else S.dashCustSort = field + '_desc';
      renderApp();
    };

    function custSortIndicator(f) {
      if (!S.dashCustSort || !S.dashCustSort.startsWith(f + '_')) return '';
      return S.dashCustSort.endsWith('_asc') ? ' ▲' : ' ▼';
    }

    var tableRows = filteredCust.map(function(c) {
      var p = c.total > 0 ? pct(c.done, c.total) : 0;
      var contractsBadge = c.contractsCount > 0
        ? ('<button type="button" class="badge b-blue" style="font-size:.72rem;cursor:pointer;border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:12px;font-weight:600" title="Посмотреть договоры" onclick="event.stopPropagation(); filterAndGoContracts({customer:\'' + escHtml(c.name) + '\'})">📄 ' + c.contractsCount + ' дог. ➔</button>')
        : '<span class="t3" style="font-size:.75rem">—</span>';

      return `
        <tr style="cursor:pointer; transition:background 0.1s" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''" onclick="filterAndGoTasks({customer:'${escHtml(c.name)}'})">
          <td style="padding:10px 14px">
            <div style="font-weight:700; font-size:.9rem; color:var(--text); display:flex; align-items:center; gap:8px">
              <span class="badge b-customer" style="font-size:.65rem; padding:1px 5px">Заказчик</span>
              <span>${escHtml(c.name)}</span>
            </div>
          </td>
          <td style="text-align:center; padding:10px 8px">${contractsBadge}</td>
          <td style="text-align:center; font-weight:700; padding:10px 8px">${fmtN(c.total)}</td>
          <td style="text-align:center; font-weight:700; color:var(--orange); padding:10px 8px">${fmtN(c.inWork)}</td>
          <td style="text-align:center; font-weight:700; color:var(--green); padding:10px 8px">${fmtN(c.done)}</td>
          <td style="text-align:center; padding:10px 8px; font-weight:${c.overdue > 0 ? '700' : '400'}; color:${c.overdue > 0 ? 'var(--red)' : 'var(--text-3)'}">
            ${c.overdue > 0 ? ('⚠️ ' + c.overdue) : '0'}
          </td>
          <td style="padding:10px 12px; min-width:130px">
            ${c.total > 0 ? `<div style="display:flex; align-items:center; gap:6px">${bar(c.done, c.total)}<span style="font-size:.75rem; font-weight:700; min-width:32px">${p}%</span></div>` : '<span class="t3" style="font-size:.75rem">Договор подписан</span>'}
          </td>
          <td style="text-align:right; font-weight:700; font-family:monospace; font-size:.92rem; color:var(--blue); padding:10px 14px; white-space:nowrap">
            ${fmtMoney(c.amount)}
          </td>
          <td style="text-align:center; padding:10px 8px; white-space:nowrap" onclick="event.stopPropagation()">
            <button class="btn btn-xs btn-ghost" style="border:1px solid var(--border); font-size:.75rem" onclick="filterAndGoTasks({customer:'${escHtml(c.name)}'})">Заявки ➔</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:10px">
        <div>
          <h1 class="page-title" style="margin:0; display:inline-flex; align-items:center; gap:8px">
            <span class="topbar-title-icon">${ICONS.analytics}</span>
            <span>Аналитика: Заказчики</span>
          </h1>
          <p class="t3" style="font-size:.85rem; margin:4px 0 0 0">Реестр генеральных заказчиков, объемы по контрактам, ход исполнения и контроль просрочки.</p>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="go('dashboard')">← Назад в Обзор</button>
      </div>

      <!-- Сводные показатели -->
      <div class="g4 mb" style="gap:.75rem">
        <div class="card stat">
          <div class="stat-val" style="color:var(--text)">${custList.length}</div>
          <div class="stat-lbl">Всего заказчиков</div>
          <div style="font-size:.75rem; color:var(--text-3); margin-top:2px">Договоров: ${sumContracts}</div>
        </div>
        <div class="card stat">
          <div class="stat-val" style="color:var(--blue)">${fmtMoney(sumTotalAmt)}</div>
          <div class="stat-lbl">Общий объем (вход)</div>
          <div style="font-size:.75rem; color:var(--text-3); margin-top:2px">Контракты и заявки</div>
        </div>
        <div class="card stat">
          <div class="stat-val" style="color:var(--orange)">${fmtN(sumInWorkTasks)}</div>
          <div class="stat-lbl">Заявок в работе</div>
          <div style="font-size:.75rem; color:var(--green); margin-top:2px">Выполнено: ${fmtN(sumDoneTasks)} из ${sumTotalTasks}</div>
        </div>
        <div class="card stat">
          <div class="stat-val" style="color:${sumOverdueTasks > 0 ? 'var(--red)' : 'var(--green)'}">${sumOverdueTasks}</div>
          <div class="stat-lbl">Просрочено заявок</div>
          <div style="font-size:.75rem; color:var(--text-3); margin-top:2px">${sumOverdueTasks > 0 ? 'Требует внимания ПМ' : 'Все в графике'}</div>
        </div>
      </div>

      <!-- Панель поиска и фильтров -->
      <div class="card p-3 mb" style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; margin-bottom:1rem; padding:12px 16px">
        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between">
          <div style="display:flex; flex:1; min-width:280px; gap:8px; align-items:center">
            <input type="text" placeholder="🔍 Поиск заказчика по названию..." value="${escHtml(S.dashCustQ)}" 
                   oninput="window.onDashCustSearch(this.value)" style="flex:1; height:36px; padding:0 12px; border:1.5px solid var(--border); border-radius:6px; font-size:.85rem">
            ${S.dashCustQ ? '<button type="button" class="btn btn-sm btn-ghost" onclick="window.onDashCustSearch(\'\')" style="height:36px">✕</button>' : ''}
          </div>

          <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center">
            <span style="font-size:.75rem; font-weight:700; color:var(--text-3); text-transform:uppercase">Фильтр:</span>
            <button type="button" class="btn btn-sm ${S.dashCustFilter === 'all' ? 'btn-primary' : 'btn-ghost'}" style="font-size:.78rem; padding:4px 10px" onclick="window.setDashCustFilter('all')">Все (${custList.length})</button>
            <button type="button" class="btn btn-sm ${S.dashCustFilter === 'active' ? 'btn-primary' : 'btn-ghost'}" style="font-size:.78rem; padding:4px 10px" onclick="window.setDashCustFilter('active')">В работе (${custList.filter(x => x.inWork > 0).length})</button>
            <button type="button" class="btn btn-sm ${S.dashCustFilter === 'overdue' ? 'btn-primary' : 'btn-ghost'}" style="font-size:.78rem; padding:4px 10px; color:${custList.filter(x => x.overdue > 0).length > 0 ? 'var(--red)' : ''}" onclick="window.setDashCustFilter('overdue')">С просрочкой (${custList.filter(x => x.overdue > 0).length})</button>
            <button type="button" class="btn btn-sm ${S.dashCustFilter === 'done' ? 'btn-primary' : 'btn-ghost'}" style="font-size:.78rem; padding:4px 10px" onclick="window.setDashCustFilter('done')">Завершенные</button>
          </div>
        </div>
      </div>

      <!-- Таблица заказчиков (Строковый вид) -->
      <div class="card tbl-wrap" style="overflow-x:auto">
        <table class="tasks-table" style="width:100%; border-collapse:collapse">
          <thead>
            <tr>
              <th style="cursor:pointer; user-select:none; text-align:left; padding:10px 14px" onclick="window.sortDashCust('name')" title="Сортировка по имени">Заказчик${custSortIndicator('name')}</th>
              <th style="cursor:pointer; user-select:none; text-align:center; width:95px; padding:10px 8px" onclick="window.sortDashCust('contracts')" title="Сортировка по договорам">Договоры${custSortIndicator('contracts')}</th>
              <th style="cursor:pointer; user-select:none; text-align:center; width:85px; padding:10px 8px" onclick="window.sortDashCust('total')" title="Сортировка по общему числу заявок">Заявок${custSortIndicator('total')}</th>
              <th style="cursor:pointer; user-select:none; text-align:center; width:85px; padding:10px 8px" onclick="window.sortDashCust('inwork')" title="Сортировка по заявкам в работе">В работе${custSortIndicator('inwork')}</th>
              <th style="text-align:center; width:80px; padding:10px 8px">Готово</th>
              <th style="cursor:pointer; user-select:none; text-align:center; width:95px; padding:10px 8px" onclick="window.sortDashCust('overdue')" title="Сортировка по просрочке">Просрочка${custSortIndicator('overdue')}</th>
              <th style="width:150px; padding:10px 12px">Прогресс</th>
              <th style="cursor:pointer; user-select:none; text-align:right; width:140px; padding:10px 14px" onclick="window.sortDashCust('amount')" title="Сортировка по сумме">Объем (₽)${custSortIndicator('amount')}</th>
              <th style="width:80px; text-align:center; padding:10px 8px"></th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-3)">Заказчиков по заданным фильтрам не найдено</td></tr>'}
          </tbody>
        </table>
      </div>
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