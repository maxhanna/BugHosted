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
const chalk = require('chalk');

// Get frontend folder (parent of this script)
const frontendPath = path.dirname(__filename);
const prodServerPath = path.join(frontendPath, 'prod-server.js');

// Verify prod-server.js exists
if (!fs.existsSync(prodServerPath)) {
  console.error(chalk.red('ERROR: prod-server.js not found!'));
  console.error(`Expected path: ${prodServerPath}`);
  process.exit(1);
}

// Check if dist folder is built
const distPath = path.join(frontendPath, 'dist', 'maxhanna.client', 'browser');
if (!fs.existsSync(distPath)) {
  console.error(chalk.red('ERROR: Frontend not built!'));
  console.error(`Expected: npm run build in ${frontendPath}`);
  process.exit(1);
}

// Configuration
const config = {
  port: process.env.FRONTEND_PORT || process.env.PORT || 443,
  useHttps: process.env.USE_HTTPS !== 'false',
  backendUrl: process.env.BACKEND_URL || 'https://localhost:7299',
  nodeEnv: 'production',
};

console.log(chalk.blue('═══════════════════════════════════════════════════'));
console.log(chalk.blue('  Frontend Server Launcher (Called by .NET Backend)'));
console.log(chalk.blue('═══════════════════════════════════════════════════'));
console.log(chalk.cyan('Configuration:'));
console.log(chalk.cyan(`  Port:      ${config.port}`));
console.log(chalk.cyan(`  HTTPS:     ${config.useHttps ? 'Enabled' : 'Disabled'}`));
console.log(chalk.cyan(`  Backend:   ${config.backendUrl}`));
console.log(chalk.cyan(`  Dist Path: ${distPath}`));
console.log();

// Prepare environment
const env = {
  ...process.env,
  NODE_ENV: config.nodeEnv,
  PROD_PORT: config.port,
  USE_HTTPS: config.useHttps.toString(),
  BACKEND_URL: config.backendUrl,
};

// Start the production server
console.log(chalk.yellow(`Starting Express production server...`));
console.log(chalk.gray(`Command: node ${prodServerPath}`));
console.log();

const server = spawn('node', [prodServerPath], {
  cwd: frontendPath,
  env: env,
  stdio: 'inherit', // Inherit stdio so we see all output
});

server.on('error', (err) => {
  console.error(chalk.red('Failed to start server:'), err.message);
  process.exit(1);
});

server.on('exit', (code, signal) => {
  if (code !== 0 && code !== null) {
    console.error(chalk.red(`Server exited with code ${code} (signal: ${signal})`));
  } else {
    console.log(chalk.green('Server closed gracefully'));
  }
  process.exit(code || 0);
});

// Handle parent process signals
process.on('SIGTERM', () => {
  console.log(chalk.yellow('SIGTERM received, shutting down gracefully...'));
  server.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log(chalk.yellow('SIGINT received, shutting down gracefully...'));
  server.kill('SIGINT');
});
