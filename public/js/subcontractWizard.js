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

    // Транспортные расходы: выезд свыше 10 км
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

  window.renderCardSmrCalculator = function(taskId) {
    var cont = document.getElementById('cardSmrCalculatorBlock');
    if (!cont) return;

    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); });
    if (!t) return;

    var curSub = (window._curCardSubcontracts || [])[0] || null;
    var contrName = (curSub && curSub.contractor_name) || t.contractor || '';
    var contrObj = contrName ? (S.contractors || []).find(function(c){ return c.name_short === contrName; }) : null;

    // Инициализация спецификации (одна работа = одна строка)
    if (!window._taskSmrSpec[taskId]) {
      if (curSub && curSub.calculation_details && Array.isArray(curSub.calculation_details.lines) && curSub.calculation_details.lines.length) {
        window._taskSmrSpec[taskId] = JSON.parse(JSON.stringify(curSub.calculation_details.lines));
      } else {
        var defaultPorts = parseInt(t.fact || t.in_order || 1, 10) || 1;
        var pPrice = defaultPorts > 3 ? 2500 : 3000;
        var specLines = [
          {
            name: 'Базовая стоимость работ 1 порт СКС 5е' + (defaultPorts > 3 ? ' (шкала >3 шт)' : ' (шкала 1-3 шт)'),
            qty: defaultPorts,
            unit: 'порт',
            price: pPrice,
            sum: defaultPorts * pPrice
          }
        ];
        var km = parseFloat(t.distance_km || 0);
        if (km > 10) {
          var billableKm = Math.round(km - 10);
          specLines.push({
            name: 'Транспортные расходы (компенсация проезда свыше 10 км)',
            qty: billableKm,
            unit: 'км',
            price: 12,
            sum: billableKm * 12
          });
        }
        window._taskSmrSpec[taskId] = specLines;
      }
    }

    // Определяем привязанное собственное юрлицо (Генподрядчик)
    var curOwnId = t.own_company_id || (t.customer && t.customer.toLowerCase().includes('сбер') ? 2 : 1);
    var ownList = S.ownCompanies || [];

    // Данные по договору субподряда
    var contractTitle = curSub && curSub.contract_number 
      ? ('№ ' + escHtml(curSub.contract_number) + (curSub.contract_date ? (' от ' + escHtml(String(curSub.contract_date).slice(0,10).split('-').reverse().join('.'))) : ''))
      : (contrName && contrName.includes('Елагин') ? '№ СКС СЗ 090626 от 09.06.2026' : (contrName && contrName.includes('Хомич') ? '№ СКС Сб от 08.04.2026' : 'Не привязан к договору'));

    // Адрес и маршрут на Яндекс.Картах
    var taskAddr = String(t.address || '').trim();
    var taskReg = String(t.region || '').trim();
    var baseCity = taskReg ? ('г. ' + taskReg.replace(/область|обл\.|край|респ\.|республика/gi, '').trim()) : 'База';
    var yandexRouteUrl = 'https://yandex.ru/maps/?rtext=' + encodeURIComponent(baseCity) + '~' + encodeURIComponent(taskAddr || taskReg) + '&rtt=auto';

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
              '<span>Прайс: <b>Приложение №1 (Сбер)</b></span>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="openContractorPicker(\'' + escHtml(taskId) + '\')" style="font-size:.75rem">🔍 Сменить исполнителя</button>' +
            '<button type="button" class="btn btn-sm btn-primary" onclick="openSubcontractWizardModal(\'' + escHtml(taskId) + '\')" style="font-size:.75rem">🪄 Мастер поручения</button>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid #e2e8f0">' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="exportDoc(\'app2\',\'' + escHtml(taskId) + '\',\'' + escHtml(contrName) + '\')" style="font-size:.75rem" title="Сформировать Заказ-наряд (Приложение №2)">📄 Заказ-наряд</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="exportDoc(\'act\',\'' + escHtml(taskId) + '\',\'' + escHtml(contrName) + '\')" style="font-size:.75rem" title="Сформировать Акт сдачи-приемки КС-2">✅ Акт КС-2</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="exportDoc(\'invoice\',\'' + escHtml(taskId) + '\',\'' + escHtml(contrName) + '\')" style="font-size:.75rem" title="Сформировать Счет на оплату">💰 Счет на оплату</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="openAccessLetterModal(\'' + escHtml(taskId) + '\')" style="font-size:.75rem" title="Сформировать официальное письмо на допуск">🪪 Письмо на допуск</button>' +
        '</div>' +
      '</div>'
    ) : (
      '<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">' +
        '<div>' +
          '<div style="font-weight:700;color:#92400e;font-size:.9rem">Исполнитель СМР еще не назначен</div>' +
          '<div style="font-size:.78rem;color:#b45309;margin-top:2px">Назначьте субподрядчика для расчета сметы и формирования заказ-наряда</div>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-primary" onclick="openSubcontractWizardModal(\'' + escHtml(taskId) + '\')">+ Назначить исполнителя</button>' +
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

      contrHeaderHtml +

      // Контейнер с таблицей спецификации
      '<div id="card_smr_spec_table_box"></div>' +
    '</div>';

    cont.innerHTML = html;
    window._renderCardSmrTable(taskId);
  };

  // 3. Рендеринг таблицы спецификации СМР
  window._renderCardSmrTable = function(taskId) {
    var box = document.getElementById('card_smr_spec_table_box');
    if (!box) return;

    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); }) || {};
    var spec = window._taskSmrSpec && window._taskSmrSpec[taskId] ? window._taskSmrSpec[taskId] : [];

    var curOwnId = t.own_company_id || (t.customer && t.customer.toLowerCase().includes('сбер') ? 2 : 1);
    var ownList = S.ownCompanies || [];

    var totalSubAmount = 0;
    var rowsHtml = spec.map(function(l, idx) {
      var rowSum = Math.round((Number(l.qty) || 0) * (Number(l.price) || 0));
      totalSubAmount += rowSum;
      return '<tr style="border-bottom:1px solid var(--border);font-size:.82rem">' +
        '<td style="padding:6px 8px;font-weight:600;color:var(--text-3);text-align:center">' + (idx + 1) + '</td>' +
        '<td style="padding:6px 8px;font-weight:600;color:var(--text)">' + escHtml(l.name) + '</td>' +
        '<td style="padding:6px 8px;text-align:center;color:var(--text-2)">' + escHtml(l.unit || 'шт') + '</td>' +
        '<td style="padding:6px 8px;text-align:center">' +
          '<input type="number" min="0" step="any" value="' + l.qty + '" style="width:65px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;text-align:center;font-weight:700" oninput="window._updateCardSmrLine(\'' + escHtml(taskId) + '\', ' + idx + ', \'qty\', this.value)">' +
        '</td>' +
        '<td style="padding:6px 8px;text-align:right">' +
          '<input type="number" min="0" step="any" value="' + l.price + '" style="width:85px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;text-align:right;font-weight:600" oninput="window._updateCardSmrLine(\'' + escHtml(taskId) + '\', ' + idx + ', \'price\', this.value)">' +
        '</td>' +
        '<td style="padding:6px 8px;text-align:right;font-weight:700;color:var(--text)">' + fmtMoney(rowSum) + '</td>' +
        '<td style="padding:6px 8px;text-align:center">' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="window._removeCardSmrLine(\'' + escHtml(taskId) + '\', ' + idx + ')" style="padding:1px 6px;color:var(--red);font-size:.8rem" title="Удалить позицию">✕</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    if (!spec.length) {
      rowsHtml = '<tr><td colspan="7" style="padding:14px;text-align:center;color:var(--text-3);font-size:.82rem">Спецификация пуста. Нажмите «+ Добавить позицию из прайса» ниже.</td></tr>';
    }

    var custAmount = Number(t.amount || 0);
    var margin = custAmount > 0 ? (custAmount - totalSubAmount) : 0;
    var marginPct = custAmount > 0 ? Math.round((margin / custAmount) * 100) : 0;

    var ownSelectHtml = '<select id="smr_spec_own_company" onchange="window._onSmrOwnCompanyChange(\'' + escHtml(taskId) + '\', this.value)" style="padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.8rem;font-weight:600">' +
      ownList.map(function(oc) {
        var isSel = (oc.id === curOwnId || oc.code === 'K10') ? ' selected' : '';
        return '<option value="' + oc.id + '"' + isSel + '>' + escHtml(oc.name_short) + ' (Директор: ' + escHtml(oc.director || '') + ')</option>';
      }).join('') +
    '</select>';

    var priceListPickerHtml = '<div style="position:relative;display:inline-block">' +
      '<button type="button" class="btn btn-sm btn-ghost" onclick="window._toggleSmrAddMenu(\'' + escHtml(taskId) + '\')" style="color:var(--primary);font-weight:600;border:1.5px solid var(--border);padding:4px 10px;font-size:.78rem">' +
        '+ Добавить позицию из прайса ▾' +
      '</button>' +
      '<div id="smr_add_menu_' + escHtml(taskId) + '" style="display:none;position:absolute;top:100%;left:0;z-index:100;background:#fff;border:1.5px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);min-width:320px;max-height:300px;overflow-y:auto;padding:6px">' +
        '<div style="font-size:.72rem;font-weight:700;color:var(--text-3);padding:4px 8px;text-transform:uppercase">Шкафы ТКШ</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_42u\')">Монтаж напольного ТКШ 42-48U (10 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_32u\')">Монтаж напольного ТКШ 32U (8 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_18u\')">Монтаж навесного ТКШ 18-22U (6 500 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_swap\')">Замена ТКШ с переносом (10 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_demount_42u\')">Демонтаж напольного ТКШ 42U (7 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_demount_18u\')">Демонтаж навесного ТКШ 18-22U (5 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_mod_600\')">Модернизация шкафа (3 000 ₽)</div>' +
        '<div style="font-size:.72rem;font-weight:700;color:var(--text-3);padding:4px 8px;text-transform:uppercase;border-top:1px solid #f1f5f9;margin-top:4px">СКС и Оптика</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'port_optics\')">Оптический порт (дуплекс) OS2/OM3 (3 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'port_reinstall\')">Демонтаж с монтажом за порт (1 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'port_move\')">Перемещение портов (1 500 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'tksh_reterminate\')">Перешивка портов при замене ТКШ (500 ₽/порт)</div>' +
        '<div style="font-size:.72rem;font-weight:700;color:var(--text-3);padding:4px 8px;text-transform:uppercase;border-top:1px solid #f1f5f9;margin-top:4px">Прочее</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'repeat_visit\')">Повторный выезд на объект (3 000 ₽)</div>' +
        '<div style="padding:5px 8px;border-radius:4px;cursor:pointer;font-size:.8rem" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'\'" onclick="window._addCardSmrLine(\'' + escHtml(taskId) + '\', \'custom\')">Произвольная доп. работа (+5 000 ₽)</div>' +
      '</div>' +
    '</div>';

    box.innerHTML = '<div style="overflow-x:auto;border:1.5px solid var(--border);border-radius:6px;margin-bottom:10px">' +
      '<table style="width:100%;border-collapse:collapse;text-align:left">' +
        '<thead><tr style="background:var(--bg);font-size:.76rem;color:var(--text-3);border-bottom:1px solid var(--border)">' +
          '<th style="padding:6px 8px;width:35px;text-align:center">№</th>' +
          '<th style="padding:6px 8px">Наименование работы / позиции прайс-листа</th>' +
          '<th style="padding:6px 8px;text-align:center;width:60px">Ед.</th>' +
          '<th style="padding:6px 8px;text-align:center;width:80px">Кол-во</th>' +
          '<th style="padding:6px 8px;text-align:right;width:100px">Тариф (₽)</th>' +
          '<th style="padding:6px 8px;text-align:right;width:110px">Сумма (₽)</th>' +
          '<th style="padding:6px 8px;text-align:center;width:40px"></th>' +
        '</tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
    '</div>' +

    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">' +
      '<div>' + priceListPickerHtml + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="font-size:.78rem;color:var(--text-2)">Генподрядчик группы:</span>' +
        ownSelectHtml +
      '</div>' +
    '</div>' +

    // Финансовая сводка
    '<div style="background:#f1f5f9;border:1.5px solid var(--border);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">' +
      '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
        (custAmount > 0 ? ('<div style="font-size:.82rem">Вход от Заказчика: <b style="color:var(--text)">' + fmtMoney(custAmount) + '</b></div>') : '') +
        '<div style="font-size:.9rem;font-weight:700">Итого Субподрядчику: <span style="color:var(--blue)">' + fmtMoney(totalSubAmount) + '</span></div>' +
        (custAmount > 0 ? ('<div style="font-size:.84rem;font-weight:700;color:' + (margin >= 0 ? '#16a34a' : '#dc2626') + '">Плановая маржа: ' + fmtMoney(margin) + ' (' + marginPct + '%)</div>') : '') +
      '</div>' +
      '<div>' +
        '<button type="button" class="btn btn-sm btn-primary" id="save_smr_spec_btn" onclick="window._saveCardSmrSpec(\'' + escHtml(taskId) + '\')" style="padding:6px 14px;font-weight:700">' +
          '💾 Сохранить спецификацию и смету' +
        '</button>' +
      '</div>' +
    '</div>';
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
    } else if (field === 'price') {
      spec[idx].price = Math.max(0, parseFloat(val) || 0);
    }
    spec[idx].sum = Math.round(spec[idx].qty * spec[idx].price);
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

    var catalog = {
      tksh_42u: { name: 'Монтаж напольного ТКШ 42-48U', qty: 1, unit: 'шт', price: 10000 },
      tksh_32u: { name: 'Монтаж напольного ТКШ 32U', qty: 1, unit: 'шт', price: 8000 },
      tksh_18u: { name: 'Монтаж навесного ТКШ 18-22U', qty: 1, unit: 'шт', price: 6500 },
      tksh_swap: { name: 'Замена ТКШ с перемонтажом оборудования', qty: 1, unit: 'шт', price: 10000 },
      tksh_reterminate: { name: 'Перешивка портов при замене ТКШ (за порт)', qty: 10, unit: 'порт', price: 500 },
      tksh_demount_42u: { name: 'Демонтаж напольного ТКШ 42U', qty: 1, unit: 'шт', price: 7000 },
      tksh_demount_18u: { name: 'Демонтаж навесного ТКШ до 22U', qty: 1, unit: 'шт', price: 5000 },
      tksh_mod_600: { name: 'Модернизация шкафа 600мм', qty: 1, unit: 'шт', price: 3000 },
      port_optics: { name: 'Монтаж оптического порта (дуплекс) OS2/OM3', qty: 2, unit: 'порт', price: 3000 },
      port_reinstall: { name: 'Демонтаж с последующим монтажом за порт', qty: 1, unit: 'порт', price: 1000 },
      port_move: { name: 'Перемещение/восстановление портов', qty: 1, unit: 'порт', price: 1500 },
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
  };

  window._saveCardSmrSpec = function(taskId) {
    var t = (S.tasks || []).find(function(x) { return String(x.id) === String(taskId); });
    if (!t) return;
    var spec = window._taskSmrSpec && window._taskSmrSpec[taskId] ? window._taskSmrSpec[taskId] : [];
    var totalAmount = spec.reduce(function(acc, l){ return acc + (Number(l.sum) || 0); }, 0);

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
      price_agreed: totalAmount,
      deadline: t.deadline || null,
      calculation_details: { lines: spec },
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
            '<span>🤝 Конструктор поручения субподрядчику</span>' +
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
        t.amount = finalPrice;
        if (!t.rawData) t.rawData = {};
        t.rawData.subRate = mRate || (ports > 0 ? Math.round(finalPrice / ports) : finalPrice);
        t.rawData.subTotal = finalPrice;
      }

      var modalEl = document.getElementById('_subcontract_wizard_modal');
      if (modalEl) modalEl.remove();

      // Обновляем блоки на карточке
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
