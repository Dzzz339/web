function clearFilters() {
  S.taskQ=''; S.taskSt=''; S.taskPr=''; S.taskReg=''; S.taskMgr=''; S.taskPm=''; S.taskYear=''; S.taskOverdue='';
  S.taskCustomer=''; S.taskContractor=''; S.taskDistanceFilter='';
  S.taskArch='no'; S.taskStage=''; S.taskSort='date_desc'; S.taskView='all'; // Сбрасываем фильтры на дефолт (новые сверху)
  S.taskContractId = null; S.taskContractTitle = null;
  S.taskAgreementId = null; S.taskAgreementTitle = null;
  renderApp();
}

window.sortTasksBy = function(field) {
  if (S.taskSort && S.taskSort.startsWith(field + '_')) {
    S.taskSort = S.taskSort.endsWith('_desc') ? (field + '_asc') : (field + '_desc');
  } else {
    if (field === 'date' || field === 'amount' || field === 'id' || field === 'deadline') {
      S.taskSort = field + '_desc';
    } else {
      S.taskSort = field + '_asc';
    }
  }
  renderApp();
};

function toggleTasksFilters() {
  var qEl = document.getElementById('tq');
  if (qEl) S.taskQ = qEl.value;
  S.tasksFiltersOpen = !S.tasksFiltersOpen;
  renderApp();
}
window.toggleTasksFilters = toggleTasksFilters;
window.applyTasksFilters = applyTasksFilters;
window.clearFilters = clearFilters;
window.removeTaskFilter = removeTaskFilter;

function applyTasksFilters() {
  var v = function(id) { var el = document.getElementById(id); return el ? el.value : ''; };
  S.taskReg = v('treg');
  S.taskCustomer = v('tcust');
  S.taskMgr = v('tmgr');
  S.taskPm = v('tpm');
  S.taskStage = v('tstage');
  S.taskSt = v('tst');
  S.taskPr = v('tpr');
  S.taskOverdue = v('tovd');
  S.taskYear = v('tyr');
  S.taskContractor = v('tcontr');
  S.taskDistanceFilter = v('tdist');
  S.taskSort = v('tsort') || 'date_desc';
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
  else if (key === 'pm') S.taskPm = '';
  else if (key === 'stage') S.taskStage = '';
  else if (key === 'st') S.taskSt = '';
  else if (key === 'pr') S.taskPr = '';
  else if (key === 'ovd') S.taskOverdue = '';
  else if (key === 'dist') S.taskDistanceFilter = '';
  else if (key === 'contr') S.taskContractor = '';
  else if (key === 'yr') S.taskYear = '';
  else if (key === 'arch') S.taskArch = 'no';
  else if (key === 'sort') S.taskSort = 'date_desc';
  else if (key === 'contract') { S.taskContractId = null; S.taskContractTitle = null; }
  else if (key === 'agreement') { S.taskAgreementId = null; S.taskAgreementTitle = null; }
  renderApp();
}

function setTaskAppMode(mode) {
  S.taskAppMode = mode;
  S.tasksStatsExpanded = true; // всегда раскрываем панель при переключении режима
  renderApp();
}
window.setTaskAppMode = setTaskAppMode;

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

function toggleTasksStats() {
  S.tasksStatsExpanded = !S.tasksStatsExpanded;
  try {
    localStorage.setItem('tasksStatsExpanded', S.tasksStatsExpanded ? '1' : '0');
  } catch(e){}
  renderApp();
}

function statBox(lbl, val, sub, color) {
  return '<div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:8px 10px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.03)">' +
    '<div style="font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--text-3);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + lbl + '</div>' +
    '<div style="font-size:.98rem;font-weight:700;font-family:monospace;' + (color ? 'color:' + color + ';' : '') + '">' + val + '</div>' +
    (sub ? '<div style="font-size:.68rem;color:var(--text-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + sub + '</div>' : '') +
  '</div>';
}

// ─── ОЦЕНКА РИСКОВ ДЕДЛАЙНОВ («УСПЕЕМ / НЕ УСПЕЕМ») ─────────────────────────
function parseDeadlineDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  var s = String(val).trim();
  if (!s) return null;
  var mIso = s.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
  if (mIso) {
    var dt = new Date(parseInt(mIso[1], 10), parseInt(mIso[2], 10) - 1, parseInt(mIso[3], 10));
    return isNaN(dt.getTime()) ? null : dt;
  }
  var mRu = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (mRu) {
    var ry = parseInt(mRu[3], 10);
    if (ry < 100) ry += 2000;
    var dtRu = new Date(ry, parseInt(mRu[2], 10) - 1, parseInt(mRu[1], 10));
    return isNaN(dtRu.getTime()) ? null : dtRu;
  }
  var dNat = new Date(s);
  return isNaN(dNat.getTime()) ? null : dNat;
}

function isTaskOverdue(t) {
  if (!t) return false;
  if (['done', 'paid', 'cancelled'].includes(t.status)) return false;
  var dl = parseDeadlineDate(t.deadline);
  if (dl) {
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    dl.setHours(0, 0, 0, 0);
    return dl.getTime() < now.getTime();
  }
  return Number(t.overdueDays) > 0;
}
window.isTaskOverdue = isTaskOverdue;

function getTaskDeadlineRisk(t) {
  if (['done', 'paid', 'cancelled'].includes(t.status)) {
    return {
      level: 'done',
      label: '✓ Завершено',
      cls: 'b-green',
      days: 0,
      hint: 'Работы по заявке завершены'
    };
  }

  var dl = parseDeadlineDate(t.deadline);
  if (!dl) {
    if (Number(t.overdueDays) > 0) {
      var ovd = Number(t.overdueDays);
      return {
        level: 'danger',
        label: '🔴 Просрочено ' + ovd + ' дн.',
        cls: 'b-red',
        days: -ovd,
        hint: 'Критическое нарушение дедлайна! Требуется перенос срока или эскалация.'
      };
    }
    return {
      level: 'none',
      label: 'Срок не задан',
      cls: 'b-gray',
      days: null,
      hint: 'Дедлайн не указан. Рекомендуется согласовать срок с Заказчиком.'
    };
  }

  var now = new Date();
  now.setHours(0, 0, 0, 0);
  dl.setHours(0, 0, 0, 0);
  var diffTime = dl.getTime() - now.getTime();
  var daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    var ovd = Math.abs(daysLeft);
    return {
      level: 'danger',
      label: '🔴 Просрочено ' + ovd + ' дн.',
      cls: 'b-red',
      days: -ovd,
      hint: 'Критическое нарушение дедлайна! Требуется перенос срока или эскалация.'
    };
  }

  var hasContractor = !!(t.contractor && String(t.contractor).trim());
  var isSupplyReady = t.status_supply === 'delivered';
  var isSupplyShipped = t.status_supply === 'shipped';

  if (daysLeft <= 3) {
    var reasons = [];
    if (!hasContractor) reasons.push('нет подряда');
    if (!isSupplyReady && !isSupplyShipped) reasons.push('нет ТМЦ');
    var suffix = reasons.length ? (' · ' + reasons.join(', ')) : '';
    return {
      level: 'critical',
      label: '🔥 Горит (' + (daysLeft === 0 ? 'сегодня' : (daysLeft + ' дн.')) + suffix + ')',
      cls: 'b-red',
      days: daysLeft,
      hint: 'Срок сдачи истекает через ' + daysLeft + ' дн.! ' + (reasons.length ? ('Факторы срыва: ' + reasons.join(', ')) : 'Контролируйте сдачу.')
    };
  }

  if (daysLeft <= 7) {
    if (!hasContractor) {
      return {
        level: 'warning',
        label: '⚠️ Риск (' + daysLeft + ' дн. · нет подряда)',
        cls: 'b-orange',
        days: daysLeft,
        hint: 'До сдачи осталось ' + daysLeft + ' дн., а исполнитель всё ещё не назначен!'
      };
    }
    return {
      level: 'warning',
      label: '⏳ Внимание (' + daysLeft + ' дн.)',
      cls: 'b-orange',
      days: daysLeft,
      hint: 'До дедлайна осталось ' + daysLeft + ' дн. Проверьте дату выхода на объект.'
    };
  }

  return {
    level: 'ok',
    label: '🟢 В графике (+' + daysLeft + ' дн.)',
    cls: 'b-green',
    days: daysLeft,
    hint: 'Запас до дедлайна достаточный: ' + daysLeft + ' дн.'
  };
}

// ─── СВОДКА РЕСУРСОВ ПОДРЯДЧИКОВ РЕГИОНА ─────────────────────────────────────
function getRegionalContractorResourceSummary(filteredTasks, regionFilter) {
  var allContractors = (S.contractors || []).filter(function(c) {
    return c && c.name_short && c.type !== 'customer' && !String(c.inn || '').startsWith('CUST-');
  });

  var activeTasks = (S.tasks || []).filter(function(t) {
    return t.status === 'progress' && t.contractor && String(t.contractor).trim();
  });

  var busySet = new Set();
  activeTasks.forEach(function(t) {
    busySet.add(String(t.contractor).trim().toLowerCase());
  });

  var relevantContractors = allContractors;
  var regClean = regionFilter ? String(regionFilter).trim().toLowerCase() : '';
  if (regClean) {
    var regContractorNames = new Set();
    (S.tasks || []).forEach(function(t) {
      var tReg = String(t.region || '').trim().toLowerCase();
      if (tReg.includes(regClean) || regClean.includes(tReg)) {
        if (t.contractor && String(t.contractor).trim()) {
          regContractorNames.add(String(t.contractor).trim().toLowerCase());
        }
      }
    });

    var regMatches = allContractors.filter(function(c) {
      var nameL = String(c.name_short || '').trim().toLowerCase();
      var addrL = String(c.address_legal || c.address_postal || '').toLowerCase();
      return regContractorNames.has(nameL) || addrL.includes(regClean);
    });

    if (regMatches.length > 0) {
      relevantContractors = regMatches;
    }
  }

  var busyList = [];
  var freeList = [];

  relevantContractors.forEach(function(c) {
    var nameL = String(c.name_short).trim().toLowerCase();
    if (busySet.has(nameL)) {
      busyList.push(c);
    } else {
      freeList.push(c);
    }
  });

  return {
    total: relevantContractors.length,
    busy: busyList.length,
    free: freeList.length,
    busyList: busyList,
    freeList: freeList,
    region: regionFilter || ''
  };
}

// ─── МОДАЛКА РЕСУРСОВ ПОДРЯДЧИКОВ РЕГИОНА ───────────────────────────────────
window.openRegionalContractorResourceModal = function(regName) {
  var old = document.getElementById('_reg_resource_modal');
  if (old) old.remove();

  var res = getRegionalContractorResourceSummary(S.tasks || [], regName);
  var title = regName ? ('Региональный ресурс подряда: ' + escHtml(regName)) : 'Ресурс подряда (все регионы)';

  var m = document.createElement('div');
  m.id = '_reg_resource_modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem';

  var freeRows = res.freeList.length ? res.freeList.map(function(c) {
    return '<div class="field-row" style="padding:8px 12px;border-radius:6px;margin-bottom:4px;background:#f8fafc;display:flex;justify-content:space-between;align-items:center">' +
      '<div>' +
        '<div style="font-weight:700;color:var(--text);font-size:.85rem">🟢 ' + escHtml(c.name_short) + '</div>' +
        '<div class="t3" style="font-size:.72rem">ИНН ' + (c.inn || '—') + (c.curator_name ? (' · Контакт: ' + escHtml(c.curator_name)) : '') + (c.curator_phone ? (' (' + escHtml(c.curator_phone) + ')') : '') + '</div>' +
      '</div>' +
      '<span class="badge b-green" style="font-size:.7rem">Свободен</span>' +
    '</div>';
  }).join('') : '<div class="t3" style="padding:8px">Свободных подрядчиков в регионе нет</div>';

  var busyRows = res.busyList.length ? res.busyList.map(function(c) {
    return '<div class="field-row" style="padding:8px 12px;border-radius:6px;margin-bottom:4px;background:#f8fafc;display:flex;justify-content:space-between;align-items:center">' +
      '<div>' +
        '<div style="font-weight:600;color:var(--text);font-size:.85rem">🟠 ' + escHtml(c.name_short) + '</div>' +
        '<div class="t3" style="font-size:.72rem">ИНН ' + (c.inn || '—') + (c.curator_phone ? (' · ' + escHtml(c.curator_phone)) : '') + '</div>' +
      '</div>' +
      '<span class="badge b-orange" style="font-size:.7rem">В работе</span>' +
    '</div>';
  }).join('') : '<div class="t3" style="padding:8px">Нет занятых подрядчиков</div>';

  m.innerHTML =
    '<div class="card" style="width:100%;max-width:540px;background:#fff;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,0.25);overflow:hidden;animation:fadeIn 0.15s ease">' +
      '<div style="background:#f8fafc;padding:14px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="font-size:.74rem;color:var(--text-3);text-transform:uppercase;font-weight:700">Баланс рабочей силы</div>' +
          '<div style="font-weight:700;font-size:1.05rem;color:var(--text)">' + title + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_reg_resource_modal\').remove()" style="font-size:1.1rem;padding:4px 8px">✕</button>' +
      '</div>' +
      '<div style="padding:16px 18px;max-height:70vh;overflow-y:auto">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;text-align:center">' +
          '<div style="background:#f1f5f9;padding:8px;border-radius:8px"><div class="t3" style="font-size:.7rem">ВСЕГО</div><b style="font-size:1.1rem">' + res.total + '</b></div>' +
          '<div style="background:#fff7ed;padding:8px;border-radius:8px"><div class="t3" style="font-size:.7rem;color:var(--orange)">В РАБОТЕ</div><b style="font-size:1.1rem;color:var(--orange)">' + res.busy + '</b></div>' +
          '<div style="background:#f0fdf4;padding:8px;border-radius:8px"><div class="t3" style="font-size:.7rem;color:var(--green)">СВОБОДНЫ</div><b style="font-size:1.1rem;color:var(--green)">' + res.free + '</b></div>' +
        '</div>' +
        '<div style="font-weight:700;font-size:.8rem;margin-bottom:6px;color:var(--green)">🟢 Свободные ресурсы (' + res.free + ')</div>' +
        '<div style="margin-bottom:16px">' + freeRows + '</div>' +
        '<div style="font-weight:700;font-size:.8rem;margin-bottom:6px;color:var(--orange)">🟠 Занятые ресурсы (' + res.busy + ')</div>' +
        '<div>' + busyRows + '</div>' +
      '</div>' +
      '<div style="background:#f8fafc;padding:10px 18px;border-top:1px solid var(--border);text-align:right">' +
        '<button type="button" class="btn btn-sm btn-primary" onclick="document.getElementById(\'_reg_resource_modal\').remove()">Закрыть</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(m);
};

// ─── ЭКСПРЕСС-КАРТА ОБЪЕКТА И ЗАМЕР КИЛОМЕТРОВ ──────────────────────────────
window.openQuickRouteMapModal = function(taskId) {
  var old = document.getElementById('_quick_route_map_modal');
  if (old) old.remove();

  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;

  var fullAddr = t.clean_address || t.address || t.region || '';
  var mapQueryAddr = fullAddr.startsWith('Россия') ? fullAddr : ('Россия, ' + fullAddr);
  var yandexUrl = 'https://yandex.ru/maps/?rtext=~' + encodeURIComponent(mapQueryAddr) + '&rtt=auto';
  var curRealKm = (t.realDistanceKm != null && t.realDistanceKm > 0) ? Number(t.realDistanceKm) : ((t.real_distance_km != null && t.real_distance_km > 0) ? Number(t.real_distance_km) : '');
  var curTransportRub = Number(t.distanceKm || t.distance_km || 0);
  var curRate = Number(t.km_rate || t.kmRate || 70);

  var m = document.createElement('div');
  m.id = '_quick_route_map_modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem';

  m.innerHTML =
    '<div class="card" style="width:100%;max-width:560px;background:#fff;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,0.25);overflow:hidden;animation:fadeIn 0.15s ease">' +
      '<div style="background:#f8fafc;padding:14px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="font-size:.74rem;color:var(--text-3);text-transform:uppercase;font-weight:700">Маршрут и удалённость объекта</div>' +
          '<div style="font-weight:700;font-size:1.05rem;color:var(--text)">Заявка № ' + escHtml(t.id) + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_quick_route_map_modal\').remove()" style="font-size:1.1rem;padding:4px 8px">✕</button>' +
      '</div>' +
      '<div style="padding:16px 18px">' +
        '<div style="background:#f8fafc;border:1px solid var(--border);padding:10px 14px;border-radius:8px;margin-bottom:14px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
            '<label style="font-size:.75rem;font-weight:700;color:var(--text-2)">📍 Адрес объекта (для навигатора и расчета):</label>' +
            '<span style="font-size:.7rem;color:var(--text-3)">можно скорректировать вручную</span>' +
          '</div>' +
          '<input type="text" id="_qmap_addr_inp" value="' + escHtml(fullAddr) + '" placeholder="Введите точный адрес объекта..." style="width:100%;padding:6px 10px;font-size:.84rem;font-weight:600;border:1px solid var(--border);border-radius:6px;background:#fff" oninput="window._updateQmapNavigatorUrl()">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;flex-wrap:wrap;gap:4px">' +
            (t.vsp ? '<span class="t3" style="font-size:.72rem">ВСП: ' + escHtml(t.vsp) + (t.region ? (' · Регион: ' + escHtml(t.region)) : '') + '</span>' : '<span></span>') +
            (t.geo_lat && t.geo_lat !== 'NONE' ? '<span class="t3" style="font-size:.72rem;color:var(--green)">✓ Координаты: ' + t.geo_lat + ', ' + t.geo_lon + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:14px;display:flex;gap:8px">' +
          '<a id="_qmap_yandex_btn" href="' + yandexUrl + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm" style="flex:1;background:#fc3f1d;color:#fff;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:6px">' +
            '🚗 Открыть маршрут в Яндекс.Навигаторе' +
          '</a>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">' +
          '<div>' +
            '<label class="t3" style="display:block;font-size:.74rem;font-weight:700;margin-bottom:3px">Реальный километраж (в один конец, км)</label>' +
            '<input type="number" id="_qmap_dist_inp" value="' + (curRealKm || '') + '" placeholder="напр. 155" style="width:100%;padding:7px 10px;font-size:.92rem;font-weight:700" oninput="window._recalcQuickMapTotal()">' +
          '</div>' +
          '<div>' +
            '<label class="t3" style="display:block;font-size:.74rem;font-weight:700;margin-bottom:3px">Ставка за км (₽)</label>' +
            '<input type="number" id="_qmap_rate_inp" value="' + curRate + '" style="width:100%;padding:7px 10px;font-size:.92rem;font-weight:700" oninput="window._recalcQuickMapTotal()">' +
          '</div>' +
        '</div>' +
        '<div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:8px;padding:12px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">' +
          '<div>' +
            '<div style="font-size:.78rem;font-weight:700;color:#1e40af">🚗 Компенсация дороги субподрядчику (расход):</div>' +
            '<div style="font-size:.72rem;color:#2563eb">В наряд субподрядчику (километры × 2 конца × ставка)</div>' +
          '</div>' +
          '<b id="_qmap_total_lbl" style="font-size:1.15rem;color:#1e40af">' + (curRealKm ? fmtMoney(curRealKm * 2 * curRate) : '0 ₽') + '</b>' +
        '</div>' +
        '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:.78rem;color:#92400e">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<span>🏛️ Компенсация дороги в смете Заказчика (вход):</span>' +
            '<b style="font-size:.92rem">' + (curTransportRub > 0 ? fmtMoney(curTransportRub) : '0 ₽ (не учтена)') + '</b>' +
          '</div>' +
          '<div style="font-size:.71rem;color:#a16207;margin-top:4px">' +
            'Смета Заказчика фиксирована договором. Если реальный километраж превышает смету, заявку можно отклонить на корректировку Заказчику.' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap">' +
          '<button type="button" class="btn btn-sm btn-ghost" style="color:var(--red);border-color:rgba(239,68,68,0.3)" onclick="window._rejectTaskForRoadCorrection(\'' + escHtml(taskId) + '\')" title="Отклонить заявку на корректировку сметы Заказчиком">⚠️ Отклонить на корректировку</button>' +
          '<div style="display:flex;gap:8px">' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_quick_route_map_modal\').remove()">Отмена</button>' +
            '<button type="button" class="btn btn-sm btn-primary" onclick="window.saveQuickRouteMapKm(\'' + escHtml(taskId) + '\')">✓ Сохранить в заявку</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(m);
};

window._updateQmapNavigatorUrl = function() {
  var addrInp = document.getElementById('_qmap_addr_inp');
  var btn = document.getElementById('_qmap_yandex_btn');
  if (!addrInp || !btn) return;
  var val = addrInp.value.trim();
  var q = val.startsWith('Россия') ? val : ('Россия, ' + val);
  btn.href = 'https://yandex.ru/maps/?rtext=~' + encodeURIComponent(q) + '&rtt=auto';
};

window._recalcQuickMapTotal = function() {
  var dist = Number(document.getElementById('_qmap_dist_inp').value) || 0;
  var rate = Number(document.getElementById('_qmap_rate_inp').value) || 70;
  var total = Math.round(dist * 2 * rate);
  var el = document.getElementById('_qmap_total_lbl');
  if (el) el.textContent = fmtMoney(total);
};

window.saveQuickRouteMapKm = function(taskId) {
  var distVal = document.getElementById('_qmap_dist_inp').value;
  var dist = distVal !== '' ? Number(distVal) : null;
  var rate = Number(document.getElementById('_qmap_rate_inp').value) || 70;
  var addrInp = document.getElementById('_qmap_addr_inp');
  var newAddr = addrInp ? addrInp.value.trim() : '';

  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;

  var payload = {
    realDistanceKm: dist,
    kmRate: rate
  };
  var prevAddr = t.clean_address || t.address || '';
  if (newAddr && newAddr !== prevAddr) {
    payload.address = newAddr;
    payload.clean_address = newAddr;
  }

  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function(res) {
    t.realDistanceKm = dist;
    t.real_distance_km = dist;
    t.kmRate = rate;
    t.km_rate = rate;
    if (newAddr) {
      t.address = newAddr;
      t.clean_address = newAddr;
    }
    if (res && res.task) {
      Object.assign(t, res.task);
    }
    var m = document.getElementById('_quick_route_map_modal');
    if (m) m.remove();
    renderApp();
    if (typeof showToast === 'function') showToast('✓ Данные маршрута сохранены (дистанция: ' + (dist ? (dist + ' км') : 'не указана') + ')', 'success');
  }).catch(function(err) {
    alert('Ошибка сохранения маршрута: ' + err.message);
  });
};

