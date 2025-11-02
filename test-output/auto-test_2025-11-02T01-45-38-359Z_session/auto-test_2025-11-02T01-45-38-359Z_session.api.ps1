# API replay PowerShell script for MCP Diagnosis Tool v test-version-1
# Usage: powershell -File auto-test_2025-11-02T01-45-38-359Z_session.api.ps1 -BaseUrl http://localhost:3060
$BaseUrl = $args[0] ; if (-not $BaseUrl) { $BaseUrl = 'http://localhost:3060' }
$spec = {
  "mode": "http",
  "url": "http://localhost:3060"
}
Write-Host "Opening session for spec via $BaseUrl"
$resp = Invoke-RestMethod -Method Post -Uri ($BaseUrl + '/api/sessions/open') -ContentType 'application/json' -Body (ConvertTo-Json @{ spec = $spec } -Depth 10)
if (-not $resp.sessionId) { Write-Error "Failed to open session: $($resp | ConvertTo-Json -Depth 5)" ; exit 2 }
$sessionId = $resp.sessionId
Write-Host "Session opened: $sessionId"
# No steps defined in template. Use Invoke-RestMethod -Uri ($BaseUrl + '/api/tools/call') -Method Post -ContentType 'application/json' -Body (ConvertTo-Json @{ sessionId = $sessionId; tool='toolName'; args=@{} } -Depth 10)
Write-Host "Closing session"
Invoke-RestMethod -Method Post -Uri ($BaseUrl + '/api/sessions/close') -ContentType 'application/json' -Body (ConvertTo-Json @{ sessionId = $sessionId } -Depth 5)
