import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface AppearanceSettings {
    theme: string;
    font_size: number;
    font_family: string;
}

export interface AiSettings {
    provider: string;
    model: string;
    api_key: string;
    embedding_model?: string;
    url?: string;
    mode?: 'chat' | 'agent'; // Chat = no agent toolkit/tools, Agent = tools enabled
    require_command_approval?: boolean; // New: Require approval before executing commands
    api_key_in_keychain?: boolean; // Track if key is stored in keychain
}

export interface TerminalSettings {
    max_markers: number;
}

export interface FoldSettings {
    enabled: boolean; // Enable output folding
    threshold: number; // Lines before showing notification (default: 50)
    show_preview_lines: number; // Lines to show in preview (default: 3)
    auto_open_window: boolean; // Automatically open window for very large outputs
    large_threshold: number; // Lines to suggest window (default: 500)
}

export interface AutocompleteSettings {
    enable_inline: boolean; // Fish-style gray text suggestions
    inline_source: 'history' | 'llm' | 'hybrid'; // Source for inline completions
    enable_menu: boolean; // Ctrl+Space dropdown menu
    
    // LLM tuning
    llm_temperature: number; // 0.0-1.0
    llm_max_tokens: number; // 10-50
    llm_debounce_ms: number; // Delay before querying (ms)
}

export interface StreamingSettings {
    max_tokens: number;
    timeout_secs: number;
    buffer_size_limit: number;
}

export interface AppSettings {
    appearance: AppearanceSettings;
    ai: AiSettings;
    terminal: TerminalSettings;
    fold?: FoldSettings; // Optional for backward compatibility
    autocomplete?: AutocompleteSettings; // Optional for backward compatibility
    streaming?: StreamingSettings; // Optional for backward compatibility
}

interface SettingsContextType {
    settings: AppSettings | null;
    updateSettings: (newSettings: AppSettings) => Promise<void>;
    loading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const loadingRef = useRef(false); // Prevent double-load

    useEffect(() => {
        // Prevent double-loading in case of re-renders
        if (loadingRef.current) return;
        loadingRef.current = true;
        
        // Load settings for all windows (main and AI panel)
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const loadedSettings = await invoke<AppSettings>('load_settings');
            
            // Check if API key should be loaded from keychain
            if (loadedSettings.ai?.api_key_in_keychain && !loadedSettings.ai?.api_key) {
                try {
                    const keychainKey = await invoke<string>('get_api_key_from_keychain');
                    loadedSettings.ai.api_key = keychainKey;
                } catch (err) {
                    console.warn('Failed to load API key from keychain:', err);
                    // Key might have been deleted from keychain - that's okay
                }
            }
            
            setSettings(loadedSettings);
        } catch (error) {
            console.error('❌ Failed to load settings:', error);
            // Load defaults if settings file is corrupted
            const defaultSettings = {
                appearance: { theme: 'dark', font_size: 14, font_family: 'Monaco, monospace' },
                ai: {
                    provider: 'openai',
                    model: 'gpt-4',
                    api_key: '',
                    url: '',
                    mode: 'agent' as const,
                    require_command_approval: true,
                    api_key_in_keychain: false,
                },
                terminal: { max_markers: 200 },
                fold: {
                    enabled: true,
                    threshold: 30,
                    show_preview_lines: 3,
                    auto_open_window: false,
                    large_threshold: 500
                },
                autocomplete: { 
                    enable_inline: true, 
                    inline_source: 'history' as const,
                    enable_menu: true,
                    llm_temperature: 0.1,
                    llm_max_tokens: 15,
                    llm_debounce_ms: 300
                },
                streaming: { max_tokens: 4096, timeout_secs: 120, buffer_size_limit: 1048576 }
            };
            setSettings(defaultSettings);
        } finally {
            setLoading(false);
        }
    };

    const updateSettings = async (newSettings: AppSettings) => {
        try {
            await invoke('save_settings', { settings: newSettings });
            setSettings(newSettings);
        } catch (error) {
            console.error('Failed to save settings:', error);
            throw error;
        }
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSettings, loading }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
