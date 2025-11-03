const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function usage() {
  console.log('Usage: node check_exported_artifacts.js <export-folder>');
  process.exit(2);
}

if (process.argv.length < 3) usage();
const folder = process.argv[2];
if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  console.error('Folder not found:', folder);
  process.exit(2);
}

const files = fs.readdirSync(folder);
const baseCandidates = files.filter(f => f.endsWith('.yaml') && f.indexOf('.api.') === -1);
if (baseCandidates.length === 0) {
  console.error('No base .yaml workflow file found in', folder);
  process.exit(3);
}
const baseYaml = baseCandidates[0];
const baseName = baseYaml.replace(/\.ya?ml$/i, '');

const required = [
  `${baseName}.yaml`,
  `${baseName}.js`,
  `${baseName}.py`,
  `${baseName}.api.js`,
  `${baseName}.api.py`,
  `${baseName}.api.yaml`,
  `${baseName}.json`
];

let missing = required.filter(r => !files.includes(r));
if (missing.length) {
  console.warn('Missing expected files:', missing);
} else {
  console.log('All expected files present.');
}

// Try to run the main JS if present
if (files.includes(`${baseName}.js`)) {
  console.log('Attempting to run', `${baseName}.js`);
  const res = spawnSync('node', [path.join(folder, `${baseName}.js`)], { cwd: folder, timeout: 20000, encoding: 'utf8' });
  if (res.error) {
    console.warn('Failed to run node:', res.error.message);
  } else {
    console.log('Exit code:', res.status);
    console.log('STDOUT:', res.stdout ? res.stdout.slice(0, 2000) : '');
    console.log('STDERR:', res.stderr ? res.stderr.slice(0, 2000) : '');
  }
}

// Check for exported json files created by runner
const exportedJson = files.find(f => f.endsWith('.exported.json') || f.endsWith('.json'));
if (exportedJson) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(folder, exportedJson), 'utf8'));
    console.log('Found JSON artifact:', exportedJson, '-> keys:', Object.keys(j));
  } catch (e) {
    console.warn('Failed to parse JSON artifact:', exportedJson, e.message);
  }
} else {
  console.warn('No JSON artifact found in folder.');
}

console.log('Check complete.');
