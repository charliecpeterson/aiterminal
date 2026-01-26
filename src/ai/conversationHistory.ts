/**
 * Conversation History Management
 * 
 * Manages conversation history with sliding window to prevent token bloat.
 * Older messages are summarized to maintain context while reducing costs.
 */

import type { ChatMessage } from '../context/AIContext';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { AiSettings } from '../context/SettingsContext';
import { createLogger } from '../utils/logger';

const log = createLogger('ConversationHistory');

export interface ConversationWindow {
  recentMessages: ChatMessage[];
  summaryMessage?: ChatMessage;
  totalOriginalCount: number;
  tokensSaved: number;
}

// Configuration
const CONFIG = {
  SLIDING_WINDOW_SIZE: 8, // Keep last 8 messages (4 exchanges)
  MIN_MESSAGES_FOR_SUMMARY: 12, // Only summarize if we have 12+ messages
  SUMMARY_CACHE_TTL: 5 * 60 * 1000, // Cache summary for 5 minutes
};

// Cache for generated summaries
interface SummaryCache {
  messageIds: string[];
  summary: string;
  timestamp: number;
}

let summaryCache: SummaryCache | null = null;

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate total tokens in messages
 */
function calculateMessageTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
}

/**
 * Check if we can use cached summary
 */
function canUseCachedSummary(messages: ChatMessage[]): boolean {
  if (!summaryCache) return false;
  
  // Check if cache is still valid
  const now = Date.now();
  if (now - summaryCache.timestamp > CONFIG.SUMMARY_CACHE_TTL) {
    summaryCache = null;
    return false;
  }
  
  // Check if the messages match (same IDs in same order)
  if (summaryCache.messageIds.length !== messages.length) return false;
  
  for (let i = 0; i < messages.length; i++) {
    if (summaryCache.messageIds[i] !== messages[i].id) return false;
  }
  
  return true;
}

/**
 * Generate a summary of older messages
 */
