import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { convertFileSrc } from '@tauri-apps/api/core';
import 'katex/dist/katex.min.css';

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
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
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
            <div className="ai-panel-code-block">
              <div className="ai-panel-code-header">
                <span className="ai-panel-code-lang">{language}</span>
                <div className="ai-panel-code-actions">
                  <button className="ai-panel-code-copy" onClick={() => handleCopyCode(raw)}>
                    Copy
                  </button>
                  <button
                    className="ai-panel-code-run"
                    onClick={() => onRunCommand?.(raw)}
                  >
                    Run
                  </button>
                </div>
              </div>
              <pre>
                <code>{raw}</code>
              </pre>
            </div>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
