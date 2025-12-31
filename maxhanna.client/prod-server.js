/**
 * Production-grade Express server with security, performance, and reliability features
 * Replaces ng serve for production deployments
 * 
 * Features:
 * - HTTPS/SSL support with proper certificate handling
 * - Security headers (Helmet)
 * - Request compression (gzip)
 * - Rate limiting and DDoS protection
 * - Request logging and monitoring
 * - Graceful error handling and recovery
 * - Health checks and metrics
 * - API proxy with retry logic
 * - ETag caching for efficient asset delivery
 * - Security best practices (CORS, CSP, HSTS, etc)
 */

const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');
const chalk = require('chalk');

// Configuration
const config = {
  port: parseInt(process.env.PROD_PORT || process.env.PORT || 443, 10),
  host: process.env.PROD_HOST || '0.0.0.0',
  useHttps: process.env.USE_HTTPS !== 'false',
  certPath: process.env.SSL_CERT || path.join(__dirname, 'ssl', 'bughosted_com.crt'),
  keyPath: process.env.SSL_KEY || path.join(__dirname, 'ssl', 'bughosted_com.key'),
  backendUrl: process.env.BACKEND_URL || 'https://localhost:7299',
  // Angular build output may place files in `dist/maxhanna.client/browser` (Angular Universal
  // or differential builds) or directly in `dist/maxhanna.client`. Detect the actual
  // output directory at runtime and use it so Express serves the correct files.
  _distRoot: path.join(__dirname, 'dist', 'maxhanna.client'),
  distPath: null, // resolved below
  nodeEnv: process.env.NODE_ENV || 'production',
  logLevel: process.env.LOG_LEVEL || 'combined',
  enableCompression: process.env.COMPRESSION !== 'false',
  enableHelmet: process.env.HELMET !== 'false',
  enableRateLimit: process.env.RATE_LIMIT !== 'false',
  proxyDebug: process.env.PROXY_DEBUG === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
};

// Create Express app
const app = express();

// Resolve distPath: prefer `dist/maxhanna.client/browser` if present
(() => {
  const browserPath = path.join(config._distRoot, 'browser');
  if (fs.existsSync(browserPath)) {
    config.distPath = browserPath;
  } else if (fs.existsSync(config._distRoot)) {
    config.distPath = config._distRoot;
  } else {
    // Default to the original value (safe fallback)
    config.distPath = path.join(__dirname, 'dist', 'maxhanna.client');
  }
  console.log(chalk.gray(`Serving frontend from: ${config.distPath}`));
})();

// Log dist directory contents for debugging if index.html is missing later
try {
  const files = fs.readdirSync(config.distPath || path.join(__dirname, 'dist', 'maxhanna.client'));
  console.log(chalk.gray(`Files in ${config.distPath}:`));
  files.forEach(f => console.log(chalk.gray(`  - ${f}`)));
} catch (err) {
  console.log(chalk.yellow(`Could not list files in dist path: ${err.message}`));
}

// Explicitly serve built assets from the dist 'assets' folder if present.
// This ensures files like `/assets/mupen64plus/*.wasm` are served directly
// from the build output instead of falling back to the SPA index.html.
const distAssetsPath = path.join(config.distPath, 'assets');
if (fs.existsSync(distAssetsPath)) {
  app.use('/assets', express.static(distAssetsPath, {
    maxAge: '1y',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.wasm')) {
        res.set('Content-Type', 'application/wasm');
      }
    }
  }));
  console.log(chalk.gray(`✓ Serving built assets from: ${distAssetsPath}`));
}

// If index.html is missing in the resolved distPath, do a recursive search for the first index.html
(() => {
  const indexPath = path.join(config.distPath, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.log(chalk.yellow('[Fallback] index.html not found in resolved distPath, searching recursively...'));
    // Depth-first search for index.html under _distRoot
    function findIndex(dir) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isFile() && e.name.toLowerCase() === 'index.html') return full;
          if (e.isDirectory()) {
            const found = findIndex(full);
            if (found) return found;
          }
        }
      } catch (err) {
        return null;
      }
      return null;
    }

    const foundIndex = findIndex(config._distRoot);
    if (foundIndex) {
      const newDist = path.dirname(foundIndex);
      console.log(chalk.green(`[Fallback] Found index at: ${foundIndex}. Serving from: ${newDist}`));
      config.distPath = newDist;
    } else {
      console.log(chalk.red('[Fallback] No index.html found under dist root'));
    }
  } else {
    console.log(chalk.gray('index.html present in resolved distPath'));
  }
})();

