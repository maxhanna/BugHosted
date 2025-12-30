/**
 * Robust Express-based development server with better stability than Angular CLI
 * Handles proxying to backend, serving static assets, and graceful error recovery
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const chalk = require('chalk');

// Configuration
const config = {
  port: process.env.DEV_PORT || 8000,
  host: process.env.DEV_HOST || '0.0.0.0',
  useHttps: process.env.USE_HTTPS === 'true',
  backendUrl: process.env.BACKEND_URL || 'https://localhost:7299',
  distPath: path.join(__dirname, 'dist', 'maxhanna.client', 'browser'),
  enableHmr: process.env.ENABLE_HMR !== 'false',
};

const app = express();

// Request logging middleware
app.use((req, res, next) => {
  console.log(chalk.gray(`[${new Date().toISOString()}] ${req.method} ${req.path}`));
  next();
});

// Error handling middleware wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Proxy configuration - matches your proxy.conf.js
const proxyContext = [
  '/weatherforecast', '/calendar', '/mining', '/todo', '/file', '/notepad',
  '/contact', '/user', '/chat', '/news', '/social', '/rom', '/topic',
  '/friend', '/wordler', '/comment', '/coinvalue', '/currencyvalue',
  '/reaction', '/array', '/nexus', '/notification', '/meta', '/ai',
  '/favourite', '/crawler', '/trade', '/top', '/poll', '/mastermind',
  '/ender', '/search', '/bones',
];

// Apply proxy middleware for API routes
app.use(
  createProxyMiddleware(proxyContext, {
    target: config.backendUrl,
    changeOrigin: true,
    secure: false,
    logLevel: process.env.PROXY_DEBUG === 'true' ? 'debug' : 'warn',
    onError: (err, req, res) => {
      console.error(chalk.red(`[Proxy Error] ${req.method} ${req.path}:`), err.message);
      res.status(502).json({
        error: 'Bad Gateway',
        message: 'Backend service unavailable',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    },
    onProxyRes: (proxyRes, req, res) => {
      if (proxyRes.statusCode >= 400) {
        console.warn(chalk.yellow(`[${proxyRes.statusCode}] ${req.method} ${req.path}`));
      }
    },
  })
);

// Serve static assets from dist
app.use(express.static(config.distPath, {
  maxAge: process.env.NODE_ENV === 'production' ? '1y' : '0',
  etag: false,
  setHeaders: (res, filePath) => {
    // Cache busting: set no-cache for index and config files
    if (filePath.endsWith('index.html') || filePath.match(/\.(json|webmanifest)$/)) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// SPA fallback: serve index.html for all non-API, non-asset routes
app.get('*', (req, res) => {
  const indexPath = path.join(config.distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(
      'index.html not found. Run "npm run build" first.'
    );
  }
});

// Global error handler
app.use((err, req, res, next) => {
  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  console.error(chalk.red(`[Error ${status}] ${req.method} ${req.path}:`), message);
  
  res.status(status).json({
    error: message,
    path: req.path,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Create server (HTTP or HTTPS)
let server;
if (config.useHttps) {
  const certPath = path.join(__dirname, 'ssl', 'bughosted_com.crt');
  const keyPath = path.join(__dirname, 'ssl', 'bughosted_com.key');
  
  try {
    const cert = fs.readFileSync(certPath);
    const key = fs.readFileSync(keyPath);
    server = https.createServer({ cert, key }, app);
    console.log(chalk.cyan('[HTTPS] SSL certificates loaded'));
  } catch (err) {
    console.error(chalk.red('[HTTPS] SSL certificate error:'), err.message);
    console.log(chalk.yellow('Falling back to HTTP'));
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

// Handle server errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(chalk.red(`Port ${config.port} is already in use`));
    process.exit(1);
  } else {
    console.error(chalk.red('Server error:'), err);
  }
});

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log(chalk.yellow('\n[Shutdown] Closing server gracefully...'));
  server.close(() => {
    console.log(chalk.green('Server closed'));
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error(chalk.red('[Shutdown] Forced exit after timeout'));
    process.exit(1);
  }, 10000);
}

// Start server
server.listen(config.port, config.host, () => {
  const protocol = config.useHttps ? 'https' : 'http';
  const url = `${protocol}://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
  
  console.log(chalk.green('✓ Dev server started'));
  console.log(chalk.cyan(`  URL: ${url}`));
  console.log(chalk.cyan(`  Backend: ${config.backendUrl}`));
  console.log(chalk.cyan(`  Dist: ${config.distPath}`));
});

// Log uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(chalk.red('[Uncaught Exception]'), err);
  // Don't exit; try to keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('[Unhandled Rejection]'), reason);
});