async function summarizeOldMessages(
  messages: ChatMessage[],
  settings: AiSettings
): Promise<string> {
  // Check cache first
  if (canUseCachedSummary(messages)) {
    log.debug('Using cached conversation summary');
    return summaryCache!.summary;
  }
  
  // Build conversation text for summarization
  const conversationText = messages
    .map(msg => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${msg.content}`;
    })
    .join('\n\n');
  
  const summaryPrompt = `Summarize this conversation concisely. Focus on:
- Key topics discussed
- Important decisions or findings
- Files, commands, or errors mentioned
- Current task or goal

Keep it under 200 words and maintain a technical, factual tone.

CONVERSATION:
${conversationText}

SUMMARY:`;

  try {
    const openai = createOpenAI({
      apiKey: settings.api_key,
      baseURL: settings.url || 'https://api.openai.com/v1',
    });
    
    // Use faster, cheaper model for summarization (gpt-4o-mini or fallback to user's model)
    const summaryModel = settings.model.includes('gpt-4') 
      ? 'gpt-4o-mini' 
      : settings.model;
    
    const result = await generateText({
      model: openai(summaryModel),
      prompt: summaryPrompt,
      temperature: 0.3, // Low temperature for factual summary
      maxOutputTokens: 300, // Limit summary length
    });
    
    const summary = result.text.trim();
    
    // Cache the summary
    summaryCache = {
      messageIds: messages.map(m => m.id),
      summary,
      timestamp: Date.now(),
    };
    
    log.debug('Generated conversation summary', { 
      messageCount: messages.length,
      summaryLength: summary.length 
    });
    
    return summary;
    
  } catch (error) {
    log.error('Failed to generate summary', error);
    // Fallback: create simple bullet point summary
    return createFallbackSummary(messages);
  }
}

/**
 * Create a simple summary if AI summarization fails
 */
function createFallbackSummary(messages: ChatMessage[]): string {
  const topics = new Set<string>();
  const commands = new Set<string>();
  const files = new Set<string>();
  
  // Extract key information
  messages.forEach(msg => {
    const content = msg.content.toLowerCase();
    
    // Extract commands (look for common patterns)
    const cmdMatches = content.match(/`([^`]+)`/g);
    if (cmdMatches) {
      cmdMatches.forEach(cmd => commands.add(cmd.replace(/`/g, '')));
    }
    
    // Extract file paths
    const fileMatches = content.match(/[\w/.-]+\.(ts|js|json|txt|py|md|tsx|jsx)/gi);
    if (fileMatches) {
      fileMatches.slice(0, 3).forEach(file => files.add(file));
    }
    
    // Extract topics (simple keyword extraction)
    const words = content.split(/\s+/);
    words.forEach(word => {
      if (word.length > 5 && /^[a-z]+$/.test(word)) {
        topics.add(word);
      }
    });
  });
  
  const parts: string[] = ['[Previous conversation summary]'];
  
  if (topics.size > 0) {
    parts.push(`Topics: ${Array.from(topics).slice(0, 5).join(', ')}`);
  }
  
  if (commands.size > 0) {
    parts.push(`Commands discussed: ${Array.from(commands).slice(0, 3).join(', ')}`);
  }
  
  if (files.size > 0) {
    parts.push(`Files mentioned: ${Array.from(files).join(', ')}`);
  }
  
  return parts.join('\n');
}

/**
 * Prepare conversation history with sliding window and summarization
 */
export async function prepareConversationHistory(
  messages: ChatMessage[],
  settings: AiSettings | null | undefined
): Promise<ConversationWindow> {
  // Filter out system messages for history
  const nonSystemMessages = messages.filter(m => m.role !== 'system');
  
  // If conversation is short, use all messages
  if (nonSystemMessages.length <= CONFIG.SLIDING_WINDOW_SIZE) {
    return {
      recentMessages: nonSystemMessages,
      totalOriginalCount: nonSystemMessages.length,
      tokensSaved: 0,
    };
  }
  
  // Take recent messages (sliding window)
  const recentMessages = nonSystemMessages.slice(-CONFIG.SLIDING_WINDOW_SIZE);
  const oldMessages = nonSystemMessages.slice(0, -CONFIG.SLIDING_WINDOW_SIZE);
  
  // Calculate tokens saved
  const originalTokens = calculateMessageTokens(nonSystemMessages);
  const recentTokens = calculateMessageTokens(recentMessages);
  
  // Only summarize if we have enough old messages and settings are available
  if (oldMessages.length >= CONFIG.MIN_MESSAGES_FOR_SUMMARY - CONFIG.SLIDING_WINDOW_SIZE && settings) {
    try {
      const summary = await summarizeOldMessages(oldMessages, settings);
      const summaryTokens = estimateTokens(summary);
      
      const summaryMessage: ChatMessage = {
        id: 'summary-' + Date.now(),
        role: 'system',
        content: summary,
        timestamp: Date.now(),
      };
      
      const tokensSaved = originalTokens - (recentTokens + summaryTokens);
      
      log.info('Conversation history prepared', {
        originalCount: nonSystemMessages.length,
        recentCount: recentMessages.length,
        oldCount: oldMessages.length,
        originalTokens,
        newTokens: recentTokens + summaryTokens,
        tokensSaved,
        savingsPercent: Math.round((tokensSaved / originalTokens) * 100),
      });
      
      return {
        recentMessages,
        summaryMessage,
        totalOriginalCount: nonSystemMessages.length,
        tokensSaved,
      };
    } catch (error) {
      log.error('Summarization failed, using recent messages only', error);
    }
  }
  
  // Fallback: use recent messages without summary
  const tokensSaved = originalTokens - recentTokens;
  
  log.info('Using sliding window without summary', {
    originalCount: nonSystemMessages.length,
    recentCount: recentMessages.length,
    tokensSaved,
  });
  
  return {
    recentMessages,
    totalOriginalCount: nonSystemMessages.length,
    tokensSaved,
  };
}

/**
 * Clear the summary cache (useful when conversation is cleared)
 */
export function clearSummaryCache(): void {
  summaryCache = null;
  log.debug('Summary cache cleared');
}
