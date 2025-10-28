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
const { log, logError, logWithTruncation, LOG_PATH, getRecent, attachConsoleInterceptors, detachConsoleFile, rotateConsoleFile, startRolling24Hours, getNextRotationTs } = require('./logger');
const fs = require('fs');

// Debug signature to verify correct file is running and to force-create debug log file
try {
  console.log('[DEBUG_SIGNATURE] server.js loaded (enhanced logging)');
  fs.appendFileSync(LOG_PATH, '', { encoding: 'utf8' });
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
  closeAllSessions,
  openSessionForSpec,
  restartSessionForSpec,
  renderToolReportMarkdown
} = require('./mcpDoctor');

// Server control state for UI and log release attempts
const SERVER_LOG_PATH = path.join(__dirname, 'server.log');
let LOG_DETACHED = false;
const SERVER_START_TIME = Date.now(); // Timestamp when server started

const app = express();
const PORT = process.env.PORT || 3060;

// Enable JSON body parsing
app.use(express.json());
// Allow cross‑origin requests in case the UI is served from a different host
app.use(cors());
// Attach console/stdout/stderr to managed server.log stream (allows rotate/detach)
try { attachConsoleInterceptors(); log('raw_log_attach', { path: path.join(__dirname, 'server.log') }); } catch(_) {}

// Start 24h rolling rotation (daily at local midnight)
try { startRolling24Hours(); log('raw_log_roll_schedule', {}); } catch(_) {}


// Startup log
log('server_start', { port: Number(process.env.PORT || 3060), logPath: LOG_PATH });

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

// Server info/status
app.get('/api/server/info', (req, res) => {
  const info = {
    pid: process.pid,
    port: Number(PORT),
    startTime: SERVER_START_TIME,
    stdoutRedirected: !process.stdout.isTTY,
    serverLogPath: SERVER_LOG_PATH,
    debugLogPath: LOG_PATH,
    logDetached: LOG_DETACHED,
    nextRotationTs: (typeof getNextRotationTs === 'function') ? getNextRotationTs() : null,
  };
  try { log('server_info', info); } catch (_) {}
  res.json({ ok: true, ...info });
});

// Release (detach) managed server.log stream and rename current file
app.post('/api/server/release-log', async (req, res) => {
  const result = { renamed: false, note: '' };
  try {
    try { detachConsoleFile(); } catch(_) {}
    try {
      if (fs.existsSync(SERVER_LOG_PATH)) {
        const releasedPath = `${SERVER_LOG_PATH}.${Date.now()}.released`;
        fs.renameSync(SERVER_LOG_PATH, releasedPath);
        result.renamed = true;
      }
    } catch (e) {
      result.note = `rename failed: ${e?.message}`;
    }
    LOG_DETACHED = true;
    log('server_release_log', { ok: true, ...result, logDetached: LOG_DETACHED });
    res.json({ ok: true, logDetached: LOG_DETACHED, ...result });
  } catch (err) {
    LOG_DETACHED = true;
    logError('server_release_log_error', err);
    res.status(500).json({ ok: false, error: { kind: 'release_failed', details: err.message }, logDetached: LOG_DETACHED, ...result });
  }
});

// Rotate managed server.log: close, rename with timestamp, reopen fresh file
app.post('/api/server/rotate-log', (req, res) => {
  try {
    const { ok, path: p } = rotateConsoleFile(SERVER_LOG_PATH);
    LOG_DETACHED = false;
    log('server_rotate_log', { ok, path: p });
    res.json({ ok: true, path: p });
  } catch (err) {
    logError('server_rotate_log_error', err);
    res.status(500).json({ ok: false, error: { kind: 'rotate_failed', details: err.message } });
  }
});


