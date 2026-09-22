// server/config/roles.js - Единый справочник и матрица ролей Stockeasy

export const ROLES = {
  admin: {
    code: 'admin',
    name: 'Администратор',
    icon: '⚙️',
    badgeClass: 'b-red',
    color: '#B91C1C',
    description: 'Полный доступ ко всей системе, настройкам, пользователям и журналам'
  },
  director: {
    code: 'director',
    name: 'Руководитель',
    icon: '👔',
    badgeClass: 'b-purple',
    color: '#7E22CE',
    description: 'Сквозной обзор всех регионов, глобальная аналитика, сводные отчеты и KPI'
  },
  manager: {
    code: 'manager',
    name: 'Менеджер',
    icon: '📋',
    badgeClass: 'b-blue',
    color: '#1D4ED8',
    description: 'Ведение заявок, работа с заказчиками и подрядчиками, аналитика по своим регионам'
  },
  to_engineer: {
    code: 'to_engineer',
    name: 'Специалист ТО',
    icon: '🛠️',
    badgeClass: 'b-cyan',
    color: '#0E7490',
    description: 'Внешние контракты, ТЗ, ввод/вывод нормативных данных по заказчикам, документация'
  },
  logistics: {
    code: 'logistics',
    name: 'Специалист по логистике',
    icon: '📦',
    badgeClass: 'b-yellow',
    color: '#B45309',
    description: 'Снабжение, ТМЦ, перемещения по складам, заявки подрядчикам, контроль отгрузок'
  },
  designer: {
    code: 'designer',
    name: 'Проектировщик',
    icon: '📐',
    badgeClass: 'b-teal',
    color: '#0F766E',
    description: 'Сроки, материалы, кабельные журналы, прием заявок от монтажников, выпуск ИД'
  },
  accountant: {
    code: 'accountant',
    name: 'Финансист',
    icon: '💳',
    badgeClass: 'b-green',
    color: '#15803D',
    description: 'Финансовая аналитика, акты КС-2/КС-3, счета подрядчиков, оплаты вход/выход'
  },
  installer: {
    code: 'installer',
    name: 'Монтажник',
    icon: '👷',
    badgeClass: 'b-gray',
    color: '#71717A',
    description: 'Полевые работы, чек-листы, наряды, фотоотчеты, списание материалов по факту'
  }
};

// Поддержка алиаса worker -> installer
export function normalizeRole(role) {
  if (!role) return 'installer';
  const r = String(role).trim().toLowerCase();
  if (r === 'worker') return 'installer';
  return ROLES[r] ? r : 'installer';
}

export function getRoleInfo(role) {
  const norm = normalizeRole(role);
  return ROLES[norm] || ROLES.installer;
}

export function isValidRole(role) {
  if (!role) return false;
  const r = String(role).trim().toLowerCase();
  return Boolean(ROLES[r] || r === 'worker');
}

export const ROLE_LIST = Object.values(ROLES);
