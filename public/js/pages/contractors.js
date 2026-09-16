function pageContractors() {
  var filterType = S.contractorFilterType || 'all';

  var filtered = (S.contractors || []).filter(function(c) {
    if (filterType === 'all') return true;
    return (c.type || 'executor') === filterType;
  });

  var typeLabels = {
    customer: { label: 'Заказчик', cls: 'b-customer' },
    executor: { label: 'Исполнитель', cls: 'b-executor' },
    supplier: { label: 'Поставщик', cls: 'b-supplier' },
    internal: { label: 'Собственный', cls: 'b-internal' }
  };

  var rows = filtered.map(function(c) {
    var tInfo = typeLabels[c.type || 'executor'] || { label: c.type || 'Исполнитель', cls: 'b-gray' };
    return `
      <tr style="border-bottom: 1px solid var(--border)">
        <td style="padding: 10px 12px; font-weight:600">${escHtml(c.inn)}</td>
        <td style="padding: 10px 12px">
          <div style="font-weight:600">${escHtml(c.name_short)}</div>
          ${c.name_full ? '<div style="font-size:.73rem;color:var(--text-3);line-height:1.2;margin-top:2px">' + escHtml(c.name_full.slice(0,80)) + '</div>' : ''}
        </td>
        <td style="padding: 10px 12px">${badge(tInfo.cls, tInfo.label)}</td>
        <td style="padding: 10px 12px" class="t3">${escHtml(c.director || '—')}</td>
        <td style="padding: 10px 12px; text-align:right; white-space:nowrap">
          <button class="btn btn-sm btn-ghost" onclick="viewContractorDetails(${c.id})" title="Просмотр доверенностей и специалистов">📋 Персонал и доверенности</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="deleteContractor(${c.id})" title="Удалить">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  var formOpen = S.contractorFormOpen || false;

  return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; flex-wrap:wrap; gap:10px">
      <div>
        <h1 class="page-title" style="margin:0">Справочник Контрагентов</h1>
        <div style="font-size:.82rem; color:var(--text-3); margin-top:2px">Официальные реквизиты, ИНН, директора и привязка к доверенностям</div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button id="btn_sync_poa_contractors" class="btn btn-ghost" onclick="syncContractorsFromPOAAction()" title="Автоматически найти и добавить всех контрагентов из доверенностей через DaData">
          ⚡ Синхронизировать из доверенностей (DaData)
        </button>
        <button class="btn" onclick="toggleContractorForm()">
          ${formOpen ? '✕ Закрыть форму' : '+ Добавить контрагента'}
        </button>
      </div>
    </div>

    <!-- ФОРМА ДОБАВЛЕНИЯ (СКРЫТА ПО УМОЛЧАНИЮ) -->
    <div id="contractor_add_card" class="card p mb" style="display:${formOpen ? 'grid' : 'none'}; grid-template-columns: 1fr 1fr; gap: 1.5rem; border:1.5px solid var(--orange); animation: fadeIn 0.15s ease;">
      <!-- Левая колонка: Поиск и Базовые данные -->
      <div>
        <div class="sec-title">Поиск и Основные данные</div>
        
        <div class="mb" style="position:relative">
          <input id="nc_search_input" type="text" 
                 placeholder="Начните вводить Название компании или ИНН..." 
                 style="width:100%; font-weight:600; border-color:var(--orange)" 
                 oninput="onContractorSearchInput(this.value)">
          <div id="nc_suggestions_box" style="display:none; position:absolute; top:100%; left:0; right:0; background:#fff; border:1.5px solid var(--orange); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.15); z-index:100; max-height:250px; overflow-y:auto; margin-top:4px"></div>
        </div>

        <div class="mb">
          <label style="display:block;font-size:.75rem;font-weight:700;text-transform:uppercase;color:var(--text-3);margin-bottom:4px">Кто он? (Тип контрагента)</label>
          <select id="nc_type" style="width:100%;font-weight:600">
            <option value="executor">Исполнитель / Подрядчик (Монтажная организация, ИП)</option>
            <option value="customer">Заказчик (ПАО Сбербанк, ВТБ и др.)</option>
            <option value="supplier">Поставщик ТМЦ (Кабель, лотки, шкафы)</option>
            <option value="internal">Собственный (Наша организация)</option>
          </select>
        </div>

        <div class="g2 mb">
          <input id="nc_inn" type="text" placeholder="ИНН *">
          <input id="nc_kpp" type="text" placeholder="КПП (если есть)">
        </div>
        <div class="mb">
          <input id="nc_name_short" type="text" placeholder="Краткое название (ИП / ООО) *">
        </div>
        <div class="mb">
          <textarea id="nc_name_full" placeholder="Полное наименование" style="width:100%; resize:vertical; min-height:48px"></textarea>
        </div>
        <div class="mb">
          <input id="nc_director" type="text" placeholder="ФИО Руководителя">
        </div>
        <div class="mb">
          <textarea id="nc_address" placeholder="Юридический адрес" style="width:100%; resize:vertical; min-height:48px"></textarea>
        </div>
      </div>

      <!-- Правая колонка: Реквизиты и Контакты -->
      <div>
        <div class="sec-title">Банк и Контакты</div>
        <div class="mb">
          <input id="nc_bank" type="text" placeholder="Название Банка" style="width:100%">
        </div>
        <div class="row mb">
          <input id="nc_bik" type="text" placeholder="БИК" style="flex:1">
          <button class="btn btn-sm btn-ghost" onclick="fillBankFromDaData()" title="Найти банк по БИК">🔍 Найти по БИК</button>
        </div>
        <div class="mb">
          <input id="nc_acc_corr" type="text" placeholder="Корр. счет" style="width:100%">
        </div>
        <div class="mb">
          <input id="nc_acc_pay" type="text" placeholder="Расчетный счет (ручной ввод)" style="width:100%">
        </div>
        <div class="g2 mb">
          <input id="nc_phone" type="text" placeholder="Телефон">
          <input id="nc_email" type="text" placeholder="Email">
        </div>
        
        <div style="text-align:right; margin-top:1.5rem">
          <span id="nc_status" style="margin-right:1rem; color:var(--text-3); font-size:.8rem"></span>
          <button class="btn btn-ghost btn-sm" onclick="toggleContractorForm(false)" style="margin-right:8px">Отмена</button>
          <button class="btn" onclick="addContractor()">+ Сохранить Контрагента</button>
        </div>
      </div>
    </div>

    <!-- ФИЛЬТРЫ ТИПОВ КОНТРАГЕНТОВ -->
    <div style="display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap; align-items:center">
      <span class="t3" style="font-size:.8rem; margin-right:4px">Фильтр по типу:</span>
      <button class="btn btn-sm ${filterType === 'all' ? '' : 'btn-ghost'}" onclick="setContractorFilterType('all')">Все (${(S.contractors || []).length})</button>
      <button class="btn btn-sm ${filterType === 'customer' ? '' : 'btn-ghost'}" onclick="setContractorFilterType('customer')">Заказчики (${(S.contractors || []).filter(c=>c.type==='customer').length})</button>
      <button class="btn btn-sm ${filterType === 'executor' ? '' : 'btn-ghost'}" onclick="setContractorFilterType('executor')">Исполнители (${(S.contractors || []).filter(c=>(c.type||'executor')==='executor').length})</button>
      <button class="btn btn-sm ${filterType === 'supplier' ? '' : 'btn-ghost'}" onclick="setContractorFilterType('supplier')">Поставщики (${(S.contractors || []).filter(c=>c.type==='supplier').length})</button>
      <button class="btn btn-sm ${filterType === 'internal' ? '' : 'btn-ghost'}" onclick="setContractorFilterType('internal')">Собственные (${(S.contractors || []).filter(c=>c.type==='internal').length})</button>
    </div>

    <!-- Таблица -->
    <div class="card tbl-wrap">
      <table style="width:100%; border-collapse:collapse; text-align:left; font-size:.85rem">
        <thead>
          <tr style="background:var(--bg)">
            <th style="padding: 10px 12px; color:var(--text-3)">ИНН</th>
            <th style="padding: 10px 12px; color:var(--text-3)">Название</th>
            <th style="padding: 10px 12px; color:var(--text-3)">Тип</th>
            <th style="padding: 10px 12px; color:var(--text-3)">Руководитель</th>
            <th style="padding: 10px 12px; color:var(--text-3)">Телефон</th>
            <th style="padding: 10px 12px"></th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:2rem">По выбранному фильтру контрагенты не найдены</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

function toggleContractorForm(open) {
  S.contractorFormOpen = (open !== undefined) ? open : !S.contractorFormOpen;
  renderApp();
}

function setContractorFilterType(type) {
  S.contractorFilterType = type;
  renderApp();
}


function fillContractorFromDaData() {
  var inn = document.getElementById('nc_inn').value.trim();
  if (!inn) return alert('Введите ИНН для поиска');
  
  document.getElementById('nc_status').textContent = 'Ищем в DaData...';
  
  api('/dadata/party?inn=' + encodeURIComponent(inn)).then(data => {
    if (!data) {
      document.getElementById('nc_status').textContent = '❌ Не найдено';
      return;
    }
    document.getElementById('nc_status').textContent = '✅ Найдено';
    
    // Заполняем поля
    if(data.inn) document.getElementById('nc_inn').value = data.inn;
    if(data.kpp) document.getElementById('nc_kpp').value = data.kpp;
    if(data.name_short) document.getElementById('nc_name_short').value = data.name_short;
    if(data.name_full) document.getElementById('nc_name_full').value = data.name_full;
    if(data.address_legal) document.getElementById('nc_address').value = data.address_legal;
    if(data.director) document.getElementById('nc_director').value = data.director;
    
    // Подсвечиваем поля зеленым, чтобы было видно, что заполнилось
    ['nc_name_short', 'nc_name_full', 'nc_address', 'nc_director'].forEach(id => {
      var el = document.getElementById(id);
      if(el && el.value) { el.style.background = '#e8f5e9'; setTimeout(()=>el.style.background='#fff', 1500); }
    });
  });
}

function fillBankFromDaData(prefix) {
  prefix = prefix || 'nc';
  var bik = document.getElementById(prefix + '_bik').value.trim();
  if (!bik) return alert('Введите БИК для поиска');
  
  document.getElementById(prefix + '_status').textContent = 'Ищем банк...';
  
  api('/dadata/party?inn=').then(() => {}); // Пустая заглушка для разогрева (необязательно)

  api('/dadata/bank?bik=' + encodeURIComponent(bik)).then(data => {
    if (!data) {
      document.getElementById(prefix + '_status').textContent = '❌ Банк не найден';
      return;
    }
    document.getElementById(prefix + '_status').textContent = '✅ Банк найден';
    
    document.getElementById(prefix + '_bank').value = data.bank_name;
    document.getElementById(prefix + '_acc_corr').value = data.account_corr;
    
    [prefix + '_bank', prefix + '_acc_corr'].forEach(id => {
      var el = document.getElementById(id);
      if(el) { el.style.background = '#e3f2fd'; setTimeout(()=>el.style.background='#fff', 1500); }
    });
  });
}

function addContractor() {
  var data = {
    inn:           document.getElementById('nc_inn').value.trim(),
    kpp:           document.getElementById('nc_kpp').value.trim(),
    name_short:    document.getElementById('nc_name_short').value.trim(),
    name_full:     document.getElementById('nc_name_full').value.trim(),
    type:          document.getElementById('nc_type') ? document.getElementById('nc_type').value : 'executor',
    director:      document.getElementById('nc_director').value.trim(),
    address_legal: document.getElementById('nc_address').value.trim(),
    bank_name:     document.getElementById('nc_bank').value.trim(),
    bik:           document.getElementById('nc_bik').value.trim(),
    account_pay:   document.getElementById('nc_acc_pay').value.trim(),
    account_corr:  document.getElementById('nc_acc_corr').value.trim(),
    phone:         document.getElementById('nc_phone').value.trim(),
    email:         document.getElementById('nc_email').value.trim()
  };
  
  if (!data.inn || !data.name_short) return alert('ИНН и Краткое название обязательны!');

  api('/contractors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(res => {
    if(res.error) return alert(res.error);
    S.contractorFormOpen = false;
    // Перезагружаем список
    api('/contractors').then(list => { S.contractors = list; renderApp(); });
  });
}

function deleteContractor(id) {
  if (!confirm('Удалить подрядчика? Это действие нельзя отменить.')) return;
  api('/contractors/' + id, { method: 'DELETE' }).then(() => {
    S.contractors = S.contractors.filter(c => c.id !== id);
    renderApp();
  });
}


function onContractorSearchInput(val, prefix) {
  prefix = prefix || 'nc';
  var box = document.getElementById(prefix + '_suggestions_box');
  if (!box) return;

  clearTimeout(contractorSearchTimeout);

  if (!val || val.trim().length < 3) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  contractorSearchTimeout = setTimeout(function() {
    api('/dadata/suggest-party?query=' + encodeURIComponent(val.trim())).then(function(list) {
      if (!list || !list.length) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
      }
      var itemsHtml = list.map(function(item) {
        var safeJson = encodeURIComponent(JSON.stringify(item));
        return `
          <div onclick="selectContractorSuggestion('${safeJson}','${prefix}')" 
               style="padding:10px 14px; border-bottom:1px solid #f4f4f5; cursor:pointer; transition:background .12s" 
               onmouseover="this.style.background='var(--orange-bg)'" 
               onmouseout="this.style.background='#fff'">
            <div style="font-weight:600; font-size:.85rem; color:var(--text)">${item.name_short}</div>
            <div style="font-size:.75rem; color:var(--text-3); margin-top:2px">
              ИНН: <strong>${item.inn || '—'}</strong> ${item.address_legal ? '· ' + item.address_legal.slice(0, 45) + '...' : ''}
            </div>
          </div>
        `;
      }).join('');
      box.innerHTML = itemsHtml;
      box.style.display = 'block';
    });
  }, 300);
}

// Выбор варианта из выпадающего списка
function selectContractorSuggestion(encodedJson, prefix) {
  prefix = prefix || 'nc';
  var data = JSON.parse(decodeURIComponent(encodedJson));
  var box = document.getElementById(prefix + '_suggestions_box');
  if (box) box.style.display = 'none';

  var searchInput = document.getElementById(prefix + '_search_input');
  if (searchInput) searchInput.value = data.name_short;

  if(data.inn) document.getElementById(prefix + '_inn').value = data.inn;
  if(data.kpp) document.getElementById(prefix + '_kpp').value = data.kpp;
  if(data.name_short) document.getElementById(prefix + '_name_short').value = data.name_short;
  if(data.name_full) document.getElementById(prefix + '_name_full').value = data.name_full;
  if(data.address_legal) document.getElementById(prefix + '_address').value = data.address_legal;
  if(data.director) document.getElementById(prefix + '_director').value = data.director;

  [prefix+'_inn', prefix+'_kpp', prefix+'_name_short', prefix+'_name_full', prefix+'_address', prefix+'_director'].forEach(function(id) {
    var el = document.getElementById(id);
    if(el && el.value) { 
      el.style.background = '#e8f5e9'; 
      setTimeout(function(){ el.style.background='#fff'; }, 1500); 
    }
  });
}

// Закрываем выпадающий список при клике в любое другое место экрана
document.addEventListener('click', function(e) {
  ['nc', 'pc'].forEach(function(prefix) {
    var box = document.getElementById(prefix + '_suggestions_box');
    if (box && !box.contains(e.target)) {
      box.style.display = 'none';
    }
  });
});

function viewContractorDetails(contractorId) {
  var c = (S.contractors || []).find(function(x){ return x.id === contractorId; });
  if (!c) return;

  Promise.all([
    api('/specialists?contractorId=' + contractorId).catch(() => []),
    api('/powers-of-attorney?contractorId=' + contractorId).catch(() => [])
  ]).then(function(results) {
    var specs = results[0] || [];
    var poas = results[1] || [];

    var existing = document.getElementById('_contractor_details_modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = '_contractor_details_modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(2px)';

    var specsHtml = specs.length ? specs.map(function(s) {
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border);font-size:.85rem">
          <div>
            <b>${escHtml(s.full_name)}</b> <span class="t3" style="font-size:.75rem">(${escHtml(s.position || 'Монтажник')})</span>
          </div>
          <div style="font-size:.8rem;color:var(--text-3)">${escHtml(s.phone || '—')}</div>
        </div>
      `;
    }).join('') : '<div style="color:var(--text-3);padding:8px 0;font-size:.85rem">Нет привязанных специалистов</div>';

    var poasHtml = poas.length ? poas.map(function(p) {
      var dStr = p.valid_until ? new Date(p.valid_until).toLocaleDateString('ru') : 'Бессрочно';
      var st = p.computed_status === 'expired' ? '<span class="badge b-red">Просрочена</span>' : '<span class="badge b-green">Действует</span>';
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border);font-size:.85rem">
          <div>
            <b style="font-family:monospace">№ ${escHtml(p.number)}</b> &bull; ${escHtml(p.person_name)}
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:.75rem;color:var(--text-3)">до ${dStr}</span>
            ${st}
          </div>
        </div>
      `;
    }).join('') : '<div style="color:var(--text-3);padding:8px 0;font-size:.85rem">Нет доверенностей</div>';

    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:1.5rem;width:100%;max-width:600px;box-shadow:0 12px 48px rgba(0,0,0,.25);max-height:90vh;display:flex;flex-direction:column">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem">
          <div>
            <h2 style="margin:0;font-size:1.2rem">${escHtml(c.name_short)}</h2>
            <div style="font-size:.78rem;color:var(--text-3);margin-top:2px">ИНН: ${escHtml(c.inn)} ${c.director ? '&bull; Руководитель: ' + escHtml(c.director) : ''}</div>
          </div>
          <button onclick="document.getElementById('_contractor_details_modal').remove()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-3);line-height:1">×</button>
        </div>

        <div style="overflow-y:auto;flex:1">
          <!-- СПЕЦИАЛИСТЫ -->
          <div style="margin-bottom:1.25rem">
            <div style="font-weight:700;font-size:.9rem;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
              <span>👷 Закреплённые специалисты</span>
              <span class="badge b-blue" style="font-size:.72rem">${specs.length} чел.</span>
            </div>
            <div style="background:var(--bg);border-radius:8px;padding:4px 8px;border:1px solid var(--border);max-height:180px;overflow-y:auto">
              ${specsHtml}
            </div>
          </div>

          <!-- ДОВЕРЕННОСТИ -->
          <div>
            <div style="font-weight:700;font-size:.9rem;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
              <span>📜 Связанные доверенности</span>
              <span class="badge b-gray" style="font-size:.72rem">${poas.length} шт.</span>
            </div>
            <div style="background:var(--bg);border-radius:8px;padding:4px 8px;border:1px solid var(--border);max-height:220px;overflow-y:auto">
              ${poasHtml}
            </div>
          </div>
        </div>

        <div style="text-align:right;margin-top:1.25rem;border-top:1px solid var(--border);padding-top:10px">
          <button onclick="document.getElementById('_contractor_details_modal').remove()" class="btn btn-sm">Закрыть</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });
  });
}

function syncContractorsFromPOAAction() {
  var btn = document.getElementById('btn_sync_poa_contractors');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Синхронизация с DaData...';
  }

  api('/contractors/sync-from-poa', { method: 'POST' })
    .then(function(res) {
      if (res && res.error) {
        alert('Ошибка синхронизации: ' + res.error);
      } else {
        alert('✅ Успешно синхронизировано контрагентов из доверенностей!\nДобавлено новых: ' + (res.added || 0) + '\nОбновлено: ' + (res.updated || 0) + '\nВсего в доверенностях: ' + (res.totalPOAContractors || 0));
        api('/contractors').then(function(list) {
          S.contractors = list;
          renderApp();
        });
      }
    })
    .catch(function(err) {
      alert('Ошибка при запросе к DaData: ' + (err.message || err));
    })
    .finally(function() {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⚡ Синхронизировать из доверенностей (DaData)';
      }
    });
}

