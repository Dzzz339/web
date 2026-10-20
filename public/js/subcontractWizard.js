// public/js/subcontractWizard.js
// Интеллектуальный конструктор (Wizard) назначения подрядчика,
// калькулятор СМР по дифференцированной шкале объемов и выбор «Собственного» юрлица (КС, К10, Ультима).

(function() {
  'use strict';

  // 1. Быстрый локальный расчет СМР по правилам Алексея (шкала до 3 / более 3 портов, км сверх 10 км, шкафы)
  function calcSmrLocal(params) {
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
      '<div style="display:flex;justify-content:flex-end;margin-top:12px;border-top:1px solid var(--border);padding-top:10px">' +
        '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'_contr_contracts_modal\').remove()">Закрыть</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(modal);

    api('/contractors/' + cObj.id + '/contracts')
      .then(function(contracts) {
        var box = document.getElementById('_contr_contracts_list_box');
        if (!box) return;

        if (!contracts || !contracts.length) {
          box.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-3)">У данного подрядчика нет зарегистрированных договоров.<br><button type="button" class="btn btn-sm btn-primary" onclick="document.getElementById(\'_contr_contracts_modal\').remove();openSubcontractWizardModal(\'' + escHtml(taskId) + '\')" style="margin-top:8px">+ Добавить договор в мастере</button></div>';
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

    var curSub = (window._curCardSubcontracts || [])[0] || null;
    if (curSub) {
      curSub.contractor_contract_id = contractId;
      curSub.own_company_id = Number(ownCompanyId);
      curSub.price_list_id = priceListId;
      curSub.contract_number = contractNumber;
      curSub.contract_date = contractDate;
      curSub.own_company_name = ownCompanyName;
    }

    var modal = document.getElementById('_contr_contracts_modal');
    if (modal) modal.remove();

    if (typeof showToast === 'function') {
      showToast('Привязан договор ' + contractNumber + ' (' + ownCompanyName + ')', 'success');
    }

    window.renderCardSmrCalculator(taskId);
  };

  // Калькулятор расчета налогов и сметы (НДС 20%, 10%, 5%, 7%, УСН, Самозанятые 6%, ГПХ 13%)
  window._calculateSmrTaxes = function(baseSum, mode) {
    baseSum = Math.round((Number(baseSum) || 0) * 100) / 100;
    mode = mode || 'usn';

    var res = {
      mode: mode,
      baseSum: baseSum,
      sumWithoutTax: baseSum,
      taxAmount: 0,
      totalWithTax: baseSum,
      taxTitle: 'НДС / Налог',
      taxRateNote: 'Не облагается (УСН / патент)',
      baseNote: 'Базовая стоимость работ'
    };

    switch (mode) {
      case 'usn':
        res.sumWithoutTax = baseSum;
        res.taxAmount = 0;
        res.totalWithTax = baseSum;
        res.taxTitle = 'НДС / Налог';
        res.taxRateNote = 'Не облагается (УСН / патент)';
        res.baseNote = 'Полная сумма без налога';
        break;

      case 'osno_20_inc':
        res.totalWithTax = baseSum;
        res.sumWithoutTax = Math.round((baseSum / 1.20) * 100) / 100;
        res.taxAmount = Math.round((baseSum - res.sumWithoutTax) * 100) / 100;
        res.taxTitle = 'НДС (20%) в т.ч.';
        res.taxRateNote = 'Расчетная ставка 20/120 (выделен из стоимости)';
        res.baseNote = 'Базовая стоимость без НДС';
        break;

      case 'osno_20_plus':
        res.sumWithoutTax = baseSum;
        res.taxAmount = Math.round((baseSum * 0.20) * 100) / 100;
        res.totalWithTax = Math.round((baseSum + res.taxAmount) * 100) / 100;
        res.taxTitle = 'НДС (20%) сверху';
        res.taxRateNote = 'Прямая ставка 20% (начислен сверху)';
        res.baseNote = 'Базовая стоимость до начисления НДС';
        break;

      case 'osno_10_inc':
        res.totalWithTax = baseSum;
        res.sumWithoutTax = Math.round((baseSum / 1.10) * 100) / 100;
        res.taxAmount = Math.round((baseSum - res.sumWithoutTax) * 100) / 100;
        res.taxTitle = 'НДС (10%) в т.ч.';
        res.taxRateNote = 'Расчетная ставка 10/110 (выделен из стоимости)';
        res.baseNote = 'Базовая стоимость без НДС';
        break;

      case 'osno_10_plus':
        res.sumWithoutTax = baseSum;
        res.taxAmount = Math.round((baseSum * 0.10) * 100) / 100;
        res.totalWithTax = Math.round((baseSum + res.taxAmount) * 100) / 100;
        res.taxTitle = 'НДС (10%) сверху';
        res.taxRateNote = 'Прямая ставка 10% (начислен сверху)';
        res.baseNote = 'Базовая стоимость до начисления НДС';
        break;

      case 'usn_5_inc':
        res.totalWithTax = baseSum;
        res.sumWithoutTax = Math.round((baseSum / 1.05) * 100) / 100;
        res.taxAmount = Math.round((baseSum - res.sumWithoutTax) * 100) / 100;
        res.taxTitle = 'НДС (5%) в т.ч. (УСН 2025)';
        res.taxRateNote = 'Расчетная ставка 5/105 (выделен из стоимости)';
        res.baseNote = 'Базовая стоимость без НДС';
        break;

      case 'usn_5_plus':
        res.sumWithoutTax = baseSum;
        res.taxAmount = Math.round((baseSum * 0.05) * 100) / 100;
        res.totalWithTax = Math.round((baseSum + res.taxAmount) * 100) / 100;
        res.taxTitle = 'НДС (5%) сверху (УСН 2025)';
        res.taxRateNote = 'Прямая ставка 5% (начислен сверху)';
        res.baseNote = 'Базовая стоимость до начисления НДС';
        break;

      case 'usn_7_inc':
        res.totalWithTax = baseSum;
        res.sumWithoutTax = Math.round((baseSum / 1.07) * 100) / 100;
        res.taxAmount = Math.round((baseSum - res.sumWithoutTax) * 100) / 100;
        res.taxTitle = 'НДС (7%) в т.ч. (УСН 2025)';
        res.taxRateNote = 'Расчетная ставка 7/107 (выделен из стоимости)';
        res.baseNote = 'Базовая стоимость без НДС';
        break;

      case 'usn_7_plus':
        res.sumWithoutTax = baseSum;
        res.taxAmount = Math.round((baseSum * 0.07) * 100) / 100;
        res.totalWithTax = Math.round((baseSum + res.taxAmount) * 100) / 100;
        res.taxTitle = 'НДС (7%) сверху (УСН 2025)';
        res.taxRateNote = 'Прямая ставка 7% (начислен сверху)';
        res.baseNote = 'Базовая стоимость до начисления НДС';
        break;

      case 'npd_6':
        res.totalWithTax = baseSum;
        res.taxAmount = Math.round((baseSum * 0.06) * 100) / 100;
        res.sumWithoutTax = Math.round((baseSum - res.taxAmount) * 100) / 100;
        res.taxTitle = 'НПД (6%) налог самозанятого';
        res.taxRateNote = 'Уплачивается исполнителем (НПД 6%)';
        res.baseNote = 'Сумма за вычетом налога (на руки)';
        break;

      case 'gph_13':
        res.totalWithTax = baseSum;
        res.taxAmount = Math.round((baseSum * 0.13) * 100) / 100;
        res.sumWithoutTax = Math.round((baseSum - res.taxAmount) * 100) / 100;
        res.taxTitle = 'НДФЛ (13%) налоговый агент';
        res.taxRateNote = 'Удерживается налоговым агентом при выплате';
        res.baseNote = 'Сумма к выплате на руки';
        break;

      default:
        res.sumWithoutTax = baseSum;
        res.taxAmount = 0;
        res.totalWithTax = baseSum;
        break;
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

  window._taskSmrCalc = window._taskSmrCalc || {};

  window._getSmrCalcVal = function(taskId) {
    if (window._taskSmrCalc && window._taskSmrCalc[taskId] && window._taskSmrCalc[taskId].expr !== undefined) {
      return window._taskSmrCalc[taskId];
    }
    var spec = (window._taskSmrSpec && window._taskSmrSpec[taskId]) || [];
    var sum = 0;
    spec.forEach(function(l){ sum += (Number(l.qty) || 0) * (Number(l.price) || 0); });
    sum = Math.round(sum * 100) / 100;
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    if (sum <= 0 && t.amount > 0) {
      sum = Math.round(Number(t.amount) * 0.85 * 100) / 100;
    }
    var initExpr = sum > 0 ? String(sum) : '';
    window._taskSmrCalc = window._taskSmrCalc || {};
    window._taskSmrCalc[taskId] = {
      expr: initExpr,
      val: window._evalMathExpression(initExpr) || 0
    };
    return window._taskSmrCalc[taskId];
  };

  window._onSmrCalcInput = function(taskId, expr) {
    window._taskSmrCalc = window._taskSmrCalc || {};
    var val = window._evalMathExpression(expr);
    window._taskSmrCalc[taskId] = {
      expr: expr,
      val: val
    };

    var resPill = document.getElementById('smr_calc_result_pill_' + taskId);
    if (resPill) {
      if (val === null) {
        resPill.textContent = 'Ошибка выражения';
        resPill.style.color = '#dc2626';
        resPill.style.background = '#fef2f2';
        resPill.style.borderColor = '#fca5a5';
      } else {
        resPill.textContent = '= ' + window.fmtMoneyPrecise(val);
        resPill.style.color = '#15803d';
        resPill.style.background = '#f0fdf4';
        resPill.style.borderColor = '#86efac';
      }
    }

    var scenCont = document.getElementById('smr_scenarios_table_container_' + taskId);
    if (scenCont && val !== null && val >= 0) {
      scenCont.innerHTML = window._renderSmrScenariosTableHtml(taskId, val);
    }
  };

  window._smrCalcSetVal = function(taskId, type) {
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    var spec = (window._taskSmrSpec && window._taskSmrSpec[taskId]) || [];
    var specSum = 0;
    spec.forEach(function(l){ specSum += (Number(l.qty) || 0) * (Number(l.price) || 0); });
    specSum = Math.round(specSum * 100) / 100;

    var newExpr = '';
    if (type === 'spec') {
      newExpr = specSum > 0 ? String(specSum) : '0';
    } else if (type === 'customer') {
      var cust = Number(t.amount || 0);
      newExpr = cust > 0 ? String(cust) : '0';
    } else if (type === 'clear') {
      newExpr = '';
    }

    var inp = document.getElementById('smr_calc_input_' + taskId);
    if (inp) {
      inp.value = newExpr;
      window._onSmrCalcInput(taskId, newExpr);
      inp.focus();
    }
  };

  window._smrCalcApplyOp = function(taskId, op) {
    var inp = document.getElementById('smr_calc_input_' + taskId);
    if (!inp) return;
    var cur = inp.value.trim();
    if (!cur) {
      var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
      var spec = (window._taskSmrSpec && window._taskSmrSpec[taskId]) || [];
      var specSum = 0;
      spec.forEach(function(l){ specSum += (Number(l.qty) || 0) * (Number(l.price) || 0); });
      cur = specSum > 0 ? String(specSum) : (t.amount > 0 ? String(t.amount) : '0');
    }

    var newExpr = '';
    if (op === '+20%') {
      newExpr = '(' + cur + ') + 20%';
    } else if (op === '/1.2') {
      newExpr = '(' + cur + ') / 1.2';
    } else if (op === '-10%') {
      newExpr = '(' + cur + ') - 10%';
    } else if (op === '-15%') {
      newExpr = '(' + cur + ') - 15%';
    } else if (op === '-20%') {
      newExpr = '(' + cur + ') - 20%';
    } else if (op === '-6%') {
      newExpr = '(' + cur + ') - 6%';
    } else if (op === '-13%') {
      newExpr = '(' + cur + ') - 13%';
    } else if (op === '/1.05') {
      newExpr = '(' + cur + ') / 1.05';
    } else if (op === '/1.07') {
      newExpr = '(' + cur + ') / 1.07';
    } else {
      newExpr = cur + ' ' + op;
    }

    inp.value = newExpr;
    window._onSmrCalcInput(taskId, newExpr);
    inp.focus();
  };

  window._applyCalcToSpec = function(taskId) {
    var inp = document.getElementById('smr_calc_input_' + taskId);
    var expr = inp ? inp.value : '';
    var val = window._evalMathExpression(expr);
    if (val === null || val <= 0) {
      if (typeof showToast === 'function') {
        showToast('Укажите корректную сумму в калькуляторе больше нуля', 'warning');
      } else {
        alert('Укажите корректную сумму в калькуляторе больше нуля');
      }
      return;
    }

    window._taskSmrSpec = window._taskSmrSpec || {};
    var spec = window._taskSmrSpec[taskId] || [];

    if (spec.length === 0) {
      var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
      spec.push({
        name: t.work_type || 'Монтаж СКС и линий связи',
        unit: 'усл',
        qty: 1,
        price: val,
        sum: val
      });
      window._taskSmrSpec[taskId] = spec;
    } else if (spec.length === 1) {
      var line = spec[0];
      line.sum = val;
      var q = Number(line.qty) || 1;
      line.price = Math.round((val / q) * 100) / 100;
    } else {
      var curTotal = 0;
      spec.forEach(function(l){ curTotal += (Number(l.qty) || 0) * (Number(l.price) || 0); });
      if (curTotal > 0) {
        var ratio = val / curTotal;
        spec.forEach(function(l){
          l.price = Math.round((Number(l.price) || 0) * ratio * 100) / 100;
          l.sum = Math.round((Number(l.qty) || 0) * l.price * 100) / 100;
        });
      } else {
        spec[0].sum = val;
        spec[0].price = Math.round((val / (Number(spec[0].qty) || 1)) * 100) / 100;
      }
    }

    window._renderCardSmrTable(taskId);
    window._refreshSmrCalculations(taskId);

    if (typeof showToast === 'function') {
      showToast('Сумма ' + window.fmtMoneyPrecise(val) + ' успешно перенесена в смету СМР', 'success');
    }
  };

  window._renderSmrScenariosTableHtml = function(taskId, baseAmount) {
    baseAmount = baseAmount !== undefined && baseAmount !== null ? Number(baseAmount) : 0;
    if (baseAmount <= 0) {
      var spec = (window._taskSmrSpec && window._taskSmrSpec[taskId]) || [];
      baseAmount = spec.reduce(function(acc, l){ return acc + ((Number(l.qty) || 0) * (Number(l.price) || 0)); }, 0);
    }
    baseAmount = Math.round(baseAmount * 100) / 100;

    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    var custAmount = Number(t.amount || 0);

    var thirdParty = (window._taskThirdPartySpec && window._taskThirdPartySpec[taskId]) || [];
    var totalTp = thirdParty.reduce(function(acc, tp){ return acc + (Number(tp.amount) || 0); }, 0);

    var curTaxMode = (window._taskSmrTax && window._taskSmrTax[taskId]) || 'usn';

    var scenarios = [
      { mode: 'usn',          name: 'Без НДС (УСН / патент)',  type: 'УСН',       badgeBg: '#f1f5f9', badgeCol: '#475569' },
      { mode: 'osno_20_inc',  name: 'В т.ч. НДС 20% (ОСНО)',    type: 'ОСНО 20%',  badgeBg: '#ede9fe', badgeCol: '#6d28d9' },
      { mode: 'osno_20_plus', name: '+ НДС 20% сверху (ОСНО)',  type: 'ОСНО +20%', badgeBg: '#fae8ff', badgeCol: '#86198f' },
      { mode: 'usn_5_inc',    name: 'В т.ч. НДС 5% (УСН 2025)', type: 'УСН 5%',   badgeBg: '#e0f2fe', badgeCol: '#0369a1' },
      { mode: 'usn_7_inc',    name: 'В т.ч. НДС 7% (УСН 2025)', type: 'УСН 7%',   badgeBg: '#e0f2fe', badgeCol: '#075985' },
      { mode: 'npd_6',        name: 'Самозанятый (НПД 6%)',    type: 'НПД 6%',    badgeBg: '#dcfce7', badgeCol: '#15803d' },
      { mode: 'gph_13',       name: 'Физлицо ГПХ (НДФЛ 13%)',   type: 'ГПХ 13%',   badgeBg: '#fef3c7', badgeCol: '#b45309' }
    ];

    var rows = scenarios.map(function(sc) {
      var c = window._calculateSmrTaxes(baseAmount, sc.mode);
      var outflow = c.totalWithTax + totalTp;
      var margin = custAmount > 0 ? (custAmount - outflow) : 0;
      var marginPct = custAmount > 0 ? Math.round((margin / custAmount) * 100) : 0;
      var isCurrent = curTaxMode === sc.mode;
      var marginColor = margin >= 0 ? '#15803d' : '#dc2626';

      return '<tr style="border-bottom:1px solid var(--border);' + (isCurrent ? 'background:#f0fdf4;font-weight:700;' : '') + '">' +
        '<td style="padding:6px 8px;font-size:.78rem">' +
          '<span class="badge" style="background:' + sc.badgeBg + ';color:' + sc.badgeCol + ';font-weight:700;font-size:.7rem;margin-right:6px">' + sc.type + '</span>' +
          escHtml(sc.name) +
        '</td>' +
        '<td style="padding:6px 8px;text-align:right;font-size:.8rem;color:var(--text-2)">' + window.fmtMoneyPrecise(c.sumWithoutTax) + '</td>' +
        '<td style="padding:6px 8px;text-align:right;font-size:.8rem;color:#7c3aed;font-weight:600">' + (c.taxAmount > 0 ? window.fmtMoneyPrecise(c.taxAmount) : '—') + '</td>' +
        '<td style="padding:6px 8px;text-align:right;font-size:.84rem;font-weight:700;color:var(--text)">' + window.fmtMoneyPrecise(c.totalWithTax) + '</td>' +
        '<td style="padding:6px 8px;text-align:right;font-size:.8rem;color:' + marginColor + ';font-weight:700">' +
          (custAmount > 0 ? (window.fmtMoneyPrecise(margin) + ' <span style="font-size:.72rem">(' + marginPct + '%)</span>') : '—') +
        '</td>' +
        '<td style="padding:6px 8px;text-align:center">' +
          (isCurrent 
            ? '<span style="color:#15803d;font-size:.72rem;font-weight:800;background:#dcfce7;padding:2px 6px;border-radius:4px;border:1px solid #86efac">✓ Выбран</span>'
            : '<button type="button" class="btn btn-xs btn-ghost" onclick="window._selectTaxScenario(\'' + escHtml(taskId) + '\', \'' + sc.mode + '\')" style="font-size:.72rem;padding:2px 8px;border:1px solid var(--border)">Выбрать</button>'
          ) +
        '</td>' +
      '</tr>';
    }).join('');

    return '<table style="width:100%;border-collapse:collapse;text-align:left;font-size:.78rem">' +
      '<thead><tr style="background:#f8fafc;color:var(--text-3);border-bottom:1.5px solid var(--border);font-size:.72rem;text-transform:uppercase">' +
        '<th style="padding:5px 8px">Сценарий / Налоговый режим</th>' +
        '<th style="padding:5px 8px;text-align:right">База (без налога)</th>' +
        '<th style="padding:5px 8px;text-align:right">Налог / НДС</th>' +
        '<th style="padding:5px 8px;text-align:right">К выплате подрядчику</th>' +
        '<th style="padding:5px 8px;text-align:right">Маржа компании</th>' +
        '<th style="padding:5px 8px;text-align:center;width:80px">Действие</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
  };

  window._selectTaxScenario = function(taskId, mode) {
    var sel = document.getElementById('smr_tax_mode_' + taskId);
    if (sel) sel.value = mode;
    window._onSmrTaxModeChange(taskId, mode);
  };

  window._onSmrTaxModeChange = function(taskId, mode) {
    window._taskSmrTax = window._taskSmrTax || {};
    window._taskSmrTax[taskId] = mode;
    window._refreshSmrCalculations(taskId);
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
  };

  window._removeThirdPartyLine = function(taskId, idx) {
    var list = window._taskThirdPartySpec && window._taskThirdPartySpec[taskId];
    if (!list) return;
    list.splice(idx, 1);
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
    if (!window._taskSmrSpec[taskId]) {
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

    // Инициализация налогового режима сметы СМР (1С)
    window._taskSmrTax = window._taskSmrTax || {};
    if (!window._taskSmrTax[taskId]) {
      var savedTax = (curSub && curSub.calculation_details && curSub.calculation_details.tax_details && curSub.calculation_details.tax_details.mode) ||
                     (t.rawData && t.rawData.smrTaxDetails && t.rawData.smrTaxDetails.mode);
      if (savedTax) {
        window._taskSmrTax[taskId] = savedTax;
      } else {
        var cTax = contrObj && contrObj.tax_system ? String(contrObj.tax_system).toLowerCase() : 'usn';
        if (cTax === 'osno' || cTax.includes('20')) {
          window._taskSmrTax[taskId] = 'osno_20_inc';
        } else if (cTax === 'npd' || cTax.includes('самозан') || cTax === 'npd_6') {
          window._taskSmrTax[taskId] = 'npd_6';
        } else if (cTax === 'usn_5') {
          window._taskSmrTax[taskId] = 'usn_5_inc';
        } else if (cTax === 'usn_7') {
          window._taskSmrTax[taskId] = 'usn_7_inc';
        } else if (cTax === 'gph' || cTax.includes('13')) {
          window._taskSmrTax[taskId] = 'gph_13';
        } else {
          window._taskSmrTax[taskId] = 'usn';
        }
      }
    }

    // Определяем привязанное собственное юрлицо («Мы» / Генподрядчик)
    var curOwnId = t.own_company_id || (t.customer && t.customer.toLowerCase().includes('сбер') ? 2 : 1);
    var ownList = S.ownCompanies || [];

    // Данные по договору субподряда с учетом выбранного собственного юрлица
    var isElagin = contrName && contrName.includes('Елагин');
    var isKhomich = contrName && contrName.includes('Хомич');

    var contractTitle = curSub && curSub.contract_number 
      ? ('№ ' + escHtml(curSub.contract_number) + (curSub.contract_date ? (' от ' + escHtml(String(curSub.contract_date).slice(0,10).split('-').reverse().join('.'))) : ''))
      : (isElagin
          ? (curOwnId === 1 ? '№ СКС-КС-090626 от 09.06.2026 (КС)' : '№ СКС СЗ 090626 от 09.06.2026 (К10)')
          : (isKhomich
              ? (curOwnId === 1 ? '№ 01/07/26-Т от 01.07.2026 (КС)' : '№ СКС Сб от 08.04.2026 (К10)')
              : 'Не привязан к договору'));

    var priceTitle = curSub && curSub.price_list_name
      ? curSub.price_list_name
      : (curOwnId === 1 ? 'Прайс-лист КС (Разовые/СФР)' : 'Приложение №1 (Сбер/К10)');

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

    var contrHeaderHtml = contrName ? (
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
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="window.openContractorContractPickerModal(\'' + escHtml(taskId) + '\',\'' + escHtml(contrName) + '\')" style="font-size:.75rem;color:var(--blue);font-weight:700" title="Сменить договор с юрлицом (К10 / КС) и применить прайс-лист">📑 Сменить договор/прайс</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="openContractorPicker(\'' + escHtml(taskId) + '\')" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : '') + ' style="font-size:.75rem">🔍 Сменить исполнителя</button>' +
            '<button type="button" class="btn btn-sm btn-primary" onclick="openSubcontractWizardModal(\'' + escHtml(taskId) + '\')" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : '') + ' style="font-size:.75rem">🪄 Мастер поручения</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" style="color:var(--red);border:1px solid #fca5a5;font-size:.75rem" onclick="if(window.removeContractorFromTask)window.removeContractorFromTask(\'' + escHtml(taskId) + '\')">❌ Убрать подрядчика</button>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid #e2e8f0">' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="window.exportDoc(\'app2\',\'' + escHtml(taskId) + '\',\'' + escHtml(contrName) + '\')" style="font-size:.75rem" title="Сформировать Заказ-наряд (Приложение №2)">📄 Заказ-наряд</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="window.exportDoc(\'act\',\'' + escHtml(taskId) + '\',\'' + escHtml(contrName) + '\')" style="font-size:.75rem" title="Сформировать Акт сдачи-приемки КС-2">✅ Акт КС-2</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="window.exportDoc(\'invoice\',\'' + escHtml(taskId) + '\',\'' + escHtml(contrName) + '\')" style="font-size:.75rem" title="Сформировать Счет на оплату">💰 Счет на оплату</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="openAccessLetterModal(\'' + escHtml(taskId) + '\')" style="font-size:.75rem" title="Сформировать официальное письмо на допуск">🪪 Письмо на допуск</button>' +
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

    var curTaxMode = (window._taskSmrTax && window._taskSmrTax[taskId]) || 'usn';

    var taxOptions = [
      { v: 'usn',          l: 'Без НДС (УСН / патент)' },
      { v: 'osno_20_inc',  l: 'В т.ч. НДС 20%' },
      { v: 'osno_20_plus', l: '+ НДС 20% сверху' },
      { v: 'osno_10_inc',  l: 'В т.ч. НДС 10%' },
      { v: 'osno_10_plus', l: '+ НДС 10% сверху' },
      { v: 'usn_5_inc',    l: 'В т.ч. НДС 5% (УСН 2025)' },
      { v: 'usn_5_plus',   l: '+ НДС 5% сверху (УСН 2025)' },
      { v: 'usn_7_inc',    l: 'В т.ч. НДС 7% (УСН 2025)' },
      { v: 'usn_7_plus',   l: '+ НДС 7% сверху (УСН 2025)' },
      { v: 'npd_6',        l: 'Самозанятый (НПД 6%)' },
      { v: 'gph_13',       l: 'Физлицо ГПХ (НДФЛ 13%)' }
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
          '<input type="number" min="0" step="any" value="' + l.qty + '" ' + (!isAccepted ? 'disabled ' : '') + 'style="width:65px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;text-align:center;font-weight:700" oninput="window._updateCardSmrLine(\'' + escHtml(taskId) + '\', ' + idx + ', \'qty\', this.value)">' +
        '</td>' +
        '<td style="padding:6px 8px;text-align:right">' +
          '<input type="number" id="smr_row_price_inp_' + escHtml(taskId) + '_' + idx + '" min="0" step="any" value="' + l.price + '" ' + (!isAccepted ? 'disabled ' : '') + 'style="width:85px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;text-align:right;font-weight:600" oninput="window._updateCardSmrLine(\'' + escHtml(taskId) + '\', ' + idx + ', \'price\', this.value)">' +
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
      tpRowsHtml = '<tr><td colspan="6" style="padding:10px;text-align:center;color:#7e22ce;font-size:.78rem">Дополнительных расходов по объекту нет. Нажмите кнопки ниже для добавления проезда, проживания, бурения или спецтехники.</td></tr>';
    }

    // Расчет финансового баланса:
    // Заказчик (платят нам) → Расход: Подрядчик (СМР) → Расход: Доп. расходы → Нам (Операционный остаток)
    var custAmount = Number(t.amount || 0);
    var taxCalc = window._calculateSmrTaxes(totalSubAmount, curTaxMode);
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

    var calcState = window._getSmrCalcVal(taskId);

    box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        priceListPickerHtml +
        '<button type="button" class="btn btn-sm btn-ghost" ' + (!isAccepted ? 'disabled style="opacity:.6;cursor:not-allowed"' : 'onclick="window._addCustomCardSmrLine(\'' + escHtml(taskId) + '\')"') + ' style="font-size:.78rem;font-weight:600;border:1.5px dashed var(--border);padding:4px 10px">' +
          '+ Произвольная работа' +
        '</button>' +
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
          '<th style="padding:6px 8px;text-align:right;width:100px">Цена (₽)</th>' +
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

    // Интерактивный калькулятор налогов и сметы
    '<div id="smr_tax_calc_box_' + escHtml(taskId) + '" style="border:1.5px solid var(--border);border-radius:8px;background:var(--bg);padding:12px 14px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.03)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:10px">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:1.25rem">🧮</span>' +
          '<div>' +
            '<div style="font-weight:700;font-size:.88rem;color:var(--text);display:flex;align-items:center;gap:6px">' +
              '<span>Калькулятор налогов и сметы СМР</span>' +
            '</div>' +
            '<div id="smr_tax_contractor_hint_' + escHtml(taskId) + '" style="font-size:.74rem;color:var(--text-3);margin-top:1px">' +
              'По подрядчику: <b>' + escHtml(contrTaxHint) + '</b>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:.78rem;font-weight:600;color:var(--text-2)">Режим налогообложения:</span>' +
          '<select id="smr_tax_mode_' + escHtml(taskId) + '" ' + (!isAccepted ? 'disabled ' : '') + 'onchange="window._onSmrTaxModeChange(\'' + escHtml(taskId) + '\', this.value)" style="padding:4px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem;font-weight:700;background:#fff;color:var(--text)">' +
            taxOptions.map(function(opt){
              return '<option value="' + opt.v + '"' + (curTaxMode === opt.v ? ' selected' : '') + '>' + opt.l + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
      '</div>' +

      // Блок живого расчета и формул
      '<div style="background:#fff;border:1.5px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
          '<div style="font-size:.76rem;font-weight:700;color:var(--text-2);display:flex;align-items:center;gap:6px">' +
            '<span>📐 Живой расчет сметы и формулы (дробные числа, проценты, коэффициенты):</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;font-size:.72rem;color:var(--text-3)">' +
            '<span>Быстрый ввод:</span>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._smrCalcSetVal(\'' + escHtml(taskId) + '\', \'spec\')" style="padding:2px 6px;font-size:.72rem" title="Затянуть сумму из текущей сметы">📥 Из сметы (' + window.fmtMoneyPrecise(totalSubAmount) + ')</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._smrCalcSetVal(\'' + escHtml(taskId) + '\', \'customer\')" style="padding:2px 6px;font-size:.72rem" title="Затянуть сумму от Заказчика">📥 От Заказчика (' + window.fmtMoneyPrecise(custAmount) + ')</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" onclick="window._smrCalcSetVal(\'' + escHtml(taskId) + '\', \'clear\')" style="padding:2px 6px;font-size:.72rem" title="Очистить поле ввода">✕ Очистить</button>' +
          '</div>' +
        '</div>' +

        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:240px">' +
            '<input type="text" id="smr_calc_input_' + escHtml(taskId) + '" value="' + escHtml(calcState.expr || '') + '" oninput="window._onSmrCalcInput(\'' + escHtml(taskId) + '\', this.value)" placeholder="Например: 2500 * 4.5 или 14963 / 1.2 или 12500 - 15%" style="width:100%;padding:6px 12px;font-size:.92rem;font-family:monospace;font-weight:700;border:1.5px solid var(--border);border-radius:6px;background:#f8fafc;color:var(--text)" />' +
          '</div>' +
          '<div id="smr_calc_result_pill_' + escHtml(taskId) + '" style="padding:6px 14px;border-radius:6px;font-weight:800;font-size:.95rem;background:#f0fdf4;border:1.5px solid #86efac;color:#15803d;white-space:nowrap;min-width:140px;text-align:center">' +
            '= ' + window.fmtMoneyPrecise(calcState.val !== null ? calcState.val : 0) +
          '</div>' +
          '<button type="button" class="btn btn-sm btn-primary" ' + (!isAccepted ? 'disabled ' : '') + 'onclick="window._applyCalcToSpec(\'' + escHtml(taskId) + '\')" style="white-space:nowrap;font-weight:700;padding:6px 14px" title="Перенести результат калькулятора в спецификацию сметы">' +
            '✓ Применить в смету' +
          '</button>' +
        '</div>' +

        '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)">' +
          '<span style="font-size:.72rem;font-weight:700;color:var(--text-3);margin-right:2px">Быстрые действия:</span>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window._smrCalcApplyOp(\'' + escHtml(taskId) + '\', \'+20%\')" style="font-size:.72rem;padding:2px 6px">+20% сверху</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window._smrCalcApplyOp(\'' + escHtml(taskId) + '\', \'/1.2\')" style="font-size:.72rem;padding:2px 6px">В т.ч. 20% (/1.2)</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window._smrCalcApplyOp(\'' + escHtml(taskId) + '\', \'-10%\')" style="font-size:.72rem;padding:2px 6px">-10% Генподряд</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window._smrCalcApplyOp(\'' + escHtml(taskId) + '\', \'-15%\')" style="font-size:.72rem;font-weight:700;padding:2px 6px">-15% Генподряд</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window._smrCalcApplyOp(\'' + escHtml(taskId) + '\', \'-20%\')" style="font-size:.72rem;padding:2px 6px">-20% Генподряд</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window._smrCalcApplyOp(\'' + escHtml(taskId) + '\', \'-6%\')" style="font-size:.72rem;padding:2px 6px">НПД 6% (Самозанятый)</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window._smrCalcApplyOp(\'' + escHtml(taskId) + '\', \'-13%\')" style="font-size:.72rem;padding:2px 6px">ГПХ 13% (НДФЛ)</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window._smrCalcApplyOp(\'' + escHtml(taskId) + '\', \'/1.05\')" style="font-size:.72rem;padding:2px 6px">В т.ч. УСН 5%</button>' +
          '<button type="button" class="btn btn-xs btn-ghost" onclick="window._smrCalcApplyOp(\'' + escHtml(taskId) + '\', \'/1.07\')" style="font-size:.72rem;padding:2px 6px">В т.ч. УСН 7%</button>' +
        '</div>' +
      '</div>' +

      // Сценарный блок сравнения налоговых режимов
      '<div style="margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<span style="font-weight:700;font-size:.75rem;color:var(--text-2);text-transform:uppercase">Сравнение сценариев налогообложения для рассчитанной суммы:</span>' +
          '<span style="font-size:.72rem;color:var(--text-3)">Кликните «Выбрать» в строке для переключения режима</span>' +
        '</div>' +
        '<div id="smr_scenarios_table_container_' + escHtml(taskId) + '" style="border:1px solid var(--border);border-radius:6px;overflow-x:auto;background:#fff">' +
          window._renderSmrScenariosTableHtml(taskId, calcState.val !== null ? calcState.val : totalSubAmount) +
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
          '<div id="smr_tax_total_with_' + escHtml(taskId) + '" style="font-size:1.15rem;font-weight:800;color:var(--primary);margin-top:2px">' + window.fmtMoneyPrecise(taxCalc.totalWithTax) + '</div>' +
          '<div style="font-size:.68rem;color:var(--text-3)">с учетом налога / к перечислению</div>' +
        '</div>' +
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
          '💾 Сохранить спецификацию и смету' +
        '</button>' +
      '</div>' +
    '</div>';
  };

  // Мгновенный пересчет сумм и финансового баланса без перерисовки DOM (сохраняет фокус ввода)
  window._refreshSmrCalculations = function(taskId) {
    var spec = (window._taskSmrSpec && window._taskSmrSpec[taskId]) || [];
    var thirdParty = (window._taskThirdPartySpec && window._taskThirdPartySpec[taskId]) || [];
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};

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

    var curTaxMode = (window._taskSmrTax && window._taskSmrTax[taskId]) || 'usn';
    var taxCalc = window._calculateSmrTaxes(totalSubAmount, curTaxMode);

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

    // Обновляем сценарную таблицу, если пользователь не вводит формулу прямо сейчас в инпут
    var scenCont = document.getElementById('smr_scenarios_table_container_' + taskId);
    var calcInp = document.getElementById('smr_calc_input_' + taskId);
    if (scenCont && document.activeElement !== calcInp) {
      var calcState = window._taskSmrCalc && window._taskSmrCalc[taskId];
      var baseVal = (calcState && calcState.val !== null && calcState.val > 0) ? calcState.val : totalSubAmount;
      scenCont.innerHTML = window._renderSmrScenariosTableHtml(taskId, baseVal);
    }
  };

  window._toggleSmrAddMenu = function(taskId) {
    var m = document.getElementById('smr_add_menu_' + taskId);
    if (m) m.style.display = (m.style.display === 'none' ? 'block' : 'none');
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
    window._renderCardSmrTable(taskId);
  };

  window._removeCardSmrLine = function(taskId, idx) {
    var spec = window._taskSmrSpec && window._taskSmrSpec[taskId];
    if (!spec) return;
    spec.splice(idx, 1);
    window._renderCardSmrTable(taskId);
  };

  window._addCardSmrLine = function(taskId, itemKey) {
    window._taskSmrSpec = window._taskSmrSpec || {};
    if (!window._taskSmrSpec[taskId]) window._taskSmrSpec[taskId] = [];
    var spec = window._taskSmrSpec[taskId];
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};

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
    window._renderCardSmrTable(taskId);
  };

  window._onSmrOwnCompanyChange = function(taskId, ownCompanyId) {
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); });
    if (t) t.own_company_id = Number(ownCompanyId);
    window.renderCardSmrCalculator(taskId);
  };

  window._saveCardSmrSpec = function(taskId) {
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); });
    if (!t) return;
    var spec = window._taskSmrSpec && window._taskSmrSpec[taskId] ? window._taskSmrSpec[taskId] : [];
    var totalBaseAmount = spec.reduce(function(acc, l){ return acc + (Number(l.sum) || 0); }, 0);
    var thirdParty = window._taskThirdPartySpec && window._taskThirdPartySpec[taskId] ? window._taskThirdPartySpec[taskId] : [];

    var curTaxMode = (window._taskSmrTax && window._taskSmrTax[taskId]) || 'usn';
    var taxCalc = window._calculateSmrTaxes(totalBaseAmount, curTaxMode);

    var curSub = (window._curCardSubcontracts || [])[0] || null;
    var cName = (curSub && curSub.contractor_name) || t.contractor || '';
    if (!cName) {
      alert('Пожалуйста, сначала назначьте исполнителя СМР (подрядчика)!');
      return;
    }

    var cObj = (S.contractors || []).find(function(c){ return c.name_short === cName; });
    var ownId = t.own_company_id || (t.customer && t.customer.toLowerCase().includes('сбер') ? 2 : 1);
    var ports = 0;
    spec.forEach(function(l){
      if (l.name && l.name.toLowerCase().includes('порт')) ports += (Number(l.qty) || 0);
    });

    var payload = {
      contractor_id: (curSub && curSub.contractor_id) || (cObj ? cObj.id : null),
      contractor_name: cName,
      own_company_id: ownId,
      contractor_contract_id: (curSub && curSub.contractor_contract_id) || null,
      price_list_id: (curSub && curSub.price_list_id) || null,
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
    if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }

    api('/tasks/' + encodeURIComponent(taskId) + '/subcontract-wizard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function(res) {
      showToast('✅ Спецификация и расчет СМР сохранены!', 'success');
      t.price_agreed = taxCalc.totalWithTax;
      t.rawData = t.rawData || {};
      t.rawData.smrTaxDetails = taxCalc;
      if (typeof window.loadCardSubcontracts === 'function') {
        window.loadCardSubcontracts(taskId);
      }
    })
    .catch(function(err) {
      alert('Ошибка сохранения: ' + err.message);
    })
    .finally(function() {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Сохранить спецификацию и смету'; }
    });
  };

  // 4. КОНСТРУКТОР-WIZARD НАЗНАЧЕНИЯ ПОДРЯДЧИКА
  window.openSubcontractWizardModal = function(taskId, editSubId) {
    var old = document.getElementById('_subcontract_wizard_modal');
    if (old) old.remove();

    var targetId = (typeof S !== 'undefined' && S.page === 'kanban') ? ('kcard_' + taskId) : ('task_row_' + taskId);
    if (window.savePageScroll) window.savePageScroll(targetId);

    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
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

      // Блок калькулятора портов и параметров объекта
      html += '<div id="wiz_calc_params_box" style="border:1px solid var(--border);border-radius:8px;padding:12px;background:#f8fafc">' +
        '<div style="font-weight:700;font-size:.82rem;color:var(--text);margin-bottom:8px">Объемы и параметры заявки для Заказ-наряда:</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:8px;margin-bottom:8px">' +
          '<div>' +
            '<label style="display:block;font-size:.74rem;color:var(--text-3);margin-bottom:2px">Кол-во портов</label>' +
            '<input type="number" id="wiz_ports" value="' + defaultPorts + '" min="0" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;font-weight:700" oninput="window._wizUpdateSummary()">' +
          '</div>' +
          '<div>' +
            '<label style="display:block;font-size:.74rem;color:var(--text-3);margin-bottom:2px">Тип порта</label>' +
            '<select id="wiz_port_type" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem" onchange="window._wizUpdateSummary()">' +
              '<option value="port_5e">СКС 5е (2500/3000 ₽)</option>' +
              '<option value="port_6">СКС 6 (3000/3500 ₽)</option>' +
              '<option value="port_6a">СКС 6А (3000/3500 ₽)</option>' +
              '<option value="port_optics">Оптика OS2/OM3 (3000/3500 ₽)</option>' +
              '<option value="port_reinstall">Демонтаж/Монтаж (1000/1200 ₽)</option>' +
            '</select>' +
          '</div>' +
          '<div>' +
            '<label style="display:block;font-size:.74rem;color:var(--text-3);margin-bottom:2px">Шкаф ТКШ</label>' +
            '<select id="wiz_cab" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem" onchange="window._wizUpdateSummary()">' +
              '<option value="">(Без шкафа)</option>' +
              '<option value="tksh_42u">Монтаж напольного 42U (+10 000 ₽)</option>' +
              '<option value="tksh_32u">Монтаж напольного 32U (+8 000 ₽)</option>' +
              '<option value="tksh_18u">Монтаж навесного 18-22U (+6 500 ₽)</option>' +
              '<option value="tksh_swap">Замена ТКШ (+10 000 ₽)</option>' +
            '</select>' +
          '</div>' +
          '<div>' +
            '<label style="display:block;font-size:.74rem;color:var(--text-3);margin-bottom:2px">Удаленность (км)</label>' +
            '<input type="number" id="wiz_km" value="' + defaultKm + '" min="0" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem" oninput="window._wizUpdateSummary()">' +
          '</div>' +
        '</div>' +
        '<div style="background:#fff;border:1px dashed #3b82f6;border-radius:6px;padding:8px 10px;margin-top:8px;margin-bottom:8px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
            '<label style="font-size:.76rem;font-weight:700;color:var(--text)">Индивидуальная договорная цена (ручной ввод):</label>' +
            '<span class="t3" style="font-size:.68rem">Необязательно — если сумма оговорена индивидуально</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
            '<div>' +
              '<input type="number" id="wiz_manual_rate" placeholder="Ставка за порт (₽)" style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;font-size:.82rem" oninput="window._wizUpdateSummary(\'manual_rate\')">' +
            '</div>' +
            '<div>' +
              '<input type="number" id="wiz_manual_total" placeholder="Или фиксированная сумма (₽)" style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;font-size:.82rem;font-weight:700" oninput="window._wizUpdateSummary(\'manual_total\')">' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="wiz_calc_summary" style="font-weight:700;font-size:.92rem;color:var(--blue);text-align:right">Итого к начислению: 0 ₽</div>' +
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

    var ports = document.getElementById('wiz_ports') ? parseFloat(document.getElementById('wiz_ports').value) || 0 : 0;
    var portType = document.getElementById('wiz_port_type') ? document.getElementById('wiz_port_type').value : 'port_5e';
    var cab = document.getElementById('wiz_cab') ? document.getElementById('wiz_cab').value : '';
    var km = document.getElementById('wiz_km') ? document.getElementById('wiz_km').value : 0;

    var mRateEl = document.getElementById('wiz_manual_rate');
    var mTotalEl = document.getElementById('wiz_manual_total');
    var mRate = mRateEl ? (parseFloat(mRateEl.value) || 0) : 0;
    var mTotal = mTotalEl ? (parseFloat(mTotalEl.value) || 0) : 0;

    if (src === 'manual_rate' && mRate > 0) {
      mTotal = Math.round(mRate * (ports || 1));
      if (mTotalEl) mTotalEl.value = mTotal;
    } else if (src === 'manual_total' && mTotal > 0 && ports > 0) {
      mRate = Math.round(mTotal / ports);
      if (mRateEl) mRateEl.value = mRate;
    }

    var res = calcSmrLocal({
      ports: ports,
      portType: portType,
      cabinetType: cab,
      distanceKm: km
    });

    if (mTotal > 0) {
      sumEl.innerHTML = 'По базовому прайсу: <span style="text-decoration:line-through;opacity:.65">' + fmtMoney(res.totalAmount) + '</span> → <span style="color:var(--green)">Согласовано вручную: ' + fmtMoney(mTotal) + '</span>';
    } else {
      sumEl.innerHTML = 'Расчет по прайсу: <span style="color:var(--blue)">' + fmtMoney(res.totalAmount) + '</span>' +
        (res.transportAmount > 0 ? (' <span class="t3" style="font-size:.75rem">(в т.ч. выезд ' + fmtMoney(res.transportAmount) + ')</span>') : '');
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

    var ports = document.getElementById('wiz_ports') ? parseInt(document.getElementById('wiz_ports').value, 10) : 0;
    var portType = document.getElementById('wiz_port_type') ? document.getElementById('wiz_port_type').value : 'port_5e';
    var cab = document.getElementById('wiz_cab') ? document.getElementById('wiz_cab').value : '';
    var km = document.getElementById('wiz_km') ? parseFloat(document.getElementById('wiz_km').value) : 0;

    var calcRes = calcSmrLocal({
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
        priceListId = bestC.price_list_id;
      }
    } else if (mode === 'new') {
      ownCompanyId = document.getElementById('wiz_new_own_company') ? parseInt(document.getElementById('wiz_new_own_company').value, 10) : null;
    }

    var mTotal = document.getElementById('wiz_manual_total') ? parseFloat(document.getElementById('wiz_manual_total').value) : 0;
    var mRate = document.getElementById('wiz_manual_rate') ? parseFloat(document.getElementById('wiz_manual_rate').value) : 0;
    if (mTotal > 0) {
      finalPrice = mTotal;
      calcDetails = Object.assign({}, calcRes, { manualOverride: { total: mTotal, rate: mRate, originalCalc: calcRes.totalAmount } });
    } else if (mRate > 0) {
      finalPrice = Math.round(mRate * (ports || 1));
      calcDetails = Object.assign({}, calcRes, { manualOverride: { total: finalPrice, rate: mRate, originalCalc: calcRes.totalAmount } });
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
