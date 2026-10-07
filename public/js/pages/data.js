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

  // Список договоров для привязки и автозаполнения
  var contractsList = (S.contracts || []).slice().sort(function(a, b) {
    return (b.id || 0) - (a.id || 0);
  });
  var contractOptions = contractsList.map(function(c) {
    var numPart = (c.internal_number ? 'Вн. № ' + c.internal_number : '') +
      (c.contract_number ? (c.internal_number ? ' (№ ' + c.contract_number + ')' : '№ ' + c.contract_number) : '');
    var custPart = c.customer_name || 'Заказчик не указан';
    var subjPart = c.contract_type_summary || (c.subject ? c.subject.slice(0, 38) + '…' : '');
    var label = (numPart ? numPart + ' · ' : '') + custPart + (subjPart ? ' · ' + subjPart : '');
    var isSel = S.prefillContractId && String(S.prefillContractId) === String(c.id);
    return '<option value="' + c.id + '"' + (isSel ? ' selected' : '') + '>' + escHtml(label) + '</option>';
  }).join('');

  if (S.prefillContractId) {
    var pendingContractId = S.prefillContractId;
    setTimeout(function() {
      var sel = document.getElementById('nt_contract_id');
      if (sel) {
        sel.value = String(pendingContractId);
        onScenario3ContractChange(pendingContractId);
      }
      delete S.prefillContractId;
    }, 80);
  }

  return '<h1 class="page-title">Данные и интеграции</h1>' +
    curBanner +
    '<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start;">' +
      
      // ЛЕВАЯ КОЛОНКА: СЦЕНАРИИ 1 И 2
      '<div style="display:flex; flex-direction:column; gap:1.5rem">' +

        // СЦЕНАРИЙ 1: УНИВЕРСАЛЬНАЯ ЗАГРУЗКА РЕЕСТРОВ И ТАБЛИЦ
        '<div class="card p">' +
          '<div class="fw7 mb" style="font-size:1.05rem; display:flex; align-items:center; justify-content:space-between">' +
            '<span>📊 Сценарий 1: Загрузка реестров и таблиц</span>' +
            '<span class="badge b-blue" style="font-size:.7rem">.xlsx / .xls / .docx</span>' +
          '</div>' +
          '<p class="t2 mb" style="font-size:.82rem">Универсальный импорт: сводные таблицы заявок Заказчиков, списки специалистов (монтажники с паспортами) и реестры доверенностей.</p>' +
          '<div class="upload-zone" id="uzone" onclick="document.getElementById(\'ufile\').click()" style="cursor:pointer">' +
            '<input type="file" id="ufile" accept=".xlsx,.xls,.docx">' +
            '<div style="font-size:2.2rem;margin-bottom:.4rem">📂</div>' +
            '<div class="fw6">Нажмите или перетащите файл реестра</div>' +
            '<div class="t3" style="font-size:.75rem;margin-top:4px">Сводные таблицы .xlsx, специалисты .docx / .xlsx, доверенности .xlsx</div>' +
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

          // ВЫБОР ДОГОВОРА ДЛЯ СВЯЗКИ И АВТОЗАПОЛНЕНИЯ
          '<div style="background:#f8fafc; border:1.5px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:4px">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px">' +
              '<label class="fw6" style="font-size:.78rem; display:flex; align-items:center; gap:6px; color:var(--text)">' +
                '<span>📄 Договор / Контракт</span>' +
                '<span class="badge b-blue" style="font-size:.65rem">Автозаполнение</span>' +
              '</label>' +
              '<span id="nt_contract_autofill_badge" style="display:none; font-size:.72rem; color:var(--green); font-weight:700">✓ Заполнено из договора</span>' +
            '</div>' +
            '<select id="nt_contract_id" onchange="onScenario3ContractChange(this.value)" style="width:100%; font-size:.82rem; font-weight:600; padding:6px 8px; border-radius:6px; border:1px solid var(--border); background:#fff">' +
              '<option value="">— Без привязки (или выберите договор для автозаполнения) —</option>' +
              contractOptions +
            '</select>' +
            '<div style="font-size:.72rem; color:var(--text-3); margin-top:4px">' +
              'При выборе договора автоматически заполнятся: заказчик, регион, адрес, вид работ, куратор и дедлайн.' +
            '</div>' +
          '</div>' +

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
            '<input id="nt_manager" type="text" placeholder="Менеджер / Контакт Заказчика">' +
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
      if (!ws || !ws['!ref']) continue;

      // Разворачиваем вертикальные объединения ячеек, чтобы дочерние строки работ не теряли ID и реквизиты
      var merges = ws['!merges'] || [];
      for (var mi = 0; mi < merges.length; mi++) {
        var m = merges[mi];
        if (m.e.r > m.s.r) {
          var topKey = XLSX.utils.encode_cell(m.s);
          var topCell = ws[topKey];
          if (topCell && topCell.v !== undefined && topCell.v !== '') {
            for (var mr = m.s.r; mr <= m.e.r; mr++) {
              for (var mc = m.s.c; mc <= m.e.c; mc++) {
                if (mr === m.s.r && mc === m.s.c) continue;
                var subKey = XLSX.utils.encode_cell({ r: mr, c: mc });
                if (!ws[subKey] || ws[subKey].v === undefined || ws[subKey].v === '') {
                  ws[subKey] = Object.assign({}, topCell);
                }
              }
            }
          }
        }
      }

      var rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
      if (!rows.length) continue;

      // --- ШАГ 1: ОПРЕДЕЛЯЕМ КОЛОНКИ (ОДИН РАЗ НА ЛИСТ) ---
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
          if (usedCols.has(key)) continue;

          var normKey = key.toLowerCase().replace(/[^а-яёa-z0-9]/g, '');
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

      // --- ШАГ 2: ПАРСИНГ СТРОК И ГРУППИРОВКА ПОЗИЦИЙ ПО ЗАЯВКЕ ---
      var sheetTasks = {};
      var sheetTaskOrder = [];

      for (var ri = 0; ri < rows.length; ri++) {
        var row = rows[ri];
        var num = strVal(row[colMap['Номер']]).trim();
        if (!num) continue;

        var work = strVal(row[colMap['ТИП РАБОТ']]);
        var inOrder = parseNum(row[colMap['В заказе']]);
        var fact = parseNum(row[colMap['Факт']]);
        var priceUnit = parseNum(row[colMap['Стоимость за ед.']]);
        var rowAmount = parseNum(row[colMap['Сумма договора']]);
        var contractor = strVal(row[colMap['Подрядчик']]);
        var distKm = parseNum(row[colMap['Удаленность']]);

        var itemObj = {
          workType: work || 'Монтажные работы',
          quantity: fact || inOrder || 1,
          unit: 'шт.',
          priceCustomer: priceUnit || (inOrder > 0 && rowAmount > 0 ? Math.round(rowAmount / inOrder) : 0),
          amountCustomer: rowAmount || ((fact || inOrder || 1) * priceUnit) || 0,
          contractor: contractor || null,
          distanceKm: distKm || 0
        };

        if (sheetTasks[num]) {
          var existing = sheetTasks[num];
          existing.items.push(itemObj);
          existing.inOrder = (existing.inOrder || 0) + inOrder;
          existing.fact = (existing.fact || 0) + fact;
          if (rowAmount > 0) existing.amount = (existing.amount || 0) + rowAmount;
          if (!existing.workType && work) existing.workType = work;
          else if (work && !existing.workType.includes(work)) {
            existing.workType += '; ' + work;
          }
          continue;
        }

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

        var taskObj = {
          id: num, 
          sheet: shName,
          title: num + (addr ? ' — ' + addr.slice(0, 80) : ''),
          region: strVal(row[colMap['Регион']]).split(/[\s,\n]/)[0].trim(),
          address: addr,
          workType: work,
          tipObj: strVal(row[colMap['Тип объекта']]),
          gosb: strVal(row[colMap['№ ГОСБ']]),
          vsp: strVal(row[colMap['№ ВСП']]),
          dateZayavki: parseDate(row[colMap['Дата заявки']]),
          deadline: parseDate(row[colMap['Дата окончания работ']]),
          currentDate: parseDate(row[colMap['Текущая дата']]),
          manager: strVal(row[colMap['Менеджер Сбера']]),
          contact: strVal(row[colMap['Контакт']]),
          contractor: contractor,
          inOrder: inOrder,
          fact: fact,
          obsledovanie: strVal(row[colMap['Обследование']]),
          dostup: strVal(row[colMap['Доступ']]),
          dataVyhoda: dataVyhoda,
          priemka: strVal(row[colMap['Приёмка']]),
          oplata: strVal(row[colMap['Оплата подрядчику']]),
          idStatus: strVal(row[colMap['ИД']]),
          amount: rowAmount,
          distanceKm: distKm,
          pricePerUnit: priceUnit,
          tmc: parseNum(row[colMap['ТМЦ']]),
          extras: parseNum(row[colMap['Допы']]),
          overdueDays: overdue,
          techLink: strVal(row[colMap['Ссылка на Тех.Информацию']]),
          edoNumber: strVal(row[colMap['№ документа в ЭДО']]),
          invoiceInfo: strVal(row[colMap['№ счета/сумма']]),
          vedoStatus: strVal(row[colMap['В ЭДО']]),
          excelComment: strVal(row[colMap['Комментарий']]),
          status: status, 
          stage: stage,
          archived: false,
          items: [itemObj],
          rawData: (function() {
            var raw = {};
            Object.keys(row).forEach(function(k) {
              if (!k.trim().startsWith('__')) raw[k.trim()] = strVal(row[k]);
            });
            return raw;
          })()
        };

        sheetTasks[num] = taskObj;
        sheetTaskOrder.push(num);
      }

      for (var oi = 0; oi < sheetTaskOrder.length; oi++) {
        allRows.push(sheetTasks[sheetTaskOrder[oi]]);
      }
    }
    return allRows;
  }


