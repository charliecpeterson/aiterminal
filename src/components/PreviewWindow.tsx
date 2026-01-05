import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AIMarkdown } from './AIMarkdown';
import { NotebookRenderer } from './NotebookRenderer';
import './PreviewWindow.css';
import Asciidoctor from '@asciidoctor/core';
import JsonView from '@uiw/react-json-view';
import yaml from 'js-yaml';
import mammoth from 'mammoth';

// Component to render DOCX files
const DocxRenderer: React.FC<{ base64Content: string }> = ({ base64Content }) => {
  const [html, setHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const convertDocx = async () => {
      try {
        // Convert base64 to ArrayBuffer
        const binaryString = atob(base64Content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Convert DOCX to HTML using mammoth
        const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
        setHtml(result.value);
        setLoading(false);
      } catch (err) {
        setError(String(err));
        setLoading(false);
      }
    };

    convertDocx();
  }, [base64Content]);

  if (loading) {
    return <div className="preview-loading">Converting DOCX...</div>;
  }

  if (error) {
    return <div className="preview-error">Error converting DOCX: {error}</div>;
  }

  return (
    <div className="preview-docx">
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};

const PreviewWindow: React.FC = () => {
  const [content, setContent] = useState<string>('');
  const [filePath, setFilePath] = useState<string>('');
  const [fileType, setFileType] = useState<'markdown' | 'html' | 'text' | 'image' | 'pdf' | 'notebook' | 'asciidoc' | 'json' | 'yaml' | 'docx'>('text');
  const [imageMimeType, setImageMimeType] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const decodeBase64Text = (base64: string) => {
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
      return atob(base64);
    }
  };

  useEffect(() => {
    // Get window label from URL query parameter
    const params = new URLSearchParams(window.location.search);
    const windowLabel = params.get('preview');
    
    if (!windowLabel) {
      setError('No preview specified');
      setLoading(false);
      return;
    }

    // Fetch content from backend state
    invoke<[string, string]>('get_preview_content', { windowLabel })
      .then(([filename, encodedContent]) => {
        setFilePath(filename);
        
        // Detect file type from extension first
        const ext = filename.split('.').pop()?.toLowerCase();
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext || '');
        const isPdf = ext === 'pdf';
        const isNotebook = ext === 'ipynb';
        const isMarkdown = ['md', 'markdown', 'rmd', 'qmd'].includes(ext || '');
        const isAsciiDoc = ['asciidoc', 'adoc', 'asc'].includes(ext || '');
        const isJson = ext === 'json';
        const isYaml = ['yaml', 'yml'].includes(ext || '');
        const isDocx = ext === 'docx';
        const isRst = ext === 'rst';
        const isLatex = ['tex', 'latex'].includes(ext || '');
        
        // For images, PDFs, and notebooks (JSON), keep content as base64 or decode appropriately
        if (isPdf) {
          // Keep as base64 for PDF
          setContent(encodedContent);
          setFileType('pdf');
        } else if (isDocx) {
          // Keep as base64 for DOCX (will process later)
          setContent(encodedContent);
          setFileType('docx');
        } else if (isNotebook) {
          // Decode JSON for notebook
          const decoded = decodeBase64Text(encodedContent);
          setContent(decoded);
          setFileType('notebook');
        } else if (isImage) {
          // Keep as base64 for images
          setContent(encodedContent);
          setFileType('image');
          // Determine MIME type from extension
          const mimeMap: Record<string, string> = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'svg': 'image/svg+xml',
            'webp': 'image/webp',
            'bmp': 'image/bmp',
            'ico': 'image/x-icon'
          };
          setImageMimeType(mimeMap[ext || ''] || 'image/png');
        } else {
          // Decode text content
          const decoded = decodeBase64Text(encodedContent);
          setContent(decoded);
          
          if (isMarkdown) {
            setFileType('markdown');
          } else if (ext === 'html' || ext === 'htm') {
            setFileType('html');
          } else if (isAsciiDoc) {
            setFileType('asciidoc');
          } else if (isJson) {
            setFileType('json');
          } else if (isYaml) {
            setFileType('yaml');
          } else if (isRst || isLatex) {
            // LaTeX shown as formatted text (full rendering too complex)
            setFileType('text');
          } else {
            setFileType('text');
          }
        }
        
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });

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
            <AIMarkdown content={content} basePath={filePath} />
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
      
      case 'image':
        return (
          <div className="preview-image">
            <img
              src={`data:${imageMimeType};base64,${content}`}
              alt={filePath}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </div>
        );
      
      case 'pdf':
        return (
          <div className="preview-pdf">
            <iframe
              src={`data:application/pdf;base64,${content}`}
              title="PDF Preview"
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        );
      
      case 'docx':
        return <DocxRenderer base64Content={content} />;
      
      case 'notebook':
        return (
          <div className="preview-notebook">
            <NotebookRenderer content={content} />
          </div>
        );
      
      case 'asciidoc':
        try {
          const asciidoctor = Asciidoctor();
          const html = asciidoctor.convert(content, { safe: 'safe' });
          return (
            <div className="preview-asciidoc">
              <div dangerouslySetInnerHTML={{ __html: String(html) }} />
            </div>
          );
        } catch (err) {
          return (
            <div className="preview-error">
              Error rendering AsciiDoc: {String(err)}
              <pre>{content}</pre>
            </div>
          );
        }
      
      case 'json':
        try {
          const jsonData = JSON.parse(content);
          return (
            <div className="preview-json">
              <JsonView
                value={jsonData}
                collapsed={2}
                displayDataTypes={false}
                displayObjectSize={true}
                style={{
                  '--w-rjv-font-family': 'Monaco, Menlo, Courier New, monospace',
                  '--w-rjv-font-size': '13px',
                  '--w-rjv-line-height': '1.6',
                  '--w-rjv-color': '#d4d4d4',
                  '--w-rjv-background-color': '#1e1e1e',
                  '--w-rjv-key-string': '#9cdcfe',
                  '--w-rjv-type-string-color': '#ce9178',
                  '--w-rjv-type-int-color': '#b5cea8',
                  '--w-rjv-type-float-color': '#b5cea8',
                  '--w-rjv-type-bigint-color': '#b5cea8',
                  '--w-rjv-type-boolean-color': '#569cd6',
                  '--w-rjv-type-date-color': '#dcdcaa',
                  '--w-rjv-type-url-color': '#3794ff',
                  '--w-rjv-type-null-color': '#808080',
                  '--w-rjv-type-nan-color': '#808080',
                  '--w-rjv-type-undefined-color': '#808080',
                  '--w-rjv-bracket-color': '#ffd700',
                  '--w-rjv-arrow-color': '#d4d4d4',
                  '--w-rjv-edit-color': '#00a0e9',
                  '--w-rjv-info-color': '#9cdcfe',
                  '--w-rjv-copied-color': '#4ec9b0',
                } as React.CSSProperties}
              />
            </div>
          );
        } catch (err) {
          return (
            <div className="preview-error">
              Error parsing JSON: {String(err)}
              <pre>{content}</pre>
            </div>
          );
        }
      
      case 'yaml':
        try {
          const yamlData = yaml.load(content) as object;
          return (
            <div className="preview-yaml">
              <JsonView
                value={yamlData}
                collapsed={2}
                displayDataTypes={false}
                displayObjectSize={true}
                style={{
                  '--w-rjv-font-family': 'Monaco, Menlo, Courier New, monospace',
                  '--w-rjv-font-size': '13px',
                  '--w-rjv-line-height': '1.6',
                  '--w-rjv-color': '#d4d4d4',
                  '--w-rjv-background-color': '#1e1e1e',
                  '--w-rjv-key-string': '#9cdcfe',
                  '--w-rjv-type-string-color': '#ce9178',
                  '--w-rjv-type-int-color': '#b5cea8',
                  '--w-rjv-type-float-color': '#b5cea8',
                  '--w-rjv-type-bigint-color': '#b5cea8',
                  '--w-rjv-type-boolean-color': '#569cd6',
                  '--w-rjv-type-date-color': '#dcdcaa',
                  '--w-rjv-type-url-color': '#3794ff',
                  '--w-rjv-type-null-color': '#808080',
                  '--w-rjv-type-nan-color': '#808080',
                  '--w-rjv-type-undefined-color': '#808080',
                  '--w-rjv-bracket-color': '#ffd700',
                  '--w-rjv-arrow-color': '#d4d4d4',
                  '--w-rjv-edit-color': '#00a0e9',
                  '--w-rjv-info-color': '#9cdcfe',
                  '--w-rjv-copied-color': '#4ec9b0',
                } as React.CSSProperties}
              />
            </div>
          );
        } catch (err) {
          return (
            <div className="preview-error">
              Error parsing YAML: {String(err)}
              <pre>{content}</pre>
            </div>
          );
        }
      
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
