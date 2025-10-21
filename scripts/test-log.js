const http = require('http');

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname: 'localhost',
      port: 3060,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, body: buf });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 3060, path }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

(async () => {
  try {
    const sessions = await get('/api/sessions');
    console.log('GET /api/sessions =>', sessions.status);

    const spec = {
      mode: 'stdio',
      command: 'npx',
      args: [
        '-y',
        '@playwright/mcp@latest',
        '--output-dir', 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots',
        '--save-session', '--save-trace',
        '--browser', 'chrome',
        '--viewport-size', '2400,1350',
        '--isolated', '--no-sandbox'
      ]
    };

    const payload = {
      spec,
      toolName: 'mcp_playwright_browser_navigate',
      toolArgs: { url: 'https://example.com' },
      keepSessionOpen: true
    };

    const call = await postJson('/api/tools/call', payload);
    console.log('POST /api/tools/call =>', call.status);
    console.log(call.body);
  } catch (err) {
    console.error('Test script error:', err && err.message);
    process.exit(1);
  }
})();


