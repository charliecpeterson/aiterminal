import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';

export interface TerminalSession {
    term: XTerm;
    fitAddon: FitAddon;
    searchAddon: SearchAddon;
    cleanup: () => void;
}

export function createTerminalSession(params: {
    container: HTMLElement;
    appearance: {
        theme: 'light' | 'dark' | string;
        font_family: string;
        font_size: number;
    };
}): TerminalSession {
    const { container, appearance } = params;

    const term = new XTerm({
        cursorBlink: true,
        theme: {
            background: appearance.theme === 'light' ? '#ffffff' : '#1e1e1e',
            foreground: appearance.theme === 'light' ? '#000000' : '#ffffff',
            cursor: appearance.theme === 'light' ? '#000000' : '#ffffff',
        },
        allowProposedApi: true,
        fontFamily: appearance.font_family,
        fontSize: appearance.font_size,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);

    term.loadAddon(new WebLinksAddon());

    // WebGL addon is optional; keep behavior consistent with previous inline try/catch.
    try {
        const webglAddon = new WebglAddon();
        term.loadAddon(webglAddon);
    } catch (e) {
        console.warn('WebGL addon failed to load', e);
    }

    term.open(container);
    fitAddon.fit();

    return {
        term,
        fitAddon,
        searchAddon,
        cleanup: () => {
            term.dispose();
        },
    };
}
