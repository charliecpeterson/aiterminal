import React, { useState, useMemo } from 'react';
import { useSSHProfiles } from '../context/SSHProfilesContext';
import { SSHProfile, ProfileGroup } from '../types/ssh';
import {
  sshSessionPanelStyles,
  getPanelStyle,
  getAddButtonStyle,
  getGroupHeaderStyle,
  getGroupDeleteButtonStyle,
  getActiveHeaderStyle,
  getActiveItemStyle,
  getProfileItemStyle,
  getProfileActionButtonStyle,
  getActionButtonStyle,
} from './SSHSessionPanel.styles';

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
  const [showActive, setShowActive] = useState(true);
  
  // Hover states for interactive elements
  const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({});

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
      <div 
        key={profile.id}
        style={getProfileItemStyle(hoverStates[`profile-${profile.id}`] || false)}
        onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`profile-${profile.id}`]: true }))}
        onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`profile-${profile.id}`]: false }))}
      >
        <div style={sshSessionPanelStyles.profileHeader}>
          <span style={sshSessionPanelStyles.statusIcon}>{statusIcon}</span>
          <span style={sshSessionPanelStyles.profileName}>{profile.name}</span>
          <button
            style={getProfileActionButtonStyle(hoverStates[`edit-${profile.id}`] || false)}
            onClick={(e) => {
              e.stopPropagation();
              onEditProfile(profile);
            }}
            title="Edit profile"
            onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`edit-${profile.id}`]: true }))}
            onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`edit-${profile.id}`]: false }))}
          >
            ✏️
          </button>
          <button
            style={getProfileActionButtonStyle(hoverStates[`delete-${profile.id}`] || false)}
            onClick={(e) => handleDeleteProfile(e, profile.id)}
            title="Delete profile"
            onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`delete-${profile.id}`]: true }))}
            onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`delete-${profile.id}`]: false }))}
          >
            🗑️
          </button>
        </div>
        
        {connectionInfo && (
          <div style={sshSessionPanelStyles.connectionInfo}>{connectionInfo}</div>
        )}
        
        <div style={sshSessionPanelStyles.profileActions}>
          {isConnected ? (
            <button 
              style={getActionButtonStyle(false, hoverStates[`newtab-${profile.id}`] || false)}
              onClick={() => onConnect(profile)}
              onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`newtab-${profile.id}`]: true }))}
              onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`newtab-${profile.id}`]: false }))}
            >
              New Tab
            </button>
          ) : (
            <button 
              style={getActionButtonStyle(true, hoverStates[`connect-${profile.id}`] || false)}
              onClick={() => onConnect(profile)}
              onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`connect-${profile.id}`]: true }))}
              onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`connect-${profile.id}`]: false }))}
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
      <div style={getPanelStyle(standalone)}>
        <div style={sshSessionPanelStyles.loading}>Loading profiles...</div>
      </div>
    );
  }

  return (
    <div style={getPanelStyle(standalone)}>
      <div style={sshSessionPanelStyles.header}>
        <h3 style={sshSessionPanelStyles.headerTitle}>SSH Sessions</h3>
        <button 
          style={getAddButtonStyle(hoverStates.addBtn || false)}
          onClick={onNewProfile}
          title="Add new profile"
          onMouseEnter={() => setHoverStates(prev => ({ ...prev, addBtn: true }))}
          onMouseLeave={() => setHoverStates(prev => ({ ...prev, addBtn: false }))}
        >
          +
        </button>
      </div>

      <div style={sshSessionPanelStyles.content}>
        {/* Active Connections */}
        {activeConnections.length > 0 && (
          <div style={sshSessionPanelStyles.group}>
            <div 
              style={getActiveHeaderStyle(hoverStates.activeHeader || false)}
              onClick={() => setShowActive(!showActive)}
              onMouseEnter={() => setHoverStates(prev => ({ ...prev, activeHeader: true }))}
              onMouseLeave={() => setHoverStates(prev => ({ ...prev, activeHeader: false }))}
            >
              <span style={sshSessionPanelStyles.groupToggle}>
                {showActive ? '▼' : '▶'}
              </span>
              <span style={sshSessionPanelStyles.groupName}>
                Active ({activeConnections.length})
              </span>
            </div>
            
            {showActive && (
              <div style={sshSessionPanelStyles.groupProfiles}>
                {activeConnections.map(({ profile, connection }) => (
                  <div 
                    key={connection.tabId}
                    style={getActiveItemStyle(hoverStates[`active-${connection.tabId}`] || false)}
                    onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`active-${connection.tabId}`]: true }))}
                    onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`active-${connection.tabId}`]: false }))}
                  >
                    <span style={sshSessionPanelStyles.statusIcon}>
                      {connection.status === 'connected' 
                        ? (connection.latency && connection.latency > 500 ? '🟡' : '🟢')
                        : '🔵'}
                    </span>
                    <span style={sshSessionPanelStyles.profileName}>{connection.tabName || profile.name}</span>
                    {connection.latency && (
                      <span style={sshSessionPanelStyles.latencyBadge}>{connection.latency}ms</span>
                    )}
                    <button 
                      style={getActionButtonStyle(true, hoverStates[`goto-${connection.tabId}`] || false)}
                      onClick={() => onGoToTab && onGoToTab(connection.tabId)}
                      onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`goto-${connection.tabId}`]: true }))}
                      onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`goto-${connection.tabId}`]: false }))}
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
          <div key={group.name} style={sshSessionPanelStyles.group}>
            <div 
              style={getGroupHeaderStyle(hoverStates[`group-${group.name}`] || false)}
              onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`group-${group.name}`]: true }))}
              onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`group-${group.name}`]: false }))}
            >
              <span 
                style={sshSessionPanelStyles.groupToggle}
                onClick={() => toggleGroup(group.name)}
              >
                {collapsedGroups.has(group.name) ? '▶' : '▼'}
              </span>
              <span 
                style={sshSessionPanelStyles.groupName}
                onClick={() => toggleGroup(group.name)}
              >
                {group.name} ({group.profiles.length})
              </span>
              {group.name !== 'Ungrouped' && (
                <button 
                  style={getGroupDeleteButtonStyle(
                    hoverStates[`group-${group.name}`] || false,
                    hoverStates[`groupdel-${group.name}`] || false
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete group "${group.name}"? Profiles will be moved to Ungrouped.`)) {
                      // Move all profiles in this group to Ungrouped
                      // This will be handled by parent component through a callback
                    }
                  }}
                  title="Delete group"
                  onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`groupdel-${group.name}`]: true }))}
                  onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`groupdel-${group.name}`]: false }))}
                >
                  🗑️
                </button>
              )}
            </div>
            
            {!collapsedGroups.has(group.name) && (
              <div style={sshSessionPanelStyles.groupProfiles}>
                {group.profiles.map(renderProfile)}
              </div>
            )}
          </div>
        ))}
      </div>

      {profiles.length === 0 && (
        <div style={sshSessionPanelStyles.emptyState}>
          <p style={sshSessionPanelStyles.emptyStateText}>No SSH profiles yet</p>
          <button 
            style={getActionButtonStyle(true, hoverStates.createFirst || false)}
            onClick={onNewProfile}
            onMouseEnter={() => setHoverStates(prev => ({ ...prev, createFirst: true }))}
            onMouseLeave={() => setHoverStates(prev => ({ ...prev, createFirst: false }))}
          >
            Create First Profile
          </button>
        </div>
      )}
    </div>
  );
};
