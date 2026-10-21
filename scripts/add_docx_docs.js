import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'server', 'services', 'docxGenerator.js');
let content = fs.readFileSync(filePath, 'utf8');

const target = '/**\r\n * 3. Генерация Доверенности на получение ТМЦ';
const targetUnix = '/**\n * 3. Генерация Доверенности на получение ТМЦ';

let useUnix = false;
let splitTarget = target;
if (!content.includes(target)) {
  if (content.includes(targetUnix)) {
    useUnix = true;
    splitTarget = targetUnix;
  } else {
    console.error('Target comment not found in docxGenerator.js');
    process.exit(1);
  }
}

const addition = `/**
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
  const docNum = orderNumber || \`ЗН-ОБ-\${task.id || '01'}\`;
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
      new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: \`\${s.passport_series_number || s.passport_raw || '—'}\`, size: 17 })] }),
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
            new TextRun({ text: \`\\nИНН \${generalContractor.inn} / КПП \${generalContractor.kpp}, Тел: \${generalContractor.phone}\`, size: 17 })
          ],
          spacing: { after: 200 }
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: \`ЗАКАЗ-НАРЯД № \${docNum}\`, bold: true, size: 24 }),
            new TextRun({ text: \`\\nна производство монтажных работ на объекте\`, italics: true, size: 19 }),
            new TextRun({ text: \`\\nДата оформления: \${formatDateRu(new Date())}\`, size: 17 })
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
                new TableCell({ width: { size: 68, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: \`\${customerName} (Заявка № \${task.id || '—'}, ВСП: \${vsp || '—'}, ГОСБ: \${gosb || '—'})\`, size: 18 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Адрес объекта:', bold: true, size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: \`\${address}\`, size: 18, bold: true })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Сроки проведения работ:', bold: true, size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: \`Начало работ: \${startDate} г.  Окончание (дедлайн): \${endDate} г.\`, size: 18 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Ответственный руководитель (ПМ):', bold: true, size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: \`\${respPerson}\`, size: 18 })] })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: 'Контактное лицо на объекте:', bold: true, size: 18 })] }),
                new TableCell({ borders: CELL_BORDERS_ALL, margins: CELL_PADDING, children: [new Paragraph({ text: \`\${task.contact || 'Представитель Заказчика на объекте'}\`, size: 18 })] })
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
            new TextRun({ text: \`Вид работ: \`, bold: true, size: 19 }),
            new TextRun({ text: \`\${workTypes || task.workType || 'Строительно-монтажные и пусконаладочные работы по СКС/ЛВС, прокладка кабельных линий, установка и расключение портов'}. \`, size: 19 }),
            new TextRun({ text: \`Количество портов / объем: \`, bold: true, size: 19 }),
            new TextRun({ text: \`\${task.inOrder || task.ports || 1} ед.\\n\`, size: 19 }),
            new TextRun({ text: \`Режим и особые условия: \`, bold: true, size: 19 }),
            new TextRun({ text: \`\${instructions || task.excelComment || task.comment || 'Работы производить в согласованное с администрацией объекта время (будние дни после окончания операционного дня либо выходные дни). Соблюдать тишину и чистоту.'}\`, size: 18 })
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
            new TextRun({ text: \`Заказ-наряд выдал (ПМ / Руководитель):\\n\`, bold: true, size: 18 }),
            new TextRun({ text: \`_____________________ / \${generalContractor.director} /\\t\\t\` }),
            new TextRun({ text: \`Заказ-наряд принял (Старший бригады):\\n\`, bold: true, size: 18 }),
            new TextRun({ text: \`_____________________ / \${specRows[0]?.full_name || 'Старший монтажник'} /\` })
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
  const docNum = permitNumber || \`НД-\${task.id || '01'}\`;
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
            new TextRun({ text: \`\\nИНН \${generalContractor.inn} / КПП \${generalContractor.kpp}\`, size: 16 })
          ],
          spacing: { after: 150 }
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: \`НАРЯД-ДОПУСК № \${docNum}\`, bold: true, size: 24 }),
            new TextRun({ text: \`\\nна производство работ повышенной опасности\`, bold: true, size: 19 }),
            new TextRun({ text: \`\\nСрок действия: с \${startDate} г. по \${endDate} г.\`, italics: true, size: 18 })
          ],
          spacing: { after: 250 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: '1. Ответственному руководителю работ: ', bold: true, size: 19 }),
            new TextRun({ text: \`\${respPerson}\\n\`, size: 19 }),
            new TextRun({ text: '2. Ответственному производителю работ: ', bold: true, size: 19 }),
            new TextRun({ text: \`\${specRows[0]?.full_name || 'Старший монтажник'}\\n\`, size: 19 }),
            new TextRun({ text: '3. Место проведения работ: ', bold: true, size: 19 }),
            new TextRun({ text: \`\${customerName}, адрес: \${address}\${vsp ? \` (ВСП № \${vsp})\` : ''}\\n\`, size: 19 }),
            new TextRun({ text: '4. Содержание поручаемых работ: ', bold: true, size: 19 }),
            new TextRun({ text: \`\${task.workType || 'Монтаж кабельных трасс, высотные работы по прокладке кабель-каналов, электромонтаж оборудования СКС'}\\n\`, size: 19 })
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
            new TextRun({ text: '1) До начала работ отключить электропитание на участках монтажа вблизи силовых кабелей.\\n', size: 18 }),
            new TextRun({ text: '2) При работах на высоте использовать сертифицированные лестницы с противоскользящими упорами и пояса безопасности.\\n', size: 18 }),
            new TextRun({ text: '3) Оградить зону производства работ сигнальными ограждениями, вывесить предупреждающие плакаты.\\n', size: 18 }),
            new TextRun({ text: '4) Назначить ответственного за постоянный надзор за членами бригады во время проведения опасных операций.', size: 18 })
          ],
          spacing: { after: 300 }
        }),

        new Paragraph({
          children: [
            new TextRun({ text: \`Наряд-допуск выдал:\\t\\t\\t\\tНаряд-допуск принял:\\n\`, bold: true, size: 18 }),
            new TextRun({ text: \`___________ / \${generalContractor.director} /\\t\\t\\t___________ / \${specRows[0]?.full_name || 'Производитель'} /\` })
          ]
        })
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

`;

const eol = useUnix ? '\n' : '\r\n';
content = content.replace(splitTarget, addition + eol + eol + splitTarget);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated docxGenerator.js with access work order and hazardous work permit!');