// Download current or most recent rotated server log
function getLatestRotatedLogPath() {
  try {
    const dir = __dirname;
    const files = fs.readdirSync(dir);
    const candidates = files
      .filter(f => f.startsWith('server.log.') && (f.endsWith('.released') || f.endsWith('.rotated')))
      .map(f => ({ name: f, full: path.join(dir, f), stat: fs.statSync(path.join(dir, f)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return candidates.length ? candidates[0].full : null;
  } catch (_) { return null; }
}
app.get('/api/server/log/download', (req, res) => {
  try {
    let filePath = SERVER_LOG_PATH;
    if (LOG_DETACHED) {
      const latest = getLatestRotatedLogPath();
      if (latest) filePath = latest;
    }
    if (!fs.existsSync(filePath)) {
      const latest = getLatestRotatedLogPath();
      if (latest) filePath = latest;
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: { kind: 'not_found', details: 'No log file available' } });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    res.sendFile(filePath);
  } catch (err) {
    logError('server_log_download_error', err);
    res.status(500).json({ ok: false, error: { kind: 'download_failed', details: err.message } });
  }
});

// Tail the end of the current (or latest) server log without downloading the entire file
app.get('/api/server/log/tail', (req, res) => {
  try {
    const maxBytes = 5_000_000; // hard ceiling for safety
    const defBytes = 20_000;
    const bytes = Math.max(100, Math.min(maxBytes, Number(req.query.bytes || defBytes)));

    let filePath = SERVER_LOG_PATH;
    if (LOG_DETACHED) {
      const latest = getLatestRotatedLogPath();
      if (latest) filePath = latest;
    }
    if (!fs.existsSync(filePath)) {
      const latest = getLatestRotatedLogPath();
      if (latest) filePath = latest;
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: { kind: 'not_found', details: 'No log file available' } });
    }

    const stat = fs.statSync(filePath);
    const size = stat.size;
    const start = Math.max(0, size - bytes);
    const length = size - start;

    let content = '';
    if (length > 0) {
      const fd = fs.openSync(filePath, 'r');
      try {
        const buffer = Buffer.allocUnsafe(length);
        fs.readSync(fd, buffer, 0, length, start);
        content = buffer.toString('utf8');
      } finally {
        try { fs.closeSync(fd); } catch (_) {}
      }
    }

    res.json({ ok: true, file: path.basename(filePath), size, start, bytesRead: length, truncated: start > 0, content });
  } catch (err) {
    logError('server_log_tail_error', err);
    res.status(500).json({ ok: false, error: { kind: 'tail_failed', details: err.message } });
  }
});


// Graceful shutdown (frontend should show offline state after this)
app.post('/api/server/shutdown', (req, res) => {
  try { log('server_shutdown_requested', { from: req.ip || 'unknown' }); } catch (_) {}
  res.json({ ok: true, message: 'Shutting down…' });
  setTimeout(() => process.exit(0), 150);
});

// Restart: close all sessions, spawn start.bat in detached mode, then exit current process
app.post('/api/server/restart', async (req, res) => {
  const { spawn } = require('child_process');
  const startBatPath = path.join(__dirname, 'start.bat');

  try {
    log('server_restart_requested', { from: req.ip || 'unknown', startBatPath });

    // Check if start.bat exists
    if (!fs.existsSync(startBatPath)) {
      return res.status(500).json({
        ok: false,
        error: { kind: 'restart_failed', details: 'start.bat not found' }
      });
    }

    // Close all active MCP sessions before restarting
    try {
      const closeResult = await closeAllSessions();
      log('server_restart_sessions_closed', { closedCount: closeResult.closed.length });
    } catch (sessionErr) {
      logError('server_restart_session_close_error', sessionErr);
      // Continue with restart even if session close fails
    }

    // Spawn start.bat in detached mode so it survives parent exit
    const child = spawn('cmd.exe', ['/c', startBatPath], {
      detached: true,
      stdio: 'ignore',
      cwd: __dirname
    });

    // Unref so parent can exit independently
    child.unref();

    log('server_restart_spawned', { pid: child.pid });
    res.json({ ok: true, message: 'Restarting server…' });

    // Exit current process (kills all child MCP sessions)
    // The spawned start.bat will clean ports and start fresh
    setTimeout(() => process.exit(0), 150);
  } catch (err) {
    logError('server_restart_error', err);
    res.status(500).json({
      ok: false,
      error: { kind: 'restart_failed', details: err.message }
    });
  }
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

    // Enhanced logging with tool output (truncated for console, full in file)
    logWithTruncation('tools_call_response', {
      ok: result?.ok,
      toolName,
      sessionId: result?.sessionId || null,
      sessionReused: !!result?.sessionReused,
      transport: result?.transport || null,
      error: result?.error?.kind || null,
      output: result?.output,  // Include the actual tool output
      handshake: result?.handshake,
      endedAt: new Date().toISOString()
    }, 1000);  // Truncate console output at 1000 chars

    res.json(result);
  } catch (err) {
    try { process.stderr.write(`[DEBUG] callTool error: ${err?.message}\n`); } catch(_) {}
    logError('tools_call_error', err, { toolName, endedAt: new Date().toISOString() });
    res.status(500).json({ ok: false, error: { kind: 'internal_error', details: err.message } });
  }
});

