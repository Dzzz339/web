function exportDoc(type, id, contractorName) {
  var url = '/api/export/' + type + '/' + encodeURIComponent(id);
  if (contractorName) {
    url += '?contractorName=' + encodeURIComponent(contractorName);
  }
  fetch(url, {
    headers: { 'Authorization': 'Bearer ' + S.token }
  })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e){ throw new Error(e.error); });
      return r.blob();
    })
    .then(function(blob) {
      var suffix = type === 'invoice' ? '_Счёт' : type === 'act' ? '_Акт' : (contractorName ? '_Приложение_2_' + contractorName.replace(/[/\\?%*:|"<>]/g, '_') : '_Приложение_2');
      var bUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = bUrl;
      a.download = id.replace(/\//g, '-') + suffix + '.xlsx';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(bUrl);
    })
    .catch(function(e) { alert('Ошибка экспорта: ' + e.message); });
}

function exportTask(id) {
  fetch('/api/export/' + encodeURIComponent(id), {
    headers: { 'Authorization': 'Bearer ' + S.token } // ДОБАВИЛИ КЛЮЧ
  })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e){ throw new Error(e.error); });
      return r.blob();
    })
    .then(function(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = id.replace(/\//g, '-') + '_Приложение_2.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    })
    .catch(function(e) { alert('Ошибка экспорта: ' + e.message); });
}


function setCardTab(tabName) {
  S.cardTab = tabName;
  var btns = document.querySelectorAll('.card-tab-btn');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].getAttribute('data-tab') === tabName) {
      btns[i].classList.add('active');
    } else {
      btns[i].classList.remove('active');
    }
  }
  var panes = document.querySelectorAll('.card-tab-pane');
  for (var j = 0; j < panes.length; j++) {
    if (panes[j].id === 'cardTabPane-' + tabName) {
      panes[j].style.display = 'block';
    } else {
      panes[j].style.display = 'none';
    }
  }
  if (tabName === 'main' && window._activeLeafletMap) {
    setTimeout(function(){ window._activeLeafletMap.invalidateSize(); }, 60);
  }
}
window.setCardTab = setCardTab;

function openCard(id) {
  S.cardId = id;
  if (!S.cardTab) S.cardTab = 'main';
  S.cardDraft = {};
  S.cardConfirmOpen = false;
  S.page = 'card';
  renderNav();
  renderApp();
  window.scrollTo(0,0);
  refreshAttachmentsList(id);
  refreshPortsList(id);
  refreshRemarksList(id);
  refreshTaskItemsList(id);
}

