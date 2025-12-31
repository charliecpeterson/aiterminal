import React, { useEffect, useState } from 'react';
import { AIMarkdown } from './AIMarkdown';
import './PreviewWindow.css';

const PreviewWindow: React.FC = () => {
  const [content, setContent] = useState<string>('');
  const [filePath, setFilePath] = useState<string>('');
  const [fileType, setFileType] = useState<'markdown' | 'html' | 'text'>('text');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get filename and content from URL query parameters
    const params = new URLSearchParams(window.location.search);
    const filename = params.get('preview');
    const encodedContent = params.get('content');
    
    if (!filename || !encodedContent) {
      setError('No file specified');
      setLoading(false);
      return;
    }

    setFilePath(filename);
    
    // Decode base64 content
    try {
      const decoded = atob(encodedContent);
      setContent(decoded);
      
      // Detect file type from extension
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext === 'md' || ext === 'markdown') {
        setFileType('markdown');
      } else if (ext === 'html' || ext === 'htm') {
        setFileType('html');
      } else {
        setFileType('text');
      }
      
      setLoading(false);
    } catch (err) {
      setError('Failed to decode file content');
      setLoading(false);
    }

    // Note: Hot reload not supported for remote files
    // Future enhancement: detect local files and set up watcher
  }, []);

  const renderContent = () => {
    if (loading) {
      return <div className="preview-loading">Loading file...</div>;
    }

    if (error) {
      return <div className="preview-error">Error: {error}</div>;
    }

    switch (fileType) {
      case 'markdown':
        return (
          <div className="preview-markdown">
            <AIMarkdown content={content} />
          </div>
        );
      
      case 'html':
        return (
          <div className="preview-html">
            <iframe
              srcDoc={content}
              title="HTML Preview"
              sandbox="allow-scripts allow-same-origin"
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        );
      
      case 'text':
      default:
        return (
          <div className="preview-text">
            <pre>{content}</pre>
          </div>
        );
    }
  };

  return (
    <div className="preview-window">
      <div className="preview-header">
        <div className="preview-file-path" title={filePath}>
          {filePath.split('/').pop()}
        </div>
        <div className="preview-file-type">{fileType.toUpperCase()}</div>
      </div>
      <div className="preview-content">
        {renderContent()}
      </div>
    </div>
  );
};

export default PreviewWindow;
