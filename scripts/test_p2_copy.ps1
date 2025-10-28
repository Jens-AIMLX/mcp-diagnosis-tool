# Cognitive-Visual Toolsuite Generic Test (API)
# Complete API test suite covering all test scenarios from cognitive-visual-toolsuite-generic-testplan.md
# Ref: docs/testplans/cognitive-visual-toolsuite-generic-testplan.api.yaml

$ErrorActionPreference = 'Stop'

# Configuration
$API_BASE = 'http://localhost:3060/api'
$TARGET_URL = 'http://localhost:3002/zertifikat'
$SCREENSHOT_DIR = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots/cognitive'
$REPORT_DIR = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/reports/apitest'
$BASELINE_IMG = "$SCREENSHOT_DIR/baseline_zertifikate.jpg"
$CURRENT_IMG = "$SCREENSHOT_DIR/current_zertifikate.jpg"

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
Write-Host "Cognitive-Visual Toolsuite API Test Suite" -ForegroundColor Cyan
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

  # Screenshot
  Invoke-Tool -Spec $PW -ToolName 'browser_take_screenshot' -ToolArgs @{type='jpeg'; filename='baseline_zertifikate.jpg'} | Out-Null

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
# C.1 Health Check
# ============================================================================
Write-Host "`n[C.1] Health Check" -ForegroundColor Yellow

try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_health' -Filename 'MCPDiagnosis_Report_health_api.md'
  Write-Host "  ✓ Health check completed: $($r.path)" -ForegroundColor Green
  $results += @{Test="C.1 Health Check"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ Error: $_" -ForegroundColor Red
  $results += @{Test="C.1 Health Check"; Status="FAIL"; Error=$_.Exception.Message}
}


# ============================================================================
# C.2 Dimensions Analysis
# ============================================================================
Write-Host "`n[C.2] Dimensions Analysis" -ForegroundColor Yellow

# C.2.1 Image Mode - Latest Screenshot
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_dimensions' -Filename 'MCPDiagnosis_Report_dimensions_image_latest_api.md'
  Write-Host "  ✓ C.2.1 Image Mode (latest): $($r.path)" -ForegroundColor Green
  $results += @{Test="C.2.1 Dimensions - Image Latest"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.2.1 Error: $_" -ForegroundColor Red
  $results += @{Test="C.2.1 Dimensions - Image Latest"; Status="FAIL"; Error=$_.Exception.Message}
}

# C.2.2 Image Mode - Explicit Path
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_dimensions' -ToolArgs @{imagePath=$BASELINE_IMG} -Filename 'MCPDiagnosis_Report_dimensions_image_explicit_api.md'
  Write-Host "  ✓ C.2.2 Image Mode (explicit): $($r.path)" -ForegroundColor Green
  $results += @{Test="C.2.2 Dimensions - Image Explicit"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.2.2 Error: $_" -ForegroundColor Red
  $results += @{Test="C.2.2 Dimensions - Image Explicit"; Status="FAIL"; Error=$_.Exception.Message}
}

# C.2.3 URL Mode
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_dimensions' -ToolArgs @{url=$TARGET_URL} -Filename 'MCPDiagnosis_Report_dimensions_url_api.md'
  Write-Host "  ✓ C.2.3 URL Mode: $($r.path)" -ForegroundColor Green
  $results += @{Test="C.2.3 Dimensions - URL"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.2.3 Error: $_" -ForegroundColor Red
  $results += @{Test="C.2.3 Dimensions - URL"; Status="FAIL"; Error=$_.Exception.Message}
}

# C.2.4 Area Focus - URL Mode
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_dimensions' -ToolArgs @{url=$TARGET_URL; area='login-form'} -Filename 'MCPDiagnosis_Report_dimensions_area_url_api.md'
  Write-Host "  ✓ C.2.4 Area Focus (URL): $($r.path)" -ForegroundColor Green
  $results += @{Test="C.2.4 Dimensions - Area URL"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.2.4 Error: $_" -ForegroundColor Red
  $results += @{Test="C.2.4 Dimensions - Area URL"; Status="FAIL"; Error=$_.Exception.Message}
}

# C.2.5 Area Focus - Image Mode
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_dimensions' -ToolArgs @{imagePath=$BASELINE_IMG; area='Anmeldung'} -Filename 'MCPDiagnosis_Report_dimensions_area_image_api.md'
  Write-Host "  ✓ C.2.5 Area Focus (Image): $($r.path)" -ForegroundColor Green
  $results += @{Test="C.2.5 Dimensions - Area Image"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.2.5 Error: $_" -ForegroundColor Red
  $results += @{Test="C.2.5 Dimensions - Area Image"; Status="FAIL"; Error=$_.Exception.Message}
}

