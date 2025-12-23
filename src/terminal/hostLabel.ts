import type { Terminal as XTermTerminal } from '@xterm/xterm';

type Disposable = { dispose: () => void };

export interface HostLabelHandle {
  cleanup: () => void;
}

export function attachHostLabelOsc(
  term: XTermTerminal,
  setHostLabel: (label: string) => void
): HostLabelHandle {
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
          if (depth > 1) {
            setHostLabel(`🔒 ${hostPart} [L${depth}]`);
          } else if (depth === 1) {
            setHostLabel(`🔒 ${hostPart}`);
          } else {
            setHostLabel(`🔒 ${hostPart}`);
          }
        } else {
          // Empty = local session
          setHostLabel('Local');
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
