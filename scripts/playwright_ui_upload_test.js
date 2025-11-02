const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function run() {
  const base = process.argv[2] || 'http://localhost:3060';
  const tmpDir = path.join(__dirname, 'tmp');
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch(_){}
  const filePath = path.join(tmpDir, 'test-upload-config.json');
  const content = JSON.stringify({ servers: [{ mode: 'http', url: 'http://example' }] }, null, 2);
  fs.writeFileSync(filePath, content, 'utf8');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('[page error]', err && err.message ? err.message : String(err)));
  // Instrument addEventListener before the page script runs to capture registrations
  await page.addInitScript(() => {
    (function() {
      const orig = EventTarget.prototype.addEventListener;
      window.__addedListeners = window.__addedListeners || [];
      EventTarget.prototype.addEventListener = function(type, fn, opts) {
        try {
          const id = this && this.id ? this.id : (this && this.tagName ? this.tagName : null);
          window.__addedListeners.push({ id, type });
        } catch (e) {}
        return orig.call(this, type, fn, opts);
      };
    })();
  });
  page.on('console', msg => {
    console.log('[page]', msg.type(), msg.text());
  });
  await page.goto(base, { waitUntil: 'load' });

  // Read what listeners were registered during initialization
  const addedListeners = await page.evaluate(() => window.__addedListeners || []);
  console.log('Added listeners captured during init:', addedListeners.slice(0, 60));

  // Ensure the file input exists
  const input = await page.$('#config-json-input');
  if (!input) {
    console.error('File input #config-json-input not found');
    await browser.close();
    process.exit(2);
  }

  // Set the file to upload
  // Click the UI button that normally opens the file picker, then set files.
  // This mirrors real user flow and ensures any related UI logic runs.
  try {
    await page.click('#load-json-btn');
  } catch (e) {
    console.warn('Could not click #load-json-btn', e?.message || e);
  }
  // Install a quick debug listener inside the page to detect change events
  await page.evaluate(() => {
    const inp = document.getElementById('config-json-input');
    if (inp) {
      inp.addEventListener('change', () => console.log('DBG: page change event fired'));
    }
  });
  await input.setInputFiles(filePath);
  // Debug: read input.files info inside the page
  const fileInfo = await page.evaluate(() => {
    const inp = document.getElementById('config-json-input');
    if (!inp || !inp.files || inp.files.length === 0) return null;
    const f = inp.files[0];
    return { name: f.name, size: f.size };
  });
  console.log('Input.files info after setInputFiles:', fileInfo);

  // Inspect whether the page-side handlers are present
  const handlersInfo = await page.evaluate(() => {
    return {
      appVersion: window.APP_VERSION || null,
      hasHandleConfigFile: typeof handleConfigFile === 'function',
      hasDiagnose: typeof diagnoseConfigContent === 'function',
      labelText: (document.getElementById('config-file-name') || {}).textContent || null
    };
  });
  console.log('Handlers info:', handlersInfo);

  // Debug: count input elements with same id and print their outerHTML (truncated)
  const inputsInfo = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('#config-json-input'));
    return nodes.map(n => ({ name: n.id, outer: (n.outerHTML || '').slice(0, 200) }));
  });
  console.log('Inputs info:', inputsInfo);

  // Force-dispatch a change event to see if the page reacts (some environments
  // may not auto-fire it). We'll give the page a short moment to log.
  await page.evaluate(() => {
    const inp = document.getElementById('config-json-input');
    if (inp) inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(600);

  // The UI's change handler should call diagnose and then replace the config
  // Wait for the config file name label to update from 'No file selected'
  await page.waitForFunction(() => {
    const el = document.getElementById('config-file-name');
    return el && el.textContent && el.textContent.trim() !== 'No file selected' && el.textContent.trim() !== '';
  }, { timeout: 15000 });

  const label = await page.$eval('#config-file-name', el => el.textContent.trim());
  console.log('Config file name label:', label);

  // Wait for servers list to populate (at least one server card)
  await page.waitForFunction(() => {
    const list = document.getElementById('servers-list');
    if (!list) return false;
    return list.querySelectorAll('.server-card').length > 0;
  }, { timeout: 10000 });

  const serverCount = await page.$$eval('.server-card', nodes => nodes.length);
  console.log('Server cards found:', serverCount);

  // Extract the first server name
  const firstName = await page.$eval('.server-name', n => n.textContent.trim());
  console.log('First server name:', firstName);

  await browser.close();
  // simple validation
  if (serverCount > 0) {
    console.log('UI upload test passed');
    process.exit(0);
  }
  console.error('UI upload test failed: no server cards');
  process.exit(3);
}

run().catch(e => { console.error('Test error', e); process.exit(4); });
