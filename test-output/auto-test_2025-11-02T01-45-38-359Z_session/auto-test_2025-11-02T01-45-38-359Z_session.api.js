// API replay script for MCP Diagnosis Tool v test-version-1
// This script calls the local MCP Diagnosis HTTP API to open a session and run tools.
// Usage: node auto-test_2025-11-02T01-45-38-359Z_session.api.js --server http://localhost:3060
const fetch = require('node-fetch');
(async function(){
  const base = process.argv[2] || 'http://localhost:3060';
  const spec = {
  "mode": "http",
  "url": "http://localhost:3060"
};
  console.log('Opening session for spec', spec);
  const open = await fetch(base + '/api/sessions/open', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ spec }) });
  const o = await open.json();
  if (!o || !o.sessionId) { console.error('Failed to open session', o); process.exit(2); }
  const sessionId = o.sessionId;
  console.log('Session opened', sessionId);
  // No steps defined in template. Replace with calls to POST /api/tools/call if needed.
  // Example: await fetch(base + '/api/tools/call', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ sessionId, tool: 'toolName', args: {} }) });
  // Close the session when done
  await fetch(base + '/api/sessions/close', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sessionId }) });
  console.log('Session closed');
})();
