# Parameterset 2 (API): Playwright screenshot + cognitive visual analyses
# Uses explicit specs in-script (avoids subconfig resolution issues)

$ErrorActionPreference = 'Stop'

# Explicit specs (from one-config cognitive)
$PW = @{ mode='stdio'; command='npx'; args=@(
  '-y','@playwright/mcp@latest',
  '--output-dir','C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots/cognitive',
  '--browser','chrome',
  '--viewport-size','2400,1350',
  '--isolated','--no-sandbox'
)}

$CVA = @{ mode='stdio'; command='node'; args=@(
  'C:/Users/jenss/ONEDRI~2/Code/source/AIServer/UserPerpectiveAI/mcp-server/mcp-server-stdio.js'
); env=@{
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
  REPORT_PATH = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/reports'
  VISUAL_DIFF_PROVIDE_REPORT = 'ON'
  ARCHIVE_PATH = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/.archive'
  AUTO_SCREENSHOT = 'OFF'
  SCREENSHOTFOLDERS_PER_WORKSPACE = 'OFF'
  AUTO_GRAB = 'OFF'
  URLGRABFOLDERS_PER_WORKSPACE = 'OFF'
  PLAYWRIGHT_CONFIG_JSON = '{
  "outputDir": "C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots/cognitive",
  "browser": {"browserName": "chromium", "isolated": true, "launchOptions": {"headless": false}, "contextOptions": {"viewport": {"width": 2400, "height": 1350}}}
}'
}; toolTimeoutSec=120 }

# Paths
$IMG = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/screenshots/cognitive/params2_zertifikate_api.jpg'
$RDIR = 'C:/Users/jenss/ONEDRI~2/Code/Test/.evidence/reports'
$DIM_MD = 'MCPDiagnois_Report_params2_cognitive_visual_dimensions_api.md'
$CTL_MD = 'MCPDiagnois_Report_params2_cognitive_visual_controls_api.md'
$TBL_MD = 'MCPDiagnois_Report_params2_cognitive_visual_tables_api.md'

# Ensure dirs
New-Item -ItemType Directory -Force (Split-Path $IMG) | Out-Null
New-Item -ItemType Directory -Force $RDIR | Out-Null

# Keep session open for Playwright
Invoke-RestMethod http://localhost:3060/api/sessions/open -Method Post -Body (@{spec=$PW} | ConvertTo-Json -Depth 10) -ContentType 'application/json' | Out-Null

# Navigate to target and small wait
Invoke-RestMethod http://localhost:3060/api/tools/call -Method Post -Body (@{spec=$PW; toolName='browser_navigate'; toolArgs=@{url='http://localhost:3002/zertifikat'}; keepSessionOpen=$true} | ConvertTo-Json -Depth 10) -ContentType 'application/json' | Out-Null
Invoke-RestMethod http://localhost:3060/api/tools/call -Method Post -Body (@{spec=$PW; toolName='browser_wait'; toolArgs=@{seconds=2}; keepSessionOpen=$true} | ConvertTo-Json -Depth 10) -ContentType 'application/json' | Out-Null

# Capture deterministic JPEG
Invoke-RestMethod http://localhost:3060/api/tools/call -Method Post -Body (@{spec=$PW; toolName='browser_screenshot'; toolArgs=@{type='jpeg'; path=$IMG}; keepSessionOpen=$true} | ConvertTo-Json -Depth 10) -ContentType 'application/json' | Out-Null

if (-not (Test-Path $IMG)) { throw "Screenshot not found at $IMG" }

# Run cognitive visual tools and save reports
$r1 = Invoke-RestMethod http://localhost:3060/api/tools/report -Method Post -Body (@{spec=$CVA; toolName='cognitive_visual_dimensions'; toolArgs=@{ imagePath=$IMG }; keepSessionOpen=$true; savePath=$RDIR; filename=$DIM_MD} | ConvertTo-Json -Depth 10) -ContentType 'application/json'
$r2 = Invoke-RestMethod http://localhost:3060/api/tools/report -Method Post -Body (@{spec=$CVA; toolName='cognitive_visual_controls'; toolArgs=@{ imagePath=$IMG }; keepSessionOpen=$true; savePath=$RDIR; filename=$CTL_MD} | ConvertTo-Json -Depth 10) -ContentType 'application/json'
$r3 = Invoke-RestMethod http://localhost:3060/api/tools/report -Method Post -Body (@{spec=$CVA; toolName='cognitive_visual_tables'; toolArgs=@{ imagePath=$IMG }; keepSessionOpen=$true; savePath=$RDIR; filename=$TBL_MD} | ConvertTo-Json -Depth 10) -ContentType 'application/json'

Write-Output ("IMG: $IMG")
Write-Output ("DIM: $($r1.path)")
Write-Output ("CTL: $($r2.path)")
Write-Output ("TBL: $($r3.path)")
