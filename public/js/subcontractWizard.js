
  window._activeSubcontractIdx = window._activeSubcontractIdx || {};
  window._setActiveSubcontract = function(taskId, idx) {
    window._activeSubcontractIdx[taskId] = idx;
    window.renderCardSmrCalculator(taskId);
  };

  window.addNewSubcontractToTask = function(taskId) {
    var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
    if (!t) return;
    openContractorPicker(taskId);
  };
// public/js/subcontractWizard.js
// Интеллектуальный конструктор (Wizard) назначения подрядчика,
// калькулятор СМР по дифференцированной шкале объемов и выбор «Собственного» юрлица (КС, К10, Ультима).

(function() {
  'use strict';

  // 1. Быстрый локальный расчет СМР по правилам Алексея (шкала до 3 / более 3 портов, км сверх 10 км, шкафы)
  function calcSmrLocal(params) {
    if (typeof window.getSubcontractCalculation === 'function') {
      var dynRes = window.getSubcontractCalculation(params);
      if (dynRes && Array.isArray(dynRes.lines) && dynRes.lines.length > 0) {
        return dynRes;
      }
    }
    var ports = parseInt(params.ports, 10) || 0;
    var portType = params.portType || 'port_5e';
    var distanceKm = parseFloat(params.distanceKm) || 0;
    var cabinetType = params.cabinetType || '';
    var customPrice = (params.customPrice !== undefined && params.customPrice !== '' && params.customPrice !== null) ? parseFloat(params.customPrice) : null;

    // Если задана фиксированная/согласованная цена вручную (сценарий копирования предыдущего подряда, например 50 000 ₽):
    if (customPrice !== null && !isNaN(customPrice) && customPrice > 0 && params.pricingMode === 'custom') {
      return {
        totalAmount: customPrice,
        worksAmount: customPrice,
        transportAmount: 0,
        lines: [
          { name: params.customDesc || 'Согласованная стоимость работ (по аналогии с предыдущим подрядом)', qty: 1, unit: 'объект', price: customPrice, sum: customPrice }
        ]
      };
    }

    var portPrices = {
      port_5e: { name: 'Базовая стоимость работ 1 порт СКС 5е', t1: 3000, t2: 2500, th: 3 },
      port_6:  { name: 'Базовая стоимость работ 1 порт СКС 6',  t1: 3500, t2: 3000, th: 3 },
      port_6a: { name: 'Базовая стоимость работ 1 порт СКС 6А', t1: 3500, t2: 3000, th: 3 },
      port_optics: { name: 'Базовая стоимость работ дуплексный оптический порт', t1: 3500, t2: 3000, th: 3 },
      port_reinstall: { name: 'Демонтаж с последующим монтажом за порт', t1: 1200, t2: 1000, th: 3 },
      port_move: { name: 'Перемещение/восстановление портов в помещении', t1: 1700, t2: 1500, th: 3 }
    };

    var cabinetPrices = {
      tksh_42u: { name: 'Монтаж напольного ТКШ 42-47/48U', price: 10000 },
      tksh_32u: { name: 'Монтаж напольного ТКШ 32U', price: 8000 },
      tksh_18u: { name: 'Монтаж навесного ТКШ 18-22U', price: 6500 },
      tksh_swap: { name: 'Демонтаж старого ТКШ и монтаж в новый', price: 10000 },
      tksh_reterminate: { name: 'Перешивка портов при замене ТКШ (за порт)', price: 500 },
      tksh_demount_42u: { name: 'Демонтаж напольного ТКШ 42U', price: 7000 },
      tksh_demount_32u: { name: 'Демонтаж напольного ТКШ 24U-40U', price: 6000 },
      tksh_demount_18u: { name: 'Демонтаж навесного ТКШ до 22U', price: 5000 },
      tksh_mod_600: { name: 'Модернизация шкафа 600мм', price: 3000 },
      tksh_mod_800: { name: 'Модернизация шкафа 800мм', price: 3000 }
    };

    var lines = [];
    var worksAmount = 0;
    var transportAmount = 0;

    // Расчет по портам
    if (ports > 0) {
      var pCfg = portPrices[portType] || portPrices.port_5e;
      var unitP = ports > pCfg.th ? pCfg.t2 : pCfg.t1;
      var pSum = ports * unitP;
      lines.push({
        name: pCfg.name + (ports > pCfg.th ? ' (шкала: >3 шт)' : ' (шкала: 1-3 шт)'),
        qty: ports,
        unit: 'шт',
        price: unitP,
        sum: pSum
      });
      worksAmount += pSum;
    }

    // Расчет по шкафам
    if (cabinetType && cabinetPrices[cabinetType]) {
      var cCfg = cabinetPrices[cabinetType];
      lines.push({
        name: cCfg.name,
        qty: 1,
        unit: 'шт',
        price: cCfg.price,
        sum: cCfg.price
      });
      worksAmount += cCfg.price;
    }

    // Транспортные расходы
    if (distanceKm > 10) {
      var billableKm = Math.round(distanceKm - 10);
      var kmTariff = 12; // 12 ₽/км по прайсу из ТЗ
      var kmSum = billableKm * kmTariff;
      lines.push({
        name: 'Транспортные расходы (свыше 10 км: ' + billableKm + ' км × ' + kmTariff + ' ₽)',
        qty: billableKm,
        unit: 'км',
        price: kmTariff,
        sum: kmSum
      });
      transportAmount += kmSum;
    } else if (distanceKm > 0) {
      lines.push({
        name: 'Выезд внутри города (<10 км)',
        qty: 1,
        unit: 'выезд',
        price: 300,
        sum: 300
      });
      transportAmount += 300;
    }

    return {
      totalAmount: worksAmount + transportAmount,
      worksAmount: worksAmount,
      transportAmount: transportAmount,
      lines: lines
    };
  }

  // 2. Рендеринг единой спецификации и расчета стоимости СМР на карточке заявки
  window._taskSmrSpec = window._taskSmrSpec || {};
  window._taskThirdPartySpec = window._taskThirdPartySpec || {};

  // Функция глобальной загрузки субподрядов карточки
  window.loadCardSubcontracts = function(taskId, callback) {
    if (typeof api !== 'function') return Promise.resolve([]);
    return api('/tasks/' + encodeURIComponent(taskId) + '/subcontracts')
      .then(function(subs) {
        window._curCardSubcontracts = Array.isArray(subs) ? subs : [];
        if (typeof callback === 'function') callback(window._curCardSubcontracts);
        return window._curCardSubcontracts;
      })
      .catch(function(err) {
        console.warn('Could not load card subcontracts:', err);
        window._curCardSubcontracts = [];
        if (typeof callback === 'function') callback([]);
        return [];
      });
  };

  // Экспорт документов (Заказ-наряд, КС-2, Счет)
  window.exportDoc = function(type, taskId, contrName) {
    var curSub = (window._curCardSubcontracts || [])[0] || null;
    var subId = curSub ? curSub.id : null;
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    window._curWizTask = t;
    var targetContr = (contrName && contrName.trim()) || (t.contractor && t.contractor.trim()) || (curSub && curSub.contractor_name) || '';
    var docTypeMap = {
      app2: 'order_subcontract',
      act: 'act',
      invoice: 'invoice'
    };
    var dt = docTypeMap[type] || 'order_subcontract';
    if (typeof api !== 'function') return;
    api('/tasks/' + encodeURIComponent(taskId) + '/documents/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_type: dt, subcontract_id: subId, contractor_name: targetContr || undefined })
    }).then(function(res) {
      if (res && res.download_url) {
        window.open(res.download_url, '_blank');
        showToast('Документ сформирован!', 'success');
      } else {
        var url = '/api/export/' + type + '/' + encodeURIComponent(taskId) + (targetContr ? ('?contractorName=' + encodeURIComponent(targetContr)) : '');
        window.open(url, '_blank');
      }
    }).catch(function() {
      var url = '/api/export/' + type + '/' + encodeURIComponent(taskId) + (targetContr ? ('?contractorName=' + encodeURIComponent(targetContr)) : '');
      window.open(url, '_blank');
    });
  };

  // Модалка переключения договоров и прайс-листов подрядчика (например, К10 ↔ КС для Елагина)
  window.openContractorContractPickerModal = function(taskId, contrName) {
    var old = document.getElementById('_contr_contracts_modal');
    if (old) old.remove();

    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    window._curWizTask = t;
    var cName = (contrName && contrName.trim()) || (t.contractor && t.contractor.trim()) || (S.cardDraft && S.cardDraft.contractor ? S.cardDraft.contractor.trim() : '');
    if (!cName) {
      alert('Сначала назначьте исполнителя СМР!');
      return;
    }

    var cObj = (S.contractors || []).find(function(c){
      if (!c) return false;
      var cShort = (c.name_short || '').trim().toLowerCase();
      var cFull = (c.name_full || '').trim().toLowerCase();
      var cNameLower = cName.trim().toLowerCase();
      return cShort === cNameLower || cFull === cNameLower || cShort.includes(cNameLower) || cNameLower.includes(cShort);
    });
    if (!cObj) {
      var modal = document.createElement('div');
      modal.id = '_contr_contracts_modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = '<div class="modal-box" style="max-width:520px;width:95%">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;border-bottom:1.5px solid var(--border);padding-bottom:.75rem">' +
          '<h3 style="margin:0;font-size:1.1rem">📑 Договор с подрядчиком</h3>' +
          '<button class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_contr_contracts_modal\').remove()">✕</button>' +
        '</div>' +
        '<div style="padding:10px 0;font-size:.88rem;color:var(--text)">' +
          'Исполнитель <b>' + escHtml(cName) + '</b> назначен на заявку. Зарегистрировать договор и привязать прайс-лист можно в мастере поручения.' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;border-top:1px solid var(--border);padding-top:10px">' +
          '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'_contr_contracts_modal\').remove()">Закрыть</button>' +
          '<button type="button" class="btn btn-primary" onclick="document.getElementById(\'_contr_contracts_modal\').remove();openSubcontractWizardModal(\'' + escHtml(taskId) + '\')">🪄 Настроить в мастере</button>' +
        '</div>' +
      '</div>';
      document.body.appendChild(modal);
      return;
    }

    var modal = document.createElement('div');
    modal.id = '_contr_contracts_modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal-box" style="max-width:620px;width:95%;max-height:85vh;overflow-y:auto">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;border-bottom:1.5px solid var(--border);padding-bottom:.75rem">' +
        '<div>' +
          '<h3 style="margin:0;font-size:1.1rem;display:flex;align-items:center;gap:6px">' +
            '<span>📑 Выбор договора и прайс-листа подрядчика</span>' +
          '</h3>' +
          '<div style="font-size:.78rem;color:var(--text-3);margin-top:2px">Исполнитель: <b>' + escHtml(cName) + '</b> • Заявка № <b>' + escHtml(taskId) + '</b></div>' +
        '</div>' +
        '<button class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_contr_contracts_modal\').remove()">✕</button>' +
      '</div>' +
      '<div id="_contr_contracts_list_box" style="padding:10px;text-align:center;color:var(--text-3)">Загрузка договоров подрядчика…</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;border-top:1px solid var(--border);padding-top:10px">' +
        '<button type="button" class="btn btn-sm btn-primary" onclick="document.getElementById(\'_contr_contracts_modal\').remove();openSubContractModal(null, ' + cObj.id + ', \'' + escHtml(taskId) + '\')" style="font-weight:700">+ Заключить новый договор</button>' +
        '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'_contr_contracts_modal\').remove()">Закрыть</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    api('/contractors/' + cObj.id + '/contracts')
      .then(function(contracts) {
        var box = document.getElementById('_contr_contracts_list_box');
        if (!box) return;

        if (!contracts || !contracts.length) {
          box.innerHTML = '<div style="padding:24px 16px;text-align:center;color:var(--text-2)">' +
            '<div style="font-size:2rem;margin-bottom:8px">📑</div>' +
            '<div style="font-weight:700;font-size:1rem;color:var(--text);margin-bottom:4px">У подрядчика нет заключенных договоров</div>' +
            '<div style="font-size:.82rem;color:var(--text-3);max-width:420px;margin:0 auto 16px">Пока субподрядчик без договора, он не может быть назначен на объект. Заключите договор субподряда прямо сейчас:</div>' +
            '<button type="button" class="btn btn-sm btn-primary" onclick="document.getElementById(\'_contr_contracts_modal\').remove();openSubContractModal(null, ' + cObj.id + ', \'' + escHtml(taskId) + '\')" style="padding:8px 20px;font-weight:700;font-size:.88rem">+ Заключить договор субподряда</button>' +
          '</div>';
          return;
        }

        var curSub = (window._curCardSubcontracts || [])[0] || null;
        var curContractId = curSub ? curSub.contractor_contract_id : null;
        var curOwnId = t.own_company_id || (t.customer && t.customer.toLowerCase().includes('сбер') ? 2 : 1);

        box.innerHTML = '<div style="display:flex;flex-direction:column;gap:10px">' +
          contracts.map(function(c) {
            var isCurrent = (curContractId && c.id === curContractId) || (!curContractId && c.own_company_id === curOwnId);
            var dtStr = c.contract_date ? (' от ' + String(c.contract_date).slice(0,10).split('-').reverse().join('.')) : '';
            return '<div style="border:1.5px solid ' + (isCurrent ? '#3b82f6' : 'var(--border)') + ';background:' + (isCurrent ? '#eff6ff' : '#fff') + ';border-radius:8px;padding:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left">' +
              '<div style="flex:1">' +
                '<div style="display:flex;align-items:center;gap:6px">' +
                  '<span style="font-weight:700;font-size:.9rem;color:var(--text)">№ ' + escHtml(c.contract_number) + dtStr + '</span>' +
                  (isCurrent ? '<span class="badge b-blue" style="font-size:.7rem">Текущий</span>' : '') +
                '</div>' +
                '<div style="font-size:.78rem;color:var(--text-2);margin-top:3px">' +
                  'Собственное юрлицо («Мы»): <b style="color:var(--text)">' + escHtml(c.own_company_name || 'Не указано') + '</b>' +
                '</div>' +
                '<div style="font-size:.74rem;color:var(--text-3);margin-top:2px">' +
                  'Предмет: ' + escHtml(c.subject || 'СКС и связь') + ' • Заказчик: ' + escHtml(c.customer_tag || 'Все') +
                '</div>' +
                '<div style="font-size:.74rem;color:var(--blue);margin-top:3px;font-weight:600">' +
                  '📊 Прайс-лист: ' + escHtml(c.price_list_name || 'Базовый') + ' (' + (c.price_items_count || 0) + ' позиций)' +
                '</div>' +
              '</div>' +
              '<div>' +
                '<button type="button" class="btn btn-sm ' + (isCurrent ? 'btn-ghost' : 'btn-primary') + '" onclick="window._applyContractorContract(\'' + escHtml(taskId) + '\', ' + c.id + ', ' + c.own_company_id + ', ' + (c.price_list_id || 'null') + ', \'' + escHtml(c.contract_number).replace(/'/g, "\\'") + '\', \'' + escHtml(c.contract_date || '').replace(/'/g, "\\'") + '\', \'' + escHtml(c.own_company_name || '').replace(/'/g, "\\'") + '\')" style="font-size:.78rem;white-space:nowrap">' +
                  (isCurrent ? '✓ Выбран' : 'Выбрать этот договор') +
                '</button>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>';
      })
      .catch(function(err) {
        var box = document.getElementById('_contr_contracts_list_box');
        if (box) box.innerHTML = '<div style="color:var(--red);padding:10px">Ошибка загрузки договоров: ' + escHtml(err.message) + '</div>';
      });
  };

  window._applyContractorContract = function(taskId, contractId, ownCompanyId, priceListId, contractNumber, contractDate, ownCompanyName) {
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); });
    if (t) {
      t.own_company_id = Number(ownCompanyId);
    }
    var contrName = (t && t.contractor) || '';
    var cObj = (S.contractors || []).find(function(c){ return c.name_short === contrName; });

    var activeIdx = (window._activeSubcontractIdx && window._activeSubcontractIdx[taskId]) || 0;
    var targetSub = (window._curCardSubcontracts || [])[activeIdx] || (window._curCardSubcontracts || [])[0] || null;

    var payload = {
      contractor_id: cObj ? cObj.id : (targetSub ? targetSub.contractor_id : null),
      contractor_name: contrName || (targetSub ? targetSub.contractor_name : ''),
      contractor_contract_id: Number(contractId),
      own_company_id: Number(ownCompanyId),
      price_list_id: priceListId ? Number(priceListId) : null
    };

    var modal = document.getElementById('_contr_contracts_modal');
    if (modal) modal.remove();

    var url = targetSub && targetSub.id ? ('/subcontracts/' + targetSub.id) : ('/tasks/' + encodeURIComponent(taskId) + '/subcontracts');
    var method = targetSub && targetSub.id ? 'PUT' : 'POST';

    api(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(saved) {
      window.loadCardSubcontracts(taskId, function() {
        if (typeof showToast === 'function') {
          showToast('Договор ' + contractNumber + ' (' + ownCompanyName + ') успешно зафиксирован в базе!', 'success');
        }
        window.renderCardSmrCalculator(taskId);
      });
    }).catch(function(err) {
      alert('Ошибка привязки договора: ' + (err.message || err));
    });
  };

  window._taskSmrRoundConfig = window._taskSmrRoundConfig || {};
  window._taskSmrSpecUnrounded = window._taskSmrSpecUnrounded || {};

  window._markSmrDirty = function(taskId) {
    if (typeof S !== 'undefined') {
      S.cardDraft = S.cardDraft || {};
      S.cardDraft._smrDirty = true;
      S.cardDraft._smrTaskId = taskId;
    }
    if (typeof window._ensureCardUnsavedBar === 'function') {
      window._ensureCardUnsavedBar(taskId);
    }
  };

  // Калькулятор расчета налогов и сметы (НДС 20%, 5%, 7%, УСН, Самозанятые 6%, ГПХ 13%)
  window._calculateSmrTaxes = function(baseSum, taxConfigOrMode, isTaxIncluded, taskId) {
    baseSum = Math.round((Number(baseSum) || 0) * 100) / 100;
    var mode = 'usn';
    var included = true;

    if (taxConfigOrMode && typeof taxConfigOrMode === 'object') {
      mode = taxConfigOrMode.mode || 'usn';
      included = taxConfigOrMode.included !== undefined ? !!taxConfigOrMode.included : true;
    } else if (typeof taxConfigOrMode === 'string') {
      if (isTaxIncluded !== undefined) {
        mode = taxConfigOrMode;
        included = !!isTaxIncluded;
      } else if (taxConfigOrMode.endsWith('_plus')) {
        mode = taxConfigOrMode.replace(/_plus$/, '');
        included = false;
      } else if (taxConfigOrMode.endsWith('_inc')) {
        mode = taxConfigOrMode.replace(/_inc$/, '');
        included = true;
      } else if (taxConfigOrMode === 'npd_6' || taxConfigOrMode === 'gph_13') {
        mode = taxConfigOrMode;
        included = false;
      } else {
        mode = taxConfigOrMode;
        included = true;
      }
    }

    var res = {
      mode: mode,
      taxIncluded: included,
      baseSum: baseSum,
      sumWithoutTax: baseSum,
      taxAmount: 0,
      totalWithTax: baseSum,
      unroundedTotal: baseSum,
      taxTitle: 'Без налога',
      taxRateNote: 'Не облагается (УСН / патент)',
      baseNote: 'Базовая сумма без налога'
    };

    switch (mode) {
      case 'usn':
        res.sumWithoutTax = baseSum;
        res.taxAmount = 0;
        res.totalWithTax = baseSum;
        res.taxTitle = 'Без налога';
        res.taxRateNote = 'Не облагается (УСН / патент)';
        res.baseNote = 'Полная сумма без налога';
        break;

      case 'npd_6':
        if (included) {
          res.totalWithTax = baseSum;
          res.taxAmount = Math.round(baseSum * 0.06 * 100) / 100;
          res.sumWithoutTax = Math.round((baseSum - res.taxAmount) * 100) / 100;
          res.taxTitle = 'НПД (6%)';
          res.taxRateNote = 'Включен в цену (уплачивает самозанятый)';
          res.baseNote = 'На руки самозанятому';
        } else {
          // Налог сверху (компенсация налога через деление на 1 - 0.06 = 0.94)
          res.sumWithoutTax = baseSum;
          res.totalWithTax = Math.round((baseSum / 0.94) * 100) / 100;
          res.taxAmount = Math.round((res.totalWithTax - baseSum) * 100) / 100;
          res.taxTitle = 'НПД (6%) сверху';
          res.taxRateNote = 'Компенсация налога: сумма / 0.94';
          res.baseNote = 'Согласовано чистыми на руки';
        }
        break;

      case 'osno_20':
      case 'osno_20_inc':
      case 'osno_20_plus':
        if (included) {
          res.totalWithTax = baseSum;
          res.sumWithoutTax = Math.round((baseSum / 1.20) * 100) / 100;
          res.taxAmount = Math.round((baseSum - res.sumWithoutTax) * 100) / 100;
          res.taxTitle = 'НДС (20%) в т.ч.';
          res.taxRateNote = 'Расчетная ставка 20/120';
          res.baseNote = 'Базовая стоимость без НДС';
        } else {
          res.sumWithoutTax = baseSum;
          res.taxAmount = Math.round(baseSum * 0.20 * 100) / 100;
          res.totalWithTax = Math.round((baseSum + res.taxAmount) * 100) / 100;
          res.taxTitle = 'НДС (20%) сверху';
          res.taxRateNote = 'Прямая ставка 20%';
          res.baseNote = 'Базовая стоимость без НДС';
        }
        break;

      case 'usn_5':
      case 'usn_5_inc':
      case 'usn_5_plus':
        if (included) {
          res.totalWithTax = baseSum;
          res.sumWithoutTax = Math.round((baseSum / 1.05) * 100) / 100;
          res.taxAmount = Math.round((baseSum - res.sumWithoutTax) * 100) / 100;
          res.taxTitle = 'НДС (5%) в т.ч. (УСН 2025)';
          res.taxRateNote = 'Расчетная ставка 5/105';
          res.baseNote = 'Базовая стоимость без НДС';
        } else {
          res.sumWithoutTax = baseSum;
          res.taxAmount = Math.round(baseSum * 0.05 * 100) / 100;
          res.totalWithTax = Math.round((baseSum + res.taxAmount) * 100) / 100;
          res.taxTitle = 'НДС (5%) сверху (УСН 2025)';
          res.taxRateNote = 'Прямая ставка 5%';
          res.baseNote = 'Базовая стоимость до начисления НДС';
        }
        break;

      case 'usn_7':
      case 'usn_7_inc':
      case 'usn_7_plus':
        if (included) {
          res.totalWithTax = baseSum;
          res.sumWithoutTax = Math.round((baseSum / 1.07) * 100) / 100;
          res.taxAmount = Math.round((baseSum - res.sumWithoutTax) * 100) / 100;
          res.taxTitle = 'НДС (7%) в т.ч. (УСН 2025)';
          res.taxRateNote = 'Расчетная ставка 7/107';
          res.baseNote = 'Базовая стоимость без НДС';
        } else {
          res.sumWithoutTax = baseSum;
          res.taxAmount = Math.round(baseSum * 0.07 * 100) / 100;
          res.totalWithTax = Math.round((baseSum + res.taxAmount) * 100) / 100;
          res.taxTitle = 'НДС (7%) сверху (УСН 2025)';
          res.taxRateNote = 'Прямая ставка 7%';
          res.baseNote = 'Базовая стоимость до начисления НДС';
        }
        break;

      case 'gph_13':
        if (included) {
          res.totalWithTax = baseSum;
          res.taxAmount = Math.round(baseSum * 0.13 * 100) / 100;
          res.sumWithoutTax = Math.round((baseSum - res.taxAmount) * 100) / 100;
          res.taxTitle = 'НДФЛ (13%)';
          res.taxRateNote = 'Удерживается налоговым агентом при выплате';
          res.baseNote = 'Сумма к выплате на руки';
        } else {
          res.sumWithoutTax = baseSum;
          res.totalWithTax = Math.round((baseSum / 0.87) * 100) / 100;
          res.taxAmount = Math.round((res.totalWithTax - baseSum) * 100) / 100;
          res.taxTitle = 'НДФЛ (13%) сверху';
          res.taxRateNote = 'Налог налогового агента: сумма / 0.87';
          res.baseNote = 'Согласовано чистыми на руки';
        }
        break;

      default:
        res.sumWithoutTax = baseSum;
        res.taxAmount = 0;
        res.totalWithTax = baseSum;
        break;
    }

    res.unroundedTotal = Math.round(res.totalWithTax * 100) / 100;
    var isRounded = taskId && window._taskSmrRoundConfig && !!window._taskSmrRoundConfig[taskId];
    if (isRounded) {
      res.isRounded = true;
      res.totalWithTax = Math.round(res.totalWithTax);
      res.roundDiff = Math.round((res.totalWithTax - res.unroundedTotal) * 100) / 100;
    } else {
      res.isRounded = false;
      res.roundDiff = 0;
    }

    return res;
  };

  window.fmtMoneyPrecise = function(n) {
    var num = Number(n);
    if (isNaN(num)) return '0 ₽';
    if (num === 0) return '0 ₽';
    var hasDecimals = Math.abs(num - Math.round(num)) >= 0.005;
    if (hasDecimals) {
      return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
    } else {
      return Math.round(num).toLocaleString('ru-RU') + ' ₽';
    }
  };

  window._evalMathExpression = function(expr) {
    if (expr === undefined || expr === null) return 0;
    if (typeof expr === 'number') return isFinite(expr) ? (Math.round(expr * 100) / 100) : 0;
    var s = String(expr).trim();
    if (!s) return 0;

    // Убираем пробелы, неразрывные пробелы
    s = s.replace(/[\s\u00A0]/g, '');
    // Заменяем запятые на точки
    s = s.replace(/,/g, '.');

    // Функция для преобразования конструкций с процентами (+ Y% или - Y%)
    // Например: 12500 - 15% -> (12500 * (1 - (15 / 100)))
    // Или: (14963 / 1.2) - 10% -> ((14963 / 1.2) * (1 - (10 / 100)))
    function replacePercentOps(str) {
      var guard = 0;
      while (guard++ < 20) {
        var m = str.match(/([+\-*/])([0-9.]+)%/);
        if (!m) break;
        var op = m[1];
        var pctVal = m[2];
        var matchIdx = m.index;

        if (op === '*' || op === '/') {
          str = str.slice(0, matchIdx + 1) + '(' + pctVal + '/100)' + str.slice(matchIdx + m[0].length);
          continue;
        }

        var leftIdx = matchIdx - 1;
        if (leftIdx < 0) {
          str = str.slice(0, matchIdx) + '(' + op + '(' + pctVal + '/100))' + str.slice(matchIdx + m[0].length);
          continue;
        }

        var leftExpr = '';
        if (str[leftIdx] === ')') {
          var depth = 1;
          var p = leftIdx - 1;
          while (p >= 0 && depth > 0) {
            if (str[p] === ')') depth++;
            else if (str[p] === '(') depth--;
            p--;
          }
          var startIdx = p + 1;
          leftExpr = str.slice(startIdx, leftIdx + 1);
          var signFactor = op === '+' ? '+' : '-';
          var replacement = '(' + leftExpr + '*(1' + signFactor + '(' + pctVal + '/100)))';
          str = str.slice(0, startIdx) + replacement + str.slice(matchIdx + m[0].length);
        } else {
          var p = leftIdx;
          while (p >= 0 && /[0-9.]/.test(str[p])) {
            p--;
          }
          var startIdx = p + 1;
          leftExpr = str.slice(startIdx, leftIdx + 1);
          if (!leftExpr) {
            str = str.slice(0, matchIdx + 1) + '(' + pctVal + '/100)' + str.slice(matchIdx + m[0].length);
          } else {
            var signFactor = op === '+' ? '+' : '-';
            var replacement = '(' + leftExpr + '*(1' + signFactor + '(' + pctVal + '/100)))';
            str = str.slice(0, startIdx) + replacement + str.slice(matchIdx + m[0].length);
          }
        }
      }
      str = str.replace(/([0-9.]+)%/g, '($1/100)');
      return str;
    }

    s = replacePercentOps(s);

    if (!/^[0-9+\-*/.()]+$/.test(s)) {
      return null;
    }

    try {
      var fn = new Function('return (' + s + ');');
      var res = fn();
      if (typeof res !== 'number' || isNaN(res) || !isFinite(res)) {
        return null;
      }
      return Math.round(res * 100) / 100;
    } catch (e) {
      return null;
    }
  };

  // Получение конфигурации налога по заявке
  window._getTaskSmrTaxConfig = function(taskId) {
    window._taskSmrTax = window._taskSmrTax || {};
    var raw = window._taskSmrTax[taskId];
    if (raw && typeof raw === 'object' && raw.mode) {
      return {
        mode: raw.mode,
        included: raw.included !== undefined ? !!raw.included : true
      };
    }
    if (typeof raw === 'string') {
      if (raw.endsWith('_plus')) {
        return { mode: raw.replace(/_plus$/, ''), included: false };
      }
      if (raw.endsWith('_inc')) {
        return { mode: raw.replace(/_inc$/, ''), included: true };
      }
      if (raw === 'npd_6' || raw === 'gph_13') {
        return { mode: raw, included: false };
      }
      return { mode: raw, included: true };
    }

    // Определение режима по умолчанию на основе профиля назначенного подрядчика
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    window._curWizTask = t;
    var curSub = (window._curCardSubcontracts || []).find(function(s){ return String(s.task_id) === String(taskId); }) || null;
    var contrName = (t.contractor && t.contractor.trim()) || (curSub && curSub.contractor_name) || '';
    var contrObj = contrName ? (S.contractors || []).find(function(c){
      if (!c) return false;
      var cShort = (c.name_short || '').trim().toLowerCase();
      var cFull = (c.name_full || '').trim().toLowerCase();
      var cTarget = contrName.trim().toLowerCase();
      return cShort === cTarget || cFull === cTarget || cShort.includes(cTarget) || cTarget.includes(cShort);
    }) : null;

    var cTax = contrObj && contrObj.tax_system ? String(contrObj.tax_system).toLowerCase() : 'usn';
    if (cTax === 'npd' || cTax.includes('самозан') || cTax === 'npd_6') {
      return { mode: 'npd_6', included: false };
    }
    if (cTax === 'osno' || cTax.includes('20')) {
      return { mode: 'osno_20', included: true };
    }
    if (cTax === 'usn_5') {
      return { mode: 'usn_5', included: true };
    }
    if (cTax === 'usn_7') {
      return { mode: 'usn_7', included: true };
    }
    if (cTax === 'gph' || cTax.includes('13')) {
      return { mode: 'gph_13', included: false };
    }
    return { mode: 'usn', included: true };
  };

  window._setTaskSmrTaxConfig = function(taskId, mode, included) {
    window._taskSmrTax = window._taskSmrTax || {};
    var cur = window._getTaskSmrTaxConfig(taskId);
    if (mode !== undefined && mode !== null) cur.mode = mode;
    if (included !== undefined && included !== null) cur.included = !!included;
    window._taskSmrTax[taskId] = cur;
    if (typeof window._markSmrDirty === 'function') {
      window._markSmrDirty(taskId);
    }
    window._refreshSmrCalculations(taskId);
  };

  window._onSmrTaxModeChange = function(taskId, mode) {
    var cur = window._getTaskSmrTaxConfig(taskId);
    cur.mode = mode;
    var chk = document.getElementById('smr_tax_included_' + taskId);
    var lbl = document.getElementById('smr_tax_included_label_' + taskId);
    if (chk && lbl) {
      if (mode === 'usn') {
        chk.disabled = true;
        lbl.style.opacity = '.55';
        lbl.style.cursor = 'not-allowed';
      } else {
        chk.disabled = false;
        lbl.style.opacity = '1';
        lbl.style.cursor = 'pointer';
      }
    }
    window._setTaskSmrTaxConfig(taskId, mode, cur.included);
  };

  window._onSmrTaxIncludedChange = function(taskId, isIncluded) {
    window._setTaskSmrTaxConfig(taskId, null, isIncluded);
  };

  window._setSmrRounding = function(taskId, isRounded) {
    window._taskSmrRoundConfig = window._taskSmrRoundConfig || {};
    window._taskSmrSpecUnrounded = window._taskSmrSpecUnrounded || {};

    var spec = window._taskSmrSpec && window._taskSmrSpec[taskId];
    if (!spec || !spec.length) return;

    var taxCfg = window._getTaskSmrTaxConfig(taskId);

    if (isRounded) {
      if (!window._taskSmrSpecUnrounded[taskId]) {
        window._taskSmrSpecUnrounded[taskId] = JSON.parse(JSON.stringify(spec));
      }
      window._taskSmrRoundConfig[taskId] = true;

      var currentBase = spec.reduce(function(a, l){ return a + (Number(l.sum) || 0); }, 0);
      var taxCalc = window._calculateSmrTaxes(currentBase, taxCfg.mode, taxCfg.included, taskId);
      var targetTotal = Math.round(taxCalc.unroundedTotal || taxCalc.totalWithTax);

      var targetBase = targetTotal;
      var mode = taxCfg.mode;
      var included = taxCfg.included;
      if (mode === 'usn_7' && !included) targetBase = Math.round((targetTotal / 1.07) * 100) / 100;
      else if (mode === 'usn_5' && !included) targetBase = Math.round((targetTotal / 1.05) * 100) / 100;
      else if (mode === 'osno_20' && !included) targetBase = Math.round((targetTotal / 1.20) * 100) / 100;
      else if (mode === 'npd_6' && !included) targetBase = Math.round((targetTotal * 0.94) * 100) / 100;
      else if (mode === 'gph_13' && !included) targetBase = Math.round((targetTotal * 0.87) * 100) / 100;

      var delta = Math.round((targetBase - currentBase) * 100) / 100;
      if (Math.abs(delta) >= 0.005) {
        var last = spec[spec.length - 1];
        last.sum = Math.round((Number(last.sum) + delta) * 100) / 100;
        if (last.qty > 0) {
          last.price = Math.round((last.sum / last.qty) * 100) / 100;
        }
      }
    } else {
      window._taskSmrRoundConfig[taskId] = false;
      if (window._taskSmrSpecUnrounded[taskId]) {
        window._taskSmrSpec[taskId] = JSON.parse(JSON.stringify(window._taskSmrSpecUnrounded[taskId]));
        delete window._taskSmrSpecUnrounded[taskId];
      }
    }

    if (typeof window._markSmrDirty === 'function') {
      window._markSmrDirty(taskId);
    }
    window._renderCardSmrTable(taskId);
  };

  // Вычисление математических выражений в ячейках сметы (по типу 1С: ввод формул прямо в поле)
  window._onSmrCellExprChange = function(taskId, idx, field, inputEl) {
    if (!inputEl) return;
    var rawVal = inputEl.value;
    var evaluated = window._evalMathExpression(rawVal);
    if (evaluated === null || evaluated < 0 || isNaN(evaluated)) {
      inputEl.style.borderColor = '#ef4444';
      inputEl.style.background = '#fef2f2';
      setTimeout(function() {
        if (inputEl) {
          inputEl.style.borderColor = '';
          inputEl.style.background = '';
        }
      }, 1500);
      return;
    }
    inputEl.value = evaluated;
    window._updateCardSmrLine(taskId, idx, field, evaluated);
  };

  // Модальное окно расчета цены позиции от согласованной общей суммы (от обратного)
  window._openBudgetDistributorModal = function(taskId, targetRowIdx) {
    var old = document.getElementById('_smr_budget_dist_modal');
    if (old) old.remove();

    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    window._curWizTask = t;
    var spec = (window._taskSmrSpec && window._taskSmrSpec[taskId]) || [];
    var thirdParty = (window._taskThirdPartySpec && window._taskThirdPartySpec[taskId]) || [];

    if (!spec.length) {
      alert('Сначала добавьте хотя бы одну строку в спецификацию сметы!');
      return;
    }

    targetRowIdx = (targetRowIdx !== undefined && targetRowIdx !== null && spec[targetRowIdx]) ? Number(targetRowIdx) : 0;

    // Считаем доп. расходы по объекту (проезд, проживание, бурение...)
    var totalTp = thirdParty.reduce(function(acc, tp){ return acc + (Number(tp.amount) || 0); }, 0);

    // Считаем сумму других строк сметы
    var otherRowsSum = 0;
    spec.forEach(function(l, i) {
      if (i !== targetRowIdx) {
        otherRowsSum += (Number(l.qty) || 0) * (Number(l.price) || 0);
      }
    });

    var custAmount = Number(t.amount || 0);
    var initialTotalBudget = custAmount > 0 ? custAmount : (otherRowsSum + (Number(spec[targetRowIdx].qty) || 1) * (Number(spec[targetRowIdx].price) || 0) + totalTp);
    if (!initialTotalBudget || initialTotalBudget <= 0) initialTotalBudget = 50000;

    var initialDeductions = totalTp + otherRowsSum;
    var initialQty = Number(spec[targetRowIdx].qty) || 1;

    var modal = document.createElement('div');
    modal.id = '_smr_budget_dist_modal';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '10000';

    var rowOptions = spec.map(function(l, idx) {
      return '<option value="' + idx + '"' + (idx === targetRowIdx ? ' selected' : '') + '>' +
        (idx + 1) + '. ' + escHtml(l.name || 'Позиция ' + (idx + 1)) + ' (' + l.qty + ' ' + escHtml(l.unit || 'шт') + ')' +
      '</option>';
    }).join('');

    modal.innerHTML = '<div class="modal-box" style="max-width:520px;width:95%;padding:18px 20px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1.5px solid var(--border);padding-bottom:10px">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:1.25rem">🧮</span>' +
          '<h3 style="margin:0;font-size:1.05rem;font-weight:700;color:var(--text)">Расчет цены от согласованной суммы</h3>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_smr_budget_dist_modal\').remove()">✕</button>' +
      '</div>' +

      '<div style="font-size:.78rem;color:var(--text-3);margin-bottom:14px">' +
        'Определение цены единицы «от обратного»: из общей суммы договора вычитаются сопутствующие расходы (транспорт, проживание, спецтехника), а остаток делится на объём.' +
      '</div>' +

      '<div style="display:flex;flex-direction:column;gap:12px">' +
        '<div>' +
          '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Целевая строка сметы для подстановки цены:</label>' +
          '<select id="_smr_dist_target_row" onchange="window._onSmrBudgetDistRowChange(\'' + escHtml(taskId) + '\', this.value)" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem;font-weight:600;background:#fff">' +
            rowOptions +
          '</select>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<div>' +
            '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Общая сумма договора (₽):</label>' +
            '<input type="number" id="_smr_dist_total_budget" value="' + initialTotalBudget + '" step="any" oninput="window._recalcBudgetDist(\'' + escHtml(taskId) + '\')" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-weight:700;font-size:.92rem" />' +
            (custAmount > 0 ? ('<button type="button" class="btn btn-xs btn-ghost" onclick="document.getElementById(\'_smr_dist_total_budget\').value=' + custAmount + ';window._recalcBudgetDist(\'' + escHtml(taskId) + '\')" style="font-size:.7rem;padding:2px 4px;margin-top:3px;color:var(--primary)">Взять от Заказчика (' + window.fmtMoneyPrecise(custAmount) + ')</button>') : '') +
          '</div>' +

          '<div>' +
            '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Вычесть расходы / логистику (₽):</label>' +
            '<input type="number" id="_smr_dist_deductions" value="' + initialDeductions + '" step="any" oninput="window._recalcBudgetDist(\'' + escHtml(taskId) + '\')" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-weight:700;font-size:.92rem" />' +
            (totalTp > 0 ? ('<button type="button" class="btn btn-xs btn-ghost" onclick="document.getElementById(\'_smr_dist_deductions\').value=' + totalTp + ';window._recalcBudgetDist(\'' + escHtml(taskId) + '\')" style="font-size:.7rem;padding:2px 4px;margin-top:3px;color:#7e22ce">Доп. расходы (' + window.fmtMoneyPrecise(totalTp) + ')</button>') : '') +
          '</div>' +
        '</div>' +

        '<div>' +
          '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Количество единиц (объем работ):</label>' +
          '<input type="number" id="_smr_dist_qty" value="' + initialQty + '" min="0.001" step="any" oninput="window._recalcBudgetDist(\'' + escHtml(taskId) + '\')" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-weight:700;font-size:.92rem" />' +
        '</div>' +

        '<div id="_smr_dist_preview_box" style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:12px 14px;margin-top:4px">' +
          '<div style="font-size:.75rem;color:#166534;font-weight:600;margin-bottom:2px">Формула: (Сумма договора - Расходы) / Объём</div>' +
          '<div id="_smr_dist_formula_text" style="font-family:monospace;font-size:.84rem;color:#15803d;margin-bottom:6px">...</div>' +
          '<div style="display:flex;align-items:baseline;justify-content:space-between">' +
            '<span style="font-size:.82rem;font-weight:700;color:#166534">Расчетная цена за единицу:</span>' +
            '<span id="_smr_dist_result_price" style="font-size:1.3rem;font-weight:900;color:#15803d">0 ₽</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;border-top:1px solid var(--border);padding-top:12px">' +
        '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'_smr_budget_dist_modal\').remove()">Отмена</button>' +
        '<button type="button" class="btn btn-primary" id="_smr_dist_apply_btn" onclick="window._applyBudgetDistResult(\'' + escHtml(taskId) + '\')" style="font-weight:700;padding:6px 16px">' +
          '✓ Применить цену в смету' +
        '</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);
    window._recalcBudgetDist(taskId);
  };

  window._onSmrBudgetDistRowChange = function(taskId, rowIdx) {
    var spec = (window._taskSmrSpec && window._taskSmrSpec[taskId]) || [];
    var row = spec[rowIdx];
    if (row) {
      var qtyInp = document.getElementById('_smr_dist_qty');
      if (qtyInp) qtyInp.value = Number(row.qty) || 1;
      window._recalcBudgetDist(taskId);
    }
  };

  window._recalcBudgetDist = function(taskId) {
    var totalInp = document.getElementById('_smr_dist_total_budget');
    var dedInp = document.getElementById('_smr_dist_deductions');
    var qtyInp = document.getElementById('_smr_dist_qty');
    var formulaText = document.getElementById('_smr_dist_formula_text');
    var resPriceEl = document.getElementById('_smr_dist_result_price');
    var applyBtn = document.getElementById('_smr_dist_apply_btn');

    if (!totalInp || !dedInp || !qtyInp) return;

    var total = Math.max(0, parseFloat(totalInp.value) || 0);
    var ded = Math.max(0, parseFloat(dedInp.value) || 0);
    var qty = Math.max(0.001, parseFloat(qtyInp.value) || 1);

    var rem = Math.max(0, total - ded);
    var calculatedPrice = Math.round((rem / qty) * 100) / 100;

    if (formulaText) {
      formulaText.textContent = '(' + window.fmtMoneyPrecise(total) + ' - ' + window.fmtMoneyPrecise(ded) + ') / ' + qty + ' = ' + window.fmtMoneyPrecise(calculatedPrice);
    }
    if (resPriceEl) {
      resPriceEl.textContent = window.fmtMoneyPrecise(calculatedPrice);
    }
    if (applyBtn) {
      applyBtn.disabled = calculatedPrice <= 0;
    }
  };

  window._applyBudgetDistResult = function(taskId) {
    var targetRowSel = document.getElementById('_smr_dist_target_row');
    var totalInp = document.getElementById('_smr_dist_total_budget');
    var dedInp = document.getElementById('_smr_dist_deductions');
    var qtyInp = document.getElementById('_smr_dist_qty');

    if (!targetRowSel || !totalInp || !dedInp || !qtyInp) return;

    var rowIdx = parseInt(targetRowSel.value, 10);
    var total = Math.max(0, parseFloat(totalInp.value) || 0);
    var ded = Math.max(0, parseFloat(dedInp.value) || 0);
    var qty = Math.max(0.001, parseFloat(qtyInp.value) || 1);

    var rem = Math.max(0, total - ded);
    var calculatedPrice = Math.round((rem / qty) * 100) / 100;

    var spec = window._taskSmrSpec && window._taskSmrSpec[taskId];
    if (spec && spec[rowIdx]) {
      spec[rowIdx].price = calculatedPrice;
      var priceInp = document.getElementById('smr_row_price_inp_' + taskId + '_' + rowIdx);
      if (priceInp) priceInp.value = calculatedPrice;
      window._updateCardSmrLine(taskId, rowIdx, 'price', calculatedPrice);
    }

    var m = document.getElementById('_smr_budget_dist_modal');
    if (m) m.remove();

    if (typeof showToast === 'function') {
      showToast('Цена ' + window.fmtMoneyPrecise(calculatedPrice) + ' применена в смету', 'success');
    }
  };

  // Методы управления дополнительными расходами по объекту (проезд, проживание, бурильщики, спецтехника, инструмент)
  window._addThirdPartyLine = function(taskId, presetKey) {
    window._taskThirdPartySpec = window._taskThirdPartySpec || {};
    if (!window._taskThirdPartySpec[taskId]) window._taskThirdPartySpec[taskId] = [];

    var presets = {
      travel: { name: 'Проезд / ГСМ / Транспортные расходы', performer: 'Транспортная компания / ГСМ', contract_info: 'Чеки / путевые', payment_type: 'through_contractor', amount: 5000 },
      hotel: { name: 'Проживание в гостинице / найм жилья', performer: 'Гостиница / наймодатель', contract_info: 'Квитанции', payment_type: 'through_contractor', amount: 7500 },
      driller: { name: 'Алмазное бурение технологических отверстий', performer: 'Специалист по бурению', contract_info: 'Договор / чек', payment_type: 'through_contractor', amount: 0 },
      lift: { name: 'Аренда автовышки с машинистом', performer: 'Оператор спецтехники', contract_info: 'Договор аренды', payment_type: 'direct', amount: 15000 },
      tools: { name: 'Аренда специнструмента / расходники', performer: 'Поставщик / Аренда', contract_info: 'Чек / накладная', payment_type: 'through_contractor', amount: 3000 },
      custom: { name: 'Дополнительные расходы по объекту', performer: 'Исполнитель / Поставщик', contract_info: 'Договор / чек', payment_type: 'through_contractor', amount: 5000 }
    };

    var item = presets[presetKey] || presets.custom;
    window._taskThirdPartySpec[taskId].push(JSON.parse(JSON.stringify(item)));
    if (typeof window._markSmrDirty === 'function') window._markSmrDirty(taskId);
    window._renderCardSmrTable(taskId);
  };

  window._updateThirdPartyLine = function(taskId, idx, field, val) {
    var list = window._taskThirdPartySpec && window._taskThirdPartySpec[taskId];
    if (!list || !list[idx]) return;
    if (field === 'amount') {
      list[idx].amount = Math.max(0, parseFloat(val) || 0);
      window._refreshSmrCalculations(taskId);
    } else {
      list[idx][field] = val;
      if (field === 'payment_type') {
        window._refreshSmrCalculations(taskId);
      }
    }
    if (typeof window._markSmrDirty === 'function') window._markSmrDirty(taskId);
  };

  window._removeThirdPartyLine = function(taskId, idx) {
    var list = window._taskThirdPartySpec && window._taskThirdPartySpec[taskId];
    if (!list) return;
    list.splice(idx, 1);
    if (typeof window._markSmrDirty === 'function') window._markSmrDirty(taskId);
    window._renderCardSmrTable(taskId);
  };

  window.renderCardSmrCalculator = function(taskId) {
    var cont = document.getElementById('cardSmrCalculatorBlock');
    if (!cont) return;

    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); });
    if (!t) return;

    // Проверка статуса входного контроля заявки
    var isAccepted = (
      t.assignmentStatus === 'accepted' || 
      t.assignment_status === 'accepted' || 
      (t.stage_num !== undefined && t.stage_num !== null && Number(t.stage_num) > 0) || 
      (t.status && t.status !== 'new' && t.status !== 'created') || 
      (t.contractor && String(t.contractor).trim().length > 0)
    );

    var curSub = (window._curCardSubcontracts || []).find(function(s){ return String(s.task_id) === String(taskId); }) || null;
    var taskContr = (t.contractor && t.contractor.trim()) || (S.cardDraft && S.cardDraft.contractor ? S.cardDraft.contractor.trim() : '');
    var contrName = taskContr || (curSub && curSub.contractor_name) || '';
    var contrObj = contrName ? (S.contractors || []).find(function(c){
      if (!c) return false;
      var cShort = (c.name_short || '').trim().toLowerCase();
      var cFull = (c.name_full || '').trim().toLowerCase();
      var cTarget = contrName.trim().toLowerCase();
      return cShort === cTarget || cFull === cTarget || cShort.includes(cTarget) || cTarget.includes(cShort);
    }) : null;

    // Инициализация спецификации СМР (одна работа = одна строка)
    if (curSub && curSub.calculation_details && Array.isArray(curSub.calculation_details.lines) && curSub.calculation_details.lines.length) {
      if (!S.cardDraft || !S.cardDraft._smrDirty) {
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

    if (!window._taskSmrSpec[taskId] || !window._taskSmrSpec[taskId].length) {
      if (curSub && curSub.calculation_details && Array.isArray(curSub.calculation_details.lines) && curSub.calculation_details.lines.length) {
        window._taskSmrSpec[taskId] = JSON.parse(JSON.stringify(curSub.calculation_details.lines));
      } else {
        var defaultPorts = parseInt(t.fact || t.in_order || t.inOrder || 1, 10) || 1;
        var isSber = (t.customer || '').toLowerCase().includes('сбер') || (t.id && String(t.id).includes('СЗБ'));
        var pPrice = defaultPorts > 3 ? 2500 : 3000;
        var defaultLineName = isSber
          ? ('Базовая стоимость работ 1 порт СКС 5е' + (defaultPorts > 3 ? ' (шкала >3 шт)' : ' (шкала 1-3 шт)'))
          : (t.work_type ? t.work_type : 'Монтаж СКС и линий связи (по прайс-листу подрядчика)');

        var specLines = [
          {
            name: defaultLineName,
            qty: defaultPorts,
            unit: 'порт',
            price: pPrice,
            sum: defaultPorts * pPrice
          }
        ];
        var km = parseFloat(t.distance_km || t.distanceKm || 0);
        if (km > 10) {
          var billableKm = Math.round(km - 10);
          specLines.push({
            name: 'Транспортные расходы (компенсация проезда авто свыше 10 км: ' + billableKm + ' км × 12 ₽)',
            qty: billableKm,
            unit: 'км',
            price: 12,
            sum: billableKm * 12
          });
        } else if (km > 0) {
          specLines.push({
            name: 'Выезд внутри города (<10 км)',
            qty: 1,
            unit: 'выезд',
            price: 300,
            sum: 300
          });
        }
        window._taskSmrSpec[taskId] = specLines;
      }
    }

    // Инициализация спецификации дополнительных расходов (бурильщики, проживание, спецтехника)
    if (!window._taskThirdPartySpec[taskId]) {
      if (curSub && curSub.calculation_details && Array.isArray(curSub.calculation_details.third_party_lines)) {
        window._taskThirdPartySpec[taskId] = JSON.parse(JSON.stringify(curSub.calculation_details.third_party_lines));
      } else {
        window._taskThirdPartySpec[taskId] = [];
      }
    }

    // Инициализация налогового режима сметы СМР
    window._taskSmrTax = window._taskSmrTax || {};
    if (!window._taskSmrTax[taskId]) {
      var savedTaxDetails = (curSub && curSub.calculation_details && curSub.calculation_details.tax_details) ||
                            (t.rawData && t.rawData.smrTaxDetails);
      if (savedTaxDetails) {
        if (typeof savedTaxDetails === 'object' && savedTaxDetails.mode) {
          window._taskSmrTax[taskId] = {
            mode: savedTaxDetails.mode,
            included: savedTaxDetails.taxIncluded !== undefined ? !!savedTaxDetails.taxIncluded : (savedTaxDetails.mode !== 'npd_6' && savedTaxDetails.mode !== 'gph_13')
          };
        } else if (typeof savedTaxDetails === 'string') {
          window._taskSmrTax[taskId] = savedTaxDetails;
        }
      } else {
        window._taskSmrTax[taskId] = window._getTaskSmrTaxConfig(taskId);
      }
    }

    // Определяем привязанное собственное юрлицо («Мы» / Генподрядчик)
    var curOwnId = t.own_company_id || (t.customer && t.customer.toLowerCase().includes('сбер') ? 2 : 1);
    var ownList = S.ownCompanies || [];

    var activeIdx = (window._activeSubcontractIdx && window._activeSubcontractIdx[taskId]) || 0;
    if (activeIdx >= (window._curCardSubcontracts || []).length) activeIdx = 0;
    if (window._curCardSubcontracts && window._curCardSubcontracts.length > 0) {
      curSub = window._curCardSubcontracts[activeIdx];
    }

    var hasContract = Boolean(curSub && curSub.contractor_contract_id);
    var contractTitle = hasContract
      ? ('№ ' + escHtml(curSub.contract_number) + (curSub.contract_date ? (' от ' + escHtml(String(curSub.contract_date).slice(0,10).split('-').reverse().join('.'))) : '') + (curSub.own_company_name ? ' (' + escHtml(curSub.own_company_name) + ')' : ''))
      : '<span style="color:#b45309;font-weight:700">⚠️ Договор не выбран</span>';

    var priceTitle = (curSub && curSub.price_list_name)
      ? escHtml(curSub.price_list_name)
      : (hasContract ? 'По соглашению к договору' : '<span style="color:var(--text-3)">Не привязан</span>');

    // Адрес и маршрут на Яндекс.Картах
    var taskAddr = String(t.address || '').trim();
    var taskReg = String(t.region || '').trim();
    var baseCity = taskReg ? ('г. ' + taskReg.replace(/область|обл\.|край|респ\.|республика/gi, '').trim()) : 'База';
    var yandexRouteUrl = 'https://yandex.ru/maps/?rtext=' + encodeURIComponent(baseCity) + '~' + encodeURIComponent(taskAddr || taskReg) + '&rtt=auto';

    // Баннер ожидания входного контроля ПМ
    var pendingBannerHtml = !isAccepted ? (
      '<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:12px;display:flex;align-items:center;gap:12px">' +
        '<div style="font-size:1.6rem">⏳</div>' +
        '<div style="flex:1">' +
          '<div style="font-weight:700;color:#92400e;font-size:.88rem">Заявка ожидает входного контроля ПМ</div>' +
          '<div style="font-size:.78rem;color:#b45309;margin-top:2px">' +
            'Назначение подрядчика и утверждение сметы СМР станут активны после подтверждения заявки на вкладке «Информация» (Шаг 1: проверка технической информации).' +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-primary" onclick="if(window.switchCardTab)window.switchCardTab(\'info\');else if(window.setCardTab)window.setCardTab(\'info\')" style="font-size:.78rem;white-space:nowrap">📋 Перейти к подтверждению →</button>' +
      '</div>'
    ) : '';

    // Баннер технических материалов и схем Заказчика для подрядчика
    var techLink = t.tech_link || (t.rawData && (t.rawData['Ссылка на тех. инфу'] || t.rawData['Ссылка на тех.инфу'] || t.rawData['Ссылка на диск'])) || '';
    var materialsTaskBanner = '<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<span style="font-size:1.3rem">📁</span>' +
        '<div>' +
          '<div style="font-weight:700;color:#166534;font-size:.84rem">Материалы и документация Заказчика для подрядчика</div>' +
          '<div style="font-size:.74rem;color:#15803d">Ссылка на файлы и схемы на Яндекс.Диске, переданные в производство</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;align-items:center">' +
        (techLink ? ('<a href="' + escHtml(techLink) + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost" style="color:#166534;border:1px solid #86efac;font-size:.76rem;font-weight:700">🔗 Открыть диск Заказчика</a>') : '<span style="font-size:.75rem;color:var(--text-3)">Ссылка на диск не указана</span>') +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="window.editCardTechLink(\'' + escHtml(taskId) + '\')" style="font-size:.76rem">✏️ ' + (techLink ? 'Изменить' : 'Указать') + '</button>' +
        (techLink ? ('<button type="button" class="btn btn-sm btn-ghost" onclick="window.shareTechLinkWithContractor(\'' + escHtml(taskId) + '\')" style="font-size:.76rem" title="Скопировать ссылку для отправки подрядчику">📲 Отправить подрядчику</button>') : '') +
      '</div>' +
    '</div>';

    var allCardSubs = window._curCardSubcontracts || [];
    var multiSubTabsHtml = allCardSubs.length > 1 ? (
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;background:#f8fafc;padding:6px 10px;border-radius:8px;border:1.5px solid #cbd5e1;overflow-x:auto">' +
        '<span style="font-size:.76rem;font-weight:700;color:var(--text-2);margin-right:4px">Исполнители на объекте (' + allCardSubs.length + '):</span>' +
        allCardSubs.map(function(s, idx) {
          var isCurTab = (idx === activeIdx);
          var subLabel = (idx + 1) + '. ' + (s.contractor_name || 'Подрядчик') + (s.price_agreed ? ' (' + window.fmtMoney(s.price_agreed) + ')' : '');
          return '<button type="button" class="btn btn-xs ' + (isCurTab ? 'btn-primary' : 'btn-ghost') + '" onclick="window._setActiveSubcontract(\'' + escHtml(taskId) + '\', ' + idx + ')" style="font-weight:700;font-size:.76rem;padding:4px 10px;white-space:nowrap">' +
            escHtml(subLabel) +
          '</button>';
        }).join('') +
        '<button type="button" class="btn btn-xs btn-ghost" onclick="window.addNewSubcontractToTask(\'' + escHtml(taskId) + '\')" style="color:var(--blue);border:1px dashed #93c5fd;font-weight:700;font-size:.74rem;padding:4px 8px;white-space:nowrap">' +
          '+ Добавить' +
        '</button>' +
      '</div>'
    ) : '';

    var contrHeaderHtml = contrName ? (
      multiSubTabsHtml +
      '<div style="background:#f8fafc;border:1.5px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">' +
          '<div>' +
            '<div style="font-size:.72rem;color:var(--text-3);text-transform:uppercase;font-weight:700">Исполнитель СМР на объекте</div>' +
            '<div style="font-size:1.1rem;font-weight:700;color:var(--text);margin-top:2px">🏢 ' + escHtml(contrName) + '</div>' +
            '<div style="font-size:.78rem;color:var(--text-2);margin-top:2px;display:flex;gap:12px;flex-wrap:wrap">' +
              (contrObj && contrObj.inn ? ('<span>ИНН: <b>' + escHtml(contrObj.inn) + '</b></span>') : '') +
              (contrObj && contrObj.phone ? ('<span>Тел: <a href="tel:' + escHtml(contrObj.phone.replace(/[^\d+]/g,'')) + '" style="color:var(--green);font-weight:600">' + escHtml(contrObj.phone) + '</a></span>') : '') +
              '<span>Договор: <b style="color:var(--blue)">' + contractTitle + '</b></span>' +
              '<span>Прайс: <b>' + escHtml(priceTitle) + '</b></span>' +
              (function() {
                var cSpecs = (S.specialists || []).filter(function(sp) {
                  if (!sp) return false;
                  var spOrg = (sp.contractor_name || sp.organization || sp.company || '').trim().toLowerCase();
                  var cNameL = (contrName || '').trim().toLowerCase();
                  return cNameL && spOrg && (spOrg === cNameL || spOrg.includes(cNameL) || cNameL.includes(spOrg));
                });
                if (cSpecs.length > 0) {
                  return '<span class="badge b-green" style="font-size:.72rem" title="Монтажники привязаны к исполнителю">👷 Бригада: ' + cSpecs.length + ' чел.</span>';
                }
                return '<span class="badge b-orange" style="font-size:.72rem;background:#fffbeb;color:#b45309;border:1px solid #fde68a" title="Не указан список сотрудников для писем на допуск">⚠️ Бригада не указана</span> <button type="button" class="btn-link" onclick="openAccessLetterModal(\'' + escHtml(taskId) + '\')" style="font-size:.72rem;color:var(--blue);text-decoration:underline">+ Добавить монтажников</button>';
              })() +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="openContractorPicker(\'' + escHtml(taskId) + '\')" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : '') + ' style="font-size:.78rem;font-weight:600">🔍 Сменить исполнителя</button>' +
            (hasContract ? (
              '<button type="button" class="btn btn-sm btn-ghost" onclick="window.openContractorContractPickerModal(\'' + escHtml(taskId) + '\',\'' + escHtml(contrName) + '\')" style="font-size:.78rem;color:var(--blue);font-weight:700" title="Просмотреть или сменить договор">📑 Договор: ' + escHtml(curSub.contract_number) + '</button>'
            ) : (
              '<button type="button" class="btn btn-sm btn-primary" onclick="window.openContractorContractPickerModal(\'' + escHtml(taskId) + '\',\'' + escHtml(contrName) + '\')" style="font-size:.78rem;font-weight:700;box-shadow:0 1px 3px rgba(37,99,235,0.2)" title="Выбрать действующий договор или заключить новый">📑 Выбрать договор субподряда</button>'
            )) +
            '<button type="button" class="btn btn-sm btn-ghost" style="color:var(--red);border:1px solid #fca5a5;font-size:.78rem" onclick="if(window.removeContractorFromTask)window.removeContractorFromTask(\'' + escHtml(taskId) + '\')">❌ Убрать</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    ) : (
      '<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">' +
        '<div>' +
          '<div style="font-weight:700;color:#92400e;font-size:.9rem">Исполнитель СМР еще не назначен</div>' +
          '<div style="font-size:.78rem;color:#b45309;margin-top:2px">' + (!isAccepted ? 'Назначение подрядчика станет доступно после входного контроля заявки' : 'Назначьте подрядчика для расчета сметы и формирования заказ-наряда') + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-primary" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : 'onclick="openSubcontractWizardModal(\'' + escHtml(taskId) + '\')"') + '>+ Назначить исполнителя</button>' +
      '</div>'
    );

    var html = '<div class="card p" style="margin-bottom:1rem;border:1.5px solid var(--border);background:#fff">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:.85rem">' +
        '<div>' +
          '<div class="sec-title" style="margin:0;font-size:1.05rem;display:flex;align-items:center;gap:6px">' +
            '<span>🛠️ Спецификация и расчет стоимости СМР</span>' +
            '<span class="badge b-blue" style="font-size:.72rem">Прайс-лист</span>' +
            '<span style="font-size:.8rem;font-weight:600;color:var(--blue);margin-left:4px">· Заявка (соглашение) к договору</span>' +
          '</div>' +
          '<div style="font-size:.78rem;color:var(--text-3);margin-top:2px">Единый расчет: одна работа = одна строка, компенсация проезда и сопоставление с договором Заказчика</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center">' +
          (taskAddr ? ('<a href="' + escHtml(yandexRouteUrl) + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost" style="color:#2563eb;font-weight:600;font-size:.76rem" title="Построить маршрут и замерить километраж в Яндекс.Картах">📍 Маршрут (Яндекс.Карты)</a>') : '') +
        '</div>' +
      '</div>' +

      pendingBannerHtml +
      materialsTaskBanner +
      contrHeaderHtml +

      // Контейнер с таблицей спецификации
      '<div id="card_smr_spec_table_box"></div>' +
    '</div>';

    cont.innerHTML = html;
    window._renderCardSmrTable(taskId);
  };

  // 3. Рендеринг таблицы спецификации СМР и привлеченных третьих лиц
  window._renderCardSmrTable = function(taskId) {
    var box = document.getElementById('card_smr_spec_table_box');
    if (!box) return;

    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    window._curWizTask = t;
    var isAccepted = (
      t.assignmentStatus === 'accepted' || 
      t.assignment_status === 'accepted' || 
      (t.stage_num !== undefined && t.stage_num !== null && Number(t.stage_num) > 0) || 
      (t.status && t.status !== 'new' && t.status !== 'created') || 
      (t.contractor && String(t.contractor).trim().length > 0)
    );

    var spec = window._taskSmrSpec && window._taskSmrSpec[taskId] ? window._taskSmrSpec[taskId] : [];
    var thirdParty = window._taskThirdPartySpec && window._taskThirdPartySpec[taskId] ? window._taskThirdPartySpec[taskId] : [];

    var curOwnId = t.own_company_id || (t.customer && t.customer.toLowerCase().includes('сбер') ? 2 : 1);
    var ownList = S.ownCompanies || [];
    var curSub = (window._curCardSubcontracts || []).find(function(s){ return String(s.task_id) === String(taskId); }) || null;
    var contrName = (t.contractor && t.contractor.trim()) || (curSub && curSub.contractor_name) || '';

    var contrObj = contrName ? (S.contractors || []).find(function(c){
      if (!c) return false;
      var cShort = (c.name_short || '').trim().toLowerCase();
      var cFull = (c.name_full || '').trim().toLowerCase();
      var cTarget = contrName.trim().toLowerCase();
      return cShort === cTarget || cFull === cTarget || cShort.includes(cTarget) || cTarget.includes(cShort);
    }) : null;

    var cTax = contrObj && contrObj.tax_system ? String(contrObj.tax_system).toLowerCase() : 'usn';
    var cTaxLabelsMap = {
      usn: 'УСН (Без НДС)',
      osno: 'ОСНО (НДС 20%)',
      npd: 'Самозанятый (НПД 6%)',
      usn_5: 'УСН (НДС 5%)',
      usn_7: 'УСН (НДС 7%)',
      gph: 'Физлицо (ГПХ 13%)'
    };
    var cTaxLabel = cTaxLabelsMap[cTax] || 'УСН (Без НДС)';
    var contrTaxHint = contrName ? (contrName + ' (по профилю: ' + cTaxLabel + ')') : 'Исполнитель еще не назначен (по умолч. УСН)';

    var taxCfg = window._getTaskSmrTaxConfig(taskId);
    var curTaxMode = taxCfg.mode;
    var isTaxIncluded = taxCfg.included;

    var taxOptions = [
      { v: 'usn',     l: 'Без НДС (УСН / патент)' },
      { v: 'npd_6',   l: 'Самозанятый (НПД 6%)' },
      { v: 'osno_20', l: 'ОСНО (НДС 20%)' },
      { v: 'usn_5',   l: 'УСН (НДС 5%)' },
      { v: 'usn_7',   l: 'УСН (НДС 7%)' },
      { v: 'gph_13',  l: 'Физлицо ГПХ (НДФЛ 13%)' }
    ];

    var totalSubAmount = 0;
    var rowsHtml = spec.map(function(l, idx) {
      var rowSum = Math.round((Number(l.qty) || 0) * (Number(l.price) || 0) * 100) / 100;
      totalSubAmount += rowSum;
      return '<tr style="border-bottom:1px solid var(--border);font-size:.82rem">' +
        '<td style="padding:6px 8px;font-weight:600;color:var(--text-3);text-align:center">' + (idx + 1) + '</td>' +
        '<td style="padding:6px 8px">' +
          '<input type="text" value="' + escHtml(l.name || '') + '" ' + (!isAccepted ? 'disabled ' : '') + 'style="width:100%;min-width:240px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;font-weight:600;font-size:.82rem" placeholder="Наименование работы / позиции" oninput="window._updateCardSmrLine(\'' + escHtml(taskId) + '\', ' + idx + ', \'name\', this.value)">' +
        '</td>' +
        '<td style="padding:6px 8px;text-align:center;color:var(--text-2)">' +
          '<input type="text" value="' + escHtml(l.unit || 'шт') + '" ' + (!isAccepted ? 'disabled ' : '') + 'style="width:48px;padding:3px 4px;border:1px solid var(--border);border-radius:4px;text-align:center;font-size:.8rem" oninput="window._updateCardSmrLine(\'' + escHtml(taskId) + '\', ' + idx + ', \'unit\', this.value)">' +
        '</td>' +
        '<td style="padding:6px 8px;text-align:center">' +
          '<input type="text" id="smr_row_qty_inp_' + escHtml(taskId) + '_' + idx + '" value="' + l.qty + '" ' + (!isAccepted ? 'disabled ' : '') + 'style="width:65px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;text-align:center;font-weight:700" onchange="window._onSmrCellExprChange(\'' + escHtml(taskId) + '\', ' + idx + ', \'qty\', this)" onkeydown="if(event.key===\'Enter\'){this.blur();}">' +
        '</td>' +
        '<td style="padding:6px 8px;text-align:right">' +
          '<div style="display:flex;align-items:center;justify-content:flex-end;gap:3px">' +
            '<input type="text" id="smr_row_price_inp_' + escHtml(taskId) + '_' + idx + '" value="' + l.price + '" ' + (!isAccepted ? 'disabled ' : '') + 'style="width:80px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;text-align:right;font-weight:600" onchange="window._onSmrCellExprChange(\'' + escHtml(taskId) + '\', ' + idx + ', \'price\', this)" onkeydown="if(event.key===\'Enter\'){this.blur();}">' +
            (!isAccepted ? '' : ('<button type="button" class="btn btn-xs btn-ghost" style="padding:2px 4px;font-size:.72rem;color:var(--text-3)" title="Рассчитать цену от согласованной суммы" onclick="window._openBudgetDistributorModal(\'' + escHtml(taskId) + '\', ' + idx + ')">🧮</button>')) +
          '</div>' +
        '</td>' +
        '<td id="smr_row_sum_' + escHtml(taskId) + '_' + idx + '" style="padding:6px 8px;text-align:right;font-weight:700;color:var(--text)">' + window.fmtMoneyPrecise(rowSum) + '</td>' +
        '<td style="padding:6px 8px;text-align:center">' +
          (!isAccepted ? '' : ('<button type="button" class="btn btn-sm btn-ghost" onclick="window._removeCardSmrLine(\'' + escHtml(taskId) + '\', ' + idx + ')" style="padding:1px 6px;color:var(--red);font-size:.8rem" title="Удалить позицию">✕</button>')) +
        '</td>' +
      '</tr>';
    }).join('');
    totalSubAmount = Math.round(totalSubAmount * 100) / 100;

    if (!spec.length) {
      rowsHtml = '<tr><td colspan="7" style="padding:14px;text-align:center;color:var(--text-3);font-size:.82rem">Спецификация пуста. Нажмите «+ Добавить позицию из прайса» ниже.</td></tr>';
    }

    // Таблица дополнительных расходов по объекту (проезд, проживание, бурение, вышка, инструмент, расходники)
    var totalThirdPartyAmount = 0;
    var thirdPartyDirectSum = 0;
    var tpRowsHtml = thirdParty.map(function(tp, tpIdx) {
      var tpSum = Math.round(Number(tp.amount) || 0);
      totalThirdPartyAmount += tpSum;
      if (tp.payment_type === 'direct') thirdPartyDirectSum += tpSum;
      var isDirect = tp.payment_type === 'direct';

      return '<tr style="border-bottom:1px solid #e9d5ff;font-size:.82rem">' +
        '<td style="padding:6px 8px;font-weight:600;color:#7e22ce;text-align:center">' + (tpIdx + 1) + '</td>' +
        '<td style="padding:6px 8px">' +
          '<input type="text" value="' + escHtml(tp.name || '') + '" ' + (!isAccepted ? 'disabled ' : '') + 'style="width:100%;padding:3px 6px;border:1px solid #d8b4fe;border-radius:4px;font-weight:600;font-size:.8rem" placeholder="Статья расхода (проезд, проживание...)" oninput="window._updateThirdPartyLine(\'' + escHtml(taskId) + '\', ' + tpIdx + ', \'name\', this.value)">' +
        '</td>' +
        '<td style="padding:6px 8px">' +
          '<input type="text" value="' + escHtml(tp.performer || '') + '" ' + (!isAccepted ? 'disabled ' : '') + 'style="width:100%;padding:3px 6px;border:1px solid #d8b4fe;border-radius:4px;font-size:.8rem" placeholder="Получатель / Исполнитель" oninput="window._updateThirdPartyLine(\'' + escHtml(taskId) + '\', ' + tpIdx + ', \'performer\', this.value)">' +
        '</td>' +
        '<td style="padding:6px 8px;text-align:center">' +
          '<select ' + (!isAccepted ? 'disabled ' : '') + 'style="padding:3px 6px;border:1px solid #d8b4fe;border-radius:4px;font-size:.76rem;background:#fff" onchange="window._updateThirdPartyLine(\'' + escHtml(taskId) + '\', ' + tpIdx + ', \'payment_type\', this.value)">' +
            '<option value="through_contractor"' + (!isDirect ? ' selected' : '') + '>Подрядчик СМР (в смете)</option>' +
            '<option value="direct"' + (isDirect ? ' selected' : '') + '>Генподрядчик напрямую («Мы»)</option>' +
          '</select>' +
        '</td>' +
        '<td id="tp_row_sum_' + escHtml(taskId) + '_' + tpIdx + '" style="padding:6px 8px;text-align:right">' +
          '<input type="number" min="0" step="any" value="' + (tp.amount || 0) + '" ' + (!isAccepted ? 'disabled ' : '') + 'style="width:90px;padding:3px 6px;border:1px solid #d8b4fe;border-radius:4px;text-align:right;font-weight:700;color:#581c87" oninput="window._updateThirdPartyLine(\'' + escHtml(taskId) + '\', ' + tpIdx + ', \'amount\', this.value)">' +
        '</td>' +
        '<td style="padding:6px 8px;text-align:center">' +
          (!isAccepted ? '' : ('<button type="button" class="btn btn-sm btn-ghost" onclick="window._removeThirdPartyLine(\'' + escHtml(taskId) + '\', ' + tpIdx + ')" style="padding:1px 6px;color:var(--red);font-size:.8rem" title="Удалить расход">✕</button>')) +
        '</td>' +
      '</tr>';
    }).join('');

    if (!thirdParty.length) {
      tpRowsHtml = '<tr><td colspan="6" style="padding:10px;text-align:center;color:#7e22ce;font-size:.78rem">Дополнительных расходов по объекту нет. Нажмите кнопки выше для добавления проезда, проживания, бурения или спецтехники.</td></tr>';
    }

    // Расчет финансового баланса:
    // Заказчик (платят нам) → Расход: Подрядчик (СМР) → Расход: Доп. расходы → Нам (Операционный остаток)
    var custAmount = Number(t.amount || 0);
    var taxCalc = window._calculateSmrTaxes(totalSubAmount, curTaxMode, isTaxIncluded, taskId);
    var totalOutflow = taxCalc.totalWithTax + totalThirdPartyAmount;
    var netMargin = custAmount > 0 ? (custAmount - totalOutflow) : 0;
    var netMarginPct = custAmount > 0 ? Math.round((netMargin / custAmount) * 100) : 0;
    var curOwnObj = ownList.find(function(oc){ return oc.id === curOwnId; }) || {};
    var curOwnName = curOwnObj.name_short || 'Генподрядчик';

    var ownSelectHtml = '<select id="smr_spec_own_company" onchange="window._onSmrOwnCompanyChange(\'' + escHtml(taskId) + '\', this.value)" style="padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.8rem;font-weight:600">' +
      ownList.map(function(oc) {
        var isSel = (oc.id === curOwnId) ? ' selected' : '';
        return '<option value="' + oc.id + '"' + isSel + '>' + escHtml(oc.name_short) + ' (Директор: ' + escHtml(oc.director || '') + ')</option>';
      }).join('') +
    '</select>';

    var priceListPickerHtml = '<div style="position:relative;display:inline-block">' +
      '<button type="button" class="btn btn-sm btn-ghost" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : 'onclick="window._toggleSmrAddMenu(\'' + escHtml(taskId) + '\')"') + ' style="color:var(--primary);font-weight:600;border:1.5px solid var(--border);padding:4px 10px;font-size:.78rem">' +
        '+ Добавить позицию из прайса ▾' +
      '</button>' +
      '<div id="smr_add_menu_' + escHtml(taskId) + '" style="display:none;position:absolute;top:100%;left:0;z-index:100;background:#fff;border:1.5px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);min-width:340px;max-height:360px;overflow-y:auto;padding:6px">' +
        '<div style="font-size:.72rem;font-weight:700;color:var(--text-3);padding:4px 8px;text-transform:uppercase">Шкафы ТКШ</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_42u\')">Монтаж напольного ТКШ 42-48U (10 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_32u\')">Монтаж напольного ТКШ 32U (8 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_18u\')">Монтаж навесного ТКШ 18-22U (6 500 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_swap\')">Замена ТКШ с переносом (10 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_demount_42u\')">Демонтаж напольного ТКШ 42U (7 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_demount_18u\')">Демонтаж навесного ТКШ 18-22U (5 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_mod_600\')">Модернизация шкафа (3 000 ₽)</div>' +
        '<div style="font-size:.72rem;font-weight:700;color:var(--text-3);padding:4px 8px;text-transform:uppercase;border-top:1px solid #f1f5f9;margin-top:4px">СКС, Монтаж и Оптика</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'port_5e\')">Монтаж порта СКС кат. 5е (2 500 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'port_6\')">Монтаж порта СКС кат. 6/6А (3 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'port_optics\')">Оптический порт (дуплекс) OS2/OM3 (3 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'cable_utp\')">Прокладка витой пары UTP 4 пары (50 ₽/м)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'socket_rj45\')">Установка розетки RJ-45 с расключением (350 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'cable_duct\')">Монтаж кабель-канала до 40мм (120 ₽/м)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'patch_panel\')">Монтаж и расшивка патч-панели 24 порта (2 500 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'fluke_test\')">Тестирование и маркировка портов (150 ₽/порт)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'port_reinstall\')">Демонтаж с монтажом за порт (1 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'port_move\')">Перемещение портов (1 500 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_reterminate\')">Перешивка портов при замене ТКШ (500 ₽/порт)</div>' +
        '<div style="font-size:.72rem;font-weight:700;color:var(--text-3);padding:4px 8px;text-transform:uppercase;border-top:1px solid #f1f5f9;margin-top:4px">Транспортные и командировочные (по договору)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'travel_city\')">🚗 Выезд внутри города (<10 км) (300 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'travel_km\')">🚗 Проезд авто свыше 10 км (12 ₽/км)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'travel_daily\')">🥪 Оплата суточных монтажника (700 ₽/день)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'travel_hotel\')">🏨 Проживание в гостинице / найм жилья (2 500 ₽/сут)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'travel_delivery\')">📦 Доставка оборудования и материалов (2 000 ₽)</div>' +
        '<div style="font-size:.72rem;font-weight:700;color:var(--text-3);padding:4px 8px;text-transform:uppercase;border-top:1px solid #f1f5f9;margin-top:4px">Прочее</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'repeat_visit\')">Повторный выезд на объект (3 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'custom\')">Произвольная доп. работа (+5 000 ₽)</div>' +
      '</div>' +
    '</div>';

    var thirdPartyPaymentNote = totalThirdPartyAmount > 0
      ? (thirdPartyDirectSum > 0 ? ('В т.ч. напрямую от Нас: ' + fmtMoney(thirdPartyDirectSum)) : 'Через основного подрядчика')
      : 'Нет затрат';

    box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        priceListPickerHtml +
        '<button type="button" class="btn btn-sm btn-ghost" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : 'onclick="window._addCustomCardSmrLine(\'' + escHtml(taskId) + '\')"') + ' style="font-size:.78rem;font-weight:600;border:1.5px dashed var(--border);padding:4px 10px">' +
          '+ Произвольная работа' +
        '</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : 'onclick="window._openBudgetDistributorModal(\'' + escHtml(taskId) + '\')"') + ' style="font-size:.78rem;font-weight:600;border:1.5px solid var(--border);padding:4px 10px;color:var(--text)" title="Рассчитать цену за единицу от согласованного бюджета">' +
          '🧮 Расчет от общей суммы' +
        '</button>' +
        '<button type="button" class="btn btn-sm btn-primary" onclick="window.exportDoc(\'app2\', \'' + escHtml(taskId) + '\')" style="font-size:.78rem;font-weight:700;padding:4px 12px;display:inline-flex;align-items:center;gap:5px" title="Сформировать официальное Приложение № 1 (Заказ-наряд на объект) к договору субподряда">' +
          '📄 Приложение № 1 (Заказ-наряд)' +
        '</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="window.downloadSubcontractDocx(\'' + escHtml(taskId) + '\')" style="font-size:.78rem;font-weight:700;padding:4px 11px;border:1.5px solid #93c5fd;color:#1d4ed8;display:inline-flex;align-items:center;gap:5px" title="Сформировать официальный Договор субподряда (.docx) с Приложениями № 1 и № 2 по форме ООО «Кабельные Системы» / ООО «К10»">' +
          '🤝 Договор субподряда (.docx)' +
        '</button>' +
        '<div class="dropdown" style="position:relative;display:inline-block">' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="window._toggleCardSmrDocsMenu(\'' + escHtml(taskId) + '\')" style="font-size:.78rem;font-weight:600;padding:4px 10px;border:1.5px solid var(--border)">' +
            'Документы ▾' +
          '</button>' +
          '<div id="card_smr_docs_menu_' + escHtml(taskId) + '" style="display:none;position:absolute;left:0;top:100%;margin-top:4px;background:#fff;border:1.5px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:99;min-width:180px;padding:4px 0">' +
            '<div style="padding:6px 12px;font-size:.78rem;cursor:pointer" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._toggleCardSmrDocsMenu(\'' + escHtml(taskId) + '\'); window.exportDoc(\'act\',\'' + escHtml(taskId) + '\',\'' + escHtml(contrName) + '\')">✅ Акт сдачи-приемки (КС-2)</div>' +
            '<div style="padding:6px 12px;font-size:.78rem;cursor:pointer" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._toggleCardSmrDocsMenu(\'' + escHtml(taskId) + '\'); window.exportDoc(\'invoice\',\'' + escHtml(taskId) + '\',\'' + escHtml(contrName) + '\')">💰 Счет на оплату</div>' +
            '<div style="padding:6px 12px;font-size:.78rem;cursor:pointer" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._toggleCardSmrDocsMenu(\'' + escHtml(taskId) + '\'); openAccessLetterModal(\'' + escHtml(taskId) + '\')">🪪 Письмо на допуск</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="font-size:.78rem;color:var(--text-2);font-weight:600">Генподрядчик («Мы»):</span>' +
        ownSelectHtml +
      '</div>' +
    '</div>' +

    '<div style="overflow-x:auto;border:1.5px solid var(--border);border-radius:6px;margin-bottom:14px">' +
      '<table style="width:100%;border-collapse:collapse;text-align:left">' +
        '<thead><tr style="background:var(--bg);font-size:.76rem;color:var(--text-3);border-bottom:1px solid var(--border)">' +
          '<th style="padding:6px 8px;width:35px;text-align:center">№</th>' +
          '<th style="padding:6px 8px">Наименование работы / позиции прайс-листа</th>' +
          '<th style="padding:6px 8px;text-align:center;width:60px">Ед.</th>' +
          '<th style="padding:6px 8px;text-align:center;width:80px">Кол-во</th>' +
          '<th style="padding:6px 8px;text-align:right;width:115px">Цена (₽)</th>' +
          '<th style="padding:6px 8px;text-align:right;width:110px">Стоимость (₽)</th>' +
          '<th style="padding:6px 8px;text-align:center;width:40px"></th>' +
        '</tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
        '<tfoot><tr style="background:var(--bg);font-size:.82rem;font-weight:700;border-top:2px solid var(--border)">' +
          '<td colspan="5" style="padding:8px 10px;text-align:right;color:var(--text-2)">ИТОГО ПО РАБОТАМ:</td>' +
          '<td id="smr_spec_total_' + escHtml(taskId) + '" style="padding:8px;text-align:right;color:var(--text);font-size:.92rem">' + window.fmtMoneyPrecise(taxCalc.totalWithTax) + '</td>' +
          '<td></td>' +
        '</tr></tfoot>' +
      '</table>' +
    '</div>' +
    (function(){
      var defaultSuggs = [
        'Монтаж СКС и линий связи (по прайс-листу подрядчика)',
        'Монтаж кабельных трасс, лотков и кабель-каналов',
        'Прокладка кабеля UTP / FTP (витая пара)',
        'Установка и подключение розеток RJ-45',
        'Установка и сборка телекоммуникационного шкафа 19\"',
        'Кроссировка и маркировка патч-панелей',
        'Тестирование и паспортизация портов СКС (Fluke)',
        'Установка и настройка оборудования (коммутаторы, маршрутизаторы)',
        'Монтаж и юстировка точек доступа Wi-Fi',
        'Монтаж оптического кросса и сварка ВОЛС',
        'Алмазное бурение отверстий в стенах и перекрытиях',
        'Демонтажные работы кабельных линий и оборудования'
      ];
      var usedSet = new Set(defaultSuggs);
      (S.tasks || []).forEach(function(item){
        var arr = (item.rawData && item.rawData.smrSpecification) || [];
        if (Array.isArray(arr)) {
          arr.forEach(function(w){ if(w && w.name && w.name.trim()) usedSet.add(w.name.trim()); });
        }
      });
      return '<datalist id="smr_work_suggestions_' + escHtml(taskId) + '">' +
        Array.from(usedSet).map(function(sug){ return '<option value="' + escHtml(sug) + '"></option>'; }).join('') +
      '</datalist>';
    })() +

    // Лаконичный блок налогообложения и взаиморасчетов (по типу 1С)
    '<div id="smr_tax_calc_box_' + escHtml(taskId) + '" style="border:1.5px solid var(--border);border-radius:8px;background:var(--bg);padding:12px 14px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.03)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:10px">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:1.25rem">🧮</span>' +
          '<div>' +
            '<div style="font-weight:700;font-size:.88rem;color:var(--text);display:flex;align-items:center;gap:6px">' +
              '<span>Налогообложение и взаиморасчеты</span>' +
            '</div>' +
            '<div id="smr_tax_contractor_hint_' + escHtml(taskId) + '" style="font-size:.74rem;color:var(--text-3);margin-top:1px">' +
              'По подрядчику: <b>' + escHtml(contrTaxHint) + '</b>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<span style="font-size:.78rem;font-weight:600;color:var(--text-2)">Режим:</span>' +
            '<select id="smr_tax_mode_' + escHtml(taskId) + '" ' + (!isAccepted ? 'disabled ' : '') + 'onchange="window._onSmrTaxModeChange(\'' + escHtml(taskId) + '\', this.value)" style="padding:4px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem;font-weight:700;background:#fff;color:var(--text)">' +
              taxOptions.map(function(opt){
                return '<option value="' + opt.v + '"' + (curTaxMode === opt.v ? ' selected' : '') + '>' + opt.l + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<label id="smr_tax_included_label_' + escHtml(taskId) + '" style="display:flex;align-items:center;gap:6px;font-size:.8rem;font-weight:600;color:var(--text);cursor:' + (curTaxMode === 'usn' ? 'not-allowed;opacity:.55' : 'pointer') + ';user-select:none">' +
            '<input type="checkbox" id="smr_tax_included_' + escHtml(taskId) + '" ' + (!isAccepted || curTaxMode === 'usn' ? 'disabled ' : '') + (isTaxIncluded ? 'checked ' : '') + 'onchange="window._onSmrTaxIncludedChange(\'' + escHtml(taskId) + '\', this.checked)" style="width:15px;height:15px;cursor:pointer">' +
            '<span>Налог включен в цену</span>' +
          '</label>' +
        '</div>' +
      '</div>' +

      // Карточки итогов по активному режиму
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px;align-items:center">' +
        '<div style="background:#fff;padding:8px 12px;border:1px solid var(--border);border-radius:6px">' +
          '<div style="font-size:.72rem;color:var(--text-3);font-weight:600;text-transform:uppercase">Сумма без налога</div>' +
          '<div id="smr_tax_sum_without_' + escHtml(taskId) + '" style="font-size:1.05rem;font-weight:700;color:var(--text);margin-top:2px">' + window.fmtMoneyPrecise(taxCalc.sumWithoutTax) + '</div>' +
          '<div id="smr_tax_sub_label_' + escHtml(taskId) + '" style="font-size:.68rem;color:var(--text-3)">' + taxCalc.baseNote + '</div>' +
        '</div>' +

        '<div style="background:#fff;padding:8px 12px;border:1px solid var(--border);border-radius:6px">' +
          '<div id="smr_tax_vat_title_' + escHtml(taskId) + '" style="font-size:.72rem;color:var(--text-3);font-weight:600;text-transform:uppercase">' + taxCalc.taxTitle + '</div>' +
          '<div id="smr_tax_vat_amount_' + escHtml(taskId) + '" style="font-size:1.05rem;font-weight:700;color:#7c3aed;margin-top:2px">' + (taxCalc.taxAmount > 0 ? window.fmtMoneyPrecise(taxCalc.taxAmount) : 'Без налога (0 ₽)') + '</div>' +
          '<div id="smr_tax_vat_note_' + escHtml(taskId) + '" style="font-size:.68rem;color:var(--text-3)">' + taxCalc.taxRateNote + '</div>' +
        '</div>' +

        '<div style="background:#f8fafc;padding:8px 12px;border:1.5px solid #cbd5e1;border-radius:6px">' +
          '<div style="font-size:.72rem;color:var(--text-2);font-weight:700;text-transform:uppercase">ИТОГО К ВЫПЛАТЕ ПО РАБОТАМ</div>' +
          '<div id="smr_tax_total_with_' + escHtml(taskId) + '" style="font-size:1.05rem;font-weight:800;color:var(--primary);margin-top:2px">' + window.fmtMoneyPrecise(taxCalc.totalWithTax) + '</div>' +
          '<div style="font-size:.68rem;color:var(--text-3)">с учетом налога / к перечислению</div>' +
        '</div>' +
      '</div>' +

      // Блок округления до целых рублей (компактный: Да / Нет)
      '<div id="smr_round_box_' + escHtml(taskId) + '" style="margin-top:8px;padding:6px 12px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          '<span style="font-size:1rem">🪙</span>' +
          '<span style="font-size:.78rem;font-weight:700;color:var(--text)">Округлить до целых рублей?</span>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center">' +
          '<button type="button" class="btn btn-xs ' + (!taxCalc.isRounded ? 'btn-primary' : 'btn-ghost') + '" onclick="window._setSmrRounding(\'' + escHtml(taskId) + '\', false)" style="padding:2px 14px;font-size:.76rem;font-weight:600" title="' + window.fmtMoneyPrecise(taxCalc.unroundedTotal) + '">Нет</button>' +
          '<button type="button" class="btn btn-xs ' + (taxCalc.isRounded ? 'btn-primary' : 'btn-ghost') + '" onclick="window._setSmrRounding(\'' + escHtml(taskId) + '\', true)" style="padding:2px 14px;font-size:.76rem;font-weight:600" title="' + window.fmtMoney(Math.round(taxCalc.unroundedTotal)) + '">Да</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:8px;padding-top:6px;border-top:1px dashed var(--border)">' +
        '<button type="button" class="btn btn-sm btn-primary" onclick="window.saveAndCreateAgreement(\'' + escHtml(taskId) + '\')" style="font-weight:700;font-size:.82rem;padding:5px 16px;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 4px rgba(37,99,235,0.2)">' +
          '📄 Сохранить и создать соглашение' +
        '</button>' +
      '</div>' +
    '</div>' +

    // Блок дополнительных расходов по объекту (проезд, проживание, бурильщики, вышка, инструмент)
    '<div style="border:1.5px solid #e9d5ff;border-radius:8px;background:#faf5ff;padding:12px;margin-bottom:14px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">' +
        '<div>' +
          '<div style="font-weight:700;font-size:.88rem;color:#581c87;display:flex;align-items:center;gap:6px">' +
            '<span>🚜 Дополнительные расходы по объекту (проезд, проживание, спецтехника, инструмент)</span>' +
            '<span class="badge" style="background:#f3e8ff;color:#7e22ce;border:1px solid #d8b4fe;font-size:.7rem">Доп. расходы</span>' +
          '</div>' +
          '<div style="font-size:.76rem;color:#6b21a8;margin-top:2px">' +
            'Затраты на проезд, проживание, алмазное бурение или автовышку. Укажите плательщика: генподрядчик напрямую («Мы») или через подрядчика СМР.' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">' +
          '<button type="button" class="btn btn-sm btn-ghost" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : 'onclick="window._addThirdPartyLine(\'' + escHtml(taskId) + '\', \'travel\')"') + ' style="color:#6b21a8;border:1px solid #d8b4fe;font-size:.74rem">' +
            '+ Проезд / ГСМ' +
          '</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : 'onclick="window._addThirdPartyLine(\'' + escHtml(taskId) + '\', \'hotel\')"') + ' style="color:#6b21a8;border:1px solid #d8b4fe;font-size:.74rem">' +
            '+ Проживание' +
          '</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : 'onclick="window._addThirdPartyLine(\'' + escHtml(taskId) + '\', \'driller\')"') + ' style="color:#6b21a8;border:1px solid #d8b4fe;font-size:.74rem;font-weight:700">' +
            '+ Алмазное бурение' +
          '</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : 'onclick="window._addThirdPartyLine(\'' + escHtml(taskId) + '\', \'lift\')"') + ' style="color:#6b21a8;border:1px solid #d8b4fe;font-size:.74rem">' +
            '+ Автовышка' +
          '</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : 'onclick="window._addThirdPartyLine(\'' + escHtml(taskId) + '\', \'tools\')"') + ' style="color:#6b21a8;border:1px solid #d8b4fe;font-size:.74rem">' +
            '+ Инструмент' +
          '</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : 'onclick="window._addThirdPartyLine(\'' + escHtml(taskId) + '\', \'custom\')"') + ' style="color:#6b21a8;border:1px solid #d8b4fe;font-size:.74rem">' +
            '+ Произвольный' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div style="overflow-x:auto;border:1px solid #e9d5ff;border-radius:6px;background:#fff">' +
        '<table style="width:100%;border-collapse:collapse;text-align:left">' +
          '<thead><tr style="background:#f5f3ff;font-size:.75rem;color:#6b21a8;border-bottom:1px solid #e9d5ff">' +
            '<th style="padding:6px 8px;width:30px;text-align:center">№</th>' +
            '<th style="padding:6px 8px">Статья расхода</th>' +
            '<th style="padding:6px 8px">Получатель / Исполнитель</th>' +
            '<th style="padding:6px 8px;text-align:center;width:180px">Плательщик</th>' +
            '<th style="padding:6px 8px;text-align:right;width:105px">Сумма (₽)</th>' +
            '<th style="padding:6px 8px;text-align:center;width:35px"></th>' +
          '</tr></thead>' +
          '<tbody>' + tpRowsHtml + '</tbody>' +
          '<tfoot><tr style="background:#f5f3ff;font-size:.8rem;font-weight:700;border-top:1.5px solid #d8b4fe">' +
            '<td colspan="4" style="padding:6px 10px;text-align:right;color:#6b21a8">ИТОГО ДОП. РАСХОДЫ:</td>' +
            '<td id="tp_spec_total_' + escHtml(taskId) + '" style="padding:6px 8px;text-align:right;color:#581c87;font-size:.88rem">' + window.fmtMoneyPrecise(totalThirdPartyAmount) + '</td>' +
            '<td></td>' +
          '</tr></tfoot>' +
        '</table>' +
      '</div>' +
    '</div>' +

    // Кнопка добавления второго/следующего исполнителя СМР (1 ко многим)
    '<div style="margin-bottom:14px;display:flex;justify-content:flex-end">' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="window.addNewSubcontractToTask(\'' + escHtml(taskId) + '\')" style="color:var(--blue);border:1.5px dashed #93c5fd;font-weight:700;font-size:.78rem;padding:6px 14px;display:inline-flex;align-items:center;gap:6px">' +
        '<span>➕ Добавить второго исполнителя на объект (Спецработы / ВОЛС / СМР)</span>' +
      '</button>' +
    '</div>' +

    // Финансовый баланс по заявке (терминология: Заказчик → Генподрядчик («Мы») → Подрядчик СМР + Доп. расходы)
    '<div style="background:#f8fafc;border:1.5px solid var(--border);border-radius:8px;padding:12px 16px">' +
      '<div style="font-size:.74rem;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:8px">' +
        '📊 Финансовый баланс по объекту (Заказчик → Мы → Подрядчик / Расходы):' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px;margin-bottom:12px">' +
        '<div style="background:#fff;border:1.5px solid var(--border);border-radius:6px;padding:8px 12px">' +
          '<div style="font-size:.72rem;color:var(--text-3);font-weight:600">📥 ВХОД ОТ ЗАКАЗЧИКА (Платят нам)</div>' +
          '<div id="smr_balance_cust_' + escHtml(taskId) + '" style="font-size:1.1rem;font-weight:800;color:var(--text);margin-top:2px">' + window.fmtMoneyPrecise(custAmount) + '</div>' +
          '<div style="font-size:.7rem;color:var(--text-2);margin-top:1px">' + escHtml(t.customer || 'Заказчик') + '</div>' +
        '</div>' +
        '<div style="background:#fff;border:1.5px solid var(--border);border-radius:6px;padding:8px 12px">' +
          '<div style="font-size:.72rem;color:#b45309;font-weight:600">📤 РАСХОД: ПОДРЯДЧИК (СМР)</div>' +
          '<div id="smr_balance_sub_' + escHtml(taskId) + '" style="font-size:1.1rem;font-weight:800;color:#b45309;margin-top:2px">' + window.fmtMoneyPrecise(taxCalc.totalWithTax) + '</div>' +
          '<div id="smr_balance_sub_note_' + escHtml(taskId) + '" style="font-size:.7rem;color:var(--text-2);margin-top:1px">' + escHtml(contrName || 'Исполнитель СМР') + (taxCalc.taxAmount > 0 ? (' · ' + taxCalc.taxTitle + ': ' + window.fmtMoneyPrecise(taxCalc.taxAmount)) : ' · Без НДС') + '</div>' +
        '</div>' +
        '<div style="background:#fff;border:1.5px solid var(--border);border-radius:6px;padding:8px 12px">' +
          '<div style="font-size:.72rem;color:#6b21a8;font-weight:600">📤 ДОП. РАСХОДЫ ПО ОБЪЕКТУ</div>' +
          '<div id="smr_balance_tp_' + escHtml(taskId) + '" style="font-size:1.1rem;font-weight:800;color:#6b21a8;margin-top:2px">' + window.fmtMoneyPrecise(totalThirdPartyAmount) + '</div>' +
          '<div id="smr_balance_tp_note_' + escHtml(taskId) + '" style="font-size:.7rem;color:var(--text-2);margin-top:1px">' + escHtml(thirdPartyPaymentNote) + '</div>' +
        '</div>' +
        '<div id="smr_balance_margin_box_' + escHtml(taskId) + '" style="background:' + (netMargin >= 0 ? '#f0fdf4' : '#fef2f2') + ';border:1.5px solid ' + (netMargin >= 0 ? '#86efac' : '#fca5a5') + ';border-radius:6px;padding:8px 12px">' +
          '<div style="font-size:.72rem;color:' + (netMargin >= 0 ? '#166534' : '#991b1b') + ';font-weight:700">💰 ОПЕРАЦИОННЫЙ ОСТАТОК (ДО ВЫЧЕТА ТМЦ)</div>' +
          '<div id="smr_balance_margin_' + escHtml(taskId) + '" style="font-size:1.15rem;font-weight:900;color:' + (netMargin >= 0 ? '#16a34a' : '#dc2626') + ';margin-top:2px">' + window.fmtMoneyPrecise(netMargin) + ' <span style="font-size:.8rem;font-weight:700">(' + netMarginPct + '%)</span></div>' +
          '<div style="font-size:.7rem;color:' + (netMargin >= 0 ? '#15803d' : '#b91c1c') + ';margin-top:1px">' + escHtml(curOwnName) + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;align-items:center">' +
        '<button type="button" class="btn btn-sm btn-primary" id="save_smr_spec_btn" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : 'onclick="window._saveCardSmrSpec(\'' + escHtml(taskId) + '\')"') + ' style="padding:6px 16px;font-weight:700">' +
          '💾 Сохранить изменения' +
        '</button>' +
      '</div>' +
    '</div>';
  };

  // Мгновенный пересчет сумм и финансового баланса без перерисовки DOM (сохраняет фокус ввода)
  window._refreshSmrCalculations = function(taskId) {
    var spec = (window._taskSmrSpec && window._taskSmrSpec[taskId]) || [];
    var thirdParty = (window._taskThirdPartySpec && window._taskThirdPartySpec[taskId]) || [];
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    window._curWizTask = t;

    var totalSubAmount = 0;
    spec.forEach(function(l) {
      totalSubAmount += Math.round((Number(l.qty) || 0) * (Number(l.price) || 0) * 100) / 100;
    });
    totalSubAmount = Math.round(totalSubAmount * 100) / 100;

    var totalThirdPartyAmount = 0;
    var thirdPartyDirectSum = 0;
    thirdParty.forEach(function(tp) {
      var s = Math.round((Number(tp.amount) || 0) * 100) / 100;
      totalThirdPartyAmount += s;
      if (tp.payment_type === 'direct') thirdPartyDirectSum += s;
    });
    totalThirdPartyAmount = Math.round(totalThirdPartyAmount * 100) / 100;
    thirdPartyDirectSum = Math.round(thirdPartyDirectSum * 100) / 100;

    var taxCfg = window._getTaskSmrTaxConfig(taskId);
    var taxCalc = window._calculateSmrTaxes(totalSubAmount, taxCfg.mode, taxCfg.included, taskId);

    var custAmount = Number(t.amount || 0);
    var totalOutflow = Math.round((taxCalc.totalWithTax + totalThirdPartyAmount) * 100) / 100;
    var netMargin = custAmount > 0 ? (Math.round((custAmount - totalOutflow) * 100) / 100) : 0;
    var netMarginPct = custAmount > 0 ? Math.round((netMargin / custAmount) * 100) : 0;

    var curSub = (window._curCardSubcontracts || []).find(function(s){ return String(s.task_id) === String(taskId); }) || null;
    var contrName = (t.contractor && t.contractor.trim()) || (curSub && curSub.contractor_name) || '';

    var elSubTotal = document.getElementById('smr_spec_total_' + taskId);
    if (elSubTotal) elSubTotal.textContent = window.fmtMoneyPrecise(taxCalc.totalWithTax);

    var elTaxWithout = document.getElementById('smr_tax_sum_without_' + taskId);
    if (elTaxWithout) elTaxWithout.textContent = window.fmtMoneyPrecise(taxCalc.sumWithoutTax);

    var elTaxVatTitle = document.getElementById('smr_tax_vat_title_' + taskId);
    if (elTaxVatTitle) elTaxVatTitle.textContent = taxCalc.taxTitle;

    var elTaxVatAmount = document.getElementById('smr_tax_vat_amount_' + taskId);
    if (elTaxVatAmount) elTaxVatAmount.textContent = taxCalc.taxAmount > 0 ? window.fmtMoneyPrecise(taxCalc.taxAmount) : 'Без налога (0 ₽)';

    var elTaxVatNote = document.getElementById('smr_tax_vat_note_' + taskId);
    if (elTaxVatNote) elTaxVatNote.textContent = taxCalc.taxRateNote;

    var elTaxBaseNote = document.getElementById('smr_tax_sub_label_' + taskId);
    if (elTaxBaseNote) elTaxBaseNote.textContent = taxCalc.baseNote;

    var elTaxTotalWith = document.getElementById('smr_tax_total_with_' + taskId);
    if (elTaxTotalWith) elTaxTotalWith.textContent = window.fmtMoneyPrecise(taxCalc.totalWithTax);

    var elTpTotal = document.getElementById('tp_spec_total_' + taskId);
    if (elTpTotal) elTpTotal.textContent = window.fmtMoneyPrecise(totalThirdPartyAmount);

    var elBalSub = document.getElementById('smr_balance_sub_' + taskId);
    if (elBalSub) elBalSub.textContent = window.fmtMoneyPrecise(taxCalc.totalWithTax);

    var elBalSubNote = document.getElementById('smr_balance_sub_note_' + taskId);
    if (elBalSubNote) {
      elBalSubNote.textContent = (contrName || 'Исполнитель СМР') + (taxCalc.taxAmount > 0 ? (' · ' + taxCalc.taxTitle + ': ' + window.fmtMoneyPrecise(taxCalc.taxAmount)) : ' · Без НДС');
    }

    var elBalTp = document.getElementById('smr_balance_tp_' + taskId);
    if (elBalTp) elBalTp.textContent = window.fmtMoneyPrecise(totalThirdPartyAmount);

    var elBalTpNote = document.getElementById('smr_balance_tp_note_' + taskId);
    if (elBalTpNote) {
      elBalTpNote.textContent = totalThirdPartyAmount > 0
        ? (thirdPartyDirectSum > 0 ? ('В т.ч. напрямую от Нас: ' + window.fmtMoneyPrecise(thirdPartyDirectSum)) : 'Через основного подрядчика')
        : 'Нет затрат';
    }

    var elBalMargin = document.getElementById('smr_balance_margin_' + taskId);
    if (elBalMargin) {
      elBalMargin.innerHTML = window.fmtMoneyPrecise(netMargin) + ' <span style="font-size:.8rem;font-weight:700">(' + netMarginPct + '%)</span>';
      elBalMargin.style.color = netMargin >= 0 ? '#16a34a' : '#dc2626';
    }

    var elBalBox = document.getElementById('smr_balance_margin_box_' + taskId);
    if (elBalBox) {
      elBalBox.style.background = netMargin >= 0 ? '#f0fdf4' : '#fef2f2';
      elBalBox.style.borderColor = netMargin >= 0 ? '#86efac' : '#fca5a5';
    }

    var elRoundBox = document.getElementById('smr_round_box_' + taskId);
    if (elRoundBox) {
      elRoundBox.innerHTML = 
        '<div style="display:flex;align-items:center;gap:6px">' +
          '<span style="font-size:1rem">🪙</span>' +
          '<span style="font-size:.78rem;font-weight:700;color:var(--text)">Округлить до целых рублей?</span>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center">' +
          '<button type="button" class="btn btn-xs ' + (!taxCalc.isRounded ? 'btn-primary' : 'btn-ghost') + '" onclick="window._setSmrRounding(\'' + escHtml(taskId) + '\', false)" style="padding:2px 14px;font-size:.76rem;font-weight:600" title="' + window.fmtMoneyPrecise(taxCalc.unroundedTotal) + '">Нет</button>' +
          '<button type="button" class="btn btn-xs ' + (taxCalc.isRounded ? 'btn-primary' : 'btn-ghost') + '" onclick="window._setSmrRounding(\'' + escHtml(taskId) + '\', true)" style="padding:2px 14px;font-size:.76rem;font-weight:600" title="' + window.fmtMoney(Math.round(taxCalc.unroundedTotal)) + '">Да</button>' +
        '</div>';
    }


  };

  window._toggleSmrAddMenu = function(taskId) {
    var m = document.getElementById('smr_add_menu_' + taskId);
    if (!m) return;
    if (m.style.display !== 'none') {
      m.style.display = 'none';
      return;
    }
    m.style.display = 'block';

    if (!window._cachedSubcontractPriceLists) {
      m.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text-3);font-size:.78rem">Загрузка позиций из прайсов субподряда...</div>';
      api('/subcontract-pricelists').then(function(lists) {
        window._cachedSubcontractPriceLists = Array.isArray(lists) ? lists : [];
        window._renderSmrAddMenuItems(taskId);
      }).catch(function() {
        window._cachedSubcontractPriceLists = [];
        window._renderSmrAddMenuItems(taskId);
      });
    } else {
      window._renderSmrAddMenuItems(taskId);
    }
  };

  window._renderSmrAddMenuItems = function(taskId, filterQ) {
    var m = document.getElementById('smr_add_menu_' + taskId);
    if (!m) return;
    var q = (filterQ || '').toLowerCase().trim();

    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    var contrName = t.contractor || (t.subcontract && t.subcontract.contractor_name) || '';

    // Собираем все позиции из загруженных прайсов субподряда
    var allItems = [];
    var priceLists = window._cachedSubcontractPriceLists || [];
    priceLists.forEach(function(pl) {
      if (Array.isArray(pl.items)) {
        pl.items.forEach(function(it) {
          allItems.push({
            name: it.name,
            unit: it.unit || 'шт',
            price: Number(it.price) || 0,
            category: it.category || pl.name,
            price_list_name: pl.name
          });
        });
      }
    });

    // Дефолтный каталог (если прайсы еще пусты)
    if (!allItems.length) {
      allItems = [
        { name: 'Монтаж напольного ТКШ 42-48U', unit: 'шт', price: 10000, category: 'Шкафы ТКШ' },
        { name: 'Монтаж напольного ТКШ 32U', unit: 'шт', price: 8000, category: 'Шкафы ТКШ' },
        { name: 'Монтаж навесного ТКШ 18-22U', unit: 'шт', price: 6500, category: 'Шкафы ТКШ' },
        { name: 'Замена ТКШ с переносом', unit: 'шт', price: 10000, category: 'Шкафы ТКШ' },
        { name: 'Монтаж порта СКС кат. 5е', unit: 'порт', price: 2500, category: 'СКС и Оптика' },
        { name: 'Монтаж порта СКС кат. 6/6А', unit: 'порт', price: 3000, category: 'СКС и Оптика' },
        { name: 'Оптический порт (дуплекс) OS2/OM3', unit: 'порт', price: 3000, category: 'СКС и Оптика' },
        { name: 'Прокладка витой пары UTP 4 пары', unit: 'м', price: 50, category: 'СКС и Оптика' },
        { name: 'Установка розетки RJ-45 с расключением', unit: 'шт', price: 350, category: 'СКС и Оптика' },
        { name: 'Монтаж кабель-канала до 40мм', unit: 'м', price: 120, category: 'СКС и Оптика' },
        { name: 'Монтаж и расшивка патч-панели 24 порта', unit: 'шт', price: 2500, category: 'СКС и Оптика' },
        { name: 'Тестирование и маркировка портов (Fluke)', unit: 'порт', price: 150, category: 'Пусконаладка' },
        { name: 'Транспортные расходы (свыше 10 км)', unit: 'км', price: 12, category: 'Транспорт' },
        { name: 'Суточные расходы монтажника (день)', unit: 'день', price: 700, category: 'Транспорт' },
        { name: 'Проживание в гостинице / найм жилья', unit: 'сут', price: 2500, category: 'Транспорт' }
      ];
    }

    if (q) {
      allItems = allItems.filter(function(it) {
        return (it.name || '').toLowerCase().includes(q) || (it.category || '').toLowerCase().includes(q);
      });
    }

    var byCategory = {};
    allItems.forEach(function(it) {
      var cat = it.category || 'Прочее';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(it);
    });

    var groupsHtml = Object.keys(byCategory).map(function(cat) {
      var catItems = byCategory[cat];
      return '<div style="font-size:.72rem;font-weight:700;color:var(--text-3);padding:4px 8px;text-transform:uppercase;background:#f8fafc;border-radius:4px;margin-top:4px">' + escHtml(cat) + '</div>' +
        catItems.map(function(it) {
          return '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f1f5f9" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', null, { name: \'' + escHtml(it.name).replace(/'/g, "\\'") + '\', unit: \'' + escHtml(it.unit).replace(/'/g, "\\'") + '\', price: ' + it.price + ' }); document.getElementById(\'smr_add_menu_' + escHtml(taskId) + '\').style.display=\'none\'">' +
            '<span style="font-weight:600;color:var(--text)">' + escHtml(it.name) + '</span>' +
            '<span style="font-weight:700;color:var(--primary);margin-left:8px;white-space:nowrap">' + fmtMoney(it.price) + ' / ' + escHtml(it.unit) + '</span>' +
          '</div>';
        }).join('');
    }).join('');

    m.innerHTML = '<div style="padding:6px;border-bottom:1px solid var(--border);margin-bottom:4px;display:flex;gap:6px">' +
      '<input type="text" placeholder="🔍 Поиск по позициям прайса..." value="' + escHtml(filterQ || '') + '" oninput="window._renderSmrAddMenuItems(\'' + escHtml(taskId) + '\', this.value)" style="flex:1;padding:4px 8px;font-size:.78rem;border:1px solid var(--border);border-radius:4px" autofocus>' +
      '<button type="button" class="btn btn-xs btn-ghost" onclick="window.openQuickSubcontractCreateModal(\'' + escHtml(taskId) + '\',\'' + escHtml(contrName) + '\')" style="font-size:.74rem;white-space:nowrap;color:var(--green);font-weight:700" title="Создать новый прайс субподряда">+ Создать прайс</button>' +
    '</div>' +
    '<div style="max-height:300px;overflow-y:auto">' + (groupsHtml || '<div style="padding:10px;text-align:center;color:var(--text-3);font-size:.78rem">Ничего не найдено</div>') + '</div>';
  };

  window._updateCardSmrLine = function(taskId, idx, field, val) {
    var spec = window._taskSmrSpec && window._taskSmrSpec[taskId];
    if (!spec || !spec[idx]) return;
    if (field === 'qty') {
      spec[idx].qty = Math.max(0, parseFloat(val) || 0);

      // Динамический пересчет тарифа для портов СКС 5е (1-3 шт -> 3000 ₽, >3 шт -> 2500 ₽)
      var lineName = (spec[idx].name || '').toLowerCase();
      if (lineName.includes('порт') && (lineName.includes('5e') || lineName.includes('5е') || lineName.includes('скс'))) {
        var newPrice = spec[idx].qty > 3 ? 2500 : 3000;
        spec[idx].price = newPrice;
        var pInp = document.getElementById('smr_row_price_inp_' + taskId + '_' + idx);
        if (pInp && document.activeElement !== pInp) pInp.value = newPrice;
      }

      spec[idx].sum = Math.round(spec[idx].qty * spec[idx].price * 100) / 100;
      var sumEl = document.getElementById('smr_row_sum_' + taskId + '_' + idx);
      if (sumEl) sumEl.textContent = window.fmtMoneyPrecise(spec[idx].sum);
      window._refreshSmrCalculations(taskId);
    } else if (field === 'price') {
      spec[idx].price = Math.max(0, parseFloat(val) || 0);
      spec[idx].sum = Math.round(spec[idx].qty * spec[idx].price * 100) / 100;
      var sumEl = document.getElementById('smr_row_sum_' + taskId + '_' + idx);
      if (sumEl) sumEl.textContent = window.fmtMoneyPrecise(spec[idx].sum);
      window._refreshSmrCalculations(taskId);
    } else if (field === 'name') {
      spec[idx].name = String(val || '');
    } else if (field === 'unit') {
      spec[idx].unit = String(val || '');
    }
    if (typeof window._markSmrDirty === 'function') window._markSmrDirty(taskId);
  };

  window._addCustomCardSmrLine = function(taskId) {
    window._taskSmrSpec = window._taskSmrSpec || {};
    if (!window._taskSmrSpec[taskId]) window._taskSmrSpec[taskId] = [];
    window._taskSmrSpec[taskId].push({
      name: '',
      unit: 'шт',
      qty: 1,
      price: 0,
      sum: 0
    });
    if (typeof window._markSmrDirty === 'function') window._markSmrDirty(taskId);
    window._renderCardSmrTable(taskId);
  };

  window._removeCardSmrLine = function(taskId, idx) {
    var spec = window._taskSmrSpec && window._taskSmrSpec[taskId];
    if (!spec) return;
    spec.splice(idx, 1);
    if (typeof window._markSmrDirty === 'function') window._markSmrDirty(taskId);
    window._renderCardSmrTable(taskId);
  };

  window._addCardSmrLine = function(taskId, itemKey, customObj) {
    window._taskSmrSpec = window._taskSmrSpec || {};
    if (!window._taskSmrSpec[taskId]) window._taskSmrSpec[taskId] = [];
    var spec = window._taskSmrSpec[taskId];
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    window._curWizTask = t;

    if (customObj) {
      spec.push({
        name: customObj.name,
        qty: Number(customObj.qty) || 1,
        unit: customObj.unit || 'шт',
        price: Number(customObj.price) || 0,
        sum: Math.round((Number(customObj.qty) || 1) * (Number(customObj.price) || 0) * 100) / 100
      });
      if (typeof window._markSmrDirty === 'function') window._markSmrDirty(taskId);
      window._renderCardSmrTable(taskId);
      return;
    }

    var catalog = {
      // Шкафы ТКШ
      tksh_42u: { name: 'Монтаж напольного ТКШ 42-48U', qty: 1, unit: 'шт', price: 10000 },
      tksh_32u: { name: 'Монтаж напольного ТКШ 32U', qty: 1, unit: 'шт', price: 8000 },
      tksh_18u: { name: 'Монтаж навесного ТКШ 18-22U', qty: 1, unit: 'шт', price: 6500 },
      tksh_swap: { name: 'Замена ТКШ с перемонтажом оборудования', qty: 1, unit: 'шт', price: 10000 },
      tksh_reterminate: { name: 'Перешивка портов при замене ТКШ (за порт)', qty: 10, unit: 'порт', price: 500 },
      tksh_demount_42u: { name: 'Демонтаж напольного ТКШ 42U', qty: 1, unit: 'шт', price: 7000 },
      tksh_demount_18u: { name: 'Демонтаж навесного ТКШ до 22U', qty: 1, unit: 'шт', price: 5000 },
      tksh_mod_600: { name: 'Модернизация шкафа 600мм', qty: 1, unit: 'шт', price: 3000 },
      // СКС и Оптика
      port_5e: { name: 'Монтаж порта СКС кат. 5е', qty: 1, unit: 'порт', price: 3000 },
      port_6: { name: 'Монтаж порта СКС кат. 6/6А', qty: 1, unit: 'порт', price: 3000 },
      port_optics: { name: 'Монтаж оптического порта (дуплекс) OS2/OM3', qty: 2, unit: 'порт', price: 3000 },
      port_reinstall: { name: 'Демонтаж с последующим монтажом за порт', qty: 1, unit: 'порт', price: 1000 },
      port_move: { name: 'Перемещение/восстановление портов', qty: 1, unit: 'порт', price: 1500 },
      cable_utp: { name: 'Прокладка кабеля UTP витая пара', qty: 50, unit: 'м', price: 50 },
      socket_rj45: { name: 'Установка розетки RJ-45 с расключением', qty: 2, unit: 'шт', price: 350 },
      cable_duct: { name: 'Монтаж кабель-канала до 40мм', qty: 10, unit: 'м', price: 120 },
      patch_panel: { name: 'Монтаж и расшивка патч-панели 24 порта', qty: 1, unit: 'шт', price: 2500 },
      fluke_test: { name: 'Тестирование и маркировка портов (Fluke)', qty: 10, unit: 'порт', price: 150 },
      // Транспорт и командировочные расходы (по прайсу ТЗ)
      travel_city: { name: 'Выезд внутри города (<10 км)', qty: 1, unit: 'выезд', price: 300 },
      travel_km: { name: 'Транспортные расходы (компенсация авто свыше 10 км)', qty: Math.max(1, Math.round(parseFloat(t.distance_km || 0) > 10 ? (parseFloat(t.distance_km || 0) - 10) : 50)), unit: 'км', price: 12 },
      travel_daily: { name: 'Суточные расходы монтажника (700 ₽/день)', qty: 2, unit: 'день', price: 700 },
      travel_hotel: { name: 'Проживание в гостинице / найм жилья', qty: 2, unit: 'сут', price: 2500 },
      travel_delivery: { name: 'Доставка оборудования и материалов на объект', qty: 1, unit: 'рейс', price: 2000 },
      repeat_visit: { name: 'Повторный выезд на объект', qty: 1, unit: 'выезд', price: 3000 },
      custom: { name: 'Дополнительные работы по согласованию', qty: 1, unit: 'усл', price: 5000 }
    };

    var item = catalog[itemKey] || catalog.custom;
    spec.push({
      name: item.name,
      qty: item.qty,
      unit: item.unit,
      price: item.price,
      sum: item.qty * item.price
    });
    var menu = document.getElementById('smr_add_menu_' + taskId);
    if (menu) menu.style.display = 'none';
    if (typeof window._markSmrDirty === 'function') window._markSmrDirty(taskId);
    window._renderCardSmrTable(taskId);
  };

  window._onSmrOwnCompanyChange = function(taskId, ownCompanyId) {
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); });
    if (t) t.own_company_id = Number(ownCompanyId);
    if (typeof window._markSmrDirty === 'function') window._markSmrDirty(taskId);
    window.renderCardSmrCalculator(taskId);
  };

  window._saveCardSmrSpec = function(taskId, options) {
    options = options || {};
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); });
    if (!t) return Promise.resolve();
    var spec = window._taskSmrSpec && window._taskSmrSpec[taskId] ? window._taskSmrSpec[taskId] : [];
    var totalBaseAmount = spec.reduce(function(acc, l){ return acc + (Number(l.sum) || 0); }, 0);
    var thirdParty = window._taskThirdPartySpec && window._taskThirdPartySpec[taskId] ? window._taskThirdPartySpec[taskId] : [];

    var taxCfg = window._getTaskSmrTaxConfig(taskId);
    var taxCalc = window._calculateSmrTaxes(totalBaseAmount, taxCfg.mode, taxCfg.included, taskId);

    var activeIdx = (window._activeSubcontractIdx && window._activeSubcontractIdx[taskId]) || 0;
    var curSub = (window._curCardSubcontracts || [])[activeIdx] || (window._curCardSubcontracts || [])[0] || null;
    var cName = (curSub && curSub.contractor_name) || t.contractor || '';
    if (!cName) {
      if (!options.silent) alert('Пожалуйста, сначала назначьте исполнителя СМР (подрядчика)!');
      return Promise.resolve();
    }

    var cObj = (S.contractors || []).find(function(c){ return c.name_short === cName; });
    var ownId = (curSub && curSub.own_company_id) || t.own_company_id || (t.customer && t.customer.toLowerCase().includes('сбер') ? 2 : 1);
    var ports = 0;
    spec.forEach(function(l){
      if (l.name && l.name.toLowerCase().includes('порт')) ports += (Number(l.qty) || 0);
    });

    var payload = {
      subcontract_id: curSub ? curSub.id : null,
      contractor_id: (curSub && curSub.contractor_id) || (cObj ? cObj.id : null),
      contractor_name: cName,
      own_company_id: ownId,
      contractor_contract_id: (curSub && curSub.contractor_contract_id) || null,
      price_list_id: (curSub && curSub.price_list_id) || null,
      agreement_number: (curSub && curSub.agreement_number) || 'Приложение № 1 (Соглашение о договорной цене)',
      agreement_date: (curSub && curSub.agreement_date) || new Date().toISOString().slice(0, 10),
      work_type: t.work_type || 'Монтаж СКС',
      price_agreed: taxCalc.totalWithTax,
      deadline: t.deadline || null,
      calculation_details: { 
        lines: spec,
        third_party_lines: thirdParty,
        tax_details: taxCalc
      },
      ports_count: ports || parseInt(t.fact || t.in_order || 0, 10),
      distance_km: parseFloat(t.distance_km || 0)
    };

    var btn = document.getElementById('save_smr_spec_btn');
    if (btn && !options.silent) { btn.disabled = true; btn.textContent = 'Сохранение…'; }

    return api('/tasks/' + encodeURIComponent(taskId) + '/subcontract-wizard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function(res) {
      if (!options.silent && typeof showToast === 'function') showToast('✅ Спецификация и расчет СМР сохранены!', 'success');
      t.price_agreed = taxCalc.totalWithTax;
      t.rawData = t.rawData || {};
      t.rawData.smrTaxDetails = taxCalc;
      if (res && res.subcontract) {
        if (!window._curCardSubcontracts) window._curCardSubcontracts = [];
        var exIdx = window._curCardSubcontracts.findIndex(function(s){ return s.id === res.subcontract.id; });
        if (exIdx >= 0) window._curCardSubcontracts[exIdx] = res.subcontract;
        else window._curCardSubcontracts.unshift(res.subcontract);
      }
      return res;
    })
    .catch(function(err) {
      console.error('Error saving smr spec:', err);
      if (!options.silent) alert('Ошибка сохранения сметы: ' + err.message);
      throw err;
    })
    .finally(function() {
      if (btn && !options.silent) { btn.disabled = false; btn.textContent = '💾 Сохранить изменения'; }
    });
  };

  // 4. КОНСТРУКТОР-WIZARD НАЗНАЧЕНИЯ ПОДРЯДЧИКА
  window.openSubcontractWizardModal = function(taskId, editSubId) {
    var old = document.getElementById('_subcontract_wizard_modal');
    if (old) old.remove();

    var targetId = (typeof S !== 'undefined' && S.page === 'kanban') ? ('kcard_' + taskId) : ('task_row_' + taskId);
    if (window.savePageScroll) window.savePageScroll(targetId);

    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    window._curWizTask = t;
    var editSub = editSubId ? ((window._curCardSubcontracts || []).find(function(s){ return String(s.id) === String(editSubId); }) || null) : null;

    var subsList = (S.contractors || []).filter(function(c) {
      if (!c || !c.name_short) return false;
      if (c.type === 'customer') return false;
      if (String(c.inn || '').startsWith('CUST-')) return false;
      return true;
    }).sort(function(a, b) {
      return (a.name_short || '').localeCompare(b.name_short || '', 'ru');
    });

    // Определяем начального подрядчика
    var initialCId = '';
    var initialCName = '';
    var initialCInn = '';

    if (editSub && editSub.contractor_id) {
      initialCId = String(editSub.contractor_id);
      initialCName = editSub.contractor_name || '';
      initialCInn = editSub.contractor_inn || '';
    } else if (t.contractor) {
      var matchC = subsList.find(function(c){ return c.name_short.trim().toLowerCase() === t.contractor.trim().toLowerCase(); });
      if (matchC) {
        initialCId = String(matchC.id);
        initialCName = matchC.name_short;
        initialCInn = matchC.inn || '';
      }
    }

    var defaultPorts = parseInt(t.fact || t.in_order || 0, 10) || 1;
    var defaultKm = parseFloat(t.distance_km || 0) || 0;

    var modal = document.createElement('div');
    modal.id = '_subcontract_wizard_modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal-box" style="max-width:680px;width:95%;max-height:90vh;overflow-y:auto">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;border-bottom:1.5px solid var(--border);padding-bottom:.75rem">' +
        '<div>' +
          '<h3 style="margin:0;font-size:1.15rem;display:flex;align-items:center;gap:6px">' +
            '<span>🤝 Конструктор поручения подрядчику</span>' +
          '</h3>' +
          '<div style="font-size:.78rem;color:var(--text-3);margin-top:2px">Заявка № <b>' + escHtml(taskId) + '</b> • ' + escHtml(t.address || t.region || '') + '</div>' +
        '</div>' +
        '<button class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_subcontract_wizard_modal\').remove()">✕</button>' +
      '</div>' +

      // ШАГ 1: ВЫБОР ПОДРЯДЧИКА
      '<div class="card p" style="margin-bottom:10px;background:#f8fafc;border:1px solid var(--border)">' +
        '<div style="font-weight:700;font-size:.85rem;color:var(--text);margin-bottom:6px">Шаг 1. Организация / Исполнитель СМР *</div>' +
        '<input type="hidden" id="wiz_contractor_id" value="' + escHtml(initialCId) + '">' +
        '<input type="hidden" id="wiz_contractor_name" value="' + escHtml(initialCName) + '">' +

        '<div id="wiz_c_selected_box" style="display:' + (initialCName ? 'flex' : 'none') + ';align-items:center;justify-content:space-between;padding:8px 12px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px">' +
          '<div>' +
            '<div style="font-weight:700;color:#166534;font-size:.9rem">🏢 <span id="wiz_selected_c_name">' + escHtml(initialCName) + '</span></div>' +
            '<div style="font-size:.76rem;color:#15803d">ИНН: <span id="wiz_selected_c_inn">' + escHtml(initialCInn || '—') + '</span></div>' +
          '</div>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="window._wizClearContractor()" style="font-size:.78rem;color:#166534">Сменить ✕</button>' +
        '</div>' +

        '<div id="wiz_c_picker_box" style="display:' + (initialCName ? 'none' : 'block') + '">' +
          '<input type="text" id="wiz_c_search" placeholder="🔍 Начните вводить название (Хомич, Елагин...) или ИНН..." style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;margin-bottom:6px" oninput="window._wizFilterContractors(this.value)">' +
          '<div id="wiz_contractors_list" style="max-height:130px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;background:#fff"></div>' +
        '</div>' +
      '</div>' +

      // ШАГ 2: ПРОВЕРКА ДОГОВОРА И ПРАЙС-ЛИСТА (СЕРДЦЕ ЛОГИКИ АЛЕКСЕЯ)
      '<div id="wiz_step2_container" style="display:' + (initialCId ? 'block' : 'none') + ';margin-bottom:10px">' +
        '<div class="card p" style="border:1.5px solid var(--border);background:#fff">' +
          '<div style="font-weight:700;font-size:.85rem;color:var(--text);margin-bottom:8px">Шаг 2. Договор, Собственное юрлицо и расчет цен</div>' +
          '<div id="wiz_contracts_loading" class="t3" style="font-size:.8rem">Проверка договоров и прайсов подрядчика…</div>' +
          '<div id="wiz_contracts_body"></div>' +
        '</div>' +
      '</div>' +

      // ШАГ 3: МОНТАЖНИК, АВТО И ДЕДЛАЙН
      '<div id="wiz_step3_container" style="display:' + (initialCId ? 'block' : 'none') + ';margin-bottom:12px">' +
        '<div class="card p" style="border:1.5px solid var(--border);background:#fff">' +
          '<div style="font-weight:700;font-size:.85rem;color:var(--text);margin-bottom:8px">Шаг 3. Данные монтажника на объекте (для Заказ-наряда и Допуска)</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">' +
            '<div>' +
              '<label style="display:block;font-size:.74rem;color:var(--text-3);margin-bottom:2px">Специалист из базы</label>' +
              '<select id="wiz_spec_select" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem" onchange="window._wizOnSpecialistSelect(this.value)">' +
                '<option value="">-- Выберите монтажника --</option>' +
                (S.specialists || []).map(function(sp) {
                  return '<option value="' + sp.id + '">' + escHtml(sp.full_name) + (sp.phone ? ' (' + sp.phone + ')' : '') + '</option>';
                }).join('') +
              '</select>' +
              '<input type="hidden" id="wiz_specialist_id" value="">' +
            '</div>' +
            '<div>' +
              '<label style="display:block;font-size:.74rem;color:var(--text-3);margin-bottom:2px">ФИО монтажника (ручной ввод / уточнение) *</label>' +
              '<input type="text" id="wiz_installer_fio" placeholder="Хомич Александр Иванович" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem">' +
            '</div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:8px">' +
            '<div>' +
              '<label style="display:block;font-size:.74rem;color:var(--text-3);margin-bottom:2px">Телефон</label>' +
              '<input type="text" id="wiz_installer_phone" placeholder="+7..." style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
            '</div>' +
            '<div>' +
              '<label style="display:block;font-size:.74rem;color:var(--text-3);margin-bottom:2px">Паспорт</label>' +
              '<input type="text" id="wiz_installer_pass" placeholder="Серия, номер, кем выдан" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
            '</div>' +
            '<div>' +
              '<label style="display:block;font-size:.74rem;color:var(--text-3);margin-bottom:2px">Госномер авто</label>' +
              '<input type="text" id="wiz_installer_auto" placeholder="х777хх 178" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
            '</div>' +
            '<div>' +
              '<label style="display:block;font-size:.74rem;color:var(--text-3);margin-bottom:2px">Срок (дедлайн)</label>' +
              '<input type="date" id="wiz_deadline" value="' + (t.deadline ? String(t.deadline).slice(0, 10) : '') + '" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // КНОПКИ ДЕЙСТВИЯ
      '<div style="display:flex;justify-content:space-between;align-items:center;border-top:1.5px solid var(--border);padding-top:12px">' +
        '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'_subcontract_wizard_modal\').remove()">Отмена</button>' +
        '<button type="button" class="btn btn-primary" id="wiz_save_btn" onclick="window._wizSubmit(\'' + escHtml(taskId) + '\')" style="padding:8px 18px;font-weight:700">' +
          '✓ Подтвердить и сформировать поручение' +
        '</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    if (initialCId) {
      window._wizLoadContractorData(initialCId, taskId);
    } else {
      window._wizFilterContractors('');
    }
  };

  // Фильтр подрядчиков в модалке
  window._wizFilterContractors = function(q) {
    var query = (q || '').trim().toLowerCase();
    var listEl = document.getElementById('wiz_contractors_list');
    if (!listEl) return;

    var subsList = (S.contractors || []).filter(function(c) {
      if (!c || !c.name_short) return false;
      if (c.type === 'customer') return false;
      if (String(c.inn || '').startsWith('CUST-')) return false;
      return true;
    });

    var filtered = subsList.filter(function(c) {
      if (!query) return true;
      return (c.name_short || '').toLowerCase().indexOf(query) !== -1 ||
             (c.inn || '').toLowerCase().indexOf(query) !== -1;
    });

    if (!filtered.length) {
      listEl.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text-3);font-size:.82rem">Подрядчик не найден</div>';
      return;
    }

    listEl.innerHTML = filtered.map(function(c) {
      var sName = escHtml(c.name_short);
      var sInn = escHtml(c.inn || '—');
      return '<div style="cursor:pointer;padding:8px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center" ' +
        'onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'" ' +
        'onclick="window._wizSelectContractor(\'' + c.id + '\', \'' + sName.replace(/'/g, "\\'") + '\', \'' + sInn.replace(/'/g, "\\'") + '\')">' +
          '<div style="font-weight:700;font-size:.85rem;color:var(--text)">🏢 ' + sName + '</div>' +
          '<div class="t3" style="font-size:.76rem">ИНН ' + sInn + '</div>' +
      '</div>';
    }).join('');
  };

  window._wizSelectContractor = function(id, name, inn) {
    var inpHid = document.getElementById('wiz_contractor_id');
    var inpNameHid = document.getElementById('wiz_contractor_name');
    if (inpHid) inpHid.value = id;
    if (inpNameHid) inpNameHid.value = name;

    var sNameEl = document.getElementById('wiz_selected_c_name');
    var sInnEl = document.getElementById('wiz_selected_c_inn');
    if (sNameEl) sNameEl.textContent = name;
    if (sInnEl) sInnEl.textContent = inn;

    var selBox = document.getElementById('wiz_c_selected_box');
    var pickBox = document.getElementById('wiz_c_picker_box');
    if (selBox) selBox.style.display = 'flex';
    if (pickBox) pickBox.style.display = 'none';

    var step2 = document.getElementById('wiz_step2_container');
    var step3 = document.getElementById('wiz_step3_container');
    if (step2) step2.style.display = 'block';
    if (step3) step3.style.display = 'block';

    var taskId = S.cardId;
    window._wizLoadContractorData(id, taskId);

    // Автоподстановка монтажника, если ФИО совпадает с названием (для самозанятых)
    var fioInp = document.getElementById('wiz_installer_fio');
    if (fioInp && !fioInp.value) {
      var clean = name.replace(/^(?:ИП|ООО|СЗ|АО|ЗАО)\s+/i, '').trim();
      fioInp.value = clean;
    }
  };

  window._wizClearContractor = function() {
    var inpHid = document.getElementById('wiz_contractor_id');
    var inpNameHid = document.getElementById('wiz_contractor_name');
    if (inpHid) inpHid.value = '';
    if (inpNameHid) inpNameHid.value = '';

    var selBox = document.getElementById('wiz_c_selected_box');
    var pickBox = document.getElementById('wiz_c_picker_box');
    if (selBox) selBox.style.display = 'none';
    if (pickBox) pickBox.style.display = 'block';

    var step2 = document.getElementById('wiz_step2_container');
    var step3 = document.getElementById('wiz_step3_container');
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'none';
  };

  // Загрузка договоров и предыдущих подрядов подрядчика
  window._wizLoadContractorData = function(contractorId, taskId) {
    var loadEl = document.getElementById('wiz_contracts_loading');
    var bodyEl = document.getElementById('wiz_contracts_body');
    if (loadEl) loadEl.style.display = 'block';
    if (bodyEl) bodyEl.innerHTML = '';

    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    window._curWizTask = t;
    var isSber = (t.customer || '').toLowerCase().includes('сбер');

    Promise.all([
      api('/contractors/' + contractorId + '/contracts').catch(function(){ return []; }),
      api('/contractors/' + contractorId + '/previous-subcontracts').catch(function(){ return []; })
    ]).then(function(res) {
      if (loadEl) loadEl.style.display = 'none';
      var contracts = res[0] || [];
      var prevSubs = res[1] || [];

      window._curWizContracts = contracts;
      window._curWizPrevSubs = prevSubs;

      var bestContract = null;
      if (isSber) {
        bestContract = contracts.find(function(c){ return (c.customer_tag || '').toLowerCase().includes('сбер') && c.price_items_count > 0; });
      }
      if (!bestContract) {
        bestContract = contracts.find(function(c){ return c.price_items_count > 0; }) || contracts[0] || null;
      }

      var defaultPorts = parseInt(t.fact || t.in_order || 0, 10) || 1;
      var defaultKm = parseFloat(t.distance_km || 0) || 0;

      var html = '<div style="display:flex;flex-direction:column;gap:12px">';

      // СЦЕНАРИЙ А: Есть рамочный договор с прайс-листом (Сбербанк, К10)
      if (bestContract && bestContract.price_items_count > 0) {
        html += '<div style="border:1.5px solid #86efac;background:#f0fdf4;border-radius:8px;padding:12px">' +
          '<div style="display:flex;align-items:flex-start;gap:8px">' +
            '<input type="radio" name="wiz_mode" id="wiz_mode_price" value="price" checked onchange="window._wizToggleMode(\'price\',\'' + escHtml(taskId) + '\')" style="margin-top:3px">' +
            '<div style="flex:1">' +
              '<label for="wiz_mode_price" style="font-weight:700;font-size:.88rem;color:#166534;cursor:pointer">' +
                '✓ Действующий рамочный договор: ' + escHtml(bestContract.contract_number) + ' с ' + escHtml(bestContract.own_company_name || 'ООО "К10"') +
              '</label>' +
              '<div style="font-size:.76rem;color:#15803d;margin-top:2px">' +
                'Предмет: ' + escHtml(bestContract.subject || 'СКС и телекоммуникации') + ' • Территория: ' + escHtml(bestContract.territory || 'Регион') +
              '</div>' +
              '<div style="font-size:.76rem;color:#166534;margin-top:4px;font-weight:600">' +
                '📊 Прайс-лист активен (' + bestContract.price_items_count + ' позиций с дифференцированной шкалой цен)' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }

      // СЦЕНАРИЙ Б: Предыдущие разовые подряды (например, Казанка -> Юргинское)
      if (prevSubs.length > 0) {
        var p0 = prevSubs[0];
        var prevPrice = Number(p0.price_agreed || 0);
        html += '<div style="border:1.5px solid #93c5fd;background:#eff6ff;border-radius:8px;padding:12px">' +
          '<div style="display:flex;align-items:flex-start;gap:8px">' +
            '<input type="radio" name="wiz_mode" id="wiz_mode_copy" value="copy" ' + (!bestContract ? 'checked' : '') + ' onchange="window._wizToggleMode(\'copy\',\'' + escHtml(taskId) + '\')" style="margin-top:3px">' +
            '<div style="flex:1">' +
              '<label for="wiz_mode_copy" style="font-weight:700;font-size:.88rem;color:#1e40af;cursor:pointer">' +
                '📋 Скопировать условия предыдущего подряда: ' + escHtml(p0.address || p0.region || 'Предыдущий объект') + ' (' + fmtMoney(prevPrice) + ')' +
              '</label>' +
              '<div style="font-size:.76rem;color:#1d4ed8;margin-top:2px">' +
                'Договор с: <b>' + escHtml(p0.own_company_name || 'ООО "Кабельные Системы"') + '</b> • Номер: ' + escHtml(p0.contract_number || '01/07/26-Т') +
              '</div>' +
              '<div id="wiz_copy_inputs" style="display:' + (!bestContract ? 'grid' : 'none') + ';grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">' +
                '<div>' +
                  '<label style="display:block;font-size:.74rem;color:#1e3a8a;margin-bottom:2px">Согласованная сумма для нового объекта (₽) *</label>' +
                  '<input type="number" id="wiz_custom_price" value="' + (prevPrice || 50000) + '" style="width:100%;padding:6px 8px;border:1.5px solid #93c5fd;border-radius:6px;font-size:.85rem;font-weight:700" oninput="window._wizUpdateSummary()">' +
                '</div>' +
                '<div>' +
                  '<label style="display:block;font-size:.74rem;color:#1e3a8a;margin-bottom:2px">Собственное юрлицо</label>' +
                  '<select id="wiz_copy_own_company" style="width:100%;padding:6px 8px;border:1.5px solid #93c5fd;border-radius:6px;font-size:.82rem">' +
                    (S.ownCompanies || []).map(function(oc) {
                      var isSel = (p0.own_company_id === oc.id || oc.code === 'KS') ? ' selected' : '';
                      return '<option value="' + oc.id + '"' + isSel + '>' + escHtml(oc.name_short) + '</option>';
                    }).join('') +
                  '</select>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }

      // СЦЕНАРИЙ В: Новый договор или кастомные условия
      html += '<div style="border:1.5px solid var(--border);background:#fafaf9;border-radius:8px;padding:12px">' +
        '<div style="display:flex;align-items:flex-start;gap:8px">' +
          '<input type="radio" name="wiz_mode" id="wiz_mode_new" value="new" ' + (!bestContract && !prevSubs.length ? 'checked' : '') + ' onchange="window._wizToggleMode(\'new\',\'' + escHtml(taskId) + '\')" style="margin-top:3px">' +
          '<div style="flex:1">' +
            '<label for="wiz_mode_new" style="font-weight:700;font-size:.85rem;color:var(--text);cursor:pointer">' +
              '➕ Заключить новый договор подряда' +
            '</label>' +
            '<div id="wiz_new_contract_fields" style="display:' + (!bestContract && !prevSubs.length ? 'block' : 'none') + ';margin-top:8px">' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px">' +
                '<div>' +
                  '<label style="display:block;font-size:.74rem;color:var(--text-3);margin-bottom:2px">Собственное юрлицо *</label>' +
                  '<select id="wiz_new_own_company" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
                    (S.ownCompanies || []).map(function(oc) {
                      return '<option value="' + oc.id + '">' + escHtml(oc.name_short) + ' (' + (oc.vat_mode === 'with_vat' ? 'с НДС' : 'без НДС') + ')</option>';
                    }).join('') +
                  '</select>' +
                '</div>' +
                '<div>' +
                  '<label style="display:block;font-size:.74rem;color:var(--text-3);margin-bottom:2px">Номер договора *</label>' +
                  '<input type="text" id="wiz_new_num" placeholder="№ 01/..." style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
                '</div>' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
                '<div>' +
                  '<label style="display:block;font-size:.74rem;color:var(--text-3);margin-bottom:2px">Дата договора</label>' +
                  '<input type="date" id="wiz_new_date" value="' + new Date().toISOString().slice(0, 10) + '" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
                '</div>' +
                '<div>' +
                  '<label style="display:block;font-size:.74rem;color:var(--text-3);margin-bottom:2px">Ссылка на скан (бухгалтерия)</label>' +
                  '<input type="text" id="wiz_new_scan" placeholder="https://cloud... или диск" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.82rem">' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

      // Сумма по Заказ-наряду (из сметы заявки или договорная)
      var existingSmrTotal = 0;
      if (window._taskSmrSpec && window._taskSmrSpec[taskId]) {
        window._taskSmrSpec[taskId].forEach(function(x){ existingSmrTotal += (Number(x.qty)||1)*(Number(x.price)||0); });
      }
      if (!existingSmrTotal && curTask && curTask.rawData && curTask.rawData.subTotal) {
        existingSmrTotal = Number(curTask.rawData.subTotal) || 0;
      }

      html += '<div id="wiz_calc_params_box" style="border:1px solid var(--border);border-radius:8px;padding:12px;background:#f8fafc;margin-top:4px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">' +
          '<div>' +
            '<div style="font-weight:700;font-size:.84rem;color:var(--text)">Сумма Заказ-наряда к договору подряда:</div>' +
            '<div class="t3" style="font-size:.73rem">Определяется сметой работ на вкладке «Исполнение» или договорной суммой</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<input type="number" id="wiz_manual_total" value="' + (existingSmrTotal || '') + '" placeholder="' + (existingSmrTotal ? existingSmrTotal : '0') + '" style="width:160px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.9rem;font-weight:700;text-align:right" oninput="window._wizUpdateSummary(\'manual_total\')">' +
            '<span style="font-weight:700;color:var(--text-2);font-size:.9rem">₽</span>' +
          '</div>' +
        '</div>' +
        '<div id="wiz_calc_summary" style="font-weight:700;font-size:.88rem;color:var(--blue);text-align:right;margin-top:8px">Итого к начислению: ' + (existingSmrTotal ? fmtMoney(existingSmrTotal) : '0 ₽') + '</div>' +
      '</div>';

      html += '</div>';
      bodyEl.innerHTML = html;

      window._wizBestContract = bestContract;
      window._wizUpdateSummary();
    });
  };

  window._wizToggleMode = function(mode, taskId) {
    var copyInp = document.getElementById('wiz_copy_inputs');
    var newInp = document.getElementById('wiz_new_contract_fields');
    var calcBox = document.getElementById('wiz_calc_params_box');

    if (copyInp) copyInp.style.display = mode === 'copy' ? 'grid' : 'none';
    if (newInp) newInp.style.display = mode === 'new' ? 'block' : 'none';
    if (calcBox) calcBox.style.display = mode === 'copy' ? 'none' : 'block';

    window._wizUpdateSummary();
  };

  window._wizUpdateSummary = function(src) {
    var sumEl = document.getElementById('wiz_calc_summary');
    if (!sumEl) return;

    var modeEl = document.querySelector('input[name="wiz_mode"]:checked');
    var mode = modeEl ? modeEl.value : 'price';

    if (mode === 'copy') {
      var customP = document.getElementById('wiz_custom_price') ? parseFloat(document.getElementById('wiz_custom_price').value) : 0;
      sumEl.innerHTML = 'Согласованная сумма: <span style="color:var(--green)">' + fmtMoney(customP || 0) + '</span>';
      return;
    }

    var mTotalEl = document.getElementById('wiz_manual_total');
    var mTotal = mTotalEl ? (parseFloat(mTotalEl.value) || 0) : 0;

    if (mTotal > 0) {
      sumEl.innerHTML = 'Согласованная сумма по Заказ-наряду: <span style="color:var(--green);font-weight:700">' + fmtMoney(mTotal) + '</span>';
    } else {
      sumEl.innerHTML = 'Сумма определяется сметой на вкладке «Исполнение»';
    }
  };

  window._wizOnSpecialistSelect = function(val) {
    var hid = document.getElementById('wiz_specialist_id');
    var fio = document.getElementById('wiz_installer_fio');
    var phone = document.getElementById('wiz_installer_phone');
    var pass = document.getElementById('wiz_installer_pass');
    var auto = document.getElementById('wiz_installer_auto');

    if (hid) hid.value = val || '';
    if (!val) return;

    var sp = (S.specialists || []).find(function(s){ return String(s.id) === String(val); });
    if (sp) {
      if (fio) fio.value = sp.full_name || '';
      if (phone) phone.value = sp.phone || '';
      if (pass) pass.value = sp.passport_raw || sp.passport_series_number || '';
      if (auto) auto.value = sp.auto_number || '';
    }
  };

  // 5. ОТПРАВКА И СОХРАНЕНИЕ НАЗНАЧЕНИЯ ПОДРЯДЧИКА
  window._wizSubmit = function(taskId) {
    var cId = document.getElementById('wiz_contractor_id') ? document.getElementById('wiz_contractor_id').value : '';
    var cName = document.getElementById('wiz_contractor_name') ? document.getElementById('wiz_contractor_name').value : '';
    if (!cId && !cName) return alert('Пожалуйста, выберите подрядчика!');

    var btn = document.getElementById('wiz_save_btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Сохранение...'; }

    var modeEl = document.querySelector('input[name="wiz_mode"]:checked');
    var mode = modeEl ? modeEl.value : 'price';

    var curTask = window._curWizTask || (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    var ports = Number(curTask.fact || curTask.inOrder || curTask.ports || 0);
    var portType = curTask.port_type || 'port_5e';
    var cab = curTask.cabinet_type || '';
    var km = parseFloat(curTask.distance_km || 0);

    var calcRes = calcSmrLocal({
      contractorId: cId,
      customerTag: curTask.customer || curTask.customer_tag || '',
      region: curTask.region || curTask.chain || '',
      ports: ports,
      portType: portType,
      cabinetType: cab,
      distanceKm: km
    });

    var finalPrice = calcRes.totalAmount;
    var ownCompanyId = null;
    var contractId = null;
    var priceListId = null;
    var calcDetails = calcRes;

    if (mode === 'copy') {
      var customP = document.getElementById('wiz_custom_price') ? parseFloat(document.getElementById('wiz_custom_price').value) : 0;
      finalPrice = customP || 50000;
      ownCompanyId = document.getElementById('wiz_copy_own_company') ? parseInt(document.getElementById('wiz_copy_own_company').value, 10) : null;
      var prev0 = (window._curWizPrevSubs && window._curWizPrevSubs[0]) || {};
      contractId = prev0.contractor_contract_id || null;
      calcDetails = {
        mode: 'copy_template',
        sourceAddress: prev0.address || 'Предыдущий подряд',
        sourcePrice: prev0.price_agreed || 0,
        agreedPrice: finalPrice
      };
    } else if (mode === 'price') {
      var bestC = window._wizBestContract;
      if (bestC) {
        contractId = bestC.id;
        ownCompanyId = bestC.own_company_id;
        priceListId = bestC.price_list_id || calcRes.priceListId;
      } else {
        priceListId = calcRes.priceListId;
      }
    } else if (mode === 'new') {
      ownCompanyId = document.getElementById('wiz_new_own_company') ? parseInt(document.getElementById('wiz_new_own_company').value, 10) : null;
      priceListId = calcRes.priceListId;
    }

    if (!priceListId && calcRes.priceListId) {
      priceListId = calcRes.priceListId;
    }

    var mTotal = document.getElementById('wiz_manual_total') ? parseFloat(document.getElementById('wiz_manual_total').value) : 0;
    var mRate = document.getElementById('wiz_manual_rate') ? parseFloat(document.getElementById('wiz_manual_rate').value) : 0;
    if (mTotal > 0) {
      finalPrice = mTotal;
      calcDetails = Object.assign({}, calcRes, { manualOverride: { total: mTotal, rate: ports > 0 ? Math.round(mTotal / ports) : mTotal, originalCalc: calcRes.totalAmount } });
    } else if (mRate > 0) {
      finalPrice = Math.round(mRate * (ports || 1));
      calcDetails = Object.assign({}, calcRes, { manualOverride: { total: finalPrice, rate: mRate, originalCalc: calcRes.totalAmount } });
    } else if (!finalPrice && window._taskSmrSpec && window._taskSmrSpec[taskId]) {
      var specSum = 0;
      window._taskSmrSpec[taskId].forEach(function(x){ specSum += (Number(x.qty)||1)*(Number(x.price)||0); });
      if (specSum > 0) finalPrice = specSum;
    }

    var specId = document.getElementById('wiz_specialist_id') ? document.getElementById('wiz_specialist_id').value : '';
    var fio = document.getElementById('wiz_installer_fio') ? document.getElementById('wiz_installer_fio').value : '';
    var phone = document.getElementById('wiz_installer_phone') ? document.getElementById('wiz_installer_phone').value : '';
    var pass = document.getElementById('wiz_installer_pass') ? document.getElementById('wiz_installer_pass').value : '';
    var auto = document.getElementById('wiz_installer_auto') ? document.getElementById('wiz_installer_auto').value : '';
    var deadline = document.getElementById('wiz_deadline') ? document.getElementById('wiz_deadline').value : '';

    var payload = {
      contractor_id: cId ? parseInt(cId, 10) : null,
      contractor_name: cName,
      own_company_id: ownCompanyId,
      contractor_contract_id: contractId,
      price_list_id: priceListId,
      work_type: cab ? ('Монтаж СКС и шкафа ТКШ') : 'Монтаж СКС',
      price_agreed: finalPrice,
      deadline: deadline || null,
      specialist_id: specId ? parseInt(specId, 10) : null,
      installer_fio: fio || cName,
      installer_phone: phone || null,
      installer_passport: pass || null,
      auto_number: auto || null,
      calculation_details: calcDetails,
      ports_count: ports,
      distance_km: km
    };

    api('/tasks/' + encodeURIComponent(taskId) + '/subcontract-wizard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function(res) {
      if (res.error) throw new Error(res.error);

      // Обновляем задачу в локальном состоянии
      var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); });
      if (t) {
        t.contractor = cName;
        t.own_company_id = ownCompanyId;
        t.macroStatus = 'assigned';
        t.stageNum = 1;
        t.stage = 'survey';
        if (!t.rawData) t.rawData = {};
        t.rawData.subRate = mRate || (ports > 0 ? Math.round(finalPrice / ports) : finalPrice);
        t.rawData.subTotal = finalPrice;
      }

      // Синхронизируем во всех элементах интерфейса (вкладка Информация)
      var inpContr = document.getElementById('task_edit_contractor') || document.querySelector('input[name="contractor"]');
      if (inpContr) inpContr.value = cName;
      if (S.cardDraft) S.cardDraft.contractor = cName;

      var modalEl = document.getElementById('_subcontract_wizard_modal');
      if (modalEl) modalEl.remove();

      // Обновляем блоки на карточке
      if (window._taskSmrTax) delete window._taskSmrTax[taskId];
      if (typeof window.loadCardSubcontracts === 'function') {
        window.loadCardSubcontracts(taskId);
      }
      if (typeof window.renderCardSmrCalculator === 'function') {
        window.renderCardSmrCalculator(taskId);
      }
      if (typeof renderApp === 'function') renderApp();
      if (typeof window.restorePageScroll === 'function') window.restorePageScroll('task_row_' + taskId);
    })
    .catch(function(err) {
      alert('Ошибка сохранения поручения: ' + err.message);
    })
    .finally(function() {
      if (btn) { btn.disabled = false; btn.textContent = '✓ Подтвердить и сформировать поручение'; }
    });
  };

})();


