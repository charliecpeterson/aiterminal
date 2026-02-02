import { describe, it, expect } from 'vitest';
import {
  CHARS_PER_TOKEN,
  TOKEN_BUDGETS,
  RESPONSE_TOKENS,
  estimateTokens,
  estimateChars,
  formatTokenCount,
  calculateTotalTokens,
  fitsInBudget,
  truncateToTokenBudget,
  splitIntoChunks,
} from './tokens';

describe('tokens', () => {
  describe('constants', () => {
    it('should have correct CHARS_PER_TOKEN value', () => {
      expect(CHARS_PER_TOKEN).toBe(4);
    });

    it('should have correct TOKEN_BUDGETS', () => {
      expect(TOKEN_BUDGETS.simple).toBe(4000);
      expect(TOKEN_BUDGETS.moderate).toBe(8000);
      expect(TOKEN_BUDGETS.complex).toBe(12000);
    });

    it('should have correct RESPONSE_TOKENS', () => {
      expect(RESPONSE_TOKENS.default).toBe(4096);
      expect(RESPONSE_TOKENS.min).toBe(256);
      expect(RESPONSE_TOKENS.max).toBe(128000);
    });
  });

  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should return 0 for null/undefined', () => {
      expect(estimateTokens(null as unknown as string)).toBe(0);
      expect(estimateTokens(undefined as unknown as string)).toBe(0);
    });

    it('should estimate tokens correctly (4 chars per token)', () => {
      expect(estimateTokens('test')).toBe(1); // 4 chars = 1 token
      expect(estimateTokens('hello')).toBe(2); // 5 chars = 2 tokens (ceil)
      expect(estimateTokens('12345678')).toBe(2); // 8 chars = 2 tokens
    });

    it('should round up for partial tokens', () => {
      expect(estimateTokens('a')).toBe(1); // 1 char rounds up to 1 token
      expect(estimateTokens('ab')).toBe(1); // 2 chars rounds up to 1 token
      expect(estimateTokens('abc')).toBe(1); // 3 chars rounds up to 1 token
      expect(estimateTokens('abcd')).toBe(1); // 4 chars = exactly 1 token
      expect(estimateTokens('abcde')).toBe(2); // 5 chars rounds up to 2 tokens
    });
  });

  describe('estimateChars', () => {
    it('should return 0 for 0 tokens', () => {
      expect(estimateChars(0)).toBe(0);
    });

    it('should multiply tokens by CHARS_PER_TOKEN', () => {
      expect(estimateChars(1)).toBe(4);
      expect(estimateChars(10)).toBe(40);
      expect(estimateChars(100)).toBe(400);
    });
  });

  describe('formatTokenCount', () => {
    it('should format small numbers without suffix', () => {
      expect(formatTokenCount(0)).toBe('0');
      expect(formatTokenCount(100)).toBe('100');
      expect(formatTokenCount(999)).toBe('999');
    });

    it('should format thousands with k suffix', () => {
      expect(formatTokenCount(1000)).toBe('1.0k');
      expect(formatTokenCount(1500)).toBe('1.5k');
      expect(formatTokenCount(10000)).toBe('10.0k');
      expect(formatTokenCount(12345)).toBe('12.3k');
    });
  });

  describe('calculateTotalTokens', () => {
    it('should return 0 for empty array', () => {
      expect(calculateTotalTokens([])).toBe(0);
    });

    it('should sum tokens from all items', () => {
      expect(calculateTotalTokens(['test'])).toBe(1); // 4 chars
      expect(calculateTotalTokens(['test', 'test'])).toBe(2); // 8 chars
      expect(calculateTotalTokens(['hello', 'world'])).toBe(4); // 10 chars = ceil(10/4) * 2
    });

    it('should handle mixed content', () => {
      // 'a' = 1 token, 'test' = 1 token, '12345678' = 2 tokens
      expect(calculateTotalTokens(['a', 'test', '12345678'])).toBe(4);
    });
  });

  describe('fitsInBudget', () => {
    it('should return true for empty string', () => {
      expect(fitsInBudget('', 10)).toBe(true);
    });

    it('should return true when text fits within budget', () => {
      expect(fitsInBudget('test', 1)).toBe(true); // 4 chars = 1 token
      expect(fitsInBudget('test', 2)).toBe(true);
    });

    it('should return false when text exceeds budget', () => {
      expect(fitsInBudget('hello world', 2)).toBe(false); // 11 chars = 3 tokens
    });

    it('should handle exact budget match', () => {
      expect(fitsInBudget('test', 1)).toBe(true); // exactly 1 token
    });
  });

  describe('truncateToTokenBudget', () => {
    it('should return text unchanged if within budget', () => {
      expect(truncateToTokenBudget('test', 100)).toBe('test');
    });

    it('should truncate and add suffix when exceeding budget', () => {
      const text = 'a'.repeat(100); // 100 chars = 25 tokens
      const result = truncateToTokenBudget(text, 5); // 5 tokens = 20 chars
      expect(result.length).toBe(20);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should use custom suffix', () => {
      const text = 'a'.repeat(100);
      const result = truncateToTokenBudget(text, 5, '[truncated]');
      expect(result.endsWith('[truncated]')).toBe(true);
    });

    it('should handle empty text', () => {
      expect(truncateToTokenBudget('', 10)).toBe('');
    });
  });

  describe('splitIntoChunks', () => {
    it('should return single chunk for small text', () => {
      const chunks = splitIntoChunks('test', 100);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('test');
    });

    it('should split text into multiple chunks', () => {
      const text = 'a'.repeat(100); // 100 chars
      const chunks = splitIntoChunks(text, 10); // 10 tokens = 40 chars per chunk
      expect(chunks).toHaveLength(3); // 100/40 = 2.5, rounds up to 3
      expect(chunks[0].length).toBe(40);
      expect(chunks[1].length).toBe(40);
      expect(chunks[2].length).toBe(20);
    });

    it('should handle empty text', () => {
      const chunks = splitIntoChunks('', 10);
      expect(chunks).toHaveLength(0);
    });
  });
});
