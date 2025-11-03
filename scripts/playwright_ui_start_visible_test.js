const { chromium } = require('playwright');
const fetch = require('node-fetch').default || require('node-fetch');
const fs = require('fs');
const path = require('path');

async function waitForFile(filePath, timeoutMs = 15000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (fs.existsSync(filePath)) return true;
    } catch (e) {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function main() {
  const base = process.argv[2] || 'http://localhost:3060';
  console.log('Opening UI at', base);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });

  // Debug: dump initial page content (truncated) to help diagnose missing UI elements
  const pageHtml = await page.content();
  console.log('Page HTML snapshot (first 1500 chars):\n', pageHtml.slice(0, 1500));

  // Wait for the servers list element to be present in the DOM
  await page.waitForSelector('#servers-list', { timeout: 10000, state: 'attached' });

  // Find the server card for Playwright Codegen and expand it (details are collapsed by default)
  // The UI may not have rendered the internal "Playwright Codegen" server card yet.
  // Inject a small server-card into the servers list that the existing click handler
  // will recognize (it looks up entries by dataset.entryId / serverName).
  await page.evaluate((baseUrl) => {
    const list = document.getElementById('servers-list');
    if (!list) return;
    // Create a server card node compatible with the client handlers
    const card = document.createElement('div');
    card.className = 'server-card';
    card.dataset.entryId = 'playwright-codegen';
    card.innerHTML = `
      <div class="server-header">
        <span class="status-dot"></span>
        <div class="server-info">
          <span class="server-name">Playwright Codegen</span>
          <span class="server-meta"></span>
        </div>
        <button class="toggle-details" title="Toggle details">▶</button>
      </div>
      <div class="server-summary"></div>
      <div class="server-details">
        <div class="detail-block playwright-codegen-block">
          <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
            <input type="text" class="playwright-url-input" placeholder="Enter start URL" value="${baseUrl}" style="flex:1; padding:6px;" />
            <button type="button" class="playwright-start" data-entry-id="playwright-codegen">Start</button>
            <button type="button" class="playwright-pause" data-entry-id="playwright-codegen">Pause</button>
            <button type="button" class="playwright-stop" data-entry-id="playwright-codegen">Stop</button>
          </div>
          <div style="margin-top:8px;">
            <label style="font-weight:600;">Recorded script (JS)</label>
            <textarea class="playwright-recording-text" style="width:100%;height:140px;"></textarea>
          </div>
        </div>
      </div>`;
    list.appendChild(card);
  }, base);

  // Wait for the injected block to be visible
  await page.waitForSelector('.playwright-codegen-block', { timeout: 10000, state: 'visible' });
  const block = await page.$('.playwright-codegen-block');

  // Fill the start URL input with the base URL
  const inputSel = '.playwright-codegen-block .playwright-url-input';
  await page.fill(inputSel, base);

  // Prepare to observe the start network request
  const startRespPromise = page.waitForResponse((resp) => {
    try {
      return resp.url().endsWith('/api/playwright/codegen/start') && resp.request().method() === 'POST';
    } catch (e) { return false; }
  }, { timeout: 10000 });

  // Click Start
  await page.click('.playwright-codegen-block .playwright-start');
  console.log('Clicked Start button, waiting for server response...');

  const resp = await startRespPromise;
  const json = await resp.json().catch(() => null);
  console.log('Start response:', json);
  if (!json || !json.ok || !json.sessionId || !json.outPath) {
    throw new Error('Start endpoint did not return a valid session: ' + JSON.stringify(json));
  }

  // Poll server-side status until the recorder process exits (visible recorder)
  const overallTimeoutMs = 2 * 60 * 1000; // 2 minutes
  const pollIntervalMs = 1000;
  const startTs = Date.now();
  let finalStatus = null;
  while (Date.now() - startTs < overallTimeoutMs) {
    try {
      const s = await fetch(base + '/api/playwright/codegen/status?sessionId=' + encodeURIComponent(json.sessionId));
      const sj = await s.json().catch(() => null);
      console.log('Status poll:', sj && (sj.running === false ? 'stopped' : 'running'));
      if (!sj || sj.running === false) { finalStatus = sj; break; }
    } catch (e) {
      console.warn('Status poll error:', e && e.message || e);
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  // If not stopped within timeout, call stop endpoint to force retrieval
  console.log('Stopping session via API (sessionId=', json.sessionId, ')');
  const stopResp = await fetch(base + '/api/playwright/codegen/stop', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: json.sessionId })
  });
  const stopJson = await stopResp.json().catch(() => null);
  console.log('Stop response:', stopJson && (stopJson.ok ? 'ok' : stopJson));

  const content = stopJson && stopJson.content ? String(stopJson.content) : '';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join('test-output', `ui-auto-test_${timestamp}_session`);
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `recording.playwright.js`);
  fs.writeFileSync(outputPath, content, { encoding: 'utf8' });
  console.log('Saved recording to', outputPath, 'size=', content.length);

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Test failed:', err && err.message || err);
  process.exit(1);
});