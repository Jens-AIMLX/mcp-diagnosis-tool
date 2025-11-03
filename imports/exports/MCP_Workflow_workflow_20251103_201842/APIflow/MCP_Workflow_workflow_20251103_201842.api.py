# API replay script for MCP Diagnosis Tool v 1.2.1.17
# Usage: python MCP_Workflow_workflow_20251103_201842.api.py http://localhost:3060
import os, sys, json, requests
base = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3060'
servers = []
steps = []
sessions = {}
__MCP_export_results__ = []
for s in servers:
    r = requests.post(base + '/api/sessions/open', json={'spec': s['spec']})
    j = None
    try:
        j = r.json()
    except Exception:
        pass
    if not (j and 'sessionId' in j):
        print('Failed to open session for', s['name'], j)
        raise SystemExit(2)
    sessions[s['name']] = j['sessionId']
for step in steps:
    sid = sessions.get(step['server'])
    if not sid:
        print('No session for', step['server'])
        continue
    r = requests.post(base + '/api/tools/call', json={'sessionId': sid, 'tool': step['tool'], 'args': step.get('args') or {}})
    try:
        out = r.json()
    except Exception:
        out = None
    __MCP_export_results__.append({'server': step['server'], 'tool': step['tool'], 'ok': bool(out and out.get('ok') != False), 'args': step.get('args') or {}, 'result': out})
for name, sid in list(sessions.items()):
    try:
        requests.post(base + '/api/sessions/close', json={'sessionId': sid})
    except Exception:
        pass
try:
    with open('MCP_Workflow_workflow_20251103_201842.exported.json', 'w', encoding='utf-8') as f:
        f.write(json.dumps({'exported_at': __import__('datetime').datetime.utcnow().isoformat() + 'Z', 'servers': servers, 'steps': __MCP_export_results__}, ensure_ascii=False, indent=2))
    if len(__MCP_export_results__):
        print(json.dumps(__MCP_export_results__[-1]['result'], ensure_ascii=False, indent=2))
except Exception:
    pass
