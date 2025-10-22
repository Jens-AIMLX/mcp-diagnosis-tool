/* List tools from Playwright MCP server */
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const spec = {
  mode: 'stdio',
  command: 'npx',
  args: [
    '-y', '@playwright/mcp@latest',
    '--output-dir', 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots',
    '--save-session', '--save-trace',
    '--browser', 'chrome',
    '--viewport-size', '2400,1350',
    '--no-sandbox', '--isolated'
  ],
  env: { PLAYWRIGHT_BROWSERS_PATH: '0' }
};

async function main(){
  const client = new Client({ name: 'mcp-tool-lister', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: spec.command, args: spec.args, env: spec.env });
  await client.connect(transport);
  try {
    const resp = await client.request({ method: 'tools/list', params: {} });
    console.log(JSON.stringify(resp, null, 2));
  } finally {
    await client.close();
  }
}

main().catch(err=>{ console.error(err); process.exit(1); });

