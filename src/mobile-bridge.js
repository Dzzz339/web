/**
 * Stockeasy Mobile Bridge for Android (Capacitor)
 * 
 * 1. Интеграция API: перенаправление относительных /api, /uploads и /socket.io на https://app.stockeasy.ru
 * 2. Аппаратная кнопка "Назад" (Back Button) на Android: закрытие меню, модалок или возврат по истории
 * 3. Safe Area Insets (вырезы камер и жестовые полосы Android)
 * 4. Оффлайн-синхронизация с сервером при восстановлении связи
 * 5. Эмулятор мобильного экрана при открытии на широком мониторе компьютера
 */

(function() {
  'use strict';

  // 1. Базовый адрес API для мобильного приложения
  window.STOCKEASY_API_BASE = 'https://app.stockeasy.ru';

  // 2. Перехватчик fetch для работы с удаленным бэкендом
  var originalFetch = window.fetch;
  window.fetch = function(resource, init) {
    if (typeof resource === 'string') {
      if (resource.startsWith('/api') || resource.startsWith('/uploads') || resource.startsWith('/socket.io')) {
        resource = window.STOCKEASY_API_BASE + resource;
      }
    } else if (resource && typeof resource.url === 'string') {
      if (resource.url.startsWith('/api') || resource.url.startsWith('/uploads') || resource.url.startsWith('/socket.io')) {
        resource = new Request(window.STOCKEASY_API_BASE + resource.url, resource);
      }
    }
    return originalFetch(resource, init);
  };

  // 3. Надежный перехват Socket.IO: подключаемся к https://app.stockeasy.ru вместо localhost
  var _realIo = window.io;
  function wrapIo(fn) {
    return function(uri, opts) {
      if (!uri || uri === '/' || (typeof window !== 'undefined' && uri === window.location.origin)) {
        uri = window.STOCKEASY_API_BASE;
      }
      opts = opts || {};
      opts.transports = ['websocket', 'polling'];
      try {
        return fn(uri, opts);
      } catch (err) {
        console.warn('[MobileBridge] Ошибка инициализации сокета:', err);
        return { on: function(){}, emit: function(){} };
      }
    };
  }

  try {
    Object.defineProperty(window, 'io', {
      configurable: true,
      enumerable: true,
      get: function() {
        return _realIo;
      },
      set: function(val) {
        _realIo = typeof val === 'function' ? wrapIo(val) : val;
      }
    });
    if (_realIo) window.io = wrapIo(_realIo);
  } catch (e) {
    if (window.io) window.io = wrapIo(window.io);
  }

  // 4. Безопасные отступы для экранов Android (Safe Area)
  function applySafeAreaStyles() {
    var style = document.createElement('style');
    style.id = 'stockeasy-mobile-safe-area';
    style.innerHTML = `
      :root {
        --safe-top: env(safe-area-inset-top, 0px);
        --safe-bottom: env(safe-area-inset-bottom, 0px);
      }
      body {
        padding-top: var(--safe-top);
        padding-bottom: var(--safe-bottom);
        user-select: none;
        -webkit-touch-callout: none;
      }
      .topbar {
        padding-top: max(8px, var(--safe-top)) !important;
      }
      .mobile-action-bar, .unsaved-bar {
        padding-bottom: max(12px, var(--safe-bottom)) !important;
      }
      button, a, input, select {
        touch-action: manipulation;
      }

      /* Режим принудительного мобильного экрана (для просмотра на компьютере) */
      body.force-mobile-view {
        background: #0f172a !important;
        display: flex !important;
        justify-content: center !important;
        min-height: 100vh !important;
        padding: 24px 12px !important;
        margin: 0 !important;
      }
      body.force-mobile-view .app-layout {
        max-width: 412px !important;
        width: 100% !important;
        height: 880px !important;
        border-radius: 40px !important;
        box-shadow: 0 25px 60px rgba(0,0,0,0.5), 0 0 0 10px #1e293b, 0 0 0 12px #334155 !important;
        overflow: hidden !important;
        position: relative !important;
        background: #F4F4F5 !important;
        display: flex !important;
        flex-direction: column !important;
      }
      body.force-mobile-view .sidebar {
        position: fixed !important;
        left: -280px !important;
        top: 0 !important;
        bottom: 0 !important;
        width: 280px !important;
        transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
        z-index: 500 !important;
      }
      body.force-mobile-view .sidebar.mobile-open {
        left: 0 !important;
      }
      body.force-mobile-view .sidebar-backdrop {
        display: none !important;
        position: fixed !important;
        inset: 0 !important;
        background: rgba(0,0,0,0.5) !important;
        z-index: 490 !important;
      }
      body.force-mobile-view .sidebar-backdrop.active {
        display: block !important;
      }
      body.force-mobile-view .topbar-menu-btn {
        display: inline-flex !important;
      }
      body.force-mobile-view .sidebar-collapse-btn {
        display: none !important;
      }
      body.force-mobile-view .content-wrapper {
        flex: 1 !important;
        overflow-y: auto !important;
        display: flex !important;
        flex-direction: column !important;
      }
    `;
    document.head.appendChild(style);
  }

  // 5. Помощник переключения мобильного режима на компьютере
  function initDesktopDevicePreview() {
    var isCapacitor = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    // Если открыли в обычном браузере на мониторе шире 768px:
    if (!isCapacitor && window.innerWidth > 768) {
      // Автоматически включаем мобильный контейнер по умолчанию для наглядности
      document.body.classList.add('force-mobile-view');

      var bar = document.createElement('div');
      bar.id = 'desktop-preview-toolbar';
      bar.style.cssText = 'position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:99999; background:rgba(30,41,59,0.92); backdrop-filter:blur(8px); color:#fff; padding:6px 14px; border-radius:20px; font-size:12px; font-family:sans-serif; display:flex; align-items:center; gap:12px; box-shadow:0 10px 25px rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.15);';
      bar.innerHTML = `
        <span style="font-weight:600; color:#38bdf8;">📱 Предпросмотр экрана смартфона</span>
        <button id="toggle-device-btn" style="background:#0284c7; color:#fff; border:none; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600; cursor:pointer;">
          Развернуть во весь экран
        </button>
        <span style="color:#94a3b8; font-size:11px;">(Или нажмите Cmd+Shift+M в браузере)</span>
      `;
      document.body.appendChild(bar);

      var toggleBtn = document.getElementById('toggle-device-btn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
          var isPhone = document.body.classList.toggle('force-mobile-view');
          toggleBtn.textContent = isPhone ? 'Развернуть во весь экран' : 'Включить рамку телефона';
        });
      }
    }
  }

  // 6. Обработка аппаратной кнопки "Назад" в Android (Capacitor App Plugin)
  function initBackButtonHandler() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      var App = window.Capacitor.Plugins.App;
      App.addListener('backButton', function() {
        var modal = document.querySelector('.modal-overlay:not([style*="display: none"])');
        if (modal) {
          var closeBtn = modal.querySelector('.modal-close-btn, button[onclick*="closeModal"]');
          if (closeBtn) closeBtn.click();
          else modal.style.display = 'none';
          return;
        }

        var sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('mobile-open')) {
          if (typeof window.toggleMobileSidebar === 'function') {
            window.toggleMobileSidebar(false);
          } else {
            sidebar.classList.remove('mobile-open');
          }
          return;
        }

        if (window.S && window.S.currentPage && window.S.currentPage !== 'tasks' && window.S.currentPage !== 'dashboard') {
          if (typeof window.navigate === 'function') {
            window.navigate('tasks');
            return;
          }
        }

        App.exitApp();
      });
    }
  }

  // 7. Инициализация при загрузке документа
  document.addEventListener('DOMContentLoaded', function() {
    applySafeAreaStyles();
    initDesktopDevicePreview();
    initBackButtonHandler();

    window.addEventListener('online', function() {
      console.log('[MobileBridge] Сеть восстановлена. Запуск синхронизации...');
      if (typeof window.manualSync === 'function') {
        window.manualSync();
      }
    });
  });
})();
