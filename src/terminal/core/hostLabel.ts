import type { Terminal as XTermTerminal } from '@xterm/xterm';

type Disposable = { dispose: () => void };

export interface HostLabelHandle {
  cleanup: () => void;
}

export function attachHostLabelOsc(
  term: XTermTerminal,
  setHostLabel: (label: string) => void,
  onPythonREPL?: (enabled: boolean) => void,
  onRREPL?: (enabled: boolean) => void,
  onPrompt?: () => void
): HostLabelHandle {
  const debugEnabled = (() => {
    try {
      return window.localStorage.getItem('AITERM_DEBUG_MARKERS') === '1';
    } catch {
      return false;
    }
  })();

  // Handle OSC 633;H;hostname (custom format)
  const disposable633 = term.parser.registerOscHandler(633, (data) => {
    try {
      const parts = data.split(';');
      if (parts[0] === 'H' && parts[1]) {
        setHostLabel(parts.slice(1).join(';'));
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error handling OSC 633:', e);
    }
    return true;
  }) as unknown as Disposable;

  // Handle OSC 1337;RemoteHost=user@host:ip;Depth=N (iTerm2 format from shell integration)
  const disposable1337 = term.parser.registerOscHandler(1337, (data) => {
    if (debugEnabled) {
      // eslint-disable-next-line no-console
      console.log('[HostLabel][DEBUG] OSC 1337 RAW:', JSON.stringify(data));
    }
    try {
      // Format: RemoteHost=user@host or RemoteHost=user@host:ip;Depth=N or RemoteHost=;Depth=0 (for local)
      if (data.startsWith('RemoteHost=')) {
        const parts = data.split(';');
        const remoteInfo = parts[0].substring('RemoteHost='.length);
        
        // Extract depth if present
        let depth = 0;
        for (const part of parts) {
          if (part.startsWith('Depth=')) {
            depth = parseInt(part.substring('Depth='.length), 10) || 0;
          }
        }
        
        if (remoteInfo) {
          // Extract user@host (ignore :ip for display)
          const hostPart = remoteInfo.split(':')[0];
          
          // Show depth indicator for nested SSH
          setHostLabel(depth > 1 ? `🔒 ${hostPart} [L${depth}]` : `🔒 ${hostPart}`);
        } else {
          // Empty = local session
          setHostLabel('Local');
        }
        onPrompt?.();
      } else if (data.startsWith('PreviewFile=')) {
        // Handle preview file command - format: name=filename;content=base64data
        const params = data.substring('PreviewFile='.length);
        const nameMatch = params.match(/name=([^;]+)/);
        const contentMatch = params.match(/content=(.+)/);
        
        if (nameMatch && contentMatch) {
          const filename = nameMatch[1];
          const content = contentMatch[1];
          import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke('open_preview_window', { filename, content }).catch((err: unknown) => {
              console.error('[Preview] Failed to open window:', err);
            });
          });
        } else {
          console.error('[Preview] Invalid preview format');
        }
      } else if (data.startsWith('PythonREPL=')) {
        // Handle Python REPL detection
        const value = data.substring('PythonREPL='.length);
        const enabled = value === '1';
        if (debugEnabled) {
          // eslint-disable-next-line no-console
          console.log('[HostLabel][DEBUG] PythonREPL signal:', value, '-> enabled=', enabled);
        }
        // Pass the enabled state to marker manager
        // enabled=true when Python starts, enabled=false when Python exits
        onPythonREPL?.(enabled);
      } else if (data.startsWith('RREPL=')) {
        // Handle R REPL detection
        const value = data.substring('RREPL='.length);
        const enabled = value === '1';
        if (debugEnabled) {
          // eslint-disable-next-line no-console
          console.log('[HostLabel][DEBUG] RREPL signal:', value, '-> enabled=', enabled);
        }
        onRREPL?.(enabled);
      } else {
        if (debugEnabled) {
          // eslint-disable-next-line no-console
          console.log('[HostLabel][DEBUG] OSC 1337 (other):', data.substring(0, 50));
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error handling OSC 1337:', e);
    }
    return true;
  }) as unknown as Disposable;

  return {
    cleanup: () => {
      disposable633.dispose();
      disposable1337.dispose();
    },
  };
}
