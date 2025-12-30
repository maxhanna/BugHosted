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
  if (fs.existsSync(indexPath)) {
    writeLog('[Build] index.html already exists at', indexPath);
    return true;
  }

  console.log('index.html not found; running Angular build (foreground)');
  writeLog('[Build] index.html not found at', indexPath);
  writeLog('[Build] Frontend path:', frontendPath);

  // Prefer local ng binary to avoid npm wrapper behavior
  const isWin = process.platform === 'win32';
  const ngBin = isWin ? path.join(frontendPath, 'node_modules', '.bin', 'ng.cmd') : path.join(frontendPath, 'node_modules', '.bin', 'ng');
  const useNpx = !fs.existsSync(ngBin);

  const buildCmd = useNpx ? 'npx' : ngBin;
  const buildArgs = useNpx ? ['ng', 'build', '--configuration', 'production'] : ['build', '--configuration', 'production'];

  console.log(`Running: ${buildCmd} ${buildArgs.join(' ')}`);
  writeLog('[Build] Build command:', buildCmd, buildArgs.join(' '));

  // Use a synchronous spawn to avoid subtle child-process lifecycle issues
  // when this script is launched by the .NET SPA proxy. The synchronous call
  // ensures we don't continue until the Angular build has fully completed.
  // Spawn build and monitor stdout for completion. The ng.cmd process may hang
  // after printing "Output location", so we kill it after detecting completion.
  const maxMs = parseInt(process.env.FRONTEND_BUILD_TIMEOUT_MS || '180000', 10);
  
  return new Promise((resolve, reject) => {
    writeLog('[Build] Starting build...');
    
    const child = spawn(buildCmd, buildArgs, { 
      cwd: frontendPath,
      stdio: ['ignore', 'pipe', 'pipe'],  // Capture output so we can detect completion
      shell: isWin,
      timeout: maxMs 
    });

    let buildCompleted = false;
    let hasResolved = false;
    
    // Capture stdout to detect completion messages
    child.stdout?.on('data', (data) => {
      const str = data.toString();
      process.stdout.write(str);  // Echo to console
      writeLog('[Build stdout]', str);
      
      // Detect successful build completion
      if (str.includes('Output location:') && !buildCompleted) {
        buildCompleted = true;
        writeLog('[Build] Build complete detected (Output location printed)');
        writeLog('[Build] Waiting 3 seconds for all files to be written to disk...');
        
        // Wait 10 seconds before killing so files can fully flush to disk
        setTimeout(() => {
          writeLog('[Build] Now killing build process...');
          try {
            child.kill('SIGTERM');
          } catch (e) {
            writeLog('[Build] Could not kill child, but proceeding anyway');
          }
        }, 3000);
        
        // And wait another 3 seconds after the kill before checking files
        setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true;
            
            // Debug: list what's actually in the dist folder
            try {
              const distContents = fs.readdirSync(distRoot);
              writeLog('[Build] Dist folder contents:', distContents);
              const browserPath = path.join(distRoot, 'browser');
              if (fs.existsSync(browserPath)) {
                const browserContents = fs.readdirSync(browserPath);
                writeLog('[Build] Browser folder contents:', browserContents);
              }
            } catch (e) {
              writeLog('[Build] Error listing dist:', e && e.message ? e.message : e);
            }
            
            if (fs.existsSync(browserIndex)) {
              indexPath = browserIndex;
              writeLog('[Build] index.html found, resolving');
              resolve(true);
            } else {
              writeLog('[Build] index.html not found after build, but proceeding anyway - prod-server will handle fallback');
              // Even if index.html isn't there, proceed - prod-server has fallback logic
              resolve(true);
            }
          }
        }, 5000);  // Total 5 seconds wait
      }
    });

    child.stderr?.on('data', (data) => {
      const str = data.toString();
      process.stderr.write(str);
      writeLog('[Build stderr]', str);
    });

    const timeoutHandle = setTimeout(() => {
      writeLog('[Build] Build timeout');
      try { child.kill('SIGKILL'); } catch (e) {}
      if (!hasResolved) {
        hasResolved = true;
        reject(new Error('Build timeout'));
      }
    }, maxMs);

    child.on('error', (err) => {
      clearTimeout(timeoutHandle);
      writeLog('[Build] Process error:', err && err.message ? err.message : err);
      if (!hasResolved) {
        hasResolved = true;
        reject(err);
      }
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timeoutHandle);
      writeLog('[Build] Process exited with code:', code, 'signal:', signal);
      // If we've already resolved from the stdout completion detection, ignore this
      // (code will be null when killed by signal, which is expected and OK)
      if (!hasResolved && code !== 0 && code !== null) {
        hasResolved = true;
        reject(new Error(`Build failed with exit code ${code}`));
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
