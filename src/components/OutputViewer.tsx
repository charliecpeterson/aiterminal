import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createLogger } from '../utils/logger';
import { outputViewerStyles } from './OutputViewer.styles';

const log = createLogger('OutputViewer');

interface OutputViewerProps {}

const OutputViewer: React.FC<OutputViewerProps> = () => {
  const [content, setContent] = useState<string>('');
  const [lineCount, setLineCount] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(-1);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const matchElementsRef = useRef<Map<number, HTMLElement>>(new Map());


  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  useEffect(() => {
    // Read content from URL parameters
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const lines = params.get('lines');
    const contentBase64 = params.get('content');
    
    if (lines) {
      setLineCount(parseInt(lines, 10));
    }
    
    if (contentBase64) {
      try {
        const decoded = decodeURIComponent(atob(contentBase64));
        setContent(decoded);
      } catch (err) {
        log.error('Failed to decode content', err);
        setContent('Error: Failed to decode content');
      }
    }
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
  };

  const handleExport = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `output-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const matches = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return [] as Array<{ start: number; end: number }>;

    const result: Array<{ start: number; end: number }> = [];
    const re = new RegExp(escapeRegExp(query), 'gi');
    for (const match of content.matchAll(re)) {
      const start = match.index ?? -1;
      if (start < 0) continue;
      result.push({ start, end: start + match[0].length });
    }
    return result;
  }, [content, searchQuery]);

  const lineStartOffsets = useMemo(() => {
    // Offsets of the first character of each line.
    const offsets: number[] = [0];
    for (let i = 0; i < content.length; i++) {
      if (content.charCodeAt(i) === 10 /* \n */) {
        offsets.push(i + 1);
      }
    }
    return offsets;
  }, [content]);

  const findLineIndexForOffset = useCallback((offset: number) => {
    // Returns the line index such that lineStartOffsets[i] <= offset < lineStartOffsets[i+1]
    const arr = lineStartOffsets;
    let lo = 0;
    let hi = arr.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= offset) lo = mid + 1;
      else hi = mid - 1;
    }
    return Math.max(0, lo - 1);
  }, [lineStartOffsets]);

  const matchLineIndices = useMemo(() => {
    if (matches.length === 0) return [] as number[];
    const seen = new Set<number>();
    const indices: number[] = [];
    for (const m of matches) {
      const li = findLineIndexForOffset(m.start);
      if (!seen.has(li)) {
        seen.add(li);
        indices.push(li);
      }
    }
    return indices;
  }, [matches, lineStartOffsets, findLineIndexForOffset]);

  const activeMatchLineIndex = useMemo(() => {
    if (activeMatchIndex < 0 || activeMatchIndex >= matches.length) return null;
    return findLineIndexForOffset(matches[activeMatchIndex].start);
  }, [activeMatchIndex, matches, lineStartOffsets, findLineIndexForOffset]);

  const scrollToMatch = useCallback((index: number) => {
    if (index < 0) return;
    requestAnimationFrame(() => {
      const el = matchElementsRef.current.get(index);
      if (!el) return;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
  }, []);

  useEffect(() => {
    matchElementsRef.current.clear();
    const query = searchQuery.trim();
    if (!query || matches.length === 0) {
      setActiveMatchIndex(-1);
      return;
    }
    setActiveMatchIndex(0);
    scrollToMatch(0);
  }, [searchQuery, matches.length, scrollToMatch]);

  const goToNextMatch = () => {
    if (matches.length === 0) return;
    const next = activeMatchIndex < 0 ? 0 : (activeMatchIndex + 1) % matches.length;
    setActiveMatchIndex(next);
    scrollToMatch(next);
  };

  const goToPrevMatch = () => {
    if (matches.length === 0) return;
    const prev =
      activeMatchIndex < 0
        ? matches.length - 1
        : (activeMatchIndex - 1 + matches.length) % matches.length;
    setActiveMatchIndex(prev);
    scrollToMatch(prev);
  };

  const renderedContent = useMemo(() => {
    const query = searchQuery.trim();
    if (!query || matches.length === 0) return content;

    const nodes: React.ReactNode[] = [];
    let cursor = 0;

    matches.forEach((m, i) => {
      if (m.start > cursor) {
        nodes.push(content.slice(cursor, m.start));
      }

      const text = content.slice(m.start, m.end);
      nodes.push(
        <span
          key={`m-${i}-${m.start}`}
          ref={(el) => {
            if (el) matchElementsRef.current.set(i, el);
          }}
          style={
            i === activeMatchIndex
              ? { ...outputViewerStyles.highlight, ...outputViewerStyles.highlightActive }
              : outputViewerStyles.highlight
          }
        >
          {text}
        </span>
      );
      cursor = m.end;
    });

    if (cursor < content.length) {
      nodes.push(content.slice(cursor));
    }

    return nodes;
  }, [content, matches, searchQuery, activeMatchIndex]);

  return (
    <div style={outputViewerStyles.viewer}>
      <div style={outputViewerStyles.header}>
        <div style={outputViewerStyles.title}>
          Command Output ({lineCount} lines)
        </div>
        <div style={outputViewerStyles.actions}>
          <input
            type="text"
            style={outputViewerStyles.search}
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) goToPrevMatch();
                else goToNextMatch();
              }
            }}
          />
          {searchQuery.trim() ? (
            <div style={outputViewerStyles.matchCount}>
              {matches.length === 0
                ? '0/0'
                : `${Math.max(activeMatchIndex, 0) + 1}/${matches.length}`}
            </div>
          ) : null}
          <button
            className="output-viewer-btn"
            onClick={goToPrevMatch}
            disabled={matches.length === 0}
            title="Previous match (Shift+Enter)"
          >
            Prev
          </button>
          <button
            className="output-viewer-btn"
            onClick={goToNextMatch}
            disabled={matches.length === 0}
            title="Next match (Enter)"
          >
            Next
          </button>
          <button
            className="output-viewer-btn"
            onClick={handleCopy}
          >
            Copy
          </button>
          <button
            className="output-viewer-btn"
            onClick={handleExport}
          >
            Export
          </button>
        </div>
      </div>
      <div style={outputViewerStyles.contentWrap}>
        <div style={outputViewerStyles.content} ref={contentRef}>
          <pre style={outputViewerStyles.pre}>{renderedContent || 'Loading...'}</pre>
        </div>
        {searchQuery.trim() && matchLineIndices.length > 0 ? (
          <div style={outputViewerStyles.ruler} aria-hidden="true">
            {matchLineIndices.map((lineIndex) => {
              const denom = Math.max(1, lineStartOffsets.length - 1);
              const topPct = (lineIndex / denom) * 100;
              const isActive = activeMatchLineIndex === lineIndex;
              return (
                <div
                  key={`tick-${lineIndex}`}
                  style={{
                    ...(isActive
                      ? { ...outputViewerStyles.tick, ...outputViewerStyles.tickActive }
                      : outputViewerStyles.tick),
                    top: `${Math.min(100, Math.max(0, topPct))}%`,
                  }}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default OutputViewer;
