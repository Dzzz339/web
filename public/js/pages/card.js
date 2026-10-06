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
  var sel = document.getElementById('card_contract_select');
  var valStr = cId ? String(cId) : '';
  if (sel) {
    sel.value = valStr;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    var t = S.tasks.find(function(x){ return String(x.id) === String(S.cardId); });
    if (t) {
      if (valStr) {
        S.cardDraft.contract_id = Number(valStr);
        t.contract_id = Number(valStr);
        t.contractId = Number(valStr);
      } else {
        S.cardDraft.contract_id = null;
        t.contract_id = null;
        t.contractId = null;
      }
    }
  }
  S._cardContractPickerOpen = false;
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
      if (window.renderCardSmrCalculator) window.renderCardSmrCalculator(S.cardId);
    }
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
}

function returnFromCard() {
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

  var assigneeOpts = '<option value="">— (Не назначен) —</option>' + (S.users || []).map(function(u) {
    var curAssignee = Object.prototype.hasOwnProperty.call(S.cardDraft,'assignee') ? S.cardDraft.assignee : t.assignee;
    if (!u.full_name) return '';
    return '<option value="' + u.full_name + '"' + (curAssignee === u.full_name ? ' selected' : '') + '>#' + u.id + ' — ' + u.full_name + '</option>';
  }).join('');

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

  var curContractId = Object.prototype.hasOwnProperty.call(S.cardDraft, 'contract_id') 
    ? S.cardDraft.contract_id 
    : (t.contract_id != null ? t.contract_id : t.contractId);

  // Автоматическая привязка по префиксу номера заявки (например, 0926-02-1 -> договор 0926-02)
  if (!curContractId && t.id) {
    var mPrefix = String(t.id).match(/^(\d{4}-\d{2})/);
    if (mPrefix) {
      var autoMatched = (S.contracts || []).find(function(c) {
        return c.internal_number === mPrefix[1];
      });
      if (autoMatched) {
        curContractId = autoMatched.id;
        t.contract_id = autoMatched.id;
        t.contractId = autoMatched.id;
      }
    }
  }

  var sortedContracts = (S.contracts || []).slice().sort(function(a, b) {
    return getContractSortKey(b) - getContractSortKey(a);
  });

  var contractOpts = '<option value="">— (Не привязан к договору) —</option>' + sortedContracts.map(function(c) {
    var isSel = String(curContractId) === String(c.id);
    var cleanNum = cleanContractNumber(c.contract_number);
    var label = (c.internal_number ? 'Вн. ' + c.internal_number : '') + (cleanNum ? ' (№ ' + cleanNum + ')' : '') + ' · ' + (c.customer_name || '') + ' · ' + (c.contract_type_summary || '');
    return '<option value="' + c.id + '"' + (isSel ? ' selected' : '') + '>' + escHtml(label) + '</option>';
  }).join('');

  function field(lbl, key, type) {
    var isDirty = Object.prototype.hasOwnProperty.call(S.cardDraft, key);
    var val = isDirty ? S.cardDraft[key] : (t[key] || '');

    var canEdit = canUserEditField(S.user, key);
    if (!canEdit) {
      var displayVal = val;
      if (type === 'checkbox') {
        displayVal = val ? '✅ Да' : '❌ Нет';
      } else if (type === 'date') {
        displayVal = val ? String(val).slice(0, 10).split('-').reverse().join('.') : '—';
      } else if (type === 'number') {
        var num = parseFloat(val);
        var isCurrency = ['amount', 'pricePerUnit', 'distanceKm', 'extras', 'tmc'].includes(key);
        displayVal = (!isNaN(num) && val !== '' && val != null) ? (num.toLocaleString('ru-RU') + (isCurrency ? ' ₽' : '')) : '—';
      } else if (type === 'url') {
        displayVal = val ? ('<a href="' + escHtml(val) + '" target="_blank" rel="noopener noreferrer" style="color:var(--blue);text-decoration:underline;word-break:break-all">🔗 Открыть ссылку</a>') : '—';
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

      return '<div class="field-row">' +
        '<div class="field-lbl">' + lbl + '</div>' +
        '<div class="field-val" style="display:flex;align-items:center;justify-content:space-between;color:var(--text);font-weight:500;padding:5px 0">' +
          '<span>' + displayVal + '</span>' +
          '<span class="t3" style="font-size:.72rem;opacity:.55;cursor:help" title="Поле защищено от изменений вашей ролью">🔒</span>' +
        '</div>' +
      '</div>';
    }

    var inp = '';
    if (key === 'contract_id') {
      var curC = (S.contracts || []).find(function(x){ return String(x.id) === String(val || curContractId); });
      var cleanNum = curC ? cleanContractNumber(curC.contract_number) : '';
      var showPicker = S._cardContractPickerOpen || !curC;

      var selectedContractCard = curC ? (
        '<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:10px 12px;margin-bottom:6px;box-shadow:0 1px 3px rgba(0,0,0,0.03)">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
            '<div>' +
              '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
                (curC.internal_number ? '<span class="badge b-orange" style="font-weight:700;font-size:.78rem;font-family:monospace">Вн. ' + escHtml(curC.internal_number) + '</span>' : '') +
                (cleanNum ? '<span class="badge b-blue" style="font-weight:600;font-size:.78rem">№ ' + escHtml(cleanNum) + '</span>' : '') +
                '<span class="badge b-green" style="font-size:.72rem">🔗 Привязан</span>' +
              '</div>' +
              '<div style="font-weight:700;font-size:.88rem;color:var(--text);margin-top:4px">' +
                escHtml(curC.customer_name || 'Не указан') +
              '</div>' +
              '<div style="font-size:.76rem;color:var(--text-2);margin-top:2px">' +
                (curC.contract_type_summary ? ('<b>' + escHtml(curC.contract_type_summary) + '</b> · ') : '') +
                '🏢 ' + escHtml(curC.our_entity_name || 'ООО "Кабельные Системы"') +
              '</div>' +
            '</div>' +
            '<div style="display:flex;gap:4px;flex-shrink:0">' +
              '<button type="button" class="btn btn-sm btn-ghost" onclick="openContractModal(' + curC.id + ')" style="padding:3px 8px;font-size:.74rem;border:1px solid #bbf7d0" title="Открыть карточку генерального договора">👁️ Договор</button>' +
              '<button type="button" class="btn btn-sm btn-ghost" onclick="toggleCardContractPicker()" style="padding:3px 8px;font-size:.74rem;color:var(--text-3);border:1px solid var(--border)" title="Выбрать другой договор или отвязать">' + (showPicker ? 'Скрыть ▲' : 'Сменить ✕') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      ) : '';

      var pickerDisplay = showPicker ? 'block' : 'none';

      var quickFiltersHtml = '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="filterCardContractsList(\'\')" style="padding:1px 6px;font-size:.72rem">Все</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="filterCardContractsList(\'0926\')" style="padding:1px 6px;font-size:.72rem;background:#fef3c7;color:#92400e;border-color:#fde68a">0926 (Сент 26)</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="filterCardContractsList(\'0826\')" style="padding:1px 6px;font-size:.72rem;background:#f1f5f9;color:#334155;border-color:#cbd5e1">0826 (Авг 26)</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="filterCardContractsList(\'0726\')" style="padding:1px 6px;font-size:.72rem;background:#f1f5f9;color:#334155;border-color:#cbd5e1">0726 (Июль 26)</button>' +
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
        '<input type="text" id="card_contract_search_inp" placeholder="🔍 Поиск по номеру (0926...), договору или заказчику..." oninput="filterCardContractsList(this.value)" style="width:100%;padding:5px 8px;font-size:.82rem;border:1px solid var(--border);border-radius:6px;margin-bottom:6px">' +
        quickFiltersHtml +
        '<div id="card_contract_items_list" style="max-height:220px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px;background:#fff">' +
          contractsItemsHtml +
        '</div>' +
      '</div>';

      inp = '<div style="width:100%">' +
        '<select name="contract_id" data-key="contract_id" id="card_contract_select" style="display:none">' + contractOpts + '</select>' +
        selectedContractCard +
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
            '<div style="display:flex;gap:4px">' +
              '<button type="button" class="btn btn-sm btn-ghost" onclick="openContractorPicker(\'' + eid + '\')" style="font-size:.74rem;padding:2px 7px" title="Выбрать другого подрядчика">🔍 Сменить</button>' +
              '<button type="button" class="btn btn-sm btn-ghost" onclick="openSubcontractModal(\'' + eid + '\')" style="font-size:.74rem;padding:2px 7px;color:var(--primary)" title="Перейти к поручению и заказ-наряду">👷 В исполнение →</button>' +
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

      var custOptsHtml = custOptsList.map(function(opt) {
        var isSel = (String(val || '').toLowerCase().trim() === opt.toLowerCase().trim()) ? ' selected' : '';
        return '<option value="' + escHtml(opt) + '"' + isSel + '>' + escHtml(opt) + '</option>';
      }).join('');
      inp = '<select name="customer" data-key="customer" style="width:100%">' + custOptsHtml + '</select>';
    }
    else if (key === 'contact') {
      var rawContact = String(val || '');
      var phoneMatch = rawContact.match(/(?:\+7|8)[\s\-(]?\d{3}[\s\-)]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/);
      var cleanPhone = phoneMatch ? phoneMatch[0].replace(/[^\d+]/g, '') : null;
      var emailMatch = rawContact.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);

      var quickContactActions = '';
      if (cleanPhone || emailMatch) {
        var callBtn = cleanPhone ? '<a href="tel:' + cleanPhone + '" class="btn btn-sm btn-ghost" style="color:var(--green);font-size:.75rem;padding:2px 8px;border:1px solid var(--border)" title="Позвонить">📞 ' + escHtml(phoneMatch[0]) + '</a>' : '';
        var waBtn = cleanPhone ? '<a href="https://wa.me/' + cleanPhone.replace('+','') + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost" style="color:#16a34a;font-size:.75rem;padding:2px 8px;border:1px solid var(--border)" title="Написать в WhatsApp">💬 WhatsApp</a>' : '';
        var tgBtn = cleanPhone ? '<a href="https://t.me/+' + cleanPhone.replace('+','') + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost" style="color:#0284c7;font-size:.75rem;padding:2px 8px;border:1px solid var(--border)" title="Написать в Telegram">✈️ Telegram</a>' : '';
        var mailBtn = emailMatch ? '<a href="mailto:' + emailMatch[0] + '" class="btn btn-sm btn-ghost" style="color:var(--blue);font-size:.75rem;padding:2px 8px;border:1px solid var(--border)" title="Отправить E-mail">✉️ ' + escHtml(emailMatch[0]) + '</a>' : '';

        quickContactActions = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px">' + callBtn + waBtn + tgBtn + mailBtn + '</div>';
      }

      inp = '<div style="width:100%">' +
        '<textarea name="'+key+'" data-key="'+key+'" style="width:100%;font-size:.82rem;min-height:54px;transition:min-height .2s ease" rows="3" onfocus="this.style.minHeight=\'110px\'" onblur="if(this.value.length < 120) this.style.minHeight=\'54px\'">' + escHtml(rawContact) + '</textarea>' +
        quickContactActions +
      '</div>';
    }
    else if (type === 'textarea') inp = '<textarea name="'+key+'" data-key="'+key+'" style="width:100%;font-size:.82rem;min-height:54px;transition:min-height .2s ease" onfocus="this.style.minHeight=\'110px\'" onblur="if(this.value.length < 120) this.style.minHeight=\'54px\'">'+val+'</textarea>';
    else if (type === 'checkbox') inp = '<input type="checkbox" name="'+key+'" data-key="'+key+'"'+(val ? ' checked' : '')+'>';
    else inp = '<input type="'+(type||'text')+'" name="'+key+'" data-key="'+key+'" value="'+String(val).replace(/"/g,'&quot;')+'">';
    var dirtyMark = isDirty ? ' <span class="badge b-orange" style="font-size:10px;padding:1px 5px">изменено</span>' : '';
    return '<div class="field-row"><div class="field-lbl">'+lbl+dirtyMark+'</div><div class="field-val">'+inp+'</div></div>';
  }

  // История изменений
  var hist = (t._history || []).slice().reverse();
  var histHtml = hist.length ? hist.map(function(h){
  var authorHtml = h.author ? ' <span class="badge b-gray" style="font-size:10px;padding:1px 5px;margin-left:5px">' + h.author + '</span>' : '';
  return '<div class="hist-item">' + h.date + authorHtml + '<br><span class="t3">' + h.field + ':</span> <span style="text-decoration:line-through;color:var(--red);opacity:0.8">' + (h.old||'—') + '</span> &rarr; <b>' + (h.new||'—') + '</b></div>';
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
  var yandexUrl = 'https://yandex.ru/maps/?text=' + encodeURIComponent('Россия, ' + mapFullAddr);

  // Кнопки карт — показываются ВСЕГДА под картой
  var mapNavBtns = '<div style="display:flex;gap:.5rem;margin-top:.6rem;flex-wrap:wrap">' +
    '<a href="' + dgisUrl + '" target="_blank" class="btn btn-sm" style="background:#3069b0;gap:5px">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="10" r="4"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg>' +
      '2ГИС' +
    '</a>' +
    '<a href="' + yandexUrl + '" target="_blank" class="btn btn-sm" style="background:#fc3f1d;gap:5px">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="10" r="4"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/></svg>' +
      'Яндекс.Карты' +
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

  var hdr = '<div class="card-hdr" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:.5rem">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<button class="btn btn-sm btn-ghost" onclick="returnFromCard()" title="Вернуться назад к списку" style="font-weight:600">← ' + (S._cardOriginPage === 'kanban' ? 'Канбан' : 'Заявки') + '</button>' +
      '<h1 style="margin:0;font-size:1.25rem">'+t.id+'</h1>' +
      macroStatusHtml +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:6px">' +
      (isManagerOrAdmin ? '<button class="btn btn-sm btn-ghost" style="color:var(--red);border-color:rgba(239,68,68,0.25)" onclick="deleteTaskPrompt(\'' + eid + '\')" title="Удалить заявку из базы">🗑️ Удалить</button>' : '') +
      '<button class="btn btn-sm btn-ghost" onclick="window.print()" title="Распечатать карточку объекта / сохранить в PDF" style="font-size:.78rem">🖨️ Печать</button>' +
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
    'Материалы переданы в очередь ИД. Проектировщик берёт задачу в работу (ставится срок 3 рабочих дня).',
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

  var smartActionBox = ''; // Убрано по плану Алексея

  var curTab = S.cardTab || 'main';
  var openRemCount = Number(t.openRemarksCount || 0);
  var remarksTabBadge = openRemCount > 0
    ? ' <span class="card-tab-badge badge-red">' + openRemCount + '</span>'
    : '';

  var isWorker = S.user && (S.user.role === 'worker' || S.user.role === 'installer' || S.user.role === 'contractor');
  var tabsNav = '<div class="card-tabs-nav" style="display:flex;gap:4px;overflow-x:auto;padding-bottom:4px;margin-bottom:1rem;border-bottom:1.5px solid var(--border)">' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'main' ? 'active' : '') + '" data-tab="main" onclick="setCardTab(\'main\')" style="padding:6px 14px;font-size:.82rem">' +
      '🏛️ Информация' +
    '</button>' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'items' ? 'active' : '') + '" data-tab="items" onclick="setCardTab(\'items\')" style="padding:6px 14px;font-size:.82rem">' +
      '👷 Исполнение / СМР' +
    '</button>' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'supply' ? 'active' : '') + '" data-tab="supply" onclick="setCardTab(\'supply\')" style="padding:6px 14px;font-size:.82rem">' +
      '📦 Снабжение' +
    '</button>' +
    '<button type="button" class="card-tab-btn ' + (curTab === 'files' ? 'active' : '') + '" data-tab="files" onclick="setCardTab(\'files\')" style="padding:6px 14px;font-size:.82rem">' +
      '📄 Документы' + remarksTabBadge +
    '</button>' +
    (isWorker ? '' : '<button type="button" class="card-tab-btn ' + (curTab === 'finance' ? 'active' : '') + '" data-tab="finance" onclick="setCardTab(\'finance\')" style="padding:6px 14px;font-size:.82rem">' +
      '💰 Экономика' +
    '</button>') +
    '<button type="button" class="card-tab-btn ' + (curTab === 'history' ? 'active' : '') + '" data-tab="history" onclick="setCardTab(\'history\')" style="padding:6px 14px;font-size:.82rem">' +
      '🕒 История' +
    '</button>' +
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
      return '<div class="field-row"><div class="field-lbl" style="color:var(--text-3)">'+pair[0]+'</div>' +
        '<div class="field-val">'+fmtRaw(pair[1])+'</div></div>';
    }).join('');
    return '<div class="divider"></div>' +
      '<div class="sec-title" style="margin-bottom:.5rem">Дополнительно из Excel</div>' +
      rows;
  })();

  var phoneMatch = (t.contact || '').match(/(?:\+7|8)[\s\-(]?\d{3}[\s\-)]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/);
  var cleanPhone = phoneMatch ? phoneMatch[0].replace(/[^\d+]/g, '') : null;
  var quickActionsBar = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:.85rem">' +
    '<a href="https://yandex.ru/maps/?text=' + encodeURIComponent('Россия, ' + mapFullAddr) + '" target="_blank" rel="noopener noreferrer" class="quick-contact-btn nav-btn">📍 Яндекс.Навигатор</a>' +
    '<a href="https://2gis.ru/search/' + encodeURIComponent('Россия, ' + mapFullAddr) + '" target="_blank" rel="noopener noreferrer" class="quick-contact-btn nav-btn" style="background:#f0fdfa;color:#0f766e;border-color:#99f6e4">🗺️ 2ГИС</a>' +
    (cleanPhone ? '<a href="tel:' + cleanPhone + '" class="quick-contact-btn call-btn">📞 Позвонить (' + escHtml(phoneMatch[0]) + ')</a>' : '') +
  '</div>';

  var curContract = (S.contracts || []).find(function(x){ 
    var cid = (t.contract_id != null ? t.contract_id : t.contractId) || curContractId;
    return String(x.id) === String(cid); 
  });
  var ourEntityName = (curContract && curContract.our_entity_name) ? curContract.our_entity_name : 'ООО "Кабельные Системы"';
  var ourEntityHtml = isWorker ? '' : ('<div class="field-row"><div class="field-lbl">Генподрядчик (Мы)</div><div class="field-val" style="display:flex;align-items:center;padding:5px 0;font-weight:600;color:var(--text)">🏢 ' + escHtml(ourEntityName) + '</div></div>');

  var assignedContrObj = (S.contractors || []).find(function(c){ return c.name_short === String(t.contractor || '').trim(); });
  var contrPhoneHtml = (assignedContrObj && assignedContrObj.phone) ? (
    '<div class="field-row">' +
      '<div class="field-lbl">Телефон субподрядчика</div>' +
      '<div class="field-val" style="display:flex;align-items:center;gap:8px">' +
        '<a href="tel:' + assignedContrObj.phone.replace(/[^\d+]/g, '') + '" style="font-weight:600;color:var(--green)">📞 ' + escHtml(assignedContrObj.phone) + '</a>' +
        '<a href="https://wa.me/' + assignedContrObj.phone.replace(/[^\d]/g, '') + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost" style="padding:1px 6px;font-size:.74rem;color:#16a34a">💬 WhatsApp</a>' +
      '</div>' +
    '</div>'
  ) : '';

  var quickDocsCard = '<div class="card p" style="margin-bottom:1rem">' +
    '<div class="sec-title" style="margin-bottom:.5rem;display:flex;align-items:center;gap:6px">📄 Документы объекта</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="openAccessLetterModal(\'' + eid + '\')" title="Сформировать официальное письмо на допуск в Word (с паспортами монтажников)">🪪 Письмо на допуск</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="exportDoc(\'app2\',\'' + eid + '\')" title="Сформировать Заказ-наряд (Приложение №2) в Word / PDF">📄 Приложение №2</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="exportDoc(\'invoice\',\'' + eid + '\')" title="Сформировать и выгрузить Счёт на оплату">💰 Счёт на оплату</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="exportDoc(\'act\',\'' + eid + '\')" title="Сформировать Акт сдачи-приемки выполненных работ (КС-2)">✅ Акт работ</button>' +
    '</div>' +
  '</div>';

  var paneMain = '<div id="cardTabPane-main" class="card-tab-pane" style="display:' + (curTab === 'main' ? 'block' : 'none') + '">' +
    '<div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:1rem;align-items:start">' +
      '<div class="card p">' +
        '<div class="sec-title" style="margin-bottom:.5rem">Объект и стороны</div>' +
        field('Заказчик', 'customer') +
        (isWorker ? '' : field('Генеральный контракт', 'contract_id', 'select')) +
        ourEntityHtml +
        field('Регион', 'region') +
        field('Адрес объекта', 'address') +
        (isWorker ? '' : field('Тип объекта', 'tipObj')) +
        field('Тип работ', 'workType') +
        (isWorker ? '' : field('№ ГОСБ', 'gosb') +
        field('№ ВСП', 'vsp')) +
        '<div class="divider"></div>' +
        '<div class="sec-title" style="margin-bottom:.5rem">Команда и контакты</div>' +
        field('Статус заявки', 'status') +
        field('Приоритет', 'priority') +
        (isWorker ? '' : field('Ответственное лицо (Заказчик)', 'manager')) +
        field('Субподрядчик (наш)', 'contractor') +
        contrPhoneHtml +
        field('Проект-менеджер (наш)', 'assignee') +
        (t.assignee && t.assignmentStatus ? '<div class="field-row"><div class="field-lbl">Статус назначения</div><div class="field-val">' +
          (t.assignmentStatus === 'accepted' ? '<span class="badge b-green">Принял</span>' :
          t.assignmentStatus === 'declined' ? '<span class="badge b-red">Отказался</span>' :
          '<span class="badge b-gray">Ожидает подтверждения</span>') +
        '</div></div>' : '') +
        (t.assignee === (S.user.fullName || '') && t.assignmentStatus === 'pending'
          ? '<div class="field-row"><div class="field-lbl"></div><div class="field-val" style="display:flex;gap:.5rem">' +
              '<button class="btn btn-sm" onclick="acceptTask(\'' + t.id.replace(/'/g,"\\'") + '\')">✅ Принять заявку</button>' +
              '<button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="declineTask(\'' + t.id.replace(/'/g,"\\'") + '\')">❌ Отказаться</button>' +
            '</div></div>'
          : '') +
        field('Контролёр (Держатель контракта)', 'controller') +
        field('Контакт на объекте', 'contact', 'textarea') +
        '<div class="divider"></div>' +
        '<div class="sec-title" style="margin-bottom:.5rem">Заметки и комментарии</div>' +
        (isWorker ? '' : field('Внутренний комментарий', 'comment', 'textarea') +
        field('Комментарий из Excel', 'excelComment', 'textarea')) +
        (isWorker ? '' : rawExtraRows) +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:1rem">' +
        quickDocsCard +
        '<div class="card p">' +
          '<div class="sec-title" style="margin-bottom:.5rem">Карта объекта</div>' +
          mapHtml +
        '</div>' +
        '<div class="card p">' +
          '<div class="sec-title" style="margin-bottom:.5rem">Сроки и обследование</div>' +
          (isWorker ? '' : field('Дата заявки', 'dateZayavki', 'date')) +
          field('Дата окончания (план)', 'deadline', 'date') +
          field('Дата выхода (факт)', 'dataVyhoda', 'date') +
          field('Дата распределения', 'distributedAt', 'date') +
          field('Обследование', 'obsledovanie') +
          field('Доступ', 'dostup') +
          field('Приёмка (фото)', 'priemka') +
          (t.status === 'cancelled'
            ? '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)"><span class="badge b-red" style="padding:6px 12px;font-weight:700">🚫 Заявка отменена' + (t.overdueReason ? ': ' + escHtml(t.overdueReason) : '') + '</span></div>'
            : (!isLocked
                ? '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">' +
                    '<span style="font-size:.74rem;color:var(--text-3)">Если работы невозможны:</span>' +
                    '<button type="button" class="btn btn-sm btn-ghost" style="color:var(--red);border-color:rgba(239,68,68,0.3);font-size:.78rem" onclick="cancelTaskPrompt(\'' + eid + '\')" title="Отменить заявку с указанием причины">🚫 Отменить заявку</button>' +
                  '</div>'
                : '')) +
        '</div>' +
        (isWorker ? '' : '<div class="card p" style="background:#f8fafc;border:1.5px solid var(--border)">' +
          '<div class="sec-title" style="margin-bottom:.4rem;display:flex;align-items:center;gap:6px">📌 Происхождение заявки (Data Lineage)</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px;font-size:.78rem">' +
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
        (!isLocked && S.user && ['admin','director','manager','to_engineer'].includes(String(S.user.role||'').toLowerCase()) ? '<button class="btn btn-sm" onclick="addItemPrompt(\'' + eid + '\')">+ Добавить работу / ТМЦ</button>' : '') +
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
        '<label class="btn btn-sm btn-ghost" style="cursor:pointer" title="Загрузить чек-лист Заказчика (PDF)">' +
          '📥 Загрузить PDF' +
          '<input type="file" accept=".pdf" style="display:none" onchange="uploadChecklistPdf(this.files[0], \'' + eid + '\')">' +
        '</label>' +
        '<button class="btn btn-sm btn-ghost" onclick="recalculateTaskMaterials(\'' + eid + '\')" title="Пересчитать плановые нормы по типовику">🔄 Расчет</button>' +
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

  var paneItems = '<div id="cardTabPane-items" class="card-tab-pane" style="display:' + (curTab === 'items' ? 'block' : 'none') + '">' +
    '<div id="cardSmrCalculatorBlock" style="margin-bottom:1rem"></div>' +
    subcontractsBlock +
    '<div class="card p mb" id="attachmentsBlock">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
        '<div class="sec-title" style="margin:0">Файлы и фотоотчёты к заявке</div>' +
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
        '<div class="sec-title" style="margin:0;font-size:1.05rem">📑 Реестр сформированных документов</div>' +
        '<div style="font-size:.78rem;color:var(--text-3);margin-top:2px">Официальные документы по объекту: Заказ-наряды, Письма на допуск, Доверенности М-2, Реестры ИД</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn btn-sm btn-primary" onclick="generateTaskRegistryDoc(\'' + eid + '\')">📑 Сформировать Реестр ИД (.docx)</button>' +
        '<button class="btn btn-sm btn-ghost" onclick="openAccessLetterModal(\'' + eid + '\')">📄 Допуск на объект</button>' +
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
    '<div class="card p" id="portsBlock">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
        '<div class="sec-title" style="margin:0">КЖ / Протокол измерений портов</div>' +
        '<button class="btn btn-sm btn-ghost" onclick="addPortRow(\''+t.id+'\')">+ Порт</button>' +
      '</div>' +
      '<div id="portsList" class="t3">Загрузка…</div>' +
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

    // Субподрядчик
    var taskContr = (t.contractor || '').trim();
    var curSub = (window._curCardSubcontracts || [])[0] || null;

    var subTitle = taskContr
      ? ('🏢 ' + escHtml(taskContr) + (curSub && curSub.deadline ? (' · Дедлайн: ' + curSub.deadline.slice(0, 10).split('-').reverse().join('.')) : ''))
      : 'Подрядчик пока не выбран';

    // Формула Алексея для субподряда: Сумма = (ед * факт + уд + доп)
    var subRate = (t.rawData && t.rawData.subRate != null) ? Number(t.rawData.subRate) : (curSub && curSub.price_agreed && effectivePorts > 0 ? Math.round(curSub.price_agreed / effectivePorts) : 500);
    var subDist = (t.rawData && t.rawData.subDist != null) ? Number(t.rawData.subDist) : (distanceVal > 0 ? Math.round(distanceVal * 0.5) : 0);
    var subExtras = (t.rawData && t.rawData.subExtras != null) ? Number(t.rawData.subExtras) : 0;

    var calculatedSubTotal = curSub && curSub.price_agreed > 0
      ? Number(curSub.price_agreed)
      : Math.round((subRate * effectivePorts) + subDist + subExtras);

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
              '<div class="field-val" style="font-weight:800;font-size:1.15rem;color:#15803d">' + fmtMoney(totalCustomerAmount) + '</div>' +
            '</div>' +

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

        // ПРАВАЯ КОЛОНКА: ВЫХОД (СЕБЕСТОИМОСТЬ: ТМЦ + СУБПОДРЯД)
        '<div style="display:flex;flex-direction:column;gap:1rem">' +
          '<div style="font-weight:700;font-size:.86rem;color:var(--orange-dark);display:flex;align-items:center;gap:6px;background:#fffbeb;padding:6px 10px;border-radius:6px;border:1px solid #fde68a">' +
            '<span>📤</span> ВЫХОД: СЕБЕСТОИМОСТЬ (ТМЦ + СУБПОДРЯД)' +
          '</div>' +

          // КАРТОЧКА 1: ТМЦ
          '<div class="card p">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">' +
              '<div>' +
                '<div class="sec-title" style="margin:0">ТМЦ (Материалы и логистика)</div>' +
                '<div style="font-size:.76rem;color:var(--text-3)">Списание со склада и доставка на объект</div>' +
              '</div>' +
              '<button type="button" class="btn btn-sm btn-ghost" onclick="setCardTab(\'supply\')" style="font-size:.74rem">📦 На склад →</button>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">' +
              '<div style="background:var(--bg);padding:8px 10px;border-radius:6px">' +
                '<div class="t3" style="font-size:.72rem">Стоимость материалов (ТМЦ)</div>' +
                '<div style="font-weight:700;font-size:1rem;color:var(--text);margin-top:2px">' + fmtMoney(tmcVal) + '</div>' +
              '</div>' +
              '<div style="background:var(--bg);padding:8px 10px;border-radius:6px">' +
                '<div class="t3" style="font-size:.72rem">Доставка / Логистика</div>' +
                '<div style="font-weight:700;font-size:1rem;color:var(--text);margin-top:2px">' + fmtMoney(extrasVal) + '</div>' +
              '</div>' +
            '</div>' +

            '<div style="font-size:.8rem;color:var(--text-2);border-top:1px dashed var(--border);padding-top:8px">' +
              '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
                '<span>Кабель UTP / ВОЛС, разъемы, патч-панели</span>' +
                '<b>' + fmtMoney(tmcVal) + '</b>' +
              '</div>' +
              '<div style="display:flex;justify-content:space-between;color:var(--text-3);font-size:.75rem">' +
                '<span>Транспорт и доставка («откуда-куда-кто-почем»)</span>' +
                '<span>' + fmtMoney(extrasVal) + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // КАРТОЧКА 2: (СУБ)ПОДРЯДЧИК
          '<div class="card p">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem">' +
              '<div>' +
                '<div class="sec-title" style="margin:0">Расчет с субподрядчиком</div>' +
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
              '<span style="font-size:.78rem;font-weight:600">Остаток к выплате:</span>' +
              '<span style="font-weight:800;font-size:1.05rem;color:' + remainingColor + '">' + fmtMoney(remainingToPay) + '</span>' +
            '</div>' +

          '</div>' +

        '</div>' +

      '</div>' +
    '</div>';
  })();

  var paneHistory = '<div id="cardTabPane-history" class="card-tab-pane" style="display:' + (curTab === 'history' ? 'block' : 'none') + '">' +
    '<div class="card p">' +
      '<div class="sec-title" style="margin-bottom:.5rem">История изменений заявки</div>' +
      histHtml +
    '</div>' +
  '</div>';

  var hasDraft = Object.keys(S.cardDraft).length > 0;
  var unsavedBar = hasDraft
    ? '<div class="unsaved-bar">' +
        '<span>У вас есть несохранённые изменения</span>' +
        '<button class="btn btn-sm" id="cardSaveBtn">Сохранить</button>' +
        '<button class="btn btn-sm btn-ghost" id="cardResetBtn">Сбросить</button>' +
      '</div>'
    : '';

  var mobileActionBar = '<div class="mobile-action-bar">' +
    (hasDraft
      ? '<button class="btn btn-sm btn-primary mobile-action-main-btn" onclick="saveCard()">💾 Сохранить</button>' +
        '<button class="btn btn-sm btn-ghost" onclick="S.cardDraft={};renderApp()">✕</button>'
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

  return hdr +
    cancelledBanner +
    smartActionBox +
    tabsNav +
    '<form id="cardForm" onsubmit="return false;">' +
      paneMain +
      paneItems +
      paneSupply +
      paneFiles +
      paneFinance +
      paneHistory +
    '</form>' +
    mobileActionBar +
    unsavedBar +
    confirmModal;
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
      var rows = items.map(function(it, idx) {
        var statusColor = it.status === 'done' ? 'var(--green)' : it.status === 'progress' ? 'var(--orange)' : 'var(--text-3)';
        var statusLabel = it.status === 'done' ? '✓ Выполнено' : it.status === 'progress' ? '⚙ В работе' : '⏳ Запланировано';

        var contOptions = '<option value="">(Не назначен)</option>' +
          contractors.map(function(c) {
            var selected = (it.contractor_id === c.id || it.contractor_name === c.name_short) ? ' selected' : '';
            return '<option value="' + c.id + '"' + selected + '>' + escHtml(c.name_short) + '</option>';
          }).join('');

        var margin = (Number(it.amount_customer) || 0) - (Number(it.amount_contractor) || 0);
        var selectDisabled = isLocked ? ' disabled' : '';

        return '<tr style="border-bottom:1px solid var(--border);font-size:.82rem">' +
          '<td style="padding:6px 8px;font-weight:600;color:var(--text-3)">' + (idx + 1) + '</td>' +
          '<td style="padding:6px 8px">' +
            '<div style="font-weight:600;color:var(--text)">' + escHtml(it.work_type) + '</div>' +
            (it.comment ? '<div style="font-size:.72rem;color:var(--text-3)">' + escHtml(it.comment) + '</div>' : '') +
          '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap;font-weight:600">' + (it.quantity || 1) + ' ' + escHtml(it.unit || 'шт.') + '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap;color:var(--text)">' + fmtMoney(it.amount_customer) + '</td>' +
          '<td style="padding:6px 8px">' +
            '<select class="field-input"' + selectDisabled + ' style="padding:2px 6px;font-size:.76rem" onchange="updateItemContractor(\'' + taskId.replace(/'/g, "\\'") + '\',' + it.id + ',this.value)">' +
              contOptions +
            '</select>' +
          '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap;color:var(--text-2)">' + fmtMoney(it.amount_contractor) + '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap;font-weight:600;color:' + (margin >= 0 ? 'var(--green)' : 'var(--red)') + '">' + fmtMoney(margin) + '</td>' +
          '<td style="padding:6px 8px;white-space:nowrap">' +
            '<span style="font-size:.74rem;color:' + statusColor + ';font-weight:600">' + statusLabel + '</span>' +
          '</td>' +
          '<td style="padding:6px 8px;text-align:right;white-space:nowrap">' +
            (!isLocked ? '<button class="btn btn-sm btn-ghost" onclick="editItemModal(\'' + taskId.replace(/'/g, "\\'") + '\',' + it.id + ')" title="Редактировать">✏️</button>' : '') +
            (!isLocked ? '<button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="deleteItemModal(\'' + taskId.replace(/'/g, "\\'") + '\',' + it.id + ')" title="Удалить">✕</button>' : '') +
          '</td>' +
        '</tr>';
      }).join('');

      el.innerHTML = '<div style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse;text-align:left">' +
          '<thead><tr style="background:var(--bg);font-size:.74rem;color:var(--text-3);border-bottom:1px solid var(--border)">' +
            '<th style="padding:6px 8px">№</th>' +
            '<th style="padding:6px 8px">Вид работ / позиция</th>' +
            '<th style="padding:6px 8px">Кол-во</th>' +
            '<th style="padding:6px 8px">Заказчик (вход)</th>' +
            '<th style="padding:6px 8px">Подрядчик (исп.)</th>' +
            '<th style="padding:6px 8px">Подрядчику</th>' +
            '<th style="padding:6px 8px">Маржа</th>' +
            '<th style="padding:6px 8px">Статус</th>' +
            '<th style="padding:6px 8px"></th>' +
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

  var totalCust = 0, totalCont = 0;
  var contractorsMap = {};

  (items || []).forEach(function(it) {
    totalCust += Number(it.amount_customer) || 0;
    totalCont += Number(it.amount_contractor) || 0;
    var cName = it.contractor_name;
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
          return '<button class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:.74rem" onclick="exportDoc(\'app2\',\'' + taskId.replace(/'/g, "\\'") + '\',\'' + cn.replace(/'/g, "\\'") + '\')">📥 Заказ: ' + escHtml(cn) + ' (' + contractorsMap[cn] + ' поз.)</button>';
        }).join('');
    } else {
      ordersBar.innerHTML = '';
    }
  }
}

function addItemPrompt(taskId) {
  var work = prompt('Введите наименование работы или материала (ТМЦ):');
  if (work === null) return;
  if (!work.trim()) return alert('Наименование работы обязательно!');

  var qtyStr = prompt('Количество (например, 15):', '1');
  var qty = parseFloat((qtyStr || '1').replace(',', '.')) || 1;

  var unit = prompt('Единица измерения:', 'шт.') || 'шт.';

  var priceCustStr = prompt('Стоимость от Заказчика за ед., руб.:', '0');
  var priceCust = parseFloat((priceCustStr || '0').replace(',', '.')) || 0;

  var priceContStr = prompt('Ставка Подрядчику за ед., руб. (необязательно):', '0');
  var priceCont = parseFloat((priceContStr || '0').replace(',', '.')) || 0;

  api('/tasks/' + encodeURIComponent(taskId) + '/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      work_type: work.trim(),
      quantity: qty,
      unit: unit.trim(),
      price_customer: priceCust,
      amount_customer: qty * priceCust,
      price_contractor: priceCont,
      amount_contractor: qty * priceCont
    })
  })
  .then(function(res) {
    if (res.error) return alert('Ошибка: ' + res.error);
    refreshTaskItemsList(taskId);
    var t = S.tasks.find(function(x){ return String(x.id) === String(taskId); });
    if (t) {
      t.amount = (t.amount || 0) + (qty * priceCust);
    }
  })
  .catch(function(err) {
    alert('Ошибка добавления позиции: ' + (err.message || err));
  });
}

function updateItemContractor(taskId, itemId, contractorId) {
  var cObj = (S.contractors || []).find(function(c) { return String(c.id) === String(contractorId); });
  var cName = cObj ? cObj.name_short : null;

  api('/tasks/' + encodeURIComponent(taskId) + '/items/' + itemId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contractor_id: contractorId ? parseInt(contractorId, 10) : null,
      contractor_name: cName
    })
  })
  .then(function(res) {
    if (res.error) return alert('Ошибка: ' + res.error);
    refreshTaskItemsList(taskId);
  })
  .catch(function(err) {
    alert('Ошибка назначения подрядчика: ' + (err.message || err));
  });
}

