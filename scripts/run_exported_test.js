const Module = require('module');
const path = require('path');
const fs = require('fs');

if (require.main !== module) {
  // only useful as CLI
}

const exportScript = process.argv[2];
if (!exportScript) {
  console.error('Usage: node scripts/run_exported_test.js <path-to-exported-js>');
  process.exit(2);
}

const resolvedExport = path.resolve(exportScript);
if (!fs.existsSync(resolvedExport)) {
  console.error('File not found:', resolvedExport);
  process.exit(2);
}

// Project root is one level up from scripts/
const projectRoot = path.resolve(__dirname, '..');
const projectNodeModules = path.join(projectRoot, 'node_modules');

if (fs.existsSync(projectNodeModules)) {
  // Prepend project node_modules resolution paths so require() can find deps installed in the project
  const nodePaths = Module._nodeModulePaths(projectRoot);
  module.paths = [...nodePaths, ...module.paths];
} else {
  console.warn('Warning: project node_modules not found at', projectNodeModules);
}

try {
  // Load the exported test file and compile it as a Module whose resolution paths include the project's node_modules.
  const Module = require('module');
  const code = fs.readFileSync(resolvedExport, 'utf8');
  const m = new Module(resolvedExport, module.parent);
  // Set module paths so that require() calls inside the exported script will find packages installed in the project
  m.paths = Module._nodeModulePaths(projectRoot);
  m.filename = resolvedExport;
  m._compile(code, resolvedExport);
} catch (err) {
  console.error('Error running exported test:');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
