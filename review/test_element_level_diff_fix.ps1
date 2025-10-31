# Test Element-Level Difference Detection Fix
# Verifies that removed elements like "Abnehmer" and "ID" are now detected

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "Testing Element-Level Difference Detection Fix" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$API_BASE = 'http://localhost:3060/api'

# Paths to test images
$BASELINE_IMG = 'C:/Users/jenss/OneDrive - Singularyt UG/Code/Test/.evidence/screenshots/cognitive/baseline.jpg'
$CURRENT_IMG = 'C:/Users/jenss/OneDrive - Singularyt UG/Code/Test/.evidence/screenshots/cognitive/baseline_zertifikate_2025-10-28_20-24-34.jpg'
$REPORT_DIR = 'C:/Users/jenss/OneDrive - Singularyt UG/Code/Test/.evidence/reports/apitest'

# CVA spec
$CVA = @{
  mode = 'stdio'
  command = 'node'
  args = @('C:/Users/jenss/OneDrive - Singularyt UG/Code/source/AIServer/UserPerpectiveAI/mcp-server/mcp-server-stdio.js')
  toolTimeoutSec = 120
  env = @{
    NODE_ENV = 'production'
    SCREENSHOT_PATH = 'C:/Users/jenss/OneDrive - Singularyt UG/Code/Test/.evidence/screenshots/cognitive'
    DIFFERENCE_PATH = 'C:/Users/jenss/OneDrive - Singularyt UG/Code/Test/.evidence/diffbase'
    REPORT_PATH = $REPORT_DIR
    VISUAL_DIFF_PROVIDE_REPORT = 'ON'
  }
}

Write-Host "Test Setup" -ForegroundColor Yellow
Write-Host "  Baseline: $BASELINE_IMG" -ForegroundColor Gray
Write-Host "  Current:  $CURRENT_IMG" -ForegroundColor Gray
Write-Host "  Reports:  $REPORT_DIR" -ForegroundColor Gray
Write-Host ""

# Step 1: Copy baseline to difference directory
Write-Host "Step 1: Preparing baseline image..." -ForegroundColor Yellow
$DIFF_DIR = 'C:/Users/jenss/OneDrive - Singularyt UG/Code/Test/.evidence/diffbase'
if (!(Test-Path $DIFF_DIR)) {
  New-Item -ItemType Directory -Path $DIFF_DIR -Force | Out-Null
}
Copy-Item $BASELINE_IMG -Destination "$DIFF_DIR/baseline.jpg" -Force
Write-Host "  OK: Baseline copied to difference directory" -ForegroundColor Green
Write-Host ""

# Step 2: Run cognitive_visual_difference (THE FIX TEST)
Write-Host "Step 2: Running cognitive_visual_difference (TESTING FIX)..." -ForegroundColor Yellow
try {
  # First copy current image to screenshot directory for auto-grab
  Copy-Item $CURRENT_IMG -Destination 'C:/Users/jenss/OneDrive - Singularyt UG/Code/Test/.evidence/screenshots/cognitive/current.jpg' -Force

  $body = @{
    spec = $CVA
    toolName = 'cognitive_visual_difference'
    toolArgs = @{
      baselineimage = 'C:/Users/jenss/OneDrive - Singularyt UG/Code/Test/.evidence/diffbase/baseline.jpg'
      currentimage = 'C:/Users/jenss/OneDrive - Singularyt UG/Code/Test/.evidence/screenshots/cognitive/current.jpg'
    }
    keepSessionOpen = $false
    savePath = $REPORT_DIR
    filename = 'MCPDiagnosis_Report_difference_FIX_TEST.md'
  } | ConvertTo-Json -Depth 10
  
  $result = Invoke-RestMethod "$API_BASE/tools/report" -Method Post -Body $body -ContentType 'application/json'
  Write-Host "  OK: Difference report generated: $($result.path)" -ForegroundColor Green
  
  # Parse the report to check for element-level differences
  $diffContent = Get-Content $result.path -Raw
  
  # Check for the new "Element-Level Differences" section
  $hasElementSection = $diffContent -match 'Element-Level Differences'
  $hasRemovedSection = $diffContent -match 'Removed Elements'
  $abnehmerRemoved = $diffContent -match 'Abnehmer'
  $idRemoved = $diffContent -match '\bID\b'
  
  Write-Host "  -> Report has Element-Level section: $hasElementSection" -ForegroundColor $(if ($hasElementSection) { 'Green' } else { 'Red' })
  Write-Host "  -> Report has Removed Elements section: $hasRemovedSection" -ForegroundColor $(if ($hasRemovedSection) { 'Green' } else { 'Red' })
  Write-Host "  -> Abnehmer listed as removed: $abnehmerRemoved" -ForegroundColor $(if ($abnehmerRemoved) { 'Green' } else { 'Red' })
  Write-Host "  -> ID listed as removed: $idRemoved" -ForegroundColor $(if ($idRemoved) { 'Green' } else { 'Red' })
  
  # Extract removed elements count
  if ($diffContent -match 'Removed Elements.*?(\d+)') {
    $removedCount = $matches[1]
    Write-Host "  -> Total removed elements: $removedCount" -ForegroundColor Cyan
  }
  
  # Extract similarity score
  if ($diffContent -match 'Similarity.*?([\d.]+)%') {
    $similarity = $matches[1]
    Write-Host "  -> Element similarity: $similarity%" -ForegroundColor Cyan
  }
  
  Write-Host ""
  Write-Host "FIX VERIFICATION RESULTS:" -ForegroundColor Cyan
  Write-Host "  Element-Level section exists: $hasElementSection" -ForegroundColor $(if ($hasElementSection) { 'Green' } else { 'Red' })
  Write-Host "  Removed Elements detected: $hasRemovedSection" -ForegroundColor $(if ($hasRemovedSection) { 'Green' } else { 'Red' })
  Write-Host "  Abnehmer detected as removed: $abnehmerRemoved" -ForegroundColor $(if ($abnehmerRemoved) { 'Green' } else { 'Red' })
  Write-Host "  ID detected as removed: $idRemoved" -ForegroundColor $(if ($idRemoved) { 'Green' } else { 'Red' })
  
  if ($hasElementSection -and $hasRemovedSection -and $abnehmerRemoved -and $idRemoved) {
    Write-Host ""
    Write-Host "FIX SUCCESSFUL! Element-level differences are now detected!" -ForegroundColor Green
    Write-Host "The dimensions_diff tool is now properly integrated." -ForegroundColor Green
  } else {
    Write-Host ""
    Write-Host "FIX INCOMPLETE! Some element-level differences are missing." -ForegroundColor Red
    Write-Host "Review the generated report at: $($result.path)" -ForegroundColor Yellow
  }
  
} catch {
  Write-Host "  ERROR: Failed to run difference analysis: $_" -ForegroundColor Red
  Write-Host "  Error details: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Test completed. Review reports in: $REPORT_DIR" -ForegroundColor Cyan

