import type { IDecoration, IDisposable, IMarker, Terminal as XTermTerminal } from '@xterm/xterm';
import type { ContextItem } from '../../context/AIContext';
import type { PendingFileCaptureRef } from '../core/fileCapture';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import {
  computeEndLineForMarkers,
  computeOutputInfo,
  computeRangesForMarkers,
} from '../../utils/markerRanges';

export interface CopyMenuState {
  x: number;
  y: number;
  commandRange: [number, number];
  outputRange: [number, number] | null;
  disabled?: boolean;
  outputDisabled?: boolean;
  exitCode?: number;
  commandText?: string;
  outputText?: string;
  duration?: number;  // Command duration in ms
}

export type AddContextItem = (item: ContextItem) => void;
export type AddContextItemWithScan = (content: string, type: import('../../context/AIContext').ContextType, metadata?: ContextItem['metadata']) => Promise<void>;

export interface MarkerManagerParams {
  term: XTermTerminal;
  maxMarkers: number;
  foldThreshold: number;
  foldEnabled: boolean;
  setCopyMenu: (value: CopyMenuState | null) => void;
  getRangeText: (range: [number, number]) => string;
  addContextItem: AddContextItem;
  addContextItemWithScan?: AddContextItemWithScan;
  pendingFileCaptureRef: PendingFileCaptureRef;
  onCommandStart?: () => void;  // Called when command execution starts
  onCommandEnd?: (exitCode?: number) => void;    // Called when command execution ends
  onPythonREPL?: (enabled: boolean) => void;  // Called when Python REPL starts/stops
  onMarkersChanged?: () => void; // Called when marker list/meta changes
}

interface MarkerMeta {
  outputStartMarker?: IMarker;
  doneMarker?: IMarker;
  isBootstrap?: boolean;
  isPythonREPL?: boolean;  // Marker is inside Python REPL
  isRREPL?: boolean; // Marker is inside R REPL
  pythonCommandId?: string;
  exitCode?: number;
  streamingOutput?: boolean;
  foldDecoration?: IDecoration;
  foldExpanded?: boolean;
  startTime?: number;  // When command started (ms timestamp)
  endTime?: number;    // When command finished (ms timestamp)
  duration?: number;   // Duration in ms
}


function computeEndLine(term: XTermTerminal, markers: IDecoration[], marker: IDecoration): number {
  const startLine = marker.marker.line;
  const meta = (marker as any)?._aiterm_meta as MarkerMeta | undefined;
  let doneLine = meta?.doneMarker?.line ?? undefined;

  // Python REPL nuance: our OSC 133;D often arrives *before* Python prints the next ">>>" prompt.
  // In that case, `doneMarker` lands on the last output line, but `computeEndLineForMarkers`
  // subtracts 1 (to exclude the prompt), which incorrectly drops that last output line and can
  // make the UI think there is "no output".
  if (meta?.isPythonREPL && doneLine != null && doneLine >= 0) {
    try {
      const lineText = term.buffer.active
        .getLine(doneLine)
        ?.translateToString(true) // trim right
        ?.trimStart();
      const looksLikePythonPrompt =
        typeof lineText === 'string' && (lineText.startsWith('>>>') || lineText.startsWith('...'));
      if (!looksLikePythonPrompt) {
        doneLine = doneLine + 1;
      }
    } catch {
      // ignore
    }
  }
  return computeEndLineForMarkers({
    startLine,
    bufferLength: term.buffer.active.length,
    markers: markers.map((item) => item.marker.line),
    doneLine,
    isPythonREPL: meta?.isPythonREPL,
    isRREPL: meta?.isRREPL,
  });
}

function computeRanges(
  term: XTermTerminal,
  markers: IDecoration[],
  markerMeta: WeakMap<IDecoration, MarkerMeta>,
  marker: IDecoration
): { commandRange: [number, number]; outputRange: [number, number] | null; disabled: boolean; outputDisabled: boolean } {
  const startLine = marker.marker.line;
  const endLine = computeEndLine(term, markers, marker);

  const meta = markerMeta.get(marker);
  const outputStartLine = meta?.outputStartMarker?.line ?? null;
  const isBootstrapMarker = Boolean(meta?.isBootstrap);

  return computeRangesForMarkers({
    startLine,
    endLine,
    outputStartLine,
    isBootstrap: isBootstrapMarker,
  });
}

export interface MarkerManager {
  captureLast: (count: number) => void;
  cleanup: () => void;
  attachTerminalClickHandler: () => () => void;
  getMarkerTicks: () => Array<{ line: number; classes: string[]; title?: string }>;
  getCommandHistory: () => Array<{
    line: number;
    command: string;
    exitCode?: number;
    timestamp: number;
    hasOutput: boolean;
  }>;
  jumpToLine: (line: number) => void;
  copyCommandAtLine: (line: number) => void;
  addCommandToContext: (line: number) => void;
  setPythonREPL: (enabled: boolean) => void;  // Control Python REPL marker styling
  setRREPL: (enabled: boolean) => void; // Control R REPL marker behavior
  handlePromptDetected: () => void;
  noteUserCommandIssued: () => void;
}