// API route for running a tool and saving a markdown report identical to UI
app.post('/api/tools/report', async (req, res) => {
  const { spec, toolName, toolArgs, keepSessionOpen, savePath, filename } = req.body || {};
  if (!spec || typeof spec !== 'object' || !spec.mode) {
    return res.status(400).json({ ok: false, error: { kind: 'invalid_request', details: 'spec with a valid mode is required' } });
  }
  if (!toolName || typeof toolName !== 'string') {
    return res.status(400).json({ ok: false, error: { kind: 'invalid_request', details: 'toolName is required' } });
  }
  const startedAt = new Date();
  try {
    log('tools_report_request', { toolName, keepSessionOpen: !!keepSessionOpen });
    const callResult = await callTool(spec, toolName, toolArgs ?? {}, { keepSessionOpen: !!keepSessionOpen });
    const endedAt = new Date();
    const timings = { startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), durationMs: endedAt.getTime() - startedAt.getTime() };
    const md = renderToolReportMarkdown({ spec, toolName, toolArgs: toolArgs ?? {}, result: callResult, timings });

    // Determine filename and path
    const ts = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').replace('Z', '');
    const specLabel = (() => {
      if (spec.mode === 'http') return (spec.url || 'http').replace(/[^a-z0-9._-]+/gi, '_');
      const cmd = (spec.command || 'stdio').replace(/[^a-z0-9._-]+/gi, '_');
      return cmd;
    })();
    const safeTool = toolName.replace(/[^a-z0-9._-]+/gi, '_');
    const finalName = filename && typeof filename === 'string' && filename.trim()
      ? filename.trim()
      : `MCPDiagnois_Report_${ts}_${specLabel}_${safeTool}.md`;
    const dir = savePath && typeof savePath === 'string' && savePath.trim() ? savePath.trim() : __dirname;
    const outPath = path.isAbsolute(finalName) ? finalName : path.join(dir, finalName);

    fs.writeFileSync(outPath, md, { encoding: 'utf8' });
    log('tools_report_saved', { path: outPath, bytes: Buffer.byteLength(md, 'utf8') });
    res.json({ ok: true, path: outPath, content: md, callResult });
  } catch (err) {
    logError('tools_report_error', err);
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

// API route for proactively opening (or reusing) a kept-alive session for a spec
app.post('/api/sessions/open', async (req, res) => {
  const { spec } = req.body || {};
  if (!spec || typeof spec !== 'object' || !spec.mode) {
    return res.status(400).json({ ok: false, error: { kind: 'invalid_request', details: 'spec with a valid mode is required' } });
  }
  try {
    log('session_open_request', { spec: { mode: spec.mode, command: spec.command, url: spec.url, args: spec.args } });
    const opened = await openSessionForSpec(spec);
    log('session_open_response', { sessionId: opened.sessionId, reused: opened.sessionReused, transport: opened.transport });
    res.json(opened);
  } catch (err) {
    logError('session_open_error', err);
    res.status(500).json({ ok: false, error: { kind: 'internal_error', details: err.message } });
  }
});

// API route for restarting a session by spec or sessionId
app.post('/api/sessions/restart', async (req, res) => {
  const { spec, sessionId } = req.body || {};
  if (!sessionId && !(spec && typeof spec === 'object' && spec.mode)) {
    return res.status(400).json({ ok: false, error: { kind: 'invalid_request', details: 'Provide sessionId or spec with a valid mode' } });
  }
  try {
    log('session_restart_request', { sessionId: sessionId || null, spec: spec ? { mode: spec.mode, command: spec.command, url: spec.url, args: spec.args } : null });
    const restarted = await restartSessionForSpec({ sessionId, spec });
    log('session_restart_response', { sessionId: restarted.sessionId, closedCount: restarted.closedCount, transport: restarted.transport });
    res.json(restarted);
  } catch (err) {
    logError('session_restart_error', err);
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
  // Optional self-tests (disabled by default). Enable by setting MCP_SELFTEST=1 or MCP_SELFTEST=true
  const selftestFlag = String(process.env.MCP_SELFTEST || '').toLowerCase();
  const enableSelftest = selftestFlag === '1' || selftestFlag === 'true';
  if (enableSelftest) {
    log('selftest_scheduled', { delayMs: 1500 });
    setTimeout(runSelfTestLogging, 1500);
    log('selftest_followup_scheduled', { delayMs: 4500 });
    setTimeout(runSelfTestFollowUp, 4500);
  } else {
    log('selftest_skipped', { reason: 'disabled', env: process.env.MCP_SELFTEST || null });
  }
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
    const result = await callTool(spec, 'nonexistent_tool_for_logging', {}, { keepSessionOpen: false });
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
    const result = await callTool(spec, 'browser_snapshot', {}, { keepSessionOpen: false });
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
