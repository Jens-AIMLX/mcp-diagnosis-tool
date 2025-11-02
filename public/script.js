//
// script.js
//
// Client-side logic for the MCP Diagnosis UI. Supports manual diagnoses,
// loading mcp.json files, visualising handshake details, listing tool
// arguments (when declared) and testing tools through a modal interface.

(() => {
  // Application version. Increment the last digit on each fix (start: 1.2.1.2)
  const APP_VERSION = '1.2.1.15';
  try { window.APP_VERSION = APP_VERSION; } catch (_) {}

  const form = document.getElementById('diagnose-form');
  const modeSelect = document.getElementById('mode-select');
  const httpRow = document.getElementById('http-row');
  const stdioRow = document.getElementById('stdio-row');
  const serversList = document.getElementById('servers-list');
  const template = document.getElementById('server-template');

  const loadJsonButton = document.getElementById('load-json-btn');
  const loadTomlButton = document.getElementById('load-toml-btn');
  const addJsonServerButton = document.getElementById('add-json-server-btn');
  const addTomlServerButton = document.getElementById('add-toml-server-btn');
  const saveJsonButton = document.getElementById('save-json-btn');
  const saveTomlButton = document.getElementById('save-toml-btn');
  const configJsonInput = document.getElementById('config-json-input');
  const configTomlInput = document.getElementById('config-toml-input');
  const configFileNameLabel = document.getElementById('config-file-name');

  const modalBackdrop = document.getElementById('modal-backdrop');
  const toolModal = document.getElementById('tool-modal');
  const toolModalBody = document.getElementById('tool-modal-body');
  const toolModalTitle = document.getElementById('tool-modal-title');
  const toolModalSubmit = document.getElementById('tool-modal-submit');
  const toolModalReport = document.getElementById('tool-modal-report');
  const toolModalClose = document.getElementById('tool-modal-close');
  const toolModalSessionInfo = document.getElementById('tool-modal-session-info');
  const toolModalSessionId = document.getElementById('tool-modal-session-id');
  const toolModalSessionCreated = document.getElementById('tool-modal-session-created');
  const toolModalCloseSession = document.getElementById('tool-modal-close-session');
  const toolModalHideSession = document.getElementById('tool-modal-hide-session');

  const configModal = document.getElementById('config-modal');
  const configModalTitle = document.getElementById('config-modal-title');
  const configModalDesc = document.getElementById('config-modal-desc');
  const configModalInput = document.getElementById('config-modal-input');
  const configModalMergeButton = document.getElementById('config-modal-merge');
  const configModalClose = document.getElementById('config-modal-close');

  const outputMaxLinesInput = document.getElementById('output-max-lines');

  const servers = [];
  // Permanent internal server for Playwright codegen recording
  // This server provides a UI to capture/playback a Playwright codegen script
  servers.push({
    id: 'playwright-codegen',
    serverName: 'playwright-codegen',
    displayName: 'Playwright Codegen',
    source: 'internal',
    spec: { mode: 'codegen' },
    status: 'ok',
    isPlaywrightCodegen: true,
    activeSessionId: null,
    sessionCreatedAt: null,
    callHistory: [],
    playwrightUrl: '',
    playwrightRecordingJs: '',
    playwrightRecordingPy: '',
    _playwright_timer: null,
    _playwright_window: null
  });

  // Set version string in UI if present
  try {
    const verEl = document.getElementById('app-version');
    if (verEl) verEl.textContent = 'v ' + APP_VERSION;
  } catch (_) {}
  // --- Server control foldout elements ---
  const serverFoldout = document.getElementById('server-foldout');
  const serverFoldoutToggle = document.getElementById('server-foldout-toggle');
  const serverPortEl = document.getElementById('server-port');
  const serverPidEl = document.getElementById('server-pid');
  const serverStartTimeEl = document.getElementById('server-start-time');
  const serverNextRotationEl = document.getElementById("server-next-rotation");
  const serverLogStateEl = document.getElementById('server-log-state');
  const serverOfflineNote = document.getElementById('server-offline-note');
  
  const btnRestart = document.getElementById('btn-restart-server');
  const btnReleaseLog = document.getElementById('btn-release-log');
  const btnRotateLog = document.getElementById('btn-rotate-log');
  const btnShutdown = document.getElementById('btn-shutdown-server');


  // --- Workflow controls ---
  const workflowIdEl = document.getElementById('workflow-id');
  const workflowCreatedEl = document.getElementById('workflow-created');
  const workflowStateEl = document.getElementById('workflow-state');
  const workflowKeepSessionsOpenCheckbox = document.getElementById('workflow-keep-sessions-open');
  const btnExportWorkflow = document.getElementById('btn-export-workflow');
  const btnCloseAllSessions = document.getElementById('btn-close-all-sessions');
  const btnHideWorkflow = document.getElementById('btn-hide-workflow');
  let workflowSession = null;
  let isClosingSessionProgrammatically = false; // Flag to prevent checkbox change event loop

  // --- Log viewer foldout elements ---
  const logviewFoldout = document.getElementById('logview-foldout');
  const logviewFoldoutToggle = document.getElementById('logview-foldout-toggle');
  const logViewerPre = document.getElementById('log-viewer-pre');
  const btnCopyLogview = document.getElementById('btn-copy-logview');
  const btnRefreshLogview = document.getElementById('btn-refresh-logview');
  const chkLogFollow = document.getElementById('chk-log-follow');
  const chkLogWrap = document.getElementById('chk-log-wrap');
  let logTailTimer = null;

  async function fetchLatestLogText() {
    try {
      const res = await fetch('/api/server/log/download', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  async function fetchLogTail(bytes = 20000) {
    try {
      const res = await fetch(`/api/server/log/tail?bytes=${encodeURIComponent(bytes)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (!data.ok) throw new Error(data?.error?.details || 'tail failed');
      return { ok: true, text: data.content || '' };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  function scheduleTailPoll() {
    if (!chkLogFollow) return;
    clearTimeout(logTailTimer);
    if (chkLogFollow.checked && !logviewFoldout.classList.contains('hidden')) {
      logTailTimer = setTimeout(async () => {
        await refreshLogViewer();
        scheduleTailPoll();
      }, 1500);
    }
  }

  async function refreshLogViewer() {
    if (!logViewerPre) return;
    logViewerPre.textContent = 'Loading log…';
    // Prefer tail endpoint; fallback to full download
    let result = await fetchLogTail(20000);
    if (!result.ok) {
      result = await fetchLatestLogText();
    }
    if (!result.ok) {
      logViewerPre.textContent = `Unable to load log (${result.error || 'unknown error'})`;
      return;
    }
    const text = result.text || '';
    logViewerPre.textContent = text || '(empty)';
    // Apply wrap preference
    if (chkLogWrap) {
      logViewerPre.classList.toggle('wrap', chkLogWrap.checked);
    }
    // Auto-scroll to bottom
    requestAnimationFrame(() => { logViewerPre.scrollTop = logViewerPre.scrollHeight; });
  }

  // Log viewer foldout toggle
  if (logviewFoldoutToggle && logviewFoldout) {
    logviewFoldoutToggle.addEventListener('click', () => {
      // Ensure the Server panel is visible before showing logs
      if (serverFoldout && serverFoldout.classList.contains('hidden')) {
        serverFoldout.classList.remove('hidden');
        if (serverFoldoutToggle) {
          serverFoldoutToggle.classList.add('open');
          serverFoldoutToggle.setAttribute('aria-expanded', 'true');
        }
        void refreshServerControl();
      }

      const nowHidden = logviewFoldout.classList.toggle('hidden');
      const isOpen = !nowHidden;
      logviewFoldoutToggle.classList.toggle('open', isOpen);
      logviewFoldoutToggle.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        void refreshLogViewer();
        scheduleTailPoll();
      } else {
        clearTimeout(logTailTimer);
      }
    });
  }


  // Log viewer options: wrap and follow
  if (chkLogWrap && logViewerPre) {
    chkLogWrap.addEventListener('change', () => {
      logViewerPre.classList.toggle('wrap', chkLogWrap.checked);
    });
  }
  if (chkLogFollow) {
    chkLogFollow.addEventListener('change', () => {
      if (chkLogFollow.checked) scheduleTailPoll(); else clearTimeout(logTailTimer);
    });
  }

  if (btnRefreshLogview) {
    btnRefreshLogview.addEventListener('click', () => void refreshLogViewer());
  }
  if (btnCopyLogview) {
    btnCopyLogview.addEventListener('click', async () => {
      try {
        const text = logViewerPre?.textContent || '';
        await navigator.clipboard.writeText(text);
        btnCopyLogview.textContent = 'Copied';
        setTimeout(() => { btnCopyLogview.textContent = 'Copy'; }, 900);
      } catch (_) {
        alert('Copy failed');
      }
    });
  }

  async function fetchServerInfo() {
    try {
      const res = await fetch('/api/server/info', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      return data;
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  function renderServerControl(info) {
    if (!serverFoldout) return;
    const offline = !info || info.ok === false;
    if (offline) {
      serverPortEl.textContent = '-';
      serverPidEl.textContent = '-';
      if (serverStartTimeEl) serverStartTimeEl.textContent = '-';
      serverLogStateEl.textContent = 'offline';
      serverLogStateEl.className = 'badge';
      serverOfflineNote.classList.remove('hidden');
      btnReleaseLog.disabled = true;
      btnShutdown.disabled = true;
      btnRestart.disabled = true;
      if (serverFoldoutToggle) serverFoldoutToggle.setAttribute('data-status', 'offline');

      return;
    }
    serverOfflineNote.classList.add('hidden');
    serverPortEl.textContent = String(info.port ?? '');
    serverPidEl.textContent = String(info.pid ?? '');
    if (serverStartTimeEl) {
      const startTs = info.startTime || null;
      serverStartTimeEl.textContent = startTs ? new Date(startTs).toLocaleString() : '—';
    }
    if (serverNextRotationEl) {
      const ts = info.nextRotationTs || null;
      serverNextRotationEl.textContent = ts ? new Date(ts).toLocaleString() : '—';
    }
    const detached = !!info.logDetached;
    const redirected = !!info.stdoutRedirected;
    serverLogStateEl.textContent = detached ? 'log detached' : (redirected ? 'logging attached' : 'stdout tty');
    serverLogStateEl.className = 'badge' + (detached ? ' ok' : '');
    btnReleaseLog.disabled = detached; // only once per run
    if (serverFoldoutToggle) serverFoldoutToggle.setAttribute('data-status', 'ok');

    btnShutdown.disabled = false;
    btnRestart.disabled = false;
  }

  async function refreshServerControl() {
    const info = await fetchServerInfo();
    renderServerControl(info);
  }
  // Foldout toggle
  if (serverFoldoutToggle && serverFoldout) {
    serverFoldoutToggle.addEventListener('click', () => {
      const nowHidden = serverFoldout.classList.toggle('hidden');
      const isOpen = !nowHidden;
      serverFoldoutToggle.classList.toggle('open', isOpen);
      serverFoldoutToggle.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        void refreshServerControl();
      }
    });
  }


  // Wire buttons
  if (btnReleaseLog) {
    btnReleaseLog.addEventListener('click', async () => {
      btnReleaseLog.disabled = true;
      try {
        const res = await fetch('/api/server/release-log', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          alert('Failed to release logfile: ' + (data?.error?.details || res.status));
        }
      } catch (err) {
        alert('Failed to release logfile: ' + (err?.message || String(err)));
      } finally {
        await refreshServerControl();
      }
    });
  }
  if (btnShutdown) {
    btnShutdown.addEventListener('click', async () => {
      if (!window.confirm('Shut down the backend server now? The UI will become frontend-only until you restart it.')) return;
      try {
        await fetch('/api/server/shutdown', { method: 'POST' });
      } catch (_) {}
      setTimeout(refreshServerControl, 500);
    });
  }
  if (btnRestart) {
    btnRestart.addEventListener('click', async () => {
      try {
        // Clear all frontend session state BEFORE restarting
        console.log('[DEBUG] Restart: Clearing frontend session state');

        // Clear workflow session
        workflowSession = null;

        // Uncheck "Keep sessions open" checkbox
        if (workflowKeepSessionsOpenCheckbox) {
          isClosingSessionProgrammatically = true; // Prevent checkbox change event
          workflowKeepSessionsOpenCheckbox.checked = false;
        }

        // Clear all server sessions
        servers.forEach(entry => {
          entry.activeSessionId = null;
          entry.sessionReused = false;
          entry.isWorkflowSession = false;
        });

        // Update UI to show sessions as closed
        updateWorkflowPanel();
        renderServers();

        // Reset flag
        isClosingSessionProgrammatically = false;

        console.log('[DEBUG] Restart: Frontend session state cleared, calling backend restart');

        // Now call the backend restart endpoint
        const res = await fetch('/api/server/restart', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          const msg = data?.error?.details || 'Restart is not available unless a supervisor (e.g., nodemon) restarts the process.';
          alert(msg);
        }
      } catch (err) {
        alert('Restart failed: ' + (err?.message || String(err)));
      } finally {
        setTimeout(refreshServerControl, 800);
      }
    });
  }
  if (btnRotateLog) {
    btnRotateLog.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/server/rotate-log', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          alert('Rotate failed: ' + (data?.error?.details || res.status));
        }
      } catch (err) {
        alert('Rotate failed: ' + (err?.message || String(err)));
      } finally {
        await refreshServerControl();
      }
    });
  }

  // Safe stub to avoid early ReferenceError; real definition appears later
  function updateWorkflowPanel() {}
  // Normalize MCP tool output for display/export: parse text content JSON if present
  function normalizeToolOutput(output) {
    try {
      if (output == null) return output;
      const content = output && Array.isArray(output.content) ? output.content : null;
      if (content) {
        const texts = content
          .filter(it => it && it.type === 'text' && typeof it.text === 'string')
          .map(it => it.text);
        if (texts.length) {
          const combined = texts.join('\n');
          try {
            return JSON.parse(combined);
          } catch (_) {
            return { text: combined };
          }
        }
      }
      if (Object.prototype.hasOwnProperty.call(output, 'result')) {
        return output.result;
      }
      return output;
    } catch (_) {
      return output;
    }
  }


	  // Workflow controls wiring
    // Export filename modal elements (created in index.html)
    const exportFilenameModal = document.getElementById('export-filename-modal');
    const exportFilenameInput = document.getElementById('export-filename-input');
    const exportFilenameSave = document.getElementById('export-filename-save');
    const exportFilenameCancel = document.getElementById('export-filename-cancel');
    const exportFilenameClose = document.getElementById('export-filename-close');

    function openExportFilenameModal(suggested, onSave, onCancel) {
      if (!exportFilenameModal) return;
      exportFilenameInput.value = suggested || '';
      exportFilenameModal.classList.remove('hidden');
      modalBackdrop.classList.remove('hidden');

      const cleanup = () => {
        exportFilenameModal.classList.add('hidden');
        modalBackdrop.classList.add('hidden');
        exportFilenameSave.removeEventListener('click', saveHandler);
        exportFilenameCancel.removeEventListener('click', cancelHandler);
        exportFilenameClose.removeEventListener('click', cancelHandler);
      };

      const saveHandler = async (ev) => {
        ev.preventDefault();
        const chosen = (exportFilenameInput.value || '').replace(/\.(yaml|yml|js|py)$/i, '').trim();
        if (!chosen) {
          alert('Please provide a valid base filename.');
          return;
        }
        // call provided onSave; this is executed in direct user gesture (click)
        try {
          await onSave(chosen);
        } finally {
          cleanup();
        }
      };

      const cancelHandler = (ev) => {
        ev && ev.preventDefault();
        cleanup();
        if (typeof onCancel === 'function') onCancel();
      };

      exportFilenameSave.addEventListener('click', saveHandler);
      exportFilenameCancel.addEventListener('click', cancelHandler);
      exportFilenameClose.addEventListener('click', cancelHandler);
      // focus input for quick typing
      setTimeout(() => exportFilenameInput.focus(), 50);
    }

    if (btnExportWorkflow) {
      btnExportWorkflow.addEventListener('click', async () => {
        const wf = workflowSession || getOrStartWorkflow();
        if (!wf.calls || wf.calls.length === 0) {
          alert('No workflow calls recorded yet.');
          return;
        }
        try {
          const artifacts = await generateCombinedWorkflowArtifacts(wf);
          const suggestedBase = artifacts.baseName || 'mcp_session';

          // If folder picking is supported, open modal to collect filename then call picker
          if (window.showDirectoryPicker) {
            openExportFilenameModal(suggestedBase, async (chosenBase) => {
              try {
                showExportStatus('Opening folder picker...');
                const dirHandle = await window.showDirectoryPicker();
                const targets = [
                  { name: `${chosenBase}.yaml`, content: artifacts.yaml },
                  { name: `${chosenBase}.js`, content: artifacts.js },
                  { name: `${chosenBase}.py`, content: artifacts.py }
                ];
                for (const t of targets) {
                  const fh = await dirHandle.getFileHandle(t.name, { create: true });
                  const w = await fh.createWritable();
                  await w.write(t.content);
                  await w.close();
                }
                showExportStatus('Export saved to folder');
              } catch (err) {
                console.error('Folder-picker export failed or was cancelled, falling back:', err);
                showExportStatus('Folder pick cancelled — falling back to file save', 3000);
                // fallback to existing save flow
                await saveArtifactsViaDialog(artifacts);
              }
            }, () => {
              // cancelled modal; do nothing
            });
            return;
          }

          // Fallback: use existing save flow (no folder picker available)
          await saveArtifactsViaDialog(artifacts);
        } catch (e) {
          console.error('Workflow export failed:', e);
          alert(`Workflow export failed: ${e.message || e}`);
        }
      });
    }
	  if (btnCloseAllSessions) {
	    btnCloseAllSessions.addEventListener('click', async () => {
	      console.log('[DEBUG] Close All Sessions button clicked');
	      const activeSessions = servers.filter(s => s.activeSessionId);
	      console.log('[DEBUG] Active sessions count:', activeSessions.length);
	      const hasWorkflowSession = workflowSession !== null;
	      console.log('[DEBUG] Has workflow session:', hasWorkflowSession);

	      if (activeSessions.length === 0 && !hasWorkflowSession) {
	        alert('No active sessions to close.');
	        return;
	      }

	      const sessionCount = activeSessions.length + (hasWorkflowSession ? 1 : 0);
	      const confirmed = confirm(`Close ${sessionCount} active session(s)?`);
	      if (!confirmed) {
	        console.log('[DEBUG] User cancelled confirmation');
	        return;
	      }

	      console.log('[DEBUG] Closing server sessions...');
	      for (const entry of activeSessions) {
	        // Skip workflow placeholder sessions (they don't have real MCP sessions to close)
	        if (entry.activeSessionId && !entry.isWorkflowSession) {
	          await handleCloseServerSession(entry);
	        } else if (entry.isWorkflowSession) {
	          // Just clear the placeholder without calling backend
	          entry.activeSessionId = null;
	          entry.sessionCreatedAt = null;
	          entry.sessionReused = false;
	          entry.isWorkflowSession = false;
	        }
	      }

	      console.log('[DEBUG] Resetting workflow and unchecking checkbox');
	      console.log('[DEBUG] workflowSession before reset:', workflowSession);

	      // Set flag to prevent checkbox change event from re-creating session
	      isClosingSessionProgrammatically = true;

	      // Reset workflow first
	      resetWorkflow();
	      console.log('[DEBUG] workflowSession after reset:', workflowSession);

	      // Uncheck checkbox (change event will be ignored due to flag)
	      if (workflowKeepSessionsOpenCheckbox) {
	        console.log('[DEBUG] Checkbox before:', workflowKeepSessionsOpenCheckbox.checked);
	        workflowKeepSessionsOpenCheckbox.checked = false;
	        console.log('[DEBUG] Checkbox after:', workflowKeepSessionsOpenCheckbox.checked);
	      }

	      renderServers();
	      console.log('[DEBUG] Close All Sessions completed - showing alert');
	      alert('All sessions closed.');
	      console.log('[DEBUG] Alert dismissed');

	      // Clear flag after everything is done
	      isClosingSessionProgrammatically = false;
	    });
	  }
	  if (workflowKeepSessionsOpenCheckbox) {
	    workflowKeepSessionsOpenCheckbox.addEventListener('change', async () => {
	      console.log('[DEBUG] Checkbox change event fired, checked:', workflowKeepSessionsOpenCheckbox.checked);
	      console.log('[DEBUG] isClosingSessionProgrammatically:', isClosingSessionProgrammatically);

	      // Ignore change event if we're programmatically closing the session
	      if (isClosingSessionProgrammatically) {
	        console.log('[DEBUG] Ignoring checkbox change event (programmatic close in progress)');
	        return;
	      }

	      if (workflowKeepSessionsOpenCheckbox.checked) {
	        // Checked - start workflow session
	        console.log('[DEBUG] Starting workflow session');
	        const wf = getOrStartWorkflow();
	        updateWorkflowPanel();

	        // Propagate workflow session info to all servers for immediate display
	        for (const entry of servers) {
	          if (!entry.activeSessionId) {
	            // Mark as workflow session (will be replaced by actual session on first tool call)
	            entry.activeSessionId = wf.id;
	            entry.sessionCreatedAt = wf.createdAt;
	            entry.sessionReused = false;
	            entry.isWorkflowSession = true; // Flag to distinguish from actual MCP sessions
	          }
	        }
          renderServers();
          // Auto-activate Playwright codegen for the internal server when workflow session starts
          (async () => {
            try {
              const codeEntry = servers.find(e => e.isPlaywrightCodegen || (e.serverName && String(e.serverName).toLowerCase().indexOf('playwright') !== -1 && e.source === 'internal'));
              if (codeEntry && !codeEntry._playwright_sessionId) {
                const defaultUrl = window.location.origin || window.location.href;
                const resp = await fetch('/api/playwright/codegen/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: defaultUrl }) });
                const data = await resp.json().catch(() => ({}));
                if (resp.ok && data && data.ok) {
                  codeEntry._playwright_sessionId = data.sessionId;
                  codeEntry._playwright_outPath = data.outPath;
                  codeEntry.playwrightUrl = defaultUrl;
                  renderServers();
                }
              }
            } catch (_) {}
          })();
	      } else {
	        // Unchecked - close all active sessions
	        console.log('[DEBUG] Checkbox unchecked, closing sessions');
	        const activeSessions = servers.filter(s => s.activeSessionId);
	        console.log('[DEBUG] Active sessions in change handler:', activeSessions.length);
	        if (activeSessions.length > 0) {
	          for (const entry of activeSessions) {
	            // Skip workflow placeholder sessions (they don't have real MCP sessions to close)
	            if (entry.activeSessionId && !entry.isWorkflowSession) {
	              await handleCloseServerSession(entry);
	            } else if (entry.isWorkflowSession) {
	              // Just clear the placeholder without calling backend
	              entry.activeSessionId = null;
	              entry.sessionCreatedAt = null;
	              entry.sessionReused = false;
	              entry.isWorkflowSession = false;
	            }
	          }
	        }
	        console.log('[DEBUG] Calling resetWorkflow from change handler');
	        resetWorkflow();
	        renderServers();
	      }
	    });
	  }

	  // Initialize workflow panel on page load
	  if (workflowKeepSessionsOpenCheckbox && workflowKeepSessionsOpenCheckbox.checked) {
	    const wf = getOrStartWorkflow();
	    // Propagate workflow session info to all servers for immediate display
	    for (const entry of servers) {
	      if (!entry.activeSessionId) {
	        entry.activeSessionId = wf.id;
	        entry.sessionCreatedAt = wf.createdAt;
	        entry.sessionReused = false;
	        entry.isWorkflowSession = true;
	      }
	    }
	  }
	  updateWorkflowPanel();



  // Initial paint + periodic update
  refreshServerControl().catch(() => {});
  setInterval(refreshServerControl, 5000);

  let isLoadingConfig = false;
  let currentConfig = null;
  let currentConfigFileName = '';
  let activeToolContext = null;
  let previousBodyOverflow = '';
  let activeConfigFormat = null;
  let activeConfigServerName = null;

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

  function sanitizeFilenameSegment(value) {
    return String(value)
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '');
  }

  function toISOStringWithTZ(date) {
    return date.toISOString();
  }

  function formatTimestampForFilename(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms)) return 'n/a';
    const seconds = ms / 1000;
    if (seconds < 1) {
      return `${ms.toFixed(0)} ms`;
    }
    if (seconds < 60) {
      return `${seconds.toFixed(2)} s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}m ${remaining.toFixed(1)}s`;
  }

  function downloadTextFile(filename, content, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Small in-page transient status to help debug export flow for users who don't open DevTools
  function showExportStatus(message, timeout = 4000) {
    try {
      const id = 'export-status-toast';
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.style.position = 'fixed';
        el.style.right = '16px';
        el.style.bottom = '16px';
        el.style.zIndex = 99999;
        el.style.background = 'rgba(0,0,0,0.8)';
        el.style.color = '#fff';
        el.style.padding = '10px 14px';
        el.style.borderRadius = '6px';
        el.style.fontSize = '13px';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
        document.body.appendChild(el);
      }
      el.textContent = message;
      el.style.opacity = '1';
      if (el._timeout) clearTimeout(el._timeout);
      el._timeout = setTimeout(() => {
        el.style.transition = 'opacity 300ms ease';
        el.style.opacity = '0';
      }, timeout);
    } catch (_) {
      // ignore
    }
  }

  /**
   * Deep parse JSON strings that may contain nested escaped JSON.
   * This handles cases where MCP tools return JSON with escaped newlines like "{\n  \"key\": \"value\"\n}"
   * Only parses strings that look like JSON (start with { or [)
   * @param {any} value - The value to parse
   * @param {boolean} formatted - Whether to format the output (true) or keep it raw (false)
   * @returns {any} - The parsed value
   */
  function deepParseJSON(value, formatted = true) {
    if (value === null || value === undefined) {
      return value;
    }

    // If it's a string, try to parse it as JSON only if it looks like JSON
    if (typeof value === 'string') {
      const trimmed = value.trim();
      // Only try to parse if it starts with { or [ (looks like JSON)
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(value);
          // Recursively parse the result in case it contains more nested JSON strings
          return deepParseJSON(parsed, formatted);
        } catch (_err) {
          // Not valid JSON, return as-is
          return value;
        }
      }
      // Not JSON-like, return as-is
      return value;
    }

    // If it's an array, recursively parse each element
    if (Array.isArray(value)) {
      return value.map(item => deepParseJSON(item, formatted));
    }

    // If it's an object, recursively parse each property
    if (typeof value === 'object') {
      const result = {};
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          result[key] = deepParseJSON(value[key], formatted);
        }
      }
      return result;
    }

    // For other types (number, boolean, etc.), return as-is
    return value;
  }

  function formatAsCodeBlock(value, fallbackLanguage = 'json', formatted = true) {
    let language = fallbackLanguage;
    let text;
    if (value === undefined || value === null) {
      text = '{}';
    } else if (typeof value === 'string') {
      if (formatted) {
        // Formatted mode: try to parse and pretty-print
        try {
          const parsed = deepParseJSON(value, true);
          text = JSON.stringify(parsed, null, 2);
        } catch (_err) {
          language = '';
          text = value;
        }
      } else {
        // Raw mode: just show the string as-is
        language = '';
        text = value;
      }
    } else {
      // Object or other
      if (formatted) {
        // Formatted mode: deep parse and pretty-print
        const toFormat = deepParseJSON(value, true);
        try { text = JSON.stringify(toFormat, null, 2); } catch (_) { text = String(value); }
      } else {
        // Raw mode: stringify WITHOUT deep parsing to preserve nested JSON strings with escape characters
        try { text = JSON.stringify(value, null, 2); } catch (_) { text = String(value); }
      }
    }
    return '```' + language + '\n' + text + '\n```';
  }


	// Normalize MCP tool output for display/export: parse text content JSON if present
	function normalizeToolOutput(output) {
	  try {
	    if (output == null) return output;
	    // Some clients return { content: [{ type: 'text', text: '...json...' }]}.
	    const content = output && Array.isArray(output.content) ? output.content : null;
	    if (content) {
	      const texts = content.filter(it => it && it.type === 'text' && typeof it.text === 'string').map(it => it.text);
	      if (texts.length) {
	        const combined = texts.join('\n');
	        try {
	          return JSON.parse(combined);
	        } catch (_) {
	          return { text: combined };
	        }
	      }
	    }
	    // Occasionally servers put data on result instead of content
	    if (Object.prototype.hasOwnProperty.call(output, 'result')) {
	      return output.result;
	    }
	    return output;
	  } catch (_) {
	    return output;
	  }
	}

	// Workflow session aggregation (cross-server)
	function getOrStartWorkflow() {
	  if (!workflowSession) {
	    workflowSession = {
	      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
	      createdAt: new Date().toISOString(),
	      calls: []
	    };
	  }
	  return workflowSession;
	}
	function resetWorkflow() {
	  console.log('[DEBUG] resetWorkflow called, clearing workflowSession');
	  workflowSession = null;
	  console.log('[DEBUG] workflowSession is now:', workflowSession);
	  updateWorkflowPanel();
	  console.log('[DEBUG] updateWorkflowPanel completed');
	}
	function updateWorkflowPanel() {
	  try {
	    console.log('[DEBUG] updateWorkflowPanel called, workflowSession:', workflowSession);
	    if (!workflowIdEl || !workflowCreatedEl) {
	      console.log('[DEBUG] workflowIdEl or workflowCreatedEl not found');
	      return;
	    }
	    if (!workflowSession) {
	      console.log('[DEBUG] No workflow session, setting UI to Closed');
	      workflowIdEl.textContent = '—';
	      workflowCreatedEl.textContent = '—';
	      if (workflowStateEl) workflowStateEl.textContent = 'Closed';
	      console.log('[DEBUG] UI updated to Closed state');
	      return;
	    }
	    console.log('[DEBUG] Workflow session exists, setting UI to Open');
	    workflowIdEl.textContent = workflowSession.id;
	    workflowCreatedEl.textContent = new Date(workflowSession.createdAt).toLocaleString();
	    if (workflowStateEl) workflowStateEl.textContent = 'Open';
	    console.log('[DEBUG] UI updated to Open state');
	  } catch (err) {
	    console.error('[DEBUG] Error in updateWorkflowPanel:', err);
	  }
	}
	function generateCombinedWorkflowReport(allServers, wf) {
	  const lines = [];
	  const created = wf?.createdAt ? new Date(wf.createdAt).toLocaleString() : 'unknown';
	  const count = wf?.calls?.length || 0;
	  lines.push('# MCP Combined Workflow Report');
	  lines.push('');
	  lines.push(`- Workflow ID: ${wf?.id || 'n/a'}`);
	  lines.push(`- Created: ${created}`);
	  lines.push(`- Total Calls: ${count}`);
	  const serverNames = new Set();
	  (wf?.calls || []).forEach(c => serverNames.add(c.serverName || 'unknown'));
	  lines.push(`- Servers involved: ${Array.from(serverNames).join(', ') || '—'}`);
	  lines.push('');
	  if (!count) {
	    lines.push('_No calls recorded._');
	    return lines.join('\n');
	  }
	  const calls = [...wf.calls].sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
	  lines.push('## Timeline');
	  lines.push('');
	  for (const c of calls) {
	    const start = c.startedAt || 'n/a';
	    const end = c.finishedAt || 'n/a';
	    let dur = 'n/a';
	    try {
	      if (c.startedAt && c.finishedAt) {
	        const d = new Date(c.finishedAt).getTime() - new Date(c.startedAt).getTime();
	        dur = formatDuration(d);
	      }
	    } catch (_) {}
	    const ok = c.success ? 'OK' : 'FAIL';
	    const warm = c.warmup ? ' (warm-up)' : '';
	    lines.push(`- [${ok}] ${start} → ${end} • ${c.serverName || 'server'} • ${c.toolName}${warm}`);
	    const argsSafe = c.args && Object.keys(c.args).length ? JSON.stringify(c.args, null, 2) : '{}';
	    lines.push('  \nArgs:');
	    lines.push('');
	    lines.push('```json');
	    lines.push(argsSafe);
	    lines.push('```');
	    lines.push('');
	  }
	  return lines.join('\n');
	}


  function updateSaveButtons() {
    const disabled = !currentConfig || isLoadingConfig;
    saveJsonButton.disabled = disabled;
    saveTomlButton.disabled = disabled;
  }

  function setLoadingConfig(state) {
    isLoadingConfig = state;
    loadJsonButton.disabled = state;
    loadTomlButton.disabled = state;
    if (configModal.classList.contains('hidden')) {
      addJsonServerButton.disabled = state;
      addTomlServerButton.disabled = state;
    } else {
      addJsonServerButton.disabled = true;
      addTomlServerButton.disabled = true;
    }
    updateSaveButtons();
  }

  function describeConfigStatus(fileName, format, count) {
    const parts = [];
    if (fileName) {
      parts.push(fileName);
    } else {
      parts.push('Loaded config');
    }
    if (typeof count === 'number') {
      parts.push(`${count} server${count === 1 ? '' : 's'}`);
    }
    if (format) {
      parts.push(format.toUpperCase());
    }
    return parts.join(' • ');
  }

  function refreshConfigStatusLabel() {
    if (currentConfig) {
      const count = Array.isArray(currentConfig.servers) ? currentConfig.servers.length : 0;
      configFileNameLabel.textContent = describeConfigStatus(currentConfigFileName, currentConfig.format, count);
    } else {
      configFileNameLabel.textContent = 'No file selected';
    }
  }

  function setCurrentConfig(configObj, fileName) {
    currentConfig = configObj ? JSON.parse(JSON.stringify(configObj)) : null;
    if (fileName !== undefined) {
      currentConfigFileName = fileName || '';
    }
    updateSaveButtons();
    refreshConfigStatusLabel();
  }

  function clearCurrentConfigStatus(message = 'No file selected') {
    currentConfig = null;
    currentConfigFileName = '';
    configFileNameLabel.textContent = message;
    updateSaveButtons();
  }

  function replaceConfigServers(configObj, serverResults, fileName, expansionOverride) {
    const label = fileName ?? currentConfigFileName ?? '';
    setCurrentConfig(configObj, label);
    const expansionMap = new Map();
    servers.forEach((srv) => {
      if (srv.source === 'config' && srv.serverName) {
        expansionMap.set(srv.serverName, Boolean(srv._expanded));
      }
    });
    if (expansionOverride) {
      expansionOverride.forEach((value, key) => {
        expansionMap.set(key, Boolean(value));
      });
    }
    for (let i = servers.length - 1; i >= 0; i -= 1) {
      if (servers[i].source === 'config') {
        servers.splice(i, 1);
      }
    }
    const baseId = Date.now();
    (serverResults || []).forEach((item, index) => {
      const spec = item.spec ? JSON.parse(JSON.stringify(item.spec)) : {};
      const result = item.result ? JSON.parse(JSON.stringify(item.result)) : {};
      const status = result.ok ? 'ok' : 'error';
      const handshake = result.handshake ?? null;
      const displayName = computeDisplayName(spec, item.name);
      const configSnippets = item.configSnippets || {};
      const defaultFormat = configSnippets.json ? 'json' : configSnippets.toml ? 'toml' : null;
      const expanded = expansionMap.has(item.name) ? expansionMap.get(item.name) : false;
      servers.push({
        id: baseId + index,
        source: 'config',
        serverName: item.name,
        name: item.name,
        displayName,
        spec,
        status,
        result: result.ok ? result : null,
        error: result.ok ? null : result.error,
        handshake,
        toolTests: {},
        callHistory: [],
        configSnippets,
        configSnippetFormat: defaultFormat,
        configSnippetEditing: false,
        configSnippetValue: configSnippets[defaultFormat] ?? '',
        configSnippet: item.configSnippet ?? null,
        configFormat: item.configFormat ?? configObj?.format ?? null,
        configEntry: item.configEntry ? JSON.parse(JSON.stringify(item.configEntry)) : null,
        _expanded: expanded
      });
    });

    // Propagate workflow session to newly loaded servers if workflow is active
    if (workflowSession && workflowKeepSessionsOpenCheckbox && workflowKeepSessionsOpenCheckbox.checked) {
      servers.forEach((entry) => {
        if (entry.source === 'config' && !entry.activeSessionId) {
          entry.activeSessionId = workflowSession.id;
          entry.sessionCreatedAt = workflowSession.createdAt;
          entry.sessionReused = false;
          entry.isWorkflowSession = true;
        }
      });
    }

    refreshConfigStatusLabel();
    renderServers();
  }

  function computeDisplayName(spec, fallbackName) {
    if (spec.mode === 'http') {
      return (spec.url || fallbackName || '').trim() || fallbackName || 'HTTP server';
    }
    const command = spec.command || fallbackName || '';
    const args = Array.isArray(spec.args) && spec.args.length ? ` ${spec.args.join(' ')}` : '';
    const combined = `${command}${args}`.trim();
    return combined || fallbackName || 'STDIO server';
  }

  function buildConfigSnippet(entry) {
    const snippets = entry.configSnippets || {};
    const formats = [];
    if (snippets.json) formats.push('json');
    if (snippets.toml) formats.push('toml');
    if (!formats.length) {
      return '';
    }
    if (!entry.configSnippetFormat || !formats.includes(entry.configSnippetFormat)) {
      entry.configSnippetFormat = formats[0];
    }
    const format = entry.configSnippetFormat;
    const editing = Boolean(entry.configSnippetEditing);
    const currentSnippet = editing
      ? entry.configSnippetValue ?? snippets[format] ?? ''
      : snippets[format] ?? '';

    const formatButtons = formats
      .map((fmt) => {
        const isActive = fmt === format;
        const disabled = editing || !snippets[fmt];
        return `<button type="button" class="config-button config-format-button${isActive ? ' active' : ''}" data-entry-id="${entry.id}" data-config-action="format" data-config-format="${fmt}"${disabled ? ' disabled' : ''}>${fmt.toUpperCase()}</button>`;
      })
      .join('');

    const editButtonLabel = editing ? 'Update' : 'Edit';
    const editAction = editing ? 'update' : 'edit';
    const editButton = `<button type="button" class="config-button" data-entry-id="${entry.id}" data-config-action="${editAction}">${editButtonLabel}</button>`;
    const cancelButton = editing
      ? `<button type="button" class="config-button secondary" data-entry-id="${entry.id}" data-config-action="cancel">Cancel</button>`
      : '';
    const removeButton = `<button type="button" class="config-button danger" data-entry-id="${entry.id}" data-config-action="remove">Remove</button>`;

    const body = editing
      ? `<textarea class="config-snippet-textarea" data-entry-id="${entry.id}" spellcheck="false">${escapeHtml(currentSnippet)}</textarea>`
      : `<pre>${escapeHtml(currentSnippet)}</pre>`;

    return `
      <div class="config-snippet">
        <div class="config-snippet-header">
          <strong>Config Snippet</strong>
          <div class="config-snippet-actions">
            <div class="config-format-group">${formatButtons}</div>
            ${editButton}
            ${cancelButton}
            ${removeButton}
          </div>
        </div>
        <div class="config-snippet-body">${body}</div>
      </div>
    `;
  }

  function generateToolReport(reportData, formatted = true) {
    const {
      serverName,
      toolName,
      spec,
      args,
      startedAt,
      finishedAt,
      durationMs,
      success,
      response,
      rawResponse,
      error,
      handshake
    } = reportData;
    // Use rawResponse in raw mode if available, otherwise fall back to response
    const outputToDisplay = (!formatted && rawResponse) ? rawResponse : response;
    const lines = [];
    lines.push('# MCP Tool Call Report');
    lines.push('');
    lines.push(`- **Server Name:** ${serverName}`);
    lines.push(`- **Tool:** ${toolName}`);
    lines.push(`- **Mode:** ${spec?.mode ?? 'unknown'}`);
    lines.push(`- **Call Started:** ${startedAt}`);
    lines.push(`- **Response Received:** ${finishedAt}`);
    const hasDuration = typeof durationMs === 'number' && Number.isFinite(durationMs);
    const durationDisplay = hasDuration ? formatDuration(durationMs) : 'n/a';
    const durationExact = hasDuration ? `${durationMs.toFixed(0)} ms` : 'n/a';
    lines.push(`- **Duration:** ${durationDisplay}${hasDuration ? ` (${durationExact})` : ''}`);
    lines.push(`- **Result:** ${success ? 'Success' : 'Failure'}`);
    lines.push('');
    if (handshake) {
      lines.push('## Handshake');
      const summary = {
        transport: handshake.transport ?? null,
        protocolVersion: handshake.protocolVersion ?? null,
        serverInfo: handshake.serverInfo ?? null,
        capabilities: handshake.capabilities ?? null,
        instructions: handshake.instructions ?? null
      };
      lines.push(formatAsCodeBlock(summary, 'json', formatted));
      lines.push('');
    }
    lines.push('## Server Configuration');
    lines.push(formatAsCodeBlock(spec, 'json', formatted));
    lines.push('');
    lines.push('## Tool Arguments');
    lines.push(formatAsCodeBlock(args ?? {}, 'json', formatted));
    lines.push('');
    lines.push('## Output');
    if (success) {
      lines.push(formatAsCodeBlock(outputToDisplay ?? {}, 'json', formatted));
    } else {
      const errorBlock = {
        kind: error?.kind ?? 'unknown',
        advice: error?.advice ?? null,
        details: error?.details ?? error ?? null
      };
      lines.push(formatAsCodeBlock(errorBlock, 'json', formatted));
    }
    return lines.join('\n');
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

  function stringifyValue(value, formatted = true) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') {
      return value;
    }

    // For formatted mode, check if this is a Playwright-style response with a text field
    if (formatted && typeof value === 'object') {
      // Check if it's the normalized output format: { text: "..." }
      if (value.text && typeof value.text === 'string' && Object.keys(value).length === 1) {
        // Return just the text content without JSON wrapping
        return value.text;
      }
    }

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

  function buildHandshakeBlock(handshake, entry) {
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
    // Playwright codegen controls (special internal server)
  if (entry && entry.isPlaywrightCodegen) {
      html += '<div class="detail-block playwright-codegen-block">';
      html += '<strong>Playwright Codegen</strong>';
      html += '<div style="margin-top:8px; display:flex; gap:8px; align-items:center;">';
      html += `<input type="text" class="playwright-url-input" placeholder="Enter start URL" value="${escapeHtml(entry.playwrightUrl || '')}" style="flex:1; padding:6px;" />`;
      html += `<button type="button" class="playwright-start" data-entry-id="${escapeAttribute(entry.id)}">Start</button>`;
      html += `<button type="button" class="playwright-pause" data-entry-id="${escapeAttribute(entry.id)}">Pause</button>`;
      html += `<button type="button" class="playwright-stop" data-entry-id="${escapeAttribute(entry.id)}">Stop</button>`;
      html += '</div>';
      html += '<div style="margin-top:8px;">';
      html += '<label style="font-weight:600;">Recorded script (JS)</label>';
      html += `<textarea class="playwright-recording-text" style="width:100%;height:140px;">${escapeHtml(entry.playwrightRecordingJs || '')}</textarea>`;
      html += '<div style="display:flex; gap:8px; margin-top:6px;">';
      html += `<button type="button" class="playwright-save-script" data-entry-id="${escapeAttribute(entry.id)}">Save script</button>`;
      html += `<button type="button" class="playwright-clear-script" data-entry-id="${escapeAttribute(entry.id)}">Clear</button>`;
      html += '</div>';
      html += '</div>';
      html += '</div>';
    }

    return html;
  }

  function buildSessionControlsBlock(entry) {
    const serverId = sanitizeKey(entry.id || entry.serverName || 'unknown');
    const hasSession = entry.activeSessionId;
    const sessionId = hasSession ? escapeHtml(entry.activeSessionId) : '';
    const closeButtonDisabled = (!hasSession || entry.sessionHidden) ? ' disabled' : '';
    const hideButtonDisabled = (!hasSession || entry.sessionHidden) ? ' disabled' : '';

    let html = '<div class="detail-block session-controls-block">';

    // Session status and controls (checkbox moved to app-level workflow section)
    if (hasSession || entry.sessionHidden) {
      html += '<div class="session-controls-row">';
      html += `<strong>Session Status</strong>`;
      const hiddenBadge = entry.sessionHidden ? ' <span class="session-hidden-badge">(hidden)</span>' : '';
      html += hiddenBadge;
      html += '</div>';

      const displayId = hasSession ? sessionId : escapeHtml(entry.hiddenSessionId || '-')
      const createdRaw = hasSession ? entry.sessionCreatedAt : entry.hiddenSessionCreatedAt;
      const createdText = createdRaw ? new Date(createdRaw).toLocaleString() : 'Unknown';
      const stateText = entry.sessionHidden ? 'Hidden' : (hasSession ? 'Open' : 'Closed');
      const sessionTypeBadge = entry.isWorkflowSession ? ' <span class="session-type-badge">(workflow)</span>' : '';
      html += '<div class="session-status active">';
      html += '<div class="session-info-item"><span class="session-info-key">ID:</span> '
           + `<span class="session-status-id">${displayId}${sessionTypeBadge}</span></div>`;
      html += '<div class="session-info-item"><span class="session-info-key">Created:</span> '
           + `<span class="session-info-created">${escapeHtml(createdText)}</span></div>`;
      html += '<div class="session-info-item"><span class="session-info-key">State:</span> '
           + `<span class="session-info-state">${stateText}</span></div>`;
      html += '</div>';

      html += '<div class="session-controls-row">';
      html += `<button type="button" class="session-hide-button secondary" data-server-id="${escapeAttribute(serverId)}"${hideButtonDisabled}>Hide session</button>`;
      html += `<button type="button" class="session-close-button secondary" data-server-id="${escapeAttribute(serverId)}"${closeButtonDisabled}>Close session</button>`;
      html += `<button type="button" class="session-export-button" data-server-id="${escapeAttribute(serverId)}">Export this server's calls</button>`;
      html += '</div>';
    } else {
      html += '<div class="session-controls-row">';
      html += '<em>No active session for this server. Use the "Keep sessions open" checkbox in the Workflow section above to enable multi-step workflows.</em>';
      html += '</div>';
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
      html += ` <button class="tool-test-button" type="button" data-tool="${escapeAttribute(
        tool.name
      )}" data-entry-id="${entry.id}">Test</button>`;
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

    card.dataset.entryId = entry.id;

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
      if (entry.source === 'config') {
        detailSections.push(buildConfigSnippet(entry));
      }
      if (entry.handshake) {
        detailSections.push(buildHandshakeBlock(entry.handshake, entry));
      }
      // Add session controls after handshake
      detailSections.push(buildSessionControlsBlock(entry));

      if (entry.status === 'ok') {
        detailSections.push(buildToolsBlock(entry));
        detailSections.push(buildPromptsBlock(entry));
        detailSections.push(buildResourcesBlock(entry));
      } else if (entry.status === 'error') {
        detailSections.push(buildErrorBlock(entry));
      }

      detailsDiv.innerHTML = detailSections.filter(Boolean).join('');

      const shouldExpand = Boolean(entry._expanded);
      toggleBtn.classList.toggle('open', shouldExpand);
      detailsDiv.classList.toggle('hidden', !shouldExpand);

      toggleBtn.addEventListener('click', () => {
        const isOpen = toggleBtn.classList.toggle('open');
        detailsDiv.classList.toggle('hidden', !isOpen);
        entry._expanded = isOpen;
      });

      serversList.appendChild(card);
    });
  }

  // Note: Session checkbox is now at app-level (workflow section), not per-server

  serversList.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) {
      return;
    }
    if (button.disabled) {
      return;
    }
    // Determine entry by dataset attributes (support string ids for internal servers)
    const rawEntryKey = button.dataset.entryId || button.dataset.serverId || button.dataset.entryId;
    let entry = null;
    if (rawEntryKey !== undefined) {
      // Try numeric id first
      const possibleNum = Number(rawEntryKey);
      if (Number.isFinite(possibleNum)) entry = servers.find((item) => item.id === possibleNum);
      if (!entry) entry = servers.find((item) => String(item.id) === String(rawEntryKey) || item.serverName === rawEntryKey || item.displayName === rawEntryKey || sanitizeKey(item.id || item.serverName || 'unknown') === rawEntryKey);
    } else {
      entry = null;
    }

    // Playwright codegen control buttons
    if (button.classList.contains('playwright-start') || button.classList.contains('playwright-pause') || button.classList.contains('playwright-stop') || button.classList.contains('playwright-save-script') || button.classList.contains('playwright-clear-script')) {
      const eid = rawEntryKey;
      const codeEntry = servers.find((s) => String(s.id) === String(eid) || s.serverName === eid || s.displayName === eid);
      if (!codeEntry) {
        alert('Unable to locate Playwright Codegen server entry.');
        return;
      }
      // Start: open window to URL and begin simple navigation recording (polling)
      if (button.classList.contains('playwright-start')) {
        const row = button.closest('.playwright-codegen-block');
        const input = row ? row.querySelector('.playwright-url-input') : null;
        const url = input ? input.value.trim() : (codeEntry.playwrightUrl || '');
        if (!url) { alert('Please enter a start URL first.'); return; }
        codeEntry.playwrightUrl = url;
        try {
          // Request server to start Playwright codegen and return session id + outPath
          const resp = await fetch('/api/playwright/codegen/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || !data.ok) {
            throw new Error(data?.error?.details || 'Failed to start server-side codegen');
          }
          codeEntry._playwright_sessionId = data.sessionId;
          codeEntry._playwright_outPath = data.outPath;
          codeEntry.playwrightRecordingJs = '';
          renderServers();
        } catch (e) {
          alert('Failed to start Playwright codegen: ' + (e.message || e));
        }
        return;
      }
      // Pause: stop polling but keep window
      if (button.classList.contains('playwright-pause')) {
        // Pause behaves same as stop for server codegen: stop process but keep recorded file
        if (!codeEntry._playwright_sessionId) { alert('No active codegen session to pause'); return; }
        try {
          const resp = await fetch('/api/playwright/codegen/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: codeEntry._playwright_sessionId }) });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || !data.ok) throw new Error(data?.error?.details || 'Failed to stop codegen');
          codeEntry.playwrightRecordingJs = data.content || '';
          // keep outPath available; clear session id to indicate stopped
          codeEntry._playwright_outPath = data.outPath;
          codeEntry._playwright_sessionId = null;
          renderServers();
        } catch (e) {
          alert('Failed to pause Playwright codegen: ' + (e.message || e));
        }
        return;
      }
      // Stop: same as pause but mark as stopped
      if (button.classList.contains('playwright-stop')) {
        if (!codeEntry._playwright_sessionId) { alert('No active codegen session to stop'); return; }
        try {
          const resp = await fetch('/api/playwright/codegen/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: codeEntry._playwright_sessionId }) });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || !data.ok) throw new Error(data?.error?.details || 'Failed to stop codegen');
          codeEntry.playwrightRecordingJs = data.content || '';
          codeEntry._playwright_outPath = data.outPath;
          codeEntry._playwright_sessionId = null;
          renderServers();
        } catch (e) {
          alert('Failed to stop Playwright codegen: ' + (e.message || e));
        }
        return;
      }
      // Save script: read textarea and store as recording
      if (button.classList.contains('playwright-save-script')) {
        const row = button.closest('.playwright-codegen-block');
        const ta = row ? row.querySelector('.playwright-recording-text') : null;
        if (ta) {
          codeEntry.playwrightRecordingJs = ta.value || '';
          alert('Playwright script saved to entry. It will be included in exported artifacts.');
          renderServers();
        }
        return;
      }
      // Clear script
      if (button.classList.contains('playwright-clear-script')) {
        codeEntry.playwrightRecordingJs = '';
        renderServers();
        return;
      }
    }

    if (button.classList.contains('tool-test-button')) {
      if (!entry) {
        alert('Unable to locate server entry for this tool.');
        return;
      }
      const toolName = button.dataset.tool;
      if (!toolName) {
        alert('Unable to determine tool name for this button.');
        return;
      }
      openToolModal(entry, toolName);
      return;
    }

    // Handle session close button
    if (button.classList.contains('session-close-button')) {
      const serverId = button.dataset.serverId;
      const entry = servers.find((item) => sanitizeKey(item.id || item.serverName || 'unknown') === serverId);
      if (entry) {
        void handleCloseServerSession(entry);
      }
      return;
    }

    // Handle session hide button (UI-only, does not affect reuse)
    if (button.classList.contains('session-hide-button')) {
      const serverId = button.dataset.serverId;
      const entry = servers.find((item) => sanitizeKey(item.id || item.serverName || 'unknown') === serverId);
      if (entry) {
        if (!entry.sessionHidden && entry.activeSessionId) {
          // Close current session (hide) but remember id and timestamp for display
          const prevId = entry.activeSessionId;
          const prevCreated = entry.sessionCreatedAt;
          try {
            const resp = await fetch('/api/sessions/close', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId: prevId })
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || data.ok === false) {
              throw new Error(data?.error || 'Failed to hide (close) session');
            }
          } catch (err) {
            alert(`Failed to hide session: ${err.message}`);
            return;
          }
          entry.activeSessionId = null;
          entry.sessionCreatedAt = null;
          entry.sessionReused = false;
          entry.isWorkflowSession = false;
          entry.sessionHidden = true;
          entry.hiddenSessionId = prevId;
          entry.hiddenSessionCreatedAt = prevCreated;
        }
        // No explicit unhide here; user unhides via re-checking the keep-open checkbox
        // Disable the button when hidden; rerender reflects that
        renderServers();
        if (activeToolContext && activeToolContext.entry === entry) {
          updateModalSessionInfo(entry);
        }
      }
      return;
    }
    // Handle session export button
    if (button.classList.contains('session-export-button')) {
      const serverId = button.dataset.serverId;
      const entry = servers.find((item) => sanitizeKey(item.id || item.serverName || 'unknown') === serverId);
      if (!entry) {
        alert('Unable to locate server entry for export.');
        return;
      }
      try {
        await exportSessionForEntry(entry);
      } catch (e) {
        console.error('Export failed:', e);
        alert(`Export failed: ${e.message || e}`);
      }
      return;
    }


    const action = button.dataset.configAction;
    if (!action || !entry) {
      return;
    }
    switch (action) {
      case 'format': {
        const newFormat = button.dataset.configFormat;
        if (!newFormat || newFormat === entry.configSnippetFormat) {
          return;
        }
        entry.configSnippetFormat = newFormat;
        entry.configSnippetEditing = false;
        entry.configSnippetValue = entry.configSnippets?.[newFormat] ?? '';
        entry._expanded = entry._expanded !== false;
        renderServers();
        break;
      }
      case 'edit': {
        entry.configSnippetEditing = true;
        entry.configSnippetValue = entry.configSnippets?.[entry.configSnippetFormat] ?? '';
        entry._expanded = true;
        renderServers();
        break;
      }
      case 'cancel': {
        entry.configSnippetEditing = false;
        entry.configSnippetValue = entry.configSnippets?.[entry.configSnippetFormat] ?? '';
        renderServers();
        break;
      }
      case 'update': {
        if (!currentConfig) {
          alert('Load a configuration before editing servers.');
          return;
        }
        if (!entry.configSnippetFormat) {
          alert('No format selected for this server snippet.');
          return;
        }
        const snippetContainer = button.closest('.config-snippet');
        const textarea = snippetContainer ? snippetContainer.querySelector('.config-snippet-textarea') : null;
        const newValue = textarea ? textarea.value : entry.configSnippets?.[entry.configSnippetFormat] ?? '';
        entry.configSnippetValue = newValue;
        entry.configSnippetEditing = true;
        entry._expanded = true;
        void saveServerSnippet(entry, entry.configSnippetFormat, newValue);
        break;
      }
      case 'remove': {
        void handleRemoveServer(entry);
        break;
      }
      default:
        break;
    }
  });

  async function handleRemoveServer(entry) {
    if (!currentConfig) {
      alert('Load a configuration before removing servers.');
      return;
    }
    const name = entry.serverName || entry.name || '(unnamed)';
    const confirmed = window.confirm(`Remove server "${name}" from the configuration?`);
    if (!confirmed) {
      return;
    }
    try {
      setLoadingConfig(true);
      configFileNameLabel.textContent = `Removing ${name}…`;
      const response = await fetch('/api/config/remove-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseConfig: currentConfig, serverName: name })
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        const message = data?.error?.details || `Unable to remove server (HTTP ${response.status})`;
        throw new Error(message);
      }
      const label = currentConfigFileName || (currentConfig?.format === 'toml' ? 'config.toml' : 'mcp.json');
      replaceConfigServers(data.config, data.servers || [], label);
    } catch (err) {
      alert(`Failed to remove server: ${err.message}`);
      refreshConfigStatusLabel();
    } finally {
      setLoadingConfig(false);
    }
  }

  async function saveServerSnippet(entry, format, snippet) {
    const trimmed = snippet.trim();
    if (!trimmed) {
      alert('Configuration snippet cannot be empty.');
      return;
    }
    const name = entry.serverName || entry.name || '(unnamed)';
    try {
      setLoadingConfig(true);
      configFileNameLabel.textContent = `Updating ${name}…`;
      const response = await fetch('/api/config/add-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseConfig: currentConfig, additionText: trimmed, additionFormat: format })
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        const message = data?.error?.details || `Unable to update server (HTTP ${response.status})`;
        throw new Error(message);
      }
      const label = currentConfigFileName || (format === 'toml' ? 'config.toml' : 'mcp.json');
      replaceConfigServers(data.config, data.servers || [], label, new Map([[name, true]]));
      const updatedEntry = servers.find((item) => item.serverName === name && item.source === 'config');
      if (updatedEntry) {
        updatedEntry.configSnippetEditing = false;
        updatedEntry.configSnippetFormat = format;
        updatedEntry.configSnippetValue = updatedEntry.configSnippets?.[format] ?? snippet;
        updatedEntry._expanded = true;
      }
      renderServers();
    } catch (err) {
      alert(`Failed to update server: ${err.message}`);
      const updatedEntry = servers.find((item) => item.serverName === name && item.source === 'config');
      if (updatedEntry) {
        updatedEntry.configSnippetEditing = true;
        updatedEntry.configSnippetValue = snippet;
        updatedEntry._expanded = true;
        renderServers();
      }
      refreshConfigStatusLabel();
    } finally {
      setLoadingConfig(false);
    }
  }
  // Record a tool call into session history (per-server) and into the global workflow
  function appendCallHistory(entry, rec) {
    try {
      if (!entry.callHistory) entry.callHistory = [];
      const copy = {
        toolName: rec.toolName,
        args: rec.args ? JSON.parse(JSON.stringify(rec.args)) : {},
        keepSessionOpen: !!rec.keepSessionOpen,
        startedAt: rec.startedAt || new Date().toISOString(),
        finishedAt: rec.finishedAt || null,
        success: !!rec.success,
        warmup: !!rec.warmup
      };
      entry.callHistory.push(copy);
      // Also append to global workflow aggregator
      const wf = getOrStartWorkflow();
      wf.calls.push({
        serverName: entry.serverName || entry.displayName || 'unknown',
        serverId: entry.id,
        toolName: copy.toolName,
        args: copy.args,
        keepSessionOpen: copy.keepSessionOpen,
        startedAt: copy.startedAt,
        finishedAt: copy.finishedAt,
        success: copy.success,
        warmup: copy.warmup
      });
      updateWorkflowPanel();
    } catch (_) {
      // best-effort; ignore serialization errors
    }
  }

  // YAML builder that uses single quotes for strings
  function yamlEscape(str) {
    return String(str).replace(/'/g, "''");
  }
  function yamlScalar(v) {
    if (typeof v === 'string') return `'${yamlEscape(v)}'`;
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number' || typeof v === 'bigint') return String(v);
    return `'${yamlEscape(String(v))}'`;
  }
  function toSingleQuotedYAML(value, indent = 0) {
    const pad = '  '.repeat(indent);
    if (Array.isArray(value)) {
      if (value.length === 0) return pad + '[]';
      return value.map(item => {
        if (item && typeof item === 'object') {
          return `${pad}-\n${toSingleQuotedYAML(item, indent + 1)}`;
        } else {
          return `${pad}- ${yamlScalar(item)}`;
        }
      }).join('\n');
    }
    if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) return pad + '{}';
      return keys.map(k => {
        const v = value[k];
        const key = /^[A-Za-z0-9_]+$/.test(k) ? k : `'${yamlEscape(k)}'`;
        if (v && typeof v === 'object') {
          // Non-empty object or array
          if (Array.isArray(v) && v.length === 0) return `${pad}${key}: []`;
          if (!Array.isArray(v) && Object.keys(v).length === 0) return `${pad}${key}: {}`;
          return `${pad}${key}:\n${toSingleQuotedYAML(v, indent + 1)}`;
        } else {
          return `${pad}${key}: ${yamlScalar(v)}`;
        }
      }).join('\n');
    }
    return pad + yamlScalar(value);
  }

  async function generateWorkflowArtifacts(entry) {
    // Prefer a meaningful spec from several possible sources: entry.spec, entry.configEntry,
    // entry.configSnippetValue / entry.configSnippets, or currentConfig. This prevents
    // exporting an empty `{}` when the UI shows a config snippet for the server.
    async function getExportableSpec(e) {
      try {
        // 1) If entry.spec exists and has useful keys, use it
        if (e && e.spec && typeof e.spec === 'object' && Object.keys(e.spec).length) {
          return JSON.parse(JSON.stringify(e.spec));
        }

        // 2) If entry.configEntry is present (parsed config), prefer its spec or shape
        if (e && e.configEntry && typeof e.configEntry === 'object') {
          if (e.configEntry.spec && typeof e.configEntry.spec === 'object' && Object.keys(e.configEntry.spec).length) {
            return JSON.parse(JSON.stringify(e.configEntry.spec));
          }
          // sometimes the config entry itself describes the server (has url/command/mode)
          const ce = e.configEntry;
          if (ce.url || ce.command || ce.mode) {
            return JSON.parse(JSON.stringify(ce));
          }
        }

        // 3) If there's a config snippet value (string), try to parse JSON from it
        const snippet = (e && (e.configSnippetValue || e.configSnippet)) || '';
        if (typeof snippet === 'string' && snippet.trim()) {
          try {
            const parsed = JSON.parse(snippet);
            if (parsed && typeof parsed === 'object') {
              if (parsed.spec && typeof parsed.spec === 'object' && Object.keys(parsed.spec).length) {
                return parsed.spec;
              }
              // If snippet directly contains server keys (url/command/mode), use it
              if (parsed.url || parsed.command || parsed.mode) {
                return parsed;
              }
              // If snippet is an array or object where a server entry is nested, attempt to find a matching entry name
            }
          } catch (_) {
            // not JSON; try server-side parse (supports TOML and other formats)
            try {
              const resp = await fetch('/api/export/parse-snippet', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: snippet })
              });
              const data = await resp.json().catch(() => ({}));
              if (resp.ok && data && data.parsed) {
                const parsed = data.parsed;
                if (parsed && typeof parsed === 'object') {
                  if (parsed.spec && typeof parsed.spec === 'object' && Object.keys(parsed.spec).length) return parsed.spec;
                  if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
                    // try to find a server in parsed.mcpServers matching entry.serverName
                    const key = e.serverName || e.name;
                    if (key && parsed.mcpServers[key]) return parsed.mcpServers[key];
                  }
                  // direct server object
                  if (parsed.url || parsed.command || parsed.mode) return parsed;
                }
              }
            } catch (parseErr) {
              // ignore
            }
          }
        }

        // 4) Look inside currentConfig (loaded full config) for a matching server
        if (typeof currentConfig === 'object' && currentConfig) {
          // arrays of servers
          if (Array.isArray(currentConfig.servers)) {
            const found = currentConfig.servers.find((s) => (s.name === (e.serverName || e.name) || s.serverName === (e.serverName || e.name)));
            if (found) {
              if (found.spec && typeof found.spec === 'object' && Object.keys(found.spec).length) return JSON.parse(JSON.stringify(found.spec));
              if (found.url || found.command || found.mode) return JSON.parse(JSON.stringify(found));
            }
          }
          // map-style servers under mcpServers
          if (currentConfig.mcpServers && typeof currentConfig.mcpServers === 'object') {
            const key = e.serverName || e.name;
            if (key && currentConfig.mcpServers[key]) {
              const found = currentConfig.mcpServers[key];
              if (found.spec && typeof found.spec === 'object' && Object.keys(found.spec).length) return JSON.parse(JSON.stringify(found.spec));
              if (found.url || found.command || found.mode) return JSON.parse(JSON.stringify(found));
            }
          }
        }

        // Default: return an empty object (caller will still export something), but prefer {} to null
        return {};
      } catch (err) {
        console.debug('[EXPORT] getExportableSpec error', err);
        return {};
      }
    }

  const spec = await getExportableSpec(entry);
    // Include the raw config snippet (as shown in the UI) as a comment in exported artifacts
    const rawSnippetSingle = (entry && (entry.configSnippetValue || entry.configSnippet))
      || (entry && entry.configSnippets && (entry.configSnippets.json || entry.configSnippets.toml)) || '';
    const snippetCommentYamlSingle = rawSnippetSingle
      ? ('# --- config snippet (as shown in UI) ---\n' + rawSnippetSingle.split('\n').map(l => '# ' + l).join('\n') + '\n# --- end snippet ---\n\n')
      : '';
    const snippetCommentJsSingle = rawSnippetSingle
      ? ('/* --- config snippet (as shown in UI) ---\n' + rawSnippetSingle + '\n--- end snippet --- */\n\n')
      : '';
    const snippetCommentPySingle = rawSnippetSingle
      ? ('""" --- config snippet (as shown in UI) ---\n' + rawSnippetSingle + '\n--- end snippet --- """\n\n')
      : '';
    const steps = (entry.callHistory || []).map((h) => ({
      tool: h.toolName,
      args: h.args || {},
      keep_session_open: !!h.keepSessionOpen,
      started_at: h.startedAt || null,
      finished_at: h.finishedAt || null,
      ok: !!h.success,
      warmup: !!h.warmup
    }));
    const displayName = entry.serverName || entry.displayName || spec.url || spec.command || 'server';
    const prettySteps = steps.map((s) => {
      const argPairs = Object.entries(s.args || {}).map(([k, v]) => {
        let rendered;
        if (typeof v === 'string') rendered = `'${v.replace(/'/g, "''")}'`;
        else if (v === null || v === undefined) rendered = 'null';
        else if (typeof v === 'boolean') rendered = v ? 'true' : 'false';
        else if (typeof v === 'number' || typeof v === 'bigint') rendered = String(v);
        else rendered = `'${String(v).replace(/'/g, "''")}'`;
        return `${k}=${rendered}`;
      });
      return {
        action: `call ${displayName} tool ${s.tool}${argPairs.length ? ' ' + argPairs.join(' ') : ''}`,
        ...s
      };
    });
    const workflow = {
      version: 1,
      exported_at: new Date().toISOString(),
      server: { name: displayName, spec },
      steps: prettySteps
    };
  const yaml = `# Exported with MCP Diagnosis Tool v ${APP_VERSION}\n` + snippetCommentYamlSingle + toSingleQuotedYAML(workflow) + '\n';
    const baseName = `${sanitizeFilenameSegment(displayName)}_${formatTimestampForFilename(new Date())}_session`;

  let js = snippetCommentJsSingle + `/* Generated by MCP Diagnosis Tool */\n` +
