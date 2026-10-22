// public/js/pages/subcontracts.js
// Справочники «Договоры субподряда» и «Прайсы субподряда»
// Сквозная связка расценок с калькулятором сметы СМР и заявками

(function() {
  'use strict';

  // ─── 1. ХЕЛПЕРЫ И ПОИСК ПРАЙС-ЛИСТА ДЛЯ ЗАЯВКИ (УНИВЕРСАЛЬНЫЙ МОСТ) ─────────

  /**
   * Поиск наиболее подходящего прайс-листа субподряда:
   * 1. Ищет персональный прайс для указанного исполнителя (по contractorId или contractId)
   * 2. Если у исполнителя несколько прайсов — матчит по тэгу заказчика (например, Сбербанк vs Общий)
   * 3. Если персонального нет — берет базовый прайс по умолчанию (is_default)
   * 4. Fallback: первый активный прайс из справочника
   */
  window.findSubcontractPriceList = function(contractorId, customerTag) {
    var pricelists = S.subPricelists || [];
    if (!pricelists.length) return null;

    var cId = contractorId ? parseInt(contractorId, 10) : null;
    var custLower = String(customerTag || '').trim().toLowerCase();
    var isSber = custLower.includes('сбер') || custLower.includes('sber');

    // 1. Поиск персонального прайса конкретного исполнителя
    if (cId) {
      var contractorLists = pricelists.filter(function(pl) {
        return pl.is_active && (pl.contractor_id === cId || pl.effective_contractor_id === cId);
      });

      if (contractorLists.length === 1) {
        return contractorLists[0];
      }
      if (contractorLists.length > 1) {
        if (isSber) {
          var sberPl = contractorLists.find(function(pl) {
            var tag = String(pl.customer_tag || pl.name || '').toLowerCase();
            return tag.includes('сбер') || tag.includes('sber');
          });
          if (sberPl) return sberPl;
        } else {
          var nonSberPl = contractorLists.find(function(pl) {
            var tag = String(pl.customer_tag || pl.name || '').toLowerCase();
            return !tag.includes('сбер') && !tag.includes('sber');
          });
          if (nonSberPl) return nonSberPl;
        }
        return contractorLists[0];
      }
    }

    // 2. Поиск базового прайса по умолчанию
    var defPl = pricelists.find(function(pl) { return pl.is_default && pl.is_active; });
    if (defPl) return defPl;

    // 3. Fallback: первый активный
    var anyActive = pricelists.find(function(pl) { return pl.is_active; });
    return anyActive || pricelists[0] || null;
  };

  /**
   * Получить динамический расчет СМР на основе данных из справочника «Прайсы субподряда»
   */
  window.getSubcontractCalculation = function(params) {
    params = params || {};
    var customPrice = (params.customPrice !== undefined && params.customPrice !== '' && params.customPrice !== null) ? parseFloat(params.customPrice) : null;

    // Фиксированная договорная цена
    if (customPrice !== null && !isNaN(customPrice) && customPrice > 0 && params.pricingMode === 'custom') {
      return {
        totalAmount: customPrice,
        worksAmount: customPrice,
        transportAmount: 0,
        priceListName: 'Фиксированная договорная цена',
        lines: [
          { name: params.customDesc || 'Согласованная стоимость работ по договору', qty: 1, unit: 'объект', price: customPrice, sum: customPrice }
        ]
      };
    }

    var pl = window.findSubcontractPriceList(params.contractorId, params.customerTag);
    var items = (pl && Array.isArray(pl.items)) ? pl.items : [];

    // Хелпер для поиска позиции прайса
    function findItem(code) {
      return items.find(function(it) { return it.work_code === code; });
    }

    var ports = parseInt(params.ports, 10) || 0;
    var portType = params.portType || 'port_5e';
    var distanceKm = parseFloat(params.distanceKm) || 0;
    var cabinetType = params.cabinetType || '';

    var lines = [];
    var worksAmount = 0;
    var transportAmount = 0;

    // 1. Расчет портов
    if (ports > 0) {
      var itPort = findItem(portType) || findItem('port_5e');
      var t1 = itPort ? Number(itPort.price_tier_1 || 3000) : 3000;
      var t2 = itPort ? Number(itPort.price_tier_2 || 2500) : 2500;
      var th = itPort ? Number(itPort.tier_threshold || 3) : 3;
      var pName = itPort ? itPort.work_name : 'Монтаж порта СКС';

      var unitP = ports > th ? t2 : t1;
      var pSum = ports * unitP;
      lines.push({
        name: pName + (ports > th ? ' (шкала: >' + th + ' шт)' : ' (шкала: 1–' + th + ' шт)'),
        qty: ports,
        unit: 'шт',
        price: unitP,
        sum: pSum
      });
      worksAmount += pSum;
    }

    // 2. Расчет шкафа ТКШ
    if (cabinetType) {
      var itCab = findItem(cabinetType);
      if (itCab) {
        var cabPrice = Number(itCab.price_tier_1 || 0);
        lines.push({
          name: itCab.work_name,
          qty: 1,
          unit: itCab.unit || 'шт',
          price: cabPrice,
          sum: cabPrice
        });
        worksAmount += cabPrice;
      }
    }

    // 3. Расчет транспорта
    var itKmRate = findItem('km_rate');
    var itKmCity = findItem('km_city');
    var kmRateVal = itKmRate ? Number(itKmRate.price_tier_1 || 12) : 12;
    var kmCityVal = itKmCity ? Number(itKmCity.price_tier_1 || 300) : 300;

    if (distanceKm > 10) {
      var billableKm = Math.round(distanceKm - 10);
      var kmSum = billableKm * kmRateVal;
      lines.push({
        name: 'Транспортные расходы (свыше 10 км: ' + billableKm + ' км × ' + kmRateVal + ' ₽)',
        qty: billableKm,
        unit: 'км',
        price: kmRateVal,
        sum: kmSum
      });
      transportAmount += kmSum;
    } else if (distanceKm > 0) {
      lines.push({
        name: 'Выезд внутри города (<10 км)',
        qty: 1,
        unit: 'выезд',
        price: kmCityVal,
        sum: kmCityVal
      });
      transportAmount += kmCityVal;
    }

    return {
      totalAmount: worksAmount + transportAmount,
      worksAmount: worksAmount,
      transportAmount: transportAmount,
      priceListId: pl ? pl.id : null,
      priceListName: pl ? pl.name : 'Базовый типовой прайс',
      lines: lines
    };
  };

  // ─── 2. СТРАНИЦА: «ДОГОВОРЫ СУБПОДРЯДА» ─────────────────────────────────────

  window.pageSubContracts = function() {
    var contracts = S.subContracts || [];
    var q = String(S.subContractSearch || '').trim().toLowerCase();
    var filterStatus = S.subContractStatus || 'all';
    var filterCompany = S.subContractCompany || 'all';
    var filterContractor = S.subContractContractor || 'all';

    // Фильтрация
    var filtered = contracts.filter(function(c) {
      if (filterStatus !== 'all' && (c.status || 'active') !== filterStatus) return false;
      if (filterCompany !== 'all' && String(c.own_company_id) !== String(filterCompany)) return false;
      if (filterContractor !== 'all' && String(c.contractor_id) !== String(filterContractor)) return false;
      if (q) {
        var match = (c.contract_number && c.contract_number.toLowerCase().includes(q)) ||
                    (c.title && c.title.toLowerCase().includes(q)) ||
                    (c.contractor_name && c.contractor_name.toLowerCase().includes(q)) ||
                    (c.contractor_inn && c.contractor_inn.includes(q)) ||
                    (c.subject && c.subject.toLowerCase().includes(q)) ||
                    (c.customer_tag && c.customer_tag.toLowerCase().includes(q)) ||
                    (c.territory && c.territory.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });

    // Сводка
    var totalCount = contracts.length;
    var activeCount = contracts.filter(function(c) { return (c.status || 'active') === 'active'; }).length;
    var withPriceCount = contracts.filter(function(c) { return Boolean(c.price_list_id); }).length;
    var ownCount = (S.ownCompanies || []).length || 3;

    // Опции фильтров
    var ownOpts = (S.ownCompanies || []).map(function(oc) {
      return '<option value="' + oc.id + '" ' + (String(filterCompany) === String(oc.id) ? 'selected' : '') + '>' + escHtml(oc.name_short) + '</option>';
    }).join('');

    var subContractors = (S.contractors || []).filter(function(c) {
      return c && c.type !== 'customer' && !String(c.inn || '').startsWith('CUST-');
    });

    var contractorOpts = subContractors.map(function(c) {
      return '<option value="' + c.id + '" ' + (String(filterContractor) === String(c.id) ? 'selected' : '') + '>' + escHtml(c.name_short) + '</option>';
    }).join('');

    return '<div style="animation:fadeIn 0.15s ease; padding:4px 4px 28px 4px">' +
      // Заголовок
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;margin-bottom:1.5rem">' +
        '<div>' +
          '<h1 class="page-title" style="margin:0;display:flex;align-items:center;gap:10px;font-size:1.45rem;font-weight:800"><span>📑 Договоры субподряда</span></h1>' +
          '<div style="font-size:.84rem;color:var(--text-3);margin-top:4px">' +
            'Реестр договоров и соглашений с исполнителями СМР. Закрепление юрлиц группы (ООО «КС», ООО «К10», ООО «Ультима») и привязанных прайсов' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:10px;align-items:center">' +
          '<button type="button" class="btn btn-sm btn-ghost" style="border:1.5px solid var(--border);padding:8px 14px;border-radius:8px;font-weight:600" onclick="go(\'sub_pricelists\')">📊 Прайсы субподряда →</button>' +
          '<button type="button" class="btn btn-sm btn-primary" style="padding:8px 18px;font-weight:700;border-radius:8px" onclick="openSubContractModal()">+ Новый договор субподряда</button>' +
        '</div>' +
      '</div>' +

      // Сводные карточки
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:14px;margin-bottom:1.5rem">' +
        '<div class="card" style="padding:16px 20px;border-radius:12px;border:1.5px solid var(--border);background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.03)">' +
          '<div style="font-size:.74rem;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:.03em">Всего договоров</div>' +
          '<div style="font-size:1.75rem;font-weight:800;color:var(--text);margin-top:6px">' + totalCount + '</div>' +
          '<div style="font-size:.74rem;color:var(--text-3);margin-top:4px">В справочнике компании</div>' +
        '</div>' +
        '<div class="card" style="padding:16px 20px;border-radius:12px;border:1.5px solid #86efac;background:#f0fdf4;box-shadow:0 2px 8px rgba(22,101,52,0.04)">' +
          '<div style="font-size:.74rem;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.03em">Действующие</div>' +
          '<div style="font-size:1.75rem;font-weight:800;color:#15803d;margin-top:6px">' + activeCount + '</div>' +
          '<div style="font-size:.74rem;color:#166534;margin-top:4px">Готовы к назначению в заявки</div>' +
        '</div>' +
        '<div class="card" style="padding:16px 20px;border-radius:12px;border:1.5px solid #bfdbfe;background:#eff6ff;box-shadow:0 2px 8px rgba(30,64,175,0.04)">' +
          '<div style="font-size:.74rem;color:#1e40af;font-weight:700;text-transform:uppercase;letter-spacing:.03em">С привязанным прайсом</div>' +
          '<div style="font-size:1.75rem;font-weight:800;color:#1d4ed8;margin-top:6px">' + withPriceCount + '</div>' +
          '<div style="font-size:.74rem;color:#1e40af;margin-top:4px">Авторасчет сметы включен</div>' +
        '</div>' +
        '<div class="card" style="padding:16px 20px;border-radius:12px;border:1.5px solid var(--border);background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.03)">' +
          '<div style="font-size:.74rem;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:.03em">Собственных юрлиц</div>' +
          '<div style="font-size:1.75rem;font-weight:800;color:var(--text);margin-top:6px">' + ownCount + '</div>' +
          '<div style="font-size:.74rem;color:var(--text-3);margin-top:4px">ООО «КС», ООО «К10», «Ультима»</div>' +
        '</div>' +
      '</div>' +

      // Панель фильтров
      '<div class="card mb-3" style="padding:14px 18px;border-radius:12px;border:1.5px solid var(--border);background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.02)">' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">' +
          '<div style="flex:1;min-width:240px;position:relative">' +
            '<input type="text" id="sub_contract_q" value="' + escHtml(S.subContractSearch || '') + '" ' +
              'placeholder="🔍 Поиск по номеру, исполнителю, ИНН, территории..." ' +
              'oninput="S.subContractSearch=this.value; renderApp()" ' +
              'style="width:100%;padding:8px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
          '</div>' +
          '<div style="min-width:190px">' +
            '<select onchange="S.subContractCompany=this.value; renderApp()" style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.84rem;background:#fff">' +
              '<option value="all">Все юрлица группы</option>' +
              ownOpts +
            '</select>' +
          '</div>' +
          '<div style="min-width:190px">' +
            '<select onchange="S.subContractContractor=this.value; renderApp()" style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.84rem;background:#fff">' +
              '<option value="all">Все исполнители</option>' +
              contractorOpts +
            '</select>' +
          '</div>' +
          '<div style="min-width:150px">' +
            '<select onchange="S.subContractStatus=this.value; renderApp()" style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.84rem;background:#fff">' +
              '<option value="all" ' + (filterStatus === 'all' ? 'selected' : '') + '>Любой статус</option>' +
              '<option value="active" ' + (filterStatus === 'active' ? 'selected' : '') + '>Действует</option>' +
              '<option value="pending" ' + (filterStatus === 'pending' ? 'selected' : '') + '>На согласовании</option>' +
              '<option value="completed" ' + (filterStatus === 'completed' ? 'selected' : '') + '>Завершен</option>' +
            '</select>' +
          '</div>' +
          (q || filterStatus !== 'all' || filterCompany !== 'all' || filterContractor !== 'all' ?
            '<button type="button" class="btn btn-sm btn-ghost" style="border:1.5px solid var(--border);border-radius:8px;padding:8px 14px" onclick="S.subContractSearch=\'\';S.subContractStatus=\'all\';S.subContractCompany=\'all\';S.subContractContractor=\'all\';renderApp()">Сбросить</button>' : '') +
        '</div>' +
      '</div>' +

      // Таблица договоров
      '<div class="card tbl-wrap" style="background:#fff;border-radius:12px;border:1.5px solid var(--border);overflow:hidden;overflow-x:auto;box-shadow:0 2px 8px rgba(0,0,0,0.03)">' +
        '<div style="padding:12px 18px;border-bottom:1px solid var(--border);background:#fafafa;display:flex;justify-content:space-between;align-items:center">' +
          '<div style="font-weight:700;font-size:.88rem;color:var(--text)">' +
            'Список договоров субподряда (' + filtered.length + ')' +
          '</div>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:.83rem">' +
          '<thead><tr style="background:#f8fafc;border-bottom:1.5px solid var(--border);color:var(--text-3);font-size:.74rem;text-transform:uppercase;letter-spacing:.03em">' +
            '<th style="padding:12px 16px;text-align:left;min-width:140px">№ и дата договора</th>' +
            '<th style="padding:12px 16px;text-align:left;min-width:220px">Субподрядчик (Исполнитель)</th>' +
            '<th style="padding:12px 16px;text-align:left;min-width:140px">Заказчик (Юрлицо группы)</th>' +
            '<th style="padding:12px 16px;text-align:left;min-width:210px">Предмет / Территория</th>' +
            '<th style="padding:12px 16px;text-align:left;min-width:180px">Привязанный прайс</th>' +
            '<th style="padding:12px 16px;text-align:left;min-width:110px">Статус</th>' +
            '<th style="padding:12px 16px;text-align:right;min-width:150px">Действия</th>' +
          '</tr></thead>' +
          '<tbody>' +
            (filtered.length ? filtered.map(function(c) {
              var st = c.status || 'active';
              var stBadge = st === 'active' ?
                '<span class="badge b-green" style="font-size:.74rem;padding:3px 10px;border-radius:14px;font-weight:600">Действует</span>' :
                (st === 'pending' ? '<span class="badge b-yellow" style="font-size:.74rem;padding:3px 10px;border-radius:14px;font-weight:600">На согласовании</span>' :
                '<span class="badge b-gray" style="font-size:.74rem;padding:3px 10px;border-radius:14px">Завершен</span>');

              var ownName = c.own_company_name || 'ООО "Кабельные Системы"';
              var ownBadge = ownName.includes('К10') ?
                '<span style="display:inline-block;padding:3px 8px;border-radius:6px;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;font-weight:700;font-size:.74rem">ООО «К10»</span>' :
                (ownName.includes('Ультима') ?
                '<span style="display:inline-block;padding:3px 8px;border-radius:6px;background:#f3e8ff;color:#7e22ce;border:1px solid #e9d5ff;font-weight:700;font-size:.74rem">ООО «Ультима»</span>' :
                '<span style="display:inline-block;padding:3px 8px;border-radius:6px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;font-weight:700;font-size:.74rem">ООО «КС»</span>');

              var cDate = c.contract_date ? new Date(c.contract_date).toLocaleDateString('ru-RU') : '—';

              var plHtml = c.price_list_id ?
                '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
                  '<span style="font-weight:600;color:#1d4ed8;font-size:.80rem">' + escHtml(c.price_list_name || 'Приложение №1') + '</span>' +
                  '<span class="badge b-blue" style="font-size:.68rem;padding:2px 6px">' + (c.price_items_count || 22) + ' поз.</span>' +
                '</div>' :
                '<span style="color:var(--text-3);font-size:.76rem">Типовой прайс</span>';

              return '<tr style="border-bottom:1px solid var(--border);transition:background .1s" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'#fff\'">' +
                '<td style="padding:14px 16px">' +
                  '<div style="font-weight:700;color:var(--text);font-size:.88rem">' + escHtml(c.contract_number || 'Б/Н') + '</div>' +
                  '<div style="font-size:.75rem;color:var(--text-3);margin-top:3px">от ' + cDate + '</div>' +
                '</td>' +
                '<td style="padding:14px 16px">' +
                  '<div style="font-weight:600;color:var(--text);font-size:.86rem">' + escHtml(c.contractor_name || '—') + '</div>' +
                  '<div style="font-size:.74rem;color:var(--text-3);font-family:monospace;margin-top:3px">ИНН: ' + escHtml(c.contractor_inn || '—') + (c.contractor_phone ? ' • ' + escHtml(c.contractor_phone) : '') + '</div>' +
                '</td>' +
                '<td style="padding:14px 16px">' +
                  ownBadge +
                '</td>' +
                '<td style="padding:14px 16px">' +
                  '<div style="font-weight:600;color:var(--text);font-size:.82rem">' + escHtml(c.customer_tag || c.subject || 'Монтаж СКС') + '</div>' +
                  (c.territory ? '<div style="font-size:.74rem;color:var(--text-3);margin-top:2px">📍 ' + escHtml(c.territory) + '</div>' : '') +
                '</td>' +
                '<td style="padding:14px 16px">' +
                  plHtml +
                '</td>' +
                '<td style="padding:14px 16px">' +
                  stBadge +
                '</td>' +
                '<td style="padding:14px 16px;text-align:right">' +
                  '<div style="display:flex;gap:6px;justify-content:flex-end">' +
                    '<button type="button" class="btn btn-xs btn-ghost" style="border:1.5px solid var(--border);padding:5px 12px;border-radius:6px;font-weight:600;font-size:.78rem" onclick="openSubContractModal(' + c.id + ')">Редактировать</button>' +
                    '<button type="button" class="btn btn-xs btn-ghost" style="color:#ef4444;border:1.5px solid #fecaca;padding:5px 9px;border-radius:6px" onclick="deleteSubContract(' + c.id + ')" title="Удалить">✕</button>' +
                  '</div>' +
                '</td>' +
              '</tr>';
            }).join('') :
            '<tr><td colspan="7" style="padding:36px;text-align:center;color:var(--text-3)">' +
              (q ? 'По вашему запросу договоров не найдено' : 'Договоры субподряда пока не заведены. Нажмите «+ Новый договор субподряда»') +
            '</td></tr>') +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  };

  // ─── 3. СТРАНИЦА: «ПРАЙСЫ СУБПОДРЯДА» ──────────────────────────────────────

  window.pageSubPricelists = function() {
    var pricelists = S.subPricelists || [];
    var q = String(S.subPriceSearch || '').trim().toLowerCase();
    var filterType = S.subPriceFilter || 'all';

    var filtered = pricelists.filter(function(pl) {
      if (filterType === 'default' && !pl.is_default) return false;
      if (filterType === 'personal' && pl.is_default) return false;
      if (q) {
        var match = (pl.name && pl.name.toLowerCase().includes(q)) ||
                    (pl.customer_tag && pl.customer_tag.toLowerCase().includes(q)) ||
                    (pl.contractor_name && pl.contractor_name.toLowerCase().includes(q)) ||
                    (pl.region && pl.region.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });

    var totalCount = pricelists.length;
    var defaultPl = pricelists.find(function(p) { return p.is_default; });
    var personalCount = pricelists.filter(function(p) { return !p.is_default; }).length;

    return '<div style="animation:fadeIn 0.15s ease; padding:4px 4px 28px 4px">' +
      // Заголовок
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;margin-bottom:1.5rem">' +
        '<div>' +
          '<h1 class="page-title" style="margin:0;display:flex;align-items:center;gap:10px;font-size:1.45rem;font-weight:800"><span>📊 Прайсы субподряда</span></h1>' +
          '<div style="font-size:.84rem;color:var(--text-3);margin-top:4px">' +
            'Тарифные сетки СМР: дифференцированная шкала портов (1–3 / >3 шт), монтаж шкафов ТКШ, дорога (12 ₽/км) и суточные' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:10px;align-items:center">' +
          '<button type="button" class="btn btn-sm btn-ghost" style="border:1.5px solid var(--border);padding:8px 14px;border-radius:8px;font-weight:600" onclick="go(\'sub_contracts\')">📑 Договоры субподряда →</button>' +
          '<button type="button" class="btn btn-sm btn-primary" style="padding:8px 18px;font-weight:700;border-radius:8px" onclick="openSubPriceListModal()">+ Создать прайс-лист</button>' +
        '</div>' +
      '</div>' +

      // Сводные карточки
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:14px;margin-bottom:1.5rem">' +
        '<div class="card" style="padding:16px 20px;border-radius:12px;border:1.5px solid var(--border);background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.03)">' +
          '<div style="font-size:.74rem;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:.03em">Всего прайс-листов</div>' +
          '<div style="font-size:1.75rem;font-weight:800;color:var(--text);margin-top:6px">' + totalCount + '</div>' +
          '<div style="font-size:.74rem;color:var(--text-3);margin-top:4px">Доступно для назначения</div>' +
        '</div>' +
        '<div class="card" style="padding:16px 20px;border-radius:12px;border:1.5px solid #86efac;background:#f0fdf4;box-shadow:0 2px 8px rgba(22,101,52,0.04)">' +
          '<div style="font-size:.74rem;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.03em">Базовый прайс</div>' +
          '<div style="font-size:.98rem;font-weight:800;color:#15803d;margin-top:6px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden" title="' + escHtml(defaultPl ? defaultPl.name : '') + '">' +
            (defaultPl ? escHtml(defaultPl.name) : 'Не назначен') +
          '</div>' +
          '<div style="font-size:.74rem;color:#166534;margin-top:4px">Используется по умолчанию</div>' +
        '</div>' +
        '<div class="card" style="padding:16px 20px;border-radius:12px;border:1.5px solid #bfdbfe;background:#eff6ff;box-shadow:0 2px 8px rgba(30,64,175,0.04)">' +
          '<div style="font-size:.74rem;color:#1e40af;font-weight:700;text-transform:uppercase;letter-spacing:.03em">Персональных прайсов</div>' +
          '<div style="font-size:1.75rem;font-weight:800;color:#1d4ed8;margin-top:6px">' + personalCount + '</div>' +
          '<div style="font-size:.74rem;color:#1e40af;margin-top:4px">Привязаны к исполнителям</div>' +
        '</div>' +
        '<div class="card" style="padding:16px 20px;border-radius:12px;border:1.5px solid var(--border);background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.03)">' +
          '<div style="font-size:.74rem;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:.03em">Позиций в стандарте</div>' +
          '<div style="font-size:1.75rem;font-weight:800;color:var(--text);margin-top:6px">22</div>' +
          '<div style="font-size:.74rem;color:var(--text-3);margin-top:4px">Порты, шкафы, дорога, суточные</div>' +
        '</div>' +
      '</div>' +

      // Фильтры
      '<div class="card mb-3" style="padding:14px 18px;border-radius:12px;border:1.5px solid var(--border);background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.02)">' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">' +
          '<div style="flex:1;min-width:240px">' +
            '<input type="text" id="sub_price_q" value="' + escHtml(S.subPriceSearch || '') + '" ' +
              'placeholder="🔍 Поиск по названию прайса, исполнителю или тегу..." ' +
              'oninput="S.subPriceSearch=this.value; renderApp()" ' +
              'style="width:100%;padding:8px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
          '</div>' +
          '<div style="min-width:200px">' +
            '<select onchange="S.subPriceFilter=this.value; renderApp()" style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.84rem;background:#fff">' +
              '<option value="all" ' + (filterType === 'all' ? 'selected' : '') + '>Все прайс-листы</option>' +
              '<option value="default" ' + (filterType === 'default' ? 'selected' : '') + '>Только базовый (по умолчанию)</option>' +
              '<option value="personal" ' + (filterType === 'personal' ? 'selected' : '') + '>Только персональные</option>' +
            '</select>' +
          '</div>' +
          (q || filterType !== 'all' ?
            '<button type="button" class="btn btn-sm btn-ghost" style="border:1.5px solid var(--border);border-radius:8px;padding:8px 14px" onclick="S.subPriceSearch=\'\';S.subPriceFilter=\'all\';renderApp()">Сбросить</button>' : '') +
        '</div>' +
      '</div>' +

      // Сетка прайс-листов
      '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(360px, 1fr));gap:18px">' +
        (filtered.length ? filtered.map(function(pl) {
          var items = pl.items || [];
          var p5e = items.find(function(it){ return it.work_code === 'port_5e'; }) || { price_tier_1: 3000, price_tier_2: 2500 };
          var p6 = items.find(function(it){ return it.work_code === 'port_6' || it.work_code === 'port_optics'; }) || { price_tier_1: 3500, price_tier_2: 3000 };
          var km = items.find(function(it){ return it.work_code === 'km_rate'; }) || { price_tier_1: 12 };
          var daily = items.find(function(it){ return it.work_code === 'daily_rate'; }) || { price_tier_1: 700 };

          var isDef = Boolean(pl.is_default);

          return '<div class="card" style="background:#fff;border:' + (isDef ? '2px solid #3b82f6' : '1.5px solid var(--border)') + ';border-radius:14px;padding:20px 22px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:' + (isDef ? '0 6px 20px rgba(59,130,246,0.12)' : '0 2px 8px rgba(0,0,0,0.03)') + '">' +
            '<div>' +
              '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">' +
                '<div style="flex:1">' +
                  '<div style="font-weight:800;font-size:1.02rem;color:var(--text);line-height:1.35">' + escHtml(pl.name) + '</div>' +
                  (pl.contractor_name ?
                    '<div style="font-size:.80rem;color:#1e40af;font-weight:600;margin-top:4px">👤 Исполнитель: ' + escHtml(pl.contractor_name) + '</div>' :
                    (isDef ? '<div style="font-size:.80rem;color:#15803d;font-weight:600;margin-top:4px">⭐ Общесистемный (по умолчанию)</div>' : '<div style="font-size:.80rem;color:var(--text-3);margin-top:4px">Общий прайс-лист</div>')) +
                '</div>' +
                (isDef ? '<span class="badge b-blue" style="font-size:.72rem;padding:4px 10px;white-space:nowrap;font-weight:700">По умолчанию</span>' : '<span class="badge b-gray" style="font-size:.72rem;padding:4px 8px">Активен</span>') +
              '</div>' +

              (pl.customer_tag ? '<div style="margin-bottom:12px"><span style="display:inline-flex;align-items:center;gap:4px;font-size:.74rem;color:#334155;background:#f1f5f9;border:1px solid #cbd5e1;padding:3px 9px;border-radius:12px;font-weight:600">🏷️ ' + escHtml(pl.customer_tag) + '</span></div>' : '') +

              // Превью тарифов
              '<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px 16px;margin:12px 0 16px 0;font-size:.82rem;display:flex;flex-direction:column;gap:8px">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:5px;border-bottom:1px dashed #e2e8f0">' +
                  '<span style="color:var(--text-2)">Порт СКС 5e:</span>' +
                  '<span style="font-weight:700;color:var(--text)">' + p5e.price_tier_1 + ' ₽ <span style="font-weight:400;color:var(--text-3)">(1–3)</span> / ' + p5e.price_tier_2 + ' ₽ <span style="font-weight:400;color:var(--text-3)">(>3)</span></span>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:5px;border-bottom:1px dashed #e2e8f0">' +
                  '<span style="color:var(--text-2)">Порт кат. 6 / Оптика:</span>' +
                  '<span style="font-weight:700;color:var(--text)">' + p6.price_tier_1 + ' ₽ / ' + p6.price_tier_2 + ' ₽</span>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:5px;border-bottom:1px dashed #e2e8f0">' +
                  '<span style="color:var(--text-2)">Дорога (>10 км):</span>' +
                  '<span style="font-weight:700;color:var(--text)">' + km.price_tier_1 + ' ₽ / км</span>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center">' +
                  '<span style="color:var(--text-2)">Суточные командировки:</span>' +
                  '<span style="font-weight:700;color:var(--text)">' + daily.price_tier_1 + ' ₽ / день</span>' +
                '</div>' +
              '</div>' +
            '</div>' +

            // Нижняя плашка с кнопками
            '<div>' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-top:8px;border-top:1px solid #f1f5f9;font-size:.78rem;color:var(--text-3)">' +
                '<span>Всего позиций: <b>' + items.length + '</b></span>' +
                (pl.contract_number ? '<span style="font-weight:600">Договор № ' + escHtml(pl.contract_number) + '</span>' : '') +
              '</div>' +
              '<div style="display:flex;gap:8px;align-items:center">' +
                '<button type="button" class="btn btn-sm btn-primary" style="flex:1;padding:8px 12px;font-weight:600;border-radius:8px" onclick="openSubPriceListItemsModal(' + pl.id + ')">📋 Позиции (' + items.length + ')</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" style="border:1.5px solid var(--border);padding:8px 12px;border-radius:8px" onclick="openSubPriceListModal(' + pl.id + ')">⚙️ Настройки</button>' +
                (!isDef ? '<button type="button" class="btn btn-sm btn-ghost" style="border:1.5px solid var(--border);padding:8px 10px;border-radius:8px" title="Сделать основным по умолчанию" onclick="setSubPriceListDefault(' + pl.id + ')">⭐</button>' : '') +
                (!isDef ? '<button type="button" class="btn btn-sm btn-ghost" style="color:var(--red);border:1.5px solid #fecaca;padding:8px 10px;border-radius:8px" title="Удалить прайс" onclick="deleteSubPriceList(' + pl.id + ')">🗑️</button>' : '') +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('') :
        '<div style="grid-column:1/-1;padding:48px;text-align:center;color:var(--text-3);background:#fff;border-radius:12px;border:1.5px solid var(--border)">' +
          'Прайс-листы не найдены. Нажмите «+ Создать прайс-лист»' +
        '</div>') +
      '</div>' +
    '</div>';
  };

  // ─── 4. МОДАЛКА: СОЗДАНИЕ / РЕДАКТИРОВАНИЕ ДОГОВОРА СУБПОДРЯДА ───────────────

  window.openSubContractModal = function(contractId) {
    var c = contractId ? (S.subContracts || []).find(function(x){ return x.id === contractId; }) : null;
    var isEdit = Boolean(c);

    var ownList = S.ownCompanies || [];
    var ownOpts = ownList.map(function(oc) {
      var sel = (c && c.own_company_id === oc.id) ? 'selected' : '';
      return '<option value="' + oc.id + '" ' + sel + '>' + escHtml(oc.name_short) + ' (ИНН ' + escHtml(oc.inn) + ')</option>';
    }).join('');

    var subContractors = (S.contractors || []).filter(function(x) {
      return x && x.type !== 'customer' && !String(x.inn || '').startsWith('CUST-');
    });

    var contractorOpts = subContractors.map(function(ct) {
      var sel = (c && c.contractor_id === ct.id) ? 'selected' : '';
      return '<option value="' + ct.id + '" ' + sel + '>' + escHtml(ct.name_short) + ' (ИНН ' + escHtml(ct.inn || '—') + ')</option>';
    }).join('');

    var cDate = c && c.contract_date ? c.contract_date.split('T')[0] : new Date().toISOString().split('T')[0];
    var vFrom = c && c.valid_from ? c.valid_from.split('T')[0] : cDate;
    var vTo = c && c.valid_to ? c.valid_to.split('T')[0] : '';

    var modalHtml = '<div class="modal-overlay modal-backdrop" id="_sub_contract_modal_backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">' +
      '<div class="modal-box card" style="background:#fff;border-radius:14px;max-width:660px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 16px 40px rgba(0,0,0,0.22);overflow:hidden">' +
        '<div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1.5px solid var(--border);background:#fafafa;cursor:move;user-select:none">' +
          '<h3 class="modal-title" style="margin:0;font-size:1.1rem;display:flex;align-items:center;gap:8px">' +
            '<span>📑</span> <span>' + (isEdit ? 'Редактирование договора субподряда' : 'Новый договор субподряда') + '</span>' +
          '</h3>' +
          '<button type="button" class="btn-close btn btn-sm btn-ghost" onclick="var b=document.getElementById(\'_sub_contract_modal_backdrop\'); if(b) b.remove();">✕</button>' +
        '</div>' +

        '<div class="modal-body" style="padding:20px 24px;overflow-y:auto;flex:1">' +
          '<form id="sub_contract_form" onsubmit="saveSubContract(event, ' + (isEdit ? c.id : 'null') + ')">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">' +
              '<div style="grid-column:1/-1">' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Исполнитель (Субподрядчик) *</label>' +
                '<select id="sc_contractor_id" required style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
                  '<option value="">-- Выберите исполнителя из базы --</option>' +
                  contractorOpts +
                '</select>' +
              '</div>' +

              '<div style="grid-column:1/-1">' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Заказчик (Юридическое лицо группы) *</label>' +
                '<select id="sc_own_company_id" required style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
                  ownOpts +
                '</select>' +
              '</div>' +

              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Номер договора *</label>' +
                '<input type="text" id="sc_number" required value="' + escHtml(c ? c.contract_number : '') + '" placeholder="Например: 2026/СКС-ПНР" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
              '</div>' +

              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Дата договора *</label>' +
                '<input type="date" id="sc_date" required value="' + cDate + '" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
              '</div>' +

              '<div style="grid-column:1/-1">' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Предмет договора / Направление</label>' +
                '<input type="text" id="sc_subject" value="' + escHtml(c ? (c.subject || '') : 'Монтаж СКС и слаботочных систем') + '" placeholder="Например: Монтаж СКС и слаботочных систем" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
              '</div>' +

              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Тэг / Конечный заказчик</label>' +
                '<input type="text" id="sc_customer_tag" value="' + escHtml(c ? (c.customer_tag || '') : '') + '" placeholder="ПАО Сбербанк, ОСФР, Росприрода..." style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
              '</div>' +

              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Территория действия</label>' +
                '<input type="text" id="sc_territory" value="' + escHtml(c ? (c.territory || '') : '') + '" placeholder="Например: Тюменская обл., УФО" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
              '</div>' +

              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Действует с</label>' +
                '<input type="date" id="sc_valid_from" value="' + vFrom + '" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
              '</div>' +

              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Действует по</label>' +
                '<input type="date" id="sc_valid_to" value="' + vTo + '" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
              '</div>' +

              '<div style="grid-column:1/-1">' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Статус договора</label>' +
                '<select id="sc_status" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
                  '<option value="active" ' + (c && c.status === 'active' ? 'selected' : '') + '>Действует</option>' +
                  '<option value="pending" ' + (c && c.status === 'pending' ? 'selected' : '') + '>На согласовании</option>' +
                  '<option value="completed" ' + (c && c.status === 'completed' ? 'selected' : '') + '>Завершен</option>' +
                '</select>' +
              '</div>' +

              (!isEdit ?
                '<div style="grid-column:1/-1;background:#eff6ff;padding:12px 14px;border-radius:8px;border:1.5px solid #bfdbfe">' +
                  '<label style="display:flex;align-items:center;gap:10px;font-size:.84rem;font-weight:600;color:#1e40af;cursor:pointer">' +
                    '<input type="checkbox" id="sc_create_pl" checked style="accent-color:#2563eb;width:18px;height:18px"> ' +
                    'Автоматически создать привязанный прайс-лист на основе типового' +
                  '</label>' +
                '</div>' : '') +
            '</div>' +

            '<div style="display:flex;justify-content:flex-end;gap:10px;border-top:1.5px solid var(--border);padding-top:14px;margin-top:14px">' +
              '<button type="button" class="btn btn-sm btn-ghost" style="border:1.5px solid var(--border);padding:8px 16px;border-radius:8px" onclick="var b=document.getElementById(\'_sub_contract_modal_backdrop\'); if(b) b.remove();">Отмена</button>' +
              '<button type="submit" class="btn btn-sm btn-primary" style="padding:8px 18px;font-weight:700;border-radius:8px">Сохранить договор</button>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>' +
    '</div>';

    var oldB = document.getElementById('_sub_contract_modal_backdrop');
    if (oldB) oldB.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    var bEl = document.getElementById('_sub_contract_modal_backdrop');
    var box = bEl ? bEl.querySelector('.modal-box') : null;
    if (box && window.makeWindowDraggableAndMinimizable) {
      window.makeWindowDraggableAndMinimizable(box, {
        title: isEdit ? 'Редактирование договора субподряда' : 'Новый договор субподряда',
        icon: '📑',
        backdrop: bEl,
        onClose: function() { bEl.remove(); }
      });
    }
  };

  window.saveSubContract = function(e, contractId) {
    e.preventDefault();
    var payload = {
      contractor_id: parseInt(document.getElementById('sc_contractor_id').value, 10),
      own_company_id: parseInt(document.getElementById('sc_own_company_id').value, 10),
      contract_number: document.getElementById('sc_number').value.trim(),
      contract_date: document.getElementById('sc_date').value,
      subject: document.getElementById('sc_subject').value.trim(),
      customer_tag: document.getElementById('sc_customer_tag').value.trim(),
      territory: document.getElementById('sc_territory').value.trim(),
      valid_from: document.getElementById('sc_valid_from').value || null,
      valid_to: document.getElementById('sc_valid_to').value || null,
      status: document.getElementById('sc_status').value
    };

    var createPlEl = document.getElementById('sc_create_pl');
    if (createPlEl && createPlEl.checked) {
      payload.create_price_list = true;
    }

    var url = contractId ? '/subcontract-contracts/' + contractId : '/subcontract-contracts';
    var method = contractId ? 'PUT' : 'POST';

    api(url, {
      method: method,
      body: JSON.stringify(payload)
    }).then(function(res) {
      if (res && res.error) {
        alert('Ошибка сохранения: ' + res.error);
        return;
      }
      var backdrop = document.getElementById('_sub_contract_modal_backdrop') || document.getElementById('sub_contract_modal_backdrop');
      if (backdrop) backdrop.remove();

      // Обновляем список договоров и прайсов
      Promise.all([
        api('/subcontract-contracts'),
        api('/subcontract-pricelists')
      ]).then(function(data) {
        if (Array.isArray(data[0])) S.subContracts = data[0];
        if (Array.isArray(data[1])) S.subPricelists = data[1];
        renderApp();
      });
    }).catch(function(err) {
      alert('Ошибка соединения: ' + (err.message || err));
    });
  };

  window.deleteSubContract = function(contractId) {
    if (!confirm('Вы уверены, что хотите удалить этот договор субподряда?')) return;
    api('/subcontract-contracts/' + contractId, { method: 'DELETE' }).then(function(res) {
      if (res && res.error) {
        alert('Ошибка: ' + res.error);
        return;
      }
      S.subContracts = (S.subContracts || []).filter(function(x) { return x.id !== contractId; });
      renderApp();
    });
  };

  // ─── 5. МОДАЛКА: СОЗДАНИЕ / РЕДАКТИРОВАНИЕ ПРАЙС-ЛИСТА ───────────────────────

  window.openSubPriceListModal = function(priceListId) {
    var pl = priceListId ? (S.subPricelists || []).find(function(x){ return x.id === priceListId; }) : null;
    var isEdit = Boolean(pl);

    var subContractors = (S.contractors || []).filter(function(x) {
      return x && x.type !== 'customer' && !String(x.inn || '').startsWith('CUST-');
    });

    var contractorOpts = subContractors.map(function(ct) {
      var sel = (pl && pl.contractor_id === ct.id) ? 'selected' : '';
      return '<option value="' + ct.id + '" ' + sel + '>' + escHtml(ct.name_short) + '</option>';
    }).join('');

    var modalHtml = '<div class="modal-overlay modal-backdrop" id="_sub_price_modal_backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">' +
      '<div class="modal-box card" style="background:#fff;border-radius:14px;max-width:560px;width:100%;box-shadow:0 16px 40px rgba(0,0,0,0.22);overflow:hidden;display:flex;flex-direction:column">' +
        '<div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1.5px solid var(--border);background:#fafafa;cursor:move;user-select:none">' +
          '<h3 class="modal-title" style="margin:0;font-size:1.1rem;display:flex;align-items:center;gap:8px">' +
            '<span>📊</span> <span>' + (isEdit ? 'Параметры прайс-листа' : 'Новый прайс-лист субподряда') + '</span>' +
          '</h3>' +
          '<button type="button" class="btn-close btn btn-sm btn-ghost" onclick="var b=document.getElementById(\'_sub_price_modal_backdrop\'); if(b) b.remove();">✕</button>' +
        '</div>' +

        '<div class="modal-body" style="padding:20px 24px;overflow-y:auto;flex:1">' +
          '<form id="sub_price_form" onsubmit="saveSubPriceList(event, ' + (isEdit ? pl.id : 'null') + ')">' +
            '<div style="display:flex;flex-direction:column;gap:14px;margin-bottom:16px">' +
              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Название прайс-листа *</label>' +
                '<input type="text" id="spl_name" required value="' + escHtml(pl ? pl.name : '') + '" placeholder="Например: Индивидуальный прайс (Сбербанк)" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
              '</div>' +

              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Привязка к исполнителю (необязательно)</label>' +
                '<select id="spl_contractor_id" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
                  '<option value="">-- Без привязки (общесистемный шаблон) --</option>' +
                  contractorOpts +
                '</select>' +
              '</div>' +

              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Тэг / Направление работ</label>' +
                '<input type="text" id="spl_customer_tag" value="' + escHtml(pl ? (pl.customer_tag || '') : '') + '" placeholder="ПАО Сбербанк, ОСФР, Разовые объекты..." style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
              '</div>' +

              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Регион действия</label>' +
                '<input type="text" id="spl_region" value="' + escHtml(pl ? (pl.region || '') : '') + '" placeholder="Все регионы, либо Тюменская обл., Забайкальский край..." style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
              '</div>' +

              '<div style="background:#f8fafc;padding:12px 14px;border-radius:8px;border:1.5px solid #e2e8f0">' +
                '<label style="display:flex;align-items:center;gap:10px;font-size:.84rem;font-weight:600;color:var(--text);cursor:pointer">' +
                  '<input type="checkbox" id="spl_is_default" ' + (pl && pl.is_default ? 'checked' : '') + ' style="accent-color:#2563eb;width:18px;height:18px"> ' +
                  'Сделать базовым прайсом по умолчанию (для всех без личного прайса)' +
                '</label>' +
              '</div>' +
            '</div>' +

            '<div style="display:flex;justify-content:flex-end;gap:10px;border-top:1.5px solid var(--border);padding-top:14px">' +
              '<button type="button" class="btn btn-sm btn-ghost" style="border:1.5px solid var(--border);padding:8px 16px;border-radius:8px" onclick="var b=document.getElementById(\'_sub_price_modal_backdrop\'); if(b) b.remove();">Отмена</button>' +
              '<button type="submit" class="btn btn-sm btn-primary" style="padding:8px 18px;font-weight:700;border-radius:8px">Сохранить</button>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>' +
    '</div>';

    var oldB = document.getElementById('_sub_price_modal_backdrop');
    if (oldB) oldB.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    var bEl = document.getElementById('_sub_price_modal_backdrop');
    var box = bEl ? bEl.querySelector('.modal-box') : null;
    if (box && window.makeWindowDraggableAndMinimizable) {
      window.makeWindowDraggableAndMinimizable(box, {
        title: isEdit ? 'Параметры прайс-листа' : 'Новый прайс-лист субподряда',
        icon: '📊',
        backdrop: bEl,
        onClose: function() { bEl.remove(); }
      });
    }
  };

  window.saveSubPriceList = function(e, priceListId) {
    e.preventDefault();
    var payload = {
      name: document.getElementById('spl_name').value.trim(),
      contractor_id: parseInt(document.getElementById('spl_contractor_id').value, 10) || null,
      customer_tag: document.getElementById('spl_customer_tag').value.trim(),
      region: document.getElementById('spl_region').value.trim(),
      is_default: document.getElementById('spl_is_default').checked
    };

    var url = priceListId ? '/subcontract-pricelists/' + priceListId : '/subcontract-pricelists';
    var method = priceListId ? 'PUT' : 'POST';

    api(url, {
      method: method,
      body: JSON.stringify(payload)
    }).then(function(res) {
      if (res && res.error) {
        alert('Ошибка: ' + res.error);
        return;
      }
      var backdrop = document.getElementById('_sub_price_modal_backdrop') || document.getElementById('sub_price_modal_backdrop');
      if (backdrop) backdrop.remove();

      api('/subcontract-pricelists').then(function(list) {
        if (Array.isArray(list)) S.subPricelists = list;
        renderApp();
      });
    }).catch(function(err) {
      alert('Ошибка соединения: ' + (err.message || err));
    });
  };

  window.setSubPriceListDefault = function(priceListId) {
    api('/subcontract-pricelists/' + priceListId, {
      method: 'PUT',
      body: JSON.stringify({ is_default: true })
    }).then(function(res) {
      api('/subcontract-pricelists').then(function(list) {
        if (Array.isArray(list)) S.subPricelists = list;
        renderApp();
      });
    });
  };

  window.deleteSubPriceList = function(priceListId) {
    if (!confirm('Вы уверены, что хотите удалить этот прайс-лист?')) return;
    api('/subcontract-pricelists/' + priceListId, { method: 'DELETE' }).then(function(res) {
      if (res && res.error) {
        alert('Ошибка: ' + res.error);
        return;
      }
      S.subPricelists = (S.subPricelists || []).filter(function(x) { return x.id !== priceListId; });
      renderApp();
    });
  };

  // ─── 6. МОДАЛКА: ПРОСМОТР И РЕДАКТИРОВАНИЕ ПОЗИЦИЙ ПРАЙС-ЛИСТА ───────────────

  window.openSubPriceListItemsModal = function(priceListId) {
    var pl = (S.subPricelists || []).find(function(x){ return x.id === priceListId; });
    if (!pl) return;

    var items = pl.items || [];

    var rowsHtml = items.map(function(it, idx) {
      return '<tr style="border-bottom:1px solid #f1f5f9;transition:background .1s" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'#fff\'">' +
        '<td style="padding:8px 10px;font-size:.76rem;color:var(--text-3);font-family:monospace">' + (idx + 1) + '</td>' +
        '<td style="padding:8px 10px">' +
          '<input type="text" id="it_name_' + it.id + '" value="' + escHtml(it.work_name) + '" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.84rem;background:#fff">' +
        '</td>' +
        '<td style="padding:8px 10px;width:75px">' +
          '<input type="text" id="it_unit_' + it.id + '" value="' + escHtml(it.unit || 'шт') + '" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.84rem;text-align:center;background:#fff">' +
        '</td>' +
        '<td style="padding:8px 10px;width:105px">' +
          '<input type="number" id="it_t1_' + it.id + '" value="' + (it.price_tier_1 || 0) + '" style="width:100%;padding:6px 10px;border:1.5px solid #93c5fd;border-radius:6px;font-size:.85rem;font-weight:700;text-align:right;background:#eff6ff">' +
        '</td>' +
        '<td style="padding:8px 10px;width:105px">' +
          '<input type="number" id="it_t2_' + it.id + '" value="' + (it.price_tier_2 || 0) + '" style="width:100%;padding:6px 10px;border:1.5px solid #86efac;border-radius:6px;font-size:.85rem;font-weight:700;text-align:right;background:#f0fdf4;color:#15803d">' +
        '</td>' +
        '<td style="padding:8px 10px;width:65px">' +
          '<input type="number" id="it_th_' + it.id + '" value="' + (it.tier_threshold || 1) + '" style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.84rem;text-align:center;background:#fff">' +
        '</td>' +
        '<td style="padding:8px 10px;text-align:right;width:85px">' +
          '<div style="display:flex;gap:6px;justify-content:flex-end">' +
            '<button type="button" class="btn btn-xs btn-primary" style="padding:6px 9px;border-radius:6px" title="Сохранить позицию" onclick="saveSubPriceListItem(' + pl.id + ', ' + it.id + ')">💾</button>' +
            '<button type="button" class="btn btn-xs btn-ghost" style="color:#ef4444;border:1.5px solid #fecaca;padding:6px 8px;border-radius:6px" title="Удалить" onclick="deleteSubPriceListItem(' + pl.id + ', ' + it.id + ')">✕</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');

    var modalHtml = '<div class="modal-overlay modal-backdrop" id="_sub_items_modal_backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">' +
      '<div class="modal-box card" style="background:#fff;border-radius:14px;max-width:960px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 16px 40px rgba(0,0,0,0.22);overflow:hidden">' +
        '<div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1.5px solid var(--border);background:#fafafa;cursor:move;user-select:none">' +
          '<div>' +
            '<h3 class="modal-title" style="margin:0;font-size:1.15rem;display:flex;align-items:center;gap:8px">' +
              '<span>📋</span> <span>Позиции прайс-листа: <b>' + escHtml(pl.name) + '</b></span>' +
            '</h3>' +
            '<div style="font-size:.76rem;color:var(--text-3);margin-top:3px">Тариф 1 — ставка до порога (напр. 1–3 порта), Тариф 2 — оптовая ставка свыше порога</div>' +
          '</div>' +
          '<button type="button" class="btn-close btn btn-sm btn-ghost" onclick="var b=document.getElementById(\'_sub_items_modal_backdrop\'); if(b) b.remove();">✕</button>' +
        '</div>' +

        '<div class="modal-body" style="padding:16px 20px;overflow-y:auto;flex:1;display:flex;flex-direction:column">' +
          // Форма быстрого добавления позиции
          '<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:14px;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">' +
            '<div style="flex:2;min-width:200px">' +
              '<label style="display:block;font-size:.74rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Новая работа / услуга</label>' +
              '<input type="text" id="new_it_name" placeholder="Например: Алмазное бурение d=110мм" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.84rem;background:#fff">' +
            '</div>' +
            '<div style="width:70px">' +
              '<label style="display:block;font-size:.74rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Ед.</label>' +
              '<input type="text" id="new_it_unit" value="шт" style="width:100%;padding:8px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.84rem;text-align:center;background:#fff">' +
            '</div>' +
            '<div style="width:100px">' +
              '<label style="display:block;font-size:.74rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Тариф 1 (₽)</label>' +
              '<input type="number" id="new_it_t1" placeholder="3000" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.84rem;text-align:right;background:#fff">' +
            '</div>' +
            '<div style="width:100px">' +
              '<label style="display:block;font-size:.74rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Тариф 2 (₽)</label>' +
              '<input type="number" id="new_it_t2" placeholder="2500" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.84rem;text-align:right;background:#fff">' +
            '</div>' +
            '<div style="width:70px">' +
              '<label style="display:block;font-size:.74rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Порог</label>' +
              '<input type="number" id="new_it_th" value="3" style="width:100%;padding:8px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.84rem;text-align:center;background:#fff">' +
            '</div>' +
            '<button type="button" class="btn btn-sm btn-primary" style="padding:8px 14px;font-weight:700;border-radius:6px" onclick="addNewPriceListItem(' + pl.id + ')">+ Добавить позицию</button>' +
          '</div>' +

          // Скроллируемая таблица
          '<div style="flex:1;overflow-y:auto;border:1.5px solid var(--border);border-radius:10px;background:#fff">' +
            '<table style="width:100%;border-collapse:collapse;font-size:.82rem">' +
              '<thead><tr style="background:#f8fafc;border-bottom:1.5px solid var(--border);position:sticky;top:0;z-index:2;color:var(--text-3);font-size:.74rem;text-transform:uppercase;letter-spacing:.03em">' +
                '<th style="padding:10px 12px;text-align:left;width:35px">#</th>' +
                '<th style="padding:10px 12px;text-align:left">Наименование работы / услуги</th>' +
                '<th style="padding:10px 12px;text-align:center;width:75px">Ед. изм.</th>' +
                '<th style="padding:10px 12px;text-align:right;width:105px">Тариф 1 (до)</th>' +
                '<th style="padding:10px 12px;text-align:right;width:105px">Тариф 2 (от)</th>' +
                '<th style="padding:10px 12px;text-align:center;width:65px">Порог</th>' +
                '<th style="padding:10px 12px;text-align:right;width:85px">Действия</th>' +
              '</tr></thead>' +
              '<tbody>' +
                rowsHtml +
              '</tbody>' +
            '</table>' +
          '</div>' +

          '<div style="display:flex;justify-content:space-between;align-items:center;border-top:1.5px solid var(--border);padding-top:12px;margin-top:12px">' +
            '<div style="font-size:.76rem;color:var(--text-3)">Изменения вступают в силу немедленно для всех связанных смет</div>' +
            '<button type="button" class="btn btn-sm btn-ghost" style="border:1.5px solid var(--border);padding:8px 18px;border-radius:8px" onclick="var b=document.getElementById(\'_sub_items_modal_backdrop\'); if(b) b.remove();">Закрыть</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    var oldB = document.getElementById('_sub_items_modal_backdrop');
    if (oldB) oldB.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    var bEl = document.getElementById('_sub_items_modal_backdrop');
    var box = bEl ? bEl.querySelector('.modal-box') : null;
    if (box && window.makeWindowDraggableAndMinimizable) {
      window.makeWindowDraggableAndMinimizable(box, {
        title: 'Позиции: ' + (pl.name || 'Прайс'),
        icon: '📋',
        backdrop: bEl,
        onClose: function() { bEl.remove(); }
      });
    }
  };

  window.openSubPriceItemsModal = window.openSubPriceListItemsModal;

  window.saveSubPriceListItem = function(priceListId, itemId) {
    var name = document.getElementById('it_name_' + itemId).value.trim();
    var unit = document.getElementById('it_unit_' + itemId).value.trim();
    var t1 = parseFloat(document.getElementById('it_t1_' + itemId).value) || 0;
    var t2 = parseFloat(document.getElementById('it_t2_' + itemId).value) || t1;
    var th = parseFloat(document.getElementById('it_th_' + itemId).value) || 1;

    api('/subcontract-pricelists/' + priceListId + '/items/' + itemId, {
      method: 'PUT',
      body: JSON.stringify({
        work_name: name,
        unit: unit,
        price_tier_1: t1,
        price_tier_2: t2,
        tier_threshold: th
      })
    }).then(function(res) {
      if (res && res.error) {
        alert('Ошибка: ' + res.error);
        return;
      }
      // Обновляем в локальном стейте
      var pl = (S.subPricelists || []).find(function(x){ return x.id === priceListId; });
      if (pl && pl.items) {
        var it = pl.items.find(function(x){ return x.id === itemId; });
        if (it) {
          it.work_name = name;
          it.unit = unit;
          it.price_tier_1 = t1;
          it.price_tier_2 = t2;
          it.tier_threshold = th;
        }
      }
      if (event && event.target) {
        var btn = event.target;
        var orig = btn.innerHTML;
        btn.innerHTML = '✓';
        setTimeout(function(){ btn.innerHTML = orig; }, 800);
      }
    });
  };

  window.addNewPriceListItem = function(priceListId) {
    var name = document.getElementById('new_it_name').value.trim();
    if (!name) {
      alert('Укажите наименование работы');
      return;
    }
    var unit = document.getElementById('new_it_unit').value.trim() || 'шт';
    var t1 = parseFloat(document.getElementById('new_it_t1').value) || 0;
    var t2 = parseFloat(document.getElementById('new_it_t2').value) || t1;
    var th = parseFloat(document.getElementById('new_it_th').value) || 1;

    api('/subcontract-pricelists/' + priceListId + '/items', {
      method: 'POST',
      body: JSON.stringify({
        work_name: name,
        unit: unit,
        price_tier_1: t1,
        price_tier_2: t2,
        tier_threshold: th
      })
    }).then(function(newItem) {
      if (newItem && newItem.error) {
        alert('Ошибка: ' + newItem.error);
        return;
      }
      var backdrop = document.getElementById('_sub_items_modal_backdrop') || document.getElementById('sub_items_modal_backdrop');
      if (backdrop) backdrop.remove();

      api('/subcontract-pricelists').then(function(list) {
        if (Array.isArray(list)) S.subPricelists = list;
        openSubPriceListItemsModal(priceListId);
      });
    });
  };

  window.deleteSubPriceListItem = function(priceListId, itemId) {
    if (!confirm('Удалить эту позицию из прайса?')) return;
    api('/subcontract-pricelists/' + priceListId + '/items/' + itemId, {
      method: 'DELETE'
    }).then(function(res) {
      var pl = (S.subPricelists || []).find(function(x){ return x.id === priceListId; });
      if (pl && pl.items) {
        pl.items = pl.items.filter(function(x){ return x.id !== itemId; });
      }
      var backdrop = document.getElementById('_sub_items_modal_backdrop') || document.getElementById('sub_items_modal_backdrop');
      if (backdrop) backdrop.remove();
      openSubPriceListItemsModal(priceListId);
    });
  };

})();
