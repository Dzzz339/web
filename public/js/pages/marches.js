// ─── МОДУЛЬ МАРШРУТОВ (ДИНАМИЧЕСКИЙ МАРШРУТНЫЙ ЛИСТ) ────────────────────────

// ─── 1. ФИНАНСОВЫЙ И ЛОГИСТИЧЕСКИЙ РАСЧЕТ ────────────────────────────────────

function calcMarchPointFinance(p, marchParams) {
  var km        = Number(p.km) || 0;
  var ports     = Number(p.ports) || 0;
  var ppp       = Number(p.pricePerPort) || 0;
  var kmRate    = Number(p.kmRate) || Number(marchParams.kmRate) || 70;
  var extras    = Number(p.extras) || 0;
  var tmc       = Number(p.tmc) || 0;
  var sber      = Number(p.sber) || 0;
  var workHours = Number(p.workHours) !== undefined ? Number(p.workHours) : (ports * 2);

  var remote    = Math.round(km * kmRate);
  var work      = Math.round(ports * ppp);
  var pay       = remote + work + extras;
  var profit    = sber - pay - tmc;

  return {
    remote: remote,
    work: work,
    extras: extras,
    pay: pay,
    tmc: tmc,
    sber: sber,
    profit: profit,
    workHours: workHours
  };
}

function marchTotals(march) {
  var params       = march.params || {};
  var kmRate       = Number(march.kmRate) || Number(params.kmRate) || 70;
  var avgSpeed     = Number(params.avgSpeed) || 70;
  var perDiemRate  = Number(params.perDiemRate) !== undefined ? Number(params.perDiemRate) : 700;
  var lodgingRate  = Number(params.lodgingRate) || 0;
  var pts          = march.points || [];

  var totKm = 0, totPorts = 0, totRemote = 0, totWork = 0, totExtras = 0, totPay = 0, totTmc = 0, totSber = 0;
  var totWorkHours = 0;

  pts.forEach(function(p) {
    var f = calcMarchPointFinance(p, march.params || { kmRate: kmRate });
    totKm        += Number(p.km) || 0;
    totPorts     += Number(p.ports) || 0;
    totRemote    += f.remote;
    totWork      += f.work;
    totExtras    += f.extras;
    totPay       += f.pay;
    totTmc       += f.tmc;
    totSber      += f.sber;
    totWorkHours += f.workHours;
  });

  var travelHours    = avgSpeed > 0 ? (totKm / avgSpeed) : 0;
  var totalTripHours = Math.round((travelHours + totWorkHours) * 10) / 10;
  var tripDays       = pts.length ? Math.max(1, Math.ceil(totalTripHours / 10)) : 0;
  var estPerDiem     = tripDays * perDiemRate;
  var estLodging     = Math.max(0, tripDays - 1) * lodgingRate;

  var totProfit      = totSber - totPay - totTmc;
  var profitPercent  = totSber > 0 ? Math.round((totProfit / totSber) * 100) : 0;

  return {
    km: totKm,
    ports: totPorts,
    remote: totRemote,
    work: totWork,
    extras: totExtras,
    pay: totPay,
    tmc: totTmc,
    sber: totSber,
    profit: totProfit,
    profitPercent: profitPercent,
    travelHours: Math.round(travelHours * 10) / 10,
    workHours: Math.round(totWorkHours * 10) / 10,
    totalHours: totalTripHours,
    tripDays: tripDays,
    estPerDiem: estPerDiem,
    estLodging: estLodging
  };
}

// Универсальное определение базы без хардкода
function detectDefaultBaseCity(task, march) {
  if (march && march.baseCity && march.baseCity.trim()) return march.baseCity.trim();
  if (!task) return '';

  // 1. По подрядчику
  if (task.contractor && Array.isArray(S.contractors)) {
    var ctr = S.contractors.find(function(c){
      return c.name_short === task.contractor || c.name_full === task.contractor;
    });
    if (ctr && ctr.address_legal) {
      var m = ctr.address_legal.match(/(?:г\.|город|пгт)\s*([А-Яа-яЁё-]+)/i);
      if (m) return m[1];
    }
  }

  // 2. По региону заявки (часто уже содержит административный центр)
  if (task.region && task.region.trim()) {
    return task.region.trim();
  }

  // 3. По адресу объекта
  if (task.address) {
    var mCity = task.address.match(/(?:г\.|город)\s*([А-Яа-яЁё-]+)/i);
    if (mCity) return mCity[1];
  }

  return '';
}

// ─── 2. ГЛАВНАЯ СТРАНИЦА СПИСКА МАРШРУТОВ ────────────────────────────────────

