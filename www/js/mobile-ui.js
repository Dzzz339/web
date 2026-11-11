(function() {
  'use strict';

  var mobileQuery = window.matchMedia('(max-width: 768px)');
  var gridOriginals = new Map();
  var scanScheduled = false;

  function isMobileLayout() {
    return mobileQuery.matches || document.body.classList.contains('is-native-phone') || document.body.classList.contains('in-phone-frame');
  }

  function getTableLabels(table) {
    if (!table.tHead || !table.tHead.rows.length) return [];
    return Array.from(table.tHead.rows[0].cells).map(function(cell, index) {
      var label = cell.textContent.replace(/[▲▼⇅]/g, '').trim();
      return label || (index === table.tHead.rows[0].cells.length - 1 ? 'Действия' : '');
    });
  }

  function enhanceTable(table) {
    var parent = table.parentElement;
    if (parent && (parent.classList.contains('tbl-wrap') || parent.classList.contains('table-scroll') || getComputedStyle(parent).overflowX === 'auto')) {
      parent.classList.add('table-scroll');
    } else if (!table.closest('.a4-sheet')) {
      var wrapper = document.createElement('div');
      wrapper.className = 'table-scroll';
      parent.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }

    var labels = getTableLabels(table);
    Array.from(table.tBodies).forEach(function(body) {
      Array.from(body.rows).forEach(function(row) {
        if (row.parentElement !== body) return;
        Array.from(row.cells).forEach(function(cell, index) {
          if (cell.colSpan > 1) return;
          if (!cell.hasAttribute('data-label')) cell.setAttribute('data-label', labels[index] || '');
        });
      });
    });

    var isPrimaryList = table.classList.contains('tasks-table') ||
      table.matches('#contracts_table_container > .tbl-wrap > table, #contractors_table_container > .tbl-wrap > table');
    table.classList.toggle('mobile-card-table', isMobileLayout() && isPrimaryList);
  }

  function adaptInlineGrid(element) {
    var template = element.style.gridTemplateColumns;
    if (!template || !/minmax\(\s*\d{3,}px/.test(template)) return;
    if (!gridOriginals.has(element)) gridOriginals.set(element, template);
    if (!isMobileLayout()) return;
    element.style.gridTemplateColumns = template.replace(/minmax\(\s*(\d{3,})px\s*,/g, 'minmax(min(100%, $1px),');
  }

  function restoreInlineGrids() {
    gridOriginals.forEach(function(template, element) {
      if (element.isConnected) element.style.gridTemplateColumns = template;
    });
  }

  function scanOverflow() {
    var viewportWidth = document.documentElement.clientWidth;
    document.querySelectorAll('.mobile-overflow-source').forEach(function(element) {
      element.classList.remove('mobile-overflow-source');
    });
    if (!isMobileLayout()) return [];
    var overflowing = [];
    document.querySelectorAll('body *').forEach(function(element) {
      if (element.closest('.kanban, .table-scroll, .swipe-carousel-row, #desktop-preview-toolbar')) return;
      var style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') return;
      var rect = element.getBoundingClientRect();
      if (rect.width && (rect.right > viewportWidth + 1 || rect.left < -1)) {
        element.classList.add('mobile-overflow-source');
        overflowing.push({ element: element, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) });
      }
    });
    return overflowing;
  }

  function scan() {
    scanScheduled = false;
    var active = isMobileLayout();
    document.body.classList.toggle('mobile-layout-active', active);
    document.querySelectorAll('table').forEach(enhanceTable);
    document.querySelectorAll('[style*="grid-template-columns"]').forEach(adaptInlineGrid);
    if (!active) restoreInlineGrids();
    if (document.body.classList.contains('debug-mobile-overflow')) scanOverflow();
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(scan);
  }

  window.auditMobileOverflow = scanOverflow;
  window.enhanceMobileLayout = scheduleScan;
  window.toggleMobileOverflowDebug = function(enabled) {
    document.body.classList.toggle('debug-mobile-overflow', enabled !== false);
    return scanOverflow();
  };

  document.addEventListener('DOMContentLoaded', function() {
    scan();
    var observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });
    if (document.body.classList.contains('debug-mobile-overflow')) scanOverflow();
  });

  if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', scan);
  else mobileQuery.addListener(scan);

  if (new URLSearchParams(window.location.search).get('debugOverflow') === '1') {
    document.addEventListener('DOMContentLoaded', function() {
      document.body.classList.add('debug-mobile-overflow');
      scanOverflow();
    });
  }
})();
