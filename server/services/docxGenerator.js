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
  HeadingLevel
} from 'docx';

// Общие стили и типовые реквизиты Генподрядчика по умолчанию
export const DEFAULT_GENERAL_CONTRACTOR = {
  name_full: 'Общество с ограниченной ответственностью «Ультима»',
  name_short: 'ООО «Ультима»',
  inn: '7810754890',
  kpp: '781001001',
  ogrn: '1197847089123',
  address_legal: '196084, г. Санкт-Петербург, Московский пр-кт, д. 100, лит. А',
  phone: '+7 (812) 380-00-00',
  email: 'info@stockeasy.ru',
  director: 'Чайка А. В.',
  bank_name: 'ПАО СБЕРБАНК г. Москва',
  bik: '044525225',
  account_pay: '40702810938000012345',
  account_corr: '30101810400000000225'
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

/**
 * 1. Генерация Заказ-наряда подрядчику (Приложение № 2 к Договору субподряда)
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
  const price = subcontract.price_agreed || task.price_per_unit || task.amount || 0;

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
            new TextRun({ text: 'Приложение № 2', bold: true, size: 20 }),
            new TextRun({ text: `\nк Договору субподряда № ${contractNum}`, size: 18, italics: true }),
            new TextRun({ text: `\nот ${formatDateRu(contractor.created_at || new Date())}`, size: 18, italics: true })
          ]
        }),
        new Paragraph({ text: '', spacing: { after: 200 } }),

        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `ЗАКАЗ-НАРЯД № ${docNum}`, bold: true, size: 28 }),
            new TextRun({ text: `\nна выполнение монтажных и пусконаладочных работ`, bold: true, size: 22 })
          ],
          spacing: { after: 300 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: 'г. Санкт-Петербург', bold: true, size: 20 }),
            new TextRun({ text: '\t\t\t\t\t\t\t\t' }),
            new TextRun({ text: formatDateRu(subcontract.assigned_date || new Date()), bold: true, size: 20 })
          ],
          spacing: { after: 300 }
        }),

        new Paragraph({
          children: [
            new TextRun({
              text: `1. Генподрядчик: ${generalContractor.name_full}, ИНН ${generalContractor.inn}, ОГРН ${generalContractor.ogrn}, в лице Генерального директора ${generalContractor.director}.`,
              size: 20
            })
          ],
          spacing: { after: 150 }
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `2. Субподрядчик: ${contractor.name_full || contractor.name_short || 'ИП / Подрядчик'}, ИНН ${contractor.inn || '—'}, Адрес: ${contractor.address_legal || '—'}.`,
              size: 20
            })
          ],
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: '3. Характеристики объекта и задание:', bold: true, size: 20 })
          ],
          spacing: { after: 150 }
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
                  children: [new Paragraph({ text: 'Вид и объем работ:', bold: true, size: 19 })]
                }),
                new TableCell({
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [new Paragraph({ text: `${workType}. Количество портов/точек: ${task.in_order || 1} шт.`, size: 19 })]
                })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [new Paragraph({ text: 'Сроки выполнения:', bold: true, size: 19 })]
                }),
                new TableCell({
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [new Paragraph({
                    text: `Начало: ${formatDateRu(subcontract.assigned_date || task.date_vnesen || new Date())}. Окончание (дедлайн): ${formatDateRu(subcontract.deadline || task.deadline)}.`,
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
                  children: [new Paragraph({ text: 'Согласованная стоимость:', bold: true, size: 19 })]
                }),
                new TableCell({
                  borders: CELL_BORDERS_ALL,
                  margins: CELL_PADDING,
                  children: [new Paragraph({ text: `${formatMoney(price)} (НДС не облагается в связи с применением УСН)`, bold: true, size: 19 })]
                })
              ]
            })
          ]
        }),

        new Paragraph({ text: '', spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({
              text: '4. Требования к качеству и отчетности:\n',
              bold: true,
              size: 20
            }),
            new TextRun({
              text: 'Работы выполняются строго в соответствии с отраслевыми стандартами СТУ и регламентом Заказчика. По окончании работ Субподрядчик передает: фотоотчет скрытых и открытых работ, исполнительную схему, заполненный кабельный журнал и акт расхода ТМЦ.',
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
                    new Paragraph({ text: `\n\n_________________ / ${generalContractor.director} /`, size: 18 }),
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
                    new Paragraph({ text: `\n\n_________________ / ${contractor.director || subcontract.installer_fio || 'Руководитель'} /`, size: 18 }),
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
 * 2. Генерация Письма на допуск на объект (по бланку Сбера)
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
  const vsp = task.vsp || '—';
  const startDate = formatDateRu(task.data_vyhoda || new Date());
  const endDate = formatDateRu(task.deadline || new Date(Date.now() + 5 * 86400000));

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
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: `${s.passport_series_number || '—'}, выдан ${s.passport_issued_by || '—'} от ${s.passport_issue_date || '—'}`, size: 17 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: s.phone || '—', size: 18 })] }),
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: s.auto_number || '—', size: 18 })] })
    ]
  }));

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
          children: [
            new TextRun({ text: 'Руководителю подразделения безопасности\n', bold: true, size: 20 }),
            new TextRun({ text: `${task.customer || 'ПАО Сбербанк'}\nКуратору объекта ВСП № ${vsp}`, size: 19 })
          ],
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
              text: `В рамках исполнения Договора генподряда просим Вас оформить пропуска и разрешить допуск на объект, расположенный по адресу: `,
              size: 20
            }),
            new TextRun({ text: `${address} (ВСП: ${vsp})`, bold: true, size: 20 }),
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
          spacing: { after: 400 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: `Генеральный директор\n${generalContractor.name_short}`, bold: true, size: 19 }),
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
 * 3. Генерация Доверенности на получение ТМЦ (по форме М-2)
 */
export async function generatePowerOfAttorney({
  task,
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
  const supplierName = supplier.name || 'ТД ТЕЛЕКОМ-СНАБ / Транспортная компания';

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1134, right: 850, bottom: 1134, left: 1417 } }
      },
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: `${generalContractor.name_full}`, bold: true, size: 20 }),
            new TextRun({ text: `\nИНН ${generalContractor.inn}, Адрес: ${generalContractor.address_legal}`, size: 16 })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `ДОВЕРЕННОСТЬ № ${num}`, bold: true, size: 26 }),
            new TextRun({ text: `\nДата выдачи: ${issueDate}. Действительна до: ${validUntil}`, size: 18 })
          ],
          spacing: { before: 200, after: 250 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `${generalContractor.name_full} уполномочивает специалиста: `, size: 19 }),
            new TextRun({ text: `${specialist.full_name || 'Монтажник'}`, bold: true, size: 20 }),
            new TextRun({
              text: `\nПаспорт: ${specialist.passport_series_number || 'серия ____ № ______'}, выдан ${specialist.passport_issued_by || '____________________'} от ${specialist.passport_issue_date || '________'},`,
              size: 18
            }),
            new TextRun({
              text: `\nполучить у: ${supplierName}`,
              bold: true,
              size: 19
            }),
            new TextRun({
              text: ` материальные ценности по Заявке № ${task.id || '—'} (Объект: ${task.address || '—'}) согласно спецификации:`,
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
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Материальные ценности (ТМЦ)', bold: true, size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Ед.', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Кол-во (прописью)', bold: true, size: 18 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '1', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Кабель UTP 4 пары Cat.5e Cu (бухты)', size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'м', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '305 (Триста пять)', size: 18 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '2', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Модули Keystone RJ-45, лицевые панели, коробки', size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'компл', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '1 (Один)', size: 18 })] })
              ]
            })
          ]
        }),

        new Paragraph({ text: '', spacing: { after: 300 } }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Подпись лица, получившего доверенность: _________________ удостоверяю.', size: 19 })
          ],
          spacing: { after: 200 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Генеральный директор ${generalContractor.name_short}: _________________ / ${generalContractor.director} /\nГлавный бухгалтер: _________________ / М.П.`, size: 19 })
          ]
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

/**
 * 4. Сопроводительный реестр передачи исполнительной документации (Реестр ИД)
 */
export async function generateIdRegistry({
  task,
  generalContractor = DEFAULT_GENERAL_CONTRACTOR,
  registryNumber = null
}) {
  const num = registryNumber || `РИД-${task.id || '01'}`;
  const dateStr = formatDateRu(new Date());

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1134, right: 850, bottom: 1134, left: 1417 } }
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `СОПРОВОДИТЕЛЬНЫЙ РЕЕСТР ПЕРЕДАЧИ\nИСПОЛНИТЕЛЬНОЙ ДОКУМЕНТАЦИИ № ${num}`, bold: true, size: 24 }),
            new TextRun({ text: `\nк Заявке № ${task.id || '—'} от ${formatDateRu(task.date_zayavki || new Date())}`, size: 19 })
          ],
          spacing: { after: 300 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Объект: `, bold: true, size: 20 }),
            new TextRun({ text: `${task.address || '—'} (ВСП: ${task.vsp || '—'}, ГОСБ: ${task.gosb || '—'})`, size: 20 }),
            new TextRun({ text: `\nЗаказчик: `, bold: true, size: 20 }),
            new TextRun({ text: `${task.customer || 'ПАО Сбербанк'}`, size: 20 }),
            new TextRun({ text: `\nГенподрядчик: `, bold: true, size: 20 }),
            new TextRun({ text: `${generalContractor.name_full}`, size: 20 })
          ],
          spacing: { after: 250 }
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Наименование передаваемого документа / раздела ИД', bold: true, size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Формат / Кол-во', bold: true, size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Примечание', bold: true, size: 18 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '1', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Титульный лист и ведомость исполнительной документации', size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'PDF / 1 экз.', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Подписано ЭЦП', size: 18 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '2', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'План размещения рабочих мест и трасс прокладки кабеля (СКС)', size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'PDF, DWG', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Исполнительная схема', size: 18 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '3', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Кабельный журнал и таблица кроссировок портов', size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'XLSX / PDF', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'По типовой форме Заказчика', size: 18 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '4', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Протоколы измерений и тестирования линий (Fluke Networks)', size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'PDF / 1 экз.', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Cat.5e PASS', size: 18 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '5', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Фотоотчет выполненных работ (узлы, розетки, телеком-шкаф)', size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'PDF-альбом', size: 18, alignment: AlignmentType.CENTER })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'В цвете, с маркировкой', size: 18 })] })
              ]
            })
          ]
        }),

        new Paragraph({ text: '', spacing: { after: 300 } }),
        new Paragraph({
          children: [
            new TextRun({ text: `СДАЛ (От Генподрядчика):\nИнженер / Руководитель проектов: _________________ / ${generalContractor.director} /\nДата: ${dateStr}`, size: 19 }),
            new TextRun({ text: '\n\n' }),
            new TextRun({ text: `ПРИНЯЛ (От Заказчика):\nКуратор / Представитель ПАО Сбербанк: _________________ / _________________ /\nДата: «___» ________ 202_ г.`, size: 19 })
          ]
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}


/**
 * 5. Генерация Договора подряда (Генеральный)
 */
export async function generateContract({
  contractor,
  generalContractor = DEFAULT_GENERAL_CONTRACTOR,
  date = new Date()
}) {
  const docNum = contractor.contract_number || '_______';
  
  const doc = new Document({
    creator: 'StockEasy AI',
    title: 'Договор подряда',
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: 'ДОГОВОР ПОДРЯДА № ' + docNum, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({ text: 'г. Санкт-Петербург', bold: true }),
            new TextRun({ text: '\t\t\t\t\t\t\t\t\t' }),
            new TextRun({ text: formatDateRu(date), bold: true })
          ],
          spacing: { after: 300 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: generalContractor.name_full + ', именуемое в дальнейшем «Генподрядчик», в лице Генерального директора ' + generalContractor.director + ', действующего на основании Устава, с одной стороны, и ', size: 24 }),
            new TextRun({ text: (contractor.name_full || contractor.name_short || '_____________________') + ', именуемое в дальнейшем «Субподрядчик», в лице ' + (contractor.director || '_________________') + ', действующего на основании Устава, с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:', size: 24 })
          ],
          spacing: { after: 300 }
        }),
        new Paragraph({ text: '1. ПРЕДМЕТ ДОГОВОРА', bold: true, size: 24, spacing: { after: 150 } }),
        new Paragraph({ text: '1.1. Субподрядчик обязуется по заданию Генподрядчика выполнить работы (оказать услуги), а Генподрядчик обязуется принять и оплатить результаты работ на условиях, предусмотренных настоящим Договором и Приложениями (Заказ-нарядами) к нему.', size: 24, spacing: { after: 150 } }),
        new Paragraph({ text: '1.2. Виды, объем, стоимость, адреса объектов и сроки выполнения работ согласовываются Сторонами в Приложениях (Заказ-нарядах), которые являются неотъемлемой частью Договора.', size: 24, spacing: { after: 300 } }),
        
        new Paragraph({ text: '2. ПРАВА И ОБЯЗАННОСТИ СТОРОН', bold: true, size: 24, spacing: { after: 150 } }),
        new Paragraph({ text: '2.1. Субподрядчик обязан качественно и в срок выполнить работы в соответствии с требованиями строительных норм и правил.', size: 24, spacing: { after: 150 } }),
        new Paragraph({ text: '2.2. Генподрядчик обязан обеспечить Субподрядчика необходимыми материалами (согласно акту-приема передачи ТМЦ) и своевременно оплатить выполненные работы на основании Актов о приемке выполненных работ.', size: 24, spacing: { after: 300 } }),

        new Paragraph({ text: '3. СТОИМОСТЬ И ПОРЯДОК РАСЧЕТОВ', bold: true, size: 24, spacing: { after: 150 } }),
        new Paragraph({ text: '3.1. Оплата производится Генподрядчиком путем перечисления денежных средств на расчетный счет Субподрядчика в течение 5 (пяти) банковских дней после подписания Сторонами Акта выполненных работ и получения Счета на оплату.', size: 24, spacing: { after: 300 } }),

        new Paragraph({ text: '8. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН', bold: true, size: 24, spacing: { after: 200 } }),
        
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
                    new Paragraph({ text: 'ГЕНПОДРЯДЧИК:', bold: true, size: 20 }),
                    new Paragraph({ text: generalContractor.name_full, size: 20 }),
                    new Paragraph({ text: 'ИНН: ' + generalContractor.inn + ' КПП: ' + generalContractor.kpp, size: 20 }),
                    new Paragraph({ text: 'Юр. адрес: ' + generalContractor.address_legal, size: 20 }),
                    new Paragraph({ text: 'Р/с: ' + generalContractor.account_pay, size: 20 }),
                    new Paragraph({ text: 'БИК: ' + generalContractor.bik, size: 20 }),
                    new Paragraph({ text: '\nМ.П. _________________ / ' + generalContractor.director + ' /', size: 20 })
                  ]
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: { top: BORDER_SOLID },
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'СУБПОДРЯДЧИК:', bold: true, size: 20 }),
                    new Paragraph({ text: contractor.name_full || contractor.name_short || '___________________', size: 20 }),
                    new Paragraph({ text: 'ИНН: ' + (contractor.inn || '_______') + ' КПП: ' + (contractor.kpp || '_______'), size: 20 }),
                    new Paragraph({ text: 'Юр. адрес: ' + (contractor.address_legal || '_________________'), size: 20 }),
                    new Paragraph({ text: 'Р/с: ' + (contractor.account_pay || '_________________'), size: 20 }),
                    new Paragraph({ text: 'БИК: ' + (contractor.bik || '_________'), size: 20 }),
                    new Paragraph({ text: '\nМ.П. _________________ / ' + (contractor.director || '_________________') + ' /', size: 20 })
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
 * 6. Генерация Акта выполненных работ (КС-2)
 */