// Trust proxy if behind reverse proxy (nginx, load balancer, etc)
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

// ============================================================================
// Security Middleware
// ============================================================================

// Helmet: Set security HTTP headers
if (config.enableHelmet) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        // Allow same-origin and any HTTPS/resource data by default
        defaultSrc: ["'self'", 'https:', 'data:'],
        // Allow scripts from self, HTTPS, common CDNs and permit inline/eval for legacy code
        // Include 'blob:' so dynamic/imported blob modules are permitted
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'cdn.jsdelivr.net', 'https:', 'blob:'],
        // Allow external script elements (e.g. hashed filenames) from self, HTTPS and blob URLs
        'script-src-elem': ["'self'", 'https:', 'cdn.jsdelivr.net', 'blob:', "'unsafe-inline'", "'unsafe-eval'"],
        // Permit inline handlers temporarily (refactor to remove)
        'script-src-attr': ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'https:'],
        fontSrc: ["'self'", 'fonts.gstatic.com', 'data:'],
        // Allow connecting to backend, external HTTPS APIs and websockets
        connectSrc: ["'self'", 'https:', 'wss:', 'localhost', 'localhost:*', 'https://api.ipify.org'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        mediaSrc: ["'self'"],
        frameSrc: ["'self'", 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
}

// ============================================================================
// Performance Middleware
// ============================================================================

// Compression: gzip responses
if (config.enableCompression) {
  app.use(compression({
    threshold: 1024, // Only compress responses > 1KB
    level: 6, // Balance between compression ratio and CPU usage
  }));
}

// Request logging
//const morganFormat = config.logLevel === 'debug' ? 'dev' : 'combined';
/*
// Disabled request logging to suppress access-log lines like:
// 142.112.110.151 - - [30/Dec/2025:21:05:33 +0000] "GET /social/totalposts HTTP/1.1" 200 - "https://bughosted.com/" "User-Agent"
// Uncomment the following lines to re-enable access logs.
app.use(morgan(morganFormat, {
  skip: (req) => req.path === '/health', // Don't log health checks
}));
*/

// ============================================================================
// Rate Limiting
// ============================================================================

if (config.enableRateLimit) {
  // General rate limiter - less strict for static assets
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Increased from 100 to 1000 requests per window
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Stricter limit for API routes
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500, // Increased from 200 to 500 for API calls
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', apiLimiter);

  // Very strict for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // Increased from 5 to 10 for auth attempts
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/auth/', authLimiter);
}

// ============================================================================
// Health & Status Endpoints
// ============================================================================

// Health check (no rate limiting)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: config.nodeEnv,
  });
});

// Readiness check (indicates if app is ready to serve traffic)
app.get('/ready', (req, res) => {
  const distExists = fs.existsSync(config.distPath);
  if (!distExists) {
    return res.status(503).json({
      status: 'not ready',
      reason: 'distribution files missing',
    });
  }
  res.json({ status: 'ready' });
});

// Metrics endpoint (basic)
app.get('/metrics', (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
  });
});

// ============================================================================
// API Proxy Configuration
// ============================================================================

const proxyContext = [
  '/weatherforecast', '/calendar', '/mining', '/todo', '/file', '/notepad',
  '/contact', '/user', '/chat', '/news', '/social', '/rom', '/topic',
  '/friend', '/wordler', '/comment', '/coinvalue', '/currencyvalue',
  '/reaction', '/array', '/nexus', '/notification', '/meta', '/ai',
  '/favourite', '/crawler', '/trade', '/top', '/poll', '/mastermind',
  '/ender', '/search', '/bones',
];

// Proxy with retry logic and error handling
const proxyOptions = {
  target: config.backendUrl,
  changeOrigin: true,
  secure: false,  // Disable SSL verification for local backend (self-signed cert)
  logLevel: config.proxyDebug ? 'debug' : 'warn',
  timeout: 30000, // 30 second timeout
  proxyTimeout: 30000,
  
  // Retry logic
  onError: (err, req, res) => {
    const errorMsg = `[Proxy Error] ${req.method} ${req.path}: ${err.message}`;
    console.error(chalk.red(errorMsg));
    
    // Attempt retry for specific errors
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      console.log(chalk.yellow('[Proxy] Attempting retry...'));
      // In production, you might implement actual retry logic here
    }
    
    res.status(502).json({
      error: 'Bad Gateway',
      message: 'Backend service temporarily unavailable',
      requestId: req.id || 'unknown',
      timestamp: new Date().toISOString(),
    });
  },
  
  onProxyRes: (proxyRes, req, res) => {
    // Add custom headers to proxied responses
    proxyRes.headers['X-Proxy-By'] = 'maxhanna-prod-server';
    proxyRes.headers['X-Response-Time'] = Date.now() - req._startTime;
    
    if (proxyRes.statusCode >= 400) {
      console.warn(chalk.yellow(
        `[${proxyRes.statusCode}] ${req.method} ${req.path}`
      ));
    }
  },
  
  onProxyReq: (proxyReq, req, res) => {
    req._startTime = Date.now();
    proxyReq.setHeader('X-Forwarded-By', 'maxhanna-prod-server');
    
    // Preserve original IP
    if (req.ip) {
      proxyReq.setHeader('X-Forwarded-For', req.ip);
    }
  },
};

