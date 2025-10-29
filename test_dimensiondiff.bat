@echo off
echo Testing cognitive_visual_dimensiondiff Tool

powershell -Command "& { $json = Get-Content test_dimensiondiff_request.json -Raw; $result = Invoke-RestMethod -Uri 'http://localhost:3060/api/tools/report' -Method Post -Body $json -ContentType 'application/json'; Write-Host 'Report generated:' $result.path -ForegroundColor Green }"

echo.
echo Test completed

