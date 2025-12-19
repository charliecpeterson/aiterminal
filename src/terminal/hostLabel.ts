import type { Terminal as XTermTerminal } from '@xterm/xterm';

type Disposable = { dispose: () => void };

export interface HostLabelHandle {
  cleanup: () => void;
}

export function attachHostLabelOsc(
  term: XTermTerminal,
  setHostLabel: (label: string) => void
): HostLabelHandle {
  const disposable = term.parser.registerOscHandler(633, (data) => {
    // Custom: 633;H;hostname
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

  return {
    cleanup: () => disposable.dispose(),
  };
}
