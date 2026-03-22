/**
 * WebSocket Server for real-time task updates
 * 
 * Clients connect and subscribe to task updates.
 * When a task status changes, all subscribed clients get notified.
 */

import { WebSocketServer } from 'ws';

export class TaskWebSocket {
  constructor(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.clients = new Map(); // ws -> Set of taskIds they're subscribed to
    this.taskSubscribers = new Map(); // taskId -> Set of ws clients
    
    this.wss.on('connection', (ws) => {
      console.log('[WS] Client connected');
      this.clients.set(ws, new Set());
      
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(ws, msg);
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }
      });
      
      ws.on('close', () => {
        console.log('[WS] Client disconnected');
        // Clean up subscriptions
        const subscriptions = this.clients.get(ws) || new Set();
        for (const taskId of subscriptions) {
          const subs = this.taskSubscribers.get(taskId);
          if (subs) {
            subs.delete(ws);
            if (subs.size === 0) {
              this.taskSubscribers.delete(taskId);
            }
          }
        }
        this.clients.delete(ws);
      });
      
      ws.on('error', (err) => {
        console.error('[WS] Error:', err.message);
      });
      
      // Send welcome message
      ws.send(JSON.stringify({ type: 'connected', message: 'Connected to Clawible Bridge v2' }));
    });
    
    console.log('[WS] WebSocket server initialized on /ws');
  }
  
  handleMessage(ws, msg) {
    switch (msg.type) {
      case 'subscribe':
        this.subscribe(ws, msg.taskId);
        break;
      case 'unsubscribe':
        this.unsubscribe(ws, msg.taskId);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
    }
  }
  
  subscribe(ws, taskId) {
    if (!taskId) return;
    
    // Add to client's subscriptions
    const clientSubs = this.clients.get(ws);
    if (clientSubs) {
      clientSubs.add(taskId);
    }
    
    // Add to task's subscribers
    if (!this.taskSubscribers.has(taskId)) {
      this.taskSubscribers.set(taskId, new Set());
    }
    this.taskSubscribers.get(taskId).add(ws);
    
    ws.send(JSON.stringify({ type: 'subscribed', taskId }));
    console.log(`[WS] Client subscribed to task ${taskId}`);
  }
  
  unsubscribe(ws, taskId) {
    if (!taskId) return;
    
    const clientSubs = this.clients.get(ws);
    if (clientSubs) {
      clientSubs.delete(taskId);
    }
    
    const taskSubs = this.taskSubscribers.get(taskId);
    if (taskSubs) {
      taskSubs.delete(ws);
      if (taskSubs.size === 0) {
        this.taskSubscribers.delete(taskId);
      }
    }
    
    ws.send(JSON.stringify({ type: 'unsubscribed', taskId }));
  }
  
  /**
   * Broadcast a task update to all subscribed clients
   */
  broadcastTaskUpdate(taskId, update) {
    const subscribers = this.taskSubscribers.get(taskId);
    if (!subscribers || subscribers.size === 0) return;
    
    const message = JSON.stringify({
      type: 'taskUpdate',
      taskId,
      ...update,
    });
    
    for (const ws of subscribers) {
      if (ws.readyState === 1) { // OPEN
        ws.send(message);
      }
    }
  }
  
  /**
   * Broadcast task completion
   */
  broadcastTaskComplete(taskId, result) {
    this.broadcastTaskUpdate(taskId, {
      status: 'completed',
      result,
      completedAt: new Date().toISOString(),
    });
  }
  
  /**
   * Broadcast task failure
   */
  broadcastTaskFailed(taskId, error) {
    this.broadcastTaskUpdate(taskId, {
      status: 'failed',
      error,
      completedAt: new Date().toISOString(),
    });
  }
  
  /**
   * Broadcast status message update
   */
  broadcastStatusUpdate(taskId, statusMessage) {
    this.broadcastTaskUpdate(taskId, {
      status: 'running',
      statusMessage,
    });
  }
}
