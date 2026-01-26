import React from "react";
import { ErrorBoundary } from "./ErrorBoundary";

interface ContextErrorBoundaryProps {
  children: React.ReactNode;
  contextName: string;
  onReset?: () => void;
  fallbackContent?: React.ReactNode;
}

/**
 * Specialized error boundary for React Context Providers.
 * Prevents context initialization errors from crashing the entire app.
 * 
 * Usage:
 * ```tsx
 * <ContextErrorBoundary contextName="Settings">
 *   <SettingsProvider>
 *     {children}
 *   </SettingsProvider>
 * </ContextErrorBoundary>
 * ```
 */
export function ContextErrorBoundary({
  children,
  contextName,
  onReset,
  fallbackContent,
}: ContextErrorBoundaryProps) {
  return (
    <ErrorBoundary
      name={`${contextName} Context`}
      onError={(error, errorInfo) => {
        // Context errors are critical - log at error level
        console.error(`Critical ${contextName} Context error:`, {
          error: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
        });
      }}
      fallback={(error, _errorInfo, reset) => {
        // If custom fallback content is provided, use it
        if (fallbackContent) {
          return <>{fallbackContent}</>;
        }

        // Otherwise show a context-specific error UI
        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100vh",
              width: "100vw",
              padding: "40px",
              backgroundColor: "#1a1a1a",
              color: "#fff",
              position: "fixed",
              top: 0,
              left: 0,
              zIndex: 9999,
            }}
          >
            <div
              style={{
                maxWidth: "600px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "48px",
                  marginBottom: "20px",
                }}
              >
                ⚠️
              </div>
              <h1
                style={{
                  margin: "0 0 15px 0",
                  fontSize: "24px",
                  color: "#ff6b6b",
                }}
              >
                {contextName} Context Failed
              </h1>
              <p
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "16px",
                  color: "#ccc",
                  lineHeight: "1.6",
                }}
              >
                The {contextName} context failed to initialize. This is a critical error
                that prevents the application from functioning properly.
              </p>
              <p
                style={{
                  margin: "0 0 30px 0",
                  fontSize: "14px",
                  color: "#888",
                }}
              >
                Try restarting the application. If the problem persists, your settings
                may be corrupted.
              </p>
              <details
                style={{
                  marginBottom: "30px",
                  textAlign: "left",
                  backgroundColor: "#0a0a0a",
                  padding: "15px",
                  borderRadius: "4px",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: "14px",
                    color: "#888",
                    userSelect: "none",
                    marginBottom: "10px",
                  }}
                >
                  Technical Details
                </summary>
                <pre
                  style={{
                    margin: "0",
                    padding: "10px",
                    backgroundColor: "#000",
                    borderRadius: "4px",
                    fontSize: "12px",
                    overflow: "auto",
                    maxHeight: "200px",
                    color: "#ff6b6b",
                  }}
                >
                  {error.name}: {error.message}
                  {"\n\n"}
                  {error.stack}
                </pre>
              </details>
              <div style={{ display: "flex", gap: "15px", justifyContent: "center" }}>
                <button
                  onClick={() => {
                    reset();
                    onReset?.();
                  }}
                  style={{
                    padding: "12px 24px",
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
                  Try Again
                </button>
                <button
                  onClick={() => {
                    window.location.reload();
                  }}
                  style={{
                    padding: "12px 24px",
                    backgroundColor: "#444",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "bold",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#555";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#444";
                  }}
                >
                  Reload App
                </button>
              </div>
            </div>
          </div>
        );
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
