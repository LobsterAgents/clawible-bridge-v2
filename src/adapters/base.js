/**
 * Base Adapter Interface
 * 
 * All adapters must implement:
 * - execute(context, options) -> result
 * - description (string)
 * - capabilities (array of strings)
 * 
 * Optional:
 * - isAvailable() -> boolean
 * - cancel(taskId) -> void
 */

export class BaseAdapter {
  constructor() {
    this.description = 'Base adapter - not implemented';
    this.capabilities = [];
  }
  
  /**
   * Check if this adapter is available (e.g., dependencies installed)
   */
  isAvailable() {
    return false;
  }
  
  /**
   * Execute a task with isolated context
   * 
   * @param {Object} context - Clean, isolated context
   * @param {string} context.task - The task to execute
   * @param {string} context.projectPath - Path to project directory
   * @param {string} context.systemPrompt - System instructions
   * @param {Object} context.files - Relevant files {path: content}
   * @param {Function} context.onStatus - Callback for status updates
   * @param {Function} context.onProgress - Callback for progress updates
   * 
   * @param {Object} options - Adapter-specific options
   * 
   * @returns {Promise<string>} - The result/response
   */
  async execute(context, options = {}) {
    throw new Error('execute() must be implemented by adapter');
  }
  
  /**
   * Cancel a running task (if supported)
   */
  async cancel(taskId) {
    // Override in adapters that support cancellation
  }
}