function pageMarches() {
  var html = '<h1 class="page-title">🚗 Маршруты</h1>';

  html += '<div style="display:flex;gap:.75rem;margin-bottom:1.25rem;align-items:center;flex-wrap:wrap">' +
    '<button class="btn" onclick="openCreateMarch()">+ Создать маршрут</button>' +
    (S.marches.length ? '<span class="t3" style="font-size:.82rem">' + S.marches.length + ' маршрутов</span>' : '') +
  '</div>';

  if (!S.marches.length) {
    return html + '<div class="card p" style="text-align:center;padding:3rem">' +
      '<div style="font-size:2.5rem;margin-bottom:.75rem">🗺️</div>' +
      '<div class="t3">Маршрутов пока нет.<br>Создайте маршрут, добавьте заявки, и система автоматически рассчитает логистику и экономику.</div></div>';
  }

  html += '<div class="g2" style="gap:1rem">';
  S.marches.forEach(function(m) {
    var tot = marchTotals(m);
    var pts = (m.points || []).length;
    var profitColor = tot.profit >= 0 ? '#16a34a' : '#dc2626';

    html += '<div class="card p" style="cursor:pointer;transition:transform 0.15s ease, box-shadow 0.15s ease;" onclick="openMarch(\'' + m.id + '\')">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem">' +
        '<div>' +
          '<div style="font-weight:700;font-size:1.05rem;color:var(--text)">' + escHtml(m.name) + '</div>' +
          '<div class="t3" style="font-size:.78rem;margin-top:3px">' + 
            (m.baseCity ? '📍 База: <b>' + escHtml(m.baseCity) + '</b> · ' : '') +
            (m.contractorName ? '👷 ' + escHtml(m.contractorName) + ' · ' : '') +
            new Date(m.createdAt).toLocaleDateString('ru') + 
          '</div>' +
        '</div>' +
        '<button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="event.stopPropagation();deleteMarch(\'' + m.id + '\')" title="Удалить маршрут">✕</button>' +
      '</div>' +
      '<div class="g4" style="gap:.5rem;grid-template-columns:repeat(4,1fr);margin-bottom:.75rem">' +
        '<div class="card" style="padding:.5rem .75rem;background:var(--bg)">' +
          '<div class="t3" style="font-size:.68rem;text-transform:uppercase;">Точек / Портов</div>' +
          '<div style="font-weight:700;font-size:1.1rem">' + pts + ' / ' + fmtN(tot.ports) + '</div>' +
        '</div>' +
        '<div class="card" style="padding:.5rem .75rem;background:var(--bg)">' +
          '<div class="t3" style="font-size:.68rem;text-transform:uppercase;">Пробег</div>' +
          '<div style="font-weight:700;font-size:1.1rem">' + fmtN(tot.km) + ' км</div>' +
        '</div>' +
        '<div class="card" style="padding:.5rem .75rem;background:var(--bg)">' +
          '<div class="t3" style="font-size:.68rem;text-transform:uppercase;">Оплата ПО</div>' +
          '<div style="font-weight:700;font-size:1.1rem;color:var(--orange)">' + fmtMoney(tot.pay) + '</div>' +
        '</div>' +
        '<div class="card" style="padding:.5rem .75rem;background:var(--bg)">' +
          '<div class="t3" style="font-size:.68rem;text-transform:uppercase;">Профит</div>' +
          '<div style="font-weight:700;font-size:1.1rem;color:' + profitColor + '">' + fmtMoney(tot.profit) + ' (' + tot.profitPercent + '%)</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:1.25rem;font-size:.8rem;color:var(--text-2);flex-wrap:wrap;border-top:1px solid var(--border);padding-top:.5rem">' +
        '<span>Удалёнка: <strong>' + fmtMoney(tot.remote) + '</strong></span>' +
        '<span>Работа: <strong>' + fmtMoney(tot.work) + '</strong></span>' +
        '<span>ТМЦ: <strong>' + fmtMoney(tot.tmc) + '</strong></span>' +
        '<span>Платит Заказчик: <strong style="color:var(--blue)">' + fmtMoney(tot.sber) + '</strong></span>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  return html;
}

function openMarch(id) {
  S.marchId = id;
  S.page = 'march-detail';
  renderNav();
  renderApp();
}

// ─── 3. ДЕТАЛЬНАЯ СТРАНИЦА МАРШРУТА ──────────────────────────────────────────

function pageMarchDetail() {
  var march = (S.marches || []).find(function(m){ return m.id === S.marchId; });
  if (!march) return '<button class="btn btn-ghost" onclick="go(\'marches\')">← Маршруты</button><p>Маршрут не найден</p>';

  var tot    = marchTotals(march);
  var pts    = march.points || [];
  var params = march.params || {};

  var profitColor = tot.profit >= 0 ? '#16a34a' : '#dc2626';

  // Шапка страницы
  var html = '<div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap">' +
    '<button class="btn btn-ghost btn-sm" onclick="go(\'marches\')">← Маршруты</button>' +
    '<h1 style="font-size:1.25rem;font-weight:700;flex:1;margin:0">🚗 ' + escHtml(march.name) + '</h1>' +
    '<button class="btn btn-sm" onclick="printMarchSheet(\'' + march.id + '\')" style="background:#0284c7;color:#fff">🖨️ Маршрутный лист</button>' +
    '<button class="btn btn-sm btn-ghost" onclick="toggleMarchSettingsPanel()" id="marchSettingsToggleBtn">⚙️ Параметры</button>' +
  '</div>';

  // Сводные карточки KPI
  html += '<div class="g4" style="gap:.75rem;margin-bottom:1.25rem;grid-template-columns:repeat(4,1fr)">' +
    statBox('Точек / Портов', pts.length + ' / ' + fmtN(tot.ports), null) +
    statBox('Пробег / Время в пути', fmtN(tot.km) + ' км · ' + tot.travelHours + ' ч', null) +
    statBox('Оплата ПО (субподряд)', fmtMoney(tot.pay), 'var(--orange)') +
    statBox('Профит компании', fmtMoney(tot.profit) + ' (' + tot.profitPercent + '%)', profitColor) +
  '</div>';

  // Панель параметров (настраиваемая, сворачиваемая)
  html += '<div id="march_settings_panel" class="card p" style="display:none;margin-bottom:1.25rem;background:#f8fafc;border:1px solid #cbd5e1;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">' +
      '<div style="font-weight:700;font-size:.95rem">⚙️ Настройки и нормативы маршрута</div>' +
      '<button class="btn btn-sm btn-ghost" onclick="toggleMarchSettingsPanel()">✕ Скрыть</button>' +
    '</div>' +
    '<div class="g4" style="gap:.75rem;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));font-size:.85rem">' +
      '<div>' +
        '<label style="display:block;margin-bottom:3px;color:var(--text-2);font-weight:600">Название</label>' +
        '<input type="text" id="mcfg_name" value="' + escHtml(march.name) + '" class="input" style="width:100%">' +
      '</div>' +
      '<div>' +
        '<label style="display:block;margin-bottom:3px;color:var(--text-2);font-weight:600">База (город старта)</label>' +
        '<input type="text" id="mcfg_baseCity" value="' + escHtml(march.baseCity || '') + '" placeholder="Чита, Новосибирск..." class="input" style="width:100%">' +
      '</div>' +
      '<div>' +
        '<label style="display:block;margin-bottom:3px;color:var(--text-2);font-weight:600">Тариф за км (₽/км)</label>' +
        '<input type="number" id="mcfg_kmRate" value="' + (march.kmRate || 70) + '" class="input" style="width:100%">' +
      '</div>' +
      '<div>' +
        '<label style="display:block;margin-bottom:3px;color:var(--text-2);font-weight:600">Суточные (₽/сутки)</label>' +
        '<input type="number" id="mcfg_perDiemRate" value="' + (params.perDiemRate !== undefined ? params.perDiemRate : 700) + '" class="input" style="width:100%">' +
      '</div>' +
      '<div>' +
        '<label style="display:block;margin-bottom:3px;color:var(--text-2);font-weight:600">Проживание (₽/ночь)</label>' +
        '<input type="number" id="mcfg_lodgingRate" value="' + (params.lodgingRate || 0) + '" class="input" style="width:100%">' +
      '</div>' +
      '<div>' +
        '<label style="display:block;margin-bottom:3px;color:var(--text-2);font-weight:600">Средняя скорость (км/ч)</label>' +
        '<input type="number" id="mcfg_avgSpeed" value="' + (params.avgSpeed || 70) + '" class="input" style="width:100%">' +
      '</div>' +
      '<div>' +
        '<label style="display:block;margin-bottom:3px;color:var(--text-2);font-weight:600">Подрядчик</label>' +
        '<select id="mcfg_contractor" class="input" style="width:100%">' +
          '<option value="">— (Не выбран) —</option>' +
          (S.contractors || []).map(function(c){
            var sel = (march.contractorName === c.name_short || march.contractorName === c.name_full) ? ' selected' : '';
            return '<option value="' + escHtml(c.name_short) + '"' + sel + '>' + escHtml(c.name_short) + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div style="display:flex;align-items:flex-end">' +
        '<button class="btn btn-primary btn-sm" onclick="saveMarchSettings(\'' + march.id + '\')" style="width:100%">💾 Применить настройки</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  // Информационный блок: База, навигатор и экспресс-расчет рейса
  var allAddrs = pts.map(function(p){ return p.address || ''; }).filter(Boolean);
  var baseCity = (march.baseCity || '').trim();

  var yandexRouteUrl = '';
  var dgisRouteUrl   = '';
  if (baseCity || allAddrs.length) {
    var yaPoints = (baseCity ? [baseCity] : []).concat(allAddrs);
    yandexRouteUrl = 'https://yandex.ru/maps/?mode=routes&rtext=' + yaPoints.map(function(a){ return encodeURIComponent(a); }).join('~');
    dgisRouteUrl   = 'https://2gis.ru/search/' + encodeURIComponent((baseCity ? baseCity + ' ' : '') + (allAddrs[0] || ''));
  }

  html += '<div class="card p" style="margin-bottom:1.25rem">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.75rem">' +
      '<div>' +
        '<div style="font-size:.9rem;font-weight:700">📍 База маршрута: <span style="color:var(--orange)">' + (baseCity ? escHtml(baseCity) : '⚠️ (Не указана — кликните Настройки)') + '</span></div>' +
        '<div class="t3" style="font-size:.8rem;margin-top:2px">' +
          'Тариф: <b>' + (march.kmRate || 70) + ' ₽/км</b> · Суточные: <b>' + (params.perDiemRate !== undefined ? params.perDiemRate : 700) + ' ₽/день</b> · Рейс: <b>~' + tot.tripDays + ' дн.</b> (' + tot.totalHours + ' ч работы и пути)' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
        (yandexRouteUrl ? 
          '<a href="' + yandexRouteUrl + '" target="_blank" class="btn btn-sm" style="background:#fc3f1d;color:#fff;display:inline-flex;align-items:center;gap:6px">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="10" r="4"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg>' +
            'Яндекс.Навигатор' +
          '</a>' : '') +
        (dgisRouteUrl ? 
          '<a href="' + dgisRouteUrl + '" target="_blank" class="btn btn-sm" style="background:#3069b0;color:#fff;display:inline-flex;align-items:center;gap:6px">' +
            '2ГИС' +
          '</a>' : '') +
        '<button class="btn btn-sm btn-ghost" onclick="calcAllMarchLegsOsrm(\'' + march.id + '\')" title="Автоматически рассчитать плечи через спутниковый роутер OSRM">⚡ Авто-плечи OSRM</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  // ── ТАБЛИЦА ТОЧЕК МАРШРУТА (ДИНАМИЧЕСКИЙ МАРШРУТНЫЙ ЛИСТ) ──
  html += '<div class="card" style="margin-bottom:1.25rem">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:.75rem">' +
      '<div>' +
        '<div class="sec-title" style="margin:0">Точки маршрута (' + pts.length + ')</div>' +
        '<div class="t3" style="font-size:.78rem;margin-top:2px">Плечо — расстояние от предыдущей точки (первая — от базы). Можно редактировать прямо в ячейках.</div>' +
      '</div>' +
      '<div style="display:flex;gap:.5rem">' +
        '<button class="btn btn-sm btn-primary" onclick="openFastAddPointsModal(\'' + march.id + '\')">+ Добавить заявки</button>' +
      '</div>' +
    '</div>' +
    '<div style="overflow-x:auto">' +
    '<table style="width:100%;border-collapse:collapse;font-size:.82rem;min-width:1150px">' +
      '<thead><tr style="background:var(--bg);border-bottom:1px solid var(--border)">' +
        '<th style="padding:8px 8px;text-align:center;color:var(--text-3);font-weight:600;width:50px">№</th>' +
        '<th style="padding:8px 10px;text-align:left;color:var(--text-3);font-weight:600;width:120px">Заявка</th>' +
        '<th style="padding:8px 10px;text-align:left;color:var(--text-3);font-weight:600">Адрес объекта</th>' +
        '<th style="padding:8px 8px;text-align:center;color:var(--text-3);font-weight:600;width:60px">Портов</th>' +
        '<th style="padding:8px 8px;text-align:right;color:var(--text-3);font-weight:600;width:95px">Плечо (км)</th>' +
        '<th style="padding:8px 8px;text-align:right;color:var(--text-3);font-weight:600;width:85px">₽/порт</th>' +
        '<th style="padding:8px 8px;text-align:right;color:var(--text-3);font-weight:600">Удалёнка</th>' +
        '<th style="padding:8px 8px;text-align:right;color:var(--text-3);font-weight:600">Работа</th>' +
        '<th style="padding:8px 8px;text-align:right;color:var(--text-3);font-weight:600;width:85px">Допы (₽)</th>' +
        '<th style="padding:8px 8px;text-align:right;color:var(--orange);font-weight:700">Оплата ПО</th>' +
        '<th style="padding:8px 8px;text-align:right;color:var(--text-3);font-weight:600;width:90px">ТМЦ (₽)</th>' +
        '<th style="padding:8px 8px;text-align:right;color:var(--blue);font-weight:700;width:110px">Платит Заказчик</th>' +
        '<th style="padding:8px 8px;text-align:right;color:var(--text-3);font-weight:700;width:100px">Профит</th>' +
        '<th style="padding:8px 8px;text-align:center;color:var(--text-3);font-weight:600;width:80px">Порядок</th>' +
        '<th style="padding:8px 8px;text-align:center;color:var(--text-3);font-weight:600;width:40px"></th>' +
      '</tr></thead><tbody>';

  if (!pts.length) {
    html += '<tr><td colspan="15" style="text-align:center;padding:2.5rem;color:var(--text-3)">' +
      'В маршруте пока нет точек. Нажмите <b>«+ Добавить заявки»</b> выше, чтобы быстро набрать объекты.' +
    '</td></tr>';
  }

  pts.forEach(function(p, i) {
    var f = calcMarchPointFinance(p, march.params || { kmRate: march.kmRate || 70 });
    var task = S.tasks.find(function(t){ return String(t.id) === String(p.taskId); });
    var addrDisplay = p.address || (task ? task.address : '') || '—';
    var rowProfitColor = f.profit >= 0 ? '#16a34a' : '#dc2626';

    var taskLink = task
      ? '<a href="#" onclick="event.preventDefault();S.cardId=\'' + p.taskId + '\';S.page=\'card\';renderNav();renderApp();" style="color:var(--orange);font-weight:700;text-decoration:none">' + escHtml(p.taskId) + '</a>'
      : '<span style="color:var(--text-3)">' + escHtml(p.taskId || '—') + '</span>';

    var fromLabel = i === 0 ? 'От базы (' + escHtml(baseCity || 'База') + ')' : 'От т.' + i;

    html += '<tr style="border-bottom:1px solid var(--border);' + (i % 2 ? 'background:var(--bg)' : '') + '">' +
      '<td style="padding:6px 8px;text-align:center;color:var(--text-3);font-weight:600">' + (i + 1) + '</td>' +
      '<td style="padding:6px 10px;font-weight:600">' + taskLink + '</td>' +
      '<td style="padding:6px 10px">' +
        '<div style="font-size:.82rem;font-weight:500;color:var(--text)">' + escHtml(addrDisplay) + '</div>' +
        '<div class="t3" style="font-size:.72rem;color:var(--text-3)">' + fromLabel + (p.contractor ? ' · 👷 ' + escHtml(p.contractor) : '') + '</div>' +
      '</td>' +
      '<td style="padding:6px 8px;text-align:center">' +
        '<input type="number" min="1" value="' + (p.ports || 1) + '" style="width:50px;text-align:center;padding:3px 4px;border:1px solid var(--border);border-radius:4px;font-size:.8rem;" ' +
        'onchange="updateMarchPointField(\'' + march.id + '\', ' + i + ', \'ports\', this.value)">' +
      '</td>' +
      '<td style="padding:6px 8px;text-align:right">' +
        '<input type="number" min="0" step="1" value="' + (p.km || 0) + '" style="width:75px;text-align:right;padding:3px 6px;border:1px solid var(--border);border-radius:4px;font-weight:600;font-size:.8rem;" ' +
        'onchange="updateMarchPointField(\'' + march.id + '\', ' + i + ', \'km\', this.value)">' +
      '</td>' +
      '<td style="padding:6px 8px;text-align:right">' +
        '<input type="number" min="0" step="50" value="' + (p.pricePerPort || 4500) + '" style="width:75px;text-align:right;padding:3px 6px;border:1px solid var(--border);border-radius:4px;font-size:.8rem;" ' +
        'onchange="updateMarchPointField(\'' + march.id + '\', ' + i + ', \'pricePerPort\', this.value)">' +
      '</td>' +
      '<td style="padding:6px 8px;text-align:right;color:var(--text-2)">' + fmtMoney(f.remote) + '</td>' +
      '<td style="padding:6px 8px;text-align:right;color:var(--text-2)">' + fmtMoney(f.work) + '</td>' +
      '<td style="padding:6px 8px;text-align:right">' +
        '<input type="number" min="0" step="100" value="' + (p.extras || 0) + '" style="width:75px;text-align:right;padding:3px 6px;border:1px solid var(--border);border-radius:4px;font-size:.8rem;" ' +
        'onchange="updateMarchPointField(\'' + march.id + '\', ' + i + ', \'extras\', this.value)">' +
      '</td>' +
      '<td style="padding:6px 8px;text-align:right;font-weight:700;color:var(--orange)">' + fmtMoney(f.pay) + '</td>' +
      '<td style="padding:6px 8px;text-align:right">' +
        '<input type="number" min="0" step="100" value="' + (p.tmc || 0) + '" style="width:75px;text-align:right;padding:3px 6px;border:1px solid var(--border);border-radius:4px;font-size:.8rem;" ' +
        'onchange="updateMarchPointField(\'' + march.id + '\', ' + i + ', \'tmc\', this.value)">' +
      '</td>' +
      '<td style="padding:6px 8px;text-align:right;font-weight:700;color:var(--blue)">' +
        '<input type="number" min="0" step="100" value="' + (p.sber || 0) + '" style="width:90px;text-align:right;padding:3px 6px;border:1px solid var(--border);border-radius:4px;font-weight:700;color:var(--blue);font-size:.8rem;" ' +
        'onchange="updateMarchPointField(\'' + march.id + '\', ' + i + ', \'sber\', this.value)">' +
      '</td>' +
      '<td style="padding:6px 8px;text-align:right;font-weight:700;color:' + rowProfitColor + '">' + fmtMoney(f.profit) + '</td>' +
      '<td style="padding:6px 8px;text-align:center;white-space:nowrap">' +
        '<button class="btn btn-sm btn-ghost" style="padding:2px 6px" onclick="moveMarchPoint(\'' + march.id + '\', ' + i + ', -1)" ' + (i === 0 ? 'disabled style="opacity:0.3"' : '') + ' title="Переместить выше">▲</button>' +
        '<button class="btn btn-sm btn-ghost" style="padding:2px 6px" onclick="moveMarchPoint(\'' + march.id + '\', ' + i + ', 1)" ' + (i === pts.length - 1 ? 'disabled style="opacity:0.3"' : '') + ' title="Переместить ниже">▼</button>' +
      '</td>' +
      '<td style="padding:6px 8px;text-align:center">' +
        '<button class="btn btn-sm btn-ghost" style="color:var(--red);padding:2px 6px" onclick="deletePoint(\'' + march.id + '\', ' + i + ')" title="Удалить из маршрута">✕</button>' +
      '</td>' +
    '</tr>';
  });

  // Итоговая строка
  if (pts.length) {
    html += '<tr style="background:#fef3c7;font-weight:700;border-top:2px solid #f59e0b">' +
      '<td colspan="3" style="padding:10px 12px;font-size:.9rem">ИТОГО ПО МАРШРУТУ</td>' +
      '<td style="padding:10px 8px;text-align:center">' + fmtN(tot.ports) + '</td>' +
      '<td style="padding:10px 8px;text-align:right">' + fmtN(tot.km) + ' км</td>' +
      '<td></td>' +
      '<td style="padding:10px 8px;text-align:right">' + fmtMoney(tot.remote) + '</td>' +
      '<td style="padding:10px 8px;text-align:right">' + fmtMoney(tot.work) + '</td>' +
      '<td style="padding:10px 8px;text-align:right">' + fmtMoney(tot.extras) + '</td>' +
      '<td style="padding:10px 8px;text-align:right;color:var(--orange);font-size:.95rem">' + fmtMoney(tot.pay) + '</td>' +
      '<td style="padding:10px 8px;text-align:right">' + fmtMoney(tot.tmc) + '</td>' +
      '<td style="padding:10px 8px;text-align:right;color:var(--blue);font-size:.95rem">' + fmtMoney(tot.sber) + '</td>' +
      '<td style="padding:10px 8px;text-align:right;color:' + profitColor + ';font-size:.95rem">' + fmtMoney(tot.profit) + '</td>' +
      '<td colspan="2"></td>' +
    '</tr>';
  }

  html += '</tbody></table></div></div>';

  // ── КАРТА МАРШРУТА LEAFLET ──
  var mapId = 'marchmap_' + march.id;
  html += '<div class="card p" style="margin-bottom:1.25rem">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">' +
      '<div class="sec-title" style="margin:0">Карта маршрута</div>' +
      '<div class="t3" style="font-size:.78rem">Номера маркеров соответствуют порядку остановок</div>' +
    '</div>' +
    '<div id="' + mapId + '" style="height:340px;border-radius:var(--radius);background:#f0f0f0;display:flex;align-items:center;justify-content:center;color:#888;font-size:.82rem">' +
      (pts.length ? 'Загрузка интерактивной карты…' : '<div style="text-align:center"><div style="font-size:2rem">🗺️</div><div>Добавьте заявки, чтобы построить карту</div></div>') +
    '</div>' +
  '</div>';

  if (pts.length) {
    setTimeout(function(){ renderMarchMap(march, mapId); }, 150);
  }

  return html;
}

// ─── 4. УПРАВЛЕНИЕ ТОЧКАМИ И БЫСТРЫЙ ВЫБОР ЗАЯВОК ──────────────────────────

function toggleMarchSettingsPanel() {
  var p = document.getElementById('march_settings_panel');
  if (!p) return;
  var isHidden = p.style.display === 'none';
  p.style.display = isHidden ? 'block' : 'none';
}

function saveMarchSettings(marchId) {
  var march = (S.marches || []).find(function(m){ return m.id === marchId; });
  if (!march) return;

  var nameVal        = (document.getElementById('mcfg_name')?.value || march.name).trim();
  var baseCityVal    = (document.getElementById('mcfg_baseCity')?.value || '').trim();
  var kmRateVal      = parseFloat(document.getElementById('mcfg_kmRate')?.value) || 70;
  var perDiemVal     = parseFloat(document.getElementById('mcfg_perDiemRate')?.value) || 700;
  var lodgingVal     = parseFloat(document.getElementById('mcfg_lodgingRate')?.value) || 0;
  var avgSpeedVal    = parseFloat(document.getElementById('mcfg_avgSpeed')?.value) || 70;
  var contractorVal  = (document.getElementById('mcfg_contractor')?.value || '').trim();

  march.name           = nameVal;
  march.baseCity       = baseCityVal;
  march.kmRate         = kmRateVal;
  march.contractorName = contractorVal;
  march.params = Object.assign({}, march.params || {}, {
    perDiemRate: perDiemVal,
    lodgingRate: lodgingVal,
    avgSpeed: avgSpeedVal,
    kmRate: kmRateVal
  });

  api('/marches/' + marchId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: march.name,
      baseCity: march.baseCity,
      kmRate: march.kmRate,
      contractorName: march.contractorName,
      params: march.params
    })
  }).then(function() {
    if (typeof showToast === 'function') showToast('✓ Параметры маршрута сохранены', 'success');
    renderApp();
  }).catch(function(e){
    alert('Ошибка сохранения параметров: ' + e.message);
  });
}

function updateMarchPointField(marchId, idx, field, val) {
  var march = (S.marches || []).find(function(m){ return m.id === marchId; });
  if (!march || !march.points || !march.points[idx]) return;

  var numVal = parseFloat(val);
  if (isNaN(numVal)) numVal = 0;

  march.points[idx][field] = numVal;

  api('/marches/' + marchId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: march.points })
  }).then(function() {
    renderApp();
  });
}

