/**
 * OpenClaw Adapter
 * 
 * Executes tasks using OpenClaw agents (Bob, Ruby, Django, Kit, etc.)
 * Uses the openclaw CLI with proper isolation.
 */

import { spawn } from 'child_process';
import { BaseAdapter } from './base.js';

export class OpenClawAdapter extends BaseAdapter {
  constructor() {
    super();
    this.description = 'OpenClaw agents with personas, tools, and memory';
    this.capabilities = ['coding', 'planning', 'chat', 'tools', 'browser', 'file-access'];
    this.runningProcesses = new Map();
  }
  
  isAvailable() {
    // TODO: Check if openclaw CLI is installed
    return true;
  }
  
  async execute(context, options = {}) {
    const { task, projectPath, systemPrompt, onStatus } = context;
    const { agentId = 'main', model, timeout = 180 } = options;
    
    return new Promise((resolve, reject) => {
      onStatus?.('Starting OpenClaw agent...');
      
      // Build a clean, isolated session ID
      const sessionId = `clawible-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      
      // Build the message with clean context (no channel awareness)
      let message = '';
      
      // Add system context if provided
      if (systemPrompt) {
        message += `System Context:\n${systemPrompt}\n\n`;
      }
      
      // Add project path context
      if (projectPath) {
        message += `Working Directory: ${projectPath}\n\n`;
      }
      
      // Add the actual task
      message += `Task:\n${task}`;
      
      // Build openclaw command
      // Key: Use --no-announce to prevent WhatsApp notifications
      // Key: Isolated session ID for clean state
      const args = [
        'agent',
        '--session-id', sessionId,
        '--message', message,
        '--json',
        '--timeout', String(timeout),
      ];
      
      // Add agent ID if not main
      if (agentId && agentId !== 'main') {
        args.push('--agent', agentId);
      }
      
      // Add model override if specified
      if (model) {
        args.push('--model', model);
      }
      
      onStatus?.(`Running agent: ${agentId || 'main'}`);
      
      const proc = spawn('openclaw', args, {
        env: {
          ...process.env,
          // Ensure no accidental channel routing
          OPENCLAW_NO_ANNOUNCE: '1',
        },
        cwd: projectPath || process.cwd(),
      });
      
      this.runningProcesses.set(sessionId, proc);
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        
        // Try to parse streaming status updates
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.includes('status:')) {
            onStatus?.(line.replace('status:', '').trim());
          }
        }
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code) => {
        this.runningProcesses.delete(sessionId);
        
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim());
            
            // Extract the actual text response
            let text = null;
            if (result.result?.payloads?.[0]?.text) {
              text = result.result.payloads[0].text;
            } else if (result.reply) {
              text = result.reply;
            } else if (result.content) {
              text = result.content;
            } else if (typeof result === 'string') {
              text = result;
            }
            
            resolve(text || stdout.trim());
          } catch {
            // If not JSON, return raw output
            resolve(stdout.trim());
          }
        } else {
          reject(new Error(stderr || `OpenClaw exited with code ${code}`));
        }
      });
      
      proc.on('error', (err) => {
        this.runningProcesses.delete(sessionId);
        reject(new Error(`Failed to spawn OpenClaw: ${err.message}`));
      });
      
      // Timeout handling
      const timeoutId = setTimeout(() => {
        if (this.runningProcesses.has(sessionId)) {
          proc.kill('SIGTERM');
          reject(new Error(`Timeout after ${timeout}s`));
        }
      }, timeout * 1000);
      
      proc.on('close', () => clearTimeout(timeoutId));
    });
  }
  
  async cancel(sessionId) {
    const proc = this.runningProcesses.get(sessionId);
    if (proc) {
      proc.kill('SIGTERM');
      this.runningProcesses.delete(sessionId);
    }
  }
}
