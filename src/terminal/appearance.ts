import type { Terminal as XTerm } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

export interface AppearanceSettings {
    theme: 'light' | 'dark' | string;
    font_family: string;
    font_size: number;
}

export function resolveXtermTheme(appearanceTheme: AppearanceSettings['theme']): {
    background: string;
    foreground: string;
    cursor: string;
} {
    return {
        background: appearanceTheme === 'light' ? '#ffffff' : '#1e1e1e',
        foreground: appearanceTheme === 'light' ? '#000000' : '#ffffff',
        cursor: appearanceTheme === 'light' ? '#000000' : '#ffffff',
    };
}

export function applyTerminalAppearance(params: {
    term: XTerm;
    appearance: AppearanceSettings;
    fitAddon?: FitAddon | null;
}): void {
    const { term, appearance, fitAddon } = params;

    term.options.fontSize = appearance.font_size;
    term.options.fontFamily = appearance.font_family;

    const theme = resolveXtermTheme(appearance.theme);
    term.options.theme = {
        ...term.options.theme,
        ...theme,
    };

    fitAddon?.fit();
}