function editItemModal(taskId, itemId) {
  api('/tasks/' + encodeURIComponent(taskId) + '/items')
    .then(function(list) {
      var item = (list || []).find(function(x) { return x.id === itemId; });
      if (!item) return alert('Позиция не найдена');

      var newWork = prompt('Наименование работы:', item.work_type);
      if (newWork === null) return;
      if (!newWork.trim()) return alert('Наименование обязательно');

      var newQtyStr = prompt('Количество:', String(item.quantity || 1));
      var newQty = parseFloat((newQtyStr || '1').replace(',', '.')) || 1;

      var newPriceCustStr = prompt('Цена Заказчика за ед., руб.:', String(item.price_customer || 0));
      var newPriceCust = parseFloat((newPriceCustStr || '0').replace(',', '.')) || 0;

      var newPriceContStr = prompt('Ставка подрядчику за ед., руб.:', String(item.price_contractor || 0));
      var newPriceCont = parseFloat((newPriceContStr || '0').replace(',', '.')) || 0;

      api('/tasks/' + encodeURIComponent(taskId) + '/items/' + itemId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_type: newWork.trim(),
          quantity: newQty,
          price_customer: newPriceCust,
          amount_customer: newQty * newPriceCust,
          price_contractor: newPriceCont,
          amount_contractor: newQty * newPriceCont
        })
      })
      .then(function(res) {
        if (res.error) return alert('Ошибка: ' + res.error);
        refreshTaskItemsList(taskId);
      })
      .catch(function(err) {
        alert('Ошибка сохранения позиции: ' + (err.message || err));
      });
    });
}

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