var _pendingUniversalUpload = {
  file: null,
  wb: null,
  selectedType: 'svodnye',
  detectedType: 'svodnye'
};

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 Б';
  var k = 1024;
  var sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i >= sizes.length) i = sizes.length - 1;
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function closeUniversalUploadModal() {
  var m = document.getElementById('universal_upload_modal');
  if (m) m.remove();
  var ufile = document.getElementById('ufile');
  if (ufile) ufile.value = '';
}

function selectUploadType(type) {
  if (!_pendingUniversalUpload) return;
  _pendingUniversalUpload.selectedType = type;
  var types = ['svodnye', 'specialists', 'poa'];
  types.forEach(function(t) {
    var card = document.getElementById('upload_opt_' + t);
    var radio = document.getElementById('upload_radio_' + t);
    if (!card || !radio) return;
    var isSel = (t === type);
    card.style.border = isSel ? '2px solid var(--accent, #ea580c)' : '1.5px solid var(--border, #e2e8f0)';
    card.style.background = isSel ? 'rgba(234, 88, 12, 0.04)' : '#fff';
    radio.style.borderColor = isSel ? 'var(--accent, #ea580c)' : '#cbd5e1';
    radio.style.background = isSel ? 'var(--accent, #ea580c)' : '#fff';
    radio.innerHTML = isSel ? '<span style="display:block;width:6px;height:6px;border-radius:50%;background:#fff;margin:auto"></span>' : '';
  });
}

