function showToast(msg, type) {
  var container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
  }
  var toast = document.createElement('div');
  var bg = type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#10b981';
  if (type === 'info') bg = '#3b82f6';
  toast.style.cssText = 'pointer-events:auto;min-width:240px;max-width:380px;padding:12px 18px;border-radius:10px;background:' + bg + ';color:#fff;font-size:.85rem;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,0.2);display:flex;align-items:center;gap:10px;transition:all .3s ease;';
  toast.innerHTML = '<span>' + msg + '</span>';
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 320);
  }, 3500);
}


function levenshtein(a, b) {
  var tmp;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a.length > b.length) { tmp = a; a = b; b = tmp; }
  var row = Array.from({length: a.length + 1}, (_, i) => i);
  for (var i = 1; i <= b.length; i++) {
    var prev = i;
    for (var j = 1; j <= a.length; j++) {
      var val = b[i-1] === a[j-1] ? row[j-1] : Math.min(row[j-1] + 1, prev + 1, row[j] + 1);
      row[j-1] = prev; prev = val;
    }
    row[a.length] = prev;
  }
  return row[a.length];
}

// Ищет колонку, наиболее похожую на искомую
function findColFuzzy(row, targetName) {
  var keys = Object.keys(row);
  var bestMatch = null;
  var minDistance = 3; // Порог точности (3 опечатки максимум)

  var normTarget = targetName.toLowerCase().replace(/[^а-яёa-z0-9]/g, '');

  for (var key of keys) {
    var normKey = key.toLowerCase().replace(/[^а-яёa-z0-9]/g, '');
    // Если есть точное вхождение подстроки (например, "адрес" в "адрес объекта")
    if (normKey.includes(normTarget) || normTarget.includes(normKey)) return row[key];

    // Иначе считаем расстояние Левенштейна
    var dist = levenshtein(normKey, normTarget);
    if (dist < minDistance) {
      minDistance = dist;
      bestMatch = row[key];
    }
  }
  return bestMatch;
}

function highlight(text, query) {
  if (!query || !text) return text;
  // Разбиваем поиск на отдельные слова, чтобы подсвечивать каждое
  var words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return text;
  
  var escapedWords = words.map(function(w) { 
    return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
  });
  var regex = new RegExp('(' + escapedWords.join('|') + ')', 'gi');
  
  return String(text).replace(regex, '<mark style="background:#ffeb3b; padding:0 2px; border-radius:2px; color:#000;">$1</mark>');
}
function pct(a, b)  { return b > 0 ? Math.round(a / b * 100) : 0; }
function fmtN(n)    { return (n || 0).toLocaleString('ru'); }
function fmtMoney(n) {
  if (!n) return '—';
  return Math.round(n).toLocaleString('ru-RU') + ' ₽';
}
function bar(done, total, green) {
  var p = pct(done, total);
  return '<div class="prog"><div class="prog-fill' + (green?' g':'') + '" style="width:' + p + '%"></div></div>';
}
function badge(cls, txt) { return '<span class="badge ' + cls + '">' + txt + '</span>'; }
function stBadge(s) {
  var m = {
    pending:   ['b-gray',   'Не распределено'],
    progress:  ['b-orange', 'В работе'],
    done:      ['b-green',  'Готово'],
    paid:      ['b-blue',   'Оплачен'],   // Новый статус
    cancelled: ['b-red',    'Отменен']
  };
  var v = m[s] || ['b-gray', s||'—']; return badge(v[0], v[1]);
}
var STAGE_KEYS  = ['request','survey','install','control','acceptance','payment'];
var STAGE_NAMES = ['Заявка','Обследование','Монтаж','Контроль','Приёмка','Оплата'];
var STAGE_ICONS = ['📥','📐','🔧','🔍','📋','💳'];
var STAGE_DESCS = [
  'Поступила, распределение и назначение ответственных',
  'Выезд на замеры, согласование схемы и доступа',
  'Прокладка кабеля, монтаж портов на объекте',
  'Прозвонка портов, чек-лист и контрольный фотоотчет',
  'Подписание исполнительной документации (ИД со Сбером)',
  'Выставление счета, оплата от заказчика, расчёт с подрядчиком'
];

