#!/usr/bin/env node
/**
 * Development-only CSV logger server for navigation/dev experiments.
 * 
 * This server runs on your laptop and receives response data from the React Native app
 * running in Expo Go, then writes it to CSV files for analysis.
 * 
 * Usage:
 *   npm run dev-logger
 * 
 * The server listens on http://localhost:3001 and writes CSV files to:
 *   ../test_results/dead_reckoning/
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3001;
const LOGS_DIR = path.join(__dirname, '..', 'test_results', 'dead_reckoning');

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
const runFiles = new Map();

function escapeCsv(field) {
  const str = String(field ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** YYYYMMDD-HHmmss-mmm — short and unique enough for run filenames */
function compactTimestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${ms}`
  );
}

/** Safe single path segment for test id (folder already scopes runs) */
function sanitizeRunIdPart(raw) {
  const s = String(raw ?? '').trim() || 'run';
  return s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'run';
}

function getRunFile(runId, metadata) {
  if (runFiles.has(runId)) {
    return runFiles.get(runId);
  }

  const idPart = sanitizeRunIdPart(metadata.test_id);
  const filename = `${idPart}-${compactTimestamp()}.csv`;
  const filepath = path.join(LOGS_DIR, filename);

  const header = [
    'timestamp_ms',
    'test_id',
    'tester',
    'device_model',
    'start_label',
    'end_label',
    'start_node_id',
    'end_node_id',
    'ground_truth_distance_m',
    'heading_raw_deg',
    'heading_avg_deg',
    'pedometer_steps',
    'step_delta',
    'estimated_distance_m'
  ].join(',');

  fs.writeFileSync(filepath, header + '\n');
  runFiles.set(runId, { filepath, metadata });
  console.log(`🧭 Created run file: ${filepath}`);
  return runFiles.get(runId);
}

function writeRunSample(runId, sample) {
  const run = runFiles.get(runId);
  if (!run) {
    throw new Error(`Run ${runId} not initialized. Call /run/start first.`);
  }

  const m = run.metadata;
  const row = [
    sample.timestamp_ms,
    m.test_id,
    m.tester,
    m.device_model,
    m.start_label,
    m.end_label,
    m.start_node_id,
    m.end_node_id,
    m.ground_truth_distance_m,
    sample.heading_raw_deg,
    sample.heading_avg_deg,
    sample.pedometer_steps,
    sample.step_delta,
    sample.estimated_distance_m
  ].map(escapeCsv).join(',');

  fs.appendFileSync(run.filepath, row + '\n');
}

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
  ].map(escapeCsv).join(',');

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

  if (req.method === 'POST' && req.url === '/run/start') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const runId = data.run_id;
        if (!runId) throw new Error('run_id is required');
        getRunFile(runId, {
          test_id: data.test_id || '',
          tester: data.tester || '',
          device_model: data.device_model || '',
          start_label: data.start_label || '',
          end_label: data.end_label || '',
          start_node_id: data.start_node_id || '',
          end_node_id: data.end_node_id || '',
          ground_truth_distance_m: data.ground_truth_distance_m ?? '',
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        console.error('Error processing /run/start:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/run/sample') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.run_id) throw new Error('run_id is required');
        if (!data.sample) throw new Error('sample is required');
        writeRunSample(data.run_id, data.sample);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        console.error('Error processing /run/sample:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/run/end') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const run = runFiles.get(data.run_id);
        if (!run) throw new Error('unknown run_id');
        console.log(
          `🏁 Completed run ${data.run_id}: samples=${data.sample_count ?? 'n/a'}, estimated_distance_m=${data.estimated_distance_m ?? 'n/a'}`
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, filepath: run.filepath }));
      } catch (error) {
        console.error('Error processing /run/end:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
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
  console.log(`🧪 Dead-reckoning endpoints: /run/start, /run/sample, /run/end`);
  console.log(`\n💡 If using Expo Go on a physical device:`);
  console.log(`   Add to your .env file: EXPO_PUBLIC_DEAD_RECKONING_LOGGER_URL=http://${localIP}:${PORT}`);
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

