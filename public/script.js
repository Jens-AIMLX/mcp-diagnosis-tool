//
// script.js
//
// Client-side logic for the MCP Diagnosis UI. Supports manual diagnoses,
// loading mcp.json files, visualising handshake details, listing tool
// arguments (when declared) and testing tools through a modal interface.

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

  const modalBackdrop = document.getElementById('modal-backdrop');
  const toolModal = document.getElementById('tool-modal');
  const toolModalBody = document.getElementById('tool-modal-body');
  const toolModalTitle = document.getElementById('tool-modal-title');
  const toolModalSubmit = document.getElementById('tool-modal-submit');
  const toolModalClose = document.getElementById('tool-modal-close');

  const servers = [];
  let isLoadingConfig = false;
  let activeToolContext = null;
  let previousBodyOverflow = '';

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

  function sanitizeKey(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
  }

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

  function updateFormVisibility() {
    if (modeSelect.value === 'http') {
      httpRow.classList.remove('hidden');
      stdioRow.classList.add('hidden');
    } else {
      httpRow.classList.add('hidden');
      stdioRow.classList.remove('hidden');
    }
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

  function extractToolArguments(inputSchema) {
    if (!inputSchema || typeof inputSchema !== 'object') return [];
    const schemaType = inputSchema.type;
    if (schemaType && schemaType !== 'object') return [];
    const properties =
      inputSchema.properties && typeof inputSchema.properties === 'object' ? inputSchema.properties : {};
    const required = new Set(Array.isArray(inputSchema.required) ? inputSchema.required : []);
    return Object.entries(properties).map(([name, schema]) => {
      const entry = schema && typeof schema === 'object' ? schema : {};
      const type = typeof entry.type === 'string' ? entry.type : 'any';
      return {
        name,
        required: required.has(name),
        schema: entry,
        type,
        description: typeof entry.description === 'string' ? entry.description : '',
        enum: Array.isArray(entry.enum) ? entry.enum : undefined
      };
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
      const lines = [];
      if (state.error.kind) lines.push(`kind: ${state.error.kind}`);
      if (state.error.advice) lines.push(`advice: ${state.error.advice}`);
      if (state.error.details !== undefined) {
        lines.push(`details: ${stringifyValue(state.error.details)}`);
      }
      if (!lines.length) {
        lines.push(stringifyValue(state.error));
      }
      return `<pre class="tool-output">${escapeHtml(lines.join('\n'))}</pre>`;
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
      const args = extractToolArguments(tool.inputSchema);
      if (args.length) {
        html += '<div class="tool-arguments"><em>Arguments</em><ul>';
        args.forEach((arg) => {
          const metaBits = [];
          if (arg.type) metaBits.push(arg.type);
          if (arg.required) metaBits.push('required');
          if (arg.enum && arg.enum.length) {
            metaBits.push(`enum: ${arg.enum.map((value) => String(value)).join(', ')}`);
          }
          const meta = metaBits.length ? `<span class="argument-meta">${escapeHtml(metaBits.join(' • '))}</span>` : '';
          const desc = arg.description ? ` — ${escapeHtml(arg.description)}` : '';
          html += `<li><code>${escapeHtml(arg.name)}</code>${meta}${desc}</li>`;
        });
        html += '</ul></div>';
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
        const protocolVersion = entry.handshake?.protocolVersion ?? 'negotiated';
        summaryDiv.textContent = `${toolsCount} tools • protocol ${protocolVersion}`;
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
          openToolModal(entry, button.dataset.tool);
        });
      });

      toggleBtn.addEventListener('click', () => {
        const isOpen = toggleBtn.classList.toggle('open');
        detailsDiv.classList.toggle('hidden', !isOpen);
      });

      serversList.appendChild(card);
    });
  }

  function applyLastArgs(context) {
    const lastArgs = context.lastArgs ?? {};
    if (context.argSpecs.length) {
      context.argSpecs.forEach((spec) => {
        const field = document.getElementById(spec.inputId);
        if (!field) return;
        const value = lastArgs[spec.name];
        if (value === undefined) return;

        const type = spec.schema?.type;
        if (spec.enum && spec.enum.length) {
          const idx = spec.enum.findIndex((item) => Object.is(item, value));
          field.value = idx >= 0 ? String(idx) : '';
        } else if (type === 'boolean') {
          field.value = value === true ? 'true' : value === false ? 'false' : '';
        } else if (type === 'number' || type === 'integer') {
          field.value = value;
        } else if (type === 'array' || type === 'object' || typeof value === 'object') {
          field.value = stringifyValue(value);
        } else {
          field.value = value;
        }
      });
    } else {
      const textArea = document.getElementById('tool-args-json');
      if (textArea) {
        textArea.value = Object.keys(lastArgs).length ? stringifyValue(lastArgs) : '';
      }
    }
  }

  function renderArgumentFields(context) {
    const container = document.getElementById('tool-modal-form');
    if (!container) return;
    if (context.argSpecs.length) {
      let html = '<p class="modal-note">Provide arguments below. Leave optional fields empty to omit them.</p>';
      context.argSpecs.forEach((spec) => {
        const label = escapeHtml(spec.name);
        const description = spec.description ? `<p class="modal-note">${escapeHtml(spec.description)}</p>` : '';
        html += `<div class="modal-field"><label class="modal-label" for="${spec.inputId}">${label}`;
        if (spec.required) {
          html += '<span class="required">*</span>';
        }
        html += '</label>';

        const type = spec.schema?.type;
        if (spec.enum && spec.enum.length) {
          html += `<select class="modal-select" id="${spec.inputId}" data-arg-name="${escapeAttribute(
            spec.name
          )}" data-arg-type="enum">`;
          if (!spec.required) {
            html += '<option value="">(not set)</option>';
          }
          spec.enum.forEach((value, idx) => {
            const optionLabel = String(value);
            html += `<option value="${idx}">${escapeHtml(optionLabel)}</option>`;
          });
          html += '</select>';
        } else if (type === 'boolean') {
          html += `<select class="modal-select" id="${spec.inputId}" data-arg-name="${escapeAttribute(
            spec.name
          )}" data-arg-type="boolean">`;
          if (!spec.required) {
            html += '<option value="">(not set)</option>';
          }
          html += '<option value="true">true</option>';
          html += '<option value="false">false</option>';
          html += '</select>';
        } else if (type === 'number' || type === 'integer') {
          const step = type === 'integer' ? '1' : 'any';
          html += `<input type="number" class="modal-input" id="${spec.inputId}" data-arg-name="${escapeAttribute(
            spec.name
          )}" data-arg-type="${type}" step="${step}" />`;
        } else if (type === 'array' || type === 'object' || !type) {
          html += `<textarea class="modal-textarea" id="${spec.inputId}" data-arg-name="${escapeAttribute(
            spec.name
          )}" data-arg-type="${type || 'json'}" placeholder="JSON value"></textarea>`;
        } else {
          html += `<input type="text" class="modal-input" id="${spec.inputId}" data-arg-name="${escapeAttribute(
            spec.name
          )}" data-arg-type="${type}" />`;
        }
        html += description;
        html += '</div>';
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = `
        <p class="modal-note">This tool did not declare arguments. Submit to run it with an empty object, or provide custom JSON if needed.</p>
        <textarea class="modal-textarea" id="tool-args-json" placeholder="{ }"></textarea>
      `;
    }
    applyLastArgs(context);
  }

  function setModalResult(payload) {
    const container = document.getElementById('tool-modal-result');
    if (!container) return;
    if (!payload) {
      container.classList.add('hidden');
      container.innerHTML = '';
      return;
    }

    container.classList.remove('hidden');
    if (payload.ok) {
      container.innerHTML =
        '<div class="result-status">Tool executed successfully.</div>' +
        `<pre>${escapeHtml(stringifyValue(payload.output ?? {}))}</pre>`;
    } else {
      const error = payload.error ?? {};
      const lines = [];
      if (error.kind) lines.push(`kind: ${error.kind}`);
      if (error.advice) lines.push(`advice: ${error.advice}`);
      if (error.details !== undefined) lines.push(`details: ${stringifyValue(error.details)}`);
      if (!lines.length) {
        lines.push('Execution failed.');
      }
      container.innerHTML =
        '<div class="result-status">Tool execution failed.</div>' + `<pre>${escapeHtml(lines.join('\n'))}</pre>`;
    }
  }

  function closeToolModal() {
    if (toolModal.classList.contains('hidden')) {
      return;
    }
    activeToolContext = null;
    toolModal.classList.add('hidden');
    modalBackdrop.classList.add('hidden');
    toolModalBody.innerHTML = '';
    toolModalSubmit.disabled = false;
    toolModalSubmit.textContent = 'Run Tool';
    setModalResult(null);
    document.body.style.overflow = previousBodyOverflow;
  }

  function renderToolModalContent(context) {
    toolModalTitle.textContent = `Test ${context.tool.name}`;
    const description = context.tool.description
      ? escapeHtml(context.tool.description)
      : 'No description provided.';
    toolModalBody.innerHTML = `
      <p class="modal-tool-desc">${description}</p>
      <div class="modal-form" id="tool-modal-form"></div>
      <div class="modal-result hidden" id="tool-modal-result"></div>
    `;
    renderArgumentFields(context);
    setModalResult(null);
  }

  function openToolModal(entry, toolName) {
    if (!entry?.result?.tools) {
      alert('No tool information available for this server.');
      return;
    }
    const tool = entry.result.tools.find((t) => t.name === toolName);
    if (!tool) {
      alert(`Tool "${toolName}" not found on this server.`);
      return;
    }
    const argSpecs = extractToolArguments(tool.inputSchema).map((spec) => ({
      ...spec,
      inputId: `tool-arg-${entry.id}-${sanitizeKey(tool.name)}-${sanitizeKey(spec.name)}`
    }));
    const lastArgs = entry.toolTests?.[tool.name]?.lastArgs ?? {};
    activeToolContext = {
      entry,
      tool,
      argSpecs,
      lastArgs: { ...lastArgs }
    };
    renderToolModalContent(activeToolContext);
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modalBackdrop.classList.remove('hidden');
    toolModal.classList.remove('hidden');
  }

  function gatherArgumentsFromModal() {
    if (!activeToolContext) return null;
    const context = activeToolContext;
    if (context.argSpecs.length) {
      const args = {};
      for (const spec of context.argSpecs) {
        const field = document.getElementById(spec.inputId);
        if (!field) continue;
        const rawValue = field.value;
        const trimmed = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
        if (!trimmed && spec.required) {
          alert(`Argument "${spec.name}" is required.`);
          field.focus();
          return null;
        }
        if (!trimmed) {
          continue;
        }
        const type = spec.schema?.type;
        let value;
        try {
          if (spec.enum && spec.enum.length) {
            if (rawValue === '') {
              continue;
            }
            const idx = Number(rawValue);
            if (!Number.isInteger(idx) || idx < 0 || idx >= spec.enum.length) {
              throw new Error('Invalid choice.');
            }
            value = spec.enum[idx];
          } else if (type === 'boolean') {
            if (rawValue === 'true' || rawValue === true) {
              value = true;
            } else if (rawValue === 'false' || rawValue === false) {
              value = false;
            } else {
              throw new Error('Expected boolean value.');
            }
          } else if (type === 'number' || type === 'integer') {
            const num = Number(trimmed);
            if (Number.isNaN(num)) {
              throw new Error('Expected numeric value.');
            }
            value = type === 'integer' ? Math.trunc(num) : num;
          } else if (type === 'array' || type === 'object' || !type) {
            value = JSON.parse(rawValue);
          } else {
            value = rawValue;
          }
        } catch (err) {
          alert(`Unable to parse argument "${spec.name}": ${err.message}`);
          field.focus();
          return null;
        }
        args[spec.name] = value;
      }
      return args;
    }
    const textArea = document.getElementById('tool-args-json');
    const raw = textArea ? textArea.value.trim() : '';
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('JSON must describe an object.');
      }
      return parsed;
    } catch (err) {
      alert(`Unable to parse JSON arguments: ${err.message}`);
      textArea?.focus();
      return null;
    }
  }

  async function submitToolModal() {
    if (!activeToolContext) {
      return;
    }
    const args = gatherArgumentsFromModal();
    if (args === null) {
      return;
    }
    const { entry, tool } = activeToolContext;
    toolModalSubmit.disabled = true;
    toolModalSubmit.textContent = 'Running…';
    const runningContainer = document.getElementById('tool-modal-result');
    if (runningContainer) {
      runningContainer.classList.remove('hidden');
      runningContainer.innerHTML = '<div class="result-status">Running…</div>';
    }

    try {
      const response = await fetch('/api/tools/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: entry.spec, toolName: tool.name, toolArgs: args })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.details || `HTTP ${response.status}`);
      }
      if (!entry.toolTests) {
        entry.toolTests = {};
      }
      if (data.ok) {
        entry.toolTests[tool.name] = { status: 'ok', output: data.output, lastArgs: args };
        activeToolContext.lastArgs = args;
        setModalResult({ ok: true, output: data.output });
      } else {
        entry.toolTests[tool.name] = {
          status: 'error',
          error: data.error ?? { kind: 'tool_error', details: 'Unknown error' },
          lastArgs: args
        };
        activeToolContext.lastArgs = args;
        setModalResult({ ok: false, error: data.error });
      }
      renderServers();
    } catch (err) {
      entry.toolTests = entry.toolTests || {};
      entry.toolTests[tool.name] = {
        status: 'error',
        error: { kind: 'network_error', details: err.message },
        lastArgs: args
      };
      activeToolContext.lastArgs = args;
      setModalResult({ ok: false, error: { kind: 'network_error', details: err.message } });
      renderServers();
    } finally {
      toolModalSubmit.disabled = false;
      toolModalSubmit.textContent = 'Run Tool';
    }
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

  modeSelect.addEventListener('change', updateFormVisibility);
  updateFormVisibility();

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
    const displayName =
      mode === 'http'
        ? spec.url
        : `${spec.command} ${Array.isArray(spec.args) ? spec.args.join(' ') : ''}`.trim();
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

  toolModalSubmit.addEventListener('click', submitToolModal);
  toolModalClose.addEventListener('click', closeToolModal);
  modalBackdrop.addEventListener('click', closeToolModal);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeToolModal();
    }
  });
})();
