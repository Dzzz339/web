// ─── БАЗА ЗНАНИЙ И РЕГЛАМЕНТ РАБОТЫ (ИНСТРУКЦИЯ) ───────────────────────────

function setHelpTab(tabId) {
  S.helpTab = tabId;
  var buttons = document.querySelectorAll('.help-tab-btn');
  buttons.forEach(function(b) {
    if (b.dataset.tab === tabId) b.classList.add('active');
    else b.classList.remove('active');
  });
  var panes = document.querySelectorAll('.help-tab-pane');
  panes.forEach(function(p) {
    p.style.display = (p.id === 'helpPane-' + tabId) ? 'block' : 'none';
  });
}

function pageHelp() {
  var curTab = S.helpTab || 'quickstart';

  var tabsNav = '<div class="card-tabs-nav" style="margin-bottom:1.25rem">' +
    '<button type="button" class="card-tab-btn help-tab-btn ' + (curTab === 'quickstart' ? 'active' : '') + '" data-tab="quickstart" onclick="setHelpTab(\'quickstart\')">' +
      '🚀 Сквозной процесс (А-Я)' +
    '</button>' +
    '<button type="button" class="card-tab-btn help-tab-btn ' + (curTab === 'roles' ? 'active' : '') + '" data-tab="roles" onclick="setHelpTab(\'roles\')">' +
      '👥 Памятки по ролям' +
    '</button>' +
    '<button type="button" class="card-tab-btn help-tab-btn ' + (curTab === 'stages' ? 'active' : '') + '" data-tab="stages" onclick="setHelpTab(\'stages\')">' +
      '📑 10 этапов регламента ИД' +
    '</button>' +
    '<button type="button" class="card-tab-btn help-tab-btn ' + (curTab === 'faq' ? 'active' : '') + '" data-tab="faq" onclick="setHelpTab(\'faq\')">' +
      '💡 Частые вопросы и ошибки' +
    '</button>' +
  '</div>';

  // ─── TAB 1: СКВОЗНОЙ ПРОЦЕСС ───
  var paneQuickstart = '<div id="helpPane-quickstart" class="help-tab-pane" style="display:' + (curTab === 'quickstart' ? 'block' : 'none') + '">' +
    '<div class="card p mb" style="border-left:4px solid var(--blue);background:linear-gradient(to right, #eff6ff, #ffffff)">' +
      '<div style="font-size:1.1rem;font-weight:700;color:var(--blue);margin-bottom:.35rem">Жизненный цикл заявки Stockeasy: от реестра до закрытия счета</div>' +
      '<div style="font-size:.85rem;color:var(--text-2);line-height:1.5">' +
        'Каждая заявка на объектах ПАО Сбербанк проходит строгий регламент из 10 стадий. Переход на следующий этап возможен только при выполнении всех обязательных условий (чек-листа). Это исключает штрафы и задержки при сдаче исполнительной документации (ИД).' +
      '</div>' +
    '</div>' +

    '<div style="display:flex;flex-direction:column;gap:1rem">' +

      '<div class="card p" style="border-top:3px solid #3b82f6">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
          '<div style="font-weight:700;font-size:1rem;color:#1e40af">1. Поступление и заведение заявки</div>' +
          '<span class="badge b-blue">Менеджер проекта</span>' +
        '</div>' +
        '<div style="font-size:.84rem;color:var(--text);line-height:1.5;margin-bottom:.5rem">' +
          'Заявка поступает из реестра Сбера (Excel) или создается вручную. Менеджер проверяет номер СЗБ, адрес отделения (ВСП/ГОСБ), состав работ и назначает <b>ответственного подрядчика / монтажника</b>.' +
        '</div>' +
        '<div style="background:#f8fafc;padding:8px 12px;border-radius:6px;font-size:.8rem;color:var(--text-2)">' +
          '🔑 <b>Обязательное условие:</b> Без назначенного подрядчика заявку невозможно перевести в работу (стадия «Монтаж»).' +
        '</div>' +
      '</div>' +

      '<div class="card p" style="border-top:3px solid #f59e0b">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
          '<div style="font-weight:700;font-size:1rem;color:#b45309">2. Полевые работы на объекте (СМР)</div>' +
          '<span class="badge b-survey">Монтажник / Бригада</span>' +
        '</div>' +
        '<div style="font-size:.84rem;color:var(--text);line-height:1.5;margin-bottom:.5rem">' +
          'Бригада прибывает на объект, согласует допуск с администрацией ВСП, выполняет монтаж СКС/СКУД/Видеонаблюдения, установку розеток и маркировку. По окончании работ монтажник фиксирует <b>фактический объем</b> и загружает <b>фотоотчёт</b>.' +
        '</div>' +
        '<div style="background:#fffbeb;padding:8px 12px;border-radius:6px;font-size:.8rem;color:#92400e">' +
          '🔑 <b>Обязательное условие:</b> Поле «Факт» должно быть строго больше 0, а во вкладку «Документы» загружен фотоотчёт или указана ссылка на Яндекс.Диск.' +
        '</div>' +
      '</div>' +

      '<div class="card p" style="border-top:3px solid #8b5cf6">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
          '<div style="font-weight:700;font-size:1rem;color:#6d28d9">3. Разработка исполнительной документации (ИД)</div>' +
          '<span class="badge" style="background:#f5f3ff;color:#6d28d9;border:1px solid #ddd6fe">Проектировщик</span>' +
        '</div>' +
        '<div style="font-size:.84rem;color:var(--text);line-height:1.5;margin-bottom:.5rem">' +
          'Проектировщик забирает заявку из очереди (норматив — <b>3 рабочих дня</b>). По фотоотчёту и замерам оформляются: исполнительная схема (AutoCAD/PDF), кабельный журнал портов, спецификация оборудования и титульный лист.' +
        '</div>' +
        '<div style="background:#f5f3ff;padding:8px 12px;border-radius:6px;font-size:.8rem;color:#5b21b6">' +
          '🔑 <b>Обязательное условие:</b> Заполнить порты в Кабельном журнале и прикрепить ссылку на готовый альбом ИД.' +
        '</div>' +
      '</div>' +

      '<div class="card p" style="border-top:3px solid #10b981">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
          '<div style="font-weight:700;font-size:1rem;color:#047857">4. Согласование со Сбербанком и устранение замечаний</div>' +
          '<span class="badge b-green">Отдел отправки / Куратор</span>' +
        '</div>' +
        '<div style="font-size:.84rem;color:var(--text);line-height:1.5;margin-bottom:.5rem">' +
          'Альбом ИД направляется куратору Сбера. Если банк выдвигает замечания, они вносятся во вкладку <b>«Замечания Сбера»</b>. Статус заявки автоматически блокирует приёмку до тех пор, пока проектировщик не устранит все замечания.' +
        '</div>' +
        '<div style="background:#ecfdf5;padding:8px 12px;border-radius:6px;font-size:.8rem;color:#065f46">' +
          '🔑 <b>Обязательное условие:</b> Переход на этап «ИД принята» невозможен при наличии хотя бы 1 не закрытого замечания!' +
        '</div>' +
      '</div>' +

      '<div class="card p" style="border-top:3px solid #059669">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">' +
          '<div style="font-weight:700;font-size:1rem;color:#065f46">5. Финансовое закрытие, ЭДО и оплата</div>' +
          '<span class="badge b-gray">Бухгалтерия / Менеджер</span>' +
        '</div>' +
        '<div style="font-size:.84rem;color:var(--text);line-height:1.5;margin-bottom:.5rem">' +
          'После подписания ИД банком формируются Акт выполненных работ и Счёт. Пакет закрывающих документов выгружается из Stockeasy и загружается в ЭДО. После поступления денег заявка переходит в статус «Оплачено».' +
        '</div>' +
        '<div style="background:#f8fafc;padding:8px 12px;border-radius:6px;font-size:.8rem;color:var(--text-2)">' +
          '🏁 <b>Финал:</b> Расчёт с монтажной бригадой и архивация заявки.' +
        '</div>' +
      '</div>' +

    '</div>' +
  '</div>';

  // ─── TAB 2: ПАМЯТКИ ПО РОЛЯМ ───
  var paneRoles = '<div id="helpPane-roles" class="help-tab-pane" style="display:' + (curTab === 'roles' ? 'block' : 'none') + '">' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:1rem">' +

      // Менеджер
      '<div class="card p" style="border:1.5px solid #bfdbfe">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:.75rem">' +
          '<div style="font-size:1.8rem">💼</div>' +
          '<div>' +
            '<div style="font-weight:700;font-size:1.05rem;color:#1e40af">Менеджер проекта</div>' +
            '<div style="font-size:.76rem;color:var(--text-3)">Координация, дедлайны и заказчик</div>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:.82rem;line-height:1.5;color:var(--text);margin-bottom:.75rem">' +
          'Отвечает за общую экономику заявки, соблюдение сроков Сбера и коммуникацию между всеми участниками.' +
        '</div>' +
        '<div style="font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:.35rem">Ваш чек-лист в системе:</div>' +
        '<ul style="font-size:.8rem;padding-left:1.2rem;margin:0 0 .75rem 0;color:var(--text);line-height:1.5">' +
          '<li>Проверить адрес и контакты ВСП во вкладке <b>«Главное»</b></li>' +
          '<li>Назначить подрядчика во вкладке <b>«Состав работ»</b></li>' +
          '<li>Контролировать факт и маржу во вкладке <b>«Финансы»</b></li>' +
          '<li>Перевести заявку в «Монтаж», нажав кнопку в шапке</li>' +
          '<li>После сдачи работ передать материалы проектировщикам</li>' +
        '</ul>' +
        '<div style="background:#eff6ff;padding:8px;border-radius:6px;font-size:.76rem;color:#1d4ed8">' +
          '💡 <b>Совет:</b> Используйте Канбан-доску с фильтром по себе для быстрого отслеживания застрявших заявок.' +
        '</div>' +
      '</div>' +

      // Монтажник
      '<div class="card p" style="border:1.5px solid #fed7aa">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:.75rem">' +
          '<div style="font-size:1.8rem">🔧</div>' +
          '<div>' +
            '<div style="font-weight:700;font-size:1.05rem;color:#c2410c">Монтажник / Бригадир</div>' +
            '<div style="font-size:.76rem;color:var(--text-3)">Полевые работы на объекте Сбера</div>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:.82rem;line-height:1.5;color:var(--text);margin-bottom:.75rem">' +
          'Выполняет физический монтаж на объекте, согласует работы с инженером банка и фиксирует результаты.' +
        '</div>' +
        '<div style="font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:.35rem">Ваш чек-лист на объекте:</div>' +
        '<ul style="font-size:.8rem;padding-left:1.2rem;margin:0 0 .75rem 0;color:var(--text);line-height:1.5">' +
          '<li>Нажать кнопку <b>«Маршрут»</b> в карточке для открытия Яндекс.Навигатора</li>' +
          '<li>Сделать фото ДО начала монтажа (трассы, шкаф, рабочие места)</li>' +
          '<li>Выполнить работы строго по стандартам Сбера с маркировкой портов</li>' +
          '<li>Сделать фото ПОСЛЕ (общий вид, маркировка, заделка, термоусадка)</li>' +
          '<li>Загрузить фото прямо со смартфона во вкладку <b>«Документы и Фото»</b></li>' +
          '<li>Указать фактическое кол-во портов во вкладке «Финансы»</li>' +
        '</ul>' +
        '<div style="background:#fff7ed;padding:8px;border-radius:6px;font-size:.76rem;color:#c2410c">' +
          '📱 <b>Мобильный режим:</b> На телефоне снизу доступна удобная кнопка подтверждения следующего шага.' +
        '</div>' +
      '</div>' +

      // Проектировщик
      '<div class="card p" style="border:1.5px solid #ddd6fe">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:.75rem">' +
          '<div style="font-size:1.8rem">📐</div>' +
          '<div>' +
            '<div style="font-weight:700;font-size:1.05rem;color:#6d28d9">Проектировщик (ИД)</div>' +
            '<div style="font-size:.76rem;color:var(--text-3)">Разработка исполнительных схем и КЖ</div>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:.82rem;line-height:1.5;color:var(--text);margin-bottom:.75rem">' +
          'Оформляет официальный комплект исполнительной документации в строгом соответствии с регламентом Сбера.' +
        '</div>' +
        '<div style="font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:.35rem">Ваш чек-лист по ИД:</div>' +
        '<ul style="font-size:.8rem;padding-left:1.2rem;margin:0 0 .75rem 0;color:var(--text);line-height:1.5">' +
          '<li>Забрать заявку из очереди (нажать «▶ Взять в работу: ИД в проектировании»)</li>' +
          '<li>Скачать фотоматериалы и протокол измерений монтажника</li>' +
          '<li>Заполнить порты в блоке «КЖ / Протокол измерений» (или загрузить Excel ПИ)</li>' +
          '<li>Сформировать альбом ИД (схема, титул, спецификация, протокол)</li>' +
          '<li>Прикрепить ссылку на готовый альбом во вкладке «Документы»</li>' +
          '<li>Оперативно закрывать замечания куратора (норматив исправления — до 2 дней)</li>' +
        '</ul>' +
        '<div style="background:#f5f3ff;padding:8px;border-radius:6px;font-size:.76rem;color:#6d28d9">' +
          '⏱ <b>Регламентный срок:</b> На подготовку ИД дается ровно 3 рабочих дня от даты взятия в работу.' +
        '</div>' +
      '</div>' +

      // Контролер / Бухгалтер
      '<div class="card p" style="border:1.5px solid #a7f3d0">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:.75rem">' +
          '<div style="font-size:1.8rem">📊</div>' +
          '<div>' +
            '<div style="font-weight:700;font-size:1.05rem;color:#047857">Контролер / Финансист</div>' +
            '<div style="font-size:.76rem;color:var(--text-3)">Акты, Счета, ЭДО и закрытие оплат</div>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:.82rem;line-height:1.5;color:var(--text);margin-bottom:.75rem">' +
          'Контролирует соответствие цен, формирует закрывающие документы и ведет учет оплат по договорам.' +
        '</div>' +
        '<div style="font-size:.78rem;font-weight:700;color:var(--text-2);margin-bottom:.35rem">Ваш чек-лист по закрытию:</div>' +
        '<ul style="font-size:.8rem;padding-left:1.2rem;margin:0 0 .75rem 0;color:var(--text);line-height:1.5">' +
          '<li>Во вкладке «Финансы» сверить «Итого платит Сбер» и расчеты с подрядчиком</li>' +
          '<li>Выгрузить печатные формы: Приложение №2, Счёт и Акт</li>' +
          '<li>Отправить документы через систему ЭДО (СБИС/Диадок)</li>' +
          '<li>Указать номер документа в ЭДО и статус «В ЭДО»</li>' +
          '<li>При поступлении оплаты нажать «▶ Перевести в статус: Оплачено»</li>' +
        '</ul>' +
        '<div style="background:#ecfdf5;padding:8px;border-radius:6px;font-size:.76rem;color:#047857">' +
          '💰 <b>Маржинальность:</b> Во вкладке «Состав работ» отображается плановая и фактическая маржа заявки.' +
        '</div>' +
      '</div>' +

    '</div>' +
  '</div>';

  // ─── TAB 3: 10 ЭТАПОВ РЕГЛАМЕНТА ───
  var paneStages = '<div id="helpPane-stages" class="help-tab-pane" style="display:' + (curTab === 'stages' ? 'block' : 'none') + '">' +
    '<div class="card p mb" style="background:#f8fafc">' +
      '<div style="font-weight:700;font-size:.95rem;margin-bottom:.35rem">Справочник 10 последовательных стадий регламента ИД</div>' +
      '<div style="font-size:.82rem;color:var(--text-2)">' +
        'Заявка не может перескочить стадию. Каждый переход проверяется автоматическим валидатором бизнес-правил.' +
      '</div>' +
    '</div>' +

    '<div style="display:flex;flex-direction:column;gap:.75rem">' +
      [
        { num: 0, name: 'Новая', role: 'Менеджер', rule: 'Обязательно назначен Подрядчик', desc: 'Заявка только создана или импортирована из таблицы. Менеджер распределяет объем работ.' },
        { num: 1, name: 'Монтаж', role: 'Монтажник', rule: 'Обязательно указан фактический объем (Факт > 0)', desc: 'Бригада работает на объекте. По окончании обязательно вносится объем выполненных портов/работ.' },
        { num: 2, name: 'Монтаж завершён', role: 'Менеджер / Монтажник', rule: 'Обязательно загружен фотоотчёт или ссылка на Я.Диск', desc: 'СМР окончены. Формируется пакет фотофиксации для проектного отдела.' },
        { num: 3, name: 'В очереди ИД', role: 'Проектировщик', rule: 'Взятие в работу проектировщиком', desc: 'Материалы переданы в проектный отдел. При взятии в работу автоматически запускается дедлайн 3 рабочих дня.' },
        { num: 4, name: 'В проектировании', role: 'Проектировщик', rule: 'Обязательно прикреплена ссылка на готовую ИД', desc: 'Инженер чертит схему и формирует кабельный журнал. Ссылка на готовый альбом вносится в систему.' },
        { num: 5, name: 'ИД готова', role: 'Отдел отправки', rule: 'Проверка комплектности и отправка в Сбер', desc: 'Альбом проверен внутренним нормоконтролем и направлен кураторам Заказчика.' },
        { num: 6, name: 'На согласовании', role: 'Сбербанк', rule: 'Отсутствие открытых замечаний (0 незакрытых)', desc: 'Сбер проверяет документацию. Если куратор нашел ошибки, они регистрируются в карточке и блокируют сдачу.' },
        { num: 7, name: 'ИД принята', role: 'Сбербанк / Куратор', rule: 'Получено официальное согласование Сбера', desc: 'ИД принята без замечаний. Запуск процедуры закрытия этапа и подготовки документов на оплату.' },
        { num: 8, name: 'Ожидает оплаты', role: 'Бухгалтерия', rule: 'Счета и Акты выставлены в ЭДО', desc: 'Пакет документов находится на рассмотрении в бухгалтерии Заказчика.' },
        { num: 9, name: 'Оплачено', role: 'Финал', rule: 'Деньги поступили на расчетный счет', desc: 'Заявка успешно завершена и полностью закрыта финансово. Запись уходит в архив.' }
      ].map(function(s) {
        return '<div class="card p" style="display:flex;align-items:flex-start;gap:12px;border-left:4px solid ' + (s.num === 9 ? '#10b981' : (s.num === 6 ? '#f59e0b' : '#3b82f6')) + '">' +
          '<div style="font-size:1.2rem;font-weight:800;color:var(--text-3);min-width:32px;text-align:center">#' + s.num + '</div>' +
          '<div style="flex:1">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;flex-wrap:wrap;gap:6px">' +
              '<div style="font-weight:700;font-size:.95rem;color:var(--text)">' + s.name + '</div>' +
              '<span class="badge b-gray" style="font-size:.74rem">Роль: ' + s.role + '</span>' +
            '</div>' +
            '<div style="font-size:.82rem;color:var(--text-2);margin-bottom:6px;line-height:1.4">' + s.desc + '</div>' +
            '<div style="font-size:.78rem;background:#f8fafc;padding:4px 8px;border-radius:4px;color:var(--text-2)">' +
              '🛡️ <b>Условие перехода:</b> ' + s.rule +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>' +
  '</div>';

  // ─── TAB 4: ЧАСТЫЕ ВОПРОСЫ (FAQ) ───
  var paneFaq = '<div id="helpPane-faq" class="help-tab-pane" style="display:' + (curTab === 'faq' ? 'block' : 'none') + '">' +
    '<div style="display:flex;flex-direction:column;gap:.75rem">' +

      '<details class="card p" style="cursor:pointer">' +
        '<summary style="font-weight:700;font-size:.92rem;color:var(--text)">❓ Почему кнопка перехода на следующий шаг серая (disabled) или выдает предупреждение?</summary>' +
        '<div style="padding-top:.75rem;font-size:.82rem;line-height:1.5;color:var(--text-2);border-top:1px solid var(--border);margin-top:.5rem">' +
          'Кнопка блокируется, если не выполнены обязательные требования текущей стадии регламента. В верхней части карточки в <b>«Smart Action Center»</b> выведен интерактивный чек-лист. Если пункт подсвечен красным крестиком <b>✕</b>, кликните по синей ссылке рядом с ним — система сразу переведет вас в нужную вкладку для исправления.' +
        '</div>' +
      '</details>' +

      '<details class="card p" style="cursor:pointer">' +
        '<summary style="font-weight:700;font-size:.92rem;color:var(--text)">❓ Сбер прислал замечания к альбому ИД. Что делать?</summary>' +
        '<div style="padding-top:.75rem;font-size:.82rem;line-height:1.5;color:var(--text-2);border-top:1px solid var(--border);margin-top:.5rem">' +
          '1. Откройте карточку заявки и перейдите во вкладку <b>«Замечания Сбера»</b>.<br>' +
          '2. Нажмите кнопку <b>«+ Добавить замечание»</b>, введите текст претензии инженера банка.<br>' +
          '3. На вкладке появится красная плашка с количеством открытых замечаний, а переход к приёмке заблокируется.<br>' +
          '4. После того как проектировщик исправит чертежи и перезальет альбом, нажмите кнопку <b>«✔ Устранено»</b> напротив замечания.' +
        '</div>' +
      '</details>' +

      '<details class="card p" style="cursor:pointer">' +
        '<summary style="font-weight:700;font-size:.92rem;color:var(--text)">❓ Как прикрепить большой архив фотоматериалов (более 100 Мб)?</summary>' +
        '<div style="padding-top:.75rem;font-size:.82rem;line-height:1.5;color:var(--text-2);border-top:1px solid var(--border);margin-top:.5rem">' +
          'Для тяжелых архивов используйте корпоративный Яндекс.Диск:<br>' +
          '1. Загрузите папку с фотографиями на Яндекс.Диск и создайте публичную ссылку.<br>' +
          '2. В карточке заявки перейдите во вкладку <b>«Документы и Фото»</b>.<br>' +
          '3. Вставьте ссылку в поле <b>«Ссылка на материалы (Яндекс.Диск)»</b> и сохраните карточку.' +
        '</div>' +
      '</details>' +

      '<details class="card p" style="cursor:pointer">' +
        '<summary style="font-weight:700;font-size:.92rem;color:var(--text)">❓ Банк отменил заявку или перенес объект. Как зафиксировать отмену?</summary>' +
        '<div style="padding-top:.75rem;font-size:.82rem;line-height:1.5;color:var(--text-2);border-top:1px solid var(--border);margin-top:.5rem">' +
          'В верхней части карточки заявки рядом с кнопками печати нажмите <b>«🚫 Отменить заявку»</b>. Появится всплывающее окно, где необходимо обязательно указать причину (например, <i>«Отказ администрации ВСП в допуске»</i> или <i>«Отмена модернизации со стороны Сбера»</i>). Карточка перейдет в статус отмененной с красным баннером, а история зафиксирует автора и причину.' +
        '</div>' +
      '</details>' +

      '<details class="card p" style="cursor:pointer">' +
        '<summary style="font-weight:700;font-size:.92rem;color:var(--text)">❓ Работает ли программа, если на объекте Сбера нет интернета или глушат связь?</summary>' +
        '<div style="padding-top:.75rem;font-size:.82rem;line-height:1.5;color:var(--text-2);border-top:1px solid var(--border);margin-top:.5rem">' +
          '<b>Да, полностью!</b> Stockeasy оснащен продвинутым Offline-режимом (IndexedDB). Вы можете открывать сохраненные заявки, редактировать данные и сохранять черновики прямо без связи. В верхней панели загорится желтый индикатор «⚡ Автономный режим». Как только вы покинете подвал или объект и телефон поймает сеть, все сохраненные изменения автоматически уйдут на сервер.' +
        '</div>' +
      '</details>' +

    '</div>' +
  '</div>';

  return '<div style="max-width:1000px;margin:0 auto">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:8px">' +
      '<div>' +
        '<h1 style="margin:0;font-size:1.35rem">📖 Инструкция и регламент работы</h1>' +
        '<div style="font-size:.82rem;color:var(--text-3);margin-top:2px">База знаний, регламент жизненного цикла ИД и инструкции для сотрудников</div>' +
      '</div>' +
    '</div>' +
    tabsNav +
    paneQuickstart +
    paneRoles +
    paneStages +
    paneFaq +
  '</div>';
}

// ─── КОНТЕКСТНАЯ СПРАВКА ПО ЭТАПУ (МОДАЛЬНОЕ ОКНО) ──────────────────────────

var STAGE_HELP_DATA = {
  0: {
    title: 'Этап 0: Новая заявка',
    role: 'Менеджер проекта',
    goal: 'Проверить техническое задание Сбера и назначить ответственную монтажную бригаду.',
    tasks: [
      'Сверить адрес объекта, номер ВСП/ГОСБ и тип работ.',
      'Перейти во вкладку «Состав работ» и назначить подрядчика на позиции спецификации.',
      'Согласовать ориентировочную дату выезда монтажной бригады.'
    ],
    rule: 'Назначить подрядчика (поле «Подрядчик» не должно быть пустым).',
    pitfall: 'Если подрядчик не выбран, система не позволит начать этап монтажа.'
  },
  1: {
    title: 'Этап 1: Монтаж на объекте',
    role: 'Монтажная бригада / Менеджер',
    goal: 'Выполнить строительно-монтажные работы в отделении банка.',
    tasks: [
      'Получить допуск на объект у инженера или руководителя ВСП.',
      'Выполнить монтаж кабельных трасс, установку розеток и оборудования.',
      'Промаркировать каждый порт строго по исполнительным стандартам Сбера.',
      'Зафиксировать точный объем выполненных работ.'
    ],
    rule: 'Заполнить фактический объем (поле «Факт» > 0) во вкладке «Финансы».',
    pitfall: 'Нельзя завершить монтаж с нулевым фактом — это остановит расчет сметы.'
  },
  2: {
    title: 'Этап 2: Монтаж завершён',
    role: 'Монтажная бригада / Менеджер',
    goal: 'Собрать фотофиксацию и протоколы измерений для передачи в проектный отдел.',
    tasks: [
      'Сделать качественные фото общего плана помещения, маркировки портов и телеком-шкафа.',
      'Загрузить фото во вкладку «Документы и Фото» или вставить ссылку на Яндекс.Диск.',
      'Убедиться, что все исходные файлы доступны проектировщику.'
    ],
    rule: 'Наличие загруженных файлов или ссылки на материалы (Яндекс.Диск).',
    pitfall: 'Без фотоотчета проектировщик не сможет составить схему и кабельный журнал.'
  },
  3: {
    title: 'Этап 3: В очереди ИД',
    role: 'Проектировщик (Инженер ПТО)',
    goal: 'Принять задачу в работу проектным отделом.',
    tasks: [
      'Ознакомиться с фотоотчетом и объемами работ.',
      'Проверить полноту исходных данных.',
      'Нажать «Взять в работу: ИД в проектировании» — запустится нормативный срок 3 рабочих дня.'
    ],
    rule: 'Нажатие кнопки подтверждения проектировщиком.',
    pitfall: 'Заявки в очереди подлежат приоритетной сортировке по сроку сдачи.'
  },
  4: {
    title: 'Этап 4: В проектировании',
    role: 'Проектировщик',
    goal: 'Разработать исполнительную схему, кабельный журнал и оформить альбом ИД.',
    tasks: [
      'Начертить исполнительную схему объекта в AutoCAD / PDF.',
      'Заполнить кабельный журнал во вкладке «Документы» (блок портов КЖ).',
      'Загрузить готовый PDF-альбом ИД или сохранить ссылку на диск во вкладке «Документы».'
    ],
    rule: 'Заполненное поле «Ссылка на готовую ИД» во вкладке «Документы».',
    pitfall: 'Нормативный срок — 3 рабочих дня. При превышении срока заявка подсвечивается как просроченная.'
  },
  5: {
    title: 'Этап 5: ИД готова',
    role: 'Отдел отправки / Менеджер',
    goal: 'Провести внутренний нормоконтроль и отправить документацию куратору Сбера.',
    tasks: [
      'Проверить корректность штампов, подписей и соответствие фактических портов смете.',
      'Сформировать сопроводительное письмо и направить комплект в Сбербанк.',
      'Перевести заявку на следующий этап «▶ Направить на согласование в Сбер».'
    ],
    rule: 'Подтверждение отправки куратору.',
    pitfall: 'Ошибки в штампах приводят к возврату альбома и штрафным санкциям.'
  },
  6: {
    title: 'Этап 6: На согласовании в Сбере',
    role: 'Куратор Сбербанка / Проектировщик',
    goal: 'Получить положительное заключение и согласование ИД от Сбера.',
    tasks: [
      'Отслеживать статус рассмотрения альбома инженером банка.',
      'При получении замечаний внести их во вкладку «Замечания Сбера».',
      'Проектировщику оперативно исправить замечания и нажать «✔ Устранено».'
    ],
    rule: 'Отсутствие открытых замечаний (0 незакрытых замечаний).',
    pitfall: 'При наличии хотя бы 1 замечания кнопка перехода в «ИД принята» жестко заблокирована.'
  },
  7: {
    title: 'Этап 7: ИД принята',
    role: 'Менеджер проекта / Бухгалтерия',
    goal: 'Зафиксировать официальную приёмку объекта Заказчиком.',
    tasks: [
      'Получить подписанный скан согласования или протокол приёмки.',
      'Сформировать закрывающие формы (Приложение №2, КС-2/КС-3, Акт).',
      'Передать документы в финансовую службу для выставления счетов.'
    ],
    rule: 'Подтверждение согласования банком.',
    pitfall: 'Своевременная передача документов ускоряет оплату от Заказчика.'
  },
  8: {
    title: 'Этап 8: Ожидает оплаты',
    role: 'Бухгалтерия',
    goal: 'Выставить счет в ЭДО и контролировать поступление денежных средств.',
    tasks: [
      'Выгрузить Акт и Счёт из вкладки «Финансы».',
      'Загрузить пакет в систему ЭДО (СБИС или Диадок).',
      'Заполнить в карточке поля «№ документа в ЭДО» и «№ счёта».',
      'Ожидать проводки платежа от Сбербанка.'
    ],
    rule: 'Документы отправлены через ЭДО.',
    pitfall: 'Не забывайте вносить номер из ЭДО для быстрого поиска в бухгалтерии.'
  },
  9: {
    title: 'Этап 9: Оплачено',
    role: 'Финал',
    goal: 'Завершение сделки и финансовый расчет.',
    tasks: [
      'Зафиксировать поступление средств на расчетный счет компании.',
      'Произвести выплату подрядной монтажной бригаде.',
      'Заявка переходит в архив выполненных заказов.'
    ],
    rule: 'Полный расчет по заявке.',
    pitfall: 'Заявка успешно закрыта. Дальнейшие изменения заблокированы.'
  }
};

function showStageHelpModal(stageNum) {
  var s = STAGE_HELP_DATA[stageNum] || STAGE_HELP_DATA[0];
  var existing = document.getElementById('stageHelpModalOverlay');
  if (existing) existing.remove();

  var tasksHtml = (s.tasks || []).map(function(t) {
    return '<li style="margin-bottom:4px">' + escHtml(t) + '</li>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.id = 'stageHelpModalOverlay';
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '1000';
  overlay.innerHTML = 
    '<div class="modal-box" style="max-width:540px;width:92%;padding:1.5rem;border-radius:12px;background:#fff;box-shadow:0 20px 25px -5px rgba(0,0,0,0.2)">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem">' +
        '<div>' +
          '<div style="font-size:1.15rem;font-weight:700;color:var(--text)">' + s.title + '</div>' +
          '<span class="badge b-blue" style="font-size:.76rem;margin-top:4px">Ответственный: ' + s.role + '</span>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="closeStageHelpModal()" style="font-size:1.1rem;line-height:1;padding:4px 8px">✕</button>' +
      '</div>' +
      
      '<div style="background:#f8fafc;padding:10px 12px;border-radius:8px;font-size:.84rem;color:var(--text);margin-bottom:.75rem;line-height:1.4">' +
        '<b>🎯 Цель этапа:</b> ' + escHtml(s.goal) +
      '</div>' +

      '<div style="font-size:.82rem;font-weight:700;color:var(--text-2);margin-bottom:4px">Что необходимо сделать:</div>' +
      '<ul style="font-size:.82rem;padding-left:1.2rem;margin:0 0 .75rem 0;color:var(--text);line-height:1.5">' +
        tasksHtml +
      '</ul>' +

      '<div style="background:#eff6ff;border-left:3px solid var(--blue);padding:8px 12px;border-radius:4px;font-size:.8rem;color:#1e40af;margin-bottom:.75rem">' +
        '🛡️ <b>Условие для перехода к следующему шагу:</b><br>' + escHtml(s.rule) +
      '</div>' +

      '<div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:8px 12px;border-radius:4px;font-size:.78rem;color:#92400e;margin-bottom:1.25rem">' +
        '⚠️ <b>Частая ошибка / блокер:</b> ' + escHtml(s.pitfall) +
      '</div>' +

      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn-sm btn-ghost" onclick="closeStageHelpModal();go(\'help\');setHelpTab(\'stages\');">' +
          '📖 Открыть полный регламент' +
        '</button>' +
        '<button type="button" class="btn btn-sm btn-primary" onclick="closeStageHelpModal()">' +
          'Понятно' +
        '</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
}

function closeStageHelpModal() {
  var overlay = document.getElementById('stageHelpModalOverlay');
  if (overlay) overlay.remove();
}
