import React from 'react';
import { AIMarkdown } from './AIMarkdown';
import './NotebookRenderer.css';

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
        <div key={index} className="notebook-output notebook-output-stream">
          <pre>{arrayToString(output.text || '')}</pre>
        </div>
      );
    }

    if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
      if (output.data) {
        // Handle images
        if (output.data['image/png']) {
          return (
            <div key={index} className="notebook-output notebook-output-image">
              <img src={`data:image/png;base64,${output.data['image/png']}`} alt="Output" />
            </div>
          );
        }
        if (output.data['image/jpeg']) {
          return (
            <div key={index} className="notebook-output notebook-output-image">
              <img src={`data:image/jpeg;base64,${output.data['image/jpeg']}`} alt="Output" />
            </div>
          );
        }
        if (output.data['image/svg+xml']) {
          const svg = arrayToString(output.data['image/svg+xml']);
          return (
            <div key={index} className="notebook-output notebook-output-image">
              <div dangerouslySetInnerHTML={{ __html: svg }} />
            </div>
          );
        }
        // Handle HTML
        if (output.data['text/html']) {
          const html = arrayToString(output.data['text/html']);
          return (
            <div key={index} className="notebook-output notebook-output-html">
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          );
        }
        // Handle plain text
        if (output.data['text/plain']) {
          return (
            <div key={index} className="notebook-output notebook-output-text">
              <pre>{arrayToString(output.data['text/plain'])}</pre>
            </div>
          );
        }
      }
    }

    if (output.output_type === 'error') {
      return (
        <div key={index} className="notebook-output notebook-output-error">
          <div className="notebook-error-name">{output.ename}: {output.evalue}</div>
          {output.traceback && (
            <pre>{output.traceback.join('\n')}</pre>
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
        <div key={index} className="notebook-cell notebook-cell-markdown">
          <AIMarkdown content={source} />
        </div>
      );
    }

    if (cell.cell_type === 'code') {
      return (
        <div key={index} className="notebook-cell notebook-cell-code">
          <div className="notebook-cell-input">
            <div className="notebook-cell-prompt">
              {cell.execution_count !== null && cell.execution_count !== undefined 
                ? `[${cell.execution_count}]` 
                : '[ ]'}
            </div>
            <div className="notebook-cell-source">
              <pre><code>{source}</code></pre>
            </div>
          </div>
          {cell.outputs && cell.outputs.length > 0 && (
            <div className="notebook-cell-outputs">
              {cell.outputs.map((output, i) => renderOutput(output, i))}
            </div>
          )}
        </div>
      );
    }

    if (cell.cell_type === 'raw') {
      return (
        <div key={index} className="notebook-cell notebook-cell-raw">
          <pre>{source}</pre>
        </div>
      );
    }

    return null;
  };

  if (error) {
    return <div className="notebook-error">{error}</div>;
  }

  if (!notebook) {
    return <div className="notebook-loading">Loading notebook...</div>;
  }

  return (
    <div className="notebook-renderer">
      <div className="notebook-cells">
        {notebook.cells.map((cell, index) => renderCell(cell, index))}
      </div>
    </div>
  );
};
