/*
 * server.js
 *
 * This file starts a small Express server that exposes a single API endpoint
 * for diagnosing MCP servers and serves a static front‑end for interacting
 * with the diagnostic logic. The API delegates the heavy lifting to the
 * mcpDoctor module which uses the MCP client SDK to negotiate the
 * initialize/initialized handshake and list available tools/prompts/resources.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { log, logError, LOG_PATH, getRecent } = require('./logger');
const fs = require('fs');

// Debug signature to verify correct file is running and to force-create debug log file
try {
  console.log('[DEBUG_SIGNATURE] server.js loaded (enhanced logging)');
  fs.appendFileSync(LOG_PATH, '', { encoding: 'utf8' });
  try {
    const sig = `[SIGNATURE] server.js boot ${new Date().toISOString()}\n`;
    fs.appendFileSync(path.join(__dirname, 'server.log'), sig, { encoding: 'utf8' });
  } catch (_) {}
} catch (_) {}

const {
  diagnose,
  parseMcpConfigContent,
  diagnoseConfigEntries,
  mergeNormalizedConfig,
  removeServerFromConfig,
  serializeMcpConfigToJson,
  serializeMcpConfigToToml,
  serializeServerSnippet,
  callTool,
  listSessions,
  closeSession,
  closeAllSessions
} = require('./mcpDoctor');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON body parsing
app.use(express.json());
// Allow cross‑origin requests in case the UI is served from a different host
app.use(cors());

// Startup log
log('server_start', { port: Number(process.env.PORT || 3000), logPath: LOG_PATH });

// Request logger middleware (method, url, basic body keys)
app.use((req, _res, next) => {
  try {
    const keys = req.body && typeof req.body === 'object' ? Object.keys(req.body) : [];
    log('http_request', { method: req.method, url: req.originalUrl || req.url, bodyKeys: keys });
  } catch (_) {
    /* ignore */
  }
  next();
});

// API route for diagnosing servers
app.post('/api/diagnose', async (req, res) => {
  const { mode, url, command, args } = req.body || {};
  log('api_diagnose_request', { mode, url, command, args });
  if (!mode) {
    return res.status(400).json({ error: 'mode is required ("http" or "stdio")' });
  }
  try {
    const spec = { mode };
    if (mode === 'http') {
      spec.url = url;
    } else if (mode === 'stdio') {
      spec.command = command;
      spec.args = Array.isArray(args) ? args : typeof args === 'string' ? args.split(/\s+/) : [];
    }
    const result = await diagnose(spec);
    log('api_diagnose_response', { ok: result?.ok, transport: result?.transport });
    res.json(result);
  } catch (err) {
    logError('api_diagnose_error', err);
    res.status(500).json({ ok: false, error: { kind: 'internal_error', details: err.message } });
  }
});

// API route for diagnosing all servers within an uploaded MCP config
app.post('/api/config/diagnose', async (req, res) => {
  const { configText, config, configFormat } = req.body || {};
  if (!configText && !config) {
    return res.status(400).json({ error: 'configText (string) or config (object) is required' });
  }
  try {
    const normalized = parseMcpConfigContent(configText ?? config, configFormat);
    const results = await diagnoseConfigEntries(normalized);
    const servers = attachConfigMetadata(normalized, results);
    res.json({ ok: true, format: normalized.format, config: normalized, servers });
  } catch (err) {
    const status = err.code && err.code.startsWith('CONFIG_') ? 400 : 500;
    res.status(status).json({ ok: false, error: { kind: 'config_error', details: err.message } });
  }
});

// API route for converting/saving configs
app.post('/api/config/export', async (req, res) => {
  const { config, targetFormat } = req.body || {};
  if (!config || typeof config !== 'object' || !targetFormat) {
    return res.status(400).json({ ok: false, error: { kind: 'invalid_request', details: 'config and targetFormat are required' } });
  }
  try {
    let content;
    if (targetFormat === 'json') {
      content = serializeMcpConfigToJson(config);
    } else if (targetFormat === 'toml') {
      content = serializeMcpConfigToToml(config);
    } else {
      return res.status(400).json({ ok: false, error: { kind: 'unsupported_format', details: 'targetFormat must be "json" or "toml"' } });
    }
    res.json({ ok: true, format: targetFormat, content });
  } catch (err) {
    const status = err.code && err.code.startsWith('CONFIG_') ? 400 : 500;
    res.status(status).json({ ok: false, error: { kind: 'config_export_error', details: err.message } });
  }
});