export async function generateCompletionAct({
  task,
  contractor,
  subcontract,
  generalContractor = DEFAULT_GENERAL_CONTRACTOR,
  date = new Date()
}) {
  const docNum = subcontract.id || '1';
  const price = Number(subcontract.price || 0) || Number(task.price_per_unit || 0);
  const qty = Number(task.fact || task.in_order || 1);
  const total = price * qty;
  
  const doc = new Document({
    creator: 'StockEasy AI',
    title: 'Акт выполненных работ',
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: 'АКТ № ' + docNum + ' сдачи-приемки выполненных работ', heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
        new Paragraph({ text: 'по Договору № ' + (contractor.contract_number || '____') + ' от ' + formatDateRu(contractor.created_at || new Date()), alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
        
        new Paragraph({
          children: [
            new TextRun({ text: 'г. Санкт-Петербург', bold: true }),
            new TextRun({ text: '\t\t\t\t\t\t\t\t\t' }),
            new TextRun({ text: formatDateRu(date), bold: true })
          ],
          spacing: { after: 300 }
        }),

        new Paragraph({ text: 'Мы, нижеподписавшиеся, представитель Генподрядчика в лице ' + generalContractor.director + ', с одной стороны, и представитель Субподрядчика в лице ' + (contractor.director || '___________') + ', с другой стороны, составили настоящий акт о том, что Субподрядчик выполнил, а Генподрядчик принял следующие работы на объекте: ' + (task.address || '________________'), size: 24, spacing: { after: 200 } }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Наименование работ', bold: true, size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Кол-во', bold: true, size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Цена, руб.', bold: true, size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Сумма, руб.', bold: true, size: 20 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '1', size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: (task.work_type || 'Монтажные работы'), size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: String(qty), size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: formatMoney(price), size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: formatMoney(total), size: 20 })] })
              ]
            })
          ]
        }),

        new Paragraph({ text: 'ИТОГО К ОПЛАТЕ: ' + formatMoney(total) + ' (Без НДС)', bold: true, size: 24, spacing: { before: 200, after: 200 } }),
        new Paragraph({ text: 'Работы выполнены в полном объеме, в установленные сроки и с надлежащим качеством. Стороны претензий друг к другу не имеют.', size: 24, spacing: { after: 400 } }),
        
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
                    new Paragraph({ text: 'РАБОТЫ ПРИНЯЛ:', bold: true, size: 20 }),
                    new Paragraph({ text: '\nМ.П. _________________ / ' + generalContractor.director + ' /', size: 20 })
                  ]
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: { top: BORDER_SOLID },
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'РАБОТЫ СДАЛ:', bold: true, size: 20 }),
                    new Paragraph({ text: '\nМ.П. _________________ / ' + (contractor.director || '_________________') + ' /', size: 20 })
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
 */
