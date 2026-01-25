import DOMPurify from 'isomorphic-dompurify';

/**
 * Security utility for sanitizing HTML content to prevent XSS attacks.
 * Uses DOMPurify to remove dangerous HTML/JavaScript while preserving safe content.
 * Note: Uses isomorphic-dompurify for Node.js/browser compatibility.
 */

/**
 * Sanitize HTML content with strict security settings.
 * Removes all scripts, event handlers, and dangerous elements.
 * 
 * @param html - Raw HTML string to sanitize
 * @returns Sanitized HTML safe for rendering
 */
export function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    // Allow common safe tags
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'a', 'img', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span',
      'hr', 'sup', 'sub', 'small', 'b', 'i'
    ],
    // Allow safe attributes
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'width', 'height', 'style', 'class',
      'id', 'colspan', 'rowspan', 'align', 'valign'
    ],
    // Disallow scripts and dangerous protocols
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    // Sanitize URLs to prevent javascript: and data: URIs in links
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    // Keep safe HTML entities
    KEEP_CONTENT: true,
    // Return clean HTML, not DOM nodes
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}

/**
 * Sanitize SVG content with strict security settings.
 * Removes event handlers and scripts while preserving SVG structure.
 * 
 * @param svg - Raw SVG string to sanitize
 * @returns Sanitized SVG safe for rendering
 */
export function sanitizeSVG(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],  // SVG <use> element
    FORBID_TAGS: ['script', 'style', 'foreignObject'],
    FORBID_ATTR: [
      'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
      'onanimationstart', 'onanimationend', 'onanimationiteration'
    ],
    KEEP_CONTENT: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}

/**
 * Sanitize HTML for notebook outputs.
 * More permissive than sanitizeHTML to allow data visualization libraries,
 * but still removes dangerous scripts and event handlers.
 * 
 * @param html - Raw HTML string from notebook output
 * @returns Sanitized HTML safe for rendering
 */
export function sanitizeNotebookHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    // More permissive tag list for data viz
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'a', 'img', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span',
      'hr', 'sup', 'sub', 'small', 'b', 'i', 'svg', 'path', 'circle',
      'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g', 'text',
      'tspan', 'defs', 'clipPath', 'mask'
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'width', 'height', 'style', 'class',
      'id', 'colspan', 'rowspan', 'align', 'valign',
      // SVG attributes
      'viewBox', 'xmlns', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry',
      'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'fill', 'stroke',
      'stroke-width', 'd', 'opacity', 'font-size', 'text-anchor'
    ],
    // Still forbid dangerous elements
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onanimationstart'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}

/**
 * Sanitize AsciiDoc-generated HTML.
 * Removes scripts but allows more formatting elements that AsciiDoc produces.
 * 
 * @param html - HTML generated from AsciiDoc
 * @returns Sanitized HTML safe for rendering
 */
export function sanitizeAsciiDocHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'a', 'img', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'div', 'span',
      'hr', 'sup', 'sub', 'small', 'b', 'i', 'dl', 'dt', 'dd', 'caption',
      'figure', 'figcaption', 'mark', 'del', 'ins', 'kbd', 'samp', 'var',
      'abbr', 'cite', 'q', 'dfn', 'time', 'address'
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'width', 'height', 'style', 'class',
      'id', 'colspan', 'rowspan', 'align', 'valign', 'data-*',
      'aria-label', 'aria-describedby', 'role'
    ],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}

/**
 * Create a sanitized iframe srcDoc attribute.
 * Wraps HTML in a sandboxed environment without scripts.
 * 
 * @param html - Raw HTML to render in iframe
 * @returns Object with sanitized HTML and recommended sandbox attributes
 */
export function createSafeIframeSrcDoc(html: string): { srcDoc: string; sandbox: string } {
  const sanitized = sanitizeHTML(html);
  
  return {
    srcDoc: sanitized,
    // Sandbox: no scripts, no forms, no popups, no top navigation
    // Still allows same-origin for CSS and rendering
    sandbox: 'allow-same-origin'
  };
}

/**
 * Check if content contains potentially dangerous patterns.
 * This is a pre-check before sanitization.
 * 
 * @param content - Content to check
 * @returns Object indicating if dangerous patterns were found
 */
export function detectDangerousPatterns(content: string): { 
  hasDangerousPatterns: boolean; 
  patterns: string[] 
} {
  const patterns: string[] = [];
  
  // Check for script tags
  if (/<script[\s>]/i.test(content)) {
    patterns.push('script tags');
  }
  
  // Check for event handlers
  if (/on(load|error|click|mouse|focus|blur|animation)=/i.test(content)) {
    patterns.push('event handlers');
  }
  
  // Check for javascript: protocol
  if (/javascript:/i.test(content)) {
    patterns.push('javascript: protocol');
  }
  
  // Check for data: URIs (can contain scripts)
  if (/data:text\/html/i.test(content)) {
    patterns.push('data:text/html URIs');
  }
  
  // Check for eval, Function constructor
  if (/(eval|Function)\s*\(/i.test(content)) {
    patterns.push('eval/Function calls');
  }
  
  return {
    hasDangerousPatterns: patterns.length > 0,
    patterns
  };
}
