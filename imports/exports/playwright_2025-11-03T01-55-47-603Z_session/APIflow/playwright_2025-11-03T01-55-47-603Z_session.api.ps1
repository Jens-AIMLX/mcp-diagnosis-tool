# Powershell shim generated
# Base URL first arg
$BaseUrl = $args[0]; if (-not $BaseUrl) { $BaseUrl = 'http://localhost:3060' }
$servers = [
  {
    "name": "playwright_2025-11-03T01-55-47-603Z_session",
    "spec": {
      "mode": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@latest",
        "--config",
        "C:/Users/jenss/ONEDRI~2/Code/Test/mcpconfig/subconfigs/plwghtconfig_cognitive.json"
      ]
    }
  }
]
$sessions = @{}
foreach ($s in $servers) {
  $resp = Invoke-RestMethod -Method Post -Uri ($BaseUrl + '/api/sessions/open') -ContentType 'application/json' -Body (ConvertTo-Json @{ spec = $s.spec } -Depth 10)
  $sessions[$s.name] = $resp.sessionId
}
foreach ($step in []) {
  $sid = $sessions[$step.server]; if (-not $sid) { Continue }
  $call = Invoke-RestMethod -Method Post -Uri ($BaseUrl + '/api/tools/call') -ContentType 'application/json' -Body (ConvertTo-Json @{ sessionId = $sid; tool = $step.tool; args = $step.args } -Depth 10)
  Write-Host "Result: $($call | ConvertTo-Json -Depth 5)"
}