export async function generateInvoice({
  task,
  contractor,
  subcontract,
  generalContractor = DEFAULT_GENERAL_CONTRACTOR,
  date = new Date()
}) {
  const docNum = subcontract.id || '1';
  const price = Number(subcontract.price || 0) || Number(task.price_per_unit || 0);
  const qty = Number(task.fact || task.in_order || 1);
  const total = price * qty;
  
  const doc = new Document({
    creator: 'StockEasy AI',
    title: 'Счет на оплату',
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: contractor.name_full || contractor.name_short || 'Субподрядчик', bold: true, size: 24 }),
            new TextRun({ text: '\nИНН ' + (contractor.inn || '_______') + ', КПП ' + (contractor.kpp || '_______'), size: 20 }),
            new TextRun({ text: '\nЮридический адрес: ' + (contractor.address_legal || '_________________'), size: 20 }),
            new TextRun({ text: '\nБанковские реквизиты: Р/с ' + (contractor.account_pay || '_______') + ' БИК ' + (contractor.bik || '_______'), size: 20 })
          ],
          spacing: { after: 400 }
        }),
        new Paragraph({ text: 'СЧЕТ НА ОПЛАТУ № ' + docNum + ' от ' + formatDateRu(date), heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
        
        new Paragraph({ text: 'Поставщик: ' + (contractor.name_full || contractor.name_short || 'Субподрядчик'), size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: 'Покупатель: ' + generalContractor.name_full + ' (ИНН: ' + generalContractor.inn + ')', size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: 'Основание: Договор № ' + (contractor.contract_number || '____') + ', Заявка № ' + task.id, size: 20, spacing: { after: 300 } }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Наименование работ (услуг)', bold: true, size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Кол-во', bold: true, size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Ед.', bold: true, size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Цена', bold: true, size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Сумма', bold: true, size: 20 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '1', size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Выполнение работ на объекте: ' + (task.address || ''), size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: String(qty), size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'шт.', size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: formatMoney(price), size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: formatMoney(total), size: 20 })] })
              ]
            })
          ]
        }),

        new Paragraph({ text: 'Итого: ' + formatMoney(total), bold: true, alignment: AlignmentType.RIGHT, size: 24, spacing: { before: 200, after: 100 } }),
        new Paragraph({ text: 'Без налога (НДС)', bold: true, alignment: AlignmentType.RIGHT, size: 20, spacing: { after: 100 } }),
        new Paragraph({ text: 'Всего к оплате: ' + formatMoney(total), bold: true, alignment: AlignmentType.RIGHT, size: 24, spacing: { after: 400 } }),
        
        new Paragraph({ text: 'Руководитель _________________ / ' + (contractor.director || '___________') + ' /', size: 20, spacing: { after: 300 } }),
        new Paragraph({ text: 'Бухгалтер    _________________ / ' + (contractor.director || '___________') + ' /', size: 20 })
      ]
    }]
  });
  return await Packer.toBuffer(doc);
}

