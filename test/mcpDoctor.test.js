const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { loadMcpConfig, diagnoseConfigFile, parseMcpConfigContent, diagnoseConfigEntries } = require('../mcpDoctor');

async function writeTempConfig(data) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-config-'));
  const filePath = path.join(tmpDir, 'mcp.json');
  await fs.writeFile(filePath, JSON.stringify(data), 'utf8');
  return { tmpDir, filePath };
}

test('loadMcpConfig parses stdio and http entries', async (t) => {
  const sampleConfig = {
    mcpServers: {
      playwright: {
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest'],
        env: { FOO: 'bar', COUNT: 2 }
      },
      'cognitive-visual-req': {
        command: '/usr/bin/node',
        args: ['server.js']
      },
      httpServer: {
        url: 'https://example.com/mcp'
      }
    }
  };
  const { tmpDir, filePath } = await writeTempConfig(sampleConfig);
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const { path: resolvedPath, servers } = await loadMcpConfig(filePath);

  assert.strictEqual(resolvedPath, path.resolve(filePath));
  assert.strictEqual(servers.length, 3);

  const playwright = servers.find((s) => s.name === 'playwright');
  assert.deepEqual(playwright, {
    name: 'playwright',
    mode: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
    env: { FOO: 'bar', COUNT: '2' }
  });

  const httpServer = servers.find((s) => s.name === 'httpServer');
  assert.deepEqual(httpServer, {
    name: 'httpServer',
    mode: 'http',
    url: 'https://example.com/mcp'
  });
});

test('parseMcpConfigContent accepts JSON string input', () => {
  const json = JSON.stringify({
    mcpServers: {
      hello_world: {
        command: 'node',
        args: ['server.js'],
        env: { ENABLE_SOMETHING: true }
      }
    }
  });
  const { servers } = parseMcpConfigContent(json);
  assert.strictEqual(servers.length, 1);
  assert.deepEqual(servers[0], {
    name: 'hello_world',
    mode: 'stdio',
    command: 'node',
    args: ['server.js'],
    env: { ENABLE_SOMETHING: 'true' }
  });
});

test('diagnoseConfigFile invokes diagnose for each entry', async (t) => {
  const sampleConfig = {
    mcpServers: {
      stdioTool: {
        command: 'npx',
        args: ['tool.js'],
        env: { ABC: '123' }
      },
      httpTool: {
        url: 'http://localhost:3000/mcp'
      }
    }
  };
  const { tmpDir, filePath } = await writeTempConfig(sampleConfig);
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const calls = [];
  const fakeDiagnose = async (spec) => {
    calls.push(spec);
    return { ok: true, transport: spec.mode };
  };

  const results = await diagnoseConfigFile(filePath, { diagnoseFn: fakeDiagnose });

  assert.strictEqual(calls.length, 2);
  assert.deepEqual(calls[0], {
    mode: 'stdio',
    command: 'npx',
    args: ['tool.js'],
    env: { ABC: '123' }
  });
  assert.deepEqual(calls[1], {
    mode: 'http',
    url: 'http://localhost:3000/mcp'
  });

  assert.strictEqual(results.length, 2);
  assert.deepEqual(results[0], {
    name: 'stdioTool',
    mode: 'stdio',
    spec: {
      mode: 'stdio',
      command: 'npx',
      args: ['tool.js'],
      env: { ABC: '123' }
    },
    result: { ok: true, transport: 'stdio' }
  });
  assert.deepEqual(results[1], {
    name: 'httpTool',
    mode: 'http',
    spec: {
      mode: 'http',
      url: 'http://localhost:3000/mcp'
    },
    result: { ok: true, transport: 'http' }
  });
});

test('diagnoseConfigEntries generates specs from parsed servers', async () => {
  const servers = [
    { name: 'stdio', mode: 'stdio', command: 'node', args: ['server.js'], env: { KEY: 'VALUE' } },
    { name: 'http', mode: 'http', url: 'http://localhost:1234/mcp' }
  ];
  const specs = [];
  const fakeDiagnose = async (spec) => {
    specs.push(spec);
    return { ok: true, transport: spec.mode };
  };
  const results = await diagnoseConfigEntries(servers, { diagnoseFn: fakeDiagnose });
  assert.strictEqual(results.length, 2);
  assert.deepEqual(specs[0], {
    mode: 'stdio',
    command: 'node',
    args: ['server.js'],
    env: { KEY: 'VALUE' }
  });
  assert.deepEqual(specs[1], {
    mode: 'http',
    url: 'http://localhost:1234/mcp'
  });
});
