/**
 * Stockeasy Window & Scroll Manager
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Сохранение и восстановление скролла во всех разделах (Канбан, Заявки, Договоры, Люди, Контрагенты)
 * 2. Подсветка активной строки / карточки при возврате из просмотра/редактирования
 * 3. Перетаскивание модальных окон (Drag & Drop)
 * 4. Сворачивание окон в нижнюю плавающую панель (Dock Bar) с возможностью быстрого восстановления
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function() {
  'use strict';

  // ─── 1. СОХРАНЕНИЕ И ВОССТАНОВЛЕНИЕ СКРОЛЛА ──────────────────────────────────
  window._savedScrollState = null;

  window.savePageScroll = function(targetId) {
    var saved = {
      page: (typeof S !== 'undefined' && S.page) ? S.page : '',
      scrollY: window.scrollY || document.documentElement.scrollTop || 0,
      targetId: targetId || null,
      time: Date.now()
    };

    // Сохраняем скролл канбана (доска и колонки)
    var kBoard = document.querySelector('.kanban');
    if (kBoard) {
      saved.kanbanScrollLeft = kBoard.scrollLeft;
      saved.colScrolls = {};
      document.querySelectorAll('.kcol').forEach(function(col, idx) {
        var cards = col.querySelector('.kcol-cards');
        if (cards) saved.colScrolls[idx] = cards.scrollTop;
      });
    }

    window._savedScrollState = saved;
    return saved;
  };

  window.restorePageScroll = function(explicitTargetId) {
    var saved = window._savedScrollState;
    var targetId = explicitTargetId || (saved ? saved.targetId : null);

    function doRestore() {
      if (saved && saved.scrollY !== undefined) {
        window.scrollTo({ top: saved.scrollY, behavior: 'instant' });
      }

      // Восстанавливаем скролл канбана
      if (typeof S !== 'undefined' && S.page === 'kanban' && saved && saved.kanbanScrollLeft !== undefined) {
        var kBoard = document.querySelector('.kanban');
        if (kBoard) kBoard.scrollLeft = saved.kanbanScrollLeft;
        if (saved.colScrolls) {
          document.querySelectorAll('.kcol').forEach(function(col, idx) {
            var cards = col.querySelector('.kcol-cards');
            if (cards && saved.colScrolls[idx] !== undefined) {
              cards.scrollTop = saved.colScrolls[idx];
            }
          });
        }
      }

      // Если есть целевой элемент строки или карточки
      if (targetId) {
        var el = typeof targetId === 'string' ? document.getElementById(targetId) : targetId;
        if (el) {
          try {
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } catch(e) {}

          el.classList.remove('row-highlight-pulse');
          void el.offsetWidth; // перезапуск CSS-анимации
          el.classList.add('row-highlight-pulse');

          setTimeout(function() {
            if (el) el.classList.remove('row-highlight-pulse');
          }, 2600);
          return true;
        }
      }
      return false;
    }

    requestAnimationFrame(function() {
      var found = doRestore();
      if (!found && targetId) {
        setTimeout(doRestore, 80);
      }
    });
  };

  // ─── 2. ПАНЕЛЬ ЗАДАЧ (DOCK BAR) ДЛЯ СВЕРНУТЫХ ОКОН ───────────────────────────
  function getOrCreateDock() {
    var dock = document.getElementById('app_window_dock');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'app_window_dock';
      document.body.appendChild(dock);
    }
    return dock;
  }

  // ─── 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ ОКНАМИ ────────────────────────
  function safeEsc(str) {
    if (typeof escHtml === 'function') return escHtml(str);
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Надежный поиск исходной кнопки закрытия модалки
  function findCloseButton(container, modalBox) {
    if (!container && !modalBox) return null;
    var searchScopes = [container, modalBox].filter(Boolean);

    for (var s = 0; s < searchScopes.length; s++) {
      var scope = searchScopes[s];
      // 1. По атрибутам onclick и close-классам
      var btn = scope.querySelector(
        'button[onclick*="close" i], button[onclick*="remove" i], button[onclick*="hide" i], ' +
        'button[data-close], button.btn-close, button.close, [data-dismiss="modal"], ' +
        'button[title*="Закрыть" i], button[aria-label*="Закрыть" i]'
      );
      if (btn && !btn.classList.contains('win-ctrl-btn')) return btn;

      // 2. По символу крестика в содержимом (но НЕ длинный текст вроде "Сохранить")
      var allButtons = scope.querySelectorAll('button');
      for (var i = 0; i < allButtons.length; i++) {
        var b = allButtons[i];
        if (b.classList.contains('win-ctrl-btn')) continue;
        var txt = b.textContent.trim();
        if (txt === '✕' || txt === '×' || txt === '⨯' || (txt.toLowerCase() === 'x' && txt.length === 1)) {
          return b;
        }
      }
    }
    return null;
  }

  // ─── 4. ДЕЛАЕМ ОКНО ПЕРЕТАСКИВАЕМЫМ И СВОРАЧИВАЕМЫМ ─────────────────────────
  window.makeWindowDraggableAndMinimizable = function(modalBox, options) {
    if (!modalBox) return;
    // Если кнопки управления уже есть внутри modalBox, не дублируем
    if (modalBox.querySelector('.win-ctrls-wrap')) return;

    options = options || {};
    var backdrop = options.backdrop || modalBox.closest('.modal-overlay, .wf-modal-overlay') || modalBox.parentElement;
    var title = options.title || modalBox.querySelector('h1, h2, h3, .modal-title')?.textContent?.trim() || 'Окно';
    var icon = options.icon || '📄';
    var onClose = options.onClose || function() {
      if (backdrop) {
        if (backdrop.id && backdrop.id.startsWith('_')) backdrop.remove();
        else backdrop.style.display = 'none';
      } else {
        if (modalBox.id && modalBox.id.startsWith('_')) modalBox.remove();
        else modalBox.style.display = 'none';
      }
      if (typeof window.restorePageScroll === 'function') window.restorePageScroll();
    };

    var dockId = 'dock_win_' + Math.random().toString(36).substr(2, 9);

    // 4.1. Находим шапку окна для захвата перетаскивания (Drag Handle)
    var handle = options.handle || modalBox.querySelector('.modal-header, .wf-modal-header') || modalBox.firstElementChild;
    if (handle) {
      handle.classList.add('modal-drag-handle');
      handle.title = 'Зажмите левую кнопку мыши, чтобы перетащить окно';
    }

    // 4.2. Добавляем кнопки управления окном: [— Свернуть], [▢ Развернуть], [✕ Закрыть]
    var btnContainer = handle ? handle.querySelector('.win-ctrls-wrap') : null;
    var existingCloseBtn = findCloseButton(handle, modalBox);

    if (!btnContainer && handle) {
      var wrap = document.createElement('div');
      wrap.className = 'win-ctrls-wrap';
      wrap.style.cssText = 'display:inline-flex; align-items:center; gap:4px; margin-left:auto; z-index:10;';

      // Кнопка [—] Свернуть
      var minBtn = document.createElement('button');
      minBtn.type = 'button';
      minBtn.className = 'win-ctrl-btn';
      minBtn.innerHTML = '—';
      minBtn.title = 'Свернуть окно в панель задач (внизу)';
      minBtn.onclick = function(e) {
        e.stopPropagation();
        minimizeWindow();
      };
      wrap.appendChild(minBtn);

      // Кнопка [▢] Развернуть на весь экран
      var maxBtn = document.createElement('button');
      maxBtn.type = 'button';
      maxBtn.className = 'win-ctrl-btn';
      maxBtn.innerHTML = '▢';
      maxBtn.title = 'Развернуть / Восстановить размер';
      maxBtn.onclick = function(e) {
        e.stopPropagation();
        toggleMaximize();
      };
      wrap.appendChild(maxBtn);

      // Кнопка [✕] Закрыть
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'win-ctrl-btn btn-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.title = 'Закрыть окно (Esc)';
      closeBtn.onclick = function(e) {
        e.stopPropagation();
        closeWindow();
      };
      wrap.appendChild(closeBtn);

      if (existingCloseBtn && existingCloseBtn.parentNode) {
        existingCloseBtn.style.display = 'none'; // заменяем на унифицированный блок
        existingCloseBtn.parentNode.insertBefore(wrap, existingCloseBtn);
      } else {
        handle.appendChild(wrap);
      }
    } else if (btnContainer) {
      var minB = btnContainer.querySelector('.win-ctrl-btn:not(.btn-close):not([title*="Развернуть"])');
      if (minB) minB.onclick = function(e){ e.stopPropagation(); minimizeWindow(); };
      var maxB = btnContainer.querySelector('.win-ctrl-btn[title*="Развернуть"], .win-ctrl-btn:nth-child(2)');
      if (maxB) maxB.onclick = function(e){ e.stopPropagation(); toggleMaximize(); };
      var clsB = btnContainer.querySelector('.btn-close') || btnContainer.lastElementChild;
      if (clsB) clsB.onclick = function(e){ e.stopPropagation(); closeWindow(); };
    }

    // 4.3. Логика перетаскивания (Drag and Drop)
    var isDragging = false;
    var startX, startY, initLeft, initTop;

    function onPointerDown(e) {
      // Игнорируем клики по элементам ввода и кнопкам управления
      if (e.target.closest('button, input, select, textarea, a, .win-ctrl-btn, .badge')) return;
      if (e.button !== 0) return; // только левая кнопка мыши

      isDragging = true;
      var rect = modalBox.getBoundingClientRect();

      startX = e.clientX;
      startY = e.clientY;
      initLeft = rect.left;
      initTop = rect.top;

      // Переводим окно в абсолютно плавающее состояние
      modalBox.style.position = 'fixed';
      modalBox.style.margin = '0';
      modalBox.style.left = initLeft + 'px';
      modalBox.style.top = initTop + 'px';
      modalBox.style.transform = 'none';
      modalBox.style.zIndex = '100010';

      // Снимаем блокировку фона
      if (backdrop) {
        backdrop.classList.add('is-floating');
      }

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    }

    function onPointerMove(e) {
      if (!isDragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;

      var newLeft = Math.max(10, Math.min(window.innerWidth - 80, initLeft + dx));
      var newTop = Math.max(10, Math.min(window.innerHeight - 60, initTop + dy));

      modalBox.style.left = newLeft + 'px';
      modalBox.style.top = newTop + 'px';
    }

    function onPointerUp() {
      isDragging = false;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    }

    if (handle) {
      handle.removeEventListener('pointerdown', onPointerDown);
      handle.addEventListener('pointerdown', onPointerDown);
    }

    // 4.4. Логика сворачивания в Dock bar
    function minimizeWindow() {
      if (backdrop) backdrop.style.display = 'none';
      else modalBox.style.display = 'none';

      var dock = getOrCreateDock();
      var dockItem = document.getElementById(dockId);
      if (!dockItem) {
        dockItem = document.createElement('div');
        dockItem.id = dockId;
        dockItem.className = 'dock-item';
        dockItem.innerHTML = `
          <span>${icon}</span>
          <span style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${safeEsc(title)}</span>
          <span class="dock-item-close" title="Закрыть">&times;</span>
        `;

        dockItem.onclick = function(e) {
          if (e.target.closest('.dock-item-close')) {
            closeWindow();
            return;
          }
          restoreWindow();
        };

        dock.appendChild(dockItem);
      }
    }

    function restoreWindow() {
      if (backdrop) backdrop.style.display = 'flex';
      else modalBox.style.display = 'block';

      var dockItem = document.getElementById(dockId);
      if (dockItem) dockItem.remove();

      modalBox.style.zIndex = '100020';
    }

    function toggleMaximize() {
      var isMax = modalBox.classList.toggle('modal-maximized');
      if (!isMax) {
        modalBox.style.left = '';
        modalBox.style.top = '';
        modalBox.style.transform = '';
        modalBox.style.position = '';
      }
    }

    function closeWindow() {
      var dockItem = document.getElementById(dockId);
      if (dockItem) dockItem.remove();
      if (backdrop) backdrop.classList.remove('is-floating');

      // 1. Вызываем исходную кнопку закрытия, если она существовала
      if (existingCloseBtn && typeof existingCloseBtn.click === 'function') {
        try {
          if (document.body.contains(existingCloseBtn)) {
            existingCloseBtn.click();
          }
        } catch (err) {
          console.warn('[windowManager] Error calling existingCloseBtn.click:', err);
        }
      }

      // 2. Вызываем явный onClose callback
      if (typeof onClose === 'function') {
        try {
          onClose();
        } catch (err) {
          console.warn('[windowManager] Error calling onClose:', err);
        }
      }

      // 3. Fallback: гарантированное сокрытие/удаление через 20 мс
      setTimeout(function() {
        if (backdrop && document.body.contains(backdrop) && backdrop.style.display !== 'none') {
          if (backdrop.id && backdrop.id.startsWith('_')) {
            backdrop.remove();
          } else {
            backdrop.style.display = 'none';
          }
        }
        if (modalBox && document.body.contains(modalBox) && modalBox.style.display !== 'none') {
          if (modalBox.id && modalBox.id.startsWith('_')) {
            modalBox.remove();
          } else {
            modalBox.style.display = 'none';
          }
        }
        if (typeof window.restorePageScroll === 'function') {
          window.restorePageScroll();
        }
      }, 20);
    }

    modalBox._restoreFromDock = restoreWindow;
    modalBox._minimizeToDock = minimizeWindow;
    modalBox._closeWindow = closeWindow;
  };

  // ─── 5. АВТОМАТИЧЕСКАЯ ИНИЦИАЛИЗАЦИЯ И НАБЛЮДАТЕЛЬ ЗА ОКНАМИ ─────────────────
  function checkAndEnhanceModal(node) {
    if (!node || node.nodeType !== 1) return;

    // 1. Договор: карточка просмотра деталей
    var cdmEl = (node.id === 'contract_detail_modal') ? node : (node.querySelector?.('#contract_detail_modal') || node.closest?.('#contract_detail_modal'));
    if (cdmEl) {
      var backdrop = document.getElementById('contract_detail_modal_backdrop');
      if (backdrop && backdrop.style.display !== 'none' && !cdmEl.querySelector('.win-ctrls-wrap')) {
        var title = window._activeContract ? ('Вн. № ' + (window._activeContract.internal_number || '—') + ' ' + (window._activeContract.customer_name || '')) : 'Карточка договора';
        window.makeWindowDraggableAndMinimizable(cdmEl, {
          title: title,
          icon: '📜',
          backdrop: backdrop,
          onClose: function() {
            if (typeof closeContractModal === 'function') closeContractModal();
          }
        });
      }
      return;
    }

    // 2. Договор: форма создания / редактирования договора
    var cfmEl = (node.id === 'contract_form_modal') ? node : (node.querySelector?.('#contract_form_modal') || node.closest?.('#contract_form_modal'));
    if (cfmEl) {
      var cfBackdrop = document.getElementById('contract_form_modal_backdrop');
      if (cfBackdrop && cfBackdrop.style.display !== 'none' && !cfmEl.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(cfmEl, {
          title: cfmEl.querySelector('h2')?.textContent || 'Форма договора',
          icon: '📝',
          backdrop: cfBackdrop,
          onClose: function() {
            if (typeof closeContractFormModal === 'function') closeContractFormModal();
          }
        });
      }
      return;
    }

    // 3. Договор: материалы / папка облака
    var cmmEl = (node.id === 'contract_materials_modal') ? node : (node.querySelector?.('#contract_materials_modal') || node.closest?.('#contract_materials_modal'));
    if (cmmEl) {
      var cmBackdrop = document.getElementById('contract_materials_modal_backdrop');
      if (cmBackdrop && cmBackdrop.style.display !== 'none' && !cmmEl.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(cmmEl, {
          title: 'Материалы и файлы договора',
          icon: '📁',
          backdrop: cmBackdrop,
          onClose: function() {
            if (typeof closeAddContractMaterialsModal === 'function') closeAddContractMaterialsModal();
          }
        });
      }
      return;
    }

    // 4. Договор: создание заявки к договору
    var cctEl = (node.id === 'contract_create_task_modal') ? node : (node.querySelector?.('#contract_create_task_modal') || node.closest?.('#contract_create_task_modal'));
    if (cctEl) {
      var cctBackdrop = document.getElementById('contract_create_task_modal_backdrop');
      if (cctBackdrop && cctBackdrop.style.display !== 'none' && !cctEl.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(cctEl, {
          title: 'Создание заявки по договору',
          icon: '📋',
          backdrop: cctBackdrop,
          onClose: function() {
            if (typeof closeContractCreateTaskModal === 'function') closeContractCreateTaskModal();
          }
        });
      }
      return;
    }

    // 5. Договор: привязка существующей заявки к договору
    var cltEl = (node.id === 'contract_link_task_modal') ? node : (node.querySelector?.('#contract_link_task_modal') || node.closest?.('#contract_link_task_modal'));
    if (cltEl) {
      var cltBackdrop = document.getElementById('contract_link_task_modal_backdrop');
      if (cltBackdrop && cltBackdrop.style.display !== 'none' && !cltEl.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(cltEl, {
          title: 'Привязать существующую заявку',
          icon: '🔗',
          backdrop: cltBackdrop,
          onClose: function() {
            if (typeof closeContractLinkTaskModal === 'function') closeContractLinkTaskModal();
          }
        });
      }
      return;
    }

    // 6. Визард подряда (субподряд)
    var wizEl = (node.id === '_subcontract_wizard_modal') ? node : (node.querySelector?.('#_subcontract_wizard_modal') || node.closest?.('#_subcontract_wizard_modal'));
    if (wizEl) {
      var wizBox = wizEl.querySelector('.card, .modal-box, [style*="background:#fff"]') || wizEl;
      if (!wizBox.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(wizBox, {
          title: 'Поручение подрядчику (Визард)',
          icon: '👷',
          backdrop: wizEl,
          onClose: function() {
            wizEl.remove();
            window.restorePageScroll();
          }
        });
      }
      return;
    }

    // 7. Карточка заявки: назначение/редактирование субподрядчика (_subcontract_modal)
    var scEl = (node.id === '_subcontract_modal') ? node : (node.querySelector?.('#_subcontract_modal') || node.closest?.('#_subcontract_modal'));
    if (scEl) {
      var scBox = scEl.querySelector('.modal-box') || scEl;
      if (!scBox.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(scBox, {
          title: scBox.querySelector('h3')?.textContent || 'Субподрядчик по заявке',
          icon: '🤝',
          backdrop: scEl,
          onClose: function() {
            scEl.remove();
            window.restorePageScroll();
          }
        });
      }
      return;
    }

    // 8. Чат: управление участниками чата заявки (_chat_members_modal)
    var chmEl = (node.id === '_chat_members_modal') ? node : (node.querySelector?.('#_chat_members_modal') || node.closest?.('#_chat_members_modal'));
    if (chmEl) {
      var chmBox = chmEl.querySelector('.modal-box') || chmEl;
      if (!chmBox.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(chmBox, {
          title: chmBox.querySelector('h3')?.textContent || 'Участники чата',
          icon: '👥',
          backdrop: chmEl,
          onClose: function() {
            chmEl.remove();
            window.restorePageScroll();
          }
        });
      }
      return;
    }

    // 9. Индивидуальные расценки подряда (_sub_rate_modal)
    var srmEl = (node.id === '_sub_rate_modal') ? node : (node.querySelector?.('#_sub_rate_modal') || node.closest?.('#_sub_rate_modal'));
    if (srmEl) {
      var srmBox = srmEl.querySelector('.card, .modal-box, [style*="background:#fff"]') || srmEl;
      if (!srmBox.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(srmBox, {
          title: 'Индивидуальные условия подряда',
          icon: '💰',
          backdrop: srmEl,
          onClose: function() {
            srmEl.remove();
            window.restorePageScroll();
          }
        });
      }
      return;
    }

    // 10. Письмо на доступ на объект (_access_letter_modal)
    var almEl = (node.id === '_access_letter_modal') ? node : (node.querySelector?.('#_access_letter_modal') || node.closest?.('#_access_letter_modal'));
    if (almEl) {
      var almBox = almEl.querySelector('div[style*="background:#fff"], .card') || almEl;
      if (!almBox.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(almBox, {
          title: 'Письмо на доступ на объект',
          icon: '✉️',
          backdrop: almEl,
          onClose: function() {
            almEl.remove();
            window.restorePageScroll();
          }
        });
      }
      return;
    }

    // 11. Детали контрагента (_contractor_details_modal)
    var cdmMod = (node.id === '_contractor_details_modal') ? node : (node.querySelector?.('#_contractor_details_modal') || node.closest?.('#_contractor_details_modal'));
    if (cdmMod) {
      var cdmBox = cdmMod.querySelector('[style*="background:#fff"]') || cdmMod;
      if (!cdmBox.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(cdmBox, {
          title: cdmBox.querySelector('h2')?.textContent || 'Карточка контрагента',
          icon: '🏢',
          backdrop: cdmMod,
          onClose: function() {
            if (typeof closeContractorDetailsModal === 'function') closeContractorDetailsModal();
            else cdmMod.remove();
            window.restorePageScroll();
          }
        });
      }
      return;
    }

    // 12. Справка этапа (stageHelpModalOverlay)
    var shEl = (node.id === 'stageHelpModalOverlay') ? node : (node.querySelector?.('#stageHelpModalOverlay') || node.closest?.('#stageHelpModalOverlay'));
    if (shEl) {
      var shBox = shEl.querySelector('.modal-box') || shEl;
      if (!shBox.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(shBox, {
          title: shBox.querySelector('h3, .badge')?.textContent || 'Справка этапа',
          icon: '💡',
          backdrop: shEl,
          onClose: function() {
            if (typeof closeStageHelpModal === 'function') closeStageHelpModal();
            else shEl.remove();
            window.restorePageScroll();
          }
        });
      }
      return;
    }

    // 13. Автоматизация чата (wf-full-modal)
    var wfEl = (node.id === 'wf-full-modal') ? node : (node.querySelector?.('#wf-full-modal') || node.closest?.('#wf-full-modal'));
    if (wfEl) {
      var wfBox = wfEl.querySelector('.wf-modal-container') || wfEl;
      if (!wfBox.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(wfBox, {
          title: 'Центр автоматизации',
          icon: '🎛️',
          backdrop: wfEl,
          onClose: function() {
            if (typeof closeFullAutomationModal === 'function') closeFullAutomationModal();
            else wfEl.remove();
            window.restorePageScroll();
          }
        });
      }
      return;
    }

    // 14. Заявки партии импорта в логах (batchTasksModal)
    var btmEl = (node.id === 'batchTasksModal') ? node : (node.querySelector?.('#batchTasksModal') || node.closest?.('#batchTasksModal'));
    if (btmEl) {
      var btmBox = btmEl.querySelector('.modal-box, .card, [style*="background:#fff"]') || btmEl;
      if (btmEl.style.display !== 'none' && !btmBox.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(btmBox, {
          title: 'Заявки партии импорта',
          icon: '📦',
          backdrop: btmEl,
          onClose: function() {
            if (typeof closeBatchModal === 'function') closeBatchModal();
            else btmEl.style.display = 'none';
            window.restorePageScroll();
          }
        });
      }
      return;
    }

    // 15. Назначение подрядчика по заявке (tasks.js)
    if (node.id === '_app_contractor_picker_modal' || node.querySelector?.('#_app_contractor_picker_modal') || (node.classList && node.classList.contains('modal-overlay') && node.querySelector?.('button[onclick*="closeContractorPicker"]'))) {
      var cpNode = node.id === '_app_contractor_picker_modal' ? node : (node.querySelector?.('#_app_contractor_picker_modal') || node);
      var cpBox = cpNode.querySelector('.modal-box') || cpNode;
      if (!cpBox.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(cpBox, {
          title: cpBox.querySelector('h3')?.textContent || 'Выбор подрядчика',
          icon: '👤',
          backdrop: cpNode,
          onClose: function() {
            if (typeof closeContractorPicker === 'function') closeContractorPicker();
            else {
              cpNode.remove();
              window.restorePageScroll();
            }
          }
        });
      }
      return;
    }

    // 16. Универсальная модалка showModal (_mmodal)
    var mmEl = (node.id === '_mmodal') ? node : (node.querySelector?.('#_mmodal') || node.closest?.('#_mmodal'));
    if (mmEl) {
      var mbox = mmEl.querySelector('div[style*="background:#fff"], .card') || mmEl;
      if (!mbox.querySelector('.win-ctrls-wrap')) {
        window.makeWindowDraggableAndMinimizable(mbox, {
          title: mbox.querySelector('div[style*="font-weight:700"]')?.textContent || 'Форма',
          icon: '📋',
          backdrop: mmEl,
          onClose: function() {
            mmEl.remove();
            window.restorePageScroll();
          }
        });
      }
      return;
    }

    // 17. Любое другое модальное окно с .modal-overlay и .modal-box
    if (node.classList && (node.classList.contains('modal-overlay') || node.classList.contains('wf-modal-overlay'))) {
      if (node.id === 'cardConfirmOverlay') return; // небольшое подтверждение внутри карточки не превращаем в окно
      var genericBox = node.querySelector('.modal-box, .card');
      if (genericBox && !genericBox.querySelector('.win-ctrls-wrap')) {
        var origClose = findCloseButton(genericBox);
        window.makeWindowDraggableAndMinimizable(genericBox, {
          title: genericBox.querySelector('h1, h2, h3, .modal-title')?.textContent || 'Окно',
          icon: '📄',
          backdrop: node,
          onClose: function() {
            if (origClose && typeof origClose.click === 'function') {
              try { origClose.click(); return; } catch(e) {}
            }
            if (node.id && node.id.startsWith('_')) {
              node.remove();
            } else {
              node.style.display = 'none';
            }
            window.restorePageScroll();
          }
        });
      }
      return;
    }
  }

  window.enhanceModal = checkAndEnhanceModal;

  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(checkAndEnhanceModal);
      } else if (m.type === 'attributes' && m.target) {
        checkAndEnhanceModal(m.target);
      }
    });
  });

  var obsConfig = { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] };
  if (document.body) {
    observer.observe(document.body, obsConfig);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      observer.observe(document.body, obsConfig);
    });
  }

  // ─── 6. ГЛОБАЛЬНОЕ ЗАКРЫТИЕ ВЕРХНЕГО ОКНА ПО ESC ─────────────────────────────
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
      // Игнорируем если открыт выпадающий автокомплит
      var openDrop = document.querySelector('.modal-suggest-dropdown:not([style*="display: none"]):not([style*="display:none"])');
      if (openDrop) return;

      var closeButtons = Array.from(document.querySelectorAll('.win-ctrls-wrap .btn-close'));
      if (closeButtons.length > 0) {
        // Находим самое верхнее видимое окно
        for (var i = closeButtons.length - 1; i >= 0; i--) {
          var btn = closeButtons[i];
          if (btn.offsetParent !== null) {
            btn.click();
            break;
          }
        }
      }
    }
  });

})();
