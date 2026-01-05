/**
 * LLM-powered autocomplete using local Qwen3 model
 */

import { invoke } from '@tauri-apps/api/core';

export interface CompletionContext {
  shell: string;
  cwd: string;
  last_command: string;
  partial_input: string;
  shell_history: string[];
}

export interface Suggestion {
  text: string;
  source: 'llm' | 'history';
}

export class LLMAutocomplete {
  private enabled: boolean = false;
  private initialized: boolean = false;
  
  async initialize(modelPath: string): Promise<void> {
    try {
      await invoke('init_llm', { modelPath });
      this.initialized = true;
      this.enabled = true;
    } catch (error) {
      console.error('❌ Failed to initialize LLM:', error);
      this.enabled = false;
      throw error;
    }
  }
  
  async getSuggestions(context: CompletionContext): Promise<Suggestion[]> {
    if (!this.enabled || !this.initialized) {
      console.warn('LLM not initialized, returning empty suggestions');
      return [];
    }
    
    try {
      const completions = await invoke<string[]>('get_llm_completions', { context });
      return completions.map(text => ({
        text,
        source: 'llm' as const,
      }));
    } catch (error) {
      console.error('LLM completion failed:', error);
      return [];
    }
  }
  
  async checkHealth(): Promise<boolean> {
    if (!this.enabled) return false;
    
    try {
      return await invoke<boolean>('llm_health_check');
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
  
  async shutdown(): Promise<void> {
    if (!this.enabled) return;
    
    try {
      await invoke('stop_llm');
      this.enabled = false;
    } catch (error) {
      console.error('Failed to stop LLM:', error);
    }
  }
  
  isEnabled(): boolean {
    return this.enabled;
  }
}
