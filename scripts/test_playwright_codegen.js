const fetch = require('node-fetch').default || require('node-fetch');
const fs = require('fs');
const path = require('path');

async function startCodegen(base, url, mode = 'auto') {
  const res = await fetch(base + '/api/playwright/codegen/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, mode }),
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

async function pollFileNonEmpty(filePath, timeoutMs = 60000, intervalMs = 1000) {
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
  console.log('Starting Playwright codegen against', targetUrl, 'via', base);
  const start = await startCodegen(base, targetUrl, 'auto');
  if (!start || !start.ok) {
    console.error('Start failed:', start);
    process.exit(2);
  }
  const { sessionId, outPath } = start;
  console.log('Started session', sessionId, 'outPath', outPath);

  const absolute = path.resolve(outPath);
  console.log('Polling for recorded file to be written at', absolute);
  const ok = await pollFileNonEmpty(absolute, 60000, 1000);
  if (!ok) {
    console.warn('Timed out waiting for file to be written or become non-empty');
  } else {
    console.log('Recorded file detected and is non-empty');
  }

  console.log('Stopping codegen session', sessionId);
  const stop = await stopCodegen(base, sessionId);
  console.log('Stop result:', stop);
  if (stop && stop.ok) {
    console.log('Recorded content length:', (stop.content || '').length);
    // Fetch server-side export template and assemble a real artifact set including the recording
    const tmplRes = await fetch(base + '/api/export/template', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec: { mode: 'http', url: targetUrl }, serverName: 'auto-test', appVersion: 'test-version-1' }) });
    const tmpl = await tmplRes.json();
    if (!tmpl || !tmpl.ok) {
      console.error('Failed to fetch export template', tmpl);
      process.exit(4);
    }
    const artifacts = tmpl;
    artifacts.playwrightJs = stop.content || '';
    artifacts.playwrightPy = '# Playwright Python shim - automated recorder did not produce Python version\n';

    // Create an output folder and write files like the UI save would
    const fs = require('fs');
    const path = require('path');
    const outDir = path.join(__dirname, '..', 'test-output', artifacts.baseName || ('export_' + Date.now()));
    fs.mkdirSync(outDir, { recursive: true });
    // Write main artifacts
    fs.writeFileSync(path.join(outDir, (artifacts.baseName || 'export') + '.yaml'), artifacts.yaml || '', { encoding: 'utf8' });
    fs.writeFileSync(path.join(outDir, (artifacts.baseName || 'export') + '.js'), artifacts.js || '', { encoding: 'utf8' });
    fs.writeFileSync(path.join(outDir, (artifacts.baseName || 'export') + '.py'), artifacts.py || '', { encoding: 'utf8' });
    fs.writeFileSync(path.join(outDir, (artifacts.baseName || 'export') + '.api.js'), artifacts.apiJs || '', { encoding: 'utf8' });
    fs.writeFileSync(path.join(outDir, (artifacts.baseName || 'export') + '.api.ps1'), artifacts.apiPs || '', { encoding: 'utf8' });
    fs.writeFileSync(path.join(outDir, (artifacts.baseName || 'export') + '.api.yaml'), artifacts.apiYaml || '', { encoding: 'utf8' });
    // Write Playwright companions
    fs.writeFileSync(path.join(outDir, (artifacts.baseName || 'export') + '.playwright.js'), artifacts.playwrightJs || '', { encoding: 'utf8' });
    fs.writeFileSync(path.join(outDir, (artifacts.baseName || 'export') + '.playwright.py'), artifacts.playwrightPy || '', { encoding: 'utf8' });

    // Inject a simple execute_playwright_recording step into YAML (naive prepend)
    const yamlPath = path.join(outDir, (artifacts.baseName || 'export') + '.yaml');
    try {
      let y = fs.readFileSync(yamlPath, { encoding: 'utf8' });
      const execStep = "steps:\n  - action: 'execute_playwright_recording'\n    file: '" + ((artifacts.baseName || 'export') + ".playwright.js") + "'\n";
      // Replace first occurrence of "steps:\n  []" or append if not found
      if (y.indexOf("steps:\n  []") !== -1) {
        y = y.replace("steps:\n  []", execStep + "  []");
      } else {
        y = y + '\n' + execStep;
      }
      fs.writeFileSync(yamlPath, y, { encoding: 'utf8' });
    } catch (e) {
      console.warn('Failed to inject exec step into YAML:', e && e.message);
    }

    console.log('Wrote exported artifacts to', outDir);
    // Validate files exist and playwright recording is non-empty
    const recordedPath = path.join(outDir, (artifacts.baseName || 'export') + '.playwright.js');
    const stat = fs.statSync(recordedPath);
    if (stat.size > 0) {
      console.log('Recorded file saved and non-empty:', recordedPath, 'size=', stat.size);
      process.exit(0);
    }
    console.error('Recorded file is empty after stop, failing test');
    process.exit(3);
  }
  console.warn('Stop did not return ok');
  process.exit(5);
}

main().catch((e) => { console.error(e); process.exit(4); });
