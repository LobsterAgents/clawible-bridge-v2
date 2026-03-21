/**
 * TaskManager - Orchestrates task execution across adapters
 * 
 * Responsibilities:
 * - Task lifecycle (create, track, complete, cancel)
 * - Adapter selection and invocation
 * - State isolation (each task is independent)
 * - Status updates and streaming
 */

import { v4 as uuid } from 'uuid';
import { OpenClawAdapter } from './adapters/openclaw.js';
import { ClaudeCodeAdapter } from './adapters/claude-code.js';
import { CodexAdapter } from './adapters/codex.js';
import { OllamaAdapter } from './adapters/ollama.js';
import { RawAPIAdapter } from './adapters/raw-api.js';
import { GeminiAdapter } from './adapters/gemini.js';

export class TaskManager {
  constructor() {
    // Task storage - in production, use Redis or SQLite
    this.tasks = new Map();
    
    // Initialize adapters
    this.adapters = new Map([
      ['openclaw', new OpenClawAdapter()],
      ['claude-code', new ClaudeCodeAdapter()],
      ['codex', new CodexAdapter()],
      ['ollama', new OllamaAdapter()],
      ['raw-api', new RawAPIAdapter()],
      ['gemini', new GeminiAdapter()],
    ]);
    
    // Clean up old tasks periodically (keep last hour)
    setInterval(() => this.cleanup(), 60 * 1000);
  }
  
  listAdapters() {
    return Array.from(this.adapters.keys());
  }
  
  getAdapter(name) {
    return this.adapters.get(name);
  }
  
  /**
   * Create a new task
   * 
   * @param {Object} params
   * @param {string} params.adapter - Which adapter to use (openclaw, claude-code, etc.)
   * @param {string} params.task - The task description/prompt
   * @param {Object} params.context - Isolated context for this task
   * @param {string} params.context.projectPath - Path to project directory
   * @param {string} params.context.systemPrompt - System instructions
   * @param {Object} params.context.files - Relevant files {path: content}
   * @param {Object} params.options - Adapter-specific options
   * @param {string} params.options.model - Model to use
   * @param {string} params.options.agentId - OpenClaw agent ID
   * @param {number} params.options.timeout - Timeout in seconds
   */
  async createTask({ adapter, task, context = {}, options = {} }) {
    const id = `task_${uuid()}`;
    
    const adapterInstance = this.adapters.get(adapter);
    if (!adapterInstance) {
      throw new Error(`Unknown adapter: ${adapter}. Available: ${this.listAdapters().join(', ')}`);
    }
    
    const taskRecord = {
      id,
      adapter,
      task,
      context,
      options,
      status: 'pending',
      statusMessage: 'Task created',
      statusHistory: [
        { timestamp: new Date().toISOString(), message: 'Task created' }
      ],
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };
    
    this.tasks.set(id, taskRecord);
    
    // Execute task asynchronously
    this.executeTask(id, adapterInstance).catch(err => {
      console.error(`Task ${id} failed:`, err.message);
    });
    
    return taskRecord;
  }
  
  async executeTask(id, adapter) {
    const task = this.tasks.get(id);
    if (!task) return;
    
    this.updateStatus(id, 'running', 'Executing task...');
    task.startedAt = new Date().toISOString();
    
    try {
      // Build clean, isolated context for the adapter
      const isolatedContext = {
        task: task.task,
        projectPath: task.context.projectPath,
        systemPrompt: task.context.systemPrompt,
        files: task.context.files || {},
        
        // Callbacks for status updates
        onStatus: (message) => this.updateStatus(id, 'running', message),
        onProgress: (percent, message) => this.updateStatus(id, 'running', `${percent}% - ${message}`),
      };
      
      const result = await adapter.execute(isolatedContext, task.options);
      
      task.result = result;
      task.status = 'completed';
      task.statusMessage = 'Task completed successfully';
      task.completedAt = new Date().toISOString();
      task.statusHistory.push({
        timestamp: task.completedAt,
        message: 'Task completed successfully'
      });
      
    } catch (err) {
      task.error = err.message;
      task.status = 'failed';
      task.statusMessage = `Failed: ${err.message}`;
      task.completedAt = new Date().toISOString();
      task.statusHistory.push({
        timestamp: task.completedAt,
        message: `Failed: ${err.message}`
      });
    }
  }
  
  updateStatus(id, status, message) {
    const task = this.tasks.get(id);
    if (!task) return;
    
    task.status = status;
    task.statusMessage = message;
    task.statusHistory.push({
      timestamp: new Date().toISOString(),
      message
    });
    
    console.log(`[${id}] ${message}`);
  }
  
  getTask(id) {
    return this.tasks.get(id);
  }
  
  listTasks({ status, adapter, limit = 50 } = {}) {
    let tasks = Array.from(this.tasks.values());
    
    if (status) {
      tasks = tasks.filter(t => t.status === status);
    }
    if (adapter) {
      tasks = tasks.filter(t => t.adapter === adapter);
    }
    
    // Sort by creation time, newest first
    tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return tasks.slice(0, limit);
  }
  
  async cancelTask(id) {
    const task = this.tasks.get(id);
    if (!task) return null;
    
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return task; // Already done
    }
    
    // TODO: Actually cancel the running process
    task.status = 'cancelled';
    task.statusMessage = 'Task cancelled by user';
    task.completedAt = new Date().toISOString();
    task.statusHistory.push({
      timestamp: task.completedAt,
      message: 'Task cancelled by user'
    });
    
    return task;
  }
  
  cleanup() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const [id, task] of this.tasks) {
      if (task.completedAt && new Date(task.completedAt).getTime() < oneHourAgo) {
        this.tasks.delete(id);
      }
    }
  }
}
