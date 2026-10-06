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

  // ─── 3. ДЕЛАЕМ ОКНО ПЕРЕТАСКИВАЕМЫМ И СВОРАЧИВАЕМЫМ ─────────────────────────
  window.makeWindowDraggableAndMinimizable = function(modalBox, options) {
    if (!modalBox || modalBox._hasWindowControls) return;
    modalBox._hasWindowControls = true;

    options = options || {};
    var backdrop = options.backdrop || modalBox.closest('.modal-overlay') || modalBox.parentElement;
    var title = options.title || modalBox.querySelector('h1, h2, h3, .modal-title')?.textContent?.trim() || 'Окно';
    var icon = options.icon || '📄';
    var onClose = options.onClose || function() {
      if (backdrop) backdrop.style.display = 'none';
      else modalBox.remove();
      window.restorePageScroll();
    };

    var dockId = 'dock_win_' + Math.random().toString(36).substr(2, 9);

    // 3.1. Находим шапку окна для захвата перетаскивания (Drag Handle)
    var handle = options.handle || modalBox.querySelector('.modal-header') || modalBox.firstElementChild;
    if (handle) {
      handle.classList.add('modal-drag-handle');
      handle.title = 'Зажмите левую кнопку мыши, чтобы перетащить окно';
    }

    // 3.2. Добавляем кнопки управления окном: [— Свернуть], [▢ Развернуть], [✕ Закрыть]
    var btnContainer = handle ? handle.querySelector('.win-ctrls-wrap') : null;
    if (!btnContainer && handle) {
      // Ищем существующий крестик закрытия
      var existingCloseBtn = handle.querySelector('button[onclick*="close"], button[onclick*="remove"], button:last-child');
      
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

      if (existingCloseBtn) {
        existingCloseBtn.style.display = 'none'; // заменяем на унифицированный блок
        existingCloseBtn.parentNode.insertBefore(wrap, existingCloseBtn);
      } else {
        handle.appendChild(wrap);
      }
    }

    // 3.3. Логика перетаскивания (Drag and Drop)
    var isDragging = false;
    var startX, startY, initLeft, initTop;

    function onPointerDown(e) {
      // Игнорируем клики по кнопкам, инпутам, селектам
      if (e.target.closest('button, input, select, textarea, a, .win-ctrl-btn')) return;
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

      // Разрешаем кликать и скроллить под окном
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
      handle.addEventListener('pointerdown', onPointerDown);
    }

    // 3.4. Логика сворачивания в Dock bar
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
          <span style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${escHtml(title)}</span>
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

      // Фокусируемся на окне
      modalBox.style.zIndex = '100020';
    }

    function toggleMaximize() {
      var isMax = modalBox.classList.toggle('modal-maximized');
      if (!isMax) {
        // Возвращаем компактную позицию
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
      onClose();
    }

    modalBox._restoreFromDock = restoreWindow;
    modalBox._minimizeToDock = minimizeWindow;
  };

  // ─── 4. АВТОМАТИЧЕСКАЯ ИНИЦИАЛИЗАЦИЯ И НАБЛЮДАТЕЛЬ ЗА ОКНАМИ ─────────────────
  function checkAndEnhanceModal(node) {
    if (!node || node.nodeType !== 1) return;

    // Договор: карточка просмотра деталей
    if (node.id === 'contract_detail_modal' || node.querySelector?.('#contract_detail_modal')) {
      var el = node.id === 'contract_detail_modal' ? node : node.querySelector('#contract_detail_modal');
      var backdrop = document.getElementById('contract_detail_modal_backdrop');
      if (backdrop && backdrop.style.display !== 'none' && !el._hasWindowControls) {
        var title = window._activeContract ? ('Вн. № ' + (window._activeContract.internal_number || '—') + ' ' + (window._activeContract.customer_name || '')) : 'Карточка договора';
        window.makeWindowDraggableAndMinimizable(el, {
          title: title,
          icon: '📜',
          backdrop: backdrop,
          onClose: function() {
            if (typeof closeContractModal === 'function') closeContractModal();
          }
        });
      }
    }

    // Договор: форма создания / редактирования договора
    if (node.id === 'contract_form_modal' || node.querySelector?.('#contract_form_modal')) {
      var cfEl = node.id === 'contract_form_modal' ? node : node.querySelector('#contract_form_modal');
      var cfBackdrop = document.getElementById('contract_form_modal_backdrop');
      if (cfBackdrop && cfBackdrop.style.display !== 'none' && !cfEl._hasWindowControls) {
        window.makeWindowDraggableAndMinimizable(cfEl, {
          title: cfEl.querySelector('h2')?.textContent || 'Форма договора',
          icon: '📝',
          backdrop: cfBackdrop,
          onClose: function() {
            if (typeof closeContractFormModal === 'function') closeContractFormModal();
          }
        });
      }
    }

    // Визард подряда (субподряд)
    if (node.id === '_subcontract_wizard_modal' || node.querySelector?.('#_subcontract_wizard_modal')) {
      var wizNode = node.id === '_subcontract_wizard_modal' ? node : node.querySelector('#_subcontract_wizard_modal');
      var box = wizNode.querySelector('.card, [style*="background:#fff"]') || wizNode;
      if (!box._hasWindowControls) {
        window.makeWindowDraggableAndMinimizable(box, {
          title: 'Поручение подрядчику (Визард)',
          icon: '👷',
          backdrop: wizNode,
          onClose: function() {
            wizNode.remove();
            window.restorePageScroll();
          }
        });
      }
    }

    // Индивидуальные расценки подряда (_sub_rate_modal)
    if (node.id === '_sub_rate_modal' || node.querySelector?.('#_sub_rate_modal')) {
      var srmNode = node.id === '_sub_rate_modal' ? node : node.querySelector('#_sub_rate_modal');
      var srmBox = srmNode.querySelector('.card, [style*="background:#fff"]') || srmNode;
      if (!srmBox._hasWindowControls) {
        window.makeWindowDraggableAndMinimizable(srmBox, {
          title: 'Индивидуальные условия подряда',
          icon: '💰',
          backdrop: srmNode,
          onClose: function() {
            srmNode.remove();
            window.restorePageScroll();
          }
        });
      }
    }

    // Детали контрагента (_contractor_details_modal)
    if (node.id === '_contractor_details_modal' || node.querySelector?.('#_contractor_details_modal')) {
      var cdmNode = node.id === '_contractor_details_modal' ? node : node.querySelector('#_contractor_details_modal');
      var cdmBox = cdmNode.querySelector('[style*="background:#fff"]') || cdmNode;
      if (!cdmBox._hasWindowControls) {
        window.makeWindowDraggableAndMinimizable(cdmBox, {
          title: cdmBox.querySelector('h2')?.textContent || 'Карточка контрагента',
          icon: '🏢',
          backdrop: cdmNode,
          onClose: function() {
            cdmNode.remove();
            window.restorePageScroll();
          }
        });
      }
    }

    // Назначение подрядчика (_app_contractor_picker_modal)
    if (node.id === '_app_contractor_picker_modal' || node.querySelector?.('#_app_contractor_picker_modal') || (node.classList && node.classList.contains('modal-overlay') && node.querySelector?.('.modal-box'))) {
      var cpNode = node.id === '_app_contractor_picker_modal' ? node : (node.querySelector?.('#_app_contractor_picker_modal') || node);
      var cpBox = cpNode.querySelector('.modal-box') || cpNode.querySelector('[style*="background:#fff"]') || cpNode;
      if (cpBox && !cpBox._hasWindowControls) {
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
    }

    // Универсальная модалка showModal (_mmodal)
    if (node.id === '_mmodal' || node.querySelector?.('#_mmodal')) {
      var mmNode = node.id === '_mmodal' ? node : node.querySelector('#_mmodal');
      var mbox = mmNode.querySelector('div[style*="background:#fff"]');
      if (mbox && !mbox._hasWindowControls) {
        window.makeWindowDraggableAndMinimizable(mbox, {
          title: mbox.querySelector('div[style*="font-weight:700"]')?.textContent || 'Форма',
          icon: '📋',
          backdrop: mmNode,
          onClose: function() {
            mmNode.remove();
            window.restorePageScroll();
          }
        });
      }
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

})();
