#!/usr/bin/env node
/**
 * Local dev server — serves index.html with secrets injected from .env
 * Usage: node dev.js [port]   (default port: 3000)
 */
const http = require('http');
const fs   = require('fs');

// Parse .env (key=value, ignores comments and blank lines)
try {
  fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 1) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, ''); // strip optional quotes
    process.env[key] = val;
  });
} catch (_) { /* .env is optional */ }

const port = Number(process.argv[2]) || 3000;

const html = fs.readFileSync('index.html', 'utf8')
  .replace(/__SPOTIFY_CLIENT_ID__/g, process.env.SPOTIFY_CLIENT_ID || '');

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(port, () => {
  console.log(`Dev server running at http://localhost:${port}`);
});
