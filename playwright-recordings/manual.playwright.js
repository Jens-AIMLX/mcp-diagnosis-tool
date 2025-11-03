import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:3060/');
  await page.getByRole('button', { name: 'Load standard mcp.json' }).click();
  await page.getByRole('button', { name: 'Load standard mcp.json' }).setInputFiles('mcp-config-subconfigs_cognitive.json');
});