function stageBadge(s) {
  var m = {
    request:    ['b-request',    '1. Заявка'],
    survey:     ['b-survey',     '2. Обследование'],
    install:    ['b-install',    '3. Монтаж'],
    control:    ['b-control',    '4. Контроль'],
    acceptance: ['b-acceptance', '5. Приёмка'],
    payment:    ['b-payment',    '6. Оплата']
  };
  var v = m[s] || ['b-gray', s ? (s.charAt(0).toUpperCase() + s.slice(1)) : '1. Заявка'];
  return '<span class="badge ' + v[0] + '">' + v[1] + '</span>';
}

var ID_ROLES = {
  ADMIN: 'admin',
  LEADER: 'leader',
  MANAGER: 'manager',
  DESIGNER: 'designer',
  DISPATCH: 'dispatch',
  PAYMENTS: 'payments',
  WORKER: 'worker'
};

var ID_STEPS = [
  { step: 0, title: 'Монтаж начат', role: 'manager', toStage: 1, action: 'Начать монтаж' },
  { step: 1, title: 'Объект готов', role: 'manager', toStage: 2, action: 'Завершить монтаж' },
  { step: 2, title: 'Материалы переданы', role: 'manager', toStage: 3, action: 'Передать материалы' },
  { step: 3, title: 'Взял ИД в работу', role: 'designer', toStage: 4, action: 'Взять ИД в работу' },
  { step: 4, title: 'ИД готова', role: 'designer', toStage: 5, action: 'Завершить ИД' },
  { step: 5, title: 'ИД отправлена в Сбер', role: 'dispatch', toStage: 6, action: 'Отправить в Сбер' },
  { step: 6, title: 'Сбер принял ИД', role: 'dispatch', toStage: 7, action: 'Сбер принял ИД' },
  { step: 7, title: 'Передано на оплату', role: 'payments', toStage: 8, action: 'Передать на оплату' },
  { step: 8, title: 'Оплачено', role: 'payments', toStage: 9, action: 'Подтвердить оплату' }
];

var ID_STAGES = [
  { num: 0, name: 'Новая', icon: '📥', role: 'Менеджер' },
  { num: 1, name: 'В монтаже', icon: '🔧', role: 'Менеджер' },
  { num: 2, name: 'Ждёт материалов', icon: '📷', role: 'Менеджер' },
  { num: 3, name: 'Очередь ИД', icon: '📦', role: 'Проектировщик' },
  { num: 4, name: 'Проектирование', icon: '📐', role: 'Проектировщик' },
  { num: 5, name: 'Готова к отправке', icon: '✉️', role: 'Отдел отправки' },
  { num: 6, name: 'Ждёт приёмки Сбером', icon: '⏳', role: 'Отдел отправки' },
  { num: 7, name: 'К оплате', icon: '📝', role: 'Бухгалтерия' },
  { num: 8, name: 'Ждёт оплаты', icon: '💳', role: 'Бухгалтерия' },
  { num: 9, name: 'Завершена', icon: '✅', role: 'Завершено' }
];

function idStageBadge(stageNum) {
  var s = Number(stageNum != null ? stageNum : 0);
  var stg = ID_STAGES[s] || ID_STAGES[0];
  var colorCls = 'b-gray';
  if (s === 1 || s === 2) colorCls = 'b-install';
  else if (s === 3 || s === 4) colorCls = 'b-survey';
  else if (s === 5 || s === 6) colorCls = 'b-control';
  else if (s === 7 || s === 8) colorCls = 'b-payment';
  else if (s === 9) colorCls = 'b-acceptance';
  return '<span class="badge ' + colorCls + '" style="font-size:.75rem;padding:2px 7px" title="Этап ' + s + ': ' + stg.name + ' (' + stg.role + ')">' + stg.icon + ' ' + s + '. ' + stg.name + '</span>';
}

