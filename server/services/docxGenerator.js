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
