// public/js/pages/templates.js
// Справочник и конструктор шаблонов документов Stockeasy

(function() {
  'use strict';

  window.renderTemplatesPage = function() {
    var app = document.getElementById('app');
    if (!app) return;

    var isAdmin = S.user && (S.user.role === 'admin' || S.user.role === 'director');

    app.innerHTML = 
      '<div class="page-container" style="max-width:1300px;margin:0 auto;padding:20px">' +
        // Заголовок страницы
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">' +
          '<div>' +
            '<h1 style="font-size:1.4rem;font-weight:700;color:var(--text);margin:0 0 4px 0;display:flex;align-items:center;gap:8px">' +
              '<span>📑</span> Шаблоны документов' +
            '</h1>' +
            '<div style="font-size:.84rem;color:var(--text-3)">' +
              'Библиотека типовых бланков, договоров, актов и допусков. Документы автоматически заполняются реквизитами из карточек заявок и контрактов.' +
            '</div>' +
          '</div>' +

          (isAdmin ? 
            '<button type="button" class="btn btn-primary" onclick="window.openCreateTemplateModal()" style="display:inline-flex;align-items:center;gap:6px">' +
              '<span>➕</span> Создать шаблон' +
            '</button>' : '') +
        '</div>' +

        // Фильтры по категориям
        '<div style="display:flex;gap:8px;margin-bottom:16px;overflow-x:auto;padding-bottom:4px">' +
          '<button type="button" class="btn btn-sm btn-primary tmpl-cat-btn" data-cat="all" onclick="window._filterTemplates(\'all\', this)">Все категории</button>' +
          '<button type="button" class="btn btn-sm btn-ghost tmpl-cat-btn" data-cat="orders" onclick="window._filterTemplates(\'orders\', this)">📋 Заявки и допуски</button>' +
          '<button type="button" class="btn btn-sm btn-ghost tmpl-cat-btn" data-cat="contracts" onclick="window._filterTemplates(\'contracts\', this)">📜 Договоры</button>' +
          '<button type="button" class="btn btn-sm btn-ghost tmpl-cat-btn" data-cat="closing" onclick="window._filterTemplates(\'closing\', this)">💼 Закрывающие акты и счета</button>' +
          '<button type="button" class="btn btn-sm btn-ghost tmpl-cat-btn" data-cat="custom" onclick="window._filterTemplates(\'custom\', this)">⭐ Пользовательские</button>' +
        '</div>' +

        // Контейнер списка шаблонов
        '<div id="templates_list_container">' +
          '<div style="text-align:center;padding:40px;color:var(--text-3)"><div class="spin" style="margin:0 auto 10px"></div>Загрузка шаблонов документов...</div>' +
        '</div>' +
      '</div>';

    loadTemplatesList('all');
  };

  var _allTemplates = [];

  function loadTemplatesList(category) {
    var cont = document.getElementById('templates_list_container');
    if (!cont) return;

    api('/document-templates')
      .then(function(templates) {
        _allTemplates = templates || [];
        renderTemplatesGrid(_allTemplates, category || 'all');
      })
      .catch(function(err) {
        cont.innerHTML = '<div style="color:var(--red);padding:20px;text-align:center">Ошибка загрузки шаблонов: ' + escHtml(err.message) + '</div>';
      });
  }

  window._filterTemplates = function(category, btn) {
    document.querySelectorAll('.tmpl-cat-btn').forEach(function(b) {
      b.className = 'btn btn-sm btn-ghost tmpl-cat-btn';
    });
    if (btn) btn.className = 'btn btn-sm btn-primary tmpl-cat-btn';
    renderTemplatesGrid(_allTemplates, category);
  };

  function renderTemplatesGrid(templates, category) {
    var cont = document.getElementById('templates_list_container');
    if (!cont) return;

    var filtered = templates;
    if (category && category !== 'all') {
      filtered = templates.filter(function(t) { return t.category === category; });
    }

    if (!filtered.length) {
      cont.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-3);background:#fff;border-radius:10px;border:1px solid var(--border)">В данной категории шаблонов пока нет.</div>';
      return;
    }

    var isAdmin = S.user && (S.user.role === 'admin' || S.user.role === 'director');

    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(360px, 1fr));gap:16px">';

    filtered.forEach(function(t) {
      var catBadge = '<span class="badge b-gray" style="font-size:.68rem">Пользовательский</span>';
      if (t.category === 'orders') catBadge = '<span class="badge b-blue" style="font-size:.68rem">Заявки и допуски</span>';
      else if (t.category === 'contracts') catBadge = '<span class="badge b-purple" style="font-size:.68rem">Договоры</span>';
      else if (t.category === 'closing') catBadge = '<span class="badge b-green" style="font-size:.68rem">Закрывающие документы</span>';

      var sysBadge = t.is_system 
        ? '<span class="badge" style="font-size:.65rem;background:#fef3c7;color:#b45309;border:1px solid #fde68a">⭐ Эталонный</span>'
        : '<span class="badge b-gray" style="font-size:.65rem">Пользовательский</span>';

      html += 
        '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 1px 4px rgba(0,0,0,0.04);transition:box-shadow .2s ease" onmouseover="this.style.boxShadow=\'0 4px 12px rgba(0,0,0,0.08)\'" onmouseout="this.style.boxShadow=\'0 1px 4px rgba(0,0,0,0.04)\'">' +
          '<div>' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">' +
              '<div style="font-weight:700;font-size:1rem;color:var(--text)">' + escHtml(t.name) + '</div>' +
              '<div style="display:flex;gap:4px">' + catBadge + '</div>' +
            '</div>' +

            '<div style="font-size:.76rem;color:var(--text-3);margin-bottom:10px">' +
              'Код: <code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;color:var(--text)">' + escHtml(t.code) + '</code> · ' + sysBadge +
            '</div>' +

            '<div style="font-size:.82rem;color:var(--text-2);margin-bottom:14px;min-height:36px;line-height:1.4">' +
              escHtml(t.description || 'Шаблон для автоматического формирования и онлайн-редактирования документа.') +
            '</div>' +
          '</div>' +

          '<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);padding-top:10px;margin-top:6px">' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="window._testOpenTemplate(\'' + escHtml(t.code) + '\')" style="display:inline-flex;align-items:center;gap:4px;font-size:.78rem">' +
              '<span>👁️</span> Предпросмотр' +
            '</button>' +

            '<div style="display:flex;gap:6px">' +
              (isAdmin ? 
                '<button type="button" class="btn btn-sm btn-ghost" onclick="window.openEditTemplateModal(' + t.id + ')" style="font-size:.78rem" title="Редактировать шаблон">' +
                  '✏️ Правка' +
                '</button>' : '') +
              (!t.is_system && isAdmin ? 
                '<button type="button" class="btn btn-sm btn-ghost" onclick="window._deleteTemplate(' + t.id + ')" style="color:var(--red);font-size:.78rem" title="Удалить">' +
                  '🗑️' +
                '</button>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
    });

    html += '</div>';
    cont.innerHTML = html;
  }

  // Быстрое тестирование шаблона в редакторе с тестовыми данными
  window._testOpenTemplate = function(templateCode) {
    if (typeof window.openDocumentEditor === 'function') {
      window.openDocumentEditor({
        templateCode: templateCode,
        taskId: (S.tasks && S.tasks[0] && S.tasks[0].id) || undefined
      });
    }
  };

  // Удаление пользовательского шаблона
  window._deleteTemplate = function(id) {
    if (!confirm('Вы уверены, что хотите удалить этот шаблон?')) return;
    api('/document-templates/' + id, { method: 'DELETE' })
      .then(function() {
        if (typeof showToast === 'function') showToast('Шаблон удален', 'success');
        loadTemplatesList('all');
      })
      .catch(function(err) {
        alert('Ошибка удаления: ' + (err.message || err));
      });
  };

  // Модалка создания / редактирования шаблона
  window.openCreateTemplateModal = function() {
    window.openEditTemplateModal(null);
  };

  window.openEditTemplateModal = function(templateId) {
    var old = document.getElementById('_edit_tmpl_modal');
    if (old) old.remove();

    var isEdit = Boolean(templateId);
    var tmpl = isEdit ? _allTemplates.find(function(t){ return t.id === templateId; }) : null;

    var modal = document.createElement('div');
    modal.id = '_edit_tmpl_modal';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '999999';

    modal.innerHTML = 
      '<div class="modal-box" style="max-width:950px;width:95%;max-height:92vh;display:flex;flex-direction:column;padding:0;border-radius:12px;background:#fff;overflow:hidden">' +
        '<div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">' +
          '<div style="font-weight:700;font-size:1.1rem;color:var(--text)">' +
            (isEdit ? ('✏️ Редактирование шаблона: ' + escHtml(tmpl ? tmpl.name : '')) : '➕ Новый шаблон документа') +
          '</div>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_edit_tmpl_modal\').remove()" style="font-size:1.2rem;line-height:1">&times;</button>' +
        '</div>' +

        '<div style="flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:14px">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
            '<div>' +
              '<label class="form-label" style="font-size:.8rem;font-weight:600">Название шаблона *</label>' +
              '<input type="text" id="_tmpl_name" class="input" value="' + escHtml(tmpl ? tmpl.name : '') + '" placeholder="Например, Заказ-наряд на допработы" required />' +
            '</div>' +
            '<div>' +
              '<label class="form-label" style="font-size:.8rem;font-weight:600">Системный код (латиницей) *</label>' +
              '<input type="text" id="_tmpl_code" class="input" value="' + escHtml(tmpl ? tmpl.code : '') + '" placeholder="extra_order" ' + (isEdit && tmpl.is_system ? 'disabled style="background:#f1f5f9"' : '') + ' required />' +
            '</div>' +
          '</div>' +

          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
            '<div>' +
              '<label class="form-label" style="font-size:.8rem;font-weight:600">Категория</label>' +
              '<select id="_tmpl_cat" class="input">' +
                '<option value="orders"' + (tmpl && tmpl.category === 'orders' ? ' selected' : '') + '>📋 Заявки и допуски</option>' +
                '<option value="contracts"' + (tmpl && tmpl.category === 'contracts' ? ' selected' : '') + '>📜 Договоры</option>' +
                '<option value="closing"' + (tmpl && tmpl.category === 'closing' ? ' selected' : '') + '>💼 Закрывающие акты и счета</option>' +
                '<option value="custom"' + (tmpl && tmpl.category === 'custom' ? ' selected' : '') + '>⭐ Пользовательские</option>' +
              '</select>' +
            '</div>' +
            '<div>' +
              '<label class="form-label" style="font-size:.8rem;font-weight:600">Формат листа</label>' +
              '<select id="_tmpl_format" class="input">' +
                '<option value="word"' + (tmpl && tmpl.doc_format === 'word' ? ' selected' : '') + '>📄 Word / Лист А4</option>' +
                '<option value="excel"' + (tmpl && tmpl.doc_format === 'excel' ? ' selected' : '') + '>📊 Excel / Таблица</option>' +
              '</select>' +
            '</div>' +
          '</div>' +

          '<div>' +
            '<label class="form-label" style="font-size:.8rem;font-weight:600">Краткое описание</label>' +
            '<input type="text" id="_tmpl_desc" class="input" value="' + escHtml(tmpl ? tmpl.description : '') + '" placeholder="Для чего предназначен шаблон..." />' +
          '</div>' +

          // Панель быстрой вставки переменных
          '<div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
              '<label class="form-label" style="font-size:.8rem;font-weight:600;margin:0">Тело шаблона (HTML + Переменные) *</label>' +
              '<span style="font-size:.74rem;color:var(--text-3)">Кликните на чипс для вставки переменной в текст:</span>' +
            '</div>' +
            '<div id="_tmpl_chips_bar" style="display:flex;flex-wrap:wrap;gap:4px;padding:8px;background:#f8fafc;border:1px solid var(--border);border-radius:6px;max-height:100px;overflow-y:auto;margin-bottom:8px">' +
              'Загрузка переменных...' +
            '</div>' +
            '<textarea id="_tmpl_body" class="input" style="font-family:monospace;font-size:.82rem;min-height:320px;line-height:1.4" placeholder="Введите HTML-разметку шаблона...">' + escHtml(tmpl ? tmpl.template_html : '') + '</textarea>' +
          '</div>' +
        '</div>' +

        '<div style="padding:14px 20px;background:#f8fafc;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px">' +
          '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'_edit_tmpl_modal\').remove()">Отмена</button>' +
          '<button type="button" class="btn btn-primary" onclick="window._saveTemplateForm(' + (templateId || 'null') + ')">Сохранить шаблон</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    // Загружаем список чипсов переменных
    api('/document-templates-variables')
      .then(function(groups) {
        var chipsBar = document.getElementById('_tmpl_chips_bar');
        if (!chipsBar) return;
        var html = '';
        groups.forEach(function(g) {
          g.vars.forEach(function(v) {
            html += '<button type="button" class="btn btn-xs btn-ghost" onclick="window._insertChipToTmplBody(\'{{' + escHtml(v.code) + '}}\')" style="font-size:.7rem;padding:2px 6px;background:#fff;border:1px solid #cbd5e1" title="' + escHtml(v.label) + '">{{' + escHtml(v.code) + '}}</button>';
          });
        });
        chipsBar.innerHTML = html;
      });
  };

  window._insertChipToTmplBody = function(token) {
    var ta = document.getElementById('_tmpl_body');
    if (!ta) return;
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var text = ta.value;
    ta.value = text.substring(0, start) + token + text.substring(end);
    ta.selectionStart = ta.selectionEnd = start + token.length;
    ta.focus();
  };

  window._saveTemplateForm = function(templateId) {
    var name = (document.getElementById('_tmpl_name')?.value || '').trim();
    var code = (document.getElementById('_tmpl_code')?.value || '').trim();
    var category = document.getElementById('_tmpl_cat')?.value || 'custom';
    var doc_format = document.getElementById('_tmpl_format')?.value || 'word';
    var description = (document.getElementById('_tmpl_desc')?.value || '').trim();
    var template_html = (document.getElementById('_tmpl_body')?.value || '').trim();

    if (!name || !code || !template_html) {
      alert('Пожалуйста, заполните название, системный код и тело шаблона.');
      return;
    }

    var isEdit = Boolean(templateId);
    var url = isEdit ? ('/document-templates/' + templateId) : '/document-templates';
    var method = isEdit ? 'PUT' : 'POST';

    api(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        code: code,
        category: category,
        doc_format: doc_format,
        description: description,
        template_html: template_html
      })
    })
    .then(function() {
      var modal = document.getElementById('_edit_tmpl_modal');
      if (modal) modal.remove();
      if (typeof showToast === 'function') showToast('✓ Шаблон успешно сохранен!', 'success');
      loadTemplatesList(category);
    })
    .catch(function(err) {
      alert('Ошибка сохранения шаблона: ' + (err.message || err));
    });
  };

})();