var MACRO_STATUSES = {
  new: { code: 'new', name: 'Новая', color: '#6B7280', badgeClass: 'b-gray', icon: '📥', step: 0 },
  review: { code: 'review', name: 'Рассмотрение', color: '#3B82F6', badgeClass: 'b-blue', icon: '🔍', step: 1 },
  in_progress: { code: 'in_progress', name: 'В работе', color: '#8B5CF6', badgeClass: 'b-purple', icon: '🤝', step: 2 },
  assigned: { code: 'assigned', name: 'Назначено исполнителю', color: '#EC4899', badgeClass: 'b-pink', icon: '📋', step: 3 },
  install: { code: 'install', name: 'В монтаже', color: '#F59E0B', badgeClass: 'b-install', icon: '🔧', step: 4 },
  smr_done: { code: 'smr_done', name: 'СМР выполнено', color: '#10B981', badgeClass: 'b-green', icon: '🏁', step: 5 },
  correction: { code: 'correction', name: 'На исправлении', color: '#EF4444', badgeClass: 'b-red', icon: '⚠️', step: 6 },
  id_in_progress: { code: 'id_in_progress', name: 'ИД в разработке', color: '#06B6D4', badgeClass: 'b-cyan', icon: '📐', step: 7 },
  id_delivered: { code: 'id_delivered', name: 'ИД передана', color: '#6366F1', badgeClass: 'b-control', icon: '✉️', step: 8 },
  accepted: { code: 'accepted', name: 'Готово, принято', color: '#059669', badgeClass: 'b-acceptance', icon: '✅', step: 9 },
  billing: { code: 'billing', name: 'Передано в оплату', color: '#0D9488', badgeClass: 'b-payment', icon: '💳', step: 10 },
  paid: { code: 'paid', name: 'Оплачено', color: '#16A34A', badgeClass: 'b-green', icon: '💰', step: 11 },
  archived: { code: 'archived', name: 'В архиве', color: '#4B5563', badgeClass: 'b-gray', icon: '📁', step: 12 }
};

function macroStatusBadge(code) {
  var s = String(code || 'new').toLowerCase();
  var st = MACRO_STATUSES[s] || MACRO_STATUSES.new;
  return '<span class="badge ' + (st.badgeClass || 'b-gray') + '" style="font-size:.78rem;padding:3px 8px;font-weight:600" title="' + escHtml(st.name) + '">' +
    st.icon + ' ' + escHtml(st.name) + '</span>';
}

function hasUserRole(user) {
  if (!user) return false;
  var wanted = Array.prototype.slice.call(arguments, 1);
  var roles = (user.role || '').split(',').map(function(r){ return r.trim().toLowerCase(); });
  if (roles.includes('admin') || roles.includes('leader')) return true;
  return wanted.some(function(w){ return roles.includes(String(w).toLowerCase()); });
}

function canUserStep(user, task) {
  var s = Number(task.stageNum != null ? task.stageNum : 0);
  var stepDef = ID_STEPS.find(function(x){ return x.step === s; });
  if (!stepDef) return false;
  return hasUserRole(user, stepDef.role);
}

function canUserUndo(user, task) {
  var s = Number(task.stageNum != null ? task.stageNum : 0);
  if (s <= 0) return false;
  return hasUserRole(user, 'admin', 'leader', 'manager', 'dispatch', 'payments');
}

