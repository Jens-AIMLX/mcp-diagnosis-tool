const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("http://localhost:3060");
  await page.waitForTimeout(300);
  await page.click("#back-to-test-portal");
  await page.waitForTimeout(300);
  await browser.close();
})();