// API route for merging a single server config into the current config
app.post('/api/config/add-server', async (req, res) => {
  const { baseConfig, additionText, additionFormat } = req.body || {};
  if (!additionText || typeof additionText !== 'string') {
    return res.status(400).json({ ok: false, error: { kind: 'invalid_request', details: 'additionText (string) is required' } });
  }
  try {
    const addition = parseMcpConfigContent(additionText, additionFormat);
    if (!addition.servers.length) {
      const error = new Error('Provided config did not contain any MCP servers.');
      error.code = 'CONFIG_SCHEMA_ERROR';
      throw error;
    }
    let baseNormalized = null;
    if (baseConfig && typeof baseConfig === 'object') {
      baseNormalized = JSON.parse(JSON.stringify(baseConfig));
      if (!Array.isArray(baseNormalized.servers)) {
        baseNormalized.servers = [];
      }
      if (!baseNormalized.topLevel || typeof baseNormalized.topLevel !== 'object') {
        baseNormalized.topLevel = {};
      }
      if (!baseNormalized.format) {
        baseNormalized.format = addition.format ?? 'json';
      }
    }
    const merged = mergeNormalizedConfig(baseNormalized, addition);
    const results = await diagnoseConfigEntries(merged);
    const servers = attachConfigMetadata(merged, results);
    res.json({ ok: true, config: merged, servers });
  } catch (err) {
    const status = err.code && err.code.startsWith('CONFIG_') ? 400 : 500;
    res.status(status).json({ ok: false, error: { kind: 'config_merge_error', details: err.message } });
  }
});

// Logger health/ping
app.get('/api/logger/ping', (req, res) => {
  try {
    log('logger_ping', { url: req.originalUrl || req.url });
  } catch (_) {}
  let exists = false;
  try { exists = fs.existsSync(LOG_PATH); } catch (_) {}
  res.json({ ok: true, logPath: LOG_PATH, exists });
});

// Expose recent in-memory debug entries for immediate inspection
app.get('/api/logger/recent', (req, res) => {
  const limit = Number(req.query.limit || 200);
  const items = getRecent(limit);
  res.json({ ok: true, items });
});

// API route for removing a server from the current config
app.post('/api/config/remove-server', async (req, res) => {
  const { baseConfig, serverName } = req.body || {};
  if (!baseConfig || typeof baseConfig !== 'object') {
    return res.status(400).json({ ok: false, error: { kind: 'invalid_request', details: 'baseConfig is required' } });
  }
  if (!serverName || typeof serverName !== 'string') {
    return res.status(400).json({ ok: false, error: { kind: 'invalid_request', details: 'serverName is required' } });
  }
  try {
    const normalizedBase = JSON.parse(JSON.stringify(baseConfig));
    const reduced = removeServerFromConfig(normalizedBase, serverName);
    const results = await diagnoseConfigEntries(reduced);
    const servers = attachConfigMetadata(reduced, results);
    res.json({ ok: true, config: reduced, servers });
  } catch (err) {
    const status =
      err.code && (err.code.startsWith('CONFIG_') || err.code === 'CONFIG_NOT_FOUND') ? 400 : 500;
    res.status(status).json({ ok: false, error: { kind: 'config_remove_error', details: err.message } });
  }
});

// API route for testing individual tools
app.post('/api/tools/call', async (req, res) => {
  const { spec, toolName, toolArgs, keepSessionOpen } = req.body || {};
  const debugMsg1 = `[DEBUG] /api/tools/call - toolName: ${toolName}, keepSessionOpen: ${keepSessionOpen}`;
  try { process.stdout.write(debugMsg1 + "\n"); } catch(_) {}
  try { process.stderr.write(debugMsg1 + "\n"); } catch(_) {}
  log('tools_call_request', {
    toolName,
    keepSessionOpen: !!keepSessionOpen,
    spec: spec ? { mode: spec.mode, command: spec.command, url: spec.url, args: spec.args } : null,
    args: toolArgs
  });
  if (!spec || typeof spec !== 'object' || !spec.mode) {
    return res.status(400).json({ error: 'spec with a valid mode is required' });
  }
  if (!toolName || typeof toolName !== 'string') {
    return res.status(400).json({ error: 'toolName is required' });
  }
  try {
    const result = await callTool(spec, toolName, toolArgs ?? {}, { keepSessionOpen: keepSessionOpen ?? false });
    const debugMsg2 = `[DEBUG] callTool result - ok: ${result.ok}, sessionId: ${result.sessionId}, sessionReused: ${result.sessionReused}`;
    try { process.stdout.write(debugMsg2 + "\n"); } catch(_) {}
    try { process.stderr.write(debugMsg2 + "\n"); } catch(_) {}
    log('tools_call_response', {
      ok: result?.ok,
      sessionId: result?.sessionId || null,
      sessionReused: !!result?.sessionReused,
      transport: result?.transport || null,
      error: result?.error?.kind || null,
      endedAt: new Date().toISOString()
    });
    res.json(result);
  } catch (err) {
    try { process.stderr.write(`[DEBUG] callTool error: ${err?.message}\n`); } catch(_) {}
    logError('tools_call_error', err, { toolName, endedAt: new Date().toISOString() });
    res.status(500).json({ ok: false, error: { kind: 'internal_error', details: err.message } });
  }
});

