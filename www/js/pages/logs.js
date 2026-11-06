function pageLogs() {
  var allLogs = [];
  
  // Вспомогательная функция для перевода даты "14.07.2024, 15:30:00" в миллисекунды для сортировки
  function parseRuDate(str) {
    if(!str) return 0;
    var p = str.match(/(\d{2})\.(\d{2})\.(\d{4})[^\d]+(\d{1,2}):(\d{2}):(\d{2})/);
    if(p) return new Date(p[3], p[2]-1, p[1], p[4], p[5], p[6]).getTime();
    return 0;
  }

  // Собираем историю со всех заявок
  S.tasks.forEach(function(t) {
    (t._history || []).forEach(function(h) {
      allLogs.push({
        taskId: t.id,
        addr: (t.address || '').slice(0, 40),
        date: h.date,
        author: h.author || 'Неизвестно',
        field: h.field,
        old: h.old,
        new: h.new,
        ts: parseRuDate(h.date)
      });
    });
  });

  // Сортируем: свежие события сверху
  allLogs.sort((a,b) => b.ts - a.ts);

  var rows = allLogs.slice(0, 500).map(function(l) {
    return `
      <tr style="border-bottom: 1px solid var(--border)">
        <td style="padding: 10px 12px; color:var(--text-3); font-size:.75rem; white-space:nowrap">${l.date}</td>
        <td style="padding: 10px 12px; font-weight:600">${l.author}</td>
        <td style="padding: 10px 12px">
          <button class="btn-link" onclick="openCard('${l.taskId.replace(/'/g,"\\'")}')">${l.taskId}</button>
          <div class="t3" style="font-size:.7rem; margin-top:2px">${l.addr}</div>
        </td>
        <td style="padding: 10px 12px" class="t3">${l.field}</td>
        <td style="padding: 10px 12px">
          <span style="text-decoration:line-through;color:var(--red);opacity:.7">${l.old || 'пусто'}</span> 
          &rarr; 
          <span style="color:var(--green);font-weight:600">${l.new || 'пусто'}</span>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <h1 class="page-title">Журнал событий</h1>
    <div class="card tbl-wrap">
      <table style="width:100%; border-collapse:collapse; text-align:left; font-size:.85rem">
        <thead>
          <tr style="background:var(--bg)">
            <th style="padding: 10px 12px; color:var(--text-3)">Время</th>
            <th style="padding: 10px 12px; color:var(--text-3)">Пользователь</th>
            <th style="padding: 10px 12px; color:var(--text-3)">Объект</th>
            <th style="padding: 10px 12px; color:var(--text-3)">Что изменил</th>
            <th style="padding: 10px 12px; color:var(--text-3)">Значение</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:2rem">История пуста</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

