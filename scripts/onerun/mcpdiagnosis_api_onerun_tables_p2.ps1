# Cognitive-Visual Toolsuite Generic Test (API)
# Complete API test suite covering all test scenarios from cognitive-visual-toolsuite-generic-testplan.md
# Ref: docs/testplans/cognitive-visual-toolsuite-generic-testplan.api.yaml

$ErrorActionPreference = 'Stop'

# Configuration
$API_BASE = 'http://localhost:3060/api'
$TARGET_URL = 'http://localhost:3002/zertifikat'
$SCREENSHOT_DIR = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots/cognitive'
$REPORT_DIR = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/reports/apitest'

# Generate timestamp for this test run
$TIMESTAMP = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$BASELINE_IMG_NAME = "tables_p2_$TIMESTAMP.jpg"
$BASELINE_IMG = "$SCREENSHOT_DIR/$BASELINE_IMG_NAME"
$REPORT_NAME = "MCPDiagnosis_Report_tables_p2_$TIMESTAMP.md"

# Explicit specs (from one-config cognitive)
$PW = @{
  mode='stdio'
  command='npx'
  args=@(
    '-y','@playwright/mcp@latest',
    '--output-dir',$SCREENSHOT_DIR,
    '--browser','chrome',
    '--viewport-size','2400,1350',
    '--isolated','--no-sandbox'
  )
}

$CVA = @{
  mode='stdio'
  command='node'
  args=@('C:/Users/jenss/ONEDRI~2/Code/source/AIServer/UserPerpectiveAI/mcp-server/mcp-server-stdio.js')
  env=@{
    NODE_ENV = 'production'
    SCREENSHOT_PATH = '#PLAYWRIGHTPATH#'
    CALIBRATION_PATH = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/calibrate'
    DIFFERENCE_PATH = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/diffbase'
    VISUAL_DIFF_DEFAULT_OCR = 'both'
    VISUAL_DIFF_DEFAULT_COLOR = 'elements'
    VISUAL_DIFF_DEFAULT_DIMENSIONS = 'both'
    VISUAL_DIFF_DEFAULT_ELEMENTS = 'both'
    VISUAL_DIFF_DEFAULT_AREA_WEIGHT = '0'
    VISUAL_DIFF_DEFAULT_PRECALIBRATION = 'ON'
    REPORT_PATH = $REPORT_DIR
    VISUAL_DIFF_PROVIDE_REPORT = 'ON'
    ARCHIVE_PATH = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/.archive'
    AUTO_SCREENSHOT = 'OFF'
    SCREENSHOTFOLDERS_PER_WORKSPACE = 'OFF'
    AUTO_GRAB = 'OFF'
    URLGRABFOLDERS_PER_WORKSPACE = 'OFF'
    PLAYWRIGHT_CONFIG_JSON = "{`"outputDir`": `"$SCREENSHOT_DIR`", `"browser`": {`"browserName`": `"chromium`", `"isolated`": true, `"launchOptions`": {`"headless`": false}, `"contextOptions`": {`"viewport`": {`"width`": 2400, `"height`": 1350}}}}"
  }
  toolTimeoutSec=120
}

# Ensure directories exist
New-Item -ItemType Directory -Force $SCREENSHOT_DIR | Out-Null
New-Item -ItemType Directory -Force $REPORT_DIR | Out-Null

# Helper function to call tools
function Invoke-Tool {
  param(
    [hashtable]$Spec,
    [string]$ToolName,
    [hashtable]$ToolArgs = @{},
    [bool]$KeepSessionOpen = $true
  )
  $body = @{
    spec = $Spec
    toolName = $ToolName
    toolArgs = $ToolArgs
    keepSessionOpen = $KeepSessionOpen
  } | ConvertTo-Json -Depth 10

  Invoke-RestMethod "$API_BASE/tools/call" -Method Post -Body $body -ContentType 'application/json'
}

