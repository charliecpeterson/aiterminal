import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { AIMarkdown } from './AIMarkdown';
import './PreviewWindow.css';

const PreviewWindow: React.FC = () => {
  const [content, setContent] = useState<string>('');
  const [filePath, setFilePath] = useState<string>('');
  const [fileType, setFileType] = useState<'markdown' | 'html' | 'text'>('text');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get file path from URL query parameter
    const params = new URLSearchParams(window.location.search);
    const preview = params.get('preview');
    
    if (!preview) {
      setError('No file specified');
      setLoading(false);
      return;
    }

    setFilePath(preview);
    loadFile(preview);

    // Listen for file changes
    const currentWindow = getCurrentWebviewWindow();
    const unlisten = currentWindow.listen<{ path: string }>('preview-file-changed', (event) => {
      console.log('[Preview] File changed, reloading:', event.payload.path);
      loadFile(event.payload.path);
    });

    return () => {
      unlisten.then(fn => fn());
      // Stop watcher when window closes
      invoke('stop_preview_watcher', { windowLabel: currentWindow.label });
    };
  }, []);

  const loadFile = async (path: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const fileContent = await invoke<string>('read_preview_file', { filePath: path });
      setContent(fileContent);
      
      // Detect file type from extension
      const ext = path.split('.').pop()?.toLowerCase();
      if (ext === 'md' || ext === 'markdown') {
        setFileType('markdown');
      } else if (ext === 'html' || ext === 'htm') {
        setFileType('html');
      } else {
        setFileType('text');
      }
      
      setLoading(false);
    } catch (err) {
      console.error('[Preview] Failed to load file:', err);
      setError(err as string);
      setLoading(false);
    }
  };

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
