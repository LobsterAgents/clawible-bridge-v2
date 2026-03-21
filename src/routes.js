/**
 * HTTP Routes for Clawible Bridge v2
 * 
 * Clean REST API - no channel awareness, no WhatsApp/Telegram knowledge.
 * The bridge just executes tasks and returns results.
 */

import { Router } from 'express';

export function createRoutes(taskManager) {
  const router = Router();
  
  // Health check
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      adapters: taskManager.listAdapters(),
      activeTasks: taskManager.listTasks({ status: 'running' }).length,
    });
  });
  
  // List available adapters
  router.get('/adapters', (req, res) => {
    const adapters = taskManager.listAdapters().map(name => {
      const adapter = taskManager.getAdapter(name);
      return {
        name,
        description: adapter.description || '',
        capabilities: adapter.capabilities || [],
        available: adapter.isAvailable ? adapter.isAvailable() : true,
      };
    });
    res.json({ adapters });
  });
  
  // Create a new task
  router.post('/tasks', async (req, res) => {
    try {
      const { adapter, task, context, options } = req.body;
      
      if (!adapter) {
        return res.status(400).json({ error: 'adapter is required' });
      }
      if (!task) {
        return res.status(400).json({ error: 'task is required' });
      }
      
      const taskRecord = await taskManager.createTask({
        adapter,
        task,
        context: context || {},
        options: options || {},
      });
      
      res.status(201).json(taskRecord);
      
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  
  // Get task status/result
  router.get('/tasks/:id', (req, res) => {
    const task = taskManager.getTask(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json(task);
  });
  
  // Update task (status updates, cancellation)
  router.patch('/tasks/:id', async (req, res) => {
    const { id } = req.params;
    const { action, statusMessage } = req.body;
    
    const task = taskManager.getTask(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (action === 'cancel') {
      const updated = await taskManager.cancelTask(id);
      return res.json(updated);
    }
    
    if (statusMessage) {
      taskManager.updateStatus(id, task.status, statusMessage);
    }
    
    res.json(taskManager.getTask(id));
  });
  
  // List tasks
  router.get('/tasks', (req, res) => {
    const { status, adapter, limit } = req.query;
    
    const tasks = taskManager.listTasks({
      status,
      adapter,
      limit: limit ? parseInt(limit) : 50,
    });
    
    res.json({ 
      count: tasks.length,
      tasks 
    });
  });
  
  // === Legacy compatibility endpoints ===
  // These map the old v1 API to the new structure
  
  // POST /send -> POST /tasks (with adapter inference)
  router.post('/send', async (req, res) => {
    try {
      const { sessionKey, message, model, timeoutSeconds } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: 'message required' });
      }
      
      // Infer adapter and extract task from sessionKey/message
      let adapter = 'openclaw'; // Default
      let agentId = 'main';
      
      if (sessionKey) {
        // Parse sessionKey like "agent:ruby-santos:main"
        const parts = sessionKey.split(':');
        if (parts[0] === 'agent' && parts[1]) {
          agentId = parts[1];
        }
      }
      
      // Build task request
      const taskRecord = await taskManager.createTask({
        adapter,
        task: message,
        context: {},
        options: {
          agentId,
          model,
          timeout: timeoutSeconds || 180,
        },
      });
      
      // Return v1-compatible response
      res.json({
        requestId: taskRecord.id,
        status: 'queued',
        statusMessage: taskRecord.statusMessage,
        message: 'Request queued. Poll /status/{requestId} for result.',
      });
      
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  
  // GET /status/:id -> GET /tasks/:id (v1 format)
  router.get('/status/:id', (req, res) => {
    const task = taskManager.getTask(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    // Map to v1 response format
    const v1Status = task.status === 'completed' ? 'completed' 
                   : task.status === 'failed' ? 'error'
                   : task.status;
    
    res.json({
      status: v1Status,
      statusMessage: task.statusMessage,
      statusUpdates: task.statusHistory,
      result: task.status === 'completed' ? { response: task.result } : undefined,
      request: task,
    });
  });
  
  // PATCH /status/:id (v1 status update)
  router.patch('/status/:id', (req, res) => {
    const { statusMessage } = req.body;
    const task = taskManager.getTask(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Request not found in queue' });
    }
    
    if (statusMessage) {
      taskManager.updateStatus(req.params.id, task.status, statusMessage);
    }
    
    res.json({ success: true, request: taskManager.getTask(req.params.id) });
  });
  
  // GET /pending (v1 compatibility)
  router.get('/pending', (req, res) => {
    const pending = taskManager.listTasks({ status: 'pending' });
    const running = taskManager.listTasks({ status: 'running' });
    const all = [...pending, ...running];
    
    res.json({
      count: all.length,
      requests: all,
    });
  });
  
  // POST /complete/:id (v1 manual completion)
  router.post('/complete/:id', (req, res) => {
    const { response, error } = req.body;
    const task = taskManager.getTask(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Request not found in queue' });
    }
    
    // Manually complete the task
    task.result = response;
    task.error = error;
    task.status = error ? 'failed' : 'completed';
    task.statusMessage = error ? `Failed: ${error}` : 'Completed';
    task.completedAt = new Date().toISOString();
    task.statusHistory.push({
      timestamp: task.completedAt,
      message: task.statusMessage,
    });
    
    res.json({ success: true });
  });
  
  return router;
}
