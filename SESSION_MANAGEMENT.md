# Session Management Feature

## Overview
This feature allows the MCP Diagnosis Tool to keep MCP server sessions (like Playwright browsers) open across multiple tool calls, enabling multi-step workflows. **This is a major feature in version 1.1.**

## What Was Implemented

### Backend (mcpDoctor.js & server.js)

1. **Session Store**: Global Map that stores active MCP client connections
   - Key: unique sessionId (format: `{transport}-{command}-{timestamp}-{random}`)
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

5. **Enhanced Logging**:
   - Structured JSON logging to `server.debug.log`
   - Console logging with `[DEBUG]` prefixes in `server.log`
   - Logs session creation, reuse, tool calls, and session closure
   - Timestamps and full session parameters captured

### Frontend (index.html, script.js, style.css)

1. **UI Components** (at server level, next to handshake):
   - Checkbox: "Keep session open (for multi-step workflows)" (shows "(hidden)" when the session is hidden)
   - Session status display showing:
     - Session creation status (new/reused)
     - Session ID
   - "Hide Session" button (toggles a visual hidden state; the session is still reused when kept open)
   - "Close Session" button (enabled when session active)

2. **JavaScript Functions**:
   - `buildSessionControlsBlock(entry)` - Generates session control HTML
   - `handleCloseServerSession(entry)` - Closes active session via API
   - Updated `submitToolModal()` to read `keepSessionOpen` from server checkbox
   - Updated `renderServers()` to show session status and update button states

3. **CSS Styling**:
   - `.session-controls-block` - Container for session controls
   - `.session-controls-row` - Row layout for checkbox and button
   - `.session-checkbox-label` - Checkbox styling
   - `.session-close-button` - Close button styling (disabled state)
   - `.session-status` - Session status display (green when active)
   - `.session-status-label` & `.session-status-id` - Status text styling


### Hidden vs Open

- Hidden indicates the session is visually hidden in the UI. Pressing "Hide Session" will close the current browser window (terminates the active session) while keeping the server entry marked as hidden.
- Hidden sessions are still considered for reuse semantics: when you run a tool again with "Keep session open" checked, a fresh session will be created and then reused for subsequent calls.
- Both the server card and the tool modal show "State: Hidden" or "State: Open" and align the display (ID, Created, State).

## How It Works

### User Workflow

1. **Enable Session Persistence**:
   - User loads config and expands a server (e.g., Playwright)
   - Checks "Keep session open" checkbox (next to handshake section)
   - Opens a tool modal and runs a tool (e.g., `browser_navigate`)

2. **Session Created**:
   - MCP client connection stays open
   - Session ID displayed in server details
   - Green status indicator shows "New session created"
   - "Close Session" button becomes enabled

3. **Run Multiple Tools**:
   - User runs another tool (e.g., `browser_type`)
   - Session is reused automatically
   - Status shows "Session reused"
   - Browser/server stays open

4. **Close Session**:
   - User clicks "Close Session" button
   - Browser/server closes
   - Session status clears
   - "Close Session" button becomes disabled

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

1. Start the server: `.\start.bat` (or `node server.js`)
2. Open http://localhost:3060
3. Load your config file (e.g., `test/mcp-config-qa.json`)
4. Expand the Playwright server
5. Check "Keep session open" checkbox (next to handshake section)
6. Open a tool (e.g., `browser_navigate`) and run it
7. Notice the browser stays open and session status appears in server details
8. Run another tool - session will be reused automatically
9. Click "Close Session" to terminate the browser

## Logging and Debugging

The system provides comprehensive logging for debugging:

### server.log
Contains human-readable debug output:
```
[DEBUG] tool_call_begin browser_navigate keep=true
[DEBUG] tool_call_success browser_navigate sessionId=stdio-npx-1761082094450-0eqxpxo
[DEBUG] callTool result - ok: true, sessionId: stdio-npx-1761082094450-0eqxpxo, sessionReused: true
```

### server.debug.log
Contains structured JSON logs:
```json
{"ts":"2025-10-21T21:59:02.234Z","event":"tools_call_request","toolName":"browser_navigate","keepSessionOpen":true,"spec":{"mode":"stdio","command":"npx","args":["-y","@playwright/mcp@latest",...]},"args":{"url":"https://example.com"}}
{"ts":"2025-10-21T21:59:02.235Z","event":"session_reuse","sessionId":"stdio-npx-1761082094450-0eqxpxo","mode":"stdio","command":"npx","args":["-y","@playwright/mcp@latest",...]}
{"ts":"2025-10-21T21:59:03.296Z","event":"tool_call_success","toolName":"browser_navigate","sessionId":"stdio-npx-1761082094450-0eqxpxo","sessionReused":true,"transport":"stdio","spec":{...},"endedAt":"2025-10-21T21:59:03.296Z"}
{"ts":"2025-10-21T21:59:03.297Z","event":"tool_call_end","toolName":"browser_navigate","sessionId":"stdio-npx-1761082094450-0eqxpxo","keepSessionOpen":true,"closed":false,"endedAt":"2025-10-21T21:59:03.296Z"}
```

### Key Log Events
- `session_created` - New session established with full spec and parameters
- `session_reuse` - Existing session reused for subsequent tool calls
- `tool_call_begin` - Tool execution started with session context
- `tool_call_success` - Tool completed successfully with session info
- `tool_call_end` - Tool execution finished with session state
- `session_closed` - Session terminated and cleaned up

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