function moveMarchPoint(marchId, idx, direction) {
  var march = (S.marches || []).find(function(m){ return m.id === marchId; });
  if (!march || !march.points) return;
  var newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= march.points.length) return;

  var temp = march.points[idx];
  march.points[idx] = march.points[newIdx];
  march.points[newIdx] = temp;

  api('/marches/' + marchId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: march.points })
  }).then(function() {
    renderApp();
  });
}

// ─── БЫСТРОЕ ДОБАВЛЕНИЕ ЗАЯВОК (БЕЗ РУТИННОГО ВВОДА) ─────────────────────────

function openFastAddPointsModal(marchId) {
  var march = (S.marches || []).find(function(m){ return m.id === marchId; });
  if (!march) return;

  var existingTaskIds = (march.points || []).map(function(p){ return String(p.taskId); });
  var availableTasks = (S.tasks || []).filter(function(t) {
    return t.id && existingTaskIds.indexOf(String(t.id)) === -1;
  });

  var modal = document.createElement('div');
  modal.id = 'fast_add_points_modal';
  modal.className = 'modal-backdrop';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(2px);';

  function renderList(searchQuery) {
    var q = (searchQuery || '').toLowerCase().trim();
    var filtered = availableTasks.filter(function(t) {
      if (!q) return true;
      return (t.id && t.id.toLowerCase().includes(q)) ||
             (t.address && t.address.toLowerCase().includes(q)) ||
             (t.region && t.region.toLowerCase().includes(q)) ||
             (t.customer && t.customer.toLowerCase().includes(q)) ||
             (t.contractor && t.contractor.toLowerCase().includes(q));
    }).slice(0, 50);

    var listEl = document.getElementById('fast_tasks_list');
    if (!listEl) return;

    if (!filtered.length) {
      listEl.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-3)">Заявки не найдены</div>';
      return;
    }

    listEl.innerHTML = filtered.map(function(t) {
      var ports = t.fact || t.inOrder || 1;
      var sberAmount = Number(t.amount) || 0;
      var regionLabel = t.region ? '📍 ' + escHtml(t.region) + ' · ' : '';

      return '<div class="card p" style="display:flex;justify-content:space-between;align-items:center;padding:.65rem .9rem;margin-bottom:.5rem;background:#fff;border:1px solid var(--border);border-radius:8px;">' +
        '<div style="flex:1;min-width:0;padding-right:1rem;">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span style="font-weight:700;color:var(--orange);font-size:.9rem">' + escHtml(t.id) + '</span>' +
            '<span style="font-size:.78rem;color:var(--text-2);">' + regionLabel + escHtml(t.customer || '') + '</span>' +
          '</div>' +
          '<div style="font-size:.82rem;color:var(--text);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escHtml(t.address || '') + '">' +
            escHtml(t.address || '—') +
          '</div>' +
          '<div style="font-size:.75rem;color:var(--text-3);margin-top:2px">' +
            'Портов: <b>' + ports + '</b> · Смета Сбера: <b>' + fmtMoney(sberAmount) + '</b>' +
            (t.contractor ? ' · 👷 ' + escHtml(t.contractor) : '') +
          '</div>' +
        '</div>' +
        '<button class="btn btn-sm btn-primary" onclick="addSingleTaskToMarch(\'' + march.id + '\', \'' + t.id + '\')" style="white-space:nowrap">+ Добавить</button>' +
      '</div>';
    }).join('');
  }

  modal.innerHTML = 
    '<div style="background:#fff;border-radius:12px;width:100%;max-width:650px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 25px -5px rgba(0,0,0,0.2);">' +
      '<div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">' +
        '<h3 style="margin:0;font-size:1.1rem;font-weight:700;">➕ Добавить заявки в маршрут</h3>' +
        '<button class="btn btn-sm btn-ghost" onclick="document.getElementById(\'fast_add_points_modal\').remove()">✕</button>' +
      '</div>' +
      '<div style="padding:.75rem 1.25rem;border-bottom:1px solid var(--border);background:var(--bg);">' +
        '<input type="text" id="fast_task_search" placeholder="🔍 Поиск по номеру заявки, городу, адресу или заказчику..." ' +
        'style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:.88rem;" ' +
        'oninput="window._renderFastTasksList(this.value)">' +
      '</div>' +
      '<div id="fast_tasks_list" style="padding:1rem 1.25rem;overflow-y:auto;flex:1;">' +
        'Загрузка списка заявок…' +
      '</div>' +
      '<div style="padding:.75rem 1.25rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end;">' +
        '<button class="btn btn-ghost" onclick="document.getElementById(\'fast_add_points_modal\').remove()">Закрыть</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);
  window._renderFastTasksList = renderList;
  renderList('');

  setTimeout(function() {
    var searchInput = document.getElementById('fast_task_search');
    if (searchInput) searchInput.focus();
  }, 50);
}