function refreshAttachmentsList(taskId) {
  var el = document.getElementById('attachmentsList');
  if (!el) return;
  loadAttachments(taskId).then(function(list) {
    if (!Array.isArray(list) || !list.length) {
      el.innerHTML = '<span class="t3">Пока ничего не загружено</span>';
      return;
    }
    var typeLabels = { photo_report: '📷 Фото', scheme: '🗺️ Схема', act: '📄 Акт', receipt: '🧾 Чек', pi_excel: '📊 Excel ПИ', order_pdf: '📑 Заказ (PDF)', checklist: '📋 Чек-лист' };
    el.innerHTML = list.map(function(a) {
      var cleanName = (typeof fixMojibake === 'function' ? fixMojibake(a.original_name) : a.original_name) || 'файл';
      return '<div class="field-row">' +
        '<div class="field-lbl">' + (typeLabels[a.type] || a.type) + '</div>' +
        '<div class="field-val"><a href="/api/attachments/' + a.id + '/file?token=' + '' + '" onclick="event.preventDefault();openAttachment(' + a.id + ')">' + escHtml(cleanName) + '</a>' +
        ' <button class="btn btn-sm btn-ghost" onclick="handleAttachmentDelete(' + a.id + ',\'' + taskId + '\')" title="Удалить">✖</button></div>' +
      '</div>';
    }).join('');
  });
}
var typeLabels = { photo_report: '📷 Фото', scheme: '🗺️ Схема', act: '📄 Акт', receipt: '🧾 Чек', pi_excel: '📊 Excel ПИ', order_pdf: '📑 Заказ (PDF)', checklist: '📋 Чек-лист' };

