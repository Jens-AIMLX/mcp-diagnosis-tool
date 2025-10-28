# MCP Diagnosis Tool – Programmatic API

This document describes the HTTP API to drive the same functionality as the frontend.

## Base URL
- http://localhost:3060

## Server control
- POST /api/server/restart → { ok, message }
- POST /api/server/shutdown → { ok, message }
- GET  /api/server/info → { ok, pid, port, startTime, ... }

## Config
- POST /api/config/diagnose
  - Body: { configText?: string, config?: object, configFormat?: 'json'|'toml' }
  - Returns normalized config + diagnoses.
  - Note: expects canonical configs with top-level mcpServers (JSON) or [mcp_servers.*] (TOML).
- POST /api/config/add-server → merge a server snippet into a normalized config
- POST /api/config/export → convert normalized config to JSON/TOML
- POST /api/config/remove-server → remove a server by name

## Sessions
- GET  /api/sessions → { ok, sessions }
- POST /api/sessions/open → { ok, sessionId, transport, handshake, sessionReused, createdAt }
- POST /api/sessions/restart → { ok, closedCount, sessionId, transport, handshake }
- POST /api/sessions/close → { ok }
- POST /api/sessions/close-all → { ok, closed, errors }

## Tools
- POST /api/tools/call
  - Body: { spec, toolName, toolArgs?, keepSessionOpen? }
  - Response: { ok, transport, handshake?, output?, sessionId?, sessionReused?, error? }
- POST /api/tools/report
  - Body: { spec, toolName, toolArgs?, keepSessionOpen?, savePath?, filename? }
  - Response: { ok, path, content, callResult }

## Spec examples
- Playwright (STDIO):
```
{ "mode":"stdio", "command":"npx", "args":[
  "-y","@playwright/mcp@latest",
  "--output-dir","C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots",
  "--save-session","--save-trace","--browser","chrome",
  "--viewport-size","2400,1350","--isolated","--no-sandbox"
]}
```
- Cognitive Visual Analytics (STDIO):
```
{ "mode":"stdio", "command":"npx", "args":["-y","cognitive-visual-analytics@latest"] }
```

## Example: Parameterset 2 (cognitive_visual_dimensions)
- Reusable script: `scripts/params2_cognitive_api.ps1`
- What it does:
  - Opens/keeps Playwright session
  - Navigates to `/zertifikat`
  - Captures deterministic JPEG
  - Runs `cognitive_visual_dimensions`, `cognitive_visual_controls`, `cognitive_visual_tables`
  - Saves reports in `.evidence/reports`

Run:
```
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\params2_cognitive_api.ps1
```

## Lessons learned
- Playwright tool schema requires correct keys: use `element` and `ref` (ids like `e22`, `e24`, `e27`). Using `field` fails validation.
- Always reuse the same Playwright session for multi-step flows; it stabilizes DOM focus/state.
- Use exact specs from your JSON/subconfigs (e.g., `--config`), and prefer 8.3 paths like `ONEDRI~2` to avoid quoting issues.
- Add short waits between navigation and actions to avoid targeting not-ready elements.

## Logging
- server.log (human)
- server.debug.log (JSON)

## Notes
- Session reuse matches UI semantics; timeouts respect startup/tool timeout in spec.
- /api/tools/report output matches UI “Download Report”.
