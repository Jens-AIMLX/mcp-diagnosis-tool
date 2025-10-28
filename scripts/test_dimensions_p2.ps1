# Test: cognitive_visual_dimensions - Parameterset 2 (explicit imagePath)
# Single test run with session state detection

$ErrorActionPreference = 'Stop'

# Configuration
$API_BASE = 'http://localhost:3060/api'
$TARGET_URL = 'http://localhost:3002/zertifikat'
$SCREENSHOT_DIR = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots/cognitive'
$REPORT_DIR = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/reports'
$SCREENSHOT_FILE = 'dimensions_p2_zertifikate.jpg'
$SCREENSHOT_PATH = "$SCREENSHOT_DIR/$SCREENSHOT_FILE"

# Playwright spec
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

# Cognitive Visual Analytics spec
$CVA = @{
  mode='stdio'
  command='node'
  args=@('C:/Users/jenss/ONEDRI~2/Code/source/AIServer/UserPerpectiveAI/mcp-server/mcp-server-stdio.js')
  env=@{
    NODE_ENV = 'production'
    SCREENSHOT_PATH = $SCREENSHOT_DIR
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
    [bool]$KeepSessionOpen = $false
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
Write-Host "Test: cognitive_visual_dimensions" -ForegroundColor Cyan
Write-Host "Parameterset 2: Explicit imagePath" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# ============================================================================
# PLAYWRIGHT: Navigate and Capture Screenshot
# ============================================================================
Write-Host "[PLAYWRIGHT] Navigate and Capture" -ForegroundColor Yellow

try {
  # Open Playwright session
  $body = @{spec=$PW} | ConvertTo-Json -Depth 10
  Invoke-RestMethod "$API_BASE/sessions/open" -Method Post -Body $body -ContentType 'application/json' | Out-Null
  Write-Host "  → Playwright session opened" -ForegroundColor Gray

  # Navigate to login page
  Invoke-Tool -Spec $PW -ToolName 'browser_navigate' -ToolArgs @{url='http://localhost:3002'} | Out-Null
  Write-Host "  → Navigated to http://localhost:3002" -ForegroundColor Gray

  # Get snapshot to check session state
  $snapshotResult = Invoke-Tool -Spec $PW -ToolName 'browser_snapshot' -ToolArgs @{}
  Write-Host "  → Page snapshot captured" -ForegroundColor Gray

  # Check if "Anmelden" button is present (login page) or not (already logged in)
  $needsLogin = $false
  if ($snapshotResult.output -match 'Anmelden' -or $snapshotResult.output -match 'anmelden') {
    Write-Host "  → Session state: LOGIN PAGE detected (Anmelden button found)" -ForegroundColor Yellow
    $needsLogin = $true
  } else {
    Write-Host "  → Session state: ALREADY LOGGED IN (no Anmelden button)" -ForegroundColor Green
    $needsLogin = $false
  }

  # Perform login if needed
  if ($needsLogin) {
    Write-Host "  → Performing login workflow..." -ForegroundColor Yellow

    Invoke-Tool -Spec $PW -ToolName 'browser_type' -ToolArgs @{element='username field'; ref='e22'; text='admin'} | Out-Null
    Write-Host "    • Typed username: admin" -ForegroundColor Gray

    Invoke-Tool -Spec $PW -ToolName 'browser_type' -ToolArgs @{element='password field'; ref='e24'; text='admin123'} | Out-Null
    Write-Host "    • Typed password: ********" -ForegroundColor Gray

    Invoke-Tool -Spec $PW -ToolName 'browser_click' -ToolArgs @{element='login button'; ref='e27'} | Out-Null
    Write-Host "    • Clicked Anmelden button" -ForegroundColor Gray

    Invoke-Tool -Spec $PW -ToolName 'browser_wait_for' -ToolArgs @{time=5} | Out-Null
    Write-Host "    • Waited 5 seconds for login" -ForegroundColor Gray
  }

  # Navigate to zertifikat page
  Invoke-Tool -Spec $PW -ToolName 'browser_navigate' -ToolArgs @{url=$TARGET_URL} | Out-Null
  Write-Host "  → Navigated to zertifikat page" -ForegroundColor Gray

  # Wait for page stability
  Invoke-Tool -Spec $PW -ToolName 'browser_wait_for' -ToolArgs @{time=2} | Out-Null
  Write-Host "  → Waited 2 seconds for page stability" -ForegroundColor Gray

  # Capture screenshot
  Invoke-Tool -Spec $PW -ToolName 'browser_take_screenshot' -ToolArgs @{type='jpeg'; filename=$SCREENSHOT_FILE} | Out-Null
  Write-Host "  → Screenshot captured: $SCREENSHOT_FILE" -ForegroundColor Gray

  # Verify screenshot exists
  if (Test-Path $SCREENSHOT_PATH) {
    Write-Host "  ✓ Screenshot file exists: $SCREENSHOT_PATH" -ForegroundColor Green
  } else {
    Write-Host "  ✗ Screenshot NOT found at: $SCREENSHOT_PATH" -ForegroundColor Red
    exit 1
  }

} catch {
  Write-Host "  ✗ Playwright workflow failed: $_" -ForegroundColor Red
  Write-Host "  Error details: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# ============================================================================
# COGNITIVE VISUAL: Dimensions Analysis (Parameterset 2)
# ============================================================================
Write-Host "`n[COGNITIVE VISUAL] Dimensions Analysis - Parameterset 2" -ForegroundColor Yellow
Write-Host "  Tool: cognitive_visual_dimensions" -ForegroundColor Gray
Write-Host "  Args: imagePath = $SCREENSHOT_PATH" -ForegroundColor Gray

try {
  $result = Invoke-ToolReport -Spec $CVA -ToolName 'cognitive_visual_dimensions' -ToolArgs @{imagePath=$SCREENSHOT_PATH} -Filename 'dimensions_p2_test.md'

  Write-Host "  ✓ Report generated: $($result.path)" -ForegroundColor Green

  # Parse and validate results
  $content = Get-Content $result.path -Raw

  # Check for total elements
  if ($content -match '"total_elements":\s*(\d+)') {
    $elements = $matches[1]
    Write-Host "  ✓ Total elements detected: $elements" -ForegroundColor Green

    if ([int]$elements -lt 50) {
      Write-Host "  ⚠ WARNING: Low element count (expected 100+)" -ForegroundColor Yellow
    }
  } else {
    Write-Host "  ✗ No total_elements found in report" -ForegroundColor Red
  }

  # Check for zertifikate page content
  $zertifikateFound = $false
  if ($content -match 'Zertifikate') {
    Write-Host "  ✓ Contains 'Zertifikate' text" -ForegroundColor Green
    $zertifikateFound = $true
  }
  if ($content -match 'Verwaltung') {
    Write-Host "  ✓ Contains 'Verwaltung' text" -ForegroundColor Green
    $zertifikateFound = $true
  }
  if ($content -match '2136') {
    Write-Host "  ✓ Contains certificate count '2136'" -ForegroundColor Green
    $zertifikateFound = $true
  }

  if (-not $zertifikateFound) {
    Write-Host "  ✗ WARNING: No zertifikate page content detected!" -ForegroundColor Red
    Write-Host "  ✗ This suggests the screenshot is NOT from the zertifikat page" -ForegroundColor Red
  }

  # Check screenshot path in report
  if ($content -match '"screenshot":\s*"([^"]+)"') {
    $reportedPath = $matches[1]
    Write-Host "  → Screenshot path in report: $reportedPath" -ForegroundColor Gray

    if ($reportedPath -notmatch 'cognitive') {
      Write-Host "  ⚠ WARNING: Screenshot path does not contain 'cognitive' folder" -ForegroundColor Yellow
    }
    if ($reportedPath -match $SCREENSHOT_FILE) {
      Write-Host "  ✓ Correct screenshot file referenced" -ForegroundColor Green
    } else {
      Write-Host "  ✗ WARNING: Different screenshot file in report" -ForegroundColor Yellow
    }
  }

  Write-Host "`n  📄 Full report available at: $($result.path)" -ForegroundColor Cyan

} catch {
  Write-Host "  ✗ Cognitive visual analysis failed: $_" -ForegroundColor Red
  Write-Host "  Error details: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "✓ Test Complete" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

