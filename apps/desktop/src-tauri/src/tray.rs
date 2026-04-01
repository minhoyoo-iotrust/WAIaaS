use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

use crate::sidecar::SidecarManager;
use crate::types::{DaemonState, DaemonStatus, HealthStatus};

/// Tray icon color state
#[derive(Debug, Clone, Copy, PartialEq)]
enum TrayColor {
    Green,
    Yellow,
    Red,
}

/// Determine which tray icon color to show based on daemon status
fn determine_tray_color(status: &DaemonStatus) -> TrayColor {
    // Not running or crashed/error -> Red
    if !status.running
        || status.state == DaemonState::Crashed
        || status.state == DaemonState::Error
        || status.state == DaemonState::Stopped
    {
        return TrayColor::Red;
    }

    // Unhealthy -> Red
    if matches!(status.health, HealthStatus::Unhealthy { .. }) {
        return TrayColor::Red;
    }

    // Restarted at least once or unknown health -> Yellow
    if status.restart_count > 0 || matches!(status.health, HealthStatus::Unknown) {
        return TrayColor::Yellow;
    }

    // Healthy and running -> Green
    TrayColor::Green
}

/// Get the icon image bytes for a given color
fn icon_for_color(color: TrayColor) -> Image<'static> {
    let bytes: &[u8] = match color {
        TrayColor::Green => include_bytes!("../icons/tray-green.png"),
        TrayColor::Yellow => include_bytes!("../icons/tray-yellow.png"),
        TrayColor::Red => include_bytes!("../icons/tray-red.png"),
    };
    Image::from_bytes(bytes).expect("Failed to load tray icon")
}

const TRAY_ID: &str = "main";

/// Set up the system tray icon with context menu
pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Build context menu items
    let title_item =
        MenuItem::with_id(app, "title", "WAIaaS Desktop", false, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let open_dashboard =
        MenuItem::with_id(app, "open_dashboard", "Open Dashboard", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let start_daemon =
        MenuItem::with_id(app, "start_daemon", "Start Daemon", true, None::<&str>)?;
    let stop_daemon =
        MenuItem::with_id(app, "stop_daemon", "Stop Daemon", true, None::<&str>)?;
    let restart_daemon =
        MenuItem::with_id(app, "restart_daemon", "Restart Daemon", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit_item =
        MenuItem::with_id(app, "quit_waiaas", "Quit WAIaaS", true, None::<&str>)?;

    let menu = Menu::with_id_and_items(
        app,
        "tray_menu",
        &[
            &title_item,
            &sep1,
            &open_dashboard,
            &sep2,
            &start_daemon,
            &stop_daemon,
            &restart_daemon,
            &sep3,
            &quit_item,
        ],
    )?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon_for_color(TrayColor::Green))
        .tooltip("WAIaaS Desktop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "open_dashboard" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "start_daemon" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let manager = app.state::<SidecarManager>();
                        if let Err(e) = manager.start(&app).await {
                            log::error!("Tray start_daemon failed: {}", e);
                        }
                    });
                }
                "stop_daemon" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let manager = app.state::<SidecarManager>();
                        if let Err(e) = manager.stop(false).await {
                            log::error!("Tray stop_daemon failed: {}", e);
                        }
                    });
                }
                "restart_daemon" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let manager = app.state::<SidecarManager>();
                        if let Err(e) = manager.stop(false).await {
                            log::error!("Tray restart stop failed: {}", e);
                        }
                        tokio::time::sleep(Duration::from_secs(1)).await;
                        if let Err(e) = manager.start(&app).await {
                            log::error!("Tray restart start failed: {}", e);
                        }
                    });
                }
                "quit_waiaas" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let manager = app.state::<SidecarManager>();
                        let _ = manager.stop(false).await;
                        app.exit(0);
                    });
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            // Left click: show and focus main window
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// Start the 30-second polling loop that updates tray icon color based on daemon health
pub async fn start_tray_polling(app_handle: tauri::AppHandle) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    let mut last_color = TrayColor::Green;

    loop {
        interval.tick().await;

        let manager = app_handle.state::<SidecarManager>();
        let status = manager.check_health().await;
        let color = determine_tray_color(&status);

        // Only update icon if color changed
        if color != last_color {
            if let Some(tray) = app_handle.tray_by_id(TRAY_ID) {
                let _ = tray.set_icon(Some(icon_for_color(color)));

                // Update tooltip with status info
                let tooltip = match color {
                    TrayColor::Green => "WAIaaS Desktop - Running".to_string(),
                    TrayColor::Yellow => format!(
                        "WAIaaS Desktop - Degraded (restarts: {})",
                        status.restart_count
                    ),
                    TrayColor::Red => "WAIaaS Desktop - Stopped".to_string(),
                };
                let _ = tray.set_tooltip(Some(&tooltip));
            }
            last_color = color;
        }
    }
}
