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

    return '<div style="animation:fadeIn 0.15s ease">' +
      // Заголовок
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:1.25rem">' +
        '<div>' +
          '<h1 class="page-title" style="margin:0;display:flex;align-items:center;gap:8px"><span>📑 Договоры субподряда</span></h1>' +
          '<div style="font-size:.82rem;color:var(--text-3);margin-top:3px">' +
            'Реестр договоров и соглашений с исполнителями СМР. Закрепление юрлиц группы (ООО «КС», ООО «К10», ООО «Ультима») и привязанных прайсов' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="go(\'sub_pricelists\')">📊 Прайсы субподряда →</button>' +
          '<button type="button" class="btn btn-sm btn-primary" onclick="openSubContractModal()">+ Новый договор субподряда</button>' +
        '</div>' +
      '</div>' +

      // Сводные карточки
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:1.25rem">' +
        '<div class="card p-3" style="border-radius:10px;border:1.5px solid var(--border);background:#fff">' +
          '<div style="font-size:.74rem;color:var(--text-3);font-weight:700;text-transform:uppercase">Всего договоров</div>' +
          '<div style="font-size:1.6rem;font-weight:800;color:var(--text);margin-top:4px">' + totalCount + '</div>' +
          '<div style="font-size:.74rem;color:var(--text-3);margin-top:2px">В справочнике компании</div>' +
        '</div>' +
        '<div class="card p-3" style="border-radius:10px;border:1.5px solid #86efac;background:#f0fdf4">' +
          '<div style="font-size:.74rem;color:#166534;font-weight:700;text-transform:uppercase">Действующие</div>' +
          '<div style="font-size:1.6rem;font-weight:800;color:#15803d;margin-top:4px">' + activeCount + '</div>' +
          '<div style="font-size:.74rem;color:#166534;margin-top:2px">Готовы к назначению в заявки</div>' +
        '</div>' +
        '<div class="card p-3" style="border-radius:10px;border:1.5px solid #bfdbfe;background:#eff6ff">' +
          '<div style="font-size:.74rem;color:#1e40af;font-weight:700;text-transform:uppercase">С привязанным прайсом</div>' +
          '<div style="font-size:1.6rem;font-weight:800;color:#1d4ed8;margin-top:4px">' + withPriceCount + '</div>' +
          '<div style="font-size:.74rem;color:#1e40af;margin-top:2px">Авторасчет сметы включен</div>' +
        '</div>' +
        '<div class="card p-3" style="border-radius:10px;border:1.5px solid var(--border);background:#fff">' +
          '<div style="font-size:.74rem;color:var(--text-3);font-weight:700;text-transform:uppercase">Собственных юрлиц</div>' +
          '<div style="font-size:1.6rem;font-weight:800;color:var(--text);margin-top:4px">' + ownCount + '</div>' +
          '<div style="font-size:.74rem;color:var(--text-3);margin-top:2px">ООО «КС», ООО «К10», «Ультима»</div>' +
        '</div>' +
      '</div>' +

      // Панель фильтров
      '<div class="card p-3 mb-3" style="border-radius:10px;border:1.5px solid var(--border);background:#fff">' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
          '<div style="flex:1;min-width:220px;position:relative">' +
            '<input type="text" id="sub_contract_q" value="' + escHtml(S.subContractSearch || '') + '" ' +
              'placeholder="🔍 Поиск по номеру, исполнителю, ИНН, территории..." ' +
              'oninput="S.subContractSearch=this.value; renderApp()" ' +
              'style="width:100%;padding:7px 12px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
          '</div>' +
          '<div style="min-width:180px">' +
            '<select onchange="S.subContractCompany=this.value; renderApp()" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.83rem">' +
              '<option value="all">Все юрлица группы</option>' +
              ownOpts +
            '</select>' +
          '</div>' +
          '<div style="min-width:180px">' +
            '<select onchange="S.subContractContractor=this.value; renderApp()" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.83rem">' +
              '<option value="all">Все исполнители</option>' +
              contractorOpts +
            '</select>' +
          '</div>' +
          '<div style="min-width:140px">' +
            '<select onchange="S.subContractStatus=this.value; renderApp()" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.83rem">' +
              '<option value="all" ' + (filterStatus === 'all' ? 'selected' : '') + '>Любой статус</option>' +
              '<option value="active" ' + (filterStatus === 'active' ? 'selected' : '') + '>Действует</option>' +
              '<option value="pending" ' + (filterStatus === 'pending' ? 'selected' : '') + '>На согласовании</option>' +
              '<option value="completed" ' + (filterStatus === 'completed' ? 'selected' : '') + '>Завершен</option>' +
            '</select>' +
          '</div>' +
          (q || filterStatus !== 'all' || filterCompany !== 'all' || filterContractor !== 'all' ?
            '<button type="button" class="btn btn-sm btn-ghost" onclick="S.subContractSearch=\'\';S.subContractStatus=\'all\';S.subContractCompany=\'all\';S.subContractContractor=\'all\';renderApp()">Сбросить</button>' : '') +
        '</div>' +
      '</div>' +

      // Таблица договоров
      '<div class="card tbl-wrap" style="background:#fff;border-radius:10px;border:1.5px solid var(--border);overflow:hidden">' +
        '<div style="padding:10px 16px;border-bottom:1px solid var(--border);background:#fafafa;display:flex;justify-content:space-between;align-items:center">' +
          '<div style="font-weight:700;font-size:.86rem;color:var(--text)">' +
            'Список договоров субподряда (' + filtered.length + ')' +
          '</div>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:.82rem">' +
          '<thead><tr style="background:#f8fafc;border-bottom:1.5px solid var(--border);color:var(--text-3);font-size:.74rem;text-transform:uppercase">' +
            '<th style="padding:10px 12px;text-align:left">№ и дата договора</th>' +
            '<th style="padding:10px 12px;text-align:left">Субподрядчик (Исполнитель)</th>' +
            '<th style="padding:10px 12px;text-align:left">Заказчик (Наше юрлицо)</th>' +
            '<th style="padding:10px 12px;text-align:left">Предмет / Направление</th>' +
            '<th style="padding:10px 12px;text-align:left">Привязанный прайс</th>' +
            '<th style="padding:10px 12px;text-align:left">Статус</th>' +
            '<th style="padding:10px 12px;text-align:right">Действия</th>' +
          '</tr></thead>' +
          '<tbody>' +
            (filtered.length ? filtered.map(function(c) {
              var st = c.status || 'active';
              var stBadge = st === 'active' ?
                '<span class="badge b-green" style="font-size:.72rem">Действует</span>' :
                (st === 'pending' ? '<span class="badge b-yellow" style="font-size:.72rem">На согласовании</span>' :
                '<span class="badge b-gray" style="font-size:.72rem">Завершен</span>');

              var ownName = c.own_company_name || 'ООО "Кабельные Системы"';
              var ownBadge = ownName.includes('К10') ?
                '<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:#e0f2fe;color:#0369a1;font-weight:700;font-size:.72rem">ООО «К10»</span>' :
                '<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:#fef3c7;color:#92400e;font-weight:700;font-size:.72rem">ООО «КС»</span>';

              var cDate = c.contract_date ? new Date(c.contract_date).toLocaleDateString('ru-RU') : '—';

              var plHtml = c.price_list_id ?
                '<div style="display:flex;align-items:center;gap:6px">' +
                  '<span style="font-weight:600;color:#1d4ed8;font-size:.78rem">' + escHtml(c.price_list_name || 'Приложение №1') + '</span>' +
                  '<span class="badge b-blue" style="font-size:.68rem">' + (c.price_items_count || 22) + ' поз.</span>' +
                '</div>' :
                '<span style="color:var(--text-3);font-size:.76rem">Типовой прайс</span>';

              return '<tr style="border-bottom:1px solid var(--border);transition:background .1s" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'#fff\'">' +
                '<td style="padding:10px 12px">' +
                  '<div style="font-weight:700;color:var(--text);font-size:.86rem">' + escHtml(c.contract_number || 'Б/Н') + '</div>' +
                  '<div style="font-size:.74rem;color:var(--text-3);margin-top:2px">от ' + cDate + '</div>' +
                '</td>' +
                '<td style="padding:10px 12px">' +
                  '<div style="font-weight:600;color:var(--text)">' + escHtml(c.contractor_name || '—') + '</div>' +
                  '<div style="font-size:.74rem;color:var(--text-3);font-family:monospace;margin-top:2px">ИНН: ' + escHtml(c.contractor_inn || '—') + (c.contractor_phone ? ' • ' + escHtml(c.contractor_phone) : '') + '</div>' +
                '</td>' +
                '<td style="padding:10px 12px">' +
                  ownBadge +
                '</td>' +
                '<td style="padding:10px 12px">' +
                  '<div style="font-weight:600;color:var(--text);font-size:.80rem">' + escHtml(c.customer_tag || c.subject || 'Монтаж СКС') + '</div>' +
                  (c.territory ? '<div style="font-size:.72rem;color:var(--text-3);margin-top:1px">📍 ' + escHtml(c.territory) + '</div>' : '') +
                '</td>' +
                '<td style="padding:10px 12px">' +
                  plHtml +
                '</td>' +
                '<td style="padding:10px 12px">' +
                  stBadge +
                '</td>' +
                '<td style="padding:10px 12px;text-align:right">' +
                  '<div style="display:flex;gap:4px;justify-content:flex-end">' +
                    '<button type="button" class="btn btn-xs btn-ghost" onclick="openSubContractModal(' + c.id + ')">Редактировать</button>' +
                    '<button type="button" class="btn btn-xs btn-ghost" style="color:var(--red)" onclick="deleteSubContract(' + c.id + ')">✕</button>' +
                  '</div>' +
                '</td>' +
              '</tr>';
            }).join('') :
            '<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--text-3)">' +
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

    return '<div style="animation:fadeIn 0.15s ease">' +
      // Заголовок
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:1.25rem">' +
        '<div>' +
          '<h1 class="page-title" style="margin:0;display:flex;align-items:center;gap:8px"><span>📊 Прайсы субподряда</span></h1>' +
          '<div style="font-size:.82rem;color:var(--text-3);margin-top:3px">' +
            'Тарифные сетки СМР: дифференцированная шкала портов (1–3 / >3 шт), монтаж шкафов ТКШ, дорога (12 ₽/км) и суточные' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="go(\'sub_contracts\')">📑 Договоры субподряда →</button>' +
          '<button type="button" class="btn btn-sm btn-primary" onclick="openSubPriceListModal()">+ Создать прайс-лист</button>' +
        '</div>' +
      '</div>' +

      // Сводные карточки
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:1.25rem">' +
        '<div class="card p-3" style="border-radius:10px;border:1.5px solid var(--border);background:#fff">' +
          '<div style="font-size:.74rem;color:var(--text-3);font-weight:700;text-transform:uppercase">Всего прайс-листов</div>' +
          '<div style="font-size:1.6rem;font-weight:800;color:var(--text);margin-top:4px">' + totalCount + '</div>' +
          '<div style="font-size:.74rem;color:var(--text-3);margin-top:2px">Доступно для назначения</div>' +
        '</div>' +
        '<div class="card p-3" style="border-radius:10px;border:1.5px solid #86efac;background:#f0fdf4">' +
          '<div style="font-size:.74rem;color:#166534;font-weight:700;text-transform:uppercase">Базовый прайс</div>' +
          '<div style="font-size:1.0rem;font-weight:800;color:#15803d;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            (defaultPl ? escHtml(defaultPl.name) : 'Не назначен') +
          '</div>' +
          '<div style="font-size:.74rem;color:#166534;margin-top:2px">Используется по умолчанию</div>' +
        '</div>' +
        '<div class="card p-3" style="border-radius:10px;border:1.5px solid #bfdbfe;background:#eff6ff">' +
          '<div style="font-size:.74rem;color:#1e40af;font-weight:700;text-transform:uppercase">Персональных прайсов</div>' +
          '<div style="font-size:1.6rem;font-weight:800;color:#1d4ed8;margin-top:4px">' + personalCount + '</div>' +
          '<div style="font-size:.74rem;color:#1e40af;margin-top:2px">Привязаны к исполнителям</div>' +
        '</div>' +
        '<div class="card p-3" style="border-radius:10px;border:1.5px solid var(--border);background:#fff">' +
          '<div style="font-size:.74rem;color:var(--text-3);font-weight:700;text-transform:uppercase">Позиций в стандарте</div>' +
          '<div style="font-size:1.6rem;font-weight:800;color:var(--text);margin-top:4px">22</div>' +
          '<div style="font-size:.74rem;color:var(--text-3);margin-top:2px">Порты, шкафы, дорога, суточные</div>' +
        '</div>' +
      '</div>' +

      // Фильтры
      '<div class="card p-3 mb-3" style="border-radius:10px;border:1.5px solid var(--border);background:#fff">' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
          '<div style="flex:1;min-width:240px">' +
            '<input type="text" id="sub_price_q" value="' + escHtml(S.subPriceSearch || '') + '" ' +
              'placeholder="🔍 Поиск по названию прайса, исполнителю или тегу..." ' +
              'oninput="S.subPriceSearch=this.value; renderApp()" ' +
              'style="width:100%;padding:7px 12px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
          '</div>' +
          '<div style="min-width:180px">' +
            '<select onchange="S.subPriceFilter=this.value; renderApp()" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.83rem">' +
              '<option value="all" ' + (filterType === 'all' ? 'selected' : '') + '>Все прайс-листы</option>' +
              '<option value="default" ' + (filterType === 'default' ? 'selected' : '') + '>Только базовый (по умолчанию)</option>' +
              '<option value="personal" ' + (filterType === 'personal' ? 'selected' : '') + '>Только персональные</option>' +
            '</select>' +
          '</div>' +
          (q || filterType !== 'all' ?
            '<button type="button" class="btn btn-sm btn-ghost" onclick="S.subPriceSearch=\'\';S.subPriceFilter=\'all\';renderApp()">Сбросить</button>' : '') +
        '</div>' +
      '</div>' +

      // Сетка прайс-листов
      '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(340px, 1fr));gap:14px">' +
        (filtered.length ? filtered.map(function(pl) {
          var items = pl.items || [];
          var p5e = items.find(function(it){ return it.work_code === 'port_5e'; }) || { price_tier_1: 3000, price_tier_2: 2500 };
          var p6 = items.find(function(it){ return it.work_code === 'port_6' || it.work_code === 'port_optics'; }) || { price_tier_1: 3500, price_tier_2: 3000 };
          var km = items.find(function(it){ return it.work_code === 'km_rate'; }) || { price_tier_1: 12 };
          var daily = items.find(function(it){ return it.work_code === 'daily_rate'; }) || { price_tier_1: 700 };

          var isDef = Boolean(pl.is_default);

          return '<div class="card p-3" style="background:#fff;border:' + (isDef ? '2px solid #3b82f6' : '1.5px solid var(--border)') + ';border-radius:10px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:' + (isDef ? '0 4px 12px rgba(59,130,246,0.1)' : 'none') + '">' +
            '<div>' +
              '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">' +
                '<div>' +
                  '<div style="font-weight:700;font-size:.94rem;color:var(--text);line-height:1.3">' + escHtml(pl.name) + '</div>' +
                  (pl.contractor_name ?
                    '<div style="font-size:.78rem;color:#1e40af;font-weight:600;margin-top:3px">👤 Исполнитель: ' + escHtml(pl.contractor_name) + '</div>' :
                    (isDef ? '<div style="font-size:.78rem;color:#15803d;font-weight:600;margin-top:3px">⭐ Общесистемный (по умолчанию)</div>' : '<div style="font-size:.78rem;color:var(--text-3);margin-top:3px">Общий прайс-лист</div>')) +
                '</div>' +
                (isDef ? '<span class="badge b-blue" style="font-size:.70rem;white-space:nowrap">По умолчанию</span>' : '<span class="badge b-gray" style="font-size:.70rem">Активен</span>') +
              '</div>' +

              (pl.customer_tag ? '<div style="font-size:.74rem;color:var(--text-3);margin-bottom:10px">Тэг / направление: <b>' + escHtml(pl.customer_tag) + '</b></div>' : '') +

              // Превью тарифов
              '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:12px;font-size:.78rem;display:flex;flex-direction:column;gap:5px">' +
                '<div style="display:flex;justify-content:space-between;align-items:center">' +
                  '<span style="color:var(--text-2)">Порт СКС 5e:</span>' +
                  '<span style="font-weight:700;color:var(--text)">' + p5e.price_tier_1 + ' ₽ <span style="font-weight:400;color:var(--text-3)">(1–3)</span> / ' + p5e.price_tier_2 + ' ₽ <span style="font-weight:400;color:var(--text-3)">(>3)</span></span>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center">' +
                  '<span style="color:var(--text-2)">Порт кат. 6 / Оптика:</span>' +
                  '<span style="font-weight:700;color:var(--text)">' + p6.price_tier_1 + ' ₽ / ' + p6.price_tier_2 + ' ₽</span>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center">' +
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
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:.74rem;color:var(--text-3)">' +
                '<span>Всего позиций: <b>' + items.length + '</b></span>' +
                (pl.contract_number ? '<span>Договор № ' + escHtml(pl.contract_number) + '</span>' : '') +
              '</div>' +
              '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
                '<button type="button" class="btn btn-sm btn-primary" style="flex:1" onclick="openSubPriceListItemsModal(' + pl.id + ')">📋 Позиции (' + items.length + ')</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" onclick="openSubPriceListModal(' + pl.id + ')">⚙️ Настройки</button>' +
                (!isDef ? '<button type="button" class="btn btn-sm btn-ghost" title="Сделать основным по умолчанию" onclick="setSubPriceListDefault(' + pl.id + ')">⭐</button>' : '') +
                (!isDef ? '<button type="button" class="btn btn-sm btn-ghost" style="color:var(--red)" title="Удалить прайс" onclick="deleteSubPriceList(' + pl.id + ')">🗑️</button>' : '') +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('') :
        '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text-3);background:#fff;border-radius:10px;border:1.5px solid var(--border)">' +
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

    var modalHtml = '<div class="modal-backdrop" id="sub_contract_modal_backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">' +
      '<div class="card p-4" style="background:#fff;border-radius:12px;max-width:620px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 10px 25px rgba(0,0,0,0.15)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;border-bottom:1.5px solid var(--border);padding-bottom:.75rem">' +
          '<h3 style="margin:0;font-size:1.15rem;display:flex;align-items:center;gap:6px">' +
            '<span>📑 ' + (isEdit ? 'Редактирование договора субподряда' : 'Новый договор субподряда') + '</span>' +
          '</h3>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'sub_contract_modal_backdrop\').remove()">✕</button>' +
        '</div>' +

        '<form id="sub_contract_form" onsubmit="saveSubContract(event, ' + (isEdit ? c.id : 'null') + ')">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">' +
            '<div style="grid-column:1/-1">' +
              '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Исполнитель (Субподрядчик) *</label>' +
              '<select id="sc_contractor_id" required style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
                '<option value="">-- Выберите исполнителя из базы --</option>' +
                contractorOpts +
              '</select>' +
            '</div>' +

            '<div style="grid-column:1/-1">' +
              '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Заказчик (Юридическое лицо группы) *</label>' +
              '<select id="sc_own_company_id" required style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
                ownOpts +
              '</select>' +
            '</div>' +

            '<div>' +
              '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Номер договора *</label>' +
              '<input type="text" id="sc_number" required value="' + escHtml(c ? c.contract_number : '') + '" placeholder="Например, СКС Т/01-02-26" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            '</div>' +

            '<div>' +
              '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Дата договора *</label>' +
              '<input type="date" id="sc_date" required value="' + cDate + '" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            '</div>' +

            '<div style="grid-column:1/-1">' +
              '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Предмет договора / Направление</label>' +
              '<input type="text" id="sc_subject" value="' + escHtml(c ? (c.subject || '') : 'Монтаж СКС и слаботочных систем') + '" placeholder="Например: Модернизация СКС в отделениях «Сбера»" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            '</div>' +

            '<div>' +
              '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Тэг / Конечный заказчик</label>' +
              '<input type="text" id="sc_customer_tag" value="' + escHtml(c ? (c.customer_tag || '') : '') + '" placeholder="ПАО Сбербанк, ОСФР, Росприрода..." style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            '</div>' +

            '<div>' +
              '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Территория действия</label>' +
              '<input type="text" id="sc_territory" value="' + escHtml(c ? (c.territory || '') : '') + '" placeholder="Например: Тюменская обл., УФО" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            '</div>' +

            '<div>' +
              '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Действует с</label>' +
              '<input type="date" id="sc_valid_from" value="' + vFrom + '" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            '</div>' +

            '<div>' +
              '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Действует по</label>' +
              '<input type="date" id="sc_valid_to" value="' + vTo + '" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            '</div>' +

            '<div>' +
              '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Статус договора</label>' +
              '<select id="sc_status" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
                '<option value="active" ' + (c && c.status === 'active' ? 'selected' : '') + '>Действует</option>' +
                '<option value="pending" ' + (c && c.status === 'pending' ? 'selected' : '') + '>На согласовании</option>' +
                '<option value="completed" ' + (c && c.status === 'completed' ? 'selected' : '') + '>Завершен</option>' +
              '</select>' +
            '</div>' +

            (!isEdit ?
              '<div style="grid-column:1/-1;background:#eff6ff;padding:10px 12px;border-radius:6px;border:1px solid #bfdbfe">' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:.82rem;font-weight:600;color:#1e40af;cursor:pointer">' +
                  '<input type="checkbox" id="sc_create_pl" checked style="accent-color:#2563eb;width:16px;height:16px"> ' +
                  'Автоматически создать привязанный прайс-лист на основе типового' +
                '</label>' +
              '</div>' : '') +
          '</div>' +

          '<div style="display:flex;justify-content:flex-end;gap:8px;border-top:1.5px solid var(--border);padding-top:12px;margin-top:12px">' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'sub_contract_modal_backdrop\').remove()">Отмена</button>' +
            '<button type="submit" class="btn btn-sm btn-primary">Сохранить договор</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>';

    document.body.insertAdjacentHTML('beforeend', modalHtml);
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
      var backdrop = document.getElementById('sub_contract_modal_backdrop');
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

    var modalHtml = '<div class="modal-backdrop" id="sub_price_modal_backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">' +
      '<div class="card p-4" style="background:#fff;border-radius:12px;max-width:540px;width:100%;box-shadow:0 10px 25px rgba(0,0,0,0.15)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;border-bottom:1.5px solid var(--border);padding-bottom:.75rem">' +
          '<h3 style="margin:0;font-size:1.15rem;display:flex;align-items:center;gap:6px">' +
            '<span>📊 ' + (isEdit ? 'Параметры прайс-листа' : 'Новый прайс-лист субподряда') + '</span>' +
          '</h3>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'sub_price_modal_backdrop\').remove()">✕</button>' +
        '</div>' +

        '<form id="sub_price_form" onsubmit="saveSubPriceList(event, ' + (isEdit ? pl.id : 'null') + ')">' +
          '<div style="display:flex;flex-direction:column;gap:12px;margin-bottom:14px">' +
            '<div>' +
              '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Название прайс-листа *</label>' +
              '<input type="text" id="spl_name" required value="' + escHtml(pl ? pl.name : '') + '" placeholder="Например: Индивидуальный прайс (Сбербанк)" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            '</div>' +

            '<div>' +
              '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Привязка к исполнителю (необязательно)</label>' +
              '<select id="spl_contractor_id" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
                '<option value="">-- Без привязки (общесистемный шаблон) --</option>' +
                contractorOpts +
              '</select>' +
            '</div>' +

            '<div>' +
              '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Тэг / Направление работ</label>' +
              '<input type="text" id="spl_customer_tag" value="' + escHtml(pl ? (pl.customer_tag || '') : '') + '" placeholder="ПАО Сбербанк, ОСФР, Разовые объекты..." style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            '</div>' +

            '<div>' +
              '<label style="display:block;font-size:.76rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Регион действия</label>' +
              '<input type="text" id="spl_region" value="' + escHtml(pl ? (pl.region || '') : '') + '" placeholder="Все регионы, либо Тюменская обл., Забайкальский край..." style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem">' +
            '</div>' +

            '<div style="background:#f8fafc;padding:10px 12px;border-radius:6px;border:1px solid #e2e8f0">' +
              '<label style="display:flex;align-items:center;gap:8px;font-size:.82rem;font-weight:600;color:var(--text);cursor:pointer">' +
                '<input type="checkbox" id="spl_is_default" ' + (pl && pl.is_default ? 'checked' : '') + ' style="accent-color:#2563eb;width:16px;height:16px"> ' +
                'Сделать базовым прайсом по умолчанию (для всех без личного прайса)' +
              '</label>' +
            '</div>' +
          '</div>' +

          '<div style="display:flex;justify-content:flex-end;gap:8px;border-top:1.5px solid var(--border);padding-top:12px">' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'sub_price_modal_backdrop\').remove()">Отмена</button>' +
            '<button type="submit" class="btn btn-sm btn-primary">Сохранить</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>';

    document.body.insertAdjacentHTML('beforeend', modalHtml);
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
      var backdrop = document.getElementById('sub_price_modal_backdrop');
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
      return '<tr style="border-bottom:1px solid var(--border)">' +
        '<td style="padding:6px 8px;font-size:.76rem;color:var(--text-3);font-family:monospace">' + (idx + 1) + '</td>' +
        '<td style="padding:6px 8px">' +
          '<input type="text" id="it_name_' + it.id + '" value="' + escHtml(it.work_name) + '" style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:.78rem">' +
        '</td>' +
        '<td style="padding:6px 8px;width:70px">' +
          '<input type="text" id="it_unit_' + it.id + '" value="' + escHtml(it.unit || 'шт') + '" style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:.78rem;text-align:center">' +
        '</td>' +
        '<td style="padding:6px 8px;width:95px">' +
          '<input type="number" id="it_t1_' + it.id + '" value="' + (it.price_tier_1 || 0) + '" style="width:100%;padding:4px 6px;border:1.5px solid #93c5fd;border-radius:4px;font-size:.82rem;font-weight:700;text-align:right">' +
        '</td>' +
        '<td style="padding:6px 8px;width:95px">' +
          '<input type="number" id="it_t2_' + it.id + '" value="' + (it.price_tier_2 || 0) + '" style="width:100%;padding:4px 6px;border:1.5px solid #86efac;border-radius:4px;font-size:.82rem;font-weight:700;text-align:right">' +
        '</td>' +
        '<td style="padding:6px 8px;width:60px">' +
          '<input type="number" id="it_th_' + it.id + '" value="' + (it.tier_threshold || 1) + '" style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:.78rem;text-align:center">' +
        '</td>' +
        '<td style="padding:6px 8px;text-align:right;width:70px">' +
          '<button type="button" class="btn btn-xs btn-primary" title="Сохранить позицию" onclick="saveSubPriceListItem(' + pl.id + ', ' + it.id + ')">💾</button> ' +
          '<button type="button" class="btn btn-xs btn-ghost" style="color:var(--red)" title="Удалить" onclick="deleteSubPriceListItem(' + pl.id + ', ' + it.id + ')">✕</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    var modalHtml = '<div class="modal-backdrop" id="sub_items_modal_backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">' +
      '<div class="card p-4" style="background:#fff;border-radius:12px;max-width:920px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,0.2)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;border-bottom:1.5px solid var(--border);padding-bottom:.65rem">' +
          '<div>' +
            '<h3 style="margin:0;font-size:1.15rem;display:flex;align-items:center;gap:6px">' +
              '<span>📋 Позиции прайс-листа: <b>' + escHtml(pl.name) + '</b></span>' +
            '</h3>' +
            '<div style="font-size:.76rem;color:var(--text-3);margin-top:2px">Тариф 1 — до порога (напр. до 3 портов), Тариф 2 — свыше порога (оптовая ставка)</div>' +
          '</div>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'sub_items_modal_backdrop\').remove()">✕</button>' +
        '</div>' +

        // Форма быстрого добавления позиции
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin-bottom:10px;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">' +
          '<div style="flex:2;min-width:180px">' +
            '<label style="display:block;font-size:.70rem;font-weight:700;color:var(--text-3);margin-bottom:2px">Новая работа / услуга</label>' +
            '<input type="text" id="new_it_name" placeholder="Например: Алмазное бурение d=110мм" style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;font-size:.80rem">' +
          '</div>' +
          '<div style="width:65px">' +
            '<label style="display:block;font-size:.70rem;font-weight:700;color:var(--text-3);margin-bottom:2px">Ед.</label>' +
            '<input type="text" id="new_it_unit" value="шт" style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;font-size:.80rem;text-align:center">' +
          '</div>' +
          '<div style="width:90px">' +
            '<label style="display:block;font-size:.70rem;font-weight:700;color:var(--text-3);margin-bottom:2px">Тариф 1 (₽)</label>' +
            '<input type="number" id="new_it_t1" placeholder="3000" style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;font-size:.80rem;text-align:right">' +
          '</div>' +
          '<div style="width:90px">' +
            '<label style="display:block;font-size:.70rem;font-weight:700;color:var(--text-3);margin-bottom:2px">Тариф 2 (₽)</label>' +
            '<input type="number" id="new_it_t2" placeholder="2500" style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;font-size:.80rem;text-align:right">' +
          '</div>' +
          '<div style="width:65px">' +
            '<label style="display:block;font-size:.70rem;font-weight:700;color:var(--text-3);margin-bottom:2px">Порог</label>' +
            '<input type="number" id="new_it_th" value="3" style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;font-size:.80rem;text-align:center">' +
          '</div>' +
          '<button type="button" class="btn btn-sm btn-primary" onclick="addNewPriceListItem(' + pl.id + ')">+ Добавить позицию</button>' +
        '</div>' +

        // Скроллируемая таблица
        '<div style="flex:1;overflow-y:auto;border:1.5px solid var(--border);border-radius:8px">' +
          '<table style="width:100%;border-collapse:collapse;font-size:.80rem">' +
            '<thead><tr style="background:#f1f5f9;border-bottom:1.5px solid var(--border);position:sticky;top:0;z-index:2;color:var(--text-2);font-size:.72rem;text-transform:uppercase">' +
              '<th style="padding:6px 8px;text-align:left;width:35px">#</th>' +
              '<th style="padding:6px 8px;text-align:left">Наименование работы / услуги</th>' +
              '<th style="padding:6px 8px;text-align:center;width:70px">Ед. изм.</th>' +
              '<th style="padding:6px 8px;text-align:right;width:95px">Тариф 1 (до)</th>' +
              '<th style="padding:6px 8px;text-align:right;width:95px">Тариф 2 (от)</th>' +
              '<th style="padding:6px 8px;text-align:center;width:60px">Порог</th>' +
              '<th style="padding:6px 8px;text-align:right;width:70px">Действия</th>' +
            '</tr></thead>' +
            '<tbody>' +
              rowsHtml +
            '</tbody>' +
          '</table>' +
        '</div>' +

        '<div style="display:flex;justify-content:space-between;align-items:center;border-top:1.5px solid var(--border);padding-top:10px;margin-top:10px">' +
          '<div style="font-size:.76rem;color:var(--text-3)">Изменения вступают в силу немедленно для всех связанных смет</div>' +
          '<button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById(\'sub_items_modal_backdrop\').remove()">Закрыть</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  };

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
      var btn = event.target;
      if (btn) {
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
      var backdrop = document.getElementById('sub_items_modal_backdrop');
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
      var backdrop = document.getElementById('sub_items_modal_backdrop');
      if (backdrop) backdrop.remove();
      openSubPriceListItemsModal(priceListId);
    });
  };

})();
