import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { openUrl } from '@tauri-apps/plugin-opener';
import { applyTerminalAppearance, type AppearanceSettings, resolveXtermTheme } from './ui/appearance';
import { createLogger } from '../utils/logger';

const log = createLogger('TerminalSession');

// Tooltip element for link hover
let linkTooltip: HTMLDivElement | null = null;

function showLinkTooltip(container: HTMLElement, url: string) {
    hideLinkTooltip(); // Remove any existing tooltip
    
    linkTooltip = document.createElement('div');
    linkTooltip.className = 'terminal-link-tooltip';
    linkTooltip.textContent = url.length > 60 ? url.slice(0, 60) + '...' : url;
    
    // Position near the cursor
    const updatePosition = (e: MouseEvent) => {
        if (linkTooltip) {
            linkTooltip.style.left = `${e.clientX + 10}px`;
            linkTooltip.style.top = `${e.clientY + 15}px`;
        }
    };
    
    container.addEventListener('mousemove', updatePosition);
    linkTooltip.dataset.cleanup = 'true';
    (linkTooltip as HTMLDivElement & { _cleanup?: () => void })._cleanup = () => {
        container.removeEventListener('mousemove', updatePosition);
    };
    
    document.body.appendChild(linkTooltip);
    
    // Position initially based on last mouse position
    const rect = container.getBoundingClientRect();
    linkTooltip.style.left = `${rect.left + rect.width / 2}px`;
    linkTooltip.style.top = `${rect.top + 20}px`;
}

function hideLinkTooltip() {
    if (linkTooltip) {
        const cleanup = (linkTooltip as HTMLDivElement & { _cleanup?: () => void })._cleanup;
        if (cleanup) cleanup();
        linkTooltip.remove();
        linkTooltip = null;
    }
}

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

    // Configure WebLinksAddon with Tauri opener and hover tooltip
    const webLinksAddon = new WebLinksAddon(
        (_event, uri) => {
            // Use Tauri's opener plugin to open URLs in the system browser
            openUrl(uri).catch(err => {
                log.error('Failed to open URL:', uri, err);
            });
        },
        {
            hover: (_event, text, _location) => {
                // Show tooltip with URL
                showLinkTooltip(container, text);
            },
            leave: () => {
                // Hide tooltip
                hideLinkTooltip();
            },
        }
    );
    term.loadAddon(webLinksAddon);

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
