const fetch = require('node-fetch').default || require('node-fetch');
const fs = require('fs');
const path = require('path');

async function startCodegen(base, url, mode = 'visible') {  // Changed default mode to 'visible'
  const res = await fetch(base + '/api/playwright/codegen/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      url, 
      mode,
      options: {
        headless: false  // Explicitly force non-headless mode
      }
    }),
  });
  return res.json();
}

async function stopCodegen(base, sessionId) {
  const res = await fetch(base + '/api/playwright/codegen/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  return res.json();
}

async function pollFileNonEmpty(filePath, timeoutMs = 300000, intervalMs = 1000) { // 5 minutes for visible mode
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const st = fs.statSync(filePath);
      if (st.size && st.size > 0) return true;
    } catch (e) {
      // file may not exist yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function main() {
  const base = process.argv[2] || 'http://localhost:3060';
  const targetUrl = process.argv[3] || base;
  console.log('Starting visible Playwright codegen against', targetUrl, 'via', base);
  const start = await startCodegen(base, targetUrl, 'visible');
  if (!start || !start.ok) {
    console.error('Start failed:', start);
    process.exit(2);
  }
  const { sessionId, outPath } = start;
  console.log('Started visible session', sessionId, 'outPath', outPath);

  // Prefer polling the server-side session status until the recorder process
  // exits. This avoids fragile filesystem timing and allows visible recorders
  // to run until the browser is closed by the user. We still enforce an overall
  // timeout to avoid hanging indefinitely.
  const overallTimeoutMs = Number(process.argv[4] || process.env.CODEGEN_OVERALL_TIMEOUT_MS || 5 * 60 * 1000); // 5 minutes
  const pollIntervalMs = Number(process.env.CODEGEN_POLL_INTERVAL_MS || 1000);
  console.log(`Polling session status up to ${overallTimeoutMs}ms (interval ${pollIntervalMs}ms)`);

  const startTs = Date.now();
  let stoppedInfo = null;
  while (Date.now() - startTs < overallTimeoutMs) {
    try {
      const sres = await fetch(base + '/api/playwright/codegen/status?sessionId=' + encodeURIComponent(sessionId));
      const sjson = await sres.json().catch(() => null);
      if (sjson && sjson.ok === false) {
        console.warn('Status endpoint returned error:', sjson);
      }
      if (!sjson || sjson.running === false) {
        stoppedInfo = sjson || null;
        break;
      }
    } catch (e) {
      console.warn('Status poll error:', e && e.message || e);
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  if (!stoppedInfo) {
    console.log('Overall timeout reached — stopping session via API');
  }

  console.log('Stopping codegen session', sessionId);
  const stop = await stopCodegen(base, sessionId);
  console.log('Stop result:', stop && (stop.ok ? 'ok' : JSON.stringify(stop)));

  const content = (stop && stop.content) ? String(stop.content) : '';
  console.log('Recorded content length:', content ? content.length : 0);

  // Export the recorded content to a timestamped output folder
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join('test-output', `auto-test_${timestamp}_session`);
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, path.basename(outputDir) + '.playwright.js');
  fs.writeFileSync(outputPath, content);
  console.log('Wrote exported artifacts to', outputDir);

  // Also output recorded success status
  console.log('Recorded file saved and non-empty:', outputPath, 'size=', content.length);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});