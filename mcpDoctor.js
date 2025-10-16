/*
 * MCP doctor module
 *
 * This module provides a single asynchronous function `diagnose` that inspects
 * a Model Context Protocol (MCP) server over either stdio or HTTP. The
 * function uses the official MCP client SDK to establish a connection,
 * perform the initialize/initialized handshake, and then query the server
 * for its exposed tools, prompts and resources. If anything goes wrong
 * during connection or handshake the error is classified into a structured
 * shape to make it easy for callers (e.g. a web UI) to display helpful
 * messages to the user.
 *
 * The implementation borrows heavily from the CLI‑based mcp‑doctor script
 * developed earlier. It is packaged as a reusable module here so that
 * server.js can invoke it directly without spawning a child process. When
 * adding additional transports or error conditions, update the classifyError
 * function accordingly.
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const fs = require('fs/promises');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Wrap a promise with a timeout. If the promise does not resolve within the
 * allotted time the returned promise rejects with a timeout error.
 *
 * @param {Promise<T>} promise The promise to wrap
 * @param {number} ms Timeout in milliseconds
 * @param {string} label A label used in the timeout error message
 * @returns {Promise<T>}
 * @template T
 */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.code = 'ETIMEDOUT';
      reject(err);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Attempt to classify an arbitrary error into a friendlier shape. The
 * classification logic is adapted from the earlier CLI version of the MCP
 * doctor. It inspects the error message, code and HTTP status (if present)
 * and assigns a short `kind` string along with a human‑readable `advice`
 * whenever possible. Any unrecognised errors are reported as `unknown` and
 * the original error is attached in the `details` field for further
 * inspection.
 *
 * @param {any} e The error thrown by the MCP client or HTTP layer
 * @returns {{kind: string, advice?: string, details?: unknown}}
 */
function classifyError(e) {
  const msg = (e?.message || '').toLowerCase();
  const code = e?.error?.code ?? e?.code;
  const status = e?.response?.status ?? e?.status;

  // Node‑level connection problems
  if (msg.includes('econnrefused') || (msg.includes('connect') && msg.includes('refused'))) {
    return { kind: 'connection_refused', advice: 'Check that the server is running and reachable on the specified port/path.' };
  }
  if (msg.includes('timed out') || code === 'ETIMEDOUT') {
    return { kind: 'timeout', advice: 'The connection timed out. Increase the timeout or ensure the server is responsive.' };
  }

  // JSON‑RPC protocol mismatch
  if (msg.includes('unsupported protocol version') || code === -32602) {
    return {
      kind: 'protocol_version_mismatch',
      advice: 'Client and server disagree on the protocol version. Upgrade/downgrade or configure the MCP version header accordingly.',
      details: e?.error ?? e
    };
  }
  if (msg.includes('method not found') || code === -32601) {
    return {
      kind: 'method_not_found',
      advice: 'The server does not implement the requested method. Ensure the capability is supported and spelled correctly.',
      details: e?.error ?? e
    };
  }
  if (msg.includes('invalid request') || code === -32600) {
    return {
      kind: 'invalid_request',
      advice: 'The server rejected our JSON‑RPC. Check that there is no extraneous output on stdout and that the request body is valid JSON.',
      details: e?.error ?? e
    };
  }
  if (msg.includes('sse') && msg.includes('not')) {
    return {
      kind: 'transport_mismatch',
      advice: 'The server may only support Server‑Sent Events (SSE). Try using an SSE client or ensure the server exposes a Streamable HTTP endpoint.'
    };
  }

  // HTTP layer hints
  if (status === 404 || msg.includes('404')) {
    return { kind: 'http_404', advice: 'The path is not an MCP endpoint. Check that the URL is correct (e.g. /mcp).' };
  }
  if (status === 405 || msg.includes('405')) {
    return { kind: 'http_405', advice: 'The HTTP method is not allowed at this endpoint. Verify the MCP route and transport.' };
  }
  if (status === 400 || msg.includes('400') || msg.includes('mcp-protocol-version')) {
    return {
      kind: 'missing_version_header',
      advice: 'For HTTP transports you must send the MCP‑Protocol‑Version header with every request after initialize.'
    };
  }

  return { kind: 'unknown', details: e };
}

/**
 * Establish a client connection using the provided specification and capture handshake details.
 *
 * @param {{mode: 'stdio'|'http', command?: string, args?: string[], env?: Record<string, string>, url?: string, cwd?: string, stderr?: string}} spec
 * @param {number} timeoutMs
 * @returns {Promise<{client: InstanceType<typeof Client>, transportName: 'stdio'|'http'|'sse', handshake: {protocolVersion: string, serverInfo?: any, capabilities?: any, instructions?: any}}>}
 */
