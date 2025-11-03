#!/usr/bin/env node
// Visible/interactive Playwright recorder helper
// Usage: node scripts/playwright_visible_recorder.js --url <url> --out <outPath>

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

  console.log('visible_recorder starting for', url, '->', outPath);
  // Try to require playwright; if missing, fail with a helpful message
  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.error('playwright module not found. Run `npm install` to install dependencies.');
    try { fs.writeFileSync(outPath, '// ERROR: playwright module missing\n', { encoding: 'utf8' }); } catch(_){}
    process.exit(2);
  }

  // Launch a visible Chrome browser and create a recording script from user interactions
  console.log('Launching visible browser for recording...');
  const browser = await playwright.chromium.launch({
    headless: false,  // Force non-headless mode
    args: ['--start-maximized']  // Start with a maximized window for better visibility
  });
  const context = await browser.newContext({
    viewport: null  // Allow window to be resized by user
  });
  const page = await context.newPage();

  // Track user interactions to build a script
  const actions = [];
  
  // Record navigation
  page.on('framenavigated', async frame => {
    if (frame === page.mainFrame()) {
      actions.push(`await page.goto(${JSON.stringify(frame.url())});`);
    }
  });

  // Record clicks
  // Note: Playwright pages do not emit a high-level 'click' event with an element
  // handle usable in Node. Recording arbitrary clicks robustly requires injecting
  // a page script to listen for DOM events and forward selectors; to keep this
  // helper simple and robust, we only record navigations for now.

  try {
    // Navigate to the initial URL
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    console.log('[VISIBLE] Navigated to URL, waiting for user interactions...');
    console.log('[VISIBLE] The browser window is now open for recording. Interact with the page naturally.');
    console.log('[VISIBLE] When done, close the browser window to save the recording.');
    
    // Write an initial empty script to indicate we're running
    try {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, '// Recording in progress, close browser when done\n', { encoding: 'utf8' });
    } catch (e) {
      console.error('[VISIBLE] Failed to write initial file:', e);
    }

  // Wait for browser to be closed (listen for 'disconnected' event)
  await new Promise((resolve) => browser.on('disconnected', resolve));
    
    // Generate the recording script
    const scriptLines = [];
    scriptLines.push("const { chromium } = require('playwright');");
    scriptLines.push('');
    scriptLines.push('(async () => {');
    scriptLines.push("  const browser = await chromium.launch({ headless: false });");
    scriptLines.push('  const context = await browser.newContext();');
    scriptLines.push('  const page = await context.newPage();');
    
    // Add all recorded actions
    scriptLines.push(...actions.map(a => '  ' + a));
    
    scriptLines.push('  await browser.close();');
    scriptLines.push('})();');

    // Write the recorded script
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, scriptLines.join('\n'), { encoding: 'utf8' });
    console.log('Wrote interactive recording to', outPath);

  } catch (err) {
    console.error('Visible recorder encountered an error:', err && err.message || err);
    try { fs.writeFileSync(outPath, '// ERROR: visible-recorder failed\n', { encoding: 'utf8' }); } catch(_){}
    process.exit(3);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Failed to run visible recorder:', err);
  process.exit(1);
});