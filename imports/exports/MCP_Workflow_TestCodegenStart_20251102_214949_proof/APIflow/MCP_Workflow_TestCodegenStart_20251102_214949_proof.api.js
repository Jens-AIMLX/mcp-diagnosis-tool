// APIflow: proof export API JS
// This script demonstrates opening sessions and calling steps via the backend API.
const fetch = require('node-fetch');
(async function(){
  const base = process.argv[2] || 'http://localhost:3060';
  const servers = [ { name: 'local', spec: { mode: 'http', url: 'http://localhost:3060' } } ];
  const steps = [ { server: 'local', tool: 'browser_navigate', args: { url: 'http://localhost:3060' } }, { server: 'local', tool: 'browser_click', args: { selector: '#login' } } ];
  const sessions = {};
  for (const s of servers) {
    const resp = await fetch(base + '/api/sessions/open', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ spec: s.spec }) });
    const j = await resp.json(); if (!j.sessionId) { console.error('Failed to open session for', s.name, j); process.exit(2); }
    sessions[s.name] = j.sessionId; console.log('Opened', s.name, j.sessionId);
  }
  for (const step of steps) {
    const sid = sessions[step.server]; if (!sid) { console.error('No session for', step.server); continue; }
    const call = await fetch(base + '/api/tools/call', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sessionId: sid, tool: step.tool, args: step.args || {} }) });
    const out = await call.json().catch(() => null); console.log('Result', out);
  }
  for (const [name, sid] of Object.entries(sessions)) {
    await fetch(base + '/api/sessions/close', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sessionId: sid }) });
    console.log('Closed', name);
  }
})();
