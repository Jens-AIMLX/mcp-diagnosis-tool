// API replay script for MCP Diagnosis Tool v 1.2.1.17
// Usage: node MCP_Workflow_workflow_20251103_202009.api.js http://localhost:3060
const fetch = require('node-fetch');
const fs = require('fs');
(async function(){
  const base = process.argv[2] || 'http://localhost:3060';
  const servers = [];
  const steps = [];
  const sessions = {};
  const __MCP_export_results__ = [];
  for (const s of servers) {
    const resp = await fetch(base + '/api/sessions/open', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ spec: s.spec }) });
    const j = await resp.json().catch(() => null); if (!j || !j.sessionId) { console.error('Failed to open session for', s.name, j); process.exit(2); }
    sessions[s.name] = j.sessionId;
  }
  for (const step of steps) {
    const sid = sessions[step.server]; if (!sid) { console.error('No session for', step.server); continue; }
    const call = await fetch(base + '/api/tools/call', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sessionId: sid, tool: step.tool, args: step.args || {} }) });
    const out = await call.json().catch(() => null);
    __MCP_export_results__.push({ server: step.server, tool: step.tool, ok: !!(out && out.ok !== false), args: step.args || {}, result: out });
  }
  for (const [name, sid] of Object.entries(sessions)) {
    await fetch(base + '/api/sessions/close', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sessionId: sid }) });
  }
  try {
    const out = { exported_at: new Date().toISOString(), servers: servers, steps: __MCP_export_results__ };
    fs.writeFileSync('MCP_Workflow_workflow_20251103_202009.exported.json', JSON.stringify(out, null, 2));
    if (__MCP_export_results__.length) console.log(JSON.stringify(__MCP_export_results__[__MCP_export_results__.length-1].result, null, 2));
  } catch (e) { /* ignore */ }
})();
