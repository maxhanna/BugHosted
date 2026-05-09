const os = require('os');
const { env } = require('process');

// Detect local IP address for network access (used by dev server when accessed from other computers)
function getLocalIP() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Skip internal (loopback) addresses
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch (e) {
    // If networkInterfaces fails, fall back to localhost
  }
  return 'localhost';
}

const localIP = getLocalIP();

// Get port from environment or use default
const port = env.ASPNETCORE_HTTPS_PORT || 
             (env.ASPNETCORE_URLS ? env.ASPNETCORE_URLS.split(';')[0].split(':').pop() : '7299');

// For local dev use localhost, for network access use detected IP
// Use BACKEND_URL env var if set explicitly, otherwise default to localhost for local dev
const target = env.BACKEND_URL || `https://localhost:${port}`;

const PROXY_CONFIG = [
  {
    context: [
      "/weatherforecast",
      "/calendar",
      "/mining",
      "/todo",
      "/file",
      "/notepad",
      "/contact",
      "/user",
      "/chat",
      "/news",
      "/social",
      "/rom",
      "/topic",
      "/friend",
      "/wordler",
      "/comment",
      "/coinvalue",
      "/currencyvalue",
      "/reaction",
      "/array",
      "/nexus",
      "/notification",
      "/meta",
      "/ai",
      "/favourite",
      "/crawler",
      "/trade",
      "/top",
      "/poll",
      "/mastermind",
      "/ender",
      "/search",
      "/bones",
      "/ratings",
      "/digcraft",
      "/tilecache"
    ],
    target,
    changeOrigin: true, // This helps with certain CORS issues and forwards headers correctly 
    secure: false,
    logLevel: 'debug'
  }
]

module.exports = PROXY_CONFIG;