function pageCard() {
  var t = S.tasks.find(function(x){ return String(x.id) === String(S.cardId); });
  if (!t) return '<div class="card p"><p class="t3">Заявка не найдена.</p><button class="btn" onclick="go(\'tasks\')">← Назад</button></div>';

  var statusOpts = [
    {v: 'pending',   l: 'Не распределено'},
    {v: 'progress',  l: 'В работе'},
    {v: 'done',      l: 'Готово'},
    {v: 'paid',      l: 'Оплачен'},
    {v: 'cancelled', l: 'Отменен'}
  ].map(function(opt) {
    var curStatus = Object.prototype.hasOwnProperty.call(S.cardDraft,'status') ? S.cardDraft.status : t.status;
    return '<option value="' + opt.v + '"' + (curStatus === opt.v ? ' selected' : '') + '>' + opt.l + '</option>';
  }).join('');
  var prioOpts = ['high','medium','low'].map(function(v){
    var labels = {high:'🔴 Высокий',medium:'🟡 Средний',low:'🟢 Низкий'};
    var curPriority = Object.prototype.hasOwnProperty.call(S.cardDraft,'priority') ? S.cardDraft.priority : t.priority;
    return '<option value="'+v+'"'+(curPriority===v?' selected':'')+'>'+labels[v]+'</option>';
  }).join('');

  var assigneeOpts = '<option value="">— (Не назначен) —</option>' + (S.users || []).map(function(u) {
    var curAssignee = Object.prototype.hasOwnProperty.call(S.cardDraft,'assignee') ? S.cardDraft.assignee : t.assignee;
    if (!u.full_name) return '';
    return '<option value="' + u.full_name + '"' + (curAssignee === u.full_name ? ' selected' : '') + '>#' + u.id + ' — ' + u.full_name + '</option>';
  }).join('');

  var contractorOpts = '<option value="">— (Не указан) —</option>' + (S.contractors || []).map(function(c) {
    var curContractor = Object.prototype.hasOwnProperty.call(S.cardDraft,'contractor') ? S.cardDraft.contractor : (t.contractor||'');
    if (!c.name_short) return '';
    return '<option value="' + c.name_short + '"' + (curContractor.trim() === c.name_short ? ' selected' : '') + '>' + c.name_short + '</option>';
  }).join('');

  if (t.contractor && !(S.contractors || []).some(c => c.name_short === t.contractor.trim())) {
    contractorOpts += '<option value="' + t.contractor + '" selected>⚠️ ' + t.contractor + ' (из Excel)</option>';
  }

  function field(lbl, key, type) {
    var isDirty = Object.prototype.hasOwnProperty.call(S.cardDraft, key);
    var val = isDirty ? S.cardDraft[key] : (t[key] || '');
    var inp = '';
    if (key === 'status') {
      inp = '<div style="display:flex;align-items:center;gap:8px">' +
        stBadge(val) +
        '<span class="t3" style="font-size:.72rem">🔒 Управляется регламентом шагов</span>' +
      '</div>';
    }
    else if (key === 'stage') {
      var stageNamesRu = { request: '1. Заявка', survey: '2. Обследование', install: '3. Монтаж', control: '4. Контроль', acceptance: '5. Приёмка', payment: '6. Оплата' };
      inp = '<div style="display:flex;align-items:center;gap:8px">' +
        '<span class="badge b-blue" style="font-size:.76rem">' + (stageNamesRu[val] || val || '—') + '</span>' +
        '<span class="t3" style="font-size:.72rem">🔒 Синхронизируется автоматически</span>' +
      '</div>';
    }
    else if (key === 'stageNum') {
      inp = '<div style="display:flex;align-items:center;gap:8px">' +
        idStageBadge(val) +
        '<span class="t3" style="font-size:.72rem">🔒 Переход кнопкой «Шаг» выше</span>' +
      '</div>';
    }
    else if (key === 'priority') inp = '<select name="'+key+'" data-key="'+key+'">'+prioOpts+'</select>';
    else if (key === 'assignee' && S.user.role === 'admin') inp = '<select name="'+key+'" data-key="'+key+'">' + assigneeOpts + '</select>';
    else if (key === 'contractor' && S.user.role === 'admin') inp = '<select name="'+key+'" data-key="'+key+'" style="width:100%">' + contractorOpts + '</select>';
    else if (type === 'textarea') inp = '<textarea name="'+key+'" data-key="'+key+'">'+val+'</textarea>';
    else if (type === 'checkbox') inp = '<input type="checkbox" name="'+key+'" data-key="'+key+'"'+(val ? ' checked' : '')+'>';
    else inp = '<input type="'+(type||'text')+'" name="'+key+'" data-key="'+key+'" value="'+String(val).replace(/"/g,'&quot;')+'">';
    var dirtyMark = isDirty ? ' <span class="badge b-orange" style="font-size:10px;padding:1px 5px">изменено</span>' : '';
    return '<div class="field-row"><div class="field-lbl">'+lbl+dirtyMark+'</div><div class="field-val">'+inp+'</div></div>';
  }

  // История изменений
  var hist = (t._history || []).slice().reverse();
  var histHtml = hist.length ? hist.map(function(h){
  var authorHtml = h.author ? ' <span class="badge b-gray" style="font-size:10px;padding:1px 5px;margin-left:5px">' + h.author + '</span>' : '';
  return '<div class="hist-item">' + h.date + authorHtml + '<br><span class="t3">' + h.field + ':</span> <span style="text-decoration:line-through;color:var(--red);opacity:0.8">' + (h.old||'—') + '</span> &rarr; <b>' + (h.new||'—') + '</b></div>';
  }).join('') : '<div class="t3" style="font-size:.78rem;padding:.5rem 0">Изменений не было</div>';
  // Карта — Leaflet + Nominatim с умным геокодированием
  var mapRegion = (t.region||'').trim();
  var mapAddress = (t.address||'').trim();
  var mapFullAddr = (mapRegion ? mapRegion + ', ' : '') + mapAddress;

  // Очищаем адрес: убираем сокращения типа "с.", "ул.", "пгт" для лучшего поиска
  function cleanAddr(s) {
    return s
      .replace(/\bс\.\s*/g,'').replace(/\bпгт\.?\s*/g,'').replace(/\bул\.\s*/g,'')
      .replace(/\bд\.\s*/g,'').replace(/\bпр-кт\s*/g,'').replace(/\bпр\.\s*/g,'')
      .replace(/\bпер\.\s*/g,'').replace(/\bпос\.\s*/g,'')
      .trim();
  }

  // Строим умные варианты запросов по очереди (от точного к широкому)
  var addrParts = mapAddress.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  var lastParts = addrParts.slice(-3).join(', ');   // последние 3 части (улица, номер)
  var cityParts = addrParts.slice(-2).join(', ');   // последние 2 части

  var mapQueries = [
    // 1. Самый точный поиск: Страна + Регион + Полный адрес
    'Россия, ' + mapRegion + ', ' + cleanAddr(mapAddress),           
    
    // 2. Если полный адрес сложный, ищем: Страна + Регион + Улица/Дом
    'Россия, ' + mapRegion + ', ' + cleanAddr(lastParts),            
    
    // 3. Запасной вариант (если в Excel регион написан с ошибкой): просто адрес
    'Россия, ' + cleanAddr(mapAddress),                              
    
    // 4. Крайний случай: если ничего не нашли, просто ткнуть в центр региона
    'Россия, ' + mapRegion                                           
  ].filter(function(q, i, arr){ return arr.indexOf(q) === i; });

  var mapId = 'leafmap' + Date.now();
  var dgisUrl  = 'https://2gis.ru/search/' + encodeURIComponent('Россия, ' + mapFullAddr);
  var yandexUrl = 'https://yandex.ru/maps/?text=' + encodeURIComponent('Россия, ' + mapFullAddr);

  // Кнопки карт — показываются ВСЕГДА под картой
  var mapNavBtns = '<div style="display:flex;gap:.5rem;margin-top:.6rem;flex-wrap:wrap">' +
    '<a href="' + dgisUrl + '" target="_blank" class="btn btn-sm" style="background:#3069b0;gap:5px">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="10" r="4"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg>' +
      '2ГИС' +
    '</a>' +
    '<a href="' + yandexUrl + '" target="_blank" class="btn btn-sm" style="background:#fc3f1d;gap:5px">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="10" r="4"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg>' +
      'Яндекс.Карты' +
    '</a>' +
  '</div>';

  var mapHtml = '<div id="'+mapId+'" style="height:260px;border-radius:var(--radius);overflow:hidden;background:#f0f0f0;display:flex;align-items:center;justify-content:center;color:#888;font-size:.82rem">Загрузка карты…</div>' +
    mapNavBtns;

  setTimeout(function(){
    var el = document.getElementById(mapId);
    if (!el) return;

    function tryGeocode(queries, cb) {
      if (!queries.length) { cb(null); return; }
      var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru&accept-language=ru&q=' + encodeURIComponent(queries[0]);
      fetch(url)
        .then(function(r){ return r.json(); })
        .then(function(d){
          if (d && d[0]) cb(d[0], queries[0]);
          else tryGeocode(queries.slice(1), cb);
        })
        .catch(function(){ tryGeocode(queries.slice(1), cb); });
    }

    function renderLeaflet() {
      if (t.geoLat && t.geoLon) {
        var lat = parseFloat(t.geoLat), lng = parseFloat(t.geoLon);
        el.innerHTML = '';
        var map = L.map(el).setView([lat, lng], 16);
        window._activeLeafletMap = map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
        L.marker([lat, lng]).addTo(map).bindPopup(t.cleanAddress || t.address).openPopup();
        return;
      }
      tryGeocode(mapQueries, function(result, matchedQuery) {
        if (!result) {
          // Геокодирование не удалось — показываем заглушку, кнопки уже есть под картой
          el.style.background = '#f8f8f8';
          el.innerHTML = '<div style="text-align:center;padding:1.5rem 1rem">' +
            '<div style="font-size:1.6rem;margin-bottom:.5rem">🗺️</div>' +
            '<div style="color:#555;font-size:.82rem;margin-bottom:.3rem">Адрес не найден на карте</div>' +
            '<div style="color:#aaa;font-size:.72rem">Воспользуйтесь кнопками ниже для&nbsp;просмотра</div>' +
          '</div>';
          return;
        }
        var lat = parseFloat(result.lat), lng = parseFloat(result.lon);
        // Если нашли только регион (широкий результат) — используем зум поменьше
        var isApprox = result.type === 'administrative' || result.type === 'state' || result.class === 'boundary';
        var zoom = isApprox ? 11 : 15;
        el.innerHTML = '';
        el.style.display = 'block';
        var map = L.map(el).setView([lat, lng], zoom);
        window._activeLeafletMap = map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://osm.org/copyright">OSM</a>',
          maxZoom: 19
        }).addTo(map);
        var popup = isApprox
          ? '<div style="font-size:.78rem;color:#888">⚠️ Приблизительно<br>' + mapAddress + '</div>'
          : mapAddress;
        L.marker([lat, lng]).addTo(map).bindPopup(popup).openPopup();
      });
    }

    if (window.L) { renderLeaflet(); }
    else {
      var css = document.createElement('link'); css.rel='stylesheet'; css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
      var s = document.createElement('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = renderLeaflet; document.head.appendChild(s);
    }
  }, 150);

  var eid = t.id.replace(/'/g, "\\'");
  var stageLabel = {request:'\u0417\u0430\u044f\u0432\u043a\u0430',survey:'\u041e\u0431\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u0435',install:'\u041c\u043e\u043d\u0442\u0430\u0436',control:'\u041a\u043e\u043d\u0442\u0440\u043e\u043b\u044c',acceptance:'\u041f\u0440\u0438\u0451\u043c\u043a\u0430',payment:'\u041e\u043f\u043b\u0430\u0442\u0430'};
  var stageOpts = ['request','survey','install','control','acceptance','payment'].map(function(v){
    var curStage = Object.prototype.hasOwnProperty.call(S.cardDraft,'stage') ? S.cardDraft.stage : t.stage;
    return '<option value="'+v+'"'+(curStage===v?' selected':'')+'>'+stageLabel[v]+'</option>';
  }).join('');
  var docBtns =
    '<button class="btn btn-sm btn-ghost" onclick="openAccessLetterModal(\''+eid+'\')" title="Сформировать официальное письмо на допуск в Word (с паспортами монтажников)">📄 Допуск (.docx)</button>' +
    '<button class="btn btn-sm btn-ghost" onclick="exportDoc(\'app2\',\''+eid+'\')" title="\u041f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u21162">&#x2B07; \u041f\u0440\u0438\u043b. \u21162</button>' +
    '<button class="btn btn-sm btn-ghost" onclick="exportDoc(\'invoice\',\''+eid+'\')" title="\u0421\u0447\u0451\u0442">&#x1F4CB; \u0421\u0447\u0451\u0442</button>' +
    '<button class="btn btn-sm btn-ghost" onclick="exportDoc(\'act\',\''+eid+'\')" title="\u0410\u043a\u0442">&#x2714; \u0410\u043a\u0442</button>' +
    '<button class="btn btn-sm btn-ghost" onclick="window.print()" title="\u041f\u0435\u0447\u0430\u0442\u044c / PDF">&#x1F5A8; \u041f\u0435\u0447\u0430\u0442\u044c</button>';

  var cancelBtn = t.status === 'cancelled'
    ? '<span class="badge b-red" style="padding:6px 12px;font-weight:700">🚫 Заявка отменена' + (t.overdueReason ? ': ' + escHtml(t.overdueReason) : '') + '</span>'
    : '<button class="btn btn-sm btn-ghost" style="color:var(--red);border-color:rgba(239,68,68,0.3)" onclick="cancelTaskPrompt(\'' + eid + '\')" title="Отменить заявку с указанием причины">🚫 Отменить заявку</button>';

  var hdr = '<div class="card-hdr">' +
    '<button class="btn btn-sm btn-ghost" onclick="go(\'tasks\')">← Заявки</button>' +
    '<h1>'+t.id+'</h1>' +
    docBtns +
    cancelBtn +
  '</div>';

  var cancelledBanner = t.status === 'cancelled'
    ? '<div class="banner banner-warn" style="background:#fee2e2;border:1.5px solid #f87171;margin-bottom:1rem">' +
        '<div>' +
          '<div class="banner-title" style="color:#b91c1c;font-size:.95rem">🚫 Заявка отменена</div>' +
          '<div class="banner-body" style="color:#7f1d1d">Причина: <strong>' + escHtml(t.overdueReason || 'Причина не указана') + '</strong></div>' +
        '</div>' +
      '</div>'
    : '';

  var curStageNum = Number(t.stageNum != null ? t.stageNum : 0);
  if (curStageNum < 0) curStageNum = 0;
  if (curStageNum > 9) curStageNum = 9;
  var curStg = ID_STAGES[curStageNum] || ID_STAGES[0];
  var nextStepDef = curStageNum < 9 ? ID_STEPS[curStageNum] : null;

  var idStageHelp = [
    'Новая заявка поступила. Менеджер проверяет ТЗ, согласовывает дату и передает монтажникам.',
    'Монтаж на объекте начат. Исполнители выполняют прокладку и установку оборудования.',
    'Монтаж завершён. Менеджер собирает фотоотчёт и результаты замеров для передачи в проектный отдел.',
    'Материалы переданы в очередь ИД. Проектировщик берёт задачу в работу (ставится срок 3 рабочих дня).',
    'ИД в проектировании. Проектировщик подготавливает комплект исполнительной документации.',
    'Исполнительная документация готова. Отдел отправки проверяет альбом и направляет в банк Сбер.',
    'ИД на согласовании в Сбере. При наличии правок вносите замечания в карточку. Приёмка блокируется открытыми замечаниями.',
    'ИД успешно согласована и принята Сбером. Пакет документов передан на оплату.',
    'Заявка ожидает поступления оплаты от Заказчика.',
    'Заявка успешно завершена и полностью оплачена.'
  ];

  var isDueOverdue = t.stageDue && new Date(t.stageDue) < new Date();
  var dueStr = t.stageDue ? t.stageDue.slice(0, 10).split('-').reverse().join('.') : '';

  var stepperHtml = '';
  ID_STAGES.forEach(function(stg, idx) {
    var isCurrent = (idx === curStageNum);
    var isPassed = (idx < curStageNum);
    var stepBg = isCurrent ? 'var(--orange-bg)' : (isPassed ? 'var(--green-bg)' : '#f8fafc');
    var stepBorder = isCurrent ? 'var(--orange)' : (isPassed ? 'var(--green)' : 'var(--border)');
    var stepColor = isCurrent ? 'var(--orange-dark)' : (isPassed ? 'var(--green)' : 'var(--text-3)');
    var stepFontWeight = isCurrent ? '700' : '500';

    stepperHtml += '<div class="step ' + (isCurrent ? 'active' : (isPassed ? 'done' : '')) + '" style="flex:1;min-width:110px;padding:8px 6px;border-radius:8px;border:1.5px solid ' + stepBorder + ';background:' + stepBg + ';color:' + stepColor + ';text-align:center;transition:all .15s" title="' + stg.name + ' (' + stg.role + ')">' +
      '<div style="font-size:1.1rem;margin-bottom:2px">' + stg.icon + '</div>' +
      '<div style="font-size:.75rem;font-weight:' + stepFontWeight + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + idx + '. ' + stg.name + '</div>' +
      '<div style="font-size:.65rem;opacity:.8;margin-top:1px">' + stg.role + '</div>' +
      (isCurrent ? '<div style="font-size:.65rem;color:var(--orange);font-weight:700;margin-top:2px">● ТЕКУЩИЙ</div>' : '') +
      (isPassed ? '<div style="font-size:.65rem;color:var(--green);font-weight:600;margin-top:2px">✓ Пройден</div>' : '') +
    '</div>';

    if (idx < ID_STAGES.length - 1) {
      stepperHtml += '<div style="color:var(--text-3);font-size:.9rem;user-select:none;padding:0 1px">→</div>';
    }
  });

  var canStepNow = canUserStep(S.user, t);
  var canUndoNow = canUserUndo(S.user, t);

  // ─── 1. SMART ACTION CENTER ───
  var checklistHtml = '';
  var canAdvance = true;
  var advanceBlockReason = '';

  if (curStageNum === 0) {
    var hasCont = !!(t.contractor && t.contractor.trim());
    if (hasCont) {
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon ok">✓</span><span>Подрядчик назначен: <b>' + escHtml(t.contractor) + '</b></span></div>';
    } else {
      canAdvance = false;
      advanceBlockReason = 'Не назначен подрядчик на заявку';
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon fail">✕</span><span style="color:var(--red)">Подрядчик не назначен</span><span class="checklist-action-link" onclick="setCardTab(\'items\')">Назначить в спецификации →</span></div>';
    }
  } else if (curStageNum === 1) {
    var factVal = Number(t.fact) || 0;
    if (factVal > 0) {
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon ok">✓</span><span>Фактический объем подтвержден: <b>' + factVal + ' ед.</b></span></div>';
    } else {
      canAdvance = false;
      advanceBlockReason = 'Укажите фактический объем выполненных работ';
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon fail">✕</span><span style="color:var(--red)">Фактический объем не указан (Факт = 0)</span><span class="checklist-action-link" onclick="setCardTab(\'finance\')">Указать факт в финансах →</span></div>';
    }
  } else if (curStageNum === 2) {
    var hasMat = !!(t.materialsLink && t.materialsLink.trim());
    if (hasMat) {
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon ok">✓</span><span>Ссылка на материалы указана: <a href="' + escHtml(t.materialsLink) + '" target="_blank" rel="noopener noreferrer">Яндекс.Диск</a></span></div>';
    } else {
      canAdvance = false;
      advanceBlockReason = 'Загрузите фотоотчёт или укажите ссылку на Яндекс.Диск';
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon fail">✕</span><span style="color:var(--red)">Нет фотоотчёта или ссылки на Яндекс.Диск</span><span class="checklist-action-link" onclick="setCardTab(\'files\')">Загрузить во вкладке «Файлы» →</span></div>';
    }
  } else if (curStageNum === 4) {
    var hasId = !!(t.idLink && t.idLink.trim());
    if (hasId) {
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon ok">✓</span><span>Альбом ИД прикреплен: <a href="' + escHtml(t.idLink) + '" target="_blank" rel="noopener noreferrer">Открыть альбом</a></span></div>';
    } else {
      canAdvance = false;
      advanceBlockReason = 'Прикрепите ссылку на готовую ИД';
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon fail">✕</span><span style="color:var(--red)">Ссылка на готовую ИД не указана</span><span class="checklist-action-link" onclick="setCardTab(\'files\')">Прикрепить ссылку на ИД →</span></div>';
    }
  } else if (curStageNum === 6) {
    var openRem = Number(t.openRemarksCount || 0);
    if (openRem === 0) {
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon ok">✓</span><span>Все замечания Сбера устранены (открытых замечаний нет)</span></div>';
    } else {
      canAdvance = false;
      advanceBlockReason = 'Устраните открытые замечания Сбера (' + openRem + ' шт.)';
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon fail">✕</span><span style="color:var(--red)">Открыто замечаний Сбера: <b>' + openRem + ' шт.</b></span><span class="checklist-action-link" onclick="setCardTab(\'remarks\')">Устранить замечания →</span></div>';
    }
  } else {
    checklistHtml += '<div class="checklist-item"><span class="checklist-icon ok">✓</span><span>Условия этапа регламента соблюдены</span></div>';
  }

  var smartActionBox = '<div class="smart-action-box">' +
    '<div class="smart-action-header">' +
      '<div>' +
        '<div class="smart-action-title">Регламент жизненного цикла ИД • Стадия ' + curStageNum + ' из 9</div>' +
        '<div class="smart-action-stage">' +
          curStg.icon + ' ' + curStg.name +
          ' <span class="badge b-blue" style="font-size:.76rem;margin-left:6px">' + curStg.role + '</span>' +
          (t.stageDue ? '<span class="badge ' + (isDueOverdue ? 'b-red' : 'b-survey') + '" style="font-size:.74rem;margin-left:6px">⏳ Срок: ' + dueStr + (isDueOverdue ? ' (просрочен!)' : '') + '</span>' : '') +
          (Number(t.openRemarksCount || 0) > 0 ? '<span class="badge b-red" style="font-size:.74rem;margin-left:6px">⚠️ Замечания: ' + t.openRemarksCount + ' шт.</span>' : '') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<button type="button" class="btn btn-sm btn-ghost" style="border-color:var(--border);background:#fff" onclick="showStageHelpModal(' + curStageNum + ')" title="Справка по текущему этапу и правилам перехода">❓ Справка по шагу</button>' +
        (canUndoNow && curStageNum > 0 ? '<button class="btn btn-sm btn-ghost" onclick="undoIdStep(\'' + eid + '\')" title="Откатить этап назад">↩ Откатить</button>' : '') +
        (nextStepDef
          ? '<button class="smart-action-btn-primary ' + (canStepNow && canAdvance ? '' : 'disabled') + '" onclick="' + (canStepNow && canAdvance ? 'advanceIdStep(\'' + eid + '\')' : (advanceBlockReason ? 'alert(\'' + advanceBlockReason + '\')' : '')) + '" title="' + (advanceBlockReason || ('Роль: ' + nextStepDef.role)) + '">' +
              '▶ Шаг ' + (curStageNum + 1) + ': ' + nextStepDef.action +
            '</button>'
          : '<span class="badge b-green" style="padding:8px 14px;font-weight:800;font-size:.9rem">✅ Заявка полностью завершена</span>'
        ) +
      '</div>' +
    '</div>' +
    '<div class="smart-action-checklist">' +
      '<div style="font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:2px">Чек-лист готовности к переходу:</div>' +
      checklistHtml +
    '</div>' +
    '<details style="font-size:.78rem;color:var(--text-3);cursor:pointer">' +
      '<summary style="font-weight:600;color:var(--text-2);margin-bottom:6px">Показать полную цепочку этапов (10 стадий)</summary>' +
      '<div style="display:flex;gap:.25rem;align-items:center;overflow-x:auto;padding:8px 0">' + stepperHtml + '</div>' +
      '<div style="background:#fff;border-radius:6px;padding:.5rem .75rem;border-left:3px solid var(--orange);font-size:.78rem;color:var(--text-2);margin-top:4px">' +
        '<b>💡 Подсказка:</b> ' + (idStageHelp[curStageNum] || '') +
      '</div>' +
    '</details>' +
  '</div>';

  var curTab = S.cardTab || 'main';
  var openRemCount = Number(t.openRemarksCount || 0);
  var remarksTabBadge = openRemCount > 0
    ? ' <span class="card-tab-badge badge-red">' + openRemCount + '</span>'
    : '';

  var tabsNav = '<div class="card-tabs-nav">' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'main' ? 'active' : '') + '" data-tab="main" onclick="setCardTab(\'main\')">' +
      '📌 Главное и Объект' +
    '</button>' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'items' ? 'active' : '') + '" data-tab="items" onclick="setCardTab(\'items\')">' +
      '📦 Состав работ <span id="cardTabItemsBadge" class="card-tab-badge badge-gray"></span>' +
    '</button>' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'remarks' ? 'active' : '') + '" data-tab="remarks" onclick="setCardTab(\'remarks\')">' +
      '⚠️ Замечания Сбера' + remarksTabBadge +
    '</button>' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'files' ? 'active' : '') + '" data-tab="files" onclick="setCardTab(\'files\')">' +
      '📎 Документы и Фото' +
    '</button>' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'finance' ? 'active' : '') + '" data-tab="finance" onclick="setCardTab(\'finance\')">' +
      '💰 Финансы' +
    '</button>' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'history' ? 'active' : '') + '" data-tab="history" onclick="setCardTab(\'history\')">' +
      '🕒 История' +
    '</button>' +
  '</div>';

  var rawExtraRows = (function() {
    var knownKeys = [
      'регион','адрес','тип объекта','тип работ','тип работ ','тип',
      '№ госб','госб','№всп','№ всп','всп',
      'дата заявки','дата окончания работ','текущяя дата','текущая дата',
      'кол-во дней просрочки','дней просрочки','просрочка',
      'статус','статус ','приоритет','ид','ид ',
      'сумма договора','сумма договора ','стоимость за ед.','стоимость за ед',
      ' удаленность','удаленность','удалённость',
      'доп. расходы','доп расходы','тмц','тмц (материалы)','итого платит сбербанк',
      'кол-во в заказе (портов)','в заказе','кол-во в заказе','факт','факт выходов',
      'обследование','доступ','приемка','приёмка','оплата','статус ид',
      'менеджер сбера','менеджер','контрагент','контакт на объекте','контакт',
      'контактное лицо','телефон','контролер','контролёр',
      'ссылка на тех.инфо','ссылка на техинфо','тех.инфо',
      '№ документа в эдо','№ в эдо','номер в эдо','эдо',
      '№ счета / сумма','№ счёта / сумма','счет','счёт',
      'в эдо','внутренний комментарий','комментарий','комментарий из excel',
      'дата распределения','дата выхода','срок ид','стадия ид',
      'материалы','исходники','альбом'
    ];
    var raw = t.rawData || {};
    var extra = Object.keys(raw).filter(function(k) {
      return knownKeys.indexOf(k.toLowerCase().trim()) === -1 && raw[k] !== '' && raw[k] != null;
    }).map(function(k) {
      return [k, raw[k]];
    });
    if (!extra.length) return '';
    function fmtRaw(v) {
      var s = String(v);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10).split('-').reverse().join('.');
      if (/^\d{2}\.\d{2}\.\d{4}/.test(s)) return s.slice(0,10);
      if (/^https?:\/\//i.test(s)) return '<a href="'+s+'" target="_blank" rel="noopener noreferrer">🔗 Открыть</a>';
      var n = parseFloat(s.replace(/\s/g,'').replace(',','.'));
      if (!isNaN(n) && s.replace(/[\d\s.,]/g,'') === '') return n.toLocaleString('ru-RU');
      return s;
    }
    var rows = extra.map(function(pair) {
      return '<div class="field-row"><div class="field-lbl" style="color:var(--text-3)">'+pair[0]+'</div>' +
        '<div class="field-val">'+fmtRaw(pair[1])+'</div></div>';
    }).join('');
    return '<div class="divider"></div>' +
      '<div class="sec-title" style="margin-bottom:.5rem">Дополнительно из Excel</div>' +
      rows;
  })();

  var phoneMatch = (t.contact || '').match(/(?:\+7|8)[\s\-(]?\d{3}[\s\-)]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/);
  var cleanPhone = phoneMatch ? phoneMatch[0].replace(/[^\d+]/g, '') : null;
  var quickActionsBar = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:.85rem">' +
    '<a href="https://yandex.ru/maps/?text=' + encodeURIComponent('Россия, ' + mapFullAddr) + '" target="_blank" rel="noopener noreferrer" class="quick-contact-btn nav-btn">📍 Яндекс.Навигатор</a>' +
    '<a href="https://2gis.ru/search/' + encodeURIComponent('Россия, ' + mapFullAddr) + '" target="_blank" rel="noopener noreferrer" class="quick-contact-btn nav-btn" style="background:#f0fdfa;color:#0f766e;border-color:#99f6e4">🗺️ 2ГИС</a>' +
    (cleanPhone ? '<a href="tel:' + cleanPhone + '" class="quick-contact-btn call-btn">📞 Позвонить (' + escHtml(phoneMatch[0]) + ')</a>' : '') +
  '</div>';

  var paneMain = '<div id="cardTabPane-main" class="card-tab-pane" style="display:' + (curTab === 'main' ? 'block' : 'none') + '">' +
    quickActionsBar +
    '<div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:1rem;align-items:start">' +
      '<div class="card p">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
          '<div class="sec-title" style="margin:0">Объект и команда</div>' +
          field('', 'archived') +
        '</div>' +
        field('Регион', 'region') +
        field('Адрес объекта', 'address') +
        field('Тип объекта', 'tipObj') +
        field('Тип работ', 'workType') +
        field('№ ГОСБ', 'gosb') +
        field('№ ВСП', 'vsp') +
        '<div class="divider"></div>' +
        '<div class="sec-title" style="margin-bottom:.5rem">Команда и контакты</div>' +
        field('Статус заявки', 'status') +
        field('Приоритет', 'priority') +
        field('Менеджер Сбера', 'manager') +
        field('Контрагент (Основной)', 'contractor') +
        field('Исполнитель (Наш)', 'assignee') +
        (t.assignee && t.assignmentStatus ? '<div class="field-row"><div class="field-lbl">Статус назначения</div><div class="field-val">' +
          (t.assignmentStatus === 'accepted' ? '<span class="badge b-green">Принял</span>' :
          t.assignmentStatus === 'declined' ? '<span class="badge b-red">Отказался</span>' :
          '<span class="badge b-gray">Ожидает подтверждения</span>') +
        '</div></div>' : '') +
        (t.assignee === (S.user.fullName || '') && t.assignmentStatus === 'pending'
          ? '<div class="field-row"><div class="field-lbl"></div><div class="field-val" style="display:flex;gap:.5rem">' +
              '<button class="btn btn-sm" onclick="acceptTask(\'' + t.id.replace(/'/g,"\\'") + '\')">✅ Принять заявку</button>' +
              '<button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="declineTask(\'' + t.id.replace(/'/g,"\\'") + '\')">❌ Отказаться</button>' +
            '</div></div>'
          : '') +
        field('Контролёр', 'controller') +
        field('Контакт на объекте', 'contact', 'textarea') +
        '<div class="divider"></div>' +
        '<div class="sec-title" style="margin-bottom:.5rem">Заметки и комментарии</div>' +
        field('Внутренний комментарий', 'comment', 'textarea') +
        field('Комментарий из Excel', 'excelComment', 'textarea') +
        rawExtraRows +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:1rem">' +
        '<div class="card p">' +
          '<div class="sec-title" style="margin-bottom:.5rem">Карта объекта</div>' +
          mapHtml +
        '</div>' +
        '<div class="card p">' +
          '<div class="sec-title" style="margin-bottom:.5rem">Сроки и обследование</div>' +
          field('Дата заявки', 'dateZayavki', 'date') +
          field('Дата окончания (план)', 'deadline', 'date') +
          field('Дата выхода (факт)', 'dataVyhoda', 'date') +
          field('Дата распределения', 'distributedAt', 'date') +
          field('Обследование', 'obsledovanie') +
          field('Доступ', 'dostup') +
          field('Приёмка (фото)', 'priemka') +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  var itemsBlock = '<div class="card p" style="margin-bottom:1rem;border:1.5px solid var(--border)">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:.75rem">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="sec-title" style="margin:0;font-size:1.05rem">📦 Состав работ и спецификация</div>' +
        '<span id="cardItemsCountBadge" class="badge b-gray" style="font-size:.74rem">0 позиций</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px">' +
        '<button class="btn btn-sm" onclick="addItemPrompt(\'' + eid + '\')">+ Добавить работу / ТМЦ</button>' +
      '</div>' +
    '</div>' +
    '<div id="cardItemsSummaryBar" style="display:flex;gap:16px;background:var(--bg);padding:8px 12px;border-radius:6px;margin-bottom:.75rem;font-size:.8rem;flex-wrap:wrap;align-items:center">' +
      '<div>Сумма Сбера (вход): <b id="cardSummaryCust" style="color:var(--text)">0 ₽</b></div>' +
      '<div>Сумма подрядчикам: <b id="cardSummaryCont" style="color:var(--text-2)">0 ₽</b></div>' +
      '<div>Плановая маржа: <b id="cardSummaryMargin" style="color:var(--green)">0 ₽</b></div>' +
    '</div>' +
    '<div id="taskItemsList" class="t3">Загрузка позиций…</div>' +
    '<div id="cardContractorOrdersBar" style="margin-top:.75rem;display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:.78rem"></div>' +
  '</div>';

  var paneItems = '<div id="cardTabPane-items" class="card-tab-pane" style="display:' + (curTab === 'items' ? 'block' : 'none') + '">' +
    itemsBlock +
  '</div>';

  var remarksBadge = Number(t.openRemarksCount || 0) > 0
    ? '<span class="badge b-red" style="font-size:11px;padding:2px 7px;margin-left:6px">⚠️ ' + t.openRemarksCount + ' открыто</span>'
    : '<span class="badge b-green" style="font-size:11px;padding:2px 7px;margin-left:6px">✓ Нет замечаний</span>';

  var remarksBlock = '<div class="card p" id="remarksBlock">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
      '<div class="sec-title" style="margin:0;display:flex;align-items:center">Замечания Сбера ' + remarksBadge + '</div>' +
      '<button class="btn btn-sm btn-ghost" onclick="addRemarkPrompt(\'' + eid + '\')">+ Замечание</button>' +
    '</div>' +
    '<div id="remarksList" class="t3">Загрузка…</div>' +
  '</div>';

  var paneRemarks = '<div id="cardTabPane-remarks" class="card-tab-pane" style="display:' + (curTab === 'remarks' ? 'block' : 'none') + '">' +
    remarksBlock +
  '</div>';

  var paneFiles = '<div id="cardTabPane-files" class="card-tab-pane" style="display:' + (curTab === 'files' ? 'block' : 'none') + '">' +
    '<div class="card p mb" style="border:1.5px solid var(--orange);background:#fffcf5">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">' +
        '<div>' +
          '<div style="font-weight:700;font-size:1rem;color:var(--text)">📄 Официальное письмо на допуск (Word .docx)</div>' +
          '<div style="font-size:.82rem;color:var(--text-2);margin-top:2px">Сформировать и скачать письмо в Сбербанк с паспортными данными и контактами назначенных монтажников</div>' +
        '</div>' +
        '<button class="btn btn-sm" onclick="openAccessLetterModal(\'' + eid + '\')">📄 Сформировать допуск</button>' +
      '</div>' +
    '</div>' +
    '<div class="card p mb">' +
      '<div class="sec-title" style="margin-bottom:.5rem">Облачные ссылки на документацию</div>' +
      field('Ссылка на материалы (исходники)', 'materialsLink', 'url') +
      field('Ссылка на готовую ИД (альбом)', 'idLink', 'url') +
      field('Ссылка на тех.инфо', 'techLink', 'url') +
      field('Заказ подписан на портале поставщика', 'supplierOrderSigned', 'checkbox') +
      field('ИД загружена на портал поставщика', 'supplierIdUploaded', 'checkbox') +
    '</div>' +
    '<div class="card p mb" id="attachmentsBlock">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
        '<div class="sec-title" style="margin:0">Файлы и фотоотчёты к заявке</div>' +
      '</div>' +
      '<div id="attachmentsList" class="t3">Загрузка…</div>' +
      '<div style="display:flex;gap:.4rem;margin-top:.8rem;flex-wrap:wrap">' +
        '<label class="btn btn-sm btn-ghost">📷 Фото<input type="file" multiple accept="image/*" style="display:none" onchange="handleAttachmentUpload(\''+t.id+'\',\'photo_report\',this.files)"></label>' +
        '<label class="btn btn-sm btn-ghost">🗺️ Схема<input type="file" multiple accept="image/*,.pdf,.dwg" style="display:none" onchange="handleAttachmentUpload(\''+t.id+'\',\'scheme\',this.files)"></label>' +
        '<label class="btn btn-sm btn-ghost">📋 Чек-лист<input type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.docx" style="display:none" onchange="handleAttachmentUpload(\''+t.id+'\',\'checklist\',this.files)"></label>' +
        '<label class="btn btn-sm btn-ghost">📄 Акт<input type="file" accept="image/*,.pdf" style="display:none" onchange="handleAttachmentUpload(\''+t.id+'\',\'act\',this.files)"></label>' +
        '<label class="btn btn-sm btn-ghost">🧾 Чек<input type="file" accept="image/*,.pdf" style="display:none" onchange="handleAttachmentUpload(\''+t.id+'\',\'receipt\',this.files)"></label>' +
        '<label class="btn btn-sm btn-ghost">📊 Excel ПИ<input type="file" accept=".xlsx,.xls" style="display:none" onchange="handleAttachmentUpload(\''+t.id+'\',\'pi_excel\',this.files)"></label>' +
      '</div>' +
    '</div>' +
    '<div class="card p" id="portsBlock">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
        '<div class="sec-title" style="margin:0">КЖ / Протокол измерений портов</div>' +
        '<button class="btn btn-sm btn-ghost" onclick="addPortRow(\''+t.id+'\')">+ Порт</button>' +
      '</div>' +
      '<div id="portsList" class="t3">Загрузка…</div>' +
    '</div>' +
  '</div>';

  var paneFinance = '<div id="cardTabPane-finance" class="card-tab-pane" style="display:' + (curTab === 'finance' ? 'block' : 'none') + '">' +
    '<div class="card p mb">' +
      '<div class="sec-title" style="margin-bottom:.5rem">Финансовые показатели договора</div>' +
      field('Сумма договора', 'amount', 'number') +
      field('Стоимость за ед.', 'pricePerUnit', 'number') +
      field('Транспорт / Удалёнка (₽)', 'distanceKm', 'number') +
      field('Доп. расходы (₽)', 'extras', 'number') +
      field('ТМЦ — Материалы (₽)', 'tmc', 'number') +
      '<div class="field-row"><div class="field-lbl" style="font-weight:700">Итого платит Сбер</div><div class="field-val" style="font-weight:700; font-size:1.1rem; color:var(--blue)">' + fmtMoney(getTaskFinance(t).total) + '</div></div>' +
      '<div class="divider"></div>' +
      field('В заказе (портов)', 'inOrder', 'number') +
      field('Факт', 'fact', 'number') +
      field('Оплата подрядчику', 'oplata') +
    '</div>' +
    '<div class="card p">' +
      '<div class="sec-title" style="margin-bottom:.5rem">Счета и ЭДО</div>' +
      field('№ документа в ЭДО', 'edoNumber') +
      field('№ счёта / сумма', 'invoiceInfo') +
      field('В ЭДО', 'vedoStatus') +
      '<div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap">' +
        '<button class="btn btn-sm" onclick="exportDoc(\'invoice\',\''+eid+'\')" title="Счёт">📄 Выгрузить Счёт</button>' +
        '<button class="btn btn-sm btn-ghost" onclick="exportDoc(\'act\',\''+eid+'\')" title="Акт">✔ Выгрузить Акт</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  var paneHistory = '<div id="cardTabPane-history" class="card-tab-pane" style="display:' + (curTab === 'history' ? 'block' : 'none') + '">' +
    '<div class="card p">' +
      '<div class="sec-title" style="margin-bottom:.5rem">История изменений заявки</div>' +
      histHtml +
    '</div>' +
  '</div>';

  var hasDraft = Object.keys(S.cardDraft).length > 0;
  var unsavedBar = hasDraft
    ? '<div class="unsaved-bar">' +
        '<span>У вас есть несохранённые изменения</span>' +
        '<button class="btn btn-sm" id="cardSaveBtn">Сохранить</button>' +
        '<button class="btn btn-sm btn-ghost" id="cardResetBtn">Сбросить</button>' +
      '</div>'
    : '';

  var mobileActionBar = '<div class="mobile-action-bar">' +
    (hasDraft
      ? '<button class="btn btn-sm btn-primary mobile-action-main-btn" onclick="saveCard()">💾 Сохранить</button>' +
        '<button class="btn btn-sm btn-ghost" onclick="S.cardDraft={};renderApp()">✕</button>'
      : (nextStepDef
          ? '<button class="smart-action-btn-primary mobile-action-main-btn ' + (canStepNow && canAdvance ? '' : 'disabled') + '" onclick="' + (canStepNow && canAdvance ? 'advanceIdStep(\'' + eid + '\')' : (advanceBlockReason ? 'alert(\'' + advanceBlockReason + '\')' : '')) + '">' +
              '▶ Шаг ' + (curStageNum + 1) + ': ' + nextStepDef.action +
            '</button>'
          : '<div style="flex:1;text-align:center;font-weight:700;color:var(--green)">✅ Заявка завершена</div>'
        )
    ) +
  '</div>';

  var confirmModal = S.cardConfirmOpen
    ? '<div class="modal-overlay" id="cardConfirmOverlay">' +
        '<div class="modal-box">' +
          '<h3>Подтвердите изменения</h3>' +
          Object.keys(S.cardDraft).map(function(k){
            var oldV = t[k];
            var newV = S.cardDraft[k];
            var isBool = typeof newV === 'boolean';
            var oldStr = isBool ? (oldV ? 'Да' : 'Нет') : String(oldV || '—');
            var newStr = isBool ? (newV ? 'Да' : 'Нет') : String(newV || '—');
            return '<div class="field-row"><div class="field-lbl">'+(fieldLabels[k]||k)+'</div>' +
              '<div class="field-val"><span style="text-decoration:line-through;color:var(--red)">'+oldStr+'</span> &rarr; <b>'+newStr+'</b></div></div>';
          }).join('') +
          '<div style="display:flex;gap:.5rem;margin-top:1rem;justify-content:flex-end">' +
            '<button class="btn btn-sm btn-ghost" id="cardConfirmCancelBtn">Отмена</button>' +
            '<button class="btn btn-sm" id="cardConfirmOkBtn">Подтвердить и сохранить</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    : '';

  return hdr +
    cancelledBanner +
    smartActionBox +
    tabsNav +
    '<form id="cardForm" onsubmit="return false;">' +
      paneMain +
      paneItems +
      paneRemarks +
      paneFiles +
      paneFinance +
      paneHistory +
    '</form>' +
    mobileActionBar +
    unsavedBar +
    confirmModal;
}

function refreshTaskItemsList(taskId) {
  var el = document.getElementById('taskItemsList');
  if (!el) return;
  api('/tasks/' + encodeURIComponent(taskId) + '/items')
    .then(function(items) {
      if (!Array.isArray(items) || !items.length) {
        el.innerHTML = '<div class="t3" style="padding:.6rem 0;font-size:.82rem">Позиции работ пока не внесены. Нажмите «+ Добавить работу / ТМЦ», чтобы детализировать состав заявки.</div>';
        updateItemsSummary(taskId, []);
        return;
      }

      var contractors = S.contractors || [];
      var rows = items.map(function(it, idx) {
        var statusColor = it.status === 'done' ? 'var(--green)' : it.status === 'progress' ? 'var(--orange)' : 'var(--text-3)';
        var statusLabel = it.status === 'done' ? '✓ Выполнено' : it.status === 'progress' ? '⚙ В работе' : '⏳ Запланировано';

        var contOptions = '<option value="">(Не назначен)</option>' +
          contractors.map(function(c) {
            var selected = (it.contractor_id === c.id || it.contractor_name === c.name_short) ? ' selected' : '';
            return '<option value="' + c.id + '"' + selected + '>' + escHtml(c.name_short) + '</option>';
          }).join('');

        var margin = (Number(it.amount_customer) || 0) - (Number(it.amount_contractor) || 0);

        return '<tr style="border-bottom:1px solid var(--border);font-size:.82rem">' +
          '<td style="padding:6px 8px;font-weight:600;color:var(--text-3)">' + (idx + 1) + '</td>' +
          '<td style="padding:6px 8px">' +
            '<div style="font-weight:600;color:var(--text)">' + escHtml(it.work_type) + '</div>' +
            (it.comment ? '<div style="font-size:.72rem;color:var(--text-3)">' + escHtml(it.comment) + '</div>' : '') +
          '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap;font-weight:600">' + (it.quantity || 1) + ' ' + escHtml(it.unit || 'шт.') + '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap;color:var(--text)">' + fmtMoney(it.amount_customer) + '</td>' +
          '<td style="padding:6px 8px">' +
            '<select class="field-input" style="padding:2px 6px;font-size:.76rem" onchange="updateItemContractor(\'' + taskId.replace(/'/g, "\\'") + '\',' + it.id + ',this.value)">' +
              contOptions +
            '</select>' +
          '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap;color:var(--text-2)">' + fmtMoney(it.amount_contractor) + '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap;font-weight:600;color:' + (margin >= 0 ? 'var(--green)' : 'var(--red)') + '">' + fmtMoney(margin) + '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap">' +
            '<span style="font-size:.74rem;color:' + statusColor + ';font-weight:600">' + statusLabel + '</span>' +
          '</td>' +
          '<td style="padding:6px 8px;text-align:right;white-space:nowrap">' +
            '<button class="btn btn-sm btn-ghost" onclick="editItemModal(\'' + taskId.replace(/'/g, "\\'") + '\',' + it.id + ')" title="Редактировать">✏️</button>' +
            '<button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="deleteItemModal(\'' + taskId.replace(/'/g, "\\'") + '\',' + it.id + ')" title="Удалить">✕</button>' +
          '</td>' +
        '</tr>';
      }).join('');

      el.innerHTML = '<div style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse;text-align:left">' +
          '<thead><tr style="background:var(--bg);font-size:.74rem;color:var(--text-3);border-bottom:1px solid var(--border)">' +
            '<th style="padding:6px 8px">№</th>' +
            '<th style="padding:6px 8px">Вид работ / позиция</th>' +
            '<th style="padding:6px 8px">Кол-во</th>' +
            '<th style="padding:6px 8px">Сбер (вход)</th>' +
            '<th style="padding:6px 8px">Подрядчик (исп.)</th>' +
            '<th style="padding:6px 8px">Подрядчику</th>' +
            '<th style="padding:6px 8px">Маржа</th>' +
            '<th style="padding:6px 8px">Статус</th>' +
            '<th style="padding:6px 8px"></th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>';

      updateItemsSummary(taskId, items);
    })
    .catch(function(err) {
      el.innerHTML = '<div class="t3" style="color:var(--red);font-size:.8rem">Ошибка загрузки позиций: ' + (err.message || err) + '</div>';
    });
}

function updateItemsSummary(taskId, items) {
  var countBadge = document.getElementById('cardItemsCountBadge');
  if (countBadge) countBadge.textContent = (items ? items.length : 0) + ' позиций';
  var tabBadge = document.getElementById('cardTabItemsBadge');
  if (tabBadge) tabBadge.textContent = (items && items.length) ? String(items.length) : '';

  var totalCust = 0, totalCont = 0;
  var contractorsMap = {};

  (items || []).forEach(function(it) {
    totalCust += Number(it.amount_customer) || 0;
    totalCont += Number(it.amount_contractor) || 0;
    var cName = it.contractor_name;
    if (!cName && it.contractor_id) {
      var found = (S.contractors || []).find(function(c) { return c.id === it.contractor_id; });
      if (found) cName = found.name_short;
    }
    if (cName) {
      contractorsMap[cName] = (contractorsMap[cName] || 0) + 1;
    }
  });

  var margin = totalCust - totalCont;
  var marginPct = totalCust > 0 ? Math.round((margin / totalCust) * 100) : 0;

  var custEl = document.getElementById('cardSummaryCust');
  if (custEl) custEl.textContent = fmtMoney(totalCust);

  var contEl = document.getElementById('cardSummaryCont');
  if (contEl) contEl.textContent = fmtMoney(totalCont);

  var marginEl = document.getElementById('cardSummaryMargin');
  if (marginEl) {
    marginEl.textContent = fmtMoney(margin) + ' (' + marginPct + '%)';
    marginEl.style.color = margin >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // Обновляем кнопки персональных Приложений №2
  var ordersBar = document.getElementById('cardContractorOrdersBar');
  if (ordersBar) {
    var cNames = Object.keys(contractorsMap);
    if (cNames.length > 0) {
      ordersBar.innerHTML = '<span style="font-weight:600;color:var(--text-3)">Заказы подрядчикам (Приложение №2):</span>' +
        cNames.map(function(cn) {
          return '<button class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:.74rem" onclick="exportDoc(\'app2\',\'' + taskId.replace(/'/g, "\\'") + '\',\'' + cn.replace(/'/g, "\\'") + '\')">📥 Заказ: ' + escHtml(cn) + ' (' + contractorsMap[cn] + ' поз.)</button>';
        }).join('');
    } else {
      ordersBar.innerHTML = '';
    }
  }
}

function addItemPrompt(taskId) {
  var work = prompt('Введите наименование работы или материала (ТМЦ):');
  if (work === null) return;
  if (!work.trim()) return alert('Наименование работы обязательно!');

  var qtyStr = prompt('Количество (например, 15):', '1');
  var qty = parseFloat((qtyStr || '1').replace(',', '.')) || 1;

  var unit = prompt('Единица измерения:', 'шт.') || 'шт.';

  var priceCustStr = prompt('Стоимость от Заказчика (Сбера) за ед., руб.:', '0');
  var priceCust = parseFloat((priceCustStr || '0').replace(',', '.')) || 0;

  var priceContStr = prompt('Ставка Подрядчику за ед., руб. (необязательно):', '0');
  var priceCont = parseFloat((priceContStr || '0').replace(',', '.')) || 0;

  api('/tasks/' + encodeURIComponent(taskId) + '/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      work_type: work.trim(),
      quantity: qty,
      unit: unit.trim(),
      price_customer: priceCust,
      amount_customer: qty * priceCust,
      price_contractor: priceCont,
      amount_contractor: qty * priceCont
    })
  })
  .then(function(res) {
    if (res.error) return alert('Ошибка: ' + res.error);
    refreshTaskItemsList(taskId);
    var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
    if (t) {
      t.amount = (t.amount || 0) + (qty * priceCust);
    }
  })
  .catch(function(err) {
    alert('Ошибка добавления позиции: ' + (err.message || err));
  });
}

function updateItemContractor(taskId, itemId, contractorId) {
  var cObj = (S.contractors || []).find(function(c) { return String(c.id) === String(contractorId); });
  var cName = cObj ? cObj.name_short : null;

  api('/tasks/' + encodeURIComponent(taskId) + '/items/' + itemId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contractor_id: contractorId ? parseInt(contractorId, 10) : null,
      contractor_name: cName
    })
  })
  .then(function(res) {
    if (res.error) return alert('Ошибка: ' + res.error);
    refreshTaskItemsList(taskId);
  })
  .catch(function(err) {
    alert('Ошибка назначения подрядчика: ' + (err.message || err));
  });
}

function editItemModal(taskId, itemId) {
  api('/tasks/' + encodeURIComponent(taskId) + '/items')
    .then(function(list) {
      var item = (list || []).find(function(x) { return x.id === itemId; });
      if (!item) return alert('Позиция не найдена');

      var newWork = prompt('Наименование работы:', item.work_type);
      if (newWork === null) return;
      if (!newWork.trim()) return alert('Наименование обязательно');

      var newQtyStr = prompt('Количество:', String(item.quantity || 1));
      var newQty = parseFloat((newQtyStr || '1').replace(',', '.')) || 1;

      var newPriceCustStr = prompt('Цена Сбера за ед., руб.:', String(item.price_customer || 0));
      var newPriceCust = parseFloat((newPriceCustStr || '0').replace(',', '.')) || 0;

      var newPriceContStr = prompt('Ставка подрядчику за ед., руб.:', String(item.price_contractor || 0));
      var newPriceCont = parseFloat((newPriceContStr || '0').replace(',', '.')) || 0;

      api('/tasks/' + encodeURIComponent(taskId) + '/items/' + itemId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_type: newWork.trim(),
          quantity: newQty,
          price_customer: newPriceCust,
          amount_customer: newQty * newPriceCust,
          price_contractor: newPriceCont,
          amount_contractor: newQty * newPriceCont
        })
      })
      .then(function(res) {
        if (res.error) return alert('Ошибка: ' + res.error);
        refreshTaskItemsList(taskId);
      })
      .catch(function(err) {
        alert('Ошибка сохранения позиции: ' + (err.message || err));
      });
    });
}

