import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../utils/logger';
import { ContextErrorBoundary } from '../components/ContextErrorBoundary';

const log = createLogger('SettingsContext');

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
    
    // Advanced: Conversation History
    conversation_window_size?: number;        // Default: 8
    conversation_min_for_summary?: number;    // Default: 12
    
    // Advanced: Context Budget
    context_token_budget_chat?: number;       // Default: 12000
    context_token_budget_agent?: number;      // Default: 6000

    // Auto-Routing: Intelligent model selection based on query complexity
    auto_routing?: {
        enabled: boolean;  // Default: true
        
        // Model tiers
        simple_model: string;      // Default: "gpt-4o-mini"
        moderate_model: string;    // Default: "gpt-4.1"
        complex_model: string;     // Default: "gpt-4.1"
        
        // Budget tiers (optional, falls back to mode defaults)
        simple_budget?: number;    // Default: 4000
        moderate_budget?: number;  // Default: 8000
        complex_budget?: number;   // Default: 12000
        
        // Prompt enhancement
        enable_prompt_enhancement: boolean;  // Default: true
        
        // UI/Export preferences
        show_routing_info: boolean;  // Default: true
        export_routing_detail: 'minimal' | 'standard' | 'detailed';  // Default: 'standard'
    };
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

const SettingsProviderInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
                    log.warn('Failed to load API key from keychain', err);
                    // Key might have been deleted from keychain - that's okay
                }
            }
            
            setSettings(loadedSettings);
        } catch (error) {
            log.error('Failed to load settings', error);
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
            log.error('Failed to save settings', error);
            throw error;
        }
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSettings, loading }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <ContextErrorBoundary contextName="Settings">
            <SettingsProviderInner>
                {children}
            </SettingsProviderInner>
        </ContextErrorBoundary>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