function executeUniversalUpload() {
  if (!_pendingUniversalUpload || !_pendingUniversalUpload.file) return;
  var info = _pendingUniversalUpload;
  var file = info.file;
  var selectedType = info.selectedType;
  var wb = info.wb;

  closeUniversalUploadModal();

  if (selectedType === 'svodnye') {
    runSvodnyeImport(file, wb);
  } else if (selectedType === 'specialists') {
    runSpecialistsImport(file);
  } else if (selectedType === 'poa') {
    runPoaImport(file);
  }
}

function openUploadTypeModal(file, detectedType, wb) {
  _pendingUniversalUpload = {
    file: file,
    wb: wb,
    selectedType: detectedType,
    detectedType: detectedType
  };

  var old = document.getElementById('universal_upload_modal');
  if (old) old.remove();

  var isDocx = /\.docx$/i.test(file.name || '');
  var ext = (file.name || '').split('.').pop().toUpperCase();

  var modal = document.createElement('div');
  modal.id = 'universal_upload_modal';
  modal.className = 'modal-overlay';
  modal.style.zIndex = '1200';

  function buildCard(type, icon, title, formats, desc) {
    var isSelected = (type === detectedType);
    var isDetected = (type === detectedType);
    var isDisabled = isDocx && (type === 'svodnye' || type === 'poa');

    var borderStyle = isSelected ? '2px solid var(--accent, #ea580c)' : '1.5px solid var(--border, #e2e8f0)';
    var bgStyle = isSelected ? 'rgba(234, 88, 12, 0.04)' : '#fff';
    var clickAttr = isDisabled ? '' : 'onclick="selectUploadType(\'' + type + '\')"';
    var cursorStyle = isDisabled ? 'cursor:not-allowed; opacity:.55; background:#f8fafc;' : 'cursor:pointer;';

    return '<div id="upload_opt_' + type + '" class="upload-type-card" ' + clickAttr + ' ' +
      'style="border-radius:10px; border:' + borderStyle + '; background:' + bgStyle + '; padding:12px 14px; transition:all .15s ease; ' + cursorStyle + '">' +
        '<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px">' +
          '<div style="display:flex; align-items:flex-start; gap:12px">' +
            '<div style="font-size:1.6rem; line-height:1; padding-top:2px">' + icon + '</div>' +
            '<div>' +
              '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">' +
                '<span class="fw7" style="font-size:.92rem; color:var(--text)">' + title + '</span>' +
                '<span class="badge b-blue" style="font-size:.65rem; padding:1px 6px">' + formats + '</span>' +
              '</div>' +
              '<div class="t3" style="font-size:.76rem; margin-top:3px; line-height:1.35">' + desc + '</div>' +
              (isDisabled ? '<div style="font-size:.72rem; color:#dc2626; margin-top:4px; font-weight:600">⚠️ Формат .docx поддерживается только для специалистов</div>' : '') +
            '</div>' +
          '</div>' +
          '<div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px; flex-shrink:0">' +
            (isDetected ? '<span class="badge b-green" style="font-size:.68rem; font-weight:700">✓ Распознано</span>' : '') +
            '<div id="upload_radio_' + type + '" style="width:18px; height:18px; border-radius:50%; border:2px solid ' + (isSelected ? 'var(--accent, #ea580c)' : '#cbd5e1') + '; background:' + (isSelected ? 'var(--accent, #ea580c)' : '#fff') + '; display:flex; align-items:center; justify-content:center; margin-top:2px">' +
              (isSelected ? '<span style="display:block;width:6px;height:6px;border-radius:50%;background:#fff;margin:auto"></span>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  modal.innerHTML = '<div class="modal-box" style="max-width:580px; width:95%; border-radius:12px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2), 0 10px 10px -5px rgba(0,0,0,0.1); padding:1.4rem 1.5rem; background:var(--surface,#fff);">' +
    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:.9rem; border-bottom:1px solid var(--border); padding-bottom:.75rem">' +
      '<div style="display:flex; align-items:center; gap:8px">' +
        '<span style="font-size:1.35rem">📥</span>' +
        '<h3 style="margin:0; font-size:1.08rem; font-weight:700">Подтверждение импорта файла</h3>' +
      '</div>' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="closeUniversalUploadModal()" style="font-size:1.1rem; line-height:1; padding:4px 8px">✕</button>' +
    '</div>' +

    '<div style="background:#f8fafc; border:1px solid var(--border); border-radius:8px; padding:10px 14px; margin-bottom:1.1rem; display:flex; align-items:center; justify-content:space-between; gap:12px">' +
      '<div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:400px">' +
        '<div class="fw6" style="font-size:.88rem; color:var(--text); overflow:hidden; text-overflow:ellipsis" title="' + escHtml(file.name) + '">📄 ' + escHtml(file.name) + '</div>' +
        '<div class="t3" style="font-size:.75rem; margin-top:2px">Размер: ' + formatFileSize(file.size) + '</div>' +
      '</div>' +
      '<span class="badge b-blue" style="font-size:.72rem; font-weight:700">' + ext + '</span>' +
    '</div>' +

    '<div class="t2" style="font-size:.82rem; font-weight:600; margin-bottom:.6rem">' +
      'Система проанализировала файл. Подтвердите или выберите нужный тип данных:' +
    '</div>' +

    '<div style="display:flex; flex-direction:column; gap:.6rem; margin-bottom:1.4rem">' +
      buildCard('svodnye', '📊', 'Сводная таблица заявок', '.xlsx / .xls', 'Импорт и обновление заявок заказчиков (листы «Заявки 20XX»). Пакетная выгрузка по 200 строк с сохранением истории и чатов.') +
      buildCard('specialists', '👷', 'Справочник специалистов', '.docx / .xlsx', 'База полевых монтажников и инженеров с паспортами и телефонами для формирования писем на допуск.') +
      buildCard('poa', '📜', 'Реестр доверенностей', '.xlsx / .xls', 'Реестр доверенностей с номерами, сроками действия и авто-сопоставлением контрагентов.') +
    '</div>' +

    '<div style="display:flex; justify-content:flex-end; gap:.6rem; border-top:1px solid var(--border); padding-top:1rem">' +
      '<button type="button" class="btn btn-ghost" onclick="closeUniversalUploadModal()">Отмена</button>' +
      '<button type="button" class="btn btn-primary" onclick="executeUniversalUpload()" style="font-weight:600; padding:.5rem 1.4rem">' +
        'Запустить импорт →' +
      '</button>' +
    '</div>' +
  '</div>';

  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeUniversalUploadModal();
  });

  document.body.appendChild(modal);
}

