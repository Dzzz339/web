// server/config/processes.js - Декларативная карта 11 процессов и макро-статусов StockEasy
// Построена на базе регламента и требований заказчика (Алексей Чайка, Prilozhenie_StockEasy)

export const MACRO_STATUSES = {
  new: {
    code: 'new',
    name: 'Новая',
    color: '#6B7280',
    badgeClass: 'b-gray',
    icon: '📥',
    step: 0,
    desc: 'Заявка получена с портала Заказчика, ожидает первичного разбора'
  },
  review: {
    code: 'review',
    name: 'Рассмотрение',
    color: '#3B82F6',
    badgeClass: 'b-blue',
    icon: '🔍',
    step: 1,
    desc: 'Проверка технической возможности, согласование сроков, решение о принятии/отклонении'
  },
  rejected: {
    code: 'rejected',
    name: 'Отклонена / Доработка',
    color: '#EF4444',
    badgeClass: 'b-red',
    icon: '⛔',
    step: 1.5,
    desc: 'Некорректное ТЗ, ошибки адреса, схемы не приложены — возврат Заказчику на уточнение'
  },
  in_progress: {
    code: 'in_progress',
    name: 'В работе (Поиск подрядчика)',
    color: '#8B5CF6',
    badgeClass: 'b-purple',
    icon: '🤝',
    step: 2,
    desc: 'Заявка принята генподрядчиком, идет подбор субподрядчиков по видам работ'
  },
  assigned: {
    code: 'assigned',
    name: 'Назначено исполнителю',
    color: '#EC4899',
    badgeClass: 'b-pink',
    icon: '📋',
    step: 3,
    desc: 'Субподрядчики назначены, формируются заказ-наряды, допуски и комплектация ТМЦ'
  },
  install: {
    code: 'install',
    name: 'В монтаже',
    color: '#F59E0B',
    badgeClass: 'b-yellow',
    icon: '🔧',
    step: 4,
    desc: 'СМР на объекте, прокладка кабеля, монтаж портов, сбор фотоотчетов и кабельных журналов'
  },
  smr_done: {
    code: 'smr_done',
    name: 'СМР выполнено',
    color: '#10B981',
    badgeClass: 'b-green',
    icon: '🏁',
    step: 5,
    desc: 'Монтаж на объекте завершен, отчетные данные переданы на проверку куратору'
  },
  correction: {
    code: 'correction',
    name: 'На исправлении',
    color: '#EF4444',
    badgeClass: 'b-red',
    icon: '⚠️',
    step: 6,
    desc: 'Выявлены замечания по СМР, подрядчик выполняет устранение дефектов'
  },
  id_in_progress: {
    code: 'id_in_progress',
    name: 'ИД в разработке',
    color: '#06B6D4',
    badgeClass: 'b-cyan',
    icon: '📐',
    step: 7,
    desc: 'Параллельный процесс: Проектировщик готовит комплект ИД по фактическим данным'
  },
  id_delivered: {
    code: 'id_delivered',
    name: 'ИД передана',
    color: '#6366F1',
    badgeClass: 'b-indigo',
    icon: '✉️',
    step: 8,
    desc: 'Альбом ИД и реестр передачи направлены куратору Заказчика (в ЭДО / на портал)'
  },
  accepted: {
    code: 'accepted',
    name: 'Готово, принято',
    color: '#059669',
    badgeClass: 'b-emerald',
    icon: '✅',
    step: 9,
    desc: 'СМР и ИД согласованы Заказчиком без замечаний, подписан акт сдачи-приемки'
  },
  billing: {
    code: 'billing',
    name: 'Передано в оплату',
    color: '#0D9488',
    badgeClass: 'b-teal',
    icon: '💳',
    step: 10,
    desc: 'Оформлены акты КС-2/КС-3, выставлен счет Заказчику, готовятся выплаты подрядчикам'
  },
  paid: {
    code: 'paid',
    name: 'Оплачено',
    color: '#16A34A',
    badgeClass: 'b-green',
    icon: '💰',
    step: 11,
    desc: 'Денежные средства поступили на расчетный счет генподрядчика'
  },
  archived: {
    code: 'archived',
    name: 'В архиве',
    color: '#4B5563',
    badgeClass: 'b-gray',
    icon: '📁',
    step: 12,
    desc: 'Все обязательства исполнены, проект перенесен в неизменяемый архив'
  }
};

