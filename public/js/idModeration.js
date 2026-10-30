// public/js/idModeration.js — Интерактивный Сплит-скрин модерации ИД (Пункт 33 / Скрины 8 и 9)

(function() {
  'use strict';

  var _curModerationData = null;
  var _curActiveDocKey = 'act';

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

  // Открытие окна сплит-скрин модерации
  window.openIdModerationModal = function(taskId) {
    if (!taskId) return;

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
            '<div style="font-size:.78rem;color:var(--text-3)">Сплит-скрин проверки: соответствие ТЗ Сбера, чек-лист документов, просмотр файлов и отправка на Портал</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'modal_id_moderation\').remove()" style="font-size:1.1rem;padding:4px 8px">✕</button>' +
        '</div>' +
      '</div>' +
      '<div id="idModerationContent" style="flex:1;display:flex;overflow:hidden;position:relative">' +
        '<div style="display:flex;align-items:center;justify-content:center;flex:1;color:var(--text-3);font-size:.9rem">Загрузка данных модерации…</div>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    // Загружаем данные с бэкенда
    loadModerationData(taskId);
  };

  function loadModerationData(taskId) {
    api('/tasks/' + encodeURIComponent(taskId) + '/id-moderation')
      .then(function(res) {
        _curModerationData = res;
        if (!_curActiveDocKey && res.documents && res.documents.length) {
          _curActiveDocKey = res.documents[0].key;
        }
        renderModerationSplitScreen(taskId);
      })
      .catch(function(err) {
        var el = document.getElementById('idModerationContent');
        if (el) el.innerHTML = '<div style="color:var(--red);padding:20px;text-align:center">Ошибка загрузки модерации: ' + esc(err.message || err) + '</div>';
      });
  }

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
    var leftHtml = '<div style="width:380px;min-width:340px;max-width:440px;border-right:1.5px solid var(--border);display:flex;flex-direction:column;background:#f8fafc;height:100%">' +
      // Шапка параметров заявки
      '<div style="padding:14px;background:#fff;border-bottom:1px solid var(--border)">' +
        '<div style="margin-bottom:8px">' + slaHtml + '</div>' +
        '<div style="font-size:.84rem;line-height:1.5;color:#334155">' +
          '<div><b>Заказчик:</b> ' + esc(task.customer || 'ПАО Сбербанк') + (task.vsp ? ' · ВСП: <b>' + esc(task.vsp) + '</b>' : '') + '</div>' +
          '<div style="font-size:.78rem;color:var(--text-2);margin-top:2px">📍 ' + esc(task.address || '—') + '</div>' +
        '</div>' +
        '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:.78rem;display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
          '<div>Подрядчик: <b>' + esc(task.contractor || '—') + '</b></div>' +
          '<div>Бригада: <b>' + esc(task.installer_fio || 'СМР') + '</b></div>' +
          '<div>Портов факт: <b>' + (task.fact != null ? task.fact : (task.in_order || 0)) + ' шт.</b></div>' +
          '<div>Маржа: <b style="color:var(--green)">' + (task.margin ? Number(task.margin).toLocaleString('ru-RU') + ' ₽' : '—') + '</b></div>' +
        '</div>' +
      '</div>' +

      // Список 5 документов чек-листа ИД
      '<div style="flex:1;overflow-y:auto;padding:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<span style="font-size:.82rem;font-weight:700;color:#0f172a">ЧЕК-ЛИСТ ДОКУМЕНТОВ ИД</span>' +
          '<span class="badge ' + (allApproved ? 'b-green' : (hasRejected ? 'b-red' : 'b-amber')) + '" style="font-size:.7rem">' +
            approvedCount + ' из ' + totalCount + ' одобрено' +
          '</span>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px">';

    docs.forEach(function(d) {
      var isCur = (d.key === _curActiveDocKey);
      var st = d.status || 'pending';
      var badgeHtml = '';
      if (st === 'approved') badgeHtml = '<span class="badge b-green" style="font-size:.68rem">✓ Одобрен</span>';
      else if (st === 'rejected') badgeHtml = '<span class="badge b-red" style="font-size:.68rem">✗ Отклонен</span>';
      else badgeHtml = '<span class="badge b-gray" style="font-size:.68rem">○ На проверке</span>';

      leftHtml += '<div style="border:' + (isCur ? '2px solid var(--blue)' : '1px solid var(--border)') + ';background:' + (isCur ? '#eff6ff' : '#fff') + ';border-radius:8px;padding:10px;cursor:pointer;transition:all .15s ease" onclick="window.selectModerationDoc(\'' + esc(d.key) + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">' +
          '<span style="font-size:.7rem;font-weight:700;color:var(--text-3)">' + esc(d.code || 'ИД') + '</span>' +
          badgeHtml +
        '</div>' +
        '<div style="font-weight:700;font-size:.82rem;color:#0f172a;line-height:1.3">' + esc(d.title) + '</div>' +
        (d.rejection_reason ? (
          '<div style="margin-top:6px;background:#fef2f2;border:1px solid #fecaca;padding:4px 6px;border-radius:4px;font-size:.72rem;color:#991b1b">' +
            '<b>Причина:</b> ' + esc(d.rejection_reason) +
            (d.comment ? '<br><i>«' + esc(d.comment) + '»</i>' : '') +
          '</div>'
        ) : '') +
        '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px" onclick="event.stopPropagation()">' +
          '<button type="button" class="btn btn-xs ' + (st === 'approved' ? 'btn-primary' : 'btn-ghost') + '" onclick="window.setModerationDocStatus(\'' + esc(taskId) + '\',\'' + esc(d.key) + '\',\'approved\')" style="font-size:.72rem;padding:2px 8px;font-weight:700" title="Одобрить документ">✓ Одобрить</button>' +
          '<button type="button" class="btn btn-xs ' + (st === 'rejected' ? 'btn-danger' : 'btn-ghost') + '" onclick="window.openRejectDocModal(\'' + esc(taskId) + '\',\'' + esc(d.key) + '\',\'' + esc(d.title) + '\')" style="font-size:.72rem;padding:2px 8px;font-weight:700;color:' + (st === 'rejected' ? '#fff' : 'var(--red)') + '" title="Отклонить документ с указанием причины">✗ Отклонить</button>' +
        '</div>' +
      '</div>';
    });

    leftHtml += '</div></div>' +

      // Нижний Экшн-бар
      '<div style="padding:14px;background:#fff;border-top:1.5px solid var(--border);display:flex;flex-direction:column;gap:8px">' +
        '<button type="button" class="btn btn-sm ' + (hasRejected ? 'btn-danger' : 'btn-ghost') + '" ' +
          (!hasRejected ? 'disabled style="opacity:.5;cursor:not-allowed"' : 'onclick="window.finalizeIdModeration(\'' + esc(taskId) + '\', \'return_rework\')"') +
          ' style="font-weight:700;width:100%;font-size:.82rem;padding:8px">' +
          '↩️ Вернуть подрядчику на доработку' +
        '</button>' +
        '<button type="button" class="btn btn-sm btn-primary" ' +
          (!allApproved ? 'disabled style="opacity:.5;cursor:not-allowed;background:#94a3b8"' : 'style="background:#16a34a;font-weight:700;width:100%;font-size:.84rem;padding:9px" onclick="window.finalizeIdModeration(\'' + esc(taskId) + '\', \'send_portal\')"') +
          '>' +
          '🚀 Одобрить и отправить на Портал поставщиков' +
        '</button>' +
      '</div>' +
    '</div>';

    // Правая панель 65% — встроенный интерактивный просмотрщик
    var activeDoc = docs.find(function(d){ return d.key === _curActiveDocKey; }) || docs[0] || {};
    var fileUrl = activeDoc.file_url || data.fullAlbumUrl || ('/api/tasks/' + taskId + '/id-album.pdf');
    var isImage = (activeDoc.file_type && ['png', 'jpg', 'jpeg', 'webp'].includes(activeDoc.file_type.toLowerCase())) ||
                  fileUrl.match(/\.(png|jpg|jpeg|webp)(\?.*)?$/i);

    var rightHtml = '<div style="flex:1;display:flex;flex-direction:column;background:#0f172a;height:100%">' +
      '<div style="padding:10px 16px;background:#1e293b;border-bottom:1px solid #334155;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-weight:700;font-size:.9rem">' + esc(activeDoc.title || 'Просмотр документа') + '</span>' +
          '<span class="badge b-gray" style="font-size:.68rem">' + esc(activeDoc.code || 'ИД') + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button type="button" class="btn btn-xs btn-ghost" style="color:#fff;border:1px solid #475569" onclick="window.open(\'' + esc(data.fullAlbumUrl || fileUrl) + '\', \'_blank\')">📑 Открыть полный Альбом PDF ↗</button>' +
          '<a href="' + esc(fileUrl) + '" download class="btn btn-xs btn-ghost" style="color:#fff;border:1px solid #475569">📥 Скачать</a>' +
        '</div>' +
      '</div>' +
      '<div style="flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#0f172a">' +
        (isImage ? (
          '<img src="' + esc(fileUrl) + '" style="max-width:98%;max-height:98%;object-fit:contain;border-radius:6px;box-shadow:0 8px 32px rgba(0,0,0,0.6)">'
        ) : (
          '<iframe src="' + esc(fileUrl) + '" style="width:100%;height:100%;border:none;background:#525659"></iframe>'
        )) +
      '</div>' +
    '</div>';

    cont.innerHTML = leftHtml + rightHtml;
  }

  // Выбор активного документа в дереве
  window.selectModerationDoc = function(docKey) {
    _curActiveDocKey = docKey;
    if (_curModerationData) {
      renderModerationSplitScreen(_curModerationData.task.id);
    }
  };

  // Установка статуса проверки (одобрено)
  window.setModerationDocStatus = function(taskId, docKey, status) {
    api('/tasks/' + encodeURIComponent(taskId) + '/id-moderation/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docKey: docKey, status: status })
    }).then(function(res) {
      if (_curModerationData && _curModerationData.documents) {
        var d = _curModerationData.documents.find(function(x){ return x.key === docKey; });
        if (d) {
          d.status = status;
          d.rejection_reason = null;
          d.comment = null;
        }
      }
      if (typeof showToast === 'function') showToast('Документ одобрен: ' + docKey, 'success');
      renderModerationSplitScreen(taskId);
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
        '<label style="display:block;font-size:.8rem;font-weight:700;color:#334155;margin-bottom:4px">Обязательная причина отклонения:</label>' +
        '<select id="rejectReasonSelect" class="inp" style="width:100%;padding:6px 10px;font-size:.85rem">' +
          optionsHtml +
        '</select>' +
      '</div>' +

      '<div style="margin-bottom:16px">' +
        '<label style="display:block;font-size:.8rem;font-weight:700;color:#334155;margin-bottom:4px">Комментарий / Описание замечания для подрядчика:</label>' +
        '<textarea id="rejectCommentText" class="inp" rows="3" placeholder="Укажите, что именно необходимо исправить (номера портов, метраж, лист схемы)..." style="width:100%;padding:8px 10px;font-size:.85rem"></textarea>' +
      '</div>' +

      '<div style="display:flex;justify-content:flex-end;gap:8px">' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'modal_reject_doc\').remove()">Отмена</button>' +
        '<button type="button" class="btn btn-sm btn-danger" id="btnConfirmDocReject" style="font-weight:700">Подтвердить отклонение</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    document.getElementById('btnConfirmDocReject').onclick = function() {
      var reason = document.getElementById('rejectReasonSelect').value;
      var comment = document.getElementById('rejectCommentText').value.trim();

      api('/tasks/' + encodeURIComponent(taskId) + '/id-moderation/status', {
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
        if (_curModerationData && _curModerationData.documents) {
          var d = _curModerationData.documents.find(function(x){ return x.key === docKey; });
          if (d) {
            d.status = 'rejected';
            d.rejection_reason = reason;
            d.comment = comment;
          }
        }
        if (typeof showToast === 'function') showToast('Документ отклонен: ' + reason, 'error');
        renderModerationSplitScreen(taskId);
      }).catch(function(err) {
        alert('Ошибка отклонения: ' + (err.message || err));
      });
    };
  };

  // Финализация модерации (возврат на доработку или отправка на Портал)
  window.finalizeIdModeration = function(taskId, action) {
    if (action === 'return_rework') {
      var rejectedDocs = (_curModerationData?.documents || []).filter(function(d){ return d.status === 'rejected'; });
      var summary = rejectedDocs.map(function(d){ return '• ' + d.title + ': ' + (d.rejection_reason || 'Замечания') + (d.comment ? ' (' + d.comment + ')' : ''); }).join('\n');
      if (!confirm('Вернуть комплект ИД подрядчику на доработку со следующими замечаниями:\n\n' + summary)) return;

      api('/tasks/' + encodeURIComponent(taskId) + '/id-moderation/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'return_rework', notes: summary })
      }).then(function(res) {
        alert('Комплект ИД возвращен подрядчику на доработку. Замечания зафиксированы.');
        var m = document.getElementById('modal_id_moderation');
        if (m) m.remove();
        if (window.openCard) openCard(taskId);
      });
    }

    if (action === 'send_portal') {
      if (!confirm('Все 5 обязательных документов ИД успешно проверены и одобрены.\n\nОтправить комплект ИД на Портал поставщиков?')) return;

      api('/tasks/' + encodeURIComponent(taskId) + '/id-moderation/finalize', {
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
      });
    }
  };

  // Генерация и просмотр полного альбома ИД в .PDF
  window.generateAndOpenIdAlbumPdf = function(taskId) {
    if (!taskId) return;
    if (typeof showToast === 'function') showToast('Сборка альбома ИД в .PDF формате...', 'info');

    api('/tasks/' + encodeURIComponent(taskId) + '/id-album/generate', { method: 'POST' })
      .then(function(res) {
        if (res.fileUrl) {
          window.open(res.fileUrl, '_blank');
          if (typeof showToast === 'function') showToast('Альбом ИД сформирован: ' + res.docNumber, 'success');
        } else {
          window.open('/api/tasks/' + encodeURIComponent(taskId) + '/id-album.pdf', '_blank');
        }
      })
      .catch(function(err) {
        alert('Ошибка формирования альбома ИД: ' + (err.message || err));
      });
  };

})();