# ============================================================================
# C.3 Controls Analysis
# ============================================================================
Write-Host "`n[C.3] Controls Analysis" -ForegroundColor Yellow

# C.3.1 Image Mode - Latest Screenshot
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_controls' -Filename 'MCPDiagnosis_Report_controls_image_latest_api.md'
  Write-Host "  ✓ C.3.1 Image Mode (latest): $($r.path)" -ForegroundColor Green
  $results += @{Test="C.3.1 Controls - Image Latest"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.3.1 Error: $_" -ForegroundColor Red
  $results += @{Test="C.3.1 Controls - Image Latest"; Status="FAIL"; Error=$_.Exception.Message}
}

# C.3.2 Image Mode - Explicit Path
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_controls' -ToolArgs @{imagePath=$BASELINE_IMG} -Filename 'MCPDiagnosis_Report_controls_image_explicit_api.md'
  Write-Host "  ✓ C.3.2 Image Mode (explicit): $($r.path)" -ForegroundColor Green
  $results += @{Test="C.3.2 Controls - Image Explicit"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.3.2 Error: $_" -ForegroundColor Red
  $results += @{Test="C.3.2 Controls - Image Explicit"; Status="FAIL"; Error=$_.Exception.Message}
}

# C.3.3 URL Mode
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_controls' -ToolArgs @{url=$TARGET_URL} -Filename 'MCPDiagnosis_Report_controls_url_api.md'
  Write-Host "  ✓ C.3.3 URL Mode: $($r.path)" -ForegroundColor Green
  $results += @{Test="C.3.3 Controls - URL"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.3.3 Error: $_" -ForegroundColor Red
  $results += @{Test="C.3.3 Controls - URL"; Status="FAIL"; Error=$_.Exception.Message}
}

# C.3.4 Area Focus - URL Mode
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_controls' -ToolArgs @{url=$TARGET_URL; area='login-form'} -Filename 'MCPDiagnosis_Report_controls_area_url_api.md'
  Write-Host "  ✓ C.3.4 Area Focus (URL): $($r.path)" -ForegroundColor Green
  $results += @{Test="C.3.4 Controls - Area URL"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.3.4 Error: $_" -ForegroundColor Red
  $results += @{Test="C.3.4 Controls - Area URL"; Status="FAIL"; Error=$_.Exception.Message}
}

# ============================================================================
# C.4 Tables Analysis
# ============================================================================
Write-Host "`n[C.4] Tables Analysis" -ForegroundColor Yellow

# C.4.1 Image Mode - Latest Screenshot
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_tables' -Filename 'MCPDiagnosis_Report_tables_image_latest_api.md'
  Write-Host "  ✓ C.4.1 Image Mode (latest): $($r.path)" -ForegroundColor Green
  $results += @{Test="C.4.1 Tables - Image Latest"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.4.1 Error: $_" -ForegroundColor Red
  $results += @{Test="C.4.1 Tables - Image Latest"; Status="FAIL"; Error=$_.Exception.Message}
}

# C.4.2 Image Mode - Explicit Path
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_tables' -ToolArgs @{imagePath=$BASELINE_IMG} -Filename 'MCPDiagnosis_Report_tables_image_explicit_api.md'
  Write-Host "  ✓ C.4.2 Image Mode (explicit): $($r.path)" -ForegroundColor Green
  $results += @{Test="C.4.2 Tables - Image Explicit"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.4.2 Error: $_" -ForegroundColor Red
  $results += @{Test="C.4.2 Tables - Image Explicit"; Status="FAIL"; Error=$_.Exception.Message}
}

# C.4.3 URL Mode
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_tables' -ToolArgs @{url=$TARGET_URL} -Filename 'MCPDiagnosis_Report_tables_url_api.md'
  Write-Host "  ✓ C.4.3 URL Mode: $($r.path)" -ForegroundColor Green
  $results += @{Test="C.4.3 Tables - URL"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.4.3 Error: $_" -ForegroundColor Red
  $results += @{Test="C.4.3 Tables - URL"; Status="FAIL"; Error=$_.Exception.Message}
}

# ============================================================================
# C.5 Buttons Analysis
# ============================================================================
Write-Host "`n[C.5] Buttons Analysis" -ForegroundColor Yellow

