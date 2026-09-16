function pageData() {
  var info = S.importInfo;
  var curBanner = '';
  if (info && info.importedFrom) {
    curBanner = '<div class="banner banner-ok" style="margin-bottom:1.5rem">' +
      '<div><div class="banner-title">✅ Активный источник данных</div>' +
      '<div class="banner-body"><strong>' + info.importedFrom + '</strong> · ' + new Date(info.importedAt).toLocaleString('ru') + ' · <strong>' + fmtN(info.rowCount) + ' заявок в базе</strong>' +
      '<br><span style="font-size:.78rem">Загрузите новый файл или отправьте данные через API — всё синхронизируется мгновенно.</span></div></div>' +
    '</div>';
  }

  // Список заказчиков для выпадающего списка
  var custOptions = ['ПАО Сбербанк'];
  if (Array.isArray(S.contractors)) {
    S.contractors.filter(function(c){ return c.type === 'customer'; }).forEach(function(c){
      if (!custOptions.includes(c.name_short)) custOptions.push(c.name_short);
    });
  }

  return '<h1 class="page-title">Данные и интеграции</h1>' +
    curBanner +
    '<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start;">' +
      
      // ЛЕВАЯ КОЛОНКА: СЦЕНАРИИ 1 И 2
      '<div style="display:flex; flex-direction:column; gap:1.5rem">' +

        // СЦЕНАРИЙ 1: МАССОВАЯ ЗАГРУЗКА EXCEL
        '<div class="card p">' +
          '<div class="fw7 mb" style="font-size:1.05rem; display:flex; align-items:center; justify-content:space-between">' +
            '<span>📊 Сценарий 1: Массовая загрузка (Excel)</span>' +
            '<span class="badge b-blue" style="font-size:.7rem">.xlsx / .xls</span>' +
          '</div>' +
          '<p class="t2 mb" style="font-size:.82rem">Сводные таблицы Сбера с листами «Заявки 2023-2026». При загрузке строки обновляются без потери комментариев и вложений.</p>' +
          '<div class="upload-zone" id="uzone" onclick="document.getElementById(\'ufile\').click()">' +
            '<input type="file" id="ufile" accept=".xlsx,.xls">' +
            '<div style="font-size:2.2rem;margin-bottom:.4rem">📂</div>' +
            '<div class="fw6">Нажмите или перетащите файл реестра .xlsx</div>' +
            '<div class="t3" style="font-size:.75rem;margin-top:4px">Поддерживаются стандартные таблицы Сбера</div>' +
          '</div>' +
          '<div id="ustatus" style="margin-top:1rem"></div>' +
        '</div>' +

        // СЦЕНАРИЙ 2: РОБОТ / API ИНТЕГРАЦИЯ
        '<div class="card p" style="background:#fafafa; border:1px dashed var(--border)">' +
          '<div class="fw7 mb" style="font-size:1.05rem; display:flex; align-items:center; justify-content:space-between">' +
            '<span>🤖 Сценарий 2: Робот / Внешнее API</span>' +
            '<span class="badge b-green" style="font-size:.7rem">REST API</span>' +
          '</div>' +
          '<p class="t2 mb" style="font-size:.82rem">Автоматическая синхронизация с порталами заказчиков через фоновые скрипты и вебхуки.</p>' +
          '<div style="background:#18181b; color:#e4e4e7; border-radius:8px; padding:10px 14px; font-family:monospace; font-size:.75rem; margin-bottom:.75rem">' +
            '<span style="color:#22c55e">POST</span> /api/tasks<br>' +
            '<span style="color:#71717a">Authorization: Bearer &lt;TOKEN&gt;</span>' +
          '</div>' +
          '<div style="display:flex; justify-content:space-between; align-items:center; font-size:.8rem">' +
            '<span class="t3">Статус службы интеграции: <b style="color:var(--green)">Активен</b></span>' +
            '<button class="btn btn-sm btn-ghost" onclick="alert(\'API ключ: ' + (S.token ? S.token.slice(0,18)+'...' : 'Не авторизован') + '\')">Ключ доступа</button>' +
          '</div>' +
        '</div>' +

      '</div>' +

      // ПРАВАЯ КОЛОНКА: СЦЕНАРИЙ 3 (ОДИНОЧНАЯ ЗАЯВКА И ИИ)
      '<div class="card p">' +
        '<div class="fw7 mb" style="font-size:1.05rem; display:flex; align-items:center; justify-content:space-between">' +
          '<span>📝 Сценарий 3: Одиночная заявка / ИИ</span>' +
          '<span class="badge b-orange" style="font-size:.7rem">Ручной ввод</span>' +
        '</div>' +

        // ПАНЕЛЬ ЗАГРУЗКИ ДОКУМЕНТОВ
        '<div style="display:flex; gap:.4rem; margin-bottom:12px; flex-wrap:wrap">' +
          '<input type="file" id="ai_pdf_upload" accept=".pdf" style="display:none" onchange="processPdfWithAi(this)">' +
          '<button type="button" class="btn btn-sm btn-ghost" style="color:var(--blue); border-color:var(--blue)" onclick="document.getElementById(\'ai_pdf_upload\').click()" title="Извлечь данные из PDF заказа Сбера">✨ Заполнить через ИИ</button>' +
          '<input type="file" id="nt_scheme_upload" multiple accept="image/*,.pdf,.dwg" style="display:none" onchange="handlePendingFiles(\'scheme\', this)">' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'nt_scheme_upload\').click()" title="Прикрепить схему объекта">🗺️ Схема</button>' +
          '<input type="file" id="nt_checklist_upload" multiple accept="image/*,.pdf,.xlsx,.xls,.docx" style="display:none" onchange="handlePendingFiles(\'checklist\', this)">' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'nt_checklist_upload\').click()" title="Прикрепить чек-лист обследования">📋 Чек-лист</button>' +
        '</div>' +

        // ЕДИНЫЙ БЛОК ДОКУМЕНТОВ С ТАБАМИ
        '<div id="nt_docs_container" style="border:1px solid var(--border); border-radius:8px; padding:10px; margin-bottom:12px; background:#fafafa;">' +
          '<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:8px; margin-bottom:10px;">' +
            '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
              '<button type="button" class="btn btn-sm btn-ghost" id="tab_btn_pdf" onclick="switchDocTab(\'pdf\')" style="font-weight:600; background:var(--orange-bg); border-color:var(--orange); color:var(--orange-dark);">📑 Заказ PDF <span id="tab_badge_pdf" style="display:none; font-size:.7rem; padding:1px 5px; border-radius:4px; background:var(--orange); color:#fff; margin-left:3px;"></span></button>' +
              '<button type="button" class="btn btn-sm btn-ghost" id="tab_btn_scheme" onclick="switchDocTab(\'scheme\')" style="font-weight:600;">🗺️ Схема <span id="tab_badge_scheme" style="display:none; font-size:.7rem; padding:1px 5px; border-radius:4px; background:var(--orange); color:#fff; margin-left:3px;"></span></button>' +
              '<button type="button" class="btn btn-sm btn-ghost" id="tab_btn_checklist" onclick="switchDocTab(\'checklist\')" style="font-weight:600;">📋 Чек-лист <span id="tab_badge_checklist" style="display:none; font-size:.7rem; padding:1px 5px; border-radius:4px; background:var(--orange); color:#fff; margin-left:3px;"></span></button>' +
            '</div>' +
            '<div>' +
              '<button type="button" class="btn btn-sm btn-ghost" onclick="toggleAllDocs()" id="btn_toggle_all_docs" style="font-size:.78rem;">Свернуть ▴</button>' +
            '</div>' +
          '</div>' +

          '<div id="nt_docs_body">' +
            // ТАБ 1: ЗАКАЗ PDF
            '<div id="doc_tab_content_pdf">' +
              '<div id="ai_log_box" style="display:none; background:#18181b; color:#22c55e; font-family:monospace; font-size:.75rem; padding:8px 12px; border-radius:6px; max-height:110px; overflow-y:auto; margin-bottom:8px; border:1px solid #27272a;">' +
                '<div id="ai_log_content"></div>' +
              '</div>' +
              '<div id="ai_pdf_preview_wrap" style="display:none;">' +
                '<iframe id="ai_pdf_preview_frame" style="width:100%; height:400px; border-radius:6px; border:1.5px solid var(--border); background:#fff;" src=""></iframe>' +
              '</div>' +
              '<div id="ai_pdf_empty_msg" class="t3" style="text-align:center; padding:1.5rem; background:#fff; border-radius:6px; border:1px dashed var(--border);">' +
                'Документ заказа ещё не выбран. Нажмите «✨ Заполнить через ИИ» выше.' +
              '</div>' +
            '</div>' +

            // ТАБ 2: СХЕМА
            '<div id="doc_tab_content_scheme" style="display:none;">' +
              '<div id="nt_scheme_chips" style="display:none; margin-bottom:8px;"></div>' +
              '<div id="nt_scheme_preview_wrap" style="display:none;">' +
                '<div id="nt_scheme_preview_content" style="width:100%; max-height:400px; overflow:auto; border-radius:6px; border:1.5px solid var(--border); background:#fff; text-align:center;"></div>' +
              '</div>' +
              '<div id="nt_scheme_empty_msg" class="t3" style="text-align:center; padding:1.5rem; background:#fff; border-radius:6px; border:1px dashed var(--border);">' +
                'Схема объекта ещё не загружена. Нажмите «🗺️ Схема» выше, чтобы прикрепить файлы.' +
              '</div>' +
            '</div>' +

            // ТАБ 3: ЧЕК-ЛИСТ
            '<div id="doc_tab_content_checklist" style="display:none;">' +
              '<div id="nt_checklist_chips" style="display:none; margin-bottom:8px;"></div>' +
              '<div id="nt_checklist_preview_wrap" style="display:none;">' +
                '<div id="nt_checklist_preview_content" style="width:100%; max-height:400px; overflow:auto; border-radius:6px; border:1.5px solid var(--border); background:#fff; text-align:center;"></div>' +
              '</div>' +
              '<div id="nt_checklist_empty_msg" class="t3" style="text-align:center; padding:1.5rem; background:#fff; border-radius:6px; border:1px dashed var(--border);">' +
                'Чек-лист ещё не загружен. Нажмите «📋 Чек-лист» выше, чтобы прикрепить файлы.' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // ОБЩИЙ КОНТЕЙНЕР ПОЛЕЙ ФОРМЫ
        '<div style="display:flex; flex-direction:column; gap:.6rem; font-size:.85rem">' +
          '<div class="g2">' +
            '<input id="nt_id" type="text" placeholder="Номер заявки (Обязательно)*" style="font-weight:700; border-color:var(--orange)">' +
            '<input id="nt_vsp" type="text" placeholder="№ ВСП">' +
          '</div>' +

          '<div class="g2">' +
            '<div>' +
              '<label class="t3" style="font-size:.7rem">Заказчик (Организация)</label>' +
              '<select id="nt_customer" style="width:100%">' +
                custOptions.map(function(c){ return '<option value="' + escHtml(c) + '">' + escHtml(c) + '</option>'; }).join('') +
              '</select>' +
            '</div>' +
            '<div>' +
              '<label class="t3" style="font-size:.7rem">Регион</label>' +
              '<input id="nt_region" type="text" placeholder="Регион" style="width:100%">' +
            '</div>' +
          '</div>' +

          '<input id="nt_address" type="text" placeholder="Адрес объекта">' +

          '<div class="g2">' +
            '<input id="nt_manager" type="text" placeholder="Менеджер Сбера / Контакт Заказчика">' +
            '<input id="nt_contact" type="text" placeholder="Контакт на объекте">' +
          '</div>' +
          
          '<input id="nt_workType" type="text" placeholder="Тип работ">' +
          
          '<div class="g2">' +
            '<div><label class="t3" style="font-size:.7rem">Сумма договора (₽)</label><input id="nt_amount" type="number" style="width:100%"></div>' +
            '<div><label class="t3" style="font-size:.7rem">Стоимость за ед. (₽)</label><input id="nt_pricePerUnit" type="number" style="width:100%"></div>' +
          '</div>' +

          '<div class="g2">' +
            '<div><label class="t3" style="font-size:.7rem">В заказе (портов)</label><input id="nt_inOrder" type="number" style="width:100%"></div>' +
            '<div><label class="t3" style="font-size:.7rem">Факт (портов)</label><input id="nt_fact" type="number" style="width:100%"></div>' +
          '</div>' +

          '<div class="g2">' +
            '<div><label class="t3" style="font-size:.7rem">Дата заявки</label><input id="nt_dateZayavki" type="date" style="width:100%"></div>' +
            '<div><label class="t3" style="font-size:.7rem">Дедлайн (план)</label><input id="nt_deadline" type="date" style="width:100%"></div>' +
          '</div>' +

          '<div class="g2">' +
            '<input id="nt_techLink" type="url" placeholder="Ссылка на тех.информацию">' +
            '<input id="nt_invoiceInfo" type="text" placeholder="№ счёта / сумма">' +
          '</div>' +

          '<textarea id="nt_comment" placeholder="Комментарий" style="resize:vertical; min-height:60px"></textarea>' +
        '</div>' +

        '<div style="text-align:right; margin-top:1rem">' +
          '<button class="btn" onclick="createSingleTask()" style="width:100%; justify-content:center">+ Создать заявку</button>' +
        '</div>' +
      '</div>' +

    '</div>';
}