// ─── БЫСТРОЕ СОЗДАНИЕ ДОГОВОРА СУБПОДРЯДА ─────────────────────────────────────
window.openQuickSubcontractCreateModal = function(taskId, contrName) {
  var old = document.getElementById('_quick_subcontract_modal');
  if (old) old.remove();

  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); }) || {};
  var cName = (contrName && contrName.trim()) || (t.contractor && t.contractor.trim()) || (S.cardDraft && S.cardDraft.contractor ? S.cardDraft.contractor.trim() : '');
  var cObj = (S.contractors || []).find(function(c){
    if (!c) return false;
    var cs = (c.name_short || '').toLowerCase();
    var cn = cName.toLowerCase();
    return cs === cn || cs.includes(cn) || cn.includes(cs);
  }) || { name_short: cName, inn: '' };

  var curYear = new Date().getFullYear();
  var randNum = Math.floor(100 + Math.random() * 900);
  var defNum = 'СУБ-' + curYear + '-' + randNum;
  var defDate = new Date().toISOString().slice(0, 10);

  var ownList = (S.ownCompanies && S.ownCompanies.length > 0) ? S.ownCompanies : [
    { id: 'ks', name: 'ООО "Кабельные Системы"', director: 'Городович Милана Владимировна' },
    { id: 'k10', name: 'ООО "К10"', director: 'Чайка Алексей Николаевич' }
  ];

  var modal = document.createElement('div');
  modal.id = '_quick_subcontract_modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = '<div class="modal-box" style="max-width:540px;width:95%;background:#fff;border-radius:12px;padding:20px;box-shadow:0 20px 45px rgba(0,0,0,0.25)">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1.5px solid var(--border);padding-bottom:10px">' +
      '<h3 style="margin:0;font-size:1.1rem;display:flex;align-items:center;gap:6px"><span>📑 Создать договор субподряда</span></h3>' +
      '<button class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_quick_subcontract_modal\').remove()" style="font-size:1.2rem;line-height:1">✕</button>' +
    '</div>' +
    '<form id="_quick_sub_form" onsubmit="event.preventDefault(); window._submitQuickSubcontract(\'' + escHtml(taskId) + '\')">' +
      '<div style="margin-bottom:10px">' +
        '<label style="display:block;font-size:.74rem;font-weight:700;color:var(--text-3);margin-bottom:3px">ГЕНПОДРЯДЧИК («МЫ»):</label>' +
        '<select id="_qsub_own" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;font-weight:600">' +
          ownList.map(function(oc){ return '<option value="' + oc.id + '">' + escHtml(oc.name) + (oc.director ? ' (Директор: ' + escHtml(oc.director) + ')' : '') + '</option>'; }).join('') +
        '</select>' +
      '</div>' +
      '<div style="margin-bottom:10px">' +
        '<label style="display:block;font-size:.74rem;font-weight:700;color:var(--text-3);margin-bottom:3px">СУБПОДРЯДЧИК (ИСПОЛНИТЕЛЬ СМР):</label>' +
        '<input type="text" id="_qsub_contr" value="' + escHtml(cObj.name_short || cName) + '" readonly style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;background:#f8fafc;font-weight:700;color:var(--text)">' +
        (cObj.inn ? '<div style="font-size:.72rem;color:var(--text-3);margin-top:2px">ИНН: ' + escHtml(cObj.inn) + '</div>' : '') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
        '<div>' +
          '<label style="display:block;font-size:.74rem;font-weight:700;color:var(--text-3);margin-bottom:3px">НОМЕР ДОГОВОРА:</label>' +
          '<input type="text" id="_qsub_number" value="' + escHtml(defNum) + '" required style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.88rem;font-weight:700">' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:.74rem;font-weight:700;color:var(--text-3);margin-bottom:3px">ДАТА ДОГОВОРА:</label>' +
          '<input type="date" id="_qsub_date" value="' + defDate + '" required style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.88rem">' +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:10px">' +
        '<label style="display:block;font-size:.74rem;font-weight:700;color:var(--text-3);margin-bottom:3px">ПРЕДМЕТ ДОГОВОРА:</label>' +
        '<input type="text" id="_qsub_subject" value="Выполнение строительно-монтажных работ (СМР) по объектам связи" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
      '</div>' +
      '<div style="margin-bottom:14px">' +
        '<label style="display:block;font-size:.74rem;font-weight:700;color:var(--text-3);margin-bottom:3px">ТИПОВОЙ ПРАЙС-ЛИСТ К ДОГОВОРУ:</label>' +
        '<select id="_qsub_pricelist" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
          '<option value="Прайс-лист КС (Разовые/СФР)">Прайс-лист КС (Разовые/СФР)</option>' +
          '<option value="Типовой Сбербанк (<=10 портов)">Типовой Сбербанк (<=10 портов)</option>' +
          '<option value="Индивидуальный расчет">Индивидуальный расчет по смете</option>' +
        '</select>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--border);padding-top:12px">' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'_quick_subcontract_modal\').remove()">Отмена</button>' +
        '<button type="submit" class="btn btn-sm btn-primary" style="font-weight:700">✓ Создать и привязать договор</button>' +
      '</div>' +
    '</form>' +
  '</div>';
  document.body.appendChild(modal);
};