function addSingleTaskToMarch(marchId, taskId) {
  var march = (S.marches || []).find(function(m){ return m.id === marchId; });
  var task  = (S.tasks || []).find(function(t){ return String(t.id) === String(taskId); });
  if (!march || !task) return;

  // Автоматическое определение базы, если еще не была задана
  if (!march.baseCity || !march.baseCity.trim()) {
    var detectedBase = detectDefaultBaseCity(task, march);
    if (detectedBase) march.baseCity = detectedBase;
  }

  var ports = Number(task.fact) || Number(task.inOrder) || 1;
  var ppp   = Number(task.pricePerUnit) || (ports >= 3 ? 3750 : ports === 2 ? 4250 : 4500);
  var tmc   = Number(task.tmc) || (2500 * ports);
  var sber  = Number(task.amount) || 0;

  var newPoint = {
    taskId:       task.id,
    address:      task.address || '',
    workType:     task.workType || 'СКС кат. 5е',
    ports:        ports,
    pricePerPort: ppp,
    km:           Number(task.distanceKm) || 0,
    kmRate:       march.kmRate || 70,
    workHours:    2 * ports,
    extras:       0,
    tmc:          tmc,
    sber:         sber,
    contractor:   task.contractor || task.assignee || (march.contractorName || ''),
    lat: null, lng: null
  };

  var pts = (march.points || []).slice();
  pts.push(newPoint);
  march.points = pts;

  api('/marches/' + marchId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseCity: march.baseCity,
      points: pts
    })
  }).then(function() {
    if (typeof showToast === 'function') {
      showToast('✓ Заявка ' + task.id + ' добавлена в маршрут', 'success');
    }
    // Обновляем список доступных в модалке
    if (window._renderFastTasksList) {
      var s = document.getElementById('fast_task_search');
      window._renderFastTasksList(s ? s.value : '');
    }
    renderApp();
  });
}