function advanceIdStep(taskId) {
  var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  var s = Number(t.stageNum != null ? t.stageNum : 0);
  var stepDef = ID_STEPS.find(function(x){ return x.step === s; });
  if (!stepDef) return alert('Заявка уже на финальном этапе');
  if (!canUserStep(S.user, t)) {
    return alert('Действие «' + stepDef.action + '» доступно только для роли: ' + stepDef.role + ' (или admin/leader)');
  }
  if (s === 6 && Number(t.openRemarksCount || 0) > 0) {
    return alert('Нельзя принять ИД: у объекта есть открытые замечания Сбера (' + t.openRemarksCount + ' шт.). Сначала устраните замечания!');
  }

  var link = '';
  if (s === 2) {
    link = prompt('Укажите ссылку на фотоматериалы / папку с исходными данными:', t.materialsLink || t.techLink || '');
    if (link === null) return;
    if (!link.trim()) return alert('Для передачи материалов ссылка обязательна!');
  } else if (s === 4) {
    link = prompt('Укажите ссылку на готовую ИД (папка или альбом):', t.idLink || '');
    if (link === null) return;
    if (!link.trim()) return alert('Для завершения ИД ссылка на документацию обязательна!');
  }

  api('/tasks/' + encodeURIComponent(taskId) + '/advance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ link: link ? link.trim() : undefined, version: t.version })
  })
  .then(function(res){
    if (res.error) return alert('Ошибка: ' + res.error);
    if (res.task) {
      Object.assign(t, res.task);
    }
    renderApp();
    if (S.page === 'card' && S.cardId === taskId) {
      refreshRemarksList(taskId);
      refreshTaskItemsList(taskId);
    }
  })
  .catch(function(err){
    alert('Ошибка продвижения этапа: ' + (err.message || err));
  });
}

function undoIdStep(taskId) {
  var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  if (!canUserUndo(S.user, t)) {
    return alert('Откат этапа доступен только ответственным ролям или администратору');
  }
  var reason = prompt('Укажите причину отката этапа назад:');
  if (reason === null) return;
  if (!reason.trim()) return alert('Причина отката обязательна!');

  api('/tasks/' + encodeURIComponent(taskId) + '/undo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason.trim(), version: t.version })
  })
  .then(function(res){
    if (res.error) return alert('Ошибка: ' + res.error);
    if (res.task) {
      Object.assign(t, res.task);
    }
    renderApp();
    if (S.page === 'card' && S.cardId === taskId) {
      refreshRemarksList(taskId);
    }
  })
  .catch(function(err){
    alert('Ошибка отката: ' + (err.message || err));
  });
}

