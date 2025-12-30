#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { spawnSync, spawn } = require('child_process');

const frontendPath = path.resolve(__dirname);
const prodServerPath = path.join(frontendPath, 'prod-server.js');
const distRoot = path.join(frontendPath, 'dist', 'maxhanna.client');
const browserIndex = path.join(distRoot, 'browser', 'index.html');
const launcherLog = path.join(frontendPath, 'launcher.log');

function writeLog(...parts) {
  try {
    const ts = new Date().toISOString();
    const msg = parts.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
    fs.appendFileSync(launcherLog, `${ts} ${msg}\n`);
    console.log(`[LOG] ${msg}`); // Also log to console
  } catch (e) {
    // ignore logging errors
  }
}

// Log startup info
writeLog('=== Launcher Started ===');
writeLog('Frontend path:', frontendPath);
writeLog('Prod server path:', prodServerPath);
writeLog('Dist root:', distRoot);
writeLog('Browser index path:', browserIndex);
writeLog('Current working directory:', process.cwd());

function findIndexRecursive(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name.toLowerCase() === 'index.html') return full;
      if (e.isDirectory()) {
        const found = findIndexRecursive(full);
        if (found) return found;
      }
    }
  } catch (err) {
    writeLog('index.html not found; starting build', { frontendPath, cwd: process.cwd(), nodeExec: process.execPath });
    return null;
  }
  return null;
}

if (!fs.existsSync(prodServerPath)) {
  console.error(`ERROR: prod-server.js not found at ${prodServerPath}`);
  process.exit(1);
}

