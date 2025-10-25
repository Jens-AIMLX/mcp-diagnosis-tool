# MCP Tool Call Report

- **Server Name:** cognitive-visual-analytics
- **Tool:** cognitive_visual_dimensions
- **Mode:** stdio
- **Call Started:** 2025-10-24T05:10:30.174Z
- **Response Received:** 2025-10-24T05:10:30.412Z
- **Duration:** 238 ms (238 ms)
- **Result:** Success

## Handshake
```json
{
  "transport": null,
  "protocolVersion": "negotiated",
  "serverInfo": {
    "name": "cognitive-visual-req",
    "version": "1.0.0"
  },
  "capabilities": {
    "tools": {}
  },
  "instructions": null
}
```

## Server Configuration
```json
{
  "mode": "stdio",
  "command": "node",
  "args": [
    "C:/Users/jenss/ONEDRI~2/Code/source/AIServer/UserPerpectiveAI/mcp-server/mcp-server-stdio.js",
    "--config",
    "C:/Users/jenss/ONEDRI~2/Code/Test/mcpconfig/subconfigs/cognitive-visual-config.json"
  ]
}
```

## Tool Arguments
```json
{}
```

## Output
```json
{
  "analyzed_paths": {
    "screenshot": "C:\\Users\\jenss\\ONEDRI~2\\Code\\Test\\.evidence\\screenshots\\page-2025-10-24T05-10-12-974Z.jpeg"
  },
  "success": false,
  "error": "AggregateError",
  "details": {
    "code": "ECONNREFUSED"
  }
}
```