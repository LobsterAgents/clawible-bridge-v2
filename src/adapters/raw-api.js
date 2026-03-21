/**
 * Raw API Adapter
 * 
 * Direct API calls to Anthropic/OpenAI for simple chat tasks.
 * No agent features - just model inference.
 */

import { BaseAdapter } from './base.js';

export class RawAPIAdapter extends BaseAdapter {
  constructor() {
    super();
    this.description = 'Direct API calls (Anthropic/OpenAI)';
    this.capabilities = ['chat'];
  }
  
  isAvailable() {
    return !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
  }
  
  async execute(context, options = {}) {
    const { task, systemPrompt, onStatus } = context;
    const { 
      model = 'claude-sonnet-4-20250514', 
      provider = 'anthropic',
      timeout = 60,
      maxTokens = 4096,
    } = options;
    
    onStatus?.(`Calling ${provider} API...`);
    
    if (provider === 'anthropic') {
      return this.callAnthropic(task, systemPrompt, model, maxTokens, timeout);
    } else if (provider === 'openai') {
      return this.callOpenAI(task, systemPrompt, model, maxTokens, timeout);
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }
  }
  
  async callAnthropic(task, systemPrompt, model, maxTokens, timeout) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt || undefined,
          messages: [{ role: 'user', content: task }],
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${error}`);
      }
      
      const result = await response.json();
      return result.content?.[0]?.text || '';
      
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Timeout after ${timeout}s`);
      }
      throw err;
    }
  }
  
  async callOpenAI(task, systemPrompt, model, maxTokens, timeout) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not set');
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);
    
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: task });
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }
      
      const result = await response.json();
      return result.choices?.[0]?.message?.content || '';
      
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Timeout after ${timeout}s`);
      }
      throw err;
    }
  }
}