async function connectClient(spec, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const client = new Client({ name: 'mcp-diagnosis-ui', version: '0.1.0' });
  let transportName = null;
  let transport = null;
  try {
    if (spec.mode === 'stdio') {
      const command = spec.command;
      if (!command) throw new Error('No command provided for stdio mode');
      const args = spec.args || [];
      const stdioOptions = { command, args };
      if (spec.env && typeof spec.env === 'object') {
        stdioOptions.env = spec.env;
      }
      if (spec.cwd) {
        stdioOptions.cwd = spec.cwd;
      }
      if (spec.stderr) {
        stdioOptions.stderr = spec.stderr;
      }
      transport = new StdioClientTransport(stdioOptions);
      await withTimeout(client.connect(transport), timeoutMs, 'connect (stdio)');
      transportName = 'stdio';
    } else if (spec.mode === 'http') {
      if (!spec.url) throw new Error('No URL provided for http mode');
      const urlObj = new URL(spec.url);
      try {
        transport = new StreamableHTTPClientTransport(urlObj);
        await withTimeout(client.connect(transport), timeoutMs, 'connect (http)');
        transportName = 'http';
      } catch (httpErr) {
        transport = new SSEClientTransport(urlObj);
        await withTimeout(client.connect(transport), timeoutMs, 'connect (sse)');
        transportName = 'sse';
      }
    } else {
      throw new Error(`Unknown mode: ${spec.mode}`);
    }

    const handshake = {
      protocolVersion: typeof transport?.protocolVersion === 'string' && transport.protocolVersion
        ? transport.protocolVersion
        : 'negotiated',
      serverInfo: client.getServerVersion() ?? null,
      capabilities: client.getServerCapabilities() ?? null,
      instructions: client.getInstructions() ?? null
    };

    return { client, transportName, handshake };
  } catch (err) {
    try {
      await client.close();
    } catch (_) {
      /* ignore close errors */
    }
    throw err;
  }
}

/**
 * Diagnose an MCP server by connecting using the appropriate transport and
 * querying its exposed capabilities. Supports both stdio servers (spawned
 * locally) and HTTP endpoints. The returned object has the shape used by
 * the CLI doctor script: an `ok` flag, the transport used (stdio, http or
 * sse), and lists of tools, prompts and resources if available. On error
 * the `error` field contains a classification describing what went wrong.
 *
 * @param {{mode: 'stdio'|'http', command?: string, args?: string[], env?: Record<string, string>, url?: string}} spec
 * @returns {Promise<{ok: boolean, transport: 'stdio'|'http'|'sse'|null, serverInfo?: any, protocolVersion?: string, capabilities?: any, tools?: Array<{name: string, description?: string}>, prompts?: Array<{name: string, description?: string}>, resources?: Array<{uri: string, name?: string, description?: string}>, error?: {kind: string, advice?: string, details?: unknown}}>} The diagnostic result
 */
async function diagnose(spec) {
  let connection;
  try {
    connection = await connectClient(spec, DEFAULT_TIMEOUT_MS);
    const { client, transportName, handshake } = connection;

    // Once connected, list tools/prompts/resources. Some servers may omit
    // certain methods; in those cases we safely catch and ignore errors.
    let tools = [];
    let prompts = [];
    let resources = [];
    let serverInfo = null;
    let capabilities = null;
    let instructions = null;
    try {
      const toolsList = await withTimeout(client.listTools(), DEFAULT_TIMEOUT_MS, 'tools/list');
      const arr = Array.isArray(toolsList) ? toolsList : toolsList?.tools;
      if (Array.isArray(arr)) {
        tools = arr.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema ?? null,
          outputSchema: t.outputSchema ?? null,
          annotations: t.annotations ?? null
        }));
      }
    } catch (e) {
      // Some servers may not implement tools/list; ignore
    }
    try {
      const promptsList = await client.listPrompts().catch(() => undefined);
      const arr = Array.isArray(promptsList) ? promptsList : promptsList?.prompts;
      if (Array.isArray(arr)) {
        prompts = arr.map((p) => ({ name: p.name, description: p.description }));
      }
    } catch (e) {
      // ignore
    }
    try {
      const resourcesList = await client.listResources().catch(() => undefined);
      const arr = Array.isArray(resourcesList) ? resourcesList : resourcesList?.resources;
      if (Array.isArray(arr)) {
        resources = arr.map((r) => ({ uri: r.uri ?? r.href ?? '', name: r.name, description: r.description }));
      }
    } catch (e) {
      // ignore
    }
    serverInfo = handshake.serverInfo;
    capabilities = handshake.capabilities;
    instructions = handshake.instructions;
    await client.close().catch(() => {});

    // The MCP client hides the exact negotiated protocol version; indicate success generically.
    return {
      ok: true,
      transport: transportName,
      protocolVersion: handshake.protocolVersion,
      handshake: {
        protocolVersion: handshake.protocolVersion,
        serverInfo,
        capabilities,
        instructions
      },
      tools,
      prompts,
      resources
    };
  } catch (err) {
    if (connection?.client) {
      await connection.client.close().catch(() => {});
    }
    return {
      ok: false,
      transport: connection?.transportName ?? null,
      handshake: connection?.handshake,
      error: classifyError(err)
    };
  }
}

