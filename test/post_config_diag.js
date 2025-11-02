(async () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, 'mcp-config-subconfigs_cognitive.json');
    const content = fs.readFileSync(file, 'utf8');
    const url = 'http://localhost:3060/api/config/diagnose';
    const body = { configText: content, configFormat: 'json' };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await res.text();
    console.log('HTTP', res.status, res.statusText);
    console.log('Response body:\n', text);
  } catch (err) {
    console.error('Request failed:', err);
    process.exit(2);
  }
})();
