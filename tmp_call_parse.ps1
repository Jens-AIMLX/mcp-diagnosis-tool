$API='http://localhost:3060/api/export/parse-snippet'
$toml = @'
[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]
'@
$body = @{ text = $toml } | ConvertTo-Json -Depth 10

Write-Host "POSTing toml to $API"
try {
  $res = Invoke-RestMethod -Uri $API -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 60
  $res | ConvertTo-Json -Depth 8
} catch {
  Write-Host 'ERROR:' $_.Exception.Message
  exit 2
}