var searchTimeout;
// ─── EVENTS ──────────────────────────────────────────────────────────────────

function parseDate(v) {
    if (!v) return null;
    // 1. Объект даты
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return null;
      var y = v.getFullYear(), mo = v.getMonth() + 1, d = v.getDate();
      return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
    // 2. Число Excel
    if (typeof v === 'number') {
      var parsed = XLSX.SSF.parse_date_code(v);
      if (parsed) return parsed.y + '-' + String(parsed.m).padStart(2, '0') + '-' + String(parsed.d).padStart(2, '0');
      return null;
    }
    // 3. Строка
    var s = String(v).trim();
    if (!s || s.length < 6) return null;
    // Попытка прочитать длинную строку "Thu Apr 02..."
    var tryNative = new Date(s);
    if (!isNaN(tryNative.getTime())) {
      var ny = tryNative.getFullYear(), nm = tryNative.getMonth() + 1, nd = tryNative.getDate();
      if (ny >= 1900 && ny <= 2100) return ny + '-' + String(nm).padStart(2, '0') + '-' + String(nd).padStart(2, '0');
    }
    // Попытка прочитать формат 02.04.2026
    var mRu = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
    if (mRu) {
      var dd = parseInt(mRu[1]), mm = parseInt(mRu[2]), yy = parseInt(mRu[3]);
      if (yy < 100) yy += 2000;
      return yy + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
    }
    return null;
  }

  function parseNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    // Удаляем любые буквы, пробелы (в т.ч. неразрывные) и символы валют
    var s = String(v).replace(/[^0-9.,-]/g, '').replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function clientParseSvodnye(workbook) {
    var sheetNames = workbook.SheetNames.filter(function(n) { return n.startsWith('Заявки'); });
    var allRows = [];
    function normKey(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
    function strVal(v) { if (v === null || v === undefined) return ''; return String(v).replace(/\n/g, ' ').trim(); }



    function findCol(row, keyMap, variants) {
      for (var i = 0; i < variants.length; i++) {
        var nv = normKey(variants[i]);
        if (keyMap[nv] !== undefined) {
          var v = row[keyMap[nv]];
          if (v !== null && v !== undefined && String(v).trim() !== '') return v;
        }
      }
      return null;
    }


    function buildKeyMap(row) {
      var map = {};
      Object.keys(row).forEach(function(k) { map[normKey(k)] = k; });
      return map;
    }


    for (var si = 0; si < sheetNames.length; si++) {
      var shName = sheetNames[si];
      var ws = workbook.Sheets[shName];
      var rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
      if (!rows.length) continue;

      // --- ШАГ 1: ОПРЕДЕЛЯЕМ КОЛОНКИ (ОДИН РАЗ НА ЛИСТ) ---
      var firstRow = rows[0];
      var range = XLSX.utils.decode_range(ws['!ref']);
      var keys = [];
      for(var C = range.s.c; C <= range.e.c; ++C) {
        var cell = ws[XLSX.utils.encode_cell({r:range.s.r, c:C})];
        if(cell) keys.push(String(cell.v));
      }
      
      // Создаем карту соответствия: наше имя -> реальное имя в Excel
      var colMap = {};
      var usedCols = new Set();
      var targets = ['Номер', 'Статус', 'Регион', 'Адрес', 'ТИП РАБОТ', 'Тип объекта', '№ ГОСБ', '№ ВСП', 
                     'Дата заявки', 'Дата окончания работ', 'Текущая дата', 'Менеджер Сбера', 
                     'Контакт', 'Подрядчик', 'В заказе', 'Факт', 'Обследование', 'Доступ', 
                     'Дата выхода', 'Приёмка', 'Оплата подрядчику', 'ИД', 'Сумма договора', 
                     'Стоимость за ед.', 'Ссылка на Тех.Информацию', '№ документа в ЭДО', 
                     '№ счета/сумма', 'В ЭДО', 'Комментарий', 'дней просрочки', 'Удаленность', 'ТМЦ', 'Допы'];

      
      // --- ШАГ 1: УЛУЧШЕННЫЙ ПОИСК КОЛОНОК ---
      var usedCols = new Set(); // Хранилище занятых колонок
      targets.forEach(function(target) {
        var normTarget = target.toLowerCase().replace(/[^а-яёa-z0-9]/g, '');
        
        // 1. Ищем идеальное совпадение
        var exactMatch = keys.find(function(k) {
          return k.toLowerCase().replace(/[^а-яёa-z0-9]/g, '') === normTarget && !usedCols.has(k);
        });
        
        if (exactMatch) {
          colMap[target] = exactMatch;
          usedCols.add(exactMatch);
          return;
        }

        // 2. Ищем мягкое совпадение
        var bestMatch = null;
        var minDistance = 2;

        for (var i = 0; i < keys.length; i++) {
          var key = String(keys[i]);
          if (usedCols.has(key)) continue; // Пропускаем уже занятые колонки!

          var normKey = key.toLowerCase().replace(/[^а-яёa-z0-9]/g, '');
          
          // Проверяем прямое вхождение (если слова длинные)
          if ((normKey.includes(normTarget) || normTarget.includes(normKey)) && normTarget.length > 2) {
            bestMatch = key;
            break;
          }

          var dist = levenshtein(normKey, normTarget);
          if (dist < minDistance) {
            minDistance = dist;
            bestMatch = key;
          }
        }
        
        if (bestMatch) {
          colMap[target] = bestMatch;
          usedCols.add(bestMatch);
        }
      });
      // --- ШАГ 2: БЫСТРЫЙ ПАРСИНГ СТРОК ---
      for (var ri = 0; ri < rows.length; ri++) {
        var row = rows[ri];
        
        // Берем данные по заранее найденным ключам
        var num = strVal(row[colMap['Номер']]).trim();
        if (!num) continue;

        var rawStatus = strVal(row[colMap['Статус']]).toLowerCase();
        var status = 'progress';
        if (rawStatus.includes('оплачен')) status = 'paid';
        else if (rawStatus.includes('готов')) status = 'done';
        else if (rawStatus.includes('отмен') || rawStatus.includes('стоп')) status = 'cancelled';

        var overdue = parseNum(row[colMap['дней просрочки']]);
        var addr = strVal(row[colMap['Адрес']]);

        var rawOplata = strVal(row[colMap['Оплата подрядчику']]).toLowerCase();
        var rawPriemka = strVal(row[colMap['Приёмка']]).toLowerCase();
        var rawIdStatus = strVal(row[colMap['ИД']]).toLowerCase();
        var rawObsledovanie = strVal(row[colMap['Обследование']]).toLowerCase();
        var inOrder = parseNum(row[colMap['В заказе']]);
        var fact = parseNum(row[colMap['Факт']]);
        var dataVyhoda = parseDate(row[colMap['Дата выхода']]);

        var stage = 'request';
        if (status === 'paid' || rawOplata.includes('оплач') || rawOplata.includes('да') || rawOplata.includes('+') || rawIdStatus.includes('оплач')) {
          stage = 'payment';
        } else if (status === 'done' || rawPriemka.includes('принят') || rawPriemka.includes('да') || rawPriemka.includes('+') || rawIdStatus.includes('принят')) {
          stage = 'acceptance';
        } else if (fact > 0 && inOrder > 0 && fact >= inOrder) {
          stage = 'control';
        } else if (dataVyhoda || fact > 0 || status === 'progress') {
          stage = 'install';
        } else if (rawObsledovanie && rawObsledovanie !== '-' && rawObsledovanie !== 'нет') {
          stage = 'survey';
        }

        if (stage === 'request' && status !== 'cancelled') {
          status = 'pending';
        }

        allRows.push({
          id: num, 
          sheet: shName,
          title: num + (addr ? ' — ' + addr.slice(0, 80) : ''),
          // Используем colMap, который мы подготовили в Шаге 1
          region: strVal(row[colMap['Регион']]).split(/[\s,\n]/)[0].trim(),
          address: addr,
          workType:     strVal(row[colMap['ТИП РАБОТ']]),
          tipObj:       strVal(row[colMap['Тип объекта']]),
          gosb:         strVal(row[colMap['№ ГОСБ']]),
          vsp:          strVal(row[colMap['№ ВСП']]),
          dateZayavki:  parseDate(row[colMap['Дата заявки']]),
          deadline:     parseDate(row[colMap['Дата окончания работ']]),
          currentDate:  parseDate(row[colMap['Текущая дата']]),
          manager:      strVal(row[colMap['Менеджер Сбера']]),
          contact:      strVal(row[colMap['Контакт']]),
          contractor:   strVal(row[colMap['Подрядчик']]),
          inOrder:      inOrder,
          fact:         fact,
          obsledovanie: strVal(row[colMap['Обследование']]),
          dostup:       strVal(row[colMap['Доступ']]),
          dataVyhoda:   dataVyhoda,
          priemka:      strVal(row[colMap['Приёмка']]),
          oplata:       strVal(row[colMap['Оплата подрядчику']]),
          idStatus:     strVal(row[colMap['ИД']]),
          amount:       parseNum(row[colMap['Сумма договора']]),
          
          distanceKm:   parseNum(row[colMap['Удаленность']]),
          pricePerUnit: parseNum(row[colMap['Стоимость за ед.']]),
          tmc:          parseNum(row[colMap['ТМЦ']]),
          extras:       parseNum(row[colMap['Допы']]),
          overdueDays:  overdue,

          techLink:     strVal(row[colMap['Ссылка на Тех.Информацию']]),
          edoNumber:    strVal(row[colMap['№ документа в ЭДО']]),
          invoiceInfo:  strVal(row[colMap['№ счета/сумма']]),
          vedoStatus:   strVal(row[colMap['В ЭДО']]),
          excelComment: strVal(row[colMap['Комментарий']]),
          status: status, 
          stage: stage,
          overdueDays: overdue,
          archived: false,
          rawData: (function() {
            var raw = {};
            Object.keys(row).forEach(function(k) {
              if (!k.trim().startsWith('__')) raw[k.trim()] = strVal(row[k]);
            });
            return raw;
          })()
        });
      }
    }
    return allRows;
  }


function doUpload(file) {
  if (!file.name.match(/\.(xlsx|xls)$/i)) { alert('Только .xlsx / .xls'); return; }
  
  var st = document.getElementById('ustatus');
  function setStatus(html) { if (st) st.innerHTML = html; }
  function showErr(msg) {
    setStatus('<div class="banner" style="background:#FEE2E2;border:1px solid #FECACA"><div><div class="banner-title" style="color:#B91C1C">❌ Ошибка</div><div class="banner-body">' + msg + '</div></div></div>');
  }

  setStatus('<div class="spin-wrap"><div class="spin"></div><p style="margin-top:.6rem">Читаем файл…</p></div>');
  
  var reader = new FileReader();
  reader.onload = function(e) {
    setTimeout(function() {
      try {
        setStatus('<div class="spin-wrap"><div class="spin"></div><p style="margin-top:.6rem">Парсинг таблицы…</p></div>');
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, {type:'array', cellDates:true, cellFormula:false, cellText:false});
        var hasSheets = wb.SheetNames.some(function(n){ return n.startsWith('Заявки'); });
        
        if (!hasSheets) {
          setStatus('<div class="banner banner-warn"><div><div class="banner-title">⚠️ Файл не распознан</div><div class="banner-body">Нет листов «Заявки 20XX». Данные не изменены.</div></div></div>');
          return;
        }

        setTimeout(function() {
          try {
            var rows = clientParseSvodnye(wb);
            var total = rows.length;
            var sent = 0;
            var BATCH = 200; // Стабильный размер пачки для Railway
            
            var p = Math.round((sent / total) * 100);
            setStatus(
              '<div style="margin-top:1rem">' +
                '<div style="display:flex; justify-content:space-between; font-size:.8rem; font-weight:600; margin-bottom:6px">' +
                  '<span>Импорт в базу...</span><span>' + p + '% (' + sent + ' / ' + total + ')</span>' +
                '</div>' +
                '<div class="prog"><div class="prog-fill" style="width:' + p + '%"></div></div>' +
              '</div>'
            );

            function sendBatch(isFirst) {
              var batch = rows.slice(sent, sent + BATCH);
              if (!batch.length) {
                // Финальная загрузка статистики и данных после успеха
                return Promise.all([api('/stats'), api('/tasks'), api('/chains'), api('/import-info')])
                  .then(function(res){
                    S.stats=res[0]; S.tasks=res[1]; S.chains=res[2]; S.importInfo=res[3];
                    setStatus('<div class="banner banner-ok"><div><div class="banner-title">✅ Импорт успешен!</div><div class="banner-body">Загружено <strong>' + fmtN(total) + ' заявок</strong></div></div><div class="row" style="gap:.5rem"><button class="btn btn-sm" onclick="go(\'tasks\')">К заявкам</button></div></div>');
                    renderApp();
                  });
              }

              return fetch('/api/excel/import-rows', {
                method: 'POST', 
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + S.token // ДОБАВИЛИ ТОКЕН
                },
                body: JSON.stringify({rows: batch, name: file.name, isFirst: isFirst, totalRows: total, isLast: (sent + batch.length >= total)})
              })
              .then(function(r) {
                if (!r.ok) throw new Error('Ошибка сервера: ' + r.status); // ПРОВЕРКА ОШИБКИ (чтобы не было <)
                return r.json();
              })
              .then(function(result) {
                if (result.error) throw new Error(result.error);
                sent += batch.length;
                var p = Math.round((sent / total) * 100);
                setStatus(
                  '<div style="margin-top:1rem">' +
                    '<div style="display:flex; justify-content:space-between; font-size:.8rem; font-weight:600; margin-bottom:6px">' +
                      '<span>Импорт в базу...</span><span>' + p + '% (' + sent + ' / ' + total + ')</span>' +
                    '</div>' +
                    '<div class="prog"><div class="prog-fill" style="width:' + p + '%"></div></div>' +
                  '</div>'
                );
                return sendBatch(false);
              });
            }

            sendBatch(true).catch(function(e){ showErr(e.message); });
          } catch(e) { showErr('Ошибка парсинга: ' + e.message); }
        }, 50);
      } catch(e) { showErr('Ошибка чтения файла: ' + e.message); }
    }, 50);
  };
  reader.readAsArrayBuffer(file);
}



