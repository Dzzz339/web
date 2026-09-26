function calcMarchFinance(point) {
  var km      = Number(point.km) || 0;
  var ports   = Number(point.ports) || 0;
  var ppp     = Number(point.pricePerPort) || 0;
  var rate    = Number(point.kmRate) || 70;
  var extras  = Number(point.extras) || 0;
  var tmc     = Number(point.tmc) || 0;
  var remote  = km > 0 ? Math.round(km * 2 * rate) : 0;
  var work    = Math.round(ports * ppp);
  var pay     = remote + work + extras;
  var sber    = pay + tmc;
  return { remote: remote, work: work, extras: extras, pay: pay, tmc: tmc, sber: sber };
}

function marchTotals(march) {
  var totKm = 0, totPorts = 0, totRemote = 0, totWork = 0, totExtras = 0, totPay = 0, totTmc = 0, totSber = 0;
  (march.points || []).forEach(function(p) {
    var f = calcMarchFinance(p);
    totKm      += Number(p.km) || 0;
    totPorts   += Number(p.ports) || 0;
    totRemote  += f.remote;
    totWork    += f.work;
    totExtras  += f.extras;
    totPay     += f.pay;
    totTmc     += f.tmc;
    totSber    += f.sber;
  });
  return { km: totKm, ports: totPorts, remote: totRemote, work: totWork, extras: totExtras, pay: totPay, tmc: totTmc, sber: totSber };
}