window._submitQuickSubcontract = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  var ownId = document.getElementById('_qsub_own').value;
  var num = document.getElementById('_qsub_number').value.trim();
  var dt = document.getElementById('_qsub_date').value;
  var sub = document.getElementById('_qsub_subject').value.trim();
  var pl = document.getElementById('_qsub_pricelist').value;
  var contrName = document.getElementById('_qsub_contr').value.trim();

  var payload = {
    contract_number: num,
    contract_date: dt,
    customer_name: contrName,
    own_company: ownId,
    subject: sub,
    contract_type: 'subcontract',
    status: 'active'
  };

  api('/contracts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function(res) {
    if (res && res.id) {
      if (!Array.isArray(S.contracts)) S.contracts = [];
      S.contracts.push(res);
      if (t) {
        t.contract_id = res.id;
        t.contractor_contract_id = res.id;
        t.contractor_contract_title = num + ' от ' + dt;
        t.contractor_pricelist = pl;
        if (!t.rawData) t.rawData = {};
        t.rawData.contractor_pricelist = pl;
        t.rawData.subcontract_number = num;
      }
      var m = document.getElementById('_quick_subcontract_modal');
      if (m) m.remove();
      if (typeof showToast === 'function') showToast('Договор ' + num + ' успешно создан и привязан!', 'success');
      renderApp();
    } else {
      alert('Ошибка сохранения договора: ' + (res.error || 'неизвестная ошибка'));
    }
  }).catch(function(err) {
    if (t) {
      t.contractor_contract_title = num + ' от ' + dt;
      t.contractor_pricelist = pl;
      if (!t.rawData) t.rawData = {};
      t.rawData.contractor_pricelist = pl;
      t.rawData.subcontract_number = num;
    }
    var m = document.getElementById('_quick_subcontract_modal');
    if (m) m.remove();
    if (typeof showToast === 'function') showToast('Договор ' + num + ' сохранен в заявке!', 'success');
    renderApp();
  });
};

