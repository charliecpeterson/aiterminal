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
}

export interface TerminalSettings {
    max_markers: number;
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
        
        // Check if we're in a detached AI panel window
        const isAiWindow = window.location.hash.startsWith('#/ai-panel');
        
        // Only load settings if we're in the main window
        // Detached AI windows don't need settings on startup
        if (!isAiWindow) {
            loadSettings();
        } else {
            // For AI panel windows, just mark as not loading
            // Settings will be loaded on-demand if needed
            setLoading(false);
        }
    }, []);

    const loadSettings = async () => {
        try {
            const loadedSettings = await invoke<AppSettings>('load_settings');
            // API key is already loaded from keychain/cache by load_settings
            setSettings(loadedSettings);
        } catch (error) {
            console.error('Failed to load settings:', error);
            // Load defaults if settings file is corrupted
            setSettings({
                appearance: { theme: 'dark', font_size: 14, font_family: 'Monaco, monospace' },
                ai: { provider: 'openai', model: 'gpt-4', api_key: '', url: '' },
                terminal: { max_markers: 200 },
                streaming: { max_tokens: 4096, timeout_secs: 120, buffer_size_limit: 1048576 }
            });
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
