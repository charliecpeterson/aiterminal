import React, { useState, useEffect } from 'react';
import { X as XIcon } from 'lucide-react';
import { SSHProfile, PortForward } from '../types/ssh';
import { useSSHProfiles } from '../context/SSHProfilesContext';
import { sshProfileEditorStyles } from './SSHProfileEditor.styles';

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
  const [portForwards, setPortForwards] = useState<PortForward[]>([]);
  const [sshOptions, setSshOptions] = useState<string[]>([]);
  
  // Options
  const [autoConnect, setAutoConnect] = useState(false);
  const [healthCheckInterval, setHealthCheckInterval] = useState('30');
  const [alertOnDisconnect, setAlertOnDisconnect] = useState(false);


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
      setPortForwards(profile.portForwards || []);
      setSshOptions(profile.sshOptions || []);
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
      portForwards: portForwards.length > 0 ? portForwards : undefined,
      sshOptions: (() => {
        const filtered = sshOptions.filter(opt => opt.trim().length > 0);
        return filtered.length > 0 ? filtered : undefined;
      })(),
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

  const addPortForward = () => {
    const newForward: PortForward = {
      id: `pf-${Date.now()}`,
      type: 'local',
      localPort: 8080,
      remoteHost: 'localhost',
      remotePort: 3000,
    };
    setPortForwards([...portForwards, newForward]);
  };

  const updatePortForward = (id: string, updates: Partial<PortForward>) => {
    setPortForwards(portForwards.map(pf => 
      pf.id === id ? { ...pf, ...updates } : pf
    ));
  };

  const removePortForward = (id: string) => {
    setPortForwards(portForwards.filter(pf => pf.id !== id));
  };

  const addSshOption = () => {
    setSshOptions([...sshOptions, '']);
  };

  const updateSshOption = (index: number, value: string) => {
    const updated = [...sshOptions];
    updated[index] = value;
    setSshOptions(updated);
  };

  const removeSshOption = (index: number) => {
    setSshOptions(sshOptions.filter((_, i) => i !== index));
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
            className="btn-icon"
            style={sshProfileEditorStyles.closeButton}
            onClick={onClose}
          ><XIcon size={14} /></button>
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
                  className="settings-input"
                  style={sshProfileEditorStyles.formInput}
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
                    className="settings-input"
                    style={{ ...sshProfileEditorStyles.formInput, flex: 1 }}
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
                    className="settings-input"
                    style={{ ...sshProfileEditorStyles.formInput, flex: 1 }}
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
                    className="settings-input"
                    style={sshProfileEditorStyles.formInput}
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
                      className="settings-input"
                      style={sshProfileEditorStyles.formInput}
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
                      className="settings-input"
                      style={sshProfileEditorStyles.formInput}
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
                      className="settings-input"
                      style={sshProfileEditorStyles.formInput}
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
                      className="settings-input"
                      style={sshProfileEditorStyles.formInput}
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
                      className="settings-input"
                      style={sshProfileEditorStyles.formInput}
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
                    className="ssh-remove-btn"
                    style={sshProfileEditorStyles.removeButton}
                    onClick={() => removeStartupCommand(index)}
                  >
                    <XIcon size={14} />
                  </button>
                </div>
              ))}
              <button
                className="ssh-add-item-btn"
                style={sshProfileEditorStyles.addItemButton}
                onClick={addStartupCommand}
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
                    className="ssh-remove-btn"
                    style={sshProfileEditorStyles.removeButton}
                    onClick={() => removeEnvVar(key)}
                  >
                    <XIcon size={14} />
                  </button>
                </div>
              ))}
              <button
                className="ssh-add-item-btn"
                style={sshProfileEditorStyles.addItemButton}
                onClick={addEnvVar}
              >
                + Add Variable
              </button>
            </div>
          </section>

          {/* Port Forwards */}
          <section style={sshProfileEditorStyles.section}>
            <h3 style={sshProfileEditorStyles.sectionTitle}>Port Forwards</h3>
            <div style={sshProfileEditorStyles.commandList}>
              {portForwards.map((forward) => (
                <div key={forward.id} style={{ 
                  ...sshProfileEditorStyles.commandItem, 
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: '8px',
                  padding: '12px',
                  background: 'var(--surface-tertiary, #252525)',
                  borderRadius: '6px'
                }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                      value={forward.type}
                      onChange={e => updatePortForward(forward.id, { 
                        type: e.target.value as 'local' | 'remote' | 'dynamic' 
                      })}
                      style={{ 
                        ...sshProfileEditorStyles.listItemInput, 
                        flex: '0 0 120px',
                        fontSize: '12px'
                      }}
                    >
                      <option value="local">Local (-L)</option>
                      <option value="remote">Remote (-R)</option>
                      <option value="dynamic">Dynamic (-D)</option>
                    </select>
                    <button
                      className="ssh-remove-btn"
                      style={sshProfileEditorStyles.removeButton}
                      onClick={() => removePortForward(forward.id)}
                    >
                      <XIcon size={14} />
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <label style={{ ...sshProfileEditorStyles.formLabel, flex: 1, margin: 0 }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-tertiary, #999)' }}>Local Port</span>
                      <input
                        type="text"
                        value={forward.localPort}
                        onChange={e => {
                          const port = parseInt(e.target.value);
                          if (!isNaN(port) && port >= 1 && port <= 65535) {
                            updatePortForward(forward.id, { localPort: port });
                          }
                        }}
                        placeholder="8080"
                        style={{ ...sshProfileEditorStyles.listItemInput, fontSize: '12px' }}
                        {...textInputProps}
                      />
                    </label>
                    
                    {forward.type !== 'dynamic' && (
                      <>
                        <label style={{ ...sshProfileEditorStyles.formLabel, flex: 1, margin: 0 }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary, #999)' }}>Remote Host</span>
                          <input
                            type="text"
                            value={forward.remoteHost || ''}
                            onChange={e => updatePortForward(forward.id, { 
                              remoteHost: e.target.value 
                            })}
                            placeholder="localhost"
                            style={{ ...sshProfileEditorStyles.listItemInput, fontSize: '12px' }}
                            {...textInputProps}
                          />
                        </label>
                        <label style={{ ...sshProfileEditorStyles.formLabel, flex: 1, margin: 0 }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary, #999)' }}>Remote Port</span>
                          <input
                            type="text"
                            value={forward.remotePort || ''}
                            onChange={e => {
                              const port = parseInt(e.target.value);
                              if (e.target.value === '') {
                                updatePortForward(forward.id, { remotePort: undefined });
                              } else if (!isNaN(port) && port >= 1 && port <= 65535) {
                                updatePortForward(forward.id, { remotePort: port });
                              }
                            }}
                            placeholder="3000"
                            style={{ ...sshProfileEditorStyles.listItemInput, fontSize: '12px' }}
                            {...textInputProps}
                          />
                        </label>
                      </>
                    )}
                  </div>
                  
                  <input
                    type="text"
                    value={forward.description || ''}
                    onChange={e => updatePortForward(forward.id, { 
                      description: e.target.value 
                    })}
                    placeholder="Description (e.g., Dev server)"
                    style={{ ...sshProfileEditorStyles.listItemInput, fontSize: '11px', fontStyle: 'italic' }}
                    {...textInputProps}
                  />
                </div>
              ))}
              <button
                className="ssh-add-item-btn"
                style={sshProfileEditorStyles.addItemButton}
                onClick={addPortForward}
              >
                + Add Port Forward
              </button>
            </div>
          </section>

          {/* SSH Options */}
          <section style={sshProfileEditorStyles.section}>
            <h3 style={sshProfileEditorStyles.sectionTitle}>SSH Options</h3>
            <p style={{ 
              fontSize: '12px', 
              color: 'var(--text-tertiary, #999)', 
              margin: '0 0 12px 0',
              lineHeight: '1.4'
            }}>
              Custom SSH flags to add to the connection command.
            </p>
            <div style={sshProfileEditorStyles.commandList}>
              {sshOptions.map((option, index) => (
                <div key={index} style={sshProfileEditorStyles.commandItem}>
                  <input
                    type="text"
                    value={option}
                    onChange={e => updateSshOption(index, e.target.value)}
                    placeholder="e.g., -v or -oHostKeyAlgorithms=+ssh-rsa"
                    style={sshProfileEditorStyles.listItemInput}
                    {...textInputProps}
                  />
                  <button
                    className="ssh-remove-btn"
                    style={sshProfileEditorStyles.removeButton}
                    onClick={() => removeSshOption(index)}
                  >
                    <XIcon size={14} />
                  </button>
                </div>
              ))}
              <button
                className="ssh-add-item-btn"
                style={sshProfileEditorStyles.addItemButton}
                onClick={addSshOption}
              >
                + Add SSH Option
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
                  className="settings-input"
                  style={sshProfileEditorStyles.formInput}
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
            className="btn-secondary"
            style={{ ...sshProfileEditorStyles.button, ...sshProfileEditorStyles.buttonCancel }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            style={{ ...sshProfileEditorStyles.button, ...sshProfileEditorStyles.buttonSave }}
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
