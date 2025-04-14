// redirect-server.js
const http = require('http');

const server = http.createServer((req, res) => {
  const host = req.headers['host'] || 'localhost';
  const redirectUrl = `https://${host}${req.url}`;
  res.writeHead(301, { Location: redirectUrl });
  res.end();
});

const PORT = 80;
server.listen(PORT, () => {
  console.log(`🔁 HTTP Redirect Server running on port ${PORT}`);
});