# Helper function to generate reports
function Invoke-ToolReport {
  param(
    [hashtable]$Spec,
    [string]$ToolName,
    [hashtable]$ToolArgs = @{},
    [string]$Filename,
    [bool]$KeepSessionOpen = $true
  )
  $body = @{
    spec = $Spec
    toolName = $ToolName
    toolArgs = $ToolArgs
    keepSessionOpen = $KeepSessionOpen
    savePath = $REPORT_DIR
    filename = $Filename
  } | ConvertTo-Json -Depth 10

  Invoke-RestMethod "$API_BASE/tools/report" -Method Post -Body $body -ContentType 'application/json'
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test: cognitive_visual_tables - Parameterset 2" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Track results
$results = @()

# ============================================================================
# B. Playwright Baseline Capture (WITH LOGIN)
# ============================================================================
Write-Host "[B] Playwright Baseline Capture (with login)" -ForegroundColor Yellow

try {
  # Open session
  $body = @{spec=$PW} | ConvertTo-Json -Depth 10
  Invoke-RestMethod "$API_BASE/sessions/open" -Method Post -Body $body -ContentType 'application/json' | Out-Null

  # Navigate to login page
  Invoke-Tool -Spec $PW -ToolName 'browser_navigate' -ToolArgs @{url='http://localhost:3002'} | Out-Null
  Write-Host "  → Navigated to login page" -ForegroundColor Gray

  # Get page snapshot to find element refs
  Invoke-Tool -Spec $PW -ToolName 'browser_snapshot' -ToolArgs @{} | Out-Null
  Write-Host "  → Page snapshot captured" -ForegroundColor Gray

  # Type username
  Invoke-Tool -Spec $PW -ToolName 'browser_type' -ToolArgs @{element='username field'; ref='e22'; text='admin'} | Out-Null
  Write-Host "  → Typed username: admin" -ForegroundColor Gray

  # Type password
  Invoke-Tool -Spec $PW -ToolName 'browser_type' -ToolArgs @{element='password field'; ref='e24'; text='admin123'} | Out-Null
  Write-Host "  → Typed password: ********" -ForegroundColor Gray

  # Click login button
  Invoke-Tool -Spec $PW -ToolName 'browser_click' -ToolArgs @{element='login button'; ref='e27'} | Out-Null
  Write-Host "  → Clicked login button" -ForegroundColor Gray

  # Wait for login to complete
  Invoke-Tool -Spec $PW -ToolName 'browser_wait_for' -ToolArgs @{time=5} | Out-Null
  Write-Host "  → Waited 5 seconds for login" -ForegroundColor Gray

  # Navigate to target page
  Invoke-Tool -Spec $PW -ToolName 'browser_navigate' -ToolArgs @{url=$TARGET_URL} | Out-Null
  Write-Host "  → Navigated to: $TARGET_URL" -ForegroundColor Gray

  # Wait for page to stabilize
  Invoke-Tool -Spec $PW -ToolName 'browser_wait_for' -ToolArgs @{time=2} | Out-Null

  # Screenshot with timestamped filename
  Invoke-Tool -Spec $PW -ToolName 'browser_take_screenshot' -ToolArgs @{type='jpeg'; filename=$BASELINE_IMG_NAME} | Out-Null

  if (Test-Path $BASELINE_IMG) {
    Write-Host "  ✓ Baseline screenshot captured (after login): $BASELINE_IMG" -ForegroundColor Green
    $results += @{Test="B. Baseline Capture (with login)"; Status="PASS"}
  } else {
    Write-Host "  ✗ Baseline screenshot not found" -ForegroundColor Red
    $results += @{Test="B. Baseline Capture (with login)"; Status="FAIL"}
  }
} catch {
  Write-Host "  ✗ Error: $_" -ForegroundColor Red
  $results += @{Test="B. Baseline Capture (with login)"; Status="FAIL"; Error=$_.Exception.Message}
}

# ============================================================================
# C.4.2 Tables Analysis - Image Mode - Explicit Path (Parameterset 2)
# ============================================================================
Write-Host "`n[C.4.2] Tables - Parameterset 2 (explicit imagePath)" -ForegroundColor Yellow

try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_tables' -ToolArgs @{imagePath=$BASELINE_IMG} -Filename $REPORT_NAME
  Write-Host "  ✓ C.4.2 Image Mode (explicit): $($r.path)" -ForegroundColor Green
  $results += @{Test="C.4.2 Tables - Image Explicit"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.4.2 Error: $_" -ForegroundColor Red
  $results += @{Test="C.4.2 Tables - Image Explicit"; Status="FAIL"; Error=$_.Exception.Message}
}



# ============================================================================
# Summary
# ============================================================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$passed = ($results | Where-Object { $_.Status -eq "PASS" }).Count
$failed = ($results | Where-Object { $_.Status -eq "FAIL" }).Count
$total = $results.Count

Write-Host "Total Tests: $total" -ForegroundColor White
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })

if ($failed -gt 0) {
  Write-Host "`nFailed Tests:" -ForegroundColor Red
  $results | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
    Write-Host "  - $($_.Test)" -ForegroundColor Red
    if ($_.Error) {
      Write-Host "    Error: $($_.Error)" -ForegroundColor DarkRed
    }
  }
}

Write-Host "`nGenerated Reports:" -ForegroundColor Yellow
$results | Where-Object { $_.Report } | ForEach-Object {
  Write-Host "  - $($_.Test): $($_.Report)" -ForegroundColor Gray
}

Write-Host "`nScreenshots:" -ForegroundColor Yellow
Write-Host "  - Baseline: $BASELINE_IMG" -ForegroundColor Gray

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test Complete" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Exit with appropriate code
exit $(if ($failed -eq 0) { 0 } else { 1 })

