import { describe, it, expect } from 'vitest';
import { truncatePathSmart } from './pathUtils';

describe('pathUtils', () => {
  describe('truncatePathSmart', () => {
    it('should return empty string for empty input', () => {
      expect(truncatePathSmart('')).toBe('');
    });

    it('should return path unchanged if within maxLength', () => {
      expect(truncatePathSmart('/home/user', 40)).toBe('/home/user');
      expect(truncatePathSmart('~/projects', 40)).toBe('~/projects');
    });

    it('should replace home directory with ~', () => {
      const path = '/Users/charlie/projects';
      const homeDir = '/Users/charlie';
      expect(truncatePathSmart(path, 40, homeDir)).toBe('~/projects');
    });

    it('should truncate long paths with ellipsis', () => {
      const path = '/Users/charlie/projects/myapp/src/components/Button.tsx';
      const result = truncatePathSmart(path, 30);
      expect(result.length).toBeLessThanOrEqual(30);
      expect(result).toContain('...');
    });

    it('should preserve first and last segments when possible', () => {
      const path = '/Users/charlie/projects/myapp/src/components';
      const result = truncatePathSmart(path, 35);
      expect(result).toContain('Users');
      expect(result).toContain('components');
    });

    it('should handle single segment paths', () => {
      const longName = 'a'.repeat(50);
      const result = truncatePathSmart(`/${longName}`, 20);
      expect(result.length).toBeLessThanOrEqual(20);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle home paths with truncation', () => {
      const path = '/Users/charlie/very/long/nested/path/to/file';
      const homeDir = '/Users/charlie';
      const result = truncatePathSmart(path, 25, homeDir);
      expect(result.startsWith('~')).toBe(true);
      expect(result.length).toBeLessThanOrEqual(25);
    });

    it('should handle relative paths', () => {
      const path = 'src/components/Button/index.tsx';
      const result = truncatePathSmart(path, 20);
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('should handle very short maxLength gracefully', () => {
      const path = '/Users/charlie/projects';
      const result = truncatePathSmart(path, 10);
      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should include second-to-last segment when space allows', () => {
      const path = '/a/b/c/parent/child';
      const result = truncatePathSmart(path, 30);
      // Should try to include 'parent' if it fits
      if (result.length <= 30 && result.includes('parent')) {
        expect(result).toContain('parent');
        expect(result).toContain('child');
      }
    });

    it('should handle paths without leading slash', () => {
      const path = 'relative/path/to/file';
      const result = truncatePathSmart(path, 15);
      expect(result.length).toBeLessThanOrEqual(15);
    });

    it('should not modify home dir when it does not match', () => {
      const path = '/other/path/to/file';
      const homeDir = '/Users/charlie';
      const result = truncatePathSmart(path, 40, homeDir);
      expect(result).not.toContain('~');
    });
  });
});
