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
    const [activeTab, setActiveTab] = useState<'appearance' | 'terminal' | 'ai'>('appearance');
    const [aiTestStatus, setAiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [aiTestError, setAiTestError] = useState<string | null>(null);
    const [aiModelOptions, setAiModelOptions] = useState<string[]>([]);
    const [aiEmbeddingOptions, setAiEmbeddingOptions] = useState<string[]>([]);

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

    const handleChange = useCallback((section: 'appearance' | 'terminal' | 'ai', key: string, value: string | number) => {
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
