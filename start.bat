@echo off
setlocal EnableDelayedExpansion

echo ========================================
echo MCP Diagnosis Tool Startup Script
echo ========================================
echo.

REM Step 1: Free only ports 3060-3065 (do not kill all node.exe)
echo [1/5] Freeing ports 3060-3065...
for /L %%P in (3060,1,3065) do (
  REM for /f "tokens=5" %%A in ('netstat -ano ^| findstr LISTENING ^| findstr ":%%P "') do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr LISTENING ^| findstr ":%%P "') do (
    echo   - Killing PID %%A on port %%P
    taskkill /F /PID %%A >nul 2>&1
  )
)
timeout /t 1 /nobreak >nul
echo Target ports cleaned (if any)
echo.

REM Step 2: Set port environment variable
echo [2/5] Setting PORT to 3060...
set PORT=3060
echo PORT set to %PORT%
echo.

REM Step 3: Start the application
echo [3/5] Starting MCP Diagnosis Tool...
if exist server.debug.log del /f /q server.debug.log >nul 2>&1
if exist server.log del /f /q server.log >nul 2>&1
start /B cmd /c "npm start > server.log 2>&1"
echo Server starting...
echo.

REM Step 4: Wait for server to be ready and perform health check
echo [4/5] Waiting for server to start...
set RETRY=0
set MAX_RETRIES=30

:healthcheck
timeout /t 1 /nobreak >nul
set /a RETRY+=1

REM Try to connect to the server
curl -s http://localhost:3060 >nul 2>&1
if %errorlevel% equ 0 (
    echo Health check passed! Server is running.
    goto success
)

if %RETRY% lss %MAX_RETRIES% (
    echo Attempt %RETRY%/%MAX_RETRIES%...
    goto healthcheck
) else (
    echo.
    echo Error: Server did not start within 30 seconds.
    echo Please check server.log for details.
    goto end
)

:success
echo.
echo [5/5] Server is ready!
echo ========================================
echo.
echo   MCP Diagnosis Tool is running at:
echo   http://localhost:3060
echo.
echo ========================================
echo.
echo Press Ctrl+C to stop the server
echo Server logs are being written to server.log
echo.
pause

:end

