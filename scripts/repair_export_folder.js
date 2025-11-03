#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function safeRequire(file) {
  try {
    delete require.cache[require.resolve(file)];
    return require(file);
  } catch (err) {
    return null;
  }
}

function readYamlIfPresent(yamlPath) {
  try {
    const txt = fs.readFileSync(yamlPath, 'utf8');
    return txt;
  } catch (e) { return null; }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildApiArtifacts(exportServers, prettySteps, baseName) {
  const apiYamlObj = { exported_with: exportServers.exported_with || '', servers: exportServers.map(s => ({ name: s.name, spec: s.spec })), steps: prettySteps };
  const apiYaml = '# API replay manifest\n' + JSON.stringify(apiYamlObj, null, 2) + '\n';

  const apiJs = `// API replay script (generated)\nconst fetch = require('node-fetch');\n(async function(){\n  const base = process.argv[2] || 'http://localhost:3060';\n  const servers = ${JSON.stringify(apiYamlObj.servers, null, 2)};\n  const steps = ${JSON.stringify(prettySteps, null, 2)};\n  const sessions = {};\n  for (const s of servers) {\n    const resp = await fetch(base + '/api/sessions/open', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ spec: s.spec }) });\n    const j = await resp.json(); if (!j.sessionId) { console.error('Failed to open session for', s.name, j); process.exit(2); }\n    sessions[s.name] = j.sessionId; console.log('Opened', s.name, j.sessionId);\n  }\n  for (const step of steps) {\n    const sid = sessions[step.server]; if (!sid) { console.error('No session for', step.server); continue; }\n    const call = await fetch(base + '/api/tools/call', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sessionId: sid, tool: step.tool, args: step.args || {} }) });\n    const out = await call.json().catch(() => null); console.log('Result', out);\n  }\n  for (const [name, sid] of Object.entries(sessions)) {\n    await fetch(base + '/api/sessions/close', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sessionId: sid }) });\n    console.log('Closed', name);\n  }\n})();\n`;

  const apiPs = `# Powershell shim generated\n# Base URL first arg\n$BaseUrl = $args[0]; if (-not $BaseUrl) { $BaseUrl = 'http://localhost:3060' }\n$servers = ${JSON.stringify(apiYamlObj.servers, null, 2)}\n$sessions = @{}\nforeach ($s in $servers) {\n  $resp = Invoke-RestMethod -Method Post -Uri ($BaseUrl + '/api/sessions/open') -ContentType 'application/json' -Body (ConvertTo-Json @{ spec = $s.spec } -Depth 10)\n  $sessions[$s.name] = $resp.sessionId\n}\nforeach ($step in ${JSON.stringify(prettySteps, null, 2)}) {\n  $sid = $sessions[$step.server]; if (-not $sid) { Continue }\n  $call = Invoke-RestMethod -Method Post -Uri ($BaseUrl + '/api/tools/call') -ContentType 'application/json' -Body (ConvertTo-Json @{ sessionId = $sid; tool = $step.tool; args = $step.args } -Depth 10)\n  Write-Host "Result: $($call | ConvertTo-Json -Depth 5)"\n}\n`;

  return { apiYaml, apiJs, apiPs };
}

async function repair(folder) {
  folder = path.resolve(folder);
  if (!fs.existsSync(folder)) {
    console.error('Folder not found:', folder);
    process.exit(2);
  }

  const mcpflowDir = path.join(folder, 'MCPflow');
  const jsonDir = path.join(folder, 'json');
  const apidir = path.join(folder, 'APIflow');
  ensureDir(jsonDir); ensureDir(apidir);

  // Find MCPflow .js file
  let mcpJs = null;
  if (fs.existsSync(mcpflowDir)) {
    const files = fs.readdirSync(mcpflowDir).filter(f => f.endsWith('.js'));
    if (files.length) mcpJs = path.join(mcpflowDir, files[0]);
  }

  let exportedServers = [];
  let steps = [];
  let baseName = path.basename(folder);

  if (mcpJs) {
    const mod = safeRequire(mcpJs);
    if (mod && (mod.spec || mod.steps)) {
      const spec = mod.spec || {};
      steps = Array.isArray(mod.steps) ? mod.steps : [];
      exportedServers = [{ name: (spec.name || path.basename(mcpJs).replace(/\.js$/, '')), spec }];
      baseName = path.basename(mcpJs).replace(/\.js$/, '');
    }
  } else {
    // try MCPflow YAML
    const yamlFiles = fs.existsSync(mcpflowDir) ? fs.readdirSync(mcpflowDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml')) : [];
    if (yamlFiles.length) {
      const y = readYamlIfPresent(path.join(mcpflowDir, yamlFiles[0]));
      // best-effort: search for 'server:' and a following 'spec:' block inside YAML
      const m = /server:\s*\n([\s\S]*)/m.exec(y || '');
      // fallback: leave spec empty but keep steps if present
      exportedServers = [{ name: baseName, spec: {} }];
    }
  }

  // If no steps but there's a playwright recording file, add a playback step
  const pwJs = fs.existsSync(folder) ? (function(){
    const candidate = path.join(folder, 'MCPflow', baseName + '.playwright.js');
    return fs.existsSync(candidate) ? candidate : null;
  })() : null;
  if ((!steps || steps.length === 0) && pwJs) {
    steps = [{ server: exportedServers[0].name, tool: '__playwright_recording__', args: {} }];
  }

  // Build prettySteps for API artifacts
  const prettySteps = (steps || []).map((s) => {
    return { server: s.server || exportedServers[0].name, tool: s.tool || s.name || '__unknown__', args: s.args || {} };
  });

  // Build JSON object
  const jsonObj = { configs: exportedServers.map(es => ({ name: es.name, spec: es.spec })), steps: (steps || []).map(s => ({ server: s.server || exportedServers[0].name, tool: s.tool || s.name || '__unknown__', arguments: s.args || {} })) };

  // Write JSON
  const jsonName = baseName + '.json';
  fs.writeFileSync(path.join(jsonDir, jsonName), JSON.stringify(jsonObj, null, 2), 'utf8');
  console.log('Wrote', path.join(jsonDir, jsonName));

  // Write API artifacts
  const { apiYaml, apiJs, apiPs } = buildApiArtifacts(exportedServers, prettySteps, baseName);
  fs.writeFileSync(path.join(apidir, baseName + '.api.yaml'), apiYaml, 'utf8');
  fs.writeFileSync(path.join(apidir, baseName + '.api.js'), apiJs, 'utf8');
  fs.writeFileSync(path.join(apidir, baseName + '.api.ps1'), apiPs, 'utf8');
  console.log('Wrote APIflow artifacts into', apidir);
}

if (require.main === module) {
  const target = process.argv[2] || process.cwd();
  repair(target).catch(err => { console.error(err); process.exit(3); });
}
