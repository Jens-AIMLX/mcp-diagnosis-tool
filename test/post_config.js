const fs = require('fs');
const path = require('path');

async function main() {
  const file = path.resolve(__dirname, 'mcp-config-subconfigs_cognitive.json');
  const text = fs.readFileSync(file, { encoding: 'utf8' });
  const url = process.env.BASE_URL || 'http://127.0.0.1:3060';
  console.log('Posting to', url + '/api/config/diagnose');
  try {
    const res = await fetch(url + '/api/config/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configText: text, configFormat: 'json' })
    });
    const data = await res.text();
    console.log('HTTP', res.status, res.statusText);
    console.log('BODY:', data.slice(0, 4000));
  } catch (err) {
    console.error('Request failed:', err.message);
    process.exit(2);
  }
}

main();