// API route for listing active sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = listSessions();
    log('sessions_list', { count: sessions.length, sessions });
    res.json({ ok: true, sessions });
  } catch (err) {
    logError('sessions_list_error', err);
    res.status(500).json({ ok: false, error: { kind: 'internal_error', details: err.message } });
  }
});

// API route for closing a specific session
app.post('/api/sessions/close', async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  try {
    log('session_close_request', { sessionId });
    const result = await closeSession(sessionId);
    log('session_close_response', { sessionId, ok: result.ok, error: result.error || null });
    res.json(result);
  } catch (err) {
    logError('session_close_error', err, { sessionId });
    res.status(500).json({ ok: false, error: { kind: 'internal_error', details: err.message } });
  }
});

// API route for closing all sessions
app.post('/api/sessions/close-all', async (req, res) => {
  try {
    log('session_close_all_request', {});
    const result = await closeAllSessions();
    log('session_close_all_response', result);
    res.json({ ok: true, ...result });
  } catch (err) {
    logError('session_close_all_error', err);
    res.status(500).json({ ok: false, error: { kind: 'internal_error', details: err.message } });
  }
});

// Serve static files from the public directory
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Fallback to index.html for any other route (supports client‑side routing if needed)
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`MCP diagnosis UI server is running on http://localhost:${PORT}`);
  log('server_listening', { port: Number(PORT) });
  // Kick off a self-test to exercise logging without external clients
  log('selftest_scheduled', { delayMs: 1500 });
  setTimeout(runSelfTestLogging, 1500);
  log('selftest_followup_scheduled', { delayMs: 4500 });
  setTimeout(runSelfTestFollowUp, 4500);
});

// Global unhandled error logging
process.on('uncaughtException', (err) => {
  try { logError('uncaught_exception', err); } catch (_) {}
});
process.on('unhandledRejection', (reason) => {
  try { logError('unhandled_rejection', reason instanceof Error ? reason : new Error(String(reason))); } catch (_) {}
});

// ---- Self-test: invoke a tool call to produce logs ----
async function runSelfTestLogging() {
  try {
    try { process.stdout.write('[DEBUG] selftest_begin\n'); } catch(_) {}
    const spec = {
      mode: 'stdio',
      command: 'npx',
      args: [
        '-y',
        '@playwright/mcp@latest',
        '--output-dir', 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots',
        '--save-session', '--save-trace',
        '--browser', 'chrome',
        '--viewport-size', '2400,1350',
        '--isolated', '--no-sandbox'
      ]
    };
    log('selftest_begin', {});
    // Intentionally call a non-existing tool to force error path while exercising connect/session
    const result = await callTool(spec, 'nonexistent_tool_for_logging', {}, { keepSessionOpen: true });
    log('selftest_result', { ok: result?.ok, sessionId: result?.sessionId || null, transport: result?.transport || null });
    try { process.stdout.write(`[DEBUG] selftest_done ok=${result?.ok}\n`); } catch(_) {}
  } catch (err) {
    try { process.stderr.write(`[DEBUG] selftest_error ${err?.message}\n`); } catch(_) {}
    logError('selftest_error', err);
  }
}

async function runSelfTestFollowUp() {
  try {
    try { process.stdout.write('[DEBUG] selftest_followup_begin\n'); } catch(_) {}
    const spec = {
      mode: 'stdio',
      command: 'npx',
      args: [
        '-y',
        '@playwright/mcp@latest',
        '--output-dir', 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots',
        '--save-session', '--save-trace',
        '--browser', 'chrome',
        '--viewport-size', '2400,1350',
        '--isolated', '--no-sandbox'
      ]
    };
    log('selftest_followup_begin', {});
    const result = await callTool(spec, 'browser_snapshot', {}, { keepSessionOpen: true });
    log('selftest_followup_result', { ok: result?.ok, sessionId: result?.sessionId || null, transport: result?.transport || null });
    try { process.stdout.write(`[DEBUG] selftest_followup_done ok=${result?.ok}\n`); } catch(_) {}
  } catch (err) {
    try { process.stderr.write(`[DEBUG] selftest_followup_error ${err?.message}\n`); } catch(_) {}
    logError('selftest_followup_error', err);
  }
}

function attachConfigMetadata(normalized, results) {
  const map = new Map();
  (normalized.servers || []).forEach((server) => {
    map.set(server.name, server);
  });
  return results.map((item) => {
    const configEntry = map.get(item.name);
    const snippetJson = configEntry ? serializeServerSnippet(configEntry, 'json') : null;
    const snippetToml = configEntry ? serializeServerSnippet(configEntry, 'toml') : null;
    const defaultSnippet =
      normalized.format === 'toml'
        ? snippetToml ?? snippetJson
        : snippetJson ?? snippetToml;
    return {
      ...item,
      configEntry: configEntry ? JSON.parse(JSON.stringify(configEntry)) : null,
      configSnippet: defaultSnippet,
      configSnippets: {
        json: snippetJson,
        toml: snippetToml
      },
      configFormat: normalized.format
    };
  });
}