function deleteItemModal(taskId, itemId) {
  if (!confirm('Удалить эту позицию из спецификации?')) return;
  api('/tasks/' + encodeURIComponent(taskId) + '/items/' + itemId, {
    method: 'DELETE'
  })
  .then(function(res) {
    if (res.error) return alert('Ошибка: ' + res.error);
    refreshTaskItemsList(taskId);
  })
  .catch(function(err) {
    alert('Ошибка удаления позиции: ' + (err.message || err));
  });
}


function refreshAttachmentsList(taskId) {
  var el = document.getElementById('attachmentsList');
  if (!el) return;
  loadAttachments(taskId).then(function(list) {
    if (!Array.isArray(list) || !list.length) {
      el.innerHTML = '<span class="t3">Пока ничего не загружено</span>';
      return;
    }
    var typeLabels = { photo_report: '📷 Фото', scheme: '🗺️ Схема', act: '📄 Акт', receipt: '🧾 Чек', pi_excel: '📊 Excel ПИ', order_pdf: '📑 Заказ (PDF)', checklist: '📋 Чек-лист' };
    el.innerHTML = list.map(function(a) {
      return '<div class="field-row">' +
        '<div class="field-lbl">' + (typeLabels[a.type] || a.type) + '</div>' +
        '<div class="field-val"><a href="/api/attachments/' + a.id + '/file?token=' + '' + '" onclick="event.preventDefault();openAttachment(' + a.id + ')">' + escHtml(a.original_name || 'файл') + '</a>' +
        ' <button class="btn btn-sm btn-ghost" onclick="handleAttachmentDelete(' + a.id + ',\'' + taskId + '\')" title="Удалить">✖</button></div>' +
      '</div>';
    }).join('');
  });
}
var typeLabels = { photo_report: '📷 Фото', scheme: '🗺️ Схема', act: '📄 Акт', receipt: '🧾 Чек', pi_excel: '📊 Excel ПИ', order_pdf: '📑 Заказ (PDF)', checklist: '📋 Чек-лист' };