// ─── 5. АВТО-РАСЧЕТ ПЛЕЧ МАРШРУТА ЧЕРЕЗ OSRM ─────────────────────────────────

function calcAllMarchLegsOsrm(marchId) {
  var march = (S.marches || []).find(function(m){ return m.id === marchId; });
  if (!march || !march.points || !march.points.length) {
    alert('В маршруте нет точек для расчета');
    return;
  }

  var pts = march.points;
  var baseCity = (march.baseCity || '').trim();
  if (!baseCity) {
    alert('Укажите базовый город маршрута в настройках для расчета расстояний');
    return;
  }

  if (typeof showToast === 'function') showToast('⏳ Геокодируем адреса и рассчитываем плечи маршрута...', 'info');

  function geocodeStr(str) {
    return fetch('/api/geocode?q=' + encodeURIComponent('Россия, ' + str) + '&_t=' + Date.now())
      .then(function(r){ return r.json(); })
      .then(function(d){ return d && d[0] ? { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon) } : null; })
      .catch(function(){ return null; });
  }

  // Сначала получаем координаты всех точек + базы
  var promises = [geocodeStr(baseCity)];
  pts.forEach(function(p){ promises.push(geocodeStr(p.address)); });

  Promise.all(promises).then(function(coords) {
    var baseCoord = coords[0];
    var pointCoords = coords.slice(1);

    var routePromises = [];
    for (var i = 0; i < pts.length; i++) {
      var fromC = i === 0 ? baseCoord : pointCoords[i - 1];
      var toC   = pointCoords[i];

      if (fromC && toC) {
        var pairStr = fromC.lon + ',' + fromC.lat + ';' + toC.lon + ',' + toC.lat;
        (function(idx) {
          routePromises.push(
            fetch('/api/route?coords=' + encodeURIComponent(pairStr) + '&_t=' + Date.now())
              .then(function(r){ return r.json(); })
              .then(function(res) {
                if (res && res.distance_km) {
                  pts[idx].km = Math.round(res.distance_km);
                }
              })
              .catch(function(){})
          );
        })(i);
      }
    }

    Promise.all(routePromises).then(function() {
      api('/marches/' + marchId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: pts })
      }).then(function() {
        if (typeof showToast === 'function') showToast('✓ Расстояния плеч успешно рассчитаны!', 'success');
        renderApp();
      });
    });
  });
}