/**
 * Load and validate an MCP configuration file.
 *
 * The configuration must follow the shape shown in the supported template:
 * {
 *   "mcpServers": {
 *     "serverName": {
 *       "command": "npx",
 *       "args": ["@playwright/mcp@latest"],
 *       "env": { "FOO": "bar" }
 *     }
 *   }
 * }
 *
 * Alternatively a server entry may specify a `url` for HTTP transports.
 *
 * @param {string} configPath Absolute or relative path to mcp.json
 * @returns {Promise<{path: string, servers: Array<{name: string, mode: 'stdio'|'http', command?: string, args?: string[], env?: Record<string, string>, url?: string}>}>}
 */
async function loadMcpConfig(configPath) {
  if (typeof configPath !== 'string' || !configPath.trim()) {
    throw new Error('configPath must be a non-empty string');
  }
  const resolvedPath = path.resolve(configPath);
  let raw;
  try {
    raw = await fs.readFile(resolvedPath, 'utf8');
  } catch (err) {
    const error = new Error(`Unable to read MCP config file at ${resolvedPath}: ${err.message}`);
    error.code = 'CONFIG_READ_ERROR';
    error.cause = err;
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const error = new Error(`Malformed JSON in MCP config file at ${resolvedPath}: ${err.message}`);
    error.code = 'CONFIG_PARSE_ERROR';
    error.cause = err;
    throw error;
  }
  const { servers } = normalizeMcpConfig(parsed);

  return { path: resolvedPath, servers };
}

/**
 * Validate and normalise a parsed MCP configuration object.
 *
 * @param {unknown} parsed
 * @returns {{servers: Array<{name: string, mode: 'stdio'|'http', command?: string, args?: string[], env?: Record<string, string>, url?: string}>}}
 */
function normalizeMcpConfig(parsed) {
  const serversNode = parsed?.mcpServers;
  if (!serversNode || typeof serversNode !== 'object' || Array.isArray(serversNode)) {
    const error = new Error('mcp.json must contain an "mcpServers" object with named entries.');
    error.code = 'CONFIG_SCHEMA_ERROR';
    throw error;
  }

  const servers = [];
  for (const [name, serverConfig] of Object.entries(serversNode)) {
    if (!name.trim()) {
      throw new Error('Server names in "mcpServers" must not be empty.');
    }
    if (!serverConfig || typeof serverConfig !== 'object' || Array.isArray(serverConfig)) {
      throw new Error(`Server "${name}" must be an object.`);
    }
    if (serverConfig.command) {
      if (typeof serverConfig.command !== 'string' || !serverConfig.command.trim()) {
        throw new Error(`Server "${name}" has an invalid "command" value.`);
      }
      let args = [];
      if (serverConfig.args !== undefined) {
        if (!Array.isArray(serverConfig.args)) {
          throw new Error(`Server "${name}" args must be an array of strings.`);
        }
        args = serverConfig.args.map((value, idx) => {
          if (typeof value !== 'string') {
            throw new Error(`Server "${name}" args[${idx}] must be a string.`);
          }
          return value;
        });
      }
      let env = undefined;
      if (serverConfig.env !== undefined) {
        if (!serverConfig.env || typeof serverConfig.env !== 'object' || Array.isArray(serverConfig.env)) {
          throw new Error(`Server "${name}" env must be an object of key/value pairs.`);
        }
        env = {};
        for (const [key, value] of Object.entries(serverConfig.env)) {
          env[key] = value === undefined || value === null ? '' : String(value);
        }
      }
      servers.push({
        name,
        mode: 'stdio',
        command: serverConfig.command,
        args,
        env
      });
      continue;
    }
    if (serverConfig.url) {
      if (typeof serverConfig.url !== 'string' || !serverConfig.url.trim()) {
        throw new Error(`Server "${name}" has an invalid "url" value.`);
      }
      servers.push({
        name,
        mode: 'http',
        url: serverConfig.url.trim()
      });
      continue;
    }
    throw new Error(`Server "${name}" must specify either a "command" (stdio) or a "url" (http).`);
  }

  return { servers };
}

