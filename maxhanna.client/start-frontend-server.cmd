@echo off
REM Frontend Server Starter - Windows Batch Wrapper
REM Called by maxhanna.Server (C# .NET backend) via SpaProxy

setlocal enabledelayedexpansion

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0
set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

REM Log file for debugging
set LOG_FILE=%SCRIPT_DIR%\launcher.log

echo. >> %LOG_FILE%
echo [%date% %time%] Frontend server launcher started >> %LOG_FILE%
echo Script directory: %SCRIPT_DIR% >> %LOG_FILE%

REM Check if prod-server.js exists
if not exist "%SCRIPT_DIR%\prod-server.js" (
    echo ERROR: prod-server.js not found at %SCRIPT_DIR%\prod-server.js >> %LOG_FILE%
    exit /b 1
)
echo prod-server.js found >> %LOG_FILE%

REM Check if dist folder exists
if not exist "%SCRIPT_DIR%\dist\maxhanna.client\browser" (
    echo ERROR: dist folder not found. Run: npm run build >> %LOG_FILE%
    exit /b 1
)
echo dist folder found >> %LOG_FILE%

REM Set environment variables for prod-server.js
set NODE_ENV=production
set PROD_PORT=443
set USE_HTTPS=true
set BACKEND_URL=https://localhost:7299

echo Starting Express production server... >> %LOG_FILE%
echo Command: node "%SCRIPT_DIR%\prod-server.js" >> %LOG_FILE%

REM Start the production server
cd /d "%SCRIPT_DIR%"
node "%SCRIPT_DIR%\prod-server.js"

REM Capture exit code
set EXIT_CODE=%ERRORLEVEL%
echo Server exited with code %EXIT_CODE% >> %LOG_FILE%

exit /b %EXIT_CODE%
