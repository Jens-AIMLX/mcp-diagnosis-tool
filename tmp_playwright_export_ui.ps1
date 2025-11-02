$API='http://localhost:3060/api'
$PW = @{
  mode='stdio';
  command='npx';
  args=@(
    '-y',
    '@playwright/mcp@latest',
    '--output-dir',
    'C:/Users/jenss/OneDrive - Singularyt UG/Code/Test/.evidence/screenshots/tmp_playwright_export',
    '--browser','chrome','--viewport-size','2400,1350','--isolated','--no-sandbox'
  )
}

Write-Host 'OPENING SESSION...'
$open = @{ spec = $PW } | ConvertTo-Json -Depth 12
try {
  $resp = Invoke-RestMethod "$API/sessions/open" -Method Post -Body $open -ContentType 'application/json' -TimeoutSec 120
  Write-Host 'OPEN RESPONSE:'
  $resp | ConvertTo-Json -Compress
  $sid = $resp.sessionId
} catch {
  Write-Host 'OPEN FAILED'
  Write-Host $_.Exception.Message
  exit 2
}
Start-Sleep -s 1

Write-Host 'NAVIGATING to UI...'
# Add ?automate_export=1 so the page logs artifacts to console for automation capture
$nav = @{ spec=$PW; toolName='browser_navigate'; toolArgs=@{ url='http://localhost:3060/?automate_export=1' }; keepSessionOpen=$true } | ConvertTo-Json -Depth 12
try {
  $r2 = Invoke-RestMethod "$API/tools/call" -Method Post -Body $nav -ContentType 'application/json' -TimeoutSec 120
  Write-Host 'NAV RESPONSE:'
  $r2 | ConvertTo-Json -Compress
} catch {
  Write-Host 'NAV FAILED'
  Write-Host $_.Exception.Message
  exit 3
}
Start-Sleep -s 1

Write-Host 'EVALUATING in page...'
$func = @'
try { window.apiBuildExportForEntry && window.apiBuildExportForEntry({ serverName: 'playwright', callHistory: [ { toolName: 'noop', args: {} } ] }); } catch(e) { ({ ok: false, error: String(e) }); }
'@
 

$evalBody = @{ spec=$PW; toolName='browser_evaluate'; toolArgs=@{ function = $func }; keepSessionOpen=$true } | ConvertTo-Json -Depth 20
try {
  $r3 = Invoke-RestMethod "$API/tools/call" -Method Post -Body $evalBody -ContentType 'application/json' -TimeoutSec 120
  Write-Host 'EVAL RESPONSE:'
  $r3 | ConvertTo-Json -Depth 20
} catch {
  Write-Host 'EVAL FAILED'
  Write-Host $_.Exception.Message
  exit 4
}
Start-Sleep -s 1

Write-Host 'FALLBACK: calling server /api/export/template to build artifacts from a mock workflow'
$templateReq = @{ spec = $PW; serverName = 'playwright'; callHistory = @(@{ toolName = 'browser_navigate'; args = @{ url = 'http://localhost:3060' } }) } | ConvertTo-Json -Depth 12
try {
  $tpl = Invoke-RestMethod "$API/export/template" -Method Post -Body $templateReq -ContentType 'application/json' -TimeoutSec 60
  Write-Host 'TEMPLATE RESPONSE:'
  $tpl | ConvertTo-Json -Depth 6
} catch {
  Write-Host 'TEMPLATE CALL FAILED'
  Write-Host $_.Exception.Message
  exit 5
}

if ($sid) {
  Write-Host 'CLOSING SESSION...'
  $close = @{ sessionId = $sid } | ConvertTo-Json -Depth 6
  try {
    $rc = Invoke-RestMethod "$API/sessions/close" -Method Post -Body $close -ContentType 'application/json' -TimeoutSec 30
    Write-Host 'CLOSE RESPONSE:'
    $rc | ConvertTo-Json -Compress
  } catch {
    Write-Host 'CLOSE FAILED'
    Write-Host $_.Exception.Message
  }
} else {
  Write-Host 'NO SESSION ID to close'
}

Write-Host 'DONE.'
