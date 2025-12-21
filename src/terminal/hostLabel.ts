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

  // Handle OSC 1337;RemoteHost=user@host:ip (iTerm2 format from shell integration)
  const disposable1337 = term.parser.registerOscHandler(1337, (data) => {
    try {
      // Format: RemoteHost=user@host or RemoteHost=user@host:ip or RemoteHost= (for local)
      if (data.startsWith('RemoteHost=')) {
        const remoteInfo = data.substring('RemoteHost='.length);
        if (remoteInfo) {
          // Extract user@host (ignore :ip for display)
          const hostPart = remoteInfo.split(':')[0];
          setHostLabel(`🔒 ${hostPart}`);
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
