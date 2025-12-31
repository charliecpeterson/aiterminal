import React, { useState, useMemo } from 'react';
import { useSSHProfiles } from '../context/SSHProfilesContext';
import { SSHProfile, ProfileGroup } from '../types/ssh';
import './SSHSessionPanel.css';

interface SSHSessionPanelProps {
  onConnect: (profile: SSHProfile) => void;
  onEditProfile: (profile: SSHProfile) => void;
  onNewProfile: () => void;
  onGoToTab?: (tabId: string) => void;
  standalone?: boolean; // When true, renders in full window mode
}

export const SSHSessionPanel: React.FC<SSHSessionPanelProps> = ({
  onConnect,
  onEditProfile,
  onNewProfile,
  onGoToTab,
  standalone = false,
}) => {
  const { profiles, deleteProfile, isLoading, getProfileConnections } = useSSHProfiles();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showRecent, setShowRecent] = useState(true);
  const [showActive, setShowActive] = useState(true);

  // Get all active connections across all profiles
  const activeConnections = useMemo(() => {
    return profiles.flatMap(profile => {
      const conns = getProfileConnections(profile.id).filter(c => c.status === 'connected' || c.status === 'connecting');
      return conns.map(conn => ({ profile, connection: conn }));
    }).sort((a, b) => {
      // Sort by tab name
      const nameA = a.connection.tabName || '';
      const nameB = b.connection.tabName || '';
      return nameA.localeCompare(nameB);
    });
  }, [profiles, getProfileConnections]);

  // Group profiles
  const profileGroups = useMemo<ProfileGroup[]>(() => {
    const grouped = new Map<string, SSHProfile[]>();
    
    profiles.forEach(profile => {
      const groupName = profile.group || 'Ungrouped';
      if (!grouped.has(groupName)) {
        grouped.set(groupName, []);
      }
      grouped.get(groupName)!.push(profile);
    });

    return Array.from(grouped.entries()).map(([name, profs]) => ({
      name,
      profiles: profs.sort((a, b) => a.name.localeCompare(b.name)),
      collapsed: collapsedGroups.has(name),
    }));
  }, [profiles, collapsedGroups]);

  // Recent connections (sorted by lastConnectedAt)
  const recentProfiles = useMemo(() => {
    return [...profiles]
      .filter(p => p.lastConnectedAt)
      .sort((a, b) => {
        const aTime = new Date(a.lastConnectedAt!).getTime();
        const bTime = new Date(b.lastConnectedAt!).getTime();
        return bTime - aTime;
      })
      .slice(0, 5);
  }, [profiles]);

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  const getStatusIcon = (profile: SSHProfile): string => {
    const profileConns = getProfileConnections(profile.id);
    if (profileConns.length === 0) return '⚪'; // Not connected
    
    // If any connection is active, show the best status
    const hasConnected = profileConns.some(c => c.status === 'connected');
    const hasConnecting = profileConns.some(c => c.status === 'connecting');
    
    if (hasConnected) {
      const maxLatency = Math.max(...profileConns.filter(c => c.latency).map(c => c.latency!));
      return maxLatency > 500 ? '🟡' : '🟢';
    }
    if (hasConnecting) return '🔵';
    return '🔴';
  };

  const getConnectionInfo = (profile: SSHProfile): string | null => {
    const profileConns = getProfileConnections(profile.id).filter(c => c.status === 'connected');
    if (profileConns.length === 0) return null;
    
    const parts: string[] = [];
    
    // Show number of active connections
    if (profileConns.length > 1) {
      parts.push(`${profileConns.length} tabs`);
    }
    
    // Show average latency
    const latencies = profileConns.filter(c => c.latency).map(c => c.latency!);
    if (latencies.length > 0) {
      const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
      parts.push(`${avgLatency}ms`);
    }
    
    return parts.length > 0 ? parts.join(' • ') : null;
  };

  const handleDeleteProfile = async (e: React.MouseEvent, profileId: string) => {
    e.stopPropagation();
    if (confirm('Delete this SSH profile?')) {
      await deleteProfile(profileId);
    }
  };

  const renderProfile = (profile: SSHProfile) => {
    const statusIcon = getStatusIcon(profile);
    const connectionInfo = getConnectionInfo(profile);
    const profileConns = getProfileConnections(profile.id);
    const connectedConns = profileConns.filter(c => c.status === 'connected');
    const isConnected = connectedConns.length > 0;

    return (
      <div key={profile.id} className="ssh-profile-item">
        <div className="ssh-profile-header">
          <span className="ssh-status-icon">{statusIcon}</span>
          {profile.icon && <span className="ssh-profile-icon">{profile.icon}</span>}
          <span className="ssh-profile-name">{profile.name}</span>
          <button
            className="ssh-profile-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEditProfile(profile);
            }}
            title="Edit profile"
          >
            ✏️
          </button>
          <button
            className="ssh-profile-action-btn"
            onClick={(e) => handleDeleteProfile(e, profile.id)}
            title="Delete profile"
          >
            🗑️
          </button>
        </div>
        
        {connectionInfo && (
          <div className="ssh-connection-info">{connectionInfo}</div>
        )}
        
        <div className="ssh-profile-actions">
          {isConnected ? (
            <button 
              className="ssh-action-btn"
              onClick={() => onConnect(profile)}
            >
              New Tab
            </button>
          ) : (
            <button 
              className="ssh-action-btn ssh-action-primary"
              onClick={() => onConnect(profile)}
            >
              Connect
            </button>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="ssh-session-panel">
        <div className="ssh-panel-loading">Loading profiles...</div>
      </div>
    );
  }

  return (
    <div className={`ssh-session-panel ${standalone ? 'ssh-panel-standalone' : ''}`}>
      <div className="ssh-panel-header">
        <h3>SSH Sessions</h3>
        <button className="ssh-add-btn" onClick={onNewProfile} title="Add new profile">
          +
        </button>
      </div>

      <div className="ssh-panel-content">
        {/* Active Connections */}
        {activeConnections.length > 0 && (
          <div className="ssh-group">
            <div 
              className="ssh-group-header ssh-active-header"
              onClick={() => setShowActive(!showActive)}
            >
              <span className="ssh-group-toggle">
                {showActive ? '▼' : '▶'}
              </span>
              <span className="ssh-group-name">
                Active ({activeConnections.length})
              </span>
            </div>
            
            {showActive && (
              <div className="ssh-group-profiles">
                {activeConnections.map(({ profile, connection }) => (
                  <div key={connection.tabId} className="ssh-profile-item ssh-active-item">
                    <span className="ssh-status-icon">
                      {connection.status === 'connected' 
                        ? (connection.latency && connection.latency > 500 ? '🟡' : '🟢')
                        : '🔵'}
                    </span>
                    {profile.icon && <span className="ssh-profile-icon">{profile.icon}</span>}
                    <span className="ssh-profile-name">{connection.tabName || profile.name}</span>
                    {connection.latency && (
                      <span className="ssh-latency-badge">{connection.latency}ms</span>
                    )}
                    <button 
                      className="ssh-action-btn ssh-action-primary"
                      onClick={() => onGoToTab && onGoToTab(connection.tabId)}
                    >
                      Go to Tab
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Groups */}
        {profileGroups.map(group => (
          <div key={group.name} className="ssh-group">
            <div 
              className="ssh-group-header"
              onClick={() => toggleGroup(group.name)}
            >
              <span className="ssh-group-toggle">
                {collapsedGroups.has(group.name) ? '▶' : '▼'}
              </span>
              <span className="ssh-group-name">
                {group.name} ({group.profiles.length})
              </span>
            </div>
            
            {!collapsedGroups.has(group.name) && (
              <div className="ssh-group-profiles">
                {group.profiles.map(renderProfile)}
              </div>
            )}
          </div>
        ))}

        {/* Recent */}
        {recentProfiles.length > 0 && (
          <div className="ssh-group">
            <div 
              className="ssh-group-header"
              onClick={() => setShowRecent(!showRecent)}
            >
              <span className="ssh-group-toggle">
                {showRecent ? '▼' : '▶'}
              </span>
              <span className="ssh-group-name">
                Recent ({recentProfiles.length})
              </span>
            </div>
            
            {showRecent && (
              <div className="ssh-group-profiles">
                {recentProfiles.map(profile => (
                  <div key={profile.id} className="ssh-profile-item ssh-profile-recent">
                    <span className="ssh-status-icon">{getStatusIcon(profile)}</span>
                    {profile.icon && <span className="ssh-profile-icon">{profile.icon}</span>}
                    <span className="ssh-profile-name">{profile.name}</span>
                    <button 
                      className="ssh-action-btn"
                      onClick={() => onConnect(profile)}
                    >
                      Connect
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {profiles.length === 0 && (
        <div className="ssh-empty-state">
          <p>No SSH profiles yet</p>
          <button className="ssh-action-btn ssh-action-primary" onClick={onNewProfile}>
            Create First Profile
          </button>
        </div>
      )}
    </div>
  );
};
