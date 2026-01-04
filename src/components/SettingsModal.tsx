import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettings, AppSettings } from '../context/SettingsContext';
import './SettingsModal.css';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { settings, updateSettings } = useSettings();
    const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);
    const [activeTab, setActiveTab] = useState<'appearance' | 'terminal' | 'ai' | 'autocomplete' | 'fold'>('appearance');
    const [aiTestStatus, setAiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [aiTestError, setAiTestError] = useState<string | null>(null);
    const [aiModelOptions, setAiModelOptions] = useState<string[]>([]);
    const [aiEmbeddingOptions, setAiEmbeddingOptions] = useState<string[]>([]);
    const [keychainStatus, setKeychainStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
    const [keychainMessage, setKeychainMessage] = useState<string | null>(null);

    // Load settings when modal opens
    useEffect(() => {
        if (isOpen && settings) {
            console.log('📋 Loading settings into modal:', settings);
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

    const handleChange = useCallback((section: 'appearance' | 'terminal' | 'ai' | 'autocomplete' | 'fold', key: string, value: string | number | boolean) => {
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
        console.log('⚠️ Settings not available in context');
        return (
            <div className="settings-overlay" onClick={onClose}>
                <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="settings-header">
                        <h2>Settings</h2>
                        <button className="settings-close" onClick={onClose}>×</button>
                    </div>
                    <div style={{ padding: '20px', textAlign: 'center' }}>
                        <p>Loading settings...</p>
                        <p style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
                            If this persists, try refreshing the page.
                        </p>
                    </div>
                </div>
            </div>
        );
    }
    
    if (!localSettings) {
        return (
            <div className="settings-overlay" onClick={onClose}>
                <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="settings-header">
                        <h2>Settings</h2>
                        <button className="settings-close" onClick={onClose}>×</button>
                    </div>
                    <div style={{ padding: '20px', textAlign: 'center' }}>Initializing...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="settings-modal-overlay" onClick={onClose}>
            <div className="settings-modal" onClick={e => e.stopPropagation()}>
                <div className="settings-header">
                    <h2>Settings</h2>
                    <button className="close-button" onClick={onClose}>×</button>
                </div>
                
                <div className="settings-content">
                    <div className="settings-sidebar">
                        <div 
                            className={`settings-tab ${activeTab === 'appearance' ? 'active' : ''}`}
                            onClick={() => setActiveTab('appearance')}
                        >
                            Appearance
                        </div>
                        <div 
                            className={`settings-tab ${activeTab === 'ai' ? 'active' : ''}`}
                            onClick={() => setActiveTab('ai')}
                        >
                            AI
                        </div>
                        <div 
                            className={`settings-tab ${activeTab === 'terminal' ? 'active' : ''}`}
                            onClick={() => setActiveTab('terminal')}
                        >
                            Terminal
                        </div>
                        <div 
                            className={`settings-tab ${activeTab === 'autocomplete' ? 'active' : ''}`}
                            onClick={() => setActiveTab('autocomplete')}
                        >
                            Autocomplete
                        </div>
                        <div 
                            className={`settings-tab ${activeTab === 'fold' ? 'active' : ''}`}
                            onClick={() => setActiveTab('fold')}
                        >
                            Output Folding
                        </div>
                    </div>

                    <div className="settings-panel">
                        {activeTab === 'appearance' && (
                            <>
                                <div className="form-group">
                                    <label>Font Size</label>
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
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Font Family</label>
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
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Theme</label>
                                    <select 
                                        value={localSettings.appearance.theme}
                                        onChange={(e) => handleChange('appearance', 'theme', e.target.value)}
                                    >
                                        <option value="dark">Dark</option>
                                        <option value="light">Light</option>
                                    </select>
                                </div>
                            </>
                        )}

                        {activeTab === 'terminal' && (
                            <>
                                <div className="form-group">
                                    <label>Max Markers</label>
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
                                    />
                                </div>
                            </>
                        )}

                        {activeTab === 'ai' && (
                            <>
                                <div className="form-group">
                                    <label>Provider</label>
                                    <select 
                                        value={localSettings.ai.provider}
                                        onChange={(e) => handleChange('ai', 'provider', e.target.value)}
                                    >
                                        <option value="openai">OpenAI</option>
                                        <option value="anthropic">Anthropic</option>
                                        <option value="gemini">Gemini</option>
                                        <option value="ollama">Ollama</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>API Key</label>
                                    <input 
                                        type="password" 
                                        value={localSettings.ai.api_key || ''}
                                        onChange={(e) => handleChange('ai', 'api_key', e.target.value)}
                                        placeholder="sk-..."
                                    />
                                </div>
                                <div className="form-group">
                                    <label>URL (Optional)</label>
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
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Connection</label>
                                    <div className="ai-connection-row">
                                        <button
                                            className="btn btn-secondary"
                                            onClick={handleTestConnection}
                                            disabled={aiTestStatus === 'testing'}
                                        >
                                            {aiTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                                        </button>
                                        <span className={`ai-connection-status ${aiTestStatus}`}>
                                            {aiTestStatus === 'success'
                                                ? 'Connected'
                                                : aiTestStatus === 'error'
                                                ? 'Failed'
                                                : 'Not tested'}
                                        </span>
                                    </div>
                                    {aiTestError && (
                                        <div className="ai-connection-error">{aiTestError}</div>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label>Secure Storage</label>
                                    <div className="ai-connection-row">
                                        <button
                                            className="btn btn-secondary"
                                            onClick={handleSaveToKeychain}
                                            disabled={!localSettings.ai.api_key || keychainStatus === 'saving'}
                                        >
                                            {keychainStatus === 'saving' ? 'Saving...' : 'Save to Keychain'}
                                        </button>
                                        <span className={`ai-connection-status ${keychainStatus}`}>
                                            {keychainStatus === 'success'
                                                ? keychainMessage || 'Saved'
                                                : keychainStatus === 'error'
                                                ? keychainMessage || 'Failed'
                                                : 'Store API key securely'}
                                        </span>
                                    </div>
                                </div>
                                <div className="form-group">
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
                                <div className="form-group">
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
                                <div className="form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={localSettings.ai.require_command_approval !== false}
                                            onChange={(e) => handleChange('ai', 'require_command_approval', e.target.checked as any)}
                                        />
                                        <span>Require approval before executing commands</span>
                                    </label>
                                    <div className="form-hint">
                                        When enabled, the AI will ask for permission before running potentially destructive commands (rm, sudo, etc.). Safe read-only commands run automatically.
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'autocomplete' && (
                            <>
                                <div className="form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={localSettings.autocomplete?.enable_inline ?? true}
                                            onChange={(e) => handleChange('autocomplete', 'enable_inline', e.target.checked as any)}
                                        />
                                        <span>Enable inline suggestions (Fish-style)</span>
                                    </label>
                                    <div className="form-hint">
                                        Shows command suggestions as gray text after your cursor. Press → (right arrow) to accept.
                                    </div>
                                </div>

                                {localSettings.autocomplete?.enable_inline && (
                                    <div className="form-group" style={{ marginLeft: '24px' }}>
                                        <label>Inline Source</label>
                                        <select
                                            value={localSettings.autocomplete?.inline_source ?? 'history'}
                                            onChange={(e) => handleChange('autocomplete', 'inline_source', e.target.value)}
                                        >
                                            <option value="history">History (Fast, ~10ms)</option>
                                            <option value="llm">AI/LLM (Smart, ~150ms)</option>
                                            <option value="hybrid">Hybrid (Best of both)</option>
                                        </select>
                                        <div className="form-hint">
                                            <strong>History:</strong> Matches from your shell history<br/>
                                            <strong>AI/LLM:</strong> Local Qwen3-0.6B model generates smart completions<br/>
                                            <strong>Hybrid:</strong> Shows history immediately, upgrades to AI if better
                                        </div>
                                    </div>
                                )}

                                {localSettings.autocomplete?.inline_source === 'llm' && (
                                    <>
                                        <div className="form-group" style={{ marginLeft: '24px' }}>
                                            <label>LLM Temperature (0.0 - 1.0)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="1"
                                                step="0.1"
                                                value={localSettings.autocomplete?.llm_temperature ?? 0.1}
                                                onChange={(e) => handleChange('autocomplete', 'llm_temperature', parseFloat(e.target.value))}
                                            />
                                            <div className="form-hint">
                                                Lower = more focused, Higher = more creative. Recommended: 0.1
                                            </div>
                                        </div>
                                        <div className="form-group" style={{ marginLeft: '24px' }}>
                                            <label>Max Tokens</label>
                                            <input
                                                type="number"
                                                min="5"
                                                max="50"
                                                value={localSettings.autocomplete?.llm_max_tokens ?? 15}
                                                onChange={(e) => handleChange('autocomplete', 'llm_max_tokens', parseInt(e.target.value))}
                                            />
                                            <div className="form-hint">
                                                Lower = faster, Higher = longer completions. Recommended: 15
                                            </div>
                                        </div>
                                        <div className="form-group" style={{ marginLeft: '24px' }}>
                                            <label>Debounce (ms)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="1000"
                                                step="50"
                                                value={localSettings.autocomplete?.llm_debounce_ms ?? 300}
                                                onChange={(e) => handleChange('autocomplete', 'llm_debounce_ms', parseInt(e.target.value))}
                                            />
                                            <div className="form-hint">
                                                Delay before querying LLM. Lower = more responsive but more queries. Recommended: 300ms
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div className="form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={localSettings.autocomplete?.enable_menu ?? true}
                                            onChange={(e) => handleChange('autocomplete', 'enable_menu', e.target.checked as any)}
                                        />
                                        <span>Enable suggestion menu (Ctrl+Space)</span>
                                    </label>
                                    <div className="form-hint">
                                        Press Ctrl+Space to see all available commands, flags, and options in a dropdown menu.
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'fold' && (
                            <>
                                <div className="form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={localSettings.fold?.enabled ?? true}
                                            onChange={(e) => handleChange('fold', 'enabled', e.target.checked as any)}
                                        />
                                        <span>Enable output folding</span>
                                    </label>
                                    <div className="form-hint">
                                        Show a notification bar when commands produce large outputs, with option to view in a separate window.
                                    </div>
                                </div>

                                {localSettings.fold?.enabled && (
                                    <>
                                        <div className="form-group" style={{ marginLeft: '24px' }}>
                                            <label>Notification threshold (lines)</label>
                                            <input
                                                type="number"
                                                min="10"
                                                max="500"
                                                value={localSettings.fold?.threshold ?? 30}
                                                onChange={(e) => handleChange('fold', 'threshold', parseInt(e.target.value))}
                                            />
                                            <div className="form-hint">
                                                Show notification bar when output exceeds this many lines. Default: 30
                                            </div>
                                        </div>

                                        <div className="form-group" style={{ marginLeft: '24px' }}>
                                            <label>Preview lines</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="10"
                                                value={localSettings.fold?.show_preview_lines ?? 3}
                                                onChange={(e) => handleChange('fold', 'show_preview_lines', parseInt(e.target.value))}
                                            />
                                            <div className="form-hint">
                                                Number of output lines to show in notification preview. Default: 3
                                            </div>
                                        </div>

                                        <div className="form-group" style={{ marginLeft: '24px' }}>
                                            <label>Large output threshold (lines)</label>
                                            <input
                                                type="number"
                                                min="100"
                                                max="5000"
                                                value={localSettings.fold?.large_threshold ?? 500}
                                                onChange={(e) => handleChange('fold', 'large_threshold', parseInt(e.target.value))}
                                            />
                                            <div className="form-hint">
                                                Outputs larger than this are considered "very large". Default: 500
                                            </div>
                                        </div>

                                        <div className="form-group" style={{ marginLeft: '24px' }}>
                                            <label className="checkbox-label">
                                                <input
                                                    type="checkbox"
                                                    checked={localSettings.fold?.auto_open_window ?? false}
                                                    onChange={(e) => handleChange('fold', 'auto_open_window', e.target.checked as any)}
                                                />
                                                <span>Auto-open window for large outputs</span>
                                            </label>
                                            <div className="form-hint">
                                                Automatically open viewer window when output exceeds large threshold.
                                            </div>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div className="settings-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
