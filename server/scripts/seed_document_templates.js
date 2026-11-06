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
  },
  {
    code: 'poa_m2',
    name: 'Доверенность (Типовая форма № М-2)',
    category: 'orders',
    doc_format: 'word',
    description: 'Типовая межотраслевая форма № М-2 (ОКУД 0315001) с отрывным корешком, реквизитами организации, паспортом и перечнем ТМЦ.',
    template_html: `
<div class="a4-page-content poa-m2-form" style="font-family:'Times New Roman',Times,serif;font-size:11px;line-height:1.25;color:#000;box-sizing:border-box">
  
  <!-- ОТРЫВНОЙ КОРЕШОК ДОВЕРЕННОСТИ -->
  <div style="border-bottom: 2px dashed #555; padding-bottom: 12px; margin-bottom: 15px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <div style="font-weight:700;font-size:11.5px">КОРЕШОК ДОВЕРЕННОСТИ № <u>&nbsp;{{номер_доверенности}}&nbsp;</u></div>
      <div style="font-size:10px;color:#555">Линия отреза - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:6px" border="1" cellpadding="3" cellspacing="0">
      <thead>
        <tr style="background:#f3f4f6;text-align:center;font-size:9.5px">
          <th style="width:13%;border:1px solid #000">Номер доверенности</th>
          <th style="width:13%;border:1px solid #000">Дата выдачи</th>
          <th style="width:13%;border:1px solid #000">Срок действия</th>
          <th style="width:36%;border:1px solid #000">Должность и фамилия лица, которому выдана доверенность</th>
          <th style="width:25%;border:1px solid #000">Расписка в получении доверенности</th>
        </tr>
      </thead>
      <tbody>
        <tr style="text-align:center">
          <td style="border:1px solid #000;font-weight:700">{{номер_доверенности}}</td>
          <td style="border:1px solid #000">{{дата_выдачи}}</td>
          <td style="border:1px solid #000">{{срок_действия}}</td>
          <td style="border:1px solid #000;text-align:left;padding-left:6px">{{подотчетное_лицо_должность}} <b>{{подотчетное_лицо_фио}}</b></td>
          <td style="border:1px solid #000;height:24px"></td>
        </tr>
      </tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:10px" border="1" cellpadding="3" cellspacing="0">
      <thead>
        <tr style="background:#f3f4f6;text-align:center;font-size:9.5px">
          <th style="width:35%;border:1px solid #000">Поставщик</th>
          <th style="width:35%;border:1px solid #000">Номер и дата наряда (замещающего наряд документа) или извещения</th>
          <th style="width:30%;border:1px solid #000">Номер и дата документа, подтверждающего выполнение поручения</th>
        </tr>
      </thead>
      <tbody>
        <tr style="text-align:center">
          <td style="border:1px solid #000;font-weight:600">{{поставщик_наименование}}</td>
          <td style="border:1px solid #000">{{номер_наряда}}</td>
          <td style="border:1px solid #000">{{номер_акта}}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- ОСНОВНОЙ БЛАНК ДОВЕРЕННОСТИ М-2 -->
  <table style="width:100%;margin-bottom:4px;font-size:10px">
    <tr>
      <td style="width:60%;vertical-align:top"></td>
      <td style="width:40%;text-align:right;vertical-align:top;line-height:1.2">
        Типовая межотраслевая форма № М-2<br/>
        Утверждена постановлением Госкомстата России от 30.10.97 № 71а<br/>
        <table style="float:right;margin-top:4px;border-collapse:collapse;font-size:9.5px" border="1" cellpadding="2">
          <tr><td style="border:1px solid #000;padding:1px 6px">Форма по ОКУД</td><td style="border:1px solid #000;font-weight:700;padding:1px 6px">0315001</td></tr>
          <tr><td style="border:1px solid #000;padding:1px 6px">по ОКПО</td><td style="border:1px solid #000;font-weight:700;padding:1px 6px">{{наш_окпо}}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  <div style="margin-bottom:6px;font-size:11px">
    <b>Организация:</b> <u>{{наша_организация_полная}}, ИНН {{наш_инн}}, КПП {{наш_кпп}}, {{наш_адрес}}</u>
    <div style="font-size:8.5px;text-align:center;color:#666;margin-top:-2px">(наименование организации)</div>
  </div>

  <div style="text-align:center;margin:10px 0 8px 0">
    <div style="font-size:15px;font-weight:700">ДОВЕРЕННОСТЬ № {{номер_доверенности}}</div>
    <div style="font-size:11px;margin-top:2px">
      Дата выдачи: <b>{{дата_выдачи_прописью}}</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 
      Доверенность действительна по: <b>{{срок_действия_прописью}}</b>
    </div>
  </div>

  <div style="margin-bottom:5px;font-size:11px">
    <b>Наименование потребителя и его адрес:</b> <u>{{наша_организация_полная}}, ИНН {{наш_инн}}, КПП {{наш_кпп}}, {{наш_адрес}}</u>
  </div>
  <div style="margin-bottom:5px;font-size:11px">
    <b>Наименование плательщика и его адрес:</b> <u>{{наша_организация_полная}}, ИНН {{наш_инн}}, КПП {{наш_кпп}}, {{наш_адрес}}</u>
  </div>
  <div style="margin-bottom:6px;font-size:11px">
    <b>Счет №</b> <u>{{наш_расчетный_счет}}</u> в банке <u>{{наш_банк}}, БИК {{наш_бик}}, к/с {{наш_корр_счет}}</u>
    <div style="font-size:8.5px;text-align:center;color:#666;margin-top:-2px">(наименование банка)</div>
  </div>

  <div style="margin-bottom:5px;font-size:11px">
    <b>Доверенность выдана:</b> <u>{{подотчетное_лицо_должность}} {{подотчетное_лицо_фио}}</u>
    <div style="font-size:8.5px;text-align:center;color:#666;margin-top:-2px">(должность, фамилия, имя, отчество)</div>
  </div>

  <table style="width:100%;font-size:11px;margin-bottom:5px">
    <tr>
      <td style="width:40%"><b>Паспорт: серия</b> <u>&nbsp;{{паспорт_серия}}&nbsp;</u> <b>№</b> <u>&nbsp;{{паспорт_номер}}&nbsp;</u></td>
      <td style="width:60%"><b>Дата выдачи:</b> <u>&nbsp;{{паспорт_дата_выдачи}}&nbsp;</u></td>
    </tr>
  </table>

  <div style="margin-bottom:5px;font-size:11px">
    <b>Кем выдан:</b> <u>{{паспорт_кем_выдан}}</u>
  </div>

  <div style="margin-bottom:5px;font-size:11px">
    <b>На получение от:</b> <u>{{поставщик_наименование}}</u>
    <div style="font-size:8.5px;text-align:center;color:#666;margin-top:-2px">(наименование поставщика)</div>
  </div>

  <div style="margin-bottom:8px;font-size:11px">
    <b>материальных ценностей по:</b> <u>{{основание_получения}}</u>
    <div style="font-size:8.5px;text-align:center;color:#666;margin-top:-2px">(наименование, номер и дата документа)</div>
  </div>

  <div style="font-weight:700;font-size:10.5px;margin-bottom:3px;text-align:center">
    Перечень товарно-материальных ценностей, подлежащих получению
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:12px" border="1" cellpadding="3" cellspacing="0" id="poa_m2_tmc_table">
    <thead>
      <tr style="background:#f3f4f6;text-align:center;font-size:9px">
        <th style="width:8%;border:1px solid #000">Номер по порядку</th>
        <th style="width:52%;border:1px solid #000">Материальные ценности</th>
        <th style="width:15%;border:1px solid #000">Единица измерения</th>
        <th style="width:25%;border:1px solid #000">Количество (прописью)</th>
      </tr>
      <tr style="text-align:center;font-size:8.5px;color:#666">
        <td style="border:1px solid #000">1</td>
        <td style="border:1px solid #000">2</td>
        <td style="border:1px solid #000">3</td>
        <td style="border:1px solid #000">4</td>
      </tr>
    </thead>
    <tbody>
      <tr><td style="border:1px solid #000;text-align:center">1</td><td style="border:1px solid #000" contenteditable="true"></td><td style="border:1px solid #000;text-align:center" contenteditable="true">шт.</td><td style="border:1px solid #000" contenteditable="true"></td></tr>
      <tr><td style="border:1px solid #000;text-align:center">2</td><td style="border:1px solid #000" contenteditable="true"></td><td style="border:1px solid #000;text-align:center" contenteditable="true">шт.</td><td style="border:1px solid #000" contenteditable="true"></td></tr>
      <tr><td style="border:1px solid #000;text-align:center">3</td><td style="border:1px solid #000" contenteditable="true"></td><td style="border:1px solid #000;text-align:center" contenteditable="true"></td><td style="border:1px solid #000" contenteditable="true"></td></tr>
      <tr><td style="border:1px solid #000;text-align:center">4</td><td style="border:1px solid #000" contenteditable="true"></td><td style="border:1px solid #000;text-align:center" contenteditable="true"></td><td style="border:1px solid #000" contenteditable="true"></td></tr>
      <tr><td style="border:1px solid #000;text-align:center">5</td><td style="border:1px solid #000" contenteditable="true"></td><td style="border:1px solid #000;text-align:center" contenteditable="true"></td><td style="border:1px solid #000" contenteditable="true"></td></tr>
    </tbody>
  </table>

  <div style="font-size:11px;margin-bottom:10px">
    Подпись лица, получившего доверенность ______________________ ( <u>{{подотчетное_лицо_фио}}</u> ) удостоверяем
  </div>

  <table style="width:100%;font-size:11.5px;margin-top:8px">
    <tr>
      <td style="width:50%;vertical-align:top">
        <b>Руководитель:</b> ________________ / <u>{{руководитель_иоф}}</u> /
        <div style="font-size:8.5px;color:#666;margin-left:85px">подпись &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; расшифровка подписи</div>
      </td>
      <td style="width:50%;vertical-align:top">
        <b>Главный бухгалтер:</b> ________________ / <u>{{главбух_иоф}}</u> /
        <div style="font-size:8.5px;color:#666;margin-left:110px">подпись &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; расшифровка подписи</div>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="padding-top:8px">
        <span style="font-size:13px;font-weight:700">М.П.</span>
      </td>
    </tr>
  </table>

</div>
    `
  },
  {
    code: 'id_album',
    name: 'Альбом исполнительной документации (ИД) по ГОСТ',
    category: 'id',
    doc_format: 'word',
    description: 'Комплект исполнительной документации: титульный лист, ведомость разделов, кабельный журнал, спецификация оборудования и протокол испытаний СКС.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:12px;line-height:1.35;color:#000">

  <!-- ТИТУЛЬНЫЙ ЛИСТ -->
  <div style="border:2px solid #000;padding:18px;margin-bottom:25px;min-height:550px">
    <table style="width:100%;font-size:11px;margin-bottom:20px">
      <tr>
        <td style="width:50%;vertical-align:top">
          <b>УТВЕРЖДЕНО:</b><br/>
          Представитель Заказчика:<br/>
          {{наш_заказчик}}<br/>
          Адрес: {{адрес_объекта}}<br/><br/>
          _________________ / Руководитель /<br/>
          М.П.
        </td>
        <td style="width:50%;vertical-align:top;text-align:right">
          <b>СОГЛАСОВАНО:</b><br/>
          Представитель исполнителя:<br/>
          {{наша_организация_полная}}<br/><br/><br/>
          _________________ / {{наш_директор}} /<br/>
          М.П.
        </td>
      </tr>
    </table>

    <div style="text-align:center;margin:30px 0 10px 0;font-size:12px">
      Контракт / Договор № {{номер_контракта}} от {{дата_контракта}}
    </div>

    <div style="text-align:center;font-weight:700;font-size:16px;margin:20px 0 6px 0;text-transform:uppercase">
      ИСПОЛНИТЕЛЬНАЯ ДОКУМЕНТАЦИЯ
    </div>
    <div style="text-align:center;font-size:13px;font-weight:600;margin-bottom:25px">
      на объект: {{адрес_объекта}}
    </div>

    <div style="margin:25px 0;font-size:12px;line-height:1.5">
      <b>Выполнение работ:</b> Строительно-монтажные и пуско-наладочные работы по формированию ИТ-инфраструктуры, структурированной кабельной системы (СКС), систем видеонаблюдения и беспроводного доступа.
    </div>

    <div style="text-align:center;margin-top:60px;font-size:12px">
      {{город}}, {{текущий_год}} г.
    </div>
  </div>

  <!-- ВЕДОМОСТЬ ДОКУМЕНТОВ И СОДЕРЖАНИЕ -->
  <div style="page-break-before:always;margin-top:20px">
    <div style="font-weight:700;font-size:14px;margin-bottom:10px;text-align:center">1. СОДЕРЖАНИЕ АЛЬБОМА ИСПОЛНИТЕЛЬНОЙ ДОКУМЕНТАЦИИ</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:20px;border:1px solid #000">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="border:1px solid #000;padding:5px;width:35px;text-align:center">№</th>
          <th style="border:1px solid #000;padding:5px;text-align:left">Наименование раздела</th>
          <th style="border:1px solid #000;padding:5px;width:70px;text-align:center">Стадия</th>
          <th style="border:1px solid #000;padding:5px;width:70px;text-align:center">Примечание</th>
        </tr>
      </thead>
      <tbody>
        <tr><td style="border:1px solid #000;padding:5px;text-align:center">1</td><td style="border:1px solid #000;padding:5px">Титульный лист и общие данные</td><td style="border:1px solid #000;padding:5px;text-align:center">И</td><td style="border:1px solid #000;padding:5px;text-align:center">Лист 1</td></tr>
        <tr><td style="border:1px solid #000;padding:5px;text-align:center">2</td><td style="border:1px solid #000;padding:5px">Кабельный журнал линий связи (КЖ)</td><td style="border:1px solid #000;padding:5px;text-align:center">И</td><td style="border:1px solid #000;padding:5px;text-align:center">Лист 2</td></tr>
        <tr><td style="border:1px solid #000;padding:5px;text-align:center">3</td><td style="border:1px solid #000;padding:5px">Спецификация оборудования и материалов (ТМЦ)</td><td style="border:1px solid #000;padding:5px;text-align:center">И</td><td style="border:1px solid #000;padding:5px;text-align:center">Лист 3</td></tr>
        <tr><td style="border:1px solid #000;padding:5px;text-align:center">4</td><td style="border:1px solid #000;padding:5px">Протокол измерений смонтированных линий СКС (Fluke)</td><td style="border:1px solid #000;padding:5px;text-align:center">И</td><td style="border:1px solid #000;padding:5px;text-align:center">Лист 4</td></tr>
        <tr><td style="border:1px solid #000;padding:5px;text-align:center">5</td><td style="border:1px solid #000;padding:5px">Акт сдачи-приемки выполненных работ</td><td style="border:1px solid #000;padding:5px;text-align:center">И</td><td style="border:1px solid #000;padding:5px;text-align:center">Лист 5</td></tr>
      </tbody>
    </table>
  </div>

  <!-- КАБЕЛЬНЫЙ ЖУРНАЛ -->
  <div style="page-break-before:always;margin-top:20px">
    <div style="font-weight:700;font-size:14px;margin-bottom:8px">2. КАБЕЛЬНЫЙ ЖУРНАЛ (КЖ)</div>
    {{таблица_кж}}
  </div>

  <!-- СПЕЦИФИКАЦИЯ ОБОРУДОВАНИЯ И МАТЕРИАЛОВ -->
  <div style="page-break-before:always;margin-top:20px">
    <div style="font-weight:700;font-size:14px;margin-bottom:8px">3. СПЕЦИФИКАЦИЯ ОБОРУДОВАНИЯ И МАТЕРИАЛОВ (ТМЦ)</div>
    {{таблица_спецификации_ид}}
  </div>

  <!-- ПРОТОКОЛ ИЗМЕРЕНИЙ FLUKE -->
  <div style="page-break-before:always;margin-top:20px">
    <div style="font-weight:700;font-size:14px;margin-bottom:8px">4. ПРОТОКОЛ ИЗМЕРЕНИЙ СМОНТИРОВАННОЙ СКС</div>
    {{таблица_протокола_измерений}}
  </div>

  <!-- ШТАМП ГОСТ -->
  {{штамп_гост}}

</div>
    `
  },
  {
    code: 'aosr_act',
    name: 'Акт освидетельствования скрытых работ (АОСР)',
    category: 'closing',
    doc_format: 'word',
    description: 'Официальный Акт освидетельствования скрытых и иных работ (АОСР) по форме приказа Ростехнадзора.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:12.5px;line-height:1.35;color:#000">
  <div style="text-align:center;font-weight:700;font-size:15px;margin-bottom:12px;text-transform:uppercase">
    АКТ ОСВИДЕТЕЛЬСТВОВАНИЯ СКРЫТЫХ РАБОТ
  </div>

  <div style="display:flex;justify-content:space-between;margin-bottom:14px;font-size:12.5px">
    <div>{{город}}</div>
    <div>{{дата_документа_прописью}}</div>
  </div>

  <table style="width:100%;margin-bottom:14px;font-size:12px;line-height:1.4">
    <tr>
      <td style="width:15%;font-weight:700;vertical-align:top">Заказчик:</td>
      <td style="width:85%;vertical-align:top">{{наш_заказчик}}</td>
    </tr>
    <tr>
      <td style="font-weight:700;vertical-align:top">Подрядчик:</td>
      <td style="vertical-align:top">{{наша_организация_полная}}</td>
    </tr>
    <tr>
      <td style="font-weight:700;vertical-align:top">Основание:</td>
      <td style="vertical-align:top">{{номер_и_дата_контракта}}</td>
    </tr>
    <tr>
      <td style="font-weight:700;vertical-align:top">Представитель:</td>
      <td style="vertical-align:top">Ответственный представитель Подрядчика: {{ответственный_фио}}</td>
    </tr>
  </table>

  <p style="text-align:justify;margin:0 0 10px 0;text-indent:25px">
    Комиссия в составе представителей Заказчика и Подрядчика произвела осмотр и освидетельствование скрытых работ, выполненных {{наша_организация_полная}}, и составила настоящий акт:
  </p>

  <p style="text-align:justify;margin:0 0 8px 0">
    <b>1. К освидетельствованию предъявлены следующие работы:</b> Прокладка внутренней слаботочной кабельной сети СКС в кабельных каналах и лотках за подшивными потолками на объекте Заказчика по адресу: <u>{{адрес_объекта}}</u>.
  </p>

  <p style="text-align:justify;margin:0 0 8px 0">
    <b>2. Работы выполнены в соответствии с проектно-сметной документацией:</b> Рабочая документация, утвержденная к производству работ, чертежи планов расположения кабельных трасс СКС.
  </p>

  <p style="text-align:justify;margin:0 0 8px 0">
    <b>3. При выполнении работ применены материалы и оборудование:</b> {{материалы_текст_аоср}}. Паспорта качества и сертификаты соответствия зарегистрированы в Журнале входного контроля.
  </p>

  <p style="text-align:justify;margin:0 0 8px 0">
    <b>4. Документы, подтверждающие соответствие работ требованиям:</b> Протокол приемо-сдаточных испытаний СКС № 1 от {{дата_документа}} (тестирование целостности жил и схемы разводки T568B на {{порты_факт}} портов).
  </p>

  <p style="text-align:justify;margin:0 0 8px 0">
    <b>5. Сроки выполнения работ:</b> Дата начала: {{дата_начала_работ}} / Дата окончания: {{дата_окончания_работ}}.
  </p>

  <p style="text-align:justify;margin:0 0 15px 0">
    <b>6. Решение комиссии:</b> Работы выполнены в полном соответствии с проектом, требованиями ГОСТ Р 53246-2008 и условиями контракта. Разрешается производство последующих работ по закрытию подвесных потолков и финишной отделке помещений.
  </p>

  <table style="width:100%;margin-top:25px;font-size:12px">
    <tr>
      <td style="width:48%;vertical-align:top">
        <b>От Заказчика:</b><br/><br/>
        _____________________ / _____________________ /<br/>
        <span style="font-size:10px;color:#666">М.П.</span>
      </td>
      <td style="width:48%;vertical-align:top">
        <b>От Подрядчика:</b><br/><br/>
        _____________________ / {{ответственный_фио}} /<br/>
        <span style="font-size:10px;color:#666">М.П.</span>
      </td>
    </tr>
  </table>
</div>
    `
  },
  {
    code: 'equipment_acceptance_act',
    name: 'Акт приемки смонтированного оборудования',
    category: 'closing',
    doc_format: 'word',
    description: 'Официальный акт приемки и готовности к пусконаладке смонтированного слаботочного и активного сетевого оборудования.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:12px;line-height:1.35;color:#000">
  <div style="text-align:center;font-weight:700;font-size:15px;margin-bottom:4px;text-transform:uppercase">
    АКТ ПРИЕМКИ СМОНТИРОВАННОГО ОБОРУДОВАНИЯ
  </div>
  <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:12px">
    <div>{{город}}</div>
    <div>Дата: {{дата_документа}}</div>
  </div>

  <table style="width:100%;margin-bottom:12px;font-size:11.5px;line-height:1.35">
    <tr><td style="width:15%;font-weight:700">Заказчик:</td><td>{{наш_заказчик}}</td></tr>
    <tr><td style="font-weight:700">Подрядчик:</td><td>{{наша_организация_полная}}</td></tr>
    <tr><td style="font-weight:700">Основание:</td><td>{{номер_и_дата_контракта}}</td></tr>
  </table>

  <p style="text-align:justify;margin:0 0 10px 0;text-indent:25px">
    Комиссия в составе представителей Заказчика и Подрядчика (ответственный исполнитель: <b>{{ответственный_фио}}</b>) составила настоящий акт в том, что Подрядчик выполнил работы по монтажу оборудования согласно контракту:
  </p>

  {{таблица_приемки_оборудования}}

  <p style="text-align:justify;margin:8px 0">
    Работы по монтажу оборудования выполнены в полном объеме в соответствии с ПСД и требованиями ГОСТ.
    Оборудование смонтировано, закреплено, подключено и признается готовым к пусконаладочным работам.
  </p>

  <table style="width:100%;margin-top:25px;font-size:12px">
    <tr>
      <td style="width:48%;vertical-align:top">
        <b>От Заказчика:</b><br/><br/>
        _____________________ / _____________________ /<br/>
        <span style="font-size:10px;color:#666">М.П.</span>
      </td>
      <td style="width:48%;vertical-align:top">
        <b>От Подрядчика:</b><br/><br/>
        _____________________ / {{ответственный_фио}} /<br/>
        <span style="font-size:10px;color:#666">М.П.</span>
      </td>
    </tr>
  </table>
</div>
    `
  },
  {
    code: 'technical_readiness_act',
    name: 'Акт технической готовности выполненных работ',
    category: 'closing',
    doc_format: 'word',
    description: 'Акт технической готовности электромонтажных и слаботочных работ (Форма 2 по ВСН 123-90).',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:12px;line-height:1.35;color:#000">
  <div style="text-align:center;font-weight:700;font-size:15px;margin-bottom:4px;text-transform:uppercase">
    АКТ ТЕХНИЧЕСКОЙ ГОТОВНОСТИ ВЫПОЛНЕННЫХ РАБОТ
  </div>
  <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:12px">
    <div>{{город}}</div>
    <div>{{дата_документа_прописью}}</div>
  </div>

  <table style="width:100%;margin-bottom:12px;font-size:11.5px;line-height:1.35">
    <tr><td style="width:15%;font-weight:700">Заказчик:</td><td>{{наш_заказчик}}</td></tr>
    <tr><td style="font-weight:700">Подрядчик:</td><td>{{наша_организация_полная}}</td></tr>
    <tr><td style="font-weight:700">Основание:</td><td>{{номер_и_дата_контракта}}</td></tr>
    <tr><td style="font-weight:700">Объект:</td><td>{{адрес_объекта}}</td></tr>
  </table>

  <p style="text-align:justify;margin:0 0 10px 0;text-indent:25px">
    Настоящий акт составлен представителем Подрядчика (<b>{{ответственный_фио}}</b>) о том, что монтажные работы по устройству Структурированной кабельной системы (СКС) на объекте выполнены в полном объеме. Общее количество портов составляет <b>{{порты_факт}} шт.</b> Схема разводки соответствует стандарту T568B, целостность линий проверена.
  </p>

  {{таблица_технической_готовности}}

  <p style="text-align:justify;margin:8px 0">
    Работы сданы в состоянии готовности для эксплуатации и передачи исполнительной документации (ИД).
  </p>

  <table style="width:100%;margin-top:25px;font-size:12px">
    <tr>
      <td style="width:48%;vertical-align:top">
        <b>Сдал от Подрядчика:</b><br/><br/>
        _____________________ / {{ответственный_фио}} /<br/>
        <span style="font-size:10px;color:#666">М.П.</span>
      </td>
      <td style="width:48%;vertical-align:top">
        <b>Принял от Заказчика:</b><br/><br/>
        _____________________ / _____________________ /<br/>
        <span style="font-size:10px;color:#666">М.П.</span>
      </td>
    </tr>
  </table>
</div>
    `
  },
  {
    code: 'input_control_journal',
    name: 'Журнал входного контроля материалов и оборудования',
    category: 'id',
    doc_format: 'word',
    description: 'Журнал входного контроля материалов, кабельной продукции и оборудования с фиксацией паспортов и сертификатов.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:12px;line-height:1.35;color:#000">
  <div style="text-align:center;font-weight:700;font-size:15px;margin-bottom:6px;text-transform:uppercase">
    ЖУРНАЛ ВХОДНОГО КОНТРОЛЯ МАТЕРИАЛОВ И ОБОРУДОВАНИЯ
  </div>
  <div style="margin-bottom:12px;font-size:11.5px;line-height:1.4">
    <div><b>Объект:</b> {{наш_заказчик}}, {{адрес_объекта}}</div>
    <div><b>Подрядчик:</b> {{наша_организация_полная}}</div>
    <div><b>Основание:</b> {{номер_и_дата_контракта}}</div>
  </div>

  {{таблица_входного_контроля}}

  <p style="font-size:11px;color:#444;margin-top:10px;font-style:italic">
    Все материалы и оборудование проверены на наличие заводской маркировки, целостность упаковки и соответствие сертификатам качества. Бракованной продукции не выявлено.
  </p>

  <div style="margin-top:20px;font-size:12px">
    <b>Ответственный за входной контроль:</b> ____________________ / {{ответственный_фио}} /
  </div>
</div>
    `
  },
  {
    code: 'protocol_psi_sks',
    name: 'Протокол приемо-сдаточных испытаний (ПСИ) СКС',
    category: 'id',
    doc_format: 'word',
    description: 'Официальный протокол приемо-сдаточных испытаний кабельной системы с автоматическим кабельным журналом портов.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:12px;line-height:1.35;color:#000">
  <div style="text-align:center;font-weight:700;font-size:15px;margin-bottom:4px;text-transform:uppercase">
    ПРОТОКОЛ ПРИЕМО-СДАТОЧНЫХ ИСПЫТАНИЙ СКС
  </div>
  <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:12px">
    <div>{{дата_документа_прописью}}</div>
    <div>№ {{номер_заявки}}-ПСИ</div>
  </div>

  <table style="width:100%;margin-bottom:10px;font-size:11.5px;line-height:1.35">
    <tr><td style="width:25%;font-weight:700">Наименование объекта:</td><td>{{тип_объекта}} № {{номер_всп}}</td></tr>
    <tr><td style="font-weight:700">Адрес объекта:</td><td>{{адрес_объекта}}</td></tr>
    <tr><td style="font-weight:700">Основание (Договор):</td><td>{{номер_и_дата_контракта}}</td></tr>
    <tr><td style="font-weight:700">Заказчик:</td><td>{{наш_заказчик}}</td></tr>
    <tr><td style="font-weight:700">Исполнитель:</td><td>{{наша_организация_полная}}</td></tr>
  </table>

  <div style="background:#f8fafc;border:1px solid #cbd5e1;padding:8px 12px;margin:8px 0;font-size:11.5px">
    <div style="font-weight:700;margin-bottom:3px">Технические характеристики СКС:</div>
    <div>• <b>Категория СКС:</b> 5e / 6 &nbsp;|&nbsp; • <b>Тип кабеля:</b> UTP &nbsp;|&nbsp; • <b>Стандарт расшивки:</b> TIA-568B</div>
    <div>• <b>Метод проверки:</b> Тестирование целостности жил и схемы разводки (Wire Map)</div>
  </div>

  <div style="background:#ecfdf5;border:1px solid #a7f3d0;padding:8px 12px;margin:8px 0;font-size:11.5px">
    <div style="font-weight:700;color:#065f46;margin-bottom:3px">Сводные результаты (авторасчет по журналу):</div>
    <div>Всего портов предъявлено: <b>{{порты_факт}}</b> &nbsp;|&nbsp; Успешно (PASS): <b>{{порты_факт}}</b> &nbsp;|&nbsp; Не прошло (FAIL): <b>0</b></div>
    <div>Процент исправности линий: <b style="color:#15803d">100%</b></div>
  </div>

  <p style="text-align:justify;margin:8px 0;font-size:11.5px">
    <b>Заключение комиссии:</b> Смонтированная кабельная система проверена на соответствие стандарту Т568В и целостность линий. Сводный процент исправности составляет 100%. Система признается готовой к эксплуатации.
  </p>

  <div style="font-weight:700;margin:12px 0 4px 0;font-size:12px">Результаты тестирования линий связи СКС:</div>
  {{таблица_линий_пси}}

  <table style="width:100%;margin-top:20px;font-size:12px">
    <tr>
      <td style="width:48%;vertical-align:top">
        <b>От Заказчика:</b><br/><br/>
        _____________________ / _____________________ /<br/>
        <span style="font-size:10px;color:#666">М.П.</span>
      </td>
      <td style="width:48%;vertical-align:top">
        <b>От Исполнителя:</b><br/><br/>
        _____________________ / {{ответственный_фио}} /<br/>
        <span style="font-size:10px;color:#666">М.П.</span>
      </td>
    </tr>
  </table>
</div>
    `
  },
  {
    code: 'ip_addressing_statement',
    name: 'Ведомость IP-адресации активного оборудования',
    category: 'id',
    doc_format: 'word',
    description: 'Ведомость распределения IP-адресов управления коммутаторов и сетевого оборудования с возможностью редактирования в браузере.',
    template_html: `
<div class="a4-page-content" style="font-family:'Times New Roman',Times,serif;font-size:12px;line-height:1.35;color:#000">
  <div style="text-align:center;font-weight:700;font-size:15px;margin-bottom:6px;text-transform:uppercase">
    ВЕДОМОСТЬ IP-АДРЕСАЦИИ АКТИВНОГО ОБОРУДОВАНИЯ
  </div>
  <div style="margin-bottom:12px;font-size:11.5px;line-height:1.4">
    <div><b>Заказчик:</b> {{наш_заказчик}}</div>
    <div><b>Объект:</b> {{адрес_объекта}}</div>
    <div><b>Основание:</b> {{номер_и_дата_контракта}}</div>
    <div><b>Ответственный за настройку:</b> {{ответственный_фио}}</div>
  </div>

  {{таблица_ip_адресации}}

  <p style="font-size:11.5px;margin:12px 0">
    Настройки применены и проверены. Оборудование доступно по сети, сетевые порты управления протестированы.
  </p>

  <div style="margin-top:25px;font-size:12px">
    <b>Проверил ответственный исполнитель:</b> ____________________ / {{ответственный_фио}} /
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
