/**
 * Stockeasy Mobile Bridge for Android (Capacitor)
 * 
 * 1. Интеграция API: перенаправление относительных /api, /uploads и /socket.io на https://app.stockeasy.ru
 * 2. Аппаратная кнопка "Назад" (Back Button) на Android: закрытие меню, модалок или возврат по истории
 * 3. Safe Area Insets (вырезы камер и жестовые полосы Android)
 * 4. Оффлайн-синхронизация с сервером при восстановлении связи
 * 5. Эмулятор мобильного экрана смартфона при открытии в браузере и Live Preview
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
    `;
    document.head.appendChild(style);
  }

  // 5. Часы в верхней панели смартфона
  function updateSimClock() {
    var clock = document.getElementById('sim-clock');
    if (clock) {
      var d = new Date();
      var hh = String(d.getHours()).padStart(2, '0');
      var mm = String(d.getMinutes()).padStart(2, '0');
      clock.textContent = hh + ':' + mm;
    }
  }

  // 6. Помощник отображения в корпусе смартфона (Live Preview / Браузер)
  function initDesktopDevicePreview() {
    var isCapacitor = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    if (isCapacitor) {
      document.body.classList.add('is-native-phone');
      return;
    }

    // В Live Preview / обычном браузере ВСЕГДА по умолчанию отображаем в рамке смартфона!
    document.body.classList.add('in-phone-frame');
    updateSimClock();
    setInterval(updateSimClock, 10000);

    // Панель быстрого переключения в правом нижнем углу
    if (!document.getElementById('desktop-preview-toolbar')) {
      var bar = document.createElement('div');
      bar.id = 'desktop-preview-toolbar';
      bar.style.cssText = 'position:fixed; bottom:12px; right:12px; z-index:99999; background:rgba(15,23,42,0.88); backdrop-filter:blur(8px); color:#fff; padding:5px 12px; border-radius:20px; font-size:11px; font-family:-apple-system,BlinkMacSystemFont,sans-serif; display:flex; align-items:center; gap:8px; box-shadow:0 8px 24px rgba(0,0,0,0.35); border:1px solid rgba(255,255,255,0.18);';
      bar.innerHTML = `
        <span style="font-weight:600; color:#38bdf8;">📱 Корпус смартфона</span>
        <button id="toggle-device-btn" style="background:#0284c7; color:#fff; border:none; padding:3px 10px; border-radius:12px; font-size:10px; font-weight:700; cursor:pointer;">
          Развернуть
        </button>
      `;
      document.body.appendChild(bar);

      var toggleBtn = document.getElementById('toggle-device-btn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
          var isPhone = document.body.classList.toggle('in-phone-frame');
          toggleBtn.textContent = isPhone ? 'Развернуть' : 'В рамку телефона';
        });
      }
    }
  }

  // 7. Обработка аппаратной кнопки "Назад" в Android (Capacitor App Plugin)
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

        if (window.S && window.S.page && window.S.page !== 'tasks' && window.S.page !== 'dashboard') {
          if (typeof window.go === 'function') {
            window.go('tasks');
            return;
          }
        }

        App.exitApp();
      });
    }
  }

  // 8. Инициализация при загрузке документа
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
