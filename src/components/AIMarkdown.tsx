import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { convertFileSrc } from '@tauri-apps/api/core';
import 'katex/dist/katex.min.css';
import { createLogger } from '../utils/logger';
import { aiPanelStyles, getCodeButtonStyle } from './AIPanel.styles';
import { useState } from 'react';

const log = createLogger('AIMarkdown');

function CodeBlock(props: {
  language: string;
  code: string;
  onCopy: () => void;
  onRun?: () => void;
}) {
  const { language, code, onCopy, onRun } = props;
  const [copyHover, setCopyHover] = useState(false);
  const [runHover, setRunHover] = useState(false);

  return (
    <div style={aiPanelStyles.codeBlock}>
      <div style={aiPanelStyles.codeHeader}>
        <span style={aiPanelStyles.codeLang}>{language}</span>
        <div style={aiPanelStyles.codeActions}>
          <button
            style={getCodeButtonStyle(copyHover)}
            onMouseEnter={() => setCopyHover(true)}
            onMouseLeave={() => setCopyHover(false)}
            onClick={onCopy}
          >
            Copy
          </button>
          {onRun && (
            <button
              style={getCodeButtonStyle(runHover)}
              onMouseEnter={() => setRunHover(true)}
              onMouseLeave={() => setRunHover(false)}
              onClick={onRun}
            >
              Run
            </button>
          )}
        </div>
      </div>
      <pre style={aiPanelStyles.codePre}>
        <code style={aiPanelStyles.codeContent}>{code}</code>
      </pre>
    </div>
  );
}


export function AIMarkdown(props: {
  content: string;
  onRunCommand?: (command: string) => void;
  basePath?: string;
}) {
  const { content, onRunCommand, basePath } = props;

  const handleCopyCode = async (code: string) => {
    try {
      await writeText(code);
    } catch (err) {
      log.error('Failed to copy code', err);
    }
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => (
          <p style={aiPanelStyles.markdownParagraph}>{children}</p>
        ),
        h1: ({ children }) => (
          <h1 style={aiPanelStyles.markdownHeading}>{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 style={aiPanelStyles.markdownHeading}>{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 style={aiPanelStyles.markdownHeading}>{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 style={aiPanelStyles.markdownHeading}>{children}</h4>
        ),
        h5: ({ children }) => (
          <h5 style={aiPanelStyles.markdownHeading}>{children}</h5>
        ),
        h6: ({ children }) => (
          <h6 style={aiPanelStyles.markdownHeading}>{children}</h6>
        ),
        ul: ({ children }) => (
          <ul style={aiPanelStyles.markdownList}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol style={aiPanelStyles.markdownList}>{children}</ol>
        ),
        li: ({ children }) => (
          <li style={aiPanelStyles.markdownListItem}>{children}</li>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        img: ({ src, alt }) => {
          if (!src) {
            return null;
          }

          const isExternal = /^(https?:|data:|blob:|file:)/i.test(src);
          if (isExternal) {
            return <img src={src} alt={alt || ''} />;
          }

          const base = basePath || '';
          const hasSeparator = base.includes('/') || base.includes('\\');
          const isAbsolute = base.startsWith('/') || /^[A-Za-z]:[\\/]/.test(base);
          if (!hasSeparator || !isAbsolute) {
            return <img src={src} alt={alt || ''} />;
          }

          const baseDir = base.replace(/[/\\][^/\\]*$/, '');
          const combined = `${baseDir}/${src}`.replace(/\\/g, '/');
          return <img src={convertFileSrc(combined)} alt={alt || ''} />;
        },
        code: ({ className, children }) => {
          const raw = String(children).replace(/\n$/, '');
          const language = className?.replace('language-', '');
          if (!language) {
            return <code>{raw}</code>;
          }
          return (
            <CodeBlock
              language={language}
              code={raw}
              onCopy={() => handleCopyCode(raw)}
              onRun={onRunCommand ? () => onRunCommand(raw) : undefined}
            />
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
