import React, { useState, useEffect } from 'react';
import { SSHProfile } from '../types/ssh';
import { useSSHProfiles } from '../context/SSHProfilesContext';
import './SSHProfileEditor.css';

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
  const { sshConfigHosts } = useSSHProfiles();
  const isEdit = Boolean(profile);

  // Form state
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [group, setGroup] = useState('');
  const [tabColor, setTabColor] = useState('#0078d4');
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

  // Load profile data when editing
  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setIcon(profile.icon || '');
      setGroup(profile.group || '');
      setTabColor(profile.tabColor || '#0078d4');
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
      icon: icon.trim() || undefined,
      group: group.trim() || undefined,
      tabColor: tabColor || undefined,
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
    <div className="ssh-editor-overlay" onClick={onClose}>
      <div className="ssh-editor-modal" onClick={e => e.stopPropagation()}>
        <div className="ssh-editor-header">
          <h2>{isEdit ? 'Edit' : 'New'} SSH Profile</h2>
          <button className="ssh-editor-close" onClick={onClose}>×</button>
        </div>

        <div className="ssh-editor-content">
          {/* Basic Info */}
          <section className="ssh-editor-section">
            <h3>Basic</h3>
            <div className="ssh-form-row">
              <label>
                Name *
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g., Prod Cluster"
                />
              </label>
            </div>
            <div className="ssh-form-row ssh-form-row-split">
              <label>
                Icon
                <input
                  type="text"
                  value={icon}
                  onChange={e => setIcon(e.target.value)}
                  placeholder="🖥️"
                  maxLength={2}
                />
              </label>
              <label>
                Color
                <input
                  type="color"
                  value={tabColor}
                  onChange={e => setTabColor(e.target.value)}
                />
              </label>
            </div>
            <div className="ssh-form-row">
              <label>
                Group
                <input
                  type="text"
                  value={group}
                  onChange={e => setGroup(e.target.value)}
                  placeholder="e.g., Production, Development"
                />
              </label>
            </div>
          </section>

          {/* Connection */}
          <section className="ssh-editor-section">
            <h3>Connection</h3>
            <div className="ssh-connection-type">
              <label className="ssh-radio-label">
                <input
                  type="radio"
                  checked={connectionType === 'ssh-config'}
                  onChange={() => setConnectionType('ssh-config')}
                />
                Use SSH Config Entry
              </label>
              <label className="ssh-radio-label">
                <input
                  type="radio"
                  checked={connectionType === 'manual'}
                  onChange={() => setConnectionType('manual')}
                />
                Manual Configuration
              </label>
            </div>

            {connectionType === 'ssh-config' ? (
              <div className="ssh-form-row">
                <label>
                  Host from ~/.ssh/config *
                  <select
                    value={sshConfigHost}
                    onChange={e => setSSHConfigHost(e.target.value)}
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
                <div className="ssh-form-row">
                  <label>
                    Hostname *
                    <input
                      type="text"
                      value={hostname}
                      onChange={e => setHostname(e.target.value)}
                      placeholder="example.com"
                    />
                  </label>
                </div>
                <div className="ssh-form-row ssh-form-row-split">
                  <label>
                    Username *
                    <input
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="user"
                    />
                  </label>
                  <label>
                    Port
                    <input
                      type="number"
                      value={port}
                      onChange={e => setPort(e.target.value)}
                      min="1"
                      max="65535"
                    />
                  </label>
                </div>
                <div className="ssh-form-row">
                  <label>
                    Identity File (optional)
                    <input
                      type="text"
                      value={identityFile}
                      onChange={e => setIdentityFile(e.target.value)}
                      placeholder="~/.ssh/id_rsa"
                    />
                  </label>
                </div>
                <div className="ssh-form-row">
                  <label>
                    Proxy Jump (optional)
                    <input
                      type="text"
                      value={proxyJump}
                      onChange={e => setProxyJump(e.target.value)}
                      placeholder="jump-host"
                    />
                  </label>
                </div>
              </>
            )}
          </section>

          {/* Post-Connection Setup */}
          <section className="ssh-editor-section">
            <h3>Post-Connection Setup</h3>
            <label>Startup Commands</label>
            <div className="ssh-command-list">
              {startupCommands.map((cmd, index) => (
                <div key={index} className="ssh-command-item">
                  <input
                    type="text"
                    value={cmd}
                    onChange={e => updateStartupCommand(index, e.target.value)}
                    placeholder="e.g., cd /scratch/project"
                  />
                  <button
                    onClick={() => removeStartupCommand(index)}
                    className="ssh-remove-btn"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button onClick={addStartupCommand} className="ssh-add-item-btn">
                + Add Command
              </button>
            </div>

            <label>Environment Variables</label>
            <div className="ssh-env-list">
              {Object.entries(envVars).map(([key, value]) => (
                <div key={key} className="ssh-env-item">
                  <span className="ssh-env-key">{key}=</span>
                  <input
                    type="text"
                    value={value}
                    onChange={e => updateEnvVar(key, e.target.value)}
                    placeholder="value"
                  />
                  <button
                    onClick={() => removeEnvVar(key)}
                    className="ssh-remove-btn"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button onClick={addEnvVar} className="ssh-add-item-btn">
                + Add Variable
              </button>
            </div>
          </section>

          {/* Advanced Options */}
          <section className="ssh-editor-section">
            <h3>Advanced</h3>
            <div className="ssh-checkbox-row">
              <label>
                <input
                  type="checkbox"
                  checked={autoConnect}
                  onChange={e => setAutoConnect(e.target.checked)}
                />
                Auto-connect on startup
              </label>
            </div>
            <div className="ssh-form-row">
              <label>
                Health Check Interval (seconds)
                <input
                  type="number"
                  value={healthCheckInterval}
                  onChange={e => setHealthCheckInterval(e.target.value)}
                  min="0"
                />
              </label>
            </div>
            <div className="ssh-checkbox-row">
              <label>
                <input
                  type="checkbox"
                  checked={alertOnDisconnect}
                  onChange={e => setAlertOnDisconnect(e.target.checked)}
                />
                Alert on disconnect
              </label>
            </div>
          </section>
        </div>

        <div className="ssh-editor-footer">
          <button className="ssh-editor-btn ssh-editor-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="ssh-editor-btn ssh-editor-btn-save"
            onClick={handleSave}
            disabled={!canSave}
          >
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
};
