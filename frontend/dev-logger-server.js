#!/usr/bin/env node
/**
 * Development-only CSV logger server for WebSocket responses.
 * 
 * This server runs on your laptop and receives response data from the React Native app
 * running in Expo Go, then writes it to CSV files for analysis.
 * 
 * Usage:
 *   npm run dev-logger
 * 
 * The server listens on http://localhost:3001 and writes CSV files to ./dev-logs/
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3001;
const LOGS_DIR = path.join(__dirname, 'dev-logs');

/**
 * Get the local network IP address for network access from devices.
 * Returns the first non-internal IPv4 address found.
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Track active sessions
const sessionFiles = new Map();

/**
 * Get or create a CSV file for a session
 */
function getSessionFile(sessionId) {
  if (sessionFiles.has(sessionId)) {
    return sessionFiles.get(sessionId);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `responses-${sessionId || 'default'}-${timestamp}.csv`;
  const filepath = path.join(LOGS_DIR, filename);

  // Write CSV header
  const header = [
    'timestamp',
    'request_id',
    'latency_ms',
    'frame_size',
    'valid',
    'estimated_distances_count',
    'estimated_distances_json',
    'type',
    'error',
    'status',
    'full_response_json'
  ].join(',');

  fs.writeFileSync(filepath, header + '\n');
  console.log(`📝 Created log file: ${filepath}`);

  sessionFiles.set(sessionId, filepath);
  return filepath;
}

/**
 * Write a response to CSV
 */
function writeResponse(sessionId, response) {
  const filepath = getSessionFile(sessionId);
  const timestamp = new Date().toISOString();

  const row = [
    timestamp,
    response.request_id ?? '',
    response.latency_ms ?? '',
    response.frameSize ?? '',
    response.valid ?? '',
    response.estimatedDistances?.length ?? 0,
    JSON.stringify(response.estimatedDistances || []),
    response.type ?? '',
    response.error ?? '',
    response.status ?? '',
    JSON.stringify(response)
  ].map(field => {
    // Escape commas and quotes in CSV
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }).join(',');

  fs.appendFileSync(filepath, row + '\n');
  console.log(`✅ Logged response (ID: ${response.request_id}, Latency: ${response.latency_ms}ms)`);
}

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/log') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const sessionId = data.session_id || 'default';
        writeResponse(sessionId, data.response);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        console.error('Error processing log request:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`🚀 Dev logger server running on http://localhost:${PORT}`);
  console.log(`🌐 Also accessible at http://${localIP}:${PORT}`);
  console.log(`📁 Logs will be written to: ${LOGS_DIR}`);
  console.log(`\n💡 If using Expo Go on a physical device:`);
  console.log(`   Add to your .env file: EXPO_PUBLIC_DEV_LOGGER_URL=http://${localIP}:${PORT}/log`);
  console.log(`   Then restart Expo server for changes to take effect.\n`);
  console.log(`Press Ctrl+C to stop the server\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down dev logger server...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});

