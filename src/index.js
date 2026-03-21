/**
 * Clawible Bridge v2 - BYOA Architecture
 * 
 * Clean separation between:
 * - HTTP layer (Express routes)
 * - Task orchestration (TaskManager)
 * - Agent adapters (pluggable backends)
 * 
 * Each task gets isolated context - no bleeding between requests.
 */

import express from 'express';
import cors from 'cors';
import { TaskManager } from './task-manager.js';
import { createRoutes } from './routes.js';

const PORT = process.env.BRIDGE_PORT || 3032; // Different port to not conflict with v1

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize task manager with available adapters
const taskManager = new TaskManager();

// Mount routes
app.use('/', createRoutes(taskManager));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦞 Clawible Bridge v2 running on http://localhost:${PORT}`);
  console.log(`   Architecture: BYOA (Bring Your Own Agent)`);
  console.log(`   Available adapters: ${taskManager.listAdapters().join(', ')}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  POST   /tasks              - Create a new task');
  console.log('  GET    /tasks/:id          - Get task status/result');
  console.log('  PATCH  /tasks/:id          - Update task (status, cancel)');
  console.log('  GET    /tasks              - List all tasks');
  console.log('  GET    /adapters           - List available adapters');
  console.log('  GET    /health             - Health check');
});