function openAttachment(id) {
  fetch('/api/attachments/' + id + '/file', { headers: { 'Authorization': 'Bearer ' + S.token } })
    .then(function(r){ return r.blob(); })
    .then(function(blob){ window.open(URL.createObjectURL(blob), '_blank'); });
}

function handleAttachmentUpload(taskId, type, files) {
  if (!files || !files.length) return;
  uploadAttachments(taskId, type, files).then(function() {
    refreshAttachmentsList(taskId);
  });
}

function handleAttachmentDelete(attId, taskId) {
  if (!confirm('Удалить файл?')) return;
  deleteAttachment(attId).then(function() { refreshAttachmentsList(taskId); });
}

function refreshPortsList(taskId) {
  var el = document.getElementById('portsList');
  if (!el) return;
  api('/tasks/' + taskId + '/ports').then(function(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      el.innerHTML = '<span class="t3">Строк пока нет</span>';
      return;
    }
    el.innerHTML = '<table style="width:100%;font-size:.8rem"><thead><tr>' +
      '<th style="text-align:left">Порт</th><th style="text-align:left">Патч-панель</th><th style="text-align:left">Помещение</th><th style="text-align:left">Маркировка</th><th style="text-align:left">Длина, м</th><th></th>' +
    '</tr></thead><tbody>' +
    rows.map(function(r) {
      return '<tr>' +
        '<td><input value="' + (r.port_number||'').replace(/"/g,'&quot;') + '" onchange="savePortRow(' + r.id + ',\'' + taskId + '\')" data-field="portNumber" id="pr_' + r.id + '_port" style="width:60px"></td>' +
        '<td><input value="' + (r.patch_panel||'').replace(/"/g,'&quot;') + '" onchange="savePortRow(' + r.id + ',\'' + taskId + '\')" id="pr_' + r.id + '_patch" style="width:80px"></td>' +
        '<td><input value="' + (r.room||'').replace(/"/g,'&quot;') + '" onchange="savePortRow(' + r.id + ',\'' + taskId + '\')" id="pr_' + r.id + '_room" style="width:100px"></td>' +
        '<td><input value="' + (r.marking||'').replace(/"/g,'&quot;') + '" onchange="savePortRow(' + r.id + ',\'' + taskId + '\')" id="pr_' + r.id + '_marking" style="width:100px"></td>' +
        '<td><input type="number" value="' + (r.cable_length||'') + '" onchange="savePortRow(' + r.id + ',\'' + taskId + '\')" id="pr_' + r.id + '_len" style="width:70px"></td>' +
        '<td><button class="btn btn-sm btn-ghost" onclick="deletePortRow(' + r.id + ',\'' + taskId + '\')">✖</button></td>' +
      '</tr>';
    }).join('') +
    '</tbody></table>';
  });
}

function addPortRow(taskId) {
  api('/tasks/' + taskId + '/ports', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ portNumber:'', patchPanel:'', room:'', marking:'', cableLength:null })
  }).then(function() { refreshPortsList(taskId); });
}

