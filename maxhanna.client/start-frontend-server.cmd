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
