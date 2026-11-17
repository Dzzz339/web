// public/js/idModeration.js — Интерактивный Сплит-скрин модерации ИД (Пункт 33 / Скрины 8 и 9)

(function() {
  'use strict';

  var _curModerationData = null;
  var _curActiveDocKey = null;
  var _previewAvailabilityRefreshed = false;

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDateRu(d) {
    if (!d) return '—';
    var parts = String(d).slice(0, 10).split('-');
    if (parts.length === 3) return parts[2] + '.' + parts[1] + '.' + parts[0];
    return String(d);
  }

  // Навигация из модалки модерации к блокам в карточке заявки (без дублирования сущностей)
  window.navigateToCardBlock = function(tabName, elementId) {
    var modal = document.getElementById('modal_id_moderation');
    if (modal) modal.remove();
    var checklistModal = document.getElementById('modal_id_checklist');
    if (checklistModal) checklistModal.remove();

    if (typeof window.setCardTab === 'function') {
      window.setCardTab(tabName);
    }
    setTimeout(function() {
      var el = document.getElementById(elementId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.style.transition = 'box-shadow 0.3s ease';
        el.style.boxShadow = '0 0 0 3px #3b82f6';
        setTimeout(function() { el.style.boxShadow = ''; }, 2000);
      }
    }, 100);
  };

  // Открытие окна сплит-скрин модерации
  window.openIdModerationModal = function(taskId) {
    if (!taskId) return;
    _previewAvailabilityRefreshed = false;

    // Создаем контейнер модалки
    var old = document.getElementById('modal_id_moderation');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'modal_id_moderation';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(3px);animation:fadeIn .15s ease';
    modal.innerHTML = '<div style="background:#fff;border-radius:12px;width:96vw;height:94vh;max-width:1600px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.4)">' +
      '<div style="padding:14px 20px;border-bottom:1.5px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:#fff">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<span style="font-size:1.25rem">👁️</span>' +
          '<div>' +
            '<div style="font-weight:800;font-size:1.05rem;color:#0f172a">Модерация исполнительной документации (ИД) · Заявка № ' + esc(taskId) + '</div>' +
            '<div style="font-size:.78rem;color:var(--text-3)">Сплит-скрин проверки: соответствие ТЗ Заказчика, чек-лист документов, просмотр файлов и отправка на Портал</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<button type="button" class="btn btn-sm btn-ghost" id="btnIdModerationClose" style="font-size:1.1rem;padding:4px 8px">✕</button>' +
        '</div>' +
      '</div>' +
      '<div id="idModerationContent" style="flex:1;display:flex;overflow:hidden;position:relative">' +
        '<div style="display:flex;align-items:center;justify-content:center;flex:1;color:var(--text-3);font-size:.9rem">Загрузка данных модерации…</div>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    var closeBtn = modal.querySelector('#btnIdModerationClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        modal.remove();
      });
    }

    // Загружаем данные с бэкенда
    loadModerationData(taskId);
  };

  function loadModerationData(taskId) {
    window.api('/tasks/' + encodeURIComponent(taskId) + '/id-moderation')
      .then(function(res) {
        _curModerationData = res;
        var docs = res.documents || [];
        var activeExists = docs.some(function(d){ return d.key === _curActiveDocKey || d.alias === _curActiveDocKey; });
        if (!activeExists && docs.length > 0) {
          _curActiveDocKey = docs[0].key;
        }
        renderModerationSplitScreen(taskId);
      })
      .catch(function(err) {
        var el = document.getElementById('idModerationContent');
        if (el) el.innerHTML = '<div style="color:var(--red);padding:20px;text-align:center">Ошибка загрузки модерации: ' + esc(err.message || err) + '</div>';
      });
  }
  window.loadModerationData = loadModerationData;

  function renderModerationSplitScreen(taskId) {
    var cont = document.getElementById('idModerationContent');
    if (!cont || !_curModerationData) return;

    var data = _curModerationData;
    var task = data.task || {};
    var docs = data.documents || [];

    // Расчет SLA-таймера
    var slaHtml = '';
    if (task.deadline) {
      var dDl = new Date(task.deadline);
      var now = new Date();
      var diffHours = Math.round((dDl - now) / (1000 * 60 * 60));
      var diffDays = Math.round(diffHours / 24);

      if (diffHours < 0) {
        slaHtml = '<div style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;padding:6px 10px;border-radius:6px;font-size:.78rem;font-weight:700;display:flex;align-items:center;gap:6px">' +
          '<span>⚠️</span> <span>SLA ПРОСРОЧЕН: +' + Math.abs(diffDays) + ' дн. (Дедлайн: ' + formatDateRu(task.deadline) + ')</span>' +
        '</div>';
      } else if (diffDays <= 2) {
        slaHtml = '<div style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:6px 10px;border-radius:6px;font-size:.78rem;font-weight:700;display:flex;align-items:center;gap:6px">' +
          '<span>⏳</span> <span>Критический срок SLA: осталось ' + diffHours + ' ч. (Дедлайн: ' + formatDateRu(task.deadline) + ')</span>' +
        '</div>';
      } else {
        slaHtml = '<div style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:6px 10px;border-radius:6px;font-size:.78rem;font-weight:700;display:flex;align-items:center;gap:6px">' +
          '<span>⏳</span> <span>В графике SLA: осталось ' + diffDays + ' дн. (Дедлайн: ' + formatDateRu(task.deadline) + ')</span>' +
        '</div>';
      }
    } else {
      slaHtml = '<div style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;padding:6px 10px;border-radius:6px;font-size:.78rem">Дедлайн не установлен</div>';
    }

    // Подсчет статистики одобрений
    var approvedCount = docs.filter(function(d){ return d.status === 'approved'; }).length;
    var rejectedCount = docs.filter(function(d){ return d.status === 'rejected'; }).length;
    var totalCount = docs.length;
    var allApproved = (approvedCount === totalCount && totalCount > 0);
    var hasRejected = (rejectedCount > 0);

    // Левая панель 35%
    var leftHtml = '<div style="width:390px;min-width:350px;max-width:440px;border-right:1.5px solid var(--border);display:flex;flex-direction:column;background:#f8fafc;height:100%">' +
      // Шапка параметров заявки
      '<div style="padding:14px;background:#fff;border-bottom:1px solid var(--border)">' +
        '<div style="margin-bottom:8px">' + slaHtml + '</div>' +
        '<div style="font-size:.84rem;line-height:1.5;color:#334155">' +
          '<div><b>Заказчик:</b> ' + esc(task.customer || 'Заказчик') + (task.vsp ? ' · ВСП: <b>' + esc(task.vsp) + '</b>' : '') + '</div>' +
          '<div style="font-size:.78rem;color:var(--text-2);margin-top:2px">📍 ' + esc(task.address || '—') + '</div>' +
        '</div>' +
        '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:.78rem;display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
          '<div>Подрядчик: <b>' + esc(task.contractor || '—') + '</b></div>' +
          '<div>Бригада: <b>' + esc(task.installer_fio || 'СМР') + '</b></div>' +
          '<div>Портов факт: <b>' + (task.fact != null ? task.fact : (task.in_order || 0)) + ' шт.</b></div>' +
          '<div>Маржа: <b style="color:var(--green)">' + (task.margin ? Number(task.margin).toLocaleString('ru-RU') + ' ₽' : '—') + '</b></div>' +
        '</div>' +
        '<div style="margin-top:8px">' +
          '<button type="button" class="btn btn-xs btn-ghost" id="btnNavShipments" style="border:1px solid #cbd5e1;font-size:.73rem;padding:3px 8px;font-weight:600;color:#334155;width:100%">' +
            '🚚 Перейти к ТМЦ и отгрузкам ↗' +
          '</button>' +
        '</div>' +
      '</div>' +

      // Список документов чек-листа ИД
      '<div style="flex:1;overflow-y:auto;padding:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:6px">' +
          '<span style="font-size:.82rem;font-weight:700;color:#0f172a">ЧЕК-ЛИСТ ДОКУМЕНТОВ ИД</span>' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<button type="button" class="btn btn-xs btn-outline" id="btnChecklistConfig" title="Настроить состав документов альбома ИД" style="font-size:.7rem;padding:2px 6px;font-weight:600">' +
              '⚙️ Состав ИД' +
            '</button>' +
            '<span class="badge ' + (allApproved ? 'b-green' : (hasRejected ? 'b-red' : 'b-amber')) + '" style="font-size:.7rem">' +
              approvedCount + ' из ' + totalCount + ' одобрено' +
            '</span>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px">';

    docs.forEach(function(d) {
      var isCur = (d.key === _curActiveDocKey || (d.alias && d.alias === _curActiveDocKey));
      var st = d.status || 'pending';
      var badgeHtml = '';
      if (st === 'approved') badgeHtml = '<span class="badge b-green" style="font-size:.68rem">✓ Одобрен</span>';
      else if (st === 'rejected') badgeHtml = '<span class="badge b-red" style="font-size:.68rem">✗ Отклонен</span>';
      else badgeHtml = '<span class="badge b-gray" style="font-size:.68rem">○ На проверке</span>';

      var kjJumpBtn = '';
      if (d.key === 'kj') {
        kjJumpBtn = '<button type="button" class="btn btn-xs btn-ghost" data-action="nav-kj" style="font-size:.7rem;padding:1px 6px;color:#2563eb;font-weight:600" title="Открыть Кабельный журнал в карточке заявки">📋 Перейти к КЖ ↗</button>';
      }

      leftHtml += '<div class="moderation-doc-card" data-doc-key="' + esc(d.key) + '" style="border:' + (isCur ? '2px solid var(--blue)' : '1px solid var(--border)') + ';background:' + (isCur ? '#eff6ff' : '#fff') + ';border-radius:8px;padding:10px;cursor:pointer;transition:all .15s ease">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<span style="font-size:.7rem;font-weight:700;color:var(--text-3)">' + esc(d.code || 'ИД') + '</span>' +
            kjJumpBtn +
          '</div>' +
          badgeHtml +
        '</div>' +
        '<div style="font-weight:700;font-size:.82rem;color:#0f172a;line-height:1.3">' + esc(d.title) + '</div>' +
        (d.rejection_reason ? (
          '<div style="margin-top:6px;background:#fef2f2;border:1px solid #fecaca;padding:4px 6px;border-radius:4px;font-size:.72rem;color:#991b1b">' +
            '<b>Причина:</b> ' + esc(d.rejection_reason) +
            (d.comment ? '<br><i>«' + esc(d.comment) + '»</i>' : '') +
          '</div>'
        ) : '') +
        '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px">' +
          '<button type="button" class="btn btn-xs ' + (st === 'approved' ? 'btn-primary' : 'btn-ghost') + '" data-action="approve-doc" data-doc-key="' + esc(d.key) + '" ' +
            (d.available === false
              ? 'disabled aria-disabled="true" style="opacity:.5;cursor:not-allowed;font-size:.72rem;padding:2px 8px;font-weight:700" title="Документ не сформирован или недоступен для одобрения"'
              : 'style="font-size:.72rem;padding:2px 8px;font-weight:700" title="Одобрить документ"') +
          '>✓ Одобрить</button>' +
          '<button type="button" class="btn btn-xs ' + (st === 'rejected' ? 'btn-danger' : 'btn-ghost') + '" data-action="reject-doc" data-doc-key="' + esc(d.key) + '" data-doc-title="' + esc(d.title) + '" style="font-size:.72rem;padding:2px 8px;font-weight:700;color:' + (st === 'rejected' ? '#fff' : 'var(--red)') + '" title="Отклонить документ с указанием причины">✗ Отклонить</button>' +
        '</div>' +
      '</div>';
    });

    leftHtml += '</div></div>' +

      // Нижний Экшн-бар
      '<div style="padding:14px;background:#fff;border-top:1.5px solid var(--border);display:flex;flex-direction:column;gap:8px">' +
        '<button type="button" class="btn btn-sm ' + (hasRejected ? 'btn-danger' : 'btn-ghost') + '" id="btnFinalizeRework" ' +
          (!hasRejected ? 'disabled style="opacity:.5;cursor:not-allowed"' : '') +
          ' style="font-weight:700;width:100%;font-size:.82rem;padding:8px">' +
          '↩️ Вернуть подрядчику на доработку' +
        '</button>' +
        '<button type="button" class="btn btn-sm btn-primary" id="btnFinalizePortal" ' +
          (!allApproved ? 'disabled style="opacity:.5;cursor:not-allowed;background:#94a3b8"' : 'style="background:#16a34a;font-weight:700;width:100%;font-size:.84rem;padding:9px"') +
          '>' +
          '🚀 Одобрить и отправить на Портал поставщиков' +
        '</button>' +
        (data.moderationStatus === 'approved' && ['admin', 'director'].includes(String(window.S && window.S.user && window.S.user.role || '').toLowerCase())
          ? '<button type="button" class="btn btn-sm btn-ghost" id="btnAdminRollbackIdMod" style="color:var(--orange);border:1.5px solid var(--orange);font-weight:700;width:100%;font-size:.82rem;padding:7px;margin-top:6px">↩️ Откатить (Админ)</button>'
          : '') +
      '</div>' +
    '</div>';

    // Правая панель 65% — встроенный интерактивный просмотрщик
    var activeDoc = docs.find(function(d){ return d.key === _curActiveDocKey || (d.alias && d.alias === _curActiveDocKey); }) || docs[0] || {};
    var rawFileUrl = activeDoc.file_url || data.fullAlbumUrl || ('/api/tasks/' + encodeURIComponent(taskId) + '/id-album.pdf');
    var rawFullAlbumUrl = data.fullAlbumUrl || ('/api/tasks/' + encodeURIComponent(taskId) + '/id-album.pdf');

    var authFileUrl = (typeof window.withAuthToken === 'function') ? window.withAuthToken(rawFileUrl) : rawFileUrl;
    var authFullAlbumUrl = (typeof window.withAuthToken === 'function') ? window.withAuthToken(rawFullAlbumUrl) : rawFullAlbumUrl;

    var isImage = (activeDoc.file_type && ['png', 'jpg', 'jpeg', 'webp'].includes(activeDoc.file_type.toLowerCase())) ||
                  rawFileUrl.match(/\.(png|jpg|jpeg|webp)(\?.*)?$/i);

    var kjHeaderNav = '';
    if (activeDoc.key === 'kj') {
      kjHeaderNav = '<button type="button" class="btn btn-xs btn-ghost" id="btnHeaderNavKj" style="color:#93c5fd;border:1px solid #3b82f6">📋 Открыть КЖ в карточке ↗</button>';
    }

    var rightHtml = '<div style="flex:1;display:flex;flex-direction:column;background:#0f172a;height:100%">' +
      '<div style="padding:10px 16px;background:#1e293b;border-bottom:1px solid #334155;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-weight:700;font-size:.9rem">' + esc(activeDoc.title || 'Просмотр документа') + '</span>' +
          '<span class="badge b-gray" style="font-size:.68rem">' + esc(activeDoc.code || 'ИД') + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:6px">' +
          kjHeaderNav +
          '<button type="button" class="btn btn-xs btn-ghost" id="btnOpenFullAlbum" style="color:#fff;border:1px solid #475569">📑 Открыть полный Альбом PDF ↗</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" id="btnDownloadDoc" style="color:#fff;border:1px solid #475569">📥 Скачать</button>' +
        '</div>' +
      '</div>' +
      '<div style="flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#0f172a">';

    if (activeDoc.available === false) {
      rightHtml += '<div style="background:#1e293b;border:1px dashed #475569;border-radius:10px;padding:32px 24px;text-align:center;color:#cbd5e1;max-width:520px;box-shadow:0 12px 36px rgba(0,0,0,0.4)">' +
        '<div style="font-size:2.5rem;margin-bottom:12px">📄</div>' +
        '<div style="font-weight:700;font-size:1.1rem;color:#f8fafc;margin-bottom:8px">Документ не сформирован или недоступен</div>' +
        '<div style="font-size:.85rem;color:#94a3b8;line-height:1.5;margin-bottom:20px">' +
          'Файл для «' + esc(activeDoc.title) + '» пока отсутствует на диске. Чтобы его проверить и одобрить, сформируйте Альбом ИД в PDF или прикрепите соответствующий файл в карточке заявки.' +
        '</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
          '<button type="button" class="btn btn-sm btn-primary" id="btnGenAlbumPdf" style="font-weight:700">⚡ Сформировать Альбом ИД (.PDF)</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" id="btnRefreshPreview" style="border:1px solid #475569;color:#fff">🔄 Обновить предпросмотр</button>' +
        '</div>' +
      '</div>';
    } else if (isImage) {
      rightHtml += '<img src="' + esc(authFileUrl) + '" style="max-width:98%;max-height:98%;object-fit:contain;border-radius:6px;box-shadow:0 8px 32px rgba(0,0,0,0.6)">';
    } else {
      rightHtml += '<iframe src="' + esc(authFileUrl) + '" style="width:100%;height:100%;border:none;background:#525659"></iframe>';
    }

    rightHtml += '</div></div>';

    cont.innerHTML = leftHtml + rightHtml;

    // Привязка обработчиков событий (без inline onclick)
    var btnNavShipments = cont.querySelector('#btnNavShipments');
    if (btnNavShipments) {
      btnNavShipments.addEventListener('click', function() {
        window.navigateToCardBlock('items', 'shipmentsBlock');
      });
    }

    var btnChecklistConfig = cont.querySelector('#btnChecklistConfig');
    if (btnChecklistConfig) {
      btnChecklistConfig.addEventListener('click', function() {
        window.openIdChecklistConfigModal(taskId);
      });
    }

    cont.querySelectorAll('[data-action="nav-kj"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        window.navigateToCardBlock('main', 'portsBlock');
      });
    });

    cont.querySelectorAll('.moderation-doc-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var key = card.getAttribute('data-doc-key');
        if (key) window.selectModerationDoc(key);
      });
    });

    cont.querySelectorAll('[data-action="approve-doc"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var key = btn.getAttribute('data-doc-key');
        if (key) window.setModerationDocStatus(taskId, key, 'approved');
      });
    });

    cont.querySelectorAll('[data-action="reject-doc"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var key = btn.getAttribute('data-doc-key');
        var title = btn.getAttribute('data-doc-title') || key;
        if (key) window.openRejectDocModal(taskId, key, title);
      });
    });

    var btnFinalizeRework = cont.querySelector('#btnFinalizeRework');
    if (btnFinalizeRework && !btnFinalizeRework.disabled) {
      btnFinalizeRework.addEventListener('click', function() {
        window.finalizeIdModeration(taskId, 'return_rework');
      });
    }

    var btnFinalizePortal = cont.querySelector('#btnFinalizePortal');
    if (btnFinalizePortal && !btnFinalizePortal.disabled) {
      btnFinalizePortal.addEventListener('click', function() {
        window.finalizeIdModeration(taskId, 'send_portal');
      });
    }

    var btnAdminRollbackIdMod = cont.querySelector('#btnAdminRollbackIdMod');
    if (btnAdminRollbackIdMod) {
      btnAdminRollbackIdMod.addEventListener('click', function() {
        window.adminRollbackIdModeration(taskId);
      });
    }

    var btnHeaderNavKj = cont.querySelector('#btnHeaderNavKj');
    if (btnHeaderNavKj) {
      btnHeaderNavKj.addEventListener('click', function() {
        window.navigateToCardBlock('main', 'portsBlock');
      });
    }

    var btnOpenFullAlbum = cont.querySelector('#btnOpenFullAlbum');
    if (btnOpenFullAlbum) {
      btnOpenFullAlbum.addEventListener('click', function() {
        window.open(authFullAlbumUrl, '_blank');
      });
    }

    var btnDownloadDoc = cont.querySelector('#btnDownloadDoc');
    if (btnDownloadDoc) {
      btnDownloadDoc.addEventListener('click', function() {
        window.downloadAuthFile(rawFileUrl, (activeDoc.title || 'document') + '.pdf');
      });
    }

    var btnGenAlbumPdf = cont.querySelector('#btnGenAlbumPdf');
    if (btnGenAlbumPdf) {
      btnGenAlbumPdf.addEventListener('click', function() {
        window.generateAndOpenIdAlbumPdf(taskId);
      });
    }

    var btnRefreshPreview = cont.querySelector('#btnRefreshPreview');
    if (btnRefreshPreview) {
      btnRefreshPreview.addEventListener('click', function() {
        window.loadModerationData(taskId);
      });
    }

    var previewFrame = cont.querySelector('iframe');
    if (previewFrame && docs.some(function(d){ return d.available === false; }) && !_previewAvailabilityRefreshed) {
      _previewAvailabilityRefreshed = true;
      previewFrame.addEventListener('load', function() {
        if (document.getElementById('modal_id_moderation')) loadModerationData(taskId);
      }, { once: true });
    }
  }

  // Выбор активного документа в дереве
  window.selectModerationDoc = function(docKey) {
    _curActiveDocKey = docKey;
    if (_curModerationData) {
      renderModerationSplitScreen(_curModerationData.task.id);
    }
  };

  // Модалка настройки состава чек-листа ИД (Задача 6.3)
  window.openIdChecklistConfigModal = function(taskId) {
    var old = document.getElementById('modal_id_checklist');
    if (old) old.remove();

    if (!_curModerationData) return;
    var task = _curModerationData.task || {};
    var isFinalized = (task.id_moderation_status === 'approved');
    var items = _curModerationData.availableChecklistItems || [];
    var checklist = _curModerationData.checklist || {};

    var modal = document.createElement('div');
    modal.id = 'modal_id_checklist';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:100001;display:flex;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(2px)';

    var itemsHtml = items.map(function(item) {
      var isChecked = (checklist[item.key] === true);
      var isMandatory = item.mandatory === true;
      var disabledAttr = (isMandatory || isFinalized) ? 'disabled' : '';

      var categoryBadge = '';
      if (item.category === 'basic') categoryBadge = '<span class="badge b-blue" style="font-size:.65rem">Обязательный</span>';
      else if (item.category === 'appendix') categoryBadge = '<span class="badge b-gray" style="font-size:.65rem">Приложение</span>';
      else categoryBadge = '<span class="badge b-amber" style="font-size:.65rem">Настраиваемый</span>';

      return '<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid #f1f5f9;cursor:' + (disabledAttr ? 'not-allowed' : 'pointer') + ';background:' + (isChecked ? '#f8fafc' : '#fff') + '">' +
        '<input type="checkbox" data-checklist-key="' + esc(item.key) + '" ' + (isChecked ? 'checked' : '') + ' ' + disabledAttr + ' style="width:16px;height:16px;cursor:' + (disabledAttr ? 'not-allowed' : 'pointer') + '">' +
        '<div style="flex:1">' +
          '<div style="font-weight:700;font-size:.82rem;color:#0f172a;display:flex;align-items:center;gap:6px">' +
            '<span>' + esc(item.code) + '</span> ' +
            '<span>' + esc(item.title) + '</span>' +
            categoryBadge +
          '</div>' +
          (isMandatory ? '<div style="font-size:.7rem;color:#64748b">Входит в базовый состав альбома ИД и не может быть отключен</div>' : '') +
        '</div>' +
      '</label>';
    }).join('');

    modal.innerHTML = '<div style="background:#fff;border-radius:10px;width:100%;max-width:580px;padding:20px;box-shadow:0 16px 48px rgba(0,0,0,0.3);display:flex;flex-direction:column;max-height:90vh">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
        '<div style="font-weight:700;font-size:1.05rem;color:#0f172a">⚙️ Настройка состава комплекта ИД</div>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-action="close-checklist">✕</button>' +
      '</div>' +
      (isFinalized ? (
        '<div style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;padding:8px 12px;border-radius:6px;font-size:.78rem;font-weight:700;margin-bottom:10px">' +
          '⚠️ Комплект ИД уже одобрен и отправлен на Портал. Изменение состава заблокировано.' +
        '</div>'
      ) : (
        '<div style="font-size:.78rem;color:var(--text-3);margin-bottom:10px">' +
          'Отметьте документы, входящие в исполнительную документацию для данного Заказчика и объекта.' +
        '</div>'
      )) +
      '<div style="flex:1;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:16px">' +
        itemsHtml +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px">' +
        '<button type="button" class="btn btn-sm btn-ghost" data-action="close-checklist">Отмена</button>' +
        (!isFinalized ? '<button type="button" class="btn btn-sm btn-primary" id="btnSaveIdChecklist" style="font-weight:700">Сохранить состав</button>' : '') +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-action="close-checklist"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        modal.remove();
      });
    });

    var saveBtn = document.getElementById('btnSaveIdChecklist');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var payload = {};
        modal.querySelectorAll('input[data-checklist-key]').forEach(function(inp) {
          var k = inp.getAttribute('data-checklist-key');
          if (k) payload[k] = inp.checked;
        });

        saveBtn.disabled = true;
        saveBtn.innerText = 'Сохранение…';

        window.api('/tasks/' + encodeURIComponent(taskId) + '/id-moderation/checklist', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function(res) {
          modal.remove();
          if (typeof showToast === 'function') showToast('Состав ИД успешно обновлен', 'success');
          loadModerationData(taskId);
        }).catch(function(err) {
          saveBtn.disabled = false;
          saveBtn.innerText = 'Сохранить состав';
          alert('Ошибка обновления состава ИД: ' + (err.message || err));
        });
      });
    }
  };

  // Установка статуса проверки (одобрено)
  window.setModerationDocStatus = function(taskId, docKey, status) {
    if (status === 'approved' && _curModerationData && _curModerationData.documents) {
      var targetDoc = _curModerationData.documents.find(function(x){ return x.key === docKey || x.alias === docKey; });
      if (targetDoc && targetDoc.available === false) {
        alert('Нельзя одобрить документ: файл документа не сформирован или недоступен.');
        return;
      }
    }

    window.api('/tasks/' + encodeURIComponent(taskId) + '/id-moderation/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docKey: docKey, status: status })
    }).then(function(res) {
      if (!res || res.success !== true) {
        alert('Ошибка обновления статуса: ' + ((res && res.error) || 'Сервер отклонил запрос'));
        return;
      }
      if (typeof showToast === 'function') showToast('Документ одобрен: ' + docKey, 'success');
      loadModerationData(taskId);
    }).catch(function(err) {
      alert('Ошибка обновления статуса: ' + (err.message || err));
    });
  };

  // Модалка отклонения документа с обязательной причиной
  window.openRejectDocModal = function(taskId, docKey, docTitle) {
    var old = document.getElementById('modal_reject_doc');
    if (old) old.remove();

    var reasons = [
      'Плохое качество скана / нечитаемый документ',
      'Нет подписи / печати ответственного лица',
      'Ошибка в спецификации материалов (несоответствие факту)',
      'Неполный метраж / расхождение портов в Кабельном журнале',
      'Несоответствие исполнительной схемы фактической трассировке',
      'Ошибки в протоколе Fluke (наличие FAIL / незавершенные тесты)',
      'Иное замечание по оформлению'
    ];

    var optionsHtml = reasons.map(function(r){
      return '<option value="' + esc(r) + '">' + esc(r) + '</option>';
    }).join('');

    var modal = document.createElement('div');
    modal.id = 'modal_reject_doc';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(2px)';
    modal.innerHTML = '<div style="background:#fff;border-radius:10px;width:100%;max-width:520px;padding:20px;box-shadow:0 16px 48px rgba(0,0,0,0.3)">' +
      '<div style="font-weight:700;font-size:1.05rem;color:#dc2626;margin-bottom:6px">Отклонение документа ИД</div>' +
      '<div style="font-size:.85rem;color:#475569;margin-bottom:14px">Документ: <b>' + esc(docTitle) + '</b></div>' +

      '<div style="margin-bottom:12px">' +
        '<label for="rejectReasonSelect" style="display:block;font-size:.8rem;font-weight:700;color:#334155;margin-bottom:4px">Обязательная причина отклонения:</label>' +
        '<select id="rejectReasonSelect" class="select" style="width:100%">' +
          optionsHtml +
        '</select>' +
      '</div>' +

      '<div style="margin-bottom:16px">' +
        '<label style="display:block;font-size:.8rem;font-weight:700;color:#334155;margin-bottom:4px">Комментарий / Описание замечания для подрядчика:</label>' +
        '<textarea id="rejectCommentText" class="inp" rows="3" placeholder="Укажите, что именно необходимо исправить (номера портов, метраж, лист схемы)..." style="width:100%;padding:8px 10px;font-size:.85rem"></textarea>' +
      '</div>' +

      '<div style="display:flex;justify-content:flex-end;gap:8px">' +
        '<button type="button" class="btn btn-sm btn-ghost" data-action="close-reject-modal">Отмена</button>' +
        '<button type="button" class="btn btn-sm btn-danger" id="btnConfirmDocReject" style="font-weight:700">Подтвердить отклонение</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-action="close-reject-modal"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        modal.remove();
      });
    });

    var confirmBtn = document.getElementById('btnConfirmDocReject');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function() {
        var reason = (document.getElementById('rejectReasonSelect').value || '').trim();
        var comment = (document.getElementById('rejectCommentText').value || '').trim();

        if (!reason) {
          alert('Пожалуйста, укажите причину отклонения документа');
          return;
        }

        window.api('/tasks/' + encodeURIComponent(taskId) + '/id-moderation/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            docKey: docKey,
            status: 'rejected',
            rejectionReason: reason,
            comment: comment
          })
        }).then(function() {
          modal.remove();
          if (typeof showToast === 'function') showToast('Документ отклонен: ' + reason, 'error');
          loadModerationData(taskId);
        }).catch(function(err) {
          alert('Ошибка отклонения: ' + (err.message || err));
        });
      });
    }
  };

  // Финализация модерации (возврат на доработку или отправка на Портал)
  window.finalizeIdModeration = function(taskId, action) {
    if (action === 'return_rework') {
      var rejectedDocs = (_curModerationData?.documents || []).filter(function(d){ return d.status === 'rejected'; });
      var summary = rejectedDocs.map(function(d){ return '• ' + d.title + ': ' + (d.rejection_reason || 'Замечания') + (d.comment ? ' (' + d.comment + ')' : ''); }).join('\n');
      if (!confirm('Вернуть комплект ИД подрядчику на доработку со следующими замечаниями:\n\n' + summary)) return;

      window.api('/tasks/' + encodeURIComponent(taskId) + '/id-moderation/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'return_rework', notes: summary })
      }).then(function(res) {
        alert('Комплект ИД возвращен подрядчику на доработку. Замечания зафиксированы.');
        var m = document.getElementById('modal_id_moderation');
        if (m) m.remove();
        if (window.openCard) openCard(taskId);
      }).catch(function(err) {
        alert('Ошибка возврата на доработку: ' + (err.message || err));
      });
    }

    if (action === 'send_portal') {
      if (!confirm('Все документы чек-листа ИД успешно проверены и одобрены.\n\nОтправить комплект ИД на Портал поставщиков?')) return;

      window.api('/tasks/' + encodeURIComponent(taskId) + '/id-moderation/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_portal' })
      }).then(function(res) {
        if (typeof showToast === 'function') {
          showToast('🎉 Комплект ИД успешно одобрен и отправлен на Портал поставщиков!', 'success');
        } else {
          alert('🎉 Комплект ИД успешно одобрен и отправлен на Портал поставщиков!');
        }
        var m = document.getElementById('modal_id_moderation');
        if (m) m.remove();
        if (window.openCard) openCard(taskId);
      }).catch(function(err) {
        alert('Ошибка отправки на Портал: ' + (err.message || err));
      });
    }
  };

  // Откат утверждения модерации ИД (только admin / director)
  window.adminRollbackIdModeration = function(taskId) {
    var reason = prompt('Укажите причину отката утверждения модерации ИД (обязательно):');
    if (reason === null) return;
    reason = (reason || '').trim();
    if (!reason) return alert('Причина отката обязательна!');
    window.api('/tasks/' + encodeURIComponent(taskId) + '/id-moderation/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason })
    }).then(function(res) {
      if (res && res.error) return alert('Ошибка отката: ' + res.error);
      if (typeof showToast === 'function') {
        showToast('↩️ Модерация ИД возвращена в статус проверки', 'success');
      } else {
        alert('↩️ Модерация ИД возвращена в статус проверки');
      }
      loadModerationData(taskId);
      if (window.openCard) openCard(taskId);
    }).catch(function(err) {
      alert('Ошибка отката: ' + (err.message || err));
    });
  };

  // Генерация и просмотр полного альбома ИД в .PDF
  window.generateAndOpenIdAlbumPdf = function(taskId) {
    if (!taskId) return;
    if (typeof showToast === 'function') showToast('Сборка альбома ИД в .PDF формате...', 'info');

    window.api('/tasks/' + encodeURIComponent(taskId) + '/id-album/generate', { method: 'POST' })
      .then(function(res) {
        var targetUrl = res.fileUrl || ('/api/tasks/' + encodeURIComponent(taskId) + '/id-album.pdf');
        var authUrl = (typeof window.withAuthToken === 'function') ? window.withAuthToken(targetUrl) : targetUrl;
        window.open(authUrl, '_blank');
        if (typeof showToast === 'function') {
          showToast('Альбом ИД сформирован: ' + (res.docNumber || taskId), 'success');
        }
        loadModerationData(taskId);
      })
      .catch(function(err) {
        alert('Ошибка формирования альбома ИД: ' + (err.message || err));
      });
  };

})();
