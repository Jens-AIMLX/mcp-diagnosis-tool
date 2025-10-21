# Session Management Feature

## Overview
This feature allows the MCP Diagnosis Tool to keep MCP server sessions (like Playwright browsers) open across multiple tool calls, enabling multi-step workflows.

## What Was Implemented

### Backend (mcpDoctor.js & server.js)

1. **Session Store**: Global Map that stores active MCP client connections
   - Key: unique sessionId
   - Value: { client, transportName, handshake, spec, createdAt }

2. **Session Management Functions**:
   - `getOrCreateSession(spec, keepAlive)` - Reuses existing session or creates new one
   - `specsMatch(spec1, spec2)` - Checks if two server specs are equivalent
   - `closeSession(sessionId)` - Closes a specific session
   - `listSessions()` - Lists all active sessions
   - `closeAllSessions()` - Closes all sessions

3. **Updated callTool Function**:
   - Added `options.keepSessionOpen` parameter
   - Returns `sessionId` and `sessionReused` flags
   - Keeps client connection alive when `keepSessionOpen=true`

4. **New API Endpoints**:
   - `GET /api/sessions` - List all active sessions
   - `POST /api/sessions/close` - Close a specific session
   - `POST /api/sessions/close-all` - Close all sessions
   - Updated `POST /api/tools/call` to accept `keepSessionOpen` flag

### Frontend (index.html, script.js, style.css)

1. **UI Components** (in tool modal):
   - Checkbox: "Keep session open (for multi-step workflows)"
   - Session status display showing:
     - Session creation status (new/reused)
     - Session ID
   - "Close Session" button

2. **JavaScript Functions**:
   - `updateSessionStatus(entry, sessionId, sessionReused)` - Updates UI to show session state
   - `handleCloseSession()` - Closes active session via API
   - Updated `submitToolModal()` to pass `keepSessionOpen` flag
   - Updated `openToolModal()` to restore session state

3. **CSS Styling**:
   - `.modal-session-control` - Container for session controls
   - `.session-checkbox-label` - Checkbox styling
   - `.session-status` - Session status display (green when active)
   - `.session-status-label` & `.session-status-id` - Status text styling

## How It Works

### User Workflow

1. **Enable Session Persistence**:
   - User opens a tool modal
   - Checks "Keep session open" checkbox
   - Runs a tool (e.g., `browser_navigate`)

2. **Session Created**:
   - MCP client connection stays open
   - Session ID displayed in modal
   - Green status indicator shows "New session created"

3. **Run Multiple Tools**:
   - User runs another tool (e.g., `browser_type`)
   - Session is reused automatically
   - Status shows "Session reused"
   - Browser/server stays open

4. **Close Session**:
   - User clicks "Close Session" button
   - Browser/server closes
   - Session status clears

### Technical Flow

```
Tool Call with keepSessionOpen=true
  ↓
getOrCreateSession() checks for existing session
  ↓
  ├─ Found: Reuse client (sessionReused=true)
  └─ Not Found: Create new client, store in Map
  ↓
Execute tool call
  ↓
Return sessionId to frontend
  ↓
Frontend stores sessionId in entry.activeSessionId
  ↓
Next tool call finds existing session and reuses it
```

## Benefits

1. **Multi-Step Workflows**: Enable complex automation sequences (login → navigate → fill form → submit)
2. **Browser Persistence**: Keep Playwright browser open for visual testing
3. **Generic Solution**: Works with ANY MCP server, not just Playwright
4. **Per-Server Sessions**: Each MCP server gets its own session management
5. **User Control**: Explicit opt-in via checkbox, manual close button

## Example Use Case: Playwright Login Flow

```
1. Check "Keep session open"
2. Call browser_navigate → "https://example.com/login"
   - Browser opens and stays open
   - Session ID: stdio-npx-1729534567-abc123

3. Call browser_type → Fill username field
   - Session reused (browser still open)

4. Call browser_type → Fill password field
   - Session reused

5. Call browser_click → Click login button
   - Session reused

6. Click "Close Session"
   - Browser closes
   - Session terminated
```

## Configuration Example

Your `test/mcp-config-qa.json` already has the correct Playwright configuration:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@latest",
        "--output-dir",
        "C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots",
        "--save-session",
        "--save-trace",
        "--browser",
        "chrome",
        "--viewport-size",
        "2400,1350",
        "--no-sandbox"
      ]
    }
  }
}
```

No additional flags needed - the session management is handled by the diagnosis tool itself!

## Testing

1. Start the server: `node server.js`
2. Open http://localhost:3000
3. Load your config file
4. Open a tool (e.g., `browser_navigate`)
5. Check "Keep session open"
6. Run the tool
7. Notice the browser stays open and session status appears
8. Run another tool - session will be reused
9. Click "Close Session" to terminate

## API Reference

### POST /api/tools/call
```json
{
  "spec": { "mode": "stdio", "command": "npx", "args": [...] },
  "toolName": "browser_navigate",
  "toolArgs": { "url": "https://example.com" },
  "keepSessionOpen": true
}
```

Response:
```json
{
  "ok": true,
  "output": {...},
  "sessionId": "stdio-npx-1729534567-abc123",
  "sessionReused": false
}
```

### GET /api/sessions
Response:
```json
{
  "ok": true,
  "sessions": [
    {
      "sessionId": "stdio-npx-1729534567-abc123",
      "spec": { "mode": "stdio", "command": "npx", "args": [...] },
      "transportName": "stdio",
      "createdAt": "2025-10-21T10:30:00.000Z"
    }
  ]
}
```

### POST /api/sessions/close
```json
{
  "sessionId": "stdio-npx-1729534567-abc123"
}
```

Response:
```json
{
  "ok": true
}
```