function refreshRemarksList(taskId) {
  var box = document.getElementById('remarksList');
  if (!box) return;
  api('/tasks/' + encodeURIComponent(taskId) + '/remarks')
    .then(function(list){
      if (!list || !list.length) {
        box.innerHTML = '<div class="t3" style="font-size:.8rem;padding:.4rem 0">Замечаний от Сбера нет</div>';
        return;
      }
      var html = list.map(function(r){
        var isResolved = !!r.resolved_at;
        var rBadge = isResolved
          ? '<span class="badge b-green" style="font-size:.7rem">✓ Устранено</span>'
          : '<span class="badge b-red" style="font-size:.7rem">🔴 Открыто</span>';
        var dateStr = r.created_at ? r.created_at.slice(0, 16).replace('T', ' ') : '';
        var docLink = r.doc_link ? ' <a href="' + escHtml(r.doc_link) + '" target="_blank" rel="noopener noreferrer" style="font-size:.78rem;color:var(--blue)">📄 Ссылка на замечание</a>' : '';
        var resInfo = '';
        if (isResolved) {
          var resDate = r.resolved_at ? r.resolved_at.slice(0, 16).replace('T', ' ') : '';
          var fixLink = r.fixed_doc_link ? ' <a href="' + escHtml(r.fixed_doc_link) + '" target="_blank" rel="noopener noreferrer" style="font-size:.78rem;color:var(--green)">📁 Исправленная ИД</a>' : '';
          resInfo = '<div style="margin-top:4px;padding:4px 8px;background:#f0fdf4;border-radius:4px;border:1px solid #bbf7d0;font-size:.76rem;color:#166534">' +
            '<b>Решение (' + resDate + (r.resolver_name ? ', ' + escHtml(r.resolver_name) : '') + '):</b> ' + escHtml(r.resolution || 'Устранено') + fixLink +
          '</div>';
        } else {
          resInfo = '<div style="margin-top:6px">' +
            '<button class="btn btn-sm" style="font-size:.74rem;padding:3px 8px" onclick="resolveRemarkPrompt(\'' + String(taskId).replace(/'/g,"\\'") + '\',\'' + String(r.id).replace(/'/g,"\\'") + '\')">✓ Устранить замечание</button>' +
          '</div>';
        }

        return '<div style="padding:8px;border-radius:6px;background:#fff;border:1px solid var(--border);margin-bottom:6px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
            '<div>' + rBadge + ' <span style="font-size:.75rem;color:var(--text-3);margin-left:4px">' + dateStr + (r.author_name ? ' (' + escHtml(r.author_name) + ')' : '') + '</span></div>' +
          '</div>' +
          '<div style="font-size:.82rem;color:var(--text);line-height:1.35">' + escHtml(r.text) + docLink + '</div>' +
          resInfo +
        '</div>';
      }).join('');
      box.innerHTML = html;
    })
    .catch(function(err){
      box.innerHTML = '<div class="t3" style="color:var(--red);font-size:.8rem">Ошибка загрузки замечаний: ' + (err.message || err) + '</div>';
    });
}

function addRemarkPrompt(taskId) {
  var text = prompt('Введите суть замечания Сбера:');
  if (text === null) return;
  if (!text.trim()) return alert('Текст замечания обязателен!');
  var link = prompt('Ссылка на файл или лист замечаний (необязательно):', '');
  api('/tasks/' + encodeURIComponent(taskId) + '/remarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text.trim(), link: link ? link.trim() : undefined })
  })
  .then(function(res){
    if (res.error) return alert('Ошибка: ' + res.error);
    var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
    if (t) {
      t.openRemarksCount = (t.openRemarksCount || 0) + 1;
    }
    refreshRemarksList(taskId);
    renderApp();
  })
  .catch(function(err){
    alert('Ошибка добавления замечания: ' + (err.message || err));
  });
}

function resolveRemarkPrompt(taskId, remarkId) {
  var resolution = prompt('Опишите, что было исправлено в альбоме ИД:');
  if (resolution === null) return;
  if (!resolution.trim()) return alert('Описание исправления обязательно!');
  var fixedLink = prompt('Ссылка на обновленный альбом ИД (необязательно):', '');
  api('/tasks/' + encodeURIComponent(taskId) + '/remarks/' + remarkId + '/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolution: resolution.trim(), fixedLink: fixedLink ? fixedLink.trim() : undefined })
  })
  .then(function(res){
    if (res.error) return alert('Ошибка: ' + res.error);
    var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
    if (t && Number(t.openRemarksCount) > 0) {
      t.openRemarksCount--;
    }
    refreshRemarksList(taskId);
    renderApp();
  })
  .catch(function(err){
    alert('Ошибка закрытия замечания: ' + (err.message || err));
  });
}
function getTaskFinance(t) {
  var unitPrice = Number(t.pricePerUnit) || 0;
  var fact = Number(t.fact) || 0;
  var inOrder = Number(t.inOrder) || 0;
  var work = Math.round(fact > 0 ? (fact * unitPrice) : (inOrder * unitPrice));
  var transport = Number(t.distanceKm) || 0; 
  var extras = Number(t.extras) || 0;
  var tmc = Number(t.tmc) || 0;
  
  var total = (work + transport + extras + tmc);
  if (total === 0 && Number(t.amount) > 0) {
    total = Number(t.amount);
  }
  
  return {
    unitPrice: unitPrice,
    work: work,
    transport: transport,
    extras: extras,
    po: work + transport + extras,
    tmc: tmc,
    total: total,
    details: 'Работа: ' + fmtMoney(work) + ' + Удаленность: ' + fmtMoney(transport) + ' + Допы: ' + fmtMoney(extras)
  };
}

