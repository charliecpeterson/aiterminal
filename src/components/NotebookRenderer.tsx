import React from 'react';
import { AIMarkdown } from './AIMarkdown';
import { sanitizeSVG, sanitizeNotebookHTML } from '../utils/sanitize';
import { notebookStyles } from './NotebookRenderer.styles';

interface NotebookCell {
  cell_type: 'markdown' | 'code' | 'raw';
  source: string | string[];
  outputs?: NotebookOutput[];
  execution_count?: number | null;
}

interface NotebookOutput {
  output_type: string;
  text?: string | string[];
  data?: {
    'text/plain'?: string | string[];
    'text/html'?: string | string[];
    'image/png'?: string;
    'image/jpeg'?: string;
    'image/svg+xml'?: string | string[];
    'application/json'?: any;
  };
  name?: string;
  ename?: string;
  evalue?: string;
  traceback?: string[];
}

interface NotebookData {
  cells: NotebookCell[];
  metadata?: any;
  nbformat?: number;
  nbformat_minor?: number;
}

interface NotebookRendererProps {
  content: string;
}

export const NotebookRenderer: React.FC<NotebookRendererProps> = ({ content }) => {
  const [notebook, setNotebook] = React.useState<NotebookData | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const parsed = JSON.parse(content);
      setNotebook(parsed);
    } catch (err) {
      setError(`Failed to parse notebook: ${err}`);
    }
  }, [content]);

  const arrayToString = (source: string | string[]): string => {
    return Array.isArray(source) ? source.join('') : source;
  };

  const renderOutput = (output: NotebookOutput, index: number) => {
    if (output.output_type === 'stream') {
      return (
        <div key={index} style={{ ...notebookStyles.output }}>
          <pre style={notebookStyles.outputPre}>{arrayToString(output.text || '')}</pre>
        </div>
      );
    }

    if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
      if (output.data) {
        // Handle images
        if (output.data['image/png']) {
          return (
            <div key={index} style={{ ...notebookStyles.output, ...notebookStyles.outputImage }}>
              <img 
                src={`data:image/png;base64,${output.data['image/png']}`} 
                alt="Output"
                style={notebookStyles.outputImageImg}
              />
            </div>
          );
        }
        if (output.data['image/jpeg']) {
          return (
            <div key={index} style={{ ...notebookStyles.output, ...notebookStyles.outputImage }}>
              <img 
                src={`data:image/jpeg;base64,${output.data['image/jpeg']}`} 
                alt="Output"
                style={notebookStyles.outputImageImg}
              />
            </div>
          );
        }
        if (output.data['image/svg+xml']) {
          const svg = arrayToString(output.data['image/svg+xml']);
          const sanitizedSvg = sanitizeSVG(svg);
          return (
            <div key={index} style={{ ...notebookStyles.output, ...notebookStyles.outputImage }}>
              <div dangerouslySetInnerHTML={{ __html: sanitizedSvg }} />
            </div>
          );
        }
        // Handle HTML
        if (output.data['text/html']) {
          const html = arrayToString(output.data['text/html']);
          const sanitizedHtml = sanitizeNotebookHTML(html);
          return (
            <div key={index} style={{ ...notebookStyles.output, ...notebookStyles.outputHtml }}>
              <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
            </div>
          );
        }
        // Handle plain text
        if (output.data['text/plain']) {
          return (
            <div key={index} style={{ ...notebookStyles.output }}>
              <pre style={notebookStyles.outputPre}>{arrayToString(output.data['text/plain'])}</pre>
            </div>
          );
        }
      }
    }

    if (output.output_type === 'error') {
      return (
        <div key={index} style={{ ...notebookStyles.output, ...notebookStyles.outputError }}>
          <div style={notebookStyles.errorName}>{output.ename}: {output.evalue}</div>
          {output.traceback && (
            <pre style={notebookStyles.outputErrorPre}>{output.traceback.join('\n')}</pre>
          )}
        </div>
      );
    }

    return null;
  };

  const renderCell = (cell: NotebookCell, index: number) => {
    const source = arrayToString(cell.source);

    if (cell.cell_type === 'markdown') {
      return (
        <div key={index} style={{ ...notebookStyles.cell, ...notebookStyles.cellMarkdown }}>
          <AIMarkdown content={source} />
        </div>
      );
    }

    if (cell.cell_type === 'code') {
      return (
        <div key={index} style={{ ...notebookStyles.cell, ...notebookStyles.cellCode }}>
          <div style={notebookStyles.cellInput}>
            <div style={notebookStyles.cellPrompt}>
              {cell.execution_count !== null && cell.execution_count !== undefined 
                ? `[${cell.execution_count}]` 
                : '[ ]'}
            </div>
            <div style={notebookStyles.cellSource}>
              <pre style={notebookStyles.cellSourcePre}>
                <code style={notebookStyles.cellSourceCode}>{source}</code>
              </pre>
            </div>
          </div>
          {cell.outputs && cell.outputs.length > 0 && (
            <div style={notebookStyles.cellOutputs}>
              {cell.outputs.map((output, i) => renderOutput(output, i))}
            </div>
          )}
        </div>
      );
    }

    if (cell.cell_type === 'raw') {
      return (
        <div key={index} style={{ ...notebookStyles.cell, ...notebookStyles.cellRaw }}>
          <pre style={notebookStyles.cellRawPre}>{source}</pre>
        </div>
      );
    }

    return null;
  };

  if (error) {
    return <div style={notebookStyles.error}>{error}</div>;
  }

  if (!notebook) {
    return <div style={notebookStyles.loading}>Loading notebook...</div>;
  }

  return (
    <div style={notebookStyles.renderer}>
      <div style={notebookStyles.cells}>
        {notebook.cells.map((cell, index) => renderCell(cell, index))}
      </div>
    </div>
  );
};
