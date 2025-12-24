use crate::models::{AppState, PtySession};
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use tauri::State;
use super::shell::resolve_shell;
use super::integration::{setup_integration_scripts, configure_shell_command};
use super::reader::spawn_reader_thread;

#[tauri::command]
pub fn spawn_pty(window: tauri::Window, state: State<AppState>) -> Result<u32, String> {
    let id = {
        let mut next_id = state.next_id.lock()
            .map_err(|e| format!("Failed to acquire ID lock: {}", e))?;
        let id = *next_id;
        *next_id += 1;
        id
    };

    let pty_system = NativePtySystem::default();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // Detect user's preferred shell
    let shell = if cfg!(target_os = "windows") {
        std::env::var("SHELL").unwrap_or_else(|_| "powershell.exe".to_string())
    } else {
        resolve_shell()
    };

    let mut cmd = CommandBuilder::new(&shell);
    
    // Setup shell integration
    let config_dir = setup_integration_scripts();
    configure_shell_command(&mut cmd, &shell, config_dir.as_ref());

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let master = pair.master;
    let writer = master.take_writer().map_err(|e| e.to_string())?;

    // Spawn reader thread with SSH detection
    let reader_handle = spawn_reader_thread(
        reader,
        window,
        id,
        state.ssh_sessions.clone(),
    );

    {
        let mut ptys = state.ptys.lock()
            .map_err(|e| format!("Failed to acquire PTY lock: {}", e))?;
        ptys.insert(
            id,
            PtySession {
                master,
                writer,
                child: Some(child),
                reader_handle: Some(reader_handle),
                ssh_session: None,
            },
        );
    }

    Ok(id)
}
