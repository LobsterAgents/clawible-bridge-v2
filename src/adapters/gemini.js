/**
 * Gemini Adapter
 * 
 * Executes tasks using Google's Gemini API.
 * Supports both chat and image generation.
 */

import { BaseAdapter } from './base.js';

export class GeminiAdapter extends BaseAdapter {
  constructor() {
    super();
    this.description = 'Google Gemini - multimodal AI';
    this.capabilities = ['chat', 'coding', 'image-generation'];
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }
  
  isAvailable() {
    return !!process.env.GEMINI_API_KEY;
  }
  
  async execute(context, options = {}) {
    const { task, systemPrompt, onStatus } = context;
    const { 
      model = 'gemini-2.0-flash',
      timeout = 120,
      generateImage = false,
    } = options;
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not set');
    }
    
    if (generateImage) {
      return this.generateImage(task, apiKey, timeout, onStatus);
    }
    
    return this.chat(task, systemPrompt, model, apiKey, timeout, onStatus);
  }
  
  async chat(task, systemPrompt, model, apiKey, timeout, onStatus) {
    onStatus?.(`Calling Gemini (${model})...`);
    
    const contents = [];
    
    // Gemini uses a different format for system prompts
    if (systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: `System: ${systemPrompt}` }]
      });
      contents.push({
        role: 'model', 
        parts: [{ text: 'Understood. I will follow these instructions.' }]
      });
    }
    
    contents.push({
      role: 'user',
      parts: [{ text: task }]
    });
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);
    
    try {
      const response = await fetch(
        `${this.baseUrl}/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192,
            },
          }),
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${error}`);
      }
      
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) {
        throw new Error('No response from Gemini');
      }
      
      return text;
      
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Timeout after ${timeout}s`);
      }
      throw err;
    }
  }
  
  async generateImage(prompt, apiKey, timeout, onStatus) {
    onStatus?.('Generating image with Gemini...');
    
    // Use Imagen 3 for image generation
    const model = 'imagen-3.0-generate-002';
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);
    
    try {
      const response = await fetch(
        `${this.baseUrl}/models/${model}:predict?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: '1:1',
              safetyFilterLevel: 'block_only_high',
            },
          }),
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini Imagen error: ${error}`);
      }
      
      const result = await response.json();
      const imageBytes = result.predictions?.[0]?.bytesBase64Encoded;
      
      if (!imageBytes) {
        throw new Error('No image generated');
      }
      
      // Return as data URL
      return `data:image/png;base64,${imageBytes}`;
      
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Timeout after ${timeout}s`);
      }
      throw err;
    }
  }
}
