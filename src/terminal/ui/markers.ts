import type { IDecoration, IDisposable, IMarker, Terminal as XTermTerminal } from '@xterm/xterm';
import type { ContextItem } from '../../context/AIContext';
import type { PendingFileCaptureRef } from '../core/fileCapture';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import {
  computeEndLineForMarkers,
  computeOutputInfo,
  computeRangesForMarkers,
} from '../../utils/markerRanges';

declare global {
  interface Window {
    __aiterm_dumpMarkers?: () => void;
  }
}

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


function isMarkerDebugEnabled(): boolean {
  try {
    return window.localStorage.getItem('AITERM_DEBUG_MARKERS') === '1';
  } catch {
    return false;
  }
}

function debugLog(...args: unknown[]) {
  if (!isMarkerDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log('[Markers][DEBUG]', ...args);
}

function computeEndLine(term: XTermTerminal, markers: IDecoration[], marker: IDecoration): number {
  const startLine = marker.marker.line;
  const meta = (marker as any)?._aiterm_meta as MarkerMeta | undefined;
  return computeEndLineForMarkers({
    startLine,
    bufferLength: term.buffer.active.length,
    markers: markers.map((item) => item.marker.line),
    doneLine: meta?.doneMarker?.line ?? undefined,
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
}: MarkerManagerParams): MarkerManager {
  let currentMarker: IDecoration | null = null;
  const markers: IDecoration[] = [];
  const markerMeta = new WeakMap<IDecoration, MarkerMeta>();
  let hasSeenFirstCommand = false; // Track if we've seen at least one complete command
  let currentHighlight: IDecoration | null = null;
  let currentHighlightedMarker: IDecoration | null = null;
  let isPythonREPL = false; // Track if we're currently inside a Python REPL
  let isRREPL = false; // Track if we're currently inside an R REPL
  let rOuterMarker: IDecoration | null = null; // Shell marker for the long-running `R` command
  let pendingStartTime: number | null = null;
  let commandRunning = false;
  
  // Allow external control of Python REPL state
  const setPythonREPL = (enabled: boolean) => {
    debugLog('setPythonREPL:', enabled, 'was:', isPythonREPL);
    isPythonREPL = enabled;
    
    debugLog('pythonModeNow=', isPythonREPL);
  };

  const setRREPL = (enabled: boolean) => {
    debugLog('setRREPL:', enabled, 'was:', isRREPL);
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
    debugLog('rModeNow=', isRREPL, 'outerMarkerLine=', rOuterMarker?.marker.line);
  };
  
  // Notify external callback if provided
  if (onPythonREPL) {
    onPythonREPL(isPythonREPL);
  }

  let currentOutputButton: HTMLDivElement | null = null;
  const pythonMarkersById = new Map<string, IDecoration>();

  const dumpMarkers = () => {
    try {
      const rows = markers.slice(-25).map((marker) => {
        const startLine = marker.marker.line;
        const endLine = computeEndLine(term, markers, marker);
        const meta = markerMeta.get(marker);
        const outputStartLine = meta?.outputStartMarker?.line ?? null;
        const outputInfo = computeOutputInfo(startLine, endLine, outputStartLine);
        return {
          startLine,
          endLine,
          outputStartLine,
          hasOutput: outputInfo.hasOutput,
          python: Boolean(meta?.isPythonREPL),
          r: Boolean(meta?.isRREPL),
          py: meta?.pythonCommandId,
          doneLine: meta?.doneMarker?.line,
          bootstrap: Boolean(meta?.isBootstrap),
          exitCode: meta?.exitCode,
        };
      });
      // eslint-disable-next-line no-console
      console.table(rows);
      // eslint-disable-next-line no-console
      debugLog('currentMarkerLine=', currentMarker?.marker.line, 'pythonMode=', isPythonREPL, 'rMode=', isRREPL);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[Markers][DEBUG] dump failed:', e);
    }
  };

  const finalizeMarker = (marker: IDecoration, exitCode?: number, reason?: string) => {
    const meta = markerMeta.get(marker) || {};

    if (reason) {
      debugLog('Finalizing marker', {
        line: marker.marker.line,
        reason,
        exitCode,
        hasOutputStart: Boolean(meta.outputStartMarker),
        isPythonREPL: meta.isPythonREPL,
        isRREPL: meta.isRREPL,
      });
    }

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

    markerMeta.set(marker, meta);
    (marker as any)._aiterm_meta = meta;

    marker.onRender((element: HTMLElement) => setupMarkerElement(marker, element, exitCode));
    if (marker.element) {
      setupMarkerElement(marker, marker.element, exitCode);
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
  };

  const handlePromptDetected = () => {
    if (isPythonREPL || isRREPL) return;
    if (currentMarker) {
      const meta = markerMeta.get(currentMarker);
      if (meta && meta.exitCode === undefined && meta.outputStartMarker) {
        hasSeenFirstCommand = true;
        debugLog('Prompt detected with open marker', { line: currentMarker.marker.line });
        finalizeMarker(currentMarker, undefined, 'prompt-detected');
        return;
      }
    }
    if (commandRunning) {
      debugLog('Prompt detected -> command end (no open marker)');
      commandRunning = false;
      pendingStartTime = null;
      onCommandEnd?.();
    }
  };

  const noteUserCommandIssued = () => {
    if (commandRunning) return;
    pendingStartTime = Date.now();
    commandRunning = true;
    debugLog('User command issued -> start timer', { at: pendingStartTime });
    onCommandStart?.();
  };

  if (isMarkerDebugEnabled()) {
    window.__aiterm_dumpMarkers = dumpMarkers;
    debugLog('Debug enabled. Use window.__aiterm_dumpMarkers() after reproducing.');
  }

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

  // Highlight a command block
  const highlightCommandBlock = (marker: IDecoration) => {
    if (currentHighlightedMarker === marker) {
      if (currentHighlight) {
        currentHighlight.dispose();
        currentHighlight = null;
      }
      currentHighlightedMarker = null;
      return false;
    }

    // Remove previous highlight
    if (currentHighlight) {
      currentHighlight.dispose();
      currentHighlight = null;
    }

    const startLine = marker.marker.line;
    const endLine = computeEndLine(term, markers, marker);
    const height = endLine - startLine + 1;

    // Create highlight decoration
    const highlight = term.registerDecoration({
      marker: marker.marker,
      x: 0,
      width: term.cols,
      height: height,
      layer: 'bottom',
    });

    if (!highlight) return;

    highlight.onRender((element: HTMLElement) => {
      element.style.backgroundColor = 'rgba(91, 141, 232, 0.1)';
      element.style.border = '1px solid rgba(91, 141, 232, 0.3)';
      element.style.borderRadius = '4px';
      element.style.pointerEvents = 'none';
    });

    currentHighlight = highlight;
    currentHighlightedMarker = marker;
    return true;
  };

  // Terminal click handler
  const attachTerminalClickHandler = () => {
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
        if (currentHighlight) {
          currentHighlight.dispose();
          currentHighlight = null;
        }
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
        if (currentHighlight) {
          currentHighlight.dispose();
          currentHighlight = null;
        }
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

    return () => {
      term.element?.removeEventListener('click', handleClick);
      if (currentHighlight) {
        currentHighlight.dispose();
        currentHighlight = null;
      }
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
  };

  const setupMarkerElement = (marker: IDecoration, element: HTMLElement, exitCode?: number) => {
    element.classList.add('terminal-marker');
    element.style.cursor = 'pointer';
    element.title = 'Click for options';

    // Add Python REPL class if applicable
    const meta = markerMeta.get(marker);

    // Bootstrap markers are internal; hide them to avoid a stray marker at the top of a fresh session.
    if (meta?.isBootstrap) {
      element.style.opacity = '0';
      element.style.pointerEvents = 'none';
      element.title = '';
      return;
    }

    if (meta?.isPythonREPL) {
      element.classList.add('python');
      element.title = 'Python REPL command';
      debugLog('Applied .python class to marker at line', marker.marker.line);
    }

    if (meta?.isRREPL) {
      element.classList.add('r');
      element.title = 'R REPL command';
      debugLog('Applied .r class to marker at line', marker.marker.line);
    }

    if (exitCode !== undefined) {
      if (exitCode === 0) element.classList.add('success');
      else element.classList.add('error');
    }

    // Prevent duplicate listeners if onRender is called multiple times
    if (element.dataset.listenerAttached) return;
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

      debugLog(
        'OSC 133 raw=',
        JSON.stringify(data),
        'type=',
        type,
        'pythonMode=',
        isPythonREPL,
        'rMode=',
        isRREPL,
        'currentMarkerLine=',
        currentMarker?.marker.line
      );
      // R REPL uses the same prompt-time marker style as Python: A marks prompt, D marks completion.

      if (type === 'A') {
        // Prompt Start - Create Marker
        debugLog('OSC 133;A');

        if (!isPythonREPL && !isRREPL && currentMarker) {
          const meta = markerMeta.get(currentMarker);
          if (meta && meta.exitCode === undefined && meta.outputStartMarker) {
            hasSeenFirstCommand = true;
            finalizeMarker(currentMarker, undefined, 'osc-133-A-fallback');
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
                debugLog('Command start (osc-133;A repl existing)', { line: existing.marker.line });
                pendingStartTime = null;
              }
            }

            markerMeta.set(existing, meta);
            (existing as any)._aiterm_meta = meta;
            currentMarker = existing;
            return true;
          }
        }

        // If we already have an in-progress marker (common when OSC 133;C arrives first over SSH),
        // reuse it instead of creating a duplicate marker on the same line.
        // reuse it instead of creating a duplicate marker on the same line.
        if (currentMarker) {
          // If we\'re in R REPL mode and we\'ve preserved the outer shell marker (the long-running `R` command),
          // don\'t reuse it as the REPL marker.
          if (isRREPL && rOuterMarker && currentMarker === rOuterMarker) {
            // fall through to create a new marker
          } else {
          const existingMeta = markerMeta.get(currentMarker);
          if (existingMeta && existingMeta.exitCode === undefined) {
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
                debugLog('Command start (osc-133;A repl reuse)', { line: currentMarker.marker.line });
                pendingStartTime = null;
              }
            }

            markerMeta.set(currentMarker, existingMeta);
            return true;
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
              debugLog('Command start (osc-133;A repl new)', { line: marker.marker.line });
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
            finalizeMarker(currentMarker, undefined, 'osc-133-B-fallback');
          }
        }
      } else if (type === 'C') {
        // Command Output Start
        debugLog('OSC 133;C');

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
          if (pythonCommandId && !meta.pythonCommandId) {
            meta.pythonCommandId = pythonCommandId;
            pythonMarkersById.set(pythonCommandId, currentMarker);
          }
          if (!meta.outputStartMarker) {
            meta.outputStartMarker = term.registerMarker(0);
            meta.streamingOutput = true; // Mark as streaming
            if (pendingStartTime) {
              meta.startTime = pendingStartTime; // Record start time
              debugLog('Command start (osc-133;C)', { line: currentMarker.marker.line });
              pendingStartTime = null;
            }
            markerMeta.set(currentMarker, meta);
            (currentMarker as any)._aiterm_meta = meta;
          }
        }
      } else if (type === 'D') {
        // Command Finished
        const parsed = Number.parseInt(parts[1] || '0', 10);
        const exitCode = Number.isFinite(parsed) ? parsed : 0;
        
        debugLog('OSC 133;D exitCode=', exitCode);
        
        // Mark that we've seen at least one complete command
        hasSeenFirstCommand = true;
        
        const markerToClose =
          (pythonCommandId ? pythonMarkersById.get(pythonCommandId) : undefined) ?? currentMarker;

        if (markerToClose) {
          const marker = markerToClose;
          const meta = markerMeta.get(marker) || {};
          debugLog('Marker meta before D update:', {
            line: marker.marker.line,
            isPythonREPL: meta.isPythonREPL,
            isRREPL: meta.isRREPL,
            pythonCommandId: meta.pythonCommandId,
          });

          finalizeMarker(marker, exitCode, 'osc-133-D');
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

  return { 
    captureLast, 
    cleanup, 
    attachTerminalClickHandler,
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