// If index.html not present, run build using the local Angular CLI binary
let indexPath = browserIndex;
async function runBuildIfNeeded() {
  if (fs.existsSync(indexPath)) return true;

  console.log('index.html not found; running Angular build (foreground)');

  // Prefer local ng binary to avoid npm wrapper behavior
  const isWin = process.platform === 'win32';
  const ngBin = isWin ? path.join(frontendPath, 'node_modules', '.bin', 'ng.cmd') : path.join(frontendPath, 'node_modules', '.bin', 'ng');
  const useNpx = !fs.existsSync(ngBin);

  const buildCmd = useNpx ? 'npx' : ngBin;
  const buildArgs = useNpx ? ['ng', 'build', '--configuration', 'production'] : ['build', '--configuration', 'production'];

  console.log(`Running: ${buildCmd} ${buildArgs.join(' ')}`);

  // Use a synchronous spawn to avoid subtle child-process lifecycle issues
  // when this script is launched by the .NET SPA proxy. The synchronous call
  // ensures we don't continue until the Angular build has fully completed.
  // Spawn build in detached mode so parent process doesn't wait for it to exit.
  // Detached processes can continue running independently and won't block the parent.
  const maxMs = parseInt(process.env.FRONTEND_BUILD_TIMEOUT_MS || '180000', 10);
  
  return new Promise((resolve, reject) => {
    writeLog('[Build] Starting build (detached mode)...');
    
    // Spawn with detached: true so the build can run independently
    const child = spawn(buildCmd, buildArgs, { 
      cwd: frontendPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWin,
      detached: isWin // On Windows, detached allows the process to run in background
    });

    let lastOutput = '';
    let buildCompleted = false;
    
    // Capture output to detect completion
    child.stdout?.on('data', (data) => {
      const str = data.toString();
      lastOutput += str;
      process.stdout.write(str);
      writeLog('[Build stdout]', str); // Log to file
      
      if (str.includes('Application bundle generation complete')) {
        buildCompleted = true;
        writeLog('[Build] Build completion detected in output');
      }
    });

    child.stderr?.on('data', (data) => {
      const str = data.toString();
      process.stderr.write(str);
      writeLog('[Build stderr]', str); // Log to file
    });

    // Poll for index.html instead of waiting for process exit
    let checkCount = 0;
    const maxChecks = 120; // More generous limit (60 seconds at 500ms interval)
    const checkInterval = setInterval(() => {
      checkCount++;
      
      // Log what we're checking
      const indexExists = fs.existsSync(browserIndex);
      writeLog(`[Poll] Check #${checkCount}: index exists=${indexExists}, build completed=${buildCompleted}`);
      
      // If index.html exists and we saw completion message, we're done
      if (indexExists && buildCompleted) {
        clearInterval(checkInterval);
        writeLog('[Poll] SUCCESS: index.html found and build completed, proceeding to start server');
        indexPath = browserIndex;
        return resolve(true);
      }
      
      // List dist contents to help debug
      if (checkCount % 4 === 0) { // Every 2 seconds
        try {
          const distContents = fs.readdirSync(distRoot);
          writeLog('[Poll] Dist root contents:', distContents);
          const browserPath = path.join(distRoot, 'browser');
          if (fs.existsSync(browserPath)) {
            const browserContents = fs.readdirSync(browserPath);
            writeLog('[Poll] Browser folder contents:', browserContents);
          }
        } catch (e) {
          writeLog('[Poll] Error listing dist:', e && e.message ? e.message : e);
        }
      }
      
      // Timeout after checks or if time exceeded
      if (checkCount > maxChecks || Date.now() - startTime > maxMs) {
        clearInterval(checkInterval);
        try { child.kill(); } catch (e) {}
        
        writeLog('[Poll] TIMEOUT: Max checks/time exceeded');
        if (fs.existsSync(browserIndex)) {
          writeLog('[Poll] But index.html exists, proceeding anyway');
          return resolve(true);
        }
        
        // Try to list what's actually there for debugging
        try {
          const distContents = fs.readdirSync(distRoot);
          writeLog('[Poll] Final dist contents:', distContents);
        } catch (e) {
          writeLog('[Poll] Could not list dist:', e && e.message ? e.message : e);
        }
        
        return reject(new Error('Build timeout or index.html not found'));
      }
    }, 500);

    const startTime = Date.now();

    child.on('error', (err) => {
      clearInterval(checkInterval);
      writeLog('[Build] Process error:', err && err.message ? err.message : err);
      reject(err);
    });

    // Even if process exits early, continue polling until timeout or index found
    child.on('exit', (code) => {
      writeLog('[Build] Build process exited with code:', code);
      if (code !== 0 && !buildCompleted) {
        writeLog('[Build] WARNING: Non-zero exit but continuing polling...');
      }
    });
  });
}

// Run the build if needed, locate index.html, then start the production server
(async () => {
  try {
    await runBuildIfNeeded();

    // If still not found, search recursively
    if (!fs.existsSync(indexPath)) {
      console.log('Index not at expected location, searching recursively under', distRoot);
      const found = findIndexRecursive(distRoot);
      if (found) {
        indexPath = found;
        console.log('Found index.html at', indexPath);
      }
    }

    if (!fs.existsSync(indexPath)) {
      console.error('ERROR: index.html not found under', distRoot);
      process.exit(1);
    }

    // Start the production server in-process to avoid child-process signal and
    // lifecycle complexities when invoked by the .NET SPA proxy. Requiring the
    // script will execute it in the current process (it exports the Express
    // app and calls server.listen internally).
    console.log('Starting prod server (in-process):', prodServerPath);
    try {
      // Ensure env for the server is set
      process.env.NODE_ENV = process.env.NODE_ENV || 'production';
      process.env.PROD_PORT = process.env.FRONTEND_PORT || process.env.PORT || process.env.PROD_PORT || '443';
      process.env.USE_HTTPS = process.env.USE_HTTPS || 'true';
      process.env.BACKEND_URL = process.env.BACKEND_URL || 'https://localhost:7299';

      // Require the server file directly. It will start listening immediately.
      require(prodServerPath);
    } catch (err) {
      console.error('Failed to require/start prod server in-process:', err && err.stack ? err.stack : err);
      process.exit(1);
    }
  } catch (err) {
    console.error('Error preparing frontend:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