export function createMarkerManager({
  term,
  maxMarkers,
  foldThreshold: _foldThreshold,
  foldEnabled: _foldEnabled,
  setCopyMenu,
  getRangeText,
  addContextItem,
  addContextItemWithScan,
  pendingFileCaptureRef,
  onCommandStart,
  onCommandEnd,
  onPythonREPL,
  onMarkersChanged,
}: MarkerManagerParams): MarkerManager {
  let currentMarker: IDecoration | null = null;
  const markers: IDecoration[] = [];
  const markerMeta = new WeakMap<IDecoration, MarkerMeta>();
  const markerElement = new WeakMap<IDecoration, HTMLElement>();
  let hasSeenFirstCommand = false; // Track if we've seen at least one complete command
  let currentHighlight: IDecoration | null = null;
  let currentHighlightMarker: IMarker | null = null;
  let currentHighlightedMarker: IDecoration | null = null;
  let currentHighlightVisibleStart: number | null = null;
  let currentHighlightHeight: number | null = null;
  let isPythonREPL = false; // Track if we're currently inside a Python REPL
  let isRREPL = false; // Track if we're currently inside an R REPL
  let rOuterMarker: IDecoration | null = null; // Shell marker for the long-running `R` command
  let pendingStartTime: number | null = null;
  let commandRunning = false;
  
  // Allow external control of Python REPL state
  const setPythonREPL = (enabled: boolean) => {
    isPythonREPL = enabled;
  };

  const setRREPL = (enabled: boolean) => {
    if (enabled === isRREPL) return;

    if (enabled) {
      // Entering R REPL: preserve the in-progress shell marker for `R` so REPL markers
      // don\'t get merged into it.
      if (!rOuterMarker && currentMarker) {
        const meta = markerMeta.get(currentMarker);
        if (meta && meta.exitCode === undefined && !meta.isPythonREPL && !meta.isRREPL) {
          rOuterMarker = currentMarker;
          currentMarker = null;
        }
      }
    } else {
      // Exiting R REPL: restore the shell marker so the eventual shell-side OSC 133;D
      // closes the correct command.
      if (rOuterMarker) {
        const meta = markerMeta.get(rOuterMarker);
        if (meta && meta.exitCode === undefined) {
          currentMarker = rOuterMarker;
        }
        rOuterMarker = null;
      }
    }

    isRREPL = enabled;
  };
  
  // Notify external callback if provided
  if (onPythonREPL) {
    onPythonREPL(isPythonREPL);
  }

  let currentOutputButton: HTMLDivElement | null = null;
  const pythonMarkersById = new Map<string, IDecoration>();

  const notifyMarkersChanged = () => {
    try {
      onMarkersChanged?.();
    } catch {
      // ignore
    }
  };

  const renderMarkerElement = (element: HTMLElement, meta?: MarkerMeta) => {
    element.classList.add('terminal-marker');
    element.style.cursor = 'pointer';

    // Until we have metadata, keep decorations hidden. xterm can call onRender before our
    // markerMeta is set, which otherwise makes the bootstrap marker flash/appear.
    if (!meta) {
      element.style.opacity = '0';
      element.style.pointerEvents = 'none';
      element.title = '';
      element.classList.remove('python', 'r', 'success', 'error');
      delete element.dataset.pyId;
      return;
    }

    if (meta.pythonCommandId) element.dataset.pyId = meta.pythonCommandId;
    else delete element.dataset.pyId;

    // Bootstrap markers are internal; hide them to avoid a stray marker at the top of a fresh session.
    if (meta.isBootstrap) {
      element.style.opacity = '0';
      element.style.pointerEvents = 'none';
      element.title = '';
      element.classList.remove('python', 'r', 'success', 'error');
      return;
    }

    element.style.opacity = '';
    element.style.pointerEvents = '';

    element.title = 'Click for options';

    // Always refresh stateful classes.
    element.classList.remove('python', 'r', 'success', 'error');

    // If multiple decorations end up on the same row, prefer showing errors on top.
    // xterm can transiently stack decorations during prompt-embedded REPL sequences.
    element.style.zIndex = meta.exitCode === undefined ? '15' : meta.exitCode === 0 ? '20' : '30';

    if (meta.isPythonREPL) {
      element.classList.add('python');
      element.title = 'Python REPL command';
    }

    if (meta.isRREPL) {
      element.classList.add('r');
      element.title = 'R REPL command';
    }

    if (meta.exitCode !== undefined) {
      element.classList.add(meta.exitCode === 0 ? 'success' : 'error');
    }
  };

  const finalizeMarker = (marker: IDecoration, exitCode?: number) => {
    const meta = markerMeta.get(marker) || {};

    if (exitCode !== undefined) {
      meta.exitCode = exitCode;
    }
    meta.endTime = Date.now();
    if (meta.startTime) {
      meta.duration = meta.endTime - meta.startTime;
    }

    // Record explicit end position marker to make range computation robust over SSH.
    if (!meta.doneMarker) {
      meta.doneMarker = term.registerMarker(0);
    }

    // Python REPL heuristic: sometimes exit codes can be missed/flattened by prompt-time markers.
    // If the block contains a traceback, treat it as an error.
    if (meta.isPythonREPL && (meta.exitCode === undefined || meta.exitCode === 0) && meta.outputStartMarker) {
      try {
        const startLine = marker.marker.line;
        const endLine = computeEndLine(term, markers, marker);
        const outputStartLine = meta.outputStartMarker.line;
        const outputInfo = computeOutputInfo(startLine, endLine, outputStartLine);
        if (outputInfo.hasOutput) {
          const outputText = getRangeText([outputInfo.safeOutputStart, endLine]);
          if (outputText.includes('Traceback (most recent call last):')) {
            meta.exitCode = 1;
          }
        }
      } catch {
        // ignore
      }
    }

    markerMeta.set(marker, meta);
    (marker as any)._aiterm_meta = meta;

    // Immediately sync DOM classes.
    // NOTE: In some xterm/WebKit paths, `marker.element` can be null or stale even when a
    // decoration is visible. We therefore:
    // 1) update the most recent element we saw for this marker
    // 2) for REPL markers with a pythonCommandId, update all currently-rendered marker elements
    //    that are tagged with that id.
    const el = marker.element ?? markerElement.get(marker);
    if (el) renderMarkerElement(el, meta);

    if (meta.pythonCommandId && term.element) {
      try {
        const nodes = term.element.querySelectorAll(
          `.xterm-decoration-container .terminal-marker[data-py-id="${CSS.escape(meta.pythonCommandId)}"]`
        );
        nodes.forEach((node) => {
          if (node instanceof HTMLElement) renderMarkerElement(node, meta);
        });
      } catch {
        // ignore
      }
    }
    // In some render paths (notably WebKit/Tauri), decoration DOM doesn't always visually update
    // unless the viewport row is repainted. If the marker is currently visible, force a refresh.
    const viewportY = term.buffer.active.viewportY;
    const row = marker.marker.line - viewportY;
    if (row >= 0 && row < term.rows) {
      const refresh = (term as any).refresh as ((start: number, end: number) => void) | undefined;
      if (typeof refresh === 'function') refresh.call(term, row, row);
    }

    if (pendingFileCaptureRef.current) {
      const { path, maxBytes } = pendingFileCaptureRef.current;
      const startLine = marker.marker.line;
      const endLine = computeEndLine(term, markers, marker);
      const outputStartLine = meta?.outputStartMarker?.line ?? null;
      const outputInfo = computeOutputInfo(startLine, endLine, outputStartLine);
      if (outputInfo.hasOutput) {
        const outputText = getRangeText([outputInfo.safeOutputStart, endLine]).trim();
        if (outputText) {
          if (addContextItemWithScan) {
            addContextItemWithScan(outputText, 'file', {
              path,
              truncated: outputText.length >= maxBytes,
              byte_count: outputText.length,
            }).catch(err => {
              console.error('Failed to scan file capture:', err);
              addContextItem({
                id: crypto.randomUUID(),
                type: 'file',
                content: outputText,
                timestamp: Date.now(),
                metadata: {
                  path,
                  truncated: outputText.length >= maxBytes,
                  byte_count: outputText.length,
                },
                hasSecrets: false,
                secretsRedacted: false,
              });
            });
          } else {
            addContextItem({
              id: crypto.randomUUID(),
              type: 'file',
              content: outputText,
              timestamp: Date.now(),
              metadata: {
                path,
                truncated: outputText.length >= maxBytes,
                byte_count: outputText.length,
              },
              hasSecrets: false,
              secretsRedacted: false,
            });
          }
        }
      }
      pendingFileCaptureRef.current = null;
    }

    meta.streamingOutput = false;
    if (commandRunning) {
      commandRunning = false;
      pendingStartTime = null;
      onCommandEnd?.(meta.exitCode);
    }

    if (marker === currentMarker) {
      currentMarker = null;
    }

    if (meta.pythonCommandId) {
      const existing = pythonMarkersById.get(meta.pythonCommandId);
      if (existing === marker) {
        pythonMarkersById.delete(meta.pythonCommandId);
      }
    }

    notifyMarkersChanged();
  };

  const handlePromptDetected = () => {
    if (isPythonREPL || isRREPL) return;
    if (currentMarker) {
      const meta = markerMeta.get(currentMarker);
      if (meta && meta.exitCode === undefined && meta.outputStartMarker) {
        hasSeenFirstCommand = true;
        finalizeMarker(currentMarker, undefined);
        return;
      }
    }
    if (commandRunning) {
      commandRunning = false;
      pendingStartTime = null;
      onCommandEnd?.();
    }
  };

  const noteUserCommandIssued = () => {
    if (commandRunning) return;
    pendingStartTime = Date.now();
    commandRunning = true;
    onCommandStart?.();
  };

  // Find which command block contains a given line
  const findMarkerAtLine = (lineNumber: number): IDecoration | null => {
    for (const marker of markers) {
      const startLine = marker.marker.line;
      const endLine = computeEndLine(term, markers, marker);
      if (lineNumber >= startLine && lineNumber <= endLine) {
        return marker;
      }
    }
    return null;
  };

  const clearHighlight = () => {
    if (currentHighlight) {
      currentHighlight.dispose();
      currentHighlight = null;
    }
    if (currentHighlightMarker) {
      currentHighlightMarker.dispose();
      currentHighlightMarker = null;
    }
    currentHighlightVisibleStart = null;
    currentHighlightHeight = null;
  };

  const computeVisibleHighlight = (marker: IDecoration) => {
    const startLine = marker.marker.line;
    const endLine = computeEndLine(term, markers, marker);

    const viewportStart = term.buffer.active.viewportY;
    const viewportEnd = viewportStart + term.rows - 1;
    const visibleStart = Math.max(startLine, viewportStart);
    const visibleEnd = Math.min(endLine, viewportEnd);
    const height = visibleEnd - visibleStart + 1;

    if (height <= 0) return null;
    return { visibleStart, height };
  };

  const renderHighlightForMarker = (marker: IDecoration) => {
    const visible = computeVisibleHighlight(marker);
    if (!visible) {
      // Keep the selected marker; just don't draw a highlight while it's off-screen.
      clearHighlight();
      return;
    }

    // Avoid thrashing on scroll if nothing changed.
    if (
      currentHighlight &&
      currentHighlightVisibleStart === visible.visibleStart &&
      currentHighlightHeight === visible.height
    ) {
      return;
    }

    clearHighlight();

    // registerMarker() positions relative to the current cursor location.
    // cursorY is relative to baseY (not viewportY), so compute an absolute buffer line via baseY.
    const cursorLine = term.buffer.active.baseY + term.buffer.active.cursorY;
    const highlightMarker = term.registerMarker(visible.visibleStart - cursorLine);
    if (!highlightMarker) return;
    currentHighlightMarker = highlightMarker;

    const highlight = term.registerDecoration({
      marker: highlightMarker,
      x: 0,
      width: term.cols,
      height: visible.height,
      layer: 'bottom',
    });

    if (!highlight) {
      clearHighlight();
      return;
    }

    highlight.onRender((element: HTMLElement) => {
      element.style.backgroundColor = 'rgba(91, 141, 232, 0.1)';
      element.style.border = '1px solid rgba(91, 141, 232, 0.3)';
      element.style.borderRadius = '4px';
      element.style.pointerEvents = 'none';
    });

    currentHighlight = highlight;
    currentHighlightVisibleStart = visible.visibleStart;
    currentHighlightHeight = visible.height;
  };

  // Highlight a command block
  const highlightCommandBlock = (marker: IDecoration) => {
    if (currentHighlightedMarker === marker) {
      clearHighlight();
      currentHighlightedMarker = null;
      return false;
    }
    currentHighlightedMarker = marker;
    renderHighlightForMarker(marker);
    return true;
  };

  // Terminal click handler
  const attachTerminalClickHandler = () => {
    // Keep highlight anchored to the visible portion while scrolling.
    const viewport = term.element?.querySelector('.xterm-viewport') as HTMLElement | null;
    let rafId: number | null = null;
    let xtermScrollDisposable: IDisposable | null = null;
    let xtermResizeDisposable: IDisposable | null = null;
    const scheduleHighlightRefresh = () => {
      if (!currentHighlightedMarker) return;
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!currentHighlightedMarker) return;
        renderHighlightForMarker(currentHighlightedMarker);
      });
    };

    // Prefer xterm's scroll/resize events (covers keyboard + programmatic scroll).
    xtermScrollDisposable = term.onScroll(() => scheduleHighlightRefresh());
    xtermResizeDisposable = term.onResize(() => scheduleHighlightRefresh());

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Only handle clicks on terminal viewport
      if (!target.closest('.xterm-viewport') && !target.closest('.xterm-screen')) {
        return;
      }

      // Get click position relative to terminal
      const terminalElement = term.element;
      if (!terminalElement) return;

      const rect = terminalElement.getBoundingClientRect();
      const y = e.clientY - rect.top;
      
      // Estimate line number from Y position
      const cellHeight = term.element!.querySelector('.xterm-rows')?.firstElementChild?.getBoundingClientRect().height || 17;
      const clickedLine = Math.floor(y / cellHeight) + term.buffer.active.viewportY;
      
      // Find marker at this line
      const marker = findMarkerAtLine(clickedLine);
      if (!marker) {
        // Clicked outside any command block - remove highlight and button
        clearHighlight();
        currentHighlightedMarker = null;
        if (currentOutputButton) {
          currentOutputButton.remove();
          currentOutputButton = null;
        }
        return;
      }

      // Check if this is a completed command (has exitCode)
      const meta = markerMeta.get(marker);
      if (!meta || meta.exitCode === undefined) {
        // This is the current/pending command (gray marker) - don't highlight
        clearHighlight();
        currentHighlightedMarker = null;
        if (currentOutputButton) {
          currentOutputButton.remove();
          currentOutputButton = null;
        }
        return;
      }

      // Highlight the command block
      const didHighlight = highlightCommandBlock(marker);
      if (!didHighlight) {
        if (currentOutputButton) {
          currentOutputButton.remove();
          currentOutputButton = null;
        }
        return;
      }

      // Ensure highlight is consistent with the current viewport.
      scheduleHighlightRefresh();

      // Show output button if there's output
      const startLine = marker.marker.line;
      const endLine = computeEndLine(term, markers, marker);
      const outputStartLine = meta?.outputStartMarker?.line ?? null;
      const outputInfo = computeOutputInfo(startLine, endLine, outputStartLine);

      if (outputInfo.hasOutput) {
        const outputLineCount = endLine - outputInfo.safeOutputStart + 1;
        showOutputButton(marker, outputInfo.safeOutputStart, endLine, outputLineCount);
      }
    };

    term.element?.addEventListener('click', handleClick);
    viewport?.addEventListener('scroll', scheduleHighlightRefresh);
    window.addEventListener('resize', scheduleHighlightRefresh);

    return () => {
      term.element?.removeEventListener('click', handleClick);
      viewport?.removeEventListener('scroll', scheduleHighlightRefresh);
      window.removeEventListener('resize', scheduleHighlightRefresh);
      xtermScrollDisposable?.dispose();
      xtermScrollDisposable = null;
      xtermResizeDisposable?.dispose();
      xtermResizeDisposable = null;
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      clearHighlight();
      currentHighlightedMarker = null;
      if (currentOutputButton) {
        currentOutputButton.remove();
        currentOutputButton = null;
      }
    };
  };

  const showOutputButton = (_marker: IDecoration, startLine: number, endLine: number, lineCount: number) => {
    // Remove existing button
    if (currentOutputButton) {
      currentOutputButton.remove();
      currentOutputButton = null;
    }

    // Create floating button
    const button = document.createElement('div');
    button.className = 'output-actions-button';
    button.innerHTML = `
      <button class="output-view-window">View in Window</button>
      <button class="output-copy-clipboard">Copy to Clipboard</button>
    `;

    // Position in top-right corner of terminal
    button.style.position = 'fixed';
    button.style.top = '80px';
    button.style.right = '20px';
    button.style.zIndex = '1000';

    // Add to body
    document.body.appendChild(button);
    currentOutputButton = button;

    // Handle button click
    const viewBtn = button.querySelector('.output-view-window');
    viewBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      openOutputWindow(startLine, endLine, lineCount);
      button.remove();
      currentOutputButton = null;
    });

    const copyBtn = button.querySelector('.output-copy-clipboard');
    copyBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const content = getRangeText([startLine, endLine]);
      navigator.clipboard.writeText(content).catch((err) => {
        console.error('[Fold] Failed to copy:', err);
      });
      button.remove();
      currentOutputButton = null;
    });

    // Remove on outside click
    const removeButton = (e: MouseEvent) => {
      if (!button.contains(e.target as Node)) {
        button.remove();
        currentOutputButton = null;
        document.removeEventListener('mousedown', removeButton);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', removeButton), 100);
  };

  const openOutputWindow = async (startLine: number, endLine: number, lineCount: number) => {
    // Get the output content
    const content = getRangeText([startLine, endLine]);
    
    
    // Copy to clipboard
    navigator.clipboard.writeText(content).then(() => {
    }).catch(err => {
      console.error('[Fold] Failed to copy:', err);
    });
    
    // Open a new window with the content passed via URL
    // Use base64 encoding to avoid URL length limits and special characters
    try {
      const contentBase64 = btoa(encodeURIComponent(content));
      const label = `output-viewer-${Date.now()}`;
      const outputWindow = new WebviewWindow(label, {
        url: `#/output-viewer?lines=${lineCount}&content=${contentBase64}`,
        title: `Output (${lineCount} lines)`,
        width: 800,
        height: 600,
        center: true,
        resizable: true,
        decorations: true,
      });

      outputWindow.once('tauri://created', () => {
      });

      outputWindow.once('tauri://error', (event) => {
        console.error('[Fold] Failed to create output window:', event);
      });
    } catch (err) {
      console.error('[Fold] Error opening window:', err);
    }
  };

  const removeMarker = (marker: IDecoration) => {
    const index = markers.indexOf(marker);
    if (index !== -1) markers.splice(index, 1);

    const meta = markerMeta.get(marker);
    meta?.outputStartMarker?.dispose();
    meta?.doneMarker?.dispose();

    if (meta?.pythonCommandId) {
      const existing = pythonMarkersById.get(meta.pythonCommandId);
      if (existing === marker) {
        pythonMarkersById.delete(meta.pythonCommandId);
      }
    }

    markerMeta.delete(marker);
    try {
      delete (marker as any)._aiterm_meta;
    } catch {
      // ignore
    }

    notifyMarkersChanged();
  };

  const setupMarkerElement = (marker: IDecoration, element: HTMLElement) => {
    markerElement.set(marker, element);
    const meta = markerMeta.get(marker);
    renderMarkerElement(element, meta);

    // Prevent duplicate listeners if onRender is called multiple times.
    if (element.dataset.listenerAttached) {
      return;
    }
    element.dataset.listenerAttached = 'true';

    element.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const { commandRange, outputRange, disabled, outputDisabled } = computeRanges(
        term,
        markers,
        markerMeta,
        marker
      );

      // Capture text for quick actions
      const commandText = getRangeText(commandRange);
      const outputText = outputRange ? getRangeText(outputRange) : undefined;
      
      // Get metadata from marker
      const meta = markerMeta.get(marker);
      const storedExitCode = meta?.exitCode;
      const duration = meta?.duration;

      const rect = element.getBoundingClientRect();
      setCopyMenu({
        x: rect.right + 8,
        y: rect.top - 4,
        commandRange,
        outputRange,
        disabled,
        outputDisabled,
        exitCode: storedExitCode,
        commandText,
        outputText,
        duration,
      });
    });
  };

  const osc133 = term.parser.registerOscHandler(133, (data) => {
    try {
      const parts = data.split(';');
      const type = parts[0];

      const pythonIdPart = parts.find((p) => p.startsWith('py='));
      const pythonCommandId = pythonIdPart ? pythonIdPart.substring('py='.length) : undefined;

      // R REPL uses the same prompt-time marker style as Python: A marks prompt, D marks completion.

      if (type === 'A') {
        // Prompt Start - Create Marker
        if (!isPythonREPL && !isRREPL && currentMarker) {
          const meta = markerMeta.get(currentMarker);
          if (meta && meta.exitCode === undefined && meta.outputStartMarker) {
            hasSeenFirstCommand = true;
            finalizeMarker(currentMarker, undefined);
          }
        }

        // In Python REPL mode, prefer id-based association.
        if (pythonCommandId) {
          const existing = pythonMarkersById.get(pythonCommandId);
          if (existing) {
            const meta = markerMeta.get(existing) || {};
            meta.isPythonREPL = isPythonREPL;
            meta.isRREPL = isRREPL;
            meta.pythonCommandId = pythonCommandId;
            pythonMarkersById.set(pythonCommandId, existing);

            if ((isPythonREPL || isRREPL) && !meta.outputStartMarker) {
              meta.outputStartMarker = term.registerMarker(0);
              meta.streamingOutput = true;
              if (pendingStartTime) {
                meta.startTime = pendingStartTime;
                pendingStartTime = null;
              }
            }

            markerMeta.set(existing, meta);
            (existing as any)._aiterm_meta = meta;
            const existingEl = (existing as any).element ?? markerElement.get(existing);
            if (existingEl) renderMarkerElement(existingEl, meta);
            currentMarker = existing;
            return true;
          }
        }

        // If we already have an in-progress marker (common when OSC 133;C arrives first over SSH),
        // reuse it instead of creating a duplicate marker on the same line.
        if (currentMarker) {
          // If we\'re in R REPL mode and we\'ve preserved the outer shell marker (the long-running `R` command),
          // don\'t reuse it as the REPL marker.
          if (isRREPL && rOuterMarker && currentMarker === rOuterMarker) {
            // fall through to create a new marker
          } else {
            const existingMeta = markerMeta.get(currentMarker);
            if (existingMeta && existingMeta.exitCode === undefined) {
              // In REPL mode, only reuse a marker if it already matches the prompt's command id.
              // This avoids "stealing" the outer shell marker or a different REPL command when OSC
              // sequences arrive out of order.
              if ((isPythonREPL || isRREPL) && pythonCommandId) {
                if (existingMeta.pythonCommandId !== pythonCommandId) {
                  // fall through to create a new marker
                } else {
                  existingMeta.isPythonREPL = isPythonREPL;
                  existingMeta.isRREPL = isRREPL;
                  if ((isPythonREPL || isRREPL) && !existingMeta.outputStartMarker) {
                    existingMeta.outputStartMarker = term.registerMarker(0);
                    existingMeta.streamingOutput = true;
                    if (pendingStartTime) {
                      existingMeta.startTime = pendingStartTime;
                      pendingStartTime = null;
                    }
                  }

                  markerMeta.set(currentMarker, existingMeta);
                  return true;
                }
              } else {
                if (
                  pythonCommandId &&
                  existingMeta.pythonCommandId &&
                  existingMeta.pythonCommandId !== pythonCommandId
                ) {
                  // Don't reuse a marker from a different Python command id.
                } else {
                  existingMeta.isPythonREPL = isPythonREPL;
                  existingMeta.isRREPL = isRREPL;
                  if (pythonCommandId) {
                    existingMeta.pythonCommandId = pythonCommandId;
                    pythonMarkersById.set(pythonCommandId, currentMarker);
                  }

                  if ((isPythonREPL || isRREPL) && !existingMeta.outputStartMarker) {
                    existingMeta.outputStartMarker = term.registerMarker(0);
                    existingMeta.streamingOutput = true;
                    if (pendingStartTime) {
                      existingMeta.startTime = pendingStartTime;
                      pendingStartTime = null;
                    }
                  }

                  markerMeta.set(currentMarker, existingMeta);
                  return true;
                }
              }
            }
          }
        }

        const marker = term.registerDecoration({
          marker: term.registerMarker(0),
          x: 0,
          width: 1,
          height: 1,
        });

        if (marker) {
          marker.onRender((element) => setupMarkerElement(marker, element));
          marker.onDispose(() => removeMarker(marker));
          currentMarker = marker;
          markers.push(marker);
          notifyMarkersChanged();
          // Only mark as bootstrap if we haven't seen any commands yet AND it's in the first few lines.
          // Never treat REPL markers as bootstrap; otherwise the first prompt marker gets hidden.
          const isBootstrap =
            !hasSeenFirstCommand &&
            !isPythonREPL &&
            !isRREPL &&
            marker.marker.line >= 0 &&
            marker.marker.line < 10;
          const meta: MarkerMeta = { isBootstrap, isPythonREPL, isRREPL };
          if (pythonCommandId) {
            meta.pythonCommandId = pythonCommandId;
            pythonMarkersById.set(pythonCommandId, marker);
          }

          // In the Python REPL we intentionally "trick" OSC 133 by emitting markers at prompt-render time.
          // Over SSH, OSC 133;C can be unreliable or arrive in unexpected order, so we treat A as the
          // start of the command/output block as well.
          if (isPythonREPL || isRREPL) {
            meta.outputStartMarker = term.registerMarker(0);
            meta.streamingOutput = true;
            if (pendingStartTime) {
              meta.startTime = pendingStartTime;
              pendingStartTime = null;
            }
          }

          markerMeta.set(marker, meta);
          (marker as any)._aiterm_meta = meta;
          
          if (isBootstrap) {
          }

          if (markers.length > maxMarkers) {
            const oldest = markers[0];
            removeMarker(oldest);
            oldest.dispose();
          }
        }
      } else if (type === 'B') {
        // Prompt End - use as a fallback command end over SSH when D is missing
        if (!isPythonREPL && !isRREPL && currentMarker) {
          const meta = markerMeta.get(currentMarker);
          if (meta && meta.exitCode === undefined && meta.outputStartMarker) {
            hasSeenFirstCommand = true;
            finalizeMarker(currentMarker, undefined);
          }
        }
      } else if (type === 'C') {
        // Command Output Start
        // If we already have a marker for this Python command id, use it.
        if (pythonCommandId) {
          const existing = pythonMarkersById.get(pythonCommandId);
          if (existing) {
            currentMarker = existing;
          }
        }

        if (!currentMarker) {
          const marker = term.registerDecoration({
            marker: term.registerMarker(0),
            x: 0,
            width: 1,
            height: 1,
          });

          if (marker) {
            marker.onRender((element) => setupMarkerElement(marker, element));
            marker.onDispose(() => removeMarker(marker));
            currentMarker = marker;
            markers.push(marker);
            notifyMarkersChanged();
            const isBootstrap =
              !hasSeenFirstCommand &&
              !isPythonREPL &&
              !isRREPL &&
              marker.marker.line >= 0 &&
              marker.marker.line < 10;
            const meta: MarkerMeta = { isBootstrap, isPythonREPL, isRREPL };
            if (pythonCommandId) {
              meta.pythonCommandId = pythonCommandId;
              pythonMarkersById.set(pythonCommandId, marker);
            }
            markerMeta.set(marker, meta);
            (marker as any)._aiterm_meta = meta;
            const markerEl = (marker as any).element ?? markerElement.get(marker);
            if (markerEl) renderMarkerElement(markerEl, meta);
            
            if (isBootstrap) {
            }

            if (markers.length > maxMarkers) {
              const oldest = markers[0];
              removeMarker(oldest);
              oldest.dispose();
            }
          }
        }

        if (currentMarker) {
          const meta = markerMeta.get(currentMarker) || {};
          // If the initial prompt created a hidden bootstrap marker, the first real command
          // should convert it into a normal marker.
          if (meta.isBootstrap) {
            meta.isBootstrap = false;
          }
          if (pythonCommandId && !meta.pythonCommandId) {
            meta.pythonCommandId = pythonCommandId;
            pythonMarkersById.set(pythonCommandId, currentMarker);
          }
          if (!meta.outputStartMarker) {
            meta.outputStartMarker = term.registerMarker(0);
            meta.streamingOutput = true; // Mark as streaming
            if (pendingStartTime) {
              meta.startTime = pendingStartTime; // Record start time
              pendingStartTime = null;
            }
            markerMeta.set(currentMarker, meta);
            (currentMarker as any)._aiterm_meta = meta;
            const cmEl = (currentMarker as any).element ?? markerElement.get(currentMarker);
            if (cmEl) renderMarkerElement(cmEl, meta);
          }
        }
      } else if (type === 'D') {
        // Command Finished
        const parsed = Number.parseInt(parts[1] || '0', 10);
        const exitCode = Number.isFinite(parsed) ? parsed : 0;
        
        // Mark that we've seen at least one complete command
        hasSeenFirstCommand = true;
        
        let markerToClose: IDecoration | undefined = undefined;

        if (pythonCommandId) {
          markerToClose = pythonMarkersById.get(pythonCommandId);

          // In REPL mode, never fall back to an unrelated currentMarker; only close if ids match.
          if (!markerToClose && (isPythonREPL || isRREPL) && currentMarker) {
            const currentMeta = markerMeta.get(currentMarker);
            if (currentMeta?.pythonCommandId === pythonCommandId) {
              markerToClose = currentMarker;
            }
          }
        } else {
          markerToClose = currentMarker ?? undefined;
        }

        if (markerToClose) {
          const marker = markerToClose;
          finalizeMarker(marker, exitCode);
        }
      }
    } catch (e) {
      // Keep behavior consistent: report and continue
      // eslint-disable-next-line no-console
      console.error('Error handling OSC 133:', e);
    }

    return true;
  }) as unknown as IDisposable;

  const captureLast = (count: number) => {
    const safeCount = Math.max(1, Math.min(50, count || 1));
    if (markers.length === 0) return;

    const eligibleMarkers = markers.filter((marker) => {
      const meta = markerMeta.get(marker);
      return Boolean(meta?.outputStartMarker);
    });

    const slice = eligibleMarkers.slice(-safeCount);

    slice.forEach((marker, index) => {
      const startLine = marker.marker.line;
      let endLine = term.buffer.active.length - 1;
      const markerIndex = eligibleMarkers.indexOf(marker);
      if (markerIndex !== -1 && markerIndex < eligibleMarkers.length - 1) {
        endLine = eligibleMarkers[markerIndex + 1].marker.line - 1;
      }

      const meta = markerMeta.get(marker);
      const outputStartLine = meta?.outputStartMarker?.line ?? null;
      const outputInfo = computeOutputInfo(startLine, endLine, outputStartLine);
      const cmdEnd = Math.max(
        startLine,
        (outputInfo.hasOutput ? outputInfo.safeOutputStart : startLine + 1) - 1
      );

      const commandText = getRangeText([startLine, cmdEnd]).trim();
      const outputText = outputInfo.hasOutput
        ? getRangeText([outputInfo.safeOutputStart, endLine]).trim()
        : '';

      if (!commandText && !outputText) return;

      const content = outputText || commandText;
      const type = outputText ? 'command_output' : 'command';
      const metadata = outputText ? {
        command: commandText || undefined,
        output: outputText,
      } : undefined;

      if (addContextItemWithScan) {
        addContextItemWithScan(content, type as any, metadata).catch(err => {
          console.error('Failed to scan context in captureLast:', err);
          // Fallback to direct add
          if (outputText) {
            addContextItem({
              id: crypto.randomUUID(),
              type: 'command_output',
              content: outputText,
              timestamp: Date.now() + index,
              metadata: {
                command: commandText || undefined,
                output: outputText,
              },
              hasSecrets: false,
              secretsRedacted: false,
            });
          } else if (commandText) {
            addContextItem({
              id: crypto.randomUUID(),
              type: 'command',
              content: commandText,
              timestamp: Date.now() + index,
              hasSecrets: false,
              secretsRedacted: false,
            });
          }
        });
      } else {
        if (outputText) {
          addContextItem({
            id: crypto.randomUUID(),
            type: 'command_output',
            content: outputText,
            timestamp: Date.now() + index,
            metadata: {
              command: commandText || undefined,
              output: outputText,
            },
            hasSecrets: false,
            secretsRedacted: false,
          });
        } else if (commandText) {
          addContextItem({
            id: crypto.randomUUID(),
            type: 'command',
            content: commandText,
            timestamp: Date.now() + index,
            hasSecrets: false,
            secretsRedacted: false,
          });
        }
      }
    });
  };

  const cleanup = () => {
    osc133.dispose();
  };

  const getCommandHistory = () => {
    return markers.map((marker) => {
      const { commandRange, outputRange } = computeRanges(term, markers, markerMeta, marker);
      const commandText = getRangeText(commandRange);
      const meta = markerMeta.get(marker);
      
      return {
        line: marker.marker.line,
        command: commandText.trim(),
        exitCode: meta?.exitCode,
        timestamp: meta?.startTime || Date.now(),
        hasOutput: outputRange !== null,
      };
    }).filter(item => item.command.length > 0);
  };

  const jumpToLine = (line: number) => {
    term.scrollToLine(line);
  };

  const copyCommandAtLine = (line: number) => {
    const marker = markers.find(m => m.marker.line === line);
    if (!marker) return;
    
    const { commandRange, outputRange } = computeRanges(term, markers, markerMeta, marker);
    const commandText = getRangeText(commandRange);
    const outputText = outputRange ? getRangeText(outputRange) : '';
    
    const fullText = outputText ? `${commandText}\n${outputText}` : commandText;
    navigator.clipboard.writeText(fullText);
  };

  const addCommandToContext = (line: number) => {
    const marker = markers.find(m => m.marker.line === line);
    if (!marker) return;
    
    const { commandRange, outputRange } = computeRanges(term, markers, markerMeta, marker);
    const commandText = getRangeText(commandRange).trim();
    const outputText = outputRange ? getRangeText(outputRange).trim() : '';
    
    if (!commandText && !outputText) return;
    
    const content = outputText || commandText;
    const type = outputText ? 'command_output' : 'command';
    const metadata = outputText ? {
      command: commandText || undefined,
      output: outputText,
    } : undefined;

    if (addContextItemWithScan) {
      addContextItemWithScan(content, type as any, metadata).catch(err => {
        console.error('Failed to scan context in addCommandToContext:', err);
        // Fallback
        if (outputText) {
          addContextItem({
            id: crypto.randomUUID(),
            type: 'command_output',
            content: outputText,
            timestamp: Date.now(),
            metadata: {
              command: commandText || undefined,
              output: outputText,
            },
            hasSecrets: false,
            secretsRedacted: false,
          });
        } else if (commandText) {
          addContextItem({
            id: crypto.randomUUID(),
            type: 'command',
            content: commandText,
            timestamp: Date.now(),
            hasSecrets: false,
            secretsRedacted: false,
          });
        }
      });
    } else {
      if (outputText) {
        addContextItem({
          id: crypto.randomUUID(),
          type: 'command_output',
          content: outputText,
          timestamp: Date.now(),
          metadata: {
            command: commandText || undefined,
            output: outputText,
          },
          hasSecrets: false,
          secretsRedacted: false,
        });
      } else if (commandText) {
        addContextItem({
          id: crypto.randomUUID(),
          type: 'command',
          content: commandText,
          timestamp: Date.now(),
          hasSecrets: false,
          secretsRedacted: false,
        });
      }
    }
  };

  const getMarkerTicks = () => {
    return markers
      .map((marker) => {
        const line = marker.marker.line;
        const meta = markerMeta.get(marker);
        if (!Number.isFinite(line) || line < 0) return null;
        if (meta?.isBootstrap) return null;

        const classes: string[] = [];
        if (meta?.isPythonREPL) classes.push('python');
        if (meta?.isRREPL) classes.push('r');

        if (meta?.exitCode !== undefined) {
          classes.push(meta.exitCode === 0 ? 'success' : 'error');
        }

        return { line, classes };
      })
      .filter((tick): tick is { line: number; classes: string[] } => Boolean(tick));
  };

  return { 
    captureLast, 
    cleanup, 
    attachTerminalClickHandler,
    getMarkerTicks,
    getCommandHistory,
    jumpToLine,
    copyCommandAtLine,
    addCommandToContext,
    setPythonREPL,  // Export function to control Python REPL state
    setRREPL,
    handlePromptDetected,
    noteUserCommandIssued,
  };
}