function getTaskContractorFinance(t) {
  var items = (t.items && Array.isArray(t.items)) ? t.items : ((window._taskItemsMap && window._taskItemsMap[t.id]) || null);
  var work = 0;
  var transport = 0;
  var unitPrice = 0;
  var total = 0;

  if (items && items.length > 0) {
    items.forEach(function(it) {
      var q = Number(it.quantity) || 1;
      var pr = Number(it.price_contractor || it.priceContractor) || 0;
      var am = Number(it.amount_contractor || it.amountContractor) || (q * pr);
      work += am;
      if (pr > 0 && unitPrice === 0) unitPrice = pr;
      transport += Number(it.distance_km || it.distanceKm) || 0;
    });
    total = work + transport;
  } else {
    var parsedOplata = 0;
    if (t.oplata) {
      var clean = String(t.oplata).replace(/[^\d.,]/g, '').replace(',', '.');
      parsedOplata = parseFloat(clean) || 0;
    }
    if (parsedOplata > 0) {
      total = parsedOplata;
      var count = Number(t.fact) || Number(t.inOrder) || 1;
      unitPrice = count > 0 ? Math.round(total / count) : total;
      work = total;
    } else {
      unitPrice = 0;
      transport = 0;
      work = 0;
      total = 0;
    }
  }

  return {
    unitPrice: unitPrice,
    work: work,
    transport: transport,
    total: total,
    isPaid: (String(t.oplata || '')).toLowerCase().includes('оплач')
  };
}
function prBadge(p) {
  var m = {high:['b-red','🔴 Высокий'], medium:['b-orange','🟡 Средний'], low:['b-green','🟢 Низкий']};
  var v = m[p] || ['b-gray', p||'—']; return badge(v[0], v[1]);
}
function calculateTransport(km, customRate) {
  if (!km || km <= 0) return 0;
  if (customRate && customRate > 0) return Math.round(km * 2 * customRate);

  var rate = 0;
  if (km > 200) rate  = 35;
  else if (km > 100) rate = 30;
  else if (km > 50)  rate = 25;
  else if (km > 10)  rate = 15;

  return Math.round(km * 2 * rate);
}
function importBanner() {
  var info = S.importInfo;
  if (info && info.importedFrom) {
    var dt = new Date(info.importedAt).toLocaleString('ru');
    return '<div class="banner banner-ok">' +
      '<div><div class="banner-title">📂 Данные загружены</div>' +
      '<div class="banner-body">' + info.importedFrom + ' &nbsp;·&nbsp; ' + dt + ' &nbsp;·&nbsp; <strong>' + fmtN(info.rowCount) + ' заявок</strong></div></div>' +
      '<button class="btn btn-sm btn-ghost" onclick="go(\'data\')">Обновить</button></div>';
  }
  return '<div class="banner banner-warn">' +
    '<div><div class="banner-title">⚠️ Нет данных</div>' +
    '<div class="banner-body">Загрузите файл Сводные таблицы</div></div>' +
    '<button class="btn btn-sm" onclick="go(\'data\')">Загрузить</button></div>';
}

// ─── PAGE: PROFILE ───────────────────────────────────────────────────────────

