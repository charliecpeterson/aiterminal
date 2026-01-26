import React, { useEffect } from "react";
import { SSHSessionPanel } from "./SSHSessionPanel";
import { SSHProfileEditor } from "./SSHProfileEditor";
import { useSSHProfiles } from "../context/SSHProfilesContext";
import { SSHProfile } from "../types/ssh";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { createLogger } from "../utils/logger";
import { sshWindowStyles } from "./SSHSessionWindow.styles";

const log = createLogger('SSHSessionWindow');

const SSHSessionWindow: React.FC = () => {
  const { addProfile, updateProfile, updateConnection } = useSSHProfiles();
  const [editingProfile, setEditingProfile] = React.useState<SSHProfile | null>(null);
  const [showEditor, setShowEditor] = React.useState(false);

  // Listen for connection status updates from main window
  useEffect(() => {
    const unlistenPromise = listen<{
      ptyId: string;
      profileId: string;
      tabName?: string;
      status: 'connected' | 'disconnected' | 'error' | 'connecting';
      latency?: number;
      tabId: string;
    }>("connection-status-update", (event) => {
      updateConnection(event.payload.ptyId, {
        profileId: event.payload.profileId,
        tabId: event.payload.tabId,
        tabName: event.payload.tabName,
        status: event.payload.status,
        latency: event.payload.latency,
        lastActivity: new Date(),
      });
    });

    // Request initial connection status from main window
    emitTo("main", "ssh:request-status", {}).catch(() => {});

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [updateConnection]);

  const handleConnect = (profile: SSHProfile) => {
    // Emit event to main window to connect this profile
    emitTo("main", "ssh:connect", { profile }).catch((err) => {
      log.error('Failed to emit ssh:connect event', err);
    });
  };

  const handleGoToTab = (ptyId: string) => {
    // Emit event to main window to focus the tab for this ptyId
    emit("ssh:goto-tab", { ptyId }).catch((err) => {
      log.error('Failed to emit ssh:goto-tab event', err);
    });
  };

  const handleCreateProfile = () => {
    setEditingProfile(null);
    setShowEditor(true);
  };

  const handleEditProfile = (profile: SSHProfile) => {
    setEditingProfile(profile);
    setShowEditor(true);
  };

  const handleSaveProfile = async (profile: SSHProfile) => {
    if (editingProfile) {
      // When editing, pass the complete profile
      await updateProfile(profile.id, profile);
    } else {
      await addProfile(profile);
    }
    setShowEditor(false);
  };

  return (
    <div style={sshWindowStyles.window}>
      <SSHProfileEditor
        profile={editingProfile || undefined}
        isOpen={showEditor}
        onClose={() => setShowEditor(false)}
        onSave={handleSaveProfile}
      />
      <SSHSessionPanel
        onConnect={handleConnect}
        onEditProfile={handleEditProfile}
        onNewProfile={handleCreateProfile}
        onGoToTab={handleGoToTab}
        standalone={true}
      />
    </div>
  );
};

export default SSHSessionWindow;
