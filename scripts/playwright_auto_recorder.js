#!/usr/bin/env node
// Automated Playwright recorder helper
// Usage: node scripts/playwright_auto_recorder.js --url <url> --out <outPath>

const fs = require('fs');
const path = require('path');
function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url' && argv[i+1]) { out.url = argv[i+1]; i++; }
    else if (a === '--out' && argv[i+1]) { out.out = argv[i+1]; i++; }
  }
  return out;
}

async function main() {
  const argv = parseArgs();
  const url = argv.url;
  const outPath = argv.out;

  console.log('auto_recorder starting for', url, '->', outPath);
  // Try to require playwright; if missing, fail with a helpful message
  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.error('playwright module not found. Run `npm install` to install dependencies.');
    try { fs.writeFileSync(outPath, '// ERROR: playwright module missing\n', { encoding: 'utf8' }); } catch(_){}
    process.exit(2);
  }

  // We'll launch a headful Chromium, perform deterministic interactions, and
  // then create a Playwright-style JS script file that mirrors the actions.
  const browser = await playwright.chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Deterministic interaction sequence (simple): navigate, wait, click first link if available
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(500);

    // Try to click the first clickable element that looks like an anchor or button
    const clickHandle = await page.$('a,button,input[type="submit"],[role="button"]');
    if (clickHandle) {
      try {
        await clickHandle.click({ timeout: 5000 });
      } catch (e) {
        // ignore
      }
    }

    // Wait a moment for any navigation/actions to settle
    await page.waitForTimeout(800);

    // Build a simple Playwright JS script that reproduces these actions
    const scriptLines = [];
    scriptLines.push("const { chromium } = require('playwright');");
    scriptLines.push('');
    scriptLines.push('(async () => {');
    scriptLines.push("  const browser = await chromium.launch({ headless: false });");
    scriptLines.push('  const context = await browser.newContext();');
    scriptLines.push('  const page = await context.newPage();');
    scriptLines.push(`  await page.goto(${JSON.stringify(url)});`);
    scriptLines.push('  await page.waitForTimeout(300);');
    if (clickHandle) {
      // attempt to derive a selector for the clicked element
      let selector = null;
      try {
        selector = await page.evaluate((el) => {
          if (el.id) return `#${el.id}`;
          if (el.getAttribute && el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
          if (el.tagName) return el.tagName.toLowerCase();
          return null;
        }, clickHandle);
      } catch (e) { selector = null; }
      if (!selector) selector = 'a,button,input[type="submit"],[role="button"]';
      scriptLines.push(`  await page.click(${JSON.stringify(selector)});`);
      scriptLines.push('  await page.waitForTimeout(300);');
    }
    scriptLines.push('  await browser.close();');
    scriptLines.push('})();');

  // Ensure directory exists
  try { fs.mkdirSync(path.dirname(outPath), { recursive: true }); } catch (_) {}
  fs.writeFileSync(outPath, scriptLines.join('\n'), { encoding: 'utf8' });
  console.log('Wrote automated recording to', outPath);

  } catch (err) {
    console.error('Auto recorder encountered an error:', err && err.message || err);
    try { fs.writeFileSync(outPath, '// ERROR: auto-recorder failed to perform actions\n', { encoding: 'utf8' }); } catch(_){}
    process.exit(3);
  } finally {
    try { await browser.close(); } catch (_) {}
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(4); });
