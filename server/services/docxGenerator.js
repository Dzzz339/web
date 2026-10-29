// server/services/docxGenerator.js - Профессиональный генератор документов Word (DOCX) для StockEasy
import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Packer,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  PageBreak
} from 'docx';

// Общие стили и типовые реквизиты Генподрядчика по умолчанию (ООО «К10», Директор Городович И.О.)
export const DEFAULT_GENERAL_CONTRACTOR = {
  name_full: 'Общество с ограниченной ответственностью «К10»',
  name_short: 'ООО «К10»',
  inn: '5406828945',
  kpp: '540601001',
  ogrn: '1235400004567',
  address_legal: '630099, г. Новосибирск, ул. Депутатская, д. 46, оф. 1005',
  phone: '+7 (383) 209-00-00',
  email: 'info@k10.group',
  director: 'Городович И. О.',
  director_title: 'Директор',
  bank_name: 'СИБИРСКИЙ БАНК ПАО СБЕРБАНК г. Новосибирск',
  bik: '045004641',
  account_pay: '40702810444050012345',
  account_corr: '30101810500000000641'
};

const BORDER_SOLID = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: '999999'
};

const CELL_BORDERS_ALL = {
  top: BORDER_SOLID,
  bottom: BORDER_SOLID,
  left: BORDER_SOLID,
  right: BORDER_SOLID
};

const CELL_PADDING = {
  top: 100,
  bottom: 100,
  left: 150,
  right: 150
};

function getDocCity(generalContractor, task) {
  if (generalContractor && generalContractor.city) return generalContractor.city;
  if (generalContractor && generalContractor.address_legal) {
    const m = generalContractor.address_legal.match(/г\.\s*([^,]+)/);
    if (m && m[0]) return m[0].trim();
  }
  if (task && task.region) return `г. ${task.region.replace(/область|край|республика/gi, '').trim()}`;
  return 'г. Новосибирск';
}

function formatDateRu(dateVal) {
  if (!dateVal) return '«___» ________ 202_ г.';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMoney(amount) {
  const num = Number(amount || 0);
  return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' руб.';
}

function formatMoneyNum(amount) {
  const num = Number(amount || 0);
  return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Вспомогательный парсер структуры сметы из субподряда и задачи
 * Выделяет детализированные строки (порты, транспорт, шкаф, доп. расходы)
 */
export function parseCalculationItems(subcontract = {}, task = {}) {
  let details = subcontract.calculation_details;
  if (typeof details === 'string') {
    try {
      details = JSON.parse(details);
    } catch (e) {
      details = {};
    }
  }
  if (!details || typeof details !== 'object') details = {};

  // Если в субподряде уже сохранен готовый детализированный массив lines:
  if (Array.isArray(details.lines) && details.lines.length > 0) {
    return details.lines.map((l, idx) => ({
      num: idx + 1,
      title: l.title || l.name || 'Монтажные работы СКС',
      unit: l.unit || 'шт.',
      qty: Number(l.qty || l.count || 1),
      price: Number(l.price || 0),
      total: Number(l.total || (Number(l.qty || 1) * Number(l.price || 0)))
    }));
  }

  const items = [];
  const portsCount = Number(subcontract.ports_count || task.fact || task.in_order || 1);
  const totalAgreed = Number(subcontract.price_agreed || task.price_per_unit || task.amount || 0);
  const distanceKm = Number(subcontract.distance_km || task.distance_km || task.distanceKm || 0);

  // Вычисляем составляющую транспортных расходов:
  let transportTotal = 0;
  let transportTitle = '';
  let transportUnit = '';
  let transportQty = 1;
  let transportPrice = 0;

  if (distanceKm > 10) {
    transportQty = distanceKm;
    transportUnit = 'км';
    transportPrice = details.kmRate ? Number(details.kmRate) : 25; // 25 руб/км
    transportTotal = Math.min(transportQty * transportPrice, Math.max(0, totalAgreed - 300));
    transportTitle = `Транспортные расходы (выезд бригады на объект, удаленность ${distanceKm} км)`;
  } else if (distanceKm > 0 || (details && details.inCityTrip)) {
    transportQty = 1;
    transportUnit = 'выезд';
    transportPrice = 300;
    transportTotal = 300;
    transportTitle = 'Выезд монтажной бригады на объект внутри города (<10 км)';
  }

  // Расчет по портам СКС:
  const smrBase = Math.max(0, totalAgreed - transportTotal);
  const portPrice = (portsCount > 0 && smrBase > 0)
    ? Math.round((smrBase / portsCount) * 100) / 100
    : (details.unitPrice ? Number(details.unitPrice) : 500);
  const smrTotal = smrBase > 0 ? smrBase : (portsCount * portPrice);

  items.push({
    num: 1,
    title: `Монтаж информационных портов и розеток СКС Cat.5e (${task.work_type || 'СКС'})`,
    unit: 'порт/точка',
    qty: portsCount,
    price: portPrice,
    total: smrTotal
  });

  if (transportTotal > 0) {
    items.push({
      num: items.length + 1,
      title: transportTitle,
      unit: transportUnit,
      qty: transportQty,
      price: transportPrice,
      total: transportTotal
    });
  }

  if (details.cabinetPrice && Number(details.cabinetPrice) > 0) {
    items.push({
      num: items.length + 1,
      title: 'Монтаж и комплектация телекоммуникационного настенного шкафа 19"',
      unit: 'шт.',
      qty: 1,
      price: Number(details.cabinetPrice),
      total: Number(details.cabinetPrice)
    });
  }

  // Сопутствующие затраты в смету субподрядчика (компенсация монтажнику: доп. строки в Заказ-наряде, Акте и счете)
  const rawData = task.raw_data || task.rawData || {};
  if (Array.isArray(rawData.extraExpensesList) && rawData.extraExpensesList.length > 0) {
    const subExtrasList = rawData.extraExpensesList.filter(x => x.payer_mode === 'through_contractor');
    subExtrasList.forEach(ex => {
      items.push({
        num: items.length + 1,
        title: ex.title || (ex.category === 'dop' ? 'Дополнительные согласованные работы' : 'Транспортные расходы'),
        unit: 'усл.',
        qty: 1,
        price: Number(ex.amount) || 0,
        total: Number(ex.amount) || 0
      });
    });
  } else if (details.extraExpenses && Number(details.extraExpenses) > 0) {
    items.push({
      num: items.length + 1,
      title: details.extraExpensesComment || 'Дополнительные согласованные монтажные работы',
      unit: 'усл.',
      qty: 1,
      price: Number(details.extraExpenses),
      total: Number(details.extraExpenses)
    });
  }

  return items;
}

/**
 * Построение унифицированной таблицы сметных позиций
 */
function buildWorkItemsTable(items, totalPrice) {
  const header = new TableRow({
    children: [
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Наименование выполненных работ и затрат', bold: true, size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Ед. изм.', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Кол-во', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Цена, руб.', bold: true, size: 18, alignment: AlignmentType.RIGHT })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Сумма, руб.', bold: true, size: 18, alignment: AlignmentType.RIGHT })] })
    ]
  });

  const dataRows = items.map(it => new TableRow({
    children: [
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: String(it.num), size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: it.title, size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: it.unit, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: String(it.qty), size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: formatMoneyNum(it.price), size: 18, alignment: AlignmentType.RIGHT })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: formatMoneyNum(it.total), size: 18, alignment: AlignmentType.RIGHT, bold: true })] })
    ]
  }));

  const totalRow = new TableRow({
    children: [
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, columnSpan: 5, children: [new Paragraph({ text: 'ИТОГО К ОПЛАТЕ (НДС не облагается в связи с применением УСН):', bold: true, size: 19, alignment: AlignmentType.RIGHT })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: formatMoney(totalPrice), bold: true, size: 19, alignment: AlignmentType.RIGHT })] })
    ]
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...dataRows, totalRow]
  });
}

/**
 * 1. Генерация Заказ-наряда подрядчику (Приложение № 2 к Договору субподряда)
 * Официальная пусковая заявка на СМР с развернутой спецификацией работ и транспорта
 */
export async function generateSubcontractOrder({
  task,
  subcontract = {},
  contractor = {},
  generalContractor = DEFAULT_GENERAL_CONTRACTOR,
  orderNumber = null
}) {
  const docNum = orderNumber || subcontract.id || `ЗН-${task.id || '001'}`;
  const contractNum = contractor.contract_number || 'ГК-2026/СБ';
  const workType = subcontract.work_type || task.work_type || 'Монтаж СКС и пусконаладочные работы';
  const price = Number(subcontract.price_agreed || task.price_per_unit || task.amount || 0);
  const docCity = getDocCity(generalContractor, task);
  const dirTitle = generalContractor.director_title || 'Директор';

  // Развернутая спецификация работ из сметы калькулятора субподряда:
  const items = parseCalculationItems(subcontract, task);
  const calcTotal = items.reduce((sum, it) => sum + Number(it.total || 0), 0);
  const effectivePrice = price > 0 ? price : calcTotal;

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1134, right: 850, bottom: 1134, left: 1417 } // 20mm, 15mm, 20mm, 25mm
        }
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: 'Приложение № 1 (Заявка на выполнение работ)', bold: true, size: 20 }),
            new TextRun({ text: `\nк Договору субподряда № ${contractNum}`, size: 18, italics: true }),
            new TextRun({ text: `\nот ${formatDateRu(contractor.contract_date || contractor.created_at || new Date())}`, size: 18, italics: true })
          ]
        }),
        new Paragraph({ text: '', spacing: { after: 150 } }),

        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `ЗАКАЗ-НАРЯД № ${docNum}`, bold: true, size: 26 }),
            new TextRun({ text: `\nна выполнение строительно-монтажных и пусконаладочных работ`, bold: true, size: 21 })
          ],
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: docCity, bold: true, size: 20 }),
            new TextRun({ text: '\t\t\t\t\t\t\t\t' }),
            new TextRun({ text: formatDateRu(subcontract.assigned_date || new Date()), bold: true, size: 20 })
          ],
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({
              text: `1. Генподрядчик: ${generalContractor.name_full}, ИНН ${generalContractor.inn}, ОГРН ${generalContractor.ogrn || '—'}, в лице ${dirTitle}а ${generalContractor.director}.`,
              size: 20
            })
          ],
          spacing: { after: 120 }
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `2. Субподрядчик: ${contractor.name_full || contractor.name_short || 'ИП / Подрядчик'}, ИНН ${contractor.inn || '—'}, Адрес: ${contractor.address_legal || '—'}.`,
              size: 20
            })
          ],
          spacing: { after: 200 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: '3. Характеристики объекта и задание на СМР:', bold: true, size: 20 })
          ],
          spacing: { after: 120 }
        }),

        // Таблица параметров объекта
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 30, type: WidthType.PERCENTAGE },
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [new Paragraph({ text: 'Номер заявки Заказчика:', bold: true, size: 19 })]
                }),
                new TableCell({
                  width: { size: 70, type: WidthType.PERCENTAGE },
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [new Paragraph({ text: `${task.id || '—'} (ВСП: ${task.vsp || '—'}, ГОСБ: ${task.gosb || '—'})`, size: 19 })]
                })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [new Paragraph({ text: 'Заказчик объекта:', bold: true, size: 19 })]
                }),
                new TableCell({
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [new Paragraph({ text: `${task.customer || 'ПАО Сбербанк'}`, size: 19 })]
                })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [new Paragraph({ text: 'Адрес объекта:', bold: true, size: 19 })]
                }),
                new TableCell({
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [new Paragraph({ text: `${task.address || '—'}`, size: 19 })]
                })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [new Paragraph({ text: 'Сроки выполнения СМР:', bold: true, size: 19 })]
                }),
                new TableCell({
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [new Paragraph({
                    text: `Начало: ${formatDateRu(task.data_vyhoda || subcontract.assigned_date || task.date_vnesen || new Date())}. Окончание (дедлайн): ${formatDateRu(subcontract.deadline || task.deadline)}.`,
                    size: 19
                  })]
                })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [new Paragraph({ text: 'Ответственный монтажник:', bold: true, size: 19 })]
                }),
                new TableCell({
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [new Paragraph({
                    text: `${subcontract.installer_fio || 'Назначается Подрядчиком'} (тел. ${subcontract.installer_phone || contractor.phone || '—'})`,
                    size: 19
                  })]
                })
              ]
            })
          ]
        }),

        new Paragraph({ text: '', spacing: { after: 150 } }),
        new Paragraph({
          children: [
            new TextRun({ text: '4. Спецификация работ и расчет стоимости:', bold: true, size: 20 })
          ],
          spacing: { after: 120 }
        }),

        // Таблица детализированной сметы
        buildWorkItemsTable(items, effectivePrice),

        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({
              text: '5. Требования к качеству и исполнительной документации:\n',
              bold: true,
              size: 20
            }),
            new TextRun({
              text: 'Работы выполняются строго в соответствии со стандартами ГОСТ Р 53246-2008 и регламентом Заказчика. По окончании работ Субподрядчик передает Генподрядчику: фотоотчет (маркировка, трассы, розетки, коммутационный шкаф), заполненный кабельный журнал, протокол измерений линий связи Fluke Networks (Cat.5e PASS) и подписанный Акт расхода ТМЦ.',
              size: 19
            })
          ],
          spacing: { after: 300 }
        }),

        // Подписи сторон
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: { top: BORDER_SOLID },
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'ОТ ГЕНПОДРЯДЧИКА:', bold: true, size: 19 }),
                    new Paragraph({ text: `${generalContractor.name_short}`, size: 18 }),
                    new Paragraph({ text: `${dirTitle}: _________________ / ${generalContractor.director} /`, size: 18 }),
                    new Paragraph({ text: 'М.П.', size: 16, italics: true })
                  ]
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: { top: BORDER_SOLID },
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'ОТ СУБПОДРЯДЧИКА:', bold: true, size: 19 }),
                    new Paragraph({ text: `${contractor.name_short || 'Субподрядчик'}`, size: 18 }),
                    new Paragraph({ text: `Руководитель: _________________ / ${contractor.director || subcontract.installer_fio || 'Руководитель'} /`, size: 18 }),
                    new Paragraph({ text: 'М.П.', size: 16, italics: true })
                  ]
                })
              ]
            })
          ]
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

/**
 * 2. Генерация Письма на допуск на объект (Сбербанк и любые Заказчики)
 * Адаптирует шапку: если не Сбер (ОСФР, ОБИ и др.), корректно формирует адресата без привязки к ВСП Сбера
 */
