// public/js/schemeEditor.js
// Графический редактор исполнительных схем трасс СКС и розеток (HTML5 Canvas)
// Полная сквозная интеграция с карточкой заявки, вложениями и Альбомом ИД (PDF/Excel)

(function() {
  'use strict';

  var _state = {
    taskId: null,
    canvas: null,
    ctx: null,
    width: 1400,
    height: 900,
    mode: 'line', // 'pencil', 'line', 'rect', 'outlet', 'cabinet', 'text', 'eraser'
    color: '#1d4ed8', // Cat 5e синий
    lineWidth: 3,
    showGrid: true,
    gridSize: 25,
    isDrawing: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    backgroundImage: null, // подложка БТИ / эвакуации
    undoStack: [],
    redoStack: [],
    maxUndo: 25,
    outletCounter: 1,
    taskData: null
  };

  /**
   * Открыть графический редактор схемы СКС
   * @param {string} taskId
   */
  window.openSchemeEditor = function(taskId) {
    _state.taskId = taskId;
    _state.taskData = (window.S && window.S.tasks) ? window.S.tasks.find(function(t) { return String(t.id) === String(taskId); }) : null;
    _state.undoStack = [];
    _state.redoStack = [];
    _state.backgroundImage = null;
    _state.outletCounter = 1;
    _state.mode = 'line';
    _state.color = '#1d4ed8';

    // Удаляем предыдущую модалку, если осталась
    var old = document.getElementById('_scheme_editor_modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = '_scheme_editor_modal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);z-index:999999;display:flex;flex-direction:column;padding:0;overflow:hidden;backdrop-filter:blur(4px)';

    modal.innerHTML = 
      '<div style="display:flex;flex-direction:column;width:100%;height:100vh;background:#f8fafc;overflow:hidden">' +
        // 1. Верхний заголовок и основные кнопки
        '<header style="display:flex;justify-content:space-between;align-items:center;padding:10px 20px;background:#0f172a;color:#fff;border-bottom:1px solid #334155;flex-wrap:wrap;gap:10px">' +
          '<div style="display:flex;align-items:center;gap:12px">' +
            '<span style="font-size:1.4rem">📐</span>' +
            '<div>' +
              '<div style="font-weight:700;font-size:1.05rem;letter-spacing:.3px">Редактор исполнительной схемы СКС · Заявка № ' + escHtml(taskId) + '</div>' +
              '<div style="font-size:.78rem;color:#94a3b8">' + escHtml((_state.taskData && _state.taskData.address) || 'Чертеж помещения, трасс кабеля и розеток') + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<label class="btn btn-sm" style="background:#334155;color:#fff;cursor:pointer;font-size:.82rem;font-weight:600;display:inline-flex;align-items:center;gap:5px" title="Загрузить фото/план помещения (БТИ, план эвакуации) в качестве подложки">' +
              '<span>🖼️ Подложка (план БТИ)</span>' +
              '<input type="file" id="_scheme_backdrop_input" accept="image/*" style="display:none">' +
            '</label>' +
            '<button type="button" class="btn btn-sm" id="_scheme_undo_btn" style="background:#334155;color:#fff;font-size:.82rem" title="Отменить последнее действие (Ctrl+Z)">↩️ Отмена</button>' +
            '<button type="button" class="btn btn-sm" id="_scheme_clear_btn" style="background:#475569;color:#fff;font-size:.82rem" title="Очистить холст">🗑️ Очистить</button>' +
            '<button type="button" class="btn btn-sm" id="_scheme_save_btn" style="background:#16a34a;color:#fff;font-weight:700;font-size:.85rem;padding:6px 16px;box-shadow:0 2px 8px rgba(22,163,74,0.4)" title="Сохранить схему в заявку (будет вшита в Альбом ИД)">💾 Сохранить в заявку</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" id="_scheme_close_btn" style="color:#94a3b8;font-size:1.2rem;padding:2px 8px;line-height:1" title="Закрыть редактор">✕</button>' +
          '</div>' +
        '</header>' +

        // 2. Панель инструментов (Toolbar)
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 20px;background:#ffffff;border-bottom:1.5px solid #e2e8f0;flex-wrap:wrap;gap:12px;box-shadow:0 1px 4px rgba(0,0,0,0.03)">' +
          // Режимы рисования
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<span style="font-size:.76rem;font-weight:700;color:#64748b;text-transform:uppercase;margin-right:4px">Инструменты:</span>' +
            '<button type="button" class="btn btn-sm _scheme_tool_btn" data-mode="line" style="font-size:.8rem;padding:4px 10px;font-weight:600" title="Прямая линия (ровная трасса СКС)">📏 Линия</button>' +
            '<button type="button" class="btn btn-sm _scheme_tool_btn" data-mode="pencil" style="font-size:.8rem;padding:4px 10px;font-weight:600" title="Карандаш (свободная трасса кабеля)">✏️ Карандаш</button>' +
            '<button type="button" class="btn btn-sm _scheme_tool_btn" data-mode="rect" style="font-size:.8rem;padding:4px 10px;font-weight:600" title="Комната / стена / стол">⬜ Комната</button>' +
            '<button type="button" class="btn btn-sm _scheme_tool_btn" data-mode="outlet" style="font-size:.8rem;padding:4px 10px;font-weight:600" title="Штамп информационной розетки 2xRJ45">🔌 Розетка RJ-45</button>' +
            '<button type="button" class="btn btn-sm _scheme_tool_btn" data-mode="cabinet" style="font-size:.8rem;padding:4px 10px;font-weight:600" title="Штамп телеком-шкафа (ТКШ)">🗄️ Шкаф ТКШ</button>' +
            '<button type="button" class="btn btn-sm _scheme_tool_btn" data-mode="text" style="font-size:.8rem;padding:4px 10px;font-weight:600" title="Подписать помещение / кабинет">🔤 Текст</button>' +
            '<button type="button" class="btn btn-sm _scheme_tool_btn" data-mode="eraser" style="font-size:.8rem;padding:4px 10px;font-weight:600" title="Ластик">🧹 Ластик</button>' +
          '</div>' +

          // Цвета и толщина
          '<div style="display:flex;align-items:center;gap:14px">' +
            '<div style="display:flex;align-items:center;gap:6px">' +
              '<span style="font-size:.76rem;font-weight:700;color:#64748b;text-transform:uppercase">Тип линии:</span>' +
              '<button type="button" class="_scheme_color_btn active" data-color="#1d4ed8" style="width:24px;height:24px;border-radius:50%;background:#1d4ed8;border:2px solid #fff;box-shadow:0 0 0 2px #1d4ed8;cursor:pointer" title="Витая пара Cat 5e/6 (Синий)"></button>' +
              '<button type="button" class="_scheme_color_btn" data-color="#16a34a" style="width:24px;height:24px;border-radius:50%;background:#16a34a;border:2px solid #fff;box-shadow:0 0 0 1px #cbd5e1;cursor:pointer" title="Запас / Резерв (Зеленый)"></button>' +
              '<button type="button" class="_scheme_color_btn" data-color="#ea580c" style="width:24px;height:24px;border-radius:50%;background:#ea580c;border:2px solid #fff;box-shadow:0 0 0 1px #cbd5e1;cursor:pointer" title="Оптика / Магистраль (Оранжевый)"></button>' +
              '<button type="button" class="_scheme_color_btn" data-color="#0f172a" style="width:24px;height:24px;border-radius:50%;background:#0f172a;border:2px solid #fff;box-shadow:0 0 0 1px #cbd5e1;cursor:pointer" title="Стены / Перегородки (Черный)"></button>' +
              '<button type="button" class="_scheme_color_btn" data-color="#dc2626" style="width:24px;height:24px;border-radius:50%;background:#dc2626;border:2px solid #fff;box-shadow:0 0 0 1px #cbd5e1;cursor:pointer" title="Электропитание / Опасность (Красный)"></button>' +
            '</div>' +

            '<div style="display:flex;align-items:center;gap:6px">' +
              '<span style="font-size:.76rem;font-weight:700;color:#64748b;text-transform:uppercase">Толщина:</span>' +
              '<select id="_scheme_width_select" style="font-size:.8rem;padding:3px 8px;border-radius:6px;border:1px solid #cbd5e1;font-weight:600">' +
                '<option value="2">2 px (тонкая)</option>' +
                '<option value="4" selected>4 px (нормальная)</option>' +
                '<option value="7">7 px (жирная)</option>' +
                '<option value="12">12 px (трасса-короб)</option>' +
              '</select>' +
            '</div>' +

            '<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:.82rem;font-weight:600;color:#475569">' +
              '<input type="checkbox" id="_scheme_grid_checkbox" checked> <span>Сетка</span>' +
            '</label>' +
          '</div>' +
        '</div>' +

        // 3. Рабочая область с холстом (Canvas workspace)
        '<div id="_scheme_canvas_wrap" style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;background:#cbd5e1;padding:20px;position:relative">' +
          '<div style="box-shadow:0 12px 36px rgba(0,0,0,0.25);border-radius:6px;background:#fff;line-height:0;position:relative">' +
            '<canvas id="_scheme_canvas" width="' + _state.width + '" height="' + _state.height + '" style="display:block;cursor:crosshair;border-radius:6px"></canvas>' +
            // Нижний штамп по ГОСТу в правом нижнем углу холста (водяной блок)
            '<div id="_scheme_stamp" style="position:absolute;bottom:0;right:0;width:340px;background:rgba(255,255,255,0.95);border-top:1.5px solid #0f172a;border-left:1.5px solid #0f172a;padding:8px 12px;font-family:sans-serif;font-size:11px;color:#0f172a;line-height:1.35;pointer-events:none;border-bottom-right-radius:6px">' +
              '<div style="font-weight:800;font-size:12px;border-bottom:1px solid #cbd5e1;padding-bottom:3px;margin-bottom:3px;text-transform:uppercase">Исполнительная схема трасс СКС</div>' +
              '<div>Заказчик: <b>' + escHtml((_state.taskData && _state.taskData.customer) || 'ПАО Сбербанк') + '</b></div>' +
              '<div>Объект: <b>' + escHtml((_state.taskData && _state.taskData.address) || '—') + '</b></div>' +
              '<div style="display:flex;justify-content:space-between;margin-top:2px;font-size:10px;color:#475569">' +
                '<span>Заявка № ' + escHtml(taskId) + '</span>' +
                '<span>Лист 5 (ИД-05)</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    _initCanvas();
    _bindEvents();
    _checkAndLoadExistingScheme(taskId);
  };

  function _initCanvas() {
    _state.canvas = document.getElementById('_scheme_canvas');
    if (!_state.canvas) return;
    _state.ctx = _state.canvas.getContext('2d');
    _redrawAll();
    _saveSnapshot();
  }

  function _redrawAll() {
    var ctx = _state.ctx;
    var w = _state.width;
    var h = _state.height;

    ctx.clearRect(0, 0, w, h);

    // Белый фон
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Подложка (план БТИ), если есть
    if (_state.backgroundImage) {
      try {
        ctx.drawImage(_state.backgroundImage, 0, 0, w, h);
      } catch (e) {
        console.error('Error drawing background:', e);
      }
    }

    // Сетка (если включена)
    if (_state.showGrid) {
      ctx.save();
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      var step = _state.gridSize;
      ctx.beginPath();
      for (var x = step; x < w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (var y = step; y < h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // Усиленная сетка 100px
      ctx.strokeStyle = '#e2e8f0';
      ctx.beginPath();
      for (var x2 = step * 4; x2 < w; x2 += step * 4) {
        ctx.moveTo(x2, 0);
        ctx.lineTo(x2, h);
      }
      for (var y2 = step * 4; y2 < h; y2 += step * 4) {
        ctx.moveTo(0, y2);
        ctx.lineTo(w, y2);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function _saveSnapshot() {
    if (!_state.canvas) return;
    try {
      var dataUrl = _state.canvas.toDataURL('image/png');
      _state.undoStack.push(dataUrl);
      if (_state.undoStack.length > _state.maxUndo) {
        _state.undoStack.shift();
      }
      _state.redoStack = [];
    } catch (e) {
      console.warn('Could not save canvas snapshot:', e);
    }
  }

  function _undo() {
    if (_state.undoStack.length <= 1) {
      if (typeof showToast === 'function') showToast('Нечего отменять', 'info');
      return;
    }
    var current = _state.undoStack.pop();
    _state.redoStack.push(current);
    var prev = _state.undoStack[_state.undoStack.length - 1];
    var img = new Image();
    img.onload = function() {
      _state.ctx.clearRect(0, 0, _state.width, _state.height);
      _state.ctx.drawImage(img, 0, 0);
    };
    img.src = prev;
  }

  function _bindEvents() {
    var c = _state.canvas;
    if (!c) return;

    // Режимы инструментов
    var toolBtns = document.querySelectorAll('._scheme_tool_btn');
    toolBtns.forEach(function(btn) {
      if (btn.getAttribute('data-mode') === _state.mode) {
        btn.classList.add('btn-primary');
      } else {
        btn.classList.add('btn-ghost');
      }
      btn.onclick = function() {
        toolBtns.forEach(function(b){ b.classList.remove('btn-primary'); b.classList.add('btn-ghost'); });
        btn.classList.remove('btn-ghost');
        btn.classList.add('btn-primary');
        _state.mode = btn.getAttribute('data-mode');
      };
    });

    // Цвета
    var colorBtns = document.querySelectorAll('._scheme_color_btn');
    colorBtns.forEach(function(btn) {
      btn.onclick = function() {
        colorBtns.forEach(function(b){ b.style.boxShadow = '0 0 0 1px #cbd5e1'; });
        btn.style.boxShadow = '0 0 0 2px ' + btn.getAttribute('data-color');
        _state.color = btn.getAttribute('data-color');
      };
    });

    // Толщина
    var wSel = document.getElementById('_scheme_width_select');
    if (wSel) {
      wSel.onchange = function() {
        _state.lineWidth = Number(wSel.value) || 4;
      };
    }

    // Сетка
    var gridCb = document.getElementById('_scheme_grid_checkbox');
    if (gridCb) {
      gridCb.onchange = function() {
        _state.showGrid = gridCb.checked;
        _redrawAll();
        if (_state.undoStack.length > 0) {
          var last = _state.undoStack[_state.undoStack.length - 1];
          var img = new Image();
          img.onload = function() {
            _state.ctx.drawImage(img, 0, 0);
          };
          img.src = last;
        }
      };
    }

    // Загрузка подложки (БТИ)
    var bgInp = document.getElementById('_scheme_backdrop_input');
    if (bgInp) {
      bgInp.onchange = function(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(evt) {
          var img = new Image();
          img.onload = function() {
            _state.backgroundImage = img;
            _redrawAll();
            _saveSnapshot();
            if (typeof showToast === 'function') showToast('✓ План помещения загружен как подложка', 'success');
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      };
    }

    // Кнопка отмены
    var undoBtn = document.getElementById('_scheme_undo_btn');
    if (undoBtn) undoBtn.onclick = _undo;

    // Кнопка очистки
    var clearBtn = document.getElementById('_scheme_clear_btn');
    if (clearBtn) {
      clearBtn.onclick = function() {
        if (!confirm('Очистить весь чертеж?')) return;
        _state.backgroundImage = null;
        _redrawAll();
        _saveSnapshot();
      };
    }

    // Закрытие
    var closeBtn = document.getElementById('_scheme_close_btn');
    if (closeBtn) {
      closeBtn.onclick = function() {
        var modal = document.getElementById('_scheme_editor_modal');
        if (modal) modal.remove();
      };
    }

    // Сохранение схемы в заявку
    var saveBtn = document.getElementById('_scheme_save_btn');
    if (saveBtn) {
      saveBtn.onclick = _saveSchemeToTask;
    }

    // Горячие клавиши Ctrl+Z
    window.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        var m = document.getElementById('_scheme_editor_modal');
        if (m) {
          e.preventDefault();
          _undo();
        }
      }
    });

    // ─── МЫШЬ И СЕНСОРНЫЕ СОБЫТИЯ ХОЛСТА ──────────────────────────────────────
    function getCoords(e) {
      var rect = c.getBoundingClientRect();
      var clientX = e.clientX;
      var clientY = e.clientY;
      if (e.touches && e.touches[0]) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }
      var scaleX = c.width / rect.width;
      var scaleY = c.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    c.onmousedown = function(e) {
      var pt = getCoords(e);
      _onPointerDown(pt.x, pt.y);
    };

    c.onmousemove = function(e) {
      var pt = getCoords(e);
      _onPointerMove(pt.x, pt.y);
    };

    c.onmouseup = function(e) {
      var pt = getCoords(e);
      _onPointerUp(pt.x, pt.y);
    };

    c.onmouseleave = function() {
      if (_state.isDrawing) {
        _state.isDrawing = false;
        _saveSnapshot();
      }
    };

    // Touch события для смартфонов и планшетов
    c.ontouchstart = function(e) {
      e.preventDefault();
      var pt = getCoords(e);
      _onPointerDown(pt.x, pt.y);
    };

    c.ontouchmove = function(e) {
      e.preventDefault();
      var pt = getCoords(e);
      _onPointerMove(pt.x, pt.y);
    };

    c.ontouchend = function(e) {
      e.preventDefault();
      _onPointerUp(_state.lastX, _state.lastY);
    };
  }

  function _onPointerDown(x, y) {
    var ctx = _state.ctx;
    _state.isDrawing = true;
    _state.startX = x;
    _state.startY = y;
    _state.lastX = x;
    _state.lastY = y;

    if (_state.mode === 'pencil' || _state.mode === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (_state.mode === 'outlet') {
      _drawOutletStamp(x, y);
      _state.isDrawing = false;
      _saveSnapshot();
    } else if (_state.mode === 'cabinet') {
      _drawCabinetStamp(x, y);
      _state.isDrawing = false;
      _saveSnapshot();
    } else if (_state.mode === 'text') {
      _promptText(x, y);
      _state.isDrawing = false;
    }
  }

  function _onPointerMove(x, y) {
    if (!_state.isDrawing) return;
    var ctx = _state.ctx;

    if (_state.mode === 'pencil') {
      ctx.strokeStyle = _state.color;
      ctx.lineWidth = _state.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
      _state.lastX = x;
      _state.lastY = y;
    } else if (_state.mode === 'eraser') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, _state.lineWidth * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      _state.lastX = x;
      _state.lastY = y;
    } else if (_state.mode === 'line' || _state.mode === 'rect') {
      // Предпросмотр с восстановлением последнего снимка
      if (_state.undoStack.length > 0) {
        var last = _state.undoStack[_state.undoStack.length - 1];
        var img = new Image();
        img.onload = function() {
          ctx.clearRect(0, 0, _state.width, _state.height);
          ctx.drawImage(img, 0, 0);

          ctx.strokeStyle = _state.color;
          ctx.lineWidth = _state.lineWidth;
          ctx.lineCap = 'round';
          ctx.beginPath();

          if (_state.mode === 'line') {
            ctx.moveTo(_state.startX, _state.startY);
            ctx.lineTo(x, y);
            ctx.stroke();
          } else if (_state.mode === 'rect') {
            ctx.strokeRect(_state.startX, _state.startY, x - _state.startX, y - _state.startY);
          }
        };
        img.src = last;
      }
      _state.lastX = x;
      _state.lastY = y;
    }
  }

  function _onPointerUp(x, y) {
    if (!_state.isDrawing) return;
    _state.isDrawing = false;
    var ctx = _state.ctx;

    if (_state.mode === 'line') {
      ctx.strokeStyle = _state.color;
      ctx.lineWidth = _state.lineWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(_state.startX, _state.startY);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (_state.mode === 'rect') {
      ctx.strokeStyle = _state.color;
      ctx.lineWidth = _state.lineWidth;
      ctx.strokeRect(_state.startX, _state.startY, x - _state.startX, y - _state.startY);
    }

    _saveSnapshot();
  }

  // Штамп розетки 2xRJ-45 (ГОСТ СКС)
  function _drawOutletStamp(x, y) {
    var ctx = _state.ctx;
    var label = prompt('Номер розетки / рабочего места:', 'РМ-' + _state.outletCounter + ' (1.' + (_state.outletCounter < 10 ? '0' + _state.outletCounter : _state.outletCounter) + ')');
    if (label === null) return;
    _state.outletCounter++;

    ctx.save();
    // Корпус розетки (квадрат)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 2.5;
    ctx.fillRect(x - 14, y - 14, 28, 28);
    ctx.strokeRect(x - 14, y - 14, 28, 28);

    // Внутренний треугольник / пиктограмма розетки
    ctx.fillStyle = '#1d4ed8';
    ctx.beginPath();
    ctx.moveTo(x - 7, y + 8);
    ctx.lineTo(x, y - 6);
    ctx.lineTo(x + 7, y + 8);
    ctx.closePath();
    ctx.fill();

    // Подпись с номером
    if (label) {
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 18, y);
    }
    ctx.restore();
  }

  // Штамп шкафа ТКШ
  function _drawCabinetStamp(x, y) {
    var ctx = _state.ctx;
    var label = prompt('Обозначение шкафа:', 'ТКШ-1 (24U)');
    if (label === null) return;

    ctx.save();
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.fillRect(x - 24, y - 24, 48, 48);
    ctx.strokeRect(x - 24, y - 24, 48, 48);

    // Диагональный крест телекоммуникационного шкафа
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 20, y - 20);
    ctx.lineTo(x + 20, y + 20);
    ctx.moveTo(x + 20, y - 20);
    ctx.lineTo(x - 20, y + 20);
    ctx.stroke();

    if (label) {
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 30, y);
    }
    ctx.restore();
  }

  // Подпись помещения
  function _promptText(x, y) {
    var text = prompt('Введите название кабинета или помещения:');
    if (!text || !text.trim()) return;

    var ctx = _state.ctx;
    ctx.save();
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = _state.color || '#0f172a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.trim(), x, y);
    ctx.restore();

    _saveSnapshot();
  }

  // Проверка наличия уже загруженной схемы по заявке
  function _checkAndLoadExistingScheme(taskId) {
    if (typeof api !== 'function') return;
    api('/tasks/' + encodeURIComponent(taskId) + '/attachments').then(function(atts) {
      if (!Array.isArray(atts)) return;
      var scheme = atts.find(function(a) {
        return a.type === 'scheme' || a.category === 'scheme' || String(a.original_name || '').toLowerCase().includes('схем');
      });
      if (scheme && scheme.id) {
        var fileUrl = '/api/attachments/' + scheme.id + '/file';
        if (typeof window.withAuthToken === 'function') fileUrl = window.withAuthToken(fileUrl);
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
          _state.ctx.clearRect(0, 0, _state.width, _state.height);
          _state.ctx.drawImage(img, 0, 0, _state.width, _state.height);
          _saveSnapshot();
          if (typeof showToast === 'function') showToast('ℹ️ Загружена существующая схема заявки для редактирования', 'info');
        };
        img.src = fileUrl;
      }
    }).catch(function(e) {
      console.warn('Could not check existing scheme:', e);
    });
  }

  // Сохранить готовую схему на сервер в материалы заявки
  function _saveSchemeToTask() {
    var canvas = _state.canvas;
    var taskId = _state.taskId;
    if (!canvas || !taskId) return;

    var saveBtn = document.getElementById('_scheme_save_btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '⏳ Сохранение...';
    }

    // Впечатываем угловой штамп в результирующий холст
    var finalCanvas = document.createElement('canvas');
    finalCanvas.width = _state.width;
    finalCanvas.height = _state.height;
    var fctx = finalCanvas.getContext('2d');

    // 1. Рисунок
    fctx.drawImage(canvas, 0, 0);

    // 2. Угловой штамп ГОСТ
    var stampW = 360;
    var stampH = 75;
    var stampX = _state.width - stampW - 10;
    var stampY = _state.height - stampH - 10;

    fctx.save();
    fctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    fctx.strokeStyle = '#0f172a';
    fctx.lineWidth = 1.5;
    fctx.fillRect(stampX, stampY, stampW, stampH);
    fctx.strokeRect(stampX, stampY, stampW, stampH);

    fctx.fillStyle = '#0f172a';
    fctx.font = 'bold 12px sans-serif';
    fctx.fillText('ИСПОЛНИТЕЛЬНАЯ СХЕМА ТРАСС СКС', stampX + 10, stampY + 18);

    fctx.font = '11px sans-serif';
    fctx.fillStyle = '#334155';
    var cust = (_state.taskData && _state.taskData.customer) || 'ПАО Сбербанк';
    var addr = (_state.taskData && _state.taskData.address) || '—';
    if (addr.length > 42) addr = addr.slice(0, 40) + '...';
    fctx.fillText('Заказчик: ' + cust, stampX + 10, stampY + 36);
    fctx.fillText('Объект: ' + addr, stampX + 10, stampY + 52);

    fctx.font = 'bold 10px sans-serif';
    fctx.fillStyle = '#1d4ed8';
    fctx.fillText('Заявка № ' + taskId + ' · Лист 5 (ИД-05)', stampX + 10, stampY + 68);
    fctx.restore();

    finalCanvas.toBlob(function(blob) {
      if (!blob) {
        alert('Ошибка создания файла схемы');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '💾 Сохранить в заявку'; }
        return;
      }

      var fd = new FormData();
      fd.append('files', blob, 'Исполнительная_схема_СКС.png');
      fd.append('type', 'scheme');
      fd.append('comment', 'Исполнительная схема трасс СКС и розеток (создана в онлайн-редакторе)');

      var token = (window.S && window.S.token) || localStorage.getItem('token');
      fetch('/api/tasks/' + encodeURIComponent(taskId) + '/attachments', {
        method: 'POST',
        headers: token ? { 'Authorization': 'Bearer ' + token } : {},
        body: fd
      }).then(function(res) {
        if (!res.ok) throw new Error('Ошибка сервера: ' + res.statusText);
        return res.json();
      }).then(function() {
        if (typeof showToast === 'function') {
          showToast('✓ Исполнительная схема успешно сохранена и вшита в Альбом ИД!', 'success');
        } else {
          alert('Исполнительная схема успешно сохранена!');
        }

        // Обновляем список вложений в карточке
        if (typeof refreshAttachmentsList === 'function') refreshAttachmentsList(taskId);
        if (typeof loadCardDocuments === 'function') loadCardDocuments(taskId);

        // Закрываем редактор
        var modal = document.getElementById('_scheme_editor_modal');
        if (modal) modal.remove();
      }).catch(function(err) {
        alert('Ошибка сохранения схемы: ' + err.message);
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '💾 Сохранить в заявку';
        }
      });
    }, 'image/png');
  }

})();
