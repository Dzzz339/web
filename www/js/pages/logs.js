// public/js/pages/logs.js - Журнал операций и загрузок реестров

var logsImportBatches = [];

function setLogsTab(tab) {
  S.logsTab = tab;
  renderApp();
}

function pageLogs() {
  S.logsTab = S.logsTab || 'batches';

  // Загружаем партии импорта при первом входе
  if (!logsImportBatches.length) {
    api('/import/batches')
      .then(function(batches) {
        logsImportBatches = batches || [];
        var cont = document.getElementById('importBatchesContainer');
        if (cont) cont.innerHTML = renderImportBatchesTable();
        var badge = document.getElementById('badge_batches_count');
        if (badge) badge.textContent = logsImportBatches.length;
      })
      .catch(function(err) {
        console.error('Batches load error:', err);
      });
  }

  function parseRuDate(str) {
    if(!str) return 0;
    var p = str.match(/(\d{2})\.(\d{2})\.(\d{4})[^\d]+(\d{1,2}):(\d{2}):(\d{2})/);
    if(p) return new Date(p[3], p[2]-1, p[1], p[4], p[5], p[6]).getTime();
    return 0;
  }

  var allLogs = [];
  (S.tasks || []).forEach(function(t) {
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

  allLogs.sort((a,b) => b.ts - a.ts);

  var changesRows = allLogs.slice(0, 500).map(function(l) {
    return `
      <tr style="border-bottom: 1px solid var(--border)">
        <td style="padding: 10px 12px; color:var(--text-3); font-size:.75rem; white-space:nowrap">${l.date}</td>
        <td style="padding: 10px 12px; font-weight:600">${escHtml(l.author)}</td>
        <td style="padding: 10px 12px">
          <button class="btn-link" onclick="openCard('${l.taskId.replace(/'/g,"\\'")}')">${escHtml(l.taskId)}</button>
          <div class="t3" style="font-size:.7rem; margin-top:2px">${escHtml(l.addr)}</div>
        </td>
        <td style="padding: 10px 12px" class="t3">${escHtml(l.field)}</td>
        <td style="padding: 10px 12px">
          <span style="text-decoration:line-through;color:var(--red);opacity:.7">${escHtml(l.old || 'пусто')}</span> 
          &rarr; 
          <span style="color:var(--green);font-weight:600">${escHtml(l.new || 'пусто')}</span>
        </td>
      </tr>
    `;
  }).join('');

  var curTab = S.logsTab;

  return `
    <div style="margin-bottom:1.25rem">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:1rem">
        <div>
          <h1 class="page-title" style="margin:0">Журнал операций</h1>
          <div style="font-size:.82rem; color:var(--text-3); margin-top:2px">
            Логирование загруженных реестров Заказчика и детальная история изменений по объектам
          </div>
        </div>
      </div>

      <!-- ВЕРХНИЕ ВКЛАДКИ ЖУРНАЛА -->
      <div class="card-tabs-nav" style="margin-bottom:1.25rem">
        <button type="button" class="card-tab-btn ${curTab === 'batches' ? 'active' : ''}" onclick="setLogsTab('batches')">
          📥 Журнал загрузок реестров <span id="badge_batches_count" style="opacity:.8">(${logsImportBatches ? logsImportBatches.length : '...'})</span>
        </button>
        <button type="button" class="card-tab-btn ${curTab === 'changes' ? 'active' : ''}" onclick="setLogsTab('changes')">
          📋 История правок полей (${allLogs.length})
        </button>
      </div>
    </div>

    <!-- ТАБ 1: ЖУРНАЛ ЗАГРУЗОК РЕЕСТРОВ -->
    <div id="logsPane-batches" style="display:${curTab === 'batches' ? 'block' : 'none'}">
      <div id="importBatchesContainer">
        ${renderImportBatchesTable()}
      </div>
    </div>

    <!-- ТАБ 2: ИСТОРИЯ ИЗМЕНЕНИЙ -->
    <div id="logsPane-changes" style="display:${curTab === 'changes' ? 'block' : 'none'}">
      <div class="card tbl-wrap">
        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:.85rem">
          <thead>
            <tr style="background:var(--bg)">
              <th style="padding: 10px 12px; color:var(--text-3); width:130px">Время</th>
              <th style="padding: 10px 12px; color:var(--text-3); width:150px">Пользователь</th>
              <th style="padding: 10px 12px; color:var(--text-3); width:200px">Объект</th>
              <th style="padding: 10px 12px; color:var(--text-3); width:150px">Что изменил</th>
              <th style="padding: 10px 12px; color:var(--text-3)">Значение (Было &rarr; Стало)</th>
            </tr>
          </thead>
          <tbody>${changesRows || '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-3)">История изменений пуста</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <!-- МОДАЛЬНОЕ ОКНО ПРОСМОТРА ЗАЯВОК ПАРТИИ -->
    <div id="batchTasksModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;padding:1rem">
      <div class="card p" style="max-width:850px;width:100%;max-height:85vh;display:flex;flex-direction:column;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;border-bottom:1px solid var(--border);padding-bottom:.75rem">
          <div>
            <div style="font-weight:700;font-size:1.05rem" id="batchModalTitle">Заявки из партии</div>
            <div style="font-size:.78rem;color:var(--text-3)" id="batchModalSubtitle">Загрузка...</div>
          </div>
          <button class="btn btn-sm btn-ghost" onclick="closeBatchModal()">✕</button>
        </div>
        <div id="batchModalBody" class="tbl-wrap" style="flex:1;overflow:auto">
          <div class="t3" style="text-align:center;padding:2rem">Загрузка заявок...</div>
        </div>
        <div style="margin-top:1rem;text-align:right">
          <button class="btn btn-sm" onclick="closeBatchModal()">Закрыть</button>
        </div>
      </div>
    </div>
  `;
}

function renderImportBatchesTable() {
  if (!logsImportBatches || !logsImportBatches.length) {
    return '<div class="card p" style="text-align:center;padding:3rem;color:var(--text-3)">Записи о загрузках реестров пока отсутствуют. При следующем импорте Excel файл будет зафиксирован здесь.</div>';
  }

  var rows = logsImportBatches.map(function(b) {
    var dateStr = b.imported_at ? new Date(b.imported_at).toLocaleString('ru-RU') : '—';
    var newBadge = Number(b.new_tasks_count) > 0 
      ? '<span class="badge b-green" style="font-size:.75rem">+' + b.new_tasks_count + ' новых</span>' 
      : '<span class="t3" style="font-size:.75rem">0 новых</span>';
    var updBadge = Number(b.updated_tasks_count) > 0 
      ? '<span class="badge b-blue" style="font-size:.75rem">↻ ' + b.updated_tasks_count + ' обновлено</span>' 
      : '';

    return `
      <tr style="border-bottom: 1px solid var(--border)">
        <td style="padding: 10px 12px; font-weight:600; font-size:.82rem; white-space:nowrap">${dateStr}</td>
        <td style="padding: 10px 12px">
          <div style="font-weight:700; color:var(--text); font-size:.85rem">📄 ${escHtml(b.file_name)}</div>
          <div style="font-size:.72rem; color:var(--text-3); margin-top:2px">Партия #${b.id}</div>
        </td>
        <td style="padding: 10px 12px; font-size:.82rem">${escHtml(b.user_name || 'Администратор')}</td>
        <td style="padding: 10px 12px; font-weight:700; font-size:.85rem">${b.total_rows || 0}</td>
        <td style="padding: 10px 12px">
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
            ${newBadge}
            ${updBadge}
          </div>
        </td>
        <td style="padding: 10px 12px; text-align:right">
          <button class="btn btn-sm btn-ghost" onclick="viewBatchTasks(${b.id}, '${escHtml(b.file_name)}')">👁️ Заявки партии</button>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card tbl-wrap">
      <table style="width:100%; border-collapse:collapse; text-align:left; font-size:.85rem">
        <thead>
          <tr style="background:var(--bg)">
            <th style="padding: 10px 12px; color:var(--text-3); width:150px">Дата и время</th>
            <th style="padding: 10px 12px; color:var(--text-3)">Файл реестра</th>
            <th style="padding: 10px 12px; color:var(--text-3); width:150px">Кто загрузил</th>
            <th style="padding: 10px 12px; color:var(--text-3); width:100px">Всего строк</th>
            <th style="padding: 10px 12px; color:var(--text-3); width:180px">Результат</th>
            <th style="padding: 10px 12px; color:var(--text-3); width:130px; text-align:right">Действия</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function viewBatchTasks(batchId, fileName) {
  var modal = document.getElementById('batchTasksModal');
  var title = document.getElementById('batchModalTitle');
  var sub = document.getElementById('batchModalSubtitle');
  var body = document.getElementById('batchModalBody');
  if (!modal) return;

  modal.style.display = 'flex';
  title.textContent = 'Заявки из файла: ' + fileName;
  sub.textContent = 'Загрузка списка заявок партии #' + batchId + '...';
  body.innerHTML = '<div class="t3" style="text-align:center;padding:2rem">Загрузка...</div>';

  api('/import/batches/' + batchId + '/tasks')
    .then(function(tasks) {
      if (!Array.isArray(tasks) || !tasks.length) {
        body.innerHTML = '<div class="t3" style="text-align:center;padding:2rem">В этой партии нет привязанных заявок.</div>';
        sub.textContent = 'Партия #' + batchId + ' · 0 заявок';
        return;
      }
      sub.textContent = 'Партия #' + batchId + ' · Показано ' + tasks.length + ' заявок';

      var rows = tasks.map(function(t) {
        var dateZ = t.date_zayavki ? new Date(t.date_zayavki).toLocaleDateString('ru-RU') : '—';
        return `
          <tr style="border-bottom: 1px solid var(--border)">
            <td style="padding: 8px 10px; font-weight:700">
              <button class="btn-link" onclick="closeBatchModal(); openCard('${t.id}')">${t.id}</button>
            </td>
            <td style="padding: 8px 10px; font-size:.78rem">${escHtml(t.region || '—')}</td>
            <td style="padding: 8px 10px; font-size:.8rem">${escHtml(t.address || '—')}</td>
            <td style="padding: 8px 10px; font-size:.78rem">${escHtml(t.work_type || '—')}</td>
            <td style="padding: 8px 10px; font-size:.78rem">${dateZ}</td>
          </tr>
        `;
      }).join('');

      body.innerHTML = `
        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:.82rem">
          <thead>
            <tr style="background:var(--bg)">
              <th style="padding: 8px 10px; color:var(--text-3)">Номер</th>
              <th style="padding: 8px 10px; color:var(--text-3)">Регион</th>
              <th style="padding: 8px 10px; color:var(--text-3)">Адрес объекта</th>
              <th style="padding: 8px 10px; color:var(--text-3)">Вид работ</th>
              <th style="padding: 8px 10px; color:var(--text-3)">Дата Заказчика</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    })
    .catch(function(err) {
      body.innerHTML = '<div class="t3" style="text-align:center;padding:2rem;color:var(--red)">Ошибка: ' + err.message + '</div>';
    });
}

function closeBatchModal() {
  var modal = document.getElementById('batchTasksModal');
  if (modal) modal.style.display = 'none';
}

window.setLogsTab = setLogsTab;
window.viewBatchTasks = viewBatchTasks;
window.closeBatchModal = closeBatchModal;
