const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Ensure recordings directory exists
const recordingsDir = path.join(__dirname, '..', 'playwright-recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

(async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const testConfig = path.join(repoRoot, 'test', 'mcp-config-subconfigs_cognitive.json');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture alerts as exceptions
  await page.exposeFunction('nodeAlert', (msg) => {
    console.error('[ALERT]', msg);
    throw new Error('alert-called: ' + String(msg));
  });
  await page.addInitScript(() => {
    const oldAlert = window.alert;
    window.alert = function (msg) {
      try { window.nodeAlert && window.nodeAlert(String(msg)); } catch (e) { /* ignore */ }
      oldAlert(msg);
    };
  });

  page.on('console', (m) => console.log('[PAGE]', m.type(), m.text()));
  page.on('pageerror', (err) => console.error('[PAGE] pageerror', err));

  console.log('Opening http://localhost:3060');
  await page.goto('http://localhost:3060', { waitUntil: 'domcontentloaded' });

  // Click the load JSON button to reveal the hidden file input, then set the file
  await page.click('#load-json-btn');
  console.log('Uploading file:', testConfig);
  await page.setInputFiles('#config-json-input', testConfig);
  console.log('Uploaded config file');

  // Wait for diagnose to complete and servers to render (same check as upload test)
  await page.waitForFunction(() => {
    const label = document.querySelector('#config-file-name');
    return label && /\d+ servers/i.test(label.textContent || '');
  }, { timeout: 20000 });
  console.log('Config diagnosed and servers rendered');

  // Find all server cards and locate the one with codegen block
  const cards = await page.$$('.server-card');
  let codegenCard = null;
  for (const c of cards) {
    const has = await c.$('.playwright-codegen-block');
    if (has) {
      codegenCard = c;
      break;
    }
  }
  if (!codegenCard) {
    console.error('No Playwright codegen card present');
    await browser.close();
    process.exit(2);
  }
  console.log('Found Playwright codegen card');

  // Click the toggle button to expand card details
  const toggleBtn = await codegenCard.$('button.toggle-details');
  if (!toggleBtn) {
    console.error('Toggle details button missing');
    await browser.close();
    process.exit(3);
  }
  await toggleBtn.click();
  // Small delay to let expansion animation complete
  await page.waitForTimeout(300);

  // Wait for details to be visible
  await page.waitForSelector('.server-details:not(.hidden)', { timeout: 5000 });

  // Get the Start button
  const startBtn = await codegenCard.$('button.playwright-start');
  if (!startBtn) {
    console.error('Start button missing');
    await browser.close();
    process.exit(4);
  }

  // Wait for URL input to be visible and interactable
  const urlInput = await page.waitForSelector('input.playwright-url-input', {
    state: 'visible',
    timeout: 5000
  });

  // Fill URL if empty
  let urlVal = await urlInput.inputValue();
  if (!urlVal) {
    await urlInput.fill('https://example.com');
    urlVal = 'https://example.com';
  }
  console.log('Starting Playwright codegen at', urlVal);

  // Intercept network to watch for codegen start/stop
  let startResponse = null;
  page.on('response', async (resp) => {
    try {
      const url = resp.url();
      if (url.endsWith('/api/playwright/codegen/start')) {
        const json = await resp.json().catch(() => null);
        startResponse = json;
        console.log('[NET] codegen/start ->', json && json.ok ? 'ok' : 'failed', json);
        // Set a marker the test can wait for
        await page.evaluate(() => { window.__last_playwright_start_ok = true; });
      }
      if (url.endsWith('/api/playwright/codegen/stop')) {
        const json = await resp.json().catch(() => null);
        console.log('[NET] codegen/stop ->', json && json.ok ? 'ok' : 'failed', json);
        await page.evaluate(() => { window.__last_playwright_stop_ok = true; });
      }
    } catch (e) { /* ignore parse errors */ }
  });

  // Click Start and wait for the start network response
  await startBtn.click();
  const startOk = await page.waitForFunction(() => {
    // Check for an in-page marker or rely on network-captured variable via window
    return !!window.__last_playwright_start_ok;
  }, { timeout: 20000 }).catch(() => null);

  // Wait to capture outPath from start response
  const outPath = startResponse?.outPath;
  if (!outPath) {
    console.error('No output path received from start response');
    await browser.close();
    process.exit(5);
  }

  // Create a new context for recording navigation
  const testCtx = await browser.newContext();
  const testPage = await testCtx.newPage();
  await testPage.goto('http://example.com');
  await testPage.close();
  await testCtx.close();
  
  // Wait longer to ensure actions are recorded
  await page.waitForTimeout(2000);

  const stopBtn = await page.waitForSelector('button.playwright-stop', {
    state: 'visible',
    timeout: 5000
  });
  if (!stopBtn) {
    console.error('Stop button missing');
    await browser.close();
    process.exit(6);
  }
  console.log('Stopping Playwright codegen');
  await stopBtn.click({
    force: true, // Use force click in case the button is temporarily obscured
    timeout: 5000
  });

  // Wait for stop network response marker
  await page.waitForFunction(() => {
    return !!window.__last_playwright_stop_ok;
  }, { timeout: 20000 }).catch(() => null);

  // Read the actual recording file after waiting for file write to complete
  await new Promise(r => setTimeout(r, 1000));
  try {
    const content = fs.readFileSync(outPath, 'utf8');
    console.log('Recorded script length:', content ? content.length : 0);
    if (!content || content.trim().length === 0) {
      console.error('Recorded script is empty — codegen may have failed');
      await browser.close();
      process.exit(7);
    }
    console.log('Sample of recorded script:\n', content.slice(0, 200));
  } catch (err) {
    console.error('Failed to read recording file:', err);
    await browser.close();
    process.exit(8);
  }

  console.log('Playwright codegen flow successful');
  await browser.close();
  process.exit(0);
})();