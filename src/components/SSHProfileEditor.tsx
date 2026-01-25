import React, { useState, useEffect } from 'react';
import { SSHProfile } from '../types/ssh';
import { useSSHProfiles } from '../context/SSHProfilesContext';
import {
  sshProfileEditorStyles,
  getCloseButtonStyle,
  getFormInputStyle,
  getRemoveButtonStyle,
  getAddItemButtonStyle,
  getCancelButtonStyle,
  getSaveButtonStyle,
} from './SSHProfileEditor.styles';

interface SSHProfileEditorProps {
  profile?: SSHProfile;  // undefined = create new, defined = edit existing
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: SSHProfile) => void;
}

export const SSHProfileEditor: React.FC<SSHProfileEditorProps> = ({
  profile,
  isOpen,
  onClose,
  onSave,
}) => {
  const textInputProps = {
    autoCorrect: 'off',
    autoCapitalize: 'none',
    spellCheck: false,
  };
  const { sshConfigHosts, profiles } = useSSHProfiles();
  const isEdit = Boolean(profile);

  // Get all existing groups from profiles
  const existingGroups = React.useMemo(() => {
    const groups = new Set(profiles.map(p => p.group).filter(g => g));
    return Array.from(groups).sort();
  }, [profiles]);

  // Form state
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [connectionType, setConnectionType] = useState<'ssh-config' | 'manual'>('ssh-config');
  const [sshConfigHost, setSSHConfigHost] = useState('');
  
  // Manual config
  const [hostname, setHostname] = useState('');
  const [username, setUsername] = useState('');
  const [port, setPort] = useState('22');
  const [identityFile, setIdentityFile] = useState('');
  const [proxyJump, setProxyJump] = useState('');
  
  // Post-connection
  const [startupCommands, setStartupCommands] = useState<string[]>([]);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  
  // Options
  const [autoConnect, setAutoConnect] = useState(false);
  const [healthCheckInterval, setHealthCheckInterval] = useState('30');
  const [alertOnDisconnect, setAlertOnDisconnect] = useState(false);

  // Hover and focus states for interactive elements
  const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({});
  const [focusStates, setFocusStates] = useState<Record<string, boolean>>({});

  // Load profile data when editing
  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setGroup(profile.group || '');
      setConnectionType(profile.connectionType);
      setSSHConfigHost(profile.sshConfigHost || '');
      
      if (profile.manualConfig) {
        setHostname(profile.manualConfig.hostname);
        setUsername(profile.manualConfig.username);
        setPort(String(profile.manualConfig.port || 22));
        setIdentityFile(profile.manualConfig.identityFile || '');
        setProxyJump(profile.manualConfig.proxyJump || '');
      }
      
      setStartupCommands(profile.startupCommands || []);
      setEnvVars(profile.envVars || {});
      setAutoConnect(profile.autoConnect || false);
      setHealthCheckInterval(String(profile.healthCheckInterval || 30));
      setAlertOnDisconnect(profile.alertOnDisconnect || false);
    }
  }, [profile]);

  const handleSave = () => {
    const newProfile: SSHProfile = {
      id: profile?.id || `ssh-${Date.now()}`,
      name: name.trim(),
      group: group.trim() || undefined,
      connectionType,
      sshConfigHost: connectionType === 'ssh-config' ? sshConfigHost : undefined,
      manualConfig: connectionType === 'manual' ? {
        hostname: hostname.trim(),
        username: username.trim(),
        port: parseInt(port) || 22,
        identityFile: identityFile.trim() || undefined,
        proxyJump: proxyJump.trim() || undefined,
      } : undefined,
      startupCommands: startupCommands.filter(cmd => cmd.trim().length > 0),
      envVars: Object.keys(envVars).length > 0 ? envVars : undefined,
      autoConnect,
      healthCheckInterval: parseInt(healthCheckInterval) || 30,
      alertOnDisconnect,
      createdAt: profile?.createdAt || new Date().toISOString(),
      lastConnectedAt: profile?.lastConnectedAt,
      connectionCount: profile?.connectionCount || 0,
    };

    onSave(newProfile);
    onClose();
  };

  const addStartupCommand = () => {
    setStartupCommands([...startupCommands, '']);
  };

  const updateStartupCommand = (index: number, value: string) => {
    const updated = [...startupCommands];
    updated[index] = value;
    setStartupCommands(updated);
  };

  const removeStartupCommand = (index: number) => {
    setStartupCommands(startupCommands.filter((_, i) => i !== index));
  };

  const addEnvVar = () => {
    const key = prompt('Environment variable name:');
    if (key && key.trim()) {
      setEnvVars({ ...envVars, [key.trim()]: '' });
    }
  };

  const updateEnvVar = (key: string, value: string) => {
    setEnvVars({ ...envVars, [key]: value });
  };

  const removeEnvVar = (key: string) => {
    const updated = { ...envVars };
    delete updated[key];
    setEnvVars(updated);
  };

  if (!isOpen) return null;

  const canSave = name.trim().length > 0 && (
    (connectionType === 'ssh-config' && sshConfigHost) ||
    (connectionType === 'manual' && hostname.trim() && username.trim())
  );

  return (
    <div style={sshProfileEditorStyles.overlay} onClick={onClose}>
      <div style={sshProfileEditorStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={sshProfileEditorStyles.header}>
          <h2 style={sshProfileEditorStyles.headerTitle}>{isEdit ? 'Edit' : 'New'} SSH Profile</h2>
          <button 
            style={getCloseButtonStyle(hoverStates.closeBtn || false)}
            onClick={onClose}
            onMouseEnter={() => setHoverStates(prev => ({ ...prev, closeBtn: true }))}
            onMouseLeave={() => setHoverStates(prev => ({ ...prev, closeBtn: false }))}
          >×</button>
        </div>

        <div style={sshProfileEditorStyles.content}>
          {/* Basic Info */}
          <section style={sshProfileEditorStyles.section}>
            <h3 style={sshProfileEditorStyles.sectionTitle}>Basic</h3>
            <div style={sshProfileEditorStyles.formRow}>
              <label style={sshProfileEditorStyles.formLabel}>
                Name *
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g., Prod Cluster"
                  style={getFormInputStyle(focusStates.nameInput || false)}
                  onFocus={() => setFocusStates(prev => ({ ...prev, nameInput: true }))}
                  onBlur={() => setFocusStates(prev => ({ ...prev, nameInput: false }))}
                  {...textInputProps}
                />
              </label>
            </div>
            <div style={sshProfileEditorStyles.formRow}>
              <label style={sshProfileEditorStyles.formLabel}>
                Group
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={group}
                    onChange={e => setGroup(e.target.value)}
                    style={{ 
                      ...getFormInputStyle(focusStates.groupSelect || false),
                      flex: 1 
                    }}
                    onFocus={() => setFocusStates(prev => ({ ...prev, groupSelect: true }))}
                    onBlur={() => setFocusStates(prev => ({ ...prev, groupSelect: false }))}
                  >
                    <option value="">Ungrouped</option>
                    {existingGroups.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={group}
                    onChange={e => setGroup(e.target.value)}
                    placeholder="Or create new group"
                    style={{ 
                      ...getFormInputStyle(focusStates.groupInput || false),
                      flex: 1 
                    }}
                    onFocus={() => setFocusStates(prev => ({ ...prev, groupInput: true }))}
                    onBlur={() => setFocusStates(prev => ({ ...prev, groupInput: false }))}
                    {...textInputProps}
                  />
                </div>
              </label>
            </div>
          </section>

          {/* Connection */}
          <section style={sshProfileEditorStyles.section}>
            <h3 style={sshProfileEditorStyles.sectionTitle}>Connection</h3>
            <div style={sshProfileEditorStyles.connectionType}>
              <label style={sshProfileEditorStyles.radioLabel}>
                <input
                  type="radio"
                  checked={connectionType === 'ssh-config'}
                  onChange={() => setConnectionType('ssh-config')}
                  style={sshProfileEditorStyles.radioInput}
                />
                Use SSH Config Entry
              </label>
              <label style={sshProfileEditorStyles.radioLabel}>
                <input
                  type="radio"
                  checked={connectionType === 'manual'}
                  onChange={() => setConnectionType('manual')}
                  style={sshProfileEditorStyles.radioInput}
                />
                Manual Configuration
              </label>
            </div>

            {connectionType === 'ssh-config' ? (
              <div style={sshProfileEditorStyles.formRow}>
                <label style={sshProfileEditorStyles.formLabel}>
                  Host from ~/.ssh/config *
                  <select
                    value={sshConfigHost}
                    onChange={e => setSSHConfigHost(e.target.value)}
                    style={getFormInputStyle(focusStates.sshConfigHost || false)}
                    onFocus={() => setFocusStates(prev => ({ ...prev, sshConfigHost: true }))}
                    onBlur={() => setFocusStates(prev => ({ ...prev, sshConfigHost: false }))}
                  >
                    <option value="">-- Select Host --</option>
                    {sshConfigHosts.map(host => (
                      <option key={host.host} value={host.host}>
                        {host.host} {host.hostname && `(${host.hostname})`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <>
                <div style={sshProfileEditorStyles.formRow}>
                  <label style={sshProfileEditorStyles.formLabel}>
                    Hostname *
                    <input
                      type="text"
                      value={hostname}
                      onChange={e => setHostname(e.target.value)}
                      placeholder="example.com"
                      style={getFormInputStyle(focusStates.hostname || false)}
                      onFocus={() => setFocusStates(prev => ({ ...prev, hostname: true }))}
                      onBlur={() => setFocusStates(prev => ({ ...prev, hostname: false }))}
                      {...textInputProps}
                    />
                  </label>
                </div>
                <div style={sshProfileEditorStyles.formRowSplit}>
                  <label style={sshProfileEditorStyles.formLabel}>
                    Username *
                    <input
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="user"
                      style={getFormInputStyle(focusStates.username || false)}
                      onFocus={() => setFocusStates(prev => ({ ...prev, username: true }))}
                      onBlur={() => setFocusStates(prev => ({ ...prev, username: false }))}
                      {...textInputProps}
                    />
                  </label>
                  <label style={sshProfileEditorStyles.formLabel}>
                    Port
                    <input
                      type="number"
                      value={port}
                      onChange={e => setPort(e.target.value)}
                      min="1"
                      max="65535"
                      style={getFormInputStyle(focusStates.port || false)}
                      onFocus={() => setFocusStates(prev => ({ ...prev, port: true }))}
                      onBlur={() => setFocusStates(prev => ({ ...prev, port: false }))}
                    />
                  </label>
                </div>
                <div style={sshProfileEditorStyles.formRow}>
                  <label style={sshProfileEditorStyles.formLabel}>
                    Identity File (optional)
                    <input
                      type="text"
                      value={identityFile}
                      onChange={e => setIdentityFile(e.target.value)}
                      placeholder="~/.ssh/id_rsa"
                      style={getFormInputStyle(focusStates.identityFile || false)}
                      onFocus={() => setFocusStates(prev => ({ ...prev, identityFile: true }))}
                      onBlur={() => setFocusStates(prev => ({ ...prev, identityFile: false }))}
                      {...textInputProps}
                    />
                  </label>
                </div>
                <div style={sshProfileEditorStyles.formRow}>
                  <label style={sshProfileEditorStyles.formLabel}>
                    Proxy Jump (optional)
                    <input
                      type="text"
                      value={proxyJump}
                      onChange={e => setProxyJump(e.target.value)}
                      placeholder="jump-host"
                      style={getFormInputStyle(focusStates.proxyJump || false)}
                      onFocus={() => setFocusStates(prev => ({ ...prev, proxyJump: true }))}
                      onBlur={() => setFocusStates(prev => ({ ...prev, proxyJump: false }))}
                      {...textInputProps}
                    />
                  </label>
                </div>
              </>
            )}
          </section>

          {/* Post-Connection Setup */}
          <section style={sshProfileEditorStyles.section}>
            <h3 style={sshProfileEditorStyles.sectionTitle}>Post-Connection Setup</h3>
            <label style={sshProfileEditorStyles.formLabel}>Startup Commands</label>
            <div style={sshProfileEditorStyles.commandList}>
              {startupCommands.map((cmd, index) => (
                <div key={index} style={sshProfileEditorStyles.commandItem}>
                  <input
                    type="text"
                    value={cmd}
                    onChange={e => updateStartupCommand(index, e.target.value)}
                    placeholder="e.g., cd /scratch/project"
                    style={sshProfileEditorStyles.listItemInput}
                    {...textInputProps}
                  />
                  <button
                    onClick={() => removeStartupCommand(index)}
                    style={getRemoveButtonStyle(hoverStates[`removeCmd-${index}`] || false)}
                    onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`removeCmd-${index}`]: true }))}
                    onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`removeCmd-${index}`]: false }))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button 
                onClick={addStartupCommand}
                style={getAddItemButtonStyle(hoverStates.addCmd || false)}
                onMouseEnter={() => setHoverStates(prev => ({ ...prev, addCmd: true }))}
                onMouseLeave={() => setHoverStates(prev => ({ ...prev, addCmd: false }))}
              >
                + Add Command
              </button>
            </div>

            <label style={sshProfileEditorStyles.formLabel}>Environment Variables</label>
            <div style={sshProfileEditorStyles.envList}>
              {Object.entries(envVars).map(([key, value]) => (
                <div key={key} style={sshProfileEditorStyles.envItem}>
                  <span style={sshProfileEditorStyles.envKey}>{key}=</span>
                  <input
                    type="text"
                    value={value}
                    onChange={e => updateEnvVar(key, e.target.value)}
                    placeholder="value"
                    style={sshProfileEditorStyles.listItemInput}
                    {...textInputProps}
                  />
                  <button
                    onClick={() => removeEnvVar(key)}
                    style={getRemoveButtonStyle(hoverStates[`removeEnv-${key}`] || false)}
                    onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`removeEnv-${key}`]: true }))}
                    onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`removeEnv-${key}`]: false }))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button 
                onClick={addEnvVar}
                style={getAddItemButtonStyle(hoverStates.addEnv || false)}
                onMouseEnter={() => setHoverStates(prev => ({ ...prev, addEnv: true }))}
                onMouseLeave={() => setHoverStates(prev => ({ ...prev, addEnv: false }))}
              >
                + Add Variable
              </button>
            </div>
          </section>

          {/* Advanced Options */}
          <section style={sshProfileEditorStyles.section}>
            <h3 style={sshProfileEditorStyles.sectionTitle}>Advanced</h3>
            <div style={sshProfileEditorStyles.checkboxRow}>
              <label style={sshProfileEditorStyles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={autoConnect}
                  onChange={e => setAutoConnect(e.target.checked)}
                  style={sshProfileEditorStyles.checkboxInput}
                />
                Auto-connect on startup
              </label>
            </div>
            <div style={sshProfileEditorStyles.formRow}>
              <label style={sshProfileEditorStyles.formLabel}>
                Health Check Interval (seconds)
                <input
                  type="number"
                  value={healthCheckInterval}
                  onChange={e => setHealthCheckInterval(e.target.value)}
                  min="0"
                  style={getFormInputStyle(focusStates.healthCheck || false)}
                  onFocus={() => setFocusStates(prev => ({ ...prev, healthCheck: true }))}
                  onBlur={() => setFocusStates(prev => ({ ...prev, healthCheck: false }))}
                />
              </label>
            </div>
            <div style={sshProfileEditorStyles.checkboxRow}>
              <label style={sshProfileEditorStyles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={alertOnDisconnect}
                  onChange={e => setAlertOnDisconnect(e.target.checked)}
                  style={sshProfileEditorStyles.checkboxInput}
                />
                Alert on disconnect
              </label>
            </div>
          </section>
        </div>

        <div style={sshProfileEditorStyles.footer}>
          <button 
            style={getCancelButtonStyle(hoverStates.cancelBtn || false)}
            onClick={onClose}
            onMouseEnter={() => setHoverStates(prev => ({ ...prev, cancelBtn: true }))}
            onMouseLeave={() => setHoverStates(prev => ({ ...prev, cancelBtn: false }))}
          >
            Cancel
          </button>
          <button
            style={getSaveButtonStyle(hoverStates.saveBtn || false, !canSave)}
            onClick={handleSave}
            disabled={!canSave}
            onMouseEnter={() => setHoverStates(prev => ({ ...prev, saveBtn: true }))}
            onMouseLeave={() => setHoverStates(prev => ({ ...prev, saveBtn: false }))}
          >
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
};
