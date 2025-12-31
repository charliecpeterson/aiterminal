import type { Terminal as XTerm } from '@xterm/xterm';
import type { ContextItem, ContextType } from '../context/AIContext';
import {
    addContextFromCombinedRanges,
    addContextFromRange,
    addSelectionToContext,
    copyCombinedToClipboard,
    copyRangeToClipboard,
} from './ui/copyContext';

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
        addContextFromLineRange: (type, range) => {
            const term = termRef.current;
            if (!term) return;
            addContextFromRange({ term, type, range, addContextItem, addContextItemWithScan });
            hideCopyMenu();
            focus();
        },
        addContextFromCombined: (commandRange, outputRange) => {
            const term = termRef.current;
            if (!term) return;
            addContextFromCombinedRanges({ term, commandRange, outputRange, addContextItem, addContextItemWithScan });
            hideCopyMenu();
            focus();
        },
        addSelection: () => {
            const term = termRef.current;
            if (!term) return;
            addSelectionToContext({ term, addContextItem, addContextItemWithScan });
            hideSelectionMenu();
            focus();
        },
    };
}
