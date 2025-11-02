$API='http://localhost:3060/api/export/template'
$body = @{ 
  spec = @{ 
    mode='stdio'
    command='node'
    args=@('-v')
  }
  serverName='test_playground'
  appVersion='1.2.1.11'
} | ConvertTo-Json -Depth 12

Write-Host "POSTing to $API"
try {
  $res = Invoke-RestMethod -Uri $API -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 120
  $res | ConvertTo-Json -Depth 8
} catch {
  Write-Host 'ERROR:' $_.Exception.Message
  exit 2
}