function openAttachment(id) {
  fetch('/api/attachments/' + id + '/file', { headers: { 'Authorization': 'Bearer ' + S.token } })
    .then(function(r){ return r.blob(); })
    .then(function(blob){ window.open(URL.createObjectURL(blob), '_blank'); });
}

function handleAttachmentUpload(taskId, type, files) {
  if (!files || !files.length) return;
  uploadAttachments(taskId, type, files).then(function() {
    refreshAttachmentsList(taskId);
  });
}

function handleAttachmentDelete(attId, taskId) {
  if (!confirm('Удалить файл?')) return;
  deleteAttachment(attId).then(function() { refreshAttachmentsList(taskId); });
}

function refreshPortsList(taskId) {
  var el = document.getElementById('portsList');
  if (!el) return;
  api('/tasks/' + taskId + '/ports').then(function(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      el.innerHTML = '<span class="t3">Строк пока нет</span>';
      return;
    }
    el.innerHTML = '<table style="width:100%;font-size:.8rem"><thead><tr>' +
      '<th style="text-align:left">Порт</th><th style="text-align:left">Патч-панель</th><th style="text-align:left">Помещение</th><th style="text-align:left">Маркировка</th><th style="text-align:left">Длина, м</th><th></th>' +
    '</tr></thead><tbody>' +
    rows.map(function(r) {
      return '<tr>' +
        '<td><input value="' + (r.port_number||'').replace(/"/g,'&quot;') + '" onchange="savePortRow(' + r.id + ',\'' + taskId + '\')" data-field="portNumber" id="pr_' + r.id + '_port" style="width:60px"></td>' +
        '<td><input value="' + (r.patch_panel||'').replace(/"/g,'&quot;') + '" onchange="savePortRow(' + r.id + ',\'' + taskId + '\')" id="pr_' + r.id + '_patch" style="width:80px"></td>' +
        '<td><input value="' + (r.room||'').replace(/"/g,'&quot;') + '" onchange="savePortRow(' + r.id + ',\'' + taskId + '\')" id="pr_' + r.id + '_room" style="width:100px"></td>' +
        '<td><input value="' + (r.marking||'').replace(/"/g,'&quot;') + '" onchange="savePortRow(' + r.id + ',\'' + taskId + '\')" id="pr_' + r.id + '_marking" style="width:100px"></td>' +
        '<td><input type="number" value="' + (r.cable_length||'') + '" onchange="savePortRow(' + r.id + ',\'' + taskId + '\')" id="pr_' + r.id + '_len" style="width:70px"></td>' +
        '<td><button class="btn btn-sm btn-ghost" onclick="deletePortRow(' + r.id + ',\'' + taskId + '\')">✖</button></td>' +
      '</tr>';
    }).join('') +
    '</tbody></table>';
  });
}

function addPortRow(taskId) {
  api('/tasks/' + taskId + '/ports', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ portNumber:'', patchPanel:'', room:'', marking:'', cableLength:null })
  }).then(function() { refreshPortsList(taskId); });
}

