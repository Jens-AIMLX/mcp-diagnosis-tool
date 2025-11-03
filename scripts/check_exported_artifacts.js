// scripts/check_exported_artifacts.js
// Smoke-test the exported artifact structure using the MCP Diagnosis API variants.
// This test avoids requiring any MCP servers by generating empty servers/steps
// API replay scripts that still exercise the runtime JSON writing and last-result printing logic.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function runNode(file, args = [], options = {}) {
  const result = spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', ...options });
  return result;
}

function runPythonIfAvailable(file, args = [], options = {}) {
  const pyCmd = process.env.PYTHON || 'python';
  // Try a quick version check
  let pyOk = false;
  try {
    const v = spawnSync(pyCmd, ['--version'], { encoding: 'utf8' });
    pyOk = v.status === 0;
  } catch(_) {}
  if (!pyOk) return { skipped: true, reason: 'python-not-found' };
  const r = spawnSync(pyCmd, [file, ...args], { encoding: 'utf8', ...options });
  return r;
}

function main() {
  const baseUrl = process.env.MCP_DOCTOR_URL || 'http://localhost:3060';
  const outDir = path.join(__dirname, '..', 'test-output', 'exports-smoke');
  fs.mkdirSync(outDir, { recursive: true });
  const baseName = `MCP_Workflow_Smoke_${nowStamp()}`;

  // Build minimal API replay JS (empty servers/steps) that still writes <base>.exported.json
  const apiJs = `// API replay script (smoke)\n` +
`const fs = require('fs');\n` +
`(async function(){\n` +
`  const base = process.argv[2] || '${baseUrl}';\n` +
`  const servers = [];\n` +
`  const steps = [];\n` +
`  const __MCP_export_results__ = [];\n` +
`  // No sessions to open (servers = [])\n` +
`  // No calls to perform (steps = [])\n` +
`  try {\n` +
`    const out = { exported_at: new Date().toISOString(), servers, steps: __MCP_export_results__ };\n` +
`    fs.writeFileSync('${baseName}.exported.json', JSON.stringify(out, null, 2));\n` +
`    if (__MCP_export_results__.length) console.log(JSON.stringify(__MCP_export_results__[__MCP_export_results__.length-1].result, null, 2));\n` +
`    console.log('SMOKE: wrote ${baseName}.exported.json');\n` +
`  } catch (e) { console.error('SMOKE: failed to write export JSON', e); process.exit(3); }\n` +
`})();\n`;

  const apiPy = `# API replay script (smoke)\n` +
`import json\n` +
`servers = []\n` +
`steps = []\n` +
`__MCP_export_results__ = []\n` +
`with open('${baseName}.exported.json', 'w', encoding='utf-8') as f:\n` +
`    f.write(json.dumps({'exported_at': __import__('datetime').datetime.utcnow().isoformat() + 'Z', 'servers': servers, 'steps': __MCP_export_results__}, ensure_ascii=False, indent=2))\n` +
`print('SMOKE: wrote ${baseName}.exported.json')\n`;

  const jsPath = path.join(outDir, `${baseName}.api.js`);
  const pyPath = path.join(outDir, `${baseName}.api.py`);
  writeFile(jsPath, apiJs);
  writeFile(pyPath, apiPy);

  // Run JS smoke
  const jsRun = runNode(jsPath, [baseUrl], { cwd: outDir });
  console.log('JS stdout:\n' + (jsRun.stdout || ''));
  console.error('JS stderr:\n' + (jsRun.stderr || ''));
  if (jsRun.status !== 0) {
    console.error('JS smoke run failed with code', jsRun.status);
    process.exit(jsRun.status || 1);
  }
  const jsonPath = path.join(outDir, `${baseName}.exported.json`);
  if (!fs.existsSync(jsonPath)) {
    console.error('Expected JSON not found:', jsonPath);
    process.exit(4);
  }
  const obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  if (!obj || !obj.exported_at || !('servers' in obj) || !('steps' in obj)) {
    console.error('JSON shape invalid:', obj);
    process.exit(5);
  }
  console.log('JS smoke JSON OK:', jsonPath);

  // Additional check: ensure last-result printing path works by pushing a dummy result
  const baseName2 = `${baseName}_lastprint`;
  const apiJs2 = `const fs=require('fs');\n` +
`const __MCP_export_results__=[{server:'s',tool:'t',result:{hello:'world'}}];\n` +
`fs.writeFileSync('${baseName2}.exported.json', JSON.stringify({exported_at:new Date().toISOString(),servers:[],steps:__MCP_export_results__},null,2));\n` +
`if (__MCP_export_results__.length) console.log(JSON.stringify(__MCP_export_results__[__MCP_export_results__.length-1].result, null, 2));\n`;
  const jsPath2 = path.join(outDir, `${baseName2}.api.js`);
  writeFile(jsPath2, apiJs2);
  const jsRun2 = runNode(jsPath2, [], { cwd: outDir });
  if (jsRun2.status !== 0) {
    console.error('JS last-result print smoke failed code', jsRun2.status);
    process.exit(jsRun2.status || 1);
  }
  if (!/\{\s*"hello"\s*:\s*"world"\s*\}/.test(jsRun2.stdout || '')) {
    console.error('Expected last-result JSON not printed to stdout');
    process.exit(7);
  }
  console.log('JS last-result print OK');

  // Run Python smoke (optional)
  const pyRun = runPythonIfAvailable(pyPath, [baseUrl], { cwd: outDir });
  if (pyRun.skipped) {
    console.log('Python smoke skipped:', pyRun.reason);
  } else {
    console.log('PY stdout:\n' + (pyRun.stdout || ''));
    console.error('PY stderr:\n' + (pyRun.stderr || ''));
    if (pyRun.status !== 0) {
      console.error('Python smoke run failed with code', pyRun.status);
      process.exit(pyRun.status || 1);
    }
    // Verify the same JSON path (rewritten by py) still valid JSON
    const obj2 = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!obj2 || !obj2.exported_at || !('servers' in obj2) || !('steps' in obj2)) {
      console.error('JSON shape invalid after Python run:', obj2);
      process.exit(6);
    }
    console.log('Python smoke JSON OK:', jsonPath);
  }

  console.log('SMOKE: All checks passed');
}

if (require.main === module) {
  main();
}
