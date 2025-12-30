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

// If index.html not present, run build synchronously so output appears in console
let indexPath = browserIndex;
if (!fs.existsSync(indexPath)) {
  console.log('index.html not found; running `npm run build -- --configuration production` (foreground)');
  const build = spawnSync('npm', ['run', 'build', '--', '--configuration', 'production'], {
    cwd: frontendPath,
    stdio: 'inherit',
    shell: true,
  });

  if (build.error) {
    console.error('Failed to run build:', build.error);
    process.exit(1);
  }

  if (build.status !== 0) {
    console.error('Build failed with exit code', build.status);
    process.exit(build.status || 1);
  }

  if (fs.existsSync(browserIndex)) {
    indexPath = browserIndex;
  }
}

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
