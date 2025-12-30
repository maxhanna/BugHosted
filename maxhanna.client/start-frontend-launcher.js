#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { spawnSync, spawn } = require('child_process');

const frontendPath = path.resolve(__dirname);
const prodServerPath = path.join(frontendPath, 'prod-server.js');
const distRoot = path.join(frontendPath, 'dist', 'maxhanna.client');
const browserIndex = path.join(distRoot, 'browser', 'index.html');

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

  return new Promise((resolve, reject) => {
    const child = spawn(buildCmd, buildArgs, { cwd: frontendPath, stdio: 'inherit', shell: false });

    // Timeout to prevent hanging indefinitely (default 3 minutes)
    const maxMs = parseInt(process.env.FRONTEND_BUILD_TIMEOUT_MS || '180000', 10);
    const timer = setTimeout(() => {
      console.error(`Build timeout after ${maxMs}ms, killing build process`);
      try { child.kill('SIGTERM'); } catch (e) {}
      reject(new Error('Build timeout'));
    }, maxMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('Build failed with code ' + code));
      // refresh indexPath
      if (fs.existsSync(browserIndex)) indexPath = browserIndex;
      resolve(true);
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

    // Start the production server and forward stdio
    console.log('Starting prod server:', prodServerPath);
    const server = spawn(process.execPath, [prodServerPath], {
      cwd: frontendPath,
      env: { ...process.env, NODE_ENV: 'production', PROD_PORT: process.env.FRONTEND_PORT || process.env.PORT || '443', USE_HTTPS: 'true', BACKEND_URL: process.env.BACKEND_URL || 'https://localhost:7299' },
      stdio: 'inherit',
      shell: false,
    });

    server.on('error', (err) => {
      console.error('Failed to start prod server:', err);
      process.exit(1);
    });

    server.on('exit', (code, signal) => {
      if (code !== null) console.log(`prod-server exited with code ${code}`);
      if (signal) console.log(`prod-server exited with signal ${signal}`);
      process.exit(code || (signal ? 1 : 0));
    });

    process.on('SIGINT', () => server.kill('SIGINT'));
    process.on('SIGTERM', () => server.kill('SIGTERM'));
  } catch (err) {
    console.error('Error preparing frontend:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
