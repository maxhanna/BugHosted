#!/usr/bin/env node

/**
 * Frontend Server Starter Script
 * Called by maxhanna.Server (C# .NET backend) via SpaProxy
 * Automatically starts Express production server with SSL support
 * 
 * Usage: node start-frontend-server.js
 * Environment Variables:
 *   - FRONTEND_PORT: Port to run frontend on (default: 443)
 *   - USE_HTTPS: Enable HTTPS (default: true)
 *   - BACKEND_URL: Backend API URL (auto-configured by .NET app)
 *   - NODE_ENV: Environment (auto-set to production)
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Try to load chalk, but don't crash if missing
let chalk;
try {
  chalk = require('chalk');
} catch (e) {
  // Fallback if chalk not available
  chalk = {
    red: (msg) => msg,
    green: (msg) => msg,
    yellow: (msg) => msg,
    cyan: (msg) => msg,
    blue: (msg) => msg,
    gray: (msg) => msg,
  };
}

// Setup logging to file for debugging
const logFile = path.join(__dirname, 'launcher.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(msg, toFile = true) {
  console.log(msg);
  if (toFile) {
    logStream.write(msg + '\n');
  }
}

// Initial log
log(`\n[${new Date().toISOString()}] Launcher started`);
log(`Working directory: ${__dirname}`);

// Get frontend folder (parent of this script)
const frontendPath = path.dirname(__filename);
const prodServerPath = path.join(frontendPath, 'prod-server.js');

log(`Frontend path: ${frontendPath}`);
log(`Prod server path: ${prodServerPath}`);

// Verify prod-server.js exists
if (!fs.existsSync(prodServerPath)) {
  log(`ERROR: prod-server.js not found at ${prodServerPath}`);
  logStream.end();
  process.exit(1);
}
log(`✓ prod-server.js found`);

// Check if dist folder is built
const distPath = path.join(frontendPath, 'dist', 'maxhanna.client', 'browser');
log(`Checking dist path: ${distPath}`);
if (!fs.existsSync(distPath)) {
  log(`ERROR: Frontend not built! Expected: npm run build in ${frontendPath}`);
  logStream.end();
  process.exit(1);
}
log(`✓ dist folder found`);

// Configuration
const config = {
  port: process.env.FRONTEND_PORT || process.env.PORT || 443,
  useHttps: process.env.USE_HTTPS !== 'false',
  backendUrl: process.env.BACKEND_URL || 'https://localhost:7299',
  nodeEnv: 'production',
};

log(`\n=== Configuration ===`);
log(`  Port:      ${config.port}`);
log(`  HTTPS:     ${config.useHttps ? 'Enabled' : 'Disabled'}`);
log(`  Backend:   ${config.backendUrl}`);
log(`  Dist Path: ${distPath}`);
log(`  Node Env:  ${config.nodeEnv}\n`);

// Prepare environment
const env = {
  ...process.env,
  NODE_ENV: config.nodeEnv,
  PROD_PORT: config.port,
  USE_HTTPS: config.useHttps.toString(),
  BACKEND_URL: config.backendUrl,
};

// Start the production server
log(`Starting Express production server...`);
log(`Command: node ${prodServerPath}`);
log(`\n=== Server Output ===\n`);

try {
  const server = spawn('node', [prodServerPath], {
    cwd: frontendPath,
    env: env,
    stdio: 'inherit', // Inherit stdio so we see all output
  });

  server.on('error', (err) => {
    log(`\nERROR: Failed to start server: ${err.message}`);
    logStream.end();
    process.exit(1);
  });

  server.on('exit', (code, signal) => {
    log(`\n\n=== Server Exited ===`);
    if (code !== 0 && code !== null) {
      log(`Server exited with code ${code} (signal: ${signal})`);
    } else {
      log(`Server closed gracefully`);
    }
    logStream.end();
    process.exit(code || 0);
  });

  // Handle parent process signals
  process.on('SIGTERM', () => {
    log(`\nSIGTERM received, shutting down gracefully...`);
    server.kill('SIGTERM');
  });

  process.on('SIGINT', () => {
    log(`\nSIGINT received, shutting down gracefully...`);
    server.kill('SIGINT');
  });

} catch (err) {
  log(`\nCRITICAL ERROR: ${err.message}`);
  log(`Stack: ${err.stack}`);
  logStream.end();
  process.exit(1);
}
});
