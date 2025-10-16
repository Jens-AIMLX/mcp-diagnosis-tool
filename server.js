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

const {
  diagnose,
  parseMcpConfigContent,
  diagnoseConfigEntries,
  serializeMcpConfigToJson,
  serializeMcpConfigToToml,
  callTool
} = require('./mcpDoctor');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON body parsing
app.use(express.json());
// Allow cross‑origin requests in case the UI is served from a different host
app.use(cors());

// API route for diagnosing servers
app.post('/api/diagnose', async (req, res) => {
  const { mode, url, command, args } = req.body || {};
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
    res.json(result);
  } catch (err) {
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
    res.json({ ok: true, format: normalized.format, config: normalized, servers: results });
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

// API route for testing individual tools
app.post('/api/tools/call', async (req, res) => {
  const { spec, toolName, toolArgs } = req.body || {};
  if (!spec || typeof spec !== 'object' || !spec.mode) {
    return res.status(400).json({ error: 'spec with a valid mode is required' });
  }
  if (!toolName || typeof toolName !== 'string') {
    return res.status(400).json({ error: 'toolName is required' });
  }
  try {
    const result = await callTool(spec, toolName, toolArgs ?? {});
    res.json(result);
  } catch (err) {
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
});
