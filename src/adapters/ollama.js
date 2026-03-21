/**
 * Ollama Adapter
 * 
 * Executes tasks using local Ollama models.
 * Good for quick/cheap tasks that don't need external API.
 */

import { BaseAdapter } from './base.js';

export class OllamaAdapter extends BaseAdapter {
  constructor() {
    super();
    this.description = 'Ollama - local LLM models';
    this.capabilities = ['chat', 'coding'];
    this.baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
  }
  
  isAvailable() {
    // TODO: Ping Ollama server
    return true;
  }
  
  async execute(context, options = {}) {
    const { task, systemPrompt, onStatus } = context;
    const { model = 'llama3.2', timeout = 120 } = options;
    
    onStatus?.(`Starting Ollama (${model})...`);
    
    const messages = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: task });
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);
    
    try {
      onStatus?.('Generating response...');
      
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama error: ${error}`);
      }
      
      const result = await response.json();
      return result.message?.content || result.response || '';
      
    } catch (err) {
      clearTimeout(timeoutId);
      
      if (err.name === 'AbortError') {
        throw new Error(`Timeout after ${timeout}s`);
      }
      throw err;
    }
  }
}