function savePortRow(rowId, taskId) {
  var data = {
    portNumber: document.getElementById('pr_' + rowId + '_port').value,
    patchPanel: document.getElementById('pr_' + rowId + '_patch').value,
    room:       document.getElementById('pr_' + rowId + '_room').value,
    marking:    document.getElementById('pr_' + rowId + '_marking').value,
    cableLength: document.getElementById('pr_' + rowId + '_len').value || null
  };
  api('/ports/' + rowId, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
}

function deletePortRow(rowId, taskId) {
  if (!confirm('Удалить строку?')) return;
  api('/ports/' + rowId, { method:'DELETE' }).then(function() { refreshPortsList(taskId); });
}

var fieldLabels = {
  status:'Статус', priority:'Приоритет', stage:'Этап', assignee:'Исполнитель',
  controller:'Контролёр', comment:'Комментарий', distributedAt:'Дата распределения',
  contact:'Контакт на объекте', techLink:'Ссылка', deadline:'Дата окончания работ',
  dateZayavki:'Дата заявки', fact:'Факт', obsledovanie:'Обследование',
  dostup:'Доступ', dataVyhoda:'Дата выхода', priemka:'Приёмка',
  oplata:'Оплата подрядчику', edoNumber:'№ документа в ЭДО',
  invoiceInfo:'№ счёта/сумма', vedoStatus:'В ЭДО',
  region:'Регион', address:'Адрес объекта', workType:'Тип работ',
  tipObj:'Тип объекта', gosb:'№ ГОСБ', vsp:'№ ВСП',
  manager:'Менеджер Сбера', amount:'Сумма договора', inOrder:'В заказе (портов)',
  overdueDays:'Дней просрочки', contractor:'Подрядчик',
  distanceKm:'Удалённость (км)', pricePerUnit:'Стоимость за ед.',
  idStatus:'Статус ИД', excelComment:'Комментарий (Excel)',
  supplierOrderSigned:'Заказ подписан на портале', supplierIdUploaded:'ИД загружена на портал',
  overdueReason:'Причина просрочки'
};

function saveCard() {
  var t = S.tasks.find(function(x){ return String(x.id) === String(S.cardId); });
  if (!t) return;
  var data = Object.assign({}, S.cardDraft);
  if (!Object.keys(data).length) { S.cardConfirmOpen = false; renderApp(); return; }

  var now = new Date().toLocaleString('ru');
  var author = S.user ? (S.user.full_name || S.user.username) : 'Система';
  var hist = t._history || [];
  Object.keys(data).forEach(function(k){
    var oldV = t[k], newV = data[k];
    var isBool = typeof newV === 'boolean';
    var oldStr = isBool ? (!!oldV ? 'Да' : 'Нет') : String(oldV||'');
    var newStr = isBool ? (newV ? 'Да' : 'Нет') : String(newV);
    if (oldStr !== newStr) {
      hist.push({date:now, author:author, field:fieldLabels[k]||k, old:oldStr, new:newStr});
    }
  });
  data._history = hist;

  delete data.status;
  delete data.stage;
  delete data.stageNum;

  api('/tasks/' + S.cardId, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)})
    .then(function(){
      Object.assign(t, data);
      S.cardDraft = {};
      S.cardConfirmOpen = false;
      renderApp();
    })
    .catch(function(e){ alert('Ошибка сохранения: ' + e.message); });
}

