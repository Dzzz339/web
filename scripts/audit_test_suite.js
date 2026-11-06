import puppeteer from 'puppeteer-core';
import fs from 'fs';

function getBrowserPath() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

const BASE_URL = 'http://localhost:3001';
const TEST_TASK_ID = 'СЗБ-0349-32';

async function runAudit() {
  const edgePath = getBrowserPath();
  if (!edgePath) {
    console.error('Browser executable not found!');
    process.exit(1);
  }

  console.log(`[Audit] Using browser at: ${edgePath}`);
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: 'new',
    defaultViewport: { width: 1600, height: 1000 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();

  const auditLog = {
    timestamp: new Date().toISOString(),
    login: {},
    navigation: {},
    taskModes: {},
    cardTabs: {},
    modalsAndButtons: {},
    documentActions: {},
    consoleErrors: [],
    pageErrors: [],
    networkErrors: [],
    failedRequests: []
  };

  // Listeners
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      auditLog.consoleErrors.push({
        type,
        text,
        location: msg.location()
      });
      console.log(`[Browser Console Error] ${text}`);
    } else if (text.includes('Error') || text.includes('ошибка') || text.includes('undefined')) {
      if (type === 'warning' || type === 'info' || type === 'log') {
        if (text.toLowerCase().includes('not defined') || text.toLowerCase().includes('uncaught')) {
          auditLog.consoleErrors.push({
            type,
            text,
            location: msg.location()
          });
        }
      }
    }
  });

  page.on('pageerror', err => {
    auditLog.pageErrors.push({
      message: err.message,
      stack: err.stack
    });
    console.log(`[Browser PageError] ${err.message}`);
  });

  page.on('requestfailed', req => {
    auditLog.failedRequests.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure() ? req.failure().errorText : 'unknown'
    });
    console.log(`[Request Failed] ${req.method()} ${req.url()}`);
  });

  page.on('response', res => {
    const status = res.status();
    const url = res.url();
    if (status >= 400 && !url.includes('favicon.ico')) {
      auditLog.networkErrors.push({
        url,
        status,
        statusText: res.statusText()
      });
      console.log(`[Network Error ${status}] ${url}`);
    }
  });

  try {
    // 1. АВТОРИЗАЦИЯ
    console.log('\n--- 1. Testing Login ---');
    await page.goto(`${BASE_URL}`, { waitUntil: 'networkidle2' });
    
    const loginInput = await page.$('#luser');
    if (loginInput) {
      console.log('Login form detected, entering credentials (nikita / chaykaxxx228)...');
      await page.type('#luser', 'nikita');
      await page.type('#lpass', 'chaykaxxx228');
      
      const submitBtn = await page.$('button[type="submit"], .login-btn');
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
    }

    await page.waitForFunction(() => window.S && window.S.token, { timeout: 7000 }).catch(e => {
      console.warn('Wait for S.token timeout, checking state...');
    });

    const authState = await page.evaluate(() => {
      return {
        hasToken: !!(window.S && window.S.token),
        user: window.S && window.S.user,
        page: window.S && window.S.page
      };
    });
    auditLog.login = authState;
    console.log('Auth state:', authState);

    // 2. НАВИГАЦИЯ ПО ВСЕМ РАЗДЕЛАМ МЕНЮ
    console.log('\n--- 2. Testing Menu Navigation ---');
    const sectionsToTest = [
      { id: 'dashboard', name: 'Обзор' },
      { id: 'dash-summary', name: 'Обзор -> Сводка' },
      { id: 'dash-customers', name: 'Обзор -> Заказчики' },
      { id: 'dash-executors', name: 'Обзор -> Исполнители' },
      { id: 'dash-calendar', name: 'Обзор -> Календарь' },
      { id: 'dash-materials', name: 'Обзор -> Материалы' },
      { id: 'dash-payments-in', name: 'Обзор -> Оплаты нам' },
      { id: 'dash-payments-out', name: 'Обзор -> Оплаты наши' },
      { id: 'tasks', name: 'Заявки' },
      { id: 'kanban', name: 'Канбан' },
      { id: 'marches', name: 'Маршруты' },
      { id: 'contracts', name: 'Контракты' },
      { id: 'contractors', name: 'Организации' },
      { id: 'sub_contracts', name: 'Договоры субподряда' },
      { id: 'customer_tariffs', name: 'Тарифная сетка Заказчика' },
      { id: 'sub_pricelists', name: 'Прайсы субподряда' },
      { id: 'templates', name: 'Шаблоны документов' },
      { id: 'users', name: 'Люди' },
      { id: 'data', name: 'Данные' },
      { id: 'chat', name: 'Чат' },
      { id: 'logs', name: 'Журнал' },
      { id: 'help', name: 'Инструкция' }
    ];

    for (const sec of sectionsToTest) {
      const navRes = await page.evaluate(async (pageId) => {
        try {
          if (typeof window.go === 'function') {
            window.go(pageId);
          } else {
            return { error: 'window.go is not defined' };
          }
          await new Promise(r => setTimeout(r, 600));
          const appEl = document.getElementById('app');
          const warnBanner = appEl ? appEl.querySelector('.banner-warn') : null;
          return {
            success: true,
            page: window.S ? window.S.page : null,
            hasCrashBanner: !!warnBanner,
            crashText: warnBanner ? warnBanner.innerText : null,
            htmlLength: appEl ? appEl.innerHTML.length : 0
          };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      }, sec.id);

      auditLog.navigation[sec.id] = navRes;
      if (navRes.hasCrashBanner) {
        console.error(`  [CRASH in ${sec.name}]: ${navRes.crashText}`);
      } else {
        console.log(`  [OK] ${sec.name} (app length: ${navRes.htmlLength})`);
      }
    }

    // 3. ТЕСТИРОВАНИЕ РАЗДЕЛА ЗАЯВКИ И ПЕРЕКЛЮЧАТЕЛЕЙ РЕЖИМОВ
    console.log('\n--- 3. Testing Tasks Page Toolbar & Modes ---');
    await page.evaluate(() => window.go('tasks'));
    await new Promise(r => setTimeout(r, 800));

    const taskModes = ['customer', 'contractor', 'supply', 'docs', 'finance'];
    for (const m of taskModes) {
      const modeRes = await page.evaluate((mode) => {
        try {
          if (typeof window.setTaskAppMode === 'function') {
            window.setTaskAppMode(mode);
          } else {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes(mode));
            if (btn) btn.click();
            else return { error: `setTaskAppMode not defined and button for ${mode} not found` };
          }
          const appEl = document.getElementById('app');
          const warnBanner = appEl ? appEl.querySelector('.banner-warn') : null;
          return {
            success: true,
            activeMode: window.S ? window.S.taskAppMode : null,
            statsExpanded: window.S ? window.S.tasksStatsExpanded : null,
            hasCrashBanner: !!warnBanner,
            crashText: warnBanner ? warnBanner.innerText : null
          };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      }, m);

      auditLog.taskModes[m] = modeRes;
      console.log(`  Mode ${m}:`, modeRes);
    }

    // Test Quick Filters button
    const filtersRes = await page.evaluate(() => {
      try {
        if (typeof window.toggleTasksFilters === 'function') {
          window.toggleTasksFilters();
          return {
            openAfterToggle: window.S ? window.S.tasksFiltersOpen : null,
            filterPanelInDom: !!document.getElementById('tq')
          };
        }
        return { error: 'window.toggleTasksFilters not defined' };
      } catch (e) {
        return { error: e.message };
      }
    });
    auditLog.taskModes['filters_toggle'] = filtersRes;

    // 4. ТЕСТИРОВАНИЕ КАРТОЧКИ ЗАЯВКИ СЗБ-0349-32
    console.log(`\n--- 4. Testing Task Card for ${TEST_TASK_ID} ---`);
    const cardOpenRes = await page.evaluate((taskId) => {
      try {
        if (typeof window.openCard === 'function') {
          window.openCard(taskId);
          return {
            success: true,
            cardId: window.S ? window.S.cardId : null,
            page: window.S ? window.S.page : null
          };
        }
        return { error: 'window.openCard is not defined' };
      } catch (e) {
        return { error: e.message, stack: e.stack };
      }
    }, TEST_TASK_ID);
    console.log('openCard result:', cardOpenRes);

    await new Promise(r => setTimeout(r, 1200));

    // Test All Card Tabs
    const cardTabs = [
      { id: 'main', name: 'Информация' },
      { id: 'items', name: 'Исполнение / СМР' },
      { id: 'supply', name: 'Закрытие и учет ТМЦ' },
      { id: 'files', name: 'Документы' },
      { id: 'finance', name: 'Экономика' },
      { id: 'chat', name: 'Чат' },
      { id: 'history', name: 'История' }
    ];

    for (const tab of cardTabs) {
      const tabRes = await page.evaluate(async (tabId) => {
        try {
          if (typeof window.setCardTab === 'function') {
            window.setCardTab(tabId);
          } else {
            const btn = document.querySelector(`.card-tab-btn[data-tab="${tabId}"]`);
            if (btn) btn.click();
            else return { error: `setCardTab not found and btn for tab ${tabId} not found` };
          }
          await new Promise(r => setTimeout(r, 700));
          const pane = document.getElementById(`cardTabPane-${tabId}`);
          const appEl = document.getElementById('app');
          const warnBanner = appEl ? appEl.querySelector('.banner-warn') : null;
          return {
            success: true,
            activeTab: window.S ? window.S.cardTab : null,
            paneVisible: pane ? (pane.style.display !== 'none') : false,
            paneContentLength: pane ? pane.innerHTML.length : 0,
            hasCrashBanner: !!warnBanner,
            crashText: warnBanner ? warnBanner.innerText : null
          };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      }, tab.id);

      auditLog.cardTabs[tab.id] = tabRes;
      console.log(`  Tab ${tab.name}:`, tabRes);
    }

    // 5. ТЕСТИРОВАНИЕ КНОПОК И МОДАЛОК
    console.log('\n--- 5. Testing Specific Modals and Buttons ---');

    // 5.1. Модалка "Мастер КЖ" (на вкладке Исполнение / СМР)
    console.log('Testing Cable Journal Wizard (Мастер КЖ)...');
    await page.evaluate(() => window.setCardTab('items'));
    await new Promise(r => setTimeout(r, 600));

    const kjWizardRes = await page.evaluate(async (taskId) => {
      try {
        if (typeof window.openCableJournalGeneratorModal === 'function') {
          window.openCableJournalGeneratorModal(taskId);
          await new Promise(r => setTimeout(r, 400));
          const modal = document.getElementById('_kj_generator_modal');
          const modalVisible = !!modal;
          if (modal) modal.remove();
          return {
            success: true,
            modalId: '_kj_generator_modal',
            modalVisible
          };
        }
        return { error: 'window.openCableJournalGeneratorModal is not defined' };
      } catch (e) {
        return { error: e.message };
      }
    }, TEST_TASK_ID);
    auditLog.modalsAndButtons['cable_journal_wizard'] = kjWizardRes;
    console.log('Мастер КЖ result:', kjWizardRes);

    // 5.2. ТМЦ: Проверка селектора запаса кабеля (+7%) и быстрого каталога (на вкладке Закрытие и учет ТМЦ)
    console.log('Testing Materials (ТМЦ) components...');
    await page.evaluate(() => window.setCardTab('supply'));
    await new Promise(r => setTimeout(r, 800));

    const tmcRes = await page.evaluate(() => {
      try {
        const tmcTable = document.querySelector('#cardMaterialsContainer table, #cardTabPane-supply table');
        const rows = document.querySelectorAll('#cardMaterialsContainer tbody tr, #cardTabPane-supply tbody tr');
        const marginBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('+7%'));
        const quickPickerFn = typeof window._openQuickCatalogPicker === 'function';
        const saveFactFn = typeof window.saveTaskMaterialsFact === 'function';
        
        return {
          hasTmcTable: !!tmcTable,
          rowsCount: rows.length,
          hasMargin7PctButton: !!marginBtn,
          hasQuickCatalogPicker: quickPickerFn,
          hasSaveFactFn: saveFactFn
        };
      } catch (e) {
        return { error: e.message };
      }
    });
    auditLog.modalsAndButtons['tmc_components'] = tmcRes;
    console.log('ТМЦ components result:', tmcRes);

    // Quick catalog picker test
    const catalogPickerTest = await page.evaluate(async (taskId) => {
      try {
        if (typeof window._openQuickCatalogPicker === 'function') {
          window._openQuickCatalogPicker(taskId, 1, 'mat_0');
          await new Promise(r => setTimeout(r, 400));
          const pickerModal = document.getElementById('_quick_catalog_picker_modal');
          const visible = !!pickerModal;
          if (pickerModal) pickerModal.remove();
          return { success: true, modalId: '_quick_catalog_picker_modal', pickerModalRendered: visible };
        }
        return { error: '_openQuickCatalogPicker not defined' };
      } catch (e) {
        return { error: e.message };
      }
    }, TEST_TASK_ID);
    auditLog.modalsAndButtons['catalog_picker_test'] = catalogPickerTest;
    console.log('Quick catalog picker test:', catalogPickerTest);

    // 5.3. Модалка "Модерация ИД" (на вкладке Документы)
    console.log('Testing ID Moderation Modal (Модерация ИД)...');
    await page.evaluate(() => window.setCardTab('files'));
    await new Promise(r => setTimeout(r, 600));

    const idModerationRes = await page.evaluate(async (taskId) => {
      try {
        if (typeof window.openIdModerationModal === 'function') {
          window.openIdModerationModal(taskId);
          await new Promise(r => setTimeout(r, 1000));
          const modal = document.getElementById('modal_id_moderation');
          if (!modal) return { success: false, error: 'modal_id_moderation not found in DOM' };

          const iframe = modal.querySelector('iframe');
          const iframeSrc = iframe ? iframe.getAttribute('src') : null;
          const img = modal.querySelector('img');
          const imgSrc = img ? img.getAttribute('src') : null;
          const docItems = modal.querySelectorAll('#idModerationContent [onclick*="selectModerationDoc"]');

          return {
            success: true,
            modalVisible: modal.style.display !== 'none',
            hasIframe: !!iframe,
            iframeSrc,
            hasImg: !!img,
            imgSrc,
            docChecklistCount: docItems.length,
            hasTokenInIframeSrc: iframeSrc ? iframeSrc.includes('token=') : null
          };
        }
        return { error: 'window.openIdModerationModal is not defined' };
      } catch (e) {
        return { error: e.message };
      }
    }, TEST_TASK_ID);

    auditLog.modalsAndButtons['id_moderation_modal'] = idModerationRes;
    console.log('Модерация ИД result:', idModerationRes);

    // Close ID moderation modal
    await page.evaluate(() => {
      const modal = document.getElementById('modal_id_moderation');
      if (modal) modal.remove();
    });

    // 5.4. Проверка кнопок генерации документов на вкладке Документы
    console.log('Testing Document Generation Buttons & Visual Editor...');
    const docTypesToTest = [
      { code: 'order_subcontract', name: 'Заявка (Прил. №2)' },
      { code: 'completion_act', name: 'Акт вып. работ' },
      { code: 'invoice', name: 'Счёт' },
      { code: 'tmc_act', name: 'Отчет монтажника (ТМЦ)' }
    ];

    for (const dt of docTypesToTest) {
      const docGenRes = await page.evaluate(async (taskId, docType) => {
        try {
          if (typeof window.generateTaskDoc === 'function') {
            window.generateTaskDoc(taskId, docType);
            await new Promise(r => setTimeout(r, 600));
            const editorModal = document.getElementById('_doc_editor_modal');
            const hasEditor = !!editorModal;
            if (editorModal) editorModal.remove();
            return { success: true, modalId: '_doc_editor_modal', editorOpened: hasEditor };
          }
          return { error: 'generateTaskDoc not defined' };
        } catch (e) {
          return { error: e.message };
        }
      }, TEST_TASK_ID, dt.code);
      auditLog.documentActions[dt.code] = docGenRes;
      console.log(`  Doc button ${dt.name} (${dt.code}):`, docGenRes);
    }

    // Test Допуск на объект modal
    const accessLetterRes = await page.evaluate(async (taskId) => {
      try {
        if (typeof window.openAccessLetterModal === 'function') {
          window.openAccessLetterModal(taskId);
          await new Promise(r => setTimeout(r, 600));
          const modal = document.getElementById('_access_letter_modal');
          const hasModal = !!modal;
          if (modal) modal.remove();
          return { success: true, modalId: '_access_letter_modal', modalOpened: hasModal };
        }
        return { error: 'openAccessLetterModal not defined' };
      } catch (e) {
        return { error: e.message };
      }
    }, TEST_TASK_ID);
    auditLog.documentActions['access_letter'] = accessLetterRes;
    console.log('Допуск на объект modal:', accessLetterRes);

    // Test Учесть Счет / Акт контрагента modal
    const uploadDocRes = await page.evaluate(async (taskId) => {
      try {
        if (typeof window.openUploadTaskDocModal === 'function') {
          window.openUploadTaskDocModal(taskId);
          await new Promise(r => setTimeout(r, 600));
          const modal = document.getElementById('_upload_doc_modal');
          const hasModal = !!modal;
          if (modal) modal.remove();
          return { success: true, modalId: '_upload_doc_modal', modalOpened: hasModal };
        }
        return { error: 'openUploadTaskDocModal not defined' };
      } catch (e) {
        return { error: e.message };
      }
    }, TEST_TASK_ID);
    auditLog.documentActions['upload_task_doc'] = uploadDocRes;
    console.log('Учесть Счет/Акт modal:', uploadDocRes);

    // 5.5. Скачивание альбомов Excel и PDF
    console.log('Testing ID Album Excel and PDF endpoints via fetch in browser context...');
    const albumDownloadRes = await page.evaluate(async (taskId) => {
      const results = {};
      const token = (window.S && window.S.token) || localStorage.getItem('token');
      const headers = token ? { 'Authorization': 'Bearer ' + token } : {};

      // 1. XLSX
      try {
        const xUrl = `/api/tasks/${encodeURIComponent(taskId)}/id-album.xlsx`;
        const xRes = await fetch(xUrl, { headers });
        const xBlob = await xRes.blob();
        results.xlsx = {
          url: xUrl,
          status: xRes.status,
          statusText: xRes.statusText,
          contentType: xRes.headers.get('content-type'),
          contentDisposition: xRes.headers.get('content-disposition'),
          sizeBytes: xBlob.size
        };
      } catch (e) {
        results.xlsx = { error: e.message };
      }

      // 2. PDF
      try {
        const pUrl = `/api/tasks/${encodeURIComponent(taskId)}/id-album.pdf`;
        const pRes = await fetch(pUrl, { headers });
        const pBlob = await pRes.blob();
        results.pdf = {
          url: pUrl,
          status: pRes.status,
          statusText: pRes.statusText,
          contentType: pRes.headers.get('content-type'),
          contentDisposition: pRes.headers.get('content-disposition'),
          sizeBytes: pBlob.size
        };
      } catch (e) {
        results.pdf = { error: e.message };
      }

      return results;
    }, TEST_TASK_ID);

    auditLog.modalsAndButtons['album_downloads'] = albumDownloadRes;
    console.log('Альбомы Excel/PDF download result:', albumDownloadRes);

    // Save JSON output
    fs.writeFileSync('scripts/audit_results.json', JSON.stringify(auditLog, null, 2), 'utf8');
    console.log('\n[Audit Complete] Log saved to scripts/audit_results.json');

  } catch (err) {
    console.error('[Fatal Audit Error]', err);
    auditLog.fatalError = { message: err.message, stack: err.stack };
    fs.writeFileSync('scripts/audit_results.json', JSON.stringify(auditLog, null, 2), 'utf8');
  } finally {
    await browser.close();
  }
}

runAudit();
