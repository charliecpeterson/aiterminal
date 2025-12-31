import type { IDecoration, IDisposable, IMarker, Terminal as XTermTerminal } from '@xterm/xterm';
import type { ContextItem } from '../../context/AIContext';
import type { PendingFileCaptureRef } from '../core/fileCapture';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

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

export interface MarkerManagerParams {
  term: XTermTerminal;
  maxMarkers: number;
  foldThreshold: number;
  foldEnabled: boolean;
  setCopyMenu: (value: CopyMenuState | null) => void;
  getRangeText: (range: [number, number]) => string;
  addContextItem: AddContextItem;
  pendingFileCaptureRef: PendingFileCaptureRef;
  onCommandStart?: () => void;  // Called when command execution starts
  onCommandEnd?: () => void;    // Called when command execution ends
}

interface MarkerMeta {
  outputStartMarker?: IMarker;
  isBootstrap?: boolean;
  exitCode?: number;
  streamingOutput?: boolean;
  foldDecoration?: IDecoration;
  foldExpanded?: boolean;
  startTime?: number;  // When command started (ms timestamp)
  endTime?: number;    // When command finished (ms timestamp)
  duration?: number;   // Duration in ms
}

function computeEndLine(term: XTermTerminal, markers: IDecoration[], marker: IDecoration): number {
  let endLine = term.buffer.active.length - 1;
  const index = markers.indexOf(marker);
  if (index !== -1 && index < markers.length - 1) {
    endLine = markers[index + 1].marker.line - 1;
  }
  return endLine;
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
  const hasOutput =
    outputStartLine !== null && outputStartLine > startLine && outputStartLine <= endLine;
  const safeOutputStart = hasOutput ? Math.max(outputStartLine, startLine + 1) : startLine + 1;
  const cmdEnd = Math.max(startLine, (hasOutput ? safeOutputStart : startLine + 1) - 1);

  const isBootstrapMarker = Boolean(meta?.isBootstrap);

  return {
    commandRange: [startLine, cmdEnd],
    outputRange: hasOutput ? [safeOutputStart, Math.max(safeOutputStart, endLine)] : null,
    disabled: isBootstrapMarker,
    outputDisabled: !hasOutput || isBootstrapMarker,
  };
}

export interface MarkerManager {
  captureLast: (count: number) => void;
  cleanup: () => void;
  attachTerminalClickHandler: () => () => void;
}

