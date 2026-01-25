import type { Terminal as XTerm } from '@xterm/xterm';
import type { ContextItem, ContextType } from '../context/AIContext';
import {
    addContextFromCombinedRanges,
    addContextFromRange,
    addSelectionToContext,
    copyCombinedToClipboard,
    copyRangeToClipboard,
} from './ui/copyContext';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { createLogger } from '../utils/logger';

const log = createLogger('TerminalActions');

/**
 * Open AI panel window if not already open
 */
async function ensureAIPanelOpen() {
    try {
        const existing = await WebviewWindow.getByLabel('ai-panel').catch(() => null);
        if (!existing) {
            const aiWindow = new WebviewWindow('ai-panel', {
                title: 'AI Panel',
                width: 400,
                height: 600,
                resizable: true,
                url: '/#/ai-panel',
            });
            
            // Wait for window to be created and ready
            await new Promise((resolve, reject) => {
                aiWindow.once('tauri://created', () => {
                    aiWindow.setFocus().catch(() => {});
                    // Give the window a moment to initialize before resolving
                    setTimeout(resolve, 300);
                });
                aiWindow.once('tauri://error', reject);
            });
        }
    } catch (err) {
        log.error('Failed to open AI panel', err);
    }
}

export interface TerminalActions {
    copyRange: (range: [number, number]) => Promise<void>;
    copyCombined: (commandRange: [number, number], outputRange: [number, number]) => Promise<void>;
    addContextFromLineRange: (type: 'command' | 'output' | 'selection', range: [number, number]) => void;
    addContextFromCombined: (commandRange: [number, number], outputRange: [number, number]) => void;
    addSelection: () => void;
}

export function createTerminalActions(params: {
    termRef: { current: XTerm | null };
    addContextItem: (item: ContextItem) => void;
    addContextItemWithScan?: (content: string, type: ContextType, metadata?: ContextItem['metadata']) => Promise<void>;
    hideCopyMenu: () => void;
    hideSelectionMenu: () => void;
}): TerminalActions {
    const { termRef, addContextItem, addContextItemWithScan, hideCopyMenu, hideSelectionMenu } = params;

    const focus = () => termRef.current?.focus();

    return {
        copyRange: async (range) => {
            const term = termRef.current;
            if (!term) return;
            await copyRangeToClipboard(term, range);
            hideCopyMenu();
            focus();
        },
        copyCombined: async (commandRange, outputRange) => {
            const term = termRef.current;
            if (!term) return;
            await copyCombinedToClipboard(term, commandRange, outputRange);
            hideCopyMenu();
            focus();
        },
        addContextFromLineRange: async (type, range) => {
            const term = termRef.current;
            if (!term) return;
            await ensureAIPanelOpen(); // Open window FIRST
            addContextFromRange({ term, type, range, addContextItem, addContextItemWithScan });
            hideCopyMenu();
            focus();
        },
        addContextFromCombined: async (commandRange, outputRange) => {
            const term = termRef.current;
            if (!term) return;
            await ensureAIPanelOpen(); // Open window FIRST
            addContextFromCombinedRanges({ term, commandRange, outputRange, addContextItem, addContextItemWithScan });
            hideCopyMenu();
            focus();
        },
        addSelection: async () => {
            const term = termRef.current;
            if (!term) return;
            await ensureAIPanelOpen(); // Open window FIRST
            addSelectionToContext({ term, addContextItem, addContextItemWithScan });
            hideSelectionMenu();
            focus();
        },
    };
}
