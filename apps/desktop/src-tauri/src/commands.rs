use tauri::State;

use crate::sidecar::SidecarManager;
use crate::types::{DaemonStatus, GetLogsArgs, NotificationArgs, StopDaemonArgs};

/// Start the sidecar daemon process
#[tauri::command]
pub async fn start_daemon(
    app: tauri::AppHandle,
    state: State<'_, SidecarManager>,
) -> Result<DaemonStatus, String> {
    state.start(&app).await
}

/// Stop the sidecar daemon process
#[tauri::command]
pub async fn stop_daemon(
    args: StopDaemonArgs,
    state: State<'_, SidecarManager>,
) -> Result<(), String> {
    let force = args.force.unwrap_or(false);
    state.stop(force).await
}

/// Restart the sidecar daemon (stop + wait + start)
#[tauri::command]
pub async fn restart_daemon(
    app: tauri::AppHandle,
    state: State<'_, SidecarManager>,
) -> Result<DaemonStatus, String> {
    state.stop(false).await?;
    // Wait for port release
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    state.start(&app).await
}

/// Get the current daemon status including health check
#[tauri::command]
pub async fn get_daemon_status(
    state: State<'_, SidecarManager>,
) -> Result<DaemonStatus, String> {
    Ok(state.check_health().await)
}

/// Get recent daemon log lines
#[tauri::command]
pub async fn get_daemon_logs(
    args: GetLogsArgs,
    state: State<'_, SidecarManager>,
) -> Result<Vec<String>, String> {
    let lines = args.lines.unwrap_or(100);
    Ok(state.get_logs(lines).await)
}

/// Send an OS native notification via tauri-plugin-notification
#[tauri::command]
pub async fn send_notification(
    args: NotificationArgs,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    app.notification()
        .builder()
        .title(&args.title)
        .body(&args.body)
        .show()
        .map_err(|e| format!("NotificationFailed: {}", e))?;

    Ok(())
}
