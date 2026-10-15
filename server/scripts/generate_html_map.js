import fs from 'fs';
import path from 'path';

const mdPath = path.join(process.cwd(), 'docs', 'DATA_FLOW_MAP.md');
const outHtmlPath = path.join(process.cwd(), 'docs', 'DATA_FLOW_MAP.html');
const imagesDir = path.join(process.cwd(), 'docs', 'images');

const mdContent = fs.readFileSync(mdPath, 'utf8');

// Читаем SVG-файлы для инлайнинга
const svgPipelinePath = path.join(imagesDir, 'data_flow_pipeline.svg');
const svgLifecyclePath = path.join(imagesDir, 'documents_and_lifecycle.svg');

const svgPipelineContent = fs.existsSync(svgPipelinePath) ? fs.readFileSync(svgPipelinePath, 'utf8') : '';
const svgLifecycleContent = fs.existsSync(svgLifecyclePath) ? fs.readFileSync(svgLifecyclePath, 'utf8') : '';

// Функция парсинга Markdown в чистый HTML
function parseMarkdownToHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines = [];

  let inTable = false;
  let tableRows = [];

  let inBlockquote = false;
  let blockquoteLines = [];

  let inList = false;
  let listType = ''; // 'ul' or 'ol'
  let listItems = [];

  function flushList() {
    if (!inList) return;
    if (listType === 'ul') {
      out.push('<ul>');
      listItems.forEach(item => out.push(`  <li>${item}</li>`));
      out.push('</ul>');
    } else if (listType === 'ol') {
      out.push('<ol>');
      listItems.forEach(item => out.push(`  <li>${item}</li>`));
      out.push('</ol>');
    }
    inList = false;
    listType = '';
    listItems = [];
  }

  function flushBlockquote() {
    if (!inBlockquote) return;
    const rawText = blockquoteLines.join('\n');
    const formatted = formatInline(rawText)
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join('<br>');

    // Определяем тему коллаута
    let calloutClass = 'callout-default';
    if (rawText.includes('💎') || rawText.includes('Сквозной расчет')) calloutClass = 'callout-diamond';
    else if (rawText.includes('🚗') || rawText.includes('Транспортные')) calloutClass = 'callout-amber';
    else if (rawText.includes('🔹') || rawText.includes('Версия документа')) calloutClass = 'callout-blue';

    out.push(`<div class="callout ${calloutClass}">`);
    out.push(`  <div class="callout-body">${formatted}</div>`);
    out.push('</div>');

    inBlockquote = false;
    blockquoteLines = [];
  }

  function flushTable() {
    if (!inTable) return;
    if (tableRows.length > 0) {
      out.push('<div class="table-wrapper">');
      out.push('<table class="data-table">');
      
      // Header row
      const headerCols = tableRows[0];
      out.push('  <thead><tr>');
      headerCols.forEach(col => {
        out.push(`    <th>${formatInline(col.trim())}</th>`);
      });
      out.push('  </tr></thead>');

      // Body rows (skip separator row at index 1 if present)
      out.push('  <tbody>');
      const startIdx = tableRows.length > 1 && tableRows[1].every(c => c.trim().match(/^:?-+:?$/)) ? 2 : 1;
      for (let i = startIdx; i < tableRows.length; i++) {
        out.push('    <tr>');
        tableRows[i].forEach(col => {
          out.push(`      <td>${formatInline(col.trim())}</td>`);
        });
        out.push('    </tr>');
      }
      out.push('  </tbody>');
      out.push('</table>');
      out.push('</div>');
    }
    inTable = false;
    tableRows = [];
  }

  function formatInline(str) {
    if (!str) return '';
    return str
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="code-pill">$1</code>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  function slugify(text) {
    return text.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '');
  }

  let diagramCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Кодовый блок ```
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // Конец блока
        const codeText = codeBlockLines.join('\n')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        out.push(`<div class="code-card">`);
        out.push(`  <div class="code-header"><span class="code-badge">${codeBlockLang || 'code'}</span><button class="copy-btn" onclick="copyCode(this)">Копировать</button></div>`);
        out.push(`  <pre class="code-pre"><code>${codeText}</code></pre>`);
        out.push(`</div>`);
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLang = '';
        continue;
      } else {
        // Начало блока
        flushList();
        flushTable();
        flushBlockquote();
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockLines = [];
        continue;
      }
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Изображения ![alt](src)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      flushList();
      flushTable();
      flushBlockquote();

      const alt = imgMatch[1];
      const src = imgMatch[2];
      diagramCount++;
      const boxId = 'diagram_box_' + diagramCount;

      let inlineSvg = '';
      if (src.includes('data_flow_pipeline.svg')) {
        inlineSvg = svgPipelineContent;
      } else if (src.includes('documents_and_lifecycle.svg')) {
        inlineSvg = svgLifecycleContent;
      }

      out.push(`
      <div class="diagram-wrapper">
        <div class="diagram-toolbar">
          <div class="diagram-toolbar-title">
            <span class="diagram-icon">🗺️</span>
            <strong>${alt || 'Архитектурная схема #' + diagramCount}</strong>
          </div>
          <div class="diagram-toolbar-actions">
            <button type="button" class="ctrl-btn" onclick="zoomDiagram('${boxId}', 0.25)">🔍 Увеличить (+)</button>
            <button type="button" class="ctrl-btn" onclick="zoomDiagram('${boxId}', -0.25)">🔍 Уменьшить (−)</button>
            <button type="button" class="ctrl-btn" onclick="resetZoom('${boxId}')">100%</button>
            <button type="button" class="ctrl-btn ctrl-btn-accent" onclick="openFullscreen('${boxId}')">⛶ Во весь экран</button>
            <a href="${src}" target="_blank" class="ctrl-btn ctrl-btn-link">↗ Открыть файл</a>
          </div>
        </div>
        <div class="diagram-viewport" id="${boxId}">
          <div class="diagram-scalable">
            ${inlineSvg || `<img src="${src}" alt="${alt}" style="max-width:100%;height:auto;display:block;margin:0 auto;" />`}
          </div>
        </div>
      </div>
      `);
      continue;
    }

    // Таблицы | ... |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushList();
      flushBlockquote();
      inTable = true;
      const rawCols = line.trim().slice(1, -1).split('|');
      tableRows.push(rawCols);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Цитаты / Коллауты > ...
    if (line.trim().startsWith('>')) {
      flushList();
      flushTable();
      inBlockquote = true;
      blockquoteLines.push(line.trim().replace(/^>\s?/, ''));
      continue;
    } else if (inBlockquote) {
      flushBlockquote();
    }

    // Разделитель ---
    if (line.trim() === '---') {
      flushList();
      flushTable();
      flushBlockquote();
      out.push('<hr class="divider" />');
      continue;
    }

    // Заголовки
    if (line.startsWith('# ')) {
      flushList();
      flushTable();
      flushBlockquote();
      const text = line.slice(2).trim();
      const slug = slugify(text);
      out.push(`<h1 id="${slug}" class="doc-h1">${formatInline(text)}</h1>`);
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      flushTable();
      flushBlockquote();
      const text = line.slice(3).trim();
      const slug = slugify(text);
      out.push(`<h2 id="${slug}" class="doc-h2">${formatInline(text)}</h2>`);
      continue;
    }
    if (line.startsWith('### ')) {
      flushList();
      flushTable();
      flushBlockquote();
      const text = line.slice(4).trim();
      const slug = slugify(text);
      out.push(`<h3 id="${slug}" class="doc-h3">${formatInline(text)}</h3>`);
      continue;
    }

    // Нумерованные списки 1. item
    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      flushTable();
      flushBlockquote();
      if (!inList || listType !== 'ol') {
        flushList();
        inList = true;
        listType = 'ol';
      }
      listItems.push(formatInline(olMatch[2]));
      continue;
    }

    // Маркированные списки - item или * item
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      flushTable();
      flushBlockquote();
      if (!inList || listType !== 'ul') {
        flushList();
        inList = true;
        listType = 'ul';
      }
      listItems.push(formatInline(ulMatch[1]));
      continue;
    }

    // Вложенные под-списки (например, "   - *Функция:* ...")
    const subUlMatch = line.match(/^\s+[-*]\s+(.+)$/);
    if (subUlMatch && inList && listItems.length > 0) {
      listItems[listItems.length - 1] += `<br>&nbsp;&nbsp;&nbsp;&nbsp;• ${formatInline(subUlMatch[1])}`;
      continue;
    }

    // Обычные параграфы
    if (line.trim().length > 0) {
      flushList();
      flushTable();
      flushBlockquote();
      out.push(`<p class="doc-p">${formatInline(line.trim())}</p>`);
    }
  }

  flushList();
  flushTable();
  flushBlockquote();

  return out.join('\n');
}

const renderedHtmlContent = parseMarkdownToHtml(mdContent);

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StockEasy — Сквозная карта данных и архитектура документооборота</title>
  
  <style>
    :root {
      --bg-page: #0f172a;
      --bg-card: #ffffff;
      --text-main: #0f172a;
      --text-muted: #475569;
      --border-color: #cbd5e1;
      --border-subtle: #e2e8f0;
      
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --accent-light: #eff6ff;
      --accent-border: #bfdbfe;

      --emerald: #059669;
      --emerald-light: #ecfdf5;
      --amber: #d97706;
      --amber-light: #fffbeb;
      --purple: #7c3aed;
      --purple-light: #f5f3ff;
      
      --table-header-bg: #1e293b;
      --table-header-color: #f8fafc;
      --table-zebra: #f8fafc;
      
      --code-bg: #f1f5f9;
      --code-color: #0f172a;
      --code-pill-bg: #e2e8f0;
      --code-pill-color: #0f172a;
      
      --card-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.1);
    }

    [data-theme="dark"] {
      --bg-page: #090d16;
      --bg-card: #131c2e;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --border-color: #27354a;
      --border-subtle: #1e293b;
      
      --accent: #38bdf8;
      --accent-hover: #0ea5e9;
      --accent-light: #0c2135;
      --accent-border: #075985;

      --emerald: #10b981;
      --emerald-light: #062b1e;
      --amber: #f59e0b;
      --amber-light: #2c1a04;
      --purple: #a855f7;
      --purple-light: #22123d;
      
      --table-header-bg: #0b1120;
      --table-header-color: #38bdf8;
      --table-zebra: #182438;
      
      --code-bg: #0b1120;
      --code-color: #38bdf8;
      --code-pill-bg: #1e293b;
      --code-pill-color: #38bdf8;
      
      --card-shadow: 0 15px 35px rgba(0, 0, 0, 0.6);
    }

    * { box-sizing: border-box; }
    
    html {
      scroll-behavior: smooth;
    }

    body {
      margin: 0;
      padding: 0;
      background-color: var(--bg-page);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 15px;
      line-height: 1.75;
      -webkit-font-smoothing: antialiased;
    }

    /* Верхняя панель */
    .top-navbar {
      background: #0b1120;
      color: #fff;
      padding: 0.75rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 1000;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    }
    .top-navbar-title {
      font-size: 1.05rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 12px;
      color: #f8fafc;
    }
    .top-badge {
      background: #2563eb;
      color: #fff;
      font-size: 0.7rem;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .top-navbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .btn {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 7px 14px;
      border-radius: 6px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn:hover { background: var(--accent-hover); }
    .btn-ghost {
      background: rgba(255, 255, 255, 0.12);
      color: #f8fafc;
    }
    .btn-ghost:hover { background: rgba(255, 255, 255, 0.24); }

    /* Контейнер страницы */
    .page-wrapper {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }

    .doc-card {
      background: var(--bg-card);
      padding: 3.5rem 4rem;
      border-radius: 16px;
      border: 1px solid var(--border-color);
      box-shadow: var(--card-shadow);
    }

    /* Навигационные табы */
    .nav-pills-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 2.5rem;
      padding-bottom: 1.5rem;
      border-bottom: 2px solid var(--border-subtle);
    }
    .nav-pill {
      background: var(--accent-light);
      color: var(--accent);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.82rem;
      font-weight: 600;
      text-decoration: none;
      border: 1px solid var(--accent-border);
      transition: all 0.15s ease-in-out;
    }
    .nav-pill:hover {
      background: var(--accent);
      color: #ffffff;
      border-color: var(--accent);
      transform: translateY(-1px);
    }

    /* Типографика */
    .doc-h1 {
      font-size: 2.1rem;
      font-weight: 800;
      color: var(--text-main);
      margin-top: 0;
      margin-bottom: 1rem;
      line-height: 1.25;
      letter-spacing: -0.02em;
    }
    .doc-h2 {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-main);
      margin-top: 3.5rem;
      margin-bottom: 1.2rem;
      padding-bottom: 0.6rem;
      border-bottom: 2px solid var(--border-subtle);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .doc-h3 {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text-main);
      margin-top: 2rem;
      margin-bottom: 0.8rem;
    }
    .doc-p {
      margin-top: 0;
      margin-bottom: 1.25rem;
      color: var(--text-main);
    }

    .divider {
      border: none;
      border-top: 2px solid var(--border-subtle);
      margin: 3.5rem 0;
    }

    /* Таблицы */
    .table-wrapper {
      width: 100%;
      overflow-x: auto;
      margin: 1.5rem 0 2rem 0;
      border-radius: 10px;
      border: 1px solid var(--border-color);
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
      text-align: left;
    }
    .data-table th {
      background: var(--table-header-bg);
      color: var(--table-header-color);
      padding: 12px 16px;
      font-weight: 700;
      letter-spacing: 0.3px;
      border-bottom: 2px solid var(--border-color);
      white-space: nowrap;
    }
    .data-table td {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      vertical-align: top;
      color: var(--text-main);
    }
    .data-table tbody tr:nth-child(even) {
      background: var(--table-zebra);
    }
    .data-table tbody tr:hover {
      background: var(--accent-light);
    }

    /* Списки */
    ul, ol {
      margin: 0.8rem 0 1.5rem 1.5rem;
      padding: 0;
    }
    li {
      margin-bottom: 0.5rem;
      color: var(--text-main);
    }

    /* Коллауты */
    .callout {
      border-radius: 10px;
      padding: 1.25rem 1.5rem;
      margin: 1.5rem 0;
      border-left: 5px solid;
    }
    .callout-default {
      background: var(--accent-light);
      border-color: var(--accent);
    }
    .callout-diamond {
      background: var(--emerald-light);
      border-color: var(--emerald);
    }
    .callout-amber {
      background: var(--amber-light);
      border-color: var(--amber);
    }
    .callout-blue {
      background: var(--accent-light);
      border-color: var(--accent);
    }
    .callout-body {
      font-size: 0.95rem;
      line-height: 1.7;
      color: var(--text-main);
    }

    /* Код и плашки */
    .code-pill {
      background: var(--code-pill-bg);
      color: var(--code-pill-color);
      padding: 2px 7px;
      border-radius: 5px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
      font-size: 0.85em;
      font-weight: 600;
    }

    .code-card {
      background: var(--code-bg);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      margin: 1.5rem 0;
      overflow: hidden;
    }
    .code-header {
      background: rgba(0, 0, 0, 0.05);
      padding: 8px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-color);
    }
    .code-badge {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }
    .copy-btn {
      background: transparent;
      border: 1px solid var(--border-color);
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      color: var(--text-main);
      transition: all 0.2s;
    }
    .copy-btn:hover {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }
    .code-pre {
      margin: 0;
      padding: 1.25rem 1.5rem;
      overflow-x: auto;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
      font-size: 0.85rem;
      line-height: 1.6;
      color: var(--code-color);
    }

    /* Контейнер схем */
    .diagram-wrapper {
      margin: 2.5rem 0;
      border: 1.5px solid var(--border-color);
      border-radius: 12px;
      background: #ffffff;
      overflow: hidden;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.06);
    }
    .diagram-toolbar {
      background: #f8fafc;
      padding: 10px 16px;
      border-bottom: 1.5px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .diagram-toolbar-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.92rem;
      color: #0f172a;
    }
    .diagram-toolbar-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .ctrl-btn {
      background: #ffffff;
      color: #334155;
      border: 1px solid #cbd5e1;
      padding: 5px 11px;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      transition: all 0.15s;
    }
    .ctrl-btn:hover {
      background: #f1f5f9;
      color: #0f172a;
      border-color: #94a3b8;
    }
    .ctrl-btn-accent {
      background: #2563eb;
      color: #ffffff;
      border-color: #2563eb;
    }
    .ctrl-btn-accent:hover {
      background: #1d4ed8;
      color: #ffffff;
    }
    .ctrl-btn-link {
      background: #f1f5f9;
      color: #475569;
    }

    .diagram-viewport {
      width: 100%;
      overflow: auto;
      padding: 1.5rem;
      background: #ffffff;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-height: 350px;
    }
    .diagram-scalable {
      width: 100%;
      max-width: 1040px;
      margin: 0 auto;
      transition: width 0.2s ease-out;
      display: flex;
      justify-content: center;
    }
    .diagram-scalable svg {
      width: 100%;
      height: auto;
      display: block;
    }

    /* Модальное окно полного экрана */
    .fullscreen-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.95);
      z-index: 9999;
      padding: 20px;
      box-sizing: border-box;
      flex-direction: column;
    }
    .fullscreen-modal.active {
      display: flex;
    }
    .fullscreen-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #fff;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    }
    .fullscreen-body {
      flex: 1;
      overflow: auto;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .fullscreen-body svg {
      max-width: 95vw;
      max-height: 85vh;
      height: auto;
    }

    /* Печать */
    @media print {
      body { background: #fff; color: #000; }
      .top-navbar, .nav-pills-bar, .diagram-toolbar, .copy-btn { display: none !important; }
      .doc-card { border: none; box-shadow: none; padding: 0; }
      .table-wrapper { box-shadow: none; border: 1px solid #ccc; }
      .diagram-viewport { max-height: none; overflow: visible; padding: 0; }
    }

    @media (max-width: 768px) {
      .doc-card { padding: 2rem 1.25rem; }
      .top-navbar { padding: 0.75rem 1rem; }
    }
  </style>
</head>
<body>

  <!-- ВЕРХНЯЯ ШАПКА -->
  <header class="top-navbar">
    <div class="top-navbar-title">
      <span>🚀 StockEasy</span>
      <span class="top-badge">Архитектурный стандарт</span>
    </div>
    <div class="top-navbar-actions">
      <button class="btn btn-ghost" onclick="toggleTheme()" title="Переключить тему">🌓 Тема</button>
      <button class="btn btn-ghost" onclick="window.print()" title="Распечатать или сохранить в PDF">🖨️ В PDF</button>
      <a href="DATA_FLOW_MAP.md" class="btn" target="_blank" title="Открыть исходный Markdown">📄 Исходник .md</a>
    </div>
  </header>

  <!-- ОСНОВНОЙ КОНТЕНТ -->
  <div class="page-wrapper">
    <main class="doc-card">
      
      <!-- БЫСТРАЯ НАВИГАЦИЯ -->
      <nav class="nav-pills-bar">
        <a href="#1-юридическая-и-организационная-архитектура" class="nav-pill">🏢 1. Юрлица и контрагенты</a>
        <a href="#2-сквозная-архитектурная-схема-движения-данных-end-to-end-pipeline" class="nav-pill">🗺️ 2. Схема движения данных</a>
        <a href="#3-физическая-модель-данных-реляционная-схема-postgresql" class="nav-pill">🗄️ 3. Схема PostgreSQL</a>
        <a href="#4-матрица-трассируемости-данных-data-traceability-matrix" class="nav-pill">📋 4. Матрица полей</a>
        <a href="#5-алгоритмы-расчета-и-бизнес-формулы" class="nav-pill">🧮 5. Алгоритмы расчетов</a>
        <a href="#6-движок-генерации-документов-server-services-docxgenerator-js" class="nav-pill">📄 6. Пакет документов DOCX</a>
        <a href="#7-жизненный-цикл-заявки-и-матрица-параллельных-статусов" class="nav-pill">🚦 7. Параллельные статусы</a>
        <a href="#8-итоги-и-эксплуатационные-гарантии" class="nav-pill">✅ 8. Эксплуатационные гарантии</a>
      </nav>

      <!-- ТЕЛО ДОКУМЕНТА (ПРЕДВАРИТЕЛЬНО ОТКОМПИЛИРОВАННОЕ) -->
      ${renderedHtmlContent}

    </main>
  </div>

  <!-- ПОЛНОЭКРАННОЕ ОКНО ДЛЯ ПРОСМОТРА СХЕМ -->
  <div id="fullscreenModal" class="fullscreen-modal" onclick="closeFullscreen()">
    <div class="fullscreen-header" onclick="event.stopPropagation()">
      <strong id="fullscreenTitle">Просмотр схемы</strong>
      <button class="btn btn-ghost" onclick="closeFullscreen()">✕ Закрыть (Esc)</button>
    </div>
    <div class="fullscreen-body" id="fullscreenBody" onclick="event.stopPropagation()"></div>
  </div>

  <script>
    // Зум и управление схемами
    var zoomLevels = {};

    function zoomDiagram(boxId, delta) {
      if (!zoomLevels[boxId]) zoomLevels[boxId] = 1;
      zoomLevels[boxId] = Math.max(0.4, Math.min(3.0, zoomLevels[boxId] + delta));
      applyZoom(boxId);
    }

    function resetZoom(boxId) {
      zoomLevels[boxId] = 1;
      applyZoom(boxId);
    }

    function applyZoom(boxId) {
      var box = document.getElementById(boxId);
      if (!box) return;
      var scalable = box.querySelector('.diagram-scalable');
      if (scalable) {
        var lvl = zoomLevels[boxId] || 1;
        if (lvl <= 1) {
          scalable.style.maxWidth = (1040 * lvl) + 'px';
          scalable.style.width = (100 * lvl) + '%';
        } else {
          scalable.style.maxWidth = 'none';
          scalable.style.width = (100 * lvl) + '%';
        }
      }
    }

    function openFullscreen(boxId) {
      var box = document.getElementById(boxId);
      if (!box) return;
      var svg = box.querySelector('svg');
      if (!svg) return;
      var modal = document.getElementById('fullscreenModal');
      var body = document.getElementById('fullscreenBody');
      body.innerHTML = svg.outerHTML;
      modal.classList.add('active');
    }

    function closeFullscreen() {
      var modal = document.getElementById('fullscreenModal');
      modal.classList.remove('active');
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeFullscreen();
    });

    // Переключение темной/светлой темы
    function toggleTheme() {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    }

    (function() {
      var saved = localStorage.getItem('theme');
      if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
      }
    })();

    // Копирование кода
    function copyCode(btn) {
      var card = btn.closest('.code-card');
      var code = card ? card.querySelector('code').innerText : '';
      navigator.clipboard.writeText(code).then(function() {
        btn.textContent = 'Скопировано!';
        setTimeout(function() { btn.textContent = 'Копировать'; }, 2000);
      });
    }
  </script>
</body>
</html>
`;

fs.writeFileSync(outHtmlPath, html, 'utf8');
console.log('✅ 100% Offline Standalone HTML successfully compiled to:', outHtmlPath);