window.saveAndCreateAgreement = function(taskId) {
  var t = (S.tasks || []).find(function(x){ return String(x.id) === String(taskId); });
  if (!t) return;
  var contrName = t.contractor || (S.cardDraft && S.cardDraft.contractor) || '';
  if (!contrName) {
    return alert('Пожалуйста, сначала назначьте исполнителя СМР (подрядчика)!');
  }

  var activeIdx = (window._activeSubcontractIdx && window._activeSubcontractIdx[taskId]) || 0;
  var curSub = (window._curCardSubcontracts || [])[activeIdx] || (window._curCardSubcontracts || [])[0] || null;

  if (!curSub || !curSub.contractor_contract_id) {
    return alert('Пожалуйста, сначала выберите договор субподряда (кнопка «Выбрать договор субподряда»)!');
  }

  if (typeof window._saveCardSmrSpec === 'function') {
    window._saveCardSmrSpec(taskId, { silent: true })
      .then(function() {
        if (typeof showToast === 'function') {
          showToast('Соглашение о цене сохранено в базе данных! Формируем документ...', 'success');
        }
        window.previewSubcontractAgreementDocx(taskId);
      })
      .catch(function(err) {
        alert('Ошибка сохранения сметы соглашения: ' + (err.message || err));
      });
  }
};