function pageMarches() {
  var html = '<h1 class="page-title">🚗 Маршруты</h1>';

  // Кнопка создания
  html += '<div style="display:flex;gap:.75rem;margin-bottom:1.25rem;align-items:center">' +
    '<button class="btn" onclick="openCreateMarch()">+ Создать маршрут</button>' +
    (S.marches.length ? '<span class="t3" style="font-size:.82rem">' + S.marches.length + ' маршрутов</span>' : '') +
  '</div>';

  if (!S.marches.length) {
    return html + '<div class="card p" style="text-align:center;padding:3rem">' +
      '<div style="font-size:2.5rem;margin-bottom:.75rem">🗺️</div>' +
      '<div class="t3">Маршрутов пока нет.<br>Создайте первый — добавьте заявки и введите расстояния.</div></div>';
  }

  html += '<div class="g2" style="gap:1rem">';
  S.marches.forEach(function(m) {
    var tot = marchTotals(m);
    var pts = (m.points || []).length;
    html += '<div class="card p" style="cursor:pointer" onclick="openMarch(\'' + m.id + '\')">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem">' +
        '<div>' +
          '<div style="font-weight:700;font-size:1rem">' + escHtml(m.name) + '</div>' +
          '<div class="t3" style="font-size:.78rem;margin-top:2px">' + (m.baseCity ? '📍 ' + escHtml(m.baseCity) + ' · ' : '') +
          new Date(m.createdAt).toLocaleDateString('ru') + '</div>' +
        '</div>' +
        '<button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="event.stopPropagation();deleteMarch(\'' + m.id + '\')" title="Удалить">✕</button>' +
      '</div>' +
      '<div class="g4" style="gap:.5rem;grid-template-columns:repeat(4,1fr)">' +
        '<div class="card" style="padding:.6rem .75rem;background:var(--bg)">' +
          '<div class="t3" style="font-size:.68rem;text-transform:uppercase;letter-spacing:.04em">Точек</div>' +
          '<div style="font-weight:700;font-size:1.1rem">' + pts + '</div>' +
        '</div>' +
        '<div class="card" style="padding:.6rem .75rem;background:var(--bg)">' +
          '<div class="t3" style="font-size:.68rem;text-transform:uppercase;letter-spacing:.04em">Км</div>' +
          '<div style="font-weight:700;font-size:1.1rem">' + fmtN(tot.km) + '</div>' +
        '</div>' +
        '<div class="card" style="padding:.6rem .75rem;background:var(--bg)">' +
          '<div class="t3" style="font-size:.68rem;text-transform:uppercase;letter-spacing:.04em">Портов</div>' +
          '<div style="font-weight:700;font-size:1.1rem">' + fmtN(tot.ports) + '</div>' +
        '</div>' +
        '<div class="card" style="padding:.6rem .75rem;background:var(--bg)">' +
          '<div class="t3" style="font-size:.68rem;text-transform:uppercase;letter-spacing:.04em">Оплата ПО</div>' +
          '<div style="font-weight:700;font-size:1.1rem;color:var(--orange)">' + fmtMoney(tot.pay) + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:.75rem;display:flex;gap:1.5rem;font-size:.8rem">' +
        '<span><span class="t3">Удалёнка:</span> <strong>' + fmtMoney(tot.remote) + '</strong></span>' +
        '<span><span class="t3">Работа:</span> <strong>' + fmtMoney(tot.work) + '</strong></span>' +
        '<span><span class="t3">ТМЦ:</span> <strong>' + fmtMoney(tot.tmc) + '</strong></span>' +
        '<span><span class="t3">Платит Сбер:</span> <strong>' + fmtMoney(tot.sber) + '</strong></span>' +
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

function pageMarchDetail() {
  var march = (S.marches || []).find(function(m){ return m.id === S.marchId; });
  if (!march) return '<button class="btn btn-ghost" onclick="go(\'marches\')">← Маршруты</button><p>Маршрут не найден</p>';

  var tot = marchTotals(march);
  var pts = march.points || [];

  // ── Шапка ──
  var html = '<div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap">' +
    '<button class="btn btn-ghost btn-sm" onclick="go(\'marches\')">← Маршруты</button>' +
    '<h1 style="font-size:1.2rem;font-weight:700;flex:1">🚗 ' + escHtml(march.name) + '</h1>' +
    '<button class="btn btn-sm btn-ghost" onclick="editMarchMeta(\'' + march.id + '\')">✏️ Настройки</button>' +
  '</div>';

  // ── Финансовый итог ──
  html += '<div class="g4" style="gap:.75rem;margin-bottom:1.25rem;grid-template-columns:repeat(4,1fr)">' +
    statBox('Точек / Портов', pts.length + ' / ' + fmtN(tot.ports), null) +
    statBox('Общий пробег', fmtN(tot.km) + ' км', null) +
    statBox('Оплата ПО', fmtMoney(tot.pay), 'var(--orange)') +
    statBox('Платит Сбер', fmtMoney(tot.sber), 'var(--blue)') +
  '</div>';

  html += '<div class="g2" style="gap:1rem;margin-bottom:1.25rem;grid-template-columns:3fr 1fr">' +
    // Карточка деталей финансов
    '<div class="card p">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">' +
        '<div class="sec-title" style="margin:0">Финансы маршрута</div>' +
        (function(){
          // Проверяем есть ли хоть один подрядчик
          var hasContractors = pts.some(function(p){ return p.contractor && p.contractor.trim(); });
          return hasContractors
            ? '<button class="btn btn-sm btn-ghost" onclick="toggleContractorBreakdown()" id="ctrToggleBtn">По подрядчикам ▾</button>'
            : '';
        })() +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:.85rem">' +
        '<thead><tr style="border-bottom:1px solid var(--border)">' +
          '<th style="text-align:left;padding:6px 4px;color:var(--text-3);font-weight:600">Статья</th>' +
          '<th style="text-align:right;padding:6px 4px;color:var(--text-3);font-weight:600">Сумма</th>' +
        '</tr></thead><tbody>' +
        finRow('Удалёнка (транспорт)', tot.remote) +
        finRow('Работа (порты × цена)', tot.work) +
        finRow('Допы', tot.extras) +
        '<tr style="border-top:2px solid var(--border);font-weight:700">' +
          '<td style="padding:8px 4px">Итого оплата ПО</td>' +
          '<td style="padding:8px 4px;text-align:right;color:var(--orange)">' + fmtMoney(tot.pay) + '</td>' +
        '</tr>' +
        finRow('ТМЦ (материалы)', tot.tmc) +
        '<tr style="border-top:2px solid var(--border);font-weight:700">' +
          '<td style="padding:8px 4px">Итого платит Сбер</td>' +
          '<td style="padding:8px 4px;text-align:right;color:var(--blue)">' + fmtMoney(tot.sber) + '</td>' +
        '</tr>' +
      '</tbody></table>' +
      // Разбивка по подрядчикам (скрыта по умолчанию)
      (function(){
        var byC = {};
        pts.forEach(function(p){
          var key = (p.contractor && p.contractor.trim()) ? p.contractor.trim() : '(без подрядчика)';
          if (!byC[key]) byC[key] = { remote:0, work:0, extras:0, pay:0, tmc:0, sber:0, ports:0 };
          var f = calcMarchFinance(p);
          byC[key].remote  += f.remote;
          byC[key].work    += f.work;
          byC[key].extras  += f.extras;
          byC[key].pay     += f.pay;
          byC[key].tmc     += f.tmc;
          byC[key].sber    += f.sber;
          byC[key].ports   += Number(p.ports) || 0;
        });
        var keys = Object.keys(byC);
        if (keys.length < 2) return ''; // разбивка нужна только если подрядчиков > 1
        var rows = keys.map(function(k){
          var c = byC[k];
          return '<tr style="border-bottom:1px solid var(--border)">' +
            '<td style="padding:6px 8px;font-weight:600">' + escHtml(k) + '</td>' +
            '<td style="padding:6px 8px;text-align:right">' + c.ports + ' пор.</td>' +
            '<td style="padding:6px 8px;text-align:right">' + fmtMoney(c.remote) + '</td>' +
            '<td style="padding:6px 8px;text-align:right">' + fmtMoney(c.work) + '</td>' +
            '<td style="padding:6px 8px;text-align:right;font-weight:700;color:var(--orange)">' + fmtMoney(c.pay) + '</td>' +
            '<td style="padding:6px 8px;text-align:right">' + fmtMoney(c.tmc) + '</td>' +
            '<td style="padding:6px 8px;text-align:right;font-weight:700;color:var(--blue)">' + fmtMoney(c.sber) + '</td>' +
          '</tr>';
        }).join('');
        return '<div id="contractorBreakdown" style="display:none;margin-top:1rem">' +
          '<div class="sec-title" style="margin-bottom:.5rem;font-size:.8rem">Разбивка по подрядчикам</div>' +
          '<div style="overflow-x:auto">' +
          '<table style="width:100%;border-collapse:collapse;font-size:.8rem">' +
            '<thead><tr style="background:var(--bg);border-bottom:1px solid var(--border)">' +
              '<th style="padding:6px 8px;text-align:left;color:var(--text-3)">Подрядчик</th>' +
              '<th style="padding:6px 8px;text-align:right;color:var(--text-3)">Портов</th>' +
              '<th style="padding:6px 8px;text-align:right;color:var(--text-3)">Удалёнка</th>' +
              '<th style="padding:6px 8px;text-align:right;color:var(--text-3)">Работа</th>' +
              '<th style="padding:6px 8px;text-align:right;color:var(--orange)">Оплата ПО</th>' +
              '<th style="padding:6px 8px;text-align:right;color:var(--text-3)">ТМЦ</th>' +
              '<th style="padding:6px 8px;text-align:right;color:var(--blue)">Платит Сбер</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table></div></div>';
      })() +
    '</div>' +
    // Карточка параметров маршрута
    '<div class="card p">' +
      '<div class="sec-title" style="margin-bottom:.75rem">Параметры</div>' +
      '<div style="display:flex;flex-direction:column;gap:.5rem;font-size:.85rem">' +
        '<div><span class="t3">База:</span> <strong>' + escHtml(march.baseCity || '—') + '</strong></div>' +
        '<div><span class="t3">Тариф км:</span> <strong>' + fmtN(march.kmRate) + ' ₽/км</strong></div>' +
        '<div><span class="t3">Создан:</span> <strong>' + new Date(march.createdAt).toLocaleDateString('ru') + '</strong></div>' +
        '<div><span class="t3">Точек:</span> <strong>' + pts.length + '</strong></div>' +
        '<div><span class="t3">Км всего:</span> <strong>' + fmtN(tot.km) + '</strong></div>' +
      '</div>' +
    '</div>' +
  '</div>';

  // ── Карта ──
  var mapId = 'marchmap_' + march.id;

  // Кнопки 2ГИС и Яндекс — ищем по всем точкам маршрута
  var marchMapBtns = '';
  if (pts.length) {
    // Для 2ГИС/Яндекс берём адрес первой точки или базовый город
    var allAddrs = pts.map(function(p){ return p.address || ''; }).filter(Boolean);
    var searchQuery = (march.baseCity ? march.baseCity + ' ' : '') + (allAddrs[0] || '');
    var dgisUrl   = 'https://2gis.ru/search/' + encodeURIComponent(searchQuery);
    // Яндекс маршрут через несколько точек
    var yaPts = (march.baseCity ? [march.baseCity] : []).concat(allAddrs.slice(0, 5));
    var yaUrl = 'https://yandex.ru/maps/?mode=routes&rtext=' + yaPts.map(function(a){ return encodeURIComponent(a); }).join('~');
    marchMapBtns = '<div style="display:flex;gap:.5rem;margin-top:.6rem;flex-wrap:wrap">' +
      '<a href="' + dgisUrl + '" target="_blank" class="btn btn-sm" style="background:#3069b0;gap:5px">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="10" r="4"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg>' +
        '2ГИС' +
      '</a>' +
      '<a href="' + yaUrl + '" target="_blank" class="btn btn-sm" style="background:#fc3f1d;gap:5px">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="10" r="4"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg>' +
        'Яндекс.Маршрут' +
      '</a>' +
    '</div>';
  }

  html += '<div class="card p" style="margin-bottom:1.25rem">' +
    '<div class="sec-title" style="margin-bottom:.75rem">Карта маршрута</div>' +
    '<div id="' + mapId + '" style="height:320px;border-radius:var(--radius);background:#f0f0f0;display:flex;align-items:center;justify-content:center;color:#888;font-size:.82rem">' +
      (pts.length ? 'Загрузка карты…' : '<div style="text-align:center"><div style="font-size:2rem">🗺️</div><div>Добавьте точки — появится карта</div></div>') +
    '</div>' +
    marchMapBtns +
  '</div>';

  // ── Таблица точек ──
  html += '<div class="card" style="margin-bottom:1.25rem">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;border-bottom:1px solid var(--border)">' +
      '<div class="sec-title" style="margin:0">Точки маршрута</div>' +
      '<button class="btn btn-sm" onclick="openAddPoint(\'' + march.id + '\')">+ Добавить точку</button>' +
    '</div>' +
    '<div style="overflow-x:auto">' +
    '<table style="width:100%;border-collapse:collapse;font-size:.82rem;min-width:900px">' +
      '<thead><tr style="background:var(--bg)">' +
        '<th style="padding:8px 12px;text-align:left;color:var(--text-3);font-weight:600;white-space:nowrap">№</th>' +
        '<th style="padding:8px 12px;text-align:left;color:var(--text-3);font-weight:600">Заявка / Адрес</th>' +
        '<th style="padding:8px 12px;text-align:left;color:var(--text-3);font-weight:600">Подрядчик</th>' +
        '<th style="padding:8px 12px;text-align:right;color:var(--text-3);font-weight:600">Км</th>' +
        '<th style="padding:8px 12px;text-align:right;color:var(--text-3);font-weight:600">Портов</th>' +
        '<th style="padding:8px 12px;text-align:right;color:var(--text-3);font-weight:600">₽/порт</th>' +
        '<th style="padding:8px 12px;text-align:right;color:var(--text-3);font-weight:600">Удалёнка</th>' +
        '<th style="padding:8px 12px;text-align:right;color:var(--text-3);font-weight:600">Работа</th>' +
        '<th style="padding:8px 12px;text-align:right;color:var(--text-3);font-weight:600">Допы</th>' +
        '<th style="padding:8px 12px;text-align:right;color:var(--text-3);font-weight:600;color:var(--orange)">Оплата ПО</th>' +
        '<th style="padding:8px 12px;text-align:right;color:var(--text-3);font-weight:600">ТМЦ</th>' +
        '<th style="padding:8px 12px;text-align:right;color:var(--text-3);font-weight:600;color:var(--blue)">Платит Сбер</th>' +
        '<th style="padding:8px 12px;text-align:center;color:var(--text-3);font-weight:600"></th>' +
      '</tr></thead><tbody>';

  pts.forEach(function(p, i) {
    var f = calcMarchFinance(p);
    var task = S.tasks.find(function(t){ return t.id === p.taskId; });
    var addrDisplay = p.address || (task ? task.address : '') || '—';
    var taskLink = task
      ? '<a href="#" onclick="event.preventDefault();S.cardId=\'' + p.taskId + '\';S.page=\'card\';renderNav();renderApp();" style="color:var(--orange);font-weight:600;text-decoration:none">' + escHtml(p.taskId) + '</a>'
      : '<span style="color:var(--text-3)">' + escHtml(p.taskId || '—') + '</span>';
    html +=
      '<tr style="border-bottom:1px solid var(--border);' + (i%2?'background:var(--bg)':'') + '">' +
        '<td style="padding:8px 12px;color:var(--text-3)">' + (i+1) + '</td>' +
        '<td style="padding:8px 12px">' +
          '<div>' + taskLink + '</div>' +
          '<div class="t3" style="font-size:.75rem;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escHtml(addrDisplay) + '">' + escHtml(addrDisplay) + '</div>' +
        '</td>' +
        '<td style="padding:8px 12px;font-size:.8rem;color:var(--text-2);white-space:nowrap">' + escHtml(p.contractor || '—') + '</td>' +
        '<td style="padding:8px 12px;text-align:right">' + (p.km || 0) + '</td>' +
        '<td style="padding:8px 12px;text-align:right">' + (p.ports || 0) + '</td>' +
        '<td style="padding:8px 12px;text-align:right">' + fmtN(p.pricePerPort || 0) + '</td>' +
        '<td style="padding:8px 12px;text-align:right">' + fmtMoney(f.remote) + '</td>' +
        '<td style="padding:8px 12px;text-align:right">' + fmtMoney(f.work) + '</td>' +
        '<td style="padding:8px 12px;text-align:right">' + fmtMoney(f.extras) + '</td>' +
        '<td style="padding:8px 12px;text-align:right;font-weight:700;color:var(--orange)">' + fmtMoney(f.pay) + '</td>' +
        '<td style="padding:8px 12px;text-align:right">' + fmtMoney(f.tmc) + '</td>' +
        '<td style="padding:8px 12px;text-align:right;font-weight:700;color:var(--blue)">' + fmtMoney(f.sber) + '</td>' +
        '<td style="padding:8px 12px;text-align:center;white-space:nowrap">' +
          '<button class="btn btn-sm btn-ghost" onclick="editPoint(\'' + march.id + '\',' + i + ')" title="Редактировать">✏️</button> ' +
          '<button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="deletePoint(\'' + march.id + '\',' + i + ')" title="Удалить">✕</button>' +
        '</td>' +
      '</tr>';
  });

  // Итоговая строка таблицы
  if (pts.length) {
    html += '<tr style="background:var(--orange-bg);font-weight:700;border-top:2px solid var(--border)">' +
      '<td colspan="2" style="padding:10px 12px">Итого</td>' +
      '<td style="padding:10px 12px;text-align:left;color:var(--text-3)"></td>' +
      '<td style="padding:10px 12px;text-align:right">' + fmtN(tot.km) + '</td>' +
      '<td style="padding:10px 12px;text-align:right">' + fmtN(tot.ports) + '</td>' +
      '<td></td>' +
      '<td style="padding:10px 12px;text-align:right">' + fmtMoney(tot.remote) + '</td>' +
      '<td style="padding:10px 12px;text-align:right">' + fmtMoney(tot.work) + '</td>' +
      '<td style="padding:10px 12px;text-align:right">' + fmtMoney(tot.extras) + '</td>' +
      '<td style="padding:10px 12px;text-align:right;color:var(--orange)">' + fmtMoney(tot.pay) + '</td>' +
      '<td style="padding:10px 12px;text-align:right">' + fmtMoney(tot.tmc) + '</td>' +
      '<td style="padding:10px 12px;text-align:right;color:var(--blue)">' + fmtMoney(tot.sber) + '</td>' +
      '<td></td>' +
    '</tr>';
  }

  html += '</tbody></table></div></div>';

  // Запуск карты после рендера
  if (pts.length) {
    setTimeout(function(){ renderMarchMap(march, mapId); }, 200);
  }

  return html;
}

function statBox(label, val, color) {
  return '<div class="card stat">' +
    '<div class="stat-lbl">' + label + '</div>' +
    '<div class="stat-val" style="font-size:1.35rem' + (color ? ';color:' + color : '') + '">' + val + '</div>' +
  '</div>';
}


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
      var task = S.tasks.find(function(t){ return t.id === p.taskId; });

      // Строим запросы от точного к широкому — с регионом для однозначности
      var addr   = (p.address || '').trim();
      var region = task ? (task.region || '') : '';
      var queries = [];
      if (addr) {
        if (region) queries.push('Россия, ' + region + ', ' + addr);
        queries.push('Россия, ' + addr);
      }
      if (region) queries.push('Россия, ' + region);
      queries = queries.filter(function(q, qi, arr){ return arr.indexOf(q) === qi; });

      if (!queries.length) { setTimeout(next, 300); return; }

      function tryQuery(qi) {
        if (qi >= queries.length) { setTimeout(next, 300); return; }
        geocodeOne(queries[qi], function(coord) {
          if (coord) {
            results[idx] = coord;
            setTimeout(next, 300); // задержка между запросами — Nominatim rate limit 1 req/sec
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
    el.style.display = 'block';

    // Если уже есть сохранённые координаты — используем их, иначе геокодируем
    var hasSaved = pts.every(function(p){ return p.lat && p.lng; });

    function drawMap(coords) {
      var validCoords = coords.filter(Boolean);
      if (!validCoords.length) {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;text-align:center;padding:1rem">Не удалось определить координаты точек.<br>Проверьте адреса.</div>';
        return;
      }

      var map = L.map(el);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM', maxZoom: 19 }).addTo(map);

      var latLngs = [];
      var validPoints = []; // только точки с координатами

      coords.forEach(function(c, i) {
        if (!c) return;
        var p = pts[i];
        var task = S.tasks.find(function(t){ return t.id === p.taskId; });
        var addrDisplay = p.address || (task ? task.address : '') || '—';
        var ll = [c.lat, c.lng];
        latLngs.push(ll);
        validPoints.push({ ll: ll, c: c, p: p, i: i, addrDisplay: addrDisplay });

        var icon = L.divIcon({
          className: '',
          html: '<div style="background:var(--orange);color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.78rem;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff">' + (i+1) + '</div>',
          iconSize: [28, 28], iconAnchor: [14, 14]
        });
        var popup = '<div style="font-size:.8rem;min-width:180px">' +
          '<div style="font-weight:700;margin-bottom:3px">' + escHtml(p.taskId || ('Точка ' + (i+1))) + '</div>' +
          '<div style="color:#666;margin-bottom:5px;font-size:.75rem">' + escHtml(addrDisplay.slice(0, 90)) + '</div>' +
          '<div style="display:flex;gap:.75rem">' +
            '<span>🛣️ <strong>' + (p.km || 0) + '</strong> км</span>' +
            '<span>🔌 <strong>' + (p.ports || 0) + '</strong> пор.</span>' +
          '</div>' +
          '<div style="color:var(--orange);font-weight:600;margin-top:4px">Оплата ПО: ' + fmtMoney(calcMarchFinance(p).pay) + '</div>' +
        '</div>';
        L.marker(ll, { icon: icon }).addTo(map).bindPopup(popup);
      });

      map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40] });

      // Сохраняем координаты чтобы не геокодировать повторно
      var updated = false;
      coords.forEach(function(c, i) {
        if (c && (!pts[i].lat || !pts[i].lng)) { pts[i].lat = c.lat; pts[i].lng = c.lng; updated = true; }
      });
      if (updated) {
        api('/marches/' + march.id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ points: pts }) });
      }

      // Маршрут по дорогам через OSRM
      if (latLngs.length < 2) return;

      // Собираем цепочку координат: база (если есть) + все точки
      function buildOsrmChain(baseLl) {
        var chain = baseLl ? [baseLl].concat(latLngs) : latLngs;
        // OSRM формат: lng,lat;lng,lat;...
        return chain.map(function(ll){ return ll[1] + ',' + ll[0]; }).join(';');
      }

      function drawRoute(coordsStr) {
        fetch('/api/route?coords=' + encodeURIComponent(coordsStr) + '&_t=' + Date.now())
          .then(function(r){ return r.json(); })
          .then(function(d) {
            if (!d.geometry) {
              // Fallback — пунктирная прямая если OSRM не ответил
              L.polyline(latLngs, { color: '#FF6200', weight: 3, opacity: 0.6, dashArray: '8 4' }).addTo(map);
              return;
            }
            // GeoJSON LineString от OSRM — координаты в формате [lng, lat]
            var routeLatLngs = d.geometry.coordinates.map(function(c){ return [c[1], c[0]]; });
            L.polyline(routeLatLngs, { color: '#FF6200', weight: 4, opacity: 0.85 }).addTo(map);
          })
          .catch(function() {
            L.polyline(latLngs, { color: '#FF6200', weight: 3, opacity: 0.6, dashArray: '8 4' }).addTo(map);
          });
      }

      if (march.baseCity && march.baseCity.trim()) {
        // Геокодируем базу и добавляем её как стартовую точку маршрута
        fetch('/api/geocode?q=' + encodeURIComponent('Россия, ' + march.baseCity) + '&_t=' + Date.now())
          .then(function(r){ return r.json(); })
          .then(function(d) {
            if (d && d[0]) {
              var baseLl = [parseFloat(d[0].lat), parseFloat(d[0].lon)];
              // Маркер базы
              var baseIcon = L.divIcon({
                className: '',
                html: '<div style="background:#2563eb;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:1rem;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff">🏠</div>',
                iconSize: [28, 28], iconAnchor: [14, 14]
              });
              L.marker(baseLl, { icon: baseIcon }).addTo(map)
                .bindPopup('<div style="font-size:.8rem"><strong>База: ' + escHtml(march.baseCity) + '</strong></div>');
              drawRoute(buildOsrmChain(baseLl));
            } else {
              drawRoute(buildOsrmChain(null));
            }
          })
          .catch(function(){ drawRoute(buildOsrmChain(null)); });
      } else {
        drawRoute(buildOsrmChain(null));
      }
    }

    if (hasSaved) {
      drawMap(pts.map(function(p){ return { lat: p.lat, lng: p.lng }; }));
    } else {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;text-align:center;padding:1rem">' +
        '<div><div style="font-size:1.4rem;margin-bottom:.5rem">🔍</div>' +
        'Определяем адреса на карте…<br><span style="font-size:.75rem">~' + pts.length + ' запросов, по 1 в секунду</span></div></div>';
      geocodeAll(pts, drawMap);
    }
  });
}

