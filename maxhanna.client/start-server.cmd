@echo off
REM -----------------------------------------------------------------------------
REM start-server.cmd
REM Cleans the ./dist folder and starts start-frontend-launcher.js
REM Runs from the client directory to ensure relative paths resolve.
REM -----------------------------------------------------------------------------

REM Ensure we are in the folder where this script lives (the client dir)
pushd "%~dp0"

REM Set a cool console color and title
title BugHosted Launcher
color 0A

REM Show current directory and Node presence (helpful diagnostics)
echo [start-server.cmd] Working directory: %CD%
where node >nul 2>&1
if errorlevel 1 (
  echo [start-server.cmd] ERROR: 'node' not found on PATH.
  echo Please install Node.js or add it to PATH. You can also hardcode the path below.
  goto :end
)

REM Clean the dist folder using Node (cross-platform, handles read-only files with force)
echo [start-server.cmd] Removing 'dist'...
node -e "require('fs').rmSync('dist',{recursive:true,force:true})"

REM Clean the launcher.log file
echo [start-server.cmd] Removing 'launcher.log'...
node -e "require('fs').rmSync('launcher.log',{force:true})"

REM Start your launcher
echo [start-server.cmd] Starting 'start-frontend-launcher.js'...
node start-frontend-launcher.js

:end
REM Restore default colors (optional)
color 07
popd