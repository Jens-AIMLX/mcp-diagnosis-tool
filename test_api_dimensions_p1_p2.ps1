$API_BASE = 'http://localhost:3060/api'

# API Specs from testplan
$PW = @{
  mode = 'stdio'
  command = 'npx'
  args = @('-y', '@playwright/mcp@latest', '--output-dir', 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots/cognitive', '--browser', 'chrome', '--viewport-size', '2400,1350', '--isolated', '--no-sandbox')
}

$CVA = @{
  mode = 'stdio'
  command = 'node'
  args = @('C:/Users/jenss/ONEDRI~2/Code/source/AIServer/UserPerpectiveAI/mcp-server/mcp-server-stdio.js')
  env = @{
    NODE_ENV = 'production'
    SCREENSHOT_PATH = '#PLAYWRIGHTPATH#'
    CALIBRATION_PATH = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/calibrate'
    DIFFERENCE_PATH = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/diffbase'
    REPORT_PATH = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/reports'
    AUTO_SCREENSHOT = 'OFF'
    SCREENSHOTFOLDERS_PER_WORKSPACE = 'OFF'
    AUTO_GRAB = 'OFF'
    URLGRABFOLDERS_PER_WORKSPACE = 'OFF'
    PLAYWRIGHT_CONFIG_JSON = '{"outputDir": "C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots/cognitive", "browser": {"browserName": "chromium", "isolated": true, "launchOptions": {"headless": false}, "contextOptions": {"viewport": {"width": 2400, "height": 1350}}}}'
  }
  toolTimeoutSec = 120
}

Write-Host '========================================' -ForegroundColor Cyan
Write-Host 'API Testplan Validation' -ForegroundColor Cyan
Write-Host 'Testing: cognitive_visual_dimensions' -ForegroundColor Cyan
Write-Host 'Parametersets: 1 and 2' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan

# ============================================================================
# PLAYWRIGHT LOGIN AND CAPTURE
# ============================================================================
Write-Host "`n[PLAYWRIGHT] Login and Capture Workflow" -ForegroundColor Yellow

try {
  # 1. Open session
  Write-Host '  1. Opening Playwright session...' -ForegroundColor Gray
  $body = @{spec = $PW} | ConvertTo-Json -Depth 10
  Invoke-RestMethod "$API_BASE/sessions/open" -Method Post -Body $body -ContentType 'application/json' | Out-Null
  
  # 2. Navigate to login page
  Write-Host '  2. Navigating to login page...' -ForegroundColor Gray
  $body = @{spec=$PW; toolName='browser_navigate'; toolArgs=@{url='http://localhost:3002'}; keepSessionOpen=$true} | ConvertTo-Json -Depth 10
  Invoke-RestMethod "$API_BASE/tools/call" -Method Post -Body $body -ContentType 'application/json' | Out-Null
  
  # 3. Get page snapshot
  Write-Host '  3. Getting page snapshot...' -ForegroundColor Gray
  $body = @{spec=$PW; toolName='browser_snapshot'; toolArgs=@{}; keepSessionOpen=$true} | ConvertTo-Json -Depth 10
  Invoke-RestMethod "$API_BASE/tools/call" -Method Post -Body $body -ContentType 'application/json' | Out-Null
  
  # 4. Type username
  Write-Host '  4. Typing username...' -ForegroundColor Gray
  $body = @{spec=$PW; toolName='browser_type'; toolArgs=@{element='username field'; ref='e22'; text='admin'}; keepSessionOpen=$true} | ConvertTo-Json -Depth 10
  Invoke-RestMethod "$API_BASE/tools/call" -Method Post -Body $body -ContentType 'application/json' | Out-Null
  
  # 5. Type password
  Write-Host '  5. Typing password...' -ForegroundColor Gray
  $body = @{spec=$PW; toolName='browser_type'; toolArgs=@{element='password field'; ref='e24'; text='admin123'}; keepSessionOpen=$true} | ConvertTo-Json -Depth 10
  Invoke-RestMethod "$API_BASE/tools/call" -Method Post -Body $body -ContentType 'application/json' | Out-Null
  
  # 6. Click login button
  Write-Host '  6. Clicking login button...' -ForegroundColor Gray
  $body = @{spec=$PW; toolName='browser_click'; toolArgs=@{element='login button'; ref='e27'}; keepSessionOpen=$true} | ConvertTo-Json -Depth 10
  Invoke-RestMethod "$API_BASE/tools/call" -Method Post -Body $body -ContentType 'application/json' | Out-Null
  
  # 7. Wait for login
  Write-Host '  7. Waiting 5 seconds for login...' -ForegroundColor Gray
  $body = @{spec=$PW; toolName='browser_wait_for'; toolArgs=@{time=5}; keepSessionOpen=$true} | ConvertTo-Json -Depth 10
  Invoke-RestMethod "$API_BASE/tools/call" -Method Post -Body $body -ContentType 'application/json' | Out-Null
  
  # 8. Navigate to zertifikat page
  Write-Host '  8. Navigating to zertifikat page...' -ForegroundColor Gray
  $body = @{spec=$PW; toolName='browser_navigate'; toolArgs=@{url='http://localhost:3002/zertifikat'}; keepSessionOpen=$true} | ConvertTo-Json -Depth 10
  Invoke-RestMethod "$API_BASE/tools/call" -Method Post -Body $body -ContentType 'application/json' | Out-Null
  
  # 9. Wait for page stability
  Write-Host '  9. Waiting 2 seconds for page stability...' -ForegroundColor Gray
  $body = @{spec=$PW; toolName='browser_wait_for'; toolArgs=@{time=2}; keepSessionOpen=$true} | ConvertTo-Json -Depth 10
  Invoke-RestMethod "$API_BASE/tools/call" -Method Post -Body $body -ContentType 'application/json' | Out-Null
  
  # 10. Capture screenshot
  Write-Host '  10. Capturing screenshot...' -ForegroundColor Gray
  $body = @{spec=$PW; toolName='browser_take_screenshot'; toolArgs=@{type='jpeg'; filename='zertifikate_screenshot.jpg'}; keepSessionOpen=$true} | ConvertTo-Json -Depth 10
  Invoke-RestMethod "$API_BASE/tools/call" -Method Post -Body $body -ContentType 'application/json' | Out-Null
  
  Write-Host '  ✓ Playwright workflow completed' -ForegroundColor Green
  
} catch {
  Write-Host "  ✗ Playwright workflow failed: $_" -ForegroundColor Red
  exit 1
}

# ============================================================================
# PARAMETERSET 1: No parameters (uses latest screenshot)
# ============================================================================
Write-Host "`n[PARAMETERSET 1] cognitive_visual_dimensions - No parameters" -ForegroundColor Yellow

try {
  $body = @{
    spec = $CVA
    toolName = 'cognitive_visual_dimensions'
    toolArgs = @{}
    keepSessionOpen = $false
    savePath = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/reports'
    filename = 'MCPDiagnosis_Report_dimensions_parameterset1_test.md'
  } | ConvertTo-Json -Depth 10
  
  $result = Invoke-RestMethod "$API_BASE/tools/report" -Method Post -Body $body -ContentType 'application/json'
  
  Write-Host '  ✓ Report generated: ' -NoNewline -ForegroundColor Green
  Write-Host $result.path -ForegroundColor Cyan
  
  # Parse and check results
  $content = Get-Content $result.path -Raw
  if ($content -match '"total_elements":\s*(\d+)') {
    $elements = $matches[1]
    Write-Host '  ✓ Total elements detected: ' -NoNewline -ForegroundColor Green
    Write-Host $elements -ForegroundColor White
  }
  
  if ($content -match 'Zertifikate') {
    Write-Host '  ✓ Contains zertifikate page content' -ForegroundColor Green
  } else {
    Write-Host '  ✗ WARNING: Does not contain zertifikate page content!' -ForegroundColor Red
  }
  
} catch {
  Write-Host "  ✗ Parameterset 1 failed: $_" -ForegroundColor Red
}

# ============================================================================
# PARAMETERSET 2: Explicit imagePath
# ============================================================================
Write-Host "`n[PARAMETERSET 2] cognitive_visual_dimensions - Explicit imagePath" -ForegroundColor Yellow

try {
  $body = @{
    spec = $CVA
    toolName = 'cognitive_visual_dimensions'
    toolArgs = @{
      imagePath = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots/cognitive/zertifikate_screenshot.jpg'
    }
    keepSessionOpen = $false
    savePath = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/reports'
    filename = 'MCPDiagnosis_Report_dimensions_parameterset2_test.md'
  } | ConvertTo-Json -Depth 10
  
  $result = Invoke-RestMethod "$API_BASE/tools/report" -Method Post -Body $body -ContentType 'application/json'
  
  Write-Host '  ✓ Report generated: ' -NoNewline -ForegroundColor Green
  Write-Host $result.path -ForegroundColor Cyan
  
  # Parse and check results
  $content = Get-Content $result.path -Raw
  if ($content -match '"total_elements":\s*(\d+)') {
    $elements = $matches[1]
    Write-Host '  ✓ Total elements detected: ' -NoNewline -ForegroundColor Green
    Write-Host $elements -ForegroundColor White
  }
  
  if ($content -match 'Zertifikate') {
    Write-Host '  ✓ Contains zertifikate page content' -ForegroundColor Green
  } else {
    Write-Host '  ✗ WARNING: Does not contain zertifikate page content!' -ForegroundColor Red
  }
  
} catch {
  Write-Host "  ✗ Parameterset 2 failed: $_" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host 'Test Complete' -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