// ─── Диалоги маршрутов ───────────────────────────────────────────────────────
// ─── Универсальная модалка ────────────────────────────────────────────────────

function openCreateMarch() {
  showModal('🚗 Новый маршрут', [
    { key: 'name',     label: 'Название', placeholder: 'Шилка, Забайкальск…', required: true },
    { key: 'baseCity', label: 'Базовый город', placeholder: 'Чита, Новосибирск…' },
    { key: 'kmRate',   label: 'Тариф за км (₽/км)', type: 'number', value: 70, hint: 'Удалёнка = км × 2 × тариф' },
  ], function(d) {
    api('/marches', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name: d.name, baseCity: d.baseCity, kmRate: parseFloat(d.kmRate) || 70 })
    }).then(function(m) {
      if (!m || !m.id) { alert('Ошибка создания маршрута'); return; }
      S.marches.push(m);
      S.marchId = m.id;
      S.page = 'march-detail';
      renderNav(); renderApp();
    }).catch(function(e){ alert('Ошибка: ' + e.message); });
  });
}

function deleteMarch(id) {
  showConfirm('Удалить маршрут? Это действие нельзя отменить.', function() {
    api('/marches/' + id, { method: 'DELETE' }).then(function() {
      S.marches = S.marches.filter(function(m){ return m.id !== id; });
      S.page = 'marches';
      renderNav(); renderApp();
    });
  });
}

