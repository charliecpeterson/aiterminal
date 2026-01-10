use super::integration::{configure_shell_command, setup_integration_scripts};
use super::reader::spawn_reader_thread;
use super::shell::resolve_shell;
use crate::models::{AppState, PtySession};
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use tauri::State;

#[tauri::command]
pub fn spawn_pty(window: tauri::Window, state: State<AppState>) -> Result<u32, String> {
    let id = {
        let mut next_id = state
            .next_id
            .lock()
            .map_err(|e| format!("Failed to acquire ID lock: {}", e))?;
        let id = *next_id;
        *next_id += 1;
        id
    };

    let pty_system = NativePtySystem::default();

    // Use more realistic default dimensions to minimize issues if resize is delayed
    // Modern terminals are typically 100-200 cols × 30-50 rows
    // Using larger defaults prevents line wrapping issues in SSH sessions
    // The frontend will send the correct size immediately after connection
    let pair = pty_system
        .openpty(PtySize {
            rows: 50,
            cols: 200,
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
    let reader_handle = spawn_reader_thread(reader, window, id, state.ssh_sessions.clone());

    {
        let mut ptys = state
            .ptys
            .lock()
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
