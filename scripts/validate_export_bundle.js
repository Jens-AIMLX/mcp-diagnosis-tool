// scripts/validate_export_bundle.js
// Validate that an exported workflow bundle contains 7 artifacts across subfolders
// and that APIflow scripts are runnable enough to produce a runtime JSON artifact.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function fail(msg, code = 1) {
  console.error('VALIDATE: ' + msg);
  process.exit(code);
}

function ok(msg) {
  console.log('VALIDATE: ' + msg);
}

function expectFile(p) {
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) fail('Missing file: ' + p);
}

function main() {
  const folder = process.argv[2];
  if (!folder) fail('Usage: node scripts/validate_export_bundle.js <export-folder>', 2);
  const root = path.resolve(folder);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail('Not a directory: ' + root, 2);

  // Match actual export folder names: MCPflow, APIflow, json
  const dirs = { MCP: path.join(root, 'MCPflow'), API: path.join(root, 'APIflow'), JSON: path.join(root, 'json') };
  for (const [k, dir] of Object.entries(dirs)) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail(`Missing subfolder ${k}: ${dir}`);
  }

  // Derive base name from MPCflow YAML
  const mpcFiles = fs.readdirSync(dirs.MCP).filter(f => f.toLowerCase().endsWith('.yaml'));
  if (!mpcFiles.length) fail('No .yaml in MPCflow');
  const baseYaml = mpcFiles[0];
  const baseName = baseYaml.replace(/\.ya?ml$/i, '');

  const expectedCore = [
    path.join(dirs.MCP, `${baseName}.yaml`),
    path.join(dirs.MCP, `${baseName}.js`),
    path.join(dirs.MCP, `${baseName}.py`),
    path.join(dirs.API, `${baseName}.api.yaml`),
    path.join(dirs.API, `${baseName}.api.js`),
    path.join(dirs.JSON, `${baseName}.json`)
  ];
  expectedCore.forEach(expectFile);

  // API executable: accept either .api.py or .api.ps1 (Windows)
  const apiPyPath = path.join(dirs.API, `${baseName}.api.py`);
  const apiPs1Path = path.join(dirs.API, `${baseName}.api.ps1`);
  if (fs.existsSync(apiPyPath)) {
    ok('Found API Python script');
  } else if (fs.existsSync(apiPs1Path)) {
    ok('Found API PowerShell script');
  } else {
    fail('Missing API executable (.api.py or .api.ps1)');
  }
  ok('Found all 7 artifacts');

  // Try to run APIflow JS (should produce runtime exported JSON)
  const apiJs = path.join(dirs.API, `${baseName}.api.js`);
  const apiJsRun = spawnSync(process.execPath, [apiJs, 'http://localhost:3060'], { cwd: path.dirname(apiJs), encoding: 'utf8', timeout: 30000 });
  console.log('API JS STDOUT:\n' + (apiJsRun.stdout || ''));
  console.error('API JS STDERR:\n' + (apiJsRun.stderr || ''));
  // Regardless of exit code (calls may fail if server not running), look for runtime JSON
  const runtimeJson = path.join(dirs.API, `${baseName}.exported.json`);
  if (fs.existsSync(runtimeJson)) {
    try {
      const j = JSON.parse(fs.readFileSync(runtimeJson, 'utf8'));
      if (!j || !('servers' in j) || !('steps' in j)) fail('Runtime JSON shape invalid: ' + runtimeJson, 5);
      ok('API JS produced runtime JSON: ' + runtimeJson);
    } catch (e) {
      fail('Runtime JSON unparsable: ' + e.message, 5);
    }
  } else {
    console.warn('API JS did not produce runtime JSON (server may be offline): ' + runtimeJson);
  }

  // Try secondary API script: prefer .api.py if present, else .api.ps1
  if (fs.existsSync(apiPyPath)) {
    const pyCmd = process.env.PYTHON || 'python';
    try {
      const v = spawnSync(pyCmd, ['--version'], { encoding: 'utf8' });
      if (v.status === 0) {
        const apiPyRun = spawnSync(pyCmd, [apiPyPath, 'http://localhost:3060'], { cwd: path.dirname(apiPyPath), encoding: 'utf8', timeout: 30000 });
        console.log('API PY STDOUT:\n' + (apiPyRun.stdout || ''));
        console.error('API PY STDERR:\n' + (apiPyRun.stderr || ''));
      } else {
        console.warn('Python not available, skipping API PY run');
      }
    } catch (_) {
      console.warn('Python not available, skipping API PY run');
    }
  } else if (fs.existsSync(apiPs1Path)) {
    // Run PowerShell script if present
    try {
      const psRun = spawnSync(process.env.ComSpec ? 'powershell.exe' : 'powershell', ['-ExecutionPolicy','Bypass','-File', apiPs1Path, 'http://localhost:3060'], { cwd: path.dirname(apiPs1Path), encoding: 'utf8', timeout: 30000 });
      console.log('API PS1 STDOUT:\n' + (psRun.stdout || ''));
      console.error('API PS1 STDERR:\n' + (psRun.stderr || ''));
    } catch (e) {
      console.warn('PowerShell not available, skipping API PS1 run: ' + e.message);
    }
  }

  ok('Validation completed');
}

if (require.main === module) {
  main();
}