function editMarchMeta(id) {
  var march = S.marches.find(function(m){ return m.id === id; });
  if (!march) return;
  showModal('✏️ Настройки маршрута', [
    { key: 'name',     label: 'Название', value: march.name, required: true },
    { key: 'baseCity', label: 'Базовый город', value: march.baseCity || '' },
    { key: 'kmRate',   label: 'Тариф за км (₽/км)', type: 'number', value: march.kmRate || 70 },
  ], function(d) {
    var upd = { name: d.name, baseCity: d.baseCity, kmRate: parseFloat(d.kmRate) || 70 };
    api('/marches/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(upd) })
      .then(function() { Object.assign(march, upd); renderApp(); });
  });
}

function openAddPoint(marchId) {
  var march = S.marches.find(function(m){ return m.id === marchId; });
  if (!march) return;

  function autofillFromTask(taskId) {
    var task = S.tasks.find(function(t){ return t.id === taskId.trim(); });
    if (!task) return;

    var addrEl  = document.getElementById('mf_address');
    var portsEl = document.getElementById('mf_ports');
    var pppEl   = document.getElementById('mf_pricePerPort');
    var ctrEl   = document.getElementById('mf_contractor');
    var kmEl    = document.getElementById('mf_km');

    if (addrEl  && !addrEl.value)  addrEl.value  = task.address || '';
    if (portsEl && !portsEl.value) {
      var p = task.fact || task.inOrder || 0;
      portsEl.value = p;
      if (pppEl) pppEl.value = p >= 3 ? 3750 : p === 2 ? 4250 : 5000;
    }
    if (ctrEl && !ctrEl.value) ctrEl.value = task.assignee || task.contractor || '';

    // Подсветка
    [addrEl, portsEl, pppEl, ctrEl].forEach(function(el) {
      if (el) { el.style.background = '#fffbe6'; setTimeout(function(){ el.style.background = ''; }, 1200); }
    });

    // Авторасстояние через OSRM если задан базовый город
    if (!march.baseCity || !march.baseCity.trim()) return;
    if (kmEl) { kmEl.disabled = true; }
    var kmStatus = document.getElementById('mf_km_status');
    if (kmStatus) kmStatus.textContent = 'считаем…';

    // Геокодируем базу и адрес, потом считаем маршрут через OSRM
    var baseQ = 'Россия, ' + march.baseCity;
    var rawAddr = (task.address || '').trim();

    // Очищаем адрес: убираем сокращения, этажи, офисы — они мешают Nominatim
    function cleanForGeo(s) {
      return s
        .replace(/\bрп\b/gi, 'посёлок')
        .replace(/\bпгт\b/gi, 'посёлок')
        .replace(/\bс\./gi, '')
        .replace(/\bд\./gi, '')
        .replace(/\bул\./gi, 'улица')
        .replace(/\bпр-кт\b/gi, 'проспект')
        .replace(/,?\s*\d+-й\s+этаж.*$/i, '')   // убираем этаж и всё после
        .replace(/,?\s*оф\.?\s*\d+.*$/i, '')    // убираем офис
        .replace(/,?\s*кв\.?\s*\d+.*$/i, '')    // убираем квартиру
        .replace(/\s+/g, ' ').trim();
    }

    // Несколько вариантов запроса — от точного к упрощённому
    function tryGeocode(queries) {
      if (!queries.length) return Promise.resolve(null);
      var q = queries[0];
      return fetch('/api/geocode?q=' + encodeURIComponent(q) + '&_t=' + Date.now())
        .then(function(r){ return r.json(); })
        .then(function(d){
          if (d && d[0]) {
            console.log('[march] geocode OK:', q, '->', d[0].display_name);
            return d[0];
          }
          console.log('[march] geocode miss:', q);
          return tryGeocode(queries.slice(1));
        });
    }

    var cleaned = cleanForGeo(rawAddr);
    // Берём только улицу+номер дома (последние 2 части через запятую)
    var parts   = cleaned.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    var short   = parts.slice(-2).join(', ');
    var addrVariants = [
      'Россия, ' + cleaned,
      'Россия, ' + rawAddr,
      short ? 'Россия, ' + short : null,
      parts[0] ? 'Россия, ' + parts[0] : null,
    ].filter(Boolean);

    Promise.all([
      tryGeocode(['Россия, ' + march.baseCity]),
      tryGeocode(addrVariants)
    ]).then(function(results) {
      var base = results[0];
      var dest = results[1];
      if (!base || !dest) {
        if (kmEl) kmEl.disabled = false;
        if (kmStatus) kmStatus.textContent = '⚠ ' + (!base ? 'база не найдена' : 'адрес не найден — введите км вручную');
        return;
      }
      var coords = base.lon + ',' + base.lat + ';' + dest.lon + ',' + dest.lat;
      return fetch('/api/route?coords=' + encodeURIComponent(coords) + '&_t=' + Date.now())
        .then(function(r){ return r.json(); })
        .then(function(d) {
          if (kmEl) {
            kmEl.disabled = false;
            if (d && d.distance_km) {
              kmEl.value = d.distance_km;
              kmEl.style.background = '#e8f5e9';
              setTimeout(function(){ kmEl.style.background = ''; }, 1500);
              if (kmStatus) kmStatus.textContent = '✓ ' + d.distance_km + ' км (' + (d.duration_min || '?') + ' мин)';
            } else {
              if (kmStatus) kmStatus.textContent = '⚠ маршрут не найден — введите км вручную';
            }
          }
        });
    }).catch(function(e) {
      if (kmEl) kmEl.disabled = false;
      if (kmStatus) kmStatus.textContent = 'ошибка соединения — введите км вручную';
      console.error('[march] geocode error:', e);
    });
  }

  showModal('➕ Добавить точку', [
    { 
      key: 'taskId',       
      label: 'ID заявки', 
      placeholder: 'ББ-5376-03 (необязательно)', 
      hint: '💡 Введите номер заявки или адрес для быстрого выбора точки маршрута', 
      onInput: autofillFromTask,
      autocomplete: {
        minChars: 2,
        search: function(q) {
          var low = q.toLowerCase();
          var matched = (S.tasks || []).filter(function(t) {
            return (t.id && t.id.toLowerCase().includes(low)) ||
                   (t.address && t.address.toLowerCase().includes(low)) ||
                   (t.customer && t.customer.toLowerCase().includes(low));
          }).slice(0, 15);
          return Promise.resolve(matched);
        },
        renderItem: function(t) {
          return `
            <div style="font-weight:600; font-size:.85rem; color:var(--text)">${escHtml(t.id)} · ${escHtml(t.address || 'Без адреса')}</div>
            <div style="font-size:.75rem; color:var(--text-3); margin-top:2px">
              ${escHtml(t.customer || '')} · Портов: ${t.fact || t.inOrder || 0}
            </div>
          `;
        },
        getValue: function(t) { return t.id; },
        badgeText: function(t) {
          return `✓ Выбрана заявка: <b>${escHtml(t.id)}</b> (${escHtml(t.address || '')})`;
        },
        onSelect: function(t, inputs, modal) {
          autofillFromTask(t.id);
        }
      }
    },
    { key: 'address',      label: 'Адрес объекта', placeholder: 'г. Шилка, ул. Ленина, 5', required: true },
    { key: 'km',           label: 'Расстояние от базы (км)', type: 'number', value: '', hint: '', hintId: 'mf_km_status' },
    { key: 'ports',        label: 'Кол-во портов', type: 'number', value: '' },
    { key: 'pricePerPort', label: 'Цена за порт (₽)', type: 'number', value: 3750, hint: 'Авто: ≥3 пор. → 3750, 2 → 4250, 1 → 5000' },
    { key: 'extras',       label: 'Допы (₽)', type: 'number', value: 0 },
    { key: 'tmc',          label: 'ТМЦ — материалы (₽)', type: 'number', value: 0 },
    { key: 'contractor',   label: 'Подрядчик', placeholder: 'Необязательно' },
  ], function(d) {
    var taskId = (d.taskId || '').trim();
    var task   = taskId ? S.tasks.find(function(t){ return t.id === taskId; }) : null;
    var ports  = parseInt(d.ports) || (task ? (task.fact || task.inOrder || 0) : 0);
    var ppp    = parseFloat(d.pricePerPort) || (ports >= 3 ? 3750 : ports === 2 ? 4250 : 5000);

    var point = {
      taskId:       taskId || null,
      address:      d.address || (task ? task.address : ''),
      km:           parseFloat(d.km) || 0,
      ports:        ports,
      pricePerPort: ppp,
      kmRate:       march.kmRate || 70,
      extras:       parseFloat(d.extras) || 0,
      tmc:          parseFloat(d.tmc) || 0,
      contractor:   d.contractor || (task ? (task.assignee || task.contractor || '') : ''),
      lat: null, lng: null
    };

    var pts = (march.points || []).slice();
    pts.push(point);
    api('/marches/' + marchId, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ points: pts }) })
      .then(function() { march.points = pts; renderApp(); })
      .catch(function(e){ alert('Ошибка: ' + e.message); });
  });
}