/**
 * Diagnose all servers defined in an MCP configuration file.
 *
 * @param {string} configPath Path to the mcp.json file
 * @param {{ diagnoseFn?: typeof diagnose }} [options] Optional overrides for testing
 * @returns {Promise<Array<{name: string, mode: 'stdio'|'http', spec: object, result: any}>>}
 */
async function diagnoseConfigFile(configPath, options = {}) {
  const { servers } = await loadMcpConfig(configPath);
  return diagnoseConfigEntries(servers, options);
}

/**
 * Parse raw JSON content for an MCP configuration and normalise it.
 *
 * @param {string|object} content JSON string or already parsed object
 * @returns {{servers: Array<{name: string, mode: 'stdio'|'http', command?: string, args?: string[], env?: Record<string, string>, url?: string}>}}
 */
function parseMcpConfigContent(content) {
  let parsed;
  if (typeof content === 'string') {
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      const error = new Error(`Malformed JSON content: ${err.message}`);
      error.code = 'CONFIG_PARSE_ERROR';
      error.cause = err;
      throw error;
    }
  } else if (content && typeof content === 'object') {
    parsed = content;
  } else {
    throw new Error('Config content must be a JSON string or object.');
  }
  return normalizeMcpConfig(parsed);
}

/**
 * Diagnose an array of server definitions produced by normalizeMcpConfig.
 *
 * @param {Array<{name: string, mode: 'stdio'|'http', command?: string, args?: string[], env?: Record<string, string>, url?: string}>} servers
 * @param {{ diagnoseFn?: typeof diagnose }} [options]
 * @returns {Promise<Array<{name: string, mode: 'stdio'|'http', spec: object, result: any}>>}
 */
async function diagnoseConfigEntries(servers, options = {}) {
  const diagnoseFn = options.diagnoseFn || diagnose;
  const results = [];
  for (const entry of servers) {
    const spec =
      entry.mode === 'http'
        ? { mode: 'http', url: entry.url }
        : {
            mode: 'stdio',
            command: entry.command,
            args: [...(entry.args || [])],
            ...(entry.env ? { env: { ...entry.env } } : {})
          };
    const result = await diagnoseFn(spec);
    results.push({ name: entry.name, mode: entry.mode, spec, result });
  }
  return results;
}

/**
 * Call a specific tool on an MCP server described by the given spec.
 *
 * @param {{mode: 'stdio'|'http', command?: string, args?: string[], env?: Record<string, string>, url?: string}} spec
 * @param {string} toolName
 * @param {Record<string, unknown>} [toolArgs]
 * @returns {Promise<{ok: boolean, transport: 'stdio'|'http'|'sse'|null, handshake?: object, output?: unknown, error?: {kind: string, advice?: string, details?: unknown}}>}
 */
async function callTool(spec, toolName, toolArgs = {}) {
  if (typeof toolName !== 'string' || !toolName.trim()) {
    throw new Error('toolName must be a non-empty string');
  }
  if (toolArgs === null || typeof toolArgs !== 'object' || Array.isArray(toolArgs)) {
    throw new Error('toolArgs must be an object');
  }
  let client;
  let connection;
  try {
    connection = await connectClient(spec, DEFAULT_TIMEOUT_MS);
    client = connection.client;
    const result = await withTimeout(
      client.callTool({ name: toolName, arguments: toolArgs }),
      DEFAULT_TIMEOUT_MS,
      `tools/call (${toolName})`
    );
    await client.close().catch(() => {});
    return {
      ok: true,
      transport: connection.transportName,
      handshake: connection.handshake,
      output: result
    };
  } catch (err) {
    if (client) {
      await client.close().catch(() => {});
    }
    return {
      ok: false,
      transport: connection?.transportName ?? null,
      handshake: connection?.handshake,
      error: classifyError(err)
    };
  }
}

module.exports = {
  diagnose,
  loadMcpConfig,
  diagnoseConfigFile,
  parseMcpConfigContent,
  diagnoseConfigEntries,
  callTool
};