`const BASE_URL = process.env.MCP_DOCTOR_URL || 'http://localhost:3000';\n` +
`const spec = ${JSON.stringify(spec, null, 2)};\n` +
`const steps = ${JSON.stringify(steps, null, 2)};\n` +
`async function run(){\n` +
`  for (const s of steps){\n` +
`    const res = await fetch(\`${'${BASE_URL}'}/api/tools/call\`, {\n` +
`      method:'POST', headers:{'Content-Type':'application/json'},\n` +
`      body: JSON.stringify({ spec, toolName: s.tool, toolArgs: s.args || {}, keepSessionOpen: !!s.keep_session_open })\n` +
`    });\n` +
`    let data;\n` +
`    try { data = await res.json(); } catch { data = { ok: false }; }\n` +
`    console.log('tool', s.tool, 'ok=', data.ok, 'sessionId=', data.sessionId || null);\n` +
`    if (!res.ok) throw new Error(JSON.stringify(data));\n` +
`  }\n` +
`}\n` +
`run().catch(err=>{ console.error('Run failed:', err); process.exit(1); });\n`;

  let py = snippetCommentPySingle + `# Generated by MCP Diagnosis Tool\n` +
`import os, json, requests\n` +
`BASE_URL = os.getenv('MCP_DOCTOR_URL', 'http://localhost:3000')\n` +
`spec = ${JSON.stringify(spec, null, 2)}\n` +
`steps = ${JSON.stringify(steps, null, 2)}\n` +
`for s in steps:\n` +
`    r = requests.post(f"{BASE_URL}/api/tools/call", json={\n` +
`        "spec": spec,\n` +
`        "toolName": s["tool"],\n` +
`        "toolArgs": s.get("args", {}),\n` +
`        "keepSessionOpen": bool(s.get("keep_session_open", False))\n` +
`    })\n` +
`    try:\n` +
`        data = r.json()\n` +
`    except Exception:\n` +
`        data = {"ok": False, "error": {"details": r.text}}\n` +
`    print("tool", s["tool"], "ok=", data.get("ok"))\n` +
`    if not r.ok:\n` +
`        raise SystemExit(1)\n`;


    // Override exports with direct MCP client code (JS + Python)
    js = `/* Generated by MCP Diagnosis Tool: direct MCP client replay */\n` +
  `// Requires: npm i @modelcontextprotocol/sdk\n` +
  `const { Client } = require('@modelcontextprotocol/sdk/client/index.js');\n` +
  `const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');\n` +
  `const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');\n` +
  `const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');\n` +
  `\n` +
  `const spec = ${JSON.stringify(spec, null, 2)};\n` +
  `const steps = ${JSON.stringify(steps, null, 2)};\n` +
  `\n` +
  `let client = null;\n` +
  `function toJsonable(x){\n` +
  `  if (x == null) return x;\n` +
  `  const t = typeof x;\n` +
  `  if (t === 'string' || t === 'number' || t === 'boolean') return x;\n` +
  `  if (Array.isArray(x)) return x.map(toJsonable);\n` +
  `  if (t === 'object') {\n` +
  `    if (x.type && (x.text !== undefined || x.data !== undefined || x.mimeType !== undefined || x.name !== undefined || x.error !== undefined || x.url !== undefined || x.path !== undefined)) {\n` +
  `      const out = { type: x.type };\n` +
  `      for (const k of ['text','data','mimeType','name','error','url','path']) { if (Object.prototype.hasOwnProperty.call(x, k)) out[k] = toJsonable(x[k]); }\n` +
  `      return out;\n` +
  `    }\n` +
  `    const out = {}; for (const [k, v] of Object.entries(x)) out[k] = toJsonable(v); return out;\n` +
  `  }\n` +
  `  return String(x);\n` +
  `}\n` +
  `async function ensureClient() {\n` +
  `  if (client) return client;\n` +
  `  client = new Client({ name: 'mcp-session-replay', version: '1.0.0' });\n` +
  `  if (spec.mode === 'stdio') {\n` +
  `    const transport = new StdioClientTransport({\n` +
  `      command: spec.command,\n` +
  `      args: spec.args || [],\n` +
  `      env: spec.env || {},\n` +
  `      cwd: spec.cwd,\n` +
  `      stderr: spec.stderr\n` +
  `    });\n` +
  `    await client.connect(transport);\n` +
  `  } else if (spec.mode === 'http') {\n` +
  `    const url = new URL(spec.url);\n` +
  `    try {\n` +
  `      const http = new StreamableHTTPClientTransport(url);\n` +
  `      await client.connect(http);\n` +
  `    } catch (_) {\n` +
  `      const sse = new SSEClientTransport(url);\n` +
  `      await client.connect(sse);\n` +
  `    }\n` +
  `  } else {\n` +
  `    throw new Error('Unknown spec.mode: ' + spec.mode);\n` +
  `  }\n` +
  `  return client;\n` +
  `}\n` +
  `\n` +
  `async function closeClient() {\n` +
  `  if (client) {\n` +
  `    try { await client.close(); } catch {}\n` +
  `    client = null;\n` +
  `  }\n` +
  `}\n` +
  `\n` +
  `async function run() {\n` +
  `  try {\n` +
  `    for (const s of steps) {\n` +
  `      const c = await ensureClient();\n` +
  `      const result = await c.callTool({ name: s.tool, arguments: s.args || {} });\n` +
  `      const payload = (result && (result.content ?? result)) ?? null;\n` +
  `      console.log('tool', s.tool, '->\\n' + JSON.stringify(toJsonable(payload), null, 2));\n` +
  `      if (!s.keep_session_open) {\n` +
  `        await closeClient();\n` +
  `      }\n` +
  `    }\n` +
  `  } finally {\n` +
  `    await closeClient();\n` +
  `  }\n` +
  `}\n` +
  `\n` +
  `run().catch(err => { console.error('Run failed:', err); process.exit(1); });\n`;

    py = `# Generated by MCP Diagnosis Tool: direct MCP client replay\n` +
  `# Requires: pip install mcp\n` +
  `import asyncio, json\n` +
  `from contextlib import AsyncExitStack\n` +
  `from mcp import ClientSession\n` +
  `from mcp.client.stdio import stdio_client, StdioServerParameters\n` +
  `from mcp.client.streamable_http import streamablehttp_client\n` +
  `\n` +
  `spec = ${JSON.stringify(spec, null, 2)}\n` +
  `steps = ${JSON.stringify(steps, null, 2)}\n` +
  `\n` +
  `session = None\n` +
  `exit_stack = AsyncExitStack()\n` +
  `\n` +
  `def to_jsonable(x):\n` +
  `    import dataclasses\n` +
  `    if x is None or isinstance(x, (str, int, float, bool)):\n` +
  `        return x\n` +
  `    if isinstance(x, (list, tuple)):\n` +
  `        return [to_jsonable(i) for i in x]\n` +
  `    if isinstance(x, dict):\n` +
  `        return {str(k): to_jsonable(v) for k, v in x.items()}\n` +
  `    t = getattr(x, 'type', None)\n` +
  `    if t:\n` +
  `        out = {'type': t}\n` +
  `        for attr in ('text','data','mimeType','name','error','url','path'):\n` +
  `            if hasattr(x, attr):\n` +
  `                out[attr] = getattr(x, attr)\n` +
  `        return out\n` +
  `    if dataclasses.is_dataclass(x):\n` +
  `        return to_jsonable(dataclasses.asdict(x))\n` +
  `    d = getattr(x, '__dict__', None)\n` +
  `    if d is not None:\n` +
  `        return {k: to_jsonable(v) for k, v in d.items()}\n` +
  `    return str(x)\n` +
  `\n` +
  `async def ensure_session():\n` +
  `    global session\n` +
  `    if session is not None:\n` +
  `        return session\n` +
  `    await exit_stack.__aenter__()\n` +
  `    if spec.get('mode') == 'stdio':\n` +
  `        params = StdioServerParameters(command=spec.get('command'), args=spec.get('args') or [], env=spec.get('env') or None)\n` +
  `        read, write = await exit_stack.enter_async_context(stdio_client(params))\n` +
  `        sess = await exit_stack.enter_async_context(ClientSession(read, write))\n` +
  `    elif spec.get('mode') == 'http':\n` +
  `        url = spec.get('url')\n` +
  `        if not url:\n` +
  `            raise RuntimeError('Missing spec.url for http mode')\n` +
  `        read, write = await exit_stack.enter_async_context(streamablehttp_client(url))\n` +
  `        sess = await exit_stack.enter_async_context(ClientSession(read, write))\n` +
  `    else:\n` +
  `        raise RuntimeError(f"Unknown mode: {spec.get('mode')}")\n` +
  `    await sess.initialize()\n` +
  `    session = sess\n` +
  `    return session\n` +
  `\n` +
  `async def close_session():\n` +
  `    global session\n` +
  `    try:\n` +
  `        await exit_stack.aclose()\n` +
  `    finally:\n` +
  `        session = None\n` +
  `\n` +
  `async def main():\n` +
  `    try:\n` +
  `        for s in steps:\n` +
  `            sess = await ensure_session()\n` +
  `            result = await sess.call_tool(s['tool'], s.get('args') or {})\n` +
  `            payload = getattr(result, 'content', None) or getattr(result, 'result', None)\n` +
  `            print('tool', s['tool'], '->', json.dumps(to_jsonable(payload), ensure_ascii=False))\n` +
  `            if not bool(s.get('keep_session_open', False)):\n` +
  `                await close_session()\n` +
  `    finally:\n` +
  `        await close_session()\n` +
  `\n` +
  `if __name__ == '__main__':\n` +
  `    asyncio.run(main())\n`;

    // Build API-oriented artifacts to replay via the diagnosis server HTTP API
    const apiYamlObj = {
      exported_with: `MCP Diagnosis Tool v ${APP_VERSION}`,
      servers: exportServers,
      steps: prettySteps
    };
    const apiYaml = `# API replay manifest for MCP Diagnosis Tool v ${APP_VERSION}\n` +
      toSingleQuotedYAML(apiYamlObj) + '\n';

    const apiJs = snippetCommentJs + `// API replay script for MCP Diagnosis Tool v ${APP_VERSION}\n` +
      `// Usage: node ${baseName}.api.js http://localhost:3060\n` +
      `const fetch = require('node-fetch');\n` +
      `(async function(){\n` +
      `  const base = process.argv[2] || 'http://localhost:3060';\n` +
      `  const servers = ${JSON.stringify(exportServers, null, 2)};\n` +
      `  const steps = ${JSON.stringify(prettySteps, null, 2)};\n` +
      `  const sessions = {};\n` +
      `  for (const s of servers) {\n` +
      `    const resp = await fetch(base + '/api/sessions/open', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ spec: s.spec }) });\n` +
      `    const j = await resp.json(); if (!j.sessionId) { console.error('Failed to open session for', s.name, j); process.exit(2); }\n` +
      `    sessions[s.name] = j.sessionId; console.log('Opened', s.name, j.sessionId);\n` +
      `  }\n` +
      `  for (const step of steps) {\n` +
      `    const sid = sessions[step.server]; if (!sid) { console.error('No session for', step.server); continue; }\n` +
      `    console.log('Calling', step.tool, 'on', step.server);\n` +
      `    const call = await fetch(base + '/api/tools/call', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sessionId: sid, tool: step.tool, args: step.args || {} }) });\n` +
      `    const out = await call.json().catch(() => null); console.log('Result', out);\n` +
      `  }\n` +
      `  for (const [name, sid] of Object.entries(sessions)) {\n` +
      `    await fetch(base + '/api/sessions/close', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sessionId: sid }) });\n` +
      `    console.log('Closed', name);\n` +
      `  }\n` +
      `})();\n`;

    const apiPs = snippetCommentJs + `# API replay PowerShell script for MCP Diagnosis Tool v ${APP_VERSION}\n` +
      `# Usage: powershell -File ${baseName}.api.ps1 -BaseUrl http://localhost:3060\n` +
      `$BaseUrl = $args[0]; if (-not $BaseUrl) { $BaseUrl = 'http://localhost:3060' }\n` +
      `$servers = ${JSON.stringify(exportServers, null, 2)}\n` +
      `$steps = ${JSON.stringify(prettySteps, null, 2)}\n` +
      `$sessions = @{}\n` +
      `foreach ($s in $servers) {\n` +
      `  $body = @{ spec = $s.spec } | ConvertTo-Json -Depth 10;\n` +
      `  $resp = Invoke-RestMethod -Method Post -Uri ($BaseUrl + '/api/sessions/open') -ContentType 'application/json' -Body $body;\n` +
      `  if (-not $resp.sessionId) { Write-Error "Failed to open session for $($s.name): $($resp|ConvertTo-Json -Depth 5)" ; exit 2 }\n` +
      `  $sessions[$s.name] = $resp.sessionId; Write-Host "Opened $($s.name) -> $($resp.sessionId)";\n` +
      `}\n` +
      `foreach ($st in $steps) {\n` +
      `  $sid = $sessions[$st.server]; if (-not $sid) { Write-Warning "No session for $($st.server)" ; continue }\n` +
      `  $call = @{ sessionId = $sid; tool = $st.tool; args = $st.args } | ConvertTo-Json -Depth 12;\n` +
      `  $out = Invoke-RestMethod -Method Post -Uri ($BaseUrl + '/api/tools/call') -ContentType 'application/json' -Body $call;\n` +
      `  Write-Host "Call result:"; $out | ConvertTo-Json -Depth 5;\n` +
      `}\n` +
      `foreach ($kv in $sessions.GetEnumerator()) { Invoke-RestMethod -Method Post -Uri ($BaseUrl + '/api/sessions/close') -ContentType 'application/json' -Body (ConvertTo-Json @{ sessionId = $kv.Value } -Depth 5); Write-Host "Closed $($kv.Key)" }\n`;

    return { yaml, js, py, apiYaml, apiJs: apiJs, apiPs: apiPs, baseName };
  }

  // Expose helpers for automation/testing (Playwright can call these via page.evaluate)
  try {
    window.apiBuildExportForEntry = async function(entry) {
      return await generateWorkflowArtifacts(entry);
    };
    window.apiBuildCombinedExportForWorkflow = async function(wf) {
      return await generateCombinedWorkflowArtifacts(wf);
    };
  } catch (_) {
    // ignore in non-browser contexts
  }

  // Automation helper: when the page is opened with ?automate_export=1, build export
  // artifacts automatically and print them to the console so external runners (Playwright)
  // can capture them without using page.evaluate.
  try {
    if (typeof window !== 'undefined' && window.location && window.location.search && window.location.search.indexOf('automate_export=1') !== -1) {
      (async () => {
        try {
          // Fallback automation: call the server /api/export/template endpoint so the page
          // emits the generated artifacts to the console. This avoids depending on internal
          // UI state and keeps the automation stable.
          const spec = { mode: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest', '--output-dir', 'C:/Users/jenss/OneDrive - Singularyt UG/Code/Test/.evidence/screenshots/tmp_playwright_export', '--browser','chrome','--viewport-size','2400,1350','--isolated','--no-sandbox'] };
          const body = { spec: spec, serverName: 'playwright', callHistory: [{ toolName: 'browser_navigate', args: { url: window.location.origin } }] };
          const resp = await fetch('/api/export/template', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const json = await resp.json().catch(() => null);
          if (json && json.ok) {
            console.log('EXPORT_ARTIFACTS:' + JSON.stringify(json));
          } else {
            console.error('EXPORT_ERROR: server did not return artifacts', json);
          }
        } catch (e) {
          console.error('EXPORT_ERROR:' + String(e));
        }
      })();
    }
  } catch (_) {}

  async function saveArtifactsViaDialog(artifacts) {
    const suggested = artifacts.baseName || 'mcp_session';
    // Debug trace to help diagnose which branch runs in the browser
    try {
      const info = { showDirectoryPicker: !!window.showDirectoryPicker, showSaveFilePicker: !!window.showSaveFilePicker };
      console.log('[DEBUG] saveArtifactsViaDialog invoked. APIs:', info);
      showExportStatus(`Export APIs: dir=${info.showDirectoryPicker} save=${info.showSaveFilePicker}`, 3000);
    } catch (_) {}
    // Use the suggested base name; do NOT prompt here. The folder picker is invoked
    // directly from the click handler to preserve the user gesture. This function only
    // performs fallback saves (save-file picker or downloads).
    const baseName = artifacts.baseName || suggested;

    // Prefer directory picker so we can create a subfolder named after the baseName
    if (window.showDirectoryPicker) {
      try {
        showExportStatus('Please choose a folder to save the export...');
        const dirHandle = await window.showDirectoryPicker();
        // Create a subdirectory with the baseName to keep all files together
        const sub = await dirHandle.getDirectoryHandle(baseName, { create: true });

        // Write all artifacts into the subdirectory
        const filesToWrite = [
          { name: `${baseName}.yaml`, content: artifacts.yaml },
          { name: `${baseName}.js`, content: artifacts.js },
          { name: `${baseName}.py`, content: artifacts.py },
          { name: `${baseName}.api.js`, content: artifacts.apiJs || artifacts.apiJs },
          { name: `${baseName}.api.ps1`, content: artifacts.apiPs || artifacts.apiPs },
          { name: `${baseName}.api.yaml`, content: artifacts.apiYaml || artifacts.apiYaml }
        ];

        if (artifacts.playwrightJs) filesToWrite.push({ name: `${baseName}.playwright.js`, content: artifacts.playwrightJs });
        if (artifacts.playwrightPy) filesToWrite.push({ name: `${baseName}.playwright.py`, content: artifacts.playwrightPy });

        for (const f of filesToWrite) {
          try {
            const fh = await sub.getFileHandle(f.name, { create: true });
            const w = await fh.createWritable();
            await w.write(f.content);
            await w.close();
          } catch (e) {
            console.error('Failed to write', f.name, e);
            throw e;
          }
        }
        showExportStatus('Export saved to folder: ' + baseName, 4000);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // user cancelled
        console.warn('Directory-picker save failed, falling back to file pickers:', err);
        // Fall through to legacy save-file picker flow below
      }
    }

    // Use showSaveFilePicker for single-file experience (fallback)
    if (window.showSaveFilePicker) {
      try {
        showExportStatus('Opening save dialog for YAML...');
        // Show save dialog for the YAML file (primary file)
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: `${suggested}.yaml`,
          types: [{
            description: 'MCP Workflow Files',
            accept: { 'text/yaml': ['.yaml'] }
          }]
        });

        // Save the YAML file to user-chosen location
        const writable = await fileHandle.createWritable();
        await writable.write(artifacts.yaml);
        await writable.close();

  // Use the baseName chosen by the user as the saved base filename
  const savedName = baseName;

        // Try to write companion files into a subdirectory in the same parent if possible
        try {
          if (typeof fileHandle.getParent === 'function') {
            const parent = await fileHandle.getParent();
            if (parent) {
              const sub = await parent.getDirectoryHandle(savedName, { create: true });
              const writeList = [
                { name: `${savedName}.js`, content: artifacts.js },
                { name: `${savedName}.py`, content: artifacts.py },
                { name: `${savedName}.api.js`, content: artifacts.apiJs || artifacts.apiJs },
                { name: `${savedName}.api.ps1`, content: artifacts.apiPs || artifacts.apiPs },
                { name: `${savedName}.api.yaml`, content: artifacts.apiYaml || artifacts.apiYaml }
              ];
                if (artifacts.playwrightJs) writeList.push({ name: `${savedName}.playwright.js`, content: artifacts.playwrightJs });
                if (artifacts.playwrightPy) writeList.push({ name: `${savedName}.playwright.py`, content: artifacts.playwrightPy });
              for (const f of writeList) {
                const fh = await sub.getFileHandle(f.name, { create: true });
                const w = await fh.createWritable();
                await w.write(f.content);
                await w.close();
              }
              return;
            }
          }

          // If getParent is not available, prompt the user to pick a directory to create the subfolder
          if (window.showDirectoryPicker) {
            try {
              const dirHandle = await window.showDirectoryPicker();
              const sub = await dirHandle.getDirectoryHandle(savedName, { create: true });
              const writeList = [
                { name: `${savedName}.js`, content: artifacts.js },
                { name: `${savedName}.py`, content: artifacts.py },
                { name: `${savedName}.api.js`, content: artifacts.apiJs || artifacts.apiJs },
                { name: `${savedName}.api.ps1`, content: artifacts.apiPs || artifacts.apiPs },
                { name: `${savedName}.api.yaml`, content: artifacts.apiYaml || artifacts.apiYaml }
              ];
                if (artifacts.playwrightJs) writeList.push({ name: `${savedName}.playwright.js`, content: artifacts.playwrightJs });
                if (artifacts.playwrightPy) writeList.push({ name: `${savedName}.playwright.py`, content: artifacts.playwrightPy });
              for (const f of writeList) {
                const fh = await sub.getFileHandle(f.name, { create: true });
                const w = await fh.createWritable();
                await w.write(f.content);
                await w.close();
              }
              return;
            } catch (innerErr) {
              // If user cancels the companion file pickers, silently continue to fallback below.
            }
          }
        } catch (writeErr) {
          // If writing companion files via FS Access API failed, fall back to downloads below.
          console.error('Failed to write companion files to same directory:', writeErr);
        }

  // Fallback: download to default downloads folder (last resort)
  showExportStatus('Saving to browser Downloads (fallback)', 4000);
  downloadTextFile(`${savedName}.js`, artifacts.js, 'application/javascript;charset=utf-8');
  downloadTextFile(`${savedName}.py`, artifacts.py, 'text/x-python;charset=utf-8');
  downloadTextFile(`${savedName}.api.js`, artifacts.apiJs || '', 'application/javascript;charset=utf-8');
  downloadTextFile(`${savedName}.api.ps1`, artifacts.apiPs || '', 'text/powershell;charset=utf-8');
  downloadTextFile(`${savedName}.api.yaml`, artifacts.apiYaml || '', 'text/yaml;charset=utf-8');
    if (artifacts.playwrightJs) downloadTextFile(`${savedName}.playwright.js`, artifacts.playwrightJs, 'application/javascript;charset=utf-8');
    if (artifacts.playwrightPy) downloadTextFile(`${savedName}.playwright.py`, artifacts.playwrightPy, 'text/x-python;charset=utf-8');

        // Silent success - no alert needed
        return;
      } catch (err) {
        // User cancelled or error occurred
        if (err.name !== 'AbortError') {
          throw err; // Re-throw non-cancellation errors
        }
        return; // User cancelled - silent exit
      }
    }

    // Fallback to downloads (no save picker available)
  showExportStatus('Saving to browser Downloads (no file picker available)', 4000);
  downloadTextFile(`${suggested}.yaml`, artifacts.yaml, 'text/yaml;charset=utf-8');
  downloadTextFile(`${suggested}.js`, artifacts.js, 'application/javascript;charset=utf-8');
  downloadTextFile(`${suggested}.py`, artifacts.py, 'text/x-python;charset=utf-8');
    if (artifacts.playwrightJs) downloadTextFile(`${suggested}.playwright.js`, artifacts.playwrightJs, 'application/javascript;charset=utf-8');
    if (artifacts.playwrightPy) downloadTextFile(`${suggested}.playwright.py`, artifacts.playwrightPy, 'text/x-python;charset=utf-8');
    // Silent success for fallback too
  }



  async function exportSessionForEntry(entry) {
    if (!entry.callHistory || entry.callHistory.length === 0) {
      alert('No tool calls recorded for this server session yet.');
      return;
    }
    const artifacts = await generateWorkflowArtifacts(entry);
    await saveArtifactsViaDialog(artifacts);
  }

  async function generateCombinedWorkflowArtifacts(wf) {
    // Combine all calls from all servers in the workflow
    const calls = wf.calls || [];
    if (calls.length === 0) {
      throw new Error('No workflow calls to export');
    }

    // Group calls by server to generate multi-server workflow
    const serverSpecs = new Map();
    const steps = [];

    function normalizeSpec(spec) {
      try {
        if (!spec || typeof spec !== 'object') return spec;
        const out = JSON.parse(JSON.stringify(spec || {}));
        // Determine mode if missing
        if (!out.mode) {
          if (out.command) out.mode = 'stdio';
          else if (out.url) out.mode = 'http';
        }
        // Ensure args is an array for stdio-like specs
        if (out.mode === 'stdio') {
          if (!out.command && out.npmPackage && typeof out.npmPackage === 'string') {
            // support a non-standard field pointing to an npm package
            out.command = 'npx';
            out.args = out.args || ['-y', out.npmPackage];
          }
          if (out.args && !Array.isArray(out.args)) {
            if (typeof out.args === 'string') out.args = out.args.split(/\s+/).filter(Boolean);
            else out.args = [out.args];
          }
          out.args = out.args || [];
        }
        // Ensure env is an object
        if (out.env && typeof out.env !== 'object') {
          out.env = {};
        }
        return out;
      } catch (err) {
        console.warn('normalizeSpec failed', err);
        return spec;
      }
    }

  async function findSpecForServer(name) {
      try {
        // Try to match the server entry by a few heuristics:
        //  - exact serverName or name (case-sensitive)
        //  - case-insensitive match of name/serverName/displayName
        //  - displayName contains provided name (loose match)
        const normalize = (v) => (v === null || v === undefined) ? '' : String(v).trim().toLowerCase();
        const wanted = normalize(name);
        let entry = servers.find((s) => (s.serverName === name || s.name === name));
        if (!entry) {
          entry = servers.find((s) => {
            return normalize(s.serverName) === wanted || normalize(s.name) === wanted || normalize(s.displayName) === wanted;
          });
        }
        if (!entry) {
          entry = servers.find((s) => {
            const dn = normalize(s.displayName);
            return dn && wanted && dn.indexOf(wanted) !== -1;
          });
        }
        if (!entry) return null;
        if (!entry) return null;

        // Prefer an explicit spec object on the entry
        if (entry.spec && Object.keys(entry.spec).length) {
          const s = normalizeSpec(entry.spec);
          console.debug('[EXPORT] findSpecForServer — using entry.spec for', name, s);
          return s;
        }

        // Try already-parsed configEntry (set during replaceConfigServers)
        if (entry.configEntry && typeof entry.configEntry === 'object') {
          // Possible shapes:
          // { spec: { ... } }
          if (entry.configEntry.spec && typeof entry.configEntry.spec === 'object') {
            const s = normalizeSpec(entry.configEntry.spec);
            console.debug('[EXPORT] findSpecForServer — using entry.configEntry.spec for', name, s);
            return s;
          }
          // { mcpServers: { <name>: { ... } } }
          if (entry.configEntry.mcpServers && entry.configEntry.mcpServers[name]) {
            const s = normalizeSpec(entry.configEntry.mcpServers[name]);
            console.debug('[EXPORT] findSpecForServer — using entry.configEntry.mcpServers for', name, s);
            return s;
          }
          // direct server key
          if (entry.configEntry[name]) {
            const s = normalizeSpec(entry.configEntry[name]);
            console.debug('[EXPORT] findSpecForServer — using entry.configEntry[name] for', name, s);
            return s;
          }
        }

        // Fallback: check configSnippets (raw text snippets provided by the hosted config UI)
        const snippets = entry.configSnippets || {};
        if (snippets.json) {
          try {
            const parsed = JSON.parse(snippets.json);
            // Parsed may be a wrapper: { spec: {...} }
            if (parsed && typeof parsed === 'object') {
              if (parsed.spec && typeof parsed.spec === 'object') {
                const s = normalizeSpec(parsed.spec);
                console.debug('[EXPORT] findSpecForServer — using snippets.json.spec for', name, s);
                return s;
              }
              if (parsed.mcpServers && parsed.mcpServers[name]) {
                const s = normalizeSpec(parsed.mcpServers[name]);
                console.debug('[EXPORT] findSpecForServer — using snippets.json.mcpServers for', name, s);
                return s;
              }
              if (parsed[name]) {
                const s = normalizeSpec(parsed[name]);
                console.debug('[EXPORT] findSpecForServer — using snippets.json[name] for', name, s);
                return s;
              }
              // In some cases the snippet itself is the server spec
              if (parsed.mode || parsed.command || parsed.url || parsed.args) {
                const s = normalizeSpec(parsed);
                console.debug('[EXPORT] findSpecForServer — using snippets.json direct spec for', name, s);
                return s;
              }
            }
          } catch (err) {
            console.warn('Failed to parse JSON config snippet for', name, err);
          }
        }

        // Also consider entry.configSnippetValue which may contain the preferred-format snippet
        if (entry.configSnippetValue) {
          try {
            const parsed = JSON.parse(entry.configSnippetValue);
            if (parsed && typeof parsed === 'object') {
              if (parsed.spec && typeof parsed.spec === 'object') {
                const s = normalizeSpec(parsed.spec);
                console.debug('[EXPORT] findSpecForServer — using configSnippetValue.spec for', name, s);
                return s;
              }
              if (parsed.mcpServers && parsed.mcpServers[name]) {
                const s = normalizeSpec(parsed.mcpServers[name]);
                console.debug('[EXPORT] findSpecForServer — using configSnippetValue.mcpServers for', name, s);
                return s;
              }
              if (parsed[name]) {
                const s = normalizeSpec(parsed[name]);
                console.debug('[EXPORT] findSpecForServer — using configSnippetValue[name] for', name, s);
                return s;
              }
              if (parsed.mode || parsed.command || parsed.url || parsed.args) {
                const s = normalizeSpec(parsed);
                console.debug('[EXPORT] findSpecForServer — using configSnippetValue direct spec for', name, s);
                return s;
              }
            }
          } catch (err) {
            // ignore parse errors
          }
        }

        // If still nothing, try server-side parse of configSnippets or configSnippetValue
        try {
          const raw = (snippets.json || snippets.toml || entry.configSnippetValue || entry.configSnippet || '');
          if (raw && String(raw).trim()) {
            try {
              const resp = await fetch('/api/export/parse-snippet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: raw }) });
              const data = await resp.json().catch(() => ({}));
              if (resp.ok && data && data.parsed) {
                const parsed = data.parsed;
                if (parsed && typeof parsed === 'object') {
                  if (parsed.spec && typeof parsed.spec === 'object') {
                    const s = normalizeSpec(parsed.spec);
                    console.debug('[EXPORT] findSpecForServer — using parse-snippet.spec for', name, s);
                    return s;
                  }
                  if (parsed.mcpServers && parsed.mcpServers[name]) {
                    const s = normalizeSpec(parsed.mcpServers[name]);
                    console.debug('[EXPORT] findSpecForServer — using parse-snippet.mcpServers for', name, s);
                    return s;
                  }
                  if (parsed[name]) {
                    const s = normalizeSpec(parsed[name]);
                    console.debug('[EXPORT] findSpecForServer — using parse-snippet[name] for', name, s);
                    return s;
                  }
                  if (parsed.mode || parsed.command || parsed.url || parsed.args) {
                    const s = normalizeSpec(parsed);
                    console.debug('[EXPORT] findSpecForServer — using parse-snippet direct spec for', name, s);
                    return s;
                  }
                }
              }
            } catch (e) {
              // ignore
            }
          }
        } catch (_) {}

        // As a last resort, check the global parsed config object (currentConfig)
        try {
          if (typeof currentConfig === 'object' && currentConfig) {
            if (currentConfig.mcpServers && currentConfig.mcpServers[name]) {
              const s = normalizeSpec(currentConfig.mcpServers[name]);
              console.debug('[EXPORT] findSpecForServer — using currentConfig.mcpServers for', name, s);
              return s;
            }
            if (Array.isArray(currentConfig.servers)) {
              const found = currentConfig.servers.find(s => s.name === name || s.serverName === name);
              if (found) {
                const s = normalizeSpec(found);
                console.debug('[EXPORT] findSpecForServer — using currentConfig.servers entry for', name, s);
                return s;
              }
            }
          }
        } catch (_) {}

        return null;
      } catch (ex) {
        console.error('findSpecForServer error for', name, ex);
        return null;
      }
    }

    for (const call of calls) {
      const serverKey = call.serverName || 'unknown';
      if (!serverSpecs.has(serverKey)) {
        const found = (call.spec && Object.keys(call.spec).length) ? normalizeSpec(call.spec) : (await findSpecForServer(serverKey) || {});
        serverSpecs.set(serverKey, found);
      }

      steps.push({
        server: serverKey,
        tool: call.toolName,
        args: call.args || {},
        keep_session_open: !!call.keepSessionOpen,
        started_at: call.startedAt || null,
        finished_at: call.finishedAt || null,
        ok: !!call.success,
        warmup: !!call.warmup
      });
    }

    // Create pretty action descriptions
    const prettySteps = steps.map((s) => {
      const argPairs = Object.entries(s.args || {}).map(([k, v]) => {
        let rendered;
        if (typeof v === 'string') rendered = `'${v.replace(/'/g, "''")}'`;
        else if (v === null || v === undefined) rendered = 'null';
        else if (typeof v === 'boolean') rendered = v ? 'true' : 'false';
        else if (typeof v === 'number' || typeof v === 'bigint') rendered = String(v);
        else rendered = `'${String(v).replace(/'/g, "''")}'`;
        return `${k}=${rendered}`;
      });
      return {
        action: `call ${s.server} tool ${s.tool}${argPairs.length ? ' ' + argPairs.join(' ') : ''}`,
        ...s
      };
    });

    // Convert server specs map to array for YAML (do NOT shadow the global `servers` variable)
    const exportServers = Array.from(serverSpecs.entries()).map(([name, spec]) => ({
      name,
      spec
    }));

    // Capture the UI server entries into a separate variable so we can look up raw snippets
    const uiEntries = Array.isArray(servers) ? servers.slice() : [];

    // Collect raw config snippets (as shown in UI) for each server and include them
    const snippetParts = [];
    for (const [name] of serverSpecs.entries()) {
      const uiEntry = uiEntries.find(s => s.serverName === name || s.name === name || (s.displayName && String(s.displayName).indexOf(name) !== -1));
      const raw = uiEntry && (uiEntry.configSnippetValue || uiEntry.configSnippet || (uiEntry.configSnippets && (uiEntry.configSnippets.json || uiEntry.configSnippets.toml))) || '';
      if (raw && String(raw).trim()) {
        snippetParts.push(`--- server: ${name} ---\n${raw}`);
      }
    }
    const combinedRawSnippet = snippetParts.length ? snippetParts.join('\n\n') : '';
    const snippetCommentYaml = combinedRawSnippet
      ? ('# --- combined server config snippets (as shown in UI) ---\n' + combinedRawSnippet.split('\n').map(l => '# ' + l).join('\n') + '\n# --- end snippets ---\n\n')
      : '';
    const snippetCommentJs = combinedRawSnippet
      ? ('/* --- combined server config snippets (as shown in UI) ---\n' + combinedRawSnippet + '\n--- end snippets --- */\n\n')
      : '';
    const snippetCommentPy = combinedRawSnippet
      ? ('""" --- combined server config snippets (as shown in UI) ---\n' + combinedRawSnippet + '\n--- end snippets --- """\n\n')
      : '';

    // If a Playwright Codegen recording exists in the UI entries, include it as
    // an executable step and prepare companion script artifacts.
  let playwrightRecordingJsContent = '';
  let playwrightRecordingPyContent = '';
  const codegenEntry = uiEntries.find(e => e.isPlaywrightCodegen || (e.serverName && String(e.serverName).toLowerCase().indexOf('playwright') !== -1 && e.source === 'internal'));
    // Ensure Playwright Codegen appears in the serverSpecs for exports even if
    // no workflow calls referenced it. This makes the codegen server always
    // available in export lists and enables inclusion of recorded scripts.
    if (codegenEntry) {
      const name = codegenEntry.serverName || codegenEntry.name || 'playwright-codegen';
      if (!serverSpecs.has(name)) {
        serverSpecs.set(name, { mode: 'codegen', url: codegenEntry.playwrightUrl || window.location.origin });
      }
    }
    if (codegenEntry && codegenEntry.playwrightRecordingJs && String(codegenEntry.playwrightRecordingJs).trim()) {
      // Prepend a step that indicates the recorded script should be executed
      prettySteps.unshift({ action: 'execute_playwright_recording', server: codegenEntry.serverName || codegenEntry.displayName || 'playwright-codegen', tool: '__playwright_recording__', args: {} });
      // Prepare a standalone Node script that runs the Playwright recording
      const userJs = String(codegenEntry.playwrightRecordingJs || '').trim();
      playwrightRecordingJsContent = `// Playwright recording for workflow\nconst { chromium } = require('playwright');\n(async () => {\n  const browser = await chromium.launch();\n  const page = await browser.newPage();\n  try {\n${userJs.split('\n').map(l => '    ' + l).join('\n')}\n  } finally {\n    await browser.close();\n  }\n})();\n`;
      // Minimal Python recording wrapper (if user provided a Python snippet, prefer it)
      const userPy = String(codegenEntry.playwrightRecordingPy || '').trim();
      if (userPy) {
        playwrightRecordingPyContent = `# Playwright recording (Python)\nfrom playwright.async_api import async_playwright\nimport asyncio\n\nasync def execute_playwright_recording():\n${userPy.split('\n').map(l => '    ' + l).join('\n')}\n\nif __name__ == '__main__':\n    asyncio.run(execute_playwright_recording())\n`;
      } else {
        // If no Python provided, create a small shim that calls node script via subprocess
        playwrightRecordingPyContent = `# Playwright recording shim (calls Node script)\nimport subprocess\nimport sys\nsubprocess.check_call(['node', __file__.replace('.py', '.playwright.js')])\n`;
      }
    }

    const workflow = {
      version: 1,
      exported_at: new Date().toISOString(),
      servers,
      steps: prettySteps
    };

  const yaml = `# Exported with MCP Diagnosis Tool v ${APP_VERSION}\n` + snippetCommentYaml + toSingleQuotedYAML(workflow) + '\n';
    const baseName = `MCP_Workflow_${formatTimestampForFilename(new Date())}`;

    // Generate JavaScript replay script
    const js = snippetCommentJs + `/* Generated by MCP Diagnosis Tool: Multi-server workflow replay (v ${APP_VERSION}) */\n` +
  `// Exported with MCP Diagnosis Tool v ${APP_VERSION}\n` +
  `// Requires: npm i @modelcontextprotocol/sdk\n` +
  `const { Client } = require('@modelcontextprotocol/sdk/client/index.js');\n` +
  `const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');\n` +
  `const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');\n` +
  `const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');\n` +
  `\n` +
  `const servers = ${JSON.stringify(exportServers, null, 2)};\n` +
  `const steps = ${JSON.stringify(steps, null, 2)};\n` +
  `\n` +
  `const clients = new Map();\n` +
  `\n` +
  `function toJsonable(x){\n` +
  `  if (x == null) return x;\n` +
  `  const t = typeof x;\n` +
  `  if (t === 'string' || t === 'number' || t === 'boolean') return x;\n` +
  `  if (Array.isArray(x)) return x.map(toJsonable);\n` +
  `  if (t === 'object') {\n` +
  `    if (x.type && (x.text !== undefined || x.data !== undefined || x.mimeType !== undefined || x.name !== undefined || x.error !== undefined || x.url !== undefined || x.path !== undefined)) {\n` +
  `      const out = { type: x.type };\n` +
  `      for (const k of ['text','data','mimeType','name','error','url','path']) { if (Object.prototype.hasOwnProperty.call(x, k)) out[k] = toJsonable(x[k]); }\n` +
  `      return out;\n` +
  `    }\n` +
  `    const out = {}; for (const [k, v] of Object.entries(x)) out[k] = toJsonable(v); return out;\n` +
  `  }\n` +
  `  return String(x);\n` +
  `}\n` +
  `\n` +
  `async function getClient(serverName) {\n` +
  `  if (clients.has(serverName)) return clients.get(serverName);\n` +
  `  const serverDef = servers.find(s => s.name === serverName);\n` +
  `  if (!serverDef) throw new Error('Unknown server: ' + serverName);\n` +
  `  const spec = serverDef.spec;\n` +
  `  const client = new Client({ name: 'mcp-workflow-replay', version: '1.0.0' });\n` +
  `  if (spec.mode === 'stdio') {\n` +
  `    const transport = new StdioClientTransport({\n` +
  `      command: spec.command,\n` +
  `      args: spec.args || [],\n` +
  `      env: spec.env || {},\n` +
  `      cwd: spec.cwd,\n` +
  `      stderr: spec.stderr\n` +
  `    });\n` +
  `    await client.connect(transport);\n` +
  `  } else if (spec.mode === 'http') {\n` +
  `    const url = new URL(spec.url);\n` +
  `    try {\n` +
  `      const http = new StreamableHTTPClientTransport(url);\n` +
  `      await client.connect(http);\n` +
  `    } catch (_) {\n` +
  `      const sse = new SSEClientTransport(url);\n` +
  `      await client.connect(sse);\n` +
  `    }\n` +
  `  } else {\n` +
  `    throw new Error('Unknown spec.mode: ' + spec.mode);\n` +
  `  }\n` +
  `  clients.set(serverName, client);\n` +
  `  return client;\n` +
  `}\n` +
  `\n` +
  `async function closeClient(serverName) {\n` +
  `  const client = clients.get(serverName);\n` +
  `  if (client) {\n` +
  `    try { await client.close(); } catch {}\n` +
  `    clients.delete(serverName);\n` +
  `  }\n` +
  `}\n` +
  `\n` +
  `async function closeAllClients() {\n` +
  `  for (const [name] of clients) {\n` +
  `    await closeClient(name);\n` +
  `  }\n` +
  `}\n` +
  `\n` +
  `async function run() {\n` +
  `  try {\n` +
  `    for (const s of steps) {\n` +
  `      const client = await getClient(s.server);\n` +
  `      const result = await client.callTool({ name: s.tool, arguments: s.args || {} });\n` +
  `      const payload = (result && (result.content ?? result)) ?? null;\n` +
  `      console.log('[' + s.server + '] tool', s.tool, '->\\n' + JSON.stringify(toJsonable(payload), null, 2));\n` +
  `      if (!s.keep_session_open) {\n` +
  `        await closeClient(s.server);\n` +
  `      }\n` +
  `    }\n` +
  `  } finally {\n` +
  `    await closeAllClients();\n` +
  `  }\n` +
  `}\n` +
  `\n` +
  `run().catch(err => { console.error('Run failed:', err); process.exit(1); });\n`;

    // Generate Python replay script
    const py = `# Generated by MCP Diagnosis Tool: Multi-server workflow replay (v ${APP_VERSION})\n` +
  `# Exported with MCP Diagnosis Tool v ${APP_VERSION}\n` +
  `# Requires: pip install mcp\n` +
  `import asyncio, json\n` +
  `from contextlib import AsyncExitStack\n` +
  `from mcp import ClientSession\n` +
  `from mcp.client.stdio import stdio_client, StdioServerParameters\n` +
  `from mcp.client.streamable_http import streamablehttp_client\n` +
  `\n` +
  `servers = ${JSON.stringify(servers, null, 2)}\n` +
  `steps = ${JSON.stringify(steps, null, 2)}\n` +
  `\n` +
  `sessions = {}\n` +
  `exit_stack = AsyncExitStack()\n` +
  `\n` +
  `def to_jsonable(x):\n` +
  `    import dataclasses\n` +
  `    if x is None or isinstance(x, (str, int, float, bool)):\n` +
  `        return x\n` +
  `    if isinstance(x, (list, tuple)):\n` +
  `        return [to_jsonable(i) for i in x]\n` +
  `    if isinstance(x, dict):\n` +
  `        return {str(k): to_jsonable(v) for k, v in x.items()}\n` +
  `    t = getattr(x, 'type', None)\n` +
  `    if t:\n` +
  `        out = {'type': t}\n` +
  `        for attr in ('text','data','mimeType','name','error','url','path'):\n` +
  `            if hasattr(x, attr):\n` +
  `                out[attr] = getattr(x, attr)\n` +
  `        return out\n` +
  `    if dataclasses.is_dataclass(x):\n` +
  `        return to_jsonable(dataclasses.asdict(x))\n` +
  `    d = getattr(x, '__dict__', None)\n` +
  `    if d is not None:\n` +
  `        return {k: to_jsonable(v) for k, v in d.items()}\n` +
  `    return str(x)\n` +
  `\n` +
  `async def get_session(server_name):\n` +
  `    if server_name in sessions:\n` +
  `        return sessions[server_name]\n` +
  `    server_def = next((s for s in servers if s['name'] == server_name), None)\n` +
  `    if not server_def:\n` +
  `        raise ValueError(f'Unknown server: {server_name}')\n` +
  `    spec = server_def['spec']\n` +
  `    await exit_stack.__aenter__()\n` +
  `    if spec.get('mode') == 'stdio':\n` +
  `        params = StdioServerParameters(command=spec.get('command'), args=spec.get('args') or [], env=spec.get('env') or None)\n` +
  `        read, write = await exit_stack.enter_async_context(stdio_client(params))\n` +
  `        sess = await exit_stack.enter_async_context(ClientSession(read, write))\n` +
  `    elif spec.get('mode') == 'http':\n` +
  `        url = spec.get('url')\n` +
  `        read, write = await exit_stack.enter_async_context(streamablehttp_client(url))\n` +
  `        sess = await exit_stack.enter_async_context(ClientSession(read, write))\n` +
  `    else:\n` +
  `        raise ValueError(f"Unknown mode: {spec.get('mode')}")\n` +
  `    sessions[server_name] = sess\n` +
  `    return sess\n` +
  `\n` +
  `async def close_session(server_name):\n` +
  `    if server_name in sessions:\n` +
  `        del sessions[server_name]\n` +
  `\n` +
  `async def close_all_sessions():\n` +
  `    sessions.clear()\n` +
  `    await exit_stack.__aexit__(None, None, None)\n` +
  `\n` +
  `async def main():\n` +
  `    try:\n` +
  `        for s in steps:\n` +
  `            sess = await get_session(s['server'])\n` +
  `            result = await sess.call_tool(s['tool'], s.get('args') or {})\n` +
  `            payload = getattr(result, 'content', None) or getattr(result, 'result', None)\n` +
  `            print(f"[{s['server']}] tool {s['tool']} ->", json.dumps(to_jsonable(payload), ensure_ascii=False))\n` +
  `            if not bool(s.get('keep_session_open', False)):\n` +
  `                await close_session(s['server'])\n` +
  `    finally:\n` +
  `        await close_all_sessions()\n` +
  `\n` +
  `if __name__ == '__main__':\n` +
  `    asyncio.run(main())\n`;

    // Build API-oriented artifacts for the combined workflow
    // Use the exportServers array (name/spec pairs) and steps determined above.
    const apiYamlObj = {
      exported_with: `MCP Diagnosis Tool v ${APP_VERSION}`,
      servers: exportServers,
      steps: prettySteps
    };
    const apiYamlCombined = `# API replay manifest for MCP Diagnosis Tool v ${APP_VERSION}\n` + toSingleQuotedYAML(apiYamlObj) + '\n';

    const apiJsCombined = snippetCommentJs + `// API replay script for MCP Diagnosis Tool v ${APP_VERSION}\n` +
      `// Usage: node ${baseName}.api.js http://localhost:3060\n` +
      `const fetch = require('node-fetch');\n` +
      `(async function(){\n` +
      `  const base = process.argv[2] || 'http://localhost:3060';\n` +
      `  const servers = ${JSON.stringify(exportServers, null, 2)};\n` +
      `  const steps = ${JSON.stringify(prettySteps, null, 2)};\n` +
      `  const sessions = {};\n` +
      `  for (const s of servers) {\n` +
      `    const resp = await fetch(base + '/api/sessions/open', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ spec: s.spec }) });\n` +
      `    const j = await resp.json(); if (!j.sessionId) { console.error('Failed to open session for', s.name, j); process.exit(2); }\n` +
      `    sessions[s.name] = j.sessionId; console.log('Opened', s.name, j.sessionId);\n` +
      `  }\n` +
      `  for (const step of steps) {\n` +
      `    const sid = sessions[step.server]; if (!sid) { console.error('No session for', step.server); continue; }\n` +
      `    console.log('Calling', step.tool, 'on', step.server);\n` +
      `    const call = await fetch(base + '/api/tools/call', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sessionId: sid, tool: step.tool, args: step.args || {} }) });\n` +
      `    const out = await call.json().catch(() => null); console.log('Result', out);\n` +
      `  }\n` +
      `  for (const [name, sid] of Object.entries(sessions)) {\n` +
      `    await fetch(base + '/api/sessions/close', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sessionId: sid }) });\n` +
      `    console.log('Closed', name);\n` +
      `  }\n` +
      `})();\n`;

    const apiPsCombined = snippetCommentPy + `# API replay PowerShell script for MCP Diagnosis Tool v ${APP_VERSION}\n` +
      `# Usage: powershell -File ${baseName}.api.ps -BaseUrl http://localhost:3060\n` +
      `$BaseUrl = $args[0]; if (-not $BaseUrl) { $BaseUrl = 'http://localhost:3060' }\n` +
      `$servers = ${JSON.stringify(exportServers, null, 2)}\n` +
      `foreach ($s in $servers) {\n` +
      `  Write-Host "Opening session for $($s.name) via $BaseUrl"\n` +
      `  $resp = Invoke-RestMethod -Method Post -Uri ($BaseUrl + '/api/sessions/open') -ContentType 'application/json' -Body (ConvertTo-Json @{ spec = $s.spec } -Depth 10)\n` +
      `  if (-not $resp.sessionId) { Write-Error "Failed to open session for $($s.name): $($resp | ConvertTo-Json -Depth 5)" ; exit 2 }\n` +
      `  $sessions[$s.name] = $resp.sessionId\n` +
      `}\n` +
      `# Example call loop (adjust as needed)\n` +
      `foreach ($step in ${JSON.stringify(prettySteps, null, 2)}) {\n` +
      `  $sid = $sessions[$step.server]; if (-not $sid) { Write-Host "No session for $($step.server)"; continue }\n` +
      `  Write-Host "Calling $($step.tool) on $($step.server)"\n` +
      `  $call = Invoke-RestMethod -Method Post -Uri ($BaseUrl + '/api/tools/call') -ContentType 'application/json' -Body (ConvertTo-Json @{ sessionId = $sid; tool = $step.tool; args = $step.args } -Depth 10)\n` +
      `  Write-Host "Result: $($call | ConvertTo-Json -Depth 5)"\n` +
      `}\n` +
      `# Close sessions\n` +
      `foreach ($name in $sessions.Keys) {\n` +
      `  Invoke-RestMethod -Method Post -Uri ($BaseUrl + '/api/sessions/close') -ContentType 'application/json' -Body (ConvertTo-Json @{ sessionId = $sessions[$name] } -Depth 5)\n` +
      `  Write-Host "Closed $name"\n` +
      `}\n`;

    return { yaml, js, py, apiYaml: apiYamlCombined, apiJs: apiJsCombined, apiPs: apiPsCombined, baseName, playwrightJs: playwrightRecordingJsContent, playwrightPy: playwrightRecordingPyContent };
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
      let statusHtml = '<div class="result-status">Tool executed successfully.</div>';
      try {
        if (payload.output && typeof payload.output === 'object' && payload.output.success === false) {
          statusHtml = '<div class="result-status error">Tool reported failure (success: false).</div>';
        }
      } catch (_) {}

      // Determine which output to display based on the format toggle
      const formatRadios = document.getElementsByName('report-format');
      let useFormatted = true; // default to formatted
      for (const radio of formatRadios) {
        if (radio.checked) {
          useFormatted = radio.value === 'formatted';
          break;
        }
      }

      // Use raw output if available and raw mode is selected, otherwise use formatted output
      const outputToDisplay = (!useFormatted && payload.rawOutput) ? payload.rawOutput : payload.output;
      const outputText = stringifyValue(outputToDisplay ?? {}, useFormatted);

      // Add copy button and output with scrollable container
      container.innerHTML = statusHtml + `
        <div style="position: relative;">
          <button type="button" class="copy-output-btn" onclick="copyOutputToClipboard()" title="Copy to clipboard">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10.5 1.5h-8v11h8v-11z" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <path d="M13.5 4.5v11h-8" stroke="currentColor" stroke-width="1.5" fill="none"/>
            </svg>
            Copy
          </button>
          <pre class="output-pre" id="modal-output-text">${escapeHtml(outputText)}</pre>
        </div>
      `;
    } else {
      const error = payload.error ?? {};
      const lines = [];
      if (error.kind) lines.push(`kind: ${error.kind}`);
      if (error.advice) lines.push(`advice: ${error.advice}`);
      if (error.details !== undefined) {
        try {
          const d = error.details;
          if (d && typeof d === 'object') {
            if (d.message) lines.push(`message: ${String(d.message)}`);
            if (d.code !== undefined) lines.push(`code: ${String(d.code)}`);
            if (d.status !== undefined) lines.push(`status: ${String(d.status)}`);
            if (d.stack) {
              const first = String(d.stack).split('\n')[0];
              lines.push(`stack: ${first}`);
            }
          }
        } catch (_) {}
        lines.push(`details: ${stringifyValue(error.details, true)}`);
      }
      if (!lines.length) {
        lines.push('Execution failed.');
      }
      container.innerHTML =
        '<div class="result-status">Tool execution failed.</div>' + `<pre>${escapeHtml(lines.join('\n'))}</pre>`;
    }
  }


  async function handleCloseServerSession(entry) {
    if (!entry.activeSessionId) {
      return;
    }

    const sessionId = entry.activeSessionId;

    try {
      const response = await fetch('/api/sessions/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data?.error || 'Failed to close session');
      }

      entry.activeSessionId = null;
      entry.sessionReused = false;
      entry.isWorkflowSession = false;
      renderServers();
    } catch (err) {
      alert(`Failed to close session: ${err.message}`);
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
    toolModalReport.disabled = true;
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
    toolModalReport.disabled = true;
    renderArgumentFields(context);
    setModalResult(null);
    updateModalSessionInfo(context.entry);
  }

  function updateModalSessionInfo(entry) {
    // Show session info when session is active OR when marked hidden (to display state)
    if (entry.activeSessionId || entry.sessionHidden) {
      toolModalSessionInfo.classList.remove('hidden');
      const displayId = entry.activeSessionId || entry.hiddenSessionId || '';
      toolModalSessionId.textContent = displayId + (entry.sessionHidden ? ' (hidden)' : '');

      const createdRaw = entry.activeSessionId ? entry.sessionCreatedAt : entry.hiddenSessionCreatedAt;
      if (createdRaw) {
        const createdAt = new Date(createdRaw);
        toolModalSessionCreated.textContent = createdAt.toLocaleString();
      } else {
        toolModalSessionCreated.textContent = entry.activeSessionId ? 'Unknown' : '-';
      }

      const stateEl = document.getElementById('tool-modal-session-state');
      if (stateEl) {
        stateEl.textContent = entry.sessionHidden ? 'Hidden' : (entry.activeSessionId ? 'Open' : 'Closed');
      }

      if (toolModalHideSession) {
        toolModalHideSession.textContent = 'Hide Session';
        toolModalHideSession.disabled = !entry.activeSessionId || entry.sessionHidden;
      }
    } else {
      toolModalSessionInfo.classList.add('hidden');
      if (toolModalHideSession) {
        toolModalHideSession.textContent = 'Hide Session';
        toolModalHideSession.disabled = true;
      }
      const stateEl = document.getElementById('tool-modal-session-state');
      if (stateEl) stateEl.textContent = '';
    }
  }


  // Auto-warm session by calling a safe no-arg tool (e.g., browser_snapshot)
  function selectWarmupTool(entry) {
    try {
      const tools = entry?.result?.tools || [];
      if (!Array.isArray(tools) || !tools.length) return null;
      const preferred = tools.find((t) => t && t.name === 'browser_snapshot');
      if (preferred) return preferred.name;
      const noRequired = tools.find((t) => {
        if (!t) return false;
        const sch = t.inputSchema;
        if (!sch || typeof sch !== 'object') return true; // no schema means no required args
        if (sch.type && sch.type !== 'object') return true; // non-object schema -> treat as no required
        const req = Array.isArray(sch.required) ? sch.required : [];
        return req.length === 0;
      });
      return noRequired ? noRequired.name : null;
    } catch (_) {
      return null;
    }
  }

  async function warmUpSession(entry) {
    const toolName = selectWarmupTool(entry);
    if (!toolName) {
      // No suitable tool to warm up; just unhide UI state
      entry.sessionHidden = false;
      renderServers();
      if (activeToolContext && activeToolContext.entry === entry) {
        updateModalSessionInfo(entry);
      }
      return;
    }
    const startedAtDate = new Date();
    const startedAtIso = toISOStringWithTZ(startedAtDate);
    try {
      const response = await fetch('/api/tools/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: entry.spec, toolName, toolArgs: {}, keepSessionOpen: true })
      });
      const data = await response.json().catch(() => ({}));
      const finishedAtIso = toISOStringWithTZ(new Date());
      const ok = response.ok && data.ok !== false;
      if (ok && data.sessionId) {
        entry.activeSessionId = data.sessionId;
        entry.sessionReused = !!data.sessionReused;
        entry.sessionCreatedAt = data.sessionCreatedAt || new Date().toISOString();
      }
      // Clear hidden markers and update UI
      entry.sessionHidden = false;
      if (ok) {
        entry.hiddenSessionId = null;
        entry.hiddenSessionCreatedAt = null;
      }
      appendCallHistory(entry, { toolName, args: {}, keepSessionOpen: true, startedAt: startedAtIso, finishedAt: finishedAtIso, success: ok, warmup: true });
      renderServers();
      if (activeToolContext && activeToolContext.entry === entry) {
        updateModalSessionInfo(entry);
      }
    } catch (err) {
      console.error('Warm-up session failed:', err);
      // Still unhide UI, but no active session
      entry.sessionHidden = false;
      appendCallHistory(entry, { toolName, args: {}, keepSessionOpen: true, startedAt: startedAtIso, finishedAt: toISOStringWithTZ(new Date()), success: false, warmup: true });
      renderServers();
      if (activeToolContext && activeToolContext.entry === entry) {
        updateModalSessionInfo(entry);
      }
    }
  }

  async function handleModalCloseSession() {
    if (!activeToolContext) {
      return;
    }

    const entry = activeToolContext.entry;
    if (!entry.activeSessionId) {
      return;
    }

    try {
      const response = await fetch('/api/sessions/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: entry.activeSessionId })
      });

      if (response.ok) {
        // Clear session info from entry
        entry.activeSessionId = null;
        entry.sessionCreatedAt = null;
        entry.isWorkflowSession = false;

        // Update UI
        updateModalSessionInfo(entry);

        // Refresh the main server list to update session status there too
        renderServers();
      } else {
        alert('Failed to close session');
      }
    } catch (error) {
      console.error('Error closing session:', error);
      alert('Error closing session: ' + error.message);
    }
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
      lastArgs: { ...lastArgs },
      reportData: null
    };
    renderToolModalContent(activeToolContext);
    const previous = entry.toolTests?.[tool.name];
    if (previous) {
      if (previous.totalResult) {
        setModalResult(previous.totalResult);
        toolModalReport.disabled = !previous.reportData;
      }
      if (previous.reportData) {
        activeToolContext.reportData = previous.reportData;
        toolModalReport.disabled = false;
      }
    }
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
    // Get keepSessionOpen state from the app-level workflow checkbox
    const keepSessionOpen = workflowKeepSessionsOpenCheckbox ? workflowKeepSessionsOpenCheckbox.checked : false;
    const startedAtDate = new Date();
    const startedAtIso = toISOStringWithTZ(startedAtDate);
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
        body: JSON.stringify({ spec: entry.spec, toolName: tool.name, toolArgs: args, keepSessionOpen })
      });
      const data = await response.json();
      const finishedAtDate = new Date();
      const finishedAtIso = toISOStringWithTZ(finishedAtDate);
      const durationMs = finishedAtDate.getTime() - startedAtDate.getTime();
      const handshakeInfo = data.handshake ?? entry.handshake;
      if (!response.ok) {
        throw new Error(data?.error?.details || `HTTP ${response.status}`);
      }
      if (!entry.toolTests) {
        entry.toolTests = {};
      }
      if (data.ok) {
        const normalizedOut = normalizeToolOutput(data.output);
        entry.toolTests[tool.name] = { status: 'ok', output: normalizedOut, rawOutput: data.output, lastArgs: args };
        activeToolContext.lastArgs = args;

        // Handle session info
        if (data.sessionId) {
          entry.activeSessionId = data.sessionId;
          entry.sessionReused = data.sessionReused;
          entry.sessionCreatedAt = data.sessionCreatedAt;
          entry.isWorkflowSession = false; // Replace workflow placeholder with actual MCP session
        } else {
          entry.activeSessionId = null;
          entry.sessionReused = false;
          entry.sessionCreatedAt = null;
          entry.isWorkflowSession = false;
        }

        const resultPayload = { ok: true, output: normalizedOut, rawOutput: data.output };
        setModalResult(resultPayload);
        const reportData = {
          serverName: entry.serverName || entry.displayName || 'unknown',
          toolName: tool.name,
          spec: JSON.parse(JSON.stringify(entry.spec ?? {})),
          args,
          startedAt: startedAtIso,
          finishedAt: finishedAtIso,
          durationMs,
          success: true,
          response: normalizedOut,
          rawResponse: data.output, // Store raw output for raw mode
          error: null,
          handshake: handshakeInfo,
          sessionId: data.sessionId,
          sessionReused: data.sessionReused
        };
        entry.toolTests[tool.name].reportData = reportData;
        entry.toolTests[tool.name].totalResult = resultPayload;
        entry.toolTests[tool.name].startedAt = startedAtIso;
        entry.toolTests[tool.name].finishedAt = finishedAtIso;
        entry.toolTests[tool.name].durationMs = durationMs;
        activeToolContext.reportData = reportData;
        toolModalReport.disabled = false;
        appendCallHistory(entry, { toolName: tool.name, args, keepSessionOpen, startedAt: startedAtIso, finishedAt: finishedAtIso, success: true });

        // Re-render to update session status
        renderServers();
        // Update modal session info
        updateModalSessionInfo(entry);
      } else {
        entry.toolTests[tool.name] = {
          status: 'error',
          error: data.error ?? { kind: 'tool_error', details: 'Unknown error' },
          lastArgs: args
        };
        activeToolContext.lastArgs = args;
        const resultPayload = { ok: false, error: data.error };
        setModalResult(resultPayload);
        const reportData = {
          serverName: entry.serverName || entry.displayName || 'unknown',
          toolName: tool.name,
          spec: JSON.parse(JSON.stringify(entry.spec ?? {})),
          args,
          startedAt: startedAtIso,
          finishedAt: finishedAtIso,
          durationMs,
          success: false,
          response: null,
          error: data.error,
          handshake: handshakeInfo
        };
        entry.toolTests[tool.name].reportData = reportData;
        entry.toolTests[tool.name].totalResult = resultPayload;
        entry.toolTests[tool.name].startedAt = startedAtIso;
        entry.toolTests[tool.name].finishedAt = finishedAtIso;
        entry.toolTests[tool.name].durationMs = durationMs;
        appendCallHistory(entry, { toolName: tool.name, args, keepSessionOpen, startedAt: startedAtIso, finishedAt: finishedAtIso, success: false });

        activeToolContext.reportData = reportData;
        toolModalReport.disabled = false;
      }
      renderServers();
    } catch (err) {
      const finishedAtDate = new Date();
      const finishedAtIso = toISOStringWithTZ(finishedAtDate);
      const durationMs = finishedAtDate.getTime() - startedAtDate.getTime();
      entry.toolTests = entry.toolTests || {};
      entry.toolTests[tool.name] = {
        status: 'error',
        error: { kind: 'network_error', details: err.message },
        lastArgs: args
      };
      activeToolContext.lastArgs = args;
      const resultPayload = { ok: false, error: { kind: 'network_error', details: err.message } };
      setModalResult(resultPayload);
      const reportData = {
        serverName: entry.serverName || entry.displayName || 'unknown',
        toolName: tool.name,
        spec: JSON.parse(JSON.stringify(entry.spec ?? {})),
        args,
        startedAt: startedAtIso,
        finishedAt: finishedAtIso,
        durationMs,
        success: false,
        response: null,
        error: { kind: 'network_error', details: err.message },
        handshake: entry.handshake
      };
      entry.toolTests[tool.name].reportData = reportData;
      entry.toolTests[tool.name].totalResult = resultPayload;
      entry.toolTests[tool.name].startedAt = startedAtIso;
      appendCallHistory(entry, { toolName: tool.name, args, keepSessionOpen, startedAt: startedAtIso, finishedAt: finishedAtIso, success: false });

      entry.toolTests[tool.name].finishedAt = finishedAtIso;
      entry.toolTests[tool.name].durationMs = durationMs;
      activeToolContext.reportData = reportData;
      toolModalReport.disabled = false;
      renderServers();
    } finally {
      toolModalSubmit.disabled = false;
      toolModalSubmit.textContent = 'Run Tool';
    }
  }

  async function diagnoseConfigContent(text, fileName, format) {
    if (!text) return;
    setLoadingConfig(true);
    configFileNameLabel.textContent = `Loading ${fileName}…`;
    try {
      const response = await fetch('/api/config/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configText: text, configFormat: format })
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        const message = data?.error?.details || `Unable to diagnose config (HTTP ${response.status})`;
        throw new Error(message);
      }
      const configObj = data.config ?? { format: data.format, topLevel: {}, servers: [] };
      replaceConfigServers(configObj, data.servers || [], fileName);
    } catch (err) {
      // Log full error to console (helps debugging client-side exceptions)
      try { console.error('[CLIENT] diagnoseConfigContent error', err && err.stack ? err.stack : err); } catch (_) {}
      alert(`Failed to process ${fileName}: ${err.message}`);
      clearCurrentConfigStatus(`${fileName} — failed`);
    } finally {
      setLoadingConfig(false);
      configJsonInput.value = '';
      configTomlInput.value = '';
    }
  }

  async function handleConfigFile(file, format) {
    if (!file) return;
    try {
      const text = await file.text();
      await diagnoseConfigContent(text, file.name, format);
    } catch (err) {
      alert(`Unable to read file: ${err.message}`);
      configFileNameLabel.textContent = `Failed to read ${file.name}`;
    }
  }

  async function exportCurrentConfig(targetFormat) {
    if (!currentConfig) {
      alert('Load a configuration before saving.');
      return;
    }
    try {
      const response = await fetch('/api/config/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: currentConfig, targetFormat })
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        const message = data?.error?.details || `Unable to export config (HTTP ${response.status})`;
        throw new Error(message);
      }
      const extension = targetFormat === 'json' ? 'json' : 'toml';
      const baseName =
        currentConfigFileName && currentConfigFileName.includes('.')
          ? currentConfigFileName.replace(/\.[^.]+$/, '')
          : currentConfigFileName || 'mcp-config';
      const mime = targetFormat === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8';
      const filename = `${baseName}.${extension}`;
      downloadTextFile(filename, data.content, mime);
    } catch (err) {
      alert(`Failed to export config: ${err.message}`);
    }
  }

  function openConfigModal(format, snippet = '', serverName = null) {
    if (!toolModal.classList.contains('hidden')) {
      closeToolModal();
    }
    activeConfigFormat = format;
    activeConfigServerName = serverName;
    const isEdit = Boolean(serverName);
    configModalTitle.textContent = isEdit
      ? `Edit MCP Server: ${serverName}`
      : format === 'toml'
        ? 'Add MCP Server (TOML)'
        : 'Add MCP Server (JSON)';
    configModalDesc.textContent = isEdit
      ? 'Update the configuration snippet for this server. Submit to merge and re-diagnose.'
      : format === 'toml'
        ? 'Paste a TOML snippet that defines one or more [mcp_servers.*] tables to merge into the current configuration.'
        : 'Paste a JSON snippet containing an mcpServers object with one or more server definitions to merge into the current configuration.';
    configModalInput.value = snippet || '';
    configModalMergeButton.disabled = false;
    configModalMergeButton.textContent = isEdit ? 'Update' : 'Merge';
    addJsonServerButton.disabled = true;
    addTomlServerButton.disabled = true;
    if (modalBackdrop.classList.contains('hidden')) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      modalBackdrop.classList.remove('hidden');
    }
    configModal.classList.remove('hidden');
    setTimeout(() => {
      configModalInput.focus({ preventScroll: true });
    }, 0);
  }

  function closeConfigModal() {
    if (configModal.classList.contains('hidden')) {
      return;
    }
    configModal.classList.add('hidden');
    activeConfigFormat = null;
    activeConfigServerName = null;
    configModalMergeButton.disabled = false;
    configModalMergeButton.textContent = 'Merge';
    configModalInput.value = '';
    if (!isLoadingConfig) {
      addJsonServerButton.disabled = false;
      addTomlServerButton.disabled = false;
    }
    if (toolModal.classList.contains('hidden')) {
      modalBackdrop.classList.add('hidden');
      document.body.style.overflow = previousBodyOverflow;
    }
  }

  async function performAddServer(format, snippet) {
    const trimmed = snippet.trim();
    if (!trimmed) {
      alert('No configuration provided.');
      return;
    }
    const baseConfigPayload = currentConfig ? JSON.parse(JSON.stringify(currentConfig)) : null;
    const previousLabel = configFileNameLabel.textContent;
    configModalMergeButton.disabled = true;
    const isEdit = Boolean(activeConfigServerName);
    configModalMergeButton.textContent = 'Merging…';
    try {
      setLoadingConfig(true);
      configFileNameLabel.textContent = 'Merging server configuration…';
      const response = await fetch('/api/config/add-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseConfig: baseConfigPayload, additionText: trimmed, additionFormat: format })
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        const message = data?.error?.details || `Unable to add server (HTTP ${response.status})`;
        throw new Error(message);
      }
      const label = currentConfigFileName || (format === 'toml' ? 'config.toml' : 'mcp.json');
      replaceConfigServers(data.config, data.servers || [], label);
      closeConfigModal();
    } catch (err) {
      alert(`Failed to add server: ${err.message}`);
      configModalMergeButton.disabled = false;
      configModalMergeButton.textContent = isEdit ? 'Update' : 'Merge';
      if (currentConfig) {
        refreshConfigStatusLabel();
      } else {
        configFileNameLabel.textContent = previousLabel;
      }
    } finally {
      setLoadingConfig(false);
      if (!configModal.classList.contains('hidden')) {
        addJsonServerButton.disabled = true;
        addTomlServerButton.disabled = true;
      }
    }
  }

  modeSelect.addEventListener('change', updateFormVisibility);
  updateFormVisibility();
  updateSaveButtons();

  loadJsonButton.addEventListener('click', () => {
    if (isLoadingConfig) return;
    try { configJsonInput.value = ''; } catch (_) {}
    console.info('[ui] Opening file picker for mcp.json');
    configJsonInput.click();
  });

  loadTomlButton.addEventListener('click', () => {
    if (isLoadingConfig) return;
    try { configTomlInput.value = ''; } catch (_) {}
    console.info('[ui] Opening file picker for mcp.toml');
    configTomlInput.click();
  });

  addJsonServerButton.addEventListener('click', () => {
    if (isLoadingConfig) return;
    openConfigModal('json');
  });

  addTomlServerButton.addEventListener('click', () => {
    if (isLoadingConfig) return;
    openConfigModal('toml');
  });

  configJsonInput.addEventListener('change', () => {
    const [file] = configJsonInput.files;
    if (file) {
      console.info('[ui] mcp.json selected:', file.name);
      void handleConfigFile(file, 'json');
    } else {
      console.warn('[ui] No file selected for mcp.json');
    }
  });

  configTomlInput.addEventListener('change', () => {
    const [file] = configTomlInput.files;
    if (file) {
      console.info('[ui] mcp.toml selected:', file.name);
      void handleConfigFile(file, 'toml');
    } else {
      console.warn('[ui] No file selected for mcp.toml');
    }
  });

  saveJsonButton.addEventListener('click', () => {
    if (!saveJsonButton.disabled) {
      void exportCurrentConfig('json');
    }
  });

  saveTomlButton.addEventListener('click', () => {
    if (!saveTomlButton.disabled) {
      void exportCurrentConfig('toml');
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
      toolTests: {},
      callHistory: []
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

  // Add event listeners to format toggle radio buttons to update the display
  const formatRadios = document.getElementsByName('report-format');
  formatRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      // Re-render the modal result with the new format
      if (activeToolContext && activeToolContext.entry && activeToolContext.tool) {
        const entry = activeToolContext.entry;
        const tool = activeToolContext.tool;
        const testResult = entry.toolTests?.[tool.name];
        if (testResult && testResult.status === 'ok') {
          const resultPayload = { ok: true, output: testResult.output, rawOutput: testResult.rawOutput };
          setModalResult(resultPayload);
        }
      }
    });
  });

  toolModalReport.addEventListener('click', () => {
    if (!activeToolContext) {
      alert('No tool execution to report.');
      return;
    }
    const context = activeToolContext;
    const stored =

      context.reportData ||
      context.entry?.toolTests?.[context.tool.name]?.reportData ||
      null;
    if (!stored) {
      alert('Run the tool before generating a report.');
      return;
    }
    // Get the selected format from the radio buttons
    const formatRadios = document.getElementsByName('report-format');
    let formatted = true; // default to formatted
    for (const radio of formatRadios) {
      if (radio.checked) {
        formatted = radio.value === 'formatted';
        break;
      }
    }
    const finishedDate = new Date(stored.finishedAt);
    const timestamp = formatTimestampForFilename(finishedDate);
    const serverSegment = sanitizeFilenameSegment(stored.serverName || 'server');
    const toolSegment = sanitizeFilenameSegment(stored.toolName || 'tool');
    const filename = `MCPDiagnois_Report_${timestamp}_${serverSegment}_${toolSegment}.md`;
    const content = generateToolReport(stored, formatted);
    downloadTextFile(filename, content, 'text/markdown;charset=utf-8');
  });
  toolModalClose.addEventListener('click', closeToolModal);
  toolModalCloseSession.addEventListener('click', handleModalCloseSession);
  if (toolModalHideSession) {
    toolModalHideSession.addEventListener('click', async () => {
      if (!activeToolContext) return;
      const entry = activeToolContext.entry;
      if (!entry) return;

      if (!entry.sessionHidden && entry.activeSessionId) {
        const prevId = entry.activeSessionId;
        const prevCreated = entry.sessionCreatedAt;
        try {
          const resp = await fetch('/api/sessions/close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: prevId })
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || data.ok === false) throw new Error(data?.error || 'Failed to hide (close) session');
        } catch (err) {
          alert(`Failed to hide session: ${err.message}`);
          return;
        }
        entry.activeSessionId = null;
        entry.sessionCreatedAt = null;
        entry.sessionReused = false;
        entry.isWorkflowSession = false;
        entry.sessionHidden = true;
        entry.hiddenSessionId = prevId;
        entry.hiddenSessionCreatedAt = prevCreated;
      }

      updateModalSessionInfo(entry);
      renderServers();
    });
  }

  // Global function for copy button (called from inline onclick)
  window.copyOutputToClipboard = function() {
    const outputElement = document.getElementById('modal-output-text');
    if (!outputElement) return;

    const text = outputElement.textContent;
    navigator.clipboard.writeText(text).then(() => {
      // Visual feedback
      const btn = document.querySelector('.copy-output-btn');
      if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="2" fill="none"/>
          </svg>
          Copied!
        `;
        btn.style.background = '#48bb78';
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.background = '';
        }, 2000);
      }
    }).catch(err => {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    });
  };

  configModalClose.addEventListener('click', closeConfigModal);
  configModalMergeButton.addEventListener('click', () => {
    if (!activeConfigFormat) {
      alert('No target format selected.');
      return;
    }
    void performAddServer(activeConfigFormat, configModalInput.value);
  });
  modalBackdrop.addEventListener('click', () => {
    if (!configModal.classList.contains('hidden')) {
      closeConfigModal();
    } else if (!toolModal.classList.contains('hidden')) {
      closeToolModal();
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!configModal.classList.contains('hidden')) {
        closeConfigModal();
      } else if (!toolModal.classList.contains('hidden')) {
        closeToolModal();
      }
    }
  });

  // Handle output max lines setting
  function updateOutputMaxHeight() {
    const maxLines = parseInt(outputMaxLinesInput.value) || 100;
    const lineHeight = 1.5; // From CSS line-height
    const fontSize = 0.9; // rem
    const remInPx = 16; // Default browser rem size
    const maxHeight = maxLines * lineHeight * fontSize * remInPx;
    document.documentElement.style.setProperty('--output-max-height', `${maxHeight}px`);
  }

  // Initialize output max height
  updateOutputMaxHeight();

  // Update when user changes the value
  outputMaxLinesInput.addEventListener('change', updateOutputMaxHeight);
  outputMaxLinesInput.addEventListener('input', updateOutputMaxHeight);
})();