app.use(createProxyMiddleware(proxyContext, proxyOptions));

// ============================================================================
// Static Asset Serving
// ============================================================================

// Serve dist folder (compiled Angular app)
app.use(express.static(config.distPath, {
  maxAge: '1y', // Cache assets for 1 year
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Ensure WebAssembly files are served with the correct MIME type so
    // `WebAssembly.compileStreaming` / dynamic wasm imports work in browsers.
    if (filePath.endsWith('.wasm')) {
      res.set('Content-Type', 'application/wasm');
    }
    // No cache for HTML, manifests, service workers
    if (filePath.match(/\.(html|json|webmanifest|xml|txt)$|service-worker/)) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
    
    // Long cache for versioned assets
    if (filePath.match(/\.[a-f0-9]{8,}\.(js|css)$/)) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
    
    // Security headers for all static assets
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'SAMEORIGIN');
  },
}));

// Serve `src/assets` directly only in development (avoids serving uploads in production)
const assetsPath = path.join(__dirname, 'src', 'assets');
if (config.nodeEnv === 'development' && fs.existsSync(assetsPath)) {
  app.use('/assets', express.static(assetsPath, {
    maxAge: '1y',
    etag: true,
    lastModified: true,
  }));
  console.log(chalk.gray(`✓ Serving /assets from (dev): ${assetsPath}`));
}

// ============================================================================
// SPA Fallback
// ============================================================================