try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_buttons' -ToolArgs @{imagePath=$BASELINE_IMG} -Filename 'MCPDiagnosis_Report_buttons_image_api.md'
  Write-Host "  ✓ C.5.1 Buttons Analysis: $($r.path)" -ForegroundColor Green
  $results += @{Test="C.5.1 Buttons - Image"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.5.1 Error: $_" -ForegroundColor Red
  $results += @{Test="C.5.1 Buttons - Image"; Status="FAIL"; Error=$_.Exception.Message}
}


# ============================================================================
# C.6 Difference Analysis - Setup (WITH LOGIN)
# ============================================================================
Write-Host "`n[C.6] Difference Analysis - Setup (with login)" -ForegroundColor Yellow

try {
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

  # Screenshot
  Invoke-Tool -Spec $PW -ToolName 'browser_take_screenshot' -ToolArgs @{type='jpeg'; filename='current_zertifikate.jpg'} | Out-Null

  if (Test-Path $CURRENT_IMG) {
    Write-Host "  ✓ Current screenshot captured (after login): $CURRENT_IMG" -ForegroundColor Green
    $results += @{Test="C.6 Setup - Current Capture (with login)"; Status="PASS"}
  } else {
    Write-Host "  ✗ Current screenshot not found" -ForegroundColor Red
    $results += @{Test="C.6 Setup - Current Capture (with login)"; Status="FAIL"}
  }
} catch {
  Write-Host "  ✗ Error: $_" -ForegroundColor Red
  $results += @{Test="C.6 Setup - Current Capture (with login)"; Status="FAIL"; Error=$_.Exception.Message}
}

# ============================================================================
# C.6 Difference Analysis - Tests
# ============================================================================
Write-Host "`n[C.6] Difference Analysis - Tests" -ForegroundColor Yellow

# C.6.1 Image→Image (both provided)
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_difference' -ToolArgs @{baselineimage=$BASELINE_IMG; currentimage=$CURRENT_IMG} -Filename 'MCPDiagnosis_Report_difference_image_both_api.md'
  Write-Host "  ✓ C.6.1 Image→Image (both): $($r.path)" -ForegroundColor Green
  $results += @{Test="C.6.1 Difference - Image Both"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.6.1 Error: $_" -ForegroundColor Red
  $results += @{Test="C.6.1 Difference - Image Both"; Status="FAIL"; Error=$_.Exception.Message}
}

# C.6.2 Image→Image (current auto-latest)
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_difference' -ToolArgs @{baselineimage=$BASELINE_IMG} -Filename 'MCPDiagnosis_Report_difference_image_latest_api.md'
  Write-Host "  ✓ C.6.2 Image→Image (auto-latest): $($r.path)" -ForegroundColor Green
  $results += @{Test="C.6.2 Difference - Image Latest"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.6.2 Error: $_" -ForegroundColor Red
  $results += @{Test="C.6.2 Difference - Image Latest"; Status="FAIL"; Error=$_.Exception.Message}
}

# C.6.3 URL→URL
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_difference' -ToolArgs @{baselineurl=$TARGET_URL; currenturl=$TARGET_URL} -Filename 'MCPDiagnosis_Report_difference_url_api.md'
  Write-Host "  ✓ C.6.3 URL→URL: $($r.path)" -ForegroundColor Green
  $results += @{Test="C.6.3 Difference - URL"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.6.3 Error: $_" -ForegroundColor Red
  $results += @{Test="C.6.3 Difference - URL"; Status="FAIL"; Error=$_.Exception.Message}
}

# C.6.4 Area Focus
try {
  $r = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_difference' -ToolArgs @{baselineimage=$BASELINE_IMG; currentimage=$CURRENT_IMG; area='login-form'} -Filename 'MCPDiagnosis_Report_difference_area_api.md'
  Write-Host "  ✓ C.6.4 Area Focus: $($r.path)" -ForegroundColor Green
  $results += @{Test="C.6.4 Difference - Area"; Status="PASS"; Report=$r.path}
} catch {
  Write-Host "  ✗ C.6.4 Error: $_" -ForegroundColor Red
  $results += @{Test="C.6.4 Difference - Area"; Status="FAIL"; Error=$_.Exception.Message}
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
Write-Host "  - Current: $CURRENT_IMG" -ForegroundColor Gray

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test Suite Complete" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Exit with appropriate code
exit $(if ($failed -eq 0) { 0 } else { 1 })
