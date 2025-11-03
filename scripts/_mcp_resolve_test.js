try {
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
  console.log('require succeeded: Client is', typeof Client);
} catch (err) {
  console.error('require failed:', err && err.message ? err.message : err);
  process.exit(1);
}
