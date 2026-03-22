/**
 * Clawible Bridge v2 - BYOA Architecture
 * 
 * Clean separation between:
 * - HTTP layer (Express routes)
 * - Task orchestration (TaskManager)
 * - Agent adapters (pluggable backends)
 * - WebSocket for real-time updates
 * 
 * Each task gets isolated context - no bleeding between requests.
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { TaskManager } from './task-manager.js';
import { createRoutes } from './routes.js';
import { TaskWebSocket } from './websocket.js';

const PORT = process.env.BRIDGE_PORT || 3032;

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Create HTTP server (needed for WebSocket upgrade)
const server = createServer(app);

// Initialize WebSocket server
const wsServer = new TaskWebSocket(server);

// Initialize task manager with WebSocket for real-time broadcasting
const taskManager = new TaskManager(wsServer);

// Mount routes
app.use('/', createRoutes(taskManager));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🦞 Clawible Bridge v2 running on http://localhost:${PORT}`);
  console.log(`   Architecture: BYOA (Bring Your Own Agent)`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   Available adapters: ${taskManager.listAdapters().join(', ')}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  POST   /tasks              - Create a new task');
  console.log('  GET    /tasks/:id          - Get task status/result');
  console.log('  PATCH  /tasks/:id          - Update task (status, cancel)');
  console.log('  GET    /tasks              - List all tasks');
  console.log('  GET    /adapters           - List available adapters');
  console.log('  GET    /health             - Health check');
  console.log('  WS     /ws                 - WebSocket for real-time updates');
});
