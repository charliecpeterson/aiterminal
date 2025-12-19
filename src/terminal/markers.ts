import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { ContextItem } from '../context/AIContext';

type Disposable = { dispose: () => void };

export interface CopyMenuState {
  x: number;
  y: number;
  commandRange: [number, number];
  outputRange: [number, number] | null;
  disabled?: boolean;
  outputDisabled?: boolean;
}

export type AddContextItem = (item: ContextItem) => void;

export interface MarkerManagerParams {
  term: XTermTerminal;
  maxMarkers: number;
  setCopyMenu: (value: CopyMenuState | null) => void;
  getRangeText: (range: [number, number]) => string;
  addContextItem: AddContextItem;
  pendingFileCaptureRef: { current: null | { path: string; maxBytes: number } };
}

interface MarkerMeta {
  outputStartMarker?: { line: number; dispose?: () => void };
  isBootstrap?: boolean;
}

type Decoration = {
  marker: { line: number };
  onRender: (cb: (element: HTMLElement) => void) => void;
  onDispose?: (cb: () => void) => void;
  dispose?: () => void;
};

function computeEndLine(term: XTermTerminal, markers: Decoration[], marker: Decoration): number {
  let endLine = term.buffer.active.length - 1;
  const index = markers.indexOf(marker);
  if (index !== -1 && index < markers.length - 1) {
    endLine = markers[index + 1].marker.line - 1;
  }
  return endLine;
}

function computeRanges(
  term: XTermTerminal,
  markers: Decoration[],
  markerMeta: WeakMap<Decoration, MarkerMeta>,
  marker: Decoration
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
}

export function createMarkerManager({
  term,
  maxMarkers,
  setCopyMenu,
  getRangeText,
  addContextItem,
  pendingFileCaptureRef,
}: MarkerManagerParams): MarkerManager {
  let currentMarker: Decoration | null = null;
  const markers: Decoration[] = [];
  const markerMeta = new WeakMap<Decoration, MarkerMeta>();

  const removeMarker = (marker: Decoration) => {
    const index = markers.indexOf(marker);
    if (index !== -1) markers.splice(index, 1);

    const meta = markerMeta.get(marker);
    meta?.outputStartMarker?.dispose?.();
    markerMeta.delete(marker);
  };

  const setupMarkerElement = (marker: Decoration, element: HTMLElement, exitCode?: number) => {
    element.classList.add('terminal-marker');
    element.style.cursor = 'pointer';
    element.title = 'Click to copy';

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

      const rect = element.getBoundingClientRect();
      setCopyMenu({
        x: rect.right + 8,
        y: rect.top - 4,
        commandRange,
        outputRange,
        disabled,
        outputDisabled,
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
        }) as unknown as Decoration | undefined;

        if (marker) {
          marker.onRender((element) => setupMarkerElement(marker, element));
          marker.onDispose?.(() => removeMarker(marker));
          currentMarker = marker;
          markers.push(marker);
          markerMeta.set(marker, { isBootstrap: marker.marker.line <= 1 });

          if (markers.length > maxMarkers) {
            const oldest = markers[0];
            removeMarker(oldest);
            oldest?.dispose?.();
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
          }) as unknown as Decoration | undefined;

          if (marker) {
            marker.onRender((element) => setupMarkerElement(marker, element));
            marker.onDispose?.(() => removeMarker(marker));
            currentMarker = marker;
            markers.push(marker);
            markerMeta.set(marker, { isBootstrap: marker.marker.line <= 1 });

            if (markers.length > maxMarkers) {
              const oldest = markers[0];
              removeMarker(oldest);
              oldest?.dispose?.();
            }
          }
        }

        if (currentMarker) {
          const meta = markerMeta.get(currentMarker) || {};
          if (!meta.outputStartMarker) {
            meta.outputStartMarker = term.registerMarker(0) as unknown as MarkerMeta['outputStartMarker'];
            markerMeta.set(currentMarker, meta);
          }
        }
      } else if (type === 'D') {
        // Command Finished
        const exitCode = parseInt(parts[1] || '0');
        if (currentMarker) {
          currentMarker.onRender((element: HTMLElement) =>
            setupMarkerElement(currentMarker as Decoration, element, exitCode)
          );

          if (pendingFileCaptureRef.current) {
            const { path, maxBytes } = pendingFileCaptureRef.current;
            const startLine = currentMarker.marker.line;
            const endLine = computeEndLine(term, markers, currentMarker);
            const meta = markerMeta.get(currentMarker);
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

          currentMarker = null;
        }
      }
    } catch (e) {
      // Keep behavior consistent: report and continue
      // eslint-disable-next-line no-console
      console.error('Error handling OSC 133:', e);
    }

    return true;
  }) as unknown as Disposable;

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

  return { captureLast, cleanup };
}
