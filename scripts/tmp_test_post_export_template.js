const http = require('http');

const body = JSON.stringify({ spec:{ mode:'http', url:'http://example'}, appVersion:'test-version-1' });
const opts = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  },
  hostname: 'localhost',
  port: 3060,
  path: '/api/export/template'
};

const req = http.request(opts, (res) => {
  let d = '';
  res.setEncoding('utf8');
  res.on('data', (c) => d += c);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    try { console.log(JSON.stringify(JSON.parse(d), null, 2)); } catch (e) { console.log(d); }
  });
});
req.on('error', (e) => { console.error('ERROR', e); process.exit(1); });
req.write(body);
req.end();
