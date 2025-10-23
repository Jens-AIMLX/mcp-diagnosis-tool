const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, 'server.debug.log');
const inMemory = [];
const MAX_INMEMORY = 1000;

// --- Managed raw log stream for console/stdout mirroring (server.log) ---
let rawLogPath = path.join(__dirname, 'server.log');
let rawStream = null;
let interceptorsAttached = false;
let origStdoutWrite = null;
let origStderrWrite = null;

function openRawStream() {
  if (rawStream) return rawStream;
  try {
    rawStream = fs.createWriteStream(rawLogPath, { flags: 'a', encoding: 'utf8' });
  } catch (_) {
    try { process.stderr.write(`[LOGGER_ERROR] failed opening ${rawLogPath}: ${_?.message}\n`); } catch(__) {}
    rawStream = null;
  }
  return rawStream;
}

function closeRawStream() {
  if (rawStream) {
    try { rawStream.end(); } catch(_) {}
    rawStream = null;
  }
}

function attachConsoleInterceptors() {
  if (interceptorsAttached) return;
  interceptorsAttached = true;
  openRawStream();
  origStdoutWrite = process.stdout.write.bind(process.stdout);
  origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = function(chunk, encoding, cb) {
    try { if (rawStream) rawStream.write(chunk); } catch(_) {}
    return origStdoutWrite(chunk, encoding, cb);
  };
  process.stderr.write = function(chunk, encoding, cb) {
    try { if (rawStream) rawStream.write(chunk); } catch(_) {}
    return origStderrWrite(chunk, encoding, cb);
  };
}

function detachConsoleFile() {
  closeRawStream();
}

function rotateConsoleFile(newBasePath) {
  // Close current, rename old, reopen new empty file
  const base = newBasePath || rawLogPath;
  try {
    closeRawStream();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const rotated = `${base}.${ts}.rotated`;
    try { if (fs.existsSync(base)) fs.renameSync(base, rotated); } catch(_) {}
    rawLogPath = base; // keep same base
  } catch (err) {
    try { process.stderr.write(`[LOGGER_ERROR] rotate failed: ${err?.message}\n`); } catch(_) {}
  }
  openRawStream();
  return { ok: !!rawStream, path: rawLogPath };
}


// --- 24h rolling (daily at local midnight) ---
let nextRotationTimer = null;
let nextRotationAt = null;
function computeNextMidnight() {
  const now = new Date();
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d;
}
function startRolling24Hours() {
  try { if (!interceptorsAttached) attachConsoleInterceptors(); } catch(_) {}
  function schedule() {
    const next = computeNextMidnight();
    nextRotationAt = next;
    const delay = Math.max(1000, next.getTime() - Date.now());
    if (nextRotationTimer) clearTimeout(nextRotationTimer);
    nextRotationTimer = setTimeout(() => {
      try { rotateConsoleFile(rawLogPath); } catch(_) {}
      schedule();
    }, delay);
  }
  schedule();
}
function getNextRotationTs() {
  try { return nextRotationAt ? nextRotationAt.toISOString() : null; } catch(_) { return null; }
}

function writeLine(line) {
  try {
    fs.appendFileSync(LOG_PATH, line + '\n', { encoding: 'utf8' });
  } catch (_) {
    // also emit to stderr so issues are visible
    try { process.stderr.write(`[LOGGER_ERROR] Failed writing to ${LOG_PATH}: ${_?.message}\n`); } catch (__) {}
  }
}

function log(event, payload) {
  const record = { ts: new Date().toISOString(), event, ...payload };
  writeLine(JSON.stringify(record));
  try { console.log(`[DEBUG_JSON] ${JSON.stringify(record)}`); } catch (_) {}
  try { inMemory.push(record); if (inMemory.length > MAX_INMEMORY) inMemory.shift(); } catch (_) {}
}

// Enhanced logging function that truncates large payloads for readability
function logWithTruncation(event, payload, maxOutputLength = 500) {
  const record = { ts: new Date().toISOString(), event, ...payload };

  // Truncate large output fields for console display
  const consoleRecord = { ...record };
  if (consoleRecord.output && typeof consoleRecord.output === 'object') {
    const outputStr = JSON.stringify(consoleRecord.output);
    if (outputStr.length > maxOutputLength) {
      consoleRecord.output = `[TRUNCATED ${outputStr.length} chars] ${outputStr.substring(0, maxOutputLength)}...`;
      consoleRecord.outputTruncated = true;
      consoleRecord.outputFullLength = outputStr.length;
    }
  }

  // Write full record to file
  writeLine(JSON.stringify(record));
  // Write truncated record to console
  try { console.log(`[DEBUG_JSON] ${JSON.stringify(consoleRecord)}`); } catch (_) {}
  try { inMemory.push(record); if (inMemory.length > MAX_INMEMORY) inMemory.shift(); } catch (_) {}
}

function logError(event, error, extra) {
  const record = {
    ts: new Date().toISOString(), event, level: 'error',
    error: { message: error?.message, code: error?.code, stack: error?.stack },
    ...extra
  };
  writeLine(JSON.stringify(record));
  try { console.error(`[DEBUG_JSON] ${JSON.stringify(record)}`); } catch (_) {}
  try { inMemory.push(record); if (inMemory.length > MAX_INMEMORY) inMemory.shift(); } catch (_) {}
}

function getRecent(limit = 200) {
  try { const n = Math.max(1, Math.min(limit, inMemory.length)); return inMemory.slice(inMemory.length - n); } catch (_) { return []; }
}

module.exports = {
  log, logError, logWithTruncation, LOG_PATH, getRecent,
  attachConsoleInterceptors, detachConsoleFile, rotateConsoleFile,
  startRolling24Hours, getNextRotationTs
};
