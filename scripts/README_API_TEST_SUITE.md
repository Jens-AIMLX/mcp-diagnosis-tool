# Cognitive-Visual Toolsuite API Test Suite

## Overview

This directory contains the complete API test suite for the cognitive-visual tools, implementing all test scenarios from the generic testplan.

## Files

### 1. `params2_cognitive_api.ps1`
Complete PowerShell script that executes all test scenarios via the MCP Diagnosis Tool API.

**Test Coverage:**
- **B. Playwright Baseline Capture** - Captures baseline screenshot
- **C.1 Health Check** - Validates cognitive-visual server health
- **C.2 Dimensions Analysis** (5 tests)
  - Image mode (latest screenshot)
  - Image mode (explicit path)
  - URL mode
  - Area focus (URL mode)
  - Area focus (Image mode)
- **C.3 Controls Analysis** (4 tests)
  - Image mode (latest screenshot)
  - Image mode (explicit path)
  - URL mode
  - Area focus (URL mode)
- **C.4 Tables Analysis** (3 tests)
  - Image mode (latest screenshot)
  - Image mode (explicit path)
  - URL mode
- **C.5 Buttons Analysis** (1 test)
  - Image mode
- **C.6 Difference Analysis** (5 tests)
  - Setup: Capture current screenshot
  - Image→Image (both provided)
  - Image→Image (current auto-latest)
  - URL→URL
  - Area focus

**Total Tests:** 23 test scenarios

### 2. YAML Configuration
Reference: `C:\Users\jenss\OneDrive - Singularyt UG\Code\Test\docs\testplans\cognitive-visual-toolsuite-generic-testplan.api.yaml`

Declarative test plan in YAML format with:
- Complete server specs (Playwright + Cognitive Visual Analytics)
- Environment variables configuration
- Parametersets for baseline/current images
- All test runs with proper arguments

## Usage

### Prerequisites
1. MCP Diagnosis Server running at `http://localhost:3060`
2. Target application running at `http://localhost:3002/zertifikat`
3. PowerShell 5.1 or later

### Running the Test Suite

```powershell
# Navigate to the scripts directory
cd C:\Users\jenss\OneDrive - Singularyt UG\Code\source\AIServer\mcp-diagnosis-tool\scripts

# Run the complete test suite
.\params2_cognitive_api.ps1
```

### Output

The script will:
1. Display colored progress output for each test
2. Generate markdown reports in `C:\Users\jenss\OneDrive - Singularyt UG\Code\Test\.evidence\reports\`
3. Save screenshots in `C:\Users\jenss\OneDrive - Singularyt UG\Code\Test\.evidence\screenshots\cognitive\`
4. Display a summary with pass/fail counts
5. Exit with code 0 (success) or 1 (failure)

**Example Output:**
```
========================================
Cognitive-Visual Toolsuite API Test Suite
========================================

[B] Playwright Baseline Capture
  ✓ Baseline screenshot captured: C:/Users/jenss/.../baseline_zertifikate.jpg

[C.1] Health Check
  ✓ Health check completed: C:/Users/jenss/.../MCPDiagnosis_Report_health_api.md

[C.2] Dimensions Analysis
  ✓ C.2.1 Image Mode (latest): C:/Users/jenss/.../MCPDiagnosis_Report_dimensions_image_latest_api.md
  ✓ C.2.2 Image Mode (explicit): C:/Users/jenss/.../MCPDiagnosis_Report_dimensions_image_explicit_api.md
  ...

========================================
Test Summary
========================================

Total Tests: 23
Passed: 23
Failed: 0

Generated Reports:
  - C.1 Health Check: C:/Users/jenss/.../MCPDiagnosis_Report_health_api.md
  - C.2.1 Dimensions - Image Latest: C:/Users/jenss/.../MCPDiagnosis_Report_dimensions_image_latest_api.md
  ...

Screenshots:
  - Baseline: C:/Users/jenss/.../baseline_zertifikate.jpg
  - Current: C:/Users/jenss/.../current_zertifikate.jpg

========================================
Test Suite Complete
========================================
```

## Test Scenarios Explained

### Image Mode vs URL Mode
- **Image Mode**: Analyzes an existing screenshot file (either latest or explicit path)
- **URL Mode**: Navigates to URL, captures screenshot, then analyzes

### Area Focus
- **URL Mode**: Uses DOM query to find element by ID/name, restricts analysis to that region
- **Image Mode**: Uses OCR to locate text, restricts analysis to that region (with fallback to full image)

### Difference Analysis
- **Image→Image**: Compares two screenshot files with calibrated alignment
- **URL→URL**: Navigates to both URLs, captures screenshots, then compares
- **Auto-latest**: Uses latest screenshot in outputDir as current image

## API Endpoints Used

- `POST /api/sessions/open` - Opens MCP server session
- `POST /api/tools/call` - Executes tool and returns raw result
- `POST /api/tools/report` - Executes tool and generates markdown report

## Configuration

### Server Specs
Both Playwright and Cognitive Visual Analytics servers are configured with explicit specs in the script:

**Playwright:**
- Browser: Chrome (Chromium)
- Viewport: 2400x1350
- Output directory: `.evidence/screenshots/cognitive`
- Isolated mode with no-sandbox

**Cognitive Visual Analytics:**
- Screenshot path: `#PLAYWRIGHTPATH#` (auto-resolves to Playwright outputDir)
- Report path: `.evidence/reports`
- Calibration enabled for difference analysis
- All visual diff features enabled

### Environment Variables
All cognitive-visual environment variables are configured in the `$CVA` spec:
- `SCREENSHOT_PATH`, `REPORT_PATH`, `CALIBRATION_PATH`, `DIFFERENCE_PATH`
- Visual diff defaults (OCR, color, dimensions, elements)
- Auto-screenshot and workspace folder settings
- Playwright config JSON

## Troubleshooting

### Common Issues

1. **"Screenshot not found"**
   - Ensure Playwright MCP server is running
   - Check that outputDir is writable
   - Verify browser can navigate to target URL

2. **"Connection refused to localhost:3060"**
   - Start MCP Diagnosis Server: `npm start` or `node server.js`

3. **"Connection refused to localhost:3002"**
   - Start target application

4. **Tool timeout**
   - Increase `toolTimeoutSec` in `$CVA` spec (default: 120)
   - Check cognitive-visual server logs for errors

5. **Area not found**
   - URL mode: Verify element ID/name exists in DOM
   - Image mode: Verify text is visible and OCR-readable
   - Check debug_info in report for warnings

## Integration with CI/CD

The script exits with appropriate codes:
- `0` = All tests passed
- `1` = One or more tests failed

Example CI integration:
```yaml
- name: Run Cognitive Visual API Tests
  run: |
    powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/params2_cognitive_api.ps1
```

## Related Documentation

- Main testplan: `docs/testplans/cognitive-visual-toolsuite-generic-testplan.md`
- YAML testplan: `docs/testplans/cognitive-visual-toolsuite-generic-testplan.api.yaml`
- API documentation: `mcpdiagnosis_api.md`
- Original example: `scripts/params2_cognitive_api.ps1` (this file)

## Version History

- **v0.8.0-api** - Initial complete API test suite
  - All 23 test scenarios from generic testplan
  - Comprehensive error handling and reporting
  - Color-coded console output
  - Summary with pass/fail counts

