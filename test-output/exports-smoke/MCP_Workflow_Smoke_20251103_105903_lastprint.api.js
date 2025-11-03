const fs=require('fs');
const __MCP_export_results__=[{server:'s',tool:'t',result:{hello:'world'}}];
fs.writeFileSync('MCP_Workflow_Smoke_20251103_105903_lastprint.exported.json', JSON.stringify({exported_at:new Date().toISOString(),servers:[],steps:__MCP_export_results__},null,2));
if (__MCP_export_results__.length) console.log(JSON.stringify(__MCP_export_results__[__MCP_export_results__.length-1].result, null, 2));
