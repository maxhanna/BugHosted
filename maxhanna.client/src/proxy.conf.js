const { env } = require('process');

const target = env.ASPNETCORE_HTTPS_PORT ? `https://localhost:${env.ASPNETCORE_HTTPS_PORT}` :
    env.ASPNETCORE_URLS ? env.ASPNETCORE_URLS.split(';')[0] : 'https://localhost:7299';

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
      "/reaction",
      "/array",
      "/nexus",
      "/notification",
      "/meta",
    ],
    target,
    secure: false
  }
]

module.exports = PROXY_CONFIG;
