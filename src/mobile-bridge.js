/**
 * Stockeasy Mobile Bridge for Android (Capacitor)
 * 
 * 1. Интеграция API: перенаправление относительных /api запросов на https://app.stockeasy.ru
 * 2. Аппаратная кнопка "Назад" (Back Button) на Android: закрытие меню, модалок или возврат по истории
 * 3. Safe Area Insets (вырезы камер и жестовые полосы Android)
 * 4. Оффлайн-синхронизация с сервером при восстановлении связи
 */

(function() {
  'use strict';

  // 1. Базовый адрес API для мобильного приложения
  window.STOCKEASY_API_BASE = 'https://app.stockeasy.ru';

  // 2. Перехватчик fetch для работы с удаленным бэкендом
  var originalFetch = window.fetch;
  window.fetch = function(resource, init) {
    if (typeof resource === 'string') {
      if (resource.startsWith('/api') || resource.startsWith('/uploads')) {
        resource = window.STOCKEASY_API_BASE + resource;
      }
    } else if (resource && typeof resource.url === 'string') {
      if (resource.url.startsWith('/api') || resource.url.startsWith('/uploads')) {
        resource = new Request(window.STOCKEASY_API_BASE + resource.url, resource);
      }
    }
    return originalFetch(resource, init);
  };

  // 3. Подключение Socket.IO к удаленному серверу, если скрипт доступен
  if (typeof window.io !== 'undefined') {
    var originalIo = window.io;
    window.io = function(uri, opts) {
      if (!uri || uri === '/') {
        uri = window.STOCKEASY_API_BASE;
      }
      return originalIo(uri, opts);
    };
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
      /* Увеличенные области нажатия под пальцы для Android */
      button, a, input, select {
        touch-action: manipulation;
      }
    `;
    document.head.appendChild(style);
  }

  // 5. Обработка аппаратной кнопки "Назад" в Android (Capacitor App Plugin)
  function initBackButtonHandler() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      var App = window.Capacitor.Plugins.App;
      App.addListener('backButton', function() {
        // А. Если открыто модальное окно — закрываем его
        var modal = document.querySelector('.modal-overlay:not([style*="display: none"])');
        if (modal) {
          var closeBtn = modal.querySelector('.modal-close-btn, button[onclick*="closeModal"]');
          if (closeBtn) closeBtn.click();
          else modal.style.display = 'none';
          return;
        }

        // Б. Если открыт мобильный сайдбар — закрываем его
        var sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('mobile-open')) {
          if (typeof window.toggleMobileSidebar === 'function') {
            window.toggleMobileSidebar(false);
          } else {
            sidebar.classList.remove('mobile-open');
          }
          return;
        }

        // В. Если находимся не на главной странице заявок / дашборда — возвращаемся назад
        if (window.S && window.S.currentPage && window.S.currentPage !== 'tasks' && window.S.currentPage !== 'dashboard') {
          if (typeof window.navigate === 'function') {
            window.navigate('tasks');
            return;
          }
        }

        // Г. Если некуда больше возвращаться — сворачиваем приложение
        App.exitApp();
      });
    }
  }

  // 6. Инициализация при загрузке документа
  document.addEventListener('DOMContentLoaded', function() {
    applySafeAreaStyles();
    initBackButtonHandler();

    // Слушатель восстановления сети для оффлайн-синхронизатора
    window.addEventListener('online', function() {
      console.log('[MobileBridge] Сеть восстановлена. Запуск синхронизации...');
      if (typeof window.manualSync === 'function') {
        window.manualSync();
      }
    });
  });
})();
