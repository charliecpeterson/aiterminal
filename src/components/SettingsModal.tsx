import React, { useState, useEffect } from 'react';
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

    useEffect(() => {
        if (settings) {
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

    if (!isOpen || !localSettings) return null;

    const handleSave = async () => {
        if (localSettings) {
            await updateSettings(localSettings);
            onClose();
        }
    };

    const handleChange = (section: 'appearance' | 'terminal' | 'ai', key: string, value: any) => {
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
    };

    const handleTestConnection = async () => {
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
    };

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
                                        value={localSettings.appearance.font_size}
                                        onChange={(e) => handleChange('appearance', 'font_size', parseInt(e.target.value))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Font Family</label>
                                    <input 
                                        type="text" 
                                        value={localSettings.appearance.font_family}
                                        onChange={(e) => handleChange('appearance', 'font_family', e.target.value)}
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
                                        value={localSettings.ai.api_key}
                                        onChange={(e) => handleChange('ai', 'api_key', e.target.value)}
                                        placeholder="sk-..."
                                    />
                                </div>
                                <div className="form-group">
                                    <label>URL (Optional)</label>
                                    <input 
                                        type="text" 
                                        value={localSettings.ai.url || ''}
                                        onChange={(e) => handleChange('ai', 'url', e.target.value)}
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
                                            {aiModelOptions.map((model) => (
                                                <option key={model} value={model}>
                                                    {model}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input 
                                            type="text" 
                                            value={localSettings.ai.model}
                                            onChange={(e) => handleChange('ai', 'model', e.target.value)}
                                            placeholder="e.g. gpt-4o"
                                            list="ai-model-options"
                                        />
                                    )}
                                    {aiModelOptions.length > 0 && (
                                        <datalist id="ai-model-options">
                                            {aiModelOptions.map((model) => (
                                                <option key={model} value={model} />
                                            ))}
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
                                            {aiEmbeddingOptions.map((model) => (
                                                <option key={model} value={model}>
                                                    {model}
                                                </option>
                                            ))}
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
                                            {aiEmbeddingOptions.map((model) => (
                                                <option key={model} value={model} />
                                            ))}
                                        </datalist>
                                    )}
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
