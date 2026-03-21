/**
 * Claude Code Adapter
 * 
 * Executes tasks using Claude Code CLI (Anthropic's coding agent).
 * Clean isolation - no OpenClaw dependencies.
 */

import { spawn } from 'child_process';
import { BaseAdapter } from './base.js';

export class ClaudeCodeAdapter extends BaseAdapter {
  constructor() {
    super();
    this.description = 'Claude Code - Anthropic\'s coding agent';
    this.capabilities = ['coding', 'file-access', 'shell'];
    this.runningProcesses = new Map();
  }
  
  isAvailable() {
    // TODO: Check if claude CLI is installed
    return true;
  }
  
  async execute(context, options = {}) {
    const { task, projectPath, systemPrompt, onStatus } = context;
    const { model, timeout = 300 } = options;
    
    return new Promise((resolve, reject) => {
      onStatus?.('Starting Claude Code...');
      
      const taskId = `claude-${Date.now()}`;
      
      // Build the prompt
      let prompt = '';
      if (systemPrompt) {
        prompt += `${systemPrompt}\n\n`;
      }
      prompt += task;
      
      // Claude Code CLI args
      // --print: Output result to stdout (non-interactive)
      // --permission-mode bypassPermissions: Don't ask for confirmations
      const args = [
        '--print',
        '--permission-mode', 'bypassPermissions',
        prompt,
      ];
      
      // Add model if specified
      if (model) {
        args.unshift('--model', model);
      }
      
      onStatus?.('Running Claude Code...');
      
      const proc = spawn('claude', args, {
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
          reject(new Error(stderr || `Claude Code exited with code ${code}`));
        }
      });
      
      proc.on('error', (err) => {
        this.runningProcesses.delete(taskId);
        reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
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
