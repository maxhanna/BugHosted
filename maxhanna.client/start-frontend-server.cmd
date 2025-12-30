@echo off
REM Frontend Server Starter - Windows Batch Wrapper
REM Called by maxhanna.Server (C# .NET backend) via SpaProxy
REM Working directory is already set to maxhanna.client folder

setlocal enabledelayedexpansion

REM Current directory should be maxhanna.client
echo. >> launcher.log
echo [%date% %time%] Frontend server launcher started >> launcher.log
echo Current directory: %CD% >> launcher.log

REM Check if prod-server.js exists
if not exist "prod-server.js" (
    echo ERROR: prod-server.js not found in %CD% >> launcher.log
    exit /b 1
)
echo prod-server.js found >> launcher.log

REM Check if dist folder exists
if not exist "dist\maxhanna.client\browser" (
    echo ERROR: dist folder not found. Run: npm run build >> launcher.log
    exit /b 1
)
echo dist folder found >> launcher.log

REM Ensure index.html exists, otherwise run a production build automatically
if not exist "dist\maxhanna.client\browser\index.html" (
    echo index.html not found, starting production build in background... >> launcher.log
    echo Running: npm run build -- --configuration production >> launcher.log
    REM Start build in background so the launcher can poll for output files
    start "angular-build" /B cmd /c "npm run build -- --configuration production >> launcher.log 2>&1"

    REM Poll for index.html with timeout (seconds)
    set WAIT_SECS=0
    set MAX_WAIT=180
    :poll_index
    if exist "dist\maxhanna.client\browser\index.html" (
        echo Build produced index.html after !WAIT_SECS! seconds >> launcher.log
    ) else (
        if !WAIT_SECS! GEQ !MAX_WAIT! (
            echo Timeout waiting for build to produce index.html (waited !MAX_WAIT!s) >> launcher.log
            exit /b 1
        )
        timeout /t 1 >nul
        set /A WAIT_SECS+=1
        goto poll_index
    )
)

REM Set environment variables for prod-server.js
set NODE_ENV=production
set PROD_PORT=443
set USE_HTTPS=true
set BACKEND_URL=https://localhost:7299

echo Starting Express production server... >> launcher.log
echo Command: node prod-server.js >> launcher.log

REM Start the production server
node prod-server.js

REM Capture exit code
set EXIT_CODE=%ERRORLEVEL%
echo Server exited with code %EXIT_CODE% >> launcher.log

exit /b %EXIT_CODE%
