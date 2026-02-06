import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Pencil, Trash2, ChevronDown, ChevronRight, Plus, GripVertical } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useSSHProfiles } from '../context/SSHProfilesContext';
import { SSHProfile, ProfileGroup, PortForwardHealth } from '../types/ssh';
import { sshSessionPanelStyles } from './SSHSessionPanel.styles';

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
  const { profiles, deleteProfile, isLoading, getProfileConnections, reorderProfile, reorderGroup, groupOrders } = useSSHProfiles();
  
  // Start with all groups collapsed - use a ref to track if we've initialized
  const initializedRef = useRef(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showActive, setShowActive] = useState(true);
  
  // Drag state for groups
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  
  // Drag state for profiles
  const [draggedProfile, setDraggedProfile] = useState<string | null>(null);
  const [dragOverProfile, setDragOverProfile] = useState<{ id: string; position: 'before' | 'after' } | null>(null);
  

  // Port forward health status - keyed by profile.id + forward.id
  const [portHealthStatus, setPortHealthStatus] = useState<Map<string, PortForwardHealth>>(new Map());

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

  // Check port health for all active connections
  const checkPortHealth = useCallback(async () => {
    const newHealthStatus = new Map<string, PortForwardHealth>();
    
    for (const { profile } of activeConnections) {
      if (!profile.portForwards || profile.portForwards.length === 0) continue;
      
      for (const forward of profile.portForwards) {
        const healthKey = `${profile.id}-${forward.id}`;
        
        try {
          const result = await invoke<string>('check_port_tool', { 
            port: forward.localPort 
          });
          
          const isActive = result.toLowerCase().includes('in use') || 
                          result.toLowerCase().includes('listening');
          
          newHealthStatus.set(healthKey, {
            forwardId: forward.id,
            isActive,
            lastChecked: new Date(),
            error: isActive ? undefined : 'Port not listening',
          });
        } catch (error) {
          newHealthStatus.set(healthKey, {
            forwardId: forward.id,
            isActive: false,
            lastChecked: new Date(),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    
    setPortHealthStatus(newHealthStatus);
  }, [activeConnections]);

  // Check port health on mount and every 10 seconds
  useEffect(() => {
    if (activeConnections.length === 0) return;
    
    checkPortHealth();
    const intervalId = setInterval(checkPortHealth, 10000);
    
    return () => clearInterval(intervalId);
  }, [checkPortHealth, activeConnections.length]);

  // Initialize collapsed groups - collapse all groups by default on first load
  useEffect(() => {
    if (initializedRef.current || profiles.length === 0) return;
    
    // Get all unique group names
    const groupNames = new Set(profiles.map(p => p.group || 'Ungrouped'));
    setCollapsedGroups(groupNames);
    initializedRef.current = true;
  }, [profiles]);

  // Group profiles with sorting by order
  const profileGroups = useMemo<ProfileGroup[]>(() => {
    const grouped = new Map<string, SSHProfile[]>();
    
    profiles.forEach(profile => {
      const groupName = profile.group || 'Ungrouped';
      if (!grouped.has(groupName)) {
        grouped.set(groupName, []);
      }
      grouped.get(groupName)!.push(profile);
    });

    // Build groups with proper sorting
    const groups = Array.from(grouped.entries()).map(([name, profs]) => {
      // Find group order from groupOrders, default to Infinity for unlisted groups
      const groupOrder = groupOrders.find(g => g.name === name)?.order ?? Infinity;
      
      return {
        name,
        // Sort profiles by order first, then by name
        profiles: profs.sort((a, b) => {
          const orderA = a.order ?? Infinity;
          const orderB = b.order ?? Infinity;
          if (orderA !== orderB) return orderA - orderB;
          return a.name.localeCompare(b.name);
        }),
        collapsed: collapsedGroups.has(name),
        order: groupOrder,
      };
    });

    // Sort groups: "Ungrouped" always last, otherwise by order
    return groups.sort((a, b) => {
      if (a.name === 'Ungrouped') return 1;
      if (b.name === 'Ungrouped') return -1;
      return (a.order ?? Infinity) - (b.order ?? Infinity);
    });
  }, [profiles, collapsedGroups, groupOrders]);

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

  // Group drag handlers
  const handleGroupDragStart = (e: React.DragEvent, groupName: string) => {
    if (groupName === 'Ungrouped') {
      e.preventDefault();
      return;
    }
    setDraggedGroup(groupName);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', groupName);
  };

  const handleGroupDragOver = (e: React.DragEvent, groupName: string) => {
    if (!draggedGroup || groupName === 'Ungrouped' || draggedGroup === groupName) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroup(groupName);
  };

  const handleGroupDragLeave = () => {
    setDragOverGroup(null);
  };

  const handleGroupDrop = (e: React.DragEvent, targetGroupName: string) => {
    e.preventDefault();
    if (!draggedGroup || targetGroupName === 'Ungrouped' || draggedGroup === targetGroupName) {
      setDraggedGroup(null);
      setDragOverGroup(null);
      return;
    }

    // Find the target group's current order
    const targetIndex = profileGroups.findIndex(g => g.name === targetGroupName);
    console.log('Group drop:', { draggedGroup, targetGroupName, targetIndex });
    
    if (targetIndex >= 0) {
      reorderGroup(draggedGroup, targetIndex);
    }

    setDraggedGroup(null);
    setDragOverGroup(null);
  };

  const handleGroupDragEnd = () => {
    setDraggedGroup(null);
    setDragOverGroup(null);
  };

  // Profile drag handlers
  const handleProfileDragStart = (e: React.DragEvent, profileId: string) => {
    e.stopPropagation(); // Prevent group drag from triggering
    setDraggedProfile(profileId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', profileId);
  };

  const handleProfileDragOver = (e: React.DragEvent, profileId: string, rect: DOMRect) => {
    if (!draggedProfile || draggedProfile === profileId) return;
    e.preventDefault();
    e.stopPropagation(); // Prevent group drag over from triggering
    e.dataTransfer.dropEffect = 'move';
    
    // Determine if dropping before or after based on mouse position
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'before' : 'after';
    setDragOverProfile({ id: profileId, position });
  };

  const handleProfileDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setDragOverProfile(null);
  };

  const handleProfileDrop = (e: React.DragEvent, targetProfileId: string, targetGroup: string) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent group drop from triggering
    
    if (!draggedProfile || draggedProfile === targetProfileId) {
      setDraggedProfile(null);
      setDragOverProfile(null);
      return;
    }

    // Calculate drop position based on mouse position at drop time
    // (don't rely on dragOverProfile state which may be stale)
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const dropPosition = e.clientY < midY ? 'before' : 'after';

    // Find the target position
    const groupProfiles = profileGroups.find(g => g.name === targetGroup)?.profiles || [];
    let targetIndex = groupProfiles.findIndex(p => p.id === targetProfileId);
    
    if (targetIndex >= 0 && dropPosition === 'after') {
      targetIndex += 1;
    }

    // Get source profile's group
    const sourceProfile = profiles.find(p => p.id === draggedProfile);
    const sourceGroup = sourceProfile?.group || 'Ungrouped';

    // If moving within the same group, adjust index if source is before target
    if (sourceGroup === targetGroup) {
      const sourceIndex = groupProfiles.findIndex(p => p.id === draggedProfile);
      if (sourceIndex < targetIndex) {
        targetIndex -= 1;
      }
    }

    console.log('Profile drop:', { 
      draggedProfile, 
      targetProfileId, 
      targetGroup, 
      targetIndex, 
      dropPosition,
      sourceGroup 
    });
    
    // Call reorderProfile and handle any errors
    reorderProfile(draggedProfile, Math.max(0, targetIndex), targetGroup === 'Ungrouped' ? undefined : targetGroup)
      .then(() => {
        console.log('Profile reorder completed successfully');
      })
      .catch((err) => {
        console.error('Profile reorder failed:', err);
      });

    setDraggedProfile(null);
    setDragOverProfile(null);
  };

  const handleProfileDragEnd = () => {
    setDraggedProfile(null);
    setDragOverProfile(null);
  };

  const getStatusColor = (profile: SSHProfile): string => {
    const profileConns = getProfileConnections(profile.id);
    if (profileConns.length === 0) return '#999'; // Not connected (gray)

    const hasConnected = profileConns.some(c => c.status === 'connected');
    const hasConnecting = profileConns.some(c => c.status === 'connecting');

    if (hasConnected) {
      const maxLatency = Math.max(...profileConns.filter(c => c.latency).map(c => c.latency!));
      return maxLatency > 500 ? '#eab308' : '#22c55e'; // yellow / green
    }
    if (hasConnecting) return '#3b82f6'; // blue
    return '#ef4444'; // red
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

  const renderProfile = (profile: SSHProfile, groupName: string) => {
    const statusColor = getStatusColor(profile);
    const connectionInfo = getConnectionInfo(profile);
    const profileConns = getProfileConnections(profile.id);
    const connectedConns = profileConns.filter(c => c.status === 'connected');
    const isConnected = connectedConns.length > 0;
    
    const isDragging = draggedProfile === profile.id;
    const isDragOver = dragOverProfile?.id === profile.id;
    const dragPosition = dragOverProfile?.position;

    return (
      <div 
        key={profile.id}
        draggable
        onDragStart={(e) => handleProfileDragStart(e, profile.id)}
        onDragOver={(e) => handleProfileDragOver(e, profile.id, e.currentTarget.getBoundingClientRect())}
        onDragLeave={handleProfileDragLeave}
        onDrop={(e) => handleProfileDrop(e, profile.id, groupName)}
        onDragEnd={handleProfileDragEnd}
        className="ssh-profile-item"
        style={{
          ...sshSessionPanelStyles.profileItem,
          opacity: isDragging ? 0.5 : 1,
          borderTop: isDragOver && dragPosition === 'before' ? '2px solid #007acc' : undefined,
          borderBottom: isDragOver && dragPosition === 'after' ? '2px solid #007acc' : undefined,
          cursor: 'grab',
        }}
      >
        <div style={sshSessionPanelStyles.profileHeader}>
          <span style={{ ...sshSessionPanelStyles.statusIcon, cursor: 'grab' }}><GripVertical size={12} /></span>
          <span style={sshSessionPanelStyles.statusIcon}><span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, display: 'inline-block' }} /></span>
          <span style={sshSessionPanelStyles.profileName}>{profile.name}</span>
          <button
            className="ssh-action-btn"
            style={sshSessionPanelStyles.profileActionButton}
            onClick={(e) => {
              e.stopPropagation();
              onEditProfile(profile);
            }}
            title="Edit profile"
          >
            <Pencil size={14} />
          </button>
          <button
            className="ssh-action-btn"
            style={sshSessionPanelStyles.profileActionButton}
            onClick={(e) => handleDeleteProfile(e, profile.id)}
            title="Delete profile"
          >
            <Trash2 size={14} />
          </button>
        </div>
        
        {connectionInfo && (
          <div style={sshSessionPanelStyles.connectionInfo}>{connectionInfo}</div>
        )}
        
        <div style={sshSessionPanelStyles.profileActions}>
          {isConnected ? (
            <button
              className="btn-outline"
              style={sshSessionPanelStyles.actionButton}
              onClick={() => onConnect(profile)}
            >
              New Tab
            </button>
          ) : (
            <button
              className="btn-primary"
              style={{ ...sshSessionPanelStyles.actionButton, ...sshSessionPanelStyles.actionButtonPrimary }}
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
      <div style={
        standalone
          ? { ...sshSessionPanelStyles.panel, ...sshSessionPanelStyles.panelStandalone }
          : sshSessionPanelStyles.panel
      }>
        <div style={sshSessionPanelStyles.loading}>Loading profiles...</div>
      </div>
    );
  }

  return (
    <div style={
      standalone
        ? { ...sshSessionPanelStyles.panel, ...sshSessionPanelStyles.panelStandalone }
        : sshSessionPanelStyles.panel
    }>
      <div style={sshSessionPanelStyles.header}>
        <h3 style={sshSessionPanelStyles.headerTitle}>SSH Sessions</h3>
        <button
          className="btn-icon"
          style={sshSessionPanelStyles.addButton}
          onClick={onNewProfile}
          title="Add new profile"
        >
          <Plus size={16} />
        </button>
      </div>

      <div style={sshSessionPanelStyles.content}>
        {/* Active Connections */}
        {activeConnections.length > 0 && (
          <div style={sshSessionPanelStyles.group}>
            <div
              className="ssh-group-header"
              style={sshSessionPanelStyles.activeHeader}
              onClick={() => setShowActive(!showActive)}
            >
              <span style={sshSessionPanelStyles.groupToggle}>
                {showActive ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <span style={sshSessionPanelStyles.groupName}>
                Active ({activeConnections.length})
              </span>
            </div>
            
            {showActive && (
              <div style={sshSessionPanelStyles.groupProfiles}>
                {activeConnections.map(({ profile, connection }) => (
                  <div key={connection.tabId}>
                    <div
                      className="ssh-active-item"
                      style={sshSessionPanelStyles.activeItem}
                    >
                      <span style={sshSessionPanelStyles.statusIcon}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                          background: connection.status === 'connected'
                            ? (connection.latency && connection.latency > 500 ? '#eab308' : '#22c55e')
                            : '#3b82f6'
                        }} />
                      </span>
                      <span style={sshSessionPanelStyles.profileName}>{connection.tabName || profile.name}</span>
                      {connection.latency && (
                        <span style={sshSessionPanelStyles.latencyBadge}>{connection.latency}ms</span>
                      )}
                      <button
                        className="btn-primary"
                        style={{ ...sshSessionPanelStyles.actionButton, ...sshSessionPanelStyles.actionButtonPrimary }}
                        onClick={() => onGoToTab && onGoToTab(connection.tabId)}
                      >
                        Go to Tab
                      </button>
                    </div>
                    
                    {/* Show port forwards if profile has them */}
                    {profile.portForwards && profile.portForwards.length > 0 && (
                      <div style={{
                        paddingLeft: '32px',
                        fontSize: '12px',
                        color: '#999',
                        marginTop: '4px',
                        marginBottom: '8px'
                      }}>
                        {profile.portForwards.map(forward => {
                          const healthKey = `${profile.id}-${forward.id}`;
                          const health = portHealthStatus.get(healthKey);
                          const statusColor = health?.isActive ? '#22c55e' : '#ef4444';
                          
                          let forwardLabel = '';
                          if (forward.type === 'local') {
                            forwardLabel = `${forward.localPort} → ${forward.remoteHost}:${forward.remotePort}`;
                          } else if (forward.type === 'remote') {
                            forwardLabel = `${forward.remotePort} ← ${forward.remoteHost}:${forward.localPort}`;
                          } else if (forward.type === 'dynamic') {
                            forwardLabel = `SOCKS :${forward.localPort}`;
                          }
                          
                          return (
                            <div 
                              key={forward.id}
                              style={{
                                padding: '4px 8px',
                                marginBottom: '2px',
                                background: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                borderLeft: health?.isActive 
                                  ? '2px solid #10b981' 
                                  : '2px solid #ef4444'
                              }}
                              title={health?.error || (health?.isActive ? 'Port is active' : 'Checking...')}
                            >
                              <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: statusColor }} />
                              <span style={{ 
                                fontFamily: 'SF Mono, Monaco, Cascadia Code, Courier New, monospace',
                                color: '#e0e0e0',
                                fontSize: '11px',
                                flex: 1
                              }}>
                                {forwardLabel}
                              </span>
                              {forward.description && (
                                <span style={{ 
                                  color: '#666',
                                  fontSize: '10px',
                                  fontStyle: 'italic'
                                }}>
                                  {forward.description}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Groups */}
        {profileGroups.map((group) => (
          <div 
            key={group.name} 
            style={{
              ...sshSessionPanelStyles.group,
              opacity: draggedGroup === group.name ? 0.5 : 1,
              borderTop: dragOverGroup === group.name ? '2px solid #007acc' : undefined,
            }}
            draggable={group.name !== 'Ungrouped'}
            onDragStart={(e) => handleGroupDragStart(e, group.name)}
            onDragOver={(e) => handleGroupDragOver(e, group.name)}
            onDragLeave={handleGroupDragLeave}
            onDrop={(e) => handleGroupDrop(e, group.name)}
            onDragEnd={handleGroupDragEnd}
          >
            <div
              className="ssh-group-header"
              style={sshSessionPanelStyles.groupHeader}
            >
              {group.name !== 'Ungrouped' && (
                <span style={{ cursor: 'grab', marginRight: '4px', color: '#666' }}><GripVertical size={12} /></span>
              )}
              <span 
                style={sshSessionPanelStyles.groupToggle}
                onClick={() => toggleGroup(group.name)}
              >
                {collapsedGroups.has(group.name) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </span>
              <span 
                style={sshSessionPanelStyles.groupName}
                onClick={() => toggleGroup(group.name)}
              >
                {group.name} ({group.profiles.length})
              </span>
              {group.name !== 'Ungrouped' && (
                <button
                  className="ssh-action-btn"
                  style={sshSessionPanelStyles.groupDeleteButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete group "${group.name}"? Profiles will be moved to Ungrouped.`)) {
                      // Move all profiles in this group to Ungrouped
                      // This will be handled by parent component through a callback
                    }
                  }}
                  title="Delete group"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            
            {!collapsedGroups.has(group.name) && (
              <div style={sshSessionPanelStyles.groupProfiles}>
                {group.profiles.map(profile => renderProfile(profile, group.name))}
              </div>
            )}
          </div>
        ))}
      </div>

      {profiles.length === 0 && (
        <div style={sshSessionPanelStyles.emptyState}>
          <p style={sshSessionPanelStyles.emptyStateText}>No SSH profiles yet</p>
          <button
            className="btn-primary"
            style={{ ...sshSessionPanelStyles.actionButton, ...sshSessionPanelStyles.actionButtonPrimary }}
            onClick={onNewProfile}
          >
            Create First Profile
          </button>
        </div>
      )}
    </div>
  );
};
