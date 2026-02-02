/**
 * SSH Profiles Context
 * 
 * Manages SSH profiles, provides CRUD operations, and tracks connection health
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SSHProfile, SSHConfigHost, ConnectionHealth, GroupOrder } from '../types/ssh';
import { createLogger } from '../utils/logger';
import { ContextErrorBoundary } from '../components/ContextErrorBoundary';

const log = createLogger('SSHProfilesContext');

interface SSHProfilesContextType {
  // Profile management
  profiles: SSHProfile[];
  loadProfiles: () => Promise<void>;
  saveProfiles: (profiles: SSHProfile[]) => Promise<void>;
  addProfile: (profile: SSHProfile) => Promise<void>;
  updateProfile: (id: string, updates: Partial<SSHProfile>) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  getProfileById: (id: string) => SSHProfile | undefined;
  
  // Ordering
  reorderProfile: (profileId: string, newOrder: number, newGroup?: string) => Promise<void>;
  reorderGroup: (groupName: string, newOrder: number) => void;
  groupOrders: GroupOrder[];
  
  // SSH config integration
  sshConfigHosts: SSHConfigHost[];
  loadSSHConfig: () => Promise<void>;
  
  // Connection tracking - keyed by PTY ID, not profile ID
  connections: Map<string, ConnectionHealth>;
  updateConnection: (ptyId: string, health: Partial<ConnectionHealth>) => void;
  removeConnection: (ptyId: string) => void;
  
  // Helper to get all connections for a profile
  getProfileConnections: (profileId: string) => ConnectionHealth[];
  
  // UI state
  isLoading: boolean;
  error: string | null;
}

const SSHProfilesContext = createContext<SSHProfilesContextType | undefined>(undefined);

export const useSSHProfiles = () => {
  const context = useContext(SSHProfilesContext);
  if (!context) {
    throw new Error('useSSHProfiles must be used within SSHProfilesProvider');
  }
  return context;
};

interface SSHProfilesProviderProps {
  children: React.ReactNode;
}

const SSHProfilesProviderInner: React.FC<SSHProfilesProviderProps> = ({ children }) => {
  const [profiles, setProfiles] = useState<SSHProfile[]>([]);
  const [sshConfigHosts, setSSHConfigHosts] = useState<SSHConfigHost[]>([]);
  const [connections, setConnections] = useState<Map<string, ConnectionHealth>>(new Map());
  const [groupOrders, setGroupOrders] = useState<GroupOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Operation queue to prevent race conditions in profile CRUD operations
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Load profiles from backend
  const loadProfiles = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loaded = await invoke<SSHProfile[]>('load_ssh_profiles');
      setProfiles(loaded);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      log.error('Failed to load SSH profiles', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save profiles to backend
  const saveProfiles = useCallback(async (newProfiles: SSHProfile[]) => {
    try {
      setError(null);
      await invoke('save_ssh_profiles', { profiles: newProfiles });
      setProfiles(newProfiles);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      log.error('Failed to save SSH profiles', err);
      throw err;
    }
  }, []);

  // Add a new profile (queued to prevent race conditions)
  const addProfile = useCallback(async (profile: SSHProfile) => {
    const operation = async () => {
      setError(null);
      const currentProfiles = await invoke<SSHProfile[]>('load_ssh_profiles');
      const newProfiles = [...currentProfiles, profile];
      await invoke('save_ssh_profiles', { profiles: newProfiles });
      setProfiles(newProfiles);
    };
    
    operationQueueRef.current = operationQueueRef.current
      .then(operation)
      .catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        log.error('Failed to add SSH profile', err);
        throw err;
      });
    
    return operationQueueRef.current;
  }, []);

  // Update existing profile (queued to prevent race conditions)
  const updateProfile = useCallback(async (id: string, updates: Partial<SSHProfile>) => {
    const operation = async () => {
      setError(null);
      const currentProfiles = await invoke<SSHProfile[]>('load_ssh_profiles');
      const newProfiles = currentProfiles.map(p => 
        p.id === id ? { ...p, ...updates } : p
      );
      await invoke('save_ssh_profiles', { profiles: newProfiles });
      setProfiles(newProfiles);
    };
    
    operationQueueRef.current = operationQueueRef.current
      .then(operation)
      .catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        log.error('Failed to update SSH profile', err);
        throw err;
      });
    
    return operationQueueRef.current;
  }, []);

  // Delete profile (queued to prevent race conditions)
  const deleteProfile = useCallback(async (id: string) => {
    const operation = async () => {
      setError(null);
      const currentProfiles = await invoke<SSHProfile[]>('load_ssh_profiles');
      const newProfiles = currentProfiles.filter(p => p.id !== id);
      await invoke('save_ssh_profiles', { profiles: newProfiles });
      setProfiles(newProfiles);
    };
    
    operationQueueRef.current = operationQueueRef.current
      .then(operation)
      .catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        log.error('Failed to delete SSH profile', err);
        throw err;
      });
    
    return operationQueueRef.current;
  }, []);

  // Reorder a profile within its group or move to a new group
  const reorderProfile = useCallback(async (profileId: string, newOrder: number, newGroup?: string) => {
    const operation = async () => {
      setError(null);
      log.debug('reorderProfile operation starting', { profileId, newOrder, newGroup });
      
      const currentProfiles = await invoke<SSHProfile[]>('load_ssh_profiles');
      log.debug('Loaded current profiles', { count: currentProfiles.length });
      
      const profile = currentProfiles.find(p => p.id === profileId);
      if (!profile) {
        log.error('Profile not found for reorder', { profileId });
        return;
      }
      
      // Determine target group - undefined/null means 'Ungrouped'
      const sourceGroup = profile.group || 'Ungrouped';
      const targetGroup = newGroup === undefined ? sourceGroup : (newGroup || 'Ungrouped');
      
      log.debug('Reordering profile', { profileId, profileName: profile.name, sourceGroup, targetGroup, newOrder });
      
      // Get all profiles in the target group (excluding the one being moved)
      const groupProfiles = currentProfiles.filter(p => 
        (p.group || 'Ungrouped') === targetGroup && p.id !== profileId
      );
      
      log.debug('Profiles in target group (excluding moved)', { 
        count: groupProfiles.length, 
        names: groupProfiles.map(p => p.name)
      });
      
      // Sort by current order
      groupProfiles.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
      
      // Prepare the moved profile with updated group
      const movedProfile = { 
        ...profile, 
        group: targetGroup === 'Ungrouped' ? undefined : targetGroup 
      };
      
      // Insert the profile at the new position
      const clampedIndex = Math.max(0, Math.min(newOrder, groupProfiles.length));
      log.debug('Inserting at index', { clampedIndex, totalInGroup: groupProfiles.length });
      groupProfiles.splice(clampedIndex, 0, movedProfile);
      
      // Update order values for all profiles in the group
      const updatedGroupProfiles = groupProfiles.map((p, idx) => ({ ...p, order: idx }));
      
      log.debug('Updated group order', { 
        profiles: updatedGroupProfiles.map(p => ({ name: p.name, order: p.order }))
      });
      
      // Merge back with profiles from other groups
      const otherProfiles = currentProfiles.filter(p => 
        (p.group || 'Ungrouped') !== targetGroup && p.id !== profileId
      );
      
      const newProfiles = [...otherProfiles, ...updatedGroupProfiles];
      log.debug('Saving reordered profiles', { count: newProfiles.length });
      
      try {
        await invoke('save_ssh_profiles', { profiles: newProfiles });
        log.debug('Backend save successful');
        setProfiles(newProfiles);
        log.debug('Local state updated');
      } catch (saveErr) {
        log.error('Failed to save reordered profiles to backend', saveErr);
        throw saveErr;
      }
    };
    
    operationQueueRef.current = operationQueueRef.current
      .then(operation)
      .catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        log.error('Failed to reorder SSH profile', err);
        throw err;
      });
    
    return operationQueueRef.current;
  }, []);

  // Reorder a group
  const reorderGroup = useCallback((groupName: string, newOrder: number) => {
    log.debug('Reordering group', { groupName, newOrder });
    
    setGroupOrders(prev => {
      // Get all current group names from profiles
      const allGroupNames = new Set<string>();
      profiles.forEach(p => allGroupNames.add(p.group || 'Ungrouped'));
      
      // Ensure all groups have an order entry
      const existingOrders = new Map(prev.map(g => [g.name, g.order]));
      const allOrders: GroupOrder[] = [];
      
      let nextOrder = 0;
      allGroupNames.forEach(name => {
        if (name !== 'Ungrouped') { // Ungrouped is always last
          allOrders.push({ 
            name, 
            order: existingOrders.get(name) ?? nextOrder++ 
          });
        }
      });
      
      // Sort by existing order
      allOrders.sort((a, b) => a.order - b.order);
      
      // Remove the group being moved
      const filtered = allOrders.filter(g => g.name !== groupName);
      
      // Insert at new position
      const clampedIndex = Math.max(0, Math.min(newOrder, filtered.length));
      filtered.splice(clampedIndex, 0, { name: groupName, order: newOrder });
      
      // Renumber
      const renumbered = filtered.map((g, idx) => ({ ...g, order: idx }));
      
      // Persist to localStorage
      try {
        localStorage.setItem('ssh-group-orders', JSON.stringify(renumbered));
        log.debug('Saved group orders', { orders: renumbered });
      } catch (err) {
        log.error('Failed to save group orders', err);
      }
      
      return renumbered;
    });
  }, [profiles]);

  // Load group orders from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ssh-group-orders');
      if (stored) {
        setGroupOrders(JSON.parse(stored));
      }
    } catch (err) {
      log.error('Failed to load group orders', err);
    }
  }, []);

  // Load SSH config hosts
  const loadSSHConfig = useCallback(async () => {
    try {
      setError(null);
      const hosts = await invoke<SSHConfigHost[]>('get_ssh_config_hosts');
      setSSHConfigHosts(hosts);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      log.error('Failed to load SSH config', err);
    }
  }, []);

  // Update connection health
  const updateConnection = useCallback((ptyId: string, health: Partial<ConnectionHealth>) => {
    setConnections(prev => {
      const updated = new Map(prev);
      const existing = updated.get(ptyId);
      updated.set(ptyId, {
        profileId: health.profileId || existing?.profileId || '',
        tabId: health.tabId || existing?.tabId || ptyId,
        tabName: health.tabName ?? existing?.tabName,
        status: health.status || existing?.status || 'disconnected',
        latency: health.latency ?? existing?.latency,
        connectedAt: health.connectedAt ?? existing?.connectedAt,
        lastActivity: health.lastActivity ?? existing?.lastActivity,
        error: health.error ?? existing?.error,
      });
      return updated;
    });
  }, []);

  // Remove connection (cleanup when PTY closes)
  const removeConnection = useCallback((ptyId: string) => {
    setConnections(prev => {
      const updated = new Map(prev);
      updated.delete(ptyId);
      return updated;
    });
  }, []);

  // Get all connections for a specific profile
  const getProfileConnections = useCallback((profileId: string): ConnectionHealth[] => {
    return Array.from(connections.values()).filter(c => c.profileId === profileId);
  }, [connections]);

  // Get a profile by ID
  const getProfileById = useCallback((id: string): SSHProfile | undefined => {
    return profiles.find(p => p.id === id);
  }, [profiles]);

  // Load profiles and SSH config on mount
  useEffect(() => {
    const init = async () => {
      await loadProfiles();
      await loadSSHConfig();
    };
    init();
  }, [loadProfiles, loadSSHConfig]);

  const value = useMemo<SSHProfilesContextType>(() => ({
    profiles,
    loadProfiles,
    saveProfiles,
    addProfile,
    updateProfile,
    deleteProfile,
    getProfileById,
    reorderProfile,
    reorderGroup,
    groupOrders,
    sshConfigHosts,
    loadSSHConfig,
    connections,
    updateConnection,
    removeConnection,
    getProfileConnections,
    isLoading,
    error,
  }), [
    profiles,
    loadProfiles,
    saveProfiles,
    addProfile,
    updateProfile,
    deleteProfile,
    getProfileById,
    reorderProfile,
    reorderGroup,
    groupOrders,
    sshConfigHosts,
    loadSSHConfig,
    connections,
    updateConnection,
    removeConnection,
    getProfileConnections,
    isLoading,
    error,
  ]);

  return (
    <SSHProfilesContext.Provider value={value}>
      {children}
    </SSHProfilesContext.Provider>
  );
};

export const SSHProfilesProvider: React.FC<SSHProfilesProviderProps> = ({ children }) => {
  return (
    <ContextErrorBoundary contextName="SSH Profiles">
      <SSHProfilesProviderInner>
        {children}
      </SSHProfilesProviderInner>
    </ContextErrorBoundary>
  );
};
