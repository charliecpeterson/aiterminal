import React from "react";
import { ErrorBoundary } from "./ErrorBoundary";

interface TerminalErrorBoundaryProps {
  children: React.ReactNode;
  terminalId: number;
  onReset?: () => void;
}

/**
 * Specialized error boundary for Terminal components.
 * Provides terminal-specific error recovery options.
 */
export function TerminalErrorBoundary({
  children,
  terminalId,
  onReset,
}: TerminalErrorBoundaryProps) {
  return (
    <ErrorBoundary
      name={`Terminal (ID: ${terminalId})`}
      isolate
      fallback={(error, _errorInfo, reset) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            padding: "20px",
            backgroundColor: "#1a1a1a",
            color: "#fff",
          }}
        >
          <div
            style={{
              maxWidth: "500px",
              textAlign: "center",
            }}
          >
            <h2 style={{ margin: "0 0 10px 0", color: "#ff6b6b" }}>
              Terminal Error
            </h2>
            <p style={{ margin: "0 0 20px 0", color: "#888" }}>
              The terminal encountered an error and needs to be restarted.
            </p>
            <details style={{ marginBottom: "20px", textAlign: "left" }}>
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: "14px",
                  color: "#888",
                  userSelect: "none",
                }}
              >
                Technical Details
              </summary>
              <pre
                style={{
                  marginTop: "10px",
                  padding: "10px",
                  backgroundColor: "#0a0a0a",
                  borderRadius: "4px",
                  fontSize: "12px",
                  overflow: "auto",
                  maxHeight: "150px",
                }}
              >
                {error.message}
                {"\n\n"}
                {error.stack}
              </pre>
            </details>
            <button
              onClick={() => {
                reset();
                onReset?.();
              }}
              style={{
                padding: "10px 20px",
                backgroundColor: "#007acc",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "bold",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#005a9e";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#007acc";
              }}
            >
              Restart Terminal
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