function cancelTaskPrompt(taskId) {
  var reason = prompt('Укажите официальную причину отмены заявки:');
  if (reason === null) return;
  if (!reason.trim()) return alert('Причина отмены обязательна!');

  api('/tasks/' + encodeURIComponent(taskId) + '/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason.trim() })
  })
  .then(function(res) {
    if (res.error) return alert('Ошибка: ' + res.error);
    var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
    if (t) {
      t.status = 'cancelled';
      t.overdueReason = reason.trim();
    }
    renderApp();
  })
  .catch(function(err) {
    alert('Ошибка отмены заявки: ' + (err.message || err));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// МОДАЛЬНОЕ ОКНО ФОРМИРОВАНИЯ ПИСЬМА НА ДОПУСК (Word .docx)
// ─────────────────────────────────────────────────────────────────────────────

function openAccessLetterModal(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); }) || { id: taskId };
  
  var p = S.specialists ? Promise.resolve(S.specialists) : api('/specialists').then(function(specs){ S.specialists = specs; return specs; });
  
  p.then(function(specialists) {
    var existing = document.getElementById('_access_letter_modal');
    if (existing) existing.remove();

    var defaultContractor = 'ООО "Ультима"';
    var defaultResponsible = '8(923) 102-40-42, ПМ – Чайка Алексей Николаевич';
    
    var parts = [];
    if (t.address) parts.push(t.address);
    if (t.vsp) parts.push('ВСП ' + t.vsp);
    if (t.gosb) parts.push('ГОСБ ' + t.gosb);
    parts.push('Заявка № ' + t.id);
    if (t.contact) parts.push('Контакт: ' + t.contact);
    var defaultTaskInfo = parts.join(', ');

    var specsList = specialists || [];

    var modal = document.createElement('div');
    modal.id = '_access_letter_modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(2px)';
    
    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:1.5rem;width:100%;max-width:640px;box-shadow:0 12px 48px rgba(0,0,0,.25);max-height:90vh;display:flex;flex-direction:column">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <div>
            <div style="font-weight:700;font-size:1.1rem">📄 Письмо на допуск (Word .docx)</div>
            <div style="font-size:.8rem;color:var(--text-3);margin-top:2px">Подготовка допуска для объекта: <b>${escHtml(t.id)}</b></div>
          </div>
          <button onclick="document.getElementById('_access_letter_modal').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-3);line-height:1">×</button>
        </div>

        <div style="overflow-y:auto;flex:1;padding-right:4px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Организация подрядчика</label>
              <input type="text" id="alm_contractor" value="${escHtml(defaultContractor)}" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
            </div>
            <div>
              <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Ответственный руководитель (ПМ)</label>
              <input type="text" id="alm_responsible" value="${escHtml(defaultResponsible)}" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
            </div>
          </div>

          <div style="margin-bottom:12px">
            <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Данные объекта и основание (автозаполнение из заявки)</label>
            <textarea id="alm_task_info" rows="2" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;resize:vertical">${escHtml(defaultTaskInfo)}</textarea>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <label style="font-size:.75rem;font-weight:700;color:var(--text-2);text-transform:uppercase">Выберите монтажников для допуска:</label>
            <input type="text" id="alm_search" placeholder="Быстрый поиск..." oninput="filterAlmSpecialists(this.value)" style="padding:4px 8px;font-size:.8rem;border:1px solid var(--border);border-radius:4px;width:160px">
          </div>

          <div id="alm_specialists_list" style="border:1.5px solid var(--border);border-radius:8px;max-height:260px;overflow-y:auto;padding:6px;background:var(--bg)">
            ${specsList.map(function(s) {
              var hasPass = s.passport_raw && s.passport_raw.trim() !== '';
              var passSnippet = s.passport_raw || s.passport_series_number || 'Паспортные данные не заполнены';
              return `
                <label class="alm-spec-item" data-name="${escHtml((s.full_name||'').toLowerCase())}" style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;margin-bottom:4px;background:#fff;border:1px solid var(--border);user-select:none">
                  <input type="checkbox" name="alm_spec_cb" value="${s.id}" style="margin-top:3px">
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <span style="font-weight:600;font-size:.85rem">${escHtml(s.full_name)}</span>
                      <span style="font-size:.72rem;color:var(--text-3)">${escHtml(s.phone || 'без телефона')}</span>
                    </div>
                    <div style="font-size:.74rem;color:${hasPass ? 'var(--text-2)' : 'var(--red)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                      ${hasPass ? '🪪 ' + escHtml(passSnippet) : '⚠️ Паспорт не заполнен'}
                    </div>
                  </div>
                </label>
              `;
            }).join('')}
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1.25rem;border-top:1px solid var(--border);padding-top:12px">
          <div style="font-size:.8rem;color:var(--text-3)">
            Выбрано: <b id="alm_selected_count">0</b> чел.
          </div>
          <div style="display:flex;gap:8px">
            <button onclick="document.getElementById('_access_letter_modal').remove()" class="btn btn-ghost btn-sm">Отмена</button>
            <button id="alm_download_btn" class="btn btn-sm" onclick="downloadAccessLetter('${escHtml(taskId)}')">📥 Скачать письмо (.docx)</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });

    var cbs = modal.querySelectorAll('input[name="alm_spec_cb"]');
    cbs.forEach(function(cb){
      cb.addEventListener('change', function(){
        var sel = modal.querySelectorAll('input[name="alm_spec_cb"]:checked').length;
        var cntEl = document.getElementById('alm_selected_count');
        if (cntEl) cntEl.textContent = sel;
      });
    });
  });
}

