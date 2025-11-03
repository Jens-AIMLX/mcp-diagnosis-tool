const { chromium } = require('playwright');
const { execSync } = require('child_process');

function listProcesses() {
  try {
    const out = execSync('tasklist', { encoding: 'utf8' });
    return out.split(/\r?\n/).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function countBrowsers(lines) {
  const names = ['chrome.exe', 'msedge.exe', 'brave.exe', 'chromium.exe'];
  const counts = {};
  for (const n of names) counts[n] = 0;
  for (const l of lines) {
    for (const n of names) if (l.toLowerCase().indexOf(n) !== -1) counts[n]++;
  }
  return counts;
}

async function main() {
  const base = process.argv[2] || 'http://localhost:3060';
  const targetUrl = process.argv[3] || 'http://localhost:3002';
  console.log('Opening UI at', base);

  const before = listProcesses();
  const beforeCounts = countBrowsers(before);
  console.log('Browser counts before:', beforeCounts);

  // Start a lightweight HTTP server on the target port to detect navigation if
  // the target is different from the base (avoid port collision with the UI server).
  const http = require('http');
  const targetPort = Number(new URL(targetUrl).port || (new URL(targetUrl).protocol === 'https:' ? 443 : 80));
  let navigationSeen = false;
  let server = null;
  try {
    const basePort = Number(new URL(base).port || (new URL(base).protocol === 'https:' ? 443 : 80));
    if (targetPort && targetPort !== basePort) {
      server = http.createServer((req, res) => {
        console.log('Target server received request:', req.method, req.url, 'from', req.socket.remoteAddress);
        navigationSeen = true;
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      });
      // Listen on all interfaces (IPv4 & IPv6) so browser localhost resolution (::1 vs 127.0.0.1)
      server.listen(targetPort);
      console.log('Started transient target server on', targetUrl);
    } else {
      console.log('Skipping transient target server because target equals base or port unknown');
    }
  } catch (e) {
    console.warn('Failed to start transient target server:', e && e.message || e);
    server = null;
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });

  // Ensure 'keep sessions open' checkbox is checked
  try {
    await page.waitForSelector('#workflow-keep-sessions-open', { timeout: 5000 });
    const checked = await page.$eval('#workflow-keep-sessions-open', el => el.checked);
    if (!checked) {
      console.log('Checking "Keep sessions open"');
      await page.click('#workflow-keep-sessions-open');
    } else {
      console.log('"Keep sessions open" already checked');
    }
  } catch (e) {
    console.warn('Keep sessions checkbox not found:', e.message);
  }

  // Wait for servers list and Playwright card
  await page.waitForSelector('#servers-list', { timeout: 10000 });

  // Wait for the Playwright codegen block to appear; if not present, wait for server-card then expand
  const selectorBlock = '.playwright-codegen-block';
  let blockVisible = false;
  try {
    blockVisible = await page.isVisible(selectorBlock);
  } catch (_) { blockVisible = false; }

  if (!blockVisible) {
    // Try to find the server card and click its toggle to unfold using an in-page click
    const toggled = await page.evaluate(() => {
      const list = document.getElementById('servers-list');
      if (!list) return false;
      const cards = list.querySelectorAll('.server-card');
      for (const c of cards) {
        const text = (c.innerText || '').toLowerCase();
        if (text.indexOf('playwright') !== -1) {
          const t = c.querySelector('.toggle-details');
          if (t) { t.click(); return true; }
        }
      }
      return false;
    });
    if (toggled) {
      console.log('Expanding Playwright server card (in-page click)');
      await page.waitForTimeout(500);
    } else {
      console.log('Playwright server card not found in DOM — attempting to inject helper card');
      await page.evaluate((baseUrl) => {
        const list = document.getElementById('servers-list');
        if (!list) return;
        const card = document.createElement('div');
        card.className = 'server-card';
        card.innerHTML = `
          <div class="server-header">
            <div class="server-info"><span class="server-name">Playwright Codegen</span></div>
            <button class="toggle-details">▶</button>
          </div>
          <div class="server-details">
            <div class="detail-block playwright-codegen-block">
              <input type="text" class="playwright-url-input" value="${baseUrl}" />
              <button class="playwright-start">Start</button>
              <button class="playwright-stop">Stop</button>
            </div>
          </div>
        `;
        list.appendChild(card);
      }, base);
      await page.waitForSelector(selectorBlock, { timeout: 5000 });
    }
  }

  // Ensure URL is filled (use targetUrl)
  const urlSel = '.playwright-codegen-block .playwright-url-input';
  try {
    await page.waitForSelector(urlSel, { timeout: 5000 });
    const current = await page.$eval(urlSel, el => el.value || '');
    if (!current || current.trim() === '') {
      console.log('Filling URL with', targetUrl);
      await page.fill(urlSel, targetUrl);
    } else {
      console.log('Playwright URL input has value:', current);
      if (current.trim() !== targetUrl) {
        console.log('Updating URL to', targetUrl);
        await page.fill(urlSel, targetUrl);
      }
    }
  } catch (e) {
    console.warn('URL input not found:', e.message);
  }

  // Click Start (UI only, no API calls)
  const startBtnSel = '.playwright-codegen-block .playwright-start';
  await page.waitForSelector(startBtnSel, { timeout: 5000 });
  console.log('Clicking Start via UI');
  await page.click(startBtnSel);

  // Wait N seconds to observe visible browser (optional argv[4])
  const waitMs = Number(process.argv[4] || 15000);
  console.log('Waiting', waitMs, 'ms to observe visible browser...');
  await page.waitForTimeout(waitMs);

  const after = listProcesses();
  const afterCounts = countBrowsers(after);
  console.log('Browser counts after:', afterCounts);

  // Compute delta
  const delta = {};
  for (const k of Object.keys(beforeCounts)) delta[k] = (afterCounts[k] || 0) - (beforeCounts[k] || 0);

  console.log('Browser delta (after - before):', delta);

  const started = Object.values(delta).some(v => v > 0);
  // Also check whether target server saw a navigation
  console.log('Navigation seen by transient target server:', navigationSeen);
  // Close transient target server
  try { server.close(); } catch (_) {}
  if (started) {
    console.log('Detected new browser process(es) after clicking Start — visible browser likely started');
  } else {
    console.log('No new browser process detected — visible browser may not have started or already running');
  }

  console.log('Leaving the session open for manual inspection. Closing Playwright UI browser now.');
  await browser.close();
  process.exit(started ? 0 : 2);
}

main().catch(err => {
  console.error('Error:', err && err.message || err);
  process.exit(1);
});
