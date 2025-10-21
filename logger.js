const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, 'server.debug.log');
const inMemory = [];
const MAX_INMEMORY = 1000;

function writeLine(line) {
  try {
    fs.appendFileSync(LOG_PATH, line + '\n', { encoding: 'utf8' });
  } catch (_) {
    // also emit to stderr so issues are visible in server.log
    try { process.stderr.write(`[LOGGER_ERROR] Failed writing to ${LOG_PATH}: ${_?.message}\n`); } catch (__) {}
  }
}

function log(event, payload) {
  const record = {
    ts: new Date().toISOString(),
    event,
    ...payload
  };
  writeLine(JSON.stringify(record));
  try { console.log(`[DEBUG_JSON] ${JSON.stringify(record)}`); } catch (_) {}
  try {
    inMemory.push(record);
    if (inMemory.length > MAX_INMEMORY) inMemory.shift();
  } catch (_) {}
}

function logError(event, error, extra) {
  const record = {
    ts: new Date().toISOString(),
    event,
    level: 'error',
    error: {
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    },
    ...extra
  };
  writeLine(JSON.stringify(record));
  try { console.error(`[DEBUG_JSON] ${JSON.stringify(record)}`); } catch (_) {}
  try {
    inMemory.push(record);
    if (inMemory.length > MAX_INMEMORY) inMemory.shift();
  } catch (_) {}
}

function getRecent(limit = 200) {
  try {
    const n = Math.max(1, Math.min(limit, inMemory.length));
    return inMemory.slice(inMemory.length - n);
  } catch (_) {
    return [];
  }
}

module.exports = { log, logError, LOG_PATH, getRecent };


