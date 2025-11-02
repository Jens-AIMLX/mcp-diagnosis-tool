@echo off
setlocal EnableDelayedExpansion

echo ========================================
echo MCP Diagnosis Tool Stop Script
echo ========================================
echo.

REM Step 1: Free only ports 3060-3065 (do not kill all node.exe)
echo [1/5] Freeing ports 3060-3065...
for /L %%P in (3060,1,3065) do (
  REM for /f "tokens=5" %%A in ('netstat -ano ^| findstr LISTENING ^| findstr ":%%P "') do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P "') do (
    echo   - Killing PID %%A on port %%P
    taskkill /F /PID %%A >nul 2>&1
  )
)
timeout /t 1 /nobreak >nul
echo Target ports cleaned (if any)
echo.

REM Step 