export function createMarkerManager({
  term,
  maxMarkers,
  foldThreshold,
  foldEnabled,
  setCopyMenu,
  getRangeText,
  addContextItem,
  pendingFileCaptureRef,
  onCommandStart,
  onCommandEnd,
}: MarkerManagerParams): MarkerManager {
  let currentMarker: IDecoration | null = null;
  const markers: IDecoration[] = [];
  const markerMeta = new WeakMap<IDecoration, MarkerMeta>();
  let hasSeenFirstCommand = false; // Track if we've seen at least one complete command
  let currentHighlight: IDecoration | null = null;

  let currentOutputButton: HTMLDivElement | null = null;

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
        if (currentOutputButton) {
          currentOutputButton.remove();
          currentOutputButton = null;
        }
        return;
      }

      // Highlight the command block
      highlightCommandBlock(marker);

      // Show output button if there's output
      const meta = markerMeta.get(marker);
      const startLine = marker.marker.line;
      const endLine = computeEndLine(term, markers, marker);
      const outputStartLine = meta?.outputStartMarker?.line ?? null;
      const hasOutput = outputStartLine !== null && outputStartLine > startLine && outputStartLine <= endLine;
      
      if (hasOutput) {
        const safeOutputStart = Math.max(outputStartLine, startLine + 1);
        const outputLineCount = Math.max(safeOutputStart, endLine) - safeOutputStart + 1;
        showOutputButton(marker, safeOutputStart, Math.max(safeOutputStart, endLine), outputLineCount);
      }
    };

    term.element?.addEventListener('click', handleClick);

    return () => {
      term.element?.removeEventListener('click', handleClick);
      if (currentHighlight) {
        currentHighlight.dispose();
        currentHighlight = null;
      }
      if (currentOutputButton) {
        currentOutputButton.remove();
        currentOutputButton = null;
      }
    };
  };

  const showOutputButton = (marker: IDecoration, startLine: number, endLine: number, lineCount: number) => {
    // Remove existing button
    if (currentOutputButton) {
      currentOutputButton.remove();
      currentOutputButton = null;
    }

    // Create floating button
    const button = document.createElement('div');
    button.className = 'output-actions-button';
    button.innerHTML = `
      <div class="output-actions-info">
        <span class="output-lines-count">${lineCount} lines</span>
      </div>
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
    
    console.log('[Fold] Opening output window with', lineCount, 'lines');
    console.log('[Fold] Content preview:', content.substring(0, 500));
    
    // Copy to clipboard
    navigator.clipboard.writeText(content).then(() => {
      console.log('[Fold] Output copied to clipboard!');
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
        console.log('[Fold] Output window created');
      });

      outputWindow.once('tauri://error', (event) => {
        console.error('[Fold] Failed to create output window:', event);
      });
    } catch (err) {
      console.error('[Fold] Error opening window:', err);
    }
  };

  const createFoldDecoration = (
    marker: IDecoration,
    startLine: number,
    endLine: number,
    lineCount: number
  ): IDecoration | null => {
    const meta = markerMeta.get(marker);
    if (!meta || meta.foldDecoration) return null;

    console.log('[Fold] Creating decoration at buffer lines:', { startLine, endLine, lineCount, baseY: term.buffer.active.baseY, cursorY: term.buffer.active.cursorY });

    // Place notification after first 5 lines of output
    // This shows a preview of the output before the notification
    const previewLines = 5;
    const currentCursorLine = term.buffer.active.cursorY + term.buffer.active.baseY;
    const notificationTargetLine = startLine + previewLines;
    const offset = notificationTargetLine - currentCursorLine;
    
    console.log('[Fold] Marker placement:', { 
      startLine, 
      currentCursorLine, 
      notificationTargetLine, 
      offset,
      previewLines 
    });
    
    const notificationMarker = term.registerMarker(offset);
    if (!notificationMarker) {
      console.log('[Fold] Failed to create notification marker');
      return null;
    }

    const decoration = term.registerDecoration({
      marker: notificationMarker,
      x: 0,
      width: term.cols,
      height: 1,
      layer: 'top',
    });

    if (!decoration) {
      console.log('[Fold] Failed to create decoration');
      notificationMarker.dispose();
      return null;
    }
    
    console.log('[Fold] Decoration created successfully', { 
      notificationMarkerLine: notificationMarker.line,
      commandMarkerLine: marker.marker.line,
      termCols: term.cols,
      height: 1,
      decorationElement: decoration.element 
    });

    decoration.onRender((element: HTMLElement) => {
      element.className = 'fold-overlay';
      element.style.height = '36px';
      element.style.minHeight = '36px';
      
      // Get preview lines
      const previewLines = getRangeText([startLine, Math.min(startLine + 2, endLine)])
        .split('\n')
        .slice(0, 3)
        .join(' ')
        .substring(0, 60);

      element.innerHTML = `
        <div class="fold-summary">
          <span class="fold-icon">💡</span>
          <span class="fold-info">
            Large output: <span class="fold-count">${lineCount}</span> lines
          </span>
          ${previewLines ? `<span class="fold-preview">${previewLines}...</span>` : ''}
          <button class="fold-view-window">View in Window</button>
        </div>
      `;

      // Add click handler for "View in Window" button
      const viewButton = element.querySelector('.fold-view-window');
      viewButton?.addEventListener('click', (e) => {
        e.stopPropagation();
        openOutputWindow(startLine, endLine, lineCount);
      });
    });

    decoration.onDispose(() => {
      notificationMarker.dispose();
    });

    meta.foldDecoration = decoration;
    meta.foldExpanded = false;
    markerMeta.set(marker, meta);

    return decoration;
  };

  const removeMarker = (marker: IDecoration) => {
    const index = markers.indexOf(marker);
    if (index !== -1) markers.splice(index, 1);

    const meta = markerMeta.get(marker);
    meta?.outputStartMarker?.dispose();
    markerMeta.delete(marker);
  };

  const setupMarkerElement = (marker: IDecoration, element: HTMLElement, exitCode?: number) => {
    element.classList.add('terminal-marker');
    element.style.cursor = 'pointer';
    element.title = 'Click for options';

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

      if (type === 'A') {
        // Prompt Start - Create Marker
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
          // Only mark as bootstrap if we haven't seen any commands yet AND it's in the first few lines
          const isBootstrap = !hasSeenFirstCommand && marker.marker.line < 10;
          markerMeta.set(marker, { isBootstrap });
          
          if (isBootstrap) {
            console.log('[Fold] Marking as bootstrap marker at line', marker.marker.line);
          }

          if (markers.length > maxMarkers) {
            const oldest = markers[0];
            removeMarker(oldest);
            oldest.dispose();
          }
        }
      } else if (type === 'C') {
        // Command Output Start
        if (!currentMarker) {
          const marker = term.registerDecoration({
            marker: term.registerMarker(-1),
            x: 0,
            width: 1,
            height: 1,
          });

          if (marker) {
            marker.onRender((element) => setupMarkerElement(marker, element));
            marker.onDispose(() => removeMarker(marker));
            currentMarker = marker;
            markers.push(marker);
            const isBootstrap = !hasSeenFirstCommand && marker.marker.line < 10;
            markerMeta.set(marker, { isBootstrap });
            
            if (isBootstrap) {
              console.log('[Fold] Marking as bootstrap marker at line', marker.marker.line);
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
          if (!meta.outputStartMarker) {
            meta.outputStartMarker = term.registerMarker(0);
            meta.streamingOutput = true; // Mark as streaming
            meta.startTime = Date.now(); // Record start time
            markerMeta.set(currentMarker, meta);
            
            // Notify that command started
            onCommandStart?.();
          }
        }
      } else if (type === 'D') {
        // Command Finished
        const parsed = Number.parseInt(parts[1] || '0', 10);
        const exitCode = Number.isFinite(parsed) ? parsed : 0;
        
        // Mark that we've seen at least one complete command
        hasSeenFirstCommand = true;
        
        if (currentMarker) {
          const marker = currentMarker;
          
          // Store exitCode and timing in metadata
          const meta = markerMeta.get(marker) || {};
          meta.exitCode = exitCode;
          meta.endTime = Date.now();
          if (meta.startTime) {
            meta.duration = meta.endTime - meta.startTime;
          }
          markerMeta.set(marker, meta);
          
          marker.onRender((element: HTMLElement) => setupMarkerElement(marker, element, exitCode));
          if (marker.element) {
            setupMarkerElement(marker, marker.element, exitCode);
          }

          if (pendingFileCaptureRef.current) {
            const { path, maxBytes } = pendingFileCaptureRef.current;
            const startLine = marker.marker.line;
            const endLine = computeEndLine(term, markers, marker);
            const meta = markerMeta.get(marker);
            const outputStartLine = meta?.outputStartMarker?.line ?? null;
            const hasOutput =
              outputStartLine !== null && outputStartLine > startLine && outputStartLine <= endLine;
            if (hasOutput) {
              const safeOutputStart = Math.max(outputStartLine, startLine + 1);
              const outputText = getRangeText([
                safeOutputStart,
                Math.max(safeOutputStart, endLine),
              ]).trim();
              if (outputText) {
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
                });
              }
            }
            pendingFileCaptureRef.current = null;
          }

          // Mark output as complete (no automatic notification)
          if (meta) {
            meta.streamingOutput = false;
            
            // Notify that command ended
            onCommandEnd?.();
          }

          currentMarker = null;
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
      const hasOutput = outputStartLine !== null && outputStartLine > startLine && outputStartLine <= endLine;
      const safeOutputStart = hasOutput ? Math.max(outputStartLine, startLine + 1) : startLine + 1;
      const cmdEnd = Math.max(startLine, (hasOutput ? safeOutputStart : startLine + 1) - 1);

      const commandText = getRangeText([startLine, cmdEnd]).trim();
      const outputText = hasOutput
        ? getRangeText([safeOutputStart, Math.max(safeOutputStart, endLine)]).trim()
        : '';

      if (!commandText && !outputText) return;

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
        });
      } else if (commandText) {
        addContextItem({
          id: crypto.randomUUID(),
          type: 'command',
          content: commandText,
          timestamp: Date.now() + index,
        });
      }
    });
  };

  const cleanup = () => {
    osc133.dispose();
  };

  return { captureLast, cleanup, attachTerminalClickHandler };
}
