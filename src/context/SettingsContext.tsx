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
    require_command_approval?: boolean; // New: Require approval before executing commands
}

export interface TerminalSettings {
    max_markers: number;
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
            // API key is already loaded from keychain/cache by load_settings
            console.log('✅ Settings loaded successfully:', { 
                provider: loadedSettings.ai?.provider, 
                model: loadedSettings.ai?.model,
                hasApiKey: !!loadedSettings.ai?.api_key 
            });
            setSettings(loadedSettings);
        } catch (error) {
            console.error('❌ Failed to load settings:', error);
            // Load defaults if settings file is corrupted
            const defaultSettings = {
                appearance: { theme: 'dark', font_size: 14, font_family: 'Monaco, monospace' },
                ai: { provider: 'openai', model: 'gpt-4', api_key: '', url: '' },
                terminal: { max_markers: 200 },
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
            console.log('📋 Using default settings');
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
