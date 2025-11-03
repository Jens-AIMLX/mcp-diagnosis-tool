const { test, expect } = require('@playwright/test');

test('codegen flow', async ({ page }) => {
  try {
    // Enable debug logging
    page.on('console', msg => console.log(msg.text()));

    // Navigate to the MCP Diagnosis Tool
    await page.goto('http://localhost:3060');
    console.log('Navigated to MCP Diagnosis Tool');
    
    // Add a test server first
    await page.click('#add-json-server-btn');
    console.log('Clicked add JSON server button');
    
    // Wait for config modal
    await page.waitForSelector('#config-modal', { state: 'visible' });
    console.log('Config modal visible');
    
    // Click and fill the textarea
    const serverConfig = {
      name: 'Test Server',
      mode: 'http',
      url: 'http://localhost:3000/mcp'
    };
    await page.click('#config-modal-input');
    await page.fill('#config-modal-input', JSON.stringify(serverConfig, null, 2));
    console.log('Filled server config');
    
    // Click merge
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/server/add')),
      page.click('#config-modal-merge')
    ]);
    console.log('Clicked merge, waiting for response');
    
    // Wait for server card to appear and be visible
    await page.waitForSelector('.server-card', { state: 'visible', timeout: 60000 });
    console.log('Server card visible');
    
    const firstCard = await page.locator('.server-card').first();
    
    // Click the toggle button
    const toggleButton = await firstCard.locator('.toggle-details');
    await toggleButton.click();
    console.log('Clicked toggle button');
    
    // Wait for details to be visible
    await page.waitForSelector('.server-details:not(.hidden)');
    console.log('Server details visible');

    // Start recording
    const startResponse = await page.evaluate(async () => {
      const response = await fetch('/api/playwright/codegen/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return response.json();
    });
    
    expect(startResponse.success).toBeTruthy();
    console.log('Recording started');

    // Do some test actions (click buttons, etc)
    await page.waitForTimeout(2000); // Record for 2 seconds
    console.log('Recorded actions for 2 seconds');
    
    // Stop recording
    const stopResponse = await page.evaluate(async () => {
      const response = await fetch('/api/playwright/codegen/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return response.json();
    });

    console.log('Recording stopped, validating response');
    expect(stopResponse.success).toBeTruthy();
    expect(stopResponse.content).toBeTruthy();
    expect(stopResponse.content.length).toBeGreaterThan(0);
    console.log('All validations passed');

  } catch (err) {
    console.error('Test failed:', err);
    throw err;
  }
});