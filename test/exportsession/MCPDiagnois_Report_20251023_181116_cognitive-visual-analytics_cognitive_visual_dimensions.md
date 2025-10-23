# MCP Tool Call Report

- **Server Name:** cognitive-visual-analytics
- **Tool:** cognitive_visual_dimensions
- **Mode:** stdio
- **Call Started:** 2025-10-23T16:11:15.688Z
- **Response Received:** 2025-10-23T16:11:16.001Z
- **Duration:** 313 ms (313 ms)
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
  "content": [
    {
      "type": "text",
      "text": "{\n  \"analyzed_paths\": {\n    \"screenshot\": \"C:\\\\Users\\\\jenss\\\\ONEDRI~2\\\\Code\\\\Test\\\\.evidence\\\\screenshots\\\\localhost-3002-home.png\"\n  },\n  \"success\": false,\n  \"error\": \"\",\n  \"details\": null\n}"
    }
  ]
}
```