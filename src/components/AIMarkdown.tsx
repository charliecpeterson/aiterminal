import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

export function AIMarkdown(props: {
  content: string;
  onRunCommand?: (command: string) => void;
}) {
  const { content, onRunCommand } = props;

  const handleCopyCode = async (code: string) => {
    try {
      await writeText(code);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
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
