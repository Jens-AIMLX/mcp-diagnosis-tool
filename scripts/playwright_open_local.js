// Lightweight script to open the app UI in a visible Playwright browser
// Usage: node scripts/playwright_open_local.js [url] [msWait]
const { chromium } = require('playwright');

async function main() {
  const url = process.argv[2] || 'http://localhost:3060';
  const waitMs = Number(process.argv[3] || 15000);

  console.log('Launching visible Chromium and navigating to', url);
  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Page loaded — waiting', waitMs, 'ms so you can interact with the visible browser');
    await page.waitForTimeout(waitMs);
  } catch (err) {
    console.error('Navigation or wait failed:', err);
    await browser.close();
    process.exit(1);
  }

  console.log('Closing browser');
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