window._rejectTaskForRoadCorrection = function(taskId) {
  var distVal = document.getElementById('_qmap_dist_inp') ? document.getElementById('_qmap_dist_inp').value : '';
  var defaultReason = 'Отклонена на корректировку сметы Заказчика (недостаточная компенсация дороги' + (distVal ? ': реальный пробег ' + distVal + ' км в один конец' : '') + ')';
  var reason = prompt('Причина отклонения заявки на корректировку Заказчику:', defaultReason);
  if (reason === null) return;
  if (!reason.trim()) return alert('Причина обязательна!');

  api('/tasks/' + encodeURIComponent(taskId) + '/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason.trim() })
  })
  .then(function(res) {
    if (res && res.error) return alert('Ошибка: ' + res.error);
    var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
    if (t) {
      t.status = 'cancelled';
      t.overdueReason = reason.trim();
    }
    var modal = document.getElementById('_quick_route_map_modal');
    if (modal) modal.remove();
    if (typeof showToast === 'function') showToast('⚠️ Заявка отклонена на корректировку Заказчику');
    renderApp();
  })
  .catch(function(err) {
    alert('Ошибка отклонения заявки: ' + (err.message || err));
  });
};

// ─── ЭКСПРЕСС-ПЕРЕНОС СРОКА / ДЕДЛАЙНА (EXT-2) ───────────────────────────────
window.openQuickDeadlinePostponeModal = function(taskId) {
  var old = document.getElementById('_quick_postpone_modal');
  if (old) old.remove();

  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;

  var curDl = t.deadline ? safeDateIso(t.deadline) : '';
  var curCustStatus = (t.rawData && t.rawData.rescheduleStatus) || 'pending';

  var m = document.createElement('div');
  m.id = '_quick_postpone_modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem';

  m.innerHTML =
    '<div class="card" style="width:100%;max-width:500px;background:#fff;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,0.25);overflow:hidden;animation:fadeIn 0.15s ease">' +
      '<div style="background:#f8fafc;padding:14px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="font-size:.74rem;color:var(--text-3);text-transform:uppercase;font-weight:700">Календарное планирование</div>' +
          '<div style="font-weight:700;font-size:1.05rem;color:var(--text)">Перенос срока: № ' + escHtml(t.id) + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_quick_postpone_modal\').remove()" style="font-size:1.1rem;padding:4px 8px">✕</button>' +
      '</div>' +
      '<div style="padding:16px 18px">' +
        '<div style="margin-bottom:14px">' +
          '<label class="t3" style="display:block;font-size:.75rem;font-weight:700;margin-bottom:4px">Новый срок сдачи (дедлайн):</label>' +
          '<input type="date" id="_qpostpone_date" value="' + curDl + '" style="width:100%;padding:7px 10px;font-size:.95rem;font-weight:600">' +
        '</div>' +
        '<div style="margin-bottom:14px">' +
          '<label class="t3" style="display:block;font-size:.75rem;font-weight:700;margin-bottom:4px">Статус согласования Заказчиком:</label>' +
          '<select class="select" id="_qpostpone_customer_status" style="width:100%">' +
            '<option value="pending"' + (curCustStatus === 'pending' ? ' selected' : '') + '>⏳ Ожидает согласования Заказчиком (На согласовании)</option>' +
            '<option value="approved"' + (curCustStatus === 'approved' ? ' selected' : '') + '>✓ Перенос принят Заказчиком (Принято Заказчиком)</option>' +
            '<option value="rejected"' + (curCustStatus === 'rejected' ? ' selected' : '') + '>✕ Перенос отклонён Заказчиком (Не принято)</option>' +
          '</select>' +
        '</div>' +
        '<div style="margin-bottom:14px">' +
          '<label class="t3" style="display:block;font-size:.75rem;font-weight:700;margin-bottom:4px">Причина переноса / сообщение для Портала:</label>' +
          '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="document.getElementById(\'_qpostpone_reason\').value=this.textContent" style="font-size:.7rem">Ожидание доступа на объект</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="document.getElementById(\'_qpostpone_reason\').value=this.textContent" style="font-size:.7rem">Задержка поставки ТМЦ</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="document.getElementById(\'_qpostpone_reason\').value=this.textContent" style="font-size:.7rem">Согласовано с Заказчиком</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="document.getElementById(\'_qpostpone_reason\').value=this.textContent" style="font-size:.7rem">Неготовность помещения</button>' +
          '</div>' +
          '<textarea id="_qpostpone_reason" placeholder="Укажите комментарий или причину переноса срока..." style="width:100%;height:65px;padding:8px;font-size:.85rem;border:1.5px solid var(--border);border-radius:6px;box-sizing:border-box"></textarea>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_quick_postpone_modal\').remove()">Отмена</button>' +
          '<button type="button" class="btn btn-sm btn-primary" onclick="window.saveQuickDeadlinePostpone(\'' + escHtml(taskId) + '\')">✓ Применить новый срок</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(m);
};

window.saveQuickDeadlinePostpone = function(taskId) {
  var newDate = document.getElementById('_qpostpone_date').value;
  var reason = (document.getElementById('_qpostpone_reason').value || '').trim();
  var custStatus = (document.getElementById('_qpostpone_customer_status') && document.getElementById('_qpostpone_customer_status').value) || 'pending';
  if (!newDate) { alert('Укажите новую дату дедлайна'); return; }

  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;

  api('/tasks/' + encodeURIComponent(taskId) + '/reschedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      new_deadline: newDate,
      reason: reason,
      customer_status: custStatus
    })
  }).then(function(res) {
    t.deadline = newDate;
    if (reason) t.overdueReason = reason;
    t.rawData = t.rawData || {};
    t.rawData.rescheduleStatus = custStatus;
    if (res && res.task) {
      Object.assign(t, res.task);
    }
    var m = document.getElementById('_quick_postpone_modal');
    if (m) m.remove();
    renderApp();
    if (typeof showToast === 'function') showToast('✓ Перенос дедлайна сохранён: ' + newDate.split('-').reverse().join('.'), 'success');
  }).catch(function(err) {
    alert('Ошибка переноса срока: ' + err.message);
  });
};

// ─── БЫСТРЫЙ ВХОДНОЙ КОНТРОЛЬ («ПРИНЯТЬ» И «ОТКЛОНИТЬ НА ДОРАБОТКУ») ─────────
window.quickAcceptTask = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  var author = S.user ? (S.user.full_name || S.user.username) : 'Система';

  api('/tasks/' + encodeURIComponent(taskId) + '/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assignee: t.assignee || author
    })
  }).then(function(res) {
    t.assignmentStatus = 'accepted';
    t.assignment_status = 'accepted';
    t.status = 'progress';
    if (!t.assignee) t.assignee = author;
    if (res && res.task) {
      Object.assign(t, res.task);
    }
    renderApp();
    if (typeof showToast === 'function') showToast('✓ Заявка ' + taskId + ' принята в работу', 'success');
  }).catch(function(err) {
    alert('Ошибка входного контроля: ' + err.message);
  });
};

window.quickRejectTask = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  var reason = prompt('Укажите причину отклонения заявки ' + taskId + ' на доработку:', (t.rawData && t.rawData.rejectReason) || t.overdueReason || '');
  if (reason === null) return;
  reason = reason.trim() || 'Отклонено на доработку';

  api('/tasks/' + encodeURIComponent(taskId) + '/decline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason })
  }).then(function(res) {
    t.assignmentStatus = 'declined';
    t.assignment_status = 'declined';
    t.status = 'cancelled';
    t.overdueReason = reason;
    t.rawData = t.rawData || {};
    t.rawData.rejectReason = reason;
    if (res && res.task) {
      Object.assign(t, res.task);
    }
    renderApp();
    if (typeof showToast === 'function') showToast('✕ Заявка ' + taskId + ' отклонена на доработку', 'warning');
  }).catch(function(err) {
    alert('Ошибка отклонения заявки: ' + err.message);
  });
};

// ─── СИНХРОНИЗАЦИЯ ДАННЫХ С СЕРВЕРОМ БЕЗ ВЫХОДА/ВХОДА (EXT-2) ─────────────────
window.syncTasksFromServer = function(isManual) {
  var btn = document.getElementById('btnRefreshTasksServer');
  if (btn && isManual) {
    btn.disabled = true;
    btn.textContent = '🔄 Загрузка…';
  }

  return api('/tasks').then(function(newTasks) {
    if (Array.isArray(newTasks)) {
      S.tasks = newTasks;
      if (typeof idbSet === 'function') {
        idbSet('tasks', newTasks);
      }
    }
    if (S.page === 'tasks') {
      renderApp();
    }
    if (btn && isManual) {
      btn.disabled = false;
      btn.textContent = '🔄 Обновить данные';
      if (typeof showToast === 'function') {
        showToast('✓ Данные заявок успешно синхронизированы с сервером', 'success');
      }
    }
    return newTasks;
  }).catch(function(err) {
    console.warn('[syncTasksFromServer] Ошибка синхронизации:', err);
    if (btn && isManual) {
      btn.disabled = false;
      btn.textContent = '🔄 Обновить данные';
      alert('Ошибка обновления данных с сервера: ' + err.message);
    }
  });
};

if (!window._tasksAutoSyncInterval) {
  window._tasksAutoSyncInterval = setInterval(function() {
    if (S.page !== 'tasks') return;
    if (document.querySelector('.modal-overlay') || document.querySelector('#_quick_postpone_modal') || document.querySelector('#_add_settlement_modal')) {
      return;
    }
    var activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
      return;
    }
    if (typeof window.syncTasksFromServer === 'function') {
      window.syncTasksFromServer(false);
    }
  }, 30000);
}

// ─── ГРУППОВЫЕ ДЕЙСТВИЯ НАД ТАБЛИЦЕЙ ЗАЯВОК (EXT-2) ─────────────────────────
window.updateTasksBatchBar = function() {
  var bar = document.getElementById('tasksBatchActionBar');
  var countEl = document.getElementById('tasksSelectedCount');
  var count = S.selectedTasks ? S.selectedTasks.size : 0;
  if (countEl) countEl.textContent = count;
  if (bar) {
    bar.style.display = count > 0 ? 'flex' : 'none';
  }
  var allChk = document.getElementById('selectAllTasksListChk');
  if (allChk) {
    var rowChks = document.querySelectorAll('.task-list-chk');
    if (rowChks.length === 0) {
      allChk.checked = false;
      allChk.indeterminate = false;
    } else {
      var allChecked = true;
      var anyChecked = false;
      rowChks.forEach(function(c) {
        if (c.checked) anyChecked = true;
        else allChecked = false;
      });
      allChk.checked = allChecked && anyChecked;
      allChk.indeterminate = anyChecked && !allChecked;
    }
  }
};

window.bindTasksEvents = function() {
  var btnSync = document.getElementById('btnRefreshTasksServer');
  if (btnSync && !btnSync._bound) {
    btnSync._bound = true;
    btnSync.addEventListener('click', function() {
      if (typeof window.syncTasksFromServer === 'function') {
        window.syncTasksFromServer(true);
      }
    });
  }

  var allChk = document.getElementById('selectAllTasksListChk');
  if (allChk && !allChk._bound) {
    allChk._bound = true;
    allChk.addEventListener('change', function() {
      var isChecked = this.checked;
      var rowChks = document.querySelectorAll('.task-list-chk');
      S.selectedTasks = S.selectedTasks || new Set();
      rowChks.forEach(function(c) {
        c.checked = isChecked;
        var tid = c.getAttribute('data-task-id');
        if (tid) {
          if (isChecked) S.selectedTasks.add(String(tid));
          else S.selectedTasks.delete(String(tid));
        }
      });
      window.updateTasksBatchBar();
    });
  }

  var rowChks = document.querySelectorAll('.task-list-chk');
  rowChks.forEach(function(c) {
    if (!c._bound) {
      c._bound = true;
      c.addEventListener('change', function() {
        var tid = this.getAttribute('data-task-id');
        S.selectedTasks = S.selectedTasks || new Set();
        if (this.checked) {
          if (tid) S.selectedTasks.add(String(tid));
        } else {
          if (tid) S.selectedTasks.delete(String(tid));
        }
        window.updateTasksBatchBar();
      });
    }
  });

  var btnDeselect = document.getElementById('btnTasksBatchDeselectAll');
  if (btnDeselect && !btnDeselect._bound) {
    btnDeselect._bound = true;
    btnDeselect.addEventListener('click', function() {
      if (S.selectedTasks) S.selectedTasks.clear();
      document.querySelectorAll('.task-list-chk').forEach(function(c){ c.checked = false; });
      window.updateTasksBatchBar();
    });
  }

  var btnApplyStatus = document.getElementById('btnTasksBatchApplyStatus');
  if (btnApplyStatus && !btnApplyStatus._bound) {
    btnApplyStatus._bound = true;
    btnApplyStatus.addEventListener('click', function() {
      if (!S.selectedTasks || S.selectedTasks.size === 0) {
        alert('Выберите хотя бы одну заявку');
        return;
      }
      var sel = document.getElementById('tasksBatchStatusSelect');
      var stVal = sel ? sel.value : '';
      if (!stVal) {
        alert('Выберите статус для применения');
        return;
      }
      var ids = Array.from(S.selectedTasks);
      btnApplyStatus.disabled = true;
      api('/tasks/batch-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_ids: ids,
          action: 'set_status',
          status: stVal
        })
      }).then(function(res) {
        btnApplyStatus.disabled = false;
        if (res && res.tasks && Array.isArray(res.tasks)) {
          res.tasks.forEach(function(upd) {
            var local = (S.tasks || []).find(function(x){ return String(x.id) === String(upd.id); });
            if (local) Object.assign(local, upd);
          });
        }
        if (typeof showToast === 'function') {
          showToast('✓ Статус успешно обновлен для ' + (res.updated_count || ids.length) + ' заявок', 'success');
        }
        renderApp();
      }).catch(function(err) {
        btnApplyStatus.disabled = false;
        alert('Ошибка групповой смены статуса: ' + err.message);
      });
    });
  }

  var btnBatchAccept = document.getElementById('btnTasksBatchAccept');
  if (btnBatchAccept && !btnBatchAccept._bound) {
    btnBatchAccept._bound = true;
    btnBatchAccept.addEventListener('click', function() {
      if (!S.selectedTasks || S.selectedTasks.size === 0) {
        alert('Выберите хотя бы одну заявку');
        return;
      }
      var ids = Array.from(S.selectedTasks);
      if (!confirm('Принять в работу выбранные заявки (' + ids.length + ' шт.)?')) return;
      btnBatchAccept.disabled = true;
      api('/tasks/batch-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_ids: ids,
          action: 'accept'
        })
      }).then(function(res) {
        btnBatchAccept.disabled = false;
        if (res && res.tasks && Array.isArray(res.tasks)) {
          res.tasks.forEach(function(upd) {
            var local = (S.tasks || []).find(function(x){ return String(x.id) === String(upd.id); });
            if (local) Object.assign(local, upd);
          });
        }
        if (typeof showToast === 'function') {
          showToast('✓ Принято в работу ' + (res.updated_count || ids.length) + ' заявок', 'success');
        }
        renderApp();
      }).catch(function(err) {
        btnBatchAccept.disabled = false;
        alert('Ошибка группового принятия заявок: ' + err.message);
      });
    });
  }

  var btnBatchReject = document.getElementById('btnTasksBatchReject');
  if (btnBatchReject && !btnBatchReject._bound) {
    btnBatchReject._bound = true;
    btnBatchReject.addEventListener('click', function() {
      if (!S.selectedTasks || S.selectedTasks.size === 0) {
        alert('Выберите хотя бы одну заявку');
        return;
      }
      var ids = Array.from(S.selectedTasks);
      var reason = prompt('Укажите причину отклонения на доработку для выбранных заявок (' + ids.length + ' шт.):', 'Отклонено на доработку');
      if (reason === null) return;
      reason = reason.trim() || 'Отклонено на доработку';

      btnBatchReject.disabled = true;
      api('/tasks/batch-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_ids: ids,
          action: 'reject',
          reason: reason
        })
      }).then(function(res) {
        btnBatchReject.disabled = false;
        if (res && res.tasks && Array.isArray(res.tasks)) {
          res.tasks.forEach(function(upd) {
            var local = (S.tasks || []).find(function(x){ return String(x.id) === String(upd.id); });
            if (local) Object.assign(local, upd);
          });
        }
        if (typeof showToast === 'function') {
          showToast('✕ Отклонено на доработку ' + (res.updated_count || ids.length) + ' заявок', 'warning');
        }
        renderApp();
      }).catch(function(err) {
        btnBatchReject.disabled = false;
        alert('Ошибка группового отклонения: ' + err.message);
      });
    });
  }

  var btnApplyContr = document.getElementById('btnTasksBatchApplyContractor');
  if (btnApplyContr && !btnApplyContr._bound) {
    btnApplyContr._bound = true;
    btnApplyContr.addEventListener('click', function() {
      if (!S.selectedTasks || S.selectedTasks.size === 0) {
        alert('Выберите хотя бы одну заявку');
        return;
      }
      var sel = document.getElementById('tasksBatchContractorSelect');
      var cName = sel ? sel.value : '';
      if (!cName) {
        alert('Выберите подрядчика из списка');
        return;
      }
      var contrObj = (S.contractors || []).find(function(c){ return (c.name_short || c.name || '') === cName; });
      var cId = contrObj ? contrObj.id : null;
      var ids = Array.from(S.selectedTasks);

      btnApplyContr.disabled = true;
      api('/tasks/batch-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_ids: ids,
          action: 'assign_contractor',
          contractor_name: cName,
          contractor_id: cId
        })
      }).then(function(res) {
        btnApplyContr.disabled = false;
        if (res && res.tasks && Array.isArray(res.tasks)) {
          res.tasks.forEach(function(upd) {
            var local = (S.tasks || []).find(function(x){ return String(x.id) === String(upd.id); });
            if (local) Object.assign(local, upd);
          });
        }
        if (typeof showToast === 'function') {
          showToast('✓ Подрядчик «' + cName + '» назначен на ' + (res.updated_count || ids.length) + ' заявок', 'success');
        }
        renderApp();
      }).catch(function(err) {
        btnApplyContr.disabled = false;
        alert('Ошибка назначения подрядчика: ' + err.message);
      });
    });
  }

  var btnClearContr = document.getElementById('btnTasksBatchClearContractor');
  if (btnClearContr && !btnClearContr._bound) {
    btnClearContr._bound = true;
    btnClearContr.addEventListener('click', function() {
      if (!S.selectedTasks || S.selectedTasks.size === 0) {
        alert('Выберите хотя бы одну заявку');
        return;
      }
      var ids = Array.from(S.selectedTasks);
      if (!confirm('Снять подрядчика с выбранных заявок (' + ids.length + ' шт.)?')) return;

      btnClearContr.disabled = true;
      api('/tasks/batch-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_ids: ids,
          action: 'clear_contractor'
        })
      }).then(function(res) {
        btnClearContr.disabled = false;
        if (res && res.tasks && Array.isArray(res.tasks)) {
          res.tasks.forEach(function(upd) {
            var local = (S.tasks || []).find(function(x){ return String(x.id) === String(upd.id); });
            if (local) Object.assign(local, upd);
          });
        }
        if (typeof showToast === 'function') {
          showToast('✓ Подрядчик снят с ' + (res.updated_count || ids.length) + ' заявок', 'warning');
        }
        renderApp();
      }).catch(function(err) {
        btnClearContr.disabled = false;
        alert('Ошибка снятия подрядчика: ' + err.message);
      });
    });
  }

  var subSmrBtns = document.querySelectorAll('[data-sub-action="open-smr"]');
  subSmrBtns.forEach(function(btn) {
    if (!btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', function() {
        var taskId = this.getAttribute('data-task-id');
        if (taskId) {
          S.cardTab = 'items';
          if (typeof openCard === 'function') {
            openCard(taskId);
          } else if (typeof window.openCard === 'function') {
            window.openCard(taskId);
          }
        }
      });
    }
  });

  var subWizBtns = document.querySelectorAll('[data-sub-action="open-wizard"]');
  subWizBtns.forEach(function(btn) {
    if (!btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', function() {
        var taskId = this.getAttribute('data-task-id');
        if (taskId) {
          if (typeof window.openSubcontractWizardModal === 'function') {
            window.openSubcontractWizardModal(taskId);
          } else {
            S.cardTab = 'items';
            if (typeof openCard === 'function') {
              openCard(taskId);
            } else if (typeof window.openCard === 'function') {
              window.openCard(taskId);
            }
          }
        }
      });
    }
  });
};


