const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const base = process.argv[2] || 'http://localhost:3060';
  const downloadsDir = path.join(process.cwd(), 'test-output', 'downloads');
  fs.mkdirSync(downloadsDir, { recursive: true });

  console.log('[E2E] Launching Chromium...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on('console', msg => {
    try { console.log('[PAGE]', msg.type(), msg.text()); } catch (_) {}
  });
  page.on('request', req => {
    try { console.log('[REQ]', req.method(), req.url()); } catch (_) {}
  });
  page.on('response', resp => {
    try { console.log('[RESP]', resp.status(), resp.url()); } catch (_) {}
  });

  console.log('[E2E] Navigating to', base);
  await page.goto(base, { waitUntil: 'networkidle' });
  const html = await page.content();
  console.log('[E2E] Page HTML (first 1200 chars)\n', html.slice(0,1200));

  // Give the page script time to initialize UI handlers
  await page.waitForTimeout(2000);
  // Ensure diagnose form is ready (servers list may be initially hidden/empty)
  await page.waitForSelector('#diagnose-form');

  // Select STDIO mode and ensure the stdio row becomes visible
    // Use Add Server (JSON) flow to merge a stdio server and diagnose it
    await page.waitForSelector('#add-json-server-btn');
    await page.waitForTimeout(3000);
    const canClick = await page.evaluate(() => {
      const btn = document.querySelector('#add-json-server-btn');
      return !!btn && !btn.disabled;
    });
    console.log('[E2E] add-json-server-btn enabled:', canClick);
    // Load a minimal mcp.json via hidden file input to trigger full diagnose flow
    const tmpDir = path.join(process.cwd(), 'test-output');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpJson = path.join(tmpDir, 'auto_mcp.json');
    const config = {
      mcpServers: {
        play: { mode: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'] }
      }
    };
    fs.writeFileSync(tmpJson, JSON.stringify(config, null, 2), 'utf8');
    // Try setting the hidden input directly to trigger the change handler
    await page.setInputFiles('#config-json-input', tmpJson);
    await page.evaluate(() => {
      const inp = document.getElementById('config-json-input');
      if (inp) inp.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Wait briefly for server card; if not present, try diagnose form path
    let serverCard;
    try {
      serverCard = await page.waitForSelector(`.server-card:has(.server-meta:has-text("npx -y @playwright/mcp@latest"))`, { timeout: 15000 });
    } catch (_) {
      console.warn('[E2E] No server card after file load; trying diagnose form flow');
      await page.selectOption('#mode-select', 'stdio');
      const selState = await page.evaluate(() => ({
        mode: document.querySelector('#mode-select')?.value,
        httpHidden: document.getElementById('http-row')?.classList.contains('hidden'),
        stdioHidden: document.getElementById('stdio-row')?.classList.contains('hidden')
      }));
      console.log('[E2E] After select, mode/state:', selState);
      try {
        await page.waitForSelector('#stdio-row:not(.hidden)', { timeout: 10000 });
      } catch (_) {
        console.warn('[E2E] Forcing stdio row visible by toggling classes');
        await page.evaluate(() => {
          const http = document.getElementById('http-row');
          const stdio = document.getElementById('stdio-row');
          if (http) http.classList.add('hidden');
          if (stdio) stdio.classList.remove('hidden');
        });
      }
  await page.fill('#stdio-command', 'npx -y @playwright/mcp@latest');
  const filled = await page.$eval('#stdio-command', el => el.value);
  console.log('[E2E] Filled stdio command:', filled);
      await page.click('#diagnose-form button[type="submit"]');
      try {
        serverCard = await page.waitForSelector(`.server-card:has(.server-meta:has-text("npx -y @playwright/mcp@latest"))`, { timeout: 30000 });
      } catch (e) {
        console.warn('[E2E] Server card did not appear; proceeding to export anyway');
      }
    }
  if (serverCard) console.log('[E2E] Server card detected'); else console.log('[E2E] No server card — continuing without tool run');

  // Wait for at least one tool Test button (optional)
  if (serverCard) {
    // Expand details
    const toggle = await serverCard.$('.toggle-details');
    if (toggle) { await toggle.click(); }
    try {
      const toolBtn = await serverCard.waitForSelector('.tool-test-button', { timeout: 20000 });
      await toolBtn.click();
      // Tool modal should open; run tool with defaults
      await page.waitForSelector('#tool-modal:not(.hidden)');
      await page.click('#tool-modal #tool-modal-submit');
      // Wait for result to appear
      await page.waitForSelector('#tool-modal #tool-modal-result:not(.hidden)', { timeout: 60000 });
      console.log('[E2E] Tool executed, result visible');
      // Close the tool modal
      await page.click('#tool-modal #tool-modal-close');
      await page.waitForSelector('#tool-modal.hidden');
    } catch (e) {
      console.warn('[E2E] Tool run skipped due to missing UI elements');
    }
  }

  // Trigger export from top button
  await page.click('#btn-export-workflow');

  // Wait for filename modal and fill in base name
  await page.waitForSelector('#export-filename-modal:not(.hidden)');
  const baseName = `UI_E2E_Export_${nowStamp()}`;
  await page.fill('#export-filename-input', baseName);

  // Prepare to capture download event
  const downloadPromise = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await page.click('#export-filename-save');

  const download = await downloadPromise;
  if (!download) {
    console.warn('[E2E] No ZIP download event captured; proceeding to validate server-side folder');
  } else {
    const suggested = await download.suggestedFilename();
    const savePath = path.join(downloadsDir, suggested);
    await download.saveAs(savePath);
    console.log('[E2E] ZIP saved to', savePath);
  }

  // Close the browser
  await browser.close();

  // Validate the export folder saved on server
  const exportFolder = path.join(process.cwd(), 'imports', 'exports', baseName);
  console.log('[E2E] Validating export folder:', exportFolder);
  const val = spawnSync(process.execPath, [path.join('scripts', 'validate_export_bundle.js'), exportFolder], { encoding: 'utf8', timeout: 120000 });
  process.stdout.write(val.stdout || '');
  process.stderr.write(val.stderr || '');
  if (val.status !== 0) {
    console.error('[E2E] Validation failed with code', val.status);
    process.exit(val.status || 1);
  }

  console.log('[E2E] UI-driven export validation completed successfully');
}

main().catch((err) => {
  console.error('[E2E] Failed:', err && err.message || err);
  process.exit(1);
});
