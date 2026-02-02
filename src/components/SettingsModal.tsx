import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettings, AppSettings } from '../context/SettingsContext';
import { settingsModalStyles } from './SettingsModal.styles';
import { useInteractiveStates } from '../hooks/useInteractiveStates';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { settings, updateSettings } = useSettings();
    const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);
    const [activeTab, setActiveTab] = useState<'appearance' | 'terminal' | 'ai' | 'autocomplete'>('appearance');
    const [aiTestStatus, setAiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [aiTestError, setAiTestError] = useState<string | null>(null);
    const [aiModelOptions, setAiModelOptions] = useState<string[]>([]);
    const [aiEmbeddingOptions, setAiEmbeddingOptions] = useState<string[]>([]);
    const [keychainStatus, setKeychainStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
    const [keychainMessage, setKeychainMessage] = useState<string | null>(null);

    // Interactive states (hover/focus) for buttons and inputs
    const { getProps, getFocusProps } = useInteractiveStates();

    // Load settings when modal opens
    useEffect(() => {
        if (isOpen && settings) {
            setLocalSettings(JSON.parse(JSON.stringify(settings)));
        }
    }, [settings, isOpen]);

    useEffect(() => {
        if (!localSettings) return;
        setAiTestStatus('idle');
        setAiTestError(null);
        setAiModelOptions([]);
        setAiEmbeddingOptions([]);
    }, [localSettings?.ai?.provider, localSettings?.ai?.api_key, localSettings?.ai?.url]);

    // Memoize expensive model option rendering
    const memoizedModelOptions = useMemo(() => 
        aiModelOptions.map((model) => (
            <option key={model} value={model}>{model}</option>
        )), [aiModelOptions]
    );

    const memoizedEmbeddingOptions = useMemo(() => 
        aiEmbeddingOptions.map((model) => (
            <option key={model} value={model}>{model}</option>
        )), [aiEmbeddingOptions]
    );

    const handleSave = useCallback(async () => {
        if (localSettings) {
            await updateSettings(localSettings);
            onClose();
        }
    }, [localSettings, updateSettings, onClose]);

    const handleChange = useCallback((section: 'appearance' | 'terminal' | 'ai' | 'autocomplete', key: string, value: string | number | boolean) => {
        setLocalSettings(prev => {
            if (!prev) return null;
            return {
                ...prev,
                [section]: {
                    ...prev[section],
                    [key]: value
                }
            };
        });
    }, []);

    const handleResetAdvancedSettings = useCallback(() => {
        setLocalSettings(prev => {
            if (!prev) return null;
            return {
                ...prev,
                ai: {
                    ...prev.ai,
                    conversation_window_size: undefined,
                    conversation_min_for_summary: undefined,
                    context_token_budget_chat: undefined,
                    context_token_budget_agent: undefined,
                    enable_context_summaries: undefined,
                    context_summary_threshold: undefined,
                    context_auto_cleanup_hours: undefined,
                }
            };
        });
    }, []);

    const handleTestConnection = useCallback(async () => {
        if (!localSettings) return;
        setAiTestStatus('testing');
        setAiTestError(null);
        try {
            const result = await invoke<{ models: string[]; embedding_models: string[] }>(
                'test_ai_connection',
                {
                    provider: localSettings.ai.provider,
                    apiKey: localSettings.ai.api_key,
                    url: localSettings.ai.url,
                }
            );
            const models = result.models || [];
            const embeddings = result.embedding_models || [];
            setAiModelOptions(models);
            setAiEmbeddingOptions(embeddings);
            if (!localSettings.ai.model && models.length > 0) {
                handleChange('ai', 'model', models[0]);
            }
            if (!localSettings.ai.embedding_model && embeddings.length > 0) {
                handleChange('ai', 'embedding_model', embeddings[0]);
            }
            setAiTestStatus('success');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setAiTestStatus('error');
            setAiTestError(message);
        }
    }, [localSettings, handleChange]);

    const handleSaveToKeychain = useCallback(async () => {
        if (!localSettings?.ai?.api_key) {
            setKeychainStatus('error');
            setKeychainMessage('No API key to save');
            return;
        }

        setKeychainStatus('saving');
        setKeychainMessage(null);

        try {
            await invoke('save_api_key_to_keychain', { key: localSettings.ai.api_key });
            
            // Update local settings to reflect keychain storage
            setLocalSettings(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    ai: {
                        ...prev.ai,
                        api_key_in_keychain: true
                    }
                };
            });

            setKeychainStatus('success');
            setKeychainMessage('✓ Saved to macOS Keychain');

            // Clear message after 3 seconds
            setTimeout(() => {
                setKeychainStatus('idle');
                setKeychainMessage(null);
            }, 3000);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setKeychainStatus('error');
            setKeychainMessage(`Failed: ${message}`);
        }
    }, [localSettings]);

    // Early returns AFTER all hooks
    if (!isOpen) return null;
    
    // Show loading state if settings not loaded yet
    if (!settings) {
        return (
            <div style={settingsModalStyles.overlay} onClick={onClose}>
                <div style={settingsModalStyles.modal} onClick={(e) => e.stopPropagation()}>
                    <div style={settingsModalStyles.header}>
                        <h2 style={settingsModalStyles.headerTitle}>Settings</h2>
                        <button 
                            {...getProps('closeBtn', {
                                base: settingsModalStyles.closeButton,
                                hover: settingsModalStyles.closeButtonHover,
                            })}
                            onClick={onClose}
                        >×</button>
                    </div>
                    <div style={settingsModalStyles.loadingContainer}>
                        <p>Loading settings...</p>
                        <p style={settingsModalStyles.loadingText}>
                            If this persists, try refreshing the page.
                        </p>
                    </div>
                </div>
            </div>
        );
    }
    
    if (!localSettings) {
        return (
            <div style={settingsModalStyles.overlay} onClick={onClose}>
                <div style={settingsModalStyles.modal} onClick={(e) => e.stopPropagation()}>
                    <div style={settingsModalStyles.header}>
                        <h2 style={settingsModalStyles.headerTitle}>Settings</h2>
                        <button 
                            {...getProps('closeBtn2', {
                                base: settingsModalStyles.closeButton,
                                hover: settingsModalStyles.closeButtonHover,
                            })}
                            onClick={onClose}
                        >×</button>
                    </div>
                    <div style={settingsModalStyles.loadingContainer}>Initializing...</div>
                </div>
            </div>
        );
    }

    return (
        <div style={settingsModalStyles.overlay} onClick={onClose}>
            <div style={settingsModalStyles.modal} onClick={e => e.stopPropagation()}>
                <div style={settingsModalStyles.header}>
                    <h2 style={settingsModalStyles.headerTitle}>Settings</h2>
                        <button 
                            {...getProps('closeBtn3', {
                                base: settingsModalStyles.closeButton,
                                hover: settingsModalStyles.closeButtonHover,
                            })}
                            onClick={onClose}
                        >×</button>
                </div>
                
                <div style={settingsModalStyles.content}>
                    <div style={settingsModalStyles.sidebar}>
                        <div 
                            {...getProps('tabAppearance', {
                                base: settingsModalStyles.tab,
                                hover: settingsModalStyles.tabHover,
                                active: settingsModalStyles.tabActive,
                            }, { active: activeTab === 'appearance' })}
                            onClick={() => setActiveTab('appearance')}
                        >
                            Appearance
                        </div>
                        <div 
                            {...getProps('tabAi', {
                                base: settingsModalStyles.tab,
                                hover: settingsModalStyles.tabHover,
                                active: settingsModalStyles.tabActive,
                            }, { active: activeTab === 'ai' })}
                            onClick={() => setActiveTab('ai')}
                        >
                            AI
                        </div>
                        <div 
                            {...getProps('tabTerminal', {
                                base: settingsModalStyles.tab,
                                hover: settingsModalStyles.tabHover,
                                active: settingsModalStyles.tabActive,
                            }, { active: activeTab === 'terminal' })}
                            onClick={() => setActiveTab('terminal')}
                        >
                            Terminal
                        </div>
                        <div 
                            {...getProps('tabAutocomplete', {
                                base: settingsModalStyles.tab,
                                hover: settingsModalStyles.tabHover,
                                active: settingsModalStyles.tabActive,
                            }, { active: activeTab === 'autocomplete' })}
                            onClick={() => setActiveTab('autocomplete')}
                        >
                            Autocomplete
                        </div>
                    </div>

                    <div style={settingsModalStyles.panel}>
                        {activeTab === 'appearance' && (
                            <>
                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.formLabel}>Font Size</label>
                                    <input 
                                        type="number"
                                        min={8}
                                        max={72}
                                        value={localSettings.appearance.font_size}
                                        onChange={(e) => {
                                            const parsed = Number.parseInt(e.target.value, 10);
                                            const size = Number.isFinite(parsed) 
                                                ? Math.min(72, Math.max(8, parsed))
                                                : 14;
                                            handleChange('appearance', 'font_size', size);
                                        }}
                                        {...getFocusProps('fontSize', {
                                            base: settingsModalStyles.formInput,
                                            focus: settingsModalStyles.formInputFocus,
                                        })}
                                    />
                                </div>
                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.formLabel}>Font Family</label>
                                    <input 
                                        type="text" 
                                        value={localSettings.appearance.font_family}
                                        onChange={(e) => {
                                            const value = e.target.value.trim();
                                            if (value) {
                                                handleChange('appearance', 'font_family', value);
                                            }
                                        }}
                                        placeholder="Monaco, monospace"
                                        {...getFocusProps('fontFamily', {
                                            base: settingsModalStyles.formInput,
                                            focus: settingsModalStyles.formInputFocus,
                                        })}
                                    />
                                </div>
                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.formLabel}>Theme</label>
                                    <select 
                                        value={localSettings.appearance.theme}
                                        onChange={(e) => handleChange('appearance', 'theme', e.target.value)}
                                        {...getFocusProps('theme', {
                                            base: settingsModalStyles.formInput,
                                            focus: settingsModalStyles.formInputFocus,
                                        })}
                                    >
                                        <option value="dark">Dark</option>
                                        <option value="light">Light</option>
                                    </select>
                                </div>
                            </>
                        )}

                        {activeTab === 'terminal' && (
                            <>
                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.formLabel}>Max Markers</label>
                                    <input 
                                        type="number" 
                                        min={20}
                                        max={2000}
                                        value={localSettings.terminal.max_markers}
                                        onChange={(e) => {
                                            const parsed = Number.parseInt(e.target.value, 10);
                                            const clamped = Number.isFinite(parsed)
                                                ? Math.min(2000, Math.max(20, parsed))
                                                : 200;
                                            handleChange('terminal', 'max_markers', clamped);
                                        }}
                                        {...getFocusProps('maxMarkers', {
                                            base: settingsModalStyles.formInput,
                                            focus: settingsModalStyles.formInputFocus,
                                        })}
                                    />
                                </div>
                            </>
                        )}

                        {activeTab === 'ai' && (
                            <>
                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.formLabel}>Provider</label>
                                    <select 
                                        value={localSettings.ai.provider}
                                        onChange={(e) => handleChange('ai', 'provider', e.target.value)}
                                        {...getFocusProps('provider', {
                                            base: settingsModalStyles.formInput,
                                            focus: settingsModalStyles.formInputFocus,
                                        })}
                                    >
                                        <option value="openai">OpenAI</option>
                                        <option value="anthropic">Anthropic</option>
                                        <option value="gemini">Gemini</option>
                                        <option value="ollama">Ollama</option>
                                    </select>
                                </div>
                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.formLabel}>API Key</label>
                                    <input 
                                        type="password" 
                                        value={localSettings.ai.api_key || ''}
                                        onChange={(e) => handleChange('ai', 'api_key', e.target.value)}
                                        placeholder="sk-..."
                                        {...getFocusProps('apiKey', {
                                            base: settingsModalStyles.formInput,
                                            focus: settingsModalStyles.formInputFocus,
                                        })}
                                    />
                                </div>
                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.formLabel}>URL (Optional)</label>
                                    <input 
                                        type="text" 
                                        value={localSettings.ai.url || ''}
                                        onChange={(e) => {
                                            const value = e.target.value.trim();
                                            // Allow empty or valid URL
                                            if (!value) {
                                                handleChange('ai', 'url', '');
                                            } else {
                                                handleChange('ai', 'url', value);
                                            }
                                        }}
                                        placeholder="https://api.openai.com/v1"
                                        {...getFocusProps('url', {
                                            base: settingsModalStyles.formInput,
                                            focus: settingsModalStyles.formInputFocus,
                                        })}
                                    />
                                </div>
                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.formLabel}>Connection</label>
                                    <div style={settingsModalStyles.aiConnectionRow}>
                                        <button
                                            {...getProps('testBtn', {
                                                base: { ...settingsModalStyles.button, ...settingsModalStyles.buttonSecondary },
                                                hover: settingsModalStyles.buttonHover,
                                                disabled: settingsModalStyles.buttonDisabled,
                                            }, { disabled: aiTestStatus === 'testing' })}
                                            onClick={handleTestConnection}
                                            disabled={aiTestStatus === 'testing'}
                                        >
                                            {aiTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                                        </button>
                                        <span style={
                                            aiTestStatus === 'success'
                                                ? { ...settingsModalStyles.aiConnectionStatus, ...settingsModalStyles.aiConnectionStatusSuccess }
                                                : aiTestStatus === 'error'
                                                    ? { ...settingsModalStyles.aiConnectionStatus, ...settingsModalStyles.aiConnectionStatusError }
                                                    : settingsModalStyles.aiConnectionStatus
                                        }>
                                            {aiTestStatus === 'success'
                                                ? 'Connected'
                                                : aiTestStatus === 'error'
                                                ? 'Failed'
                                                : 'Not tested'}
                                        </span>
                                    </div>
                                    {aiTestError && (
                                        <div style={settingsModalStyles.aiConnectionError}>{aiTestError}</div>
                                    )}
                                </div>
                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.formLabel}>Secure Storage</label>
                                    <div style={settingsModalStyles.aiConnectionRow}>
                                        <button
                                            {...getProps('keychainBtn', {
                                                base: { ...settingsModalStyles.button, ...settingsModalStyles.buttonSecondary },
                                                hover: settingsModalStyles.buttonHover,
                                                disabled: settingsModalStyles.buttonDisabled,
                                            }, { disabled: !localSettings.ai.api_key || keychainStatus === 'saving' })}
                                            onClick={handleSaveToKeychain}
                                            disabled={!localSettings.ai.api_key || keychainStatus === 'saving'}
                                        >
                                            {keychainStatus === 'saving' ? 'Saving...' : 'Save to Keychain'}
                                        </button>
                                        <span style={
                                            keychainStatus === 'success'
                                                ? { ...settingsModalStyles.aiConnectionStatus, ...settingsModalStyles.aiConnectionStatusSuccess }
                                                : keychainStatus === 'error'
                                                    ? { ...settingsModalStyles.aiConnectionStatus, ...settingsModalStyles.aiConnectionStatusError }
                                                    : settingsModalStyles.aiConnectionStatus
                                        }>
                                            {keychainStatus === 'success'
                                                ? keychainMessage || 'Saved'
                                                : keychainStatus === 'error'
                                                ? keychainMessage || 'Failed'
                                                : 'Store API key securely'}
                                        </span>
                                    </div>
                                </div>
                                <div style={settingsModalStyles.formGroup}>
                                    <label>Model</label>
                                    {aiModelOptions.length > 0 ? (
                                        <select
                                            value={localSettings.ai.model}
                                            onChange={(e) => handleChange('ai', 'model', e.target.value)}
                                        >
                                            {memoizedModelOptions}
                                        </select>
                                    ) : (
                                        <input 
                                            type="text" 
                                            value={localSettings.ai.model || ''}
                                            onChange={(e) => handleChange('ai', 'model', e.target.value)}
                                            placeholder="e.g. gpt-4o"
                                            list="ai-model-options"
                                        />
                                    )}
                                    {aiModelOptions.length > 0 && (
                                        <datalist id="ai-model-options">
                                            {memoizedModelOptions}
                                        </datalist>
                                    )}
                                </div>
                                <div style={settingsModalStyles.formGroup}>
                                    <label>Embedding Model (Optional)</label>
                                    {aiEmbeddingOptions.length > 0 ? (
                                        <select
                                            value={localSettings.ai.embedding_model || ''}
                                            onChange={(e) => handleChange('ai', 'embedding_model', e.target.value)}
                                        >
                                            <option value="">None</option>
                                            {memoizedEmbeddingOptions}
                                        </select>
                                    ) : (
                                        <input 
                                            type="text" 
                                            value={localSettings.ai.embedding_model || ''}
                                            onChange={(e) => handleChange('ai', 'embedding_model', e.target.value)}
                                            placeholder="e.g. text-embedding-3-small"
                                            list="ai-embedding-options"
                                        />
                                    )}
                                    {aiEmbeddingOptions.length > 0 && (
                                        <datalist id="ai-embedding-options">
                                            {memoizedEmbeddingOptions}
                                        </datalist>
                                    )}
                                </div>
                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={localSettings.ai.require_command_approval !== false}
                                            onChange={(e) => handleChange('ai', 'require_command_approval', e.target.checked as any)}
                                        />
                                        <span>Require approval before executing commands</span>
                                    </label>
                                    <div style={settingsModalStyles.formHint}>
                                        When enabled, the AI will ask for permission before running potentially destructive commands (rm, sudo, etc.). Safe read-only commands run automatically.
                                    </div>
                                </div>

                                {/* Advanced Settings Section */}
                                <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.9)' }}>Advanced Settings</h3>
                                        <button
                                            style={{
                                                ...settingsModalStyles.button,
                                                ...settingsModalStyles.buttonSecondary,
                                                fontSize: '12px',
                                                padding: '4px 12px'
                                            }}
                                            onClick={handleResetAdvancedSettings}
                                            title="Reset all advanced settings to defaults"
                                        >
                                            Reset to Default
                                        </button>
                                    </div>
                                    
                                    {/* Conversation History */}
                                    <div style={settingsModalStyles.formGroup}>
                                        <label style={settingsModalStyles.formLabel}>Conversation Window Size: {localSettings.ai.conversation_window_size ?? 8} messages</label>
                                        <input
                                            type="range"
                                            min="4"
                                            max="20"
                                            step="2"
                                            value={localSettings.ai.conversation_window_size ?? 8}
                                            onChange={(e) => handleChange('ai', 'conversation_window_size', parseInt(e.target.value))}
                                            style={{ width: '100%' }}
                                        />
                                        <div style={settingsModalStyles.formHint}>
                                            Keep last N messages in full. Older messages are summarized to save tokens.
                                        </div>
                                        {(localSettings.ai.conversation_window_size ?? 8) < 4 && (
                                            <div style={settingsModalStyles.warningText}>
                                                ⚠️ Very small window may lose important context
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div style={settingsModalStyles.formGroup}>
                                        <label style={settingsModalStyles.formLabel}>Summarize after: {localSettings.ai.conversation_min_for_summary ?? 12} messages</label>
                                        <input
                                            type="range"
                                            min="8"
                                            max="50"
                                            step="2"
                                            value={localSettings.ai.conversation_min_for_summary ?? 12}
                                            onChange={(e) => handleChange('ai', 'conversation_min_for_summary', parseInt(e.target.value))}
                                            style={{ width: '100%' }}
                                        />
                                        <div style={settingsModalStyles.formHint}>
                                            Start summarizing old messages when conversation exceeds this length.
                                        </div>
                                        {(localSettings.ai.conversation_min_for_summary ?? 12) > 30 && (
                                            <div style={settingsModalStyles.warningText}>
                                                ⚠️ Large value increases token usage. Summarization saves 60-80% tokens.
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Context Budget */}
                                    <div style={settingsModalStyles.formGroup}>
                                        <label style={settingsModalStyles.formLabel}>Context Budget (Chat Mode): {localSettings.ai.context_token_budget_chat ?? 12000} tokens</label>
                                        <input
                                            type="range"
                                            min="4000"
                                            max="20000"
                                            step="1000"
                                            value={localSettings.ai.context_token_budget_chat ?? 12000}
                                            onChange={(e) => handleChange('ai', 'context_token_budget_chat', parseInt(e.target.value))}
                                            style={{ width: '100%' }}
                                        />
                                        <div style={settingsModalStyles.formHint}>
                                            Chat mode front-loads context (cannot fetch files later). Higher = more context.
                                        </div>
                                        {(localSettings.ai.context_token_budget_chat ?? 12000) < 6000 && (
                                            <div style={settingsModalStyles.warningText}>
                                                ⚠️ Low budget may truncate important context in chat mode
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div style={settingsModalStyles.formGroup}>
                                        <label style={settingsModalStyles.formLabel}>Context Budget (Agent Mode): {localSettings.ai.context_token_budget_agent ?? 6000} tokens</label>
                                        <input
                                            type="range"
                                            min="2000"
                                            max="12000"
                                            step="1000"
                                            value={localSettings.ai.context_token_budget_agent ?? 6000}
                                            onChange={(e) => handleChange('ai', 'context_token_budget_agent', parseInt(e.target.value))}
                                            style={{ width: '100%' }}
                                        />
                                        <div style={settingsModalStyles.formHint}>
                                            Agent mode can use read_file/grep tools to fetch details on demand. Lower = more efficient.
                                        </div>
                                        {(localSettings.ai.context_token_budget_agent ?? 6000) > 10000 && (
                                            <div style={settingsModalStyles.warningText}>
                                                ⚠️ High budget reduces efficiency. Agent can fetch files using tools.
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Future Features (Disabled) */}
                                    <div style={settingsModalStyles.formGroup}>
                                        <label style={{ ...settingsModalStyles.checkboxLabel, opacity: 0.5 }}>
                                            <input
                                                type="checkbox"
                                                disabled
                                                checked={false}
                                            />
                                            <span>Enable context summaries (Coming Soon)</span>
                                        </label>
                                        <div style={settingsModalStyles.formHint}>
                                            Summarize repeated context instead of resending full content. Saves 30-50% tokens.
                                        </div>
                                    </div>
                                </div>

                                {/* Auto-Routing Section */}
                                <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.9)' }}>Auto-Routing</h3>
                                    </div>
                                    
                                    <div style={settingsModalStyles.formGroup}>
                                        <label style={settingsModalStyles.checkboxLabel}>
                                            <input
                                                type="checkbox"
                                                checked={localSettings.ai.auto_routing?.enabled ?? false}
                                                onChange={(e) => {
                                                    setLocalSettings(prev => {
                                                        if (!prev) return null;
                                                        return {
                                                            ...prev,
                                                            ai: {
                                                                ...prev.ai,
                                                                auto_routing: {
                                                                    ...prev.ai.auto_routing,
                                                                    enabled: e.target.checked,
                                                                    simple_model: prev.ai.auto_routing?.simple_model ?? 'gpt-4o-mini',
                                                                    moderate_model: prev.ai.auto_routing?.moderate_model ?? prev.ai.model ?? 'gpt-4.1',
                                                                    complex_model: prev.ai.auto_routing?.complex_model ?? prev.ai.model ?? 'gpt-4.1',
                                                                    enable_prompt_enhancement: prev.ai.auto_routing?.enable_prompt_enhancement ?? true,
                                                                    show_routing_info: prev.ai.auto_routing?.show_routing_info ?? true,
                                                                    export_routing_detail: prev.ai.auto_routing?.export_routing_detail ?? 'standard',
                                                                }
                                                            }
                                                        };
                                                    });
                                                }}
                                            />
                                            <span>Enable automatic model routing</span>
                                        </label>
                                        <div style={settingsModalStyles.formHint}>
                                            Automatically select the best model based on query complexity. Simple queries use faster/cheaper models.
                                        </div>
                                    </div>

                                    {localSettings.ai.auto_routing?.enabled && (
                                        <>
                                            {/* Model Tiers */}
                                            <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                                <label style={settingsModalStyles.formLabel}>Simple Queries Model</label>
                                                {aiModelOptions.length > 0 ? (
                                                    <select
                                                        value={localSettings.ai.auto_routing?.simple_model ?? 'gpt-4o-mini'}
                                                        onChange={(e) => {
                                                            setLocalSettings(prev => {
                                                                if (!prev) return null;
                                                                return {
                                                                    ...prev,
                                                                    ai: {
                                                                        ...prev.ai,
                                                                        auto_routing: {
                                                                            ...prev.ai.auto_routing!,
                                                                            simple_model: e.target.value,
                                                                        }
                                                                    }
                                                                };
                                                            });
                                                        }}
                                                        style={settingsModalStyles.formInput}
                                                    >
                                                        {memoizedModelOptions}
                                                    </select>
                                                ) : (
                                                    <input 
                                                        type="text" 
                                                        value={localSettings.ai.auto_routing?.simple_model ?? 'gpt-4o-mini'}
                                                        onChange={(e) => {
                                                            setLocalSettings(prev => {
                                                                if (!prev) return null;
                                                                return {
                                                                    ...prev,
                                                                    ai: {
                                                                        ...prev.ai,
                                                                        auto_routing: {
                                                                            ...prev.ai.auto_routing!,
                                                                            simple_model: e.target.value,
                                                                        }
                                                                    }
                                                                };
                                                            });
                                                        }}
                                                        placeholder="gpt-4o-mini"
                                                        style={settingsModalStyles.formInput}
                                                    />
                                                )}
                                                <div style={settingsModalStyles.formHint}>
                                                    For factual questions, simple lookups (complexity 0-35)
                                                </div>
                                            </div>

                                            <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                                <label style={settingsModalStyles.formLabel}>Moderate Queries Model</label>
                                                {aiModelOptions.length > 0 ? (
                                                    <select
                                                        value={localSettings.ai.auto_routing?.moderate_model ?? localSettings.ai.model ?? 'gpt-4.1'}
                                                        onChange={(e) => {
                                                            setLocalSettings(prev => {
                                                                if (!prev) return null;
                                                                return {
                                                                    ...prev,
                                                                    ai: {
                                                                        ...prev.ai,
                                                                        auto_routing: {
                                                                            ...prev.ai.auto_routing!,
                                                                            moderate_model: e.target.value,
                                                                        }
                                                                    }
                                                                };
                                                            });
                                                        }}
                                                        style={settingsModalStyles.formInput}
                                                    >
                                                        {memoizedModelOptions}
                                                    </select>
                                                ) : (
                                                    <input 
                                                        type="text" 
                                                        value={localSettings.ai.auto_routing?.moderate_model ?? localSettings.ai.model ?? 'gpt-4.1'}
                                                        onChange={(e) => {
                                                            setLocalSettings(prev => {
                                                                if (!prev) return null;
                                                                return {
                                                                    ...prev,
                                                                    ai: {
                                                                        ...prev.ai,
                                                                        auto_routing: {
                                                                            ...prev.ai.auto_routing!,
                                                                            moderate_model: e.target.value,
                                                                        }
                                                                    }
                                                                };
                                                            });
                                                        }}
                                                        placeholder="gpt-4.1"
                                                        style={settingsModalStyles.formInput}
                                                    />
                                                )}
                                                <div style={settingsModalStyles.formHint}>
                                                    For code generation, explanations (complexity 36-69)
                                                </div>
                                            </div>

                                            <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                                <label style={settingsModalStyles.formLabel}>Complex Queries Model</label>
                                                {aiModelOptions.length > 0 ? (
                                                    <select
                                                        value={localSettings.ai.auto_routing?.complex_model ?? localSettings.ai.model ?? 'gpt-4.1'}
                                                        onChange={(e) => {
                                                            setLocalSettings(prev => {
                                                                if (!prev) return null;
                                                                return {
                                                                    ...prev,
                                                                    ai: {
                                                                        ...prev.ai,
                                                                        auto_routing: {
                                                                            ...prev.ai.auto_routing!,
                                                                            complex_model: e.target.value,
                                                                        }
                                                                    }
                                                                };
                                                            });
                                                        }}
                                                        style={settingsModalStyles.formInput}
                                                    >
                                                        {memoizedModelOptions}
                                                    </select>
                                                ) : (
                                                    <input 
                                                        type="text" 
                                                        value={localSettings.ai.auto_routing?.complex_model ?? localSettings.ai.model ?? 'gpt-4.1'}
                                                        onChange={(e) => {
                                                            setLocalSettings(prev => {
                                                                if (!prev) return null;
                                                                return {
                                                                    ...prev,
                                                                    ai: {
                                                                        ...prev.ai,
                                                                        auto_routing: {
                                                                            ...prev.ai.auto_routing!,
                                                                            complex_model: e.target.value,
                                                                        }
                                                                    }
                                                                };
                                                            });
                                                        }}
                                                        placeholder="gpt-4.1"
                                                        style={settingsModalStyles.formInput}
                                                    />
                                                )}
                                                <div style={settingsModalStyles.formHint}>
                                                    For debugging, architecture, multi-step (complexity 70-100)
                                                </div>
                                            </div>

                                            {/* Context Budgets */}
                                            <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px', marginTop: '16px' }}>
                                                <label style={settingsModalStyles.formLabel}>Simple Tier Budget: {localSettings.ai.auto_routing?.simple_budget ?? 4000} tokens</label>
                                                <input
                                                    type="range"
                                                    min="2000"
                                                    max="8000"
                                                    step="500"
                                                    value={localSettings.ai.auto_routing?.simple_budget ?? 4000}
                                                    onChange={(e) => {
                                                        setLocalSettings(prev => {
                                                            if (!prev) return null;
                                                            return {
                                                                ...prev,
                                                                ai: {
                                                                    ...prev.ai,
                                                                    auto_routing: {
                                                                        ...prev.ai.auto_routing!,
                                                                        simple_budget: parseInt(e.target.value),
                                                                    }
                                                                }
                                                            };
                                                        });
                                                    }}
                                                    style={{ width: '100%' }}
                                                />
                                            </div>

                                            <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                                <label style={settingsModalStyles.formLabel}>Moderate Tier Budget: {localSettings.ai.auto_routing?.moderate_budget ?? 8000} tokens</label>
                                                <input
                                                    type="range"
                                                    min="4000"
                                                    max="12000"
                                                    step="500"
                                                    value={localSettings.ai.auto_routing?.moderate_budget ?? 8000}
                                                    onChange={(e) => {
                                                        setLocalSettings(prev => {
                                                            if (!prev) return null;
                                                            return {
                                                                ...prev,
                                                                ai: {
                                                                    ...prev.ai,
                                                                    auto_routing: {
                                                                        ...prev.ai.auto_routing!,
                                                                        moderate_budget: parseInt(e.target.value),
                                                                    }
                                                                }
                                                            };
                                                        });
                                                    }}
                                                    style={{ width: '100%' }}
                                                />
                                            </div>

                                            <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                                <label style={settingsModalStyles.formLabel}>Complex Tier Budget: {localSettings.ai.auto_routing?.complex_budget ?? 12000} tokens</label>
                                                <input
                                                    type="range"
                                                    min="6000"
                                                    max="20000"
                                                    step="1000"
                                                    value={localSettings.ai.auto_routing?.complex_budget ?? 12000}
                                                    onChange={(e) => {
                                                        setLocalSettings(prev => {
                                                            if (!prev) return null;
                                                            return {
                                                                ...prev,
                                                                ai: {
                                                                    ...prev.ai,
                                                                    auto_routing: {
                                                                        ...prev.ai.auto_routing!,
                                                                        complex_budget: parseInt(e.target.value),
                                                                    }
                                                                }
                                                            };
                                                        });
                                                    }}
                                                    style={{ width: '100%' }}
                                                />
                                            </div>

                                            {/* Additional Options */}
                                            <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px', marginTop: '16px' }}>
                                                <label style={settingsModalStyles.checkboxLabel}>
                                                    <input
                                                        type="checkbox"
                                                        checked={localSettings.ai.auto_routing?.enable_prompt_enhancement ?? true}
                                                        onChange={(e) => {
                                                            setLocalSettings(prev => {
                                                                if (!prev) return null;
                                                                return {
                                                                    ...prev,
                                                                    ai: {
                                                                        ...prev.ai,
                                                                        auto_routing: {
                                                                            ...prev.ai.auto_routing!,
                                                                            enable_prompt_enhancement: e.target.checked,
                                                                        }
                                                                    }
                                                                };
                                                            });
                                                        }}
                                                    />
                                                    <span>Enable prompt enhancement</span>
                                                </label>
                                                <div style={settingsModalStyles.formHint}>
                                                    Automatically improve vague queries (e.g., "fix this" becomes "fix this error in output.txt")
                                                </div>
                                            </div>

                                            <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                                <label style={settingsModalStyles.checkboxLabel}>
                                                    <input
                                                        type="checkbox"
                                                        checked={localSettings.ai.auto_routing?.show_routing_info ?? true}
                                                        onChange={(e) => {
                                                            setLocalSettings(prev => {
                                                                if (!prev) return null;
                                                                return {
                                                                    ...prev,
                                                                    ai: {
                                                                        ...prev.ai,
                                                                        auto_routing: {
                                                                            ...prev.ai.auto_routing!,
                                                                            show_routing_info: e.target.checked,
                                                                        }
                                                                    }
                                                                };
                                                            });
                                                        }}
                                                    />
                                                    <span>Show routing info in chat</span>
                                                </label>
                                                <div style={settingsModalStyles.formHint}>
                                                    Display which tier and model was selected for each query
                                                </div>
                                            </div>

                                            <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                                <label style={settingsModalStyles.formLabel}>Export Detail Level</label>
                                                <select
                                                    value={localSettings.ai.auto_routing?.export_routing_detail ?? 'standard'}
                                                    onChange={(e) => {
                                                        setLocalSettings(prev => {
                                                            if (!prev) return null;
                                                            return {
                                                                ...prev,
                                                                ai: {
                                                                    ...prev.ai,
                                                                    auto_routing: {
                                                                        ...prev.ai.auto_routing!,
                                                                        export_routing_detail: e.target.value as 'minimal' | 'standard' | 'detailed',
                                                                    }
                                                                }
                                                            };
                                                        });
                                                    }}
                                                    style={settingsModalStyles.formInput}
                                                >
                                                    <option value="minimal">Minimal (tier only)</option>
                                                    <option value="standard">Standard (tier + model)</option>
                                                    <option value="detailed">Detailed (full reasoning)</option>
                                                </select>
                                                <div style={settingsModalStyles.formHint}>
                                                    How much routing info to include in exports
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </>
                        )}

                        {activeTab === 'autocomplete' && (
                            <>
                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={localSettings.autocomplete?.enable_inline ?? true}
                                            onChange={(e) => handleChange('autocomplete', 'enable_inline', e.target.checked as any)}
                                        />
                                        <span>Enable inline suggestions (Fish-style)</span>
                                    </label>
                                    <div style={settingsModalStyles.formHint}>
                                        Shows command suggestions as gray text after your cursor. Press → (right arrow) to accept.
                                    </div>
                                </div>

                                {localSettings.autocomplete?.enable_inline && (
                                    <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                        <label>Inline Source</label>
                                        <select
                                            value={localSettings.autocomplete?.inline_source ?? 'history'}
                                            onChange={(e) => handleChange('autocomplete', 'inline_source', e.target.value)}
                                        >
                                            <option value="history">History (Fast, ~10ms)</option>
                                            <option value="llm">AI/LLM (Smart, ~150ms)</option>
                                            <option value="hybrid">Hybrid (Best of both)</option>
                                        </select>
                                        <div style={settingsModalStyles.formHint}>
                                            <strong>History:</strong> Matches from your shell history<br/>
                                            <strong>AI/LLM:</strong> Local Qwen3-0.6B model generates smart completions<br/>
                                            <strong>Hybrid:</strong> Shows history immediately, upgrades to AI if better
                                        </div>
                                    </div>
                                )}

                                {localSettings.autocomplete?.inline_source === 'llm' && (
                                    <>
                                        <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                            <label>LLM Temperature (0.0 - 1.0)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="1"
                                                step="0.1"
                                                value={localSettings.autocomplete?.llm_temperature ?? 0.1}
                                                onChange={(e) => handleChange('autocomplete', 'llm_temperature', parseFloat(e.target.value))}
                                            />
                                            <div style={settingsModalStyles.formHint}>
                                                Lower = more focused, Higher = more creative. Recommended: 0.1
                                            </div>
                                        </div>
                                        <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                            <label>Max Tokens</label>
                                            <input
                                                type="number"
                                                min="5"
                                                max="50"
                                                value={localSettings.autocomplete?.llm_max_tokens ?? 15}
                                                onChange={(e) => handleChange('autocomplete', 'llm_max_tokens', parseInt(e.target.value))}
                                            />
                                            <div style={settingsModalStyles.formHint}>
                                                Lower = faster, Higher = longer completions. Recommended: 15
                                            </div>
                                        </div>
                                        <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                            <label>Debounce (ms)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="1000"
                                                step="50"
                                                value={localSettings.autocomplete?.llm_debounce_ms ?? 300}
                                                onChange={(e) => handleChange('autocomplete', 'llm_debounce_ms', parseInt(e.target.value))}
                                            />
                                            <div style={settingsModalStyles.formHint}>
                                                Delay before querying LLM. Lower = more responsive but more queries. Recommended: 300ms
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={localSettings.autocomplete?.enable_menu ?? true}
                                            onChange={(e) => handleChange('autocomplete', 'enable_menu', e.target.checked as any)}
                                        />
                                        <span>Enable suggestion menu (Ctrl+Space)</span>
                                    </label>
                                    <div style={settingsModalStyles.formHint}>
                                        Press Ctrl+Space to see all available commands, flags, and options in a dropdown menu.
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div style={settingsModalStyles.footer}>
                    <button 
                        {...getProps('cancelBtn', {
                            base: { ...settingsModalStyles.button, ...settingsModalStyles.buttonSecondary },
                            hover: settingsModalStyles.buttonHover,
                        })}
                        onClick={onClose}
                    >Cancel</button>
                    <button 
                        {...getProps('saveBtn', {
                            base: { ...settingsModalStyles.button, ...settingsModalStyles.buttonPrimary },
                            hover: settingsModalStyles.buttonHover,
                        })}
                        onClick={handleSave}
                    >Save</button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