function computeTaskDynamicIdStatus(t) {
  var isDone = (t.status === 'done' || t.stage === 'done' || t.macro_status === 'accepted' || t.status_id === 'accepted' || t.status_id === 'done');
  if (isDone) {
    return { code: 'done', label: '✓ Согласована в ЕИС', badgeClass: 'b-green' };
  }
  var isReview = (t.status_id === 'review' || t.supplier_id_uploaded || (t.rawData && (t.rawData['загружено на портал'] || '').toString().trim().toLowerCase() === 'да'));
  if (isReview) {
    return { code: 'review', label: 'На проверке Заказчика', badgeClass: 'b-blue' };
  }
  var hasCablesOrSchema = (Number(t.fact) > 0 || (t.tech_link && t.tech_link.length > 3) || t.id_link);
  if (hasCablesOrSchema) {
    return { code: 'ready', label: 'Готова к сборке', badgeClass: 'b-orange' };
  }
  var smrDone = (t.status_smr === 'done' || t.smr_actual_end_date || t.data_vyhoda);
  if (smrDone) {
    return { code: 'needed', label: 'СМР сданы (ждем ИД)', badgeClass: 'b-yellow' };
  }
  return { code: 'pending', label: 'Не начата', badgeClass: 'b-gray' };
}
window.computeTaskDynamicIdStatus = computeTaskDynamicIdStatus;

window.toggleQuickSupplyStatus = function(taskId, nextStatus) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (t) t.status_supply = nextStatus;
  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_supply: nextStatus })
  }).then(function() {
    if (typeof showToast === 'function') {
      var label = nextStatus === 'delivered' ? '🟢 Доставлено на объект' : (nextStatus === 'shipped' ? '🟡 Отправлено в пути' : '🔴 Ожидает отгрузки');
      showToast('✓ Статус ТМЦ обновлен: ' + label, 'success');
    }
    renderApp();
  }).catch(function(err) {
    alert('Ошибка смены статуса ТМЦ: ' + err.message);
  });
};

window.openQuickSupplyModal = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); }) || {};
  var curTk = t.supply_tk || 'СДЭК';
  var curTrack = t.supply_track || '';
  var newTk = prompt('Укажите транспортную компанию (ТК):', curTk);
  if (newTk === null) return;
  var newTrack = prompt('Укажите трек-номер отправления:', curTrack);
  if (newTrack === null) return;
  t.supply_tk = newTk.trim();
  t.supply_track = newTrack.trim();
  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ supply_tk: t.supply_tk, supply_track: t.supply_track })
  }).then(function() {
    if (typeof showToast === 'function') showToast('✓ Логистика сохранена!', 'success');
    renderApp();
  }).catch(function(err) {
    alert('Ошибка сохранения логистики: ' + err.message);
  });
};