window.previewSubcontractAgreementDocx = function(taskId) {
  var activeIdx = (window._activeSubcontractIdx && window._activeSubcontractIdx[taskId]) || 0;
  var curSub = (window._curCardSubcontracts || [])[activeIdx] || (window._curCardSubcontracts || [])[0] || null;
  var subId = curSub ? curSub.id : null;

  if (typeof window.openDocumentEditor === 'function') {
    window.openDocumentEditor({
      templateCode: 'subcontract_agreement',
      taskId: taskId,
      subcontractId: subId,
      onSaved: function() {
        if (typeof window.loadCardDocuments === 'function') {
          window.loadCardDocuments(taskId);
        }
      }
    });
    return;
  }

  var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
  var cName = (t.contractor && t.contractor.trim()) || (curSub && curSub.contractor_name) || '';

  if (typeof api !== 'function') return;
  if (typeof showToast === 'function') showToast('Подготовка печатной формы документа...', 'info');

  api('/tasks/' + encodeURIComponent(taskId) + '/documents/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      doc_type: 'subcontract_agreement',
      subcontract_id: subId,
      contractor_name: cName || undefined
    })
  }).then(function(res) {
    if (res && res.download_url) {
      if (typeof window.openFilePreviewModal === 'function') {
        window.openFilePreviewModal(null, null, res.download_url, 'Соглашение о договорной цене — ' + (curSub && curSub.contract_number ? ('№ ' + curSub.contract_number) : taskId));
      } else {
        window.open(res.download_url, '_blank');
      }
    } else {
      if (typeof showToast === 'function') showToast('Ошибка формирования печатной формы', 'error');
    }
  }).catch(function(err) {
    alert('Ошибка генерации документа: ' + (err.message || err));
  });
};

  window._toggleCardSmrDocsMenu = function(taskId) {
    var m = document.getElementById('card_smr_docs_menu_' + taskId);
    if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
  };

  window.downloadSubcontractDocx = function(taskId) {
    var curSub = (window._curCardSubcontracts || []).find(function(s){ return String(s.task_id) === String(taskId); }) || null;
    var subId = curSub ? curSub.id : null;

    if (typeof window.openDocumentEditor === 'function') {
      window.openDocumentEditor({
        templateCode: 'subcontract_agreement',
        taskId: taskId,
        subcontractId: subId,
        onSaved: function() {
          if (typeof window.loadCardDocuments === 'function') {
            window.loadCardDocuments(taskId);
          }
        }
      });
      return;
    }

    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    var cName = (t.contractor && t.contractor.trim()) || (curSub && curSub.contractor_name) || '';

    if (typeof api !== 'function') return;
    if (typeof showToast === 'function') showToast('Формирование договора субподряда...', 'info');

    api('/tasks/' + encodeURIComponent(taskId) + '/documents/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc_type: 'subcontract_agreement',
        subcontract_id: subId,
        contractor_name: cName || undefined
      })
    }).then(function(res) {
      if (res && res.download_url) {
        window.open(res.download_url, '_blank');
        if (typeof showToast === 'function') showToast('Договор субподряда сформирован!', 'success');
      } else {
        if (typeof showToast === 'function') showToast('Ошибка формирования документа', 'error');
      }
    }).catch(function(err) {
      alert('Ошибка формирования договора: ' + (err.message || err));
    });
  };