export const PROCESSES = [
  {
    num: 0,
    code: 'p0_intake',
    name: 'Разбор новых заявок',
    ownerRole: 'manager',
    allowedRoles: ['admin', 'director', 'manager'],
    macroStatus: 'new',
    inputDoc: 'Уведомление / Выгрузка с портала Заказчика',
    outputDoc: 'Первичная карточка объекта',
    description: 'Импорт или ручной ввод заявки, проверка базовых реквизитов объекта (ВСП, адрес, сроки).'
  },
  {
    num: 1,
    code: 'p1_review',
    name: 'Рассмотрение заявки',
    ownerRole: 'manager',
    allowedRoles: ['admin', 'director', 'manager'],
    macroStatus: 'review',
    inputDoc: 'Карточка + ТЗ Заказчика',
    outputDoc: 'Решение: Принято в работу / Отклонено',
    description: 'Оценка технической возможности и рентабельности. Назначение дедлайнов.'
  },
  {
    num: 2,
    code: 'p2_assign',
    name: 'Выбор и назначение подрядчиков',
    ownerRole: 'manager',
    allowedRoles: ['admin', 'director', 'manager'],
    macroStatus: 'in_progress',
    inputDoc: 'Согласованный заказ',
    outputDoc: 'Назначенные субподряды (1..N исполнителей)',
    description: 'Выбор подрядчиков на виды работ (СКС, ВОЛС, ПНР) из справочника организаций.'
  },
  {
    num: 3,
    code: 'p3_contracting',
    name: 'Комплектация и контрактование',
    ownerRole: 'logistics',
    allowedRoles: ['admin', 'director', 'manager', 'logistics', 'to_engineer'],
    macroStatus: 'assigned',
    inputDoc: 'Назначенные субподряды + спецификация ТМЦ',
    outputDoc: 'Заказ-наряд (Приложение 2), Письмо на допуск, Доверенность М-2, Накладная ТМЦ',
    description: 'Формирование пакета документов для выхода на объект: наряд, допуски монтажников, резервирование и отгрузка материалов.'
  },
  {
    num: 4,
    code: 'p4_install',
    name: 'Монтаж на объекте (СМР)',
    ownerRole: 'installer',
    allowedRoles: ['admin', 'director', 'manager', 'installer'],
    macroStatus: 'install',
    inputDoc: 'Заказ-наряд + Допуск на объект + Выданные ТМЦ',
    outputDoc: 'Фотоотчет СМР, Кабельный журнал, Акт расхода ТМЦ',
    description: 'Выполнение полевых работ. Загрузка фото узлов, заполнение портов и метража кабеля.'
  },
  {
    num: 5,
    code: 'p5a_acceptance_smr',
    name: 'Приемка СМР и устранение замечаний',
    ownerRole: 'to_engineer',
    allowedRoles: ['admin', 'director', 'manager', 'to_engineer'],
    macroStatus: 'smr_done',
    alternateStatus: 'correction',
    inputDoc: 'Фотоотчеты и кабельные журналы подрядчиков',
    outputDoc: 'Лист замечаний / Подтверждение приемки СМР',
    description: 'Контроль качества монтажа инженером куратором. При дефектах — возврат на исправление.'
  },
  {
    num: 6,
    code: 'p5b_design_id',
    name: 'Разработка исполнительной документации (ИД)',
    ownerRole: 'designer',
    allowedRoles: ['admin', 'director', 'manager', 'designer', 'to_engineer'],
    macroStatus: 'id_in_progress',
    isParallel: true,
    inputDoc: 'Кабельные журналы + фото схем + исполнительные замеры',
    outputDoc: 'Готовый комплект ИД (структурные схемы, планы, паспорта)',
    description: 'Камеральная подготовка альбома чертежей ИД проектировщиком (норматив 3 рабочих дня).'
  },
  {
    num: 7,
    code: 'p6_handover_id',
    name: 'Передача ИД Заказчику',
    ownerRole: 'to_engineer',
    allowedRoles: ['admin', 'director', 'manager', 'to_engineer'],
    macroStatus: 'id_delivered',
    isParallel: true,
    inputDoc: 'Готовый альбом ИД',
    outputDoc: 'Сопроводительный реестр передачи ИД, отправка в ЭДО',
    description: 'Официальная выгрузка документации на портал Заказчика с описью вложений.'
  },
  {
    num: 8,
    code: 'p7_customer_acceptance',
    name: 'Финальная приемка Заказчиком',
    ownerRole: 'manager',
    allowedRoles: ['admin', 'director', 'manager'],
    macroStatus: 'accepted',
    inputDoc: 'Сданный СМР + Согласованная Заказчиком ИД',
    outputDoc: 'Подписанный протокол/акт Заказчика',
    description: 'Слияние результатов всех субподрядов и согласованной ИД. Получение отметки о приёмке.'
  },
  {
    num: 9,
    code: 'p8a_subcontractor_payment',
    name: 'Расчеты с Подрядчиками',
    ownerRole: 'accountant',
    allowedRoles: ['admin', 'director', 'accountant'],
    macroStatus: 'billing',
    inputDoc: 'Акты выполненных работ и счета от субподрядчиков',
    outputDoc: 'Платежные поручения подрядчикам, закрывающие акты',
    description: 'Сверка фактических объемов и расценок, передача в бухгалтерию на выплату.'
  },
  {
    num: 10,
    code: 'p8b_customer_billing',
    name: 'Закрытие и расчеты с Заказчиком',
    ownerRole: 'accountant',
    allowedRoles: ['admin', 'director', 'manager', 'accountant'],
    macroStatus: 'billing',
    inputDoc: 'Финальный акт сдачи Заказчику',
    outputDoc: 'Акты КС-2, КС-3, Счета-фактуры Заказчику',
    description: 'Оформление унифицированных форм КС-2 и справок КС-3 для оплаты Заказчиком.'
  },
  {
    num: 11,
    code: 'p9_payment',
    name: 'Оплата от Заказчика',
    ownerRole: 'accountant',
    allowedRoles: ['admin', 'director', 'accountant'],
    macroStatus: 'paid',
    inputDoc: 'Банковская выписка по расчетному счету',
    outputDoc: 'Фиксация оплаты в учетной системе',
    description: 'Контроль дебиторской задолженности и закрытие взаимных обязательств.'
  },
  {
    num: 12,
    code: 'p10_archive',
    name: 'Архив заявок',
    ownerRole: 'admin',
    allowedRoles: ['admin', 'director'],
    macroStatus: 'archived',
    inputDoc: 'Полный закрытый пакет первичных документов',
    outputDoc: 'Архивная карточка (только чтение)',
    description: 'Перевод успешно закрытого объекта в архив без возможности случайного редактирования.'
  }
];

export function getProcessByNum(num) {
  return PROCESSES.find(p => p.num === Number(num)) || PROCESSES[0];
}

export function getProcessesForRole(role) {
  if (!role) return [];
  const r = String(role).trim().toLowerCase();
  if (r === 'admin' || r === 'director') return PROCESSES;
  return PROCESSES.filter(p => p.allowedRoles.includes(r));
}

export function canRoleRunProcess(role, processNum) {
  if (!role) return false;
  const r = String(role).trim().toLowerCase();
  if (r === 'admin' || r === 'director') return true;
  const proc = getProcessByNum(processNum);
  return proc ? proc.allowedRoles.includes(r) : false;
}

export function getMacroStatusInfo(statusCode) {
  const code = String(statusCode || 'new').toLowerCase();
  return MACRO_STATUSES[code] || MACRO_STATUSES.new;
}
