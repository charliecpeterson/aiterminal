import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettings, AppSettings } from '../context/SettingsContext';
import { settingsModalStyles } from './SettingsModal.styles';

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

    // Hover and focus states for interactive elements
    const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({});
    const [focusStates, setFocusStates] = useState<Record<string, boolean>>({});

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
        return (
            <div style={settingsModalStyles.overlay} onClick={onClose}>
                <div style={settingsModalStyles.modal} onClick={(e) => e.stopPropagation()}>
                    <div style={settingsModalStyles.header}>
                        <h2 style={settingsModalStyles.headerTitle}>Settings</h2>
                        <button 
                            style={
                                hoverStates.closeBtn
                                    ? { ...settingsModalStyles.closeButton, ...settingsModalStyles.closeButtonHover }
                                    : settingsModalStyles.closeButton
                            }
                            onClick={onClose}
                            onMouseEnter={() => setHoverStates(prev => ({ ...prev, closeBtn: true }))}
                            onMouseLeave={() => setHoverStates(prev => ({ ...prev, closeBtn: false }))}
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
                            style={
                                hoverStates.closeBtn2
                                    ? { ...settingsModalStyles.closeButton, ...settingsModalStyles.closeButtonHover }
                                    : settingsModalStyles.closeButton
                            }
                            onClick={onClose}
                            onMouseEnter={() => setHoverStates(prev => ({ ...prev, closeBtn2: true }))}
                            onMouseLeave={() => setHoverStates(prev => ({ ...prev, closeBtn2: false }))}
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
                            style={
                                hoverStates.closeBtn3
                                    ? { ...settingsModalStyles.closeButton, ...settingsModalStyles.closeButtonHover }
                                    : settingsModalStyles.closeButton
                            }
                            onClick={onClose}
                            onMouseEnter={() => setHoverStates(prev => ({ ...prev, closeBtn3: true }))}
                            onMouseLeave={() => setHoverStates(prev => ({ ...prev, closeBtn3: false }))}
                        >×</button>
                </div>
                
                <div style={settingsModalStyles.content}>
                    <div style={settingsModalStyles.sidebar}>
                        <div 
                            style={
                                activeTab === 'appearance'
                                    ? { ...settingsModalStyles.tab, ...settingsModalStyles.tabActive }
                                    : hoverStates.tabAppearance
                                        ? { ...settingsModalStyles.tab, ...settingsModalStyles.tabHover }
                                        : settingsModalStyles.tab
                            }
                            onClick={() => setActiveTab('appearance')}
                            onMouseEnter={() => setHoverStates(prev => ({ ...prev, tabAppearance: true }))}
                            onMouseLeave={() => setHoverStates(prev => ({ ...prev, tabAppearance: false }))}
                        >
                            Appearance
                        </div>
                        <div 
                            style={
                                activeTab === 'ai'
                                    ? { ...settingsModalStyles.tab, ...settingsModalStyles.tabActive }
                                    : hoverStates.tabAi
                                        ? { ...settingsModalStyles.tab, ...settingsModalStyles.tabHover }
                                        : settingsModalStyles.tab
                            }
                            onClick={() => setActiveTab('ai')}
                            onMouseEnter={() => setHoverStates(prev => ({ ...prev, tabAi: true }))}
                            onMouseLeave={() => setHoverStates(prev => ({ ...prev, tabAi: false }))}
                        >
                            AI
                        </div>
                        <div 
                            style={
                                activeTab === 'terminal'
                                    ? { ...settingsModalStyles.tab, ...settingsModalStyles.tabActive }
                                    : hoverStates.tabTerminal
                                        ? { ...settingsModalStyles.tab, ...settingsModalStyles.tabHover }
                                        : settingsModalStyles.tab
                            }
                            onClick={() => setActiveTab('terminal')}
                            onMouseEnter={() => setHoverStates(prev => ({ ...prev, tabTerminal: true }))}
                            onMouseLeave={() => setHoverStates(prev => ({ ...prev, tabTerminal: false }))}
                        >
                            Terminal
                        </div>
                        <div 
                            style={
                                activeTab === 'autocomplete'
                                    ? { ...settingsModalStyles.tab, ...settingsModalStyles.tabActive }
                                    : hoverStates.tabAutocomplete
                                        ? { ...settingsModalStyles.tab, ...settingsModalStyles.tabHover }
                                        : settingsModalStyles.tab
                            }
                            onClick={() => setActiveTab('autocomplete')}
                            onMouseEnter={() => setHoverStates(prev => ({ ...prev, tabAutocomplete: true }))}
                            onMouseLeave={() => setHoverStates(prev => ({ ...prev, tabAutocomplete: false }))}
                        >
                            Autocomplete
                        </div>
                        <div 
                            style={
                                activeTab === 'fold'
                                    ? { ...settingsModalStyles.tab, ...settingsModalStyles.tabActive }
                                    : hoverStates.tabFold
                                        ? { ...settingsModalStyles.tab, ...settingsModalStyles.tabHover }
                                        : settingsModalStyles.tab
                            }
                            onClick={() => setActiveTab('fold')}
                            onMouseEnter={() => setHoverStates(prev => ({ ...prev, tabFold: true }))}
                            onMouseLeave={() => setHoverStates(prev => ({ ...prev, tabFold: false }))}
                        >
                            Output Folding
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
                                        style={
                                            focusStates.fontSize
                                                ? { ...settingsModalStyles.formInput, ...settingsModalStyles.formInputFocus }
                                                : settingsModalStyles.formInput
                                        }
                                        onFocus={() => setFocusStates(prev => ({ ...prev, fontSize: true }))}
                                        onBlur={() => setFocusStates(prev => ({ ...prev, fontSize: false }))}
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
                                        style={
                                            focusStates.fontFamily
                                                ? { ...settingsModalStyles.formInput, ...settingsModalStyles.formInputFocus }
                                                : settingsModalStyles.formInput
                                        }
                                        onFocus={() => setFocusStates(prev => ({ ...prev, fontFamily: true }))}
                                        onBlur={() => setFocusStates(prev => ({ ...prev, fontFamily: false }))}
                                    />
                                </div>
                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.formLabel}>Theme</label>
                                    <select 
                                        value={localSettings.appearance.theme}
                                        onChange={(e) => handleChange('appearance', 'theme', e.target.value)}
                                        style={
                                            focusStates.theme
                                                ? { ...settingsModalStyles.formInput, ...settingsModalStyles.formInputFocus }
                                                : settingsModalStyles.formInput
                                        }
                                        onFocus={() => setFocusStates(prev => ({ ...prev, theme: true }))}
                                        onBlur={() => setFocusStates(prev => ({ ...prev, theme: false }))}
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
                                        style={
                                            focusStates.maxMarkers
                                                ? { ...settingsModalStyles.formInput, ...settingsModalStyles.formInputFocus }
                                                : settingsModalStyles.formInput
                                        }
                                        onFocus={() => setFocusStates(prev => ({ ...prev, maxMarkers: true }))}
                                        onBlur={() => setFocusStates(prev => ({ ...prev, maxMarkers: false }))}
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
                                        style={
                                            focusStates.provider
                                                ? { ...settingsModalStyles.formInput, ...settingsModalStyles.formInputFocus }
                                                : settingsModalStyles.formInput
                                        }
                                        onFocus={() => setFocusStates(prev => ({ ...prev, provider: true }))}
                                        onBlur={() => setFocusStates(prev => ({ ...prev, provider: false }))}
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
                                        style={
                                            focusStates.apiKey
                                                ? { ...settingsModalStyles.formInput, ...settingsModalStyles.formInputFocus }
                                                : settingsModalStyles.formInput
                                        }
                                        onFocus={() => setFocusStates(prev => ({ ...prev, apiKey: true }))}
                                        onBlur={() => setFocusStates(prev => ({ ...prev, apiKey: false }))}
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
                                        style={
                                            focusStates.url
                                                ? { ...settingsModalStyles.formInput, ...settingsModalStyles.formInputFocus }
                                                : settingsModalStyles.formInput
                                        }
                                        onFocus={() => setFocusStates(prev => ({ ...prev, url: true }))}
                                        onBlur={() => setFocusStates(prev => ({ ...prev, url: false }))}
                                    />
                                </div>
                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.formLabel}>Connection</label>
                                    <div style={settingsModalStyles.aiConnectionRow}>
                                        <button
                                            style={
                                                aiTestStatus === 'testing'
                                                    ? { ...settingsModalStyles.button, ...settingsModalStyles.buttonSecondary, ...settingsModalStyles.buttonDisabled }
                                                    : hoverStates.testBtn
                                                        ? { ...settingsModalStyles.button, ...settingsModalStyles.buttonSecondary, ...settingsModalStyles.buttonHover }
                                                        : { ...settingsModalStyles.button, ...settingsModalStyles.buttonSecondary }
                                            }
                                            onClick={handleTestConnection}
                                            disabled={aiTestStatus === 'testing'}
                                            onMouseEnter={() => setHoverStates(prev => ({ ...prev, testBtn: true }))}
                                            onMouseLeave={() => setHoverStates(prev => ({ ...prev, testBtn: false }))}
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
                                            style={
                                                (!localSettings.ai.api_key || keychainStatus === 'saving')
                                                    ? { ...settingsModalStyles.button, ...settingsModalStyles.buttonSecondary, ...settingsModalStyles.buttonDisabled }
                                                    : hoverStates.keychainBtn
                                                        ? { ...settingsModalStyles.button, ...settingsModalStyles.buttonSecondary, ...settingsModalStyles.buttonHover }
                                                        : { ...settingsModalStyles.button, ...settingsModalStyles.buttonSecondary }
                                            }
                                            onClick={handleSaveToKeychain}
                                            disabled={!localSettings.ai.api_key || keychainStatus === 'saving'}
                                            onMouseEnter={() => setHoverStates(prev => ({ ...prev, keychainBtn: true }))}
                                            onMouseLeave={() => setHoverStates(prev => ({ ...prev, keychainBtn: false }))}
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

                        {activeTab === 'fold' && (
                            <>
                                <div style={settingsModalStyles.formGroup}>
                                    <label style={settingsModalStyles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={localSettings.fold?.enabled ?? true}
                                            onChange={(e) => handleChange('fold', 'enabled', e.target.checked as any)}
                                        />
                                        <span>Enable output folding</span>
                                    </label>
                                    <div style={settingsModalStyles.formHint}>
                                        Show a notification bar when commands produce large outputs, with option to view in a separate window.
                                    </div>
                                </div>

                                {localSettings.fold?.enabled && (
                                    <>
                                        <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                            <label>Notification threshold (lines)</label>
                                            <input
                                                type="number"
                                                min="10"
                                                max="500"
                                                value={localSettings.fold?.threshold ?? 30}
                                                onChange={(e) => handleChange('fold', 'threshold', parseInt(e.target.value))}
                                            />
                                            <div style={settingsModalStyles.formHint}>
                                                Show notification bar when output exceeds this many lines. Default: 30
                                            </div>
                                        </div>

                                        <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                            <label>Preview lines</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="10"
                                                value={localSettings.fold?.show_preview_lines ?? 3}
                                                onChange={(e) => handleChange('fold', 'show_preview_lines', parseInt(e.target.value))}
                                            />
                                            <div style={settingsModalStyles.formHint}>
                                                Number of output lines to show in notification preview. Default: 3
                                            </div>
                                        </div>

                                        <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                            <label>Large output threshold (lines)</label>
                                            <input
                                                type="number"
                                                min="100"
                                                max="5000"
                                                value={localSettings.fold?.large_threshold ?? 500}
                                                onChange={(e) => handleChange('fold', 'large_threshold', parseInt(e.target.value))}
                                            />
                                            <div style={settingsModalStyles.formHint}>
                                                Outputs larger than this are considered "very large". Default: 500
                                            </div>
                                        </div>

                                        <div style={{ ...settingsModalStyles.formGroup, marginLeft: '24px' }}>
                                            <label style={settingsModalStyles.checkboxLabel}>
                                                <input
                                                    type="checkbox"
                                                    checked={localSettings.fold?.auto_open_window ?? false}
                                                    onChange={(e) => handleChange('fold', 'auto_open_window', e.target.checked as any)}
                                                />
                                                <span>Auto-open window for large outputs</span>
                                            </label>
                                            <div style={settingsModalStyles.formHint}>
                                                Automatically open viewer window when output exceeds large threshold.
                                            </div>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div style={settingsModalStyles.footer}>
                    <button 
                        style={
                            hoverStates.cancelBtn
                                ? { ...settingsModalStyles.button, ...settingsModalStyles.buttonSecondary, ...settingsModalStyles.buttonHover }
                                : { ...settingsModalStyles.button, ...settingsModalStyles.buttonSecondary }
                        }
                        onClick={onClose}
                        onMouseEnter={() => setHoverStates(prev => ({ ...prev, cancelBtn: true }))}
                        onMouseLeave={() => setHoverStates(prev => ({ ...prev, cancelBtn: false }))}
                    >Cancel</button>
                    <button 
                        style={
                            hoverStates.saveBtn
                                ? { ...settingsModalStyles.button, ...settingsModalStyles.buttonPrimary, ...settingsModalStyles.buttonHover }
                                : { ...settingsModalStyles.button, ...settingsModalStyles.buttonPrimary }
                        }
                        onClick={handleSave}
                        onMouseEnter={() => setHoverStates(prev => ({ ...prev, saveBtn: true }))}
                        onMouseLeave={() => setHoverStates(prev => ({ ...prev, saveBtn: false }))}
                    >Save</button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
