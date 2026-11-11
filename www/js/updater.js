// www/js/updater.js — Автоматическое обновление приложения при пуше в Git (ветка phone-master)

(function() {
  'use strict';

  var GITHUB_OWNER = 'Dzzz339';
  var GITHUB_REPO = 'web';
  var GITHUB_BRANCH = 'phone-master';
  var CHECK_INTERVAL_MS = 60 * 1000; // Проверка каждую минуту

  // Текущая базовая версия в коде
  var EMBEDDED_VERSION = '1.2.1';
  var EMBEDDED_COMMIT = 'phone-master';

  // Инициализация локального коммита
  var installedCommit = localStorage.getItem('app_installed_commit') || EMBEDDED_COMMIT;
  var isUpdatePending = false;
  var latestUpdateData = null;

  function renderUpdateTopbarButton(info) {
    var container = document.getElementById('update-btn-container');
    var badge = document.getElementById('profile-update-badge');
    var profileContainer = document.getElementById('profile-update-container');
    var mobile = window.matchMedia('(max-width: 768px)').matches || document.body.classList.contains('is-native-phone') || document.body.classList.contains('in-phone-frame');

    if (badge) badge.style.display = info && mobile ? 'flex' : 'none';
    if (profileContainer) {
      profileContainer.innerHTML = info
        ? '<button type="button" class="btn profile-update-action" onclick="showUpdateModal(true)">Доступно обновление Stockeasy</button>'
        : '';
    }
    if (!container) return;

    if (!info) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML =
      '<button type="button" class="topbar-update-btn" onclick="showUpdateModal(true)" title="Вышло обновление: ' + (info.message ? escText(info.message.slice(0, 60)) : '') + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
          '<polyline points="7 10 12 15 17 10"/>' +
          '<line x1="12" y1="15" x2="12" y2="3"/>' +
        '</svg>' +
        '<span>Обновление</span>' +
      '</button>';
  }

  function showUpdateModal(forced) {
    if (!latestUpdateData) return;

    var existing = document.getElementById('app_update_modal');
    if (existing) existing.remove();

    var isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    var modal = document.createElement('div');
    modal.id = 'app_update_modal';
    modal.className = 'update-modal-backdrop';

    var commitMsg = latestUpdateData.message || 'Новые улучшения интерфейса и исправления ошибок';
    var shortSha = (latestUpdateData.sha || '').slice(0, 7);
    var dateStr = latestUpdateData.date ? new Date(latestUpdateData.date).toLocaleString('ru-RU') : 'Только что';

    modal.innerHTML = 
      '<div class="update-modal-card">' +
        '<div class="update-modal-icon-wrap">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
            '<polyline points="7 10 12 15 17 10"/>' +
            '<line x1="12" y1="15" x2="12" y2="3"/>' +
          '</svg>' +
        '</div>' +
        '<h3 class="update-modal-title">Доступно обновление Stockeasy</h3>' +
        '<p class="update-modal-sub">Опубликована новая стабильная версия в <b>' + GITHUB_BRANCH + '</b>' + (shortSha ? ' (<code>' + shortSha + '</code>)' : '') + '.</p>' +
        '<div class="update-modal-notes">' +
          '<div style="font-size:0.72rem;color:#94a3b8;margin-bottom:4px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;">Что нового (' + dateStr + '):</div>' +
          '<div style="font-weight:600;color:#0f172a;">' + escText(commitMsg) + '</div>' +
        '</div>' +
        '<div class="update-modal-actions">' +
          '<button type="button" class="update-modal-main-btn" onclick="window.applyAppUpdate()">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>' +
            '<span>' + (isNative ? 'Скачать обновление (APK)' : 'Обновить сейчас') + '</span>' +
          '</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="window.dismissUpdateModal()" style="color:#64748b;margin-top:4px;">Позже</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
  }

  function dismissUpdateModal() {
    if (latestUpdateData && latestUpdateData.sha) {
      sessionStorage.setItem('app_dismissed_update_' + latestUpdateData.sha, '1');
    }
    var existing = document.getElementById('app_update_modal');
    if (existing) existing.remove();
  }

  function applyAppUpdate() {
    if (latestUpdateData && latestUpdateData.sha) {
      localStorage.setItem('app_installed_commit', latestUpdateData.sha);
    }
    
    var isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    if (isNative) {
      // Прямая ссылка на последний собранный GitHub Actions APK
      var apkUrl = (latestUpdateData && latestUpdateData.apkUrl) || 'https://github.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/releases/download/latest/app-debug.apk';
      window.open(apkUrl, '_system');
      setTimeout(function() {
        window.location.reload(true);
      }, 1000);
      return;
    }

    // Сброс кэша браузера и жесткая перезагрузка
    if ('caches' in window) {
      caches.keys().then(function(names) {
        return Promise.all(names.map(function(name) { return caches.delete(name); }));
      }).catch(function(){});
    }

    // Очищаем временные скрипты и принудительно перезагружаем страницу
    var btn = document.querySelector('.update-modal-main-btn');
    if (btn) btn.innerHTML = '<span>Применение обновления…</span>';

    setTimeout(function() {
      var url = window.location.href.split('#')[0].split('?')[0];
      window.location.href = url + '?_upd=' + Date.now();
    }, 400);
  }

  function checkForAppUpdate(silent) {
    var apiUrl = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/commits/' + GITHUB_BRANCH + '?_t=' + Date.now();
    var rawUrl = 'https://raw.githubusercontent.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/' + GITHUB_BRANCH + '/www/version.json?_t=' + Date.now();

    fetch(apiUrl, { cache: 'no-store' })
      .then(function(res) {
        if (!res.ok) throw new Error('GitHub API ' + res.status);
        return res.json();
      })
      .then(function(commitData) {
        handleRemoteCommit(commitData.sha, commitData.commit && commitData.commit.message, commitData.commit && commitData.commit.committer && commitData.commit.committer.date);
      })
      .catch(function(err) {
        // Fallback на raw version.json
        fetch(rawUrl, { cache: 'no-store' })
          .then(function(res) { return res.json(); })
          .then(function(ver) {
            handleRemoteCommit(ver.commit, ver.message, ver.updatedAt, ver.apkUrl);
          })
          .catch(function() {
            if (!silent) console.log('[Updater] Не удалось связаться с сервером обновлений Git');
          });
      });
  }

  function handleRemoteCommit(remoteSha, message, date, apkUrl) {
    if (!remoteSha) return;

    var currentInstalled = localStorage.getItem('app_installed_commit') || EMBEDDED_COMMIT;

    // Первый запуск: фиксируем текущий коммит, если он не был сохранен
    if (!localStorage.getItem('app_installed_commit')) {
      localStorage.setItem('app_installed_commit', remoteSha);
      return;
    }

    if (remoteSha !== currentInstalled) {
      console.log('[Updater] Обнаружен новый пуш в ' + GITHUB_BRANCH + '!', { current: currentInstalled, remote: remoteSha });
      isUpdatePending = true;
      latestUpdateData = {
        sha: remoteSha,
        message: (message || '').split('\n')[0],
        date: date || new Date().toISOString(),
        apkUrl: apkUrl || 'https://github.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/releases/download/latest/app-debug.apk'
      };

      // Всегда показываем пульсирующую кнопку в шапке
      renderUpdateTopbarButton(latestUpdateData);

      // Модальное окно показываем только если пользователь еще не отложил («Позже») эту версию
      var isDismissed = sessionStorage.getItem('app_dismissed_update_' + remoteSha);
      if (!isDismissed) {
        showUpdateModal(false);
      }
    } else {
      isUpdatePending = false;
      latestUpdateData = null;
      renderUpdateTopbarButton(null);
    }
  }

  function escText(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Экспорт глобальных функций
  window.checkForAppUpdate = checkForAppUpdate;
  window.showUpdateModal = showUpdateModal;
  window.dismissUpdateModal = dismissUpdateModal;
  window.applyAppUpdate = applyAppUpdate;
  window.refreshUpdateUI = function() { renderUpdateTopbarButton(latestUpdateData); };

  // Запуск фоновой проверки обновлений
  setTimeout(function() { checkForAppUpdate(true); }, 2500);
  setInterval(function() { checkForAppUpdate(true); }, CHECK_INTERVAL_MS);

  // Проверка при возвращении на вкладку / активации окна
  window.addEventListener('focus', function() { checkForAppUpdate(true); });
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      checkForAppUpdate(true);
    }
  });

})();