// ─── 6. ПЕЧАТНАЯ ФОРМА: МАРШРУТНЫЙ ЛИСТ (ЗАКАЗ-НАРЯД) ─────────────────────────

function printMarchSheet(marchId) {
  var march = (S.marches || []).find(function(m){ return m.id === marchId; });
  if (!march) return;

  var tot = marchTotals(march);
  var pts = march.points || [];

  var rowsHtml = pts.map(function(p, i) {
    var task = S.tasks.find(function(t){ return String(t.id) === String(p.taskId); });
    var contact = task ? (task.contact || '—') : '—';
    var f = calcMarchPointFinance(p, march.params || { kmRate: march.kmRate || 70 });

    return '<tr>' +
      '<td style="text-align:center;padding:8px 6px;border:1px solid #000;">' + (i + 1) + '</td>' +
      '<td style="padding:8px 6px;border:1px solid #000;font-weight:700;">' + escHtml(p.taskId) + '</td>' +
      '<td style="padding:8px 6px;border:1px solid #000;">' + escHtml(p.address) + '</td>' +
      '<td style="padding:8px 6px;border:1px solid #000;font-size:11px;">' + escHtml(contact) + '</td>' +
      '<td style="padding:8px 6px;border:1px solid #000;font-size:11px;">' + escHtml(p.workType || 'СКС') + ' (' + p.ports + ' пор.)</td>' +
      '<td style="text-align:right;padding:8px 6px;border:1px solid #000;">' + p.km + ' км</td>' +
      '<td style="text-align:right;padding:8px 6px;border:1px solid #000;font-weight:700;">' + fmtMoney(f.pay) + '</td>' +
      '<td style="padding:8px 6px;border:1px solid #000;font-size:11px;">' +
        '<div style="min-height:22px;border-bottom:1px dotted #888;"></div>' +
      '</td>' +
    '</tr>';
  }).join('');

  var printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Разрешите всплывающие окна для печати маршрутного листа');

  printWindow.document.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Маршрутный лист — ' + escHtml(march.name) + '</title>' +
    '<style>' +
      'body { font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; color: #000; margin: 20px; line-height: 1.35; }' +
      'h1 { font-size: 18px; margin: 0 0 4px 0; text-transform: uppercase; }' +
      'table { width: 100%; border-collapse: collapse; margin-top: 14px; }' +
      'th { background: #f2f2f2; border: 1px solid #000; padding: 6px; font-size: 11px; }' +
      '.signatures { margin-top: 35px; display: flex; justify-content: space-between; font-size: 13px; }' +
      '@media print { .no-print { display: none; } }' +
    '</style></head><body>' +
    '<div class="no-print" style="margin-bottom:15px;display:flex;gap:10px;">' +
      '<button onclick="window.print()" style="padding:8px 16px;background:#ea580c;color:#fff;border:none;border-radius:4px;font-weight:700;cursor:pointer;">🖨️ Печать</button>' +
      '<button onclick="window.close()" style="padding:8px 16px;background:#ccc;border:none;border-radius:4px;cursor:pointer;">Закрыть</button>' +
    '</div>' +
    '<h1>МАРШРУТНЫЙ ЛИСТ / ЗАКАЗ-НАРЯД № ' + escHtml(march.name) + '</h1>' +
    '<div style="margin-bottom:12px;font-size:12px;">' +
      '<div>Базовый город старта: <b>' + escHtml(march.baseCity || 'Не указан') + '</b></div>' +
      '<div>Подрядчик / Бригада: <b>' + escHtml(march.contractorName || 'Основной подрядчик') + '</b></div>' +
      '<div>Дата формирования: <b>' + new Date().toLocaleDateString('ru') + '</b> · Всего точек: <b>' + pts.length + '</b> · Общий пробег: <b>' + tot.km + ' км</b></div>' +
      '<div>Расчетное время рейса: <b>~' + tot.tripDays + ' дн.</b> · Итого сумма к выплате ПО: <b>' + fmtMoney(tot.pay) + '</b></div>' +
    '</div>' +
    '<table>' +
      '<thead><tr>' +
        '<th style="width:30px">№</th>' +
        '<th style="width:100px">Заявка</th>' +
        '<th>Адрес объекта</th>' +
        '<th>Контакты на объекте</th>' +
        '<th>Объем работ</th>' +
        '<th style="width:75px">Плечо</th>' +
        '<th style="width:90px">Оплата ПО</th>' +
        '<th style="width:120px">Отметка о сдаче</th>' +
      '</tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
    '</table>' +
    '<div class="signatures">' +
      '<div>Выдал диспетчер: ____________________ / ' + (S.user?.fullName || 'Менеджер') + ' /</div>' +
      '<div>Принял водитель-монтажник: ____________________ / ____________ /</div>' +
    '</div>' +
    '</body></html>'
  );
  printWindow.document.close();
}

