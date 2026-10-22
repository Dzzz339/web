function cleanContractNumber(num) {
  if (!num) return '';
  return String(num).replace(/^[№\s#]+/, '').trim();
}

function getContractSortKey(c) {
  var internal = String(c.internal_number || '').trim();
  var m = internal.match(/^(\d{2})(\d{2})-(\d+)/);
  if (m) {
    var month = m[1], year = '20' + m[2], seq = m[3].padStart(4, '0');
    return parseInt(year + month + seq, 10);
  }
  if (c.contract_date) {
    var d = new Date(c.contract_date);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return Number(c.id) || 0;
}

window.toggleCardContractPicker = function(force) {
  S._cardContractPickerOpen = force !== undefined ? force : !S._cardContractPickerOpen;
  var box = document.getElementById('card_contract_picker_box');
  if (box) {
    box.style.display = S._cardContractPickerOpen ? 'block' : 'none';
  } else {
    renderApp();
  }
};

window.setCardContractFilterMode = function(mode) {
  S._cardContractFilterMode = mode;
  renderApp();
};

window.onCardOwnCompanyChange = function(val) {
  var numVal = Number(val);
  S.cardDraft.own_company_id = numVal;
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(S.cardId); });
  if (t) {
    t.own_company_id = numVal;
    api('/tasks/' + encodeURIComponent(t.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ own_company_id: numVal })
    }).catch(function(e){ console.error('Error auto-saving own_company_id:', e); });
  }
  renderApp();
};

window.toggleTaskEditLock = function() {
  S._taskEditUnlocked = !S._taskEditUnlocked;
  renderApp();
};

window.approveTaskEntry = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;

  var assigneeVal = (S.cardDraft && S.cardDraft.assignee !== undefined) ? S.cardDraft.assignee : (t.assignee || '');
  if (!assigneeVal) {
    assigneeVal = (S.user && S.user.full_name) ? S.user.full_name : '';
    if (!assigneeVal && S.users && S.users.length) {
      var pm = S.users.find(function(u){ return u.role === 'manager'; }) || S.users[0];
      if (pm) assigneeVal = pm.full_name;
    }
  }

  var isSber = !(t.customer) || String(t.customer).toLowerCase().includes('сбер');
  var defaultCtrl = isSber ? 'Городович И.О.' : 'Городович М.В.';
  var controllerVal = (S.cardDraft && S.cardDraft.controller !== undefined) ? S.cardDraft.controller : (t.controller || defaultCtrl);

  var payload = {
    assignee: assigneeVal,
    controller: controllerVal,
    assignmentStatus: 'accepted'
  };

  if (S.cardDraft && S.cardDraft.own_company_id) {
    payload.own_company_id = S.cardDraft.own_company_id;
  } else if (!t.own_company_id) {
    payload.own_company_id = isSber ? 2 : 1;
  }

  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function() {
    return api('/tasks/' + encodeURIComponent(taskId) + '/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignee: assigneeVal,
        controller: controllerVal,
        own_company_id: payload.own_company_id,
        tech_link: t.tech_link || t.techLink || null
      })
    }).catch(function(){ return {}; });
  })
  .then(function() {
    t.assignee = assigneeVal;
    t.controller = controllerVal;
    t.assignmentStatus = 'accepted';
    t.assignment_status = 'accepted';
    t.status = 'progress';
    t.stage_num = 1;
    if (payload.own_company_id) t.own_company_id = payload.own_company_id;
    S.cardDraft = {};
    S._taskEditUnlocked = false;
    showToast('✅ Заявка принята в работу! Режим защиты включен.', 'success');
    renderApp();
  })
  .catch(function(err) {
    alert('Ошибка подтверждения заявки: ' + err.message);
  });
};

window.editCardTechLink = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  var curLink = t.tech_link || t.techLink || '';

  var old = document.getElementById('_tech_link_modal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = '_tech_link_modal';
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML = '<div style="background:#fff;border-radius:12px;padding:20px 24px;max-width:540px;width:92%;box-shadow:0 12px 32px rgba(0,0,0,0.25)">' +
    '<h3 style="margin-top:0;font-size:1.1rem;display:flex;align-items:center;gap:6px">📁 Ссылка на Яндекс.Диск / Облако ТЗ</h3>' +
    '<div style="font-size:.82rem;color:var(--text-3);margin-bottom:12px">Укажите прямую ссылку на папку с технической документацией и проектом объекта для субподрядчика:</div>' +
    '<input type="url" id="_tech_link_inp" value="' + escHtml(curLink) + '" placeholder="https://disk.yandex.ru/d/..." style="width:100%;padding:8px 12px;font-size:.88rem;border:1.5px solid var(--border);border-radius:6px;box-sizing:border-box;margin-bottom:16px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_tech_link_modal\').remove()">Отмена</button>' +
      '<button type="button" id="_tech_link_save_btn" class="btn btn-sm btn-primary" style="padding:6px 16px;font-weight:700">✓ Сохранить ссылку</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(modal);
  var inp = document.getElementById('_tech_link_inp');
  if (inp) { inp.focus(); inp.select(); }

  document.getElementById('_tech_link_save_btn').onclick = function() {
    var newLink = (inp ? inp.value : '').trim();
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Сохранение...';

    api('/tasks/' + encodeURIComponent(taskId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tech_link: newLink, techLink: newLink })
    }).then(function() {
      t.tech_link = newLink;
      t.techLink = newLink;
      modal.remove();
      showToast('Ссылка на тех. документацию обновлена', 'success');
      renderApp();
    }).catch(function(err) {
      btn.disabled = false;
      btn.textContent = '✓ Сохранить ссылку';
      alert('Ошибка обновления ссылки: ' + err.message);
    });
  };
};

window.shareTechLinkWithContractor = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  var link = t.tech_link || t.techLink || '';
  if (!link) {
    return alert('Ссылка на техническую информацию еще не заполнена. Сначала укажите ссылку на папку объекта.');
  }
  showToast('✓ Входящие материалы Заказчика прикреплены к заданию подрядчику', 'success');
};

window.openDeclineTaskModal = function(taskId) {
  var old = document.getElementById('_decline_task_modal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = '_decline_task_modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = '<div class="modal-box" style="max-width:500px;width:92%">' +
    '<h3 style="margin-top:0;color:#dc2626;display:flex;align-items:center;gap:6px">' +
      '<span>❌ Отклонить заявку (Входной контроль)</span>' +
    '</h3>' +
    '<p style="font-size:.82rem;color:var(--text-2);margin-bottom:12px">' +
      'Укажите причину отклонения заявки <b>' + escHtml(taskId) + '</b>. Заявка будет переведена в статус «Отменена».' +
    '</p>' +
    '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_decline_reason_inp\').value=this.textContent" style="font-size:.72rem">Отсутствует ТЗ / материалы</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_decline_reason_inp\').value=this.textContent" style="font-size:.72rem">Не наш регион обслуживания</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_decline_reason_inp\').value=this.textContent" style="font-size:.72rem">Сроки не согласованы</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_decline_reason_inp\').value=this.textContent" style="font-size:.72rem">Отозвана Заказчиком</button>' +
    '</div>' +
    '<textarea id="_decline_reason_inp" placeholder="Введите причину отклонения..." style="width:100%;height:80px;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;box-sizing:border-box"></textarea>' +
    '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">' +
      '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'_decline_task_modal\').remove()">Отмена</button>' +
      '<button type="button" class="btn btn-primary" style="background:#dc2626;border-color:#dc2626" onclick="submitDeclineTaskEntry(\'' + escHtml(taskId) + '\')">Подтвердить отказ</button>' +
    '</div>' +
  '</div>';
  document.body.appendChild(modal);
};

window.submitDeclineTaskEntry = function(taskId) {
  var inp = document.getElementById('_decline_reason_inp');
  var reason = inp ? inp.value.trim() : '';
  if (!reason) {
    alert('Пожалуйста, укажите причину отклонения заявки');
    return;
  }
  api('/tasks/' + encodeURIComponent(taskId) + '/decline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason })
  })
  .then(function() {
    var m = document.getElementById('_decline_task_modal');
    if (m) m.remove();
    var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
    if (t) {
      t.assignmentStatus = 'declined';
      t.assignment_status = 'declined';
      t.status = 'cancelled';
      t.overdueReason = reason;
    }
    showToast('Заявка отклонена', 'warning');
    renderApp();
  })
  .catch(function(err) {
    alert('Ошибка отклонения заявки: ' + err.message);
  });
};

window.acceptTask = function(taskId) { window.approveTaskEntry(taskId); };
window.declineTask = function(taskId) { window.openDeclineTaskModal(taskId); };

window._takeTaskToStage = function(taskId, stageNum) {
  var stgName = (ID_STAGES[stageNum] ? ID_STAGES[stageNum].name : ('Этап ' + stageNum));
  if (!confirm('Перевести заявку на этап ' + stageNum + ' (' + stgName + ')?')) return;
  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stageNum: stageNum })
  }).then(function() {
    showToast('Этап успешно обновлен: ' + stgName, 'success');
    var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
    if (t) {
      t.stageNum = stageNum;
      t.stage_num = stageNum;
    }
    openCard(taskId);
  }).catch(function(err) {
    alert('Ошибка смены этапа: ' + (err.message || err));
  });
};

window.cardTransitionToSmr = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  var curStage = t ? (t.stageNum != null ? t.stageNum : (t.stage_num != null ? t.stage_num : 0)) : 0;
  if (curStage === 0) {
    if (!confirm('Перевести заявку на Этап 1 «В монтаже» и перейти во вкладку «Исполнение / СМР»?')) {
      setCardTab('items');
      return;
    }
    api('/tasks/' + encodeURIComponent(taskId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageNum: 1 })
    }).then(function() {
      showToast('Заявка переведена на этап 1: В монтаже', 'success');
      if (t) {
        t.stageNum = 1;
        t.stage_num = 1;
      }
      setCardTab('items');
    }).catch(function(err) {
      alert('Ошибка обновления этапа: ' + (err.message || err));
      setCardTab('items');
    });
  } else {
    setCardTab('items');
  }
};

window.cardOpenCloudFolderModal = function(taskId, fieldKey) {
  var old = document.getElementById('_cloud_folder_modal');
  if (old) old.remove();

  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); }) || {};
  var fieldLabels = {
    priemka: 'Приёмка (фотоматериалы)',
    obsledovanie: 'Обследование объекта (акт, фото)',
    dostup: 'Допуск на объект (письма, заявки)'
  };
  var fieldTitle = fieldLabels[fieldKey] || 'Папка документов';
  var curVal = (t[fieldKey] || '').trim();

  var taskNum = t.id || '';
  var shortCategory = fieldKey === 'priemka' ? 'Приемка' : (fieldKey === 'obsledovanie' ? 'Обследование' : 'Допуск');
  var year = (t.dateZayavki || t.created_at || new Date().toISOString()).slice(0, 4);
  var rawAddr = (t.address || '').split(',')[0].replace(/[^\wа-яА-Я0-9\s-]/gi, '').trim();
  var safeAddr = rawAddr || 'Объект';
  var defaultCatalog = 'Заявки/' + year + '/' + taskNum + '_' + safeAddr;
  var defaultPath = defaultCatalog + '/' + shortCategory;

  var hasLink = curVal && (curVal.startsWith('http://') || curVal.startsWith('https://') || curVal.startsWith('Заявки/'));

  var modal = document.createElement('div');
  modal.id = '_cloud_folder_modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = '<div class="modal-box" style="max-width:620px;width:95%;border-radius:12px;padding:20px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<span style="font-size:1.4rem">☁️</span>' +
        '<div>' +
          '<h3 style="margin:0;font-size:1.1rem;color:var(--text)">Папка в Seafile: ' + escHtml(fieldTitle) + '</h3>' +
          '<div style="font-size:.75rem;color:var(--text-3);margin-top:2px">Единое корпоративное хранилище cloud.stockeasy.ru</div>' +
        '</div>' +
      '</div>' +
      '<button class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_cloud_folder_modal\').remove()" style="font-size:1.1rem;padding:2px 8px">✕</button>' +
    '</div>' +

    // Информационная плашка объекта и каталога по умолчанию
    '<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-bottom:14px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">' +
        '<div>' +
          '<div style="font-size:.72rem;font-weight:700;color:var(--text-3);text-transform:uppercase">Объект заявки №' + escHtml(taskNum) + '</div>' +
          '<div style="font-weight:700;color:var(--text);font-size:.88rem;margin-top:2px">🏛️ ' + escHtml(t.address || 'Адрес не указан') + '</div>' +
        '</div>' +
        '<span class="badge b-blue" style="font-size:.72rem;padding:2px 8px">Каталог Seafile</span>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #cbd5e1;border-radius:6px;padding:8px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px">' +
        '<div style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          '<span style="font-size:.72rem;color:var(--text-3);display:block">Каталог по умолчанию в хранилище:</span>' +
          '<code style="font-weight:700;color:var(--blue);font-size:.82rem">' + escHtml(defaultPath) + '</code>' +
        '</div>' +
        '<button type="button" class="btn btn-xs btn-ghost" onclick="navigator.clipboard.writeText(\'' + escHtml(defaultPath) + '\');showToast(\'Путь скопирован в буфер\', \'info\')" style="border:1px solid var(--border);white-space:nowrap;padding:4px 8px;font-size:.74rem;background:#fff">' +
          '📋 Скопировать путь' +
        '</button>' +
      '</div>' +
    '</div>' +

    // Пошаговая инструкция
    '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:.78rem;color:#1e40af">' +
      '<div style="font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:6px">' +
        '<span>💡 Порядок работы с облаком Seafile:</span>' +
      '</div>' +
      '<ol style="margin:0;padding-left:18px;line-height:1.45">' +
        '<li>Нажмите кнопку <b>«🌐 Открыть cloud.stockeasy.ru»</b> ниже — откроется окно облака с вашей авторизацией.</li>' +
        '<li>Перейдите в библиотеку <b>Заявки</b> по пути выше (или создайте папку для объекта).</li>' +
        '<li>Нажмите на папке <b>«Поделиться» &rarr; «Ссылка общего доступа»</b> и вставьте полученную ссылку ниже (или нажмите «Использовать путь по умолчанию»).</li>' +
      '</ol>' +
    '</div>' +

    // Поле ввода ссылки / пути
    '<div style="margin-bottom:14px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
        '<label style="font-size:.78rem;font-weight:700;color:var(--text)">Ссылка общего доступа или каталог:</label>' +
        '<button type="button" class="btn-link" onclick="document.getElementById(\'_cloud_folder_input_url\').value=\'' + escHtml(defaultPath) + '\'" style="font-size:.72rem;color:var(--blue);text-decoration:underline">' +
          '⚡ Использовать путь по умолчанию' +
        '</button>' +
      '</div>' +
      '<input type="text" id="_cloud_folder_input_url" value="' + escHtml(curVal) + '" placeholder="https://cloud.stockeasy.ru/d/... или ' + escHtml(defaultPath) + '" style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;box-sizing:border-box">' +
      '<div style="font-size:.72rem;color:var(--text-3);margin-top:4px">' +
        'После сохранения кнопка перехода в эту папку будет доступна прямо в строке «' + escHtml(fieldTitle) + '» на вкладке Информация.' +
      '</div>' +
    '</div>' +

    // Нижние кнопки
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding-top:12px;border-top:1px solid var(--border)">' +
      '<div style="display:flex;gap:8px">' +
        '<button type="button" class="btn btn-sm" onclick="window.open(\'https://cloud.stockeasy.ru\', \'seafile_win\', \'width=1150,height=750,menubar=no,toolbar=no\')" style="background:#0284c7;color:#fff;border:none;display:inline-flex;align-items:center;gap:6px;font-weight:600">' +
          '🌐 Открыть cloud.stockeasy.ru ↗' +
        '</button>' +
        (hasLink && curVal.startsWith('http') ? (
          '<a href="' + escHtml(curVal) + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost" style="color:var(--green);border:1px solid #86efac;display:inline-flex;align-items:center;gap:4px">' +
            '📂 Перейти в папку ↗' +
          '</a>'
        ) : '') +
      '</div>' +
      '<div style="display:flex;gap:6px">' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_cloud_folder_modal\').remove()">Отмена</button>' +
        '<button type="button" class="btn btn-sm btn-primary" onclick="window.cardSaveCloudFolderLink(\'' + escHtml(taskId) + '\', \'' + fieldKey + '\')">💾 Сохранить в заявку</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });
  setTimeout(function(){
    var inp = document.getElementById('_cloud_folder_input_url');
    if (inp) inp.focus();
  }, 100);
};

window.cardSaveCloudFolderLink = function(taskId, fieldKey) {
  var inp = document.getElementById('_cloud_folder_input_url');
  var url = inp ? inp.value.trim() : '';

  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify((function(){ var d = {}; d[fieldKey] = url; return d; })())
  }).then(function() {
    showToast('Ссылка на папку сохранена', 'success');
    var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
    if (t) t[fieldKey] = url;
    var modal = document.getElementById('_cloud_folder_modal');
    if (modal) modal.remove();
    var cardFieldInp = document.getElementById('card_field_' + fieldKey);
    if (cardFieldInp) cardFieldInp.value = url;
    openCard(taskId);
  }).catch(function(err) {
    alert('Ошибка сохранения ссылки: ' + (err.message || err));
  });
};

window.filterCardContractsList = function(q) {
  var qy = String(q || '').toLowerCase().trim();
  var inp = document.getElementById('card_contract_search_inp');
  if (inp && inp.value !== q) inp.value = q;
  var items = document.querySelectorAll('#card_contract_items_list .card-contract-picker-item');
  items.forEach(function(el) {
    var searchStr = el.getAttribute('data-search') || '';
    if (!qy || searchStr.indexOf(qy) !== -1) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
};

window.selectCardContract = function(cId) {
  var valStr = cId ? String(cId) : '';
  var numVal = cId ? Number(cId) : null;
  S.cardDraft.contract_id = numVal;

  var sel = document.getElementById('card_contract_select');
  if (sel) {
    sel.value = valStr;
  }
  var t = S.tasks.find(function(x){ return String(x.id) === String(S.cardId); });
  if (t) {
    t.contract_id = numVal;
    t.contractId = numVal;
  }
  if (!numVal) {
    S.cardDraft.contract_agreement_id = null;
    if (t) {
      t.contract_agreement_id = null;
      t.contractAgreementId = null;
    }
  } else {
    var matchedC = (S.contracts || []).find(function(x){ return Number(x.id) === numVal; });
    if (matchedC) {
      if (matchedC.customer_name) {
        S.cardDraft.customer = matchedC.customer_name;
        if (t) t.customer = matchedC.customer_name;
      }
      if (matchedC.our_entity_name) {
        var foundOwn = (S.ownCompanies || []).find(function(oc){ return oc.name_short === matchedC.our_entity_name; });
        if (foundOwn) {
          S.cardDraft.own_company_id = foundOwn.id;
          if (t) t.own_company_id = foundOwn.id;
        }
      }
      if (matchedC.agreements && matchedC.agreements.length > 0 && t && t.region) {
        var regLow = String(t.region).trim().toLowerCase();
        var agFound = matchedC.agreements.find(function(a) {
          var aReg = (a.region || a.city || '').toLowerCase();
          return aReg && (regLow.includes(aReg) || aReg.includes(regLow));
        });
        if (agFound) {
          S.cardDraft.contract_agreement_id = agFound.id;
          t.contract_agreement_id = agFound.id;
          t.contractAgreementId = agFound.id;
        }
      }
    }
  }
  S._cardContractPickerOpen = false;
  renderApp();
};

window.onCardAgreementChange = function(agId) {
  var numVal = agId ? Number(agId) : null;
  S.cardDraft.contract_agreement_id = numVal;
  var t = S.tasks.find(function(x){ return String(x.id) === String(S.cardId); });
  if (t) {
    t.contract_agreement_id = numVal;
    t.contractAgreementId = numVal;
    if (numVal) {
      var curC = (S.contracts || []).find(function(x){ return Number(x.id) === Number(t.contract_id || t.contractId); });
      if (curC && curC.agreements) {
        var ag = curC.agreements.find(function(a){ return Number(a.id) === numVal; });
        if (ag && (!t.region || t.region === '—')) {
          t.region = ag.region || ag.city || t.region;
          S.cardDraft.region = t.region;
        }
      }
    }
  }
  renderApp();
};

window.recalcCardUnitPrice = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  var curAmount = parseFloat(Object.prototype.hasOwnProperty.call(S.cardDraft, 'amount') ? S.cardDraft.amount : t.amount) || 0;
  var curPorts = parseFloat(Object.prototype.hasOwnProperty.call(S.cardDraft, 'inOrder') ? S.cardDraft.inOrder : (t.inOrder || t.ports || t.fact)) || 0;
  if (!curAmount || !curPorts) {
    alert('Для расчета единичной стоимости укажите сумму договора и количество портов (в заказе).');
    return;
  }
  var unitPrice = Math.round(curAmount / curPorts);
  S.cardDraft.pricePerUnit = unitPrice;
  t.pricePerUnit = unitPrice;
  var inp = document.querySelector('[data-key="pricePerUnit"]');
  if (inp) inp.value = unitPrice;
  if (typeof showToast === 'function') showToast('Стоимость за единицу: ' + unitPrice.toLocaleString('ru-RU') + ' ₽', 'success');
  renderApp();
};

function exportDoc(type, id, contractorName) {
  var url = '/api/export/' + type + '/' + encodeURIComponent(id);
  if (contractorName) {
    url += '?contractorName=' + encodeURIComponent(contractorName);
  }
  fetch(url, {
    headers: { 'Authorization': 'Bearer ' + S.token }
  })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e){ throw new Error(e.error); });
      return r.blob();
    })
    .then(function(blob) {
      var suffix = type === 'invoice' ? '_Счёт' : type === 'act' ? '_Акт' : (contractorName ? '_Приложение_2_' + contractorName.replace(/[/\\?%*:|"<>]/g, '_') : '_Приложение_2');
      var bUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = bUrl;
      a.download = id.replace(/\//g, '-') + suffix + '.xlsx';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(bUrl);
    })
    .catch(function(e) { alert('Ошибка экспорта: ' + e.message); });
}

function exportTask(id) {
  fetch('/api/export/' + encodeURIComponent(id), {
    headers: { 'Authorization': 'Bearer ' + S.token } // ДОБАВИЛИ КЛЮЧ
  })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e){ throw new Error(e.error); });
      return r.blob();
    })
    .then(function(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = id.replace(/\//g, '-') + '_Приложение_2.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    })
    .catch(function(e) { alert('Ошибка экспорта: ' + e.message); });
}


function setCardTab(tabName) {
  if (S.cardDraft && (Object.keys(S.cardDraft).filter(function(k){ return k !== '_smrTaskId'; }).length > 0 || S.cardDraft._smrDirty)) {
    if (typeof window.saveCard === 'function') window.saveCard(true);
  }
  S.cardTab = tabName;
  var btns = document.querySelectorAll('.card-tab-btn');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].getAttribute('data-tab') === tabName) {
      btns[i].classList.add('active');
    } else {
      btns[i].classList.remove('active');
    }
  }
  var panes = document.querySelectorAll('.card-tab-pane');
  for (var j = 0; j < panes.length; j++) {
    if (panes[j].id === 'cardTabPane-' + tabName) {
      panes[j].style.display = 'block';
    } else {
      panes[j].style.display = 'none';
    }
  }
  if (tabName === 'main' && window._activeLeafletMap) {
    setTimeout(function(){ window._activeLeafletMap.invalidateSize(); }, 60);
  }
  if ((tabName === 'items' || tabName === 'supply') && S.cardId) {
    loadCardMaterials(S.cardId);
    refreshTaskItemsList(S.cardId);
    if (tabName === 'items') {
      loadCardSubcontracts(S.cardId);
      if (window.renderSmrChecklist) window.renderSmrChecklist(S.cardId);
    }
  }
  if ((tabName === 'files' || tabName === 'docs') && S.cardId) {
    loadCardDocuments(S.cardId);
  }
  if (tabName === 'chat' && S.cardId) {
    loadTaskChat(S.cardId);
  }
  if (tabName === 'history' && S.cardId) {
    if (window.refreshCardHistory) window.refreshCardHistory(S.cardId);
  }
}
window.setCardTab = setCardTab;

function openCard(id) {
  if (S.page !== 'card') {
    S._cardOriginPage = S.page || 'tasks';
    var targetId = (S._cardOriginPage === 'kanban') ? ('kcard_' + id) : ('task_row_' + id);
    if (window.savePageScroll) window.savePageScroll(targetId);
  }
  S.cardId = id;
  if (!S.cardTab) S.cardTab = 'main';
  S.cardDraft = {};
  S.cardConfirmOpen = false;
  if (S.taskChatRoom && String(S.taskChatRoom.task_id) !== String(id)) {
    S.taskChatRoom = null;
    S.taskChatMessages = [];
    S.taskChatPendingAttachments = [];
  }
  S.page = 'card';
  renderNav();
  renderApp();
  window.scrollTo(0,0);
  refreshAttachmentsList(id);
  refreshPortsList(id);
  refreshRemarksList(id);
  refreshTaskItemsList(id);
  loadCardMaterials(id);
  if (window.renderCardSmrCalculator) window.renderCardSmrCalculator(id);
  if (window.renderSmrChecklist) window.renderSmrChecklist(id);
  if (S.cardTab === 'chat' || S.taskChatDrawerOpen) {
    loadTaskChat(id);
  }
  if (S.cardTab === 'history' && window.refreshCardHistory) {
    window.refreshCardHistory(id);
  }

  // Принудительно запрашиваем свежие актуальные данные заявки с сервера,
  // чтобы исключить рассинхрон при совместной работе нескольких пользователей
  api('/tasks/' + encodeURIComponent(id)).then(function(freshTask) {
    if (freshTask && !freshTask.error) {
      if (!Array.isArray(S.tasks)) S.tasks = [];
      var idx = S.tasks.findIndex(function(x) { return String(x.id) === String(id); });
      if (idx !== -1) {
        S.tasks[idx] = freshTask;
      } else {
        S.tasks.push(freshTask);
      }
      if (S.page === 'card' && String(S.cardId) === String(id)) {
        if (!S.cardDraft || Object.keys(S.cardDraft).length === 0) {
          renderApp();
          if (window.renderCardSmrCalculator) window.renderCardSmrCalculator(id);
          if (window.renderSmrChecklist) window.renderSmrChecklist(id);
        }
      }
    }
  }).catch(function(e) {
    console.warn('Could not refresh card from server:', e);
  });
}

function returnFromCard() {
  if (S.cardDraft && Object.keys(S.cardDraft).length > 0) {
    if (typeof window.saveCard === 'function') window.saveCard(true);
  }
  var orig = S._cardOriginPage || 'tasks';
  var targetId = (orig === 'kanban') ? ('kcard_' + S.cardId) : ('task_row_' + S.cardId);
  go(orig);
  setTimeout(function() {
    if (window.restorePageScroll) window.restorePageScroll(targetId);
  }, 40);
}
window.returnFromCard = returnFromCard;

function pageCard() {
  var t = S.tasks.find(function(x){ return String(x.id) === String(S.cardId); });
  if (!t) return '<div class="card p"><p class="t3">Заявка не найдена.</p><button class="btn" onclick="returnFromCard()">← Назад</button></div>';

  var statusOpts = [
    {v: 'pending',   l: 'Не распределено'},
    {v: 'progress',  l: 'В работе'},
    {v: 'done',      l: 'Готово'},
    {v: 'paid',      l: 'Оплачен'},
    {v: 'cancelled', l: 'Отменен'}
  ].map(function(opt) {
    var curStatus = Object.prototype.hasOwnProperty.call(S.cardDraft,'status') ? S.cardDraft.status : t.status;
    return '<option value="' + opt.v + '"' + (curStatus === opt.v ? ' selected' : '') + '>' + opt.l + '</option>';
  }).join('');
  var prioOpts = ['high','medium','low'].map(function(v){
    var labels = {high:'🔴 Высокий',medium:'🟡 Средний',low:'🟢 Низкий'};
    var curPriority = Object.prototype.hasOwnProperty.call(S.cardDraft,'priority') ? S.cardDraft.priority : t.priority;
    return '<option value="'+v+'"'+(curPriority===v?' selected':'')+'>'+labels[v]+'</option>';
  }).join('');

  var curAssignee = Object.prototype.hasOwnProperty.call(S.cardDraft,'assignee') ? S.cardDraft.assignee : t.assignee;
  var pmUsers = (S.users || []).filter(function(u) {
    var r = String(u.role || '').toLowerCase();
    return r === 'manager' || r === 'admin' || r === 'director';
  });
  var hasCurInPm = pmUsers.some(function(u) { return u.full_name === curAssignee; });
  var assigneeOpts = '<option value="">— (Не назначен) —</option>';
  if (curAssignee && !hasCurInPm) {
    assigneeOpts += '<option value="' + escHtml(curAssignee) + '" selected>⚠️ ' + escHtml(curAssignee) + ' (текущий)</option>';
  }
  assigneeOpts += pmUsers.map(function(u) {
    if (!u.full_name) return '';
    var roleLabel = u.role === 'manager' ? 'ПМ' : (u.role === 'director' ? 'Руководитель' : 'Админ');
    var phoneLabel = u.phone ? (' · 📞 ' + u.phone) : '';
    return '<option value="' + escHtml(u.full_name) + '"' + (curAssignee === u.full_name ? ' selected' : '') + '>#' + u.id + ' — ' + escHtml(u.full_name) + ' (' + roleLabel + phoneLabel + ')</option>';
  }).join('');

  var curContractId = Object.prototype.hasOwnProperty.call(S.cardDraft, 'contract_id') 
    ? S.cardDraft.contract_id 
    : (t.contract_id != null ? t.contract_id : t.contractId);

  var linkedPreContract = curContractId ? (S.contracts || []).find(function(c){ return String(c.id) === String(curContractId); }) : null;
  if (linkedPreContract && linkedPreContract.customer_name) {
    var cPreLow = linkedPreContract.customer_name.toLowerCase();
    var tPreLow = String(t.customer || '').toLowerCase();
    if (!t.customer || (tPreLow.includes('сбер') && !cPreLow.includes('сбер'))) {
      t.customer = linkedPreContract.customer_name;
    }
  }

  var taskCustomer = Object.prototype.hasOwnProperty.call(S.cardDraft, 'customer')
    ? String(S.cardDraft.customer || '').trim()
    : String(t.customer || '').trim();
  var isSber = !taskCustomer || taskCustomer.toLowerCase().includes('сбер');

  var controllerOpts = (function() {
    var curCtrl = Object.prototype.hasOwnProperty.call(S.cardDraft, 'controller') ? S.cardDraft.controller : (t.controller || (isSber ? 'Городович И.О.' : 'Городович М.В.'));
    var presets = [
      { v: 'Городович И.О.', l: 'Городович И.О. (Директор ООО «К10»)' },
      { v: 'Городович М.В.', l: 'Городович М.В. (Директор ООО «Кабельные Системы»)' },
      { v: 'Бондаренко Ф.А.', l: 'Бондаренко Ф.А. (Директор ООО «Ультима»)' }
    ];
    (S.users || []).filter(function(u){ return u.role === 'director' || u.role === 'admin'; }).forEach(function(u){
      if (!presets.some(function(p){ return p.v === u.full_name; })) {
        presets.push({ v: u.full_name, l: u.full_name + ' (' + (u.role === 'director' ? 'Директор' : 'Руководство') + ')' });
      }
    });
    if (curCtrl && !presets.some(function(p){ return p.v === curCtrl; })) {
      presets.unshift({ v: curCtrl, l: curCtrl });
    }
    return presets.map(function(p) {
      return '<option value="' + escHtml(p.v) + '"' + (curCtrl === p.v ? ' selected' : '') + '>' + escHtml(p.l) + '</option>';
    }).join('');
  })();

  var contractorOpts = '<option value="">— (Своими силами / Не назначен) —</option>' + (S.contractors || [])
    .filter(function(c) { return c.type !== 'customer'; })
    .map(function(c) {
      var curContractor = Object.prototype.hasOwnProperty.call(S.cardDraft,'contractor') ? S.cardDraft.contractor : (t.contractor||'');
      if (!c.name_short) return '';
      return '<option value="' + c.name_short + '"' + (curContractor.trim() === c.name_short ? ' selected' : '') + '>' + c.name_short + '</option>';
    }).join('');

  if (t.contractor && !(S.contractors || []).filter(function(c){ return c.type !== 'customer'; }).some(function(c){ return c.name_short === t.contractor.trim(); })) {
    contractorOpts += '<option value="' + t.contractor + '" selected>⚠️ ' + t.contractor + ' (из Excel)</option>';
  }

  // Привязка к генеральному контракту по реальным реквизитам: номер контракта, Заказчик и регион (Отказ от слепой привязки по 0926-02 - замечание Алексея, скрин12)
  if (!curContractId) {
    var rawTextToSearch = (String(t.region || '') + ' ' + String(t.comment || '') + ' ' + String(t.tzText || '') + ' ' + String(t.id || ''));
    var extNumMatch = rawTextToSearch.match(/\b(5000\d{7}|\d{8,12})\b/);
    if (extNumMatch) {
      var numTarget = extNumMatch[1];
      var matchedByNum = (S.contracts || []).find(function(c) {
        if (c.contract_number && c.contract_number.includes(numTarget)) return true;
        if (c.agreements && c.agreements.some(function(ag) { return ag.external_number && ag.external_number.includes(numTarget); })) return true;
        return false;
      });
      if (matchedByNum) {
        curContractId = matchedByNum.id;
        t.contract_id = matchedByNum.id;
        t.contractId = matchedByNum.id;
        if (matchedByNum.agreements && !t.contract_agreement_id) {
          var matchedAg = matchedByNum.agreements.find(function(ag) { return ag.external_number && ag.external_number.includes(numTarget); });
          if (matchedAg) t.contract_agreement_id = matchedAg.id;
        }
      }
    }

    if (!curContractId && t.region) {
      var regLower = String(t.region).trim().toLowerCase();
      var matchedByReg = (S.contracts || []).find(function(c) {
        if (!matchesTaskCustomer(c)) return false;
        if (c.agreements && c.agreements.some(function(ag) {
          var agReg = (ag.region || ag.city || '').toLowerCase();
          return agReg && (regLower.includes(agReg) || agReg.includes(regLower));
        })) return true;
        var cPlace = (c.delivery_place || '').toLowerCase();
        return cPlace && (regLower.includes(cPlace) || cPlace.includes(regLower));
      });
      if (matchedByReg) {
        curContractId = matchedByReg.id;
        t.contract_id = matchedByReg.id;
        t.contractId = matchedByReg.id;
        if (matchedByReg.agreements && !t.contract_agreement_id) {
          var matchedAg2 = matchedByReg.agreements.find(function(ag) {
            var agReg = (ag.region || ag.city || '').toLowerCase();
            return agReg && (regLower.includes(agReg) || agReg.includes(regLower));
          });
          if (matchedAg2) t.contract_agreement_id = matchedAg2.id;
        }
      }
    }
  }

  if (curContractId) {
    var curAutoC = (S.contracts || []).find(function(c){ return String(c.id) === String(curContractId); });
    if (curAutoC && curAutoC.customer_name) {
      var autoLow = curAutoC.customer_name.toLowerCase();
      var tCustLow = String(t.customer || '').toLowerCase();
      if (!t.customer || (tCustLow.includes('сбер') && !autoLow.includes('сбер'))) {
        t.customer = curAutoC.customer_name;
        if (!Object.prototype.hasOwnProperty.call(S.cardDraft, 'customer')) {
          taskCustomer = curAutoC.customer_name;
          isSber = false;
        }
      }
    }
  }

  var allContracts = (S.contracts || []).slice().sort(function(a, b) {
    return getContractSortKey(b) - getContractSortKey(a);
  });

  function matchesTaskCustomer(c) {
    var cCust = (c.customer_name || '').toLowerCase();
    var cEnt = (c.our_entity_name || '').toLowerCase();
    if (isSber) {
      return cCust.includes('сбер') || cEnt.includes('к10');
    }
    if (!taskCustomer) return true;
    var tLow = taskCustomer.toLowerCase();
    return cCust.includes(tLow) || tLow.includes(cCust);
  }

  var customerContractsCount = allContracts.filter(matchesTaskCustomer).length;
  var filterMode = S._cardContractFilterMode || 'customer';

  var sortedContracts = allContracts.filter(function(c) {
    if (filterMode === 'all') return true;
    return matchesTaskCustomer(c) || String(c.id) === String(curContractId);
  });

  var contractOpts = '<option value="">— (Не привязан к договору) —</option>' + sortedContracts.map(function(c) {
    var isSel = String(curContractId) === String(c.id);
    var cleanNum = cleanContractNumber(c.contract_number);
    var label = (c.internal_number ? 'Вн. ' + c.internal_number : '') + (cleanNum ? ' (№ ' + cleanNum + ')' : '') + ' · ' + (c.customer_name || '') + ' · ' + (c.contract_type_summary || '');
    return '<option value="' + c.id + '"' + (isSel ? ' selected' : '') + '>' + escHtml(label) + '</option>';
  }).join('');

  function field(lbl, key, type, compact) {
    var isDirty = Object.prototype.hasOwnProperty.call(S.cardDraft, key);
    var val = isDirty ? S.cardDraft[key] : (t[key] || '');
    if (key === 'customer' && !isDirty) {
      var cid = Object.prototype.hasOwnProperty.call(S.cardDraft, 'contract_id') ? S.cardDraft.contract_id : (t.contract_id != null ? t.contract_id : t.contractId);
      var curC = cid ? (S.contracts || []).find(function(x){ return String(x.id) === String(cid); }) : null;
      if (curC && curC.customer_name) {
        var cLow = curC.customer_name.toLowerCase();
        var tLow = String(val || '').toLowerCase();
        if (!val || (tLow.includes('сбер') && !cLow.includes('сбер'))) {
          val = curC.customer_name;
          t.customer = curC.customer_name;
        }
      }
    }
    var hintHtml = (typeof getHintIcon === 'function') ? getHintIcon(key) : '';
    var ph = (typeof getFieldPlaceholder === 'function') ? getFieldPlaceholder(key) : '';

    var isAdminOrDirector = S.user && (S.user.role === 'admin' || S.user.role === 'director');
    var isViewLocked = !isAdminOrDirector && (t.assignmentStatus === 'accepted' && !S._taskEditUnlocked);
    var canEdit = canUserEditField(S.user, key);
    if (!canEdit || (isViewLocked && !['status', 'fact', 'dataVyhoda', 'obsledovanie', 'dostup', 'priemka', 'deadline'].includes(key))) {
      var displayVal = val;
      if (type === 'checkbox') {
        displayVal = val ? '✅ Да' : '❌ Нет';
      } else if (type === 'date') {
        displayVal = val ? String(val).slice(0, 10).split('-').reverse().join('.') : '—';
      } else if (type === 'number') {
        var num = parseFloat(val);
        var isCurrency = ['amount', 'pricePerUnit', 'distanceKm', 'extras', 'tmc'].includes(key);
        if (key === 'pricePerUnit' && (!num || num <= 0)) {
          var curAmt = parseFloat(t.amount) || 0;
          var curPts = parseFloat(t.inOrder || t.ports || t.fact) || 0;
          if (curAmt > 0 && curPts > 0) {
            num = Math.round(curAmt / curPts);
            displayVal = num.toLocaleString('ru-RU') + ' ₽ <span class="t3" style="font-size:.7rem">(расчет)</span>';
          } else {
            displayVal = '—';
          }
        } else if (key === 'realDistanceKm') {
          displayVal = (!isNaN(num) && val !== '' && val != null) ? (num.toLocaleString('ru-RU') + ' км') : '—';
        } else {
          displayVal = (!isNaN(num) && val !== '' && val != null) ? (num.toLocaleString('ru-RU') + (isCurrency ? ' ₽' : '')) : '—';
        }
      } else if (type === 'url' || ((key === 'priemka' || key === 'obsledovanie' || key === 'dostup') && typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://')))) {
        displayVal = val ? ('<a href="' + escHtml(val) + '" target="_blank" rel="noopener noreferrer" style="color:var(--blue);text-decoration:underline;word-break:break-all">🔗 Открыть ссылку (Seafile)</a>') : '—';
      } else if (key === 'contract_id') {
        var curC = (S.contracts || []).find(function(x){ return String(x.id) === String(val || curContractId); });
        var cleanNum = curC ? cleanContractNumber(curC.contract_number) : '';
        displayVal = curC 
          ? ((curC.internal_number ? ('[Вн. ' + escHtml(curC.internal_number) + '] ') : '') + (cleanNum ? ('№ ' + escHtml(cleanNum) + ' · ') : '') + escHtml(curC.customer_name || curC.name_short || '—')) 
          : '—';
      } else if (key === 'status') {
        displayVal = stBadge(val);
      } else if (key === 'priority') {
        var prioLabels = { high: '🔴 Высокий', medium: '🟡 Средний', low: '🟢 Низкий' };
        displayVal = prioLabels[val] || val || '—';
      } else if (!displayVal) {
        displayVal = '<span class="t3">—</span>';
      } else {
        displayVal = escHtml(String(displayVal));
      }

      var lockTitle = isViewLocked ? 'Поле защищено от изменений после входного контроля' : 'Поле защищено вашей ролью';
      if (compact) {
        var nowrapStyle = (key === 'address' || key === 'contact' || type === 'textarea') ? '' : 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        return '<div class="field-compact">' +
          '<div class="field-lbl">' + lbl + hintHtml + '</div>' +
          '<div class="field-val">' +
            '<div class="field-val-locked" title="' + lockTitle + '">' +
              '<div style="flex:1;min-width:0;line-height:1.25;' + nowrapStyle + '">' + displayVal + '</div>' +
              '<span class="t3" style="font-size:.7rem;opacity:.55;flex-shrink:0;cursor:help;margin-left:4px">🔒</span>' +
            '</div>' +
          '</div>' +
        '</div>';
      }

      return '<div class="field-row">' +
        '<div class="field-lbl">' + lbl + hintHtml + '</div>' +
        '<div class="field-val" style="display:flex;align-items:center;justify-content:space-between;color:var(--text);font-weight:500;padding:5px 0">' +
          '<span>' + displayVal + '</span>' +
          '<span class="t3" style="font-size:.72rem;opacity:.55;cursor:help" title="' + lockTitle + '">🔒</span>' +
        '</div>' +
      '</div>';
    }

    var inp = '';
    if (key === 'contract_id') {
      var curC = (S.contracts || []).find(function(x){ return String(x.id) === String(val || curContractId); });
      if (!curC && t.region) {
        var mNum = String(t.region).match(/\b(5000\d{7}|\d{7,12})\b/);
        if (mNum) {
          curC = (S.contracts || []).find(function(c) {
            return String(c.contract_number || '').includes(mNum[1]) ||
                   JSON.stringify(c.lots || []).includes(mNum[1]) ||
                   JSON.stringify(c.raw_data || {}).includes(mNum[1]);
          });
        }
      }
      if (curC && !curContractId) {
        curContractId = curC.id;
        t.contract_id = curC.id;
      }
      var cleanNum = curC ? cleanContractNumber(curC.contract_number) : '';
      var showPicker = S._cardContractPickerOpen || !curC;

      var curAgId = Object.prototype.hasOwnProperty.call(S.cardDraft, 'contract_agreement_id')
        ? S.cardDraft.contract_agreement_id
        : (t.contract_agreement_id != null ? t.contract_agreement_id : t.contractAgreementId);

      var agreementSelectorHtml = '';
      if (curC && curC.agreements && curC.agreements.length > 0) {
        var agOptionsHtml = '<option value="">— Выберите региональное ДС / Лот —</option>' + (curC.agreements || []).map(function(ag) {
          var isAgSel = String(curAgId) === String(ag.id);
          var agCode = ag.agreement_code || ('ДС-' + ag.agreement_number);
          var regCity = ag.city || ag.region || 'Регион не указан';
          var extNum = ag.external_number ? (' · № ' + ag.external_number) : '';
          var dStr = ag.agreement_date ? (' от ' + new Date(ag.agreement_date).toLocaleDateString('ru-RU')) : '';
          return '<option value="' + ag.id + '"' + (isAgSel ? ' selected' : '') + '>' + escHtml(agCode + ' (' + regCity + ')' + extNum + dStr) + '</option>';
        }).join('');

        agreementSelectorHtml = '<div style="margin-bottom:6px;padding:6px 10px;background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<span style="font-size:.76rem;font-weight:700;color:var(--text);white-space:nowrap">📑 Доп. соглашение (Лот / Регион):</span>' +
          '<select id="card_contract_agreement_select" style="flex:1;min-width:200px;font-size:.78rem;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:#fff" onchange="window.onCardAgreementChange(this.value)">' +
            agOptionsHtml +
          '</select>' +
        '</div>';
      }

      var selectedContractCard = curC ? (
        '<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:6px;padding:6px 10px;margin-bottom:6px;box-shadow:0 1px 2px rgba(0,0,0,0.02)">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;flex:1">' +
              (curC.internal_number ? '<span class="badge b-orange" style="font-weight:700;font-size:.74rem;font-family:monospace;padding:1px 5px">Вн. ' + escHtml(curC.internal_number) + '</span>' : '') +
              (cleanNum ? '<span class="badge b-blue" style="font-weight:600;font-size:.74rem;padding:1px 5px">№ ' + escHtml(cleanNum) + '</span>' : '') +
              '<span style="font-weight:700;font-size:.82rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + escHtml(curC.customer_name || '') + '">' + escHtml(curC.customer_name || 'Заказчик') + '</span>' +
              '<span style="font-size:.74rem;color:var(--text-2);white-space:nowrap">(' + escHtml(curC.contract_type_summary || 'СМР') + ' · 🏢 ' + escHtml(curC.our_entity_name || (isSber ? 'ООО «К10»' : 'ООО "Кабельные Системы"')) + ')</span>' +
            '</div>' +
            '<div style="display:flex;gap:4px;flex-shrink:0">' +
              '<button type="button" class="btn btn-sm btn-ghost" onclick="openContractModal(' + curC.id + ')" style="padding:2px 7px;font-size:.72rem;border:1px solid #bbf7d0;background:#fff" title="Открыть карточку генерального договора">👁️ Договор</button>' +
              '<button type="button" class="btn btn-sm btn-ghost" onclick="toggleCardContractPicker()" style="padding:2px 7px;font-size:.72rem;color:var(--text-3);border:1px solid var(--border);background:#fff" title="Выбрать другой договор или отвязать">' + (showPicker ? 'Скрыть ▲' : 'Сменить ✕') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      ) : '';

      var pickerDisplay = showPicker ? 'block' : 'none';

      var customerLabel = isSber ? 'Сбербанк' : (taskCustomer || 'Текущий заказчик');
      var quickFiltersHtml = '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;align-items:center">' +
        '<button type="button" class="btn btn-sm ' + (filterMode !== 'all' ? 'btn-primary' : 'btn-ghost') + '" onclick="setCardContractFilterMode(\'customer\')" style="padding:2px 8px;font-size:.72rem">✓ Только ' + escHtml(customerLabel) + ' (' + customerContractsCount + ')</button>' +
        '<button type="button" class="btn btn-sm ' + (filterMode === 'all' ? 'btn-primary' : 'btn-ghost') + '" onclick="setCardContractFilterMode(\'all\')" style="padding:2px 8px;font-size:.72rem">Все заказчики (' + allContracts.length + ')</button>' +
        '<div style="width:1px;height:14px;background:#cbd5e1;margin:0 2px"></div>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="filterCardContractsList(\'0526\')" style="padding:1px 6px;font-size:.72rem;background:#fef3c7;color:#92400e;border-color:#fde68a">0526 (Май 26)</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="filterCardContractsList(\'0326\')" style="padding:1px 6px;font-size:.72rem;background:#f1f5f9;color:#334155;border-color:#cbd5e1">0326 (Март 26)</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="filterCardContractsList(\'0126\')" style="padding:1px 6px;font-size:.72rem;background:#f1f5f9;color:#334155;border-color:#cbd5e1">0126</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="filterCardContractsList(\'0925\')" style="padding:1px 6px;font-size:.72rem;background:#f1f5f9;color:#334155;border-color:#cbd5e1">0925</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="filterCardContractsList(\'0725\')" style="padding:1px 6px;font-size:.72rem;background:#f1f5f9;color:#334155;border-color:#cbd5e1">0725</button>' +
      '</div>';

      var contractsItemsHtml = sortedContracts.slice(0, 100).map(function(c) {
        var isThisSel = String(curContractId) === String(c.id);
        var cleanN = cleanContractNumber(c.contract_number);
        var searchHaystack = ((c.internal_number || '') + ' ' + cleanN + ' ' + (c.customer_name || '') + ' ' + (c.contract_type_summary || '') + ' ' + (c.our_entity_name || '')).toLowerCase();
        return '<div class="card-contract-picker-item" data-search="' + escHtml(searchHaystack) + '" onclick="selectCardContract(' + c.id + ')" style="padding:6px 8px;border-radius:6px;cursor:pointer;border-bottom:1px solid #f1f5f9;background:' + (isThisSel ? '#ecfdf5' : '#fff') + ';transition:background .15s" onmouseover="if(!' + isThisSel + ')this.style.background=\'#f8fafc\'" onmouseout="if(!' + isThisSel + ')this.style.background=\'#fff\'">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px">' +
            '<div style="display:flex;align-items:center;gap:6px">' +
              (c.internal_number ? '<span class="badge b-orange" style="font-size:.72rem;font-family:monospace;padding:1px 5px">Вн. ' + escHtml(c.internal_number) + '</span>' : '') +
              (cleanN ? '<span class="badge b-gray" style="font-size:.72rem;padding:1px 5px">№ ' + escHtml(cleanN) + '</span>' : '') +
              (c.contract_type_summary ? '<span style="font-size:.72rem;color:var(--text-2);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(c.contract_type_summary) + '</span>' : '') +
            '</div>' +
            (isThisSel ? '<span style="color:var(--green);font-size:.75rem;font-weight:700">✓ Выбран</span>' : '') +
          '</div>' +
          '<div style="font-size:.78rem;font-weight:600;color:var(--text);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escHtml(c.customer_name || '') + '">' +
            '🏛️ ' + escHtml(c.customer_name || 'Не указан') +
          '</div>' +
        '</div>';
      }).join('');

      var pickerHtml = '<div id="card_contract_picker_box" style="display:' + pickerDisplay + ';border:1.5px solid var(--orange);border-radius:8px;padding:8px;background:#fff;margin-top:4px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<span style="font-size:.78rem;font-weight:700;color:var(--text)">Выбор генерального контракта:</span>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="selectCardContract(\'\')" style="font-size:.72rem;color:var(--red);padding:1px 6px">✕ Отвязать от договора</button>' +
        '</div>' +
        '<input type="text" id="card_contract_search_inp" placeholder="🔍 Поиск по номеру договора, заказчику или региону..." oninput="filterCardContractsList(this.value)" style="width:100%;padding:5px 8px;font-size:.82rem;border:1px solid var(--border);border-radius:6px;margin-bottom:6px">' +
        quickFiltersHtml +
        '<div id="card_contract_items_list" style="max-height:220px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px;background:#fff">' +
          contractsItemsHtml +
        '</div>' +
      '</div>';

      inp = '<div style="width:100%">' +
        '<select name="contract_id" data-key="contract_id" id="card_contract_select" style="display:none">' + contractOpts + '</select>' +
        selectedContractCard +
        agreementSelectorHtml +
        pickerHtml +
      '</div>';
    }
    else if (key === 'status') {
      inp = '<div style="display:flex;align-items:center;gap:8px">' +
        stBadge(val) +
        '<span class="t3" style="font-size:.72rem">🔒 Управляется регламентом шагов</span>' +
      '</div>';
    }
    else if (key === 'stage') {
      var stageNamesRu = { request: '1. Заявка', survey: '2. Обследование', install: '3. Монтаж', control: '4. Контроль', acceptance: '5. Приёмка', payment: '6. Оплата' };
      inp = '<div style="display:flex;align-items:center;gap:8px">' +
        '<span class="badge b-blue" style="font-size:.76rem">' + (stageNamesRu[val] || val || '—') + '</span>' +
        '<span class="t3" style="font-size:.72rem">🔒 Синхронизируется автоматически</span>' +
      '</div>';
    }
    else if (key === 'stageNum') {
      inp = '<div style="display:flex;align-items:center;gap:8px">' +
        idStageBadge(val) +
        '<span class="t3" style="font-size:.72rem">🔒 Переход кнопкой «Шаг» выше</span>' +
      '</div>';
    }
    else if (key === 'priority') inp = '<select name="'+key+'" data-key="'+key+'">'+prioOpts+'</select>';
    else if (key === 'assignee' && ['admin', 'director', 'manager'].includes(String(S.user ? S.user.role : '').toLowerCase())) inp = '<select name="'+key+'" data-key="'+key+'">' + assigneeOpts + '</select>';
    else if (key === 'controller' && ['admin', 'director', 'manager', 'to_engineer'].includes(String(S.user ? S.user.role : '').toLowerCase())) {
      inp = '<select name="'+key+'" data-key="'+key+'" style="width:100%">' + controllerOpts + '</select>';
    }
    else if (key === 'contractor' && ['admin', 'director', 'manager'].includes(String(S.user ? S.user.role : '').toLowerCase())) {
      var curContrName = String(val || '').trim();
      var contrObj = (S.contractors || []).find(function(c){ return c.name_short === curContrName; });

      var contrCard = curContrName ? (
        '<div style="width:100%;background:#f8fafc;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;margin-bottom:4px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">' +
            '<div>' +
              '<div style="font-weight:700;font-size:.85rem;color:var(--text)">🏢 ' + escHtml(curContrName) + '</div>' +
              (contrObj && contrObj.inn ? '<div style="font-size:.74rem;color:var(--text-3)">ИНН: ' + escHtml(contrObj.inn) + '</div>' : '') +
            '</div>' +
            '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
              '<button type="button" class="btn btn-sm btn-ghost" onclick="openContractorPicker(\'' + eid + '\')" style="font-size:.74rem;padding:2px 7px" title="Выбрать другого подрядчика">🔍 Сменить</button>' +
              '<button type="button" class="btn btn-sm btn-ghost" onclick="openSubcontractModal(\'' + eid + '\')" style="font-size:.74rem;padding:2px 7px;color:var(--primary);font-weight:600" title="Редактировать условия договора, монтажников и дедлайн">✏️ Условия и монтажники</button>' +
              (curStageNum === 0 ? ('<button type="button" class="btn btn-sm btn-primary" onclick="window._takeTaskToStage(\'' + eid + '\', 1)" style="font-size:.74rem;padding:2px 8px;background:#16a34a;border-color:#16a34a;font-weight:700" title="Перевести заявку на Этап 1 (В монтаже)">👷 В монтаж →</button>') : '') +
            '</div>' +
          '</div>' +
        '</div>'
      ) : (
        '<div style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:4px 0">' +
          '<span class="t3" style="font-size:.84rem">— Не назначен —</span>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="openContractorPicker(\'' + eid + '\')" style="color:var(--orange-dark);font-weight:600;font-size:.78rem;padding:2px 8px">' +
            '+ Назначить подрядчика' +
          '</button>' +
        '</div>'
      );

      inp = '<input type="hidden" name="contractor" data-key="contractor" value="' + escHtml(curContrName) + '">' + contrCard;
    }
    else if (key === 'customer' && ['admin', 'director', 'manager', 'to_engineer'].includes(String(S.user ? S.user.role : '').toLowerCase())) {
      var custOptsList = ['ПАО Сбербанк'];
      (S.contractors || []).filter(function(c){ return c.type === 'customer'; }).forEach(function(c){
        if (!custOptsList.includes(c.name_short)) custOptsList.push(c.name_short);
      });
      (S.contracts || []).forEach(function(c){
        if (c.customer_name && !custOptsList.includes(c.customer_name)) custOptsList.push(c.customer_name);
      });
      if (val && !custOptsList.includes(val)) custOptsList.unshift(val);

      var custDatalistOptions = custOptsList.map(function(opt) {
        return '<option value="' + escHtml(opt) + '">';
      }).join('');
      inp = '<div style="position:relative;width:100%">' +
        '<input type="text" list="card_customer_datalist" name="customer" data-key="customer" value="' + escHtml(val) + '" placeholder="🔍 Начните ввод заказчика..." style="width:100%;padding:5px 8px;font-size:.82rem;font-weight:600;border:1.5px solid var(--border);border-radius:6px;box-sizing:border-box" autocomplete="off">' +
        '<datalist id="card_customer_datalist">' + custDatalistOptions + '</datalist>' +
      '</div>';
    }
    else if (key === 'contact') {
      var rawContact = String(val || '');
      var phoneMatch = rawContact.match(/(?:\+7|8)[\s\-(]?\d{3}[\s\-)]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/);
      var cleanPhone = phoneMatch ? phoneMatch[0].replace(/[^\d+]/g, '') : null;
      var emailMatch = rawContact.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
      var maxLinkMatch = rawContact.match(/(?:https?:\/\/)?(?:web\.)?max\.ru\/[^\s,;]+/i);

      var quickContactActions = '';
      if (cleanPhone || emailMatch || maxLinkMatch) {
        var callBtn = cleanPhone ? '<a href="tel:' + cleanPhone + '" class="btn btn-sm btn-ghost" style="color:var(--green);font-size:.75rem;padding:2px 8px;border:1px solid var(--border)" title="Позвонить">📞 ' + escHtml(phoneMatch[0]) + '</a>' : '';
        var waBtn = cleanPhone ? '<a href="https://wa.me/' + cleanPhone.replace('+','') + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost" style="color:#16a34a;font-size:.75rem;padding:2px 8px;border:1px solid var(--border)" title="Написать в WhatsApp">💬 WhatsApp</a>' : '';
        var tgBtn = cleanPhone ? '<a href="https://t.me/+' + cleanPhone.replace('+','') + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost" style="color:#0284c7;font-size:.75rem;padding:2px 8px;border:1px solid var(--border)" title="Написать в Telegram">✈️ Telegram</a>' : '';
        var maxPhone = cleanPhone ? escHtml(cleanPhone) : '';
        var maxDirect = maxLinkMatch ? escHtml(maxLinkMatch[0]) : '';
        var maxBtn = (cleanPhone || maxLinkMatch) ? '<button type="button" onclick="openMaxMessenger(\'' + maxPhone + '\',\'' + maxDirect + '\')" class="btn btn-sm btn-ghost" style="color:#2563eb;font-size:.75rem;padding:2px 8px;border:1px solid var(--border);cursor:pointer;background:transparent" title="Открыть в мессенджере МАКС (номер скопируется в буфер для поиска)">💬 МАКС</button>' : '';
        var mailBtn = emailMatch ? '<a href="mailto:' + emailMatch[0] + '" class="btn btn-sm btn-ghost" style="color:var(--blue);font-size:.75rem;padding:2px 8px;border:1px solid var(--border)" title="Отправить E-mail">✉️ ' + escHtml(emailMatch[0]) + '</a>' : '';

        quickContactActions = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px">' + callBtn + waBtn + tgBtn + maxBtn + mailBtn + '</div>';
      }

      inp = '<div style="width:100%">' +
        '<textarea name="'+key+'" data-key="'+key+'" style="width:100%;font-size:.82rem;min-height:54px;transition:min-height .2s ease" rows="3" onfocus="this.style.minHeight=\'110px\'" onblur="if(this.value.length < 120) this.style.minHeight=\'54px\'">' + escHtml(rawContact) + '</textarea>' +
        quickContactActions +
      '</div>';
    }
    else if (key === 'pricePerUnit') {
      var curAmount = parseFloat(Object.prototype.hasOwnProperty.call(S.cardDraft, 'amount') ? S.cardDraft.amount : t.amount) || 0;
      var curPorts = parseFloat(Object.prototype.hasOwnProperty.call(S.cardDraft, 'inOrder') ? S.cardDraft.inOrder : (t.inOrder || t.ports || t.fact)) || 0;
      var calcPrice = (curAmount > 0 && curPorts > 0) ? Math.round(curAmount / curPorts) : 0;
      var curVal = (val !== '' && val != null) ? val : (calcPrice > 0 ? calcPrice : '');

      inp = '<div style="display:flex;gap:4px;align-items:center;width:100%">' +
        '<input type="number" name="pricePerUnit" data-key="pricePerUnit" value="' + String(curVal).replace(/"/g,'&quot;') + '" placeholder="0" style="flex:1">' +
        (calcPrice > 0 ? ('<button type="button" class="btn btn-sm btn-ghost" onclick="window.recalcCardUnitPrice(\'' + escHtml(t.id) + '\')" title="Пересчитать по формуле: ' + curAmount + ' ÷ ' + curPorts + ' = ' + calcPrice + ' ₽" style="padding:3px 7px;font-size:.74rem;white-space:nowrap;border:1px solid var(--border)">🔄 ' + calcPrice.toLocaleString('ru-RU') + ' ₽</button>') : '') +
      '</div>';
    }
    else if (key === 'priemka' || key === 'obsledovanie' || key === 'dostup') {
      var isUrl = typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'));
      var isPath = typeof val === 'string' && val.trim().length > 0 && !isUrl;
      var openLink = isUrl ? val : (isPath ? 'https://cloud.stockeasy.ru' : '');
      inp = '<div style="display:flex;gap:4px;align-items:center;width:100%">' +
        '<input type="text" name="' + key + '" data-key="' + key + '" id="card_field_' + key + '" value="' + String(val).replace(/"/g,'&quot;') + '" placeholder="Папка или ссылка в облаке" style="flex:1;min-width:0;font-size:.82rem">' +
        (openLink ? ('<a href="' + escHtml(openLink) + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost" style="padding:2px 7px;font-size:.74rem;color:#0284c7;white-space:nowrap;border:1px solid var(--border)" title="Открыть папку в Seafile">☁️ Открыть</a>') : '') +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="window.cardOpenCloudFolderModal(\'' + escHtml(t.id) + '\', \'' + key + '\')" style="padding:2px 7px;font-size:.74rem;color:var(--primary);white-space:nowrap;border:1px solid var(--border)" title="Создать или привязать папку в cloud.stockeasy.ru">☁️ Seafile</button>' +
      '</div>';
    }
    else if (type === 'textarea') inp = '<textarea name="'+key+'" data-key="'+key+'"' + (ph ? (' placeholder="' + escHtml(ph) + '"') : '') + ' style="width:100%;font-size:.82rem;min-height:54px;transition:min-height .2s ease" onfocus="this.style.minHeight=\'110px\'" onblur="if(this.value.length < 120) this.style.minHeight=\'54px\'">'+val+'</textarea>';
    else if (type === 'checkbox') inp = '<input type="checkbox" name="'+key+'" data-key="'+key+'"'+(val ? ' checked' : '')+'>';
    else if (type === 'date') {
      var dVal = val ? String(val).slice(0, 10) : '';
      inp = '<input type="date" name="'+key+'" data-key="'+key+'" value="'+dVal+'" style="width:100%">';
    }
    else inp = '<input type="'+(type||'text')+'" name="'+key+'" data-key="'+key+'"' + (ph ? (' placeholder="' + escHtml(ph) + '"') : '') + ' value="'+String(val).replace(/"/g,'&quot;')+'">';
    var dirtyMark = isDirty ? ' <span class="badge b-orange" style="font-size:10px;padding:1px 5px">изменено</span>' : '';
    if (compact) {
      return '<div class="field-compact">' +
        '<div class="field-lbl">' + lbl + hintHtml + dirtyMark + '</div>' +
        '<div class="field-val">' + inp + '</div>' +
      '</div>';
    }
    return '<div class="field-row"><div class="field-lbl">'+lbl+hintHtml+dirtyMark+'</div><div class="field-val">'+inp+'</div></div>';
  }

  // История изменений
  var hist = ((t.history || t._history || [])).slice().reverse();
  var histHtml = hist.length ? hist.map(function(h){
    var authorHtml = h.author ? ' <span class="badge b-gray" style="font-size:10px;padding:1px 5px;margin-left:5px">' + h.author + '</span>' : '';
    return '<div class="hist-item" style="padding:6px 0;border-bottom:1px solid var(--border)">' + (h.date || '—') + authorHtml + '<br><span class="t3">' + (h.field || 'Поле') + ':</span> <span style="text-decoration:line-through;color:var(--red);opacity:0.8">' + (h.old||'—') + '</span> &rarr; <b style="color:var(--text)">' + (h.new||'—') + '</b></div>';
  }).join('') : '<div class="t3" style="font-size:.78rem;padding:.5rem 0">Изменений не было</div>';
  // Карта — Leaflet + Nominatim с умным геокодированием
  var mapRegion = (t.region||'').trim();
  var mapAddress = (t.address||'').trim();
  var mapFullAddr = (mapRegion ? mapRegion + ', ' : '') + mapAddress;

  // Очищаем адрес: убираем сокращения типа "с.", "ул.", "пгт" для лучшего поиска
  function cleanAddr(s) {
    return s
      .replace(/\bс\.\s*/g,'').replace(/\bпгт\.?\s*/g,'').replace(/\bул\.\s*/g,'')
      .replace(/\bд\.\s*/g,'').replace(/\bпр-кт\s*/g,'').replace(/\bпр\.\s*/g,'')
      .replace(/\bпер\.\s*/g,'').replace(/\bпос\.\s*/g,'')
      .trim();
  }

  // Строим умные варианты запросов по очереди (от точного к широкому)
  var addrParts = mapAddress.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  var lastParts = addrParts.slice(-3).join(', ');   // последние 3 части (улица, номер)
  var cityParts = addrParts.slice(-2).join(', ');   // последние 2 части

  var mapQueries = [
    // 1. Самый точный поиск: Страна + Регион + Полный адрес
    'Россия, ' + mapRegion + ', ' + cleanAddr(mapAddress),           
    
    // 2. Если полный адрес сложный, ищем: Страна + Регион + Улица/Дом
    'Россия, ' + mapRegion + ', ' + cleanAddr(lastParts),            
    
    // 3. Запасной вариант (если в Excel регион написан с ошибкой): просто адрес
    'Россия, ' + cleanAddr(mapAddress),                              
    
    // 4. Крайний случай: если ничего не нашли, просто ткнуть в центр региона
    'Россия, ' + mapRegion                                           
  ].filter(function(q, i, arr){ return arr.indexOf(q) === i; });

  var mapId = 'leafmap' + Date.now();
  var dgisUrl  = 'https://2gis.ru/search/' + encodeURIComponent('Россия, ' + mapFullAddr);
  var yandexUrl = 'https://yandex.ru/maps/?rtext=~' + encodeURIComponent('Россия, ' + mapFullAddr) + '&rtt=auto';

  // Кнопки карт — показываются ВСЕГДА под картой
  var mapNavBtns = '<div style="display:flex;gap:.5rem;margin-top:.6rem;flex-wrap:wrap">' +
    '<a href="' + dgisUrl + '" target="_blank" class="btn btn-sm" style="background:#3069b0;gap:5px;color:#fff">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="10" r="4"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg>' +
      '2ГИС' +
    '</a>' +
    '<a href="' + yandexUrl + '" target="_blank" class="btn btn-sm" style="background:#fc3f1d;gap:5px;color:#fff;font-weight:700" title="Построить маршрут на Яндекс.Картах (Навигатор)">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="10" r="4"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg>' +
      '📍 Маршрут (Яндекс.Карты)' +
    '</a>' +
  '</div>';

  var mapHtml = '<div id="'+mapId+'" style="height:260px;border-radius:var(--radius);overflow:hidden;background:#f0f0f0;display:flex;align-items:center;justify-content:center;color:#888;font-size:.82rem">Загрузка карты…</div>' +
    mapNavBtns;

  setTimeout(function(){
    var el = document.getElementById(mapId);
    if (!el) return;

    function tryGeocode(queries, cb) {
      if (!queries.length) { cb(null); return; }
      var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru&accept-language=ru&q=' + encodeURIComponent(queries[0]);
      fetch(url)
        .then(function(r){ return r.json(); })
        .then(function(d){
          if (d && d[0]) cb(d[0], queries[0]);
          else tryGeocode(queries.slice(1), cb);
        })
        .catch(function(){ tryGeocode(queries.slice(1), cb); });
    }

    function renderLeaflet() {
      if (t.geoLat && t.geoLon) {
        var lat = parseFloat(t.geoLat), lng = parseFloat(t.geoLon);
        el.innerHTML = '';
        var map = L.map(el).setView([lat, lng], 16);
        window._activeLeafletMap = map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
        L.marker([lat, lng]).addTo(map).bindPopup(t.cleanAddress || t.address).openPopup();
        return;
      }
      tryGeocode(mapQueries, function(result, matchedQuery) {
        if (!result) {
          // Геокодирование не удалось — показываем заглушку, кнопки уже есть под картой
          el.style.background = '#f8f8f8';
          el.innerHTML = '<div style="text-align:center;padding:1.5rem 1rem">' +
            '<div style="font-size:1.6rem;margin-bottom:.5rem">🗺️</div>' +
            '<div style="color:#555;font-size:.82rem;margin-bottom:.3rem">Адрес не найден на карте</div>' +
            '<div style="color:#aaa;font-size:.72rem">Воспользуйтесь кнопками ниже для&nbsp;просмотра</div>' +
          '</div>';
          return;
        }
        var lat = parseFloat(result.lat), lng = parseFloat(result.lon);
        // Если нашли только регион (широкий результат) — используем зум поменьше
        var isApprox = result.type === 'administrative' || result.type === 'state' || result.class === 'boundary';
        var zoom = isApprox ? 11 : 15;
        el.innerHTML = '';
        el.style.display = 'block';
        var map = L.map(el).setView([lat, lng], zoom);
        window._activeLeafletMap = map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://osm.org/copyright">OSM</a>',
          maxZoom: 19
        }).addTo(map);
        var popup = isApprox
          ? '<div style="font-size:.78rem;color:#888">⚠️ Приблизительно<br>' + mapAddress + '</div>'
          : mapAddress;
        L.marker([lat, lng]).addTo(map).bindPopup(popup).openPopup();
      });
    }

    if (window.L) { renderLeaflet(); }
    else {
      var css = document.createElement('link'); css.rel='stylesheet'; css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
      var s = document.createElement('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = renderLeaflet; document.head.appendChild(s);
    }
  }, 150);

  setTimeout(function(){
    loadCardSubcontracts(t.id);
    loadCardDocuments(t.id);
  }, 50);

  var eid = t.id.replace(/'/g, "\\'");
  var stageLabel = {request:'\u0417\u0430\u044f\u0432\u043a\u0430',survey:'\u041e\u0431\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u0435',install:'\u041c\u043e\u043d\u0442\u0430\u0436',control:'\u041a\u043e\u043d\u0442\u0440\u043e\u043b\u044c',acceptance:'\u041f\u0440\u0438\u0451\u043c\u043a\u0430',payment:'\u041e\u043f\u043b\u0430\u0442\u0430'};
  var stageOpts = ['request','survey','install','control','acceptance','payment'].map(function(v){
    var curStage = Object.prototype.hasOwnProperty.call(S.cardDraft,'stage') ? S.cardDraft.stage : t.stage;
    return '<option value="'+v+'"'+(curStage===v?' selected':'')+'>'+stageLabel[v]+'</option>';
  }).join('');
  var docBtns =
    '<button class="btn btn-sm btn-ghost" onclick="window.print()" title="Распечатать карточку объекта / сохранить в PDF">🖨️ Печать</button>';

  var curStageNum = Number(t.stageNum != null ? t.stageNum : 0);
  if (curStageNum < 0) curStageNum = 0;
  if (curStageNum > 9) curStageNum = 9;
  var isLocked = ['accepted', 'billing', 'paid', 'archived'].includes((t.macroStatus || '').toLowerCase()) || t.status === 'cancelled' || curStageNum >= 8;

  var cancelBtn = '';
  if (t.status === 'cancelled') {
    cancelBtn = '<span class="badge b-red" style="padding:6px 12px;font-weight:700">🚫 Заявка отменена' + (t.overdueReason ? ': ' + escHtml(t.overdueReason) : '') + '</span>';
  } else if (!isLocked) {
    cancelBtn = '<button class="btn btn-sm btn-ghost" style="color:var(--red);border-color:rgba(239,68,68,0.3)" onclick="cancelTaskPrompt(\'' + eid + '\')" title="Отменить заявку с указанием причины">🚫 Отменить заявку</button>';
  }

  var isManagerOrAdmin = S.user && ['admin', 'director', 'manager', 'to_engineer'].includes(String(S.user.role||'').toLowerCase());

  var macroStatusHtml = isManagerOrAdmin
    ? '<div style="display:flex;align-items:center;gap:6px">' +
        '<select onchange="changeTaskMacroStatus(\'' + eid + '\', this.value)" style="background:#ffffff;color:#0f172a;font-weight:600;font-size:.82rem;padding:5px 10px;border:1.5px solid #cbd5e1;border-radius:6px;cursor:pointer;outline:none;box-shadow:0 1px 2px rgba(0,0,0,0.05)">' +
          Object.keys(MACRO_STATUSES).map(function(k){
            var curMs = (t.macroStatus || 'new').toLowerCase();
            return '<option value="' + k + '"' + (curMs === k ? ' selected' : '') + ' style="color:#0f172a;background:#ffffff">' + MACRO_STATUSES[k].icon + ' ' + MACRO_STATUSES[k].name + '</option>';
          }).join('') +
        '</select>' +
      '</div>'
    : '<div style="display:flex;align-items:center;gap:6px">' +
        macroStatusBadge(t.macroStatus || 'new') +
      '</div>';

  var dateZayavkiStr = t.dateZayavki ? t.dateZayavki.slice(0, 10).split('-').reverse().join('.') : '—';
  var datePpStr = t.currentDate
    ? (String(t.currentDate).slice(0, 10).includes('-') ? String(t.currentDate).slice(0, 10).split('-').reverse().join('.') : String(t.currentDate).slice(0, 10))
    : ((t.rawData && (t.rawData['текущая дата'] || t.rawData['текущяя дата'] || t.rawData['дата с пп'] || t.rawData['дата_внесения'])) || '—');
  var curDeadlineVal = Object.prototype.hasOwnProperty.call(S.cardDraft, 'deadline') ? S.cardDraft.deadline : t.deadline;
  var deadlineStr = curDeadlineVal ? String(curDeadlineVal).slice(0, 10).split('-').reverse().join('.') : '—';

  var overdueBadge = '';
  if (curDeadlineVal) {
    var dl = new Date(curDeadlineVal);
    var now = new Date();
    var isDone = ['accepted', 'billing', 'paid', 'archived', 'done'].includes((t.macroStatus || t.status || '').toLowerCase());
    if (!isDone && dl < now) {
      var diffDays = Math.max(1, Math.floor((now - dl) / (1000 * 60 * 60 * 24)));
      overdueBadge = ' <span class="badge b-red" style="padding:1px 5px;font-size:.68rem;font-weight:700" title="Просрочено на ' + diffDays + ' дн.">⚠️ +' + diffDays + ' дн.</span>';
    }
  }

  var edoNumVal = t.edoNumber || (t.rawData && (t.rawData['№ документа в эдо'] || t.rawData['№ в эдо'] || t.rawData['номер в эдо'] || t.rawData['эдо'])) || '';
  var edoBadge = edoNumVal
    ? '<span class="badge b-blue" style="font-size:.82rem;font-weight:700;padding:2px 8px;letter-spacing:0.3px;cursor:pointer" onclick="if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(\'' + escHtml(edoNumVal) + '\');}if(window.showToast)showToast(\'Номер ЭДО скопирован: ' + escHtml(edoNumVal) + '\')" title="Номер документа в ЭДО Заказчика (кликните, чтобы скопировать)">ЭДО: ' + escHtml(edoNumVal) + '</span>'
    : '<span class="badge b-gray" style="font-size:.74rem;padding:2px 6px;color:var(--text-3)" title="Номер документа в ЭДО не указан">ЭДО: —</span>';

  var datesBlock = '<div class="card-sticky-dates" title="Ключевые даты заявки: поступление, ПП и дедлайн">' +
    '<div title="Дата поступления заявки от Заказчика"><span style="color:var(--text-3);font-size:.7rem">Заявка:</span> <b>' + dateZayavkiStr + '</b></div>' +
    '<div style="color:var(--border)">|</div>' +
    '<div title="Дата планового подтверждения (ПП) / дата внесения из реестра"><span style="color:var(--text-3);font-size:.7rem">ПП:</span> <b style="color:var(--blue)">' + datePpStr + '</b></div>' +
    '<div style="color:var(--border)">|</div>' +
    '<div title="Плановый срок завершения (дедлайн)"><span style="color:var(--text-3);font-size:.7rem">Дедлайн:</span> <b>' + deadlineStr + '</b>' + overdueBadge + '</div>' +
  '</div>';

  var hdr = '<div class="card-hdr" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:.4rem">' +
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-sm btn-ghost" onclick="returnFromCard()" title="Вернуться назад к списку" style="font-weight:600;padding:4px 8px">← ' + (S._cardOriginPage === 'kanban' ? 'Канбан' : 'Заявки') + '</button>' +
      '<h1 style="margin:0;font-size:1.2rem;display:inline-block;white-space:nowrap">' + t.id + '</h1>' +
      edoBadge +
      macroStatusHtml +
      '<span id="card_autosave_indicator" style="font-size:.76rem;font-weight:600;margin-left:6px"></span>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      datesBlock +
      '<div style="display:flex;align-items:center;gap:4px">' +
        '<a href="https://yandex.ru/maps/?rtext=~' + encodeURIComponent('Россия, ' + mapFullAddr) + '&rtt=auto" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost" title="Построить автомобильный маршрут на Яндекс.Картах" style="font-size:.78rem;font-weight:600;padding:4px 8px;color:#fc3f1d;border-color:rgba(252,63,29,0.3)">📍 Маршрут</a>' +
        '<button class="btn btn-sm btn-ghost" onclick="toggleTaskChatDrawer(\'' + eid + '\')" title="Открыть чат по заявке сбоку" style="font-size:.78rem;font-weight:600;padding:4px 8px">💬 Чат</button>' +
        (isManagerOrAdmin ? '<button class="btn btn-sm btn-ghost" style="color:var(--red);border-color:rgba(239,68,68,0.25);font-size:.78rem;padding:4px 8px" onclick="deleteTaskPrompt(\'' + eid + '\')" title="Удалить заявку из базы">🗑️</button>' : '') +
        '<button class="btn btn-sm btn-ghost" onclick="window.print()" title="Распечатать карточку объекта / сохранить в PDF" style="font-size:.78rem;padding:4px 8px">🖨️</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  var cancelledBanner = t.status === 'cancelled'
    ? '<div class="banner banner-warn" style="background:#fee2e2;border:1.5px solid #f87171;margin-bottom:1rem">' +
        '<div>' +
          '<div class="banner-title" style="color:#b91c1c;font-size:.95rem">🚫 Заявка отменена</div>' +
          '<div class="banner-body" style="color:#7f1d1d">Причина: <strong>' + escHtml(t.overdueReason || 'Причина не указана') + '</strong></div>' +
        '</div>' +
      '</div>'
    : '';

  var curStg = ID_STAGES[curStageNum] || ID_STAGES[0];
  var nextStepDef = curStageNum < 9 ? ID_STEPS[curStageNum] : null;

  var idStageHelp = [
    'Специалист ТО проверяет ТЗ, изучает Заказчика, выясняет ключевые моменты и передает ответственному менеджеру.',
    'Монтаж на объекте начат. Исполнители выполняют прокладку и установку оборудования.',
    'Монтаж завершён. Менеджер собирает фотоотчёт и результаты замеров для передачи в проектный отдел.',
    'Закрытие СМР. Проверка протоколов измерений портов, КЖ и чек-листа СМР для сдачи в проектный отдел.',
    'ИД в проектировании. Проектировщик подготавливает комплект исполнительной документации.',
    'Исполнительная документация готова. Отдел отправки проверяет альбом и направляет Заказчику.',
    'ИД на согласовании у Заказчика. При наличии правок вносите замечания в карточку. Приёмка блокируется открытыми замечаниями.',
    'ИД успешно согласована и принята Заказчиком. Пакет документов передан на оплату.',
    'Заявка ожидает поступления оплаты от Заказчика.',
    'Заявка успешно завершена и полностью оплачена.'
  ];

  var isDueOverdue = t.stageDue && new Date(t.stageDue) < new Date();
  var dueStr = t.stageDue ? t.stageDue.slice(0, 10).split('-').reverse().join('.') : '';

  var stepperHtml = '';
  ID_STAGES.forEach(function(stg, idx) {
    var isCurrent = (idx === curStageNum);
    var isPassed = (idx < curStageNum);
    var stepBg = isCurrent ? 'var(--orange-bg)' : (isPassed ? 'var(--green-bg)' : '#f8fafc');
    var stepBorder = isCurrent ? 'var(--orange)' : (isPassed ? 'var(--green)' : 'var(--border)');
    var stepColor = isCurrent ? 'var(--orange-dark)' : (isPassed ? 'var(--green)' : 'var(--text-3)');
    var stepFontWeight = isCurrent ? '700' : '500';

    stepperHtml += '<div class="step ' + (isCurrent ? 'active' : (isPassed ? 'done' : '')) + '" style="flex:1;min-width:110px;padding:8px 6px;border-radius:8px;border:1.5px solid ' + stepBorder + ';background:' + stepBg + ';color:' + stepColor + ';text-align:center;transition:all .15s" title="' + stg.name + ' (' + stg.role + ')">' +
      '<div style="font-size:1.1rem;margin-bottom:2px">' + stg.icon + '</div>' +
      '<div style="font-size:.75rem;font-weight:' + stepFontWeight + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + idx + '. ' + stg.name + '</div>' +
      '<div style="font-size:.65rem;opacity:.8;margin-top:1px">' + stg.role + '</div>' +
      (isCurrent ? '<div style="font-size:.65rem;color:var(--orange);font-weight:700;margin-top:2px">● ТЕКУЩИЙ</div>' : '') +
      (isPassed ? '<div style="font-size:.65rem;color:var(--green);font-weight:600;margin-top:2px">✓ Пройден</div>' : '') +
    '</div>';

    if (idx < ID_STAGES.length - 1) {
      stepperHtml += '<div style="color:var(--text-3);font-size:.9rem;user-select:none;padding:0 1px">→</div>';
    }
  });

  var canStepNow = canUserStep(S.user, t);
  var canUndoNow = canUserUndo(S.user, t);

  // ─── 1. SMART ACTION CENTER ───
  var checklistHtml = '';
  var canAdvance = true;
  var advanceBlockReason = '';

  if (curStageNum === 0) {
    var hasCont = !!(t.contractor && t.contractor.trim());
    if (hasCont) {
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon ok">✓</span><span>Подрядчик назначен: <b>' + escHtml(t.contractor) + '</b></span></div>';
    } else {
      canAdvance = false;
      advanceBlockReason = 'Не назначен подрядчик на заявку';
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon fail">✕</span><span style="color:var(--red)">Подрядчик не назначен</span><span class="checklist-action-link" onclick="setCardTab(\'items\')">Назначить в спецификации →</span></div>';
    }
  } else if (curStageNum === 1) {
    var factVal = Number(t.fact) || 0;
    if (factVal > 0) {
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon ok">✓</span><span>Фактический объем подтвержден: <b>' + factVal + ' ед.</b></span></div>';
    } else {
      canAdvance = false;
      advanceBlockReason = 'Укажите фактический объем выполненных работ';
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon fail">✕</span><span style="color:var(--red)">Фактический объем не указан (Факт = 0)</span><span class="checklist-action-link" onclick="setCardTab(\'finance\')">Указать факт в финансах →</span></div>';
    }
  } else if (curStageNum === 2) {
    var hasMat = !!(t.materialsLink && t.materialsLink.trim());
    if (hasMat) {
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon ok">✓</span><span>Ссылка на материалы указана: <a href="' + escHtml(t.materialsLink) + '" target="_blank" rel="noopener noreferrer">Яндекс.Диск</a></span></div>';
    } else {
      canAdvance = false;
      advanceBlockReason = 'Загрузите фотоотчёт или укажите ссылку на Яндекс.Диск';
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon fail">✕</span><span style="color:var(--red)">Нет фотоотчёта или ссылки на Яндекс.Диск</span><span class="checklist-action-link" onclick="setCardTab(\'files\')">Загрузить во вкладке «Файлы» →</span></div>';
    }
  } else if (curStageNum === 4) {
    var hasId = !!(t.idLink && t.idLink.trim());
    if (hasId) {
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon ok">✓</span><span>Альбом ИД прикреплен: <a href="' + escHtml(t.idLink) + '" target="_blank" rel="noopener noreferrer">Открыть альбом</a></span></div>';
    } else {
      canAdvance = false;
      advanceBlockReason = 'Прикрепите ссылку на готовую ИД';
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon fail">✕</span><span style="color:var(--red)">Ссылка на готовую ИД не указана</span><span class="checklist-action-link" onclick="setCardTab(\'files\')">Прикрепить ссылку на ИД →</span></div>';
    }
  } else if (curStageNum === 6) {
    var openRem = Number(t.openRemarksCount || 0);
    if (openRem === 0) {
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon ok">✓</span><span>Все замечания Заказчика устранены (открытых замечаний нет)</span></div>';
    } else {
      canAdvance = false;
      advanceBlockReason = 'Устраните открытые замечания Заказчика (' + openRem + ' шт.)';
      checklistHtml += '<div class="checklist-item"><span class="checklist-icon fail">✕</span><span style="color:var(--red)">Открыто замечаний Заказчика: <b>' + openRem + ' шт.</b></span><span class="checklist-action-link" onclick="setCardTab(\'remarks\')">Устранить замечания →</span></div>';
    }
  } else {
    checklistHtml += '<div class="checklist-item"><span class="checklist-icon ok">✓</span><span>Условия этапа регламента соблюдены</span></div>';
  }

  var smartActionBox = (typeof renderStageGuideBanner === 'function') ? renderStageGuideBanner(curStageNum) : '';

  var curTab = S.cardTab || 'main';
  var openRemCount = Number(t.openRemarksCount || 0);
  var remarksTabBadge = openRemCount > 0
    ? ' <span class="card-tab-badge badge-red">' + openRemCount + '</span>'
    : '';

  var isAccepted = (t.assignmentStatus === 'accepted' || t.assignment_status === 'accepted') ||
                   (Number(t.stage_num || t.stageNum || 0) > 0) ||
                   (t.status && !['new', 'pending', 'cancelled'].includes(t.status)) ||
                   (Boolean(t.contractor && t.contractor.trim()));

  var techLinkVal = String(t.tech_link || t.techLink || t.materials_link || t.materialsLink || '').trim();

  var compactActionBar = (function() {
    var stageObj = (typeof APP_HINTS !== 'undefined' && APP_HINTS.stages && APP_HINTS.stages[curStageNum]) || { title: curStg.name, role: curStg.role, goal: idStageHelp[curStageNum] || curStg.name };
    var techBtn = techLinkVal
      ? ('<a href="' + escHtml(techLinkVal) + '" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-primary" style="background:#2563eb;color:#fff;font-weight:700;font-size:.76rem;padding:3px 9px;text-decoration:none;display:inline-flex;align-items:center;gap:4px" title="Открыть папку с ТЗ на Яндекс.Диске">📁 Диск Заказчика ↗</a>' +
         '<button type="button" class="btn btn-xs btn-ghost" onclick="window.editCardTechLink(\'' + eid + '\')" style="font-size:.72rem;padding:2px 6px;border:1px solid #bfdbfe;color:#1d4ed8;background:#fff" title="Изменить ссылку на Яндекс.Диск">✏️</button>')
      : ('<button type="button" class="btn btn-xs btn-ghost" onclick="window.editCardTechLink(\'' + eid + '\')" style="font-size:.74rem;padding:3px 8px;border:1px dashed #3b82f6;color:#1d4ed8;background:#eff6ff">+ Папка на Яндекс.Диске</button>');

    var entryActions = '';
    if (!isWorker) {
      if (!isAccepted) {
        entryActions = '<div style="display:inline-flex;gap:4px;align-items:center">' +
          '<button type="button" class="btn btn-xs btn-primary" onclick="approveTaskEntry(\'' + eid + '\')" style="background:#16a34a;border-color:#16a34a;font-weight:700;padding:3px 9px;font-size:.76rem">✓ Принять заявку</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="openDeclineTaskModal(\'' + eid + '\')" style="color:#dc2626;border:1px solid #fca5a5;background:#fff;font-size:.74rem;padding:2px 7px">✕ Отклонить</button>' +
        '</div>';
      } else {
        var stageActionBtn = '';
        if (curStageNum === 3) {
          stageActionBtn = '<button type="button" class="btn btn-xs btn-primary" onclick="window._takeTaskToStage(\'' + eid + '\', 4)" style="background:#2563eb;border-color:#2563eb;font-weight:700;padding:3px 10px;font-size:.76rem" title="Принять задачу в работу проектным отделом (норматив 3 дня)">📐 Взять в работу: ИД в проектировании</button>';
        } else if (curStageNum === 4) {
          stageActionBtn = '<button type="button" class="btn btn-xs btn-primary" onclick="window._takeTaskToStage(\'' + eid + '\', 5)" style="background:#16a34a;border-color:#16a34a;font-weight:700;padding:3px 10px;font-size:.76rem" title="Завершить разработку альбома ИД и передать на согласование">📄 ИД готова (сдать Заказчику)</button>';
        } else if (curStageNum === 2 || (curStageNum === 1 && (Number(t.fact) > 0 || (t.rawData && t.rawData.dataVyhoda)))) {
          stageActionBtn = '<button type="button" class="btn btn-xs btn-primary" onclick="window._takeTaskToStage(\'' + eid + '\', 3)" style="background:#059669;border-color:#059669;font-weight:700;padding:3px 10px;font-size:.76rem" title="Завершить СМР и перейти к закрытию и ИД">🏁 Закрыть СМР</button>';
        }

        entryActions = '<div style="display:inline-flex;gap:4px;align-items:center">' +
          stageActionBtn +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="toggleTaskEditLock()" style="padding:2px 8px;font-size:.72rem;border:1px solid ' + (S._taskEditUnlocked ? '#fca5a5' : '#bbf7d0') + ';background:#fff;color:' + (S._taskEditUnlocked ? '#b91c1c' : '#15803d') + ';font-weight:600" title="' + (S._taskEditUnlocked ? 'Заблокировать поля' : 'Разблокировать поля для редактирования') + '">' +
            (S._taskEditUnlocked ? '🔓 Заблокировать' : '✏️ Правка полей') +
          '</button>' +
        '</div>';
      }
    } else {
      if (curStageNum === 1 || curStageNum === 2) {
        entryActions = '<button type="button" class="btn btn-xs btn-primary" onclick="window._takeTaskToStage(\'' + eid + '\', 3)" style="background:#059669;border-color:#059669;font-weight:700;padding:3px 10px;font-size:.76rem" title="Завершить монтаж и сдать СМР">🏁 Сдать СМР куратору</button>';
      }
    }

    return '<div class="stage-guide-banner" style="margin:4px 0 6px;padding:6px 12px;background:#f8fafc;border:1.5px solid var(--border);border-radius:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;flex:1">' +
        '<span style="font-size:1.1rem;line-height:1">💡</span>' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
          '<span style="font-weight:700;font-size:.84rem;color:var(--text)">' + escHtml(stageObj.title || curStg.name) + '</span>' +
          '<span class="badge b-blue" style="font-size:.68rem;padding:1px 5px">' + escHtml(stageObj.role || curStg.role) + '</span>' +
        '</div>' +
        (stageObj.goal ? ('<div style="font-size:.76rem;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:380px" title="' + escHtml(stageObj.goal) + '">🎯 ' + escHtml(stageObj.goal) + '</div>') : '') +
      '</div>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;flex-shrink:0">' +
        techBtn +
        '<button type="button" class="btn btn-xs btn-ghost" onclick="showStageHelpModal(' + curStageNum + ')" style="border:1px solid var(--border);background:#fff;white-space:nowrap;padding:3px 8px;font-weight:600;font-size:.74rem;color:var(--orange-dark)" title="Подробный регламент шага">❓ Регламент</button>' +
        entryActions +
      '</div>' +
    '</div>';
  })();

  var isWorker = S.user && (S.user.role === 'worker' || S.user.role === 'installer' || S.user.role === 'contractor');
  var tabsNav = '<div class="card-tabs-nav">' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'main' ? 'active' : '') + '" data-tab="main" onclick="setCardTab(\'main\')" style="padding:5px 12px;font-size:.82rem">' +
      '🏛️ Информация' +
    '</button>' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'items' ? 'active' : '') + '" data-tab="items" onclick="setCardTab(\'items\')" style="padding:5px 12px;font-size:.82rem">' +
      '👷 Исполнение / СМР' +
    '</button>' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'supply' ? 'active' : '') + '" data-tab="supply" onclick="setCardTab(\'supply\')" style="padding:5px 12px;font-size:.82rem">' +
      '📦 Закрытие и учет ТМЦ' +
    '</button>' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'files' ? 'active' : '') + '" data-tab="files" onclick="setCardTab(\'files\')" style="padding:5px 12px;font-size:.82rem">' +
      '📄 Документы' + remarksTabBadge +
    '</button>' +
    (isWorker ? '' : '<button type="button" class="card-tab-btn ' + (curTab === 'finance' ? 'active' : '') + '" data-tab="finance" onclick="setCardTab(\'finance\')" style="padding:5px 12px;font-size:.82rem">' +
      '💰 Экономика' +
    '</button>') +
    '<button type="button" class="card-tab-btn ' + (curTab === 'chat' ? 'active' : '') + '" data-tab="chat" onclick="setCardTab(\'chat\')" style="padding:5px 12px;font-size:.82rem">' +
      '💬 Чат' +
    '</button>' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'history' ? 'active' : '') + '" data-tab="history" onclick="setCardTab(\'history\')" style="padding:5px 12px;font-size:.82rem">' +
      '🕒 История' +
    '</button>' +
  '</div>';

  var stickyHeader = '<div class="card-sticky-topbar">' +
    hdr +
    compactActionBar +
    tabsNav +
  '</div>';

  var rawExtraRows = (function() {
    var knownKeys = [
      'регион','адрес','тип объекта','тип работ','тип работ ','тип',
      '№ госб','госб','№всп','№ всп','всп',
      'дата заявки','дата окончания работ','текущяя дата','текущая дата',
      'кол-во дней просрочки','дней просрочки','просрочка',
      'статус','статус ','приоритет','ид','ид ',
      'сумма договора','сумма договора ','стоимость за ед.','стоимость за ед',
      ' удаленность','удаленность','удалённость',
      'доп. расходы','доп расходы','тмц','тмц (материалы)','итого платит заказчик','итого платит сбербанк',
      'кол-во в заказе (портов)','в заказе','кол-во в заказе','факт','факт выходов',
      'обследование','доступ','приемка','приёмка','оплата','статус ид',
      'менеджер заказчика','менеджер сбера','менеджер','контрагент','контакт на объекте','контакт',
      'контактное лицо','телефон','контролер','контролёр',
      'ссылка на тех.инфо','ссылка на техинфо','тех.инфо',
      '№ документа в эдо','№ в эдо','номер в эдо','эдо',
      '№ счета / сумма','№ счёта / сумма','счет','счёт',
      'в эдо','внутренний комментарий','комментарий','комментарий из excel',
      'дата распределения','дата выхода','срок ид','стадия ид',
      'материалы','исходники','альбом'
    ];
    var raw = t.rawData || {};
    var extra = Object.keys(raw).filter(function(k) {
      return knownKeys.indexOf(k.toLowerCase().trim()) === -1 && raw[k] !== '' && raw[k] != null;
    }).map(function(k) {
      return [k, raw[k]];
    });
    if (!extra.length) return '';
    function fmtRaw(v) {
      var s = String(v);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10).split('-').reverse().join('.');
      if (/^\d{2}\.\d{2}\.\d{4}/.test(s)) return s.slice(0,10);
      if (/^https?:\/\//i.test(s)) return '<a href="'+s+'" target="_blank" rel="noopener noreferrer">🔗 Открыть</a>';
      var n = parseFloat(s.replace(/\s/g,'').replace(',','.'));
      if (!isNaN(n) && s.replace(/[\d\s.,]/g,'') === '') return n.toLocaleString('ru-RU');
      return s;
    }
    var rows = extra.map(function(pair) {
      return '<div class="field-compact"><div class="field-lbl" style="color:var(--text-3)">'+escHtml(pair[0])+'</div>' +
        '<div class="field-val" style="font-size:.82rem">'+fmtRaw(pair[1])+'</div></div>';
    }).join('');
    return '<details style="margin-top:10px;border:1.5px solid var(--border);border-radius:6px;padding:6px 10px;background:#f8fafc">' +
      '<summary style="font-weight:600;font-size:.78rem;cursor:pointer;color:var(--text-2);user-select:none">📋 Дополнительно из Excel (' + extra.length + ' колонок)</summary>' +
      '<div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px">' + rows + '</div>' +
    '</details>';
  })();

  var phoneMatch = (t.contact || '').match(/(?:\+7|8)[\s\-(]?\d{3}[\s\-)]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/);
  var cleanPhone = phoneMatch ? phoneMatch[0].replace(/[^\d+]/g, '') : null;
  var quickActionsBar = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:.85rem">' +
    '<a href="https://yandex.ru/maps/?rtext=~' + encodeURIComponent('Россия, ' + mapFullAddr) + '&rtt=auto" target="_blank" rel="noopener noreferrer" class="quick-contact-btn nav-btn" style="background:#fff1f2;color:#be123c;border-color:#fecdd3;font-weight:700">📍 Маршрут (Яндекс.Карты)</a>' +
    '<a href="https://2gis.ru/search/' + encodeURIComponent('Россия, ' + mapFullAddr) + '" target="_blank" rel="noopener noreferrer" class="quick-contact-btn nav-btn" style="background:#f0fdfa;color:#0f766e;border-color:#99f6e4">🗺️ 2ГИС</a>' +
    (cleanPhone ? '<a href="tel:' + cleanPhone + '" class="quick-contact-btn call-btn">📞 Позвонить (' + escHtml(phoneMatch[0]) + ')</a>' : '') +
  '</div>';

  var curContract = (S.contracts || []).find(function(x){ 
    var cid = (t.contract_id != null ? t.contract_id : t.contractId) || curContractId;
    return String(x.id) === String(cid); 
  });
  var defaultOurEntity = (curContract && curContract.our_entity_name) 
    ? curContract.our_entity_name 
    : (isSber ? 'ООО «К10»' : 'ООО "Кабельные Системы"');
  var curOwnCompanyId = t.own_company_id || (defaultOurEntity.includes('К10') ? 2 : (defaultOurEntity.includes('Ультима') ? 3 : 1));

  var ownOpts = (S.ownCompanies || [
    { id: 2, name_short: 'ООО «К10»', director: 'Городович И.О.', tax_system: 'УСН (без НДС)', vat_rate: 0 },
    { id: 1, name_short: 'ООО "Кабельные Системы"', director: 'Городович М.В.', tax_system: 'УСН с НДС 5%', vat_rate: 5 },
    { id: 3, name_short: 'ООО "Ультима"', director: 'Бондаренко Ф.А.', tax_system: 'ОСНО (НДС 22%)', vat_rate: 22 }
  ]).map(function(oc) {
    var isSel = (Number(curOwnCompanyId) === Number(oc.id) || oc.name_short === defaultOurEntity) ? ' selected' : '';
    var taxInfo = oc.tax_system ? (' · ' + oc.tax_system) : (Number(oc.vat_rate) > 0 ? (' · НДС ' + oc.vat_rate + '%') : ' · без НДС');
    return '<option value="' + oc.id + '"' + isSel + '>' + escHtml(oc.name_short) + taxInfo + '</option>';
  }).join('');

  var isViewLocked = (t.assignmentStatus === 'accepted' && !S._taskEditUnlocked);

  function renderOurEntityHtml(compact) {
    if (isWorker) return '';
    var content = isViewLocked
      ? ('<div class="field-val-locked" title="Поле защищено"><span>🏢 ' + escHtml(defaultOurEntity) + '</span><span class="t3" style="font-size:.7rem;opacity:.55">🔒</span></div>')
      : ('<select name="own_company_id" data-key="own_company_id" id="card_own_company_select" onchange="onCardOwnCompanyChange(this.value)" style="width:100%;padding:4px 8px;font-size:.82rem;font-weight:600;border:1.5px solid var(--border);border-radius:6px;height:32px">' + ownOpts + '</select>');
    if (compact) {
      return '<div class="field-compact">' +
        '<div class="field-lbl">Генподрядчик («Мы»)</div>' +
        '<div class="field-val">' + content + '</div>' +
      '</div>';
    }
    return '<div class="field-row">' +
      '<div class="field-lbl">Генподрядчик (Мы)</div>' +
      '<div class="field-val" style="display:flex;align-items:center;padding:3px 0">' +
        (isViewLocked
          ? ('<span style="font-weight:700;color:var(--text);font-size:.88rem">🏢 ' + escHtml(defaultOurEntity) + '</span>')
          : ('<select name="own_company_id" data-key="own_company_id" id="card_own_company_select" onchange="onCardOwnCompanyChange(this.value)" style="width:100%;padding:5px 8px;font-size:.82rem;font-weight:600;border:1.5px solid var(--border);border-radius:6px">' + ownOpts + '</select>')) +
      '</div>' +
    '</div>';
  }
  var ourEntityHtml = renderOurEntityHtml(false);

  var assignedContrObj = (S.contractors || []).find(function(c){ return c.name_short === String(t.contractor || '').trim(); });
  var contrCleanPhone = (assignedContrObj && assignedContrObj.phone) ? assignedContrObj.phone.replace(/[^\d+]/g, '') : '';
  function renderContrPhoneHtml(compact) {
    if (!assignedContrObj || !assignedContrObj.phone) return '';
    var content = '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
      '<a href="tel:' + contrCleanPhone + '" style="font-weight:600;color:var(--green);font-size:.82rem">📞 ' + escHtml(assignedContrObj.phone) + '</a>' +
      '<a href="https://wa.me/' + contrCleanPhone.replace('+','') + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost" style="padding:1px 6px;font-size:.72rem;color:#16a34a" title="Написать в WhatsApp">💬 WA</a>' +
      '<button type="button" onclick="openMaxMessenger(\'' + escHtml(contrCleanPhone) + '\')" class="btn btn-sm btn-ghost" style="padding:1px 6px;font-size:.72rem;color:#2563eb;cursor:pointer;background:transparent" title="Открыть в мессенджере МАКС">💬 МАКС</button>' +
    '</div>';
    if (compact) {
      return '<div class="field-compact" style="margin-top:4px">' +
        '<div class="field-lbl">Телефон субподрядчика</div>' +
        '<div class="field-val" style="padding-top:2px">' + content + '</div>' +
      '</div>';
    }
    return '<div class="field-row">' +
      '<div class="field-lbl">Телефон субподрядчика</div>' +
      '<div class="field-val" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' + content + '</div>' +
    '</div>';
  }
  var contrPhoneHtml = renderContrPhoneHtml(false);

  var isAccepted = (t.assignmentStatus === 'accepted' || t.assignment_status === 'accepted');
  var customerInflowCard = '<div class="card p" style="border:1.5px solid var(--border);background:#fff">' +
    '<div class="sec-title" style="margin-bottom:.5rem;display:flex;justify-content:space-between;align-items:center">' +
      '<span style="display:flex;align-items:center;gap:6px">💰 Параметры заказа по договору (Вход)</span>' +
      '<span class="badge b-blue" style="font-size:.72rem">Из договора / Excel</span>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
      field('Сумма договора / заявки', 'amount', 'number', true) +
      field('Стоимость за единицу', 'pricePerUnit', 'number', true) +
      field('В заказе Заказчика (план, портов)', 'inOrder', 'number', true) +
      (isWorker ? '' : field('№ документа в ЭДО', 'edoNumber', 'text', true)) +
      field('Километраж дороги (км)', 'realDistanceKm', 'number', true) +
      field('Доплата за удаленность (₽)', 'distanceKm', 'number', true) +
    '</div>' +
    '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
      '<span style="font-size:.74rem;color:var(--text-3)">Проверили данные Заказчика и подрядчика?</span>' +
      '<button type="button" class="btn btn-sm btn-primary" onclick="window.cardTransitionToSmr(\'' + eid + '\')" style="font-size:.82rem;padding:5px 14px;font-weight:700;background:#16a34a;border-color:#16a34a">🚀 Передать в монтаж (на этап СМР) →</button>' +
    '</div>' +
  '</div>';

  var paneMain = '<div id="cardTabPane-main" class="card-tab-pane" style="display:' + (curTab === 'main' ? 'block' : 'none') + '">' +
    '<div class="card-info-dashboard">' +
      '<!-- ЛЕВАЯ КОЛОНКА -->' +
      '<div style="display:flex;flex-direction:column;gap:.75rem">' +
        '<!-- 1. Объект и Генеральный контракт -->' +
        '<div class="card p">' +
          '<div class="sec-title" style="margin-bottom:.5rem;display:flex;justify-content:space-between;align-items:center">' +
            '<span>🏛️ Объект, Договор и Стороны</span>' +
            '<span class="badge b-gray" style="font-size:.72rem">Карточка объекта</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px">' +
            field('Заказчик', 'customer', null, true) +
            renderOurEntityHtml(true) +
          '</div>' +
          (isWorker ? '' : '<div style="margin-bottom:6px">' + field('Генеральный контракт', 'contract_id', 'select', true) + '</div>') +
          '<div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-bottom:6px">' +
            field('Регион', 'region', 'text', true) +
            field('Адрес объекта', 'address', 'text', true) +
          '</div>' +
          (!isWorker ? (
            '<details style="margin-bottom:8px;background:#f8fafc;border:1px solid var(--border);border-radius:6px;padding:6px 10px">' +
              '<summary style="cursor:pointer;font-size:.78rem;font-weight:600;color:var(--text-2);user-select:none;display:flex;align-items:center;justify-content:space-between">' +
                '<span>📋 Реквизиты объекта / ВСП / ГОСБ (Сбер) ▾</span>' +
                '<span style="font-size:.72rem;color:var(--text-3)">' + ((t.gosb || t.vsp || t.tipObj) ? 'ГОСБ: ' + escHtml(t.gosb||'—') + ' · ВСП: ' + escHtml(t.vsp||'—') : 'развернуть') + '</span>' +
              '</summary>' +
              '<div style="margin-top:8px">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px">' +
                  field('№ ГОСБ', 'gosb', 'text', true) +
                  field('№ ВСП', 'vsp', 'text', true) +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
                  field('Тип объекта', 'tipObj', 'text', true) +
                  field('Тип работ', 'workType', 'text', true) +
                '</div>' +
              '</div>' +
            '</details>'
          ) : '') +
          '<div>' +
            field('Контакт на объекте', 'contact', 'textarea', true) +
          '</div>' +
        '</div>' +

        '<!-- 2. Карта объекта -->' +
        '<div class="card p">' +
          '<div class="sec-title" style="margin-bottom:.4rem;display:flex;justify-content:space-between;align-items:center">' +
            '<span>🗺️ Карта объекта</span>' +
            '<span style="font-size:.74rem;color:var(--text-3)">Геолокация по адресу</span>' +
          '</div>' +
          mapHtml +
        '</div>' +
      '</div>' +

      '<!-- ПРАВАЯ КОЛОНКА -->' +
      '<div style="display:flex;flex-direction:column;gap:.75rem">' +
        '<!-- 1. Команда, Сроки и Регламент -->' +
        '<div class="card p">' +
          '<div class="sec-title" style="margin-bottom:.5rem;display:flex;justify-content:space-between;align-items:center">' +
            '<span>👥 Команда, Сроки и Регламент</span>' +
            '<span class="badge b-blue" style="font-size:.72rem">Контроль процесса</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px">' +
            field('Статус заявки', 'status', null, true) +
            field('Приоритет', 'priority', 'select', true) +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px">' +
            field('Проект-менеджер (ПМ)', 'assignee', 'select', true) +
            (isWorker ? '' : field('Ответственное лицо (Заказчик)', 'manager', 'text', true)) +
          '</div>' +
          '<div style="margin-bottom:6px">' +
            field('Субподрядчик (наш)', 'contractor', 'text', true) +
            renderContrPhoneHtml(true) +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px">' +
            field('Дата распределения', 'distributedAt', 'date', true) +
            field('Дедлайн Заказчика (план)', 'deadline', 'date', true) +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px">' +
            field('Дата выхода', 'dataVyhoda', 'date', true) +
            field('Приёмка (фото)', 'priemka', 'text', true) +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px">' +
            field('Обследование', 'obsledovanie', 'text', true) +
            field('Доступ', 'dostup', 'text', true) +
          '</div>' +
          (isWorker ? '' : 
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;padding-top:6px;border-top:1px dashed var(--border)">' +
              field('Внутренний комментарий', 'comment', 'textarea', true) +
              field('Комментарий Заказчика', 'excelComment', 'textarea', true) +
            '</div>' +
            rawExtraRows
          ) +
          (t.status === 'cancelled'
            ? '<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border)"><span class="badge b-red" style="padding:4px 8px;font-weight:700">🚫 Заявка отменена' + (t.overdueReason ? ': ' + escHtml(t.overdueReason) : '') + '</span></div>'
            : (!isLocked
                ? '<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">' +
                    '<span style="font-size:.74rem;color:var(--text-3)">Если работы невозможны:</span>' +
                    '<button type="button" class="btn btn-sm btn-ghost" style="color:var(--red);border-color:rgba(239,68,68,0.3);font-size:.74rem;padding:2px 7px" onclick="cancelTaskPrompt(\'' + eid + '\')" title="Отменить заявку с указанием причины">🚫 Отменить заявку</button>' +
                  '</div>'
                : '')) +
        '</div>' +

        '<!-- 2. Параметры заказа по договору (Вход) -->' +
        customerInflowCard +

        '<!-- 3. Data Lineage -->' +
        (isWorker ? '' : '<div class="card p" style="background:#f8fafc;border:1.5px solid var(--border)">' +
          '<div class="sec-title" style="margin-bottom:.3rem;display:flex;align-items:center;gap:6px">📌 Происхождение заявки (Data Lineage)</div>' +
          '<div style="display:flex;flex-direction:column;gap:4px;font-size:.76rem">' +
            '<div style="display:flex;justify-content:space-between"><span>Поступила в систему:</span><b style="color:var(--blue)">' + (t.firstImportedAt ? new Date(t.firstImportedAt).toLocaleString('ru-RU') : (t.dateZayavki ? t.dateZayavki.slice(0,10).split('-').reverse().join('.') : '—')) + '</b></div>' +
            '<div style="display:flex;justify-content:space-between"><span>Исходный реестр:</span><b style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escHtml(t.importSource || t.sheet || '') + '">' + escHtml(t.importSource || t.sheet || 'Excel-импорт') + '</b></div>' +
            (t.dateZayavki ? '<div style="display:flex;justify-content:space-between"><span>Дата по Заказчику:</span><b>' + t.dateZayavki.slice(0,10).split('-').reverse().join('.') + '</b></div>' : '') +
          '</div>' +
        '</div>') +
      '</div>' +
    '</div>' +
  '</div>';

  var itemsBlock = '<div class="card p" style="margin-bottom:1rem;border:1.5px solid var(--border)">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:.75rem">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="sec-title" style="margin:0;font-size:1.05rem">📦 Состав работ и спецификация</div>' +
        '<span id="cardItemsCountBadge" class="badge b-gray" style="font-size:.74rem">0 позиций</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px">' +
        (!isLocked && S.user && ['admin','director','manager','to_engineer'].includes(String(S.user.role||'').toLowerCase())
          ? ('<label class="btn btn-sm btn-ghost" style="cursor:pointer" title="Загрузить спецификацию материалов из Excel">' +
               '📥 Загрузить из Excel' +
               '<input type="file" accept=".xlsx,.xls" style="display:none" onchange="uploadMaterialsExcel(this.files[0], \'' + eid + '\')">' +
             '</label>' +
             '<button class="btn btn-sm btn-primary" onclick="openAddItemModal(\'' + eid + '\')">+ Добавить работу / ТМЦ</button>')
          : '') +
      '</div>' +
    '</div>' +
    '<div id="cardItemsSummaryBar" style="display:flex;gap:16px;background:var(--bg);padding:8px 12px;border-radius:6px;margin-bottom:.75rem;font-size:.8rem;flex-wrap:wrap;align-items:center">' +
      '<div>Сумма Заказчика (вход): <b id="cardSummaryCust" style="color:var(--text)">0 ₽</b></div>' +
      '<div>Сумма подрядчикам: <b id="cardSummaryCont" style="color:var(--text-2)">0 ₽</b></div>' +
      '<div>Плановая маржа: <b id="cardSummaryMargin" style="color:var(--green)">0 ₽</b></div>' +
    '</div>' +
    '<div id="taskItemsList" class="t3">Загрузка позиций…</div>' +
    '<div id="cardContractorOrdersBar" style="margin-top:.75rem;display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:.78rem"></div>' +
  '</div>';

  var materialsBlock = '<div class="card p" id="cardMaterialsBlock" style="margin-top:1rem">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:.5rem">' +
      '<div class="sec-title" style="margin:0">📦 Материалы и Чек-лист СКС</div>' +
      '<div style="display:flex;gap:.4rem;align-items:center">' +
        '<label class="btn btn-sm btn-ghost" style="cursor:pointer" title="Загрузить чек-лист / ведомость Заказчика в формате PDF">' +
          '📥 Загрузить PDF (чек-лист/ведомость)' +
          '<input type="file" accept=".pdf" style="display:none" onchange="uploadChecklistPdf(this.files[0], \'' + eid + '\')">' +
        '</label>' +
        '<button class="btn btn-sm btn-ghost" onclick="recalculateTaskMaterials(\'' + eid + '\')" title="Пересчитать плановые нормы по типовику и объему заявки">🔄 Пересчитать по нормам</button>' +
      '</div>' +
    '</div>' +
    '<div id="cardMaterialsContainer" class="t3">Загрузка материалов…</div>' +
  '</div>';

  var subcontractsBlock = '<div class="card p" style="margin-bottom:1rem;border:1.5px solid var(--border)">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:.75rem">' +
      '<div>' +
        '<div class="sec-title" style="margin:0;font-size:1.05rem">🤝 Исходящие поручения субподрядчикам</div>' +
        '<div style="font-size:.78rem;color:var(--text-3);margin-top:2px">Назначение подрядчиков (СКС, ВОЛС, ПНР), формирование Заказ-нарядов и Писем на допуск</div>' +
      '</div>' +
      (!isLocked ? '<button class="btn btn-sm btn-primary" onclick="openSubcontractWizardModal(\'' + eid + '\')">🪄 Мастер назначения субподряда</button>' : '') +
    '</div>' +
    '<div id="cardSubcontractsContainer" class="t3">Загрузка субподрядов…</div>' +
    (function() {
      var isManager = S.user && ['admin', 'director', 'manager', 'to_engineer'].includes(String(S.user.role||'').toLowerCase());
      var smrSt = t.status_smr || 'in_progress';

      if (smrSt === 'done') {
        return '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<span class="badge b-green" style="font-size:.84rem;padding:4px 10px;font-weight:600">✅ СМР приняты куратором</span>' +
            '<span class="t3" style="font-size:.78rem">Выплата монтажникам разрешена</span>' +
          '</div>' +
          (isManager ? '<button class="btn btn-sm btn-ghost" style="color:var(--text-3);font-size:.74rem" onclick="rejectSmr(\''+eid+'\')" title="Отозвать приёмку и вернуть на проверку">↩️ Отозвать приёмку</button>' : '') +
        '</div>';
      }

      if (smrSt === 'review') {
        if (isWorker) {
          return '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);text-align:right">' +
            '<span class="badge b-blue" style="font-size:.84rem;padding:4px 10px">⏳ СМР сданы куратору (ожидают проверки)</span>' +
          '</div>';
        }
        return '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
          '<div>' +
            '<span class="badge b-blue" style="font-size:.8rem;padding:3px 8px;font-weight:600">Монтажник сдал СМР</span>' +
            '<span class="t3" style="font-size:.76rem;margin-left:6px">Проверьте фотоотчёт</span>' +
          '</div>' +
          '<div style="display:flex;gap:6px">' +
            '<button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="rejectSmr(\''+eid+'\')">↩️ На доработку</button>' +
            '<button class="btn btn-sm btn-primary" onclick="acceptSmr(\''+eid+'\')">🤝 Принять СМР (разрешить оплату)</button>' +
          '</div>' +
        '</div>';
      }

      // in_progress (монтаж идет)
      if (isWorker) {
        return '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);text-align:right">' +
          '<button class="btn btn-sm btn-primary" onclick="submitSmr(\''+eid+'\')">🔧 Завершить СМР (сдать куратору)</button>' +
        '</div>';
      }
      return '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:6px">' +
        '<button class="btn btn-sm btn-ghost" onclick="submitSmr(\''+eid+'\')" title="Отметить готовность монтажа">🔧 Завершить СМР</button>' +
        '<button class="btn btn-sm btn-primary" onclick="acceptSmr(\''+eid+'\')" title="Принять СМР сразу и разрешить оплату">🤝 Принять СМР (разрешить оплату)</button>' +
      '</div>';
    })() +
  '</div>';

  var smrClosingBlock = (function() {
    var rawDate = t.smrActualEndDate || t.smr_actual_end_date || '';
    var formattedDate = rawDate ? String(rawDate).slice(0, 10) : '';
    var curStage = Number(t.stage_num !== undefined ? t.stage_num : t.stageNum) || 0;
    var stageTitle = (ID_STAGES[curStage] && ID_STAGES[curStage].name) || ('Этап ' + curStage);

    return '<div class="card p mb" id="smrClosingBlock" style="border:1.5px solid var(--border);border-radius:8px;background:var(--surface,#fff);margin-bottom:1rem">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;padding-bottom:.5rem;border-bottom:1.5px solid var(--border);flex-wrap:wrap;gap:8px">' +
        '<div>' +
          '<div class="sec-title" style="margin:0;font-size:1.05rem;display:flex;align-items:center;gap:6px">' +
            '<span>🏁 Закрытие СМР и сдача объекта</span>' +
          '</div>' +
          '<div style="font-size:.78rem;color:var(--text-3);margin-top:2px">' +
            'Фиксация факта монтажа, кабельный журнал (КЖ), результаты прозвонки портов и сдача в проектный отдел' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          (curStage < 3
            ? '<button type="button" class="btn btn-sm btn-primary" onclick="window._takeTaskToStage(\'' + eid + '\', 3)" style="font-weight:700">🏁 Перевести в «Закрытие СМР»</button>'
            : '<span class="badge b-green" style="font-size:.75rem;padding:4px 8px">✓ Этап: ' + escHtml(stageTitle) + '</span>'
          ) +
        '</div>' +
      '</div>' +
      '<div id="smrChecklistContainer" style="margin-bottom:1rem"></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:12px;margin-bottom:1rem;background:var(--bg,#f8fafc);padding:10px 12px;border-radius:6px;border:1px solid var(--border)">' +
        '<div>' +
          '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:4px">📅 Фактическая дата завершения СМР:</label>' +
          '<input type="date" class="inp" id="cardSmrActualEndDate" value="' + escHtml(formattedDate) + '" onchange="updateField(\'' + eid + '\', \'smrActualEndDate\', this.value)" style="padding:4px 8px;font-size:.84rem;width:100%">' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:4px">🔌 Фактически смонтировано (портов):</label>' +
          '<input type="number" class="inp" min="0" value="' + (t.fact != null ? t.fact : (t.inOrder || 0)) + '" onchange="updateField(\'' + eid + '\', \'fact\', this.value)" style="padding:4px 8px;font-size:.84rem;width:100%">' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:4px">📋 Статус монтажных работ:</label>' +
          '<select class="inp" onchange="updateField(\'' + eid + '\', \'statusSmr\', this.value)" style="padding:4px 8px;font-size:.84rem;width:100%">' +
            '<option value="in_progress"' + (t.statusSmr === 'in_progress' ? ' selected' : '') + '>🔧 В процессе монтажа</option>' +
            '<option value="done"' + (t.statusSmr === 'done' || curStage >= 2 ? ' selected' : '') + '>✅ СМР полностью завершены</option>' +
            '<option value="issues"' + (t.statusSmr === 'issues' ? ' selected' : '') + '>⚠️ Есть замечания / доработки</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div id="portsBlock">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;flex-wrap:wrap;gap:8px">' +
          '<div class="sec-title" style="margin:0;font-size:.95rem;display:flex;align-items:center;gap:6px">' +
            '<span>📊 КЖ / Кабельный журнал и протокол измерений портов</span>' +
            '<span id="portsCountBadge" class="badge b-gray" style="font-size:.72rem">0 портов</span>' +
          '</div>' +
          '<div style="display:flex;gap:6px;align-items:center">' +
            '<label class="btn btn-sm btn-ghost" style="cursor:pointer" title="Загрузить кабельный журнал из Excel">' +
              '📥 Загрузить КЖ из Excel' +
              '<input type="file" accept=".xlsx,.xls" style="display:none" onchange="uploadCableJournalExcel(this.files[0], \'' + eid + '\')">' +
            '</label>' +
            '<button type="button" class="btn btn-sm btn-primary" onclick="addPortRow(\'' + eid + '\')">+ Добавить порт</button>' +
          '</div>' +
        '</div>' +
        '<div id="portsList" class="t3">Загрузка…</div>' +
      '</div>' +
    '</div>';
  })();

  var paneItems = '<div id="cardTabPane-items" class="card-tab-pane" style="display:' + (curTab === 'items' ? 'block' : 'none') + '">' +
    '<div id="cardSmrCalculatorBlock" style="margin-bottom:1rem"></div>' +
    '<div id="cardSubcontractsContainer" style="display:none"></div>' +
    smrClosingBlock +
    '<div class="card p mb" id="attachmentsBlock">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
        '<div class="sec-title" style="margin:0;font-size:1rem;display:flex;align-items:center;gap:6px">📷 Файлы и фотоотчёты к заявке (ТЗ, схемы, чек-листы)</div>' +
      '</div>' +
      '<div id="attachmentsList" class="t3">Загрузка…</div>' +
      '<div style="display:flex;gap:.4rem;margin-top:.8rem;flex-wrap:wrap">' +
        '<label class="btn btn-sm btn-ghost">📷 Фото<input type="file" multiple accept="image/*" style="display:none" onchange="handleAttachmentUpload(\''+t.id+'\',\'photo_report\',this.files)"></label>' +
        '<label class="btn btn-sm btn-ghost">🗺️ Схема<input type="file" multiple accept="image/*,.pdf,.dwg" style="display:none" onchange="handleAttachmentUpload(\''+t.id+'\',\'scheme\',this.files)"></label>' +
        '<label class="btn btn-sm btn-ghost">📋 Чек-лист<input type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.docx" style="display:none" onchange="handleAttachmentUpload(\''+t.id+'\',\'checklist\',this.files)"></label>' +
      '</div>' +
    '</div>' +
  '</div>';

  var paneSupply = '<div id="cardTabPane-supply" class="card-tab-pane" style="display:' + (curTab === 'supply' ? 'block' : 'none') + '">' +
    itemsBlock +
    materialsBlock +
  '</div>';

  var remarksBadge = Number(t.openRemarksCount || 0) > 0
    ? '<span class="badge b-red" style="font-size:11px;padding:2px 7px;margin-left:6px">⚠️ ' + t.openRemarksCount + ' открыто</span>'
    : '<span class="badge b-green" style="font-size:11px;padding:2px 7px;margin-left:6px">✓ Нет замечаний</span>';

  var remarksBlock = '<div class="card p" id="remarksBlock">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
      '<div class="sec-title" style="margin:0;display:flex;align-items:center">Замечания Заказчика ' + remarksBadge + '</div>' +
      '<button class="btn btn-sm btn-ghost" onclick="addRemarkPrompt(\'' + eid + '\')">+ Замечание</button>' +
    '</div>' +
    '<div id="remarksList" class="t3">Загрузка…</div>' +
  '</div>';

  var paneRemarks = '<div id="cardTabPane-remarks" class="card-tab-pane" style="display:' + (curTab === 'remarks' ? 'block' : 'none') + '">' +
    remarksBlock +
  '</div>';

  var docsRegistryBlock = '<div class="card p mb" style="border:1.5px solid var(--border)">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:.75rem">' +
      '<div>' +
        '<div class="sec-title" style="margin:0;font-size:1.05rem">📑 Реестр документов по заявке</div>' +
        '<div style="font-size:.78rem;color:var(--text-3);margin-top:2px">Управленческий учет: Заявка (Прил. №2), Акты выполненных работ, Счета, Отчеты монтажника (ТМЦ), Допуски на объект и Альбом ИД</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn-sm btn-primary" onclick="generateTaskDoc(\'' + eid + '\', \'order_subcontract\')" title="Заявка (Заказ на работы) — неотъемлемая часть договора субподряда">📄 Заявка (Прил. №2)</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="generateTaskDoc(\'' + eid + '\', \'completion_act\')" title="Акт выполненных работ к заказу на работы («Сдал/Принял»)">🤝 Акт вып. работ</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="generateTaskDoc(\'' + eid + '\', \'invoice\')" title="Сформировать счёт на оплату">💰 Счёт</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="generateTaskDoc(\'' + eid + '\', \'tmc_act\')" title="Отчет монтажника по израсходованным материалам (Акт ТМЦ)">📦 Отчет монтажника (ТМЦ)</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="generateTaskDoc(\'' + eid + '\', \'id_registry\')" title="Альбом исполнительной документации СКС">📑 Альбом ИД</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="openAccessLetterModal(\'' + eid + '\')" title="Допуск на объект: Письмо на допуск, Заказ-наряд или Наряд-допуск" style="border:1px solid #fed7aa;background:#fff7ed;color:#c2410c;font-weight:700">🪪 Допуск на объект ▾</button>' +
        '<button type="button" class="btn btn-sm btn-outline" onclick="openUploadTaskDocModal(\'' + eid + '\')" title="Учесть входящий счет, акт выполненных работ или скан от контрагента" style="font-weight:700;border:1.5px dashed var(--blue);color:var(--blue)">📎 Учесть Счет / Акт контрагента</button>' +
      '</div>' +
    '</div>' +
    '<div id="cardDocumentsContainer" class="t3">Загрузка документов…</div>' +
    '<div style="margin-top:10px;text-align:right;">' +
      (t.status_id !== 'review' && t.status_id !== 'done' ? '<button class="btn btn-sm btn-primary" onclick="submitIdReview(\''+eid+'\')">📤 Отправить ИД на проверку</button>' : '<span class="badge b-blue">ИД отправлена</span>') +
    '</div>' +
  '</div>';

  var paneFiles = '<div id="cardTabPane-files" class="card-tab-pane" style="display:' + ((curTab === 'files' || curTab === 'docs') ? 'block' : 'none') + '">' +
    docsRegistryBlock +
    remarksBlock +
    '<div class="card p mb">' +
      '<div class="sec-title" style="margin-bottom:.5rem">Облачные ссылки на документацию</div>' +
      field('Ссылка на материалы (исходники)', 'materialsLink', 'url') +
      field('Ссылка на готовую ИД (альбом)', 'idLink', 'url') +
      (isWorker ? '' : field('Ссылка на тех.инфо', 'techLink', 'url')) +
      (isWorker ? '' : field('Заказ подписан на портале поставщика', 'supplierOrderSigned', 'checkbox') +
      field('ИД загружена на портал поставщика', 'supplierIdUploaded', 'checkbox')) +
    '</div>' +
    '<div class="card p mb">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
        '<div class="sec-title" style="margin:0">Акты и финансовые документы</div>' +
      '</div>' +
      '<div style="display:flex;gap:.4rem;margin-top:.8rem;flex-wrap:wrap">' +
        '<label class="btn btn-sm btn-ghost">📄 Акт<input type="file" accept="image/*,.pdf" style="display:none" onchange="handleAttachmentUpload(\''+t.id+'\',\'act\',this.files)"></label>' +
        '<label class="btn btn-sm btn-ghost">🧾 Чек<input type="file" accept="image/*,.pdf" style="display:none" onchange="handleAttachmentUpload(\''+t.id+'\',\'receipt\',this.files)"></label>' +
        '<label class="btn btn-sm btn-ghost">📊 Excel ПИ<input type="file" accept=".xlsx,.xls" style="display:none" onchange="handleAttachmentUpload(\''+t.id+'\',\'pi_excel\',this.files)"></label>' +
      '</div>' +
    '</div>' +
  '</div>';

  var paneFinance = (function() {
    var curC = (S.contracts || []).find(function(x){ 
      var cid = (t.contract_id != null ? t.contract_id : t.contractId) || curContractId;
      return String(x.id) === String(cid); 
    });
    var curContractTitle = curC
      ? ((curC.contract_number ? ('Договор № ' + escHtml(curC.contract_number)) : ('Контракт #' + curC.id)) +
         (curC.internal_number ? (' · Вн. ' + escHtml(curC.internal_number)) : '') +
         ' с ' + escHtml(curC.customer_name || 'Заказчиком'))
      : 'Генеральный контракт не привязан';

    var amountVal = parseFloat(t.amount) || 0;
    var distanceVal = parseFloat(t.distanceKm) || 0;
    var extrasVal = parseFloat(t.extras) || 0;
    var tmcVal = parseFloat(t.tmc) || 0;
    var inOrderVal = parseFloat(t.inOrder) || 0;
    var factVal = parseFloat(t.fact) || 0;
    var isFactKnown = factVal > 0;
    var effectivePorts = isFactKnown ? factVal : (inOrderVal > 0 ? inOrderVal : (parseFloat(t.ports) || 1));

    // Расчет ставки за ед. по формуле Алексея: =(сумма - транспорт) / портов
    var calcUnitRate = (inOrderVal > 0) ? Math.round((amountVal - distanceVal) / inOrderVal) : 0;
    var calculatedUnitRateStr = calcUnitRate > 0 ? (calcUnitRate.toLocaleString('ru-RU') + ' ₽ / ед.') : '—';

    var totalCustomerAmount = getTaskFinance(t).total;
    if (totalCustomerAmount === 0 && amountVal > 0) totalCustomerAmount = amountVal;

    // Сопутствующие затраты (ДОПы + ТК) из t.rawData.extraExpensesList
    var extraExpenses = (t.rawData && Array.isArray(t.rawData.extraExpensesList)) ? t.rawData.extraExpensesList : [];
    var dopExpenses = extraExpenses.filter(function(x){ return x.category === 'dop'; });
    var transportExpenses = extraExpenses.filter(function(x){ return x.category === 'transport'; });

    var dopSubcontract = dopExpenses.filter(function(x){ return x.payer_mode === 'through_contractor'; }).reduce(function(a, b){ return a + (Number(b.amount) || 0); }, 0);
    var dopDirect = dopExpenses.filter(function(x){ return x.payer_mode === 'direct_third_party'; }).reduce(function(a, b){ return a + (Number(b.amount) || 0); }, 0);
    var costDopsTotal = (extraExpenses.length > 0 || dopExpenses.length > 0) ? (dopSubcontract + dopDirect) : extrasVal;

    var transportSubcontract = transportExpenses.filter(function(x){ return x.payer_mode === 'through_contractor'; }).reduce(function(a, b){ return a + (Number(b.amount) || 0); }, 0);
    var transportDirect = transportExpenses.filter(function(x){ return x.payer_mode === 'direct_third_party'; }).reduce(function(a, b){ return a + (Number(b.amount) || 0); }, 0);
    var costTransportTotal = (extraExpenses.length > 0 || transportExpenses.length > 0) ? (transportSubcontract + transportDirect) : distanceVal;

    // Субподрядчик
    var taskContr = (t.contractor || '').trim();
    var curSub = (window._curCardSubcontracts || [])[0] || null;

    var subTitle = taskContr
      ? ('🏢 ' + escHtml(taskContr) + (curSub && curSub.deadline ? (' · Дедлайн: ' + curSub.deadline.slice(0, 10).split('-').reverse().join('.')) : ''))
      : 'Подрядчик пока не выбран';

    // Формула Алексея для субподряда: Сумма = (ед * факт + уд + доп)
    var subRate = (t.rawData && t.rawData.subRate != null) ? Number(t.rawData.subRate) : (curSub && curSub.price_agreed && effectivePorts > 0 ? Math.round(curSub.price_agreed / effectivePorts) : 500);
    var subDist = (t.rawData && t.rawData.subDist != null) 
      ? Number(t.rawData.subDist) 
      : (transportSubcontract > 0 ? transportSubcontract : (distanceVal > 0 ? Math.round(distanceVal * 0.5) : 0));
    var subExtras = (t.rawData && t.rawData.subExtras != null) 
      ? Number(t.rawData.subExtras) 
      : (dopSubcontract > 0 ? dopSubcontract : 0);

    var subWorkCost = Math.round(subRate * effectivePorts);
    var calculatedSubTotal = curSub && curSub.price_agreed > 0
      ? Number(curSub.price_agreed)
      : (subWorkCost + subDist + subExtras);

    // Налоговый режим собственного юрлица (К10: 0% УСН, КС: 5% УСН с НДС, Ультима: 22% ОСНО)
    var curOwnId = Number(t.own_company_id || (S.cardDraft && S.cardDraft.own_company_id)) || (isSber ? 2 : 1);
    var ownComp = (S.ownCompanies || []).find(function(c){ return Number(c.id) === curOwnId; }) || 
      (S.ownCompanies || []).find(function(c){ return c.code === (isSber ? 'K10' : 'KS'); }) || 
      { id: 2, code: 'K10', name_short: 'ООО «К10»', tax_system: 'УСН (без НДС)', vat_rate: 0 };

    var vatRate = Number(ownComp.vat_rate) || 0;
    var vatAmount = vatRate > 0 ? Math.round(totalCustomerAmount * (vatRate / (100 + vatRate))) : 0;

    // 5 статей затрат + налог НДС
    var costMaterials = tmcVal;
    var totalCost = subWorkCost + costMaterials + costDopsTotal + costTransportTotal + vatAmount;
    var operatingMargin = totalCustomerAmount - totalCost;
    var marginPercent = totalCustomerAmount > 0 ? Math.round((operatingMargin / totalCustomerAmount) * 1000) / 10 : 0;

    // Реестр выплат субподрядчику
    var payments = (t._payments || (t.rawData && t.rawData.subPayments) || []);
    var totalPaid = payments.reduce(function(acc, p){ return acc + (Number(p.amount) || 0); }, 0);
    var remainingToPay = Math.max(0, calculatedSubTotal - totalPaid);
    var remainingColor = (remainingToPay === 0 && calculatedSubTotal > 0) ? 'var(--green)' : 'var(--orange-dark)';

    var paymentsListHtml = payments.length ? payments.map(function(p, pIdx) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);padding:6px 8px;border-radius:4px;margin-bottom:4px;font-size:.78rem">' +
        '<div>' +
          '<b>' + fmtMoney(p.amount) + '</b> <span class="t3">(' + (p.date || '—') + ')</span>' +
          '<div style="font-size:.72rem;color:var(--text-3)">' + escHtml(p.note || 'Выплата по заказ-наряду') + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="removeSubPayment(\'' + eid + '\', ' + pIdx + ')" style="color:var(--red);padding:1px 5px;font-size:.72rem">✕</button>' +
      '</div>';
    }).join('') : '<div class="t3" style="font-size:.76rem;padding:4px 0">Выплат подрядчику пока не зафиксировано</div>';

    // Список сопутствующих расходов
    var expensesListHtml = extraExpenses.length ? extraExpenses.map(function(exp, idx) {
      var isDop = exp.category === 'dop';
      var catBadge = isDop 
        ? '<span class="badge" style="background:#ffedd5;color:#9a3412;font-size:.7rem;font-weight:600">🛠️ ДОПы</span>'
        : '<span class="badge" style="background:#e0f2fe;color:#0369a1;font-size:.7rem;font-weight:600">🚚 ТК/Транспорт</span>';
      
      var isThroughSub = exp.payer_mode === 'through_contractor';
      var payerBadge = isThroughSub
        ? '<span class="badge b-green" style="font-size:.68rem" title="В смету субподрядчику (компенсация)">👷 В смету монтажнику</span>'
        : '<span class="badge b-blue" style="font-size:.68rem" title="Напрямую третьему лицу / ТК (прямой расход Генподрядчика)">🏢 Напрямую 3-му лицу</span>';

      return '<div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);padding:6px 10px;border-radius:6px;margin-bottom:6px;font-size:.78rem;border:1px solid var(--border)">' +
        '<div style="flex:1;min-width:0;padding-right:8px">' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
            catBadge +
            payerBadge +
            '<b style="color:var(--text)">' + escHtml(exp.title || 'Расход') + '</b>' +
            (exp.date ? ('<span class="t3" style="font-size:.7rem">(' + exp.date + ')</span>') : '') +
          '</div>' +
          (exp.comment ? ('<div style="font-size:.71rem;color:var(--text-3);margin-top:2px">' + escHtml(exp.comment) + '</div>') : '') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-weight:700;font-size:.88rem;color:var(--text)">' + fmtMoney(exp.amount) + '</span>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="window._removeExtraExpense(\'' + eid + '\', ' + idx + ')" style="color:var(--red);padding:2px 6px;font-size:.72rem" title="Удалить расход">✕</button>' +
        '</div>' +
      '</div>';
    }).join('') : '<div style="background:var(--bg);padding:8px 10px;border-radius:6px;border:1px dashed var(--border);font-size:.76rem;color:var(--text-3);margin-bottom:8px">Позиции сопутствующих расходов еще не добавлены. Базовые значения из заявки: ДОПы — <b>' + fmtMoney(extrasVal) + '</b>, Транспорт/ТК — <b>' + fmtMoney(distanceVal) + '</b>. Нажмите «+ Добавить расход» для детализации.</div>';

    return '<div id="cardTabPane-finance" class="card-tab-pane" style="display:' + ((curTab === 'finance' || curTab === 'fin') ? 'block' : 'none') + '">' +
      '<div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:1.25rem;align-items:start">' +

        // ЛЕВАЯ КОЛОНКА: ВХОД (ЗАКАЗЧИК)
        '<div style="display:flex;flex-direction:column;gap:1rem">' +
          '<div style="font-weight:700;font-size:.86rem;color:var(--blue);display:flex;align-items:center;gap:6px;background:#eff6ff;padding:6px 10px;border-radius:6px;border:1px solid #bfdbfe">' +
            '<span>📥</span> ВХОД: ДОГОВОР И ЗАКАЗЧИК' +
          '</div>' +

          '<div class="card p">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem">' +
              '<div>' +
                '<div class="sec-title" style="margin:0">Финансовые показатели контракта</div>' +
                '<div style="font-size:.76rem;color:var(--text-3);margin-top:2px">' + curContractTitle + '</div>' +
              '</div>' +
              (curC ? '<button type="button" class="btn btn-sm btn-ghost" onclick="openContractModal(' + curC.id + ')" style="font-size:.74rem">👁️ Договор</button>' : '') +
            '</div>' +

            field('Сумма договора', 'amount', 'number') +

            '<div class="field-row">' +
              '<div class="field-lbl">Стоимость за ед.</div>' +
              '<div class="field-val" style="display:flex;align-items:center;justify-content:space-between">' +
                '<span style="font-weight:700;color:var(--blue);font-size:.92rem">' + calculatedUnitRateStr + '</span>' +
                '<span class="t3" style="font-size:.7rem;opacity:.7">=(Сумма - Транспорт) / Порты</span>' +
              '</div>' +
            '</div>' +

            field('Транспорт / Удалёнка (₽)', 'distanceKm', 'number') +
            field('Доп. расходы (₽)', 'extras', 'number') +
            field('ТМЦ — Материалы (₽)', 'tmc', 'number') +

            '<div class="field-row" style="background:#f0fdf4;padding:8px 10px;border-radius:6px;border:1px solid #bbf7d0;margin-top:6px">' +
              '<div class="field-lbl" style="font-weight:700;color:#166534">ИТОГО от Заказчика</div>' +
              '<div class="field-val" style="display:flex;align-items:center;justify-content:space-between">' +
                '<span style="font-weight:800;font-size:1.15rem;color:#15803d">' + fmtMoney(totalCustomerAmount) + '</span>' +
                (totalCustomerAmount > 0 ? '<span class="badge b-green" style="font-size:.7rem">✓ Смета согласована</span>' : '') +
              '</div>' +
            '</div>' +
            (isFactKnown && inOrderVal > 0 && factVal !== inOrderVal
              ? '<div style="margin-top:6px;padding:5px 8px;border-radius:4px;background:#fffbeb;border:1px solid #fde68a;font-size:.73rem;color:#92400e;line-height:1.3">' +
                  '⚠️ <b>Внимание:</b> факт портов (' + factVal + ' шт.) отличается от заказа (' + inOrderVal + ' шт.). Требуется перерасчет сметы.' +
                '</div>'
              : ''
            ) +

            '<div class="divider"></div>' +
            '<div style="font-weight:700;font-size:.82rem;color:var(--text-2);margin-bottom:8px">Объемы выполнения:</div>' +
            field('В заказе (портов)', 'inOrder', 'number') +
            field('Факт выполненных портов', 'fact', 'number') +
            field('Оплата подрядчику (план)', 'oplata') +
          '</div>' +

          '<div class="card p">' +
            '<div class="sec-title" style="margin-bottom:.5rem">Счета и ЭДО с Заказчиком</div>' +
            field('№ документа в ЭДО', 'edoNumber') +
            field('№ счёта / сумма', 'invoiceInfo') +
            field('Статус в ЭДО', 'vedoStatus') +
            '<div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap">' +
              '<button class="btn btn-sm btn-primary" onclick="exportDoc(\'invoice\',\'' + eid + '\')">📄 Выгрузить Счёт</button>' +
              '<button class="btn btn-sm btn-ghost" onclick="exportDoc(\'act\',\'' + eid + '\')">✔ Выгрузить Акт (КС-2)</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // ПРАВАЯ КОЛОНКА: ВЫХОД (СЕБЕСТОИМОСТЬ: 5 СТАТЕЙ ЗАТРАТ + НАЛОГИ)
        '<div style="display:flex;flex-direction:column;gap:1rem">' +
          '<div style="font-weight:700;font-size:.86rem;color:var(--orange-dark);display:flex;align-items:center;gap:6px;background:#fffbeb;padding:6px 10px;border-radius:6px;border:1px solid #fde68a">' +
            '<span>📤</span> ВЫХОД: СЕБЕСТОИМОСТЬ (5 СТАТЕЙ ЗАТРАТ + НАЛОГИ)' +
          '</div>' +

          // КАРТОЧКА 1: ТМЦ
          '<div class="card p">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">' +
              '<div>' +
                '<div class="sec-title" style="margin:0">Статья 3: ТМЦ (Материалы со склада)</div>' +
                '<div style="font-size:.76rem;color:var(--text-3)">Списание со склада и факт расхода на объекте</div>' +
              '</div>' +
              '<button type="button" class="btn btn-sm btn-ghost" onclick="setCardTab(\'supply\')" style="font-size:.74rem">📦 На склад →</button>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">' +
              '<div style="background:var(--bg);padding:8px 10px;border-radius:6px">' +
                '<div class="t3" style="font-size:.72rem">Стоимость материалов (ТМЦ)</div>' +
                '<div style="font-weight:700;font-size:1rem;color:var(--text);margin-top:2px">' + fmtMoney(tmcVal) + '</div>' +
              '</div>' +
              '<div style="background:var(--bg);padding:8px 10px;border-radius:6px">' +
                '<div class="t3" style="font-size:.72rem">Статус списания ТМЦ</div>' +
                '<div style="font-weight:700;font-size:.85rem;color:var(--green);margin-top:4px">' + (tmcVal > 0 ? '✓ Списано по акту' : 'По нормативу портов') + '</div>' +
              '</div>' +
            '</div>' +

            '<div style="font-size:.8rem;color:var(--text-2);border-top:1px dashed var(--border);padding-top:8px">' +
              '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
                '<span>Кабель UTP Cat.5e, патч-панели, розетки, органайзеры</span>' +
                '<b>' + fmtMoney(tmcVal) + '</b>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // КАРТОЧКА 2: СОПУТСТВУЮЩИЕ ЗАТРАТЫ (ДОПЫ + ТК)
          '<div class="card p">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem">' +
              '<div>' +
                '<div class="sec-title" style="margin:0">Сопутствующие затраты (ДОПы + ТК)</div>' +
                '<div style="font-size:.76rem;color:var(--text-3);margin-top:2px">Спецработы, бурение, вышка, доставка ТК, выезды бригад</div>' +
              '</div>' +
              '<button type="button" class="btn btn-sm btn-primary" onclick="window._openAddExtraExpense(\'' + eid + '\')" style="font-size:.74rem">+ Добавить расход</button>' +
            '</div>' +

            expensesListHtml +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:var(--bg);padding:8px 10px;border-radius:6px;border:1px solid var(--border);margin-top:8px;font-size:.78rem">' +
              '<div>' +
                '<div class="t3" style="font-size:.71rem;display:flex;align-items:center;gap:4px">🛠️ <b>Статья 4 (ДОПы):</b> ' + fmtMoney(costDopsTotal) + '</div>' +
                '<div style="font-size:.71rem;color:var(--text-3);margin-top:2px">В смету монтажнику: ' + fmtMoney(dopSubcontract) + ' · 3-м лицам: ' + fmtMoney(dopDirect) + '</div>' +
              '</div>' +
              '<div>' +
                '<div class="t3" style="font-size:.71rem;display:flex;align-items:center;gap:4px">🚚 <b>Статья 5 (ТК/Транспорт):</b> ' + fmtMoney(costTransportTotal) + '</div>' +
                '<div style="font-size:.71rem;color:var(--text-3);margin-top:2px">Монтажнику: ' + fmtMoney(transportSubcontract) + ' · Прямо в ТК: ' + fmtMoney(transportDirect) + '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // КАРТОЧКА 3: РАСЧЕТ С СУБПОДРЯДЧИКОМ
          '<div class="card p">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem">' +
              '<div>' +
                '<div class="sec-title" style="margin:0">Статья 2: СМР и расчет с субподрядчиком</div>' +
                '<div style="font-size:.78rem;color:var(--text-3);margin-top:2px">' + subTitle + '</div>' +
              '</div>' +
              '<button type="button" class="btn btn-sm btn-ghost" onclick="setCardTab(\'items\')" style="font-size:.74rem">👷 В поручения →</button>' +
            '</div>' +

            // Формула Алексея
            '<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:6px;padding:8px 10px;margin-bottom:10px">' +
              '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<span style="font-size:.78rem;font-weight:700;color:#92400e">Формула: (Ставка × ' + (isFactKnown ? 'Факт' : 'В заказе') + ') + Удаленка + Доп</span>' +
                '<span style="font-size:.72rem;color:#b45309">' + (isFactKnown ? 'расчет по факту' : 'плановый расчет') + '</span>' +
              '</div>' +
              '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:4px">' +
                '<div style="font-weight:800;font-size:1.18rem;color:#b45309">' +
                  fmtMoney(calculatedSubTotal) +
                '</div>' +
                ((curSub && Number(curSub.price_agreed) > 0) ? '<span class="badge b-green" style="font-size:.72rem">📄 Из заказ-наряда</span>' : '') +
              '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.82rem;margin-bottom:10px">' +
              '<div>' +
                '<label class="t3" style="display:block;font-size:.72rem;margin-bottom:2px">Ставка за порт (₽)</label>' +
                '<input type="number" id="sub_rate_input" value="' + subRate + '" oninput="window._recalcSubFinance(\'' + eid + '\')" style="width:100%;padding:4px 8px;font-size:.82rem" placeholder="₽ / ед">' +
              '</div>' +
              '<div>' +
                '<label class="t3" style="display:block;font-size:.72rem;margin-bottom:2px">' + (isFactKnown ? 'Факт портов (из заявки)' : 'В заказе (план портов)') + '</label>' +
                '<div style="padding:5px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-weight:700;color:var(--text)">' + effectivePorts + ' шт.' + (!isFactKnown ? ' <span class="t3" style="font-weight:normal;font-size:.7rem">(факт 0)</span>' : '') + '</div>' +
              '</div>' +
              '<div>' +
                '<label class="t3" style="display:block;font-size:.72rem;margin-bottom:2px">Удалёнка подрядчика (₽)</label>' +
                '<input type="number" id="sub_distance_input" value="' + subDist + '" oninput="window._recalcSubFinance(\'' + eid + '\')" style="width:100%;padding:4px 8px;font-size:.82rem" placeholder="0">' +
              '</div>' +
              '<div>' +
                '<label class="t3" style="display:block;font-size:.72rem;margin-bottom:2px">Доп. расходы подрядчика (₽)</label>' +
                '<input type="number" id="sub_extras_input" value="' + subExtras + '" oninput="window._recalcSubFinance(\'' + eid + '\')" style="width:100%;padding:4px 8px;font-size:.82rem" placeholder="0">' +
              '</div>' +
            '</div>' +

            '<div class="divider"></div>' +

            // Реестр выплат подрядчику
            '<div style="margin-bottom:8px">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
                '<span style="font-weight:700;font-size:.8rem;color:var(--text)">Выплаты подрядчику (факт):</span>' +
                '<button type="button" class="btn btn-sm btn-ghost" onclick="window._openAddSubPayment(\'' + eid + '\')" style="font-size:.74rem;color:var(--primary);padding:2px 6px">+ Добавить выплату</button>' +
              '</div>' +
              '<div id="subcontractPaymentsList">' +
                paymentsListHtml +
              '</div>' +
            '</div>' +

            // Остаток к выплате
            '<div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);padding:8px 10px;border-radius:6px;border:1px solid var(--border);margin-top:8px">' +
              '<div>' +
                '<span style="font-size:.78rem;font-weight:600">Остаток к выплате монтажнику:</span>' +
                (remainingToPay === 0 && calculatedSubTotal > 0 && totalPaid > 0
                  ? '<div style="font-size:.72rem;color:var(--green);font-weight:700">✓ Выплачено полностью</div>'
                  : (totalPaid > 0
                      ? '<div style="font-size:.72rem;color:var(--text-3)">Оплачено ' + fmtMoney(totalPaid) + ' из ' + fmtMoney(calculatedSubTotal) + '</div>'
                      : '<div style="font-size:.72rem;color:var(--text-3)">Выплат еще не производилось</div>'
                    )
                ) +
              '</div>' +
              '<span style="font-weight:800;font-size:1.05rem;color:' + remainingColor + '">' + fmtMoney(remainingToPay) + '</span>' +
            '</div>' +

          '</div>' +

          // КАРТОЧКА 4: СКВОЗНОЙ ФИНАНСОВЫЙ БАЛАНС И 5 СТАТЕЙ ЗАТРАТ
          '<div class="card p" style="border:1.5px solid ' + (operatingMargin >= 0 ? '#bbf7d0' : '#fecaca') + ';background:' + (operatingMargin >= 0 ? '#f0fdf4' : '#fef2f2') + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem">' +
              '<div>' +
                '<div class="sec-title" style="margin:0;color:' + (operatingMargin >= 0 ? '#166534' : '#991b1b') + '">📊 Финансовый баланс объекта</div>' +
                '<div style="font-size:.76rem;color:var(--text-3);margin-top:2px">Сквозной расчет: Доход Заказчика − 5 статей затрат − Налог НДС</div>' +
              '</div>' +
              '<span class="badge ' + (operatingMargin >= 0 ? 'b-green' : 'b-red') + '" style="font-size:.76rem;font-weight:700">' +
                (operatingMargin >= 0 ? '✓ Прибыль ' + (marginPercent > 0 ? '+' : '') + marginPercent + '%' : '⚠️ Убыток ' + marginPercent + '%') +
              '</span>' +
            '</div>' +

            // Плашка налогового режима юрлица
            '<div style="background:#ffffff;padding:8px 10px;border-radius:6px;border:1px solid rgba(0,0,0,0.06);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">' +
              '<div style="display:flex;align-items:center;gap:6px">' +
                '<span style="font-size:.82rem;font-weight:700;color:var(--text)">🏛️ Юрлицо и режим:</span>' +
                '<select onchange="onCardOwnCompanyChange(this.value)" style="font-size:.76rem;font-weight:600;padding:2px 6px;border:1.5px solid var(--border);border-radius:4px;background:var(--bg)">' +
                  (S.ownCompanies || [
                    { id: 2, name_short: 'ООО «К10»', tax_system: 'УСН (без НДС)', vat_rate: 0 },
                    { id: 1, name_short: 'ООО "Кабельные Системы"', tax_system: 'УСН с НДС 5%', vat_rate: 5 },
                    { id: 3, name_short: 'ООО "Ультима"', tax_system: 'ОСНО (НДС 22%)', vat_rate: 22 }
                  ]).map(function(oc) {
                    var isSel = Number(oc.id) === Number(ownComp.id) ? ' selected' : '';
                    var taxLbl = oc.tax_system || (Number(oc.vat_rate) > 0 ? ('НДС ' + oc.vat_rate + '%') : 'без НДС');
                    return '<option value="' + oc.id + '"' + isSel + '>' + escHtml(oc.name_short) + ' · ' + escHtml(taxLbl) + '</option>';
                  }).join('') +
                '</select>' +
              '</div>' +
              '<div style="font-size:.73rem;color:var(--text-3)">' +
                (vatRate > 0 ? ('НДС ' + vatRate + '% к уплате: <b>' + fmtMoney(vatAmount) + '</b>') : '<span style="color:var(--green);font-weight:600">✓ УСН без НДС (0 ₽)</span>') +
              '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">' +
              '<div style="background:#ffffff;padding:8px 10px;border-radius:6px;border:1px solid rgba(0,0,0,0.06)">' +
                '<div class="t3" style="font-size:.72rem">Выручка от Заказчика (Вход)</div>' +
                '<div style="font-weight:800;font-size:1.08rem;color:var(--blue);margin-top:2px">' + fmtMoney(totalCustomerAmount) + '</div>' +
              '</div>' +
              '<div style="background:#ffffff;padding:8px 10px;border-radius:6px;border:1px solid rgba(0,0,0,0.06)">' +
                '<div class="t3" style="font-size:.72rem">Итого себестоимость + налог (Выход)</div>' +
                '<div style="font-weight:800;font-size:1.08rem;color:var(--text);margin-top:2px">' + fmtMoney(totalCost) + '</div>' +
              '</div>' +
            '</div>' +

            '<div style="background:#ffffff;padding:10px 12px;border-radius:6px;border:1px solid rgba(0,0,0,0.06);font-size:.79rem;margin-bottom:10px">' +
              '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed var(--border)">' +
                '<span class="t3">1. 📥 Выручка Заказчика (по смете договора):</span>' +
                '<b style="color:var(--blue)">+ ' + fmtMoney(totalCustomerAmount) + '</b>' +
              '</div>' +
              '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed var(--border)">' +
                '<span class="t3">2. 📤 СМР — Монтажные работы (' + effectivePorts + ' портов):</span>' +
                '<b>− ' + fmtMoney(subWorkCost) + '</b>' +
              '</div>' +
              '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed var(--border)">' +
                '<span class="t3">3. 📦 ТМЦ — Материалы со склада:</span>' +
                '<b>− ' + fmtMoney(costMaterials) + '</b>' +
              '</div>' +
              '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed var(--border)">' +
                '<span class="t3">4. 🛠️ Сопутствующие ДОПы (бурение, вышка, проживание):</span>' +
                '<span>' +
                  '<b>− ' + fmtMoney(costDopsTotal) + '</b>' +
                  (dopSubcontract > 0 ? (' <span class="t3" style="font-size:.68rem">(монтажнику ' + fmtMoney(dopSubcontract) + ')</span>') : '') +
                '</span>' +
              '</div>' +
              '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed var(--border)">' +
                '<span class="t3">5. 🚚 Транспорт и логистика (ТК / выезд):</span>' +
                '<span>' +
                  '<b>− ' + fmtMoney(costTransportTotal) + '</b>' +
                  (transportSubcontract > 0 ? (' <span class="t3" style="font-size:.68rem">(монтажнику ' + fmtMoney(transportSubcontract) + ')</span>') : '') +
                '</span>' +
              '</div>' +
              '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed var(--border)">' +
                '<span class="t3">6. 🏛️ Налог НДС (' + escHtml(ownComp.code) + ' · ' + vatRate + '%):</span>' +
                '<b style="color:' + (vatAmount > 0 ? '#9a3412' : 'var(--text-3)') + '">− ' + fmtMoney(vatAmount) + '</b>' +
              '</div>' +
              '<div style="display:flex;justify-content:space-between;padding:6px 0 2px;font-weight:700">' +
                '<span>ИТОГО затраты и налоги объекта:</span>' +
                '<span>' + fmtMoney(totalCost) + '</span>' +
              '</div>' +
            '</div>' +

            '<div style="display:flex;justify-content:space-between;align-items:center;background:#ffffff;padding:10px 12px;border-radius:6px;border:1.5px solid ' + (operatingMargin >= 0 ? '#86efac' : '#fca5a5') + '">' +
              '<div>' +
                '<div style="font-size:.75rem;text-transform:uppercase;font-weight:700;color:var(--text-3)">Чистая операционная маржа</div>' +
                '<div style="font-size:.74rem;color:var(--text-2)">Рентабельность сделки: <b>' + (marginPercent > 0 ? '+' : '') + marginPercent + '%</b></div>' +
              '</div>' +
              '<div style="text-align:right">' +
                '<div style="font-weight:900;font-size:1.25rem;color:' + (operatingMargin >= 0 ? '#15803d' : '#b91c1c') + '">' +
                  (operatingMargin >= 0 ? '+' : '') + fmtMoney(operatingMargin) +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

        '</div>' +

      '</div>' +
    '</div>';
  })();

  var paneHistory = '<div id="cardTabPane-history" class="card-tab-pane" style="display:' + (curTab === 'history' ? 'block' : 'none') + '">' +
    '<div class="card p">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">' +
        '<div class="sec-title" style="margin:0">История изменений заявки</div>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="refreshCardHistory(\'' + eid + '\')" title="Обновить журнал истории">🔄 Обновить</button>' +
      '</div>' +
      '<div id="cardHistoryContainer">' + histHtml + '</div>' +
    '</div>' +
  '</div>';

  var paneChat = '<div id="cardTabPane-chat" class="card-tab-pane" style="display:' + (curTab === 'chat' ? 'block' : 'none') + '">' +
    renderTaskChatComponent(eid, false) +
  '</div>';

  var taskChatDrawerHtml = '<div id="taskChatDrawer" class="task-chat-drawer' + (S.taskChatDrawerOpen ? ' open' : '') + '">' +
    renderTaskChatComponent(eid, true) +
  '</div>';

  var hasDraft = S.cardDraft && (
    Object.keys(S.cardDraft).filter(function(k){ return k !== '_smrTaskId'; }).length > 0 ||
    !!S.cardDraft._smrDirty
  );
  var unsavedBar = hasDraft
    ? '<div class="unsaved-bar" id="card_unsaved_bar">' +
        '<span>У вас есть несохранённые изменения</span>' +
        '<button class="btn btn-sm" id="cardSaveBtn" onclick="window.saveCard(false)">Сохранить</button>' +
        '<button class="btn btn-sm btn-ghost" id="cardResetBtn" onclick="window._resetCardDraft()">Сбросить</button>' +
      '</div>'
    : '';

  var mobileActionBar = '<div class="mobile-action-bar">' +
    (hasDraft
      ? '<button class="btn btn-sm btn-primary mobile-action-main-btn" onclick="window.saveCard(false)">💾 Сохранить</button>' +
        '<button class="btn btn-sm btn-ghost" onclick="window._resetCardDraft()">✕</button>'
      : ''
    ) +
  '</div>';

  var confirmModal = S.cardConfirmOpen
    ? '<div class="modal-overlay" id="cardConfirmOverlay">' +
        '<div class="modal-box">' +
          '<h3>Подтвердите изменения</h3>' +
          Object.keys(S.cardDraft).map(function(k){
            var oldV = t[k];
            var newV = S.cardDraft[k];
            var isBool = typeof newV === 'boolean';
            var oldStr = isBool ? (oldV ? 'Да' : 'Нет') : String(oldV || '—');
            var newStr = isBool ? (newV ? 'Да' : 'Нет') : String(newV || '—');
            return '<div class="field-row"><div class="field-lbl">'+(fieldLabels[k]||k)+'</div>' +
              '<div class="field-val"><span style="text-decoration:line-through;color:var(--red)">'+oldStr+'</span> &rarr; <b>'+newStr+'</b></div></div>';
          }).join('') +
          '<div style="display:flex;gap:.5rem;margin-top:1rem;justify-content:flex-end">' +
            '<button class="btn btn-sm btn-ghost" id="cardConfirmCancelBtn">Отмена</button>' +
            '<button class="btn btn-sm" id="cardConfirmOkBtn">Подтвердить и сохранить</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    : '';

  return stickyHeader +
    cancelledBanner +
    '<form id="cardForm" onsubmit="return false;">' +
      paneMain +
      paneItems +
      paneSupply +
      paneFiles +
      paneFinance +
      paneHistory +
      paneChat +
    '</form>' +
    mobileActionBar +
    unsavedBar +
    confirmModal +
    taskChatDrawerHtml;
}

function refreshTaskItemsList(taskId) {
  var el = document.getElementById('taskItemsList');
  if (!el) return;
  api('/tasks/' + encodeURIComponent(taskId) + '/items')
    .then(function(items) {
      if (!Array.isArray(items) || !items.length) {
        el.innerHTML = '<div class="t3" style="padding:.6rem 0;font-size:.82rem">Позиции работ пока не внесены. Нажмите «+ Добавить работу / ТМЦ», чтобы детализировать состав заявки.</div>';
        updateItemsSummary(taskId, []);
        return;
      }

      var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
      var isLocked = t && (['accepted','billing','paid','archived'].includes((t.macroStatus||'').toLowerCase()) || t.status === 'cancelled' || (t.stageNum != null && t.stageNum >= 8));
      var contractors = S.contractors || [];

      // Определяем подрядчика по умолчанию из заявки
      var defaultContrObj = null;
      if (t) {
        var tContrName = (t.contractor || (t.subcontract && t.subcontract.contractor_name) || '').trim();
        var tContrId = t.contractor_id || (t.subcontract && t.subcontract.contractor_id);
        if (tContrId) {
          defaultContrObj = contractors.find(function(c) { return String(c.id) === String(tContrId); });
        }
        if (!defaultContrObj && tContrName) {
          defaultContrObj = contractors.find(function(c) {
            return (c.name_short && c.name_short.toLowerCase() === tContrName.toLowerCase()) ||
                   (c.name_full && c.name_full.toLowerCase() === tContrName.toLowerCase()) ||
                   (c.name && c.name.toLowerCase() === tContrName.toLowerCase());
          });
        }
      }

      var rows = items.map(function(it, idx) {
        var statusColor = it.status === 'done' ? 'var(--green)' : it.status === 'progress' ? 'var(--orange)' : 'var(--text-3)';
        var statusLabel = it.status === 'done' ? '✓ Выполнено' : it.status === 'progress' ? '⚙ В работе' : '⏳ План';

        var itContrId = it.contractor_id || (defaultContrObj ? defaultContrObj.id : null);
        var itContrName = it.contractor_name || (defaultContrObj ? defaultContrObj.name_short : null);

        var contOptions = '<option value="">(Не назначен)</option>' +
          contractors.map(function(c) {
            var selected = (String(itContrId) === String(c.id) || (itContrName && itContrName.toLowerCase() === (c.name_short||'').toLowerCase())) ? ' selected' : '';
            return '<option value="' + c.id + '"' + selected + '>' + escHtml(c.name_short) + '</option>';
          }).join('');

        var margin = (Number(it.amount_customer) || 0) - (Number(it.amount_contractor) || 0);
        var selectDisabled = isLocked ? ' disabled' : '';

        var metaBadges = '';
        if (it.article || it.supplier) {
          metaBadges = '<div style="font-size:.68rem;margin-top:2px;display:flex;gap:4px;flex-wrap:wrap">' +
            (it.article ? '<span class="badge" style="background:#f1f5f9;color:var(--text);font-size:.68rem;padding:1px 5px;border:1px solid var(--border)">Арт: <b>' + escHtml(it.article) + '</b></span>' : '') +
            (it.supplier ? '<span class="badge" style="background:#f0fdf4;color:#166534;font-size:.68rem;padding:1px 5px;border:1px solid #bbf7d0">Поставщик: <b>' + escHtml(it.supplier) + '</b></span>' : '') +
          '</div>';
        }

        return '<tr style="border-bottom:1px solid var(--border);font-size:.78rem">' +
          '<td style="padding:4px 6px;font-weight:600;color:var(--text-3);text-align:center">' + (idx + 1) + '</td>' +
          '<td style="padding:4px 6px;max-width:240px">' +
            '<div style="font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escHtml(it.work_type) + '">' + escHtml(it.work_type) + '</div>' +
            metaBadges +
            (it.comment ? '<div style="font-size:.7rem;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(it.comment) + '</div>' : '') +
          '</td>' +
          '<td style="padding:4px 6px;white-space:nowrap;font-weight:600">' + (it.quantity || 1) + ' ' + escHtml(it.unit || 'шт.') + '</td>' +
          '<td style="padding:4px 6px;white-space:nowrap;color:var(--text)">' + fmtMoney(it.amount_customer) + '</td>' +
          '<td style="padding:4px 6px">' +
            '<select class="field-input"' + selectDisabled + ' style="width:100%;max-width:145px;padding:2px 4px;font-size:.74rem;height:24px" onchange="updateItemContractor(\'' + taskId.replace(/'/g, "\\'") + '\',' + it.id + ',this.value)">' +
              contOptions +
            '</select>' +
          '</td>' +
          '<td style="padding:4px 6px;white-space:nowrap;color:var(--text-2)">' + fmtMoney(it.amount_contractor) + '</td>' +
          '<td style="padding:4px 6px;white-space:nowrap;font-weight:600;color:' + (margin >= 0 ? 'var(--green)' : 'var(--red)') + '">' + fmtMoney(margin) + '</td>' +
          '<td style="padding:4px 6px;white-space:nowrap">' +
            '<span style="font-size:.72rem;color:' + statusColor + ';font-weight:600">' + statusLabel + '</span>' +
          '</td>' +
          '<td style="padding:4px 6px;text-align:right;white-space:nowrap">' +
            (!isLocked ? '<button class="btn btn-xs btn-ghost" onclick="openEditItemModal(\'' + taskId.replace(/'/g, "\\'") + '\',' + it.id + ')" title="Редактировать">✏️</button>' : '') +
            (!isLocked ? '<button class="btn btn-xs btn-ghost" style="color:var(--red)" onclick="deleteItemModal(\'' + taskId.replace(/'/g, "\\'") + '\',' + it.id + ')" title="Удалить">✕</button>' : '') +
          '</td>' +
        '</tr>';
      }).join('');

      el.innerHTML = '<div style="overflow-x:auto;max-width:100%">' +
        '<table style="width:100%;border-collapse:collapse;text-align:left;line-height:1.25">' +
          '<thead><tr style="background:var(--bg);font-size:.72rem;color:var(--text-3);border-bottom:1.5px solid var(--border)">' +
            '<th style="padding:5px 6px;width:24px;text-align:center">№</th>' +
            '<th style="padding:5px 6px">Вид работ / позиция</th>' +
            '<th style="padding:5px 6px;width:75px">Кол-во</th>' +
            '<th style="padding:5px 6px;width:85px">Заказчик</th>' +
            '<th style="padding:5px 6px;width:150px">Подрядчик (исп.)</th>' +
            '<th style="padding:5px 6px;width:85px">Подрядчику</th>' +
            '<th style="padding:5px 6px;width:80px">Маржа</th>' +
            '<th style="padding:5px 6px;width:85px">Статус</th>' +
            '<th style="padding:5px 6px;width:55px;text-align:right"></th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>';

      updateItemsSummary(taskId, items);
    })
    .catch(function(err) {
      el.innerHTML = '<div class="t3" style="color:var(--red);font-size:.8rem">Ошибка загрузки позиций: ' + (err.message || err) + '</div>';
    });
}

function updateItemsSummary(taskId, items) {
  var countBadge = document.getElementById('cardItemsCountBadge');
  if (countBadge) countBadge.textContent = (items ? items.length : 0) + ' позиций';
  var tabBadge = document.getElementById('cardTabItemsBadge');
  if (tabBadge) tabBadge.textContent = (items && items.length) ? String(items.length) : '';

  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  var defaultContr = t ? (t.contractor || (t.subcontract && t.subcontract.contractor_name) || '') : '';

  var totalCust = 0, totalCont = 0;
  var contractorsMap = {};

  (items || []).forEach(function(it) {
    totalCust += Number(it.amount_customer) || 0;
    totalCont += Number(it.amount_contractor) || 0;
    var cName = it.contractor_name || defaultContr;
    if (!cName && it.contractor_id) {
      var found = (S.contractors || []).find(function(c) { return c.id === it.contractor_id; });
      if (found) cName = found.name_short;
    }
    if (cName) {
      contractorsMap[cName] = (contractorsMap[cName] || 0) + 1;
    }
  });

  var margin = totalCust - totalCont;
  var marginPct = totalCust > 0 ? Math.round((margin / totalCust) * 100) : 0;

  var custEl = document.getElementById('cardSummaryCust');
  if (custEl) custEl.textContent = fmtMoney(totalCust);

  var contEl = document.getElementById('cardSummaryCont');
  if (contEl) contEl.textContent = fmtMoney(totalCont);

  var marginEl = document.getElementById('cardSummaryMargin');
  if (marginEl) {
    marginEl.textContent = fmtMoney(margin) + ' (' + marginPct + '%)';
    marginEl.style.color = margin >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // Обновляем кнопки персональных Приложений №2
  var ordersBar = document.getElementById('cardContractorOrdersBar');
  if (ordersBar) {
    var cNames = Object.keys(contractorsMap);
    if (cNames.length > 0) {
      ordersBar.innerHTML = '<span style="font-weight:600;color:var(--text-3)">Заказы подрядчикам (Приложение №2):</span>' +
        cNames.map(function(cn) {
          return '<button class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:.74rem" onclick="generateTaskDoc(\'' + taskId.replace(/'/g, "\\'") + '\', \'order_subcontract\')">📥 Заказ: ' + escHtml(cn) + ' (' + contractorsMap[cn] + ' поз.)</button>';
        }).join('');
    } else {
      ordersBar.innerHTML = '';
    }
  }
}

function openAddItemModal(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  var contractors = S.contractors || [];
  var defContr = t ? (t.contractor || (t.subcontract && t.subcontract.contractor_name) || '') : '';
  var defContrObj = defContr ? contractors.find(function(c){ return (c.name_short||'').toLowerCase() === defContr.toLowerCase() || (c.name||'').toLowerCase() === defContr.toLowerCase(); }) : null;
  var defContrId = defContrObj ? defContrObj.id : '';

  var contrOptions = '<option value="">(Не назначен)</option>' +
    contractors.map(function(c) {
      return '<option value="' + c.id + '"' + (String(c.id) === String(defContrId) ? ' selected' : '') + '>' + escHtml(c.name_short) + '</option>';
    }).join('');

  var modalId = 'modal_item_add';
  var oldM = document.getElementById(modalId);
  if (oldM) oldM.remove();

  var html = '<div class="modal-overlay" id="' + modalId + '" onclick="if(event.target===this)this.remove()">' +
    '<div class="modal-box" style="max-width:540px;width:95%;padding:20px;border-radius:10px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
        '<div style="font-weight:700;font-size:1.1rem">📦 Добавить позицию (Работа / ТМЦ)</div>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'' + modalId + '\').remove()">✕</button>' +
      '</div>' +
      '<form id="form_add_task_item" onsubmit="submitTaskItemForm(event, \'' + escHtml(taskId) + '\')">' +
        '<div style="margin-bottom:10px">' +
          '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Наименование работы или материала (ТМЦ) *</label>' +
          '<input type="text" id="m_item_name" required placeholder="Например: Патч-корд UTP кат 6 или Монтаж лотка" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
          '<div>' +
            '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Артикул / Код</label>' +
            '<input type="text" id="m_item_article" placeholder="Например: CS1-1C6AU-11" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
          '</div>' +
          '<div>' +
            '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Поставщик</label>' +
            '<input list="suppliersListDL" id="m_item_supplier" placeholder="Инсистем, Склад, Анлан..." style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            '<datalist id="suppliersListDL">' +
              '<option value="Инсистем">' +
              '<option value="Склад">' +
              '<option value="Анлан">' +
              '<option value="Линдекс">' +
              '<option value="ЭТМ">' +
            '</datalist>' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
          '<div>' +
            '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Количество *</label>' +
            '<input type="number" id="m_item_qty" step="any" min="0" value="1" required style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
          '</div>' +
          '<div>' +
            '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Единица изм.</label>' +
            '<input type="text" id="m_item_unit" value="шт." list="unitsListDL" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            '<datalist id="unitsListDL"><option value="шт."><option value="м"><option value="компл."><option value="уп."><option value="порт"></datalist>' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
          '<div>' +
            '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Цена Заказчика (₽)</label>' +
            '<input type="number" id="m_item_price_cust" step="any" min="0" value="0" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
          '</div>' +
          '<div>' +
            '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Ставка Подрядчику (₽)</label>' +
            '<input type="number" id="m_item_price_cont" step="any" min="0" value="0" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:14px">' +
          '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Подрядчик (исполнитель)</label>' +
          '<select id="m_item_contractor" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            contrOptions +
          '</select>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px">' +
          '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'' + modalId + '\').remove()">Отмена</button>' +
          '<button type="submit" class="btn btn-primary">✓ Добавить в спецификацию</button>' +
        '</div>' +
      '</form>' +
    '</div>' +
  '</div>';

  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(function(){ var inp = document.getElementById('m_item_name'); if (inp) inp.focus(); }, 50);
}

function submitTaskItemForm(e, taskId, itemId) {
  e.preventDefault();
  var name = (document.getElementById('m_item_name').value || '').trim();
  if (!name) return alert('Наименование позиции обязательно');

  var article = (document.getElementById('m_item_article').value || '').trim();
  var supplier = (document.getElementById('m_item_supplier').value || '').trim();
  var qty = parseFloat(document.getElementById('m_item_qty').value) || 1;
  var unit = (document.getElementById('m_item_unit').value || 'шт.').trim();
  var priceCust = parseFloat(document.getElementById('m_item_price_cust').value) || 0;
  var priceCont = parseFloat(document.getElementById('m_item_price_cont').value) || 0;
  var cSelect = document.getElementById('m_item_contractor');
  var contrId = cSelect && cSelect.value ? parseInt(cSelect.value, 10) : null;
  var contrName = cSelect && cSelect.selectedIndex > 0 ? cSelect.options[cSelect.selectedIndex].text : null;

  var payload = {
    work_type: name,
    article: article || null,
    supplier: supplier || null,
    quantity: qty,
    unit: unit,
    price_customer: priceCust,
    amount_customer: qty * priceCust,
    price_contractor: priceCont,
    amount_contractor: qty * priceCont,
    contractor_id: contrId,
    contractor_name: contrName
  };

  var url = itemId
    ? ('/tasks/' + encodeURIComponent(taskId) + '/items/' + itemId)
    : ('/tasks/' + encodeURIComponent(taskId) + '/items');
  var method = itemId ? 'PUT' : 'POST';

  api(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(res) {
    if (res && res.error) return alert('Ошибка сохранения: ' + res.error);
    var m = document.getElementById('modal_item_add') || document.getElementById('modal_item_edit');
    if (m) m.remove();
    refreshTaskItemsList(taskId);
    if (typeof showToast === 'function') showToast(itemId ? '✓ Позиция обновлена' : '✓ Позиция добавлена');
  })
  .catch(function(err) {
    alert('Ошибка: ' + (err.message || err));
  });
}

function openEditItemModal(taskId, itemId) {
  api('/tasks/' + encodeURIComponent(taskId) + '/items')
    .then(function(list) {
      var it = (list || []).find(function(x) { return x.id === itemId; });
      if (!it) return alert('Позиция не найдена');

      var contractors = S.contractors || [];
      var curContrId = it.contractor_id || '';

      var contrOptions = '<option value="">(Не назначен)</option>' +
        contractors.map(function(c) {
          return '<option value="' + c.id + '"' + (String(c.id) === String(curContrId) ? ' selected' : '') + '>' + escHtml(c.name_short) + '</option>';
        }).join('');

      var modalId = 'modal_item_edit';
      var oldM = document.getElementById(modalId);
      if (oldM) oldM.remove();

      var html = '<div class="modal-overlay" id="' + modalId + '" onclick="if(event.target===this)this.remove()">' +
        '<div class="modal-box" style="max-width:540px;width:95%;padding:20px;border-radius:10px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
            '<div style="font-weight:700;font-size:1.1rem">✏️ Редактировать позицию (Работа / ТМЦ)</div>' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'' + modalId + '\').remove()">✕</button>' +
          '</div>' +
          '<form id="form_edit_task_item" onsubmit="submitTaskItemForm(event, \'' + escHtml(taskId) + '\', ' + itemId + ')">' +
            '<div style="margin-bottom:10px">' +
              '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Наименование работы или материала (ТМЦ) *</label>' +
              '<input type="text" id="m_item_name" required value="' + escHtml(it.work_type || '') + '" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Артикул / Код</label>' +
                '<input type="text" id="m_item_article" value="' + escHtml(it.article || '') + '" placeholder="Например: CS1-1C6AU-11" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Поставщик</label>' +
                '<input list="suppliersListDL" id="m_item_supplier" value="' + escHtml(it.supplier || '') + '" placeholder="Инсистем, Склад, Анлан..." style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
                '<datalist id="suppliersListDL">' +
                  '<option value="Инсистем">' +
                  '<option value="Склад">' +
                  '<option value="Анлан">' +
                  '<option value="Линдекс">' +
                  '<option value="ЭТМ">' +
                '</datalist>' +
              '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Количество *</label>' +
                '<input type="number" id="m_item_qty" step="any" min="0" value="' + (it.quantity || 1) + '" required style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Единица изм.</label>' +
                '<input type="text" id="m_item_unit" value="' + escHtml(it.unit || 'шт.') + '" list="unitsListDL" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
              '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Цена Заказчика (₽)</label>' +
                '<input type="number" id="m_item_price_cust" step="any" min="0" value="' + (it.price_customer || 0) + '" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
              '</div>' +
              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Ставка Подрядчику (₽)</label>' +
                '<input type="number" id="m_item_price_cont" step="any" min="0" value="' + (it.price_contractor || 0) + '" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
              '</div>' +
            '</div>' +
            '<div style="margin-bottom:14px">' +
              '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:4px">Подрядчик (исполнитель)</label>' +
              '<select id="m_item_contractor" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
                contrOptions +
              '</select>' +
            '</div>' +
            '<div style="display:flex;justify-content:flex-end;gap:8px">' +
              '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'' + modalId + '\').remove()">Отмена</button>' +
              '<button type="submit" class="btn btn-primary">✓ Сохранить изменения</button>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>';

      document.body.insertAdjacentHTML('beforeend', html);
    })
    .catch(function(err) {
      alert('Ошибка загрузки позиции: ' + (err.message || err));
    });
}

function uploadMaterialsExcel(file, taskId) {
  if (!file) return;
  if (!window.XLSX) {
    return alert('Библиотека XLSX еще не загрузилась. Подождите 1-2 секунды и попробуйте снова.');
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = new Uint8Array(e.target.result);
      var wb = XLSX.read(data, { type: 'array' });
      var firstSheet = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
      if (!rows || rows.length < 2) return alert('Файл пуст или содержит только заголовки');

      var headerIdx = 0;
      for (var i = 0; i < Math.min(10, rows.length); i++) {
        var rStr = (rows[i] || []).join(' ').toLowerCase();
        if (rStr.includes('наименование') || rStr.includes('кол-во') || rStr.includes('артикул')) {
          headerIdx = i;
          break;
        }
      }

      var headers = (rows[headerIdx] || []).map(function(h) { return String(h || '').trim(); });
      var findCol = function(pattern) {
        return headers.findIndex(function(h) { return pattern.test(h.toLowerCase()); });
      };

      var colName = findCol(/наименование|материал|товар|номенклатур|оборудован/);
      var colUnit = findCol(/ед\.\s*изм|ед|единиц/);
      var colQty = findCol(/кол-во|количество|qty/);
      var colArt = findCol(/артикул|код|марк/);
      var colSupp = findCol(/поставщик|склад|источник/);

      var supplierCols = [];
      headers.forEach(function(h, cIdx) {
        var hl = h.toLowerCase();
        if (hl.includes('инсистем') || hl.includes('склад') || hl.includes('анлан') || hl.includes('линдекс') || hl.includes('этм')) {
          supplierCols.push({ idx: cIdx, name: h.replace(/\s*\?.*$/, '').trim() });
        }
      });

      var parsedItems = [];
      for (var r = headerIdx + 1; r < rows.length; r++) {
        var row = rows[r];
        if (!row || !row.length) continue;
        var name = colName !== -1 ? String(row[colName] || '').trim() : '';
        if (!name || name === 'Итого' || name === 'ИТОГО') continue;

        var unit = colUnit !== -1 ? String(row[colUnit] || 'шт.').trim() : 'шт.';
        var qty = colQty !== -1 ? (parseFloat(String(row[colQty] || '1').replace(',', '.')) || 1) : 1;
        var art = colArt !== -1 ? String(row[colArt] || '').trim() : '';

        var supp = colSupp !== -1 ? String(row[colSupp] || '').trim() : '';
        if (!supp && supplierCols.length > 0) {
          for (var s = 0; s < supplierCols.length; s++) {
            var val = parseFloat(String(row[supplierCols[s].idx] || '0').replace(',', '.')) || 0;
            if (val > 0) {
              supp = supplierCols[s].name;
              break;
            }
          }
        }

        parsedItems.push({
          work_type: name,
          unit: unit || 'шт.',
          quantity: qty,
          article: art || null,
          supplier: supp || null,
          price_customer: 0,
          amount_customer: 0,
          price_contractor: 0,
          amount_contractor: 0
        });
      }

      if (!parsedItems.length) {
        return alert('Не удалось распознать позиции материалов в файле. Проверьте колонки (Наименование, Ед. изм., Кол-во, Артикул).');
      }

      var replaceExisting = confirm('Найдено позиций материалов: ' + parsedItems.length + '.\nЗаменить текущую спецификацию? Нажмите «OK» для полной замены или «Отмена» для добавления в конец.');

      api('/tasks/' + encodeURIComponent(taskId) + '/items/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: parsedItems, replaceExisting: replaceExisting })
      })
      .then(function(res) {
        if (res.error) return alert('Ошибка загрузки спецификации: ' + res.error);
        if (typeof showToast === 'function') showToast('✓ Загружено материалов: ' + (res.count || parsedItems.length));
        refreshTaskItemsList(taskId);
      })
      .catch(function(err) {
        alert('Ошибка импорта материалов: ' + (err.message || err));
      });
    } catch(err) {
      alert('Ошибка чтения файла Excel: ' + (err.message || err));
    }
  };
  reader.readAsArrayBuffer(file);
}

// Алиасы обратной совместимости
window.addItemPrompt = openAddItemModal;
window.editItemModal = openEditItemModal;
window.openAddItemModal = openAddItemModal;
window.openEditItemModal = openEditItemModal;
window.uploadMaterialsExcel = uploadMaterialsExcel;
window.submitTaskItemForm = submitTaskItemForm;

function deleteItemModal(taskId, itemId) {
  if (!confirm('Удалить эту позицию из спецификации?')) return;
  api('/tasks/' + encodeURIComponent(taskId) + '/items/' + itemId, {
    method: 'DELETE'
  })
  .then(function(res) {
    if (res.error) return alert('Ошибка: ' + res.error);
    refreshTaskItemsList(taskId);
  })
  .catch(function(err) {
    alert('Ошибка удаления позиции: ' + (err.message || err));
  });
}


function openAttachment(id, fromContract, contractId) {
  var url = fromContract
    ? ('/api/contracts/' + encodeURIComponent(contractId) + '/attachments/' + encodeURIComponent(id) + '/download')
    : ('/api/attachments/' + encodeURIComponent(id) + '/file');
  fetch(url, { headers: { 'Authorization': 'Bearer ' + S.token } })
    .then(function(r){ 
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob(); 
    })
    .then(function(blob){ window.open(URL.createObjectURL(blob), '_blank'); })
    .catch(function(err){ alert('Не удалось открыть файл: ' + err.message); });
}

window.approveTaskPhotoReport = function(taskId) {
  if (!confirm('Подтвердить приемку фотоотчета с объекта?')) return;
  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoReportAccepted: true, priemka: 'Принято (фото)' })
  }).then(function() {
    window._curPhotoReportAccepted = true;
    showToast('✓ Фотоотчет успешно принят куратором', 'success');
    var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
    if (t) {
      t.priemka = 'Принято (фото)';
      if (!t.rawData) t.rawData = {};
      t.rawData.photoReportAccepted = true;
    }
    if (window.renderSmrChecklist) window.renderSmrChecklist(taskId);
  }).catch(function(err) {
    alert('Ошибка приемки фотоотчета: ' + err.message);
  });
};

function refreshAttachmentsList(taskId) {
  var el = document.getElementById('attachmentsList');
  if (!el) return;
  loadAttachments(taskId).then(function(list) {
    list = Array.isArray(list) ? list : [];
    var photoList = list.filter(function(a){ return a.type === 'photo_report' || a.type === 'scheme' || (a.mime_type && a.mime_type.startsWith('image/')); });
    var docList = list.filter(function(a){ return !photoList.includes(a); });

    var photoCount = photoList.length;
    if (!window._curTaskPhotos) window._curTaskPhotos = {};
    window._curTaskPhotos[taskId] = photoCount;
    window._curPhotoReportsCount = photoCount;
    if (window.renderSmrChecklist) window.renderSmrChecklist(taskId);

    if (!list.length) {
      el.innerHTML = '<span class="t3">Пока ничего не загружено</span>';
      return;
    }

    var typeLabels = { photo_report: '📷 Фото', scheme: '🗺️ Схема', act: '📄 Акт', receipt: '🧾 Чек', pi_excel: '📊 Excel ПИ', order_pdf: '📑 Заказ (PDF)', checklist: '📋 Чек-лист', tz: '📑 ТЗ', project: '📐 Проект', estimate: '💰 Смета' };

    var html = '';

    // 1. Сетка фотоотчетов (Grid Gallery)
    if (photoList.length > 0) {
      html += '<div style="margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<div style="font-weight:700;font-size:.82rem;color:var(--text)">📷 Фотоотчет и схемы с объекта (' + photoList.length + ' шт.)</div>' +
          '<button type="button" class="btn btn-xs btn-outline" onclick="window.approveTaskPhotoReport(\'' + escHtml(taskId) + '\')" style="color:#16a34a;border-color:#86efac;font-size:.72rem;font-weight:700" title="Подтвердить приемку фотоотчета куратором">✓ Принять фотоотчет</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(110px, 1fr));gap:8px">' +
        photoList.map(function(a) {
          var cleanName = (typeof fixMojibake === 'function' ? fixMojibake(a.original_name) : a.original_name) || 'фото';
          var isFromContract = Boolean(a.from_contract);
          var downloadCall = 'openAttachment(' + a.id + ', ' + isFromContract + ', ' + (a.contract_id || 'null') + ')';
          var deleteBtn = isFromContract ? '' : ('<button type="button" class="btn btn-xs btn-ghost" onclick="handleAttachmentDelete(' + a.id + ',\'' + escHtml(taskId) + '\')" style="color:var(--red);padding:0 3px;font-size:.72rem;line-height:1" title="Удалить">&times;</button>');
          var isImg = a.mime_type && a.mime_type.startsWith('image/');
          return '<div style="background:#fff;border:1.5px solid var(--border);border-radius:6px;padding:6px;display:flex;flex-direction:column;justify-content:space-between;font-size:.75rem;min-height:75px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
              '<span style="font-size:.7rem;font-weight:700;color:var(--blue)">' + (isImg ? '📷 Фото' : '🗺️ Схема') + '</span>' +
              deleteBtn +
            '</div>' +
            '<a href="javascript:void(0)" onclick="' + downloadCall + '" style="font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.2;font-size:.74rem" title="' + escHtml(cleanName) + '">' + escHtml(cleanName) + '</a>' +
            '<div style="margin-top:4px;display:flex;justify-content:space-between;align-items:center">' +
              '<span style="font-size:.65rem;color:var(--text-3)">' + (a.size_bytes ? Math.round(a.size_bytes/1024) + ' КБ' : '') + '</span>' +
              '<button type="button" onclick="' + downloadCall + '" class="btn btn-xs btn-ghost" style="padding:1px 4px;font-size:.68rem;color:var(--blue)">Открыть ↗</button>' +
            '</div>' +
          '</div>';
        }).join('') +
        '</div>' +
      '</div>';
    }

    // 2. Список документов (акты, спецификации, документы из договора)
    if (docList.length > 0) {
      html += '<div>' +
        '<div style="font-weight:700;font-size:.82rem;color:var(--text);margin-bottom:6px">📑 Документы и материалы Заказчика (' + docList.length + ' шт.)</div>' +
        docList.map(function(a) {
          var cleanName = (typeof fixMojibake === 'function' ? fixMojibake(a.original_name) : a.original_name) || 'документ';
          var isFromContract = Boolean(a.from_contract);
          var downloadCall = 'openAttachment(' + a.id + ', ' + isFromContract + ', ' + (a.contract_id || 'null') + ')';
          var contractBadge = isFromContract ? ' <span class="badge b-purple" style="font-size:.66rem;padding:1px 5px">📑 Из договора</span>' : '';
          var deleteBtn = isFromContract ? '' : (' <button class="btn btn-sm btn-ghost" onclick="handleAttachmentDelete(' + a.id + ',\'' + escHtml(taskId) + '\')" title="Удалить">✖</button>');

          return '<div class="field-row" style="padding:4px 0">' +
            '<div class="field-lbl">' + (typeLabels[a.type] || a.type) + contractBadge + '</div>' +
            '<div class="field-val"><a href="javascript:void(0)" onclick="' + downloadCall + '" style="font-weight:600">' + escHtml(cleanName) + '</a>' + deleteBtn + '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    el.innerHTML = html;
  });
}

function refreshPortsList(taskId) {
  var el = document.getElementById('portsList');
  if (!el) return;
  api('/tasks/' + taskId + '/ports').then(function(rows) {
    var pCount = Array.isArray(rows) ? rows.length : 0;
    if (!window._curTaskPorts) window._curTaskPorts = {};
    window._curTaskPorts[taskId] = pCount;
    window._curPortsCount = pCount;
    if (window.renderSmrChecklist) window.renderSmrChecklist(taskId);

    var totalLen = 0;
    var passCount = 0;
    var failCount = 0;
    (rows || []).forEach(function(r) {
      if (r.cable_length) totalLen += Number(r.cable_length) || 0;
      var st = String(r.testing_status || '').toLowerCase();
      if (st === 'pass' || st === 'ok' || st === 'годен' || st === '+') passCount++;
      else if (st === 'fail' || st === 'ошибка' || st === 'брак' || st === '-') failCount++;
    });

    var badgeEl = document.getElementById('portsCountBadge');
    if (badgeEl) {
      badgeEl.textContent = pCount + ' портов' + (totalLen > 0 ? (' · ' + totalLen.toFixed(1) + ' м') : '');
      badgeEl.className = pCount > 0 ? 'badge b-blue' : 'badge b-gray';
    }

    if (!Array.isArray(rows) || !rows.length) {
      el.innerHTML = '<div style="padding:16px;text-align:center;border:1.5px dashed var(--border);border-radius:6px;background:var(--bg)">' +
        '<div style="font-size:1.4rem;margin-bottom:4px">📊</div>' +
        '<div style="font-weight:600;font-size:.85rem;color:var(--text)">Кабельный журнал пуст</div>' +
        '<div style="font-size:.75rem;color:var(--text-3);margin-top:2px">Добавьте порты вручную или загрузите готовую таблицу из Excel</div>' +
      '</div>';
      return;
    }

    var rowsHtml = rows.map(function(r, idx) {
      var st = String(r.testing_status || '').toLowerCase();
      var isPass = (st === 'pass' || st === 'ok' || st === 'годен' || st === '+');
      var isFail = (st === 'fail' || st === 'ошибка' || st === 'брак' || st === '-');

      return '<tr style="border-bottom:1px solid var(--border);font-size:.8rem" data-port-id="' + r.id + '">' +
        '<td style="padding:4px 6px;text-align:center;color:var(--text-3);font-size:.74rem">' + (idx + 1) + '</td>' +
        '<td style="padding:4px 6px">' +
          '<input type="text" class="input input-sm" style="width:100%;padding:3px 5px;font-size:.78rem;font-weight:600" value="' + (r.port_number || '').replace(/"/g, '&quot;') + '" placeholder="1" onchange="savePortField(' + r.id + ',\'' + taskId + '\',\'portNumber\',this.value)">' +
        '</td>' +
        '<td style="padding:4px 6px">' +
          '<input type="text" class="input input-sm" style="width:100%;padding:3px 5px;font-size:.78rem" value="' + (r.marking || '').replace(/"/g, '&quot;') + '" placeholder="1.01" onchange="savePortField(' + r.id + ',\'' + taskId + '\',\'marking\',this.value)">' +
        '</td>' +
        '<td style="padding:4px 6px">' +
          '<input type="text" class="input input-sm" style="width:100%;padding:3px 5px;font-size:.78rem" value="' + (r.room || '').replace(/"/g, '&quot;') + '" placeholder="Каб. 101" onchange="savePortField(' + r.id + ',\'' + taskId + '\',\'room\',this.value)">' +
        '</td>' +
        '<td style="padding:4px 6px">' +
          '<input type="text" class="input input-sm" style="width:100%;padding:3px 5px;font-size:.78rem" value="' + (r.cabinet || '').replace(/"/g, '&quot;') + '" placeholder="ТКШ-1" onchange="savePortField(' + r.id + ',\'' + taskId + '\',\'cabinet\',this.value)">' +
        '</td>' +
        '<td style="padding:4px 6px">' +
          '<input type="text" class="input input-sm" style="width:100%;padding:3px 5px;font-size:.78rem" value="' + (r.unit || '').replace(/"/g, '&quot;') + '" placeholder="24U" onchange="savePortField(' + r.id + ',\'' + taskId + '\',\'unit\',this.value)">' +
        '</td>' +
        '<td style="padding:4px 6px">' +
          '<input type="text" class="input input-sm" style="width:100%;padding:3px 5px;font-size:.78rem" value="' + (r.patch_panel || '').replace(/"/g, '&quot;') + '" placeholder="ПП-1" onchange="savePortField(' + r.id + ',\'' + taskId + '\',\'patchPanel\',this.value)">' +
        '</td>' +
        '<td style="padding:4px 6px">' +
          '<input type="number" step="0.1" class="input input-sm port-len-input" data-field="cableLength" style="width:100%;padding:3px 5px;font-size:.78rem;text-align:right" value="' + (r.cable_length != null ? r.cable_length : '') + '" placeholder="0" onchange="savePortField(' + r.id + ',\'' + taskId + '\',\'cableLength\',this.value)">' +
        '</td>' +
        '<td style="padding:4px 6px">' +
          '<input type="text" list="crimpingOptionsList" class="input input-sm" style="width:100%;padding:3px 5px;font-size:.78rem" value="' + (r.crimping || 'T568B').replace(/"/g, '&quot;') + '" placeholder="T568B" onchange="savePortField(' + r.id + ',\'' + taskId + '\',\'crimping\',this.value)">' +
        '</td>' +
        '<td style="padding:4px 6px">' +
          '<select class="input input-sm" style="width:100%;padding:2px 4px;font-size:.75rem;font-weight:600;color:' + (isPass ? 'var(--green)' : (isFail ? 'var(--red)' : 'var(--text)')) + '" onchange="savePortField(' + r.id + ',\'' + taskId + '\',\'testingStatus\',this.value); this.style.color = (this.value===\'pass\'?\'var(--green)\':(this.value===\'fail\'?\'var(--red)\':\'var(--text)\'))">' +
            '<option value="pass"' + (isPass ? ' selected' : '') + ' style="color:var(--green)">✓ Годен (PASS)</option>' +
            '<option value="fail"' + (isFail ? ' selected' : '') + ' style="color:var(--red)">✗ Ошибка (FAIL)</option>' +
            '<option value="untested"' + (!isPass && !isFail ? ' selected' : '') + ' style="color:var(--text-3)">○ Не тестирован</option>' +
          '</select>' +
        '</td>' +
        '<td style="padding:4px 6px;text-align:center">' +
          '<button type="button" class="btn btn-sm btn-ghost" style="padding:2px 6px;color:var(--red);opacity:.7" title="Удалить строку" onclick="deletePortRow(' + r.id + ',\'' + taskId + '\')">✖</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    el.innerHTML = '<datalist id="crimpingOptionsList">' +
        '<option value="T568B">' +
        '<option value="T568A">' +
        '<option value="Прямой (Straight)">' +
        '<option value="Кроссовер (Cross)">' +
      '</datalist>' +
      '<div style="overflow-x:auto;border:1.5px solid var(--border);border-radius:6px;margin-bottom:10px;background:var(--card)">' +
        '<table style="width:100%;border-collapse:collapse;text-align:left;font-size:.82rem">' +
          '<thead><tr style="background:var(--bg);font-size:.76rem;color:var(--text-3);border-bottom:1px solid var(--border)">' +
            '<th style="padding:6px 8px;width:30px;text-align:center">№</th>' +
            '<th style="padding:6px 8px;width:75px">Порт</th>' +
            '<th style="padding:6px 8px;width:95px">Маркировка</th>' +
            '<th style="padding:6px 8px;min-width:110px">Помещение</th>' +
            '<th style="padding:6px 8px;width:85px">Шкаф</th>' +
            '<th style="padding:6px 8px;width:65px">Юнит</th>' +
            '<th style="padding:6px 8px;width:95px">Кросс (ПП)</th>' +
            '<th style="padding:6px 8px;width:75px;text-align:right">Длина, м</th>' +
            '<th style="padding:6px 8px;width:80px">Обжим</th>' +
            '<th style="padding:6px 8px;width:115px">Правильность</th>' +
            '<th style="padding:6px 8px;width:36px;text-align:center"></th>' +
          '</tr></thead>' +
          '<tbody id="portsTableBody">' + rowsHtml + '</tbody>' +
          '<tfoot><tr style="background:var(--bg);font-size:.82rem;font-weight:700;border-top:2px solid var(--border)">' +
            '<td colspan="7" style="padding:8px 10px;text-align:right;color:var(--text-2)">' +
              'ИТОГО ПОРТОВ: <span id="portsTotalCount" style="color:var(--text)">' + pCount + '</span> шт.' +
            '</td>' +
            '<td id="portsTotalLen" style="padding:8px 6px;text-align:right;color:var(--text);font-size:.85rem">' +
              (totalLen > 0 ? (totalLen.toFixed(1) + ' м') : '—') +
            '</td>' +
            '<td colspan="3" id="portsTotalStats" style="padding:8px 10px;font-size:.78rem;color:var(--text-3)">' +
              'Годных: <b style="color:var(--green)">' + passCount + '</b> · ' +
              'С ошибкой: <b style="color:var(--red)">' + failCount + '</b>' +
            '</td>' +
          '</tr></tfoot>' +
        '</table>' +
      '</div>';
  });
}

function savePortField(rowId, taskId, field, value) {
  var data = {};
  data[field] = value;
  api('/ports/' + rowId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(function() {
    _updatePortsTotalsUI(taskId);
    if (window.renderSmrChecklist) window.renderSmrChecklist(taskId);
  }).catch(function(err) {
    console.error('Ошибка сохранения ячейки порта:', err);
  });
}

function _updatePortsTotalsUI(taskId) {
  var rows = document.querySelectorAll('#portsTableBody tr');
  var pCount = rows.length;
  var totalLen = 0;
  var passCount = 0;
  var failCount = 0;

  rows.forEach(function(r) {
    var lenInp = r.querySelector('.port-len-input');
    if (lenInp && lenInp.value) totalLen += Number(lenInp.value) || 0;
    var sel = r.querySelector('select');
    if (sel) {
      if (sel.value === 'pass') passCount++;
      else if (sel.value === 'fail') failCount++;
    }
  });

  var totalCountEl = document.getElementById('portsTotalCount');
  if (totalCountEl) totalCountEl.textContent = pCount;
  var totalLenEl = document.getElementById('portsTotalLen');
  if (totalLenEl) totalLenEl.textContent = totalLen > 0 ? (totalLen.toFixed(1) + ' м') : '—';
  var totalStatsEl = document.getElementById('portsTotalStats');
  if (totalStatsEl) {
    totalStatsEl.innerHTML = 'Годных: <b style="color:var(--green)">' + passCount + '</b> · С ошибкой: <b style="color:var(--red)">' + failCount + '</b>';
  }
  var badgeEl = document.getElementById('portsCountBadge');
  if (badgeEl) {
    badgeEl.textContent = pCount + ' портов' + (totalLen > 0 ? (' · ' + totalLen.toFixed(1) + ' м') : '');
    badgeEl.className = pCount > 0 ? 'badge b-blue' : 'badge b-gray';
  }
}

function addPortRow(taskId) {
  api('/tasks/' + taskId + '/ports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      portNumber: '',
      marking: '',
      room: '',
      cabinet: '',
      unit: '',
      patchPanel: '',
      cableLength: null,
      crimping: 'T568B',
      testingStatus: 'pass'
    })
  }).then(function() {
    refreshPortsList(taskId);
  });
}

function deletePortRow(rowId, taskId) {
  if (!confirm('Удалить эту строку кабельного журнала?')) return;
  api('/ports/' + rowId, { method: 'DELETE' }).then(function() {
    refreshPortsList(taskId);
  });
}

function uploadCableJournalExcel(file, taskId) {
  if (!file) return;
  if (!window.XLSX) {
    return alert('Библиотека XLSX еще не загрузилась. Подождите 1-2 секунды и попробуйте снова.');
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = new Uint8Array(e.target.result);
      var wb = XLSX.read(data, { type: 'array' });
      var sheetName = wb.SheetNames[0];
      for (var s = 0; s < wb.SheetNames.length; s++) {
        var sn = wb.SheetNames[s].toLowerCase();
        if (sn.includes('кж') || sn.includes('кабель') || sn.includes('порт') || sn.includes('journal')) {
          sheetName = wb.SheetNames[s];
          break;
        }
      }

      var sheet = wb.Sheets[sheetName];
      var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!rows || rows.length < 2) {
        return alert('Файл пуст или содержит только одну строку.');
      }

      // Определение строки заголовков
      var headerIdx = 0;
      for (var i = 0; i < Math.min(15, rows.length); i++) {
        var rowText = (rows[i] || []).join(' ').toLowerCase();
        if (rowText.includes('порт') || rowText.includes('маркировк') || rowText.includes('помещен') || rowText.includes('шкаф') || rowText.includes('кросс')) {
          headerIdx = i;
          break;
        }
      }

      var headers = (rows[headerIdx] || []).map(function(h) { return String(h || '').trim().toLowerCase(); });

      var findCol = function(patterns) {
        return headers.findIndex(function(h) {
          return patterns.some(function(p) { return h.includes(p); });
        });
      };

      var colPort     = findCol(['порт', 'port', '№ розетки', 'номер розетки', 'розетк', 'точка']);
      var colMarking  = findCol(['маркировк', 'бирка', 'marking', 'марка']);
      var colRoom     = findCol(['помещен', 'комнат', 'кабинет', 'room', 'локация']);
      var colCabinet  = findCol(['шкаф', 'ткш', 'стойка', 'rack', 'cabinet', 'шкафу']);
      var colUnit     = findCol(['юнит', 'unit', ' u', 'высота']);
      var colPatch    = findCol(['кросс', 'пп', 'патч', 'панель', 'patch']);
      var colLen      = findCol(['длина', 'длинна', 'метраж', 'length', 'м.']);
      var colCrimping = findCol(['обжим', 'схема', 'тип обжима', 'распиновка', 'crimping']);
      var colTesting  = findCol(['правильн', 'тест', 'статус', 'fluke', 'результат', 'годен', 'испытан', 'test']);

      var parsedPorts = [];
      for (var r = headerIdx + 1; r < rows.length; r++) {
        var row = rows[r];
        if (!row || !row.length) continue;

        var portNumber = colPort !== -1 ? String(row[colPort] || '').trim() : '';
        var marking    = colMarking !== -1 ? String(row[colMarking] || '').trim() : '';
        var room       = colRoom !== -1 ? String(row[colRoom] || '').trim() : '';
        var cabinet    = colCabinet !== -1 ? String(row[colCabinet] || '').trim() : '';
        var unit       = colUnit !== -1 ? String(row[colUnit] || '').trim() : '';
        var patchPanel = colPatch !== -1 ? String(row[colPatch] || '').trim() : '';
        var cableLength = colLen !== -1 ? parseFloat(String(row[colLen] || '').replace(',', '.')) : null;
        var crimping   = colCrimping !== -1 ? String(row[colCrimping] || '').trim() : '';
        var rawTesting = colTesting !== -1 ? String(row[colTesting] || '').trim() : '';

        if (!portNumber && !marking && !room && !cabinet && !patchPanel) continue;

        if (!portNumber && marking) portNumber = marking;
        else if (!portNumber) portNumber = String(parsedPorts.length + 1);

        var testingStatus = 'pass';
        var tLower = rawTesting.toLowerCase();
        if (tLower.includes('fail') || tLower.includes('ошиб') || tLower.includes('брак') || tLower.includes('не') || tLower === '-') {
          testingStatus = 'fail';
        } else if (tLower.includes('pass') || tLower.includes('ok') || tLower.includes('годен') || tLower === '+') {
          testingStatus = 'pass';
        } else if (rawTesting) {
          testingStatus = rawTesting;
        }

        parsedPorts.push({
          portNumber: portNumber,
          marking: marking,
          room: room,
          cabinet: cabinet,
          unit: unit,
          patchPanel: patchPanel,
          cableLength: !isNaN(cableLength) ? cableLength : null,
          crimping: crimping || 'T568B',
          testingStatus: testingStatus
        });
      }

      if (!parsedPorts.length) {
        return alert('Не удалось распознать строки кабельного журнала в файле. Проверьте заголовки колонок (Порт, Маркировка, Помещение, Шкаф, Юнит, Кросс, Длина, Обжим, Правильность).');
      }

      var replaceExisting = confirm(
        'Найдено ' + parsedPorts.length + ' записей портов.\n\n' +
        'Нажмите «ОК», чтобы заменить текущий кабельный журнал новыми данными из файла.\n' +
        'Нажмите «Отмена», чтобы добавить найденные строки к уже существующим.'
      );

      api('/tasks/' + taskId + '/ports/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ports: parsedPorts, replaceExisting: replaceExisting })
      }).then(function(res) {
        if (res && res.error) return alert('Ошибка загрузки: ' + res.error);
        if (typeof showToast === 'function') {
          showToast('Кабельный журнал загружен (' + (res.count || parsedPorts.length) + ' портов)', 'success');
        } else {
          alert('Кабельный журнал успешно загружен (' + (res.count || parsedPorts.length) + ' портов)');
        }
        refreshPortsList(taskId);
      }).catch(function(err) {
        alert('Ошибка при сохранении кабельного журнала: ' + (err.message || err));
      });

    } catch(err) {
      alert('Ошибка при чтении файла Excel: ' + (err.message || err));
    }
  };
  reader.readAsArrayBuffer(file);
}

// Экспорт функций в window
window.refreshPortsList = refreshPortsList;
window.savePortField = savePortField;
window.addPortRow = addPortRow;
window.deletePortRow = deletePortRow;
window.uploadCableJournalExcel = uploadCableJournalExcel;
window.savePortRow = function(rowId, taskId) { /* legacy stub */ };

var fieldLabels = {
  status: 'Статус заявки',
  priority: 'Приоритет',
  stage: 'Этап',
  stageNum: 'Номер этапа',
  stage_num: 'Номер этапа',
  macroStatus: 'Макростатус',
  macro_status: 'Макростатус',
  assignee: 'Проект-менеджер (ПМ)',
  customer: 'Заказчик',
  contract_id: 'Генеральный договор',
  contractId: 'Генеральный договор',
  contract_agreement_id: 'Доп. соглашение (Лот)',
  contractAgreementId: 'Доп. соглашение (Лот)',
  own_company_id: 'Наше юрлицо',
  ownCompanyId: 'Наше юрлицо',
  controller: 'Контролёр (Держатель контракта)',
  comment: 'Комментарий',
  distributedAt: 'Дата распределения',
  distributed_at: 'Дата распределения',
  contact: 'Контакт на объекте',
  techLink: 'Ссылка на тех. инфу',
  tech_link: 'Ссылка на тех. инфу',
  materialsLink: 'Ссылка на материалы',
  materials_link: 'Ссылка на материалы',
  idLink: 'Ссылка на готовую ИД',
  id_link: 'Ссылка на готовую ИД',
  deadline: 'Срок окончания работ',
  dateZayavki: 'Дата заявки',
  date_zayavki: 'Дата заявки',
  fact: 'Факт (портов)',
  inOrder: 'В заказе (портов)',
  in_order: 'В заказе (портов)',
  obsledovanie: 'Обследование',
  dostup: 'Доступ',
  dataVyhoda: 'Дата выхода на объект',
  data_vyhoda: 'Дата выхода на объект',
  priemka: 'Приёмка',
  oplata: 'Оплата подрядчику',
  edoNumber: '№ документа в ЭДО',
  edo_number: '№ документа в ЭДО',
  invoiceInfo: '№ счёта/сумма',
  invoice_info: '№ счёта/сумма',
  vedoStatus: 'В ЭДО',
  vedo_status: 'В ЭДО',
  region: 'Регион',
  address: 'Адрес объекта',
  workType: 'Тип работ',
  work_type: 'Тип работ',
  tipObj: 'Тип объекта',
  tip_obj: 'Тип объекта',
  gosb: '№ ГОСБ',
  vsp: '№ ВСП',
  manager: 'Ответственное лицо (Заказчик)',
  amount: 'Сумма договора',
  overdueDays: 'Дней просрочки',
  overdue_days: 'Дней просрочки',
  contractor: 'Подрядчик (СМР)',
  realDistanceKm: 'Километраж дороги (км)',
  real_distance_km: 'Километраж дороги (км)',
  distanceKm: 'Доплата за удаленность (₽)',
  distance_km: 'Доплата за удаленность (₽)',
  kmRate: 'Ставка за км',
  km_rate: 'Ставка за км',
  pricePerUnit: 'Стоимость за ед.',
  price_per_unit: 'Стоимость за ед.',
  idStatus: 'Статус ИД',
  id_status: 'Статус ИД',
  excelComment: 'Комментарий Заказчика',
  excel_comment: 'Комментарий Заказчика',
  supplierOrderSigned: 'Заказ подписан на портале',
  supplier_order_signed: 'Заказ подписан на портале',
  supplierIdUploaded: 'ИД загружена на портал',
  supplier_id_uploaded: 'ИД загружена на портал',
  overdueReason: 'Причина просрочки',
  overdue_reason: 'Причина просрочки',
  statusSmr: 'Статус СМР',
  status_smr: 'Статус СМР',
  smrActualEndDate: 'Фактическая дата завершения СМР',
  smr_actual_end_date: 'Фактическая дата завершения СМР',
  tmc: 'Сумма ТМЦ',
  extras: 'Дополнительные расходы',
  assignmentStatus: 'Статус назначения',
  assignment_status: 'Статус назначения'
};

window._ensureCardUnsavedBar = function(taskId) {
  var bar = document.getElementById('card_unsaved_bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'unsaved-bar';
    bar.id = 'card_unsaved_bar';
    bar.innerHTML = '<span>У вас есть несохранённые изменения</span>' +
      '<button class="btn btn-sm" id="cardSaveBtn" onclick="window.saveCard(false)">Сохранить</button>' +
      '<button class="btn btn-sm btn-ghost" id="cardResetBtn" onclick="window._resetCardDraft()">Сбросить</button>';
    document.body.appendChild(bar);
  }
  bar.style.display = 'flex';
};

window._resetCardDraft = function() {
  if (S.cardId) {
    if (window._taskSmrSpec) delete window._taskSmrSpec[S.cardId];
    if (window._taskThirdPartySpec) delete window._taskThirdPartySpec[S.cardId];
    if (window._taskSmrTaxConfig) delete window._taskSmrTaxConfig[S.cardId];
    if (window._taskSmrRoundConfig) delete window._taskSmrRoundConfig[S.cardId];
    if (window._taskSmrSpecUnrounded) delete window._taskSmrSpecUnrounded[S.cardId];
  }
  S.cardDraft = {};
  S.cardConfirmOpen = false;
  var bar = document.getElementById('card_unsaved_bar');
  if (bar) bar.style.display = 'none';
  if (S.cardId && typeof loadCardSubcontracts === 'function') {
    loadCardSubcontracts(S.cardId);
  }
  renderApp();
};

function saveCard(silent) {
  var t = S.tasks.find(function(x){ return String(x.id) === String(S.cardId); });
  if (!t) return Promise.resolve();

  var isSmrDirty = !!(S.cardDraft && S.cardDraft._smrDirty);
  var data = Object.assign({}, S.cardDraft);
  delete data._smrDirty;
  delete data._smrTaskId;

  var hasFieldDraft = Object.keys(data).length > 0;
  if (!hasFieldDraft && !isSmrDirty) { 
    S.cardConfirmOpen = false; 
    if (!silent) renderApp(); 
    return Promise.resolve(); 
  }

  var now = new Date().toLocaleString('ru');
  var author = S.user ? (S.user.full_name || S.user.username) : 'Система';
  var hist = (t.history || t._history || []).slice();

  if (hasFieldDraft) {
    Object.keys(data).forEach(function(k){
      var oldV = t[k], newV = data[k];
      var isBool = typeof newV === 'boolean';
      var oldStr = isBool ? (!!oldV ? 'Да' : 'Нет') : String(oldV||'');
      var newStr = isBool ? (newV ? 'Да' : 'Нет') : String(newV);
      if (oldStr !== newStr) {
        hist.push({date:now, author:author, field:fieldLabels[k]||k, old:oldStr, new:newStr});
      }
    });
  }

  // Фиксация изменений сметы в истории изменений заявки
  var taskId = S.cardId;
  if (isSmrDirty && window._taskSmrSpec && window._taskSmrSpec[taskId]) {
    var spec = window._taskSmrSpec[taskId];
    var totalBase = spec.reduce(function(acc, l){ return acc + (Number(l.sum) || 0); }, 0);
    var taxCfg = window._getTaskSmrTaxConfig ? window._getTaskSmrTaxConfig(taskId) : { mode: 'usn', included: true };
    var taxCalc = window._calculateSmrTaxes ? window._calculateSmrTaxes(totalBase, taxCfg.mode, taxCfg.included, taskId) : { totalWithTax: totalBase, taxTitle: 'Без налога' };

    var oldAgreedStr = t.price_agreed ? fmtMoney(t.price_agreed) : '—';
    var newAgreedStr = fmtMoney(taxCalc.totalWithTax) + ' (позиций: ' + spec.length + ', режим: ' + taxCalc.taxTitle + (taxCalc.isRounded ? ', округлено до целых рублей' : '') + ')';
    hist.push({
      date: now,
      author: author,
      field: 'Смета СМР и расчет подряда',
      old: oldAgreedStr,
      new: newAgreedStr
    });
    data.price_agreed = taxCalc.totalWithTax;
  }

  data.history = hist;
  data._history = hist;

  // Очищаем черновик перед отправкой
  S.cardDraft = {};
  S.cardConfirmOpen = false;

  var bar = document.getElementById('card_unsaved_bar');
  if (bar) bar.style.display = 'none';

  var saveInd = document.getElementById('card_autosave_indicator');
  if (saveInd) {
    saveInd.textContent = '⏳ Сохранение...';
    saveInd.style.color = '#b45309';
  }

  // Если смета изменялась, параллельно сохраняем спецификацию субподряда
  var smrPromise = (isSmrDirty && typeof window._saveCardSmrSpec === 'function')
    ? window._saveCardSmrSpec(taskId, { silent: true })
    : Promise.resolve();

  return smrPromise.then(function() {
    return api('/tasks/' + S.cardId, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  })
    .then(function(res){
      if (res && res.task) {
        Object.assign(t, res.task);
        var idx = (S.tasks || []).findIndex(function(x) { return String(x.id) === String(S.cardId); });
        if (idx !== -1) S.tasks[idx] = res.task;
      } else {
        Object.assign(t, data);
        t.history = hist;
        t._history = hist;
      }
      if (saveInd) {
        saveInd.textContent = '✓ Сохранено в журнал';
        saveInd.style.color = '#16a34a';
        setTimeout(function() {
          if (saveInd && saveInd.textContent === '✓ Сохранено в журнал') saveInd.textContent = '';
        }, 2500);
      }
      if (!silent) {
        renderApp();
        if (typeof showToast === 'function') showToast('✓ Смета и изменения успешно сохранены', 'success');
      }
      if (S.cardTab === 'history' && window.refreshCardHistory) {
        window.refreshCardHistory(t.id);
      }
    })
    .catch(function(e){ 
      console.error('Ошибка сохранения карточки:', e);
      if (saveInd) {
        saveInd.textContent = '⚠️ Ошибка сохранения';
        saveInd.style.color = '#dc2626';
      }
      if (!silent) alert('Ошибка сохранения: ' + e.message); 
    });
}
window.saveCard = saveCard;

function cancelTaskPrompt(taskId) {
  if (!confirm('Вы уверены, что хотите отменить заявку ' + taskId + '?\nДействие переведёт заявку в архив с фиксацией официальной причины.')) return;
  var reason = prompt('Укажите официальную причину отмены заявки:');
  if (reason === null) return;
  if (!reason.trim()) return alert('Причина отмены обязательна!');

  api('/tasks/' + encodeURIComponent(taskId) + '/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason.trim() })
  })
  .then(function(res) {
    if (res.error) return alert('Ошибка: ' + res.error);
    var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
    if (t) {
      t.status = 'cancelled';
      t.overdueReason = reason.trim();
    }
    renderApp();
  })
  .catch(function(err) {
    alert('Ошибка отмены заявки: ' + (err.message || err));
  });
}

function deleteTaskPrompt(taskId) {
  if (!confirm('Вы действительно хотите БЕЗВОЗВРАТНО УДАЛИТЬ заявку ' + taskId + ' из базы?\nЭто действие удалит саму заявку и все прикрепленные к ней данные.')) return;
  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'DELETE'
  })
  .then(function(res) {
    if (res && res.error) return alert('Ошибка удаления: ' + res.error);
    S.tasks = (S.tasks || []).filter(function(x){ return String(x.id) !== String(taskId); });
    if (typeof showToast === 'function') {
      showToast('🗑️ Заявка ' + taskId + ' успешно удалена', 'info');
    }
    returnFromCard();
  })
  .catch(function(err) {
    alert('Ошибка удаления заявки: ' + (err.message || err));
  });
}
window.deleteTaskPrompt = deleteTaskPrompt;

// ─────────────────────────────────────────────────────────────────────────────
// МОДАЛЬНОЕ ОКНО ФОРМИРОВАНИЯ ПИСЬМА НА ДОПУСК (Word .docx)
// ─────────────────────────────────────────────────────────────────────────────

function openAccessLetterModal(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); }) || { id: taskId };
  
  var p = S.specialists ? Promise.resolve(S.specialists) : api('/specialists').then(function(specs){ S.specialists = specs; return specs; });
  
  p.then(function(specialists) {
    var existing = document.getElementById('_access_letter_modal');
    if (existing) existing.remove();

    var defaultContractor = t.contractor || 'ООО "К10"';
    var defaultResponsible = '8(923) 102-40-42, ПМ – Чайка Алексей Николаевич';
    
    var parts = [];
    if (t.customer) parts.push('Заказчик: ' + t.customer);
    if (t.address) parts.push(t.address);
    if (t.vsp) parts.push('ВСП ' + t.vsp);
    if (t.gosb) parts.push('ГОСБ ' + t.gosb);
    parts.push('Заявка № ' + t.id);
    if (t.contact) parts.push('Контакт: ' + t.contact);
    var defaultTaskInfo = parts.join(', ');

    var specsList = specialists || [];

    var modal = document.createElement('div');
    modal.id = '_access_letter_modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(2px)';
    
    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:1.5rem;width:100%;max-width:640px;box-shadow:0 12px 48px rgba(0,0,0,.25);max-height:92vh;display:flex;flex-direction:column">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
          <div>
            <div style="font-weight:700;font-size:1.1rem">🪪 Допуск на объект (.docx)</div>
            <div style="font-size:.8rem;color:var(--text-3);margin-top:2px">Объект: <b>${escHtml(t.id)}</b> (${escHtml(t.customer || 'Заказчик')}, ${escHtml(t.address || '')})</div>
          </div>
          <button onclick="document.getElementById('_access_letter_modal').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-3);line-height:1">×</button>
        </div>

        <!-- 3 ВИДА ДОКУМЕНТОВ ДОПУСКА (ПО АЛЕКСЕЮ ЧАЙКЕ) -->
        <div style="margin-bottom:12px;background:#f8fafc;padding:10px 12px;border-radius:8px;border:1.5px solid var(--border)">
          <label style="display:block;font-size:.76rem;font-weight:700;color:var(--text);margin-bottom:6px">Выберите вид документа допуска:</label>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:6px">
            <label style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;border:1.5px solid #3b82f6;background:#eff6ff;cursor:pointer" id="alm_lbl_permit_letter">
              <input type="radio" name="alm_doc_type" value="permit_letter" checked onchange="window.handleAlmDocTypeChange(this.value)">
              <span style="font-size:.82rem;font-weight:700;color:#1d4ed8">✉️ Письмо на допуск</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;border:1.5px solid var(--border);background:#fff;cursor:pointer" id="alm_lbl_access_order">
              <input type="radio" name="alm_doc_type" value="access_order" onchange="window.handleAlmDocTypeChange(this.value)">
              <span style="font-size:.82rem;font-weight:700;color:var(--text)">📋 Заказ-наряд на работы</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;border:1.5px solid var(--border);background:#fff;cursor:pointer" id="alm_lbl_work_permit">
              <input type="radio" name="alm_doc_type" value="work_permit" onchange="window.handleAlmDocTypeChange(this.value)">
              <span style="font-size:.82rem;font-weight:700;color:var(--text)">🛡️ Наряд-допуск</span>
            </label>
          </div>
          <div id="alm_type_hint" style="font-size:.73rem;color:var(--text-3);margin-top:6px">
            ✉️ <strong>Письмо на допуск (письмо-список)</strong> — официальное письмо на владельца / службу безопасности объекта со списком монтажников и паспортными данными.
          </div>
        </div>

        <div style="overflow-y:auto;flex:1;padding-right:4px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Организация подрядчика</label>
              <input type="text" id="alm_contractor" value="${escHtml(defaultContractor)}" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
            </div>
            <div>
              <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Ответственный руководитель (ПМ)</label>
              <input type="text" id="alm_responsible" value="${escHtml(defaultResponsible)}" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
            </div>
          </div>

          <div style="margin-bottom:12px">
            <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Данные объекта и основание (автозаполнение из заявки)</label>
            <textarea id="alm_task_info" rows="2" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;resize:vertical">${escHtml(defaultTaskInfo)}</textarea>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <label style="font-size:.75rem;font-weight:700;color:var(--text-2);text-transform:uppercase">Выберите монтажников для допуска:</label>
            <input type="text" id="alm_search" placeholder="Быстрый поиск..." oninput="filterAlmSpecialists(this.value)" style="padding:4px 8px;font-size:.8rem;border:1px solid var(--border);border-radius:4px;width:160px">
          </div>

          <div id="alm_specialists_list" style="border:1.5px solid var(--border);border-radius:8px;max-height:240px;overflow-y:auto;padding:6px;background:var(--bg)">
            ${specsList.map(function(s) {
              var hasPass = s.passport_raw && s.passport_raw.trim() !== '';
              var passSnippet = s.passport_raw || s.passport_series_number || 'Паспортные данные не заполнены';
              return `
                <label class="alm-spec-item" data-name="${escHtml((s.full_name||'').toLowerCase())}" style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;margin-bottom:4px;background:#fff;border:1px solid var(--border);user-select:none">
                  <input type="checkbox" name="alm_spec_cb" value="${s.id}" style="margin-top:3px">
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <span style="font-weight:600;font-size:.85rem">${escHtml(s.full_name)}</span>
                      <span style="font-size:.72rem;color:var(--text-3)">${escHtml(s.phone || 'без телефона')}</span>
                    </div>
                    <div style="font-size:.74rem;color:${hasPass ? 'var(--text-2)' : 'var(--red)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                      ${hasPass ? '🪪 ' + escHtml(passSnippet) : '⚠️ Паспорт не заполнен'}
                    </div>
                  </div>
                </label>
              `;
            }).join('')}
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1.25rem;border-top:1px solid var(--border);padding-top:12px">
          <div style="font-size:.8rem;color:var(--text-3)">
            Выбрано: <b id="alm_selected_count">0</b> чел.
          </div>
          <div style="display:flex;gap:8px">
            <button onclick="document.getElementById('_access_letter_modal').remove()" class="btn btn-ghost btn-sm">Отмена</button>
            <button id="alm_download_btn" class="btn btn-sm btn-primary" onclick="downloadAccessLetter('${escHtml(taskId)}')">📥 Сформировать и скачать (.docx)</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });

    var cbs = modal.querySelectorAll('input[name="alm_spec_cb"]');
    cbs.forEach(function(cb){
      cb.addEventListener('change', function(){
        var sel = modal.querySelectorAll('input[name="alm_spec_cb"]:checked').length;
        var cntEl = document.getElementById('alm_selected_count');
        if (cntEl) cntEl.textContent = sel;
      });
    });
  });
}

window.handleAlmDocTypeChange = function(type) {
  var hintEl = document.getElementById('alm_type_hint');
  var lblPermit = document.getElementById('alm_lbl_permit_letter');
  var lblOrder = document.getElementById('alm_lbl_access_order');
  var lblHazard = document.getElementById('alm_lbl_work_permit');

  [lblPermit, lblOrder, lblHazard].forEach(function(l){
    if (l) {
      l.style.borderColor = 'var(--border)';
      l.style.backgroundColor = '#fff';
      var sp = l.querySelector('span');
      if (sp) sp.style.color = 'var(--text)';
    }
  });

  if (type === 'access_order') {
    if (lblOrder) {
      lblOrder.style.borderColor = '#c2410c';
      lblOrder.style.backgroundColor = '#fff7ed';
      var sp = lblOrder.querySelector('span');
      if (sp) sp.style.color = '#c2410c';
    }
    if (hintEl) hintEl.innerHTML = '📋 <strong>Заказ-наряд на работы</strong> — распорядительный документ организации: определяет бригаду (старший, монтажники), инструктаж по режиму, перечень и сроки выполнения работ.';
  } else if (type === 'work_permit') {
    if (lblHazard) {
      lblHazard.style.borderColor = '#dc2626';
      lblHazard.style.backgroundColor = '#fef2f2';
      var sp = lblHazard.querySelector('span');
      if (sp) sp.style.color = '#dc2626';
    }
    if (hintEl) hintEl.innerHTML = '🛡️ <strong>Наряд-допуск</strong> — отдельный документ для работ с повышенной опасностью (высотные, в действующих электроустановках, в закрытых зонах объекта).';
  } else {
    if (lblPermit) {
      lblPermit.style.borderColor = '#3b82f6';
      lblPermit.style.backgroundColor = '#eff6ff';
      var sp = lblPermit.querySelector('span');
      if (sp) sp.style.color = '#1d4ed8';
    }
    if (hintEl) hintEl.innerHTML = '✉️ <strong>Письмо на допуск (письмо-список)</strong> — официальное письмо на владельца / службу безопасности объекта со списком монтажников и паспортными данными.';
  }
};

function filterAlmSpecialists(val) {
  var q = (val || '').toLowerCase().trim();
  var items = document.querySelectorAll('.alm-spec-item');
  items.forEach(function(el){
    var name = el.getAttribute('data-name') || '';
    el.style.display = (!q || name.includes(q)) ? 'flex' : 'none';
  });
}

function downloadAccessLetter(taskId) {
  var modal = document.getElementById('_access_letter_modal');
  if (!modal) return;

  var selectedTypeRadio = modal.querySelector('input[name="alm_doc_type"]:checked');
  var selectedType = selectedTypeRadio ? selectedTypeRadio.value : 'permit_letter';

  var contractorName = (document.getElementById('alm_contractor') ? document.getElementById('alm_contractor').value : '').trim();
  var responsibleInfo = (document.getElementById('alm_responsible') ? document.getElementById('alm_responsible').value : '').trim();
  var customTaskInfo = (document.getElementById('alm_task_info') ? document.getElementById('alm_task_info').value : '').trim();

  var checkedCbs = modal.querySelectorAll('input[name="alm_spec_cb"]:checked');
  var specialistIds = Array.from(checkedCbs).map(function(cb){ return parseInt(cb.value); });

  if (specialistIds.length === 0) {
    return alert('Пожалуйста, выберите хотя бы одного специалиста для допуска');
  }

  var selectedSpecs = (S.specialists || []).filter(function(s){ return specialistIds.includes(s.id); });

  var btn = document.getElementById('alm_download_btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Генерация Word...';
  }

  api('/tasks/' + encodeURIComponent(taskId) + '/documents/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      doc_type: selectedType,
      meta: {
        specialists: selectedSpecs,
        responsible_info: responsibleInfo,
        contractor_name: contractorName,
        task_info: customTaskInfo
      }
    })
  })
  .then(function(res) {
    if (res && res.error) throw new Error(res.error);
    if (res.file_url) {
      var a = document.createElement('a');
      a.href = res.file_url;
      a.download = (res.title || selectedType) + '.docx';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    showToast('✅ Документ допуска сформирован и сохранен в реестре!', 'success');
    modal.remove();
    loadCardDocuments(taskId);
  })
  .catch(function(err) {
    alert('Не удалось сформировать документ допуска: ' + err.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📥 Сформировать и скачать (.docx)';
    }
  });
}

// ─── ЧЕК-ЛИСТ ЗАКАЗЧИКА И СПЕЦИФИКАЦИЯ МАТЕРИАЛОВ В КАРТОЧКЕ ───────────────────────

function uploadChecklistPdf(file, optTaskId) {
  if (!file) return;
  if (!file.name.match(/\.pdf$/i)) {
    alert('Пожалуйста, выберите файл в формате PDF');
    return;
  }
  var formData = new FormData();
  formData.append('file', file);
  if (optTaskId) formData.append('task_id', optTaskId);

  var cardCont = document.getElementById('cardMaterialsContainer');
  if (cardCont) cardCont.innerHTML = '<div style="color:var(--blue);font-weight:600">⏳ Идет распознавание чек-листа Заказчика…</div>';

  fetch('/api/checklists/upload', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + S.token },
    body: formData
  })
  .then(function(r) {
    if (!r.ok) return r.json().then(function(j) { throw new Error(j.error || 'Ошибка распознавания'); });
    return r.json();
  })
  .then(function(res) {
    alert('✅ Чек-лист Заказчика успешно распознан!\nЗаявка: ' + res.task_id + '\nПортов к монтажу: ' + (res.checklist.ports_install || 1));
    api('/tasks').then(function(tasks) {
      S.tasks = tasks;
      openCard(res.task_id);
    });
  })
  .catch(function(err) {
    alert('❌ Ошибка загрузки чек-листа: ' + err.message);
    if (optTaskId) loadCardMaterials(optTaskId);
  });
}

function loadCardMaterials(taskId) {
  var cont = document.getElementById('cardMaterialsContainer');
  if (!cont) return;
  cont.innerHTML = '<div class="t3">Загрузка спецификации…</div>';

  Promise.all([
    fetch('/api/tasks/' + encodeURIComponent(taskId) + '/materials', { headers: { 'Authorization': 'Bearer ' + S.token } }).then(function(r){ return r.json(); }),
    fetch('/api/tasks/' + encodeURIComponent(taskId) + '/checklist', { headers: { 'Authorization': 'Bearer ' + S.token } }).then(function(r){ return r.json(); })
  ])
  .then(function(res) {
    var materials = res[0] || [];
    var checklist = res[1] || null;

    if (Array.isArray(materials)) {
      window._curMaterialsWrittenOff = materials.some(function(m){ return m.is_written_off; });
    }
    if (window.renderSmrChecklist) window.renderSmrChecklist(taskId);

    var html = '';

    // Электронный акцепт ТМЦ в подотчет (без бумажной М-15)
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    var isCustodyAccepted = Boolean((t.rawData && t.rawData.tmcAccepted) || (t.raw_data && t.raw_data.tmcAccepted) || t.tmcAccepted);

    if (isCustodyAccepted) {
      var acceptedByStr = (t.rawData && t.rawData.tmcAcceptedBy) || (t.raw_data && t.raw_data.tmcAcceptedBy) || t.contractor || 'Исполнитель';
      var acceptedAtStr = (t.rawData && t.rawData.tmcAcceptedAt) || (t.raw_data && t.raw_data.tmcAcceptedAt) || '';
      html += '<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:6px;padding:8px 12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:1.25rem">✅</span>' +
          '<div>' +
            '<div style="font-weight:700;font-size:.82rem;color:#166534">ТМЦ приняты в подотчет исполнителем (электронный акцепт)</div>' +
            '<div style="font-size:.73rem;color:#15803d">Принял: <b>' + escHtml(acceptedByStr) + '</b> · ' + (acceptedAtStr ? escHtml(acceptedAtStr) + ' · ' : '') + 'Ответственность по Договору подряда (без М-15)</div>' +
          '</div>' +
        '</div>' +
        '<span class="badge b-green" style="font-size:.72rem;font-weight:700">✓ Мат. ответственность принята</span>' +
      '</div>';
    } else {
      html += '<div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:6px;padding:8px 12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:1.25rem">📦</span>' +
          '<div>' +
            '<div style="font-weight:700;font-size:.82rem;color:#1e40af">Электронный акцепт ТМЦ в подотчет (без бумажной накладной М-15)</div>' +
            '<div style="font-size:.73rem;color:#2563eb">Материалы передаются монтажнику под материальную ответственность в соответствии с Договором подряда</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-primary" onclick="window.acceptTmcCustody(\'' + encodeURIComponent(taskId) + '\')" style="font-weight:700;font-size:.76rem">✍️ Принять ТМЦ в подотчет</button>' +
      '</div>';
    }

    // Блок краткой информации по чек-листу
    if (checklist) {
      html += '<div style="background:var(--bg);padding:8px 12px;border-radius:6px;margin-bottom:10px;font-size:.8rem;border:1px solid var(--border)">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
          '<strong>📋 Чек-лист обследования (СБС)</strong>' +
          '<span class="badge b-blue">' + (checklist.zno_number || taskId) + '</span>' +
        '</div>' +
        '<div style="color:var(--text-2);line-height:1.4">' +
          '<div>🔹 Портов: <strong>' + (checklist.ports_install || 1) + '</strong> | Потолок: <strong>' + (checklist.surface_type || '—') + '</strong> (H=' + (checklist.ceiling_height || '2') + 'м)</div>' +
          '<div>🔹 Розетка: <strong>' + (checklist.socket_surface || '—') + '</strong> | Маркировка: <strong>' + (checklist.port_marking || 'ССМ 1') + '</strong></div>' +
          (checklist.sbs_contact ? '<div>🔹 Контакт СБС: ' + escHtml(checklist.sbs_contact) + '</div>' : '') +
        '</div>' +
      '</div>';
    }

    if (!materials || !materials.length) {
      html += '<div class="t3" style="margin-bottom:8px">Спецификация материалов ещё не рассчитана.</div>' +
        '<button class="btn btn-sm" onclick="recalculateTaskMaterials(\'' + encodeURIComponent(taskId) + '\')">⚡ Рассчитать по типовику</button>';
      cont.innerHTML = html;
      return;
    }

    // Таблица материалов (план vs факт с ценами и суммами списания для накладной)
    var allWrittenOff = materials.every(function(m){ return m.is_written_off; });
    var totalTmcSum = 0;

    html += '<table style="width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:10px">' +
      '<thead><tr style="border-bottom:1px solid var(--border);color:var(--text-3);text-align:left">' +
        '<th style="padding:6px 4px">№</th>' +
        '<th style="padding:6px 4px">Материал / Артикул</th>' +
        '<th style="padding:6px 4px;text-align:right">План (норма)</th>' +
        '<th style="padding:6px 4px;text-align:right">Факт расход</th>' +
        '<th style="padding:6px 4px;text-align:right">Цена за ед.</th>' +
        '<th style="padding:6px 4px;text-align:right">Сумма (₽)</th>' +
      '</tr></thead><tbody>';

    materials.forEach(function(m, idx) {
      var isDone = m.is_written_off;
      var curQty = (m.fact_qty != null ? parseFloat(m.fact_qty) : parseFloat(m.plan_qty)) || 0;
      var price = parseFloat(m.price_default) || (m.code && m.code.includes('CABLE') ? 45 : (m.code && m.code.includes('KEYSTONE') ? 120 : (m.code && m.code.includes('PATCH') ? 150 : 80)));
      var itemSum = Math.round(curQty * price);
      totalTmcSum += itemSum;

      var factInput = isDone
        ? '<span style="font-weight:700;color:var(--green)">' + curQty + ' ' + m.unit + '</span>'
        : '<input type="number" step="any" min="0" value="' + curQty + '" id="fact_mat_' + m.material_id + '" style="width:65px;padding:3px 6px;text-align:right;font-size:.82rem">';

      html += '<tr style="border-bottom:1px solid var(--border)">' +
        '<td style="padding:6px 4px;color:var(--text-3);font-size:.74rem">' + (idx + 1) + '</td>' +
        '<td style="padding:6px 4px">' +
          '<div style="font-weight:600">' + escHtml(m.name) + '</div>' +
          (m.calc_details ? '<div style="font-size:.7rem;color:var(--text-3)">' + escHtml(m.calc_details) + '</div>' : '') +
        '</td>' +
        '<td style="padding:6px 4px;text-align:right;white-space:nowrap;color:var(--text-2)">' + m.plan_qty + ' ' + m.unit + '</td>' +
        '<td style="padding:6px 4px;text-align:right;white-space:nowrap">' + factInput + '</td>' +
        '<td style="padding:6px 4px;text-align:right;white-space:nowrap;color:var(--text-3);font-size:.76rem">' + price.toLocaleString('ru-RU') + ' ₽</td>' +
        '<td style="padding:6px 4px;text-align:right;white-space:nowrap;font-weight:700;color:var(--text)">' + itemSum.toLocaleString('ru-RU') + ' ₽</td>' +
      '</tr>';
    });

    html += '<tr style="background:var(--bg);font-weight:700;border-top:2px solid var(--border)">' +
      '<td colspan="5" style="padding:8px 6px;text-align:right">ИТОГО себестоимость ТМЦ по объекту:</td>' +
      '<td style="padding:8px 6px;text-align:right;font-size:.92rem;color:var(--blue)">' + totalTmcSum.toLocaleString('ru-RU') + ' ₽</td>' +
    '</tr>';

    html += '</tbody></table>';

    if (allWrittenOff) {
      html += '<div style="background:#ecfdf5;color:#065f46;padding:10px 14px;border-radius:6px;font-size:.8rem;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;border:1px solid #86efac">' +
        '<div style="display:flex;align-items:center;gap:6px"><span>✅</span> ТМЦ списаны со склада в подотчет объекта на сумму <b>' + totalTmcSum.toLocaleString('ru-RU') + ' ₽</b></div>' +
        '<div style="display:flex;gap:6px">' +
          '<button class="btn btn-sm btn-ghost" onclick="generateTaskDoc(\'' + encodeURIComponent(taskId) + '\', \'tmc_act\')" title="Сформировать печатную форму М-15">📦 Форма М-15 (Word)</button>' +
          '<button class="btn btn-sm btn-ghost" onclick="recalculateTaskMaterials(\'' + encodeURIComponent(taskId) + '\')">🔄 Пересчитать по нормам</button>' +
        '</div>' +
      '</div>';
    } else {
      html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<div style="display:flex;gap:6px">' +
          '<button class="btn btn-sm btn-primary" onclick="writeOffTaskMaterials(\'' + encodeURIComponent(taskId) + '\')" title="Списать фактически израсходованные ТМЦ с фиксацией в себестоимости">✅ Списать ТМЦ по факту</button>' +
          '<button class="btn btn-sm" onclick="saveTaskMaterialsFact(\'' + encodeURIComponent(taskId) + '\')" title="Сохранить введенные количества факта без списания со склада">💾 Сохранить факт</button>' +
        '</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button class="btn btn-sm btn-ghost" onclick="generateTaskDoc(\'' + encodeURIComponent(taskId) + '\', \'tmc_act\')" title="Сформировать накладную на списание ТМЦ">📦 Форма М-15</button>' +
          '<button class="btn btn-sm btn-ghost" onclick="recalculateTaskMaterials(\'' + encodeURIComponent(taskId) + '\')" title="Пересчитать плановые нормы по типовику и объему заявки">🔄 Пересчитать по нормам</button>' +
        '</div>' +
      '</div>';
    }

    cont.innerHTML = html;
  })
  .catch(function(err) {
    cont.innerHTML = '<div style="color:var(--red)">Ошибка загрузки материалов: ' + err.message + '</div>';
  });
}

function recalculateTaskMaterials(taskId) {
  fetch('/api/tasks/' + encodeURIComponent(taskId) + '/materials/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
    body: JSON.stringify({})
  })
  .then(function(r){ return r.json(); })
  .then(function(res) {
    if (res.success) {
      loadCardMaterials(taskId);
    } else {
      alert('Ошибка: ' + (res.error || 'не удалось рассчитать'));
    }
  });
}

function saveTaskMaterialsFact(taskId) {
  fetch('/api/tasks/' + encodeURIComponent(taskId) + '/materials', { headers: { 'Authorization': 'Bearer ' + S.token } })
    .then(function(r){ return r.json(); })
    .then(function(materials) {
      if (!materials || !materials.length) return;
      var items = [];
      materials.forEach(function(m) {
        var inp = document.getElementById('fact_mat_' + m.material_id);
        var qty = inp ? parseFloat(inp.value) : (m.fact_qty != null ? m.fact_qty : m.plan_qty);
        items.push({ material_id: m.material_id, fact_qty: isNaN(qty) ? 0 : qty });
      });

      fetch('/api/tasks/' + encodeURIComponent(taskId) + '/materials/save-fact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
        body: JSON.stringify({ items: items })
      })
      .then(function(r){ return r.json(); })
      .then(function(res) {
        if (res.success) {
          if (typeof showToast === 'function') showToast('✅ Фактический расход ТМЦ сохранен');
          else alert('✅ Фактический расход ТМЦ сохранен!');
          loadCardMaterials(taskId);
        } else {
          alert('Ошибка сохранения: ' + (res.error || 'неизвестная ошибка'));
        }
      })
      .catch(function(err) {
        alert('Ошибка сохранения факта: ' + (err.message || err));
      });
    });
}
window.saveTaskMaterialsFact = saveTaskMaterialsFact;

function writeOffTaskMaterials(taskId) {
  fetch('/api/tasks/' + encodeURIComponent(taskId) + '/materials', { headers: { 'Authorization': 'Bearer ' + S.token } })
    .then(function(r){ return r.json(); })
    .then(function(materials) {
      if (!materials || !materials.length) return;
      var items = [];
      materials.forEach(function(m) {
        var inp = document.getElementById('fact_mat_' + m.material_id);
        var qty = inp ? parseFloat(inp.value) : parseFloat(m.plan_qty);
        items.push({ material_id: m.material_id, quantity: isNaN(qty) ? m.plan_qty : qty });
      });

      if (!confirm('Подтвердить фактический расход и списать материалы с виртуального склада подрядчика с фиксацией в себестоимости объекта?')) return;

      fetch('/api/tasks/' + encodeURIComponent(taskId) + '/materials/write-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
        body: JSON.stringify({ items: items, comment: 'Списание по заявке ' + taskId })
      })
      .then(function(r){ return r.json(); })
      .then(function(res) {
        if (res.success) {
          var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
          if (t && res.total_tmc !== undefined) {
            t.tmc = res.total_tmc;
          }
          var msg = '✅ Материалы успешно списаны со склада подрядчика!';
          if (res.total_tmc) {
            msg += '\nСебестоимость ТМЦ по объекту зафиксирована: ' + Math.round(res.total_tmc).toLocaleString('ru-RU') + ' ₽';
          }
          if (typeof showToast === 'function') showToast(msg);
          else alert(msg);
          loadCardMaterials(taskId);
          if (window.renderCardSmrCalculator) window.renderCardSmrCalculator(taskId);
          if (window.renderSmrChecklist) window.renderSmrChecklist(taskId);
        } else {
          alert('Ошибка списания: ' + (res.error || 'неизвестная ошибка'));
        }
      })
      .catch(function(err) {
        alert('Ошибка списания материалов: ' + (err.message || err));
      });
    });
}
window.writeOffTaskMaterials = writeOffTaskMaterials;

function acceptTmcCustody(taskId) {
  if (!confirm('Подтвердить принятие ТМЦ по спецификации в подотчет монтажнику под личную материальную ответственность согласно Договору подряда (без необходимости оформления бумажной накладной М-15)?')) {
    return;
  }
  fetch('/api/tasks/' + encodeURIComponent(taskId) + '/materials/accept-custody', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token }
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    if (res.success) {
      var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); });
      if (t) {
        if (!t.rawData) t.rawData = {};
        if (!t.raw_data) t.raw_data = {};
        t.rawData.tmcAccepted = true;
        t.rawData.tmcAcceptedAt = res.tmcAcceptedAt;
        t.rawData.tmcAcceptedBy = res.tmcAcceptedBy;
        t.raw_data.tmcAccepted = true;
        t.raw_data.tmcAcceptedAt = res.tmcAcceptedAt;
        t.raw_data.tmcAcceptedBy = res.tmcAcceptedBy;
        t.tmcAccepted = true;
      }
      if (typeof showToast === 'function') {
        showToast('✅ ТМЦ приняты в подотчет! Материальная ответственность зафиксирована.');
      } else {
        alert('✅ ТМЦ приняты в подотчет! Материальная ответственность зафиксирована в системе.');
      }
      loadCardMaterials(taskId);
      if (window.renderSmrChecklist) window.renderSmrChecklist(taskId);
    } else {
      alert('Ошибка акцепта подотчета: ' + (res.error || 'неизвестная ошибка'));
    }
  })
  .catch(function(err) {
    alert('Ошибка сети при принятии ТМЦ: ' + (err.message || err));
  });
}
window.acceptTmcCustody = acceptTmcCustody;

function updateField(taskId, fieldName, value) {
  var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); });
  var payload = {};
  payload[fieldName] = value;

  if (t) {
    t[fieldName] = value;
    if (fieldName === 'dataVyhoda') {
      t.dataVyhoda = value;
      t.data_vyhoda = value;
      if (!t.rawData) t.rawData = {};
      t.rawData.dataVyhoda = value;
      if (value && (!t.macroStatus || t.macroStatus === 'new' || t.macroStatus === 'assigned')) {
        t.macroStatus = 'install';
        t.status = 'progress';
        payload.macroStatus = 'install';
        payload.status = 'progress';
        payload.stageNum = 1;
      }
    }
    if (fieldName === 'smrActualEndDate') {
      t.smrActualEndDate = value;
      t.smr_actual_end_date = value;
      if (value && (!t.statusSmr || t.statusSmr === 'in_progress')) {
        t.statusSmr = 'done';
        payload.statusSmr = 'done';
      }
    }
    if (fieldName === 'fact') {
      t.fact = value !== '' ? Number(value) : null;
    }
    if (fieldName === 'statusSmr') {
      t.statusSmr = value;
      t.status_smr = value;
    }
  }

  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(res) {
    if (res && res.error) {
      alert('Ошибка сохранения: ' + res.error);
    } else {
      if (res && res.task) {
        var idx = (S.tasks || []).findIndex(function(x) { return String(x.id) === String(taskId); });
        if (idx !== -1) S.tasks[idx] = res.task;
        if (t) Object.assign(t, res.task);
      }
      if (typeof showToast === 'function') {
        showToast('✓ Сохранено');
      }
      if (window.renderSmrChecklist) {
        window.renderSmrChecklist(taskId);
      }
      if (S.cardTab === 'history' && window.refreshCardHistory) {
        window.refreshCardHistory(taskId);
      }
    }
  })
  .catch(function(err) {
    console.error('updateField error:', err);
    alert('Ошибка сохранения поля: ' + (err.message || err));
  });
}
window.updateField = updateField;

function renderSmrChecklist(taskId) {
  var el = document.getElementById('smrChecklistContainer');
  if (!el) return;
  var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};

  var factVal = (t.fact != null && t.fact !== '') ? Number(t.fact) : null;
  var inOrderVal = Number(t.inOrder || t.ports || 0);
  var checkPorts = (factVal !== null && factVal > 0);

  var rawDate = t.dataVyhoda || t.data_vyhoda || (t.rawData && (t.rawData.dataVyhoda || t.rawData.data_vyhoda));
  var checkDate = Boolean(rawDate);
  var deadlineVal = t.deadline || (t.rawData && t.rawData.deadline);
  var dateDesc = '';
  if (rawDate) {
    var dOut = new Date(rawDate);
    var dOutStr = String(rawDate).slice(0, 10).split('-').reverse().join('.');
    if (deadlineVal) {
      var dDl = new Date(deadlineVal);
      var diffDays = Math.round((dOut - dDl) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        dateDesc = 'Дата выхода: ' + dOutStr + ' (⚠️ сдача позже дедлайна на ' + diffDays + ' дн.)';
      } else if (diffDays < 0) {
        dateDesc = 'Дата выхода: ' + dOutStr + ' (✓ с опережением дедлайна на ' + Math.abs(diffDays) + ' дн.)';
      } else {
        dateDesc = 'Дата выхода: ' + dOutStr + ' (✓ в день дедлайна)';
      }
    } else {
      dateDesc = 'Дата выхода: ' + dOutStr;
    }
  } else {
    if (deadlineVal) {
      var dDl = new Date(deadlineVal);
      var today = new Date();
      var diffDays = Math.round((today - dDl) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        dateDesc = '⚠️ Просрочен дедлайн СМР (' + String(deadlineVal).slice(0, 10).split('-').reverse().join('.') + ') на ' + diffDays + ' дн.';
      } else {
        dateDesc = 'В графике (дедлайн: ' + String(deadlineVal).slice(0, 10).split('-').reverse().join('.') + ', осталось ' + Math.abs(diffDays) + ' дн.)';
      }
    } else {
      dateDesc = 'Дата не заполнена в карточке';
    }
  }

  var portsCount = (window._curTaskPorts && window._curTaskPorts[taskId] !== undefined) ? window._curTaskPorts[taskId] : (window._curPortsCount || 0);
  var checkKj = (portsCount > 0);
  var kjPct = (inOrderVal > 0 && portsCount > 0) ? Math.min(100, Math.round((portsCount / inOrderVal) * 100)) : (portsCount > 0 ? 100 : 0);

  var photosCount = (window._curTaskPhotos && window._curTaskPhotos[taskId] !== undefined) ? window._curTaskPhotos[taskId] : (window._curPhotoReportsCount || 0);
  var photoReportAccepted = Boolean(window._curPhotoReportAccepted || (t.rawData && t.rawData.photoReportAccepted) || (t.priemka && t.priemka.includes('Принято')));
  var checkPhotos = (photosCount > 0);

  var tmcAccepted = Boolean((t.rawData && t.rawData.tmcAccepted) || (t.raw_data && t.raw_data.tmcAccepted) || t.tmcAccepted);
  var tmcWrittenOff = Boolean(window._curMaterialsWrittenOff);
  var checkTmc = (tmcAccepted || tmcWrittenOff);

  var items = [
    {
      id: 'ports',
      title: '1. Смонтированный объем портов',
      desc: (factVal !== null && factVal > 0)
        ? ('Смонтировано: ' + factVal + (inOrderVal ? ' из ' + inOrderVal + ' шт. (' + Math.round((factVal / inOrderVal) * 100) + '%)' : ' шт.'))
        : (inOrderVal ? ('План: ' + inOrderVal + ' шт. (факт: 0 шт., работы не завершены)') : 'Факт монтажа не указан'),
      passed: checkPorts,
      action: '<button type="button" class="btn btn-xs btn-ghost" onclick="var inp=document.querySelector(\'#smrClosingBlock input[type=number]\');if(inp){inp.focus();inp.select();}" style="font-size:.7rem;padding:2px 6px">Указать факт</button>'
    },
    {
      id: 'date',
      title: '2. Фактическая дата завершения СМР',
      desc: dateDesc,
      passed: checkDate,
      action: '<button type="button" class="btn btn-xs btn-ghost" onclick="var inp=document.getElementById(\'cardDataVyhoda\');if(inp){inp.focus();}" style="font-size:.7rem;padding:2px 6px">Указать дату</button>'
    },
    {
      id: 'kj',
      title: '3. Кабельный журнал (КЖ) / Схема портов',
      desc: portsCount > 0 ? (portsCount + ' линий/портов с маркировкой (' + kjPct + '% от плана)') : 'КЖ не заполнен монтажником',
      passed: checkKj,
      action: '<button type="button" class="btn btn-xs btn-ghost" onclick="addPortRow(\'' + encodeURIComponent(taskId) + '\')" style="font-size:.7rem;padding:2px 6px">+ Добавить порт</button>'
    },
    {
      id: 'photos',
      title: '4. Фотоотчет с объекта (до/после монтажа)',
      desc: photosCount > 0 ? (photosCount + ' фото загружено' + (photoReportAccepted ? ' (✓ фотоотчет принят куратором)' : ' (ожидает приемки)')) : 'Фотоотчет монтажника не прикреплен',
      passed: checkPhotos,
      action: '<label class="btn btn-xs btn-ghost" style="cursor:pointer;font-size:.7rem;padding:2px 6px;margin:0">📷 Загрузить фото<input type="file" multiple accept="image/*" style="display:none" onchange="handleAttachmentUpload(\'' + taskId + '\',\'photo_report\',this.files)"></label>'
    },
    {
      id: 'tmc',
      title: '5. Отчет ТМЦ и электронный акцепт подотчета',
      desc: tmcAccepted ? 'ТМЦ приняты в подотчет монтажником' : (tmcWrittenOff ? 'ТМЦ списаны со склада' : 'Подотчет ТМЦ не акцептован'),
      passed: checkTmc,
      action: '<button type="button" class="btn btn-xs btn-ghost" onclick="setCardTab(\'supply\')" style="font-size:.7rem;padding:2px 6px">Перейти к ТМЦ →</button>'
    }
  ];

  var passedCount = items.filter(function(x){ return x.passed; }).length;
  var allPassed = (passedCount === items.length);

  var bannerBg = allPassed ? '#f0fdf4' : '#fffbeb';
  var bannerBorder = allPassed ? '#86efac' : '#fde68a';
  var bannerColor = allPassed ? '#166534' : '#92400e';
  var bannerTitle = allPassed 
    ? '✅ Чек-лист готовности монтажника успешно пройден (' + passedCount + ' из ' + items.length + ')'
    : '📋 Чек-лист готовности монтажника к закрытию СМР (' + passedCount + ' из ' + items.length + ' выполнено)';
  var bannerSubtitle = allPassed
    ? 'Все обязательные данные СМР зафиксированы: объем портов, дата выхода, кабельный журнал, фотоотчет и отчет ТМЦ. Объект готов к передаче в проектирование ИД.'
    : 'Для сдачи объекта в проектный отдел заполните все обязательные пункты чек-листа:';

  var itemsHtml = items.map(function(item) {
    var icon = item.passed ? '✅' : '⏳';
    var badgeClass = item.passed ? 'badge b-green' : 'badge b-orange';
    var badgeText = item.passed ? '✓ Выполнено' : 'Требуется';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid #f1f5f9;gap:8px;flex-wrap:wrap;background:#ffffff;border-radius:4px;margin-bottom:3px">' +
      '<div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">' +
        '<span style="font-size:1rem;line-height:1">' + icon + '</span>' +
        '<div style="min-width:0">' +
          '<div style="font-size:.8rem;font-weight:700;color:var(--text)">' + item.title + '</div>' +
          '<div style="font-size:.73rem;color:var(--text-3)">' + item.desc + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px">' +
        '<span class="' + badgeClass + '" style="font-size:.7rem;padding:2px 6px">' + badgeText + '</span>' +
        (!item.passed ? item.action : '') +
      '</div>' +
    '</div>';
  }).join('');

  el.innerHTML = '<div style="background:' + bannerBg + ';border:1.5px solid ' + bannerBorder + ';border-radius:8px;padding:10px 12px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px">' +
      '<div>' +
        '<div style="font-weight:700;font-size:.86rem;color:' + bannerColor + '">' + bannerTitle + '</div>' +
        '<div style="font-size:.74rem;color:' + bannerColor + ';opacity:.9">' + bannerSubtitle + '</div>' +
      '</div>' +
      (allPassed 
        ? '<span class="badge b-green" style="font-weight:700;font-size:.75rem;padding:3px 8px">Готов к сдаче в ИД</span>'
        : '<span class="badge b-orange" style="font-weight:700;font-size:.75rem;padding:3px 8px">Осталось: ' + (items.length - passedCount) + '</span>'
      ) +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:3px;margin-top:8px">' +
      itemsHtml +
    '</div>' +
  '</div>';
}
window.renderSmrChecklist = renderSmrChecklist;


// changeTaskMacroStatus определена глобально в public/js/helpers.js

function loadCardSubcontracts(taskId) {
  var cont = document.getElementById('cardSubcontractsContainer');
  return api('/tasks/' + encodeURIComponent(taskId) + '/subcontracts')
    .then(function(subs) {
      window._curCardSubcontracts = Array.isArray(subs) ? subs : [];
      var curSub = (window._curCardSubcontracts || []).find(function(s){ return String(s.task_id) === String(taskId); });

      // Загружаем сохраненную спецификацию только если нет несохраненного черновика
      if (!S.cardDraft || !S.cardDraft._smrDirty) {
        if (curSub && curSub.calculation_details && Array.isArray(curSub.calculation_details.lines) && curSub.calculation_details.lines.length) {
          window._taskSmrSpec = window._taskSmrSpec || {};
          window._taskSmrSpec[taskId] = JSON.parse(JSON.stringify(curSub.calculation_details.lines));
          if (Array.isArray(curSub.calculation_details.third_party_lines)) {
            window._taskThirdPartySpec = window._taskThirdPartySpec || {};
            window._taskThirdPartySpec[taskId] = JSON.parse(JSON.stringify(curSub.calculation_details.third_party_lines));
          }
          if (curSub.calculation_details.tax_details) {
            window._taskSmrTaxConfig = window._taskSmrTaxConfig || {};
            window._taskSmrTaxConfig[taskId] = {
              mode: curSub.calculation_details.tax_details.mode,
              included: curSub.calculation_details.tax_details.taxIncluded
            };
          }
        }
      }

      if (window.renderCardSmrCalculator) window.renderCardSmrCalculator(taskId);
      if (!cont) return;

      if (!window._curCardSubcontracts.length) {
        var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); }) || {};
        var taskContr = (t.contractor || '').trim();
        var contrObj = taskContr ? (S.contractors || []).find(function(c){ return c.name_short === taskContr; }) : null;

        if (taskContr) {
          cont.innerHTML = '<div style="background:#fff;border:1.5px solid var(--border);border-radius:8px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:10px">' +
              '<div>' +
                '<div style="font-size:.74rem;color:var(--text-3);text-transform:uppercase;font-weight:700">Исполнитель СМР на объекте (Подрядчик)</div>' +
                '<div style="font-weight:700;font-size:1.05rem;color:var(--text);margin-top:2px">🏢 ' + escHtml(taskContr) + '</div>' +
                '<div style="font-size:.78rem;color:var(--text-2);margin-top:2px">' +
                  (contrObj && contrObj.inn ? ('ИНН: ' + escHtml(contrObj.inn)) : '') +
                  (contrObj && contrObj.phone ? (' • Тел: ' + escHtml(contrObj.phone)) : '') +
                '</div>' +
              '</div>' +
              '<span class="badge b-blue" style="font-size:.8rem;padding:4px 10px;font-weight:600">Назначен в заявке</span>' +
            '</div>' +
            '<div style="background:var(--bg);padding:10px 12px;border-radius:6px;font-size:.82rem;margin-bottom:12px;color:var(--text-2)">' +
              'Подрядчик выбран в карточке заявки. Нажмите «Оформить через Мастер», чтобы рассчитать стоимость по прайс-листу (КС / К10), согласовать смету и сформировать официальные документы.' +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
              '<button class="btn btn-sm btn-primary" onclick="openSubcontractWizardModal(\'' + escHtml(taskId) + '\')">🪄 Оформить через Мастер поручения</button>' +
              '<button class="btn btn-sm btn-ghost" onclick="openContractorPicker(\'' + escHtml(taskId) + '\')">🔍 Сменить подрядчика</button>' +
              '<button class="btn btn-sm btn-ghost" style="color:var(--red);border-color:#fca5a5" onclick="removeContractorFromTask(\'' + escHtml(taskId) + '\')">❌ Убрать подрядчика</button>' +
            '</div>' +
          '</div>';
          return;
        }

        cont.innerHTML = '<div style="background:var(--bg);padding:14px;border-radius:8px;text-align:center;color:var(--text-3);font-size:.85rem">' +
          '<span>Подрядчик на объект еще не назначен.</span> ' +
          '<button class="btn btn-sm btn-link" onclick="openSubcontractWizardModal(\'' + escHtml(taskId) + '\')">+ Назначить исполнителя через Мастер</button>' +
        '</div>';
        return;
      }

      var html = '<div style="display:flex;flex-direction:column;gap:10px">';
      subs.forEach(function(sub) {
        var statusMap = {
          assigned: { label: 'Назначен', cls: 'b-pink' },
          in_progress: { label: 'В монтаже', cls: 'b-install' },
          smr_done: { label: 'СМР выполнено', cls: 'b-green' },
          correction: { label: 'На исправлении', cls: 'b-red' },
          accepted: { label: 'Принято', cls: 'b-acceptance' },
          paid: { label: 'Оплачено', cls: 'b-payment' }
        };
        var st = statusMap[sub.status] || { label: sub.status, cls: 'b-gray' };
        var priceStr = Number(sub.price_agreed || 0) > 0 ? fmtMoney(sub.price_agreed) : '—';
        var deadlineStr = sub.deadline ? sub.deadline.slice(0, 10).split('-').reverse().join('.') : '—';

        html += '<div style="border:1.5px solid var(--border);border-radius:8px;padding:12px;background:#fff">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
            '<div>' +
              '<div style="font-weight:700;font-size:.95rem;color:var(--text)">' + escHtml(sub.contractor_name || 'Подрядчик не выбран') + '</div>' +
              '<div style="font-size:.78rem;color:var(--text-3)">ИНН: ' + escHtml(sub.contractor_inn || '—') + (sub.contractor_phone ? ' • Тел: ' + escHtml(sub.contractor_phone) : '') + '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px">' +
              '<span class="badge ' + st.cls + '" style="font-size:.78rem;padding:3px 8px;font-weight:600">' + st.label + '</span>' +
              '<select class="btn btn-sm btn-ghost" onchange="changeSubcontractStatus(\'' + escHtml(taskId) + '\', ' + sub.id + ', this.value)" style="padding:2px 6px;font-size:.75rem">' +
                '<option value="assigned"' + (sub.status === 'assigned' ? ' selected' : '') + '>Назначен</option>' +
                '<option value="in_progress"' + (sub.status === 'in_progress' ? ' selected' : '') + '>В монтаже</option>' +
                '<option value="smr_done"' + (sub.status === 'smr_done' ? ' selected' : '') + '>СМР выполнено</option>' +
                '<option value="correction"' + (sub.status === 'correction' ? ' selected' : '') + '>На исправлении</option>' +
                '<option value="accepted"' + (sub.status === 'accepted' ? ' selected' : '') + '>Принято</option>' +
                '<option value="paid"' + (sub.status === 'paid' ? ' selected' : '') + '>Оплачено</option>' +
              '</select>' +
            '</div>' +
          '</div>' +

          '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:8px;background:var(--bg);padding:8px 10px;border-radius:6px;font-size:.8rem;margin-bottom:10px">' +
            '<div>Вид работ: <b>' + escHtml(sub.work_type) + '</b></div>' +
            '<div>Сумма субподряда: <b style="color:var(--blue)">' + priceStr + '</b></div>' +
            (sub.own_company_name ? '<div>Генподрядчик: <b style="color:var(--primary)">' + escHtml(sub.own_company_name) + '</b></div>' : '') +
            (sub.contract_number ? '<div>Договор: <b>' + escHtml(sub.contract_number) + (sub.contract_date ? (' от ' + escHtml(sub.contract_date.slice(0,10).split('-').reverse().join('.'))) : '') + '</b></div>' : '') +
            '<div>Срок (дедлайн): <b>' + deadlineStr + '</b></div>' +
            '<div>Монтажник: <b>' + escHtml(sub.installer_fio || 'Не назначен') + '</b></div>' +
            (sub.installer_phone ? '<div>Телефон: ' + escHtml(sub.installer_phone) + '</div>' : '') +
            (sub.auto_number ? '<div>Авто: ' + escHtml(sub.auto_number) + '</div>' : '') +
          '</div>' +

          '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
              '<button class="btn btn-sm btn-ghost" onclick="generateSubcontractDoc(\'' + escHtml(taskId) + '\', ' + sub.id + ', \'contract\')" title="Сформировать Договор подряда">🤝 Договор (.docx)</button>' +
              '<button class="btn btn-sm btn-ghost" onclick="generateSubcontractDoc(\'' + escHtml(taskId) + '\', ' + sub.id + ', \'order_subcontract\')" title="Сформировать Заказ-наряд (Приложение 2 к Договору)">📄 Заказ-наряд (.docx)</button>' +
              '<button class="btn btn-sm btn-ghost" onclick="generateSubcontractDoc(\'' + escHtml(taskId) + '\', ' + sub.id + ', \'completion_act\')" title="Сформировать двухсторонний Акт сдачи-приемки работ («Сдал/Принял»)">🤝 Акт «Сдал/Принял» (.docx)</button>' +
              '<button class="btn btn-sm btn-ghost" onclick="generateSubcontractDoc(\'' + escHtml(taskId) + '\', ' + sub.id + ', \'invoice\')" title="Сформировать Счет на оплату от Подрядчика">💰 Счет от Подрядчика (.docx)</button>' +
              '<button class="btn btn-sm btn-ghost" onclick="generateSubcontractDoc(\'' + escHtml(taskId) + '\', ' + sub.id + ', \'tmc_act\')" title="Сформировать Акт списания материалов (ТМЦ) объекта">📦 Акт расхода ТМЦ (.docx)</button>' +
              '<button class="btn btn-sm btn-ghost" onclick="generateSubcontractDoc(\'' + escHtml(taskId) + '\', ' + sub.id + ', \'permit_letter\')" title="Сформировать официальное письмо на допуск монтажников">🪪 Допуск (.docx)</button>' +
              '<button class="btn btn-sm btn-ghost" onclick="generateSubcontractDoc(\'' + escHtml(taskId) + '\', ' + sub.id + ', \'power_attorney\')" title="Сформировать доверенность М-2 на получение ТМЦ">📦 Доверенность М-2 (.docx)</button>' +
            '</div>' +
            '<div style="display:flex;gap:6px">' +
              '<button class="btn btn-sm btn-ghost" onclick="openSubcontractWizardModal(\'' + escHtml(taskId) + '\', ' + sub.id + ')" title="Редактировать в Мастере">✏️ Редактировать</button>' +
              '<button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="deleteSubcontract(\'' + escHtml(taskId) + '\', ' + sub.id + ')" title="Удалить">🗑️</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      cont.innerHTML = html;
    })
    .catch(function(err) {
      cont.innerHTML = '<div style="color:var(--red)">Ошибка загрузки субподрядов: ' + escHtml(err.message) + '</div>';
    });
}

function openSubcontractModal(taskId, editId) {
  var old = document.getElementById('_subcontract_modal');
  if (old) old.remove();

  var specPromise = (Array.isArray(S.specialists) && S.specialists.length)
    ? Promise.resolve(S.specialists)
    : api('/specialists').then(function(specs){ S.specialists = specs || []; return S.specialists; }).catch(function(){ return []; });

  specPromise.then(function() {
    _renderSubcontractModal(taskId, editId);
  });
}

function _renderSubcontractModal(taskId, editId) {
  var old = document.getElementById('_subcontract_modal');
  if (old) old.remove();

  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); }) || {};
  var editSub = editId ? ((window._curCardSubcontracts || []).find(function(s){ return String(s.id) === String(editId); }) || null) : null;

  function getRealSubcontractors() {
    return (S.contractors || []).filter(function(c) {
      if (!c || !c.name_short) return false;
      if (c.type === 'customer') return false;
      if (String(c.inn || '').startsWith('CUST-')) return false;
      return true;
    }).sort(function(a, b) {
      return (a.name_short || '').localeCompare(b.name_short || '', 'ru');
    });
  }

  var subsList = getRealSubcontractors();

  var selectedCId = '';
  var selectedCName = '';
  var selectedCInn = '';

  var taskContr = (t.contractor || '').trim();

  if (editSub) {
    if (editSub.contractor_id) {
      selectedCId = String(editSub.contractor_id);
      var foundSub = subsList.find(function(c){ return String(c.id) === String(editSub.contractor_id); });
      if (foundSub) {
        selectedCName = foundSub.name_short;
        selectedCInn = foundSub.inn || '';
      } else {
        selectedCName = editSub.contractor_name || ('Подрядчик #' + editSub.contractor_id);
        selectedCInn = editSub.contractor_inn || '';
      }
    } else if (editSub.contractor_name) {
      selectedCName = editSub.contractor_name;
      var foundByName = subsList.find(function(c){
        return c.name_short.trim().toLowerCase() === editSub.contractor_name.trim().toLowerCase() ||
               (c.name_full && c.name_full.trim().toLowerCase() === editSub.contractor_name.trim().toLowerCase());
      });
      if (foundByName) {
        selectedCId = String(foundByName.id);
        selectedCInn = foundByName.inn || '';
      }
    }
  } else if (taskContr) {
    // Многоступенчатый поиск назначенного подрядчика
    var matchByTask = subsList.find(function(c){ return c.name_short.trim().toLowerCase() === taskContr.toLowerCase(); });
    if (!matchByTask) {
      matchByTask = subsList.find(function(c){ return (c.name_full || '').trim().toLowerCase() === taskContr.toLowerCase(); });
    }
    var normTaskContr = taskContr.replace(/^(?:ИП|ООО|СЗ|АО|ЗАО)s+/i, '').trim().toLowerCase();
    if (!matchByTask && normTaskContr.length >= 3) {
      matchByTask = subsList.find(function(c){
        var normC = (c.name_short || '').replace(/^(?:ИП|ООО|СЗ|АО|ЗАО)s+/i, '').trim().toLowerCase();
        return normC === normTaskContr;
      });
    }
    if (!matchByTask && normTaskContr.length >= 3) {
      matchByTask = subsList.find(function(c){
        var normC = (c.name_short || '').toLowerCase();
        return normC.indexOf(normTaskContr) !== -1 || normTaskContr.indexOf(normC) !== -1;
      });
    }

    if (matchByTask) {
      selectedCId = String(matchByTask.id);
      selectedCName = matchByTask.name_short;
      selectedCInn = matchByTask.inn || '';
    } else {
      selectedCId = '';
      selectedCName = taskContr;
      selectedCInn = 'из заявки';
    }
  }

  window._submSelectContractor = function(id, name, inn) {
    var inpHid = document.getElementById('subm_contractor');
    if (inpHid) inpHid.value = id;
    var inpNameHid = document.getElementById('subm_contractor_name_input');
    if (inpNameHid) inpNameHid.value = name;
    var nameEl = document.getElementById('subm_selected_c_name');
    if (nameEl) nameEl.textContent = name;
    var innEl = document.getElementById('subm_selected_c_inn');
    if (innEl) innEl.textContent = inn ? inn : 'не указан';

    var selBox = document.getElementById('subm_contractor_selected_box');
    if (selBox) selBox.style.display = 'flex';
    var pickBox = document.getElementById('subm_contractor_picker_box');
    if (pickBox) pickBox.style.display = 'none';
    window._submToggleNewForm(false);
  };

  window._submClearContractor = function() {
    var inpHid = document.getElementById('subm_contractor');
    if (inpHid) inpHid.value = '';
    var inpNameHid = document.getElementById('subm_contractor_name_input');
    if (inpNameHid) inpNameHid.value = '';
    var selBox = document.getElementById('subm_contractor_selected_box');
    if (selBox) selBox.style.display = 'none';
    var pickBox = document.getElementById('subm_contractor_picker_box');
    if (pickBox) pickBox.style.display = 'block';

    var searchInput = document.getElementById('subm_contractor_search');
    if (searchInput) {
      searchInput.value = '';
      window._submFilterList('');
      searchInput.focus();
    }
  };

  window._submFilterList = function(q) {
    var query = (q || '').trim().toLowerCase();
    var listEl = document.getElementById('subm_contractors_list');
    var countEl = document.getElementById('subm_c_count');
    if (!listEl) return;

    var currentList = getRealSubcontractors();
    var filtered = currentList.filter(function(c) {
      if (!query) return true;
      return (c.name_short || '').toLowerCase().indexOf(query) !== -1 ||
             (c.name_full || '').toLowerCase().indexOf(query) !== -1 ||
             (c.inn || '').toLowerCase().indexOf(query) !== -1;
    });

    if (countEl) countEl.textContent = 'Подрядчиков в базе: ' + filtered.length;

    if (!filtered.length) {
      listEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-3);font-size:.82rem">' +
        'Подрядчик не найден среди действующих.<br>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="window._submToggleNewForm(true)" style="color:var(--orange-dark);font-weight:600;margin-top:6px">' +
          '➕ Ввести нового подрядчика' +
        '</button>' +
      '</div>';
      return;
    }

    listEl.innerHTML = filtered.map(function(c) {
      var safeName = escHtml(c.name_short);
      var safeInn = escHtml(c.inn || '—');
      return '<div class="subm-c-row" style="cursor:pointer;padding:7px 10px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;transition:background .1s" ' +
        'onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'" ' +
        'onclick="window._submSelectContractor(\'' + c.id + '\', \'' + safeName.replace(/'/g, "\\'") + '\', \'' + safeInn.replace(/'/g, "\\'") + '\')">' +
          '<div style="font-weight:600;font-size:.82rem;color:var(--text)">🏢 ' + safeName + '</div>' +
          '<div class="t3" style="font-size:.75rem">ИНН ' + safeInn + '</div>' +
      '</div>';
    }).join('');
  };

  window._submToggleNewForm = function(show) {
    var box = document.getElementById('subm_new_contractor_box');
    if (!box) return;
    var isShown = (show !== undefined) ? show : (box.style.display === 'none');
    box.style.display = isShown ? 'block' : 'none';
    if (isShown) {
      var innInp = document.getElementById('qsub_inn');
      if (innInp) innInp.focus();
    }
  };

  window._submFetchDadata = function() {
    var innInp = document.getElementById('qsub_inn');
    var btn = document.getElementById('qsub_dadata_btn');
    var inn = innInp ? innInp.value.trim() : '';
    if (!inn) return alert('Введите ИНН организации или ИП');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Поиск...'; }

    api('/dadata/party?inn=' + encodeURIComponent(inn))
      .then(function(res) {
        if (res.error) throw new Error(res.error);
        var nameInp = document.getElementById('qsub_name');
        var phoneInp = document.getElementById('qsub_phone');
        if (nameInp && (res.name_short || res.name_full || res.name)) {
          nameInp.value = res.name_short || res.name_full || res.name;
        }
        if (phoneInp && res.phones && res.phones.length && !phoneInp.value) {
          phoneInp.value = res.phones[0];
        }
      })
      .catch(function(err) {
        alert('Не удалось получить данные по ИНН: ' + err.message);
      })
      .finally(function() {
        if (btn) { btn.disabled = false; btn.textContent = '🔍 По ИНН'; }
      });
  };

  window._submSaveNewContractor = function() {
    var inn = (document.getElementById('qsub_inn').value || '').trim();
    var name = (document.getElementById('qsub_name').value || '').trim();
    var phone = (document.getElementById('qsub_phone').value || '').trim();

    if (!name) return alert('Укажите краткое наименование подрядчика!');

    var saveBtn = document.getElementById('qsub_save_btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Сохранение...'; }

    var data = {
      type: 'subcontractor',
      name_short: name,
      name_full: name,
      inn: inn || null,
      phone: phone || null
    };

    api('/contractors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function(newContractor) {
      if (newContractor.error) throw new Error(newContractor.error);
      if (!S.contractors) S.contractors = [];
      S.contractors.push(newContractor);
      window._submSelectContractor(newContractor.id, newContractor.name_short, newContractor.inn || '');
      window._submToggleNewForm(false);
    })
    .catch(function(err) {
      alert('Ошибка добавления подрядчика: ' + err.message);
    })
    .finally(function() {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✓ Сохранить и выбрать'; }
    });
  };

  // --- Данные монтажников и справочника специалистов ---
  var curSpecId = editSub ? editSub.specialist_id : null;
  var curFio = editSub ? (editSub.installer_fio || '') : '';
  var curPhone = editSub ? (editSub.installer_phone || '') : '';
  var curPass = editSub ? (editSub.installer_passport || '') : '';
  var curAuto = editSub ? (editSub.auto_number || '') : '';

  if (curSpecId) {
    var spById = (S.specialists || []).find(function(s){ return String(s.id) === String(curSpecId); });
    if (spById) {
      if (!curFio) curFio = spById.full_name || '';
      if (!curPhone) curPhone = spById.phone || '';
      if (!curPass) curPass = spById.passport_raw || spById.passport_series_number || '';
      if (!curAuto) curAuto = spById.auto_number || '';
    }
  }

  if (!curSpecId && curFio) {
    var spMatch = (S.specialists || []).find(function(s){
      return (s.full_name || '').trim().toLowerCase() === curFio.trim().toLowerCase();
    });
    if (spMatch) {
      curSpecId = spMatch.id;
      if (!curPhone) curPhone = spMatch.phone || '';
      if (!curPass) curPass = spMatch.passport_raw || spMatch.passport_series_number || '';
      if (!curAuto) curAuto = spMatch.auto_number || '';
    }
  }

  if (!curSpecId && !curFio && selectedCName) {
    var cleanContr = selectedCName.replace(/^(?:ИП|ООО|СЗ|АО|ЗАО)\s+/i, '').trim().toLowerCase();
    var spMatchContr = (S.specialists || []).find(function(s){
      return (s.full_name || '').trim().toLowerCase() === cleanContr;
    });
    if (spMatchContr) {
      curSpecId = spMatchContr.id;
      curFio = spMatchContr.full_name;
      curPhone = spMatchContr.phone || '';
      curPass = spMatchContr.passport_raw || spMatchContr.passport_series_number || '';
      curAuto = spMatchContr.auto_number || '';
    }
  }

  function buildSpecsOptions(selectedId) {
    var specs = (S.specialists || []).slice().sort(function(a, b){
      return (a.full_name || '').localeCompare(b.full_name || '', 'ru');
    });

    var html = '<option value="">-- Выберите монтажника из справочника --</option>' +
      '<option value="__new__">➕ Добавить нового монтажника в справочник...</option>' +
      '<option value="__manual__">✏️ Ввести ФИО вручную (без справочника)...</option>';

    if (specs.length) {
      html += '<optgroup label="Специалисты / Монтажники (' + specs.length + ')">';
      specs.forEach(function(sp) {
        var isSel = selectedId && String(sp.id) === String(selectedId);
        var label = sp.full_name;
        if (sp.position) label += ' — ' + sp.position;
        else if (sp.organization) label += ' (' + sp.organization + ')';
        html += '<option value="' + sp.id + '"' + (isSel ? ' selected' : '') + '>' + escHtml(label) + '</option>';
      });
      html += '</optgroup>';
    }
    return html;
  }

  window._submOnSpecialistChange = function(val) {
    var fioInp = document.getElementById('subm_installer_fio');
    var hidSpecId = document.getElementById('subm_specialist_id');
    var phoneInp = document.getElementById('subm_installer_phone');
    var passInp = document.getElementById('subm_installer_pass');
    var autoInp = document.getElementById('subm_auto');

    if (val === '__new__') {
      window._submToggleNewSpecialistForm(true);
      return;
    }

    window._submToggleNewSpecialistForm(false);

    if (val === '__manual__') {
      if (hidSpecId) hidSpecId.value = '';
      if (fioInp) {
        fioInp.style.display = 'block';
        fioInp.focus();
      }
      return;
    }

    if (!val) {
      if (hidSpecId) hidSpecId.value = '';
      if (fioInp) {
        fioInp.value = '';
        fioInp.style.display = 'none';
      }
      return;
    }

    var sp = (S.specialists || []).find(function(s){ return String(s.id) === String(val); });
    if (sp) {
      if (hidSpecId) hidSpecId.value = sp.id;
      if (fioInp) {
        fioInp.value = sp.full_name || '';
        fioInp.style.display = 'none';
      }
      if (phoneInp) phoneInp.value = sp.phone || '';
      if (passInp) passInp.value = sp.passport_raw || sp.passport_series_number || '';
      if (autoInp) autoInp.value = sp.auto_number || '';
    }
  };

  window._submToggleNewSpecialistForm = function(show) {
    var box = document.getElementById('subm_new_spec_box');
    if (!box) return;
    var isShown = (show !== undefined) ? show : (box.style.display === 'none');
    box.style.display = isShown ? 'block' : 'none';
    if (isShown) {
      var nameInp = document.getElementById('qspec_name');
      if (nameInp) nameInp.focus();
    }
  };

  window._submSaveNewSpecialist = function() {
    var name = (document.getElementById('qspec_name').value || '').trim();
    var phone = (document.getElementById('qspec_phone').value || '').trim();
    var pass = (document.getElementById('qspec_pass').value || '').trim();
    var auto = (document.getElementById('qspec_auto').value || '').trim();
    var org = (document.getElementById('qspec_org').value || '').trim();
    var pos = (document.getElementById('qspec_pos').value || '').trim() || 'Монтажник СКС';

    if (!name) return alert('Укажите ФИО монтажника!');

    var saveBtn = document.getElementById('qspec_save_btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Сохранение...'; }

    var data = {
      full_name: name,
      phone: phone || null,
      passport_raw: pass || null,
      passport_series_number: pass || null,
      auto_number: auto || null,
      organization: org || (selectedCName || 'ООО "Ультима"'),
      position: pos
    };

    api('/specialists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function(newSpec) {
      if (newSpec.error) throw new Error(newSpec.error);
      if (!S.specialists) S.specialists = [];
      S.specialists.push(newSpec);

      var sel = document.getElementById('subm_specialist_select');
      if (sel) {
        sel.innerHTML = buildSpecsOptions(newSpec.id);
        sel.value = String(newSpec.id);
      }
      window._submOnSpecialistChange(newSpec.id);
      window._submToggleNewSpecialistForm(false);
    })
    .catch(function(err) {
      alert('Ошибка добавления монтажника: ' + err.message);
    })
    .finally(function() {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✓ Сохранить и выбрать'; }
    });
  };

  var curWorkType = editSub ? editSub.work_type : (t.work_type || 'Монтаж СКС');
  var curPrice = editSub ? (editSub.price_agreed != null ? editSub.price_agreed : '') : '';
  var curDeadline = (editSub && editSub.deadline) ? editSub.deadline.slice(0, 10) : ((t.deadline) ? String(t.deadline).slice(0, 10) : '');
  var curComment = editSub ? (editSub.comment || '') : '';

  var isAlreadyAssigned = !!(selectedCName || t.contractor);
  var modalTitle = isAlreadyAssigned ? '✏️ Условия субподряда и состав монтажников' : '🤝 Назначить субподрядчика';
  var submitBtnLabel = isAlreadyAssigned ? 'Сохранить изменения' : 'Назначить подрядчика';

  var modal = document.createElement('div');
  modal.id = '_subcontract_modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = '<div class="modal-box" style="max-width:580px;width:95%">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">' +
      '<h3 style="margin:0">' + modalTitle + '</h3>' +
      '<button class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_subcontract_modal\').remove()">✕</button>' +
    '</div>' +

    '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div>' +
        '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Организация / Подрядчик СМР *</label>' +
        '<input type="hidden" id="subm_contractor" value="' + escHtml(selectedCId) + '">' +
        '<input type="hidden" id="subm_contractor_name_input" value="' + escHtml(selectedCName) + '">' +

        '<div id="subm_contractor_selected_box" style="display:' + (selectedCName ? 'flex' : 'none') + ';align-items:center;justify-content:space-between;padding:8px 12px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px">' +
          '<div>' +
            '<div style="font-weight:700;color:#166534;font-size:.88rem">🏢 <span id="subm_selected_c_name">' + escHtml(selectedCName) + '</span></div>' +
            '<div style="font-size:.75rem;color:#15803d">ИНН: <span id="subm_selected_c_inn">' + escHtml(selectedCInn || 'не указан') + '</span></div>' +
          '</div>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="window._submClearContractor()" style="font-size:.78rem;color:#166534;padding:3px 8px">Сменить ✕</button>' +
        '</div>' +

        '<div id="subm_contractor_picker_box" style="display:' + (selectedCName ? 'none' : 'block') + '">' +
          '<input type="text" id="subm_contractor_search" placeholder="🔍 Поиск по названию или ИНН..." style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;margin-bottom:6px" oninput="window._submFilterList(this.value)">' +
          '<div id="subm_contractors_list" style="max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;background:var(--bg)"></div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">' +
            '<span id="subm_c_count" style="font-size:.74rem;color:var(--text-3)">Подрядчиков в базе: ' + subsList.length + '</span>' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="window._submToggleNewForm()" style="color:var(--orange-dark);font-weight:600;font-size:.78rem;padding:2px 8px">' +
              '➕ Ввести нового подрядчика' +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div id="subm_new_contractor_box" style="display:none;background:#fafaf9;border:1.5px solid var(--orange);border-radius:8px;padding:10px;margin-top:8px">' +
          '<div style="font-weight:700;font-size:.82rem;margin-bottom:8px;color:var(--text)">Ввод нового подрядчика (СМР)</div>' +
          '<div style="display:flex;gap:8px;margin-bottom:8px">' +
            '<input type="text" id="qsub_inn" placeholder="ИНН организации или ИП" style="flex:1;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem">' +
            '<button type="button" class="btn btn-sm btn-ghost" id="qsub_dadata_btn" onclick="window._submFetchDadata()" style="white-space:nowrap;font-size:.78rem;border:1px solid var(--border)">🔍 По ИНН</button>' +
          '</div>' +
          '<div style="margin-bottom:8px">' +
            '<input type="text" id="qsub_name" placeholder="Краткое наименование *" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem">' +
          '</div>' +
          '<div style="margin-bottom:8px">' +
            '<input type="text" id="qsub_phone" placeholder="Телефон (+7...)" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem">' +
          '</div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end">' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="window._submToggleNewForm(false)">Отмена</button>' +
            '<button type="button" class="btn btn-sm btn-primary" id="qsub_save_btn" onclick="window._submSaveNewContractor()">✓ Сохранить и выбрать</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div>' +
          '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Вид работ *</label>' +
          '<select id="subm_work_type" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            ['Монтаж СКС', 'Сварка и монтаж ВОЛС', 'Пусконаладочные работы (ПНР)', 'Обследование объекта', 'Электромонтажные работы'].map(function(wt){
              return '<option value="' + wt + '"' + (curWorkType === wt ? ' selected' : '') + '>' + wt + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Согласованная цена (₽)</label>' +
          '<input type="number" id="subm_price" value="' + escHtml(curPrice) + '" placeholder="0" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
        '</div>' +
      '</div>' +

      '<div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
          '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin:0">Срок сдачи субподрядчиком (дедлайн монтажа)</label>' +
          (t.deadline ? ('<span style="font-size:.72rem;color:var(--text-3)">Дедлайн Заказчика: <b style="color:var(--red)">' + (String(t.deadline).slice(0, 10).split('-').reverse().join('.')) + '</b></span>') : '') +
        '</div>' +
        '<input type="date" id="subm_deadline" value="' + escHtml(curDeadline) + '" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
        '<div style="font-size:.71rem;color:var(--text-3);margin-top:2px">Срок сдачи работ субподрядчиком нашему ПМ (рекомендуется за 2-3 дня до дедлайна Заказчика).</div>' +
      '</div>' +

      '<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:6px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<div style="font-weight:700;font-size:.82rem;color:var(--text)">Данные монтажника (для Заказ-наряда и Допуска):</div>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="window._submToggleNewSpecialistForm()" style="color:var(--orange-dark);font-size:.74rem;font-weight:600;padding:1px 6px">' +
            '➕ Добавить в справочник' +
          '</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">' +
          '<div>' +
            '<label style="display:block;font-size:.75rem;color:var(--text-3);margin-bottom:3px">ФИО монтажника *</label>' +
            '<select id="subm_specialist_select" onchange="window._submOnSpecialistChange(this.value)" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
              buildSpecsOptions(curSpecId) +
            '</select>' +
            '<input type="hidden" id="subm_specialist_id" value="' + escHtml(curSpecId || '') + '">' +
            '<input type="text" id="subm_installer_fio" value="' + escHtml(curFio) + '" placeholder="Иванов Иван Иванович" style="width:100%;margin-top:4px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem;display:' + ((!curSpecId && curFio) ? 'block' : 'none') + '">' +
          '</div>' +
          '<div>' +
            '<label style="display:block;font-size:.75rem;color:var(--text-3);margin-bottom:3px">Телефон</label>' +
            '<input type="text" id="subm_installer_phone" value="' + escHtml(curPhone) + '" placeholder="+7 (900) 000-00-00" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<div>' +
            '<label style="display:block;font-size:.75rem;color:var(--text-3);margin-bottom:3px">Паспортные данные</label>' +
            '<input type="text" id="subm_installer_pass" value="' + escHtml(curPass) + '" placeholder="Серия, номер, кем выдан" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
          '</div>' +
          '<div>' +
            '<label style="display:block;font-size:.75rem;color:var(--text-3);margin-bottom:3px">Автомобиль (госномер)</label>' +
            '<input type="text" id="subm_auto" value="' + escHtml(curAuto) + '" placeholder="х777хх 178" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
          '</div>' +
        '</div>' +

        '<div id="subm_new_spec_box" style="display:none;background:#fafaf9;border:1.5px solid var(--orange);border-radius:8px;padding:10px;margin-top:8px">' +
          '<div style="font-weight:700;font-size:.82rem;margin-bottom:8px;color:var(--text)">➕ Добавление нового монтажника в справочник</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
            '<input type="text" id="qspec_name" placeholder="ФИО полностью *" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
            '<input type="text" id="qspec_phone" placeholder="Телефон (+7...)" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
            '<input type="text" id="qspec_pass" placeholder="Паспортные данные (серия, номер, кем выдан)" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
            '<input type="text" id="qspec_auto" placeholder="Автомобиль (госномер)" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
            '<input type="text" id="qspec_org" placeholder="Организация" value="' + escHtml(selectedCName || 'ООО "Ультима"') + '" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
            '<input type="text" id="qspec_pos" placeholder="Должность" value="Монтажник СКС" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
          '</div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end">' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="window._submToggleNewSpecialistForm(false)">Отмена</button>' +
            '<button type="button" class="btn btn-sm btn-primary" id="qspec_save_btn" onclick="window._submSaveNewSpecialist()">✓ Сохранить и выбрать</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div>' +
        '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Примечание</label>' +
        '<textarea id="subm_comment" rows="2" placeholder="Особые условия, график работ..." style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem;resize:vertical">' + escHtml(curComment) + '</textarea>' +
      '</div>' +
    '</div>' +

    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:1.25rem;border-top:1px solid var(--border);padding-top:10px">' +
      (isAlreadyAssigned ? '<button type="button" class="btn btn-sm btn-ghost" style="color:var(--red);border:1px solid #fca5a5;padding:4px 10px" onclick="document.getElementById(\'_subcontract_modal\').remove();removeContractorFromTask(\'' + escHtml(taskId) + '\')">❌ Убрать подрядчика</button>' : '<div></div>') +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_subcontract_modal\').remove()">Отмена</button>' +
        '<button class="btn btn-sm btn-primary" onclick="saveSubcontract(\'' + escHtml(taskId) + '\'' + (editId ? (', ' + editId) : '') + ')">' + submitBtnLabel + '</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });

  if (!selectedCName) {
    window._submFilterList('');
  }
}

function saveSubcontract(taskId, editId) {
  var contractorId = document.getElementById('subm_contractor').value;
  var contractorName = (document.getElementById('subm_contractor_name_input') ? document.getElementById('subm_contractor_name_input').value : '').trim();
  if (!contractorName) {
    var nameEl = document.getElementById('subm_selected_c_name');
    if (nameEl) contractorName = nameEl.textContent.trim();
  }

  var workType = document.getElementById('subm_work_type').value;
  var price = parseFloat(document.getElementById('subm_price').value) || 0;
  var deadline = document.getElementById('subm_deadline').value || null;

  var specId = document.getElementById('subm_specialist_id') ? document.getElementById('subm_specialist_id').value : '';
  var fio = (document.getElementById('subm_installer_fio') ? document.getElementById('subm_installer_fio').value : '').trim();

  if (!fio && specId) {
    var chosenSp = (S.specialists || []).find(function(s){ return String(s.id) === String(specId); });
    if (chosenSp) fio = chosenSp.full_name;
  }

  var phone = document.getElementById('subm_installer_phone').value.trim();
  var pass = document.getElementById('subm_installer_pass').value.trim();
  var auto = document.getElementById('subm_auto').value.trim();
  var comment = document.getElementById('subm_comment').value.trim();

  if (!contractorId && !contractorName) return alert('Выберите подрядчика из списка или введите нового!');
  if (!workType) return alert('Укажите вид работ!');

  var body = {
    contractor_id: (contractorId && !isNaN(parseInt(contractorId))) ? parseInt(contractorId) : null,
    contractor_name: contractorName || null,
    work_type: workType,
    price_agreed: price,
    deadline: deadline,
    specialist_id: (specId && !isNaN(parseInt(specId))) ? parseInt(specId) : null,
    installer_fio: fio || null,
    installer_phone: phone || null,
    installer_passport: pass || null,
    auto_number: auto || null,
    comment: comment
  };

  var url = editId ? ('/subcontracts/' + editId) : ('/tasks/' + encodeURIComponent(taskId) + '/subcontracts');
  var method = editId ? 'PUT' : 'POST';

  api(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  .then(function(res) {
    if (res.error) throw new Error(res.error);
    var modal = document.getElementById('_subcontract_modal');
    if (modal) modal.remove();
    var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
    var targetContr = contractorName;
    if (t && targetContr) {
      t.contractor = targetContr;
      t.status = 'progress';
      if (t.macroStatus === 'new' || !t.macroStatus) {
        t.macroStatus = 'assigned';
        t.stageNum = 1;
      }
      api('/tasks/' + encodeURIComponent(taskId), { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ contractor: targetContr, status: 'progress', macroStatus: t.macroStatus, stageNum: t.stageNum }) 
      });
    }
    loadCardSubcontracts(taskId);
    loadCardDocuments(taskId);
    if (typeof renderApp === 'function') renderApp();
  })
  .catch(function(err) {
    alert('Ошибка сохранения субподряда: ' + err.message);
  });
}

function changeSubcontractStatus(taskId, subId, newStatus) {
  api('/subcontracts/' + subId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus })
  })
  .then(function() {
    loadCardSubcontracts(taskId);
  })
  .catch(function(err) {
    alert('Ошибка смены статуса: ' + err.message);
  });
}

function deleteSubcontract(taskId, subId) {
  if (!confirm('Удалить данный субподряд?')) return;
  api('/subcontracts/' + subId, { method: 'DELETE' })
    .then(function() {
      loadCardSubcontracts(taskId);
      loadCardDocuments(taskId);
    })
    .catch(function(err) {
      alert('Ошибка удаления: ' + err.message);
    });
}

window.generateTaskDoc = function(taskId, docType, optSubcontractId) {
  var docTitles = {
    order_subcontract: 'Заявка (Заказ на работы) [Прил. №2]',
    completion_act: 'Акт вып. работ [к заказу]',
    invoice: 'Счет на оплату',
    permit_letter: 'Письмо на допуск на объект',
    access_order: 'Заказ-наряд на работы',
    work_permit: 'Наряд-допуск на работы повышенной опасности',
    tmc_act: 'Отчет монтажника (ТМЦ)',
    id_registry: 'Альбом ИД (СКС)',
    contract: 'Договор подряда',
    power_attorney: 'Доверенность на получение ТМЦ'
  };
  var label = docTitles[docType] || 'Документ';
  var body = { doc_type: docType };
  if (optSubcontractId) body.subcontract_id = optSubcontractId;

  api('/tasks/' + encodeURIComponent(taskId) + '/documents/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  .then(function(res) {
    if (res.error) throw new Error(res.error);
    if (res.file_url) {
      var link = document.createElement('a');
      link.href = res.file_url;
      link.download = (res.title || docType) + '.docx';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    if (typeof showToast === 'function') showToast('✅ ' + label + ' сформирован!');
    else alert('✅ ' + label + ' успешно сформирован и сохранен в реестре документов!');
    loadCardDocuments(taskId);
  })
  .catch(function(err) {
    alert('Ошибка формирования (' + label + '): ' + err.message);
  });
};

function generateSubcontractDoc(taskId, subcontractId, docType) {
  return window.generateTaskDoc(taskId, docType, subcontractId);
}

function generateTaskRegistryDoc(taskId) {
  return window.generateTaskDoc(taskId, 'id_registry');
}

function loadCardDocuments(taskId) {
  var cont = document.getElementById('cardDocumentsContainer');
  if (!cont) return;
  api('/tasks/' + encodeURIComponent(taskId) + '/documents')
    .then(function(docs) {
      window._cardDocsCache = Array.isArray(docs) ? docs : [];
      if (!Array.isArray(docs) || !docs.length) {
        cont.innerHTML = '<div style="color:var(--text-3);font-size:.82rem;padding:8px 0">' +
          'Официальные документы пока не сформированы и не учтены. ' +
          'Нажмите «📄 Заявка (Прил. №2)», «🪪 Допуск на объект ▾» или учтите входящий счет/акт контрагента через кнопку «📎 Учесть Счет / Акт контрагента».' +
        '</div>';
        return;
      }

      var html = '<div style="overflow-x:auto"><table class="table" style="font-size:.82rem;margin-top:.4rem;width:100%">' +
        '<thead><tr style="text-align:left;border-bottom:1.5px solid var(--border)">' +
          '<th style="padding:6px 8px">Документ</th>' +
          '<th style="padding:6px 8px">Тип</th>' +
          '<th style="padding:6px 8px">№ и Дата</th>' +
          '<th style="padding:6px 8px">Сумма</th>' +
          '<th style="padding:6px 8px">Статус</th>' +
          '<th style="padding:6px 8px">Автор / Учёт</th>' +
          '<th style="padding:6px 8px;text-align:right">Действия</th>' +
        '</tr></thead><tbody>';

      docs.forEach(function(d) {
        var rawDate = d.doc_date || d.created_at;
        var dateStr = rawDate ? rawDate.slice(0, 10).split('-').reverse().join('.') : '—';
        var meta = typeof d.meta === 'string' ? (function(){ try { return JSON.parse(d.meta); } catch(e){ return {}; } })() : (d.meta || {});
        var isIncoming = Boolean(meta.is_incoming || d.is_incoming);
        var amountVal = (meta.amount !== undefined && meta.amount !== null && meta.amount !== '') ? parseFloat(meta.amount) : (d.amount ? parseFloat(d.amount) : null);
        var curStatus = meta.status || d.status || 'generated';

        // Badges for doc_type
        var typeBadge = '<span class="badge b-gray" style="font-size:.68rem">' + escHtml(d.doc_type || 'Документ') + '</span>';
        if (d.doc_type === 'order_subcontract') typeBadge = '<span class="badge b-blue" style="font-size:.68rem">Заявка [Прил. №2]</span>';
        else if (d.doc_type === 'completion_act') typeBadge = '<span class="badge b-green" style="font-size:.68rem">Акт вып. работ</span>';
        else if (d.doc_type === 'invoice') typeBadge = '<span class="badge b-yellow" style="font-size:.68rem">Счет на оплату</span>';
        else if (d.doc_type === 'tmc_act') typeBadge = '<span class="badge b-gray" style="font-size:.68rem">Отчет ТМЦ</span>';
        else if (d.doc_type === 'id_registry') typeBadge = '<span class="badge b-purple" style="font-size:.68rem">Альбом ИД (СКС)</span>';
        else if (d.doc_type === 'permit_letter') typeBadge = '<span class="badge" style="font-size:.68rem;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe">✉️ Письмо на допуск</span>';
        else if (d.doc_type === 'access_order') typeBadge = '<span class="badge" style="font-size:.68rem;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa">📋 Заказ-наряд</span>';
        else if (d.doc_type === 'work_permit') typeBadge = '<span class="badge" style="font-size:.68rem;background:#fef2f2;color:#dc2626;border:1px solid #fecaca">🛡️ Наряд-допуск</span>';
        else if (d.doc_type === 'contract') typeBadge = '<span class="badge b-blue" style="font-size:.68rem">Договор</span>';
        else if (d.doc_type === 'power_attorney') typeBadge = '<span class="badge b-gray" style="font-size:.68rem">Доверенность</span>';
        else if (d.doc_type === 'upd') typeBadge = '<span class="badge b-purple" style="font-size:.68rem">УПД</span>';

        // Badges for status
        var statusBadge = '';
        if (curStatus === 'paid') {
          statusBadge = '<span class="badge" style="font-size:.68rem;background:#dcfce7;color:#15803d;border:1px solid #86efac;cursor:pointer" onclick="openEditTaskDocModal(\'' + escHtml(taskId) + '\', ' + d.id + ')" title="Кликните для редактирования статуса">✅ Оплачен</span>';
        } else if (curStatus === 'signed') {
          statusBadge = '<span class="badge" style="font-size:.68rem;background:#eff6ff;color:#1d4ed8;border:1px solid #93c5fd;cursor:pointer" onclick="openEditTaskDocModal(\'' + escHtml(taskId) + '\', ' + d.id + ')" title="Кликните для редактирования статуса">✍️ Подписан</span>';
        } else if (curStatus === 'issued') {
          statusBadge = '<span class="badge" style="font-size:.68rem;background:#fef3c7;color:#b45309;border:1px solid #fde68a;cursor:pointer" onclick="openEditTaskDocModal(\'' + escHtml(taskId) + '\', ' + d.id + ')" title="Кликните для редактирования статуса">⏳ Выставлен</span>';
        } else if (curStatus === 'draft') {
          statusBadge = '<span class="badge b-gray" style="font-size:.68rem;cursor:pointer" onclick="openEditTaskDocModal(\'' + escHtml(taskId) + '\', ' + d.id + ')" title="Кликните для редактирования статуса">📝 Черновик</span>';
        } else {
          statusBadge = '<span class="badge" style="font-size:.68rem;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;cursor:pointer" onclick="openEditTaskDocModal(\'' + escHtml(taskId) + '\', ' + d.id + ')" title="Кликните для редактирования статуса">⚡ Сформирован</span>';
        }

        // Title and file link
        var titleHtml = '';
        if (d.file_url) {
          titleHtml = '<a href="' + escHtml(d.file_url) + '" target="_blank" download style="font-weight:600;display:inline-flex;align-items:center;gap:5px;color:var(--blue)">' +
            (isIncoming ? '📎' : '📄') + ' ' + escHtml(d.title || 'Документ') +
          '</a>';
        } else {
          titleHtml = '<span style="font-weight:600;display:inline-flex;align-items:center;gap:5px">' +
            '📝 ' + escHtml(d.title || 'Документ') +
          '</span>';
        }

        if (isIncoming) {
          titleHtml += ' <span class="badge" style="font-size:.6rem;background:#f3e8ff;color:#7e22ce;vertical-align:middle">Контрагент</span>';
        }

        if (meta.comment) {
          titleHtml += '<div style="font-size:.73rem;color:var(--text-3);margin-top:2px;max-width:280px;white-space:normal">' + escHtml(meta.comment) + '</div>';
        }

        // Amount string
        var amountStr = (amountVal !== null && !isNaN(amountVal))
          ? '<b style="color:var(--text)">' + amountVal.toLocaleString('ru-RU') + ' ₽</b>'
          : '<span style="color:var(--text-3)">—</span>';

        // Author
        var authorStr = escHtml(meta.uploader_name || d.created_by_name || 'Система');

        html += '<tr style="border-bottom:1px solid var(--border)">' +
          '<td style="padding:6px 8px">' + titleHtml + '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap">' + typeBadge + '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap">' + escHtml(d.doc_number || 'б/н') + ' <span style="color:var(--text-3)">от</span> ' + dateStr + '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap">' + amountStr + '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap">' + statusBadge + '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap;color:var(--text-2);font-size:.76rem">' + authorStr + '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap;text-align:right">' +
            (d.file_url ? '<a href="' + escHtml(d.file_url) + '" download class="btn btn-sm btn-ghost" style="padding:2px 6px;font-size:.75rem" title="Скачать файл">📥</a> ' : '') +
            '<button type="button" class="btn btn-sm btn-ghost" style="padding:2px 6px;font-size:.75rem" onclick="openEditTaskDocModal(\'' + escHtml(taskId) + '\', ' + d.id + ')" title="Редактировать статус / сумму / реквизиты">✏️</button> ' +
            '<button type="button" class="btn btn-sm btn-ghost" style="color:var(--red);padding:2px 6px;font-size:.75rem" onclick="deleteCardDocument(\'' + escHtml(taskId) + '\', ' + d.id + ')" title="Удалить из реестра">🗑️</button>' +
          '</td>' +
        '</tr>';
      });

      html += '</tbody></table></div>';
      cont.innerHTML = html;
    })
    .catch(function(err) {
      cont.innerHTML = '<div style="color:var(--red);padding:8px 0">Ошибка реестра документов: ' + escHtml(err.message) + '</div>';
    });
}

function openUploadTaskDocModal(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); }) || { id: taskId };
  var existing = document.getElementById('_upload_doc_modal');
  if (existing) existing.remove();

  var todayStr = new Date().toISOString().slice(0, 10);

  api('/tasks/' + encodeURIComponent(taskId) + '/subcontracts')
    .then(function(subs) {
      renderUploadModal(subs || []);
    })
    .catch(function() {
      renderUploadModal([]);
    });

  function renderUploadModal(subcontracts) {
    var modal = document.createElement('div');
    modal.id = '_upload_doc_modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(2px)';

    var subOptions = '<option value="">(Без привязки к конкретному субподряду)</option>';
    (subcontracts || []).forEach(function(s) {
      var sLabel = (s.contractor_name || 'Подрядчик') + ' — ' + (s.work_type || 'Работы') + (s.price_agreed ? (' (' + parseFloat(s.price_agreed).toLocaleString('ru-RU') + ' ₽)') : '');
      subOptions += '<option value="' + s.id + '">' + escHtml(sLabel) + '</option>';
    });

    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:1.5rem;width:100%;max-width:560px;box-shadow:0 12px 48px rgba(0,0,0,.25);max-height:92vh;display:flex;flex-direction:column">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <div>
            <div style="font-weight:700;font-size:1.1rem">📎 Учет документа / Счета / Акта контрагента</div>
            <div style="font-size:.8rem;color:var(--text-3);margin-top:2px">Объект: <b>${escHtml(t.id)}</b> (${escHtml(t.customer || 'Заказчик')})</div>
          </div>
          <button onclick="document.getElementById('_upload_doc_modal').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-3);line-height:1">×</button>
        </div>

        <div style="overflow-y:auto;flex:1;padding-right:4px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Вид документа *</label>
              <select id="upt_doc_type" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;background:#fff">
                <option value="invoice">💰 Счет на оплату</option>
                <option value="completion_act">🤝 Акт выполненных работ</option>
                <option value="access_order">📋 Заказ-наряд на работы</option>
                <option value="work_permit">🛡️ Наряд-допуск</option>
                <option value="upd">📑 УПД</option>
                <option value="contract">📄 Договор / Доп. соглашение</option>
                <option value="other">📎 Прочий скан / документ</option>
              </select>
            </div>
            <div>
              <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Статус</label>
              <select id="upt_status" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;background:#fff">
                <option value="issued">⏳ Выставлен / Ожидает</option>
                <option value="paid">✅ Оплачен</option>
                <option value="signed">✍️ Подписан</option>
                <option value="draft">📝 Черновик</option>
              </select>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Номер документа</label>
              <input type="text" id="upt_doc_number" placeholder="Напр. 15/А или б/н" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
            </div>
            <div>
              <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Дата документа</label>
              <input type="date" id="upt_doc_date" value="${todayStr}" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Сумма (₽)</label>
              <input type="number" step="0.01" id="upt_amount" placeholder="0.00" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
            </div>
            <div>
              <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Субподряд</label>
              <select id="upt_subcontract_id" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;background:#fff">
                ${subOptions}
              </select>
            </div>
          </div>

          <div style="margin-bottom:10px">
            <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Наименование (не обязательно)</label>
            <input type="text" id="upt_title" placeholder="Автоматически сформируется из номера и типа, если оставить пустым" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
          </div>

          <div style="margin-bottom:10px">
            <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Комментарий / примечание</label>
            <textarea id="upt_comment" rows="2" placeholder="Напр.: Счет от монтажника за доп. работы" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;resize:vertical"></textarea>
          </div>

          <div style="margin-bottom:12px;background:#f8fafc;padding:10px 12px;border-radius:8px;border:1.5px dashed var(--border)">
            <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text);margin-bottom:4px">📎 Прикрепить скан / файл (PDF, DOCX, JPG, PNG)</label>
            <input type="file" id="upt_file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" style="font-size:.82rem">
            <div style="font-size:.72rem;color:var(--text-3);margin-top:4px">Можно учесть документ и без файла (например, когда счет отправлен по ЭДО или в мессенджере).</div>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:1.25rem;border-top:1px solid var(--border);padding-top:12px">
          <button onclick="document.getElementById('_upload_doc_modal').remove()" class="btn btn-ghost btn-sm">Отмена</button>
          <button id="upt_save_btn" class="btn btn-sm btn-primary" onclick="saveUploadTaskDoc('${escHtml(taskId)}')">💾 Сохранить документ</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });
  }
}

function saveUploadTaskDoc(taskId) {
  var docType = document.getElementById('upt_doc_type').value;
  var docNum = document.getElementById('upt_doc_number').value.trim();
  var docDate = document.getElementById('upt_doc_date').value;
  var amount = document.getElementById('upt_amount').value.trim();
  var status = document.getElementById('upt_status').value;
  var title = document.getElementById('upt_title').value.trim();
  var comment = document.getElementById('upt_comment').value.trim();
  var subId = document.getElementById('upt_subcontract_id') ? document.getElementById('upt_subcontract_id').value : '';
  var fileInput = document.getElementById('upt_file');

  var fd = new FormData();
  fd.append('doc_type', docType);
  if (docNum) fd.append('doc_number', docNum);
  if (docDate) fd.append('doc_date', docDate);
  if (amount) fd.append('amount', amount);
  if (status) fd.append('status', status);
  if (title) fd.append('title', title);
  if (comment) fd.append('comment', comment);
  if (subId) fd.append('subcontract_id', subId);
  if (fileInput && fileInput.files && fileInput.files[0]) {
    fd.append('file', fileInput.files[0]);
  }

  var btn = document.getElementById('upt_save_btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Сохранение...'; }

  api('/tasks/' + encodeURIComponent(taskId) + '/documents/upload', {
    method: 'POST',
    body: fd
  })
  .then(function(res) {
    if (res && res.error) throw new Error(res.error);
    var modal = document.getElementById('_upload_doc_modal');
    if (modal) modal.remove();
    if (typeof showToast === 'function') showToast('✅ Документ сохранен в реестре!', 'success');
    loadCardDocuments(taskId);
  })
  .catch(function(err) {
    alert('Ошибка учета документа: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = '💾 Сохранить документ'; }
  });
}

function openEditTaskDocModal(taskId, docId) {
  var doc = (window._cardDocsCache || []).find(function(d){ return String(d.id) === String(docId); });
  if (!doc) {
    loadCardDocuments(taskId);
    return;
  }

  var existing = document.getElementById('_edit_doc_modal');
  if (existing) existing.remove();

  var meta = typeof doc.meta === 'string' ? (function(){ try { return JSON.parse(doc.meta); } catch(e){ return {}; } })() : (doc.meta || {});
  var curStatus = meta.status || doc.status || 'generated';
  var curAmount = (meta.amount !== undefined && meta.amount !== null) ? meta.amount : (doc.amount || '');
  var curDate = doc.doc_date ? doc.doc_date.slice(0, 10) : (doc.created_at ? doc.created_at.slice(0, 10) : '');
  var curNum = doc.doc_number || '';
  var curTitle = doc.title || '';
  var curComment = meta.comment || '';

  var modal = document.createElement('div');
  modal.id = '_edit_doc_modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(2px)';

  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:1.5rem;width:100%;max-width:500px;box-shadow:0 12px 48px rgba(0,0,0,.25);max-height:92vh;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div>
          <div style="font-weight:700;font-size:1.1rem">✏️ Редактирование документа</div>
          <div style="font-size:.8rem;color:var(--text-3);margin-top:2px">${escHtml(doc.title || 'Документ')}</div>
        </div>
        <button onclick="document.getElementById('_edit_doc_modal').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-3);line-height:1">×</button>
      </div>

      <div style="overflow-y:auto;flex:1;padding-right:4px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Статус документа</label>
            <select id="edt_status" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;background:#fff">
              <option value="issued" ${curStatus === 'issued' ? 'selected' : ''}>⏳ Выставлен</option>
              <option value="paid" ${curStatus === 'paid' ? 'selected' : ''}>✅ Оплачен</option>
              <option value="signed" ${curStatus === 'signed' ? 'selected' : ''}>✍️ Подписан</option>
              <option value="draft" ${curStatus === 'draft' ? 'selected' : ''}>📝 Черновик</option>
              <option value="generated" ${curStatus === 'generated' ? 'selected' : ''}>⚡ Сформирован</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Сумма (₽)</label>
            <input type="number" step="0.01" id="edt_amount" value="${escHtml(curAmount)}" placeholder="0.00" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Номер документа</label>
            <input type="text" id="edt_doc_number" value="${escHtml(curNum)}" placeholder="Номер" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
          </div>
          <div>
            <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Дата документа</label>
            <input type="date" id="edt_doc_date" value="${escHtml(curDate)}" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
          </div>
        </div>

        <div style="margin-bottom:10px">
          <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Наименование</label>
          <input type="text" id="edt_title" value="${escHtml(curTitle)}" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">
        </div>

        <div style="margin-bottom:10px">
          <label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Комментарий / примечание</label>
          <textarea id="edt_comment" rows="2" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;resize:vertical">${escHtml(curComment)}</textarea>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:1.25rem;border-top:1px solid var(--border);padding-top:12px">
        <button onclick="document.getElementById('_edit_doc_modal').remove()" class="btn btn-ghost btn-sm">Отмена</button>
        <button id="edt_save_btn" class="btn btn-sm btn-primary" onclick="saveEditTaskDoc('${escHtml(taskId)}', ${doc.id})">💾 Сохранить изменения</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });
}

function saveEditTaskDoc(taskId, docId) {
  var status = document.getElementById('edt_status').value;
  var amount = document.getElementById('edt_amount').value.trim();
  var docNum = document.getElementById('edt_doc_number').value.trim();
  var docDate = document.getElementById('edt_doc_date').value;
  var title = document.getElementById('edt_title').value.trim();
  var comment = document.getElementById('edt_comment').value.trim();

  var body = {
    status: status,
    amount: amount ? parseFloat(amount) : null,
    doc_number: docNum || null,
    doc_date: docDate || null,
    title: title || null,
    comment: comment
  };

  var btn = document.getElementById('edt_save_btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Сохранение...'; }

  api('/documents/' + docId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  .then(function(res) {
    if (res && res.error) throw new Error(res.error);
    var modal = document.getElementById('_edit_doc_modal');
    if (modal) modal.remove();
    if (typeof showToast === 'function') showToast('✅ Документ обновлен!', 'success');
    loadCardDocuments(taskId);
  })
  .catch(function(err) {
    alert('Ошибка обновления документа: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = '💾 Сохранить изменения'; }
  });
}

function deleteCardDocument(taskId, docId) {
  if (!confirm('Удалить документ из реестра?')) return;
  api('/documents/' + docId, { method: 'DELETE' })
    .then(function() {
      loadCardDocuments(taskId);
    })
    .catch(function(err) {
      alert('Ошибка удаления: ' + err.message);
    });
}

window.loadCardDocuments = loadCardDocuments;
window.openUploadTaskDocModal = openUploadTaskDocModal;
window.saveUploadTaskDoc = saveUploadTaskDoc;
window.openEditTaskDocModal = openEditTaskDocModal;
window.saveEditTaskDoc = saveEditTaskDoc;
window.deleteCardDocument = deleteCardDocument;

// ─── PAGE: МАРШИ ─────────────────────────────────────────────────────────────

// --- NEW WORKFLOW ACTIONS ---
window.submitSmr = function(taskId) {
  var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
  var portsCount = (window._curTaskPorts && window._curTaskPorts[taskId] !== undefined) ? window._curTaskPorts[taskId] : (window._curPortsCount || 0);
  var photosCount = (window._curTaskPhotos && window._curTaskPhotos[taskId] !== undefined) ? window._curTaskPhotos[taskId] : (window._curPhotoReportsCount || 0);
  var tmcAccepted = Boolean((t.rawData && t.rawData.tmcAccepted) || (t.raw_data && t.raw_data.tmcAccepted) || t.tmcAccepted);

  var warnings = [];
  if (!t.dataVyhoda && !t.data_vyhoda && !(t.rawData && t.rawData.dataVyhoda)) warnings.push('• Не указана фактическая дата выхода СМР');
  if (portsCount === 0) warnings.push('• Не заполнен Кабельный журнал (КЖ)');
  if (photosCount === 0) warnings.push('• Не загружен фотоотчет с объекта');
  if (!tmcAccepted && !window._curMaterialsWrittenOff) warnings.push('• Не акцептован подотчет ТМЦ');

  var confirmMsg = 'Вы подтверждаете, что строительно-монтажные работы по объекту выполнены и готовы к сдаче куратору?';
  if (warnings.length > 0) {
    confirmMsg += '\n\n⚠️ Внимание! По чек-листу готовности СМР есть замечания:\n' + warnings.join('\n') + '\n\nВсе равно передать СМР на проверку?';
  }
  if (!confirm(confirmMsg)) return;

  api('/tasks/' + encodeURIComponent(taskId) + '/smr/submit', { method: 'POST' })
    .then(function(res) {
      if (res && res.error) alert(res.error);
      renderApp();
    })
    .catch(function(err) { alert(err.message || err); });
};

window.acceptSmr = function(taskId) {
  var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
  var portsCount = (window._curTaskPorts && window._curTaskPorts[taskId] !== undefined) ? window._curTaskPorts[taskId] : (window._curPortsCount || 0);
  var photosCount = (window._curTaskPhotos && window._curTaskPhotos[taskId] !== undefined) ? window._curTaskPhotos[taskId] : (window._curPhotoReportsCount || 0);
  var tmcAccepted = Boolean((t.rawData && t.rawData.tmcAccepted) || (t.raw_data && t.raw_data.tmcAccepted) || t.tmcAccepted);

  var warnings = [];
  if (!t.dataVyhoda && !t.data_vyhoda && !(t.rawData && t.rawData.dataVyhoda)) warnings.push('• Не указана фактическая дата выхода СМР');
  if (portsCount === 0) warnings.push('• Не заполнен Кабельный журнал (КЖ)');
  if (photosCount === 0) warnings.push('• Не прикреплен фотоотчет с объекта');
  if (!tmcAccepted && !window._curMaterialsWrittenOff) warnings.push('• Не акцептован подотчет ТМЦ');

  var confirmMsg = 'Принять строительно-монтажные работы по объекту?\n\nЭто действие:\n1. Зафиксирует внутреннюю приёмку СМР куратором\n2. Разрешит оплату субподрядчику / бригаде\n3. Подготовит заявку к сдаче Заказчику';
  if (warnings.length > 0) {
    confirmMsg += '\n\n⚠️ Обратите внимание: по чек-листу монтажника не все пункты закрыты:\n' + warnings.join('\n') + '\n\nПродолжить приёмку?';
  }
  if (!confirm(confirmMsg)) return;

  api('/tasks/' + encodeURIComponent(taskId) + '/smr/accept', { method: 'POST' })
    .then(function(res) {
      if (res && res.error) alert(res.error);
      renderApp();
    })
    .catch(function(err) { alert(err.message || err); });
};

window.rejectSmr = function(taskId) {
  var reason = prompt('Укажите причину возврата на доработку (что исправить монтажнику):');
  if (reason === null) return;
  api('/tasks/' + encodeURIComponent(taskId) + '/smr/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason })
  })
    .then(function(res) {
      if (res && res.error) alert(res.error);
      renderApp();
    })
    .catch(function(err) { alert(err.message || err); });
};

window.completeSmr = window.acceptSmr;
window.submitIdReview = function(taskId) {
  if (!confirm('Отправить исполнительную документацию на проверку Заказчику?')) return;
  api('/tasks/' + encodeURIComponent(taskId) + '/id/review', { method: 'POST' })
    .then(res => { if (res.error) alert(res.error); renderApp(); })
    .catch(err => alert(err));
};
window.markPaid = function(taskId) {
  if (!confirm('Отметить заявку как полностью оплаченную?')) return;
  api('/tasks/' + encodeURIComponent(taskId) + '/finance/paid', { method: 'POST' })
    .then(res => { if (res.error) alert(res.error); renderApp(); })
    .catch(err => alert(err));
};

window._recalcSubFinance = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  var rate = parseFloat(document.getElementById('sub_rate_input').value) || 0;
  var dist = parseFloat(document.getElementById('sub_distance_input').value) || 0;
  var ext = parseFloat(document.getElementById('sub_extras_input').value) || 0;
  var isDraft = function(k) { return Object.prototype.hasOwnProperty.call(S.cardDraft, k); };
  var fact = isDraft('fact') ? (parseFloat(S.cardDraft.fact) || 0) : (parseFloat(t.fact) || 0);
  var inOrder = isDraft('inOrder') ? (parseFloat(S.cardDraft.inOrder) || 0) : (parseFloat(t.inOrder) || 0);
  var ports = fact > 0 ? fact : (inOrder > 0 ? inOrder : 1);
  if (!t.rawData) t.rawData = {};
  t.rawData.subRate = rate;
  t.rawData.subDist = dist;
  t.rawData.subExtras = ext;
  t.rawData.subTotal = (rate * ports) + dist + ext;

  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawData: t.rawData })
  }).catch(function(e){ console.error('Error auto-saving sub finance:', e); });

  renderApp();
};

window._openAddSubPayment = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  var amt = prompt('Введите сумму выплаты субподрядчику (₽):');
  if (!amt || isNaN(parseFloat(amt))) return;
  var note = prompt('Назначение / основание платежа:', 'Аванс по заказ-наряду');
  if (!t._payments) t._payments = (t.rawData && t.rawData.subPayments) ? t.rawData.subPayments.slice() : [];
  t._payments.push({
    amount: parseFloat(amt),
    date: new Date().toLocaleDateString('ru-RU'),
    note: note || ''
  });
  if (!t.rawData) t.rawData = {};
  t.rawData.subPayments = t._payments;

  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawData: t.rawData })
  }).then(function(){
    if (typeof showToast === 'function') showToast('✅ Выплата зафиксирована', 'success');
  }).catch(function(e){
    console.error('Error saving sub payment:', e);
    if (typeof showToast === 'function') showToast('⚠️ Ошибка сохранения выплаты: ' + e.message, 'error');
  });

  renderApp();
};

window.removeSubPayment = function(taskId, idx) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t || !t._payments) return;
  if (!confirm('Удалить эту запись о выплате?')) return;
  t._payments.splice(idx, 1);
  if (!t.rawData) t.rawData = {};
  t.rawData.subPayments = t._payments;

  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawData: t.rawData })
  }).then(function(){
    if (typeof showToast === 'function') showToast('🗑️ Выплата удалена', 'info');
  }).catch(function(e){
    console.error('Error removing sub payment:', e);
    if (typeof showToast === 'function') showToast('⚠️ Ошибка удаления: ' + e.message, 'error');
  });

  renderApp();
};

// ─── СОПУТСТВУЮЩИЕ ЗАТРАТЫ (ДОПЫ + ТК): МОДАЛКА И ОБРАБОТЧИКИ ────────────────

window._openAddExtraExpense = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;

  var existing = document.getElementById('_extra_expense_modal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = '_extra_expense_modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(2px)';

  modal.innerHTML = '' +
    '<div style="background:#fff;border-radius:14px;padding:1.5rem;width:100%;max-width:580px;box-shadow:0 12px 48px rgba(0,0,0,.25);max-height:90vh;display:flex;flex-direction:column">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">' +
        '<div>' +
          '<div style="font-weight:700;font-size:1.1rem">➕ Добавить сопутствующий расход (ДОПы / ТК)</div>' +
          '<div style="font-size:.8rem;color:var(--text-3);margin-top:2px">Объект № <b>' + escHtml(t.id) + '</b> (' + escHtml(t.address || '') + ')</div>' +
        '</div>' +
        '<button onclick="document.getElementById(\'_extra_expense_modal\').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-3);line-height:1">×</button>' +
      '</div>' +

      '<div style="overflow-y:auto;flex:1;padding-right:4px">' +
        // 1. Категория
        '<div style="margin-bottom:12px">' +
          '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text);margin-bottom:6px">1. Категория затрат</label>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
            '<label id="cat_dop_label" style="display:flex;align-items:center;gap:6px;background:#ffedd5;padding:8px 12px;border-radius:8px;border:1.5px solid #ea580c;cursor:pointer;font-size:.82rem;font-weight:600;color:#9a3412">' +
              '<input type="radio" name="exp_category" value="dop" checked onchange="window._onExpCatChange(this.value)">' +
              '<span>🛠️ Статья 4: ДОПы (спецработы)</span>' +
            '</label>' +
            '<label id="cat_transport_label" style="display:flex;align-items:center;gap:6px;background:#f0f9ff;padding:8px 12px;border-radius:8px;border:1.5px solid #0284c7;cursor:pointer;font-size:.82rem;font-weight:600;color:#0369a1">' +
              '<input type="radio" name="exp_category" value="transport" onchange="window._onExpCatChange(this.value)">' +
              '<span>🚚 Статья 5: ТК / Транспорт</span>' +
            '</label>' +
          '</div>' +
        '</div>' +

        // Быстрые шаблоны
        '<div style="margin-bottom:12px">' +
          '<label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-3);margin-bottom:4px">Частые шаблоны расходов (клик для автозаполнения):</label>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
            '<button type="button" class="btn btn-sm btn-ghost" style="font-size:.73rem;padding:3px 8px;border:1px solid var(--border)" onclick="window._fillExpPreset(\'Алмазное бурение перекрытий\', 22000, \'dop\', \'through_contractor\')">💎 Алмазное бурение (22 000 ₽)</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" style="font-size:.73rem;padding:3px 8px;border:1px solid var(--border)" onclick="window._fillExpPreset(\'Аренда автовышки 18м\', 15000, \'dop\', \'direct_third_party\')">🚜 Автовышка (15 000 ₽)</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" style="font-size:.73rem;padding:3px 8px;border:1px solid var(--border)" onclick="window._fillExpPreset(\'Проживание бригады в гостинице\', 6000, \'dop\', \'through_contractor\')">🏨 Проживание бригады</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" style="font-size:.73rem;padding:3px 8px;border:1px solid var(--border)" onclick="window._fillExpPreset(\'Доставка ТК Деловые Линии\', 4500, \'transport\', \'direct_third_party\')">📦 ТК Деловые Линии</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" style="font-size:.73rem;padding:3px 8px;border:1px solid var(--border)" onclick="window._fillExpPreset(\'Доставка ТК ПЭК\', 3800, \'transport\', \'direct_third_party\')">📦 ТК ПЭК</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" style="font-size:.73rem;padding:3px 8px;border:1px solid var(--border)" onclick="window._fillExpPreset(\'Выезд бригады / Километраж (ГСМ)\', 3000, \'transport\', \'through_contractor\')">⛽ Выезд бригады / ГСМ</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" style="font-size:.73rem;padding:3px 8px;border:1px solid var(--border)" onclick="window._fillExpPreset(\'Спецтехника / Манипулятор\', 12000, \'dop\', \'direct_third_party\')">🏗️ Манипулятор</button>' +
          '</div>' +
        '</div>' +

        // Поля формы
        '<div style="display:grid;grid-template-columns:1.3fr 0.9fr;gap:10px;margin-bottom:10px">' +
          '<div>' +
            '<label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Наименование расхода *</label>' +
            '<input type="text" id="exp_title_input" placeholder="например, Алмазное бурение перекрытий" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
          '</div>' +
          '<div>' +
            '<label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Сумма затрат (₽) *</label>' +
            '<input type="number" id="exp_amount_input" placeholder="0" min="0" step="100" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;font-weight:700">' +
          '</div>' +
        '</div>' +

        // Разделение получателя / плательщика
        '<div style="margin-bottom:10px">' +
          '<label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Способ оплаты и получатель *</label>' +
          '<select id="exp_payer_mode_select" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.84rem;font-weight:600">' +
            '<option value="through_contractor">👷 В смету подрядчику (компенсация в Заказ-наряде и к выплате монтажнику)</option>' +
            '<option value="direct_third_party">🏢 Напрямую 3-му лицу / ТК (прямой расход Генподрядчика, монтажнику не идет)</option>' +
          '</select>' +
          '<div style="font-size:.72rem;color:var(--text-3);margin-top:3px" id="exp_payer_hint">' +
            '💡 «В смету подрядчику» увеличит Заказ-наряд монтажника и сумму к выплате. «Напрямую 3-му лицу» учитывается в затратах объекта, но не начисляется монтажнику.' +
          '</div>' +
        '</div>' +

        '<div>' +
          '<label style="display:block;font-size:.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Примечание / № накладной / трек-номер ТК</label>' +
          '<input type="text" id="exp_comment_input" placeholder="например, Накладная ТК № СПБ-08912 от 12.10" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
        '</div>' +
      '</div>' +

      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:1rem;border-top:1px solid var(--border);padding-top:12px">' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_extra_expense_modal\').remove()">Отмена</button>' +
        '<button type="button" class="btn btn-sm btn-primary" onclick="window._saveExtraExpense(\'' + taskId + '\')">💾 Добавить в смету объекта</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);
  var inp = document.getElementById('exp_title_input');
  if (inp) inp.focus();
};

window._onExpCatChange = function(cat) {
  var dopLbl = document.getElementById('cat_dop_label');
  var transLbl = document.getElementById('cat_transport_label');
  if (cat === 'dop') {
    if (dopLbl) dopLbl.style.borderColor = '#ea580c';
    if (transLbl) transLbl.style.borderColor = 'transparent';
  } else {
    if (dopLbl) dopLbl.style.borderColor = 'transparent';
    if (transLbl) transLbl.style.borderColor = '#0284c7';
  }
};

window._fillExpPreset = function(title, amount, cat, payerMode) {
  var titleInp = document.getElementById('exp_title_input');
  var amtInp = document.getElementById('exp_amount_input');
  var payerSel = document.getElementById('exp_payer_mode_select');
  if (titleInp) titleInp.value = title;
  if (amtInp && amount > 0) amtInp.value = amount;
  if (payerSel && payerMode) payerSel.value = payerMode;
  var radios = document.getElementsByName('exp_category');
  for (var i = 0; i < radios.length; i++) {
    if (radios[i].value === cat) radios[i].checked = true;
  }
  window._onExpCatChange(cat);
};

window._saveExtraExpense = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;

  var title = (document.getElementById('exp_title_input').value || '').trim();
  var amt = parseFloat(document.getElementById('exp_amount_input').value) || 0;
  if (!title) { alert('Укажите наименование расхода'); return; }
  if (amt <= 0) { alert('Укажите корректную сумму расхода'); return; }

  var radios = document.getElementsByName('exp_category');
  var cat = 'dop';
  for (var i = 0; i < radios.length; i++) {
    if (radios[i].checked) { cat = radios[i].value; break; }
  }

  var payerMode = document.getElementById('exp_payer_mode_select').value || 'through_contractor';
  var comment = (document.getElementById('exp_comment_input').value || '').trim();

  if (!t.rawData) t.rawData = {};
  if (!Array.isArray(t.rawData.extraExpensesList)) t.rawData.extraExpensesList = [];

  var newExp = {
    id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    category: cat,
    title: title,
    amount: amt,
    payer_mode: payerMode,
    date: new Date().toLocaleDateString('ru-RU'),
    comment: comment
  };

  t.rawData.extraExpensesList.push(newExp);

  // Пересчет субподрядных допрасходов и транспорта
  var subExp = t.rawData.extraExpensesList.filter(function(x){ return x.payer_mode === 'through_contractor'; });
  var subDops = subExp.filter(function(x){ return x.category === 'dop'; }).reduce(function(a, b){ return a + Number(b.amount); }, 0);
  var subTransport = subExp.filter(function(x){ return x.category === 'transport'; }).reduce(function(a, b){ return a + Number(b.amount); }, 0);

  t.rawData.subExtras = subDops;
  t.rawData.subDist = subTransport;

  // Общие суммы по категориям
  var totalDops = t.rawData.extraExpensesList.filter(function(x){ return x.category === 'dop'; }).reduce(function(a, b){ return a + Number(b.amount); }, 0);
  var totalTransport = t.rawData.extraExpensesList.filter(function(x){ return x.category === 'transport'; }).reduce(function(a, b){ return a + Number(b.amount); }, 0);

  t.extras = totalDops;
  t.distanceKm = totalTransport;

  var modal = document.getElementById('_extra_expense_modal');
  if (modal) modal.remove();

  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawData: t.rawData,
      extras: t.extras,
      distanceKm: t.distanceKm
    })
  }).then(function(){
    if (typeof showToast === 'function') showToast('✅ Сопутствующий расход зафиксирован', 'success');
  }).catch(function(e){
    console.error('Error saving extra expense:', e);
    if (typeof showToast === 'function') showToast('⚠️ Ошибка сохранения: ' + e.message, 'error');
  });

  renderApp();
};

window._removeExtraExpense = function(taskId, idx) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t || !t.rawData || !Array.isArray(t.rawData.extraExpensesList)) return;

  var exp = t.rawData.extraExpensesList[idx];
  var name = exp ? exp.title : 'расход';
  if (!confirm('Удалить запись «' + name + '»?')) return;

  t.rawData.extraExpensesList.splice(idx, 1);

  // Пересчет
  var subExp = t.rawData.extraExpensesList.filter(function(x){ return x.payer_mode === 'through_contractor'; });
  var subDops = subExp.filter(function(x){ return x.category === 'dop'; }).reduce(function(a, b){ return a + Number(b.amount); }, 0);
  var subTransport = subExp.filter(function(x){ return x.category === 'transport'; }).reduce(function(a, b){ return a + Number(b.amount); }, 0);

  t.rawData.subExtras = subDops;
  t.rawData.subDist = subTransport;

  var totalDops = t.rawData.extraExpensesList.filter(function(x){ return x.category === 'dop'; }).reduce(function(a, b){ return a + Number(b.amount); }, 0);
  var totalTransport = t.rawData.extraExpensesList.filter(function(x){ return x.category === 'transport'; }).reduce(function(a, b){ return a + Number(b.amount); }, 0);

  t.extras = totalDops;
  t.distanceKm = totalTransport;

  api('/tasks/' + encodeURIComponent(taskId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawData: t.rawData,
      extras: t.extras,
      distanceKm: t.distanceKm
    })
  }).then(function(){
    if (typeof showToast === 'function') showToast('🗑️ Расход удален', 'info');
  }).catch(function(e){
    console.error('Error removing extra expense:', e);
    if (typeof showToast === 'function') showToast('⚠️ Ошибка удаления: ' + e.message, 'error');
  });

  renderApp();
};

// ─── ВСТРОЕННЫЙ ЧАТ ЗАЯВКИ (ТАБ + ВЫДВИЖНАЯ ШТОРКА) ──────────────────────────

function renderTaskChatComponent(taskId, isDrawer) {
  var id = escHtml(String(taskId));
  var source = isDrawer ? 'drawer' : 'tab';
  var title = isDrawer ? ('Чат заявки #' + id) : ('Обсуждение заявки #' + id);

  var topBar = isDrawer
    ? '<div class="task-chat-header">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:1.15rem">💬</span>' +
          '<div>' +
            '<div style="font-weight:700;font-size:.88rem;color:var(--text)">' + title + '</div>' +
            '<div style="font-size:.72rem;color:var(--text-3)">Онлайн чат участников</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          '<button type="button" class="btn btn-xs btn-ghost chat-members-btn" onclick="openChatMembersModal(null, \'' + id + '\')" title="Управление участниками" style="font-size:.74rem">👥 Участники</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="setCardTab(\'chat\');toggleTaskChatDrawer(null,false)" title="Развернуть во всю вкладку" style="font-size:.74rem">Вкладка ↗</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="toggleTaskChatDrawer(null,false)" title="Закрыть шторку" style="font-size:1rem;line-height:1;padding:2px 7px">✕</button>' +
        '</div>' +
      '</div>'
    : '<div class="task-chat-header">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:1.15rem">💬</span>' +
          '<div>' +
            '<div style="font-weight:700;font-size:.92rem;color:var(--text)">' + title + '</div>' +
            '<div style="font-size:.74rem;color:var(--text-3)">Сообщения и файлы доступны ответственным и руководству</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          '<button type="button" class="btn btn-xs btn-ghost chat-members-btn" onclick="openChatMembersModal(null, \'' + id + '\')" title="Управление участниками" style="font-size:.76rem">👥 Участники</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="toggleTaskChatDrawer(\'' + id + '\',true)" title="Открыть в боковой шторке" style="font-size:.76rem">Открыть сбоку ◨</button>' +
        '</div>' +
      '</div>';

  return '<div class="task-chat-container">' +
    topBar +
    '<div id="taskChatMessages_' + source + '" class="task-chat-messages">' +
      '<div style="text-align:center;color:var(--text-3);margin:auto;padding:2rem 1rem">' +
        '<div style="font-size:1.8rem;margin-bottom:6px">💬</div>' +
        '<div>Загрузка сообщений...</div>' +
      '</div>' +
    '</div>' +
    '<div id="taskChatPendingAttachments_' + source + '" class="task-chat-pending-bar" style="display:none"></div>' +
    '<div class="task-chat-input-bar">' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="triggerTaskChatUpload(\'' + source + '\')" title="Прикрепить файл или фото" style="padding:6px 10px;font-size:1rem">📎</button>' +
      '<input type="file" id="taskChatFileInput_' + source + '" style="display:none" onchange="handleTaskChatFileUpload(event, \'' + id + '\', \'' + source + '\')">' +
      '<input type="text" id="taskChatInput_' + source + '" class="input" placeholder="Напишите сообщение... (Enter для отправки)" onkeydown="if(event.key===\'Enter\') sendTaskChatMessage(\'' + id + '\', \'' + source + '\')" style="flex:1;font-size:.85rem;padding:7px 10px">' +
      '<button type="button" class="btn btn-sm btn-primary" onclick="sendTaskChatMessage(\'' + id + '\', \'' + source + '\')" style="padding:6px 12px;font-weight:600">Отправить ➔</button>' +
    '</div>' +
  '</div>';
}
window.renderTaskChatComponent = renderTaskChatComponent;

function renderTaskChatMessages(taskId) {
  var msgs = S.taskChatMessages || [];
  var currentUserId = S.user ? S.user.id : null;
  var currentUsername = S.user ? S.user.username : null;

  var html = '';
  if (!msgs.length) {
    html = '<div style="text-align:center;color:var(--text-3);margin:auto;padding:2rem 1rem">' +
      '<div style="font-size:2rem;margin-bottom:8px">💬</div>' +
      '<div style="font-weight:600;color:var(--text-2);margin-bottom:4px">В этой заявке пока нет сообщений</div>' +
      '<div style="font-size:.78rem">Задайте вопрос коллегам, согласуйте материалы или прикрепите фото с объекта!</div>' +
    '</div>';
  } else {
    html = msgs.map(function(m) {
      var isMe = (m.sender_id === currentUserId) || (currentUsername && m.username === currentUsername);
      var time = m.created_at ? new Date(m.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : '';
      var senderName = escHtml(m.full_name || m.username || 'Пользователь');

      var roleBadge = '';
      var r = (m.role || '').toLowerCase();
      if (r === 'admin') roleBadge = '<span class="badge b-red" style="font-size:.62rem;padding:0 5px">Админ</span>';
      else if (r === 'director') roleBadge = '<span class="badge b-purple" style="font-size:.62rem;padding:0 5px">Директор</span>';
      else if (r === 'manager') roleBadge = '<span class="badge b-blue" style="font-size:.62rem;padding:0 5px">Менеджер</span>';
      else if (r === 'worker' || r === 'installer') roleBadge = '<span class="badge b-orange" style="font-size:.62rem;padding:0 5px">Исполнитель</span>';
      else if (r === 'contractor') roleBadge = '<span class="badge b-yellow" style="font-size:.62rem;padding:0 5px">Подрядчик</span>';
      else if (r === 'designer') roleBadge = '<span class="badge b-cyan" style="font-size:.62rem;padding:0 5px">Проектировщик</span>';

      var avatarHtml = '';
      if (m.avatar_url) {
        avatarHtml = '<img src="' + escHtml(m.avatar_url) + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid var(--border);flex-shrink:0" alt="' + senderName + '">';
      } else {
        var initial = (m.full_name ? m.full_name.charAt(0) : (m.username ? m.username.charAt(0) : '?')).toUpperCase();
        var bgCol = isMe ? 'var(--orange)' : 'var(--blue)';
        avatarHtml = '<div style="width:28px;height:28px;border-radius:50%;background:' + bgCol + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.75rem;flex-shrink:0">' + escHtml(initial) + '</div>';
      }

      var attachments = [];
      if (m.attachments) {
        if (Array.isArray(m.attachments)) attachments = m.attachments;
        else if (typeof m.attachments === 'string') {
          try { attachments = JSON.parse(m.attachments); } catch(e){}
        }
      }

      var attHtml = '';
      if (attachments && attachments.length) {
        attHtml = '<div style="margin-top:6px;display:flex;flex-direction:column;gap:5px">' +
          attachments.map(function(att) {
            var isImg = att.type && att.type.indexOf('image/') === 0;
            if (!isImg && att.url) {
              var lowUrl = att.url.toLowerCase();
              if (lowUrl.match(/\.(png|jpe?g|gif|webp|bmp|svg)$/)) isImg = true;
            }
            if (isImg) {
              return '<a href="' + escHtml(att.url) + '" target="_blank" rel="noopener">' +
                '<img src="' + escHtml(att.url) + '" style="max-width:240px;max-height:180px;border-radius:8px;display:block;border:1px solid var(--border);object-fit:cover" alt="Изображение">' +
              '</a>';
            } else {
              return '<a href="' + escHtml(att.url) + '" target="_blank" download="' + escHtml(att.name || 'файл') + '" class="task-chat-file-chip">' +
                '📄 <span style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(att.name || 'Вложение') + '</span>' +
              '</a>';
            }
          }).join('') +
        '</div>';
      }

      var textHtml = m.message_text ? ('<div style="white-space:pre-wrap">' + escHtml(m.message_text) + '</div>') : '';

      return '<div class="task-chat-msg-row ' + (isMe ? 'mine' : 'theirs') + '">' +
        avatarHtml +
        '<div class="task-chat-bubble ' + (isMe ? 'mine' : 'theirs') + '">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">' +
            '<span style="font-weight:700;font-size:.74rem;color:' + (isMe ? 'var(--orange-dark)' : 'var(--blue)') + '">' + (isMe ? 'Вы' : senderName) + '</span>' +
            roleBadge +
          '</div>' +
          textHtml +
          attHtml +
          '<div style="font-size:.64rem;color:var(--text-3);text-align:right;margin-top:3px">' + time + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  var elTab = document.getElementById('taskChatMessages_tab');
  if (elTab) elTab.innerHTML = html;
  var elDrawer = document.getElementById('taskChatMessages_drawer');
  if (elDrawer) elDrawer.innerHTML = html;
}
window.renderTaskChatMessages = renderTaskChatMessages;

function renderTaskChatPendingAttachments(target) {
  var sources = target ? [target] : ['tab', 'drawer'];
  var pending = S.taskChatPendingAttachments || [];

  sources.forEach(function(src) {
    var bar = document.getElementById('taskChatPendingAttachments_' + src);
    if (!bar) return;
    if (!pending.length) {
      bar.innerHTML = '';
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    bar.innerHTML = pending.map(function(att, idx) {
      return '<div class="task-chat-pending-item">' +
        '<span>📎 ' + escHtml(att.name || 'Файл') + '</span>' +
        '<button type="button" onclick="removeTaskChatPendingAttachment(' + idx + ')" style="background:none;border:none;cursor:pointer;color:var(--red);font-weight:bold;padding:0 3px">✕</button>' +
      '</div>';
    }).join('');
  });
}
window.renderTaskChatPendingAttachments = renderTaskChatPendingAttachments;

function loadTaskChat(taskId) {
  if (!taskId) return;
  if (S.taskChatRoom && String(S.taskChatRoom.task_id) === String(taskId)) {
    renderTaskChatMessages(taskId);
    scrollTaskChatToBottom();
  }
  S.taskChatLoading = true;
  api('/chats/task/' + encodeURIComponent(taskId))
    .then(function(res) {
      S.taskChatLoading = false;
      if (!res || !res.room) return;
      S.taskChatRoom = res.room;
      S.taskChatMessages = res.messages || [];
      S.taskChatMembers = res.members || [];

      if (S.socket && res.room.id) {
        S.socket.emit('join-room', res.room.id);
      }

      var count = (res.members || []).length;
      var btns = document.querySelectorAll('.chat-members-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].innerHTML = '👥 Участники (' + count + ')';
      }

      renderTaskChatMessages(taskId);
      scrollTaskChatToBottom();
    })
    .catch(function(err) {
      S.taskChatLoading = false;
      console.error('Ошибка загрузки чата заявки:', err);
    });
}
window.loadTaskChat = loadTaskChat;

function toggleTaskChatDrawer(taskId, forceState) {
  var id = taskId || S.cardId;
  if (forceState !== undefined) {
    S.taskChatDrawerOpen = !!forceState;
  } else {
    S.taskChatDrawerOpen = !S.taskChatDrawerOpen;
  }

  var drawer = document.getElementById('taskChatDrawer');
  if (drawer) {
    if (S.taskChatDrawerOpen) {
      drawer.classList.add('open');
      if (id) loadTaskChat(id);
    } else {
      drawer.classList.remove('open');
    }
  } else if (S.taskChatDrawerOpen && id) {
    renderApp();
    loadTaskChat(id);
  }
}
window.toggleTaskChatDrawer = toggleTaskChatDrawer;

function sendTaskChatMessage(taskId, source) {
  var id = taskId || S.cardId;
  var inputId = 'taskChatInput_' + (source || 'tab');
  var input = document.getElementById(inputId);
  var otherInputId = 'taskChatInput_' + (source === 'tab' ? 'drawer' : 'tab');
  var otherInput = document.getElementById(otherInputId);

  var text = (input ? input.value : '').trim();
  var pendingAttachments = (S.taskChatPendingAttachments || []).slice();

  if (!text && !pendingAttachments.length) return;
  if (!S.taskChatRoom || !S.taskChatRoom.id) {
    loadTaskChat(id);
    return;
  }

  var currentUserId = S.user ? (S.user.id || S.user.username) : null;
  var payload = {
    roomId: S.taskChatRoom.id,
    senderId: currentUserId,
    text: text,
    attachments: pendingAttachments
  };

  if (input) input.value = '';
  if (otherInput) otherInput.value = '';
  S.taskChatPendingAttachments = [];
  renderTaskChatPendingAttachments('tab');
  renderTaskChatPendingAttachments('drawer');

  if (S.socket && S.socket.connected) {
    S.socket.emit('send-message', payload);
  } else {
    api('/chats/' + encodeURIComponent(S.taskChatRoom.id) + '/messages', {
      method: 'POST',
      body: JSON.stringify({ text: text, attachments: pendingAttachments })
    }).then(function(msg) {
      if (msg && !S.taskChatMessages.some(function(m){ return m.id === msg.id; })) {
        S.taskChatMessages.push(msg);
        renderTaskChatMessages(id);
        scrollTaskChatToBottom();
      }
    }).catch(function(e) {
      alert('Ошибка отправки: ' + e.message);
    });
  }
}
window.sendTaskChatMessage = sendTaskChatMessage;

function triggerTaskChatUpload(source) {
  var fi = document.getElementById('taskChatFileInput_' + source);
  if (fi) fi.click();
}
window.triggerTaskChatUpload = triggerTaskChatUpload;

function handleTaskChatFileUpload(event, taskId, source) {
  var file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!S.taskChatRoom || !S.taskChatRoom.id) {
    alert('Чат еще загружается, попробуйте через секунду');
    return;
  }

  var formData = new FormData();
  formData.append('file', file);

  var uploadBtn = event.target.previousElementSibling;
  var origHtml = uploadBtn ? uploadBtn.innerHTML : '📎';
  if (uploadBtn) {
    uploadBtn.innerHTML = '⏳';
    uploadBtn.disabled = true;
  }

  fetch('/api/chats/' + encodeURIComponent(S.taskChatRoom.id) + '/upload', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + (S.token || '')
    },
    body: formData
  })
  .then(function(r) {
    if (!r.ok) throw new Error('Ошибка сервера при загрузке: ' + r.status);
    return r.json();
  })
  .then(function(res) {
    if (uploadBtn) {
      uploadBtn.innerHTML = origHtml;
      uploadBtn.disabled = false;
    }
    event.target.value = '';

    S.taskChatPendingAttachments = S.taskChatPendingAttachments || [];
    S.taskChatPendingAttachments.push({
      url: res.url,
      name: res.name || file.name,
      size: res.size || file.size,
      type: res.type || file.type
    });

    renderTaskChatPendingAttachments('tab');
    renderTaskChatPendingAttachments('drawer');
  })
  .catch(function(err) {
    if (uploadBtn) {
      uploadBtn.innerHTML = origHtml;
      uploadBtn.disabled = false;
    }
    alert('Не удалось прикрепить файл: ' + err.message);
  });
}
window.handleTaskChatFileUpload = handleTaskChatFileUpload;

function removeTaskChatPendingAttachment(idx) {
  if (!S.taskChatPendingAttachments) return;
  S.taskChatPendingAttachments.splice(idx, 1);
  renderTaskChatPendingAttachments('tab');
  renderTaskChatPendingAttachments('drawer');
}
window.removeTaskChatPendingAttachment = removeTaskChatPendingAttachment;

function scrollTaskChatToBottom() {
  setTimeout(function() {
    var bTab = document.getElementById('taskChatMessages_tab');
    if (bTab) bTab.scrollTop = bTab.scrollHeight;
    var bDrawer = document.getElementById('taskChatMessages_drawer');
    if (bDrawer) bDrawer.scrollTop = bDrawer.scrollHeight;
  }, 40);
}
window.scrollTaskChatToBottom = scrollTaskChatToBottom;

function refreshCardHistory(taskId) {
  if (!taskId) taskId = S.cardId;
  if (!taskId) return;
  var cont = document.getElementById('cardHistoryContainer');
  if (cont && !cont.querySelector('.hist-item')) {
    cont.innerHTML = '<div class="t3" style="padding:.5rem 0">Загрузка актуальной истории...</div>';
  }

  api('/tasks/' + encodeURIComponent(taskId)).then(function(freshTask) {
    if (freshTask && !freshTask.error) {
      if (!Array.isArray(S.tasks)) S.tasks = [];
      var idx = S.tasks.findIndex(function(x) { return String(x.id) === String(taskId); });
      if (idx !== -1) {
        S.tasks[idx] = freshTask;
      } else {
        S.tasks.push(freshTask);
      }
      var t = freshTask;
      var hist = (t.history || t._history || []).slice().reverse();
      var html = hist.length ? hist.map(function(h){
        var authorHtml = h.author ? ' <span class="badge b-gray" style="font-size:10px;padding:1px 5px;margin-left:5px">' + h.author + '</span>' : '';
        return '<div class="hist-item" style="padding:6px 0;border-bottom:1px solid var(--border)">' + (h.date || '—') + authorHtml + '<br><span class="t3">' + (h.field || 'Поле') + ':</span> <span style="text-decoration:line-through;color:var(--red);opacity:0.8">' + (h.old || '—') + '</span> &rarr; <b style="color:var(--text)">' + (h.new || '—') + '</b></div>';
      }).join('') : '<div class="t3" style="font-size:.78rem;padding:.5rem 0">Изменений не было</div>';

      var c = document.getElementById('cardHistoryContainer');
      if (c) c.innerHTML = html;
    }
  }).catch(function(err) {
    console.error('Error refreshing history:', err);
  });
}
window.refreshCardHistory = refreshCardHistory;

// Фоновая синхронизация карточки для совместной работы (Collaborative live-sync)
if (window._cardSyncInterval) clearInterval(window._cardSyncInterval);
window._cardSyncInterval = setInterval(function() {
  if (S.page !== 'card' || !S.cardId) return;
  // Если пользователь прямо сейчас редактирует форму или инпут в фокусе — не сбивать фокус
  if (S.cardDraft && Object.keys(S.cardDraft).length > 0) return;
  var activeTag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : '';
  if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

  var curTask = (S.tasks || []).find(function(x) { return String(x.id) === String(S.cardId); });
  var curVersion = curTask ? (curTask.version || 0) : 0;

  api('/tasks/' + encodeURIComponent(S.cardId)).then(function(fresh) {
    if (fresh && !fresh.error && curTask) {
      var histOld = JSON.stringify(curTask.history || curTask._history || []);
      var histNew = JSON.stringify(fresh.history || fresh._history || []);
      if ((fresh.version || 0) > curVersion || histOld !== histNew) {
        var idx = S.tasks.findIndex(function(x) { return String(x.id) === String(S.cardId); });
        if (idx !== -1) S.tasks[idx] = fresh;
        var actTag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : '';
        var isFocusingInput = (actTag === 'input' || actTag === 'textarea' || actTag === 'select');
        if (S.page === 'card' && String(S.cardId) === String(fresh.id) && !isFocusingInput && (!S.cardDraft || !Object.keys(S.cardDraft).length)) {
          renderApp();
          if (window.renderCardSmrCalculator) window.renderCardSmrCalculator(fresh.id);
          if (window.renderSmrChecklist) window.renderSmrChecklist(fresh.id);
        }
      }
    }
  }).catch(function() {});
}, 10000);

// Синхронизация при возврате вкладки браузера в активное состояние
if (!window._cardFocusListenerAdded) {
  window._cardFocusListenerAdded = true;
  window.addEventListener('focus', function() {
    if (S.page === 'card' && S.cardId && (!S.cardDraft || !Object.keys(S.cardDraft).length)) {
      var activeTag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
        api('/tasks/' + encodeURIComponent(S.cardId)).then(function(fresh) {
          if (fresh && !fresh.error) {
            var idx = (S.tasks || []).findIndex(function(x) { return String(x.id) === String(S.cardId); });
            if (idx !== -1) S.tasks[idx] = fresh;
            var actTag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : '';
            var isFocusingInput = (actTag === 'input' || actTag === 'textarea' || actTag === 'select');
            if (S.page === 'card' && String(S.cardId) === String(fresh.id) && !isFocusingInput && (!S.cardDraft || !Object.keys(S.cardDraft).length)) {
              renderApp();
              if (window.renderCardSmrCalculator) window.renderCardSmrCalculator(fresh.id);
              if (window.renderSmrChecklist) window.renderSmrChecklist(fresh.id);
            }
          }
        }).catch(function() {});
      }
    }
  });
}