function savePortRow(rowId, taskId) {
  var data = {
    portNumber: document.getElementById('pr_' + rowId + '_port').value,
    patchPanel: document.getElementById('pr_' + rowId + '_patch').value,
    room:       document.getElementById('pr_' + rowId + '_room').value,
    marking:    document.getElementById('pr_' + rowId + '_marking').value,
    cableLength: document.getElementById('pr_' + rowId + '_len').value || null
  };
  api('/ports/' + rowId, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
}

function deletePortRow(rowId, taskId) {
  if (!confirm('Удалить строку?')) return;
  api('/ports/' + rowId, { method:'DELETE' }).then(function() { refreshPortsList(taskId); });
}

var fieldLabels = {
  status:'Статус', priority:'Приоритет', stage:'Этап', assignee:'Проект-менеджер (наш)',
  contract_id:'Генеральный договор',
  controller:'Контролёр (Держатель контракта)', comment:'Комментарий', distributedAt:'Дата распределения',
  contact:'Контакт на объекте', techLink:'Ссылка', deadline:'Дата окончания работ',
  dateZayavki:'Дата заявки', fact:'Факт', obsledovanie:'Обследование',
  dostup:'Доступ', dataVyhoda:'Дата выхода', priemka:'Приёмка',
  oplata:'Оплата подрядчику', edoNumber:'№ документа в ЭДО',
  invoiceInfo:'№ счёта/сумма', vedoStatus:'В ЭДО',
  region:'Регион', address:'Адрес объекта', workType:'Тип работ',
  tipObj:'Тип объекта', gosb:'№ ГОСБ', vsp:'№ ВСП',
  manager:'Ответственное лицо (Заказчик)', amount:'Сумма договора', inOrder:'В заказе (портов)',
  overdueDays:'Дней просрочки', contractor:'Субподрядчик (наш)',
  distanceKm:'Удалённость (км)', pricePerUnit:'Стоимость за ед.',
  idStatus:'Статус ИД', excelComment:'Комментарий (Excel)',
  supplierOrderSigned:'Заказ подписан на портале', supplierIdUploaded:'ИД загружена на портал',
  overdueReason:'Причина просрочки'
};

function saveCard() {
  var t = S.tasks.find(function(x){ return String(x.id) === String(S.cardId); });
  if (!t) return;
  var data = Object.assign({}, S.cardDraft);
  if (!Object.keys(data).length) { S.cardConfirmOpen = false; renderApp(); return; }

  var now = new Date().toLocaleString('ru');
  var author = S.user ? (S.user.full_name || S.user.username) : 'Система';
  var hist = t._history || [];
  Object.keys(data).forEach(function(k){
    var oldV = t[k], newV = data[k];
    var isBool = typeof newV === 'boolean';
    var oldStr = isBool ? (!!oldV ? 'Да' : 'Нет') : String(oldV||'');
    var newStr = isBool ? (newV ? 'Да' : 'Нет') : String(newV);
    if (oldStr !== newStr) {
      hist.push({date:now, author:author, field:fieldLabels[k]||k, old:oldStr, new:newStr});
    }
  });
  data._history = hist;

  delete data.status;
  delete data.stage;
  delete data.stageNum;

  api('/tasks/' + S.cardId, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)})
    .then(function(){
      Object.assign(t, data);
      S.cardDraft = {};
      S.cardConfirmOpen = false;
      renderApp();
    })
    .catch(function(e){ alert('Ошибка сохранения: ' + e.message); });
}

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

    var defaultContractor = 'ООО "Ультима"';
    var defaultResponsible = '8(923) 102-40-42, ПМ – Чайка Алексей Николаевич';
    
    var parts = [];
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
      <div style="background:#fff;border-radius:14px;padding:1.5rem;width:100%;max-width:640px;box-shadow:0 12px 48px rgba(0,0,0,.25);max-height:90vh;display:flex;flex-direction:column">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <div>
            <div style="font-weight:700;font-size:1.1rem">📄 Письмо на допуск (Word .docx)</div>
            <div style="font-size:.8rem;color:var(--text-3);margin-top:2px">Подготовка допуска для объекта: <b>${escHtml(t.id)}</b></div>
          </div>
          <button onclick="document.getElementById('_access_letter_modal').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-3);line-height:1">×</button>
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

          <div id="alm_specialists_list" style="border:1.5px solid var(--border);border-radius:8px;max-height:260px;overflow-y:auto;padding:6px;background:var(--bg)">
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
            <button id="alm_download_btn" class="btn btn-sm" onclick="downloadAccessLetter('${escHtml(taskId)}')">📥 Скачать письмо (.docx)</button>
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

  var contractorName = (document.getElementById('alm_contractor') ? document.getElementById('alm_contractor').value : '').trim();
  var responsibleInfo = (document.getElementById('alm_responsible') ? document.getElementById('alm_responsible').value : '').trim();
  var customTaskInfo = (document.getElementById('alm_task_info') ? document.getElementById('alm_task_info').value : '').trim();

  var checkedCbs = modal.querySelectorAll('input[name="alm_spec_cb"]:checked');
  var specialistIds = Array.from(checkedCbs).map(function(cb){ return parseInt(cb.value); });

  if (specialistIds.length === 0) {
    return alert('Пожалуйста, выберите хотя бы одного специалиста для допуска');
  }

  var btn = document.getElementById('alm_download_btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Генерация Word...';
  }

  fetch('/api/tasks/' + encodeURIComponent(taskId) + '/access-letter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + S.token
    },
    body: JSON.stringify({
      specialistIds: specialistIds,
      contractorName: contractorName,
      responsibleInfo: responsibleInfo,
      customTaskInfo: customTaskInfo
    })
  })
  .then(function(r) {
    if (!r.ok) return r.json().then(function(e){ throw new Error(e.error || 'Ошибка сервера'); });
    return r.blob();
  })
  .then(function(blob) {
    var bUrl = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = bUrl;
    var cleanId = taskId.replace(/[/\\?%*:|"<>]/g, '_');
    a.download = 'Pismo_na_dopusk_' + cleanId + '.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(bUrl);
    modal.remove();
  })
  .catch(function(err) {
    alert('Не удалось сформировать письмо на допуск: ' + err.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📥 Скачать письмо (.docx)';
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

    var html = '';

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

    // Таблица материалов (план vs факт)
    var allWrittenOff = materials.every(function(m){ return m.is_written_off; });

    html += '<table style="width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:10px">' +
      '<thead><tr style="border-bottom:1px solid var(--border);color:var(--text-3);text-align:left">' +
        '<th style="padding:6px 4px">Материал</th>' +
        '<th style="padding:6px 4px;text-align:right">План</th>' +
        '<th style="padding:6px 4px;text-align:right">Факт</th>' +
      '</tr></thead><tbody>';

    materials.forEach(function(m) {
      var isDone = m.is_written_off;
      var factInput = isDone
        ? '<span style="font-weight:700;color:var(--green)">' + (m.fact_qty != null ? m.fact_qty : m.plan_qty) + ' ' + m.unit + '</span>'
        : '<input type="number" step="any" min="0" value="' + (m.fact_qty != null ? m.fact_qty : m.plan_qty) + '" id="fact_mat_' + m.material_id + '" style="width:65px;padding:3px 6px;text-align:right;font-size:.82rem">';

      html += '<tr style="border-bottom:1px solid var(--border)">' +
        '<td style="padding:6px 4px">' +
          '<div style="font-weight:600">' + escHtml(m.name) + '</div>' +
          (m.calc_details ? '<div style="font-size:.7rem;color:var(--text-3)">' + escHtml(m.calc_details) + '</div>' : '') +
        '</td>' +
        '<td style="padding:6px 4px;text-align:right;white-space:nowrap;color:var(--text-2)">' + m.plan_qty + ' ' + m.unit + '</td>' +
        '<td style="padding:6px 4px;text-align:right;white-space:nowrap">' + factInput + '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';

    if (allWrittenOff) {
      html += '<div style="background:#ecfdf5;color:#065f46;padding:8px 12px;border-radius:6px;font-size:.8rem;font-weight:600;display:flex;align-items:center;gap:6px">' +
        '<span>✅</span> ТМЦ списаны со склада подрядчика в полном объеме' +
      '</div>';
    } else {
      html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
        '<button class="btn btn-sm btn-primary" onclick="writeOffTaskMaterials(\'' + encodeURIComponent(taskId) + '\')">✅ Списать ТМЦ по факту</button>' +
        '<button class="btn btn-sm btn-ghost" onclick="recalculateTaskMaterials(\'' + encodeURIComponent(taskId) + '\')" title="Пересчитать нормы">🔄 Пересчитать</button>' +
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

      if (!confirm('Подтвердить фактический расход и списать материалы с виртуального склада подрядчика?')) return;

      fetch('/api/tasks/' + encodeURIComponent(taskId) + '/materials/write-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
        body: JSON.stringify({ items: items, comment: 'Списание по заявке ' + taskId })
      })
      .then(function(r){ return r.json(); })
      .then(function(res) {
        if (res.success) {
          alert('✅ Материалы успешно списаны со склада подрядчика!');
          loadCardMaterials(taskId);
        } else {
          alert('Ошибка списания: ' + (res.error || 'неизвестная ошибка'));
        }
      });
    });
}


// changeTaskMacroStatus определена глобально в public/js/helpers.js

function loadCardSubcontracts(taskId) {
  var cont = document.getElementById('cardSubcontractsContainer');
  if (window.renderCardSmrCalculator) window.renderCardSmrCalculator(taskId);
  if (!cont) return;
  api('/tasks/' + encodeURIComponent(taskId) + '/subcontracts')
    .then(function(subs) {
      window._curCardSubcontracts = subs || [];
      if (!Array.isArray(subs) || !subs.length) {
        var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); }) || {};
        var taskContr = (t.contractor || '').trim();
        var contrObj = taskContr ? (S.contractors || []).find(function(c){ return c.name_short === taskContr; }) : null;

        if (taskContr) {
          cont.innerHTML = '<div style="background:#fff;border:1.5px solid var(--border);border-radius:8px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:10px">' +
              '<div>' +
                '<div style="font-size:.74rem;color:var(--text-3);text-transform:uppercase;font-weight:700">Исполнитель СМР на объекте</div>' +
                '<div style="font-weight:700;font-size:1.05rem;color:var(--text);margin-top:2px">🏢 ' + escHtml(taskContr) + '</div>' +
                '<div style="font-size:.78rem;color:var(--text-2);margin-top:2px">' +
                  (contrObj && contrObj.inn ? ('ИНН: ' + escHtml(contrObj.inn)) : '') +
                  (contrObj && contrObj.phone ? (' • Тел: ' + escHtml(contrObj.phone)) : '') +
                '</div>' +
              '</div>' +
              '<span class="badge b-pink" style="font-size:.8rem;padding:4px 10px;font-weight:600">Назначен в заявке</span>' +
            '</div>' +
            '<div style="background:var(--bg);padding:10px 12px;border-radius:6px;font-size:.82rem;margin-bottom:12px;color:var(--text-2)">' +
              'Подрядчик выбран в карточке заявки. Нажмите «Оформить через Мастер», чтобы рассчитать стоимость по прайс-листу (КС / К10), согласовать смету и сформировать официальные документы.' +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
              '<button class="btn btn-sm btn-primary" onclick="openSubcontractWizardModal(\'' + escHtml(taskId) + '\')">🪄 Оформить через Мастер субподряда</button>' +
              '<button class="btn btn-sm btn-ghost" onclick="openContractorPicker(\'' + escHtml(taskId) + '\')">🔍 Сменить подрядчика</button>' +
            '</div>' +
          '</div>';
          return;
        }

        cont.innerHTML = '<div style="background:var(--bg);padding:14px;border-radius:8px;text-align:center;color:var(--text-3);font-size:.85rem">' +
          '<span>Субподрядчики на объект еще не назначены.</span> ' +
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
              '<button class="btn btn-sm btn-ghost" onclick="generateSubcontractDoc(\'' + escHtml(taskId) + '\', ' + sub.id + ', \'completion_act\')" title="Сформировать Акт сдачи-приемки (КС-2)">✅ Акт работ (.docx)</button>' +
              '<button class="btn btn-sm btn-ghost" onclick="generateSubcontractDoc(\'' + escHtml(taskId) + '\', ' + sub.id + ', \'invoice\')" title="Сформировать Счет на оплату от Подрядчика">💰 Счет от Подрядчика (.docx)</button>' +
              '<button class="btn btn-sm btn-ghost" onclick="generateSubcontractDoc(\'' + escHtml(taskId) + '\', ' + sub.id + ', \'tmc_act\')" title="Сформировать Акт передачи (Накладную) ТМЦ со склада">🚚 Накладная ТМЦ (.docx)</button>' +
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
    var cleanContr = selectedCName.replace(/^(?:ИП|ООО|СЗ|АО|ЗАО)s+/i, '').trim().toLowerCase();
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
  var curPrice = editSub ? (editSub.price_agreed || '') : (t.amount || '');
  var curDeadline = (editSub && editSub.deadline) ? editSub.deadline.slice(0, 10) : ((t.deadline) ? String(t.deadline).slice(0, 10) : '');
  var curComment = editSub ? (editSub.comment || '') : '';

  var modalTitle = editSub ? '✏️ Редактировать субподряд' : '🤝 Назначить субподрядчика';
  var submitBtnLabel = editSub ? 'Сохранить изменения' : 'Сохранить субподряд';

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
        '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Дедлайн (срок сдачи)</label>' +
        '<input type="date" id="subm_deadline" value="' + escHtml(curDeadline) + '" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
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

    '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:1.25rem;border-top:1px solid var(--border);padding-top:10px">' +
      '<button class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_subcontract_modal\').remove()">Отмена</button>' +
      '<button class="btn btn-sm btn-primary" onclick="saveSubcontract(\'' + escHtml(taskId) + '\'' + (editId ? (', ' + editId) : '') + ')">' + submitBtnLabel + '</button>' +
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
    if (t && targetContr && t.contractor !== targetContr) {
      t.contractor = targetContr;
      api('/tasks/' + encodeURIComponent(taskId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractor: targetContr }) });
    }
    loadCardSubcontracts(taskId);
    loadCardDocuments(taskId);
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

function generateSubcontractDoc(taskId, subcontractId, docType) {
  api('/tasks/' + encodeURIComponent(taskId) + '/documents/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc_type: docType, subcontract_id: subcontractId })
  })
  .then(function(res) {
    if (res.error) throw new Error(res.error);
    var link = document.createElement('a');
    link.href = res.file_url;
    link.download = (res.title || 'document') + '.docx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    loadCardDocuments(taskId);
  })
  .catch(function(err) {
    alert('Ошибка формирования документа: ' + err.message);
  });
}

function generateTaskRegistryDoc(taskId) {
  api('/tasks/' + encodeURIComponent(taskId) + '/documents/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc_type: 'id_registry' })
  })
  .then(function(res) {
    if (res.error) throw new Error(res.error);
    var link = document.createElement('a');
    link.href = res.file_url;
    link.download = (res.title || 'registry_id') + '.docx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    loadCardDocuments(taskId);
  })
  .catch(function(err) {
    alert('Ошибка формирования Реестра ИД: ' + err.message);
  });
}

function loadCardDocuments(taskId) {
  var cont = document.getElementById('cardDocumentsContainer');
  if (!cont) return;
  api('/tasks/' + encodeURIComponent(taskId) + '/documents')
    .then(function(docs) {
      if (!Array.isArray(docs) || !docs.length) {
        cont.innerHTML = '<div style="color:var(--text-3);font-size:.82rem">Официальные документы пока не сформированы. Нажмите «Сформировать Реестр ИД» или сгенерируйте Заказ-наряд во вкладке субподрядов.</div>';
        return;
      }

      var html = '<table class="table" style="font-size:.82rem;margin-top:.4rem">' +
        '<thead><tr>' +
          '<th>Документ</th>' +
          '<th>№ и Дата</th>' +
          '<th>Сформировал</th>' +
          '<th>Действия</th>' +
        '</tr></thead><tbody>';

      docs.forEach(function(d) {
        var dateStr = d.doc_date ? d.doc_date.slice(0, 10).split('-').reverse().join('.') : '—';
        html += '<tr>' +
          '<td><a href="' + escHtml(d.file_url) + '" download style="font-weight:600;display:flex;align-items:center;gap:6px">📄 ' + escHtml(d.title) + '</a></td>' +
          '<td style="white-space:nowrap">' + escHtml(d.doc_number || '—') + ' от ' + dateStr + '</td>' +
          '<td style="white-space:nowrap;color:var(--text-2)">' + escHtml(d.created_by_name || 'Система') + '</td>' +
          '<td style="white-space:nowrap">' +
            '<a href="' + escHtml(d.file_url) + '" download class="btn btn-sm btn-ghost" style="padding:2px 8px;font-size:.75rem">📥 Скачать</a> ' +
            '<button class="btn btn-sm btn-ghost" style="color:var(--red);padding:2px 6px;font-size:.75rem" onclick="deleteCardDocument(\'' + escHtml(taskId) + '\', ' + d.id + ')">🗑️</button>' +
          '</td>' +
        '</tr>';
      });

      html += '</tbody></table>';
      cont.innerHTML = html;
    })
    .catch(function(err) {
      cont.innerHTML = '<div style="color:var(--red)">Ошибка реестра документов: ' + escHtml(err.message) + '</div>';
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

// ─── PAGE: МАРШИ ─────────────────────────────────────────────────────────────

// --- NEW WORKFLOW ACTIONS ---
window.submitSmr = function(taskId) {
  if (!confirm('Вы подтверждаете, что строительно-монтажные работы по объекту выполнены и готовы к сдаче куратору?')) return;
  api('/tasks/' + encodeURIComponent(taskId) + '/smr/submit', { method: 'POST' })
    .then(function(res) {
      if (res && res.error) alert(res.error);
      renderApp();
    })
    .catch(function(err) { alert(err.message || err); });
};

window.acceptSmr = function(taskId) {
  if (!confirm('Принять строительно-монтажные работы по объекту?\n\nЭто действие:\n1. Зафиксирует внутреннюю приёмку СМР куратором\n2. Разрешит оплату субподрядчику / бригаде\n3. Подготовит заявку к сдаче Заказчику')) return;
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
  renderApp();
};

window.removeSubPayment = function(taskId, idx) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t || !t._payments) return;
  t._payments.splice(idx, 1);
  if (!t.rawData) t.rawData = {};
  t.rawData.subPayments = t._payments;
  renderApp();
};