// ─── 7. КАРТА LEAFLET ────────────────────────────────────────────────────────

function renderMarchMap(march, mapId) {
  var el = document.getElementById(mapId);
  if (!el) return;

  var pts = march.points || [];
  if (!pts.length) return;

  function loadLeaflet(cb) {
    if (window.L) { cb(); return; }
    var css = document.createElement('link'); css.rel='stylesheet'; css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
    var s = document.createElement('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = cb; document.head.appendChild(s);
  }

  function geocodeOne(query, cb) {
    fetch('/api/geocode?q=' + encodeURIComponent(query) + '&_t=' + Date.now())
      .then(function(r){ return r.json(); })
      .then(function(d){ cb(d && d[0] ? { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) } : null); })
      .catch(function(){ cb(null); });
  }

  function geocodeAll(pts, cb) {
    var results = new Array(pts.length).fill(null);
    var i = 0;

    function next() {
      if (i >= pts.length) { cb(results); return; }
      var idx = i++;
      var p   = pts[idx];
      var task = S.tasks.find(function(t){ return String(t.id) === String(p.taskId); });

      var addr   = (p.address || '').trim();
      var region = task ? (task.region || '') : '';
      var queries = [];
      if (addr) {
        if (region) queries.push('Россия, ' + region + ', ' + addr);
        queries.push('Россия, ' + addr);
      }
      if (region) queries.push('Россия, ' + region);

      function tryQuery(qi) {
        if (qi >= queries.length) { setTimeout(next, 250); return; }
        geocodeOne(queries[qi], function(coord) {
          if (coord) {
            results[idx] = coord;
            setTimeout(next, 250);
          } else {
            tryQuery(qi + 1);
          }
        });
      }
      tryQuery(0);
    }
    next();
  }

  loadLeaflet(function() {
    el.innerHTML = '';
    var hasSaved = pts.every(function(p){ return p.lat && p.lng; });

    function drawMap(coords) {
      var validCoords = coords.filter(Boolean);
      if (!validCoords.length) {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;text-align:center;padding:1rem">Не удалось определить координаты точек.<br>Проверьте адреса объектов.</div>';
        return;
      }

      var map = L.map(el);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);

      var latLngs = [];

      coords.forEach(function(c, i) {
        if (!c) return;
        var p = pts[i];
        var ll = [c.lat, c.lng];
        latLngs.push(ll);

        var icon = L.divIcon({
          className: '',
          html: '<div style="background:var(--orange);color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.78rem;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff">' + (i+1) + '</div>',
          iconSize: [28, 28], iconAnchor: [14, 14]
        });

        var f = calcMarchPointFinance(p, march.params || { kmRate: march.kmRate || 70 });
        var popup = '<div style="font-size:.8rem;min-width:180px">' +
          '<div style="font-weight:700;margin-bottom:3px">#' + (i + 1) + ' · ' + escHtml(p.taskId) + '</div>' +
          '<div style="color:#666;margin-bottom:5px;font-size:.75rem">' + escHtml(p.address) + '</div>' +
          '<div style="display:flex;gap:.75rem">' +
            '<span>🛣️ Плечо: <strong>' + (p.km || 0) + '</strong> км</span>' +
            '<span>🔌 Портов: <strong>' + (p.ports || 0) + '</strong></span>' +
          '</div>' +
          '<div style="color:var(--orange);font-weight:600;margin-top:4px">Оплата ПО: ' + fmtMoney(f.pay) + '</div>' +
        '</div>';

        L.marker(ll, { icon: icon }).addTo(map).bindPopup(popup);
      });

      map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40] });

      // Отрисовка траектории по дорогам через OSRM
      if (latLngs.length >= 2) {
        L.polyline(latLngs, { color: '#FF6200', weight: 4, opacity: 0.8 }).addTo(map);
      }
    }

    if (hasSaved) {
      drawMap(pts.map(function(p){ return { lat: p.lat, lng: p.lng }; }));
    } else {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;text-align:center;padding:1rem">' +
        '<div><div style="font-size:1.4rem;margin-bottom:.5rem">🔍</div>Определяем точки на карте…</div></div>';
      geocodeAll(pts, drawMap);
    }
  });
}