function editPoint(marchId, idx) {
  var march = S.marches.find(function(m){ return m.id === marchId; });
  if (!march) return;
  var pts = (march.points || []).slice();
  var p = pts[idx];
  if (!p) return;

  showModal('✏️ Редактировать точку', [
    { key: 'address',      label: 'Адрес', value: p.address || '', required: true },
    { key: 'km',           label: 'Км от базы', type: 'number', value: p.km || 0 },
    { key: 'ports',        label: 'Портов', type: 'number', value: p.ports || 0 },
    { key: 'pricePerPort', label: 'Цена за порт (₽)', type: 'number', value: p.pricePerPort || 3750 },
    { key: 'extras',       label: 'Допы (₽)', type: 'number', value: p.extras || 0 },
    { key: 'tmc',          label: 'ТМЦ (₽)', type: 'number', value: p.tmc || 0 },
    { key: 'contractor',   label: 'Подрядчик', value: p.contractor || '' },
  ], function(d) {
    pts[idx] = Object.assign({}, p, {
      address: d.address, km: parseFloat(d.km)||0, ports: parseInt(d.ports)||0,
      pricePerPort: parseFloat(d.pricePerPort)||3750,
      extras: parseFloat(d.extras)||0, tmc: parseFloat(d.tmc)||0,
      contractor: d.contractor, lat: null, lng: null
    });
    api('/marches/' + marchId, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ points: pts }) })
      .then(function() { march.points = pts; renderApp(); });
  });
}

function toggleContractorBreakdown() {
  var el = document.getElementById('contractorBreakdown');
  var btn = document.getElementById('ctrToggleBtn');
  if (!el) return;
  var hidden = el.style.display === 'none';
  el.style.display = hidden ? 'block' : 'none';
  if (btn) btn.textContent = hidden ? 'Скрыть разбивку ▴' : 'По подрядчикам ▾';
}

function deletePoint(marchId, idx) {
  showConfirm('Удалить эту точку из маршрута?', function() {
    var march = S.marches.find(function(m){ return m.id === marchId; });
    if (!march) return;
    var pts = (march.points || []).slice();
    pts.splice(idx, 1);
    api('/marches/' + marchId, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ points: pts }) })
      .then(function() { march.points = pts; renderApp(); });
  });
}