// ─── ACTIONS ─────────────────────────────────────────────────────────────────
// Отправка PDF в нейросеть и автозаполнение формы
// Отправка PDF в нейросеть (Асинхронно)
function processPdfWithAi(inputEl) {
  var file = inputEl.files[0];
  if (!file) return;
  S.pendingPdfFile = file; // Запоминаем файл для прикрепления к заявке

  switchDocTab('pdf');
  updateDocTabBadges();

  var emptyMsg = document.getElementById('ai_pdf_empty_msg');
  if (emptyMsg) emptyMsg.style.display = 'none';

  // Загружаем PDF в превью прямо в браузере
  var previewWrap = document.getElementById('ai_pdf_preview_wrap');
  var previewFrame = document.getElementById('ai_pdf_preview_frame');
  if (previewWrap && previewFrame) {
    previewFrame.src = URL.createObjectURL(file);
    previewWrap.style.display = 'block';
  }
  var fd = new FormData();
  fd.append('file', file);
  
  var btn = inputEl.nextElementSibling;
  S.aiParserBtnText = btn.innerHTML; // Запоминаем текст кнопки
  S.aiParserBtn = btn;
  S.aiParserInput = inputEl;
  
  btn.innerHTML = '<span class="btn-spinner"></span> Анализ документа...';
  btn.disabled = true;

  var logBox = document.getElementById('ai_log_box');
  var logContent = document.getElementById('ai_log_content');
  if (logBox && logContent) {
    logContent.innerHTML = '';
    logBox.style.display = 'block';
    logBox.classList.add('terminal-pulse');
  }
  fetch('/api/ai/parse-pdf', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + S.token },
    body: fd
  })
  .then(function(r) { 
    if (!r.ok) return r.text().then(text => { throw new Error(text); });
    return r.json(); 
  })
  .catch(function(e) {
    // Сброс кнопки только если ошибка сети
    btn.innerHTML = S.aiParserBtnText;
    btn.disabled = false;
    inputEl.value = '';
    alert('Ошибка загрузки файла: ' + e.message);
  });
  // Важно: мы не ждем данных здесь. Мы просто загрузили файл.
}

// ─── TABS & PENDING FILES (Заказ / Схема / Чек-лист на форме создания) ──────
S.pendingSchemeFiles = [];
S.pendingChecklistFiles = [];
