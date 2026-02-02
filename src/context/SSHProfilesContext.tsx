/**
 * SSH Profiles Context
 * 
 * Manages SSH profiles, provides CRUD operations, and tracks connection health
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SSHProfile, SSHConfigHost, ConnectionHealth } from '../types/ssh';
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
