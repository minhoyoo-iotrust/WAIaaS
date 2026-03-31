// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod lockfile;
mod sidecar;
mod tray;
mod types;

use serde_json::json;
use tauri::{Emitter, Manager};

use crate::commands::{
    get_daemon_logs, get_daemon_status, quit_app, restart_daemon, send_notification, start_daemon,
    stop_daemon,
};
use crate::sidecar::SidecarManager;

fn main() {
    // Windows Job Object for zombie process prevention (SIDE-06)
    if let Err(e) = sidecar::setup_job_object() {
        eprintln!("Warning: Failed to setup Job Object: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(SidecarManager::new())
        .invoke_handler(tauri::generate_handler![
            start_daemon,
            stop_daemon,
            restart_daemon,
            get_daemon_status,
            get_daemon_logs,
            send_notification,
            quit_app,
        ])
        .setup(|app| {
            // Initialize system tray with 3-color status icon and context menu
            tray::setup_tray(app)?;

            let app_handle = app.handle().clone();

            // Remote WebView capability for localhost URLs
            // App-level IPC commands are accessible from the main window by default.
            // For remote URLs (Admin Web UI loaded via localhost), the remote block
            // in capabilities/default.json grants access. CapabilityBuilder with
            // app-level command permissions will be added when custom plugin
            // permissions are defined in Phase 461.

            // Determine data directory
            let data_dir = app
                .path()
                .app_data_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| {
                    let home = dirs_next::home_dir()
                        .unwrap_or_else(|| std::path::PathBuf::from("."));
                    home.join(".waiaas").to_string_lossy().to_string()
                });

            // Spawn async task to start daemon and navigate to Admin Web UI
            tauri::async_runtime::spawn(async move {
                let manager = app_handle.state::<SidecarManager>();
                manager.set_data_dir(data_dir).await;

                match manager.start(&app_handle).await {
                    Ok(status) => {
                        let url = format!("http://127.0.0.1:{}/admin", status.port);
                        if let Some(window) = app_handle.get_webview_window("main") {
                            match url.parse::<tauri::Url>() {
                                Ok(parsed_url) => {
                                    let _ = window.navigate(parsed_url);
                                }
                                Err(e) => {
                                    app_handle
                                        .emit(
                                            "sidecar-status",
                                            json!({
                                                "stage": "error",
                                                "message": format!("Invalid URL: {}", e)
                                            }),
                                        )
                                        .ok();
                                }
                            }
                        }
                    }
                    Err(e) => {
                        app_handle
                            .emit(
                                "sidecar-status",
                                json!({
                                    "stage": "error",
                                    "message": e
                                }),
                            )
                            .ok();
                    }
                }
            });

            // Start 30-second tray icon polling for health status updates
            let tray_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tray::start_tray_polling(tray_handle).await;
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app_handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let manager = app_handle.state::<SidecarManager>();
                    if let Err(e) = manager.stop(false).await {
                        log::warn!("Failed to stop daemon on close: {}", e);
                    }
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running WAIaaS Desktop");
}
