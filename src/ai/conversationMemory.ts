/**
 * Conversation memory to track chat history and build context over time
 */

import type { ChatMessage } from '../context/AIContext';

export interface ConversationTurn {
  timestamp: number;
  userQuery: string;
  assistantResponse: string;
  contextUsed: string[];
  wasSuccessful: boolean;
}

export interface ConversationMemory {
  turns: ConversationTurn[];
  userPreferences: {
    skillLevel?: 'beginner' | 'intermediate' | 'expert';
    preferredShell?: string;
    verbosity?: 'concise' | 'detailed';
  };
  frequentTopics: Map<string, number>;
}

/**
 * Build conversation memory from chat history
 */
export function buildConversationMemory(messages: ChatMessage[]): ConversationMemory {
  const memory: ConversationMemory = {
    turns: [],
    userPreferences: {},
    frequentTopics: new Map(),
  };

  let currentUserQuery: string | null = null;
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    if (msg.role === 'user') {
      currentUserQuery = msg.content;
      
      // Track topics
      extractTopics(msg.content).forEach(topic => {
        const count = memory.frequentTopics.get(topic) || 0;
        memory.frequentTopics.set(topic, count + 1);
      });
    } else if (msg.role === 'assistant' && currentUserQuery) {
      // Track turn
      memory.turns.push({
        timestamp: msg.timestamp,
        userQuery: currentUserQuery,
        assistantResponse: msg.content,
        contextUsed: msg.usedContext?.chunks?.map((c) => c.sourceType) || [],
        wasSuccessful: !msg.content.toLowerCase().includes('error'),
      });
      
      currentUserQuery = null;
    }
    
  }

  // Detect skill level from conversation
  memory.userPreferences.skillLevel = detectSkillLevel(memory);
  
  return memory;
}

/**
 * Extract topics from user query
 */
function extractTopics(query: string): string[] {
  const topics: string[] = [];
  const lower = query.toLowerCase();
  
  // Common topics
  const topicPatterns = [
    { pattern: /(git|github|gitlab|version control)/i, topic: 'git' },
    { pattern: /(docker|container|kubernetes)/i, topic: 'docker' },
    { pattern: /(npm|node|javascript|typescript)/i, topic: 'node' },
    { pattern: /(python|pip|venv|conda)/i, topic: 'python' },
    { pattern: /(ssh|remote|server)/i, topic: 'ssh' },
    { pattern: /(file|directory|folder|path)/i, topic: 'filesystem' },
    { pattern: /(process|memory|cpu|performance)/i, topic: 'system' },
    { pattern: /(error|bug|fix|debug)/i, topic: 'debugging' },
  ];
  
  topicPatterns.forEach(({ pattern, topic }) => {
    if (pattern.test(lower)) {
      topics.push(topic);
    }
  });
  
  return topics;
}

/**
 * Detect user skill level from conversation patterns
 */
function detectSkillLevel(memory: ConversationMemory): 'beginner' | 'intermediate' | 'expert' {
  if (memory.turns.length < 3) return 'intermediate'; // Default
  
  let beginnerSignals = 0;
  let expertSignals = 0;
  
  memory.turns.forEach(turn => {
    const query = turn.userQuery.toLowerCase();
    
    // Beginner signals
    if (query.includes('what is') || query.includes('how do i') || query.includes('what does')) {
      beginnerSignals++;
    }
    if (query.includes('step by step') || query.includes('explain')) {
      beginnerSignals++;
    }
    
    // Expert signals
    if (query.includes('optimize') || query.includes('performance') || query.includes('benchmark')) {
      expertSignals++;
    }
    if (query.match(/\b(regex|awk|sed|grep)\b/)) {
      expertSignals++;
    }
    if (query.length > 100) { // Detailed queries
      expertSignals++;
    }
  });
  
  if (beginnerSignals > expertSignals * 2) return 'beginner';
  if (expertSignals > beginnerSignals * 2) return 'expert';
  return 'intermediate';
}

