import React, { useEffect, useState } from 'react';
import './OutputViewer.css';

interface OutputViewerProps {}

const OutputViewer: React.FC<OutputViewerProps> = () => {
  const [content, setContent] = useState<string>('');
  const [lineCount, setLineCount] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');

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
        console.error('Failed to decode content:', err);
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

  const filteredContent = searchQuery
    ? content
        .split('\n')
        .filter((line) => line.toLowerCase().includes(searchQuery.toLowerCase()))
        .join('\n')
    : content;

  return (
    <div className="output-viewer">
      <div className="output-viewer-header">
        <div className="output-viewer-title">
          Command Output ({lineCount} lines)
        </div>
        <div className="output-viewer-actions">
          <input
            type="text"
            className="output-viewer-search"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="output-viewer-btn" onClick={handleCopy}>
            Copy
          </button>
          <button className="output-viewer-btn" onClick={handleExport}>
            Export
          </button>
        </div>
      </div>
      <div className="output-viewer-content">
        <pre>{filteredContent || 'Loading...'}</pre>
      </div>
    </div>
  );
};

export default OutputViewer;
