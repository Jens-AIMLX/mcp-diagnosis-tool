$API='http://localhost:3060/api/export/from-snippet'
$toml = @'
[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]
'@
$body = @{ snippet = $toml; serverName='playwright'; appVersion='1.2.1.11' } | ConvertTo-Json -Depth 12

Write-Host "POSTing to $API"
try {
  $res = Invoke-RestMethod -Uri $API -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 60
  $res | ConvertTo-Json -Depth 8
} catch {
  Write-Host 'ERROR:' $_.Exception.Message
  exit 2
}
