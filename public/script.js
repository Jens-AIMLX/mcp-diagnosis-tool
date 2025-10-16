//
// script.js
//
// Enhanced client-side logic for the MCP Diagnosis UI. Supports loading
// an mcp.json configuration, running batch diagnostics, visualising
// handshake details and testing individual tools exposed by each server.

(() => {
  const form = document.getElementById('diagnose-form');
  const modeSelect = document.getElementById('mode-select');
  const httpRow = document.getElementById('http-row');
  const stdioRow = document.getElementById('stdio-row');
  const serversList = document.getElementById('servers-list');
  const template = document.getElementById('server-template');
  const loadConfigButton = document.getElementById('load-config-btn');
  const configFileInput = document.getElementById('config-file-input');
  const configFileNameLabel = document.getElementById('config-file-name');

  const servers = [];
  let isLoadingConfig = false;

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function updateFormVisibility() {
    if (modeSelect.value === 'http') {
      httpRow.classList.remove('hidden');
      stdioRow.classList.add('hidden');
    } else {
      httpRow.classList.add('hidden');
      stdioRow.classList.remove('hidden');
    }
  }

  modeSelect.addEventListener('change', updateFormVisibility);
  updateFormVisibility();

  function parseCommandLine(line) {
    const regex = /(["'])(?:(?=\\?)\\?.)*?\1|[^\s]+/g;
    const matches = line.match(regex);
    if (!matches) return [];
    return matches.map((token) => {
      if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
        return token.slice(1, -1);
      }
      return token;
    });
  }

  function formatSpecMeta(entry) {
    if (!entry?.spec) return '';
    let base = '';
    if (entry.spec.mode === 'http') {
      base = `HTTP • ${entry.spec.url ?? ''}`;
    } else if (entry.spec.mode === 'stdio') {
      const args = Array.isArray(entry.spec.args) && entry.spec.args.length ? ` ${entry.spec.args.join(' ')}` : '';
      base = `STDIO • ${entry.spec.command ?? ''}${args}`;
    }
    if (entry.source === 'config') {
      base += ' • from config';
    }
    return base.trim();
  }

  function stringifyValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch (err) {
      return String(value);
    }
  }

  function buildHandshakeBlock(handshake) {
    if (!handshake) {
      return '';
    }
    const protocol = handshake.protocolVersion ? `<code>${escapeHtml(handshake.protocolVersion)}</code>` : 'negotiated';
    const serverInfo = handshake.serverInfo ?? {};
    const serverName = serverInfo.name ? escapeHtml(serverInfo.name) : 'Unknown server';
    const serverVersion = serverInfo.version ? ` (${escapeHtml(serverInfo.version)})` : '';
    const serverDescription = serverInfo.description ? ` — ${escapeHtml(serverInfo.description)}` : '';
    let html = '<div class="detail-block"><strong>Handshake</strong><ul>';
    html += `<li>Protocol: ${protocol}</li>`;
    html += `<li>Server: ${serverName}${serverVersion}${serverDescription}</li>`;
    html += '</ul>';
    if (handshake.instructions !== undefined && handshake.instructions !== null) {
      html += '<em>Instructions</em>';
      html += `<pre>${escapeHtml(stringifyValue(handshake.instructions))}</pre>`;
    }
    if (handshake.capabilities) {
      html += '<em>Capabilities</em>';
      html += `<pre>${escapeHtml(stringifyValue(handshake.capabilities))}</pre>`;
    }
    html += '</div>';
    return html;
  }

  function renderToolTestStatus(state) {
    if (!state) return '';
    const statusClass = state.status || 'pending';
    let label = 'Testing';
    if (statusClass === 'ok') label = 'Success';
    if (statusClass === 'error') label = 'Failed';
    return `<span class="tool-test-status ${statusClass}">${escapeHtml(label)}</span>`;
  }

  function buildToolResult(state) {
    if (!state) return '';
    if (state.status === 'ok') {
      return `<pre class="tool-output">${escapeHtml(stringifyValue(state.output ?? {}))}</pre>`;
    }
    if (state.status === 'error' && state.error) {
      const details = state.error.details !== undefined ? stringifyValue(state.error.details) : '';
      let html = '<pre class="tool-output">';
      html += escapeHtml(
        `${state.error.kind ? `kind: ${state.error.kind}\n` : ''}${state.error.advice ? `advice: ${state.error.advice}\n` : ''}${details ? `details: ${details}` : ''}`.trim()
      );
      html += '</pre>';
      return html;
    }
    return '';
  }

  function buildToolsBlock(entry) {
    const tools = entry.result?.tools ?? [];
    const toolTests = entry.toolTests ?? {};
    let html = '<div class="detail-block"><strong>Tools</strong>';
    if (!tools.length) {
      html += '<div>No tools reported.</div></div>';
      return html;
    }
    html += '<ul>';
    tools.forEach((tool) => {
      const description = tool.description ? ` — ${escapeHtml(tool.description)}` : '';
      const testState = toolTests[tool.name];
      const statusBadge = renderToolTestStatus(testState);
      html += `<li><code>${escapeHtml(tool.name)}</code>${description}`;
      html += ` <button class="tool-test-button" data-tool="${escapeAttribute(tool.name)}">Test</button>`;
      if (statusBadge) {
        html += ` ${statusBadge}`;
      }
      html += buildToolResult(testState);
      html += '</li>';
    });
    html += '</ul></div>';
    return html;
  }

  function buildPromptsBlock(entry) {
    const prompts = entry.result?.prompts ?? [];
    let html = '<div class="detail-block"><strong>Prompts</strong>';
    if (!prompts.length) {
      html += '<div>None.</div></div>';
      return html;
    }
    html += '<ul>';
    prompts.forEach((prompt) => {
      const description = prompt.description ? ` — ${escapeHtml(prompt.description)}` : '';
      html += `<li><code>${escapeHtml(prompt.name)}</code>${description}</li>`;
    });
    html += '</ul></div>';
    return html;
  }

  function buildResourcesBlock(entry) {
    const resources = entry.result?.resources ?? [];
    let html = '<div class="detail-block"><strong>Resources</strong>';
    if (!resources.length) {
      html += '<div>None.</div></div>';
      return html;
    }
    html += '<ul>';
    resources.forEach((resource) => {
      const parts = [];
      if (resource.name) {
        parts.push(`<code>${escapeHtml(resource.name)}</code>`);
      }
      if (resource.uri) {
        parts.push(`(${escapeHtml(resource.uri)})`);
      }
      if (resource.description) {
        parts.push(`— ${escapeHtml(resource.description)}`);
      }
      html += `<li>${parts.join(' ')}</li>`;
    });
    html += '</ul></div>';
    return html;
  }

  function buildErrorBlock(entry) {
    const error = entry.error ?? { kind: 'unknown' };
    let html = '<div class="detail-block"><strong>Error</strong><ul>';
    html += `<li>Kind: ${escapeHtml(error.kind ?? 'unknown')}</li>`;
    if (error.advice) {
      html += `<li>Advice: ${escapeHtml(error.advice)}</li>`;
    }
    html += '</ul>';
    if (error.details !== undefined && error.details !== null) {
      html += `<pre>${escapeHtml(stringifyValue(error.details))}</pre>`;
    }
    html += '</div>';
    return html;
  }

  function renderServers() {
    serversList.innerHTML = '';
    if (!servers.length) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'server-summary';
      emptyMessage.textContent = 'No servers diagnosed yet.';
      serversList.appendChild(emptyMessage);
      return;
    }
    servers.forEach((entry) => {
      const node = template.content.cloneNode(true);
      const card = node.querySelector('.server-card');
      const statusDot = node.querySelector('.status-dot');
      const nameSpan = node.querySelector('.server-name');
      const metaSpan = node.querySelector('.server-meta');
      const summaryDiv = node.querySelector('.server-summary');
      const detailsDiv = node.querySelector('.server-details');
      const toggleBtn = node.querySelector('.toggle-details');

      nameSpan.textContent = entry.serverName ? entry.serverName : entry.displayName;
      metaSpan.textContent = formatSpecMeta(entry);

      if (entry.status === 'pending') {
        statusDot.style.backgroundColor = '#d69e2e';
        summaryDiv.textContent = 'Checking…';
      } else if (entry.status === 'ok') {
        statusDot.classList.add('ok');
        const toolsCount = entry.result?.tools?.length ?? 0;
        const handshakeLabel = entry.handshake?.protocolVersion ?? 'negotiated';
        summaryDiv.textContent = `${toolsCount} tools • protocol ${handshakeLabel}`;
      } else {
        statusDot.classList.add('error');
        const kind = entry.error?.kind ? entry.error.kind.replace(/_/g, ' ') : 'error';
        summaryDiv.innerHTML = `<span class="error-message">${escapeHtml(kind)}</span>`;
      }

      const detailSections = [];
      if (entry.handshake) {
        detailSections.push(buildHandshakeBlock(entry.handshake));
      }
      if (entry.status === 'ok') {
        detailSections.push(buildToolsBlock(entry));
        detailSections.push(buildPromptsBlock(entry));
        detailSections.push(buildResourcesBlock(entry));
      } else if (entry.status === 'error') {
        detailSections.push(buildErrorBlock(entry));
      }

      detailsDiv.innerHTML = detailSections.filter(Boolean).join('');

      detailsDiv.querySelectorAll('.tool-test-button').forEach((button) => {
        button.addEventListener('click', () => {
          handleToolTest(entry, button.dataset.tool);
        });
      });

      toggleBtn.addEventListener('click', () => {
        const isOpen = toggleBtn.classList.toggle('open');
        detailsDiv.classList.toggle('hidden', !isOpen);
      });

      serversList.appendChild(card);
    });
  }

  async function handleToolTest(entry, toolName) {
    if (!toolName) return;
    const existing = entry.toolTests?.[toolName];
    const defaultArgs = existing?.lastArgs ?? {};
    const promptDefault = JSON.stringify(defaultArgs, null, 2);
    const input = window.prompt(`Enter JSON arguments for "${toolName}"`, promptDefault);
    if (input === null) {
      return;
    }
    let argsObject = {};
    const trimmed = input.trim();
    try {
      argsObject = trimmed ? JSON.parse(trimmed) : {};
    } catch (err) {
      alert(`Unable to parse JSON arguments: ${err.message}`);
      return;
    }
    if (!entry.toolTests) {
      entry.toolTests = {};
    }
    entry.toolTests[toolName] = { status: 'pending', lastArgs: argsObject };
    renderServers();
    try {
      const response = await fetch('/api/tools/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: entry.spec, toolName, toolArgs: argsObject })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.details || `HTTP ${response.status}`);
      }
      if (data.ok) {
        entry.toolTests[toolName] = { status: 'ok', output: data.output, lastArgs: argsObject };
      } else {
        entry.toolTests[toolName] = {
          status: 'error',
          error: data.error ?? { kind: 'tool_error', details: 'Unknown error' },
          lastArgs: argsObject
        };
      }
    } catch (err) {
      entry.toolTests[toolName] = {
        status: 'error',
        error: { kind: 'network_error', details: err.message },
        lastArgs: argsObject
      };
    }
    renderServers();
  }

  async function diagnoseConfigContent(text, fileName) {
    if (!text) return;
    isLoadingConfig = true;
    loadConfigButton.disabled = true;
    configFileNameLabel.textContent = `Loading ${fileName}…`;
    try {
      const response = await fetch('/api/config/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configText: text })
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        const message = data?.error?.details || `Unable to diagnose config (HTTP ${response.status})`;
        throw new Error(message);
      }
      // Remove previous config-derived entries
      for (let i = servers.length - 1; i >= 0; i -= 1) {
        if (servers[i].source === 'config') {
          servers.splice(i, 1);
        }
      }
      data.servers.forEach((item, index) => {
        const spec = item.spec || {};
        const result = item.result || {};
        const status = result.ok ? 'ok' : 'error';
        const handshake = result.handshake ?? null;
        const displayName =
          spec.mode === 'http'
            ? spec.url ?? item.name
            : `${spec.command ?? item.name}${Array.isArray(spec.args) && spec.args.length ? ` ${spec.args.join(' ')}` : ''}`;
        servers.push({
          id: Date.now() + index,
          source: 'config',
          serverName: item.name,
          displayName,
          spec,
          status,
          result: result.ok ? result : null,
          error: result.ok ? null : result.error,
          handshake,
          toolTests: {}
        });
      });
      configFileNameLabel.textContent = `${fileName} — ${data.servers.length} server${data.servers.length === 1 ? '' : 's'}`;
      renderServers();
    } catch (err) {
      alert(`Failed to process ${fileName}: ${err.message}`);
      configFileNameLabel.textContent = `${fileName} — failed`;
    } finally {
      isLoadingConfig = false;
      loadConfigButton.disabled = false;
      configFileInput.value = '';
    }
  }

  async function handleConfigFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      await diagnoseConfigContent(text, file.name);
    } catch (err) {
      alert(`Unable to read file: ${err.message}`);
      configFileNameLabel.textContent = `Failed to read ${file.name}`;
    }
  }

  loadConfigButton.addEventListener('click', () => {
    if (isLoadingConfig) return;
    configFileInput.click();
  });

  configFileInput.addEventListener('change', () => {
    const [file] = configFileInput.files;
    if (file) {
      void handleConfigFile(file);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const mode = modeSelect.value;
    let spec;
    if (mode === 'http') {
      const urlField = document.getElementById('http-url');
      const url = urlField.value.trim();
      if (!url) {
        alert('Please enter an MCP HTTP URL');
        return;
      }
      spec = { mode, url };
    } else {
      const cmdField = document.getElementById('stdio-command');
      const cmdLine = cmdField.value.trim();
      if (!cmdLine) {
        alert('Please enter a command to launch the MCP server');
        return;
      }
      const tokens = parseCommandLine(cmdLine);
      if (!tokens.length) {
        alert('Invalid command line');
        return;
      }
      const [command, ...args] = tokens;
      spec = { mode, command, args };
    }
    const displayName = mode === 'http' ? spec.url : `${spec.command} ${Array.isArray(spec.args) ? spec.args.join(' ') : ''}`.trim();
    const entry = {
      id: Date.now(),
      source: 'manual',
      serverName: null,
      displayName,
      spec,
      status: 'pending',
      result: null,
      error: null,
      handshake: null,
      toolTests: {}
    };
    servers.push(entry);
    renderServers();
    try {
      const response = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? `HTTP ${response.status}`);
      }
      if (data.ok) {
        entry.status = 'ok';
        entry.result = data;
        entry.error = null;
        entry.handshake = data.handshake ?? null;
        entry.toolTests = {};
      } else {
        entry.status = 'error';
        entry.error = data.error;
        entry.handshake = data.handshake ?? null;
      }
    } catch (err) {
      entry.status = 'error';
      entry.error = { kind: 'network_error', details: err.message };
    }
    renderServers();
  });
})();
