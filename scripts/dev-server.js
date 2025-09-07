#!/usr/bin/env node

/**
 * Development server for Chrome extension hot reload
 * Watches for file changes and notifies the extension to reload
 */

import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const RELOAD_PORT = 9090;
const WATCH_PATHS = [
  'src/**/*.js',
  'src/**/*.css',
  'src/**/*.html',
  'public/**/*',
  'manifest.json',
];

// File types that trigger different reload strategies
const RELOAD_STRATEGIES = {
  '.css': 'update-css',
  '.js': 'reload-extension',
  '.html': 'reload-extension',
  '.json': 'reload-extension',
};

let wss = null;
let clients = new Set();

/**
 * Start the WebSocket server for hot reload
 */
function startWebSocketServer() {
  wss = new WebSocketServer({ port: RELOAD_PORT });

  wss.on('connection', (ws) => {
    console.log('✅ Hot reload client connected');
    clients.add(ws);

    ws.on('close', () => {
      console.log('🔌 Hot reload client disconnected');
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      clients.delete(ws);
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
  });

  console.log(`🚀 Hot reload server running on ws://localhost:${RELOAD_PORT}`);
}

/**
 * Broadcast reload message to all connected clients
 * @param {string} type - Type of reload
 * @param {Object} data - Additional data
 */
function broadcastReload(type, data = {}) {
  const message = JSON.stringify({
    type,
    timestamp: Date.now(),
    ...data,
  });

  clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });

  console.log(`📤 Broadcast: ${type} to ${clients.size} clients`);
}

/**
 * Get reload strategy based on file extension
 * @param {string} filePath - Path to the changed file
 * @returns {string} Reload strategy type
 */
function getReloadStrategy(filePath) {
  const ext = path.extname(filePath);
  return RELOAD_STRATEGIES[ext] || 'reload-extension';
}

/**
 * Start file watcher
 */
function startFileWatcher() {
  const watcher = chokidar.watch(WATCH_PATHS, {
    cwd: ROOT_DIR,
    ignored: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      '**/.*',
    ],
    persistent: true,
    ignoreInitial: true,
  });

  watcher
    .on('change', (filePath) => {
      console.log(`📝 File changed: ${filePath}`);
      const strategy = getReloadStrategy(filePath);
      broadcastReload(strategy, { file: filePath });
    })
    .on('add', (filePath) => {
      console.log(`➕ File added: ${filePath}`);
      broadcastReload('reload-extension', { file: filePath });
    })
    .on('unlink', (filePath) => {
      console.log(`➖ File removed: ${filePath}`);
      broadcastReload('reload-extension', { file: filePath });
    })
    .on('error', (error) => {
      console.error('❌ Watcher error:', error);
    });

  console.log('👀 Watching for file changes...');
  console.log('📂 Watched paths:', WATCH_PATHS);
}

/**
 * Graceful shutdown
 */
function shutdown() {
  console.log('\n👋 Shutting down hot reload server...');
  
  // Close all WebSocket connections
  clients.forEach((client) => {
    client.close();
  });
  
  if (wss) {
    wss.close(() => {
      console.log('✅ Server shut down successfully');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Main execution
console.log('🔥 SocviDL Hot Reload Server');
console.log('================================');
startWebSocketServer();
startFileWatcher();
console.log('================================');
console.log('Press Ctrl+C to stop\n');