import type React from 'react';
import type { RefObject } from 'react';
import type { SearchAddon } from '@xterm/addon-search';

export interface SearchController {
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    findPrevious: () => void;
    findNext: () => void;
    close: () => void;
}

export function createSearchController(params: {
    searchAddonRef: RefObject<SearchAddon | null>;
    searchInputRef: RefObject<HTMLInputElement | null>;
    setShowSearch: (updater: boolean | ((prev: boolean) => boolean)) => void;
    focusTerminal: () => void;
}): SearchController {
    const { searchAddonRef, searchInputRef, setShowSearch, focusTerminal } = params;

    const findIncremental = (value: string) => {
        searchAddonRef.current?.findNext(value, { incremental: true });
    };

    const findPreviousByValue = (value: string) => {
        if (!value) return;
        searchAddonRef.current?.findPrevious(value);
    };

    const findNextByValue = (value: string) => {
        if (!value) return;
        searchAddonRef.current?.findNext(value);
    };

    const getCurrentValue = () => searchInputRef.current?.value ?? '';

    return {
        onChange: (e) => {
            findIncremental(e.target.value);
        },
        onKeyDown: (e) => {
            if (e.key !== 'Enter') return;
            const value = e.currentTarget.value;
            if (e.shiftKey) {
                findPreviousByValue(value);
            } else {
                findNextByValue(value);
            }
        },
        findPrevious: () => {
            findPreviousByValue(getCurrentValue());
        },
        findNext: () => {
            findNextByValue(getCurrentValue());
        },
        close: () => {
            setShowSearch(false);
            focusTerminal();
        },
    };
}