// ─── ИМПОРТ: СВОДНЫЕ ТАБЛИЦЫ (НЕИЗМЕННЫЙ АЛГОРИТМ ПАРСИНГА) ───────────────────
function runSvodnyeImport(file, wb) {
  var st = document.getElementById('ustatus');
  function setStatus(html) { if (st) st.innerHTML = html; }
  function showErr(msg) {
    setStatus('<div class="banner" style="background:#FEE2E2;border:1px solid #FECACA"><div><div class="banner-title" style="color:#B91C1C">❌ Ошибка</div><div class="banner-body">' + msg + '</div></div></div>');
  }

  function proceedWithWorkbook(workbook) {
    var hasSheets = workbook.SheetNames.some(function(n){ return n.startsWith('Заявки'); });
    if (!hasSheets) {
      setStatus('<div class="banner banner-warn"><div><div class="banner-title">⚠️ Файл не распознан как сводная таблица</div><div class="banner-body">В файле нет листов «Заявки 20XX». Убедитесь, что выбран корректный файл реестра заявок. Данные не изменены.</div></div></div>');
      return;
    }

    setStatus('<div class="spin-wrap"><div class="spin"></div><p style="margin-top:.6rem">Парсинг сводной таблицы заявок…</p></div>');

    setTimeout(function() {
      try {
        var rows = clientParseSvodnye(workbook);
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

        var currentBatchId = null;
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
              'Authorization': 'Bearer ' + (S.token || localStorage.getItem('token') || '')
            },
            body: JSON.stringify({rows: batch, name: file.name, isFirst: isFirst, totalRows: total, isLast: (sent + batch.length >= total), batchId: currentBatchId})
          })
          .then(function(r) {
            if (!r.ok) throw new Error('Ошибка сервера: ' + r.status);
            return r.json();
          })
          .then(function(result) {
            if (result.error) throw new Error(result.error);
            if (result.batchId) currentBatchId = result.batchId;
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
  }

  if (wb) {
    proceedWithWorkbook(wb);
  } else {
    setStatus('<div class="spin-wrap"><div class="spin"></div><p style="margin-top:.6rem">Читаем файл…</p></div>');
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = new Uint8Array(e.target.result);
        var parsedWb = XLSX.read(data, {type:'array', cellDates:true, cellFormula:false, cellText:false});
        proceedWithWorkbook(parsedWb);
      } catch(err) {
        showErr('Ошибка чтения файла: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

// ─── ИМПОРТ: СПЕЦИАЛИСТЫ (.DOCX / .XLSX) ───────────────────────────────────────
function runSpecialistsImport(file) {
  var st = document.getElementById('ustatus');
  function setStatus(html) { if (st) st.innerHTML = html; }
  function showErr(msg) {
    setStatus('<div class="banner" style="background:#FEE2E2;border:1px solid #FECACA"><div><div class="banner-title" style="color:#B91C1C">❌ Ошибка</div><div class="banner-body">' + msg + '</div></div></div>');
  }

  setStatus('<div class="spin-wrap"><div class="spin"></div><p style="margin-top:.6rem">Загрузка и обработка файла специалистов…</p></div>');

  var fd = new FormData();
  fd.append('file', file);

  fetch('/api/directories/upload-specialists', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + (S.token || localStorage.getItem('token') || '')
    },
    body: fd
  })
  .then(function(r) {
    if (!r.ok) return r.json().then(function(j) { throw new Error(j.error || ('Ошибка сервера: ' + r.status)); });
    return r.json();
  })
  .then(function(res) {
    if (res.error) throw new Error(res.error);
    if (typeof api === 'function') {
      api('/specialists').then(function(specs) { S.specialists = specs; }).catch(function(){});
    }
    var msg = 'Добавлено новых специалистов: <strong>' + (res.inserted || 0) + '</strong>, обновлено существующих: <strong>' + (res.updated || 0) + '</strong> (всего обработано: ' + (res.total || 0) + ').';
    setStatus(
      '<div class="banner banner-ok"><div>' +
        '<div class="banner-title">✅ Специалисты успешно импортированы!</div>' +
        '<div class="banner-body">' + msg + '</div>' +
      '</div></div>' +
      '<div class="row" style="gap:.5rem; margin-top:.5rem">' +
        '<button class="btn btn-sm" onclick="go(\'users\')">Открыть специалистов</button>' +
      '</div>'
    );
  })
  .catch(function(e) {
    showErr(e.message);
  });
}

// ─── ИМПОРТ: ДОВЕРЕННОСТИ (.XLSX) ─────────────────────────────────────────────
function runPoaImport(file) {
  var st = document.getElementById('ustatus');
  function setStatus(html) { if (st) st.innerHTML = html; }
  function showErr(msg) {
    setStatus('<div class="banner" style="background:#FEE2E2;border:1px solid #FECACA"><div><div class="banner-title" style="color:#B91C1C">❌ Ошибка</div><div class="banner-body">' + msg + '</div></div></div>');
  }

  setStatus('<div class="spin-wrap"><div class="spin"></div><p style="margin-top:.6rem">Загрузка реестра доверенностей и сопоставление контрагентов…</p></div>');

  var fd = new FormData();
  fd.append('file', file);

  fetch('/api/directories/upload-poa', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + (S.token || localStorage.getItem('token') || '')
    },
    body: fd
  })
  .then(function(r) {
    if (!r.ok) return r.json().then(function(j) { throw new Error(j.error || ('Ошибка сервера: ' + r.status)); });
    return r.json();
  })
  .then(function(res) {
    if (res.error) throw new Error(res.error);
    var p = res.poa || {};
    var c = res.contractors || {};
    if (typeof api === 'function') {
      api('/contractors').then(function(conts) { S.contractors = conts; }).catch(function(){});
      api('/powers-of-attorney').then(function(poas) { S.powersOfAttorney = poas; }).catch(function(){});
    }
    var msg = 'Доверенностей добавлено: <strong>' + (p.inserted || 0) + '</strong>, обновлено: <strong>' + (p.updated || 0) + '</strong>.<br>' +
              'Контрагентов связано и актуализировано: <strong>' + ((c.added || 0) + (c.updated || 0)) + '</strong>.';
    setStatus(
      '<div class="banner banner-ok"><div>' +
        '<div class="banner-title">✅ Реестр доверенностей успешно импортирован!</div>' +
        '<div class="banner-body">' + msg + '</div>' +
      '</div></div>' +
      '<div class="row" style="gap:.5rem; margin-top:.5rem">' +
        '<button class="btn btn-sm" onclick="go(\'contractors\')">К контрагентам</button>' +
        '<button class="btn btn-sm btn-ghost" onclick="go(\'users\')">К доверенностям</button>' +
      '</div>'
    );
  })
  .catch(function(e) {
    showErr(e.message);
  });
}

// ─── ТОЧКА ВХОДА ДЛЯ ЗАГРУЗКИ ФАЙЛА В СЦЕНАРИИ 1 ──────────────────────────────
function doUpload(file) {
  if (!file) return;
  var name = file.name || '';
  var isDocx = /\.docx$/i.test(name);
  var isXls = /\.(xlsx|xls)$/i.test(name);

  if (!isDocx && !isXls) {
    alert('Неподдерживаемый формат файла. Пожалуйста, выберите файл .xlsx, .xls или .docx');
    return;
  }

  var st = document.getElementById('ustatus');
  function setStatus(html) { if (st) st.innerHTML = html; }

  // 1. Файл Word (.docx) — гарантированно справочник специалистов
  if (isDocx) {
    openUploadTypeModal(file, 'specialists', null);
    return;
  }

  // 2. Файлы Excel (.xlsx / .xls) — анализируем листы и структуру
  setStatus('<div class="spin-wrap"><div class="spin"></div><p style="margin-top:.6rem">Анализируем структуру файла…</p></div>');

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = new Uint8Array(e.target.result);
      var wb = XLSX.read(data, {type:'array', cellDates:true, cellFormula:false, cellText:false});
      var sheetNames = wb.SheetNames || [];

      var hasSvodnyeSheets = sheetNames.some(function(n){ return /^Заявки/i.test(n) || n.indexOf('Заявки') !== -1; });
      var hasPoaSheets = sheetNames.some(function(n){ return /довер/i.test(n); });
      var hasSpecSheets = sheetNames.some(function(n){ return /специалист|монтажн|паспорт|сотрудник/i.test(n); });

      var detected = 'svodnye';
      if (hasSvodnyeSheets) {
        detected = 'svodnye';
      } else if (hasPoaSheets) {
        detected = 'poa';
      } else if (hasSpecSheets) {
        detected = 'specialists';
      } else {
        // Дополнительная проверка шапки первого листа
        try {
          var firstSheet = wb.Sheets[sheetNames[0]];
          if (firstSheet) {
            var rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, range: 0, defval: '' });
            var flatStr = (rows.slice(0, 5).flat() || []).join(' ').toLowerCase();
            if (/довер/i.test(flatStr)) detected = 'poa';
            else if (/монтажн|паспорт|специалист/i.test(flatStr)) detected = 'specialists';
            else detected = 'svodnye';
          }
        } catch(_) {
          detected = 'svodnye';
        }
      }

      setStatus('');
      openUploadTypeModal(file, detected, wb);
    } catch(err) {
      setStatus('<div class="banner" style="background:#FEE2E2;border:1px solid #FECACA"><div><div class="banner-title" style="color:#B91C1C">❌ Ошибка чтения файла</div><div class="banner-body">' + err.message + '</div></div></div>');
    }
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

