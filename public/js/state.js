// ─── STATE ───────────────────────────────────────────────────────────────────
var S = {
  user: JSON.parse(localStorage.getItem('user')) || null,
  token: localStorage.getItem('token') || null,
  page: 'dashboard',
  isOnline: navigator.onLine !== false,
  outboxCount: 0,
  syncing: false,
  tasks: [], chains: [], stats: {}, importInfo: null, users: [], contractors: [], notifications: [],
  selChain: null, selChainStep: null, chainMgr: '',
  taskQ: '', taskSt: '', taskPr: '', taskReg: '', taskMgr: '', taskYear: '', taskOverdue: '',
  taskCustomer: '',
  taskContractor: '',
  taskArch: 'no',
  taskStage: '', taskSort: '', taskView: 'all',
  taskFinanceMode: 'customer', taskDistanceFilter: '',
  kanbanQ: '', kanbanReg: '', kanbanMgr: '', kanbanCustomer: '',
  cardId: null, cardDraft: {}, cardConfirmOpen: false, cardTab: 'main', helpTab: 'quickstart',
  cpTaskId: null, cpMode: 'search', cpQuery: '',
  marches: [], marchId: null,
  aiActive: false, aiMode: 'general', aiMessages: [], aiLoading: false, aiStreaming: false, aiStreamText: '',
  supplyTab: 'stages'
};

// Векторные монохромные SVG-иконки (стиль Lucide / Feather)
var ICONS = {
  tasks:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  kanban:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="11" y="4" width="5" height="10" rx="1.5"/><rect x="19" y="4" width="5" height="14" rx="1.5"/></svg>',
  marches:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>',
  supply:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  dashboard:   '<svg viewBox="0 0 24 24" fill="none" stroke="#FF6200" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" fill="#FFFFFF" stroke="#FF6200"/><rect width="7" height="5" x="14" y="3" rx="1" fill="#FFFFFF" stroke="#FF6200"/><rect width="7" height="9" x="14" y="12" rx="1" fill="#FFFFFF" stroke="#FF6200"/><rect width="7" height="5" x="3" y="16" rx="1" fill="#FFFFFF" stroke="#FF6200"/></svg>',
  analytics:   '<svg viewBox="0 0 24 24" fill="none" stroke="#FF6200" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18" stroke="#FF6200"/><rect x="7" y="10" width="3.5" height="8" rx="1" fill="#FFFFFF" stroke="#FF6200"/><rect x="12.5" y="6" width="3.5" height="12" rx="1" fill="#FFFFFF" stroke="#FF6200"/><rect x="18" y="12" width="3" height="6" rx="1" fill="#FFFFFF" stroke="#FF6200"/></svg>',
  contractors: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>',
  users:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  data:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>',
  stocky:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>',
  chat:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  tech:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  calc:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>',
  box:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  clip:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
  logs:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>',
  profile:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  help:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  logout:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
};

var NAV_SECTIONS = [
  {
    title: 'ОСНОВНОЕ',
    items: [
      { id: 'tasks',       icon: ICONS.tasks,       label: 'Заявки' },
      { id: 'kanban',      icon: ICONS.kanban,      label: 'Канбан' },
      { id: 'marches',     icon: ICONS.marches,     label: 'Маршруты' },
      { id: 'supply',      icon: ICONS.supply,      label: 'Цепи' }
    ]
  },
  {
    title: 'АНАЛИТИКА',
    items: [
      { 
        id: 'dashboard',   
        icon: ICONS.dashboard,   
        label: 'Обзор',
        hasChildren: true,
        children: [
          { id: 'dash-summary',     label: 'Сводка' },
          { id: 'dash-customers',   label: 'Заказчики' },
          { id: 'dash-executors',   label: 'Исполнители' },
          { id: 'dash-calendar',    label: 'Календарь' },
          { id: 'dash-materials',   label: 'Материалы' },
          { id: 'dash-payments-in', label: 'Оплаты нам' },
          { id: 'dash-payments-out',label: 'Оплаты наши' }
        ]
      }
    ]
  },
  {
    title: 'УПРАВЛЕНИЕ',
    items: [
      { id: 'contractors', icon: ICONS.contractors, label: 'Контрагенты' },
      { id: 'users',       icon: ICONS.users,       label: 'Команда' }
    ]
  },
  {
    title: 'СЕРВИС',
    items: [
      { id: 'aichat',      icon: ICONS.stocky,      label: 'Стоки' },
      { id: 'data',        icon: ICONS.data,        label: 'Данные' },
      { id: 'chat',        icon: ICONS.chat,        label: 'Чат' },
      { id: 'logs',        icon: ICONS.logs,        label: 'Журнал' },
      { id: 'help',        icon: ICONS.help,        label: 'Инструкция' }
    ]
  }
];

var NAV = [];
NAV_SECTIONS.forEach(function(sec) {
  NAV = NAV.concat(sec.items);
});

// ─── OFFLINE-FIRST & INDEXEDDB ────────────────────────────────────────────────
var OFFLINE_DB_NAME = 'StockeasyOfflineDB';
var OFFLINE_DB_VERSION = 1;
var _offlineDbPromise = null;
