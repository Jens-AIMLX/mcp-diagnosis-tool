const { chromium } = require('playwright');
const path = require('path');

(async () => {
  // Wait for server to become available (simple HTTP poll)
  const base = process.env.BASE_URL || 'http://localhost:3060';
  const waitForServer = async (url, timeoutMs = 10000) => {
    const start = Date.now();
    const http = require('http');
    while (Date.now() - start < timeoutMs) {
      try {
        await new Promise((resolve, reject) => {
          const req = http.get(url + '/api/server/info', (res) => {
            res.resume();
            resolve();
          });
          req.on('error', reject);
        });
        return true;
      } catch (_) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
    return false;
  };

  const up = await waitForServer(base, 10000);
  if (!up) throw new Error(`Server not reachable at ${base}`);

  // Run headful so dialogs are visible and easier to capture in logs
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  // Inject handlers early (before page load) to capture alert stacks and global errors
  await page.addInitScript(() => {
    // Override alert to log stack plus the message
    const origAlert = window.alert;
    window.alert = function (msg) {
      try {
        // Log a stack trace so we can find the origin of alerts triggered by caught errors
        // eslint-disable-next-line no-console
        console.error('[ALERT TRACE]', msg);
        throw new Error('alert-called');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e.stack);
      }
      return origAlert.call(window, msg);
    };
    // Global error handlers to catch unhandled errors/rejections
    window.addEventListener('error', (ev) => {
      try {
        // eslint-disable-next-line no-console
        console.error('[UNHANDLED ERROR]', ev.error ? ev.error.stack : ev.message);
      } catch (_) {}
    });
    window.addEventListener('unhandledrejection', (ev) => {
      try {
        // eslint-disable-next-line no-console
        console.error('[UNHANDLED REJECTION]', ev.reason && ev.reason.stack ? ev.reason.stack : String(ev.reason));
      } catch (_) {}
    });
  });

  page.on('console', msg => console.log('[PAGE]', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('[PAGE ERR]', err && err.stack ? err.stack : err));
  // Capture dialogs (alerts) early so they are not missed
  page.on('dialog', async dialog => {
    console.log('[DIALOG]', dialog.type(), dialog.message());
    try { await dialog.dismiss(); } catch(_){}
  });

  console.log('Opening', base);
  await page.goto(base, { waitUntil: 'domcontentloaded' });

  // Click the button that opens the file picker (this reveals a hidden input)
  await page.click('#load-json-btn');

  // Set file input directly to upload the test config
  // Use specific cognitive config requested by user
  const filePath = path.resolve(__dirname, 'mcp-config-subconfigs_cognitive.json');
  console.log('Uploading file:', filePath);
  await page.setInputFiles('#config-json-input', filePath);

  // Capture the POST /api/config/diagnose response when it finishes
  page.on('requestfinished', async (request) => {
    try {
      const url = request.url();
      const method = request.method();
      if (method === 'POST' && url.endsWith('/api/config/diagnose')) {
        const response = await request.response();
        const status = response.status();
        const text = await response.text().catch(() => '<no body>');
        console.log('[NET] POST /api/config/diagnose ->', status, text.slice(0, 500));
      }
    } catch (e) {
      console.error('Error reading requestfinished:', e);
    }
  });

  // Wait for the client to POST and process the response; capture any errors
  await page.waitForTimeout(3000);

  // Read the config file name label to see result
  const label = await page.textContent('#config-file-name');
  console.log('Config label:', label);
  // Fail the script if the label indicates failure
  const failed = String(label || '').toLowerCase().includes('failed');
  if (failed) {
    console.error('Upload test failed — UI reported failure:', label);
    await browser.close();
    process.exit(2);
  }

  // Also capture any visible alert by checking for plain window.alert call: page.on('dialog')
  page.on('dialog', async dialog => {
    console.log('[DIALOG]', dialog.type(), dialog.message());
    await dialog.dismiss();
  });

  await browser.close();
})();
