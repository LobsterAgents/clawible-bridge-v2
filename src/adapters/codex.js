/**
 * Codex Adapter
 * 
 * Executes tasks using OpenAI Codex CLI.
 * Clean isolation - direct CLI invocation.
 */

import { spawn } from 'child_process';
import { BaseAdapter } from './base.js';

export class CodexAdapter extends BaseAdapter {
  constructor() {
    super();
    this.description = 'OpenAI Codex - coding agent';
    this.capabilities = ['coding', 'file-access', 'shell'];
    this.runningProcesses = new Map();
  }
  
  isAvailable() {
    // TODO: Check if codex CLI is installed
    return true;
  }
  
  async execute(context, options = {}) {
    const { task, projectPath, systemPrompt, onStatus } = context;
    const { model, timeout = 300 } = options;
    
    return new Promise((resolve, reject) => {
      onStatus?.('Starting Codex...');
      
      const taskId = `codex-${Date.now()}`;
      
      // Build the prompt
      let prompt = '';
      if (systemPrompt) {
        prompt += `${systemPrompt}\n\n`;
      }
      prompt += task;
      
      // Codex CLI args
      // --quiet: Minimal output
      // --full-auto: Non-interactive mode
      const args = [
        '--quiet',
        '--full-auto',
        prompt,
      ];
      
      // Add model if specified
      if (model) {
        args.unshift('--model', model);
      }
      
      onStatus?.('Running Codex...');
      
      const proc = spawn('codex', args, {
        cwd: projectPath || process.cwd(),
        env: process.env,
      });
      
      this.runningProcesses.set(taskId, proc);
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code) => {
        this.runningProcesses.delete(taskId);
        
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr || `Codex exited with code ${code}`));
        }
      });
      
      proc.on('error', (err) => {
        this.runningProcesses.delete(taskId);
        reject(new Error(`Failed to spawn Codex: ${err.message}`));
      });
      
      // Timeout
      const timeoutId = setTimeout(() => {
        if (this.runningProcesses.has(taskId)) {
          proc.kill('SIGTERM');
          reject(new Error(`Timeout after ${timeout}s`));
        }
      }, timeout * 1000);
      
      proc.on('close', () => clearTimeout(timeoutId));
    });
  }
  
  async cancel(taskId) {
    const proc = this.runningProcesses.get(taskId);
    if (proc) {
      proc.kill('SIGTERM');
      this.runningProcesses.delete(taskId);
    }
  }
}
