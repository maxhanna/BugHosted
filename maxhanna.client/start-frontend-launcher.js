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
  } catch (e) {
    // ignore logging errors
  }
}

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
    console.log('[Launcher] Starting build (detached mode)...');
    
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
      
      if (str.includes('Application bundle generation complete')) {
        buildCompleted = true;
        console.log('[Launcher] Build completion detected');
      }
    });

    child.stderr?.on('data', (data) => {
      process.stderr.write(data.toString());
    });

    // Poll for index.html instead of waiting for process exit
    let checkCount = 0;
    const maxChecks = 60; // Up to 60 checks
    const checkInterval = setInterval(() => {
      checkCount++;
      
      // If index.html exists and we saw completion message, we're done
      if (fs.existsSync(browserIndex) && buildCompleted) {
        clearInterval(checkInterval);
        console.log('[Launcher] index.html found, proceeding to start server');
        indexPath = browserIndex;
        return resolve(true);
      }
      
      // Timeout after 60 checks or if time exceeded
      if (checkCount > maxChecks || Date.now() - startTime > maxMs) {
        clearInterval(checkInterval);
        try { child.kill(); } catch (e) {}
        
        if (fs.existsSync(browserIndex)) {
          console.log('[Launcher] Timeout but index.html exists, proceeding');
          return resolve(true);
        }
        return reject(new Error('Build timeout or index.html not found'));
      }
    }, 500);

    const startTime = Date.now();

    child.on('error', (err) => {
      clearInterval(checkInterval);
      reject(err);
    });

    // Even if process exits early, continue polling until timeout or index found
    child.on('exit', (code) => {
      if (code !== 0 && !buildCompleted) {
        console.warn(`[Launcher] Build process exited with code ${code}, but continuing...`);
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