function finRow(label, val) {
  return '<tr style="border-bottom:1px solid var(--border)">' +
    '<td style="padding:6px 4px;color:var(--text-2)">' + label + '</td>' +
    '<td style="padding:6px 4px;text-align:right">' + fmtMoney(val) + '</td>' +
  '</tr>';
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Карта маршрута ──────────────────────────────────────────────────────────

function showModal(title, fields, onSave) {
  var existing = document.getElementById('_mmodal');
  if (existing) existing.remove();

  var rows = fields.map(function(f) {
    var inp;
    if (f.type === 'select') {
      inp = '<select id="mf_' + f.key + '" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:.9rem;background:#fff">' +
        f.options.map(function(o){ return '<option value="' + o.value + '"' + (o.value == f.value ? ' selected' : '') + '>' + o.label + '</option>'; }).join('') +
      '</select>';
    } else if (f.type === 'textarea') {
      inp = '<textarea id="mf_' + f.key + '" rows="3" placeholder="' + escHtml(f.placeholder||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:.9rem;resize:vertical">' + escHtml(String(f.value||'')) + '</textarea>';
    } else {
      inp = '<input id="mf_' + f.key + '" type="' + (f.type||'text') + '" value="' + escHtml(String(f.value||'')) + '" placeholder="' + escHtml(f.placeholder||'') + '" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:.9rem">';
    }
    return '<div style="margin-bottom:.85rem">' +
      '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px;text-transform:uppercase;letter-spacing:.03em">' +
        f.label + (f.required ? ' <span style="color:var(--red)">*</span>' : '') +
      '</label>' + inp +
      (f.hint ? '<div style="font-size:.72rem;color:var(--text-3);margin-top:4px">' + f.hint + '</div>' : '') +
      (f.hintId ? '<div id="' + f.hintId + '" style="font-size:.72rem;color:var(--orange);margin-top:4px"></div>' : '') +
    '</div>';
  }).join('');

  var modal = document.createElement('div');
  modal.id = '_mmodal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(2px)';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:14px;padding:1.5rem;width:100%;max-width:480px;box-shadow:0 12px 48px rgba(0,0,0,.22);max-height:90vh;overflow-y:auto">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem">' +
        '<div style="font-weight:700;font-size:1.05rem">' + title + '</div>' +
        '<button onclick="document.getElementById(\'_mmodal\').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-3);line-height:1;padding:0 4px">×</button>' +
      '</div>' +
      rows +
      '<div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.25rem">' +
        '<button onclick="document.getElementById(\'_mmodal\').remove()" class="btn btn-ghost btn-sm">Отмена</button>' +
        '<button id="_msave" class="btn btn-sm">Сохранить</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });

  // Навешиваем onInput колбеки если заданы в полях
  fields.forEach(function(f) {
    if (!f.onInput) return;
    var el = document.getElementById('mf_' + f.key);
    if (el) el.addEventListener('input', function() { f.onInput(el.value); });
  });

  document.getElementById('_msave').onclick = function() {
    var data = {};
    var ok = true;
    fields.forEach(function(f) {
      var el = document.getElementById('mf_' + f.key);
      if (!el) return;
      data[f.key] = el.value.trim !== undefined ? el.value.trim() : el.value;
      if (f.required && !data[f.key]) {
        el.style.borderColor = 'var(--red)';
        el.focus();
        ok = false;
      }
    });
    if (!ok) return;
    modal.remove();
    onSave(data);
  };

  modal.addEventListener('keydown', function(e){
    if (e.key === 'Escape') modal.remove();
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      var btn = document.getElementById('_msave');
      if (btn) btn.click();
    }
  });

  setTimeout(function(){
    var el = document.getElementById('mf_' + fields[0].key);
    if (el) { el.focus(); if (el.select) el.select(); }
  }, 60);
}

// Диалог подтверждения вместо confirm()
function showConfirm(msg, onYes) {
  var existing = document.getElementById('_mmodal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = '_mmodal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(2px)';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:14px;padding:1.5rem;width:100%;max-width:360px;box-shadow:0 12px 48px rgba(0,0,0,.22)">' +
      '<div style="font-size:1rem;margin-bottom:1.25rem;line-height:1.5">' + msg + '</div>' +
      '<div style="display:flex;gap:.6rem;justify-content:flex-end">' +
        '<button onclick="document.getElementById(\'_mmodal\').remove()" class="btn btn-ghost btn-sm">Отмена</button>' +
        '<button id="_myes" class="btn btn-sm" style="background:var(--red);border-color:var(--red)">Удалить</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });
  modal.addEventListener('keydown', function(e){ if (e.key === 'Escape') modal.remove(); });
  document.getElementById('_myes').onclick = function() { modal.remove(); onYes(); };
  setTimeout(function(){ var b = document.getElementById('_myes'); if(b) b.focus(); }, 60);
}

// ─── Функции маршрутов ────────────────────────────────────────────────────────