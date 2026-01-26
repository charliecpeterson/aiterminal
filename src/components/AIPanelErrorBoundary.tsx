import React from "react";
import { ErrorBoundary } from "./ErrorBoundary";

interface AIPanelErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
}

/**
 * Specialized error boundary for AIPanel component.
 * Provides AI-specific error recovery options.
 */
export function AIPanelErrorBoundary({
  children,
  onReset,
}: AIPanelErrorBoundaryProps) {
  return (
    <ErrorBoundary
      name="AI Panel"
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
              AI Panel Error
            </h2>
            <p style={{ margin: "0 0 20px 0", color: "#888" }}>
              The AI panel encountered an error. Your conversation history may be preserved.
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
                Error Details
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
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
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
                Reload AI Panel
              </button>
            </div>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
