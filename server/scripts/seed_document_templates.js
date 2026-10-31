// server/scripts/seed_document_templates.js
// Сидирование типовых эталонных шаблонов документов Stockeasy
import { pool } from '../config/db.js';

const SYSTEM_TEMPLATES = [
  {
    code: 'order_subcontract',
    name: 'Заказ-наряд на объект (Приложение № 1)',
    category: 'orders',
    doc_format: 'word',
    description: 'Официальный заказ-наряд на СМР по конкретному отделению/объекту с таблицей объемов и расценок.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:13px;line-height:1.35;color:#000">
  <div style="text-align:right;font-size:12px;margin-bottom:15px">
    Приложение № 1<br/>
    к Договору субподряда № {{подрядчик_номер_договора_или_бн}}<br/>
    от {{подрядчик_дата_договора_или_бн}}
  </div>

  <div style="text-align:center;font-weight:700;font-size:16px;margin-bottom:4px">
    ЗАКАЗ-НАРЯД № {{номер_документа}}
  </div>
  <div style="text-align:center;font-size:13px;margin-bottom:15px">
    на выполнение строительно-монтажных и пусконаладочных работ СКС
  </div>

  <div style="display:flex;justify-content:space-between;margin-bottom:15px;font-size:13px">
    <div><b>Место составления:</b> {{город}}</div>
    <div><b>Дата:</b> {{дата_документа}}</div>
  </div>

  <p style="text-align:justify;margin:0 0 10px 0;text-indent:25px">
    <b>Заказчик (Генподрядчик):</b> {{наша_организация_полная}}, в лице Генерального директора {{наш_директор}}, действующего на основании Устава, с одной стороны, и
  </p>
  <p style="text-align:justify;margin:0 0 12px 0;text-indent:25px">
    <b>Подрядчик (Субподрядчик):</b> {{подрядчик_наименование_полное}}, в лице {{подрядчик_директор}}, действующего на основании свидетельства/Устава, с другой стороны,
    согласовали настоящее Задание и сметную стоимость работ по объекту:
  </p>

  <div style="background:#f9fafb;border:1px solid #d1d5db;padding:8px 12px;margin-bottom:12px;font-size:13px">
    <div><b>Наименование / Номер объекта:</b> {{тип_объекта}} № {{номер_всп}}</div>
    <div><b>Адрес выполнения работ:</b> {{адрес_объекта}}</div>
    <div><b>Конечный срок выполнения работ:</b> {{срок_выполнения}} (включительно)</div>
    <div><b>Идентификатор закупки / ИКЗ:</b> {{идентификатор_закупки}}</div>
  </div>

  <div style="font-weight:700;margin:12px 0 6px 0">1. Перечень, объемы и договорная стоимость работ:</div>
  {{таблица_работ}}

  <p style="text-align:justify;margin:8px 0;text-indent:25px">
    Общая стоимость работ по настоящему Заказ-наряду составляет <b>{{сумма}}</b> ({{сумма_прописью}}), {{ндс_инфо}}.
  </p>

  <div style="font-weight:700;margin:12px 0 6px 0">2. Дополнительные условия:</div>
  <ol style="margin:0;padding-left:22px;text-align:justify">
    <li style="margin-bottom:4px">Подрядчик обязуется выполнить работы в строгом соответствии с требованиями ПТЭЭП, СНиП, отраслевыми стандартами Заказчика и правилами пожарной безопасности.</li>
    <li style="margin-bottom:4px">Приемка выполненных работ оформляется двусторонним Актом сдачи-приемки выполненных работ и предоставлением комплекта исполнительной документации (ИД).</li>
    <li style="margin-bottom:4px">Гарантийный срок на выполненные монтажные работы составляет 24 (двадцать четыре) месяца с даты подписания Акта приемки.</li>
  </ol>

  {{блок_подписей}}
</div>
    `
  },
  {
    code: 'order_app2',
    name: 'Заявка на объект (Приложение № 2)',
    category: 'orders',
    doc_format: 'word',
    description: 'Форма официальной заявки заказчика на выезд и проведение комплекса монтажных работ.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:13px;line-height:1.35;color:#000">
  <div style="text-align:right;font-size:12px;margin-bottom:15px">
    Приложение № 2<br/>
    к Контракту № {{номер_контракта}} от {{дата_контракта}}
  </div>

  <div style="text-align:center;font-weight:700;font-size:16px;margin-bottom:4px">
    ЗАЯВКА НА ВЫПОЛНЕНИЕ РАБОТ № {{номер_заявки}}
  </div>
  <div style="text-align:center;font-size:13px;margin-bottom:15px">
    по объекту {{наш_заказчик}}
  </div>

  <div style="display:flex;justify-content:space-between;margin-bottom:15px;font-size:13px">
    <div><b>Дата формирования:</b> {{дата_документа}}</div>
    <div><b>Срок выполнения:</b> {{срок_выполнения}}</div>
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:15px;border:1px solid #000">
    <tr>
      <td style="border:1px solid #000;padding:6px;width:30%;background:#f3f4f6;font-weight:700">Заказчик</td>
      <td style="border:1px solid #000;padding:6px">${'{{наш_заказчик}}'}</td>
    </tr>
    <tr>
      <td style="border:1px solid #000;padding:6px;background:#f3f4f6;font-weight:700">Исполнитель</td>
      <td style="border:1px solid #000;padding:6px">${'{{наша_организация_полная}}'}</td>
    </tr>
    <tr>
      <td style="border:1px solid #000;padding:6px;background:#f3f4f6;font-weight:700">Объект / Номер ВСП</td>
      <td style="border:1px solid #000;padding:6px">${'{{тип_объекта}} № {{номер_всп}}'}</td>
    </tr>
    <tr>
      <td style="border:1px solid #000;padding:6px;background:#f3f4f6;font-weight:700">Адрес объекта</td>
      <td style="border:1px solid #000;padding:6px">${'{{адрес_объекта}}'}</td>
    </tr>
    <tr>
      <td style="border:1px solid #000;padding:6px;background:#f3f4f6;font-weight:700">Вид выполняемых работ</td>
      <td style="border:1px solid #000;padding:6px">${'{{вид_работ}}'}</td>
    </tr>
    <tr>
      <td style="border:1px solid #000;padding:6px;background:#f3f4f6;font-weight:700">Идентификатор закупки (ИКЗ)</td>
      <td style="border:1px solid #000;padding:6px">${'{{идентификатор_закупки}}'}</td>
    </tr>
  </table>

  <div style="font-weight:700;margin:12px 0 6px 0">Спецификация заявки:</div>
  {{таблица_работ}}

  <div style="margin-top:20px;display:flex;justify-content:space-between;font-size:13px">
    <div>
      Заявку сформировал:<br/><br/>
      __________________ / __________________ /
    </div>
    <div>
      Заявку принял к исполнению:<br/><br/>
      __________________ / __________________ /
    </div>
  </div>
</div>
    `
  },
  {
    code: 'permit_letter',
    name: 'Письмо на допуск специалистов на объект',
    category: 'orders',
    doc_format: 'word',
    description: 'Официальное письмо заказчику/службе безопасности для оформления пропусков на объект монтажников.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:13px;line-height:1.35;color:#000">
  <div style="display:flex;justify-content:space-between;margin-bottom:20px">
    <div style="font-size:12px">
      <b>{{наша_организация_полная}}</b><br/>
      ИНН: {{наш_инн}} / КПП: {{наш_кпп}}<br/>
      {{наш_адрес}}<br/>
      Тел: {{наш_телефон}}
    </div>
    <div style="text-align:right;font-size:13px;width:45%">
      <b>Руководителю подразделения безопасности / Администрации объекта</b><br/>
      {{наш_заказчик}}<br/>
      Объект: {{тип_объекта}} № {{номер_всп}}<br/>
      {{адрес_объекта}}
    </div>
  </div>

  <div style="margin-bottom:15px;font-size:12px">
    Исх. № <b>ИСХ-{{номер_заявки}}-ДОП</b> от <b>{{текущая_дата}}</b>
  </div>

  <div style="text-align:center;font-weight:700;font-size:15px;margin-bottom:15px">
    ПИСЬМО НА ДОПУСК СПЕЦИАЛИСТОВ ДЛЯ ПРОИЗВОДСТВА РАБОТ
  </div>

  <p style="text-align:justify;text-indent:25px;margin:0 0 10px 0">
    В рамках исполнения обязательств по Контракту № {{номер_контракта}} от {{дата_контракта}} просим Вас оформить допуск на объект
    <b>{{тип_объекта}} № {{номер_всп}}</b>, расположенный по адресу: <b>{{адрес_объекта}}</b>,
    следующим сотрудникам и автотранспорту для проведения строительно-монтажных и пусконаладочных работ в период с <b>{{дата_документа}}</b> по <b>{{срок_выполнения}}</b>:
  </p>

  {{таблица_специалистов}}

  <p style="text-align:justify;text-indent:25px;margin:10px 0">
    Сотрудники ознакомлены с правилами техники безопасности, пожарной безопасности и внутренним распорядком объекта.
    Сотрудники обеспечены необходимыми средствами индивидуальной защиты (СИЗ), исправным сертифицированным инструментом и измерительными приборами.
  </p>

  <p style="margin-top:25px">
    <b>{{наш_директор_должность}} {{наша_организация}}</b><br/><br/>
    _____________________ / {{наш_директор}} /<br/>
    <span style="font-size:11px;color:#666">М.П.</span>
  </p>
</div>
    `
  },
  {
    code: 'hazardous_permit',
    name: 'Наряд-допуск на работы повышенной опасности',
    category: 'orders',
    doc_format: 'word',
    description: 'Официальный наряд-допуск при высотных работах, сверлении перекрытий или прокладке кабеля за подвесными потолками.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:12px;line-height:1.3;color:#000">
  <div style="text-align:center;font-weight:700;font-size:15px;margin-bottom:2px">
    НАРЯД-ДОПУСК № НД-{{номер_заявки}}
  </div>
  <div style="text-align:center;font-weight:700;font-size:13px;margin-bottom:12px">
    на производство работ повышенной опасности
  </div>

  <div style="margin-bottom:10px">
    <b>1. Организация:</b> {{наша_организация_полная}}<br/>
    <b>2. Подразделение / Объект:</b> {{тип_объекта}} № {{номер_всп}}, {{адрес_объекта}}<br/>
    <b>3. Производитель работ:</b> {{фио_монтажника}} (тел. {{телефон_монтажника}})<br/>
    <b>4. Состав бригады:</b>
  </div>

  {{таблица_специалистов}}

  <div style="margin:10px 0">
    <b>5. Поручается выполнить:</b> Комплекс работ по прокладке кабельных трасс СКС, сверлению проходок, установке патч-панелей и розеточных модулей.<br/>
    <b>6. Место проведения:</b> Рабочие зоны объекта, запотолочное пространство, слаботочные серверные шкафы.<br/>
    <b>7. Срок действия наряда:</b> С {{дата_документа}} по {{срок_выполнения}}.<br/>
    <b>8. Мероприятия по безопасности до начала работ:</b>
    <ul style="margin:4px 0;padding-left:20px">
      <li>Проверить отсутствие скрытой электропроводки в зонах сверления;</li>
      <li>Использовать испытанные стремянки с нескользящими башмаками и защитные каски;</li>
      <li>Оградить опасную зону сигнальной лентой при работах на высоте.</li>
    </ul>
  </div>

  <div style="margin-top:20px;display:flex;justify-content:space-between">
    <div style="width:48%">
      <b>Наряд выдал (Ответственный за ТБ):</b><br/><br/>
      _________________ / _________________ /
    </div>
    <div style="width:48%">
      <b>Инструктаж прослушал и наряд принял:</b><br/><br/>
      _________________ / {{фио_монтажника}} /
    </div>
  </div>
</div>
    `
  },
  {
    code: 'completion_act',
    name: 'Акт сдачи-приемки («Сдал/Принял»)',
    category: 'closing',
    doc_format: 'word',
    description: 'Двусторонний акт сдачи-приемки выполненных строительно-монтажных работ подрядчика.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:13px;line-height:1.35;color:#000">
  <div style="text-align:center;font-weight:700;font-size:16px;margin-bottom:4px">
    АКТ № {{номер_документа}}
  </div>
  <div style="text-align:center;font-weight:700;font-size:13px;margin-bottom:12px">
    сдачи-приемки выполненных строительно-монтажных работ
  </div>

  <div style="display:flex;justify-content:space-between;margin-bottom:15px;font-size:13px">
    <div><b>Место составления:</b> {{город}}</div>
    <div><b>Дата подписания:</b> {{дата_документа}}</div>
  </div>

  <p style="text-align:justify;margin:0 0 10px 0;text-indent:25px">
    Мы, нижеподписавшиеся, представитель <b>Заказчика</b> — {{наша_организация_полная}}, в лице Генерального директора {{наш_директор}}, с одной стороны, и
    представитель <b>Подрядчика</b> — {{подрядчик_наименование_полное}}, в лице {{подрядчик_директор}}, с другой стороны,
    составили настоящий Акт о нижеследующем:
  </p>

  <p style="text-align:justify;margin:0 0 10px 0;text-indent:25px">
    1. Подрядчиком в полном объеме и надлежащим образом выполнены строительно-монтажные работы по объекту:
    <b>{{тип_объекта}} № {{номер_всп}}</b>, расположенному по адресу: <b>{{адрес_объекта}}</b>, согласно Заказ-наряду № {{номер_заявки}}.
  </p>

  <div style="font-weight:700;margin:12px 0 6px 0">2. Объемы и перечень фактически выполненных работ:</div>
  {{таблица_работ}}

  <p style="text-align:justify;margin:10px 0;text-indent:25px">
    3. Общая стоимость выполненных и принятых работ составляет <b>{{сумма}}</b> ({{сумма_прописью}}), {{ндс_инфо}}.
  </p>
  <p style="text-align:justify;margin:10px 0;text-indent:25px">
    4. Работы выполнены в полном объеме, в установленные сроки и с надлежащим качеством. Исполнительная документация и протоколы тестирования переданы Заказчику.
    Претензий по объему, качеству и срокам выполнения работ Заказчик к Подрядчику не имеет.
  </p>

  {{блок_подписей}}
</div>
    `
  },
  {
    code: 'subcontract_agreement',
    name: 'Договор субподряда на выполнение СМР',
    category: 'contracts',
    doc_format: 'word',
    description: 'Полный договор субподряда между генподрядчиком и подрядчиком с предметом, порядком расчетов и ответственностью.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:13px;line-height:1.35;color:#000">
  <div style="text-align:center;font-weight:700;font-size:16px;margin-bottom:4px">
    ДОГОВОР СУБПОДРЯДА № {{номер_документа}}
  </div>
  <div style="text-align:center;font-size:13px;margin-bottom:15px">
    на выполнение комплекса строительно-монтажных работ
  </div>

  <div style="display:flex;justify-content:space-between;margin-bottom:15px;font-size:13px">
    <div><b>{{город}}</b></div>
    <div><b>{{дата_документа_прописью}}</b></div>
  </div>

  <p style="text-align:justify;text-indent:25px;margin:0 0 10px 0">
    <b>{{наша_организация_полная}}</b>, именуемое в дальнейшем «Генподрядчик», в лице {{наш_директор_должность}} {{наш_директор}}, действующего на основании Устава, с одной стороны, и
  </p>
  <p style="text-align:justify;text-indent:25px;margin:0 0 15px 0">
    <b>{{подрядчик_наименование_полное}}</b>, именуемый в дальнейшем «Субподрядчик», в лице {{подрядчик_директор}}, действующего на основании свидетельства/Устава, с другой стороны,
    совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:
  </p>

  <div style="font-weight:700;margin:10px 0 4px 0">1. ПРЕДМЕТ ДОГОВОРА</div>
  <p style="text-align:justify;text-indent:25px;margin:0 0 8px 0">
    1.1. Субподрядчик обязуется по заданию Генподрядчика выполнить комплекс строительно-монтажных и пусконаладочных работ структурированных кабельных систем (СКС) на объекте:
    <b>{{тип_объекта}} № {{номер_всп}}</b>, расположенном по адресу: <b>{{адрес_объекта}}</b>, а Генподрядчик обязуется принять результат работ и оплатить его.
  </p>
  <p style="text-align:justify;text-indent:25px;margin:0 0 8px 0">
    1.2. Конкретные объемы, спецификация и расценки определяются Сторонами в Заказ-наряде (Приложении № 1 к настоящему Договору).
  </p>

  <div style="font-weight:700;margin:10px 0 4px 0">2. СРОКИ И СТОИМОСТЬ РАБОТ</div>
  <p style="text-align:justify;text-indent:25px;margin:0 0 8px 0">
    2.1. Срок выполнения работ: до <b>{{срок_выполнения}}</b> включительно.
  </p>
  <p style="text-align:justify;text-indent:25px;margin:0 0 8px 0">
    2.2. Договорная цена работ составляет <b>{{сумма}}</b> ({{сумма_прописью}}), {{ндс_инфо}}.
  </p>

  <div style="font-weight:700;margin:10px 0 4px 0">3. ПОРЯДОК СДАЧИ И ПРИЕМКИ РАБОТ</div>
  <p style="text-align:justify;text-indent:25px;margin:0 0 8px 0">
    3.1. Сдача работ оформляется двусторонним Актом сдачи-приемки при условии предоставления качественного фотоотчета и комплекта исполнительной документации (ИД).
  </p>
  <p style="text-align:justify;text-indent:25px;margin:0 0 8px 0">
    3.2. Оплата производится в безналичном порядке в течение 5 (пяти) банковских дней с момента подписания Акта приемки работ.
  </p>

  {{блок_подписей}}
</div>
    `
  },
  {
    code: 'invoice',
    name: 'Счет на оплату услуг / работ',
    category: 'closing',
    doc_format: 'word',
    description: 'Счет на оплату с банковскими реквизитами и таблицей назначений платежа.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:13px;line-height:1.35;color:#000">
  <div style="border:1px solid #000;margin-bottom:15px;font-size:12px">
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="border:1px solid #000;padding:6px;width:60%" colspan="2">
          Банк получателя: <b>{{подрядчик_банк}}</b>
        </td>
        <td style="border:1px solid #000;padding:6px;width:15%">БИК</td>
        <td style="border:1px solid #000;padding:6px;width:25%"><b>{{подрядчик_бик}}</b></td>
      </tr>
      <tr>
        <td style="border:1px solid #000;padding:6px" colspan="2">
          Получатель: <b>{{подрядчик_наименование_полное}}</b>
        </td>
        <td style="border:1px solid #000;padding:6px">Сч. №</td>
        <td style="border:1px solid #000;padding:6px"><b>{{подрядчик_расчетный_счет}}</b></td>
      </tr>
      <tr>
        <td style="border:1px solid #000;padding:6px;width:30%">ИНН: <b>{{подрядчик_инн}}</b></td>
        <td style="border:1px solid #000;padding:6px;width:30%">КПП: <b>{{подрядчик_кпп}}</b></td>
        <td style="border:1px solid #000;padding:6px">Корр. сч.</td>
        <td style="border:1px solid #000;padding:6px"><b>{{подрядчик_корр_счет}}</b></td>
      </tr>
    </table>
  </div>

  <div style="font-weight:700;font-size:16px;margin:20px 0 10px 0;border-bottom:2px solid #000;padding-bottom:6px">
    Счет на оплату № {{номер_документа}} от {{дата_документа}}
  </div>

  <div style="margin-bottom:15px;font-size:13px">
    <b>Плательщик:</b> {{наша_организация_полная}}, ИНН {{наш_инн}}, КПП {{наш_кпп}}, {{наш_адрес}}<br/>
    <b>Основание:</b> Заказ-наряд № {{номер_заявки}} по объекту {{тип_объекта}} № {{номер_всп}} ({{адрес_объекта}})
  </div>

  {{таблица_работ}}

  <div style="margin:15px 0;font-size:13px">
    Всего к оплате: <b>{{сумма}}</b><br/>
    Сумма прописью: <b>{{сумма_прописью}}</b>, {{ндс_инфо}}.
  </div>

  <div style="margin-top:35px;display:flex;justify-content:space-between;font-size:13px">
    <div>
      Руководитель / ИП: ___________________ / {{подрядчик_директор}} /
    </div>
    <div>
      Бухгалтер: ___________________
    </div>
  </div>
</div>
    `
  },
  {
    code: 'power_attorney',
    name: 'Доверенность на получение ТМЦ',
    category: 'orders',
    doc_format: 'word',
    description: 'Официальная доверенность монтажнику/водителю на получение оборудования и материалов со склада.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:13px;line-height:1.4;color:#000">
  <div style="text-align:center;font-weight:700;font-size:16px;margin-bottom:4px">
    ДОВЕРЕННОСТЬ № {{номер_документа}}
  </div>
  <div style="text-align:center;font-size:13px;margin-bottom:15px">
    на получение товарно-материальных ценностей
  </div>

  <div style="display:flex;justify-content:space-between;margin-bottom:15px;font-size:13px">
    <div><b>Дата выдачи:</b> {{дата_документа}}</div>
    <div><b>Действительна до:</b> {{срок_выполнения}}</div>
  </div>

  <p style="text-align:justify;text-indent:25px;margin:0 0 10px 0">
    <b>{{наша_организация_полная}}</b> (ИНН {{наш_инн}}, ОГРН {{наш_огрн}}, адрес: {{наш_адрес}}),
    в лице Генерального директора {{наш_директор}}, настоящей доверенностью уполномочивает:
  </p>

  <div style="background:#f9fafb;border:1px solid #d1d5db;padding:10px 14px;margin-bottom:15px;font-size:13px">
    <div><b>Сотрудника:</b> {{фио_монтажника}}</div>
    <div><b>Паспортные данные:</b> {{паспорт_монтажника}}</div>
    <div><b>Контактный телефон:</b> {{телефон_монтажника}}</div>
    <div><b>Автотранспорт:</b> {{госномер_авто}}</div>
  </div>

  <p style="text-align:justify;text-indent:25px;margin:0 0 10px 0">
    получать в транспортных компаниях, у поставщиков и на складах товарно-материальные ценности (кабель, патч-панели, шкафы 19", крепеж, расходные материалы),
    расписываться в накладных (УПД, ТОРГ-12) и совершать все необходимые действия, связанные с выполнением данного поручения по объекту:
    <b>{{тип_объекта}} № {{номер_всп}}</b> ({{адрес_объекта}}).
  </p>

  <div style="margin-top:30px;font-size:13px">
    Образец подписи поверенного: ______________________ / {{фио_монтажника}} / удостоверяю.<br/><br/>
    <b>{{наш_директор_должность}} {{наша_организация}}</b>: ______________________ / {{наш_директор}} /<br/>
    <span style="font-size:11px;color:#666">М.П.</span>
  </div>
</div>
    `
  },
  {
    code: 'tmc_act',
    name: 'Акт списания материалов (ТМЦ)',
    category: 'closing',
    doc_format: 'word',
    description: 'Акт списания фактически израсходованных материалов при производстве работ на объекте.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:13px;line-height:1.35;color:#000">
  <div style="text-align:center;font-weight:700;font-size:16px;margin-bottom:4px">
    АКТ СПИСАНИЯ МАТЕРИАЛОВ (ТМЦ) № {{номер_документа}}
  </div>
  <div style="text-align:center;font-size:13px;margin-bottom:15px">
    по объекту {{тип_объекта}} № {{номер_всп}} ({{адрес_объекта}})
  </div>

  <div style="display:flex;justify-content:space-between;margin-bottom:15px;font-size:13px">
    <div><b>Дата:</b> {{дата_документа}}</div>
    <div><b>Заявка:</b> № {{номер_заявки}}</div>
  </div>

  <p style="text-align:justify;text-indent:25px;margin:0 0 10px 0">
    Комиссия в составе представителя Генподрядчика {{наш_директор}} и Производителя работ {{фио_монтажника}} составила настоящий акт о том,
    что при производстве строительно-монтажных работ на объекте были израсходованы и подлежат списанию следующие материалы:
  </p>

  {{таблица_материалов}}

  <p style="margin-top:20px;text-align:justify">
    Все вышеперечисленные материалы смонтированы в полном объеме в соответствии с проектом и исполнительной схемой, претензий по качеству монтажа нет.
  </p>

  <div style="margin-top:30px;display:flex;justify-content:space-between;font-size:13px">
    <div>
      Материалы передал:<br/><br/>
      _________________ / {{наш_директор}} /
    </div>
    <div>
      Материалы израсходовал и смонтировал:<br/><br/>
      _________________ / {{фио_монтажника}} /
    </div>
  </div>
</div>
    `
  }
];

export async function seedTemplates() {
  console.log('Seeding document templates...');
  for (const t of SYSTEM_TEMPLATES) {
    await pool.query(`
      INSERT INTO document_templates (code, name, category, doc_format, description, template_html, is_system, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        doc_format = EXCLUDED.doc_format,
        description = EXCLUDED.description,
        template_html = EXCLUDED.template_html,
        is_system = true,
        updated_at = NOW()
    `, [t.code, t.name, t.category, t.doc_format, t.description, t.template_html.trim()]);
    console.log(`  ✓ Template seeded: ${t.code} (${t.name})`);
  }
}

if (process.argv[1]?.includes('seed_document_templates.js')) {
  seedTemplates()
    .then(() => {
      console.log('All system templates successfully seeded!');
      process.exit(0);
    })
    .catch(err => {
      console.error('Seeding error:', err);
      process.exit(1);
    });
}
