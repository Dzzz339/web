// public/js/pages/subcontracts.js
// Справочники «Договоры субподряда» и «Прайсы субподряда»
// Сквозная связка расценок с калькулятором сметы СМР и заявками

(function() {
  'use strict';

  // ─── 1. ХЕЛПЕРЫ И ПОИСК ПРАЙС-ЛИСТА ДЛЯ ЗАЯВКИ (УНИВЕРСАЛЬНЫЙ МОСТ) ─────────

  /**
   * Интеллектуальный подбор прайс-листа субподряда (по правилам руководства):
   * 1. Персональный прайс исполнителя (если с субподрядчиком заключен свой прайс под заказчика/регион)
   * 2. Базовый (рекомендованный руководством) прайс для связки: Регион + Заказчик
   *    (например: Базовый / Север / Сбербанк vs Базовый / Поволжье / Сбербанк)
   * 3. Базовый по региону или базовый по заказчику
   * 4. Общесистемный базовый шаблон
   */
  window.findSubcontractPriceList = function(contractorId, customerTag, region) {
    var pricelists = S.subPricelists || [];
    if (!pricelists.length) return null;

    var cId = contractorId ? parseInt(contractorId, 10) : null;
    var custLower = String(customerTag || '').trim().toLowerCase();
    var regLower = String(region || '').trim().toLowerCase();
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
        // Точное совпадение: Заказчик + Регион
        if (custLower && regLower) {
          var matchBoth = contractorLists.find(function(pl) {
            var tag = String(pl.customer_tag || '').toLowerCase();
            var reg = String(pl.region || '').toLowerCase();
            return (tag && (tag.includes(custLower) || custLower.includes(tag))) &&
                   (reg && (reg.includes(regLower) || regLower.includes(reg)));
          });
          if (matchBoth) return matchBoth;
        }

        // Совпадение по заказчику
        if (custLower) {
          var matchCust = contractorLists.find(function(pl) {
            var tag = String(pl.customer_tag || pl.name || '').toLowerCase();
            return tag && (tag.includes(custLower) || custLower.includes(tag));
          });
          if (matchCust) return matchCust;
        }

        // Совпадение по региону
        if (regLower) {
          var matchReg = contractorLists.find(function(pl) {
            var reg = String(pl.region || pl.name || '').toLowerCase();
            return reg && (reg.includes(regLower) || regLower.includes(reg));
          });
          if (matchReg) return matchReg;
        }

        return contractorLists[0];
      }
    }

    // 2. Поиск базового (рекомендованного руководством) прайса
    // Базовые прайсы: имеют флаг is_default или не привязаны к конкретному исполнителю
    var baseLists = pricelists.filter(function(pl) {
      return pl.is_active && (pl.is_default || !pl.contractor_id);
    });

    if (baseLists.length > 0) {
      // 2.1. Точное совпадение: Заказчик + Регион (например: Север + Сбербанк)
      if (custLower && regLower) {
        var baseBoth = baseLists.find(function(pl) {
          var tag = String(pl.customer_tag || '').toLowerCase();
          var reg = String(pl.region || '').toLowerCase();
          return (tag && (tag.includes(custLower) || custLower.includes(tag))) &&
                 (reg && (reg.includes(regLower) || regLower.includes(reg)));
        });
        if (baseBoth) return baseBoth;
      }

      // 2.2. Совпадение по региону (например: Север / Поволжье / Сибирь)
      if (regLower) {
        var baseReg = baseLists.find(function(pl) {
          var reg = String(pl.region || pl.name || '').toLowerCase();
          return reg && (reg.includes(regLower) || regLower.includes(reg));
        });
        if (baseReg) return baseReg;
      }

      // 2.3. Совпадение по заказчику (например: Сбербанк)
      if (custLower) {
        var baseCust = baseLists.find(function(pl) {
          var tag = String(pl.customer_tag || pl.name || '').toLowerCase();
          return tag && (tag.includes(custLower) || custLower.includes(tag));
        });
        if (baseCust) return baseCust;
      }

      // 2.4. Дефолтный прайс
      var defPl = baseLists.find(function(pl) { return pl.is_default; });
      if (defPl) return defPl;

      return baseLists[0];
    }

    // 3. Fallback: любой первый активный прайс
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
        isRecommended: false,
        lines: [
          { name: params.customDesc || 'Согласованная стоимость работ по договору', qty: 1, unit: 'объект', price: customPrice, sum: customPrice }
        ]
      };
    }

    var pl = window.findSubcontractPriceList(params.contractorId, params.customerTag, params.region);
    var items = (pl && Array.isArray(pl.items)) ? pl.items : [];
    var isRecommended = Boolean(pl && (pl.is_default || !pl.contractor_id));

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
      isRecommended: isRecommended,
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

    return '<div style="animation:fadeIn 0.15s ease; padding:0 0 2rem 0; margin-bottom:1.25rem">' +
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
    var filterType = S.subPriceFilter || 'all'; // all | base | personal
    var filterRegion = S.subPriceRegion || 'all';
    var filterCustomer = S.subPriceCustomer || 'all';
    var viewMode = S.subPriceViewMode || 'table'; // table (по умолчанию) | cards

    // Собираем уникальные регионы и заказчиков для фильтров
    var distinctRegions = [];
    var distinctCustomers = [];
    pricelists.forEach(function(pl) {
      if (pl.region && !distinctRegions.includes(pl.region)) distinctRegions.push(pl.region);
      if (pl.customer_tag && !distinctCustomers.includes(pl.customer_tag)) distinctCustomers.push(pl.customer_tag);
    });

    var filtered = pricelists.filter(function(pl) {
      var isBase = Boolean(pl.is_default || !pl.contractor_id);
      if (filterType === 'base' && !isBase) return false;
      if (filterType === 'personal' && isBase) return false;
      if (filterRegion !== 'all' && String(pl.region || '') !== String(filterRegion)) return false;
      if (filterCustomer !== 'all' && String(pl.customer_tag || '') !== String(filterCustomer)) return false;

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
    var baseCount = pricelists.filter(function(p) { return Boolean(p.is_default || !p.contractor_id); }).length;
    var personalCount = pricelists.filter(function(p) { return Boolean(p.contractor_id); }).length;
    var regionsCount = distinctRegions.length || 1;

    // Опции фильтров
    var regionOpts = distinctRegions.map(function(r) {
      return '<option value="' + escHtml(r) + '" ' + (filterRegion === r ? 'selected' : '') + '>📍 ' + escHtml(r) + '</option>';
    }).join('');

    var customerOpts = distinctCustomers.map(function(c) {
      return '<option value="' + escHtml(c) + '" ' + (filterCustomer === c ? 'selected' : '') + '>🏷️ ' + escHtml(c) + '</option>';
    }).join('');

    return '<div style="animation:fadeIn 0.15s ease; padding:0 0 2rem 0; margin-bottom:1.25rem">' +
      // Заголовок
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;margin-bottom:1.5rem">' +
        '<div>' +
          '<h1 class="page-title" style="margin:0;display:flex;align-items:center;gap:10px;font-size:1.45rem;font-weight:800"><span>📊 Прайсы субподряда</span></h1>' +
          '<div style="font-size:.84rem;color:var(--text-3);margin-top:4px">' +
            'Реестр тарифных сеток СМР: базовые (рекомендации руководства по регионам и заказчикам) и персональные прайсы исполнителей' +
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
          '<div style="font-size:.74rem;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:.03em">Всего прайсов</div>' +
          '<div style="font-size:1.75rem;font-weight:800;color:var(--text);margin-top:6px">' + totalCount + '</div>' +
          '<div style="font-size:.74rem;color:var(--text-3);margin-top:4px">В реестре системы</div>' +
        '</div>' +
        '<div class="card" style="padding:16px 20px;border-radius:12px;border:1.5px solid #86efac;background:#f0fdf4;box-shadow:0 2px 8px rgba(22,101,52,0.04)">' +
          '<div style="font-size:.74rem;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.03em">Базовые (Рекомендованные)</div>' +
          '<div style="font-size:1.75rem;font-weight:800;color:#15803d;margin-top:6px">' + baseCount + '</div>' +
          '<div style="font-size:.74rem;color:#166534;margin-top:4px">Сетки руководства по регионам</div>' +
        '</div>' +
        '<div class="card" style="padding:16px 20px;border-radius:12px;border:1.5px solid #bfdbfe;background:#eff6ff;box-shadow:0 2px 8px rgba(30,64,175,0.04)">' +
          '<div style="font-size:.74rem;color:#1e40af;font-weight:700;text-transform:uppercase;letter-spacing:.03em">Персональные прайсы</div>' +
          '<div style="font-size:1.75rem;font-weight:800;color:#1d4ed8;margin-top:6px">' + personalCount + '</div>' +
          '<div style="font-size:.74rem;color:#1e40af;margin-top:4px">Индивидуальные соглашения</div>' +
        '</div>' +
        '<div class="card" style="padding:16px 20px;border-radius:12px;border:1.5px solid var(--border);background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.03)">' +
          '<div style="font-size:.74rem;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:.03em">Охвачено регионов</div>' +
          '<div style="font-size:1.75rem;font-weight:800;color:var(--text);margin-top:6px">' + regionsCount + '</div>' +
          '<div style="font-size:.74rem;color:var(--text-3);margin-top:4px">Север, Поволжье, Сибирь...</div>' +
        '</div>' +
      '</div>' +

      // Фильтры и переключатель вида
      '<div class="card mb-3" style="padding:14px 18px;border-radius:12px;border:1.5px solid var(--border);background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.02)">' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between">' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;flex:1">' +
            '<div style="flex:1;min-width:240px">' +
              '<input type="text" id="sub_price_q" value="' + escHtml(S.subPriceSearch || '') + '" ' +
                'placeholder="🔍 Поиск по названию прайса, исполнителю, региону..." ' +
                'oninput="S.subPriceSearch=this.value; renderApp()" ' +
                'style="width:100%;padding:8px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
            '</div>' +
            '<div style="min-width:180px">' +
              '<select onchange="S.subPriceFilter=this.value; renderApp()" style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.84rem;background:#fff">' +
                '<option value="all" ' + (filterType === 'all' ? 'selected' : '') + '>Все типы прайсов</option>' +
                '<option value="base" ' + (filterType === 'base' ? 'selected' : '') + '>⭐ Только базовые (рекомендации)</option>' +
                '<option value="personal" ' + (filterType === 'personal' ? 'selected' : '') + '>👤 Только персональные</option>' +
              '</select>' +
            '</div>' +
            '<div style="min-width:170px">' +
              '<select onchange="S.subPriceRegion=this.value; renderApp()" style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.84rem;background:#fff">' +
                '<option value="all">Все регионы</option>' +
                regionOpts +
              '</select>' +
            '</div>' +
            '<div style="min-width:170px">' +
              '<select onchange="S.subPriceCustomer=this.value; renderApp()" style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.84rem;background:#fff">' +
                '<option value="all">Все заказчики</option>' +
                customerOpts +
              '</select>' +
            '</div>' +
            (q || filterType !== 'all' || filterRegion !== 'all' || filterCustomer !== 'all' ?
              '<button type="button" class="btn btn-sm btn-ghost" style="border:1.5px solid var(--border);border-radius:8px;padding:8px 14px" onclick="S.subPriceSearch=\'\';S.subPriceFilter=\'all\';S.subPriceRegion=\'all\';S.subPriceCustomer=\'all\';renderApp()">Сбросить</button>' : '') +
          '</div>' +

          // Переключатель Таблица / Плитка
          '<div style="display:flex;border:1.5px solid var(--border);border-radius:8px;overflow:hidden">' +
            '<button type="button" class="btn btn-sm" style="padding:6px 12px;border-radius:0;border:none;' + (viewMode === 'table' ? 'background:#2563eb;color:#fff;font-weight:700' : 'background:#fff;color:var(--text)') + '" onclick="S.subPriceViewMode=\'table\';renderApp()" title="Табличный реестр (рекомендуется)">☰ Таблица</button>' +
            '<button type="button" class="btn btn-sm" style="padding:6px 12px;border-radius:0;border:none;' + (viewMode === 'cards' ? 'background:#2563eb;color:#fff;font-weight:700' : 'background:#fff;color:var(--text)') + '" onclick="S.subPriceViewMode=\'cards\';renderApp()" title="Плиточный вид">⊞ Плитка</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // ─── РЕЖИМ 1: ТАБЛИЧНЫЙ РЕЕСТР (УДОБНО ДЛЯ БОЛЬШОГО КОЛИЧЕСТВА) ─────────
      (viewMode === 'table' ?
        '<div class="card tbl-wrap" style="background:#fff;border-radius:12px;border:1.5px solid var(--border);overflow:hidden;overflow-x:auto;box-shadow:0 2px 8px rgba(0,0,0,0.03)">' +
          '<div style="padding:12px 18px;border-bottom:1px solid var(--border);background:#fafafa;display:flex;justify-content:space-between;align-items:center">' +
            '<div style="font-weight:700;font-size:.88rem;color:var(--text)">' +
              'Реестр прайс-листов субподряда (' + filtered.length + ')' +
            '</div>' +
          '</div>' +
          '<table style="width:100%;border-collapse:collapse;font-size:.83rem">' +
            '<thead><tr style="background:#f8fafc;border-bottom:1.5px solid var(--border);color:var(--text-3);font-size:.74rem;text-transform:uppercase;letter-spacing:.03em">' +
              '<th style="padding:12px 16px;text-align:left;min-width:210px">Название прайс-листа</th>' +
              '<th style="padding:12px 16px;text-align:left;min-width:140px">Тип прайса</th>' +
              '<th style="padding:12px 16px;text-align:left;min-width:130px">Регион</th>' +
              '<th style="padding:12px 16px;text-align:left;min-width:130px">Заказчик</th>' +
              '<th style="padding:12px 16px;text-align:left;min-width:180px">Исполнитель</th>' +
              '<th style="padding:12px 16px;text-align:left;min-width:260px">Ключевые тарифы СМР (превью)</th>' +
              '<th style="padding:12px 16px;text-align:center;width:75px">Позиций</th>' +
              '<th style="padding:12px 16px;text-align:right;min-width:200px">Действия</th>' +
            '</tr></thead>' +
            '<tbody>' +
              (filtered.length ? filtered.map(function(pl) {
                var items = pl.items || [];
                var p5e = items.find(function(it){ return it.work_code === 'port_5e'; }) || { price_tier_1: 3000, price_tier_2: 2500 };
                var p6 = items.find(function(it){ return it.work_code === 'port_6' || it.work_code === 'port_optics'; }) || { price_tier_1: 3500, price_tier_2: 3000 };
                var km = items.find(function(it){ return it.work_code === 'km_rate'; }) || { price_tier_1: 12 };
                var daily = items.find(function(it){ return it.work_code === 'daily_rate'; }) || { price_tier_1: 700 };

                var isBase = Boolean(pl.is_default || !pl.contractor_id);
                var typeBadge = isBase ?
                  '<span class="badge" style="background:#f0fdf4;color:#166534;border:1px solid #86efac;padding:3px 8px;border-radius:6px;font-weight:700;font-size:.74rem">⭐ Базовый (Реком.)</span>' :
                  '<span class="badge" style="background:#f5f3ff;color:#6b21a8;border:1px solid #d8b4fe;padding:3px 8px;border-radius:6px;font-weight:700;font-size:.74rem">👤 Персональный</span>';

                var regionHtml = pl.region ?
                  '<span style="font-weight:600;color:var(--text)">📍 ' + escHtml(pl.region) + '</span>' :
                  '<span style="color:var(--text-3)">Все регионы (РФ)</span>';

                var customerHtml = pl.customer_tag ?
                  '<span class="badge" style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;padding:3px 8px;border-radius:6px;font-size:.74rem;font-weight:600">🏷️ ' + escHtml(pl.customer_tag) + '</span>' :
                  '<span style="color:var(--text-3)">Все заказчики</span>';

                var contractorHtml = pl.contractor_name ?
                  '<div><div style="font-weight:600;color:var(--text)">' + escHtml(pl.contractor_name) + '</div>' + (pl.contract_number ? '<div style="font-size:.74rem;color:var(--text-3);margin-top:2px">Договор № ' + escHtml(pl.contract_number) + '</div>' : '') + '</div>' :
                  '<span style="color:var(--text-3);font-size:.78rem">Все исполнители региона</span>';

                return '<tr style="border-bottom:1px solid var(--border);transition:background .1s" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'#fff\'">' +
                  '<td style="padding:12px 16px">' +
                    '<div style="font-weight:700;color:var(--text);font-size:.88rem">' + escHtml(pl.name) + '</div>' +
                  '</td>' +
                  '<td style="padding:12px 16px">' +
                    typeBadge +
                  '</td>' +
                  '<td style="padding:12px 16px">' +
                    regionHtml +
                  '</td>' +
                  '<td style="padding:12px 16px">' +
                    customerHtml +
                  '</td>' +
                  '<td style="padding:12px 16px">' +
                    contractorHtml +
                  '</td>' +
                  '<td style="padding:12px 16px">' +
                    '<div style="display:flex;gap:5px;flex-wrap:wrap;font-size:.76rem">' +
                      '<span style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:2px 7px;border-radius:5px" title="Порт СКС 5e (1–3 / >3 шт)">5e: <b>' + p5e.price_tier_1 + ' / ' + p5e.price_tier_2 + ' ₽</b></span>' +
                      '<span style="background:#f8fafc;color:#334155;border:1px solid #e2e8f0;padding:2px 7px;border-radius:5px" title="Порт кат. 6 / Оптика">Кат.6: <b>' + p6.price_tier_1 + ' / ' + p6.price_tier_2 + ' ₽</b></span>' +
                      '<span style="background:#f8fafc;color:#334155;border:1px solid #e2e8f0;padding:2px 7px;border-radius:5px" title="Дорога свыше 10 км">Км: <b>' + km.price_tier_1 + ' ₽</b></span>' +
                      '<span style="background:#f8fafc;color:#334155;border:1px solid #e2e8f0;padding:2px 7px;border-radius:5px" title="Суточные командировки">Сут: <b>' + daily.price_tier_1 + ' ₽</b></span>' +
                    '</div>' +
                  '</td>' +
                  '<td style="padding:12px 16px;text-align:center">' +
                    '<span class="badge b-blue" style="font-size:.72rem;padding:3px 7px">' + (items.length || 0) + ' поз.</span>' +
                  '</td>' +
                  '<td style="padding:12px 16px;text-align:right">' +
                    '<div style="display:flex;gap:6px;justify-content:flex-end;align-items:center">' +
                      '<button type="button" class="btn btn-xs btn-primary" style="padding:5px 10px;font-weight:600;border-radius:6px" onclick="openSubPriceListItemsModal(' + pl.id + ')">📋 Позиции</button>' +
                      '<button type="button" class="btn btn-xs btn-ghost" style="border:1.5px solid var(--border);padding:5px 8px;border-radius:6px" onclick="openSubPriceListModal(' + pl.id + ')" title="Редактировать параметры прайса">⚙️</button>' +
                      '<button type="button" class="btn btn-xs btn-ghost" style="border:1.5px solid #bfdbfe;color:#1d4ed8;padding:5px 8px;border-radius:6px" onclick="cloneSubPriceList(' + pl.id + ')" title="Клонировать прайс (создать копию для другого региона)">📄 Копия</button>' +
                      '<button type="button" class="btn btn-xs btn-ghost" style="color:var(--red);border:1.5px solid #fecaca;padding:5px 8px;border-radius:6px" onclick="deleteSubPriceList(' + pl.id + ')" title="Удалить прайс">🗑️</button>' +
                    '</div>' +
                  '</td>' +
                '</tr>';
              }).join('') :
              '<tr><td colspan="8" style="padding:36px;text-align:center;color:var(--text-3)">' +
                (q ? 'По вашему запросу прайс-листов не найдено' : 'Прайс-листы пока не созданы. Нажмите «+ Создать прайс-лист»') +
              '</td></tr>') +
            '</tbody>' +
          '</table>' +
        '</div>' :

        // ─── РЕЖИМ 2: ПЛИТОЧНЫЙ ВИД ───────────────────────────────────────────
        '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(360px, 1fr));gap:18px">' +
          (filtered.length ? filtered.map(function(pl) {
            var items = pl.items || [];
            var p5e = items.find(function(it){ return it.work_code === 'port_5e'; }) || { price_tier_1: 3000, price_tier_2: 2500 };
            var p6 = items.find(function(it){ return it.work_code === 'port_6' || it.work_code === 'port_optics'; }) || { price_tier_1: 3500, price_tier_2: 3000 };
            var km = items.find(function(it){ return it.work_code === 'km_rate'; }) || { price_tier_1: 12 };
            var daily = items.find(function(it){ return it.work_code === 'daily_rate'; }) || { price_tier_1: 700 };

            var isBase = Boolean(pl.is_default || !pl.contractor_id);

            return '<div class="card" style="background:#fff;border:' + (isBase ? '2px solid #86efac' : '1.5px solid var(--border)') + ';border-radius:14px;padding:20px 22px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:' + (isBase ? '0 4px 16px rgba(22,101,52,0.06)' : '0 2px 8px rgba(0,0,0,0.03)') + '">' +
              '<div>' +
                '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">' +
                  '<div style="flex:1">' +
                    '<div style="font-weight:800;font-size:1.02rem;color:var(--text);line-height:1.35">' + escHtml(pl.name) + '</div>' +
                    (pl.contractor_name ?
                      '<div style="font-size:.80rem;color:#1e40af;font-weight:600;margin-top:4px">👤 Исполнитель: ' + escHtml(pl.contractor_name) + '</div>' :
                      '<div style="font-size:.80rem;color:#15803d;font-weight:600;margin-top:4px">⭐ Базовый (рекомендован руководством)</div>') +
                  '</div>' +
                  (isBase ? '<span class="badge b-green" style="font-size:.72rem;padding:4px 10px;white-space:nowrap;font-weight:700">Базовый</span>' : '<span class="badge b-purple" style="font-size:.72rem;padding:4px 8px">Персональный</span>') +
                '</div>' +

                '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">' +
                  (pl.region ? '<span style="font-size:.74rem;color:#0369a1;background:#e0f2fe;border:1px solid #bae6fd;padding:3px 8px;border-radius:12px;font-weight:600">📍 ' + escHtml(pl.region) + '</span>' : '<span style="font-size:.74rem;color:var(--text-3);background:#f1f5f9;padding:3px 8px;border-radius:12px">📍 Все регионы</span>') +
                  (pl.customer_tag ? '<span style="font-size:.74rem;color:#334155;background:#f1f5f9;border:1px solid #cbd5e1;padding:3px 8px;border-radius:12px;font-weight:600">🏷️ ' + escHtml(pl.customer_tag) + '</span>' : '') +
                '</div>' +

                // Превью тарифов
                '<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:.82rem;display:flex;flex-direction:column;gap:8px">' +
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
                '<div style="display:flex;gap:6px;align-items:center">' +
                  '<button type="button" class="btn btn-sm btn-primary" style="flex:1;padding:8px 10px;font-weight:600;border-radius:8px" onclick="openSubPriceListItemsModal(' + pl.id + ')">📋 Позиции (' + items.length + ')</button>' +
                  '<button type="button" class="btn btn-sm btn-ghost" style="border:1.5px solid var(--border);padding:8px 10px;border-radius:8px" onclick="openSubPriceListModal(' + pl.id + ')">⚙️</button>' +
                  '<button type="button" class="btn btn-sm btn-ghost" style="border:1.5px solid #bfdbfe;color:#1d4ed8;padding:8px 10px;border-radius:8px" title="Клонировать прайс" onclick="cloneSubPriceList(' + pl.id + ')">📄</button>' +
                  '<button type="button" class="btn btn-sm btn-ghost" style="color:var(--red);border:1.5px solid #fecaca;padding:8px 10px;border-radius:8px" title="Удалить прайс" onclick="deleteSubPriceList(' + pl.id + ')">🗑️</button>' +
                '</div>' +
              '</div>' +
            '</div>';
          }).join('') :
          '<div style="grid-column:1/-1;padding:48px;text-align:center;color:var(--text-3);background:#fff;border-radius:12px;border:1.5px solid var(--border)">' +
            'Прайс-листы не найдены. Нажмите «+ Создать прайс-лист»' +
          '</div>') +
        '</div>') +
    '</div>';
  };

  // ─── 4. МОДАЛКА: СОЗДАНИЕ / РЕДАКТИРОВАНИЕ / КЛОНИРОВАНИЕ ПРАЙС-ЛИСТА ─────────

  window.cloneSubPriceList = function(sourceId) {
    window.openSubPriceListModal(null, sourceId);
  };

  window.toggleSubPriceType = function(val) {
    var cWrap = document.getElementById('spl_contractor_wrap');
    if (cWrap) {
      cWrap.style.display = (val === 'personal') ? 'block' : 'none';
    }
  };

  window.openSubPriceListModal = function(priceListId, copyFromId) {
    var pl = priceListId ? (S.subPricelists || []).find(function(x){ return x.id === priceListId; }) : null;
    var srcPl = copyFromId ? (S.subPricelists || []).find(function(x){ return x.id === copyFromId; }) : null;
    var isEdit = Boolean(pl);
    var isClone = Boolean(srcPl);

    var subContractors = (S.contractors || []).filter(function(x) {
      return x && x.type !== 'customer' && !String(x.inn || '').startsWith('CUST-');
    });

    var selectedContractorId = pl ? pl.contractor_id : (srcPl ? srcPl.contractor_id : null);
    var contractorOpts = subContractors.map(function(ct) {
      var sel = (selectedContractorId === ct.id) ? 'selected' : '';
      return '<option value="' + ct.id + '" ' + sel + '>' + escHtml(ct.name_short) + ' (ИНН ' + escHtml(ct.inn || '—') + ')</option>';
    }).join('');

    // Список прайсов для выбора источника позиций
    var sourceOpts = (S.subPricelists || []).map(function(p) {
      var sel = (copyFromId && copyFromId === p.id) || (!copyFromId && p.is_default) ? 'selected' : '';
      return '<option value="' + p.id + '" ' + sel + '>' + escHtml(p.name) + (p.region ? ' (' + escHtml(p.region) + ')' : '') + '</option>';
    }).join('');

    var defaultName = '';
    if (isEdit) defaultName = pl.name;
    else if (isClone) defaultName = 'Копия: ' + srcPl.name;

    var defaultRegion = pl ? (pl.region || '') : (srcPl ? (srcPl.region || '') : '');
    var defaultTag = pl ? (pl.customer_tag || '') : (srcPl ? (srcPl.customer_tag || '') : '');
    var isBase = pl ? Boolean(pl.is_default || !pl.contractor_id) : (srcPl ? Boolean(srcPl.is_default || !srcPl.contractor_id) : true);

    var modalTitle = isEdit ? 'Настройки прайс-листа' : (isClone ? 'Клонирование прайс-листа' : 'Новый прайс-лист субподряда');

    var modalHtml = '<div class="modal-overlay modal-backdrop" id="_sub_price_modal_backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">' +
      '<div class="modal-box card" style="background:#fff;border-radius:14px;max-width:620px;width:100%;max-height:92vh;box-shadow:0 16px 40px rgba(0,0,0,0.22);overflow:hidden;display:flex;flex-direction:column">' +
        '<div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1.5px solid var(--border);background:#fafafa;cursor:move;user-select:none">' +
          '<h3 class="modal-title" style="margin:0;font-size:1.1rem;display:flex;align-items:center;gap:8px">' +
            '<span>📊</span> <span>' + modalTitle + '</span>' +
          '</h3>' +
          '<button type="button" class="btn-close btn btn-sm btn-ghost" onclick="var b=document.getElementById(\'_sub_price_modal_backdrop\'); if(b) b.remove();">✕</button>' +
        '</div>' +

        '<div class="modal-body" style="padding:20px 24px;overflow-y:auto;flex:1">' +
          '<form id="sub_price_form" onsubmit="saveSubPriceList(event, ' + (isEdit ? pl.id : 'null') + ')">' +
            '<input type="hidden" id="spl_copy_from_id" value="' + (copyFromId || '') + '">' +

            '<div style="display:flex;flex-direction:column;gap:14px;margin-bottom:16px">' +
              // 1. Выбор типа прайса (Базовый vs Персональный)
              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:6px">Тип прайса *</label>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
                  '<label style="border:1.5px solid ' + (isBase ? '#15803d' : 'var(--border)') + ';background:' + (isBase ? '#f0fdf4' : '#fff') + ';border-radius:8px;padding:10px 12px;cursor:pointer;display:flex;align-items:flex-start;gap:8px" onclick="document.getElementById(\'rb_base\').checked=true;toggleSubPriceType(\'base\')">' +
                    '<input type="radio" id="rb_base" name="spl_type" value="base" ' + (isBase ? 'checked' : '') + ' onchange="toggleSubPriceType(this.value)" style="margin-top:2px">' +
                    '<div>' +
                      '<div style="font-weight:700;font-size:.84rem;color:#166534">⭐ Базовый (Рекомендованный)</div>' +
                      '<div style="font-size:.72rem;color:var(--text-3);margin-top:2px">Утвержден руководством по умолчанию для региона/заказчика</div>' +
                    '</div>' +
                  '</label>' +
                  '<label style="border:1.5px solid ' + (!isBase ? '#6b21a8' : 'var(--border)') + ';background:' + (!isBase ? '#faf5ff' : '#fff') + ';border-radius:8px;padding:10px 12px;cursor:pointer;display:flex;align-items:flex-start;gap:8px" onclick="document.getElementById(\'rb_personal\').checked=true;toggleSubPriceType(\'personal\')">' +
                    '<input type="radio" id="rb_personal" name="spl_type" value="personal" ' + (!isBase ? 'checked' : '') + ' onchange="toggleSubPriceType(this.value)" style="margin-top:2px">' +
                    '<div>' +
                      '<div style="font-weight:700;font-size:.84rem;color:#6b21a8">👤 Персональный прайс</div>' +
                      '<div style="font-size:.72rem;color:var(--text-3);margin-top:2px">Индивидуальные ставки конкретного субподрядчика</div>' +
                    '</div>' +
                  '</label>' +
                '</div>' +
              '</div>' +

              // 2. Исполнитель (только для персонального)
              '<div id="spl_contractor_wrap" style="display:' + (isBase ? 'none' : 'block') + '">' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Исполнитель (Субподрядчик) *</label>' +
                '<select id="spl_contractor_id" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
                  '<option value="">-- Выберите субподрядчика из базы --</option>' +
                  contractorOpts +
                '</select>' +
              '</div>' +

              // 3. Название прайса
              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Название прайс-листа *</label>' +
                '<input type="text" id="spl_name" required value="' + escHtml(defaultName) + '" placeholder="Например: Базовый прайс СМР (Север / ХМАО)" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
              '</div>' +

              // 4. Регион действия + быстрые подсказки
              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Регион действия (территория)</label>' +
                '<input type="text" id="spl_region" value="' + escHtml(defaultRegion) + '" placeholder="Например: Север (ХМАО / ЯНАО), Поволжье, Сибирь..." style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' +
                  '<button type="button" class="btn btn-xs btn-ghost" style="border:1px solid var(--border);font-size:.72rem;padding:2px 8px" onclick="document.getElementById(\'spl_region\').value=\'Север (ХМАО / ЯНАО)\'">Север (ХМАО/ЯНАО)</button>' +
                  '<button type="button" class="btn btn-xs btn-ghost" style="border:1px solid var(--border);font-size:.72rem;padding:2px 8px" onclick="document.getElementById(\'spl_region\').value=\'Поволжье\'">Поволжье</button>' +
                  '<button type="button" class="btn btn-xs btn-ghost" style="border:1px solid var(--border);font-size:.72rem;padding:2px 8px" onclick="document.getElementById(\'spl_region\').value=\'Сибирь\'">Сибирь</button>' +
                  '<button type="button" class="btn btn-xs btn-ghost" style="border:1px solid var(--border);font-size:.72rem;padding:2px 8px" onclick="document.getElementById(\'spl_region\').value=\'Москва и МО\'">Москва и МО</button>' +
                  '<button type="button" class="btn btn-xs btn-ghost" style="border:1px solid var(--border);font-size:.72rem;padding:2px 8px" onclick="document.getElementById(\'spl_region\').value=\'Урал\'">Урал</button>' +
                  '<button type="button" class="btn btn-xs btn-ghost" style="border:1px solid var(--border);font-size:.72rem;padding:2px 8px" onclick="document.getElementById(\'spl_region\').value=\'Дальний Восток\'">Дальний Восток</button>' +
                  '<button type="button" class="btn btn-xs btn-ghost" style="border:1px solid var(--border);font-size:.72rem;padding:2px 8px" onclick="document.getElementById(\'spl_region\').value=\'Все регионы\'">Все регионы</button>' +
                '</div>' +
              '</div>' +

              // 5. Заказчик / Направление + быстрые подсказки
              '<div>' +
                '<label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:5px">Заказчик / Направление работ</label>' +
                '<input type="text" id="spl_customer_tag" value="' + escHtml(defaultTag) + '" placeholder="ПАО Сбербанк, ОСФР, Россельхоз, Разовые объекты..." style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.86rem;background:#fff">' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' +
                  '<button type="button" class="btn btn-xs btn-ghost" style="border:1px solid var(--border);font-size:.72rem;padding:2px 8px" onclick="document.getElementById(\'spl_customer_tag\').value=\'ПАО Сбербанк\'">ПАО Сбербанк</button>' +
                  '<button type="button" class="btn btn-xs btn-ghost" style="border:1px solid var(--border);font-size:.72rem;padding:2px 8px" onclick="document.getElementById(\'spl_customer_tag\').value=\'ОСФР\'">ОСФР</button>' +
                  '<button type="button" class="btn btn-xs btn-ghost" style="border:1px solid var(--border);font-size:.72rem;padding:2px 8px" onclick="document.getElementById(\'spl_customer_tag\').value=\'Росприроднадзор\'">Росприроднадзор</button>' +
                  '<button type="button" class="btn btn-xs btn-ghost" style="border:1px solid var(--border);font-size:.72rem;padding:2px 8px" onclick="document.getElementById(\'spl_customer_tag\').value=\'Коммерческие объекты\'">Коммерческие</button>' +
                '</div>' +
              '</div>' +

              // 6. Источник копирования позиций (если создается новый или клон)
              (!isEdit ?
                '<div style="background:#eff6ff;padding:12px 14px;border-radius:8px;border:1.5px solid #bfdbfe">' +
                  '<label style="display:block;font-size:.76rem;font-weight:700;color:#1e40af;margin-bottom:4px">Скопировать 22 позиции тарифов из прайса:</label>' +
                  '<select id="spl_source_select" onchange="document.getElementById(\'spl_copy_from_id\').value=this.value" style="width:100%;padding:7px 10px;border:1.5px solid #93c5fd;border-radius:6px;font-size:.84rem;background:#fff">' +
                    sourceOpts +
                  '</select>' +
                  '<div style="font-size:.72rem;color:#1e40af;margin-top:4px">Все позиции будут автоматически продублированы, после чего вы сможете изменить ставки в 1 клик</div>' +
                '</div>' : '') +
            '</div>' +

            '<div style="display:flex;justify-content:flex-end;gap:10px;border-top:1.5px solid var(--border);padding-top:14px">' +
              '<button type="button" class="btn btn-sm btn-ghost" style="border:1.5px solid var(--border);padding:8px 16px;border-radius:8px" onclick="var b=document.getElementById(\'_sub_price_modal_backdrop\'); if(b) b.remove();">Отмена</button>' +
              '<button type="submit" class="btn btn-sm btn-primary" style="padding:8px 18px;font-weight:700;border-radius:8px">' + (isEdit ? 'Сохранить изменения' : (isClone ? 'Создать копию' : 'Создать прайс-лист')) + '</button>' +
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
        title: modalTitle,
        icon: '📊',
        backdrop: bEl,
        onClose: function() { bEl.remove(); }
      });
    }
  };

  window.saveSubPriceList = function(e, priceListId) {
    e.preventDefault();

    var typeEl = document.querySelector('input[name="spl_type"]:checked');
    var isBase = typeEl ? (typeEl.value === 'base') : true;

    var copyFromEl = document.getElementById('spl_copy_from_id');
    var copyFromId = copyFromEl ? (parseInt(copyFromEl.value, 10) || null) : null;
    var sourceSelectEl = document.getElementById('spl_source_select');
    if (!copyFromId && sourceSelectEl) {
      copyFromId = parseInt(sourceSelectEl.value, 10) || null;
    }

    var contractorId = isBase ? null : (parseInt(document.getElementById('spl_contractor_id')?.value, 10) || null);

    var payload = {
      name: document.getElementById('spl_name').value.trim(),
      contractor_id: contractorId,
      customer_tag: document.getElementById('spl_customer_tag').value.trim(),
      region: document.getElementById('spl_region').value.trim(),
      is_default: isBase,
      copy_from_id: copyFromId
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