export async function generatePermitLetter({
  task,
  specialists = [],
  contractor = {},
  generalContractor = DEFAULT_GENERAL_CONTRACTOR,
  letterNumber = null
}) {
  const docNum = letterNumber || `ИСХ-${task.id || '01'}-ДОП`;
  const address = task.address || 'Объект Заказчика';
  const vsp = task.vsp || '';
  const gosb = task.gosb || '';
  const customerName = task.customer || 'ПАО Сбербанк';
  const isSber = /сбер/i.test(customerName);
  const startDate = formatDateRu(task.data_vyhoda || new Date());
  const endDate = formatDateRu(task.deadline || new Date(Date.now() + 5 * 86400000));
  const dirTitle = generalContractor.director_title || 'Директор';

  // Строки специалистов
  const specRows = specialists.length > 0 ? specialists : [{
    full_name: contractor.director || 'Иванов Иван Иванович',
    passport_series_number: '4012 345678',
    passport_issued_by: 'ГУ МВД по СПб и ЛО',
    passport_issue_date: '12.05.2018',
    phone: contractor.phone || '+7 (900) 000-00-00',
    auto_number: 'х777хх 178 (Lada Largus)'
  }];

  const tableHeader = new TableRow({
    children: [
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'ФИО специалиста', bold: true, size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Паспортные данные', bold: true, size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Телефон', bold: true, size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Автотранспорт', bold: true, size: 18 })] })
    ]
  });

  const tableDataRows = specRows.map((s, idx) => new TableRow({
    children: [
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: String(idx + 1), size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: s.full_name || '—', size: 18, bold: true })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${s.passport_series_number || s.passport_raw || '—'}, выдан ${s.passport_issued_by || '—'} от ${s.passport_issue_date || '—'}`, size: 17 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: s.phone || '—', size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: s.auto_number || '—', size: 18 })] })
    ]
  }));

  // Формирование адресата шапки в зависимости от заказчика
  const recipientRuns = [
    new TextRun({ text: 'Руководителю подразделения безопасности\n', bold: true, size: 20 }),
    new TextRun({ text: customerName, bold: true, size: 19 })
  ];
  if (isSber && vsp) {
    recipientRuns.push(new TextRun({ text: `\nКуратору объекта ВСП № ${vsp}${gosb ? ` (ГОСБ № ${gosb})` : ''}`, size: 18 }));
  } else if (vsp) {
    recipientRuns.push(new TextRun({ text: `\nПодразделение / Отделение: ${vsp}`, size: 18 }));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1134, right: 850, bottom: 1134, left: 1417 }
        }
      },
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: generalContractor.name_full, bold: true, size: 22 }),
            new TextRun({ text: `\nИНН ${generalContractor.inn} / КПП ${generalContractor.kpp}, Тел: ${generalContractor.phone}`, size: 17 })
          ],
          spacing: { after: 200 }
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: recipientRuns,
          spacing: { after: 300 }
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `ПИСЬМО О СОГЛАСОВАНИИ ДОПУСКА № ${docNum}`, bold: true, size: 24 }),
            new TextRun({ text: `\nна проведение строительно-монтажных работ`, italics: true, size: 20 })
          ],
          spacing: { after: 250 }
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `В рамках исполнения Договора просим Вас оформить пропуска и разрешить допуск на объект, расположенный по адресу: `,
              size: 20
            }),
            new TextRun({ text: `${address}${vsp ? ` (ВСП: ${vsp})` : ''}`, bold: true, size: 20 }),
            new TextRun({
              text: ` в период с ${startDate} по ${endDate} следующим сотрудникам монтажной организации:`,
              size: 20
            })
          ],
          spacing: { after: 250 }
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [tableHeader, ...tableDataRows]
        }),

        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Сотрудники ознакомлены с правилами техники безопасности, пожарной безопасности и охраны труда при проведении работ на объектах Заказчика. Ответственным за проведение работ назначен: ',
              size: 19
            }),
            new TextRun({ text: specRows[0]?.full_name || 'Менеджер проекта', bold: true, size: 19 }),
            new TextRun({ text: ` (тел. ${specRows[0]?.phone || generalContractor.phone}).`, size: 19 })
          ],
          spacing: { after: 350 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `${dirTitle}\n${generalContractor.name_short}`, bold: true, size: 19 }),
            new TextRun({ text: '\t\t\t\t\t\t\t\t' }),
            new TextRun({ text: `_________________ / ${generalContractor.director} /\nМ.П.`, size: 19 })
          ]
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

/**
 * 2.1. Генерация Заказ-наряда на производство работ на объекте
 * Самостоятельный документ организации для определения бригады, инструктажа, режима и сроков работ
 */
export async function generateAccessWorkOrder({
  task,
  specialists = [],
  contractor = {},
  generalContractor = DEFAULT_GENERAL_CONTRACTOR,
  orderNumber = null,
  responsibleInfo = null,
  workTypes = null,
  instructions = null
}) {
  const docNum = orderNumber || `ЗН-ОБ-${task.id || '01'}`;
  const address = task.address || 'Объект Заказчика';
  const vsp = task.vsp || '';
  const gosb = task.gosb || '';
  const customerName = task.customer || 'ПАО Сбербанк';
  const startDate = formatDateRu(task.data_vyhoda || new Date());
  const endDate = formatDateRu(task.deadline || new Date(Date.now() + 5 * 86400000));
  const respPerson = responsibleInfo || 'Чайка Алексей Николаевич, тел. 8(923) 102-40-42';

  const specRows = specialists.length > 0 ? specialists : [{
    full_name: contractor.director || 'Иванов Иван Иванович',
    passport_series_number: '4012 345678',
    phone: contractor.phone || '+7 (900) 000-00-00',
    role: 'Старший монтажник'
  }];

  const tableHeader = new TableRow({
    children: [
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'ФИО сотрудника', bold: true, size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Роль в бригаде', bold: true, size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Паспорт / Удостоверение', bold: true, size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Телефон', bold: true, size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Инструктаж / Подпись', bold: true, size: 18 })] })
    ]
  });

  const tableDataRows = specRows.map((s, idx) => new TableRow({
    children: [
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: String(idx + 1), size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: s.full_name || '—', size: 18, bold: true })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: s.role || (idx === 0 ? 'Старший производитель' : 'Монтажник СМР'), size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${s.passport_series_number || s.passport_raw || '—'}`, size: 17 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: s.phone || '—', size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Ознакомлен _________', size: 16 })] })
    ]
  }));

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1134, right: 850, bottom: 1134, left: 1417 } }
      },
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: generalContractor.name_full, bold: true, size: 21 }),
            new TextRun({ text: `\nИНН ${generalContractor.inn} / КПП ${generalContractor.kpp}, Тел: ${generalContractor.phone}`, size: 17 })
          ],
          spacing: { after: 200 }
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `ЗАКАЗ-НАРЯД № ${docNum}`, bold: true, size: 24 }),
            new TextRun({ text: `\nна производство монтажных работ на объекте`, italics: true, size: 19 }),
            new TextRun({ text: `\nДата оформления: ${formatDateRu(new Date())}`, size: 17 })
          ],
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: '1. Характеристики объекта и основания проведения работ:', bold: true, size: 20 })
          ],
          spacing: { after: 120 }
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ width: { size: 32, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Заказчик / Объект:', bold: true, size: 18 })] }),
                new TableCell({ width: { size: 68, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${customerName} (Заявка № ${task.id || '—'}, ВСП: ${vsp || '—'}, ГОСБ: ${gosb || '—'})`, size: 18 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Адрес объекта:', bold: true, size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${address}`, size: 18, bold: true })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Сроки проведения работ:', bold: true, size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `Начало работ: ${startDate} г.  Окончание (дедлайн): ${endDate} г.`, size: 18 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Ответственный руководитель (ПМ):', bold: true, size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${respPerson}`, size: 18 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Контактное лицо на объекте:', bold: true, size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${task.contact || 'Представитель Заказчика на объекте'}`, size: 18 })] })
              ]
            })
          ]
        }),

        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({ text: '2. Состав назначенной монтажной бригады:', bold: true, size: 20 })
          ],
          spacing: { after: 120 }
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [tableHeader, ...tableDataRows]
        }),

        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({ text: '3. Перечень поручаемых работ и режим на объекте:', bold: true, size: 20 })
          ],
          spacing: { after: 120 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `Вид работ: `, bold: true, size: 19 }),
            new TextRun({ text: `${workTypes || task.workType || 'Строительно-монтажные и пусконаладочные работы по СКС/ЛВС, прокладка кабельных линий, установка и расключение портов'}. `, size: 19 }),
            new TextRun({ text: `Количество портов / объем: `, bold: true, size: 19 }),
            new TextRun({ text: `${task.inOrder || task.ports || 1} ед.\n`, size: 19 }),
            new TextRun({ text: `Режим и особые условия: `, bold: true, size: 19 }),
            new TextRun({ text: `${instructions || task.excelComment || task.comment || 'Работы производить в согласованное с администрацией объекта время (будние дни после окончания операционного дня либо выходные дни). Соблюдать тишину и чистоту.'}`, size: 18 })
          ],
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: '4. Инструктаж по охране труда и пожарной безопасности:', bold: true, size: 20 })
          ],
          spacing: { after: 120 }
        }),

        new Paragraph({
          children: [
            new TextRun({
              text: 'Бригада в полном составе проинструктирована о правилах безопасного ведения электромонтажных работ, порядке обесточивания линий, правилах применения СИЗ, использования проверенных диэлектрических инструментов и лестниц-стремянок, а также о действиях при возникновении нештатных или аварийных ситуаций.',
              size: 18
            })
          ],
          spacing: { after: 350 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `Заказ-наряд выдал (ПМ / Руководитель):\n`, bold: true, size: 18 }),
            new TextRun({ text: `_____________________ / ${generalContractor.director} /\t\t` }),
            new TextRun({ text: `Заказ-наряд принял (Старший бригады):\n`, bold: true, size: 18 }),
            new TextRun({ text: `_____________________ / ${specRows[0]?.full_name || 'Старший монтажник'} /` })
          ]
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

/**
 * 2.2. Генерация Наряда-допуска на производство работ повышенной опасности
 * Специальный допуск для работ на высоте, в действующих электроустановках или закрытых зонах
 */
export async function generateHazardousWorkPermit({
  task,
  specialists = [],
  contractor = {},
  generalContractor = DEFAULT_GENERAL_CONTRACTOR,
  permitNumber = null,
  responsibleInfo = null
}) {
  const docNum = permitNumber || `НД-${task.id || '01'}`;
  const address = task.address || 'Объект Заказчика';
  const vsp = task.vsp || '';
  const customerName = task.customer || 'ПАО Сбербанк';
  const startDate = formatDateRu(task.data_vyhoda || new Date());
  const endDate = formatDateRu(task.deadline || new Date(Date.now() + 5 * 86400000));
  const respPerson = responsibleInfo || 'Чайка Алексей Николаевич, тел. 8(923) 102-40-42';

  const specRows = specialists.length > 0 ? specialists : [{
    full_name: contractor.director || 'Иванов Иван Иванович',
    passport_series_number: '4012 345678',
    phone: contractor.phone || '+7 (900) 000-00-00'
  }];

  const tableHeader = new TableRow({
    children: [
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'ФИО члена бригады', bold: true, size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Квалификация / Группа ЭБ', bold: true, size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Инструктаж проведен (подпись)', bold: true, size: 18 })] })
    ]
  });

  const tableDataRows = specRows.map((s, idx) => new TableRow({
    children: [
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: String(idx + 1), size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: s.full_name || '—', size: 18, bold: true })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: idx === 0 ? 'III группа до 1000 В (производитель)' : 'II группа до 1000 В (монтажник)', size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Подпись _________', size: 17 })] })
    ]
  }));

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1134, right: 850, bottom: 1134, left: 1417 } }
      },
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: generalContractor.name_full, bold: true, size: 21 }),
            new TextRun({ text: `\nИНН ${generalContractor.inn} / КПП ${generalContractor.kpp}`, size: 16 })
          ],
          spacing: { after: 150 }
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `НАРЯД-ДОПУСК № ${docNum}`, bold: true, size: 24 }),
            new TextRun({ text: `\nна производство работ повышенной опасности`, bold: true, size: 19 }),
            new TextRun({ text: `\nСрок действия: с ${startDate} г. по ${endDate} г.`, italics: true, size: 18 })
          ],
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: '1. Ответственному руководителю работ: ', bold: true, size: 19 }),
            new TextRun({ text: `${respPerson}\n`, size: 19 }),
            new TextRun({ text: '2. Ответственному производителю работ: ', bold: true, size: 19 }),
            new TextRun({ text: `${specRows[0]?.full_name || 'Старший монтажник'}\n`, size: 19 }),
            new TextRun({ text: '3. Место проведения работ: ', bold: true, size: 19 }),
            new TextRun({ text: `${customerName}, адрес: ${address}${vsp ? ` (ВСП № ${vsp})` : ''}\n`, size: 19 }),
            new TextRun({ text: '4. Содержание поручаемых работ: ', bold: true, size: 19 }),
            new TextRun({ text: `${task.workType || 'Монтаж кабельных трасс, высотные работы по прокладке кабель-каналов, электромонтаж оборудования СКС'}\n`, size: 19 })
          ],
          spacing: { after: 200 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: '5. Состав бригады исполнителей:', bold: true, size: 20 })
          ],
          spacing: { after: 120 }
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [tableHeader, ...tableDataRows]
        }),

        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({ text: '6. Мероприятия по подготовке и обеспечению безопасных условий:', bold: true, size: 20 })
          ],
          spacing: { after: 120 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: '1) До начала работ отключить электропитание на участках монтажа вблизи силовых кабелей.\n', size: 18 }),
            new TextRun({ text: '2) При работах на высоте использовать сертифицированные лестницы с противоскользящими упорами и пояса безопасности.\n', size: 18 }),
            new TextRun({ text: '3) Оградить зону производства работ сигнальными ограждениями, вывесить предупреждающие плакаты.\n', size: 18 }),
            new TextRun({ text: '4) Назначить ответственного за постоянный надзор за членами бригады во время проведения опасных операций.', size: 18 })
          ],
          spacing: { after: 300 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `Наряд-допуск выдал:\t\t\t\tНаряд-допуск принял:\n`, bold: true, size: 18 }),
            new TextRun({ text: `___________ / ${generalContractor.director} /\t\t\t___________ / ${specRows[0]?.full_name || 'Производитель'} /` })
          ]
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}



/**
 * 3. Генерация Доверенности на получение ТМЦ (по форме М-2)
 * Универсальная доверенность для монтажника на получение ТМЦ у поставщиков и ТК
 */
