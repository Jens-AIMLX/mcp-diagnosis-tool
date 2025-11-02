const fetch = require('node-fetch').default || require('node-fetch');
(async()=>{
  try {
    const body = {
      baseConfig: null,
      additionText: JSON.stringify({ servers: [{ mode: 'http', url: 'http://example' }] }),
      additionFormat: 'json'
    };
    const res = await fetch('http://localhost:3060/api/config/add-server', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    console.log('STATUS', res.status);
    const j = await res.json();
    console.log(JSON.stringify(j, null, 2));
  } catch (e) {
    console.error('ERR', e);
  }
})();
