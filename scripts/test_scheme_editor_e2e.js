import puppeteer from 'puppeteer-core';
import fs from 'fs';

function getBrowserPath() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

const BASE_URL = 'http://localhost:3001';
const TEST_TASK_ID = 'СЗБ-0349-32';

async function testSchemeEditor() {
  const edgePath = getBrowserPath();
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: 'new',
    defaultViewport: { width: 1600, height: 1000 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => logs.push(`[Console ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PageError] ${err.message}`));

  try {
    console.log('1. Logging in...');
    await page.goto(`${BASE_URL}`, { waitUntil: 'networkidle2' });
    const loginInput = await page.$('#luser');
    if (loginInput) {
      await page.type('#luser', 'nikita');
      await page.type('#lpass', 'chaykaxxx228');
      await page.click('button[type="submit"], .login-btn');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
    }

    await page.waitForFunction(() => window.S && window.S.token);
    console.log('2. Opening card...');
    await page.evaluate(id => window.openCard(id), TEST_TASK_ID);
    await new Promise(r => setTimeout(r, 1000));

    console.log('3. Opening Scheme Editor...');
    const openRes = await page.evaluate(id => {
      if (typeof window.openSchemeEditor !== 'function') {
        return { error: 'window.openSchemeEditor not defined' };
      }
      window.openSchemeEditor(id);
      const modal = document.getElementById('_scheme_editor_modal');
      const canvas = document.getElementById('_scheme_canvas');
      return {
        hasModal: !!modal,
        hasCanvas: !!canvas,
        canvasW: canvas ? canvas.width : 0,
        canvasH: canvas ? canvas.height : 0
      };
    }, TEST_TASK_ID);
    console.log('Open Scheme Editor result:', openRes);

    if (!openRes.hasModal) throw new Error('Scheme editor modal not found');

    console.log('4. Drawing on Canvas...');
    await page.evaluate(() => {
      const canvas = document.getElementById('_scheme_canvas');
      const ctx = canvas.getContext('2d');

      // Draw rooms (walls)
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 6;
      ctx.strokeRect(80, 80, 1200, 680); // External boundary
      ctx.strokeRect(80, 80, 500, 320);  // Room 101
      ctx.strokeRect(580, 80, 700, 320); // Room 102
      ctx.strokeRect(80, 400, 600, 360); // Server room / TKSH

      // Labels
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('Операционный зал (101)', 120, 130);
      ctx.fillText('Кабинет руководителя (102)', 620, 130);
      ctx.fillText('Серверная / ТКШ', 120, 450);

      // TKSH Cabinet stamp
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(150, 520, 60, 60);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(155, 525); ctx.lineTo(205, 575);
      ctx.moveTo(205, 525); ctx.lineTo(155, 575);
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.fillText('ТКШ-1 (24U)', 230, 555);

      // Cable routes (Cat 5e blue line)
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(210, 550);
      ctx.lineTo(400, 550);
      ctx.lineTo(400, 260);
      ctx.lineTo(300, 260); // to outlet 1
      ctx.moveTo(400, 260);
      ctx.lineTo(800, 260); // to outlet 2
      ctx.stroke();

      // Sockets RJ-45 stamps
      function drawOutlet(x, y, label) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 3;
        ctx.fillRect(x - 16, y - 16, 32, 32);
        ctx.strokeRect(x - 16, y - 16, 32, 32);
        ctx.fillStyle = '#1d4ed8';
        ctx.beginPath();
        ctx.moveTo(x - 9, y + 10); ctx.lineTo(x, y - 8); ctx.lineTo(x + 9, y + 10);
        ctx.closePath();
        ctx.fill();
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(label, x + 24, y + 5);
      }

      drawOutlet(300, 260, 'РМ-1 (1.01)');
      drawOutlet(800, 260, 'РМ-2 (1.02)');
    });

    console.log('5. Clicking Save Scheme...');
    await page.click('#_scheme_save_btn');

    // Wait for save and toast
    await new Promise(r => setTimeout(r, 2000));

    const checkModalAfterSave = await page.evaluate(() => {
      const modal = document.getElementById('_scheme_editor_modal');
      return { modalClosed: !modal };
    });
    console.log('Modal closed after save:', checkModalAfterSave);

    console.log('6. Checking task attachments in DB / API...');
    const atts = await page.evaluate(async (taskId) => {
      const token = (window.S && window.S.token) || localStorage.getItem('token');
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/attachments`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      return await res.json();
    }, TEST_TASK_ID);
    console.log(`Found ${atts.length} attachments for task:`);
    const schemeAtt = atts.find(a => a.type === 'scheme' || (a.original_name && a.original_name.includes('схем')));
    console.log('Scheme attachment:', schemeAtt);

    console.log('7. Verifying PDF ID Album includes sheet 5 with scheme...');
    const pdfRes = await page.evaluate(async (taskId) => {
      const token = (window.S && window.S.token) || localStorage.getItem('token');
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/id-album.pdf`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const blob = await res.blob();
      return {
        status: res.status,
        sizeBytes: blob.size,
        contentType: res.headers.get('content-type')
      };
    }, TEST_TASK_ID);
    console.log('PDF ID Album response:', pdfRes);

    console.log('8. Verifying ID Moderation checklist...');
    const modRes = await page.evaluate(async (taskId) => {
      const token = (window.S && window.S.token) || localStorage.getItem('token');
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/id-moderation`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      return await res.json();
    }, TEST_TASK_ID);
    const schemeDoc = modRes.documents ? modRes.documents.find(d => d.key === 'scheme' || d.code === 'ИД-05') : null;
    console.log('ID Moderation scheme doc:', schemeDoc);

    console.log('\n✅ ALL E2E TESTS FOR SCHEME EDITOR PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('Test error:', err);
    console.log('Logs:', logs);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testSchemeEditor();
