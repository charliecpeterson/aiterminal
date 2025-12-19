import React, { createContext, useContext, useEffect, useState } from 'react';
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

export interface AppSettings {
    appearance: AppearanceSettings;
    ai: AiSettings;
    terminal: TerminalSettings;
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

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const loadedSettings = await invoke<AppSettings>('load_settings');
            setSettings(loadedSettings);
        } catch (error) {
            console.error('Failed to load settings:', error);
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