function filterAlmSpecialists(val) {
  var q = (val || '').toLowerCase().trim();
  var items = document.querySelectorAll('.alm-spec-item');
  items.forEach(function(el){
    var name = el.getAttribute('data-name') || '';
    el.style.display = (!q || name.includes(q)) ? 'flex' : 'none';
  });
}

function downloadAccessLetter(taskId) {
  var modal = document.getElementById('_access_letter_modal');
  if (!modal) return;

  var contractorName = (document.getElementById('alm_contractor') ? document.getElementById('alm_contractor').value : '').trim();
  var responsibleInfo = (document.getElementById('alm_responsible') ? document.getElementById('alm_responsible').value : '').trim();
  var customTaskInfo = (document.getElementById('alm_task_info') ? document.getElementById('alm_task_info').value : '').trim();

  var checkedCbs = modal.querySelectorAll('input[name="alm_spec_cb"]:checked');
  var specialistIds = Array.from(checkedCbs).map(function(cb){ return parseInt(cb.value); });

  if (specialistIds.length === 0) {
    return alert('Пожалуйста, выберите хотя бы одного специалиста для допуска');
  }

  var btn = document.getElementById('alm_download_btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Генерация Word...';
  }

  fetch('/api/tasks/' + encodeURIComponent(taskId) + '/access-letter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + S.token
    },
    body: JSON.stringify({
      specialistIds: specialistIds,
      contractorName: contractorName,
      responsibleInfo: responsibleInfo,
      customTaskInfo: customTaskInfo
    })
  })
  .then(function(r) {
    if (!r.ok) return r.json().then(function(e){ throw new Error(e.error || 'Ошибка сервера'); });
    return r.blob();
  })
  .then(function(blob) {
    var bUrl = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = bUrl;
    var cleanId = taskId.replace(/[/\\?%*:|"<>]/g, '_');
    a.download = 'Pismo_na_dopusk_' + cleanId + '.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(bUrl);
    modal.remove();
  })
  .catch(function(err) {
    alert('Не удалось сформировать письмо на допуск: ' + err.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📥 Скачать письмо (.docx)';
    }
  });
}

// ─── PAGE: МАРШИ ─────────────────────────────────────────────────────────────