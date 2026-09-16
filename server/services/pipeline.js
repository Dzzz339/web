// Константы и функции ролевого жизненного цикла ИД («Контроль ИД»)
export const ID_ROLES = {
  unassigned: 'Без роли',
  manager:    'Менеджер',
  designer:   'Проектировщик',
  dispatch:   'Отдел отправки',
  payments:   'Оплаты',
  leader:     'Руководитель',
  admin:      'Администратор',
  worker:     'Монтажник'
};

export const ID_STEPS = [
  { label: 'Монтаж начат',        role: 'manager' },
  { label: 'Объект готов',        role: 'manager' },
  { label: 'Материалы переданы',  role: 'manager', link: true },
  { label: 'Взял ИД в работу',    role: 'designer' },
  { label: 'ИД готова',           role: 'designer', link: true },
  { label: 'ИД отправлена в Сбер', role: 'dispatch' },
  { label: 'Сбер принял ИД',      role: 'dispatch' },
  { label: 'Передано на оплату',  role: 'payments' },
  { label: 'Оплачено',            role: 'payments' },
];

export const ID_STAGES = [
  'Новая',              // 0
  'В монтаже',          // 1
  'Ждёт материалов',    // 2
  'Очередь ИД',         // 3
  'Проектирование',     // 4
  'Готова к отправке',  // 5
  'Ждёт приёмки',       // 6
  'К оплате',           // 7
  'Ждёт оплаты',        // 8
  'Завершена',          // 9
];

export function businessDue(start, days = 3) {
  let d = new Date(start || Date.now());
  for (let n = 0; n < days;) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++;
  }
  return d.toISOString();
}

export function hasRole(user, ...wanted) {
  if (!user || !user.role) return false;
  const userRoles = String(user.role).split(',').map(r => r.trim());
  if (userRoles.includes('admin') || userRoles.includes('leader')) return true;
  return userRoles.some(r => wanted.includes(r));
}

export function canStep(user, task) {
  if (!user || !task) return false;
  const stageNum = Number(task.stage_num !== undefined ? task.stage_num : task.stageNum) || 0;
  const s = ID_STEPS[stageNum];
  if (!s || task.archived) return false;
  if (hasRole(user, 'admin', 'leader')) return true;
  if (s.role === 'manager') {
    const mgrId = task.manager_id !== undefined ? task.manager_id : task.managerId;
    return hasRole(user, 'manager') && (!mgrId || Number(mgrId) === Number(user.id));
  }
  if (s.role === 'designer') {
    const dsgId = task.designer_id !== undefined ? task.designer_id : task.designerId;
    return hasRole(user, 'designer') && (!dsgId || Number(dsgId) === Number(user.id) || stageNum === 3);
  }
  return hasRole(user, s.role);
}

export function canUndo(user, task) {
  if (!user || !task) return false;
  const stageNum = Number(task.stage_num !== undefined ? task.stage_num : task.stageNum) || 0;
  if (task.archived || stageNum <= 0) return false;
  if (hasRole(user, 'admin', 'leader')) return true;
  const prevStep = ID_STEPS[stageNum - 1];
  return !!prevStep && hasRole(user, prevStep.role);
}

// Чистая и мгновенная очистка данных на JavaScript (без вызова Питона)
export function cleanData(data) {
  const numericFields = ['amount', 'distanceKm', 'pricePerUnit', 'tmc', 'extras', 'overdueDays', 'inOrder', 'fact'];
  return data.map(row => {
    const newRow = { ...row };
    for (const key of Object.keys(newRow)) {
      let val = newRow[key];
      if (typeof val === 'string') {
        val = val.trim();
        if (key === 'region' && val) {
          val = val.charAt(0).toUpperCase() + val.slice(1);
        }
        if (numericFields.includes(key)) {
          const numStr = val.replace(/,/g, '.').replace(/[^0-9.-]/g, '');
          val = parseFloat(numStr) || 0.0;
        }
      } else if (val === null && numericFields.includes(key)) {
        val = 0.0;
      }
      newRow[key] = val;
    }
    return newRow;
  });
}

export function getInitialStage(status, t) {
  if (t && t.stage) return t.stage;
  const s = String(status || (t ? t.status : '') || '').toLowerCase();
  if (s === 'cancelled') return null;

  const oplata = t ? String(t.oplata || '').toLowerCase() : '';
  const priemka = t ? String(t.priemka || '').toLowerCase() : '';
  const idStatus = t ? String(t.idStatus || '').toLowerCase() : '';
  const obsledovanie = t ? String(t.obsledovanie || '').toLowerCase() : '';
  const fact = t ? (Number(t.fact) || 0) : 0;
  const inOrder = t ? (Number(t.inOrder) || 0) : 0;
  const dataVyhoda = t ? t.dataVyhoda : null;

  if (s === 'paid' || oplata.includes('оплач') || oplata.includes('да') || oplata.includes('+') || idStatus.includes('оплач')) {
    return 'payment';
  }
  if (s === 'done' || priemka.includes('принят') || priemka.includes('да') || priemka.includes('+') || idStatus.includes('принят')) {
    return 'acceptance';
  }
  if (fact > 0 && inOrder > 0 && fact >= inOrder) {
    return 'control';
  }
  if (dataVyhoda || fact > 0 || s === 'progress') {
    return 'install';
  }
  if (obsledovanie && obsledovanie !== '-' && obsledovanie !== 'нет') {
    return 'survey';
  }
  return 'request';
}