// ─── 8. УДАЛЕНИЕ И СОЗДАНИЕ МАРШРУТА ─────────────────────────────────────────

function openCreateMarch() {
  showModal('🚗 Создать новый маршрут', [
    { key: 'name',     label: 'Название маршрута', placeholder: 'Чита — Жиндо, Кольцо Север…', required: true },
    { key: 'baseCity', label: 'Базовый город (старт)', placeholder: 'Чита, Новосибирск (или пусто — определится по заявке)' },
    { key: 'kmRate',   label: 'Тариф за км (₽/км)', type: 'number', value: 70, hint: 'Удалёнка = плечо км × тариф' },
  ], function(d) {
    api('/marches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: d.name,
        baseCity: (d.baseCity || '').trim(),
        kmRate: parseFloat(d.kmRate) || 70,
        params: {
          perDiemRate: 700,
          lodgingRate: 0,
          avgSpeed: 70,
          kmRate: parseFloat(d.kmRate) || 70
        }
      })
    }).then(function(m) {
      if (!m || !m.id) { alert('Ошибка создания маршрута'); return; }
      S.marches.unshift(m);
      S.marchId = m.id;
      S.page = 'march-detail';
      renderNav();
      renderApp();
    }).catch(function(e){ alert('Ошибка: ' + e.message); });
  });
}

function deleteMarch(id) {
  showConfirm('Удалить маршрут? Это действие нельзя отменить.', function() {
    api('/marches/' + id, { method: 'DELETE' }).then(function() {
      S.marches = S.marches.filter(function(m){ return m.id !== id; });
      S.page = 'marches';
      renderNav();
      renderApp();
    });
  });
}

function deletePoint(marchId, idx) {
  showConfirm('Удалить эту точку из маршрута?', function() {
    var march = S.marches.find(function(m){ return m.id === marchId; });
    if (!march) return;
    var pts = (march.points || []).slice();
    pts.splice(idx, 1);
    march.points = pts;
    api('/marches/' + marchId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: pts })
    }).then(function() {
      renderApp();
    });
  });
}