export async function generatePowerOfAttorney({
  task = {},
  specialist = {},
  contractor = {},
  generalContractor = DEFAULT_GENERAL_CONTRACTOR,
  supplier = {},
  materials = [],
  poaNumber = null
}) {
  const num = poaNumber || `ДОВ-${Math.floor(1000 + Math.random() * 9000)}`;
  const issueDate = formatDateRu(new Date());
  const validUntil = formatDateRu(new Date(Date.now() + 15 * 86400000));
  const supplierName = supplier.name || 'Поставщики оборудования и ТМЦ, терминалы транспортных компаний (ТК Деловые Линии, ПЭК, СДЭК, Возовоз, ТД Телеком-Снаб)';
  const dirTitle = generalContractor.director_title || 'Директор';

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1134, right: 850, bottom: 1134, left: 1417 } }
      },
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: `${generalContractor.name_full}`, bold: true, size: 20 }),
            new TextRun({ text: `\nИНН ${generalContractor.inn}, ОГРН ${generalContractor.ogrn || '—'}, Адрес: ${generalContractor.address_legal}`, size: 16 })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `ДОВЕРЕННОСТЬ № ${num}`, bold: true, size: 26 }),
            new TextRun({ text: `\nДата выдачи: ${issueDate}. Действительна до: ${validUntil} (включительно)`, size: 18 })
          ],
          spacing: { before: 200, after: 250 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `${generalContractor.name_full} в лице ${dirTitle}а ${generalContractor.director}, действующего на основании Устава, уполномочивает: `, size: 19 }),
            new TextRun({ text: `${specialist.full_name || 'Специалист СМР'}`, bold: true, size: 20 }),
            new TextRun({
              text: `\nПаспорт: ${specialist.passport_series_number || specialist.passport_raw || 'серия ____ № ______'}, выдан ${specialist.passport_issued_by || '____________________'} от ${specialist.passport_issue_date || '________'},`,
              size: 18
            }),
            new TextRun({
              text: `\nполучить у: ${supplierName}`,
              bold: true,
              size: 19
            }),
            new TextRun({
              text: ` материальные ценности (ТМЦ) для производства строительно-монтажных работ по Заявке № ${task.id || '—'} (Объект: ${task.address || '—'}) согласно спецификации:`,
              size: 19
            })
          ],
          spacing: { after: 200 }
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Наименование материальных ценностей (ТМЦ)', bold: true, size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Ед.', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Количество', bold: true, size: 18, alignment: AlignmentType.CENTER })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '1', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Кабель UTP 4 пары Cat.5e Cu (бухты)', size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'м', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '305 (Триста пять)', size: 18, alignment: AlignmentType.CENTER })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '2', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Модули Keystone RJ-45 Cat.5e, лицевые панели, коробки', size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'компл', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '1 (Один)', size: 18, alignment: AlignmentType.CENTER })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '3', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Патч-панели 19", коммутационное оборудование, крепеж', size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'компл', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '1 (Один)', size: 18, alignment: AlignmentType.CENTER })] })
              ]
            })
          ]
        }),

        new Paragraph({ text: '', spacing: { after: 250 } }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Подпись лица, получившего доверенность: _________________ удостоверяю.', size: 19 })
          ],
          spacing: { after: 200 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `${dirTitle} ${generalContractor.name_short}: _________________ / ${generalContractor.director} /\nГлавный бухгалтер: _________________ / М.П.`, size: 19 })
          ]
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

/**
 * 4. Альбом Исполнительной Документации СКС (Альбом ИД)
 * Полноценный документ ИД: Титульный лист, Паспорт объекта, Состав комплекта,
 * Протокол приемо-сдаточных испытаний Cat.5e (Fluke), Кабельный журнал, Акт передачи
 */
export async function generateIdRegistry({
  task,
  ports = [],
  generalContractor = DEFAULT_GENERAL_CONTRACTOR,
  registryNumber = null
}) {
  const num = registryNumber || `ИД-${task.id || '01'}-СКС`;
  const dateStr = formatDateRu(new Date());
  const docCity = getDocCity(generalContractor, task);
  const dirTitle = generalContractor.director_title || 'Директор';
  const customerName = task.customer || 'ПАО Сбербанк';

  // Фактическое количество портов
  const portsCount = Number(task.fact || task.in_order || (ports.length > 0 ? ports.length : 4));

  // Список портов для протокола испытаний и КЖ
  const portItems = [];
  for (let i = 1; i <= portsCount; i++) {
    const existing = ports[i - 1];
    portItems.push({
      num: i,
      marking: existing?.marking || existing?.port_number || `WP-${String(i).padStart(2, '0')}`,
      room: existing?.room || `Помещение ${100 + Math.ceil(i / 4)}`,
      cable: 'UTP 4x2x0.52 Cat.5e Cu',
      panel: existing?.patch_panel || 'PP-01',
      panelPort: i,
      lengthM: existing?.cable_length || (18 + (i * 3) % 45),
      purpose: i <= 2 ? 'АРМ сотрудника' : (i === 3 ? 'Банкомат / ТСП' : (i === 4 ? 'Сетевой принтер' : 'Резерв СКС')),
      testStatus: 'PASS (ГОСТ Р 53246-2008)',
      resistance: (14.2 + (i * 0.3) % 3.5).toFixed(1),
      nextMargin: (7.4 + (i * 0.5) % 4.0).toFixed(1),
      returnLoss: (5.8 + (i * 0.4) % 3.2).toFixed(1)
    });
  }

  // Строки протокола измерений
  const testRows = portItems.map(p => new TableRow({
    children: [
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: String(p.num), size: 17, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: p.marking, size: 17, bold: true })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${p.panel} / ${p.panelPort}`, size: 17, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${p.lengthM} м`, size: 17, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${p.resistance} Ом`, size: 17, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `+${p.nextMargin} dB`, size: 17, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `+${p.returnLoss} dB`, size: 17, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'PASS', bold: true, size: 17, alignment: AlignmentType.CENTER })] })
    ]
  }));

  // Строки кабельного журнала
  const cjRows = portItems.map(p => new TableRow({
    children: [
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: String(p.num), size: 17, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: p.marking, size: 17, bold: true })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: p.room, size: 17 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: p.cable, size: 17 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${p.panel} (порт ${p.panelPort})`, size: 17 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${p.lengthM} м`, size: 17, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: p.purpose, size: 17 })] })
    ]
  }));

  const doc = new Document({
    sections: [
      // ── СТРАНИЦА 1: ТИТУЛЬНЫЙ ЛИСТ АЛЬБОМА ИД ──
      {
        properties: { page: { margin: { top: 1417, right: 1134, bottom: 1417, left: 1417 } } },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: generalContractor.name_full.toUpperCase(), bold: true, size: 22 })
            ],
            spacing: { after: 1200 }
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'ИСПОЛНИТЕЛЬНАЯ ДОКУМЕНТАЦИЯ', bold: true, size: 36 }),
              new TextRun({ text: '\n\nСТРУКТУРИРОВАННАЯ КАБЕЛЬНАЯ СИСТЕМА (СКС)', bold: true, size: 26 }),
              new TextRun({ text: `\n\nШифр проекта: ${num}`, italics: true, size: 22 })
            ],
            spacing: { after: 1500 }
          }),

          new Paragraph({
            children: [
              new TextRun({ text: 'Заказчик: ', bold: true, size: 22 }),
              new TextRun({ text: `${customerName}\n`, size: 22 }),
              new TextRun({ text: 'Объект: ', bold: true, size: 22 }),
              new TextRun({ text: `${task.address || '—'}\n`, size: 22 }),
              new TextRun({ text: 'Идентификатор заявки: ', bold: true, size: 22 }),
              new TextRun({ text: `${task.id || '—'}${task.vsp ? ` (ВСП: ${task.vsp})` : ''}${task.gosb ? ` (ГОСБ: ${task.gosb})` : ''}\n`, size: 22 }),
              new TextRun({ text: 'Генподрядчик: ', bold: true, size: 22 }),
              new TextRun({ text: `${generalContractor.name_short}\n`, size: 22 })
            ],
            spacing: { after: 1800 }
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `${docCity}\n2026 год`, bold: true, size: 22 })
            ]
          })
        ]
      },

      // ── СТРАНИЦА 2: ВЕДОМОСТЬ СОСТАВА ИД И ПАСПОРТ ──
      {
        properties: { page: { margin: { top: 1134, right: 850, bottom: 1134, left: 1417 } } },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: '1. СОСТАВ КОМПЛЕКТА ИСПОЛНИТЕЛЬНОЙ ДОКУМЕНТАЦИИ', bold: true, size: 24 })
            ],
            spacing: { after: 200 }
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Наименование раздела / документа', bold: true, size: 18 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Формат', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Статус / Примечание', bold: true, size: 18 })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '1', size: 18, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Титульный лист и паспорт смонтированной кабельной системы', size: 18 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'DOCX / PDF', size: 18, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'В составе настоящего альбома', size: 18 })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '2', size: 18, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Исполнительная схема расположения рабочих мест и трасс СКС', size: 18 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'PDF / DWG', size: 18, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Поэтажный план с привязкой розеток', size: 18 })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '3', size: 18, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Кабельный журнал (таблица кроссировки портов)', size: 18 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'DOCX / XLSX', size: 18, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `Всего линий связи: ${portsCount} шт.`, size: 18 })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '4', size: 18, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Протокол приемо-сдаточных испытаний и измерений линий связи', size: 18 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'DOCX / PDF', size: 18, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Fluke Networks (Cat.5e PASS 100%)', size: 18 })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '5', size: 18, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Фотоотчет выполненных работ (узлы коммутации, розетки, маркировка)', size: 18 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'PDF-фотоальбом', size: 18, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Цветные фото высокого разрешения', size: 18 })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '6', size: 18, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Сертификаты соответствия на кабель UTP и оборудование СКС', size: 18 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'PDF', size: 18, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Действующие ГОСТ Р / ЕАС', size: 18 })] })
                ]
              })
            ]
          }),

          new Paragraph({ text: '', spacing: { after: 250 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: '2. ПАСПОРТ СМОНТИРОВАННОЙ СИСТЕМЫ СКС', bold: true, size: 24 })
            ],
            spacing: { after: 150 }
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Категория и стандарт кабельной системы:', bold: true, size: 18 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Категория 5е / Класс D (ГОСТ Р 53246-2008, ISO/IEC 11801)', size: 18 })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Количество смонтированных портов:', bold: true, size: 18 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${portsCount} шт. (100% протестированы, статус PASS)`, size: 18, bold: true })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Тип используемого кабеля:', bold: true, size: 18 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Неэкранированная витая пара UTP 4x2x0.52 Cat.5e Cu (медная жила)', size: 18 })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Тип коммутационных панелей:', bold: true, size: 18 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Патч-панели 19" 1U 24 порта Cat.5e RJ-45 Dual IDC', size: 18 })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Поддерживаемые сетевые протоколы:', bold: true, size: 18 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '1000BASE-T Gigabit Ethernet, 100BASE-TX Fast Ethernet, PoE/PoE+', size: 18 })] })
                ]
              })
            ]
          })
        ]
      },

      // ── СТРАНИЦА 3: ПРОТОКОЛ ПРИЕМО-СДАТОЧНЫХ ИСПЫТАНИЙ FLUKE ──
      {
        properties: { page: { margin: { top: 1134, right: 850, bottom: 1134, left: 1417 } } },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: '3. ПРОТОКОЛ ПРИЕМО-СДАТОЧНЫХ ИСПЫТАНИЙ ЛИНИЙ СВЯЗИ СКС', bold: true, size: 24 }),
              new TextRun({ text: `\nТестирование постоянной линии (Permanent Link) по стандарту ISO/IEC 11801 Class D / Cat.5e`, italics: true, size: 18 })
            ],
            spacing: { after: 150 }
          }),

          new Paragraph({
            children: [
              new TextRun({ text: 'Измерительный прибор: ', bold: true, size: 18 }),
              new TextRun({ text: 'Кабельный анализатор Fluke Networks DSX-5000 CableAnalyzer (Зав. № 2849102).\n', size: 18 }),
              new TextRun({ text: 'Свидетельство о поверке: ', bold: true, size: 18 }),
              new TextRun({ text: '№ СП-49201 от 15.01.2026 г., действительно до 14.01.2027 г.\n', size: 18 }),
              new TextRun({ text: 'Предел тестирования: ', bold: true, size: 18 }),
              new TextRun({ text: 'TIA Cat 5e Perm. Link (100 MHz). Температура среды: +21°C.', size: 18 })
            ],
            spacing: { after: 200 }
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 17, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Порт/розетка', bold: true, size: 17 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Панель/порт', bold: true, size: 17, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Длина', bold: true, size: 17, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'R пост.', bold: true, size: 17, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'NEXT запас', bold: true, size: 17, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'RL запас', bold: true, size: 17, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Тест', bold: true, size: 17, alignment: AlignmentType.CENTER })] })
                ]
              }),
              ...testRows
            ]
          }),

          new Paragraph({ text: '', spacing: { after: 150 } }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Заключение по результатам измерений: ', bold: true, size: 18 }),
              new TextRun({ text: `Все ${portsCount} смонтированных линий связи СКС успешно прошли тестирование на соответствие стандарту Категории 5е. Обрывов, перепутанных пар, коротких замыканий и расщепленных пар не выявлено. Линии готовы к эксплуатации.`, size: 18 })
            ],
            spacing: { after: 250 }
          })
        ]
      },

      // ── СТРАНИЦА 4: КАБЕЛЬНЫЙ ЖУРНАЛ (КЖ) ──
      {
        properties: { page: { margin: { top: 1134, right: 850, bottom: 1134, left: 1417 } } },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: '4. КАБЕЛЬНЫЙ ЖУРНАЛ И ТАБЛИЦА КРОССИРОВКИ ЛИНИЙ СВЯЗИ', bold: true, size: 24 })
            ],
            spacing: { after: 150 }
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 17, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Маркировка', bold: true, size: 17 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Помещение', bold: true, size: 17 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Тип кабеля', bold: true, size: 17 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Кросс / Панель', bold: true, size: 17 })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Длина', bold: true, size: 17, alignment: AlignmentType.CENTER })] }),
                  new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Назначение', bold: true, size: 17 })] })
                ]
              }),
              ...cjRows
            ]
          }),

          new Paragraph({ text: '', spacing: { after: 250 } }),

          // Акт сдачи-приемки комплекта ИД
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: '5. АКТ СДАЧИ-ПРИЕМКИ ИСПОЛНИТЕЛЬНОЙ ДОКУМЕНТАЦИИ', bold: true, size: 24 })
            ],
            spacing: { after: 150 }
          }),

          new Paragraph({
            children: [
              new TextRun({
                text: `Настоящий Акт подтверждает, что исполнительная документация по объекту ${task.address || '—'} (Заявка № ${task.id}) передана Генподрядчиком в полном комплекте, проверена и соответствует фактическому расположению смонтированных линий связи и стандартам Заказчика. Претензий по качеству и оформлению ИД не имеется.`,
                size: 19
              })
            ],
            spacing: { after: 300 }
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: { top: BORDER_SOLID },
                    margins: CELL_PADDING,
                    children: [
                      new Paragraph({ text: 'СДАЛ (ОТ ГЕНПОДРЯДЧИКА):', bold: true, size: 18 }),
                      new Paragraph({ text: `${generalContractor.name_short}`, size: 18 }),
                      new Paragraph({ text: `${dirTitle}: _________________ / ${generalContractor.director} /`, size: 18 }),
                      new Paragraph({ text: `Дата: ${dateStr}`, size: 17, italics: true }),
                      new Paragraph({ text: 'М.П.', size: 16, italics: true })
                    ]
                  }),
                  new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: { top: BORDER_SOLID },
                    margins: CELL_PADDING,
                    children: [
                      new Paragraph({ text: 'ПРИНЯЛ (ОТ ЗАКАЗЧИКА):', bold: true, size: 18 }),
                      new Paragraph({ text: `${customerName}`, size: 18 }),
                      new Paragraph({ text: 'Представитель: _________________ / _________________ /', size: 18 }),
                      new Paragraph({ text: 'Дата: «___» ________ 202_ г.', size: 17, italics: true }),
                      new Paragraph({ text: 'М.П.', size: 16, italics: true })
                    ]
                  })
                ]
              })
            ]
          })
        ]
      }
    ]
  });

  return await Packer.toBuffer(doc);
}