function pageTasks() {
  S.selectedTasks = S.selectedTasks || new Set();
  if (S.selectedTasks.size > 0) {
    var existingIds = new Set((S.tasks || []).map(function(x){ return String(x.id); }));
    Array.from(S.selectedTasks).forEach(function(id) {
      if (!existingIds.has(String(id))) S.selectedTasks.delete(id);
    });
  }
  S.taskSort = S.taskSort || 'date_desc';
  function taskSortIndicator(field) {
    if (!S.taskSort || !S.taskSort.startsWith(field + '_')) return '';
    return S.taskSort.endsWith('_asc') ? ' ▲' : ' ▼';
  }
  var q=S.taskQ, st=S.taskSt, pr=S.taskPr, reg=S.taskReg, mgr=S.taskMgr, pm=S.taskPm, yr=S.taskYear, ovd=S.taskOverdue, cust=S.taskCustomer, contr=S.taskContractor, distFilter=S.taskDistanceFilter;
  var isWorker = S.user && (S.user.role === 'worker' || S.user.role === 'installer' || S.user.role === 'contractor');
  var defaultModeForRole = (function() {
    if (isWorker) return 'subcontract';
    var r = S.user ? String(S.user.role || '').toLowerCase() : '';
    if (r === 'logistics') return 'supply';
    if (r === 'designer') return 'docs';
    if (r === 'accountant') return 'finance';
    return 'customer';
  })();
  var appMode = isWorker ? 'subcontract' : (S.taskAppMode || defaultModeForRole);
  if (appMode === 'contractor') appMode = 'subcontract';
  
  if (S.tasksStatsExpanded === undefined) {
    try {
      S.tasksStatsExpanded = localStorage.getItem('tasksStatsExpanded') === '1';
    } catch(e) {
      S.tasksStatsExpanded = false;
    }
  }
  
  // 1. Фильтрация
  var latestInfo = getLatestImportMetrics(S.tasks || []);
  var filtered = S.tasks.filter(function(t) {
    // УМНЫЙ ПОИСК
    if (q) {
      var cleanQ = q.toLowerCase().replace(/[,;.]/g, ' ');
      var searchWords = cleanQ.split(/\s+/).filter(Boolean);
      // Собираем всё содержимое строки в одну кучу для поиска (включая номер в ЭДО и ПМ)
      var content = (
        (t.id || '') + ' ' + 
        (t.edoNumber || '') + ' ' + 
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

    // Фильтр по Проект-менеджеру (ПМ «Мы»)
    if (pm) {
      var tPm = (t.assignee || '').trim().toLowerCase();
      var targetPm = pm.trim().toLowerCase();
      if (targetPm === 'не назначен') {
        if (tPm) return false;
      } else {
        if (tPm !== targetPm && !tPm.includes(targetPm)) return false;
      }
    }

    // Фильтр по Контрагенту / Субподрядчику (СМР)
    if (contr) {
      var tContr = (t.contractor || '').trim().toLowerCase();
      var targetContr = contr.trim().toLowerCase();
      if (targetContr === 'не назначен') {
        if (tContr) return false;
      } else {
        if (tContr !== targetContr && !tContr.includes(targetContr)) return false;
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

    // Фильтр по Договору
    if (S.taskContractId) {
      var tCid = t.contract_id != null ? t.contract_id : t.contractId;
      if (Number(tCid) !== Number(S.taskContractId)) return false;
    }

    // Фильтр по Дополнительному соглашению (ДС / Лот)
    if (S.taskAgreementId) {
      var tAgId = t.contract_agreement_id != null ? t.contract_agreement_id : t.contractAgreementId;
      if (Number(tAgId) !== Number(S.taskAgreementId)) return false;
    }

    // Остальные фильтры (статус, приоритет и т.д. — оставляем как было)
    if (st  && t.status   !== st)  return false;
    if (pr  && t.priority !== pr)  return false;
    if (reg && t.region   !== reg) return false;
    if (mgr && t.manager  !== mgr) return false;
    if (yr && t.sheet !== yr && String(t.year || '') !== yr) return false;
    if (cust) {
      var effCust = t.customer;
      var tCid = t.contract_id != null ? t.contract_id : t.contractId;
      if ((!effCust || effCust.toLowerCase().includes('сбер')) && tCid) {
        var linkedContract = (S.contracts || []).find(function(c){ return String(c.id) === String(tCid); });
        if (linkedContract && linkedContract.customer_name && !linkedContract.customer_name.toLowerCase().includes('сбер')) {
          effCust = linkedContract.customer_name;
        }
      }
      effCust = (effCust && effCust.trim()) || 'Заказчик';
      if (effCust.toLowerCase() !== cust.toLowerCase()) return false;
    }
    if (ovd === 'yes' && !isTaskOverdue(t)) return false;
    if (ovd === 'no'  && isTaskOverdue(t))  return false;
    if (S.taskArch === 'no' && t.archived) return false;
    if (S.taskStage && !isTaskMatchingStage(t, S.taskStage, latestInfo)) return false;
    if (S.taskView === 'montage' && (t.stageNum != null && t.stageNum > 2)) return false;
    if (S.taskView === 'id_queue' && t.stageNum !== 3) return false;
    if (S.taskView === 'design' && t.stageNum !== 4) return false;
    if ((S.taskView === 'sber' || S.taskView === 'customer') && (t.stageNum !== 5 && t.stageNum !== 6)) return false;
    if (S.taskView === 'remarks' && !(Number(t.openRemarksCount) > 0)) return false;
    if (S.taskView === 'payment' && (t.stageNum !== 7 && t.stageNum !== 8)) return false;
    if (S.taskView === 'done' && t.stageNum !== 9) return false;
    if (S.user && (S.user.role === 'worker' || S.user.role === 'installer') && t.assignmentStatus === 'pending') return false;

    return true;
  });

  // 2. Расчеты (добавляем Number() для защиты от склеивания строк)
  var sumAll     = filtered.reduce(function(s,t){ return s + Number(t.amount || 0); }, 0);
  var sumDone    = filtered.filter(function(t){return t.status==='done';}).reduce(function(s,t){ return s + Number(t.amount || 0); }, 0);
  var sumAct     = filtered.filter(function(t){return t.status==='progress';}).reduce(function(s,t){ return s + Number(t.amount || 0); }, 0);
  
  var cntOvd     = filtered.filter(function(t){return isTaskOverdue(t);}).length;
  
  var portsDone  = filtered.filter(function(t){return t.status==='done';}).reduce(function(s,t){return s + Number(t.fact || 0);}, 0);
  var portsTotal = filtered.reduce(function(s,t){return s + Number(t.inOrder || 0);}, 0);
  
  // Остаток портов (тоже через Number)
  var portBalance = filtered.reduce(function(acc, t) {
    var order = Number(t.inOrder || 0);
    var fact = Number(t.fact || 0);
    return acc + (order - fact);
  }, 0);

  var regions   = Array.from(new Set(S.tasks.map(function(t){return t.region||'';}).filter(Boolean))).sort();
  var customerSet = new Set();
  (S.tasks || []).forEach(function(t) {
    var c = t.customer;
    var cid = t.contract_id != null ? t.contract_id : t.contractId;
    if ((!c || c.toLowerCase().includes('сбер')) && cid) {
      var linkedC = (S.contracts || []).find(function(x){ return String(x.id) === String(cid); });
      if (linkedC && linkedC.customer_name && !linkedC.customer_name.toLowerCase().includes('сбер')) {
        c = linkedC.customer_name;
      }
    }
    customerSet.add((c && c.trim()) || 'Заказчик');
  });
  (S.contracts || []).forEach(function(c) {
    if (c.customer_name && c.customer_name.trim()) customerSet.add(c.customer_name.trim());
  });
  var customers = Array.from(customerSet).sort();

  var contractorSet = new Set();
  var hasUnassignedContr = false;
  S.tasks.forEach(function(t) {
    var c = (t.contractor || '').trim();
    if (c) contractorSet.add(c);
    else hasUnassignedContr = true;
  });
  var contractors = Array.from(contractorSet).sort();
  if (hasUnassignedContr) contractors.push('Не назначен');

  var pmSet = new Set();
  var hasUnassignedPm = false;
  S.tasks.forEach(function(t) {
    var a = (t.assignee || '').trim();
    if (a) pmSet.add(a);
    else hasUnassignedPm = true;
  });
  (S.users || []).forEach(function(u) {
    if (u.role === 'manager' || u.role === 'admin' || u.role === 'director') {
      var fn = (u.fullName || u.full_name || '').trim();
      if (fn) pmSet.add(fn);
    }
  });
  var pms = Array.from(pmSet).filter(Boolean).sort();
  if (hasUnassignedPm) pms.push('Не назначен');

  var mgrSet = new Set();
  (S.tasks || []).forEach(function(t) {
    var m = (t.manager || '').trim();
    if (m) mgrSet.add(m);
  });
  var managers = Array.from(mgrSet).sort();

  var yearSet = new Set();
  (S.tasks || []).forEach(function(t) {
    var s = (t.sheet || '').trim();
    if (s) yearSet.add(s);
    else if (t.year) yearSet.add(String(t.year));
  });
  var years = Array.from(yearSet).sort();

  // Сортировка по выбранной колонке (по умолчанию — свежие даты сверху date_desc)
  if (S.taskSort) {
    var sortParts = S.taskSort.split('_');
    var sortDir = sortParts.pop(); // 'asc' или 'desc'
    var sortField = sortParts.join('_');

    filtered = filtered.slice().sort(function(a, b) {
      if (sortField === 'id') {
        var ia = String(a.id || '');
        var ib = String(b.id || '');
        return sortDir === 'asc' ? ia.localeCompare(ib, undefined, { numeric: true }) : ib.localeCompare(ia, undefined, { numeric: true });
      }
      if (sortField === 'deadline') {
        var dla = a.deadline || '';
        var dlb = b.deadline || '';
        if (!dla && !dlb) return 0;
        if (!dla) return 1;
        if (!dlb) return -1;
        return sortDir === 'asc' ? dla.localeCompare(dlb) : dlb.localeCompare(dla);
      }
      if (sortField === 'amount') {
        var aa = Number(a.amount || 0);
        var ab = Number(b.amount || 0);
        return sortDir === 'asc' ? (aa - ab) : (ab - aa);
      }
      if (sortField === 'contractor') {
        var ca = (a.contractor || '').toLowerCase();
        var cb = (b.contractor || '').toLowerCase();
        return sortDir === 'asc' ? ca.localeCompare(cb) : cb.localeCompare(ca);
      }
      if (sortField === 'status') {
        var sa = (a.status || '').toLowerCase();
        var sb = (b.status || '').toLowerCase();
        return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
      }
      if (sortField === 'address') {
        var ada = (a.address || a.title || '').toLowerCase();
        var adb = (b.address || b.title || '').toLowerCase();
        return sortDir === 'asc' ? ada.localeCompare(adb) : adb.localeCompare(ada);
      }
      // По умолчанию (date) — сортировка по дате поступления заявки
      var da = a.dateZayavki || '';
      var db = b.dateZayavki || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return sortDir === 'asc' ? da.localeCompare(db) : db.localeCompare(da);
    });
  }
  
  function mkTasksOpts(arr,cur){return arr.map(function(v){
    var safe=v.replace(/"/g,'&quot;');
    return '<option value="'+safe+'"'+(cur===v?' selected':'')+'>'+v+'</option>';
  }).join('');}

  // Сбор активных фильтров для бейджа и чипсов
  var activeFilters = [];
  if (reg) activeFilters.push({ key: 'reg', label: '📍 ' + reg });
  if (cust) activeFilters.push({ key: 'cust', label: '🏛️ ' + cust });
  if (mgr) activeFilters.push({ key: 'mgr', label: '👔 Заказчик: ' + mgr });
  if (pm) activeFilters.push({ key: 'pm', label: '👤 ПМ: ' + pm });
  if (S.taskStage) {
    var stageLabels = {
      'new': '📥 Новые (дата последней загрузки)',
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
  if (S.taskSort && S.taskSort !== 'date_desc') {
    var sortLabels = {
      'date_asc': '↑ Старые сначала',
      'id_desc': '↓ Номер (убыв.)',
      'id_asc': '↑ Номер (возр.)',
      'deadline_asc': '↑ Дедлайн (ближайшие)',
      'deadline_desc': '↓ Дедлайн (дальние)',
      'amount_desc': '↓ Стоимость (убыв.)',
      'amount_asc': '↑ Стоимость (возр.)',
      'contractor_asc': '↑ Подрядчик (А-Я)',
      'contractor_desc': '↓ Подрядчик (Я-А)',
      'address_asc': '↑ Адрес (А-Я)',
      'address_desc': '↓ Адрес (Я-А)'
    };
    activeFilters.push({ key: 'sort', label: sortLabels[S.taskSort] || ('Сортировка: ' + S.taskSort) });
  }
  if (S.taskContractId) activeFilters.push({ key: 'contract', label: '📑 ' + (S.taskContractTitle || ('Договор #' + S.taskContractId)) });
  if (S.taskAgreementId) activeFilters.push({ key: 'agreement', label: '📑 ' + (S.taskAgreementTitle || ('ДС #' + S.taskAgreementId)) });

  var activeCount = activeFilters.length;
  var hasFilter = activeCount > 0 || !!q;

  var totalRealKmAll = filtered.reduce(function(s,t){ return s + (Number(t.realDistanceKm || t.real_distance_km) || 0); }, 0);
  var sumTransportAll = filtered.reduce(function(s,t){ return s + (Number(t.distanceKm || t.distance_km) || 0); }, 0);
  var sumContAll = filtered.reduce(function(s, t) { return s + getTaskContractorFinance(t).total; }, 0);
  var sumContPaid = filtered.filter(function(t) { return getTaskContractorFinance(t).isPaid; }).reduce(function(s, t) { return s + getTaskContractorFinance(t).total; }, 0);
  var sumContPending = Math.max(0, sumContAll - sumContPaid);
  var sumContTransport = filtered.reduce(function(s, t) { return s + getTaskContractorFinance(t).transport; }, 0);
  var sumMargin = sumAll - sumContAll;
  var marginPct = sumAll > 0 ? Math.round(sumMargin / sumAll * 100) : 0;

  // Контекстные метрики: Подряд и субподрядчики
  var totalSubTasks = filtered.length;
  var cntSubAssigned = filtered.filter(function(t) {
    return (Number(t.subcontractsCount || t.subcontracts_count) > 0) ||
      (Array.isArray(t.subcontractsSummary || t.subcontracts_summary) && (t.subcontractsSummary || t.subcontracts_summary).length > 0) ||
      (t.contractor && String(t.contractor).trim().length > 0);
  }).length;
  var cntSubUnassigned = totalSubTasks - cntSubAssigned;

  var sumSubcontractsTotal = filtered.reduce(function(s, t) {
    var p = Number(t.subcontractsTotalPrice || t.subcontracts_total_price);
    if (!p) p = getTaskContractorFinance(t).total || 0;
    return s + p;
  }, 0);

  var sumSubcontractsPaid = filtered.reduce(function(s, t) {
    var settlements = (t.rawData && Array.isArray(t.rawData.contractorSettlements)) ? t.rawData.contractorSettlements : [];
    var sPaid = settlements.reduce(function(a, it){ return a + (Number(it.payment_amount) || 0); }, 0);
    var payments = (t._payments || (t.rawData && Array.isArray(t.rawData.subPayments) ? t.rawData.subPayments : []));
    var pPaid = payments.reduce(function(a, it){ return a + (Number(it.amount) || 0); }, 0);
    var paid = Math.max(sPaid, pPaid);
    if (paid === 0 && String(t.oplata || '').toLowerCase().includes('оплач')) {
      paid = Number(t.subcontractsTotalPrice || t.subcontracts_total_price) || getTaskContractorFinance(t).total || 0;
    }
    return s + paid;
  }, 0);

  var sumSubcontractsRemaining = Math.max(0, sumSubcontractsTotal - sumSubcontractsPaid);

  // Контекстные метрики: Логистика и ТМЦ
  var cntSupplyDelivered = filtered.filter(function(t) { return t.status_supply === 'delivered'; }).length;
  var cntSupplyShipped = filtered.filter(function(t) { return t.status_supply === 'shipped'; }).length;
  var cntSupplyPending = filtered.filter(function(t) { return !t.status_supply || t.status_supply === 'pending' || t.status_supply === 'none'; }).length;
  var cntSupplierSigned = filtered.filter(function(t) { return !!t.supplierOrderSigned; }).length;
  var sumTmc = filtered.reduce(function(s, t) { return s + (Number(t.tmc) || 0); }, 0);

  // Контекстные метрики: Проектирование и ИД
  var cntIdDone = filtered.filter(function(t) { return t.status_id === 'done' || t.status_id === 'accepted'; }).length;
  var cntIdReview = filtered.filter(function(t) { return t.status_id === 'review'; }).length;
  var cntIdPending = filtered.filter(function(t) { return !t.status_id || t.status_id === 'pending'; }).length;
  var cntIdRemarks = filtered.filter(function(t) { return Number(t.openRemarksCount) > 0; }).length;
  var cntPortalUploaded = filtered.filter(function(t) { return t.rawData && (t.rawData['загружено на портал'] || '').toString().trim().toLowerCase() === 'да'; }).length;

  // Контекстные метрики: Бухгалтерия и счета
  var cntFinPaid = filtered.filter(function(t) { return t.status_finance === 'paid' || (String(t.oplata || '')).toLowerCase().includes('оплач'); }).length;
  var cntFinInvoice = filtered.filter(function(t) { return t.status_finance === 'invoice' || !!t.edoNumber; }).length;
  var cntFinPending = filtered.filter(function(t) { return (!t.status_finance || t.status_finance === 'pending') && !(String(t.oplata || '')).toLowerCase().includes('оплач'); }).length;
  var sumPaid = filtered.filter(function(t) { return t.status_finance === 'paid' || (String(t.oplata || '')).toLowerCase().includes('оплач'); }).reduce(function(s, t) { return s + (Number(t.amount) || 0); }, 0);
  var sumPending = Math.max(0, sumAll - sumPaid);

  // Контекстные метрики: Ресурс подрядчиков в регионе
  var activeReg = reg;
  if (!activeReg && q) {
    var qL = q.toLowerCase();
    var detectedRegs = Array.from(new Set(filtered.map(function(item){ return item.region; }).filter(Boolean)));
    if (detectedRegs.length === 1) {
      activeReg = detectedRegs[0];
    } else {
      var foundReg = detectedRegs.find(function(r){ return r.toLowerCase().includes(qL) || qL.includes(r.toLowerCase()); });
      if (foundReg) activeReg = foundReg;
    }
  }
  var regResource = getRegionalContractorResourceSummary(filtered, activeReg);

  var userRole = S.user ? String(S.user.role || '').toLowerCase() : '';
  var canSeeCustomer = ['admin', 'director', 'manager', 'to_engineer', 'accountant'].includes(userRole);
  
  var modeSwitcher = isWorker ? '' : '<div style="display:flex;align-items:center;gap:4px;background:#f1f5f9;padding:3px 4px;border-radius:8px;border:1px solid var(--border)">' +
    (canSeeCustomer ? '<button type="button" class="btn btn-sm ' + (appMode === 'customer' ? 'btn-primary' : 'btn-ghost') + '" onclick="setTaskAppMode(\'customer\')" style="font-size:.78rem;padding:4px 12px;height:auto">🏦 Сводка Заказчика</button>' : '') +
    '<button type="button" class="btn btn-sm ' + (appMode === 'subcontract' ? 'btn-primary' : 'btn-ghost') + '" onclick="setTaskAppMode(\'subcontract\')" style="font-size:.78rem;padding:4px 12px;height:auto">👷 Подряд</button>' +
    '<button type="button" class="btn btn-sm ' + (appMode === 'supply' ? 'btn-primary' : 'btn-ghost') + '" onclick="setTaskAppMode(\'supply\')" style="font-size:.78rem;padding:4px 12px;height:auto">📦 Логистика и ТМЦ</button>' +
    '<button type="button" class="btn btn-sm ' + (appMode === 'docs' ? 'btn-primary' : 'btn-ghost') + '" onclick="setTaskAppMode(\'docs\')" style="font-size:.78rem;padding:4px 12px;height:auto">📐 Проектирование (ИД)</button>' +
    '<button type="button" class="btn btn-sm ' + (appMode === 'finance' ? 'btn-primary' : 'btn-ghost') + '" onclick="setTaskAppMode(\'finance\')" style="font-size:.78rem;padding:4px 12px;height:auto">💰 Бухгалтерия</button>' +
  '</div>';

  var topControls = '<div style="display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:.65rem;align-items:center;justify-content:space-between">' +
    '<div style="display:flex;flex:1;min-width:300px;gap:.45rem;align-items:center">' +
      '<input id="tq" type="text" placeholder="🔍 Поиск по номеру, ЭДО, адресу, исполнителю, ПМ..." style="flex:1;min-width:200px;height:36px" value="' + escHtml(q) + '">' +
      '<button type="button" class="btn btn-sm ' + (S.tasksFiltersOpen ? 'btn-primary' : (activeCount > 0 ? 'btn-secondary' : 'btn-ghost')) + '" onclick="toggleTasksFilters()" style="display:inline-flex;align-items:center;gap:6px;height:36px;white-space:nowrap;padding:0 12px">' +
        '⚙️ Фильтры' + (activeCount > 0 ? ' <span class="badge ' + (S.tasksFiltersOpen ? 'b-white' : 'b-blue') + '" style="font-size:.7rem;padding:2px 7px">' + activeCount + '</span>' : '') + ' ' + (S.tasksFiltersOpen ? '▴' : '▾') +
      '</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" id="btnRefreshTasksServer" title="Синхронизировать данные с сервером без выхода" style="display:inline-flex;align-items:center;gap:5px;height:36px;white-space:nowrap;padding:0 10px;font-weight:600">🔄 Обновить данные</button>' +
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
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Заказчик</label><select id="tcust" style="width:100%"><option value="">Все заказчики</option>' + mkTasksOpts(customers, cust) + '</select></div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Регион</label><select id="treg" style="width:100%"><option value="">Все регионы</option>' + mkTasksOpts(regions, reg) + '</select></div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Менеджер Заказчика</label><select id="tmgr" style="width:100%"><option value="">Все менеджеры Заказчика</option>' + mkTasksOpts(managers, mgr) + '</select></div>' +
          '</div>' +
          // Группа 2: Статусы и Сроки
          '<div style="display:flex;flex-direction:column;gap:8px">' +
            '<div style="font-size:.7rem;font-weight:700;text-transform:uppercase;color:var(--text-3);letter-spacing:.3px">⏱️ Статусы и Сроки</div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Процесс / Этап регламента</label>' +
              '<select id="tstage" style="width:100%">' +
                '<option value="">Все этапы (любой)</option>' +
                '<option value="new"' + (S.taskStage==='new'?' selected':'') + '>📥 1. Новые (дата последней загрузки)</option>' +
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
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Год / Лист импорта</label><select id="tyr" style="width:100%"><option value="">Все годы / листы</option>' + mkTasksOpts(years, yr) + '</select></div>' +
          '</div>' +
          // Группа 3: Исполнители и Экономика
          '<div style="display:flex;flex-direction:column;gap:8px">' +
            '<div style="font-size:.7rem;font-weight:700;text-transform:uppercase;color:var(--text-3);letter-spacing:.3px">👤 Исполнители и Экономика</div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Проект-менеджер (ПМ)</label><select id="tpm" style="width:100%"><option value="">Все ПМ</option>' + mkTasksOpts(pms, pm) + '</select></div>' +
            '<div><label class="t3" style="font-size:.7rem;display:block;margin-bottom:2px">Контрагент / Субподрядчик</label><select id="tcontr" style="width:100%"><option value="">Все подрядчики</option>' + mkTasksOpts(contractors, contr) + '</select></div>' +
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
                '<option value="date_desc"' + (S.taskSort==='date_desc' || !S.taskSort ? ' selected' : '') + '>📅 Свежие сначала (по умолчанию)</option>' +
                '<option value="date_asc"' + (S.taskSort==='date_asc' ? ' selected' : '') + '>📅 Старые сначала</option>' +
                '<option value="id_desc"' + (S.taskSort==='id_desc' ? ' selected' : '') + '>🔢 Номер (убывание)</option>' +
                '<option value="id_asc"' + (S.taskSort==='id_asc' ? ' selected' : '') + '>🔢 Номер (возрастание)</option>' +
                '<option value="amount_desc"' + (S.taskSort==='amount_desc' ? ' selected' : '') + '>💰 Стоимость (по убыванию)</option>' +
                '<option value="amount_asc"' + (S.taskSort==='amount_asc' ? ' selected' : '') + '>💰 Стоимость (по возрастанию)</option>' +
                '<option value="deadline_asc"' + (S.taskSort==='deadline_asc' ? ' selected' : '') + '>⏳ Дедлайн (ближайшие)</option>' +
                '<option value="contractor_asc"' + (S.taskSort==='contractor_asc' ? ' selected' : '') + '>👤 Подрядчик (А-Я)</option>' +
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

  var statsCompactHtml = '';
  var statsExpandedHtml = '';

  if (appMode === 'customer') {
    statsCompactHtml = 
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:.82rem">' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Заявок: ' + fmtN(filtered.length) + ' из ' + fmtN(S.tasks.length) + (cntOvd > 0 ? ' (просрочено: ' + cntOvd + ')' : '') + '">' +
          '<span style="color:var(--text-3)">Заявки:</span>' +
          '<b style="color:var(--orange)">' + fmtN(filtered.length) + '</b>' +
          (filtered.length !== S.tasks.length ? '<span style="font-size:.72rem;color:var(--text-3)">/' + fmtN(S.tasks.length) + '</span>' : '') +
          (cntOvd > 0 ? '<span class="badge b-red" style="font-size:.65rem;padding:1px 5px">+' + cntOvd + ' проср.</span>' : '') +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Общая стоимость с удаленностью: ' + fmtMoney(sumAll) + '">' +
          '<span style="color:var(--text-3)">Всего:</span>' +
          '<b style="font-family:monospace;font-size:.85rem">' + fmtMoneyShort(sumAll) + '</b>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Выполнено: ' + fmtMoney(sumDone) + ' (' + pct(sumDone, sumAll) + '%)">' +
          '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green)"></span>' +
          '<span style="color:var(--text-3)">Вып:</span>' +
          '<b style="color:var(--green);font-family:monospace;font-size:.85rem">' + fmtMoneyShort(sumDone) + '</b>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="В работе: ' + fmtMoney(sumAct) + ' (' + pct(sumAct, sumAll) + '%)">' +
          '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--orange)"></span>' +
          '<span style="color:var(--text-3)">В работе:</span>' +
          '<b style="color:var(--orange);font-family:monospace;font-size:.85rem">' + fmtMoneyShort(sumAct) + '</b>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Транспортные расходы от Заказчика: ' + fmtMoney(sumTransportAll) + (totalRealKmAll > 0 ? (' (замерено по навигатору: ' + fmtN(totalRealKmAll) + ' км)') : '') + '">' +
          '<span style="color:var(--text-3)">Дорога:</span>' +
          '<b style="font-family:monospace;font-size:.85rem">🚗 ' + (totalRealKmAll > 0 ? (fmtN(totalRealKmAll) + ' км · ') : '') + fmtMoneyShort(sumTransportAll) + '</b>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Порты: выполнено ' + fmtN(portsDone) + ' из ' + fmtN(portsTotal) + ' (остаток: ' + fmtN(portBalance) + ' шт.)">' +
          '<span style="color:var(--text-3)">Порты:</span>' +
          '<b>' + fmtN(portsDone) + '/' + fmtN(portsTotal) + '</b>' +
          '<span style="font-size:.72rem;color:' + (portBalance > 0 ? 'var(--orange)' : 'var(--green)') + ';font-weight:600">(' + (portBalance > 0 ? '+' : '') + fmtN(portBalance) + ' шт.)</span>' +
        '</div>' +
      '</div>';
  } else if (appMode === 'subcontract' || appMode === 'contractor') {
    statsCompactHtml = 
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:.82rem">' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Всего заявок: ' + fmtN(totalSubTasks) + ' (с подрядчиком: ' + fmtN(cntSubAssigned) + ', без подрядчика: ' + fmtN(cntSubUnassigned) + ')">' +
          '<span style="color:var(--text-3)">Заявки:</span>' +
          '<b style="color:var(--orange)">' + fmtN(totalSubTasks) + '</b>' +
          '<span style="font-size:.72rem;color:var(--text-3)">(' + fmtN(cntSubAssigned) + ' с подрядчиком / ' + fmtN(cntSubUnassigned) + ' без)</span>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Общая сумма субподрядов: ' + fmtMoney(sumSubcontractsTotal) + '">' +
          '<span style="color:var(--text-3)">Сумма субподрядов:</span>' +
          '<b style="font-family:monospace;font-size:.85rem;color:var(--orange-dark)">' + fmtMoneyShort(sumSubcontractsTotal) + '</b>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Оплачено подрядчикам: ' + fmtMoney(sumSubcontractsPaid) + '">' +
          '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green)"></span>' +
          '<span style="color:var(--text-3)">Оплачено:</span>' +
          '<b style="color:var(--green);font-family:monospace;font-size:.85rem">' + fmtMoneyShort(sumSubcontractsPaid) + '</b>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Остаток к выплате: ' + fmtMoney(sumSubcontractsRemaining) + '">' +
          '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + (sumSubcontractsRemaining > 0 ? 'var(--orange)' : 'var(--green)') + '"></span>' +
          '<span style="color:var(--text-3)">К выплате:</span>' +
          '<b style="color:' + (sumSubcontractsRemaining > 0 ? 'var(--orange-dark)' : 'var(--green)') + ';font-family:monospace;font-size:.85rem">' + fmtMoneyShort(sumSubcontractsRemaining) + '</b>' +
        '</div>' +
      '</div>';
  } else if (appMode === 'supply') {
    statsCompactHtml = 
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:.82rem">' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Заявок на обеспечение: ' + fmtN(filtered.length) + '">' +
          '<span style="color:var(--text-3)">Заявки:</span>' +
          '<b style="color:var(--orange)">' + fmtN(filtered.length) + '</b>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="ТМЦ доставлено на объект: ' + cntSupplyDelivered + ' заявок">' +
          '<span class="badge b-green" style="font-size:.72rem">✓ Доставлено: ' + cntSupplyDelivered + '</span>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Груз в пути (отправлен со склада / поставщиком): ' + cntSupplyShipped + ' заявок">' +
          '<span class="badge b-blue" style="font-size:.72rem">🚚 В пути: ' + cntSupplyShipped + '</span>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Ожидает отгрузки / комплектации: ' + cntSupplyPending + ' заявок">' +
          '<span class="badge b-orange" style="font-size:.72rem">⏳ Ожидает: ' + cntSupplyPending + '</span>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Подписано заказов поставщикам: ' + cntSupplierSigned + ' из ' + filtered.length + '">' +
          '<span style="color:var(--text-3)">Заказы:</span>' +
          '<b>' + cntSupplierSigned + '/' + filtered.length + '</b>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Общая расчетная стоимость ТМЦ: ' + fmtMoney(sumTmc) + '">' +
          '<span style="color:var(--text-3)">ТМЦ всего:</span>' +
          '<b style="font-family:monospace;font-size:.85rem">' + (sumTmc > 0 ? fmtMoneyShort(sumTmc) : '—') + '</b>' +
        '</div>' +
      '</div>';
  } else if (appMode === 'docs') {
    statsCompactHtml = 
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:.82rem">' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Заявок на ИД: ' + fmtN(filtered.length) + '">' +
          '<span style="color:var(--text-3)">Заявки:</span>' +
          '<b style="color:var(--orange)">' + fmtN(filtered.length) + '</b>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="ИД полностью согласована и принята: ' + cntIdDone + ' шт.">' +
          '<span class="badge b-green" style="font-size:.72rem">✓ Принято: ' + cntIdDone + '</span>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="ИД на проверке / согласовании у Заказчика: ' + cntIdReview + ' шт.">' +
          '<span class="badge b-blue" style="font-size:.72rem">🔍 На проверке: ' + cntIdReview + '</span>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="ИД в подготовке / не начата: ' + cntIdPending + ' шт.">' +
          '<span class="badge b-gray" style="font-size:.72rem">📐 В работе: ' + cntIdPending + '</span>' +
        '</div>' +
        (cntIdRemarks > 0 ? ('<span style="color:var(--border)">|</span><div style="display:inline-flex;align-items:center;gap:4px" title="Открытые замечания Заказчика"><span class="badge b-red" style="font-size:.72rem">⚠️ Замечания: ' + cntIdRemarks + '</span></div>') : '') +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Загружено на портал Заказчика: ' + cntPortalUploaded + ' из ' + filtered.length + '">' +
          '<span style="color:var(--text-3)">Портал:</span>' +
          '<b>' + cntPortalUploaded + '/' + filtered.length + '</b>' +
        '</div>' +
      '</div>';
  } else if (appMode === 'finance') {
    statsCompactHtml = 
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:.82rem">' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Заявок в фин. учете: ' + fmtN(filtered.length) + '">' +
          '<span style="color:var(--text-3)">Заявки:</span>' +
          '<b style="color:var(--orange)">' + fmtN(filtered.length) + '</b>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Счета выставлены (в т.ч. через ЭДО): ' + cntFinInvoice + ' заявок">' +
          '<span class="badge b-blue" style="font-size:.72rem">📄 Счета: ' + cntFinInvoice + '</span>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Оплачено Заказчиком: ' + fmtMoney(sumPaid) + ' (' + cntFinPaid + ' заявок)">' +
          '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green)"></span>' +
          '<span style="color:var(--text-3)">Оплачено:</span>' +
          '<b style="color:var(--green);font-family:monospace;font-size:.85rem">' + fmtMoneyShort(sumPaid) + '</b>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Остаток неоплаченной дебиторской задолженности: ' + fmtMoney(sumPending) + '">' +
          '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--orange)"></span>' +
          '<span style="color:var(--text-3)">Дебиторка:</span>' +
          '<b style="color:var(--orange);font-family:monospace;font-size:.85rem">' + fmtMoneyShort(sumPending) + '</b>' +
        '</div>' +
        '<span style="color:var(--border)">|</span>' +
        '<div style="display:inline-flex;align-items:center;gap:4px" title="Чистая маржа: ' + fmtMoney(sumMargin) + ' (' + marginPct + '%)">' +
          '<span style="color:var(--text-3)">Маржа:</span>' +
          '<b style="color:var(--green);font-family:monospace;font-size:.85rem">' + marginPct + '% (' + fmtMoneyShort(sumMargin) + ')</b>' +
        '</div>' +
      '</div>';
  }

  if (S.tasksStatsExpanded) {
    if (appMode === 'customer') {
      var donePct = pct(sumDone, sumAll);
      var actPct = pct(sumAct, sumAll);
      var portsPct = pct(portsDone, portsTotal);

      statsExpandedHtml = 
        '<div class="card mb" style="background:#f8fafc;border:1.5px solid var(--border);border-radius:10px;padding:12px 16px;margin-top:6px;animation:fadeIn 0.15s ease">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">' +
            '<span style="font-weight:700;font-size:.82rem;color:var(--text);display:flex;align-items:center;gap:6px">' +
              '📊 Сводка Заказчика: календарный график и бюджет' +
            '</span>' +
            '<span style="font-size:.74rem;color:var(--text-3)">В выборке: <b>' + fmtN(filtered.length) + '</b> из <b>' + fmtN(S.tasks.length) + '</b> заявок</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">' +
            statBox('Всего заявок', fmtN(filtered.length), (cntOvd > 0 ? '⚠️ ' + cntOvd + ' с просрочкой' : 'из ' + fmtN(S.tasks.length)), 'var(--orange)') +
            statBox('Общая стоимость', fmtMoney(sumAll), 'с удаленкой', null) +
            statBox('Выполнено', fmtMoney(sumDone), donePct + '% от общей суммы', 'var(--green)') +
            statBox('В работе', fmtMoney(sumAct), actPct + '% от общей суммы', 'var(--orange)') +
            statBox('Удаленность / Дорога', fmtMoney(sumTransportAll), (totalRealKmAll > 0 ? (fmtN(totalRealKmAll) + ' км замерено') : 'по сметам Заказчика'), null) +
            statBox('Портов (факт/план)', fmtN(portsDone) + ' / ' + fmtN(portsTotal), portsPct + '% от плана', null) +
            statBox('Остаток портов', fmtN(portBalance) + ' шт.', 'в заказе минус факт', portBalance > 0 ? 'var(--orange)' : 'var(--green)') +
          '</div>' +
          '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;align-items:center;gap:12px;font-size:.76rem;color:var(--text-3)">' +
            '<span>Выполнение бюджета: <b>' + donePct + '%</b></span>' +
            '<div style="flex:1;background:#e2e8f0;height:6px;border-radius:3px;overflow:hidden">' +
              '<div style="width:' + donePct + '%;background:var(--green);height:100%;border-radius:3px"></div>' +
            '</div>' +
            '<span>В работе: <b>' + actPct + '%</b></span>' +
          '</div>' +
        '</div>';
    } else if (appMode === 'subcontract' || appMode === 'contractor') {
      var paidSubPct = sumSubcontractsTotal > 0 ? Math.round(sumSubcontractsPaid / sumSubcontractsTotal * 100) : 0;
      var remSubPct = sumSubcontractsTotal > 0 ? Math.round(sumSubcontractsRemaining / sumSubcontractsTotal * 100) : 0;
      var assignedSubPct = totalSubTasks > 0 ? Math.round(cntSubAssigned / totalSubTasks * 100) : 0;

      statsExpandedHtml = 
        '<div class="card mb" style="background:#f8fafc;border:1.5px solid var(--border);border-radius:10px;padding:12px 16px;margin-top:6px;animation:fadeIn 0.15s ease">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">' +
            '<span style="font-weight:700;font-size:.82rem;color:var(--text);display:flex;align-items:center;gap:6px">' +
              '👷 Управление подрядом, баланс ресурсов и взаиморасчёты' +
            '</span>' +
            '<div style="display:flex;align-items:center;gap:8px">' +
              '<button type="button" class="btn btn-xs btn-primary" onclick="openRegionalContractorResourceModal(\'' + escHtml(reg || '') + '\')" style="font-size:.72rem;padding:3px 8px">' +
                '👥 Баланс ресурсов региона' +
              '</button>' +
              '<span style="font-size:.74rem;color:var(--text-3)">Заявок: <b>' + fmtN(totalSubTasks) + '</b> из <b>' + fmtN(S.tasks.length) + '</b></span>' +
            '</div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">' +
            statBox('Всего заявок', fmtN(totalSubTasks), 'в текущей выборке', 'var(--orange)') +
            statBox('С подрядчиком', fmtN(cntSubAssigned), assignedSubPct + '% назначено', 'var(--green)') +
            statBox('Без подрядчика', fmtN(cntSubUnassigned), cntSubUnassigned > 0 ? '⚠️ требуется назначение' : 'все назначены', cntSubUnassigned > 0 ? 'var(--orange)' : 'var(--green)') +
            statBox('Сумма субподрядов', fmtMoney(sumSubcontractsTotal), 'по сметам и заказам', null) +
            statBox('Оплачено подряду', fmtMoney(sumSubcontractsPaid), paidSubPct + '% от суммы', 'var(--green)') +
            statBox('Остаток к выплате', fmtMoney(sumSubcontractsRemaining), sumSubcontractsRemaining > 0 ? 'долг перед исполнителями' : 'долгов нет', sumSubcontractsRemaining > 0 ? 'var(--orange)' : 'var(--green)') +
          '</div>' +
          '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;align-items:center;gap:12px;font-size:.76rem;color:var(--text-3)">' +
            '<span>Выплаты подрядчикам: <b>' + paidSubPct + '%</b></span>' +
            '<div style="flex:1;background:#e2e8f0;height:6px;border-radius:3px;overflow:hidden">' +
              '<div style="width:' + paidSubPct + '%;background:var(--green);height:100%;border-radius:3px"></div>' +
            '</div>' +
            '<span>Остаток: <b>' + remSubPct + '%</b></span>' +
          '</div>' +
        '</div>';
    } else if (appMode === 'supply') {
      var suppPct = filtered.length > 0 ? Math.round(cntSupplyDelivered / filtered.length * 100) : 0;
      statsExpandedHtml = 
        '<div class="card mb" style="background:#f8fafc;border:1.5px solid var(--border);border-radius:10px;padding:12px 16px;margin-top:6px;animation:fadeIn 0.15s ease">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">' +
            '<span style="font-weight:700;font-size:.82rem;color:var(--text);display:flex;align-items:center;gap:6px">' +
              '📦 Сводка снабжения, складских запасов и логистики ТМЦ' +
            '</span>' +
            '<span style="font-size:.74rem;color:var(--text-3)">Заявок: <b>' + fmtN(filtered.length) + '</b></span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">' +
            statBox('Заявок на поставку', fmtN(filtered.length), 'всего в выборке', 'var(--orange)') +
            statBox('Доставлено на объект', fmtN(cntSupplyDelivered), suppPct + '% обеспечено', 'var(--green)') +
            statBox('В пути / отправлено', fmtN(cntSupplyShipped), 'отгружено со склада', 'var(--blue)') +
            statBox('Ожидает отгрузки', fmtN(cntSupplyPending), 'в сборке / под заказ', 'var(--orange)') +
            statBox('Заказов подписано', fmtN(cntSupplierSigned), 'из ' + filtered.length + ' заявок', null) +
            statBox('Стоимость ТМЦ', fmtMoney(sumTmc), 'по спецификациям', null) +
          '</div>' +
          '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;align-items:center;gap:12px;font-size:.76rem;color:var(--text-3)">' +
            '<span>Обеспеченность объектов ТМЦ: <b>' + suppPct + '%</b></span>' +
            '<div style="flex:1;background:#e2e8f0;height:6px;border-radius:3px;overflow:hidden">' +
              '<div style="width:' + suppPct + '%;background:var(--green);height:100%;border-radius:3px"></div>' +
            '</div>' +
          '</div>' +
        '</div>';
    } else if (appMode === 'docs') {
      var idDonePct = filtered.length > 0 ? Math.round(cntIdDone / filtered.length * 100) : 0;
      var portalPct = filtered.length > 0 ? Math.round(cntPortalUploaded / filtered.length * 100) : 0;
      statsExpandedHtml = 
        '<div class="card mb" style="background:#f8fafc;border:1.5px solid var(--border);border-radius:10px;padding:12px 16px;margin-top:6px;animation:fadeIn 0.15s ease">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">' +
            '<span style="font-weight:700;font-size:.82rem;color:var(--text);display:flex;align-items:center;gap:6px">' +
              '📐 Исполнительная документация (ИД) и сдача на портал' +
            '</span>' +
            '<span style="font-size:.74rem;color:var(--text-3)">Заявок: <b>' + fmtN(filtered.length) + '</b></span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">' +
            statBox('Заявок на ИД', fmtN(filtered.length), 'всего в реестре', 'var(--orange)') +
            statBox('ИД согласована', fmtN(cntIdDone), idDonePct + '% сдано', 'var(--green)') +
            statBox('На экспертизе', fmtN(cntIdReview), 'у Заказчика', 'var(--blue)') +
            statBox('В подготовке', fmtN(cntIdPending), 'ожидает сдачи', null) +
            statBox('С замечаниями', fmtN(cntIdRemarks), 'требуют исправления', cntIdRemarks > 0 ? 'var(--red)' : 'var(--green)') +
            statBox('Загружено на портал', fmtN(cntPortalUploaded), portalPct + '% от общего числа', 'var(--green)') +
          '</div>' +
          '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;align-items:center;gap:12px;font-size:.76rem;color:var(--text-3)">' +
            '<span>Сдача исполнительной документации: <b>' + idDonePct + '%</b></span>' +
            '<div style="flex:1;background:#e2e8f0;height:6px;border-radius:3px;overflow:hidden">' +
              '<div style="width:' + idDonePct + '%;background:var(--green);height:100%;border-radius:3px"></div>' +
            '</div>' +
          '</div>' +
        '</div>';
    } else if (appMode === 'finance') {
      var finPaidPct = sumAll > 0 ? Math.round(sumPaid / sumAll * 100) : 0;
      statsExpandedHtml = 
        '<div class="card mb" style="background:#f8fafc;border:1.5px solid var(--border);border-radius:10px;padding:12px 16px;margin-top:6px;animation:fadeIn 0.15s ease">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">' +
            '<span style="font-weight:700;font-size:.82rem;color:var(--text);display:flex;align-items:center;gap:6px">' +
              '💰 Финансовый баланс, счета, дебиторка и маржа' +
            '</span>' +
            '<span style="font-size:.74rem;color:var(--text-3)">Заявок: <b>' + fmtN(filtered.length) + '</b></span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">' +
            statBox('Заявок в учете', fmtN(filtered.length), 'всего в реестре', 'var(--orange)') +
            statBox('Выставлено счетов', fmtN(cntFinInvoice), 'в т.ч. через ЭДО', 'var(--blue)') +
            statBox('Оплачено Заказчиком', fmtMoney(sumPaid), finPaidPct + '% от контрактов', 'var(--green)') +
            statBox('Дебиторка Заказчика', fmtMoney(sumPending), 'остаток к оплате', 'var(--orange)') +
            statBox('Выплачено подряду', fmtMoney(sumContPaid), 'из ' + fmtMoneyShort(sumContAll), null) +
            statBox('Долг подрядчикам', fmtMoney(sumContPending), 'к выплате', 'var(--orange)') +
            statBox('Операционная маржа', fmtMoney(sumMargin), marginPct + '% от выручки', 'var(--green)') +
          '</div>' +
          '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;align-items:center;gap:12px;font-size:.76rem;color:var(--text-3)">' +
            '<span>Поступление оплат от Заказчика: <b>' + finPaidPct + '%</b></span>' +
            '<div style="flex:1;background:#e2e8f0;height:6px;border-radius:3px;overflow:hidden">' +
              '<div style="width:' + finPaidPct + '%;background:var(--green);height:100%;border-radius:3px"></div>' +
            '</div>' +
          '</div>' +
        '</div>';
    }
  }

  var totals = '<div style="margin-bottom:.75rem">' +
    '<div class="card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:6px 14px;background:#fff;border:1px solid var(--border);border-radius:8px">' +
      statsCompactHtml +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="toggleTasksStats()" style="font-size:.76rem;height:26px;padding:0 9px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;color:var(--text-2);background:#f1f5f9;border-radius:6px;border:1px solid var(--border)">' +
        '📊 ' + (S.tasksStatsExpanded ? 'Свернуть ▴' : 'Подробнее ▾') +
      '</button>' +
    '</div>' +
    statsExpandedHtml +
  '</div>';

  var tableRows = '';
  filtered.slice(0, 300).forEach(function(t) {
    var tid = (t.id || '').replace(/'/g, "\\'");
    var isChecked = S.selectedTasks && S.selectedTasks.has(String(t.id));
    var colChk = '<td style="vertical-align:top;text-align:center;width:36px"><input type="checkbox" class="task-list-chk" data-task-id="' + tid + '"' + (isChecked ? ' checked' : '') + '></td>';

    if (appMode === 'subcontract') {
      var subs = Array.isArray(t.subcontractsSummary || t.subcontracts_summary) ? (t.subcontractsSummary || t.subcontracts_summary) : [];
      var factPorts = (t.fact !== null && t.fact !== undefined && t.fact !== '') ? Number(t.fact) : null;
      var inOrderPorts = Number(t.inOrder) || Number(t.in_order) || 0;

      // 1. Чекбокс уже в colChk
      // 2. № заявки / статус
      var stCls = (function(st) {
        if (st === 'done') return 'b-green';
        if (st === 'in_progress' || st === 'assigned') return 'b-blue';
        if (st === 'cancelled') return 'b-red';
        return 'b-gray';
      })(t.status);
      var stLabel = (function(st) {
        if (st === 'done') return 'Выполнена';
        if (st === 'in_progress') return 'В процессе';
        if (st === 'assigned') return 'Назначена';
        if (st === 'cancelled') return 'Отменена';
        return 'Новая';
      })(t.status);

      var colNumber = '<td style="vertical-align:top;max-width:130px">' +
        '<div style="font-weight:700;font-size:.85rem"><button class="btn-link" onclick="openCard(\'' + tid + '\')">⇒ ' + highlight(t.id, q) + '</button></div>' +
        (t.edoNumber ? '<div style="font-size:.72rem;color:var(--text-3)" title="Номер в ЭДО">ЭДО: ' + escHtml(t.edoNumber) + '</div>' : '') +
        '<div style="margin-top:3px"><span class="badge ' + stCls + '" style="font-size:.68rem">' + escHtml(stLabel) + '</span></div>' +
      '</td>';

      // 3. Объект и адрес
      var colObj = '<td style="vertical-align:top;max-width:260px">' +
        '<div style="font-weight:600;font-size:.82rem;color:var(--text)">' + escHtml(t.customer || 'Заказчик') + (t.tipObj ? ' · <span style="color:var(--text-2);font-weight:500">' + escHtml(t.tipObj) + '</span>' : '') + '</div>' +
        '<div style="font-size:.78rem;color:var(--text-2);margin-top:2px;line-height:1.25" title="' + escHtml(t.address || '') + '">' + highlight(t.address || 'Адрес не указан', q) + '</div>' +
        (t.region ? '<span class="badge b-gray" style="font-size:.65rem;margin-top:3px">' + escHtml(t.region) + '</span>' : '') +
      '</td>';

      // 4. Дедлайн / риск
      var dStr = t.deadline ? safeDateRu(t.deadline) : '—';
      var dRisk = '';
      if (t.deadline) {
        var daysLeft = Math.ceil((new Date(t.deadline).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
        if (t.status !== 'done') {
          if (daysLeft < 0) {
            dRisk = '<span class="badge b-red" style="font-size:.68rem;margin-top:2px">⚠️ Просрочено (' + Math.abs(daysLeft) + ' дн.)</span>';
          } else if (daysLeft <= 3) {
            dRisk = '<span class="badge b-yellow" style="font-size:.68rem;margin-top:2px">🟡 Риск (' + daysLeft + ' дн.)</span>';
          } else {
            dRisk = '<div style="font-size:.7rem;color:var(--text-3);margin-top:2px">в графике (' + daysLeft + ' дн.)</div>';
          }
        }
      }
      var colDeadline = '<td style="vertical-align:top;font-size:.8rem;white-space:nowrap">' +
        '<div style="font-weight:600;color:var(--text)">' + dStr + '</div>' +
        dRisk +
      '</td>';

      // 5. Подрядчик(и) и договор
      var colContractor = '';
      if (subs.length > 1) {
        var subsListHtml = subs.map(function(s, idx) {
          var cNumStr = s.contract_number ? (' <span class="t3" style="font-size:.7rem">(дог. № ' + escHtml(s.contract_number) + ')</span>') : '';
          return '<div style="font-size:.76rem;line-height:1.3;margin-bottom:2px">' +
            (idx + 1) + ') <b>' + escHtml(s.contractor_name || 'Подрядчик') + '</b>' + cNumStr +
          '</div>';
        }).join('');
        colContractor = '<td style="vertical-align:top;max-width:210px">' +
          '<div style="margin-bottom:3px"><span class="badge b-blue" style="font-size:.68rem">👥 ' + subs.length + ' субподрядчика</span></div>' +
          subsListHtml +
        '</td>';
      } else if (subs.length === 1) {
        var s0 = subs[0];
        var cNum0 = s0.contract_number ? ('<div style="font-size:.7rem;color:var(--text-3);margin-top:2px">дог. № <b>' + escHtml(s0.contract_number) + '</b></div>') : '<div class="t3" style="font-size:.7rem;margin-top:2px">рамочный договор не указан</div>';
        colContractor = '<td style="vertical-align:top;max-width:210px">' +
          '<div style="font-weight:600;font-size:.82rem;color:var(--text)">' + escHtml(s0.contractor_name || 'Подрядчик') + '</div>' +
          cNum0 +
        '</td>';
      } else if (t.contractor && String(t.contractor).trim()) {
        colContractor = '<td style="vertical-align:top;max-width:210px">' +
          '<div style="font-weight:600;font-size:.82rem;color:var(--text)">' + escHtml(t.contractor) + '</div>' +
          (t.contract_number || t.contractorContractNumber ? ('<div style="font-size:.7rem;color:var(--text-3);margin-top:2px">дог. № <b>' + escHtml(t.contract_number || t.contractorContractNumber) + '</b></div>') : '') +
        '</td>';
      } else {
        colContractor = '<td style="vertical-align:top;max-width:210px">' +
          '<button type="button" class="btn btn-xs btn-ghost" style="color:var(--orange);border:1px dashed var(--orange);font-size:.74rem;padding:2px 8px;font-weight:600" onclick="openContractorPicker(\'' + tid + '\')" title="Назначить подрядчика СМР">+ Назначить</button>' +
        '</td>';
      }

      // 6. Объём (порты: факт / план и распределение по субподрядчикам, например 616 + 718)
      var colVolume = '';
      if (subs.length > 1) {
        var portsArr = subs.map(function(s) { return Number(s.ports_count) || 0; });
        var portsDistStr = portsArr.join(' + ');
        colVolume = '<td style="vertical-align:top;white-space:nowrap;font-size:.8rem">' +
          '<div style="font-weight:700">' + (factPorts !== null ? factPorts : '—') + ' / ' + inOrderPorts + ' шт.</div>' +
          '<div style="font-size:.72rem;color:var(--text-2);margin-top:2px" title="Распределение портов по субподрядам">распр: <b>' + escHtml(portsDistStr) + '</b></div>' +
        '</td>';
      } else {
        colVolume = '<td style="vertical-align:top;white-space:nowrap;font-size:.8rem">' +
          '<div style="font-weight:700">' + (factPorts !== null ? factPorts : '—') + ' / ' + inOrderPorts + ' шт.</div>' +
          '<div style="font-size:.72rem;color:var(--text-3);margin-top:2px">' + (factPorts !== null ? (factPorts >= inOrderPorts ? '🟢 план закрыт' : 'остаток: ' + (inOrderPorts - factPorts)) : 'план портов') + '</div>' +
        '</td>';
      }

      // 7. Сумма субподряда (₽) (из subcontracts_total_price / getTaskContractorFinance(t))
      var subTotalPrice = Number(t.subcontractsTotalPrice || t.subcontracts_total_price);
      if (!subTotalPrice) subTotalPrice = getTaskContractorFinance(t).total || 0;
      var colPrice = '';
      if (subTotalPrice > 0) {
        var partsPricesStr = subs.length > 1 ? ('<div style="font-size:.7rem;color:var(--text-3);text-align:right;margin-top:2px">' + subs.map(function(s){ return fmtMoneyShort(Number(s.price_agreed)||0); }).join(' + ') + '</div>') : '';
        colPrice = '<td style="vertical-align:top;white-space:nowrap;text-align:right">' +
          '<div style="font-weight:700;color:var(--orange-dark);font-size:.84rem">' + fmtMoney(subTotalPrice) + '</div>' +
          partsPricesStr +
        '</td>';
      } else {
        colPrice = '<td style="vertical-align:top;white-space:nowrap;text-align:right"><span class="t3">—</span></td>';
      }

      // 8. Взаиморасчёты (счета / оплачено / остаток к выплате из rawData.contractorSettlements и subPayments)
      var settlements = (t.rawData && Array.isArray(t.rawData.contractorSettlements)) ? t.rawData.contractorSettlements : [];
      var sInvoiced = settlements.reduce(function(a, s){ return a + (Number(s.invoice_amount) || 0); }, 0);
      var sPaid = settlements.reduce(function(a, s){ return a + (Number(s.payment_amount) || 0); }, 0);
      var subPayments = (t._payments || (t.rawData && Array.isArray(t.rawData.subPayments) ? t.rawData.subPayments : []));
      var pPaid = subPayments.reduce(function(a, p){ return a + (Number(p.amount) || 0); }, 0);
      var totalPaid = Math.max(sPaid, pPaid);
      if (totalPaid === 0 && String(t.oplata || '').toLowerCase().includes('оплач') && subTotalPrice > 0) {
        totalPaid = subTotalPrice;
      }
      var totalInvoiced = sInvoiced > 0 ? sInvoiced : subTotalPrice;
      var remaining = Math.max(0, (subTotalPrice > 0 ? subTotalPrice : totalInvoiced) - totalPaid);

      var colSettlement = '<td style="vertical-align:top;white-space:nowrap;font-size:.76rem">' +
        '<div><span style="color:var(--text-3)">Счета:</span> <b>' + (totalInvoiced > 0 ? fmtMoney(totalInvoiced) : '—') + '</b></div>' +
        '<div style="margin-top:1px"><span style="color:var(--green)">Оплачено:</span> <b style="color:var(--green)">' + fmtMoney(totalPaid) + '</b></div>' +
        '<div style="font-size:.72rem;font-weight:600;margin-top:1px;color:' + (remaining > 0 ? 'var(--orange-dark)' : 'var(--green)') + '">' +
          (remaining > 0 ? ('Остаток: ' + fmtMoney(remaining)) : '🟢 Оплачено') +
        '</div>' +
      '</td>';

      // 9. Статус СМР и быстрое действие (открыть карточку сразу на вкладке «Исполнение / СМР» или открыть «🪄 Мастер»)
      var smrStatus = t.statusSmr || t.status_smr || 'pending';
      var smrBadge = smrStatus === 'done'
        ? '<span class="badge b-green" style="font-size:.68rem">СМР выполнены</span>'
        : (smrStatus === 'in_progress'
          ? '<span class="badge b-orange" style="font-size:.68rem">СМР в работе</span>'
          : ((subs.length > 0 || t.contractor) ? '<span class="badge b-blue" style="font-size:.68rem">Назначен</span>' : '<span class="badge b-gray" style="font-size:.68rem">Не назначен</span>'));

      var colSmr = '<td style="vertical-align:top;text-align:right;white-space:nowrap">' +
        '<div>' + smrBadge + '</div>' +
        '<div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;margin-top:4px">' +
          '<button type="button" class="btn btn-xs btn-primary" data-sub-action="open-smr" data-task-id="' + tid + '" style="font-size:.74rem;padding:3px 8px" title="Открыть карточку на вкладке СМР / Спецификация">👷 СМР</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" data-sub-action="open-wizard" data-task-id="' + tid + '" style="font-size:.74rem;padding:3px 7px;border:1px solid #f97316;color:#c2410c;font-weight:600" title="Открыть Мастер субподряда">🪄 Мастер</button>' +
        '</div>' +
      '</td>';

      tableRows += '<tr id="task_row_' + tid + '" data-tid="' + tid + '" style="transition:background .2s">' +
        colChk +
        colNumber +
        colObj +
        colDeadline +
        colContractor +
        colVolume +
        colPrice +
        colSettlement +
        colSmr +
      '</tr>';
      return;
    }

    if (appMode === 'supply') {
      var sStatus = t.status_supply === 'delivered' 
        ? '<button type="button" class="badge b-green" style="cursor:pointer;padding:4px 8px;font-size:.76rem;border:none" onclick="window.toggleQuickSupplyStatus(\'' + tid + '\', \'pending\')" title="Нажмите для смены статуса">🟢 Доставлено ▾</button>'
        : (t.status_supply === 'shipped'
          ? '<button type="button" class="badge b-blue" style="cursor:pointer;padding:4px 8px;font-size:.76rem;border:none" onclick="window.toggleQuickSupplyStatus(\'' + tid + '\', \'delivered\')" title="Нажмите, чтобы отметить «Доставлено»">🟡 Отправлено ▾</button>'
          : '<button type="button" class="badge b-yellow" style="cursor:pointer;padding:4px 8px;font-size:.76rem;border:none" onclick="window.toggleQuickSupplyStatus(\'' + tid + '\', \'shipped\')" title="Нажмите, чтобы отметить «Отправлено»">🔴 Ожидает ▾</button>');

      var sTk = t.supply_tk || 'СДЭК';
      var sTrack = t.supply_track || '— указать';
      var sDate = t.supply_date ? safeDateRu(t.supply_date) : (t.deadline ? safeDateRu(t.deadline) : '—');

      tableRows += '<tr id="task_row_' + tid + '" data-tid="' + tid + '" style="transition:background .2s">' +
        colChk +
        // 1. № и адрес
        '<td style="vertical-align:top;max-width:280px">' +
          '<div style="font-weight:700;font-size:.85rem"><button class="btn-link" onclick="openCard(\'' + tid + '\')">⇒ ' + highlight(t.id, q) + '</button></div>' +
          '<div style="font-size:.78rem;color:var(--text-2);margin-top:2px;line-height:1.25" title="' + escHtml(t.address || '') + '">' + highlight(t.address || 'Адрес не указан', q) + '</div>' +
          (t.region ? '<span class="badge b-gray" style="font-size:.65rem;margin-top:3px">' + escHtml(t.region) + '</span>' : '') +
        '</td>' +
        // 2. Поставщик / Склад
        '<td style="vertical-align:top;font-size:.82rem">' +
          '<div style="font-weight:600;color:var(--text)">' + escHtml(t.supplier_name || 'Склад: Ультима') + '</div>' +
          '<div style="font-size:.72rem;color:var(--text-3)">Склад отгрузки</div>' +
        '</td>' +
        // 3. Статус ТМЦ в 1 клик
        '<td style="vertical-align:top;white-space:nowrap">' + sStatus + '</td>' +
        // 4. ТК и трек-номер
        '<td style="vertical-align:top;font-size:.8rem">' +
          '<div style="cursor:pointer" onclick="window.openQuickSupplyModal(\'' + tid + '\')" title="Кликните для редактирования ТК и трек-номера">' +
            '🚚 <b>' + escHtml(sTk) + '</b>' +
            '<div style="font-size:.74rem;color:var(--blue);margin-top:2px">Трек: ' + escHtml(sTrack) + ' ✏️</div>' +
          '</div>' +
        '</td>' +
        // 5. Срок доставки
        '<td style="vertical-align:top;font-size:.8rem">' +
          '<div style="font-weight:600;color:var(--text)">' + sDate + '</div>' +
          '<div style="font-size:.7rem;color:var(--text-3)">план прибытия</div>' +
        '</td>' +
        // 6. Спецификация
        '<td style="vertical-align:top;text-align:right;white-space:nowrap">' +
          '<button type="button" class="btn btn-xs btn-primary" onclick="location.hash=\'#card/' + tid + '?tab=supply\'" style="font-size:.74rem;padding:3px 8px" title="Открыть спецификацию ТМЦ">📦 ТМЦ / Спека</button> ' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window.downloadAuthFile(\'/api/tasks/' + encodeURIComponent(tid) + '/materials/export-excel\', \'' + tid + '_Приложение_2_ТМЦ.xlsx\')" style="font-size:.74rem;padding:3px 6px;border:1px solid #2563eb;color:#1d4ed8;font-weight:600" title="Скачать Приложение №2 в Excel">📊 Прил. 2</button>' +
        '</td>' +
      '</tr>';
      return;
    }

    if (appMode === 'docs') {
      var dStatus = computeTaskDynamicIdStatus(t);
      var cCount = Number(t.fact) || Number(t.in_order) || 0;
      var hasScheme = (t.tech_link && t.tech_link.length > 3) || t.id_link;

      tableRows += '<tr id="task_row_' + tid + '" data-tid="' + tid + '" style="transition:background .2s">' +
        colChk +
        // 1. № и адрес
        '<td style="vertical-align:top;max-width:280px">' +
          '<div style="font-weight:700;font-size:.85rem"><button class="btn-link" onclick="openCard(\'' + tid + '\')">⇒ ' + highlight(t.id, q) + '</button></div>' +
          '<div style="font-size:.78rem;color:var(--text-2);margin-top:2px;line-height:1.25" title="' + escHtml(t.address || '') + '">' + highlight(t.address || 'Адрес не указан', q) + '</div>' +
        '</td>' +
        // 2. Заказчик
        '<td style="vertical-align:top;font-size:.82rem">' +
          '<div style="font-weight:600;color:var(--text)">' + escHtml(t.customer || 'ПАО Сбербанк') + '</div>' +
          '<div style="font-size:.72rem;color:var(--text-3)">' + ((t.customer && t.customer.includes('СФР')) ? 'СФР (без АОСР)' : 'Гос. заказчик') + '</div>' +
        '</td>' +
        // 3. Статус ИД
        '<td style="vertical-align:top;white-space:nowrap">' +
          '<span class="badge ' + dStatus.badgeClass + '" style="font-size:.76rem;padding:3px 8px;font-weight:700">' + escHtml(dStatus.label) + '</span>' +
        '</td>' +
        // 4. КЖ и схема
        '<td style="vertical-align:top;font-size:.8rem">' +
          '<div>🔌 Портов: <b>' + cCount + ' шт.</b></div>' +
          '<div>' + (hasScheme ? '<span style="color:var(--green);font-size:.72rem">📐 Схема готова</span>' : '<span style="color:var(--text-3);font-size:.72rem">Схема не нарисована</span>') + '</div>' +
        '</td>' +
        // 5. Действия с ИД
        '<td style="vertical-align:top;text-align:right;white-space:nowrap">' +
          '<button type="button" class="btn btn-xs btn-primary" onclick="window.openIdModerationModal(\'' + tid + '\')" style="background:#0f766e;font-size:.74rem;padding:3px 8px;font-weight:700" title="Интерактивная модерация комплекта ИД">👁️ Модерация</button> ' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window.downloadAuthFile(\'/api/tasks/' + encodeURIComponent(tid) + '/id-album.pdf\', \'' + tid + '_Альбом_ИД.pdf\')" style="border:1px solid #dc2626;color:#dc2626;font-size:.74rem;padding:3px 6px;font-weight:700" title="Скачать или открыть готовый альбом ИД в PDF">📑 PDF</button> ' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window.openSchemeEditor(\'' + tid + '\')" style="border:1px solid #2563eb;color:#1d4ed8;font-size:.74rem;padding:3px 6px" title="Редактор исполнительной схемы СКС">📐 Схема</button>' +
        '</td>' +
      '</tr>';
      return;
    }
    var fin = getTaskFinance(t);
    var cFin = getTaskContractorFinance(t);

    // 1. Номер + статус + маркер высокого приоритета + номер ЭДО + бейдж отклонения на доработку
    var isHighPr = (t.priority === 'high');
    var prMark = isHighPr ? '<span title="Высокий приоритет" style="color:var(--red);font-size:.85rem;margin-right:3px">🔴</span>' : '';
    var effStatus = t.status;
    if (effStatus === 'pending' && ((t.contractor && String(t.contractor).trim()) || (t.assignee && String(t.assignee).trim()))) {
      effStatus = 'progress';
    }
    var rejectReason = (t.rawData && t.rawData.rejectReason) || (t.raw_data && t.raw_data.rejectReason) || t.overdueReason || '';
    var rejectBadge = (rejectReason && (t.assignmentStatus === 'declined' || t.assignment_status === 'declined' || effStatus === 'cancelled' || t.status === 'cancelled'))
      ? '<div style="margin-top:2px"><span class="badge b-red" style="font-size:.68rem;padding:2px 5px;display:inline-block;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="Причина: ' + escHtml(rejectReason) + '">⛔ На доработке: ' + escHtml(rejectReason) + '</span></div>'
      : '';
    var stBdg = '<div style="margin-top:3px">' + stBadge(effStatus) + (Number(t.openRemarksCount) > 0 ? ' <span class="badge b-red" style="font-size:.65rem;padding:1px 4px" title="Замечания">⚠️ ' + t.openRemarksCount + '</span>' : '') + '</div>' + rejectBadge;
    var edoBadge = t.edoNumber
      ? '<div class="t3" style="font-size:.68rem;color:var(--blue);margin-top:2px;font-family:monospace" title="Номер документа в ЭДО Заказчика">ЭДО: ' + highlight(t.edoNumber, q) + '</div>'
      : '';
    var colNumber = '<td style="vertical-align:top;white-space:nowrap">' +
      prMark + '<button class="btn-link" style="font-weight:700;font-size:.84rem" onclick="openCard(\'' + tid + '\')">⇒ ' + highlight(t.id, q) + '</button>' +
      edoBadge +
      stBdg +
    '</td>';

    // 2. Дата заявки и Дата ПП (внесения)
    var dateFormatted = t.dateZayavki ? safeDateRu(t.dateZayavki) : '—';
    var datePpFormatted = t.currentDate ? safeDateRu(t.currentDate) : '';
    var colDate = '<td style="vertical-align:top;white-space:nowrap;font-size:.8rem">' +
      '<div style="font-weight:600;color:var(--text)" title="Дата поступления заявки Заказчика">' + dateFormatted + '</div>' +
      (datePpFormatted ? '<div class="t3" style="font-size:.7rem;margin-top:2px" title="Дата ПП (планового подтверждения / дата внесения)">ПП: ' + datePpFormatted + '</div>' : '') +
    '</td>';

    // 3. Дедлайн + светофор риска + быстрый перенос + статус переноса Заказчиком (EXT-2)
    var dlDate = t.deadline ? safeDateRu(t.deadline) : '';
    var risk = getTaskDeadlineRisk(t);
    var riskBadge = '<div style="margin-top:2px"><span class="badge ' + risk.cls + '" style="font-size:.67rem;padding:1px 5px;font-weight:700" title="' + escHtml(risk.hint) + '">' + escHtml(risk.label) + '</span></div>';
    var reschedStatus = (t.rawData && t.rawData.rescheduleStatus) || (t.raw_data && t.raw_data.rescheduleStatus) || '';
    var reschedIndicator = '';
    if (reschedStatus === 'approved') {
      reschedIndicator = '<div style="margin-top:2px"><span class="badge b-green" style="font-size:.65rem;padding:1px 5px" title="Перенос дедлайна согласован Заказчиком">✓ Согласован перенос</span></div>';
    } else if (reschedStatus === 'pending') {
      reschedIndicator = '<div style="margin-top:2px"><span class="badge b-yellow" style="font-size:.65rem;padding:1px 5px" title="Перенос дедлайна на согласовании у Заказчика">⏳ Перенос на согласовании</span></div>';
    } else if (reschedStatus === 'rejected') {
      reschedIndicator = '<div style="margin-top:2px"><span class="badge b-red" style="font-size:.65rem;padding:1px 5px" title="Перенос дедлайна отклонён Заказчиком">✕ Перенос отклонён</span></div>';
    }
    var postponeBtn = '<button type="button" class="btn-link" onclick="openQuickDeadlinePostponeModal(\'' + tid + '\')" title="Календарное планирование: быстрый перенос дедлайна с обоснованием" style="font-size:.68rem;color:var(--text-3);display:block;margin-top:2px;padding:0;text-decoration:none">⏱️ Перенос срока</button>';
    var dlHtml = (dlDate ? ('<div style="font-weight:600;color:var(--text)">' + dlDate + '</div>' + riskBadge) : riskBadge) + reschedIndicator + postponeBtn;
    var colDeadline = '<td style="vertical-align:top;white-space:nowrap;font-size:.8rem">' + dlHtml + '</td>';

    // 4. Адрес объекта (компактно с картой и замером км)
    var addrText = t.address || t.title || '—';
    var realKm = (t.realDistanceKm != null && t.realDistanceKm > 0) ? Number(t.realDistanceKm) : ((t.real_distance_km != null && t.real_distance_km > 0) ? Number(t.real_distance_km) : null);
    var mapIconHtml = '<button type="button" class="btn-link" onclick="openQuickRouteMapModal(\'' + tid + '\')" title="Маршрут на карте, навигатор и километраж" style="font-size:.76rem;text-decoration:none;padding:0 3px;margin-left:4px;vertical-align:middle">🗺️' + (realKm ? (' <span style="font-size:.68rem;color:var(--blue);font-weight:700">' + realKm + ' км</span>') : '') + '</button>';
    var colAddress = '<td style="vertical-align:top;max-width:190px">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:4px">' +
        '<div style="font-weight:600;color:var(--text);line-height:1.25;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + escHtml(addrText) + '">' +
          highlight(addrText, q) +
        '</div>' +
        mapIconHtml +
      '</div>' +
      (t.vsp ? '<div class="t3" style="font-size:.7rem;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">№ ВСП: ' + escHtml(t.vsp) + '</div>' : '') +
    '</td>';

    // 5. Что делать (вид работ - компактный бейдж) + прямая ссылка на тех.инфо
    var wt = t.workType || 'СКС';
    var rawTech = t.tech_link || t.techLink || t.materials_link || t.materialsLink || (t.rawData && (t.rawData['Ссылка на тех. инфо'] || t.rawData['Ссылка на тех.инфо'] || t.rawData['Ссылка на тех инфо'] || t.rawData['Ссылка на диск'])) || '';
    var techLinkVal = String(rawTech).trim();
    var techLinkHtml = '';
    if (techLinkVal) {
      techLinkHtml = '<div style="margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:115px">' +
        '<a href="' + escHtml(techLinkVal) + '" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" style="font-size:.68rem;color:var(--blue);text-decoration:none;display:inline-flex;align-items:center;gap:3px;background:rgba(37,99,235,0.08);padding:1px 5px;border-radius:4px;border:1px solid rgba(37,99,235,0.25);max-width:115px" title="' + escHtml(techLinkVal) + '">' +
          '<span>🔗</span> <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600">тех.инфо</span>' +
        '</a>' +
      '</div>';
    }

    var colWork = '<td style="vertical-align:top;max-width:115px">' +
      '<span class="badge b-gray" style="font-size:.74rem;font-weight:600;display:inline-block;max-width:115px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escHtml(wt) + '">' + escHtml(wt) + '</span>' +
      techLinkHtml +
    '</td>';

    // 6. Сколько (порты: факт / в заказе)
    var factPorts = t.fact !== null && t.fact !== undefined && t.fact !== '' ? Number(t.fact) : null;
    var inOrderPorts = Number(t.inOrder || 0);
    var colQty = '<td style="vertical-align:top;white-space:nowrap;font-weight:700;font-size:.82rem">' +
      (factPorts === null ? '—' : factPorts) + ' / ' + inOrderPorts + ' <span class="t3" style="font-size:.68rem;font-weight:normal">п.</span>' +
    '</td>';

    // 7. Подрядчик / Исполнитель, ПМ и быстрый входной контроль («Принять» / «На доработку»)
    var pmBadge = t.assignee
      ? '<div class="t3" style="font-size:.7rem;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-2)" title="Проект-менеджер (ПМ): ' + escHtml(t.assignee) + '">👔 ПМ: ' + highlight(t.assignee, q) + '</div>'
      : '';
    var quickTriageBtns = '<div style="display:flex;gap:3px;margin-top:3px">' +
      '<button type="button" class="btn btn-xs" style="background:#22c55e;color:#fff;border:none;border-radius:4px;padding:2px 5px;font-size:.67rem;font-weight:700" onclick="quickAcceptTask(\'' + tid + '\')" title="Входной контроль: принять заявку в работу">✓ Принять</button>' +
      '<button type="button" class="btn btn-xs" style="background:#ef4444;color:#fff;border:none;border-radius:4px;padding:2px 5px;font-size:.67rem;font-weight:700" onclick="quickRejectTask(\'' + tid + '\')" title="Отклонить заявку на доработку">✕ На доработку</button>' +
    '</div>';
    var colContr = '<td style="vertical-align:top;max-width:130px">' +
      '<button class="btn-link" style="text-align:left;max-width:130px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8rem" onclick="openContractorPicker(\'' + tid + '\')" title="' + escHtml(t.contractor || 'Назначить подрядчика') + '">' +
        (t.contractor ? ('👤 ' + escHtml(t.contractor)) : '<span class="t3" style="border-bottom:1px dashed var(--orange);color:var(--orange)">+ Назначить</span>') +
      '</button>' +
      pmBadge +
      quickTriageBtns +
    '</td>';

    // 8 & 9. Цена и Стоимость / Дорога
    var colPrice = '';
    var colTotal = '';

    if (appMode === 'customer') {
      var tariffBadge = '';
      try {
        if (typeof window.renderQuickTaskTariffBadge === 'function') {
          tariffBadge = window.renderQuickTaskTariffBadge(t) || '';
        }
      } catch (badgeErr) {
        console.warn('renderQuickTaskTariffBadge error:', badgeErr);
      }
      colPrice = '<td style="vertical-align:top;white-space:nowrap;color:var(--text-2);font-size:.8rem">' +
        (fin.unitPrice > 0 ? (fmtMoney(fin.unitPrice) + '<span class="t3" style="font-size:.68rem">/ед</span>') : '<span class="t3">—</span>') +
        tariffBadge +
      '</td>';
      var roadLine = '';
      var trMoney = fin.transport;
      if (realKm && trMoney === realKm && realKm <= 1000) {
        trMoney = realKm * 2 * (Number(t.kmRate || t.km_rate) || 70);
      }
      if (trMoney > 0 || (realKm && realKm > 0)) {
        var kmPrefix = realKm ? (realKm + ' км · ') : '';
        roadLine = '<div style="font-size:.7rem;color:var(--text-2);margin-top:2px;cursor:pointer" onclick="openQuickRouteMapModal(\'' + tid + '\')" title="Транспортные расходы / удаленность (кликните для замера км по навигатору)">🚗 ' + kmPrefix + fmtMoney(trMoney) + (!realKm && trMoney > 0 ? ' <span style="font-size:.65rem;color:var(--text-3);opacity:0.85">(замерить км)</span>' : '') + '</div>';
      } else {
        roadLine = '<div style="font-size:.68rem;color:var(--text-3);margin-top:2px;cursor:pointer" onclick="openQuickRouteMapModal(\'' + tid + '\')" title="Указать километраж по навигатору">+ дорога (км)</div>';
      }
      colTotal = '<td style="vertical-align:top;white-space:nowrap">' +
        '<div style="font-weight:700;color:var(--blue);font-size:.84rem">' + fmtMoney(fin.total) + '</div>' +
        roadLine +
      '</td>';
    } else if (appMode === 'contractor') {
      var cPorts = factPorts !== null ? factPorts : inOrderPorts;
      var effUnitPrice = cFin.unitPrice > 0 ? cFin.unitPrice : (cPorts > 0 ? Math.round(cFin.total / cPorts) : 0);
      var priceBtn = (effUnitPrice > 0 || cFin.total > 0)
        ? '<button type="button" class="btn-link" onclick="openSubcontractRateModal(\'' + tid + '\')" title="Индивидуальные договорные условия подряда (кликните для изменения)" style="font-weight:600;color:var(--text);font-size:.8rem;text-align:left">' +
            fmtMoney(effUnitPrice) + '<span class="t3" style="font-size:.68rem">/ед <span style="font-size:.7rem;opacity:0.65">✏️</span></span>' +
          '</button>'
        : '<button type="button" class="btn btn-xs btn-ghost" style="color:var(--orange);border:1px dashed var(--orange);font-size:.72rem;padding:2px 6px" onclick="openSubcontractRateModal(\'' + tid + '\')" title="Задать ставку за порт или сумму подряда">+ Задать ставку</button>';

      colPrice = '<td style="vertical-align:top;white-space:nowrap">' + priceBtn + '</td>';

      var cRealKm = (t.realDistanceKm != null && t.realDistanceKm > 0) ? Number(t.realDistanceKm) : ((t.real_distance_km != null && t.real_distance_km > 0) ? Number(t.real_distance_km) : null);
      var cRoadLine = (cFin.transport > 0 || (cRealKm && cRealKm > 0))
        ? '<div style="font-size:.7rem;color:var(--text-2);margin-top:2px;cursor:pointer" onclick="openQuickRouteMapModal(\'' + tid + '\')" title="Транспортные расходы подрядчика (кликните для изменения км)">🚗 ' + (cRealKm ? (cRealKm + ' км · ') : '') + fmtMoney(cFin.transport) + '</div>'
        : '';

      if (cFin.total > 0) {
        var marginRow = fin.total > cFin.total ? (fin.total - cFin.total) : 0;
        var marginPctRow = fin.total > 0 ? Math.round(marginRow / fin.total * 100) : 0;
        colTotal = '<td style="vertical-align:top;white-space:nowrap">' +
          '<div style="font-weight:700;color:var(--orange-dark);font-size:.84rem">' + fmtMoney(cFin.total) + '</div>' +
          cRoadLine +
          (fin.total > 0 ? '<div style="font-size:.68rem;color:var(--green);font-weight:600">маржа +' + fmtMoney(marginRow) + ' (' + marginPctRow + '%)</div>' : '') +
        '</td>';
      } else {
        colTotal = '<td style="vertical-align:top;white-space:nowrap">' +
          '<div style="color:var(--text-3);font-size:.8rem;font-weight:500">Не оценено</div>' +
          cRoadLine +
          '<div class="t3" style="font-size:.68rem">ждёт условий</div>' +
        '</td>';
      }
    } else if (appMode === 'supply') {
      var supplyStatus = t.status_supply === 'delivered' ? '<span class="badge b-green">Доставлено</span>' : (t.status_supply === 'shipped' ? '<span class="badge b-blue">Отправлено</span>' : '<span class="badge b-gray">Ожидает отправки</span>');
      var trackNo = t.supply_track || '—';
      colPrice = '<td style="vertical-align:top;font-size:.8rem">' + supplyStatus + '</td>';
      colTotal = '<td style="vertical-align:top;font-size:.8rem"><div style="color:var(--text-2)">Склад: Ультима</div><div style="font-size:.75rem;color:var(--blue);margin-top:2px">Трек: ' + trackNo + '</div></td>';
    } else if (appMode === 'docs') {
      var idStatus = (t.status_id === 'done' || t.status_id === 'accepted') ? '<span class="badge b-green">Принята</span>' : (t.status_id === 'review' ? '<span class="badge b-blue">На проверке</span>' : '<span class="badge b-gray">Не начата</span>');
      var portalCheck = (t.rawData && (t.rawData['загружено на портал'] || '').toString().trim().toLowerCase() === 'да') ? '✅ Загружен' : '❌ Не загружен';
      colPrice = '<td style="vertical-align:top;font-size:.8rem">' + idStatus + '</td>';
      colTotal = '<td style="vertical-align:top;font-size:.8rem">' + portalCheck + '</td>';
    } else if (appMode === 'finance') {
      var payStatus = t.status_finance === 'paid' ? '<span class="badge b-green">Оплачено</span>' : (t.status_finance === 'invoice' ? '<span class="badge b-blue">Счет выставлен</span>' : '<span class="badge b-gray">Ожидает счета</span>');
      var marginRow = fin.total > cFin.total ? (fin.total - cFin.total) : 0;
      var marginPctRow = fin.total > 0 ? Math.round(marginRow / fin.total * 100) : 0;
      colPrice = '<td style="vertical-align:top;font-size:.8rem">' + payStatus + '</td>';
      colTotal = '<td style="vertical-align:top;font-size:.8rem;font-weight:600;color:var(--text)"><div style="font-size:.7rem;color:var(--green);margin-top:2px">Маржа ' + fmtMoney(marginRow) + ' ₽ (' + marginPctRow + '%)</div></td>';
    }

    // 10. Действия
    var colActions = '<td style="vertical-align:top;text-align:right"><button class="btn btn-sm btn-ghost btn-icon" onclick="exportTask(\'' + tid + '\')" title="Экспорт заявки / печать">&#x2B07;</button></td>';

    tableRows += '<tr id="task_row_' + tid + '" data-tid="' + tid + '" style="transition:background .2s">' +
      colChk +
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
    ? '<tr><td colspan="11" style="text-align:center;padding:1rem;color:var(--text-3)">… ещё ' + (filtered.length - 300) + ' заявок — уточните фильтр</td></tr>'
    : '';

  var contrOptions = (S.contractors || []).filter(function(c) {
    return c && (c.name_short || c.name) && c.type !== 'customer' && !String(c.inn || '').startsWith('CUST-');
  }).map(function(c) {
    var name = c.name_short || c.name || '';
    return '<option value="' + escHtml(name) + '">' + escHtml(name) + '</option>';
  }).join('');

  var batchActionBarHtml = '<div id="tasksBatchActionBar" class="card" style="background:#f0f9ff;border:1.5px solid #0284c7;border-radius:8px;padding:8px 12px;margin-bottom:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;' + (S.selectedTasks && S.selectedTasks.size > 0 ? 'display:flex' : 'display:none') + '">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<span style="font-weight:700;font-size:.85rem;color:#0369a1">' +
        'Выбрано: <span id="tasksSelectedCount">' + (S.selectedTasks ? S.selectedTasks.size : 0) + '</span>' +
      '</span>' +
      '<button type="button" class="btn btn-xs btn-ghost" id="btnTasksBatchDeselectAll" style="font-size:.74rem;padding:2px 8px">Снять выделение</button>' +
      '<span style="color:#cbd5e1">|</span>' +
      '<div style="display:flex;align-items:center;gap:4px">' +
        '<select class="select" id="tasksBatchStatusSelect">' +
          '<option value="">— Статус —</option>' +
          '<option value="new">Новая</option>' +
          '<option value="assigned">Назначена / В работе</option>' +
          '<option value="in_progress">В процессе</option>' +
          '<option value="done">Выполнена (СМР)</option>' +
          '<option value="cancelled">Отменена</option>' +
          '<option value="inspection">Контроль / Инспекция</option>' +
          '<option value="rework">На доработке</option>' +
        '</select>' +
        '<button type="button" class="btn btn-xs btn-primary" id="btnTasksBatchApplyStatus" style="font-size:.75rem;padding:3px 8px">Применить статус</button>' +
      '</div>' +
      '<span style="color:#cbd5e1">|</span>' +
      '<div style="display:flex;align-items:center;gap:4px">' +
        '<button type="button" class="btn btn-xs" id="btnTasksBatchAccept" style="background:#16a34a;color:#fff;border:none;border-radius:4px;font-size:.75rem;padding:3px 8px;font-weight:600">✓ Принять выбранные</button>' +
        '<button type="button" class="btn btn-xs" id="btnTasksBatchReject" style="background:#dc2626;color:#fff;border:none;border-radius:4px;font-size:.75rem;padding:3px 8px;font-weight:600">✕ На доработку выбранные</button>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
      '<select class="select" id="tasksBatchContractorSelect">' +
        '<option value="">— Назначить подрядчика —</option>' +
        contrOptions +
      '</select>' +
      '<button type="button" class="btn btn-xs btn-primary" id="btnTasksBatchApplyContractor" style="font-size:.75rem;padding:3px 8px">Назначить</button>' +
      '<button type="button" class="btn btn-xs btn-ghost" id="btnTasksBatchClearContractor" style="font-size:.75rem;padding:3px 8px;color:#dc2626;border-color:#fca5a5">Снять подрядчика</button>' +
    '</div>' +
  '</div>';

  return '<h1 class="page-title">Заявки</h1>' +
    topControls +
    filtersPanelHtml +
    chipsHtml +
    totals +
    batchActionBarHtml +
    '<div class="card tbl-wrap">' +
      '<table class="tasks-table"><thead><tr>' +
        '<th style="width:36px;text-align:center"><input type="checkbox" id="selectAllTasksListChk" title="Выбрать все (по текущему отбору фильтра)"></th>' +
        (function() {
          if (appMode === 'subcontract') {
            return '<th style="width:130px;cursor:pointer;user-select:none" onclick="window.sortTasksBy(\'id\')" title="Сортировать по номеру заявки">№ Заявки / Статус' + taskSortIndicator('id') + '</th>' +
              '<th style="width:260px;cursor:pointer;user-select:none" onclick="window.sortTasksBy(\'address\')" title="Сортировать по адресу">Объект и адрес' + taskSortIndicator('address') + '</th>' +
              '<th style="width:115px;cursor:pointer;user-select:none" onclick="window.sortTasksBy(\'deadline\')" title="Сортировать по дедлайну">Дедлайн / Риск' + taskSortIndicator('deadline') + '</th>' +
              '<th style="width:210px;cursor:pointer;user-select:none" onclick="window.sortTasksBy(\'contractor\')" title="Сортировать по подрядчику">Подрядчик(и) и договор' + taskSortIndicator('contractor') + '</th>' +
              '<th style="width:125px">Объём (порты)</th>' +
              '<th style="width:135px;text-align:right">Сумма субподряда (₽)</th>' +
              '<th style="width:160px">Взаиморасчёты</th>' +
              '<th style="width:170px;text-align:right">Статус СМР / Действия</th>';
          }
          if (appMode === 'supply') {
            return '<th style="width:280px;cursor:pointer;user-select:none" onclick="window.sortTasksBy(\'address\')" title="Сортировать по адресу">№ Заявки / Адрес объекта' + taskSortIndicator('address') + '</th>' +
              '<th style="width:180px">Поставщик / Склад</th>' +
              '<th style="width:170px">Статус отгрузки (клик в 1 клик)</th>' +
              '<th style="width:180px">ТК / Трек-номер</th>' +
              '<th style="width:130px;cursor:pointer;user-select:none" onclick="window.sortTasksBy(\'deadline\')" title="Сортировать по дедлайну">Срок доставки' + taskSortIndicator('deadline') + '</th>' +
              '<th style="width:150px;text-align:right">Спецификация ТМЦ</th>';
          }
          if (appMode === 'docs') {
            return '<th style="width:280px;cursor:pointer;user-select:none" onclick="window.sortTasksBy(\'address\')" title="Сортировать по адресу">№ Заявки / Адрес объекта' + taskSortIndicator('address') + '</th>' +
              '<th style="width:160px">Заказчик / Объект</th>' +
              '<th style="width:180px">Статус ИД (динамический)</th>' +
              '<th style="width:160px">КЖ и Схема СКС</th>' +
              '<th style="width:190px;text-align:right">Действия с ИД</th>';
          }
          return '<th style="width:120px;cursor:pointer;user-select:none" onclick="window.sortTasksBy(\'id\')" title="Сортировать по номеру заявки">Номер / ЭДО' + taskSortIndicator('id') + '</th>' +
            '<th style="width:90px;cursor:pointer;user-select:none" onclick="window.sortTasksBy(\'date\')" title="Сортировать по дате поступления">Дата / ПП' + taskSortIndicator('date') + '</th>' +
            '<th style="width:105px;cursor:pointer;user-select:none" onclick="window.sortTasksBy(\'deadline\')" title="Сортировать по дедлайну">Дедлайн / Риск' + taskSortIndicator('deadline') + '</th>' +
            '<th style="width:190px;cursor:pointer;user-select:none" onclick="window.sortTasksBy(\'address\')" title="Сортировать по адресу">Адрес / Карта' + taskSortIndicator('address') + '</th>' +
            '<th style="width:105px">Что делать</th>' +
            '<th style="width:85px">Сколько</th>' +
            '<th style="width:130px;cursor:pointer;user-select:none" onclick="window.sortTasksBy(\'contractor\')" title="Сортировать по подрядчику">Исполнитель / ПМ' + taskSortIndicator('contractor') + '</th>' +
            (function() {
              if (appMode === 'customer') return '<th style="width:90px">Цена (Вход)</th><th style="width:130px;cursor:pointer;user-select:none" onclick="window.sortTasksBy(\'amount\')" title="Сортировать по стоимости">Стоимость / Дорога' + taskSortIndicator('amount') + '</th>';
              if (appMode === 'finance') return '<th style="width:100px">Счета / Акты</th><th style="width:130px;cursor:pointer;user-select:none" onclick="window.sortTasksBy(\'amount\')" title="Сортировать по марже">Фин. итог (Маржа)' + taskSortIndicator('amount') + '</th>';
              return '';
            })() +
            '<th style="width:36px"></th>';
        })() +
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
        '<input id="pc_phone" type="text" placeholder="Телефон организации">' +
        '<input id="pc_email" type="text" placeholder="Email">' +
      '</div>' +
      '<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:12px">' +
        '<div style="font-weight:700;font-size:.78rem;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:6px">' +
          '<span>👷 Монтажник / Бригада (для списков и писем на допуск):</span>' +
        '</div>' +
        '<div class="g2 mb">' +
          '<input id="pc_inst_name" type="text" placeholder="ФИО монтажника / бригадира">' +
          '<input id="pc_inst_phone" type="text" placeholder="Телефон монтажника">' +
        '</div>' +
        '<div class="g2 mb">' +
          '<input id="pc_inst_pass" type="text" placeholder="Паспорт (серия, номер, кем и когда выдан)">' +
          '<input id="pc_inst_car" type="text" placeholder="Автомобиль, госномер">' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem">' +
        '<button class="btn btn-sm btn-ghost" onclick="S.cpMode=\'search\';renderApp()">← Назад к поиску</button>' +
        '<span><span id="pc_status" style="margin-right:1rem;color:var(--text-3);font-size:.8rem"></span>' +
        '<button class="btn" onclick="addContractorFromPicker(\'' + S.cpTaskId.replace(/'/g,"\\'") + '\')">+ Сохранить и назначить</button></span>' +
      '</div>';
  } else {
    var qy = (S.cpQuery || '').toLowerCase();
    body =
      '<div style="position:relative; margin-bottom:.75rem">' +
        '<input type="text" id="cp_search_inp" placeholder="Поиск по названию или ИНН..." value="' + (S.cpQuery||'').replace(/"/g,'&quot;') + '" ' +
          'oninput="onContractorPickerSearch(this.value)" style="width:100%; padding:8px 30px 8px 10px; border:1px solid var(--border); border-radius:6px" autofocus>' +
        '<button id="cp_search_clear_btn" onclick="clearContractorPickerSearch()" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--text-3); font-size:1.1rem; display:' + (S.cpQuery ? 'block' : 'none') + '">&times;</button>' +
      '</div>' +
      '<div id="cp_list_container" style="max-height:300px;overflow-y:auto">' + renderContractorPickerRows(qy) + '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem">' +
        (t.contractor ? '<button class="btn btn-sm btn-ghost" style="color:var(--red);border-color:#fca5a5" onclick="removeContractorFromTask(\'' + String(S.cpTaskId).replace(/'/g,"\\'") + '\')">❌ Убрать подрядчика</button>' : '<span></span>') +
        '<button class="btn btn-sm" onclick="S.cpMode=\'new\';renderApp()">+ Добавить нового</button>' +
      '</div>';
  }

  var pickerTitle = (t.contractor ? 'Сменить подрядчика' : 'Назначить подрядчика') + ' — заявка ' + escHtml(t.id);
  return '<div class="modal-overlay" onclick="if(event.target===this) closeContractorPicker()">' +
    '<div class="modal-box">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">' +
        '<h3 style="margin:0">' + pickerTitle + '</h3>' +
        '<button class="btn btn-sm btn-ghost" onclick="closeContractorPicker()">✕</button>' +
      '</div>' +
      body +
    '</div>' +
  '</div>';
}

function openContractorPicker(taskId) {
  var targetId = (typeof S !== 'undefined' && S.page === 'kanban') ? ('kcard_' + taskId) : ('task_row_' + taskId);
  if (window.savePageScroll) window.savePageScroll(targetId);
  S.cpTaskId = taskId;
  S.cpMode = 'search';
  S.cpQuery = '';
  renderApp();
}

function closeContractorPicker() {
  S.cpTaskId = null;
  var oldCp = document.getElementById('_app_contractor_picker_modal');
  if (oldCp) oldCp.remove();
  renderApp();
  if (window.restorePageScroll) window.restorePageScroll();
}

function renderContractorPickerRows(qy) {
  qy = (qy || '').toLowerCase();
  var matches = (S.contractors || []).filter(function(c) {
    if (!c || !c.name_short) return false;
    if (c.type === 'customer' || String(c.inn || '').startsWith('CUST-')) return false;
    if (!qy) return true;
    return (c.name_short||'').toLowerCase().indexOf(qy) !== -1 ||
           (c.name_full||'').toLowerCase().indexOf(qy) !== -1 ||
           (c.inn||'').toLowerCase().indexOf(qy) !== -1;
  }).slice(0, 30);

  var html = '';
  var curT = (S.tasks || []).find(function(x){ return String(x.id) === String(S.cpTaskId); });
  if (curT && curT.contractor && !qy) {
    html += '<div class="field-row" style="cursor:pointer;background:#fef2f2;border:1px dashed #fca5a5;margin-bottom:6px;border-radius:6px;padding:6px 10px" onclick="removeContractorFromTask(\'' + String(S.cpTaskId).replace(/'/g,"\\'") + '\')">' +
      '<div class="field-lbl" style="color:var(--red);font-weight:700">❌ Снять текущего подрядчика (' + escHtml(curT.contractor) + ')</div>' +
      '<div class="field-val t3" style="font-size:.72rem">Перевести заявку в «Не распределено»</div>' +
    '</div>';
  }

  if (matches.length) {
    html += matches.map(function(c) {
      return '<div class="field-row" style="cursor:pointer;padding:8px 10px;border-radius:6px" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="assignContractorToTask(\'' + String(S.cpTaskId).replace(/'/g,"\\'") + '\',\'' + (c.name_short||'').replace(/'/g,"\\'") + '\')">' +
        '<div class="field-lbl" style="font-weight:600">' + escHtml(c.name_short) + '</div>' +
        '<div class="field-val t3" style="font-size:.75rem">ИНН ' + (c.inn||'—') + '</div>' +
      '</div>';
    }).join('');
  } else {
    html += '<div class="t3" style="padding:.5rem 0">Ничего не найдено</div>';
  }
  return html;
}

function onContractorPickerSearch(val) {
  S.cpQuery = val;
  var clearBtn = document.getElementById('cp_search_clear_btn');
  if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';
  var container = document.getElementById('cp_list_container');
  if (container) {
    container.innerHTML = renderContractorPickerRows(val);
  }
}

function clearContractorPickerSearch() {
  S.cpQuery = '';
  var inp = document.getElementById('cp_search_inp');
  if (inp) { inp.value = ''; inp.focus(); }
  var clearBtn = document.getElementById('cp_search_clear_btn');
  if (clearBtn) clearBtn.style.display = 'none';
  var container = document.getElementById('cp_list_container');
  if (container) {
    container.innerHTML = renderContractorPickerRows('');
  }
}

function assignContractorToTask(taskId, nameShort) {
  var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  var targetId = (typeof S !== 'undefined' && S.page === 'kanban') ? ('kcard_' + taskId) : ('task_row_' + taskId);
  if (window.savePageScroll) window.savePageScroll(targetId);
  var now = new Date().toLocaleString('ru');
  var author = S.user ? (S.user.full_name || S.user.username) : 'Система';
  var hist = t._history || [];
  if ((t.contractor||'') !== nameShort) {
    hist.push({date:now, author:author, field:'Подрядчик', old:t.contractor||'', new:nameShort});
  }

  var targetMacro = (t.macroStatus === 'new' || !t.macroStatus) ? 'assigned' : t.macroStatus;
  var targetStage = (t.stageNum === 0 || !t.stageNum) ? 1 : t.stageNum;

  api('/tasks/' + taskId, {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({contractor: nameShort, status: 'progress', macroStatus: targetMacro, stageNum: targetStage, _history: hist})
  })
    .then(function(){
      t.contractor = nameShort;
      t.status = 'progress';
      t.macroStatus = targetMacro;
      t.stageNum = targetStage;
      t._history = hist;
      if (S.cardDraft) delete S.cardDraft.contractor;
      if (window._taskSmrTax) delete window._taskSmrTax[taskId];
      closeContractorPicker(); 
      if (window._curCardSubcontracts && window._curCardSubcontracts[0]) {
        window._curCardSubcontracts[0].contractor_name = nameShort;
      }
      if (typeof loadCardSubcontracts === 'function' && S.cardId && String(S.cardId) === String(taskId)) { 
        loadCardSubcontracts(taskId); 
      }
      renderApp();
      if (window.restorePageScroll) window.restorePageScroll(targetId);
    })
    .catch(function(e){ alert('Ошибка: ' + e.message); });
}

function removeContractorFromTask(taskId) {
  if (!confirm('Снять подрядчика с заявки? Статус заявки вернется в «Не распределено».')) return;
  var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  var targetId = (typeof S !== 'undefined' && S.page === 'kanban') ? ('kcard_' + taskId) : ('task_row_' + taskId);
  if (window.savePageScroll) window.savePageScroll(targetId);
  var now = new Date().toLocaleString('ru');
  var author = S.user ? (S.user.full_name || S.user.username) : 'Система';
  var hist = t._history || [];
  hist.push({date:now, author:author, field:'Подрядчик', old:t.contractor||'', new:''});

  api('/tasks/' + taskId, {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({contractor: '', macroStatus: 'new', stageNum: 0, _history: hist})
  })
    .then(function(){
      t.contractor = '';
      t.macroStatus = 'new';
      t.stageNum = 0;
      t._history = hist;
      if (S.cardDraft) delete S.cardDraft.contractor;
      closeContractorPicker();
      window._curCardSubcontracts = [];
      if (window._taskSmrSpec) delete window._taskSmrSpec[taskId];
      if (window._taskSmrTax) delete window._taskSmrTax[taskId];
      if (typeof loadCardSubcontracts === 'function' && S.cardId && String(S.cardId) === String(taskId)) { 
        loadCardSubcontracts(taskId); 
      }
      renderApp();
      if (window.restorePageScroll) window.restorePageScroll(targetId);
    })
    .catch(function(e){ alert('Ошибка снятия подрядчика: ' + e.message); });
}
window.removeContractorFromTask = removeContractorFromTask;
function acceptTask(taskId) {
  api('/tasks/' + taskId + '/accept', { method: 'POST' }).then(function(res) {
    if (res.error) return alert(res.error);
    var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
    if (t) t.assignmentStatus = 'accepted';
    renderApp();
  });
}
window.acceptTask = acceptTask;

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
window.declineTask = declineTask;
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
    type: 'subcontractor',
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
      var instName = document.getElementById('pc_inst_name') ? document.getElementById('pc_inst_name').value.trim() : '';
      if (instName) {
        var spPayload = {
          full_name: instName,
          phone: document.getElementById('pc_inst_phone') ? document.getElementById('pc_inst_phone').value.trim() : '',
          passport_raw: document.getElementById('pc_inst_pass') ? document.getElementById('pc_inst_pass').value.trim() : '',
          car_info: document.getElementById('pc_inst_car') ? document.getElementById('pc_inst_car').value.trim() : '',
          contractor_name: data.name_short,
          contractor_id: res.id,
          role: 'installer'
        };
        api('/specialists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spPayload) })
          .then(function(newSp) {
            if (newSp && newSp.id) {
              if (!Array.isArray(S.specialists)) S.specialists = [];
              S.specialists.push(newSp);
            }
          }).catch(function(){});
      }
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
  var contractIdEl = document.getElementById('nt_contract_id');
  var contractIdVal = (contractIdEl && contractIdEl.value) ? Number(contractIdEl.value) : null;

  var data = {
    id:           document.getElementById('nt_id').value.trim(),
    contractId:   contractIdVal,
    contract_id:  contractIdVal,
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
    customer:     (document.getElementById('nt_customer') ? document.getElementById('nt_customer').value : 'Заказчик'),
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
    var fieldsToClear = ['nt_id', 'nt_vsp', 'nt_contract_id', 'nt_region', 'nt_address', 'nt_manager', 'nt_contact', 'nt_workType', 'nt_amount', 'nt_pricePerUnit', 'nt_inOrder', 'nt_fact', 'nt_dateZayavki', 'nt_deadline', 'nt_techLink', 'nt_invoiceInfo', 'nt_comment'];
    var autoBadge = document.getElementById('nt_contract_autofill_badge');
    if (autoBadge) autoBadge.style.display = 'none';
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


window.openSubcontractRateModal = function(taskId) {
  var old = document.getElementById('_sub_rate_modal');
  if (old) old.remove();

  var targetId = (typeof S !== 'undefined' && S.page === 'kanban') ? ('kcard_' + taskId) : ('task_row_' + taskId);
  if (window.savePageScroll) window.savePageScroll(targetId);

  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;

  var ports = t.fact !== null && t.fact !== undefined && t.fact !== '' ? Number(t.fact) : (Number(t.inOrder) || 0);
  var fin = getTaskFinance(t);
  var raw = t.rawData || {};
  var cFin = getTaskContractorFinance(t);

  var curRate = raw.subRate !== undefined ? raw.subRate : (cFin.isCustom || cFin.isDefaultSber ? cFin.unitPrice : '');
  var curDist = raw.subDist !== undefined ? raw.subDist : (cFin.transport || 0);
  var curExtras = raw.subExtras !== undefined ? raw.subExtras : 0;
  var curTotal = raw.subTotal !== undefined ? raw.subTotal : (curRate ? (curRate * ports + curDist + curExtras) : (cFin.total || ''));

  var m = document.createElement('div');
  m.id = '_sub_rate_modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem';

  m.innerHTML =
    '<div class="card" style="width:100%;max-width:540px;background:#fff;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,0.25);overflow:hidden;animation:fadeIn 0.15s ease">' +
      '<div style="background:#f8fafc;padding:14px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start">' +
        '<div>' +
          '<div style="font-size:.74rem;color:var(--text-3);text-transform:uppercase;font-weight:700">Индивидуальные условия подряда (доп. заказ)</div>' +
          '<div style="font-weight:700;font-size:1.05rem;color:var(--text);margin-top:2px">Заявка № ' + escHtml(t.id) + '</div>' +
          '<div style="font-size:.8rem;color:var(--text-2);margin-top:3px">' + escHtml(t.address || '—') + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_sub_rate_modal\').remove()" style="font-size:1.1rem;line-height:1;padding:4px 8px">✕</button>' +
      '</div>' +

      '<div style="padding:16px 18px">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;background:var(--bg);padding:10px 12px;border-radius:8px;font-size:.8rem;margin-bottom:14px">' +
          '<div><span class="t3">Заказчик:</span> <b style="display:block">' + escHtml(t.customer || '—') + '</b></div>' +
          '<div><span class="t3">Объём:</span> <b style="display:block">' + ports + ' портов / ед.</b></div>' +
          '<div><span class="t3">Выручка от заказчика:</span> <b style="display:block;color:var(--blue)">' + fmtMoney(fin.total) + '</b></div>' +
          '<div><span class="t3">Исполнитель:</span> <b style="display:block;color:var(--orange-dark)">' + escHtml(t.contractor || 'Не назначен') + '</b></div>' +
        '</div>' +

        '<form id="_sub_rate_form" onsubmit="event.preventDefault(); window.saveSubcontractRateModal(\'' + escHtml(t.id) + '\')">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">' +
            '<div>' +
              '<label class="t3" style="display:block;font-size:.74rem;margin-bottom:3px;font-weight:600">Ставка за порт / ед. (₽)</label>' +
              '<input type="number" id="_srm_rate" value="' + (curRate || '') + '" placeholder="напр. 1500" style="width:100%;padding:6px 10px;font-size:.9rem;font-weight:600" oninput="window._recalcRateModal(' + ports + ',\'rate\')">' +
            '</div>' +
            '<div>' +
              '<label class="t3" style="display:block;font-size:.74rem;margin-bottom:3px;font-weight:600">Или фикс за работы (₽)</label>' +
              '<input type="number" id="_srm_total_work" value="' + (curRate ? (curRate * ports) : (curTotal || '')) + '" placeholder="напр. 500000" style="width:100%;padding:6px 10px;font-size:.9rem;font-weight:600" oninput="window._recalcRateModal(' + ports + ',\'total\')">' +
            '</div>' +
          '</div>' +

          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">' +
            '<div>' +
              '<label class="t3" style="display:block;font-size:.74rem;margin-bottom:3px">Удалённость / доставка (₽)</label>' +
              '<input type="number" id="_srm_dist" value="' + (curDist || 0) + '" placeholder="0" style="width:100%;padding:5px 8px;font-size:.85rem" oninput="window._recalcRateModal(' + ports + ',\'other\')">' +
            '</div>' +
            '<div>' +
              '<label class="t3" style="display:block;font-size:.74rem;margin-bottom:3px">Доп. расходы монтажников (₽)</label>' +
              '<input type="number" id="_srm_extras" value="' + (curExtras || 0) + '" placeholder="0" style="width:100%;padding:5px 8px;font-size:.85rem" oninput="window._recalcRateModal(' + ports + ',\'other\')">' +
            '</div>' +
          '</div>' +

          '<div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px;margin-bottom:16px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;font-size:.82rem;margin-bottom:4px">' +
              '<span style="color:var(--text-2)">ИТОГО подряду по заявке:</span>' +
              '<b id="_srm_preview_sub" style="font-size:1rem;color:var(--orange-dark)">0 ₽</b>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;font-size:.82rem">' +
              '<span style="color:var(--text-2)">Ожидаемая маржа:</span>' +
              '<b id="_srm_preview_margin" style="font-size:.95rem;color:var(--green)">0 ₽</b>' +
            '</div>' +
          '</div>' +

          '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">' +
            '<button type="button" class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="window.clearSubcontractRateModal(\'' + escHtml(t.id) + '\')">Сбросить условия</button>' +
            '<div style="display:flex;gap:8px">' +
              '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_sub_rate_modal\').remove()">Отмена</button>' +
              '<button type="submit" class="btn btn-sm btn-primary" id="_srm_save_btn">💾 Сохранить условия</button>' +
            '</div>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>';

  document.body.appendChild(m);
  window._recalcRateModal(ports, 'rate');
};

window._recalcRateModal = function(ports, source) {
  var rateEl = document.getElementById('_srm_rate');
  var totalWorkEl = document.getElementById('_srm_total_work');
  var distEl = document.getElementById('_srm_dist');
  var extEl = document.getElementById('_srm_extras');
  if (!rateEl || !totalWorkEl) return;

  var rate = parseFloat(rateEl.value) || 0;
  var totalWork = parseFloat(totalWorkEl.value) || 0;
  var dist = parseFloat(distEl ? distEl.value : 0) || 0;
  var ext = parseFloat(extEl ? extEl.value : 0) || 0;

  if (source === 'rate' && rate > 0) {
    totalWork = Math.round(rate * ports);
    totalWorkEl.value = totalWork;
  } else if (source === 'total' && totalWork > 0) {
    rate = ports > 0 ? Math.round(totalWork / ports) : totalWork;
    rateEl.value = rate;
  }

  var subTotal = totalWork + dist + ext;
  var previewSub = document.getElementById('_srm_preview_sub');
  if (previewSub) previewSub.textContent = fmtMoney(subTotal);

  var modal = document.getElementById('_sub_rate_modal');
  if (modal) {
    var form = modal.querySelector('form');
    var taskIdMatch = form ? (form.getAttribute('onsubmit') || '').match(/'([^']+)'/) : null;
    if (taskIdMatch && taskIdMatch[1]) {
      var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskIdMatch[1]); });
      if (t) {
        var fin = getTaskFinance(t);
        var margin = fin.total - subTotal;
        var pctMargin = fin.total > 0 ? Math.round(margin / fin.total * 100) : 0;
        var prevMargin = document.getElementById('_srm_preview_margin');
        if (prevMargin) {
          prevMargin.textContent = (margin >= 0 ? '+' : '') + fmtMoney(margin) + ' (' + pctMargin + '%)';
          prevMargin.style.color = margin >= 0 ? 'var(--green)' : 'var(--red)';
        }
      }
    }
  }
};

window.saveSubcontractRateModal = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  var rate = parseFloat(document.getElementById('_srm_rate').value) || 0;
  var totalWork = parseFloat(document.getElementById('_srm_total_work').value) || 0;
  var dist = parseFloat(document.getElementById('_srm_dist').value) || 0;
  var ext = parseFloat(document.getElementById('_srm_extras').value) || 0;

  if (!t.rawData) t.rawData = {};
  t.rawData.subRate = rate;
  t.rawData.subTotal = totalWork + dist + ext;
  t.rawData.subDist = dist;
  t.rawData.subExtras = ext;

  var btn = document.getElementById('_srm_save_btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Сохранение...'; }

  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawData: t.rawData })
  })
  .then(function() {
    var m = document.getElementById('_sub_rate_modal');
    if (m) m.remove();
    renderApp();
    var targetId = (typeof S !== 'undefined' && S.page === 'kanban') ? ('kcard_' + taskId) : ('task_row_' + taskId);
    if (window.restorePageScroll) window.restorePageScroll(targetId);
  })
  .catch(function(err) {
    alert('Ошибка сохранения условий: ' + (err.message || err));
    if (btn) { btn.disabled = false; btn.textContent = '💾 Сохранить условия'; }
  });
};

window.clearSubcontractRateModal = function(taskId) {
  if (!confirm('Сбросить индивидуальные условия подряда? Заявка станет «Не оценена».')) return;
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  if (!t.rawData) t.rawData = {};
  delete t.rawData.subRate;
  delete t.rawData.subTotal;
  delete t.rawData.subDist;
  delete t.rawData.subExtras;

  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawData: t.rawData })
  })
  .then(function() {
    var m = document.getElementById('_sub_rate_modal');
    if (m) m.remove();
    renderApp();
    var targetId = (typeof S !== 'undefined' && S.page === 'kanban') ? ('kcard_' + taskId) : ('task_row_' + taskId);
    if (window.restorePageScroll) window.restorePageScroll(targetId);
  })
  .catch(function(err) {
    alert('Ошибка сброса: ' + (err.message || err));
  });
};
