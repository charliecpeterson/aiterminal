import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { applyTerminalAppearance, type AppearanceSettings, resolveXtermTheme } from './ui/appearance';
import { createLogger } from '../utils/logger';

const log = createLogger('TerminalSession');

export interface TerminalSession {
    term: XTerm;
    fitAddon: FitAddon;
    searchAddon: SearchAddon;
    cleanup: () => void;
}

export function createTerminalSession(params: {
    container: HTMLElement;
    appearance: AppearanceSettings;
}): TerminalSession {
    const { container, appearance } = params;

    const term = new XTerm({
        cursorBlink: true,
        theme: resolveXtermTheme(appearance.theme),
        allowProposedApi: true,
        fontFamily: appearance.font_family,
        fontSize: appearance.font_size,
        scrollback: 10000,
        fastScrollModifier: 'shift',
        scrollOnUserInput: true,
        windowOptions: {
            setWinSizePixels: false,
            setWinSizeChars: true,
            getWinSizePixels: false,
            getWinSizeChars: true,
        },
        allowTransparency: false,
        drawBoldTextInBrightColors: true,
        rightClickSelectsWord: false,
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
        log.warn('WebGL addon failed to load', e);
    }

    term.open(container);
    
    // Force browser to reflow before fitting
    // This ensures the container has its final dimensions
    container.offsetHeight; // Force reflow
    
    fitAddon.fit();
    applyTerminalAppearance({ term, appearance, fitAddon });

    return {
        term,
        fitAddon,
        searchAddon,
        cleanup: () => {
            term.dispose();
        },
    };
}
