// public/js/documentEditor.js
// Универсальный визуальный редактор документов Stockeasy (Word А4 / Таблицы / Печать / Реестр)

(function() {
  'use strict';

  var _editorState = {
    docId: null,
    taskId: null,
    contractId: null,
    subcontractId: null,
    templateCode: null,
    format: 'word',
    context: {},
    availableVariables: [],
    templatesList: [],
    onSaved: null
  };

  /**
   * Открыть документ в универсальном редакторе прямо в приложении
   * @param {Object} opts { templateCode, existingDocId, taskId, contractId, subcontractId, customData, onSaved }
   */
  window.openDocumentEditor = function(opts) {
    opts = opts || {};
    _editorState.docId = opts.existingDocId || null;
    _editorState.taskId = opts.taskId || null;
    _editorState.contractId = opts.contractId || null;
    _editorState.subcontractId = opts.subcontractId || null;
    _editorState.templateCode = opts.templateCode || null;
    _editorState.format = opts.format || 'word';
    _editorState.onSaved = opts.onSaved || null;
    _editorState.context = {};

    var old = document.getElementById('_doc_editor_modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = '_doc_editor_modal';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '99999';
    modal.style.padding = '0';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.background = 'rgba(15, 23, 42, 0.75)';

    modal.innerHTML = 
      '<div class="doc-editor-container" style="display:flex;flex-direction:column;width:100%;height:100vh;background:#f1f5f9;overflow:hidden">' +
        // 1. Верхняя панель управления (Header)
        '<header style="display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:#fff;border-bottom:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.05);z-index:20;flex-wrap:wrap;gap:8px">' +
          '<div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1">' +
            '<span style="font-size:1.4rem" title="Редактор документов">📄</span>' +
            '<div style="display:flex;flex-direction:column;min-width:0;flex:1">' +
              '<input type="text" id="_doc_edit_title" value="Загрузка документа..." style="font-weight:700;font-size:1rem;color:var(--text);border:1px solid transparent;border-radius:4px;padding:2px 6px;max-width:550px;background:transparent" title="Нажмите для редактирования названия документа" onfocus="this.style.background=\'#fff\';this.style.borderColor=\'var(--blue)\'" onblur="this.style.background=\'transparent\';this.style.borderColor=\'transparent\'" />' +
              '<div style="display:flex;align-items:center;gap:8px;font-size:.74rem;color:var(--text-3);padding-left:6px">' +
                '<span id="_doc_edit_meta_info">Встроенный редактор Stockeasy</span>' +
                '<span>·</span>' +
                '<label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer">' +
                  '<span>Статус:</span>' +
                  '<select id="_doc_edit_status" style="font-size:.74rem;padding:1px 4px;border-radius:4px;border:1px solid var(--border)">' +
                    '<option value="draft">📝 Черновик</option>' +
                    '<option value="generated" selected>⚡ Сформирован</option>' +
                    '<option value="issued">⏳ Выставлен</option>' +
                    '<option value="signed">✍️ Подписан</option>' +
                    '<option value="paid">✅ Оплачен</option>' +
                  '</select>' +
                '</label>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // Центральный переключатель шаблонов
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span style="font-size:.78rem;color:var(--text-2);white-space:nowrap">Шаблон:</span>' +
            '<select id="_doc_edit_template_sel" style="font-size:.8rem;padding:4px 8px;border-radius:6px;border:1px solid var(--border);max-width:260px;font-weight:500" onchange="window._onSwitchDocTemplate(this.value)">' +
              '<option value="">Выбор шаблона...</option>' +
            '</select>' +
          '</div>' +

          // Правые кнопки действий
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<button type="button" class="btn btn-sm btn-primary" onclick="window._saveDocEditor()" style="display:inline-flex;align-items:center;gap:5px;font-weight:600">' +
              '<span>💾</span> Сохранить' +
            '</button>' +
            '<button type="button" class="btn btn-sm" onclick="window._printDocEditor()" style="display:inline-flex;align-items:center;gap:5px;background:#fff;border:1px solid var(--border);color:var(--text);font-weight:500">' +
              '<span>🖨️</span> Печать / PDF' +
            '</button>' +

            // Меню скачивания на всякий случай
            '<div style="position:relative;display:inline-block">' +
              '<button type="button" class="btn btn-sm btn-ghost" onclick="window._toggleDocDownloadMenu()" style="display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border);font-size:.78rem" title="Скачать файл на компьютер">' +
                '<span>📥 Скачать</span> ▾' +
              '</button>' +
              '<div id="_doc_download_dropdown" style="display:none;position:absolute;right:0;top:100%;margin-top:4px;background:#fff;border:1px solid var(--border);box-shadow:0 8px 24px rgba(0,0,0,0.12);border-radius:8px;padding:4px;min-width:180px;z-index:9999">' +
                '<button type="button" class="btn-link" onclick="window._downloadDocxFromEditor()" style="display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;text-align:left;font-size:.8rem;color:var(--text)">' +
                  '<span>📄</span> Скачать Word (.docx)' +
                '</button>' +
                '<button type="button" class="btn-link" onclick="window._downloadHtmlFromEditor()" style="display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;text-align:left;font-size:.8rem;color:var(--text)">' +
                  '<span>🌐</span> Скачать HTML' +
                '</button>' +
              '</div>' +
            '</div>' +

            '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_doc_editor_modal\').remove()" style="font-size:1.3rem;line-height:1;padding:2px 8px;color:var(--text-2)" title="Закрыть">&times;</button>' +
          '</div>' +
        '</header>' +

        // 2. Тулбар инструментов форматирования (Sticky toolbar)
        '<div id="_doc_toolbar" style="display:flex;align-items:center;gap:6px;padding:6px 16px;background:#f8fafc;border-bottom:1px solid var(--border);overflow-x:auto;z-index:15">' +
          '<div style="display:flex;align-items:center;gap:2px">' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._docCmd(\'bold\')" title="Жирный [Ctrl+B]" style="font-weight:700;width:28px">B</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._docCmd(\'italic\')" title="Курсив [Ctrl+I]" style="font-style:italic;width:28px">I</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._docCmd(\'underline\')" title="Подчеркнутый [Ctrl+U]" style="text-decoration:underline;width:28px">U</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._docCmd(\'strikeThrough\')" title="Зачеркнутый" style="text-decoration:line-through;width:28px">S</button>' +
          '</div>' +

          '<span style="color:var(--border)">|</span>' +

          '<div style="display:flex;align-items:center;gap:2px">' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._docCmd(\'justifyLeft\')" title="По левому краю">≡</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._docCmd(\'justifyCenter\')" title="По центру">≡</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._docCmd(\'justifyRight\')" title="По правому краю">≡</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._docCmd(\'justifyFull\')" title="По ширине (Justify)">≣</button>' +
          '</div>' +

          '<span style="color:var(--border)">|</span>' +

          '<div style="display:flex;align-items:center;gap:2px">' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._docCmd(\'insertUnorderedList\')" title="Маркированный список">• Список</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._docCmd(\'insertOrderedList\')" title="Нумерованный список">1. Список</button>' +
          '</div>' +

          '<span style="color:var(--border)">|</span>' +

          '<div style="display:flex;align-items:center;gap:4px">' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._insertDocTableRow()" title="Добавить строку в текущую таблицу" style="display:inline-flex;align-items:center;gap:4px">' +
              '<span>➕</span> Строка табл.' +
            '</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._deleteDocTableRow()" title="Удалить строку таблицы" style="display:inline-flex;align-items:center;gap:4px;color:var(--red)">' +
              '<span>➖</span> Удалить' +
            '</button>' +
          '</div>' +

          '<span style="color:var(--border)">|</span>' +

          // Кнопка вставки переменных
          '<div style="position:relative;display:inline-block">' +
            '<button type="button" class="btn btn-xs" onclick="window._toggleVariablesMenu()" style="display:inline-flex;align-items:center;gap:4px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-weight:600">' +
              '<span>{x}</span> Вставить переменную ▾' +
            '</button>' +
            '<div id="_doc_vars_dropdown" style="display:none;position:absolute;left:0;top:100%;margin-top:4px;background:#fff;border:1px solid var(--border);box-shadow:0 8px 24px rgba(0,0,0,0.15);border-radius:8px;padding:8px;width:340px;max-height:420px;overflow-y:auto;z-index:99999">' +
              '<div style="font-size:.75rem;font-weight:700;color:var(--text-3);margin-bottom:6px">ДОСТУПНЫЕ ПЕРЕМЕННЫЕ (клик для вставки):</div>' +
              '<div id="_doc_vars_list" style="display:flex;flex-direction:column;gap:4px">Загрузка переменных...</div>' +
            '</div>' +
          '</div>' +

          '<div style="flex:1"></div>' +

          // Масштаб
          '<div style="display:flex;align-items:center;gap:4px;font-size:.75rem;color:var(--text-3)">' +
            '<span>Масштаб:</span>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._setDocZoom(0.85)">85%</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._setDocZoom(1.0)">100%</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._setDocZoom(1.15)">115%</button>' +
          '</div>' +
        '</div>' +

        // 3. Рабочая область (Холст листа А4)
        '<div id="_doc_canvas" style="flex:1;overflow:auto;padding:30px 20px 60px 20px;background:#475569;display:flex;justify-content:center;align-items:flex-start">' +
          '<div id="_doc_sheet_wrap" style="transform-origin:top center;transition:transform 0.15s ease">' +
            '<div id="_doc_sheet" class="a4-sheet" contenteditable="true" spellcheck="true" style="width:210mm;min-height:297mm;padding:20mm 15mm 20mm 20mm;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,0.35);border-radius:2px;box-sizing:border-box;color:#000;font-family:\'Times New Roman\',Times,serif;font-size:13px;line-height:1.35;outline:none;position:relative">' +
              '<div style="text-align:center;padding:100px 0;color:#94a3b8"><div class="spin" style="margin:0 auto 12px"></div>Формирование документа из шаблона и данных...</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    // Закрытие выпадающих меню при клике вовне
    modal.addEventListener('click', function(e) {
      if (!e.target.closest('#_doc_vars_dropdown') && !e.target.closest('button[onclick*="_toggleVariablesMenu"]')) {
        var vd = document.getElementById('_doc_vars_dropdown');
        if (vd) vd.style.display = 'none';
      }
      if (!e.target.closest('#_doc_download_dropdown') && !e.target.closest('button[onclick*="_toggleDocDownloadMenu"]')) {
        var dd = document.getElementById('_doc_download_dropdown');
        if (dd) dd.style.display = 'none';
      }
    });

    // Загрузка справочника шаблонов для селектора
    loadTemplatesSelector();

    // Загрузка доступных переменных для вставки
    loadVariablesList();

    // Если передан существующий ID документа — загружаем его
    if (opts.existingDocId) {
      loadExistingDocument(opts.existingDocId);
    } else {
      // Иначе формируем новый документ
      renderNewDocument(opts);
    }
  };

  function loadTemplatesSelector() {
    api('/document-templates')
      .then(function(templates) {
        _editorState.templatesList = templates || [];
        var sel = document.getElementById('_doc_edit_template_sel');
        if (!sel) return;
        sel.innerHTML = '<option value="">Сменить шаблон...</option>' +
          templates.map(function(t) {
            var selected = (t.code === _editorState.templateCode) ? ' selected' : '';
            return '<option value="' + escHtml(t.code) + '"' + selected + '>' + escHtml(t.name) + '</option>';
          }).join('');
      })
      .catch(function(err) {
        console.warn('Could not load templates selector:', err);
      });
  }

  function loadVariablesList() {
    api('/document-templates-variables')
      .then(function(groups) {
        _editorState.availableVariables = groups || [];
        renderVariablesDropdown(groups || []);
      })
      .catch(function(err) {
        console.warn('Could not load variables list:', err);
      });
  }

  function renderVariablesDropdown(groups) {
    var cont = document.getElementById('_doc_vars_list');
    if (!cont) return;

    var html = '';
    groups.forEach(function(g) {
      html += '<div style="font-weight:700;font-size:.72rem;color:var(--blue);margin-top:6px;border-bottom:1px solid #e2e8f0;padding-bottom:2px">' + escHtml(g.group) + '</div>';
      g.vars.forEach(function(v) {
        html += '<button type="button" class="btn-link" onclick="window._insertVariableToDoc(\'' + escHtml(v.code) + '\')" style="display:flex;justify-content:space-between;align-items:center;padding:3px 6px;text-align:left;font-size:.76rem;border-radius:4px;color:var(--text);margin:1px 0" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'transparent\'">' +
          '<span>' + escHtml(v.label) + '</span>' +
          '<code style="font-size:.68rem;background:#f3f4f6;padding:1px 4px;border-radius:3px;color:#6b7280">{{' + escHtml(v.code) + '}}</code>' +
        '</button>';
      });
    });
    cont.innerHTML = html;
  }

  function renderNewDocument(opts) {
    var titleEl = document.getElementById('_doc_edit_title');
    var sheetEl = document.getElementById('_doc_sheet');
    var metaEl = document.getElementById('_doc_edit_meta_info');

    var postData = {
      template_code: opts.templateCode || 'order_subcontract',
      task_id: opts.taskId || undefined,
      contract_id: opts.contractId || undefined,
      subcontract_id: opts.subcontractId || undefined,
      custom_data: opts.customData || {}
    };

    api('/documents/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postData)
    })
    .then(function(res) {
      _editorState.context = res.context || {};
      _editorState.templateCode = res.template?.code;
      _editorState.format = res.template?.doc_format || 'word';

      if (titleEl) titleEl.value = res.title || 'Документ';
      if (sheetEl) sheetEl.innerHTML = res.rendered_html || '<p>Пустой документ</p>';
      if (metaEl) {
        var taskStr = opts.taskId ? ('Заявка: ' + opts.taskId) : '';
        var contractStr = opts.contractId ? ('Контракт: № ' + (res.context?.contract?.number || opts.contractId)) : '';
        metaEl.textContent = [taskStr, contractStr].filter(Boolean).join(' · ') || 'Новый документ';
      }

      // Обновляем селектор шаблонов
      var sel = document.getElementById('_doc_edit_template_sel');
      if (sel && res.template?.code) sel.value = res.template.code;
    })
    .catch(function(err) {
      if (sheetEl) {
        sheetEl.innerHTML = '<div style="color:var(--red);padding:40px;text-align:center">' +
          '<div style="font-size:2rem;margin-bottom:8px">⚠️</div>' +
          '<b>Ошибка формирования документа:</b><br/>' + escHtml(err.message) +
        '</div>';
      }
    });
  }

  function loadExistingDocument(docId) {
    var titleEl = document.getElementById('_doc_edit_title');
    var sheetEl = document.getElementById('_doc_sheet');
    var statusEl = document.getElementById('_doc_edit_status');
    var metaEl = document.getElementById('_doc_edit_meta_info');

    api('/documents/' + docId)
      .then(function(doc) {
        _editorState.docId = doc.id;
        _editorState.taskId = doc.task_id;
        _editorState.contractId = doc.contract_id;
        _editorState.subcontractId = doc.subcontract_id;
        _editorState.templateCode = doc.doc_type;
        _editorState.format = doc.doc_format || 'word';

        if (titleEl) titleEl.value = doc.title || 'Документ';
        if (statusEl && doc.status) statusEl.value = doc.status;

        if (metaEl) {
          metaEl.textContent = '№ ' + (doc.doc_number || 'б/н') + ' от ' + (doc.doc_date || '').slice(0, 10);
        }

        if (doc.content_html) {
          if (sheetEl) sheetEl.innerHTML = doc.content_html;
        } else if (doc.file_url) {
          // Если документ был создан старым генератором, пробуем показать через HTML предпросмотр
          api('/preview/attachment?file_path=' + encodeURIComponent(doc.file_url))
            .then(function(prev) {
              if (sheetEl) sheetEl.innerHTML = prev.html || '<p>Документ не содержит текста</p>';
            })
            .catch(function() {
              if (sheetEl) sheetEl.innerHTML = '<p>Документ загружен из файла</p>';
            });
        }
      })
      .catch(function(err) {
        if (sheetEl) {
          sheetEl.innerHTML = '<div style="color:var(--red);padding:40px;text-align:center">Ошибка загрузки документа: ' + escHtml(err.message) + '</div>';
        }
      });
  }

  // Смена шаблона документа «на лету» с сохранением данных
  window._onSwitchDocTemplate = function(newTemplateCode) {
    if (!newTemplateCode) return;
    if (!confirm('Переключить шаблон? Внесенные ручные правки в текст будут заменены версткой нового шаблона.')) {
      var sel = document.getElementById('_doc_edit_template_sel');
      if (sel) sel.value = _editorState.templateCode || '';
      return;
    }
    _editorState.templateCode = newTemplateCode;
    renderNewDocument({
      templateCode: newTemplateCode,
      taskId: _editorState.taskId,
      contractId: _editorState.contractId,
      subcontractId: _editorState.subcontractId
    });
  };

  // Команды форматирования
  window._docCmd = function(cmd, val) {
    document.execCommand(cmd, false, val || null);
    var sheet = document.getElementById('_doc_sheet');
    if (sheet) sheet.focus();
  };

  // Масштабирование листа
  window._setDocZoom = function(scale) {
    var wrap = document.getElementById('_doc_sheet_wrap');
    if (wrap) wrap.style.transform = 'scale(' + scale + ')';
  };

  // Переключение меню переменных
  window._toggleVariablesMenu = function() {
    var m = document.getElementById('_doc_vars_dropdown');
    if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
  };

  // Переключение меню скачивания
  window._toggleDocDownloadMenu = function() {
    var m = document.getElementById('_doc_download_dropdown');
    if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
  };

  // Вставка переменной в позицию курсора
  window._insertVariableToDoc = function(varCode) {
    var val = '';
    if (_editorState.context && _editorState.context.плоские_переменные && _editorState.context.плоские_переменные[varCode] !== undefined) {
      val = _editorState.context.плоские_переменные[varCode];
    } else {
      val = '{{' + varCode + '}}';
    }

    var sheet = document.getElementById('_doc_sheet');
    if (sheet) {
      sheet.focus();
      document.execCommand('insertText', false, String(val));
    }
    var m = document.getElementById('_doc_vars_dropdown');
    if (m) m.style.display = 'none';
  };

  // Добавить строку в активную таблицу
  window._insertDocTableRow = function() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var node = sel.anchorNode;
    var tr = node && node.nodeType === 1 ? node.closest('tr') : (node && node.parentElement ? node.parentElement.closest('tr') : null);
    if (!tr) {
      alert('Поставьте курсор внутрь строки таблицы, к которой нужно добавить новую строку.');
      return;
    }
    var newTr = tr.cloneNode(true);
    var cells = newTr.querySelectorAll('td');
    cells.forEach(function(c, idx) {
      if (idx === 0) {
        var num = parseInt(c.textContent, 10);
        c.textContent = isNaN(num) ? '' : (num + 1);
      } else {
        c.innerHTML = '&nbsp;';
      }
    });
    tr.parentNode.insertBefore(newTr, tr.nextSibling);
  };

  // Удалить активную строку таблицы
  window._deleteDocTableRow = function() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var node = sel.anchorNode;
    var tr = node && node.nodeType === 1 ? node.closest('tr') : (node && node.parentElement ? node.parentElement.closest('tr') : null);
    if (!tr) {
      alert('Поставьте курсор в строку таблицы, которую хотите удалить.');
      return;
    }
    if (confirm('Удалить эту строку таблицы?')) {
      tr.remove();
    }
  };

  // 4. Печать и сохранение в PDF через изолированный фрейм
  window._printDocEditor = function() {
    var sheet = document.getElementById('_doc_sheet');
    var titleEl = document.getElementById('_doc_edit_title');
    if (!sheet) return;

    var title = (titleEl && titleEl.value) || 'Документ Stockeasy';
    var htmlContent = sheet.innerHTML;

    var frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);

    var doc = frame.contentWindow.document;
    doc.open();
    doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escHtml(title) + '</title>' +
      '<style>' +
      '@page { size: A4 portrait; margin: 15mm 15mm 15mm 20mm; }' +
      'body { font-family: "Times New Roman", Times, serif; font-size: 13px; line-height: 1.35; color: #000; margin: 0; padding: 0; background: #fff; }' +
      'table { width: 100%; border-collapse: collapse; }' +
      'td, th { border: 1px solid #000; padding: 5px 6px; }' +
      'ol, ul { padding-left: 22px; }' +
      'p { margin: 0 0 8px 0; }' +
      '</style></head><body>' + htmlContent + '</body></html>');
    doc.close();

    setTimeout(function() {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(function() { frame.remove(); }, 4000);
    }, 250);
  };

  // 5. Сохранение документа в реестр системы
  window._saveDocEditor = function() {
    var sheet = document.getElementById('_doc_sheet');
    var titleEl = document.getElementById('_doc_edit_title');
    var statusEl = document.getElementById('_doc_edit_status');

    if (!sheet) return;
    var title = (titleEl && titleEl.value.trim()) || 'Документ';
    var contentHtml = sheet.innerHTML;
    var status = (statusEl && statusEl.value) || 'generated';

    var postData = {
      id: _editorState.docId || undefined,
      task_id: _editorState.taskId || undefined,
      contract_id: _editorState.contractId || undefined,
      subcontract_id: _editorState.subcontractId || undefined,
      doc_type: _editorState.templateCode || 'custom',
      doc_format: _editorState.format || 'word',
      title: title,
      content_html: contentHtml,
      status: status,
      meta: {
        last_edited_at: new Date().toISOString()
      }
    };

    api('/documents/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postData)
    })
    .then(function(savedDoc) {
      _editorState.docId = savedDoc.id;
      if (typeof showToast === 'function') {
        showToast('✓ Документ успешно сохранен в реестр системы!', 'success');
      } else {
        alert('Документ успешно сохранен в системе!');
      }

      // Обновляем таблицы документов в карточке и контрактах
      if (_editorState.taskId && typeof window.loadCardDocuments === 'function') {
        window.loadCardDocuments(_editorState.taskId);
      }
      if (_editorState.contractId && typeof window.loadContractDocuments === 'function') {
        window.loadContractDocuments(_editorState.contractId);
      }

      if (typeof _editorState.onSaved === 'function') {
        _editorState.onSaved(savedDoc);
      }
    })
    .catch(function(err) {
      alert('Ошибка сохранения документа: ' + (err.message || err));
    });
  };

  // 6. Скачать в Word (.docx / .doc)
  window._downloadDocxFromEditor = function() {
    var sheet = document.getElementById('_doc_sheet');
    var titleEl = document.getElementById('_doc_edit_title');
    if (!sheet) return;

    var title = (titleEl && titleEl.value.trim()) || 'Документ';
    var cleanFilename = title.replace(/[^a-zA-Zа-яА-Я0-9_ -]/g, '_') + '.doc';

    var header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' " +
      "xmlns:w='urn:schemas-microsoft-com:office:word' " +
      "xmlns='http://www.w3.org/TR/REC-html40'>" +
      "<head><meta charset='utf-8'><title>" + escHtml(title) + "</title>" +
      "<style>" +
      "@page Section1 { size: 595.3pt 841.9pt; margin: 42.5pt 28.3pt 42.5pt 56.7pt; mso-header-margin: 35.4pt; mso-footer-margin: 35.4pt; mso-paper-source: 0; }" +
      "div.Section1 { page: Section1; font-family: 'Times New Roman', serif; font-size: 11pt; color: #000; }" +
      "table { width: 100%; border-collapse: collapse; margin: 10pt 0; }" +
      "td, th { border: 1pt solid #000; padding: 4pt 6pt; font-size: 10pt; }" +
      "p { margin: 0 0 6pt 0; text-align: justify; }" +
      "</style></head><body><div class='Section1'>" + sheet.innerHTML + "</div></body></html>";

    var blob = new Blob(['\ufeff', header], { type: 'application/msword;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = cleanFilename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { a.remove(); URL.revokeObjectURL(url); }, 500);

    var dd = document.getElementById('_doc_download_dropdown');
    if (dd) dd.style.display = 'none';
  };

  // 7. Скачать в HTML
  window._downloadHtmlFromEditor = function() {
    var sheet = document.getElementById('_doc_sheet');
    var titleEl = document.getElementById('_doc_edit_title');
    if (!sheet) return;

    var title = (titleEl && titleEl.value.trim()) || 'Документ';
    var cleanFilename = title.replace(/[^a-zA-Zа-яА-Я0-9_ -]/g, '_') + '.html';

    var fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escHtml(title) + '</title>' +
      '<style>' +
      'body { font-family: "Times New Roman", Times, serif; font-size: 13px; line-height: 1.35; padding: 40px; max-width: 800px; margin: 0 auto; color: #000; }' +
      'table { width: 100%; border-collapse: collapse; margin: 12px 0; }' +
      'td, th { border: 1px solid #000; padding: 5px 6px; }' +
      '</style></head><body>' + sheet.innerHTML + '</body></html>';

    var blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = cleanFilename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { a.remove(); URL.revokeObjectURL(url); }, 500);

    var dd = document.getElementById('_doc_download_dropdown');
    if (dd) dd.style.display = 'none';
  };

})();