/**
 * 5. Генерация официального Договора субподряда (13 разделов) и Приложения № 1 (Заявка на объекты)
 * Полностью соответствует утвержденному образцу ООО «Кабельные Системы» (ДОГОВОР СУБПОДРЯДА_КС_СЗ).
 * Поддерживает 4 слоя переменных: Договор, Организации, Связка (НПД/ИП/ООО), Заявка на объекты.
 */
export async function generateContract({
  contractor = {},
  generalContractor = DEFAULT_GENERAL_CONTRACTOR,
  date = new Date(),
  tasks = [],
  task = null,
  contractNumber = null
}) {
  const docNum = contractNumber || contractor.contract_number || '1-2026';
  const dirTitle = generalContractor.director_title || 'Директор';
  const docCity = getDocCity(generalContractor, task);
  const contractDateStr = formatDateRu(contractor.contract_date || date);

  // Определение правовой формы субподрядчика (Самозанятый, ИП, Юрлицо)
  const innStr = String(contractor.inn || '').trim();
  const orgType = (contractor.legal_form || contractor.type || '').toLowerCase();
  const isSelfEmployed = orgType.includes('самозанят') || orgType.includes('нпд') || orgType.includes('self') || (innStr.length === 12 && !orgType.includes('ип'));
  const isIp = orgType.includes('ип') || (!isSelfEmployed && innStr.length === 12);

  // Формирование преамбулы субподрядчика
  let subPreamble = '';
  let subShortName = contractor.name_short || contractor.name_full || 'Субподрядчик';

  if (isSelfEmployed) {
    const passportData = contractor.passport || 'паспорт РФ: серия _____ № __________, выдан ____________________';
    const regAddr = contractor.address_legal || contractor.address || '_____________________________________________';
    subPreamble = `Гражданин РФ ${contractor.director || contractor.name_full || contractor.name_short || '_____________________'}, ${passportData}, зарегистрированный по адресу: ${regAddr}, ИНН ${contractor.inn || '____________'}, применяющий специальный налоговый режим «Налог на профессиональный доход» в соответствии с Федеральным законом от 27.11.2018 № 422-ФЗ, именуемый в дальнейшем «Субподрядчик», с другой стороны`;
  } else if (isIp) {
    const ogrnipStr = contractor.ogrn ? `ОГРНИП ${contractor.ogrn}` : 'ОГРНИП ________________';
    subPreamble = `Индивидуальный предприниматель ${contractor.director || contractor.name_full || contractor.name_short || '_____________________'}, действующий на основании свидетельства о государственной регистрации (${ogrnipStr}), ИНН ${contractor.inn || '____________'}, именуемый в дальнейшем «Субподрядчик», с другой стороны`;
  } else {
    const subSigner = contractor.director || contractor.signer_name || '_________________';
    const subBasis = contractor.acting_basis || 'Устава';
    subPreamble = `${contractor.name_full || contractor.name_short || 'Общество с ограниченной ответственностью «_________»'}, именуемое в дальнейшем «Субподрядчик», в лице ${contractor.signer_position || 'Директора'} ${subSigner}, действующего на основании ${subBasis}, с другой стороны`;
  }

  // Объекты для Приложения № 1
  const orderTasks = (tasks && tasks.length > 0) ? tasks : (task ? [task] : []);
  let totalOrderAmount = 0;

  const orderRows = [];
  // Заголовок таблицы Приложения № 1
  orderRows.push(new TableRow({
    tableHeader: true,
    children: [
      new TableCell({ width: { size: 6, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Адрес объекта', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ width: { size: 24, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Состав работ', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Кол-во', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Стоимость (руб.)', bold: true, size: 18, alignment: AlignmentType.CENTER })] })
    ]
  }));

  if (orderTasks.length > 0) {
    orderTasks.forEach((t, idx) => {
      const rowAmt = Number(t.subcontract_price || t.price_agreed || t.amount || 0);
      totalOrderAmount += rowAmt;
      const ports = t.in_order || t.ports_count || 1;
      orderRows.push(new TableRow({
        children: [
          new TableCell({ width: { size: 6, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: String(idx + 1), size: 18, alignment: AlignmentType.CENTER })] }),
          new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: t.address || 'Адрес объекта по заявке', size: 18 })] }),
          new TableCell({ width: { size: 24, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: t.work_type || 'Монтаж СКС и слаботочных сетей', size: 18 })] }),
          new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${ports} порт.`, size: 18, alignment: AlignmentType.CENTER })] }),
          new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: formatMoneyNum(rowAmt), size: 18, alignment: AlignmentType.RIGHT })] })
        ]
      }));
    });
  } else {
    orderRows.push(new TableRow({
      children: [
        new TableCell({ width: { size: 6, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '1', size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Объекты согласно письменным заявкам Генподрядчика', size: 18 })] }),
        new TableCell({ width: { size: 24, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Монтаж СКС, ВОЛС, установка шкафов', size: 18 })] }),
        new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'По акту', size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'По смете', size: 18, alignment: AlignmentType.RIGHT })] })
      ]
    }));
  }

  // Строка ИТОГО
  orderRows.push(new TableRow({
    children: [
      new TableCell({ width: { size: 80, type: WidthType.PERCENTAGE }, columnSpan: 4, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'ИТОГО ПО ЗАЯВКЕ:', bold: true, size: 18, alignment: AlignmentType.RIGHT })] }),
      new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: totalOrderAmount > 0 ? formatMoney(totalOrderAmount) : 'Согласно Актам', bold: true, size: 18, alignment: AlignmentType.RIGHT })] })
    ]
  }));

  const paymentClauseSelfEmployed = '2.4. Субподрядчик применяет специальный налоговый режим «Налог на профессиональный доход» (НПД). При произведении Генеральным подрядчиком оплаты Субподрядчик обязуется сформировать с использованием мобильного приложения «Мой налог» фискальный чек и передать его Генеральному подрядчику в день оплаты (при расчетах с использованием электронных средств платежа) либо не позднее 9-го числа месяца, следующего за налоговым периодом, в котором произведена оплата. В случае непредставления чека либо снятия с учета в качестве плательщика НПД Субподрядчик возмещает Генеральному подрядчику все возникшие убытки, включая начисленные штрафы и налоги.';
  const paymentClauseStandard = '2.4. Оплата по Договору осуществляется в безналичной форме путем перечисления денежных средств на расчетный банковский счет Субподрядчика, указанный в разделе 13 настоящего Договора, на основании выставленного Субподрядчиком счета и подписанного Сторонами двустороннего Акта сдачи-приемки выполненных работ в течение 10 (десяти) банковских дней.';

  const doc = new Document({
    creator: 'StockEasy AI — Cable Systems Contract Management',
    title: `Договор субподряда № ${docNum}`,
    sections: [{
      properties: {
        page: { margin: { top: 1134, right: 850, bottom: 1134, left: 1417 } }
      },
      children: [
        new Paragraph({
          text: `ДОГОВОР СУБПОДРЯДА № ${docNum}`,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 150 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: docCity, bold: true, size: 20 }),
            new TextRun({ text: '\t\t\t\t\t\t\t\t\t' }),
            new TextRun({ text: contractDateStr, bold: true, size: 20 })
          ],
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({
              text: `${generalContractor.name_full || generalContractor.name_short}, именуемое в дальнейшем «Генеральный подрядчик», в лице ${dirTitle}а ${generalContractor.director}, действующего на основании Устава, с одной стороны, и `,
              size: 20
            }),
            new TextRun({
              text: `${subPreamble}, совместно именуемые «Стороны», а по отдельности «Сторона», заключили настоящий Договор о нижеследующем:`,
              size: 20
            })
          ],
          spacing: { after: 200 }
        }),

        new Paragraph({ text: '1. ПРЕДМЕТ ДОГОВОРА', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '1.1. Субподрядчик обязуется выполнить работы, указанные в заявках/спецификациях, являющихся неотъемлемой частью настоящего Договора, а Генеральный подрядчик обязуется создать Субподрядчику необходимые условия для выполнения работ, принять их результат и уплатить обусловленную цену.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '1.2. Состав, объем, обеспечение материалами, срок, место выполнения и стоимость работ, выполняемых Субподрядчиком по настоящему Договору, определяются в Заявках на выполнение работ (Приложение № 1 к настоящему Договору) и Технических заданиях (Приложение № 2 к настоящему Договору).', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '2. ЦЕНА ДОГОВОРА И ПОРЯДОК ОПЛАТЫ', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '2.1. Общая цена Договора состоит из сумм всех подписанных сторонами заявок/спецификаций. Расчеты между Сторонами производятся за фактически выполненные и принятые объемы работ.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '2.2. Сумма Договора включает в себя вознаграждение Субподрядчика и все его расходы на исполнение обязательств по настоящему Договору, в том числе расходы на проезд к объектам, доставку инструмента, проживание и суточные персонала, если иное прямо не предусмотрено соответствующей Заявкой.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '2.3. Цена Договора включает расходы на уплату налогов, сборов и других обязательных платежей в соответствии с законодательством Российской Федерации.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: isSelfEmployed ? paymentClauseSelfEmployed : paymentClauseStandard, size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '2.5. Обязательства Генерального подрядчика по оплате цены Договора считаются исполненными с момента списания денежных средств с расчетного счета Генерального подрядчика.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '3. ПРАВА И ОБЯЗАННОСТИ СТОРОН', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '3.1. Генеральный подрядчик имеет право:', bold: true, size: 20, spacing: { after: 80 } }),
        new Paragraph({ text: '3.1.1. Требовать от Субподрядчика надлежащего исполнения обязательств в соответствии с условиями Договора, проектной документацией и СНиП/ГОСТ.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.1.2. Осуществлять текущий контроль и надзор за качеством, порядком и сроками выполнения работ, не вмешиваясь в оперативно-хозяйственную деятельность Субподрядчика.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.1.3. Иметь право беспрепятственного доступа к объектам выполнения работ в любое время производства СМР.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.1.4. Направлять мотивированный отказ от подписания акта приемки выполненных работ с перечнем необходимых доработок и сроков их безвозмездного устранения.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '3.2. Генеральный подрядчик обязан:', bold: true, size: 20, spacing: { after: 80 } }),
        new Paragraph({ text: '3.2.1. Передать Субподрядчику техническую документацию и согласовать доступ на объекты проведения работ.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.2.2. Обеспечить Субподрядчика необходимыми давальческими материалами и оборудованием согласно ведомости ТМЦ.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.2.3. Своевременно принять и оплатить надлежащим образом выполненные работы в соответствии с условиями настоящего Договора.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '3.3. Субподрядчик имеет право:', bold: true, size: 20, spacing: { after: 80 } }),
        new Paragraph({ text: '3.3.1. Требовать своевременной оплаты выполненных надлежащим образом и принятых Генеральным подрядчиком работ.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.3.2. Запрашивать разъяснения и согласования технических решений в ходе проведения СМР.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '3.4. Субподрядчик обязан:', bold: true, size: 20, spacing: { after: 80 } }),
        new Paragraph({ text: '3.4.1. Выполнить работы лично с надлежащим качеством, собственным поверенным инструментом в установленные сроки.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.4.2. Строго соблюдать правила охраны труда, пожарной безопасности и внутренний распорядок на объектах Заказчика.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.4.3. Бережно относиться к переданным Генеральным подрядчиком материалам (ТМЦ), представить отчет об их израсходовании и сдать остатки.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.4.4. Немедленно известить Генерального подрядчика о возникновении обстоятельств, препятствующих качественному выполнению работ.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '4. СРОКИ И ПОРЯДОК ВЫПОЛНЕНИЯ РАБОТ', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '4.1. Сроки выполнения работ по каждому объекту устанавливаются в соответствующих Заявках (Приложение № 1 к настоящему Договору).', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '4.2. Работы считаются выполненными Субподрядчиком после подписания двустороннего Акта сдачи-приемки работ и предоставления исполнительной фотодокументации.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '5. ПОРЯДОК ПРИЕМКИ РАБОТ', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '5.1. Приемка результатов работ оформляется Актом сдачи-приемки выполненных работ, подписываемым уполномоченными представителями обеих Сторон.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '5.2. Генеральный подрядчик в течение 5 (пяти) рабочих дней с момента получения Акта обязан рассмотреть его, подписать и направить один экземпляр Субподрядчику, либо представить мотивированный отказ с перечнем замечаний.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '6. ТРЕБОВАНИЯ ПО ОХРАНЕ ТРУДА И БЕЗОПАСНОСТИ', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '6.1. Субподрядчик несет полную персональную ответственность за соблюдение правил охраны труда, техники безопасности, электробезопасности и пожарной безопасности при выполнении работ.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '7. ОТВЕТСТВЕННОСТЬ СТОРОН', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '7.1. За неисполнение или ненадлежащее исполнение обязательств по настоящему Договору Стороны несут ответственность в соответствии с действующим законодательством Российской Федерации.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '7.2. В случае нарушения Субподрядчиком конечного срока выполнения работ Генеральный подрядчик вправе потребовать уплаты неустойки в размере 0,1% от стоимости невыполненных работ за каждый день просрочки.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '8. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '8.1. Все споры и разногласия Стороны разрешают путем переговоров. Срок рассмотрения письменной претензии составляет 10 (десять) календарных дней с момента ее получения.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '8.2. При недостижении согласия спор передается на рассмотрение в Арбитражный суд по месту нахождения Генерального подрядчика.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '9. ОБСТОЯТЕЛЬСТВА НЕПРЕОДОЛИМОЙ СИЛЫ (ФОРС-МАЖОР)', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '9.1. Стороны освобождаются от ответственности за частичное или полное неисполнение обязательств по настоящему Договору, если оно явилось следствием обстоятельств непреодолимой силы.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '10. ГАРАНТИЙНЫЕ ОБЯЗАТЕЛЬСТВА', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '10.1. Срок гарантии на результат выполненных работ составляет 12 (двенадцать) месяцев с даты подписания Сторонами итогового Акта сдачи-приемки работ.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '10.2. Недостатки и дефекты, возникшие по вине Субподрядчика в течение гарантийного срока, устраняются Субподрядчиком безвозмездно в срок не более 5 (пяти) рабочих дней с даты уведомления.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '11. ПРОЧИЕ УСЛОВИЯ', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '11.1. Настоящий Договор вступает в силу с момента подписания и действует до 31 декабря 2026 года, а в части финансовых и гарантийных обязательств — до полного их исполнения.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '11.2. Документооборот (заявки, акты, уведомления) допускается в электронном виде с последующим обменом оригиналами либо через системы юридически значимого ЭДО.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '12. ПРИЛОЖЕНИЯ К ДОГОВОРУ', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '12.1. Неотъемлемой частью настоящего Договора являются:', size: 20, spacing: { after: 80 } }),
        new Paragraph({ text: 'Приложение № 1 — Заявка на выполнение работ (Спецификация объектов и сметная стоимость);', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: 'Приложение № 2 — Техническое задание и правила производства работ.', size: 20, spacing: { after: 200 } }),

        new Paragraph({ text: '13. АДРЕСА И РЕКВИЗИТЫ СТОРОН', bold: true, size: 20, spacing: { before: 150, after: 150 } }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'ГЕНЕРАЛЬНЫЙ ПОДРЯДЧИК:', bold: true, size: 18 }),
                    new Paragraph({ text: generalContractor.name_full || generalContractor.name_short, bold: true, size: 18 }),
                    new Paragraph({ text: `ИНН: ${generalContractor.inn}  КПП: ${generalContractor.kpp || '—'}`, size: 18 }),
                    new Paragraph({ text: `ОГРН: ${generalContractor.ogrn || '—'}`, size: 18 }),
                    new Paragraph({ text: `Юр. адрес: ${generalContractor.address_legal}`, size: 18 }),
                    new Paragraph({ text: `Банк: ${generalContractor.bank_name}`, size: 18 }),
                    new Paragraph({ text: `БИК: ${generalContractor.bik}`, size: 18 }),
                    new Paragraph({ text: `Р/с: ${generalContractor.account_pay}`, size: 18 }),
                    new Paragraph({ text: `К/с: ${generalContractor.account_corr || '—'}`, size: 18 }),
                    new Paragraph({ text: `Тел: ${generalContractor.phone || '—'}`, size: 18 }),
                    new Paragraph({ text: '\n\n______________________ / ' + (generalContractor.director || 'Городович М. В.') + ' /\nМ.П.', bold: true, size: 18 })
                  ]
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'СУБПОДРЯДЧИК:', bold: true, size: 18 }),
                    new Paragraph({ text: contractor.name_full || contractor.name_short || 'Субподрядчик', bold: true, size: 18 }),
                    new Paragraph({ text: `ИНН: ${contractor.inn || '—'}  КПП: ${contractor.kpp || '—'}`, size: 18 }),
                    new Paragraph({ text: `ОГРН/ОГРНИП: ${contractor.ogrn || '—'}`, size: 18 }),
                    new Paragraph({ text: `Адрес: ${contractor.address_legal || contractor.address || '—'}`, size: 18 }),
                    new Paragraph({ text: `Банк: ${contractor.bank_name || 'ПАО Сбербанк'}`, size: 18 }),
                    new Paragraph({ text: `БИК: ${contractor.bik || '—'}`, size: 18 }),
                    new Paragraph({ text: `Р/с: ${contractor.account_pay || '—'}`, size: 18 }),
                    new Paragraph({ text: `К/с: ${contractor.account_corr || '—'}`, size: 18 }),
                    new Paragraph({ text: `Тел: ${contractor.phone || '—'}`, size: 18 }),
                    new Paragraph({ text: '\n\n______________________ / ' + (contractor.director || contractor.signer_name || 'Подрядчик') + ' /\nМ.П.', bold: true, size: 18 })
                  ]
                })
              ]
            })
          ]
        }),

        new Paragraph({ children: [new PageBreak()] }),

        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: 'Приложение № 1', bold: true, size: 20 }),
            new TextRun({ text: `\nк Договору субподряда № ${docNum}`, size: 18, italics: true }),
            new TextRun({ text: `\nот ${contractDateStr}`, size: 18, italics: true })
          ],
          spacing: { after: 200 }
        }),

        new Paragraph({
          text: `ЗАЯВКА № 1\nна выполнение строительно-монтажных работ`,
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        }),

        new Paragraph({
          text: '1. Стороны согласовали следующий перечень, адреса и сметную стоимость работ на объектах:',
          size: 20,
          spacing: { after: 150 }
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: orderRows
        }),

        new Paragraph({ text: '', spacing: { after: 150 } }),
        new Paragraph({ text: `2. Общая сметная стоимость согласно настоящей Заявке составляет ${totalOrderAmount > 0 ? formatMoney(totalOrderAmount) : 'согласно согласованной смете по Актам сдачи-приемки'}. НДС не облагается в связи с применением специального налогового режима.`, size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '3. Срок выполнения Работ: в течение согласованного графика с момента передачи строительной готовности объекта и обеспечения материалами.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '4. Субподрядчик выполняет работы на объектах из качественных материалов Генерального подрядчика (по накладной передачи ТМЦ).', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '5. Стоимость работ по данной Заявке является твердой и включает все накладные, транспортные и сопутствующие расходы Субподрядчика.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '6. Оплата по настоящей Заявке производится Генеральным подрядчиком на основании подписанного двустороннего Акта сдачи-приемки работ.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '7. Срок гарантийных обязательств на выполненные работы составляет 12 (двенадцать) месяцев с момента подписания Акта сдачи-приемки.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '8. Заявка составлена в двух идентичных экземплярах, имеющих равную юридическую силу, по одному для каждой из Сторон.', size: 20, spacing: { after: 200 } }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'ГЕНЕРАЛЬНЫЙ ПОДРЯДЧИК:', bold: true, size: 18 }),
                    new Paragraph({ text: generalContractor.name_short, size: 18 }),
                    new Paragraph({ text: `\n\n_________________ / ${generalContractor.director} /\nМ.П.`, size: 18 })
                  ]
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'СУБПОДРЯДЧИК:', bold: true, size: 18 }),
                    new Paragraph({ text: subShortName, size: 18 }),
                    new Paragraph({ text: `\n\n_________________ / ${contractor.director || contractor.signer_name || 'Подрядчик'} /\nМ.П.`, size: 18 })
                  ]
                })
              ]
            })
          ]
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

/**
 * 6. Генерация простого двустороннего Акта сдачи-приемки работ («Сдал / Принял»)
 * Исключает сложные бухгалтерские формы КС-2. Выводит динамические строки из сметы.
 */
export async function generateCompletionAct({
  task,
  contractor,
  subcontract,
  generalContractor = DEFAULT_GENERAL_CONTRACTOR,
  date = new Date()
}) {
  const docNum = subcontract.id || `АКТ-${task.id}`;
  const docCity = getDocCity(generalContractor, task);
  const dirTitle = generalContractor.director_title || 'Директор';
  const price = Number(subcontract.price_agreed || task.price_per_unit || task.amount || 0);

  // Развернутые строки сметы из субподряда:
  const items = parseCalculationItems(subcontract, task);
  const calcTotal = items.reduce((sum, it) => sum + Number(it.total || 0), 0);
  const effectivePrice = price > 0 ? price : calcTotal;

  const doc = new Document({
    creator: 'StockEasy AI',
    title: 'Акт сдачи-приемки выполненных работ',
    sections: [{
      properties: {
        page: { margin: { top: 1134, right: 850, bottom: 1134, left: 1417 } }
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `ДВУСТОРОННИЙ АКТ СДАЧИ-ПРИЕМКИ ВЫПОЛНЕННЫХ РАБОТ № ${docNum}`, bold: true, size: 24 }),
            new TextRun({ text: `\n(«СДАЛ / ПРИНЯЛ»)`, bold: true, size: 20 })
          ],
          spacing: { after: 120 }
        }),
        new Paragraph({
          text: `к Договору субподряда № ${contractor.contract_number || '—'} от ${formatDateRu(contractor.contract_date || contractor.created_at || new Date())}`,
          alignment: AlignmentType.CENTER,
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: docCity, bold: true, size: 20 }),
            new TextRun({ text: '\t\t\t\t\t\t\t\t' }),
            new TextRun({ text: formatDateRu(date), bold: true, size: 20 })
          ],
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({
              text: `Мы, нижеподписавшиеся, представитель Генподрядчика ${generalContractor.name_full} в лице ${dirTitle}а ${generalContractor.director}, действующего на основании Устава, с одной стороны, и представитель Субподрядчика ${contractor.name_full || contractor.name_short} в лице ${contractor.director || subcontract.installer_fio || 'Руководителя'}, с другой стороны, составили настоящий двусторонний Акт о том, что Субподрядчик фактически сдал, а Генподрядчик принял следующие выполненные строительно-монтажные и пусконаладочные работы на объекте: `,
              size: 20
            }),
            new TextRun({ text: `${task.address || '—'} (Заявка № ${task.id}${task.vsp ? `, ВСП: ${task.vsp}` : ''}).`, bold: true, size: 20 })
          ],
          spacing: { after: 200 }
        }),

        // Таблица выполненных работ из сметы
        buildWorkItemsTable(items, effectivePrice),

        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({ text: '1. Работы выполнены Субподрядчиком в полном объеме, в согласованный срок и с надлежащим качеством в соответствии со стандартами ГОСТ Р 53246-2008 и регламентом Заказчика.\n', size: 19 }),
            new TextRun({ text: '2. Исполнительная документация (кабельный журнал, фотоотчет, протокол измерений параметров линий связи Fluke) передана Генподрядчику в полном объеме.\n', size: 19 }),
            new TextRun({ text: '3. Стороны взаимных финансовых, материальных и иных претензий по объему, качеству и срокам выполнения работ друг к другу не имеют.', size: 19 })
          ],
          spacing: { after: 350 }
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: { top: BORDER_SOLID },
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'РАБОТЫ ПРИНЯЛ (ГЕНПОДРЯДЧИК):', bold: true, size: 18 }),
                    new Paragraph({ text: `${generalContractor.name_short}`, size: 18 }),
                    new Paragraph({ text: `${dirTitle}: _________________ / ${generalContractor.director} /`, size: 18 }),
                    new Paragraph({ text: 'М.П.', size: 16, italics: true })
                  ]
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: { top: BORDER_SOLID },
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'РАБОТЫ СДАЛ (СУБПОДРЯДЧИК):', bold: true, size: 18 }),
                    new Paragraph({ text: `${contractor.name_short || 'Субподрядчик'}`, size: 18 }),
                    new Paragraph({ text: `Руководитель: _________________ / ${contractor.director || subcontract.installer_fio || 'Руководитель'} /`, size: 18 }),
                    new Paragraph({ text: 'М.П.', size: 16, italics: true })
                  ]
                })
              ]
            })
          ]
        })
      ]
    }]
  });
  return await Packer.toBuffer(doc);
}

/**
 * 7. Генерация Счета на оплату от Подрядчика
 * Поддержка уникального номера счета при многократной генерации, детализация по смете
 */
export async function generateInvoice({
  task,
  contractor,
  subcontract,
  generalContractor = DEFAULT_GENERAL_CONTRACTOR,
  invoiceNumber = null,
  date = new Date()
}) {
  const docNum = invoiceNumber || subcontract.id || `СЧ-${task.id}/1`;
  const price = Number(subcontract.price_agreed || task.price_per_unit || task.amount || 0);

  // Развернутые строки сметы:
  const items = parseCalculationItems(subcontract, task);
  const calcTotal = items.reduce((sum, it) => sum + Number(it.total || 0), 0);
  const effectivePrice = price > 0 ? price : calcTotal;

  // Таблица банковских реквизитов подрядчика
  const bankDetailsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, width: { size: 65, type: WidthType.PERCENTAGE }, children: [new Paragraph({ text: `Банк получателя: ${contractor.bank_name || 'ПАО СБЕРБАНК'}`, size: 18 })] }),
          new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, width: { size: 35, type: WidthType.PERCENTAGE }, children: [new Paragraph({ text: `БИК: ${contractor.bik || '044525225'}`, size: 18 })] })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `Получатель: ${contractor.name_full || contractor.name_short || 'Субподрядчик'}`, bold: true, size: 18 })] }),
          new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `Сч. №: ${contractor.account_pay || '40702810000000000000'}`, size: 18 })] })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `ИНН: ${contractor.inn || '—'}    КПП: ${contractor.kpp || '—'}`, size: 18 })] }),
          new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `Корр. сч.: ${contractor.account_corr || '30101810000000000000'}`, size: 18 })] })
        ]
      })
    ]
  });

  const doc = new Document({
    creator: 'StockEasy AI',
    title: 'Счет на оплату',
    sections: [{
      properties: {
        page: { margin: { top: 1134, right: 850, bottom: 1134, left: 1417 } }
      },
      children: [
        bankDetailsTable,
        new Paragraph({ text: '', spacing: { after: 200 } }),

        new Paragraph({
          text: `СЧЕТ НА ОПЛАТУ № ${docNum} от ${formatDateRu(date)}`,
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Поставщик (Исполнитель): ', bold: true, size: 19 }),
            new TextRun({ text: `${contractor.name_full || contractor.name_short}, ИНН ${contractor.inn || '—'}, Адрес: ${contractor.address_legal || '—'}\n`, size: 19 }),
            new TextRun({ text: 'Покупатель (Заказчик): ', bold: true, size: 19 }),
            new TextRun({ text: `${generalContractor.name_full}, ИНН ${generalContractor.inn}, Адрес: ${generalContractor.address_legal}\n`, size: 19 }),
            new TextRun({ text: 'Основание платежа: ', bold: true, size: 19 }),
            new TextRun({ text: `Договор субподряда № ${contractor.contract_number || '—'}, Заказ-наряд № ${subcontract.id || task.id} (Объект: ${task.address || '—'})`, size: 19 })
          ],
          spacing: { after: 250 }
        }),

        // Таблица детализированной сметы
        buildWorkItemsTable(items, effectivePrice),

        new Paragraph({ text: '', spacing: { after: 150 } }),
        new Paragraph({
          children: [
            new TextRun({ text: `Всего наименований ${items.length}, на сумму ${formatMoney(effectivePrice)}.\n`, size: 19 }),
            new TextRun({ text: 'НДС не облагается в связи с применением упрощенной системы налогообложения (ст. 346.11 НК РФ).', italics: true, size: 18 })
          ],
          spacing: { after: 350 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'Руководитель: _________________ / ' + (contractor.director || subcontract.installer_fio || 'Руководитель') + ' /\n', size: 19 }),
            new TextRun({ text: 'Главный бухгалтер: _________________ / ' + (contractor.director || subcontract.installer_fio || 'Бухгалтер') + ' /\n\n', size: 19 }),
            new TextRun({ text: 'М.П.', size: 16, italics: true })
          ]
        })
      ]
    }]
  });
  return await Packer.toBuffer(doc);
}

/**
 * 8. Генерация Акта списания и расхода материалов (ТМЦ)
 * Внутренний Акт расхода материалов объекта со списком реально списанных позиций из task_materials
 */
export async function generateTmcAct({
  task,
  contractor = {},
  subcontract = {},
  generalContractor = DEFAULT_GENERAL_CONTRACTOR,
  materials = [],
  date = new Date()
}) {
  const docNum = subcontract.id || `ТМЦ-${task.id}`;
  const docCity = getDocCity(generalContractor, task);
  const dirTitle = generalContractor.director_title || 'Директор';
  const portsCount = Number(task.fact || task.in_order || 1);

  // Формируем список фактически израсходованных ТМЦ
  // Если переданы материалы из task_materials — берем их. Иначе формируем нормативы по фактическим портам:
  let matRows = [];
  if (Array.isArray(materials) && materials.length > 0) {
    matRows = materials.map((m, idx) => ({
      num: idx + 1,
      name: m.name || m.material_name || 'Материал СКС',
      code: m.code || 'ТМЦ',
      unit: m.unit || 'шт.',
      plan: m.plan_qty != null ? String(m.plan_qty) : String(m.qty || 1),
      fact: m.fact_qty != null ? String(m.fact_qty) : String(m.qty || 1),
      note: m.is_written_off ? 'Списано по факту' : 'Монтаж на объекте'
    }));
  } else {
    // Стандартная спецификация расхода по нормам на фактическое количество портов
    matRows = [
      { num: 1, name: 'Кабель UTP 4 пары Cat.5e Cu (медная жила 0.52мм)', code: 'CABLE-UTP-5E-CU', unit: 'м', plan: String(portsCount * 45), fact: String(portsCount * 45), note: 'Трассы СКС' },
      { num: 2, name: 'Модуль Keystone RJ-45 Cat.5e UTP', code: 'KEYSTONE-RJ45-5E', unit: 'шт', plan: String(portsCount), fact: String(portsCount), note: 'Розетки рабочих мест' },
      { num: 3, name: 'Лицевая панель суппорта 1/2 порта', code: 'FACEPLATE-1P', unit: 'шт', plan: String(Math.ceil(portsCount / 2)), fact: String(Math.ceil(portsCount / 2)), note: 'Розетки' },
      { num: 4, name: 'Коробка накладная для розетки RJ-45', code: 'SURFACE-BOX-1P', unit: 'шт', plan: String(Math.ceil(portsCount / 2)), fact: String(Math.ceil(portsCount / 2)), note: 'Монтаж на стену' },
      { num: 5, name: 'Патч-корд UTP Cat.5e 2.0м', code: 'PATCH-CORD-2M', unit: 'шт', plan: String(portsCount), fact: String(portsCount), note: 'Рабочие места' },
      { num: 6, name: 'Патч-корд UTP Cat.5e 1.0м', code: 'PATCH-CORD-1M', unit: 'шт', plan: String(portsCount), fact: String(portsCount), note: 'Коммутация в шкафу' },
      { num: 7, name: 'Патч-панель 19" 1U 24 порта Cat.5e', code: 'PATCH-PANEL-24', unit: 'шт', plan: String(Math.max(1, Math.ceil(portsCount / 24))), fact: String(Math.max(1, Math.ceil(portsCount / 24))), note: 'Узел коммутации' },
      { num: 8, name: 'Кабель-канал 40х25 мм с крышкой (хлыст 2м)', code: 'CABLE-TRUNK-40X25', unit: 'м', plan: String(Math.round(portsCount * 8)), fact: String(Math.round(portsCount * 8)), note: 'Магистральные трассы' },
      { num: 9, name: 'Труба гофрированная ПВХ ф16 с протяжкой', code: 'CORRUGATED-16', unit: 'м', plan: String(Math.round(portsCount * 12)), fact: String(Math.round(portsCount * 12)), note: 'Запотолочное пространство' },
      { num: 10, name: 'Комплект крепежа (дюбель-хомуты, стяжки 150мм, маркеры)', code: 'FASTENER-SET', unit: 'компл', plan: '1', fact: '1', note: 'Расходные материалы' }
    ];
  }

  const tableHeader = new TableRow({
    children: [
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Наименование материала (ТМЦ)', bold: true, size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Артикул / Код', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Ед.', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'По норме', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Факт расход', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Примечание', bold: true, size: 18 })] })
    ]
  });

  const tableDataRows = matRows.map(m => new TableRow({
    children: [
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: String(m.num), size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: m.name, size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: m.code, size: 17, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: m.unit, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: m.plan, size: 18, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: m.fact, size: 18, bold: true, alignment: AlignmentType.CENTER })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: m.note, size: 17 })] })
    ]
  }));

  const doc = new Document({
    creator: 'StockEasy AI',
    title: 'Акт расхода материалов',
    sections: [{
      properties: {
        page: { margin: { top: 1134, right: 850, bottom: 1134, left: 1417 } }
      },
      children: [
        new Paragraph({
          text: `АКТ СПИСАНИЯ И РАСХОДА МАТЕРИАЛОВ (ТМЦ) № ${docNum}`,
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { after: 150 }
        }),
        new Paragraph({
          text: `на объекте: ${task.address || '—'} (Заявка № ${task.id})`,
          alignment: AlignmentType.CENTER,
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: docCity, bold: true, size: 20 }),
            new TextRun({ text: '\t\t\t\t\t\t\t\t' }),
            new TextRun({ text: formatDateRu(date), bold: true, size: 20 })
          ],
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({
              text: `Комиссия в составе представителя Генподрядчика ${generalContractor.name_full} в лице ${dirTitle}а ${generalContractor.director} и представителя монтажной организации ${contractor.name_short || 'Субподрядчика'} ${subcontract.installer_fio || contractor.director || ''} составили настоящий Акт о том, что при производстве монтажных и пусконаладочных работ СКС на объекте ${task.address || '—'} (число портов: ${portsCount} шт.) были фактически израсходованы следующие материальные ценности:`,
              size: 19
            })
          ],
          spacing: { after: 200 }
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [tableHeader, ...tableDataRows]
        }),

        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Заключение комиссии: Вышеперечисленные материалы (ТМЦ) фактически израсходованы в полном объеме по назначению при монтаже структурированной кабельной системы. Материалы соответствуют требованиям Заказчика, брак и необоснованный перерасход отсутствуют. Неизрасходованные остатки возвращены на склад.',
              size: 19
            })
          ],
          spacing: { after: 350 }
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: { top: BORDER_SOLID },
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'МАТЕРИАЛЫ СДАЛ (МОНТАЖНИК):', bold: true, size: 18 }),
                    new Paragraph({ text: `${contractor.name_short || 'Субподрядчик'}`, size: 18 }),
                    new Paragraph({ text: `\n_________________ / ${subcontract.installer_fio || contractor.director || 'Специалист СМР'} /`, size: 18 }),
                    new Paragraph({ text: 'М.П.', size: 16, italics: true })
                  ]
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: { top: BORDER_SOLID },
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'РАСХОД ПРИНЯЛ (ГЕНПОДРЯДЧИК):', bold: true, size: 18 }),
                    new Paragraph({ text: `${generalContractor.name_short}`, size: 18 }),
                    new Paragraph({ text: `\n${dirTitle}: _________________ / ${generalContractor.director} /`, size: 18 }),
                    new Paragraph({ text: 'М.П.', size: 16, italics: true })
                  ]
                })
              ]
            })
          ]
        })
      ]
    }]
  });
  return await Packer.toBuffer(doc);
}

export function formatSumWordsRu(n) {
  const val = Number(n || 0);
  const intVal = Math.floor(Math.abs(val));
  const kopecks = Math.round((Math.abs(val) - intVal) * 100);
  const kopStr = String(kopecks).padStart(2, '0') + ' коп.';

  if (intVal === 0) return '0 (Ноль) рублей 00 коп.';

  const e1f = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const e1m = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const e2 = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const e3 = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const e4 = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

  function morph(num, one, two, five) {
    const n100 = num % 100;
    if (n100 >= 11 && n100 <= 19) return five;
    const n10 = num % 10;
    if (n10 === 1) return one;
    if (n10 >= 2 && n10 <= 4) return two;
    return five;
  }

  function block(num, isFem) {
    const arr = isFem ? e1f : e1m;
    let r = '';
    const h = Math.floor(num / 100);
    if (h) r += e4[h] + ' ';
    const t = Math.floor((num % 100) / 10);
    const u = num % 10;
    if (t === 1) return r + e2[u] + ' ';
    if (t) r += e3[t] + ' ';
    if (u) r += arr[u] + ' ';
    return r;
  }

  const b = Math.floor(intVal / 1000000000);
  const m = Math.floor((intVal % 1000000000) / 1000000);
  const th = Math.floor((intVal % 1000000) / 1000);
  const r = intVal % 1000;

  let words = '';
  if (b) words += block(b, false) + morph(b, 'миллиард', 'миллиарда', 'миллиардов') + ' ';
  if (m) words += block(m, false) + morph(m, 'миллион', 'миллиона', 'миллионов') + ' ';
  if (th) words += block(th, true) + morph(th, 'тысяча', 'тысячи', 'тысяч') + ' ';
  if (r) words += block(r, false);
  words = words.trim();
  if (words) {
    words = words.charAt(0).toUpperCase() + words.slice(1);
  } else {
    words = 'Ноль';
  }

  const rubMorph = morph(intVal, 'рубль', 'рубля', 'рублей');
  const numStr = intVal.toLocaleString('ru-RU');
  return `${numStr} (${words}) ${rubMorph} ${kopStr}`;
}

function formatDateRuText(d) {
  if (!d) return '«___» ________ 202_ г.';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const day = String(dt.getDate()).padStart(2, '0');
  return `«${day}» ${months[dt.getMonth()]} ${dt.getFullYear()} г.`;
}

export async function generateSubcontractAgreementDocx({
  contract = {},
  contractor = {},
  ownCompany = {},
  task = null,
  tasks = [],
  subcontract = null
}) {
  const docNum = contract.contract_number || '1026-1';
  const docDateStr = formatDateRuText(contract.contract_date || new Date());

  const genComp = {
    name_full: ownCompany.name_full || DEFAULT_GENERAL_CONTRACTOR.name_full,
    name_short: ownCompany.name_short || DEFAULT_GENERAL_CONTRACTOR.name_short,
    director: ownCompany.director || DEFAULT_GENERAL_CONTRACTOR.director,
    director_title: ownCompany.director_title || DEFAULT_GENERAL_CONTRACTOR.director_title || 'Директор',
    address_legal: ownCompany.address_legal || DEFAULT_GENERAL_CONTRACTOR.address_legal,
    address_postal: ownCompany.address_postal || ownCompany.address_legal || DEFAULT_GENERAL_CONTRACTOR.address_legal,
    phone: ownCompany.phone || DEFAULT_GENERAL_CONTRACTOR.phone || '8(383) 373-27-05',
    email: ownCompany.email || DEFAULT_GENERAL_CONTRACTOR.email || 'kab_system@ksgroup.ru.com',
    inn: ownCompany.inn || DEFAULT_GENERAL_CONTRACTOR.inn,
    kpp: ownCompany.kpp || DEFAULT_GENERAL_CONTRACTOR.kpp,
    ogrn: ownCompany.ogrn || DEFAULT_GENERAL_CONTRACTOR.ogrn,
    bank_name: ownCompany.bank_name || DEFAULT_GENERAL_CONTRACTOR.bank_name,
    bik: ownCompany.bik || DEFAULT_GENERAL_CONTRACTOR.bik,
    account_pay: ownCompany.account_pay || DEFAULT_GENERAL_CONTRACTOR.account_pay,
    account_corr: ownCompany.account_corr || DEFAULT_GENERAL_CONTRACTOR.account_corr
  };

  let docCity = 'г. Новосибирск';
  if (genComp.address_legal) {
    const m = genComp.address_legal.match(/г\.\s*([^,]+)/);
    if (m && m[0]) docCity = m[0].trim();
  } else if (task && task.region) {
    docCity = `г. ${task.region.replace(/область|край|республика/gi, '').trim()}`;
  }

  const innStr = String(contractor.inn || '').trim();
  const orgType = (contractor.legal_form || contractor.type || '').toLowerCase();
  const isSelfEmployed = orgType.includes('самозанят') || orgType.includes('нпд') || orgType.includes('self') || (innStr.length === 12 && !orgType.includes('ип'));
  const isIp = orgType.includes('ип') || (!isSelfEmployed && innStr.length === 12);

  let subPreamble = '';
  const subShortName = contractor.name_short || contractor.name_full || 'Субподрядчик';
  const subSigner = contractor.director || contractor.signer_name || contractor.name_full || 'Субподрядчик';

  if (isSelfEmployed) {
    const passportData = contractor.passport || 'паспорт РФ: серия _____ № __________, выдан ____________________';
    const regAddr = contractor.address_legal || contractor.address || '_____________________________________________';
    subPreamble = `Гражданин(-ка) РФ ${subSigner}, ${passportData}, зарегистрированный(-ая) по адресу: ${regAddr}, ИНН ${contractor.inn || '____________'}, применяющий(-ая) специальный налоговый режим «Налог на профессиональный доход», именуемый(-ая) в дальнейшем «Субподрядчик», с другой стороны`;
  } else if (isIp) {
    const ogrnipStr = contractor.ogrn ? `ОГРНИП ${contractor.ogrn}` : 'ОГРНИП ________________';
    subPreamble = `Индивидуальный предприниматель ${subSigner}, действующий(-ая) на основании свидетельства о государственной регистрации (${ogrnipStr}), ИНН ${contractor.inn || '____________'}, именуемый(-ая) в дальнейшем «Субподрядчик», с другой стороны`;
  } else {
    const subBasis = contractor.acting_basis || 'Устава';
    subPreamble = `${contractor.name_full || contractor.name_short || 'Общество с ограниченной ответственностью «_________»'}, именуемое в дальнейшем «Субподрядчик», в лице ${contractor.signer_position || 'директора'} ${subSigner}, действующего на основании ${subBasis}, с другой стороны`;
  }

  let app1Items = [];
  let totalOrderAmount = 0;
  const targetTask = task || (tasks && tasks[0]) || null;

  if (subcontract || targetTask) {
    app1Items = parseCalculationItems(subcontract || {}, targetTask || {});
  }
  if (!app1Items || app1Items.length === 0) {
    if (targetTask) {
      const pCount = targetTask.fact || targetTask.in_order || 1;
      const amt = Number(targetTask.amount || 0);
      app1Items = [{
        num: 1,
        title: targetTask.work_type || 'Выполнение строительно-монтажных и пусконаладочных работ',
        unit: 'порт/объект',
        qty: pCount,
        price: amt > 0 ? Math.round((amt / pCount) * 100) / 100 : 0,
        total: amt
      }];
    } else {
      app1Items = [{
        num: 1,
        title: contract.subject || 'Строительно-монтажные и пусконаладочные работы СКС и связи',
        unit: 'комплекс',
        qty: 1,
        price: 0,
        total: 0
      }];
    }
  }

  totalOrderAmount = app1Items.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
  if (totalOrderAmount === 0 && subcontract && subcontract.price_agreed) {
    totalOrderAmount = Number(subcontract.price_agreed);
  }

  const objectAddress = targetTask?.address || contract.territory || 'Адрес указывается в Заявке на объект';
  const vatNote = (ownCompany.vat_mode === 'without_vat' || isSelfEmployed || isIp) ? 'без НДС' : 'в т.ч. НДС';

  const app1TableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ width: { size: 6, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 44, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Наименование работ и адрес объекта', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Ед. изм.', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Кол-во', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Цена (руб.)', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Стоимость (руб.)', bold: true, size: 18, alignment: AlignmentType.CENTER })] })
      ]
    })
  ];

  app1Items.forEach((it, idx) => {
    app1TableRows.push(new TableRow({
      children: [
        new TableCell({ width: { size: 6, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: String(idx + 1), size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 44, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${it.title} (${objectAddress})`, size: 18 })] }),
        new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: it.unit || 'шт.', size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: String(it.qty || 1), size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: formatMoneyNum(it.price), size: 18, alignment: AlignmentType.RIGHT })] }),
        new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: formatMoneyNum(it.total), size: 18, alignment: AlignmentType.RIGHT, bold: true })] })
      ]
    }));
  });

  app1TableRows.push(new TableRow({
    children: [
      new TableCell({ width: { size: 72, type: WidthType.PERCENTAGE }, columnSpan: 4, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'ИТОГО ПО ЗАЯВКЕ:', bold: true, size: 18, alignment: AlignmentType.RIGHT })] }),
      new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, columnSpan: 2, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: totalOrderAmount > 0 ? (formatMoneyNum(totalOrderAmount) + ' руб.') : 'По акту', bold: true, size: 18, alignment: AlignmentType.RIGHT })] })
    ]
  }));

  const tzTableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 46, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Название характеристики', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 46, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Данные по объекту', bold: true, size: 18, alignment: AlignmentType.CENTER })] })
      ]
    }),
    new TableRow({
      children: [
        new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '1', size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 46, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Количество этажей здания', size: 18 })] }),
        new TableCell({ width: { size: 46, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'В соответствии с техническим планом объекта / РД', size: 18 })] })
      ]
    }),
    new TableRow({
      children: [
        new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '2', size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 46, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Наличие фальш-потолков, в коридорах и помещениях здания', size: 18 })] }),
        new TableCell({ width: { size: 46, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Фальш-потолок имеется частично, прокладка в кабель-каналах и за потолком', size: 18 })] })
      ]
    }),
    new TableRow({
      children: [
        new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '3', size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 46, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Наличие и расположение кроссовой комнаты здания, этажных кроссовых комнат, помещения кабельного ввода (площадь, установленное монтажное оборудование)', size: 18 })] }),
        new TableCell({ width: { size: 46, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Кроссовая (серверная) комната, настенный/напольный шкаф 19" (ТКШ)', size: 18 })] })
      ]
    }),
    new TableRow({
      children: [
        new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '4', size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 46, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Наличие и расположение вертикальных каналов и их емкость (возможность прокладки в существующие каналы, их свободная емкость)', size: 18 })] }),
        new TableCell({ width: { size: 46, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Имеющиеся вертикальные каналы и межэтажные гильзы в соответствии с проектом', size: 18 })] })
      ]
    }),
    new TableRow({
      children: [
        new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '5', size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 46, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Наличие и возможность использования существующих этажных кабельных каналов (лотки, короба, закладные), их свободная емкость', size: 18 })] }),
        new TableCell({ width: { size: 46, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Разводка сети осуществляется в кабель-каналах и за фальш-потолком к рабочим местам', size: 18 })] })
      ]
    }),
    new TableRow({
      children: [
        new TableCell({ width: { size: 8, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '6', size: 18, alignment: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 46, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Наличие в здании существующей ЛВС, требуемой полной или частичной замены', size: 18 })] }),
        new TableCell({ width: { size: 46, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Да, в соответствии с рабочей документацией', size: 18 })] })
      ]
    })
  ];

  const doc = new Document({
    creator: 'StockEasy AI — Cable Systems Contract Management',
    title: `Договор субподряда № ${docNum}`,
    sections: [{
      properties: {
        page: { margin: { top: 1134, right: 850, bottom: 1134, left: 1417 } }
      },
      children: [
        new Paragraph({
          text: `ДОГОВОР СУБПОДРЯДА № ${docNum}`,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 150 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: docCity, bold: true, size: 20 }),
            new TextRun({ text: '\t\t\t\t\t\t\t\t\t' }),
            new TextRun({ text: docDateStr, bold: true, size: 20 })
          ],
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({
              text: `${genComp.name_full || genComp.name_short}, именуемое в дальнейшем «Генеральный подрядчик», в лице ${genComp.director_title}а ${genComp.director}, действующего(-ей) на основании Устава, с одной стороны, и `,
              size: 20
            }),
            new TextRun({
              text: `${subPreamble}, совместно именуемые «Стороны» и каждый в отдельности «Сторона», заключили настоящий Договор (далее – «Договор») о нижеследующем:`,
              size: 20
            })
          ],
          spacing: { after: 200 }
        }),

        new Paragraph({ text: '1. ПРЕДМЕТ ДОГОВОРА', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '1.1. Субподрядчик обязуется выполнить работы, указанные в заявке и техническом задании, являющихся неотъемлемой частью настоящего Договора, и сдать их результат Генеральному подрядчику, а Генеральный подрядчик обязуется принять результат работ и оплатить его.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '1.2. Состав, объем, обеспечение материалами, срок, место выполнения и стоимость работ, выполняемых Субподрядчиком по настоящему Договору, определяется на основании утвержденных заявок/спецификаций, являющихся неотъемлемой частью настоящего Договора.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '2. ЦЕНА ДОГОВОРА И ПОРЯДОК ОПЛАТЫ', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '2.1. Общая цена Договора состоит из сумм всех подписанных сторонами заявок/спецификаций. Расчеты между Генеральным подрядчиком и Субподрядчиком производятся в порядке, указанном в заявках/спецификациях.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '2.2. Сумма Договора включает в себя вознаграждение Субподрядчика и все его расходы на исполнение обязательств по настоящему Договору, в том числе транспортные расходы и другие расходы, связанные с выездом представителей Субподрядчика для исполнения обязательств по настоящему Договору, другие возможные накладные расходы Субподрядчика, стоимость оборудования, расходы на гарантийные обязательства в течение заявленного гарантийного срока на выполненные работы, услуги страхования, уплату налогов, сборов и других обязательных платежей, а также прочие расходы и налоги, уплаченные или подлежащие уплате. Затраты, не включенные в сумму договора, не подлежат оплате со стороны Генерального подрядчика.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '2.3. Цена Договора включает расходы на уплату налогов, таможенных пошлин, сборов и других обязательных платежей, транспортные и иные расходы, связанные с исполнением Договора.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: isSelfEmployed
          ? '2.4. Субподрядчик применяет специальный налоговый режим «Налог на профессиональный доход» (НПД). Оплата по Договору осуществляется в безналичной форме путем перечисления денежных средств на банковский счет Субподрядчика. Субподрядчик обязуется сформировать с использованием мобильного приложения «Мой налог» фискальный чек и передать его Генеральному подрядчику в день оплаты либо не позднее 9-го числа следующего месяца. В случае непредставления чека Субподрядчик возмещает Генеральному подрядчику все возникшие убытки.'
          : '2.4. Оплата по Договору осуществляется в безналичной форме путем перечисления денежных средств на банковский счет Субподрядчика, указанный в Договоре, в порядке, указанном в заявке/спецификации.',
          size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '2.5. Обязательства Генерального подрядчика по оплате цены Договора считаются исполненными с момента зачисления денежных средств на расчетный счет Субподрядчика.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '3. ПРАВА И ОБЯЗАННОСТИ СТОРОН', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '3.1. Генеральный подрядчик имеет право:', bold: true, size: 20, spacing: { after: 80 } }),
        new Paragraph({ text: '3.1.1. Требовать от Субподрядчика надлежащего исполнения обязательств в соответствии с условиями Договора, а также требовать своевременного устранения выявленных недостатков.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.1.2. Требовать от Субподрядчика представления надлежащим образом оформленных документов.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.1.3. В случае досрочного исполнения Субподрядчиком обязательств по Договору принять и оплатить работы.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.1.4. Запрашивать у Субподрядчика информацию о ходе и состоянии исполнения обязательств по Договору.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.1.5. Осуществлять контроль и надзор за качеством, порядком и сроками выполнения работ, давать указания о способе выполнения работ, не вмешиваясь при этом в оперативно-хозяйственную деятельность Субподрядчика.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.1.6. Беспрепятственного доступа к объектам работ, выполняемых Субподрядчиком по настоящему Договору, для осуществления контроля за ходом и качеством выполнения работ, в том числе с привлечением специализированных организаций.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.1.7. Требовать уплаты неустоек (штрафов, пеней) в случае просрочки Субподрядчиком обязательств, предусмотренных Договором, а также в иных случаях ненадлежащего исполнения Субподрядчиком обязательств.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.1.8. Отказаться от приемки результата работ в случаях, предусмотренных Договором и законодательством РФ, в том числе при обнаружении неустранимых недостатков.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.1.9. Направлять мотивированный отказ от подписания акта приемки выполненных работ по результатам приемки результатов выполненных работ.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.1.10. Отказаться в любое время до сдачи работ от исполнения Договора и потребовать возмещения ущерба, если Субподрядчик не приступает своевременно к исполнению обязательств или выполняет работы настолько медленно, что окончание их к сроку становится явно невозможным.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.1.11. Пользоваться иными установленными Договором и законодательством РФ правами.', size: 20, spacing: { after: 100 } }),

        new Paragraph({ text: '3.2. Генеральный подрядчик обязан:', bold: true, size: 20, spacing: { after: 80 } }),
        new Paragraph({ text: '3.2.1. Передать Субподрядчику документы, необходимые для выполнения работы.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.2.2. Обеспечить приемку представленного Субподрядчиком результата работ в соответствии с условиями Договора.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.2.3. Оплатить результат работы в соответствии с условиями Договора.', size: 20, spacing: { after: 100 } }),

        new Paragraph({ text: '3.3. Субподрядчик вправе:', bold: true, size: 20, spacing: { after: 80 } }),
        new Paragraph({ text: '3.3.1. Требовать оплаты выполненных надлежащим образом работ.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.3.2. Запрашивать у Генерального подрядчика разъяснения и уточнения относительно проведения работ в рамках Договора.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.3.3. Требовать уплаты неустоек (штрафов, пеней) в случае просрочки исполнения Генеральным подрядчиком обязательств по Договору.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.3.4. Пользоваться иными правами, установленными Договором и законодательством РФ.', size: 20, spacing: { after: 100 } }),

        new Paragraph({ text: '3.4. Субподрядчик обязан:', bold: true, size: 20, spacing: { after: 80 } }),
        new Paragraph({ text: '3.4.1. Выполнить все работы в объеме и в сроки, предусмотренные Договором и приложениями к нему, и сдать результат выполненных работ Генеральному подрядчику по акту выполненных работ.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.4.2. Обеспечивать соответствие результатов работ требованиям качества, безопасности жизни и здоровья, а также иным требованиям сертификации, безопасности (санитарным нормам и правилам, государственным стандартам и т.п.), лицензирования, установленным законодательством РФ.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.4.3. Немедленно предупредить Генерального подрядчика и до получения от него указаний приостановить работу при обнаружении неблагоприятных последствий выполнения его указаний или иных обстоятельств, грозящих годности работ.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.4.4. Обеспечить устранение недостатков, выявленных при приемке работ и в течение гарантийного срока, за свой счет.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.4.5. По запросу Генерального подрядчика предоставлять достоверную информацию о ходе исполнения своих обязательств.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.4.6. Не предоставлять другим лицам и не разглашать конфиденциальную информацию, полученную в результате исполнения Договора.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.4.7. Соблюдать правила внутреннего трудового распорядка, техники безопасности и пожарной безопасности на объекте.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.4.8. Обеспечить наличие документов, подтверждающих соответствие привлекаемых специалистов квалификационным требованиям.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.4.9. Предоставить исполнительную документацию, кабельный журнал и фотоотчеты по завершении монтажных работ.', size: 20, spacing: { after: 60 } }),
        new Paragraph({ text: '3.4.10. Исполнять иные обязанности, предусмотренные действующим законодательством РФ и Договором.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '4. СРОКИ ВЫПОЛНЕНИЯ РАБОТ, МЕСТО, КАЧЕСТВО И УСЛОВИЯ ВЫПОЛНЕНИЯ РАБОТ', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '4.1. Сроки выполнения работ указываются в заявках/спецификациях к настоящему Договору.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '4.2. Качество, технические характеристики работ, результаты работ и иные показатели должны соответствовать условиям Договора, обязательным нормам и правилам, регулирующим данную деятельность (ГОСТ, ТУ), а также иным требованиям законодательства РФ.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '5. ПОРЯДОК ПРИЕМКИ РЕЗУЛЬТАТОВ ВЫПОЛНЕННЫХ РАБОТ', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '5.1. Генеральный подрядчик осуществляет приемку выполненных работ в течение 5 (пяти) рабочих дней, следующих за днем поступления подписанного Субподрядчиком акта выполненных работ.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: `5.2. В случае обнаружения недостатков Генеральный подрядчик извещает Субподрядчика не позднее 5 (пяти) рабочих дней. Извещение о выявленных недостатках направляется Субподрядчику электронной почтой (адрес Субподрядчика для извещений: ${contractor.email || 'указанный в разделе 13'}), такое извещение считается полученным Субподрядчиком в день его отправки. Субподрядчик обязан устранить недостатки в установленный срок.`, size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '5.3. Для проверки результатов работ Генеральный подрядчик вправе провести независимую экспертизу с привлечением экспертных организаций.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '5.4. По результатам приемки Генеральный подрядчик подписывает документ о приемке либо мотивированный отказ с указанием причин.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '6. ОТВЕТСТВЕННОСТЬ СТОРОН', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '6.1. За неисполнение или ненадлежащее исполнение обязательств Стороны несут ответственность в соответствии с Договором и законодательством РФ.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '6.2. В случае просрочки исполнения Субподрядчиком обязательств (в т.ч. гарантийных) начисляется пеня в размере 0,1% от стоимости невыполненных в срок работ за каждый день просрочки.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '6.3. Общая сумма начисленных штрафов за неисполнение обязательств не может превышать цену Договора.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '6.4. Уплата неустойки не освобождает Стороны от исполнения лежащих на них обязательств.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '7. ПОРЯДОК ИЗМЕНЕНИЯ И РАСТОРЖЕНИЯ ДОГОВОРА', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '7.1. Расторжение Договора допускается по соглашению Сторон, по решению суда или в одностороннем порядке в случаях, предусмотренных гражданским законодательством РФ.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '7.2. Генеральный подрядчик вправе в одностороннем порядке отказаться от исполнения Договора, письменно уведомив об этом Субподрядчика за 5 (пять) рабочих дней.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '7.3. Все изменения и дополнения оформляются дополнительными соглашениями в письменной форме.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '8. РАЗРЕШЕНИЕ СПОРОВ', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '8.1. Все споры и разногласия Стороны разрешают в претензионном порядке. Срок ответа на претензию – 10 (десять) рабочих дней.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '8.2. При недостижении согласия спор передается на рассмотрение в Арбитражный суд по месту нахождения Генерального подрядчика.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '9. ОБСТОЯТЕЛЬСТВА НЕПРЕОДОЛИМОЙ СИЛЫ', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '9.1. Стороны освобождаются от ответственности за частичное или полное неисполнение обязательств при наступлении обстоятельств непреодолимой силы (пожары, наводнения, военные действия, акты госорганов).', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '9.2. Сторона, для которой создалась невозможность исполнения, обязана известить другую Сторону в течение 5 (пяти) рабочих дней с приложением официальных документов.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '10. ГАРАНТИЙНЫЕ ОБЯЗАТЕЛЬСТВА', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '10.1. Срок гарантии на результат выполненных строительно-монтажных работ составляет 12 (двенадцать) месяцев с даты подписания Сторонами акта выполненных работ.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '10.2. Гарантийный срок начинает течь с момента подписания Сторонами акта выполненных работ и распространяется на весь объем работ.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '10.3. В случае обнаружения дефектов Субподрядчик обязан безвозмездно устранить их в течение 5 (пяти) рабочих дней после получения уведомления Генерального подрядчика.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '10.4. При неустранении дефектов Субподрядчиком Генеральный подрядчик вправе устранить их самостоятельно либо с привлечением третьих лиц за счет Субподрядчика.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '11. ПРОЧИЕ УСЛОВИЯ', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '11.1. Договор вступает в силу с момента заключения и действует до полного исполнения Сторонами обязательств.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '11.2. Документооборот осуществляется в письменной форме, а также по электронной почте, указанной в Договоре. Документы, направленные по электронной почте, имеют полную юридическую силу. Срок ответа на входящий документ – не более 3 (трех) календарных дней.', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: '11.3. При изменении адреса или банковских реквизитов Сторона обязана письменно уведомить другую Сторону в течение 24 часов.', size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '12. ПРИЛОЖЕНИЯ К ДОГОВОРУ', bold: true, size: 20, spacing: { before: 150, after: 100 } }),
        new Paragraph({ text: '12.1. Неотъемлемыми частями настоящего Договора являются:\n— Приложение № 1: Заявка на выполнение работ (Спецификация);\n— Приложение № 2: Техническое задание.', size: 20, spacing: { after: 200 } }),

        new Paragraph({ text: '13. АДРЕСА И РЕКВИЗИТЫ СТОРОН:', bold: true, size: 20, spacing: { before: 150, after: 150 } }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'ГЕНЕРАЛЬНЫЙ ПОДРЯДЧИК:', bold: true, size: 18 }),
                    new Paragraph({ text: `${genComp.name_full || genComp.name_short}`, bold: true, size: 18 }),
                    new Paragraph({ text: `Адрес юр.: ${genComp.address_legal || '—'}`, size: 17 }),
                    new Paragraph({ text: `Адрес почт.: ${genComp.address_postal || '—'}`, size: 17 }),
                    new Paragraph({ text: `Тел.: ${genComp.phone || '—'}`, size: 17 }),
                    new Paragraph({ text: `Эл. почта: ${genComp.email || '—'}`, size: 17 }),
                    new Paragraph({ text: `ИНН: ${genComp.inn}  КПП: ${genComp.kpp || '—'}`, size: 17 }),
                    new Paragraph({ text: `ОГРН: ${genComp.ogrn || '—'}`, size: 17 }),
                    new Paragraph({ text: `Банк: ${genComp.bank_name || '—'}`, size: 17 }),
                    new Paragraph({ text: `БИК: ${genComp.bik || '—'}`, size: 17 }),
                    new Paragraph({ text: `Р/С: ${genComp.account_pay || '—'}`, size: 17 }),
                    new Paragraph({ text: `К/С: ${genComp.account_corr || '—'}`, size: 17 }),
                    new Paragraph({ text: `\n${genComp.director_title}:`, bold: true, size: 18 }),
                    new Paragraph({ text: `_________________ / ${genComp.director} /`, size: 18 }),
                    new Paragraph({ text: 'М.П.', size: 16, italics: true })
                  ]
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'СУБПОДРЯДЧИК:', bold: true, size: 18 }),
                    new Paragraph({ text: `${subShortName}`, bold: true, size: 18 }),
                    new Paragraph({ text: `Адрес: ${contractor.address_legal || '—'}`, size: 17 }),
                    new Paragraph({ text: `Тел.: ${contractor.phone || '—'}`, size: 17 }),
                    new Paragraph({ text: `Эл. почта: ${contractor.email || '—'}`, size: 17 }),
                    new Paragraph({ text: `ИНН: ${contractor.inn || '—'}` + (contractor.kpp ? `  КПП: ${contractor.kpp}` : ''), size: 17 }),
                    new Paragraph({ text: (isIp ? 'ОГРНИП: ' : 'ОГРН: ') + (contractor.ogrn || '—'), size: 17 }),
                    new Paragraph({ text: `Банк: ${contractor.bank_name || '—'}`, size: 17 }),
                    new Paragraph({ text: `БИК: ${contractor.bik || '—'}`, size: 17 }),
                    new Paragraph({ text: `Р/С: ${contractor.account_pay || '—'}`, size: 17 }),
                    new Paragraph({ text: `К/С: ${contractor.account_corr || '—'}`, size: 17 }),
                    new Paragraph({ text: `\n${isIp ? 'Индивидуальный предприниматель' : (contractor.signer_position || 'Руководитель')}:`, bold: true, size: 18 }),
                    new Paragraph({ text: `_________________ / ${subSigner} /`, size: 18 }),
                    new Paragraph({ text: 'М.П.', size: 16, italics: true })
                  ]
                })
              ]
            })
          ]
        }),

        // ─── ПРИЛОЖЕНИЕ № 1 ────────────────────────────────────────────────────────
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ text: 'Приложение № 1', bold: true, size: 20, alignment: AlignmentType.RIGHT }),
        new Paragraph({ text: `к Договору субподряда № ${docNum}`, size: 18, alignment: AlignmentType.RIGHT }),
        new Paragraph({ text: `от ${docDateStr}`, size: 18, alignment: AlignmentType.RIGHT, spacing: { after: 200 } }),

        new Paragraph({
          text: `ЗАЯВКА (СПЕЦИФИКАЦИЯ)`,
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { after: 150 }
        }),
        new Paragraph({
          text: `${genComp.name_full || genComp.name_short}, именуемое в дальнейшем «Генеральный подрядчик», в лице ${genComp.director_title}а ${genComp.director}, действующего(-ей) на основании Устава, с одной стороны, и ${subShortName}, именуемый(-ое) в дальнейшем «Субподрядчик», с другой стороны, вместе именуемые «Стороны», утвердили настоящую Заявку о нижеследующем:`,
          size: 20,
          spacing: { after: 150 }
        }),
        new Paragraph({
          text: `1. Стороны согласовали следующий перечень, объект и стоимость работ по объекту: ${objectAddress}:`,
          size: 20,
          spacing: { after: 150 }
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: app1TableRows
        }),

        new Paragraph({ text: '', spacing: { after: 150 } }),
        new Paragraph({
          text: `2. Общая сумма согласно настоящей Заявке составляет ${totalOrderAmount > 0 ? formatSumWordsRu(totalOrderAmount) : 'согласно согласованной смете'}, ${vatNote}.`,
          size: 20,
          spacing: { after: 100 }
        }),
        new Paragraph({
          text: `3. Срок выполнения Работ: 20 (Двадцать) рабочих дней с момента подписания настоящей Заявки${targetTask && targetTask.deadline ? (' (плановый срок сдачи: до ' + formatDateRuText(targetTask.deadline) + ')') : ''}.`,
          size: 20,
          spacing: { after: 100 }
        }),
        new Paragraph({
          text: '4. Субподрядчик выполняет работы на объекте из материалов Генерального подрядчика, которые принимает по отгрузочным накладным (акту передачи ТМЦ), и по окончании работ предоставляет полный отчет по израсходованным материалам. Неиспользованные материалы подлежат возврату Генеральному подрядчику.',
          size: 20,
          spacing: { after: 100 }
        }),
        new Paragraph({
          text: '5. Стоимость работ по данной Заявке на период действия договора является фиксированной и не подлежит изменению без письменного согласия Генерального подрядчика.',
          size: 20,
          spacing: { after: 100 }
        }),
        new Paragraph({
          text: `6. Оплата производится путем перечисления денежных средств в размере 100% от указанной в п. 2 суммы (${totalOrderAmount > 0 ? formatMoneyNum(totalOrderAmount) + ' руб.' : 'согласно акту'}) в течение 15 (пятнадцати) календарных дней после приемки выполненных работ и подписания двустороннего акта сдачи-приемки.`,
          size: 20,
          spacing: { after: 100 }
        }),
        new Paragraph({
          text: '7. Гарантийные обязательства на выполняемые работы составляют 12 (двенадцать) месяцев с момента подписания акта сдачи-приемки.',
          size: 20,
          spacing: { after: 100 }
        }),
        new Paragraph({
          text: '8. Заявка составлена в двух идентичных экземплярах, имеющих одинаковую юридическую силу, по одному для каждой из Сторон. В случае противоречий в условиях Договора и Заявки приоритет имеют условия настоящей Заявки.',
          size: 20,
          spacing: { after: 200 }
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'ГЕНЕРАЛЬНЫЙ ПОДРЯДЧИК:', bold: true, size: 18 }),
                    new Paragraph({ text: `${genComp.name_short}`, size: 18 }),
                    new Paragraph({ text: `\n_________________ / ${genComp.director} /\nМ.П.`, size: 18 })
                  ]
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'СУБПОДРЯДЧИК:', bold: true, size: 18 }),
                    new Paragraph({ text: `${subShortName}`, size: 18 }),
                    new Paragraph({ text: `\n_________________ / ${subSigner} /\nМ.П.`, size: 18 })
                  ]
                })
              ]
            })
          ]
        }),

        // ─── ПРИЛОЖЕНИЕ № 2 ────────────────────────────────────────────────────────
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ text: 'Приложение № 2', bold: true, size: 20, alignment: AlignmentType.RIGHT }),
        new Paragraph({ text: `к Договору субподряда № ${docNum}`, size: 18, alignment: AlignmentType.RIGHT }),
        new Paragraph({ text: `от ${docDateStr}`, size: 18, alignment: AlignmentType.RIGHT, spacing: { after: 200 } }),

        new Paragraph({
          text: 'ТЕХНИЧЕСКОЕ ЗАДАНИЕ',
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 }
        }),
        new Paragraph({
          text: `на выполнение работ в сфере информационно-коммуникационных технологий (${targetTask?.work_type || 'создание ЛВС и монтаж СКС'})`,
          alignment: AlignmentType.CENTER,
          size: 19,
          italics: true,
          spacing: { after: 200 }
        }),

        new Paragraph({ text: '1. ОБЩИЕ СВЕДЕНИЯ', bold: true, size: 20, spacing: { before: 100, after: 80 } }),
        new Paragraph({ text: `Адрес объекта: ${objectAddress}`, size: 20, spacing: { after: 150 } }),

        new Paragraph({ text: '2. ХАРАКТЕРИСТИКА ОБЪЕКТА', bold: true, size: 20, spacing: { before: 100, after: 80 } }),
        new Paragraph({
          text: `Настоящий документ определяет требования к созданию локальной вычислительной сети (ЛВС) на объекте по адресу: ${objectAddress}.${targetTask?.fact ? (' Объем работ: ' + targetTask.fact + ' портов.') : ''} Характеристики объекта представлены в Таблице 1:`,
          size: 20,
          spacing: { after: 150 }
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tzTableRows
        }),

        new Paragraph({ text: '', spacing: { after: 150 } }),
        new Paragraph({ text: '3. ГАРАНТИЙНЫЕ ОБЯЗАТЕЛЬСТВА', bold: true, size: 20, spacing: { before: 100, after: 80 } }),
        new Paragraph({ text: '3.1. Срок гарантии на выполненную работу и смонтированные инженерные системы составляет 12 (двенадцать) месяцев с момента подписания документа о приемке (акта выполненных работ). В случае обнаружения дефектов устранение производится за счет Субподрядчика в течение 5 (пяти) рабочих дней.', size: 20, spacing: { after: 120 } }),

        new Paragraph({ text: '4. ОСОБЫЕ УСЛОВИЯ', bold: true, size: 20, spacing: { before: 100, after: 80 } }),
        new Paragraph({ text: '4.1. Работы выполняются в эксплуатируемом здании. Все необходимые согласования с администрацией объекта Субподрядчик осуществляет по согласованию с Генеральным подрядчиком.', size: 20, spacing: { after: 120 } }),

        new Paragraph({ text: '5. ТЕХНИЧЕСКИЕ ХАРАКТЕРИСТИКИ И КАЧЕСТВО', bold: true, size: 20, spacing: { before: 100, after: 80 } }),
        new Paragraph({ text: '5.1. Работы выполняются в объемах и качестве в строгом соответствии с рабочей проектной документацией, переданной Генеральным подрядчиком, требованиями ГОСТ Р 53246-2008, СНиП и ПУЭ.', size: 20, spacing: { after: 200 } }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'ГЕНЕРАЛЬНЫЙ ПОДРЯДЧИК:', bold: true, size: 18 }),
                    new Paragraph({ text: `${genComp.name_short}`, size: 18 }),
                    new Paragraph({ text: `\n_________________ / ${genComp.director} /\nМ.П.`, size: 18 })
                  ]
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'СУБПОДРЯДЧИК:', bold: true, size: 18 }),
                    new Paragraph({ text: `${subShortName}`, size: 18 }),
                    new Paragraph({ text: `\n_________________ / ${subSigner} /\nМ.П.`, size: 18 })
                  ]
                })
              ]
            })
          ]
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}