/**
 * 8. Генерация Накладной (Акт передачи ТМЦ)
 */
export async function generateTmcAct({
  task,
  contractor,
  subcontract,
  date = new Date()
}) {
  const docNum = subcontract.id || '1';
  
  const doc = new Document({
    creator: 'StockEasy AI',
    title: 'Накладная на выдачу ТМЦ',
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: 'НАКЛАДНАЯ (АКТ) ПРИЕМА-ПЕРЕДАЧИ ТМЦ № ' + docNum, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({ text: 'г. Санкт-Петербург', bold: true }),
            new TextRun({ text: '\t\t\t\t\t\t\t\t\t' }),
            new TextRun({ text: formatDateRu(date), bold: true })
          ],
          spacing: { after: 300 }
        }),
        new Paragraph({ text: 'Основание: Заявка № ' + task.id + ' на объект: ' + (task.address || ''), size: 20, spacing: { after: 200 } }),
        new Paragraph({ text: 'Мы, нижеподписавшиеся, Кладовщик (Склад) с одной стороны и представитель Подрядчика (' + (contractor.name_short || '___________') + ') ' + (subcontract.installer_fio || '') + ' с другой стороны, составили настоящий акт о том, что первый сдал, а второй принял следующие товарно-материальные ценности (ТМЦ):', size: 20, spacing: { after: 200 } }),
        
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '№', bold: true, size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Наименование ТМЦ', bold: true, size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Ед. изм.', bold: true, size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Кол-во', bold: true, size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Примечание', bold: true, size: 20 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '1', size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Кабель UTP / ВОЛС', size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'м', size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '___', size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '', size: 20 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '2', size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Расходные материалы (крепеж, розетки)', size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'компл', size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '___', size: 20 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: '', size: 20 })] })
              ]
            })
          ]
        }),

        new Paragraph({ text: '\nТМЦ переданы в исправном состоянии, претензий не имеется.', size: 20, spacing: { before: 200, after: 300 } }),
        
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
                    new Paragraph({ text: 'СДАЛ (СКЛАД):', bold: true, size: 20 }),
                    new Paragraph({ text: '\n_________________ / _______________ /', size: 20 })
                  ]
                }),
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: { top: BORDER_SOLID },
                  margins: CELL_PADDING,
                  children: [
                    new Paragraph({ text: 'ПРИНЯЛ (ПОДРЯДЧИК):', bold: true, size: 20 }),
                    new Paragraph({ text: '\n_________________ / ' + (subcontract.installer_fio || '_______________') + ' /', size: 20 })
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
