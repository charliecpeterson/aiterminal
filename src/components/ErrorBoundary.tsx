import React, { Component, ReactNode } from "react";
import { createLogger } from "../utils/logger";

const log = createLogger("ErrorBoundary");

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, errorInfo: React.ErrorInfo, reset: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  name?: string;
  isolate?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary component to catch and handle React errors gracefully.
 * 
 * Usage:
 * ```tsx
 * <ErrorBoundary name="Terminal">
 *   <Terminal />
 * </ErrorBoundary>
 * ```
 * 
 * With custom fallback:
 * ```tsx
 * <ErrorBoundary
 *   name="AIPanel"
 *   fallback={(error, errorInfo, reset) => (
 *     <div>Custom error UI with reset button</div>
 *   )}
 * >
 *   <AIPanel />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const { name = "Unknown", onError } = this.props;
    
    // Log the error
    log.error(`Error caught in ${name}:`, {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    // Update state with error info
    this.setState({
      errorInfo,
    });

    // Call custom error handler if provided
    if (onError) {
      try {
        onError(error, errorInfo);
      } catch (handlerError) {
        log.error(`Error in onError handler for ${name}:`, handlerError);
      }
    }
  }

  reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, name = "Component", isolate = false } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (fallback && errorInfo) {
        return fallback(error, errorInfo, this.reset);
      }

      // Default fallback UI
      return (
        <div
          style={{
            padding: "20px",
            margin: isolate ? "10px" : "0",
            border: "1px solid #ff6b6b",
            borderRadius: "4px",
            backgroundColor: "#2a2a2a",
            color: "#fff",
          }}
        >
          <h3 style={{ margin: "0 0 10px 0", color: "#ff6b6b" }}>
            {name} Error
          </h3>
          <p style={{ margin: "0 0 10px 0", fontSize: "14px" }}>
            Something went wrong in the {name} component.
          </p>
          <details style={{ marginBottom: "10px" }}>
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
                backgroundColor: "#1a1a1a",
                borderRadius: "4px",
                fontSize: "12px",
                overflow: "auto",
                maxHeight: "200px",
              }}
            >
              {error.message}
              {"\n\n"}
              {error.stack}
            </pre>
          </details>
          <button
            onClick={this.reset}
            style={{
              padding: "8px 16px",
              backgroundColor: "#007acc",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
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
        </div>
      );
    }

    return children;
  }
}