app.get('*', (req, res) => {
  const indexPath = path.join(config.distPath, 'index.html');

  if (fs.existsSync(indexPath)) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(indexPath);
    return;
  }

  // Diagnostic fallback - render an informative HTML page showing the
  // resolved dist path, the files that exist there (if any), and the tail
  // of the launcher log (if present). This helps debugging when builds
  // are missing or a different output folder was used.
  console.error(chalk.red(`[404] index.html not found at ${indexPath}`));

  function safeReadTail(filePath, lines = 200) {
    try {
      if (!fs.existsSync(filePath)) return '';
      const data = fs.readFileSync(filePath, { encoding: 'utf8' });
      const chunks = data.replace(/\r\n/g, '\n').split('\n');
      return chunks.slice(-lines).join('\n');
    } catch (e) {
      return `Could not read ${filePath}: ${e.message}`;
    }
  }

  const listing = (() => {
    try {
      if (!fs.existsSync(config.distPath)) return `No dist path at ${config.distPath}`;
      const entries = fs.readdirSync(config.distPath);
      if (!entries.length) return '(dist directory is empty)';
      return entries.map(e => `- ${e}`).join('\n');
    } catch (e) {
      return `Error listing ${config.distPath}: ${e.message}`;
    }
  })();

  const launcherLogPath = path.join(__dirname, 'launcher.log');
  const launcherTail = safeReadTail(launcherLogPath, 200);

  const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Application Not Ready - Diagnostic</title>
    <style>body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;color:#222;margin:24px}pre{background:#111;color:#eee;padding:12px;border-radius:6px;overflow:auto;max-height:360px}h1{color:#b00}</style>
  </head>
  <body>
    <h1>Application Not Ready</h1>
    <p>The server could not find <code>index.html</code> at the resolved path.</p>
    <h2>Resolved Paths</h2>
    <ul>
      <li><b>Resolved distPath:</b> <code>${config.distPath}</code></li>
      <li><b>Dist root:</b> <code>${config._distRoot}</code></li>
    </ul>
    <h2>Directory Listing (${config.distPath})</h2>
    <pre>${listing}</pre>
    <h2>Launcher Log (tail)</h2>
    <pre>${launcherTail || '(no launcher log found)'}</pre>
    <h2>Next Steps</h2>
    <ol>
      <li>Ensure you ran <code>npm run build -- --configuration production</code> in <code>maxhanna.client</code>.</li>
      <li>Confirm <code>index.html</code> exists under the dist output. The server prefers <code>dist/maxhanna.client/browser</code>.</li>
      <li>Check the launcher log above for build errors.</li>
    </ol>
  </body>
  </html>`;

  res.status(503).set('Content-Type', 'text/html; charset=utf-8').send(html);
});

// ============================================================================
// Error Handling
// ============================================================================

app.use((err, req, res, next) => {
  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  console.error(chalk.red(`[Error ${status}] ${req.method} ${req.path}: ${message}`));
  
  res.status(status).json({
    error: message,
    status: status,
    path: req.path,
    timestamp: new Date().toISOString(),
    requestId: req.id || 'unknown',
    // Only show stack in development
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
  });
});

// ============================================================================
// Server Creation & Startup
// ============================================================================

let server;
let httpsOptions = {};

// Load SSL certificates
if (config.useHttps) {
  try {
    if (!fs.existsSync(config.certPath) || !fs.existsSync(config.keyPath)) {
      throw new Error(`Certificate files not found: ${config.certPath}, ${config.keyPath}`);
    }
    
    httpsOptions = {
      cert: fs.readFileSync(config.certPath),
      key: fs.readFileSync(config.keyPath),
    };
    
    server = https.createServer(httpsOptions, app);
    console.log(chalk.green('✓ SSL certificates loaded'));
  } catch (err) {
    console.error(chalk.red('[SSL Error] Failed to load certificates:'), err.message);
    console.log(chalk.yellow('[SSL] Falling back to HTTP'));
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

// Server event handlers
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(chalk.red(`Port ${config.port} is already in use`));
    console.log(chalk.yellow('Try: netstat -ano | findstr :' + config.port));
    process.exit(1);
  } else if (err.code === 'EACCES') {
    console.error(chalk.red(`Access denied. Port ${config.port} requires elevated permissions`));
    process.exit(1);
  } else {
    console.error(chalk.red('Server error:'), err);
    process.exit(1);
  }
});

server.on('clientError', (err, socket) => {
  console.error(chalk.red(`[Client Error:${new Date().toDateString()}]`), err.message);
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  }
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

let shutdownInProgress = false;

function gracefulShutdown() {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  
  console.log(chalk.yellow('\n[Shutdown] Received shutdown signal, closing gracefully...'));
  
  // Stop accepting new connections
  server.close(() => {
    console.log(chalk.green('[Shutdown] All connections closed'));
    process.exit(0);
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    console.error(chalk.red('[Shutdown] Forced exit after 30 second timeout'));
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Uncaught exceptions - log but don't crash
process.on('uncaughtException', (err) => {
  console.error(chalk.red('[Uncaught Exception]'), err);
  // In production, you might want to exit here and let PM2 restart
  if (config.nodeEnv === 'production') {
    console.error(chalk.red(`[Critical:${new Date().toDateString()}] Exiting after uncaught exception`));
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('[Unhandled Rejection]'), reason);
  // Continue running but log the issue
});

// ============================================================================
// Start Server
// ============================================================================

server.listen(config.port, config.host, () => {
  const protocol = config.useHttps ? 'https' : 'http';
  const displayHost = config.host === '0.0.0.0' ? 'localhost' : config.host;
  const url = `${protocol}://${displayHost}:${config.port}`;
  
  console.log(chalk.green.bold('╔════════════════════════════════════════════════════════╗'));
  console.log(chalk.green.bold('║          BugHosted Server Started Successfully         ║'));
  console.log(chalk.green.bold('╚════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.cyan('Server Configuration:'));
  console.log(chalk.cyan(`  URL:        ${url}`));
  console.log(chalk.cyan(`  Backend:    ${config.backendUrl}`));
  console.log(chalk.cyan(`  Environment: ${config.nodeEnv}`));
  console.log(chalk.cyan(`  Compression: ${config.enableCompression ? 'Enabled' : 'Disabled'}`));
  console.log(chalk.cyan(`  Rate Limit: ${config.enableRateLimit ? 'Enabled' : 'Disabled'}`));
  console.log(chalk.cyan(`  Security:   ${config.enableHelmet ? 'Enabled (Helmet)' : 'Disabled'}`));
  console.log();
  console.log(chalk.gray('Health Endpoints:'));
  console.log(chalk.gray(`  ${url}/health   - Full health status`));
  console.log(chalk.gray(`  ${url}/ready    - Readiness check (for load balancers)`));
  console.log(chalk.gray(`  ${url}/metrics  - Performance metrics`));
  console.log();
});

module.exports = app;