// Обработчик выбора договора в Сценарии 3: автозаполнение полей заявки
function onScenario3ContractChange(contractId) {
  var badge = document.getElementById('nt_contract_autofill_badge');
  if (!contractId) {
    if (badge) badge.style.display = 'none';
    return;
  }
  var c = (S.contracts || []).find(function(x) { return String(x.id) === String(contractId); });
  if (!c) return;

  // 1. Заказчик
  var custSelect = document.getElementById('nt_customer');
  if (custSelect && c.customer_name) {
    var found = false;
    for (var i = 0; i < custSelect.options.length; i++) {
      if (custSelect.options[i].value.toLowerCase().trim() === c.customer_name.toLowerCase().trim()) {
        custSelect.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (!found) {
      var opt = document.createElement('option');
      opt.value = c.customer_name;
      opt.textContent = c.customer_name;
      custSelect.appendChild(opt);
      custSelect.value = c.customer_name;
    }
  }

  // 2. Регион
  var regEl = document.getElementById('nt_region');
  if (regEl && c.our_entity_region) {
    regEl.value = c.our_entity_region;
  }

  // 3. Адрес объекта
  var addrEl = document.getElementById('nt_address');
  if (addrEl && c.delivery_place) {
    addrEl.value = c.delivery_place;
  }

  // 4. Вид работ
  var wtEl = document.getElementById('nt_workType');
  if (wtEl && (c.contract_type_summary || c.subject)) {
    wtEl.value = c.contract_type_summary || c.subject;
  }

  // 5. Менеджер / куратор заказчика
  var mgrEl = document.getElementById('nt_manager');
  if (mgrEl && (c.manager_name || c.contacts_raw)) {
    mgrEl.value = c.manager_name ? (c.manager_name + (c.contacts_raw ? ' (' + c.contacts_raw + ')' : '')) : c.contacts_raw;
  }

  // 6. Комментарий
  var commEl = document.getElementById('nt_comment');
  if (commEl && c.subject) {
    var contractLabel = c.internal_number ? ('Вн. № ' + c.internal_number) : (c.contract_number ? ('№ ' + c.contract_number) : ('ID ' + c.id));
    commEl.value = 'По договору ' + contractLabel + ': ' + c.subject;
  }

  // 7. Дедлайн
  var dlEl = document.getElementById('nt_deadline');
  if (dlEl && c.deadline_date) {
    dlEl.value = String(c.deadline_date).slice(0, 10);
  }

  // 8. Ссылка на диск / облако
  var techEl = document.getElementById('nt_techLink');
  if (techEl && c.cloud_url && !techEl.value.trim()) {
    techEl.value = c.cloud_url;
  }

  // 9. Префикс для ID заявки, если еще не введен
  var idEl = document.getElementById('nt_id');
  if (idEl && !idEl.value.trim()) {
    var prefix = c.internal_number ? (c.internal_number + '-') : (c.contract_number ? (c.contract_number + '-') : 'З-');
    idEl.value = prefix;
    idEl.focus();
  }

  if (badge) {
    badge.style.display = 'inline';
    badge.textContent = '✓ Заполнено из договора';
    setTimeout(function() {
      if (badge) badge.style.display = 'none';
    }, 4500);
  }
}
