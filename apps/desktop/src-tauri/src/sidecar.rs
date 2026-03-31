use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Duration, Instant};

use regex::Regex;
use serde_json::json;
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tokio::sync::Mutex;

use crate::lockfile;
use crate::types::{DaemonState, DaemonStatus, HealthResponse, HealthStatus, SidecarStatusEvent};

const MAX_LOG_LINES: usize = 1000;
const PORT_DISCOVERY_TIMEOUT_SECS: u64 = 10;
const HEALTH_CHECK_TIMEOUT_SECS: u64 = 30;
const HEALTH_CHECK_INTERVAL_MS: u64 = 2000;
const MAX_RESTART_COUNT: u32 = 3;
const GRACEFUL_SHUTDOWN_SECS: u64 = 35;
const KILL_WAIT_SECS: u64 = 5;

/// SidecarManager manages the lifecycle of the WAIaaS daemon sidecar process.
///
/// Responsibilities:
/// - Spawn/stop the daemon binary
/// - Discover the dynamically assigned port from stdout
/// - Monitor health via /health endpoint
/// - Auto-restart on crash (up to MAX_RESTART_COUNT)
/// - PID lockfile management
/// - Log buffer for recent stdout/stderr lines
pub struct SidecarManager {
    child: Arc<Mutex<Option<CommandChild>>>,
    status: Arc<Mutex<DaemonStatus>>,
    log_buffer: Arc<Mutex<VecDeque<String>>>,
    data_dir: Arc<Mutex<String>>,
    started_at: Arc<Mutex<Option<Instant>>>,
    port: Arc<Mutex<u16>>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            status: Arc::new(Mutex::new(DaemonStatus::default())),
            log_buffer: Arc::new(Mutex::new(VecDeque::with_capacity(MAX_LOG_LINES))),
            data_dir: Arc::new(Mutex::new(String::new())),
            started_at: Arc::new(Mutex::new(None)),
            port: Arc::new(Mutex::new(0)),
        }
    }

    /// Set the data directory for the daemon
    pub async fn set_data_dir(&self, dir: String) {
        let mut data_dir = self.data_dir.lock().await;
        *data_dir = dir;
    }

    /// Start the sidecar daemon process
    /// Returns the DaemonStatus with the discovered port
    pub async fn start(&self, app: &tauri::AppHandle) -> Result<DaemonStatus, String> {
        // Check if already running
        {
            let status = self.status.lock().await;
            if status.state == DaemonState::Running {
                return Ok(status.clone());
            }
        }

        let data_dir = self.data_dir.lock().await.clone();

        // Emit status: spawning
        emit_status(app, "spawning", None, None);

        // Update state to Starting
        {
            let mut status = self.status.lock().await;
            status.state = DaemonState::Starting;
        }

        // Check PID lockfile (SIDE-05)
        lockfile::create_lockfile(&data_dir)?;

        // Spawn the sidecar binary via tauri-plugin-shell (Tauri 2.x pattern)
        let shell = app.shell();
        let command = shell
            .sidecar("waiaas-daemon")
            .map_err(|e| format!("SpawnFailed: {}", e))?
            .args(["--port=0", &format!("--data-dir={}", data_dir)]);

        let (mut rx, child) = command
            .spawn()
            .map_err(|e| format!("SpawnFailed: {}", e))?;

        // Store child process handle
        {
            let mut child_lock = self.child.lock().await;
            *child_lock = Some(child);
        }

        // Update PID in lockfile
        // Note: tauri-plugin-shell CommandChild doesn't expose PID directly,
        // so we track the process through the shell plugin's management

        // Set up stdout/stderr listener for port discovery and log capture
        let port_arc = self.port.clone();
        let log_buffer = self.log_buffer.clone();
        let status_arc = self.status.clone();
        let started_at_arc = self.started_at.clone();
        let app_handle = app.clone();
        let data_dir_clone = data_dir.clone();

        // Port discovery channel
        let (port_tx, port_rx) = tokio::sync::oneshot::channel::<u16>();
        let port_tx = Arc::new(Mutex::new(Some(port_tx)));

        // Spawn event listener task
        let port_tx_clone = port_tx.clone();
        let port_regex = Regex::new(r"^WAIAAS_PORT=(\d+)$").unwrap();
        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        let line_str = String::from_utf8_lossy(&line).trim().to_string();
                        if line_str.is_empty() {
                            continue;
                        }

                        // Check for port discovery pattern
                        if let Some(caps) = port_regex.captures(&line_str) {
                            if let Some(port_str) = caps.get(1) {
                                if let Ok(port) = port_str.as_str().parse::<u16>() {
                                    let mut port_lock = port_arc.lock().await;
                                    *port_lock = port;

                                    // Send port through channel
                                    let mut tx = port_tx_clone.lock().await;
                                    if let Some(sender) = tx.take() {
                                        let _ = sender.send(port);
                                    }
                                }
                            }
                        }

                        // Store in log buffer
                        let mut buffer = log_buffer.lock().await;
                        if buffer.len() >= MAX_LOG_LINES {
                            buffer.pop_front();
                        }
                        buffer.push_back(line_str);
                    }
                    CommandEvent::Stderr(line) => {
                        let line_str =
                            format!("[stderr] {}", String::from_utf8_lossy(&line).trim());
                        let mut buffer = log_buffer.lock().await;
                        if buffer.len() >= MAX_LOG_LINES {
                            buffer.pop_front();
                        }
                        buffer.push_back(line_str);
                    }
                    CommandEvent::Terminated(payload) => {
                        log::warn!(
                            "Sidecar process terminated: code={:?} signal={:?}",
                            payload.code,
                            payload.signal
                        );

                        let mut status = status_arc.lock().await;
                        let was_running = status.state == DaemonState::Running;
                        status.state = DaemonState::Crashed;
                        status.running = false;
                        status.pid = None;

                        lockfile::remove_lockfile(&data_dir_clone);

                        // If it was running (not stopping intentionally), it crashed
                        if was_running && status.restart_count < MAX_RESTART_COUNT {
                            status.restart_count += 1;
                            let count = status.restart_count;
                            drop(status);

                            emit_status(
                                &app_handle,
                                "restarting",
                                None,
                                Some(format!("Daemon crashed, restarting ({}/{})", count, MAX_RESTART_COUNT)),
                            );

                            // Wait before restart
                            tokio::time::sleep(Duration::from_secs(5)).await;

                            // Note: Auto-restart would need access to SidecarManager
                            // which creates a circular reference. Instead, emit event
                            // and let main.rs handle restart via app event.
                            app_handle
                                .emit("sidecar-crashed", json!({ "restart_count": count }))
                                .ok();
                        } else if was_running {
                            drop(status);
                            emit_status(
                                &app_handle,
                                "error",
                                None,
                                Some("Daemon crashed too many times. Please check logs.".into()),
                            );
                        }

                        break;
                    }
                    _ => {}
                }
            }
        });

        // Wait for port discovery (10 second timeout)
        emit_status(app, "port_discovery", None, None);
        let discovered_port = tokio::time::timeout(
            Duration::from_secs(PORT_DISCOVERY_TIMEOUT_SECS),
            port_rx,
        )
        .await
        .map_err(|_| {
            // Timeout: try fallback file
            "PortDiscoveryTimeout".to_string()
        })
        .and_then(|r| r.map_err(|_| "PortDiscoveryFailed".to_string()));

        let port = match discovered_port {
            Ok(p) => p,
            Err(_) => {
                // Fallback: read port from file
                let port_file = std::path::Path::new(&data_dir).join("daemon.port");
                if port_file.exists() {
                    let content = std::fs::read_to_string(&port_file)
                        .map_err(|e| format!("PortFileFailed: {}", e))?;
                    content
                        .trim()
                        .parse::<u16>()
                        .map_err(|e| format!("PortParseFailed: {}", e))?
                } else {
                    return Err("PortDiscoveryFailed: no port from stdout or file".to_string());
                }
            }
        };

        // Store discovered port
        {
            let mut port_lock = self.port.lock().await;
            *port_lock = port;
        }

        // Emit status: health check
        emit_status(app, "health_check", Some(port), None);

        // Wait for /health to respond (30 second timeout, 2 second interval)
        let health_ok = self.wait_for_health(port).await;
        if !health_ok {
            return Err("HealthTimeout: daemon did not become healthy within 30 seconds".to_string());
        }

        // Update status to Running
        let now = Instant::now();
        {
            let mut started_at = self.started_at.lock().await;
            *started_at = Some(now);
        }
        {
            let mut status = self.status.lock().await;
            status.running = true;
            status.port = port;
            status.state = DaemonState::Running;
            status.health = HealthStatus::Healthy;

            emit_status(app, "ready", Some(port), None);

            Ok(status.clone())
        }
    }

    /// Stop the sidecar daemon process
    /// force=false: POST /shutdown -> SIGTERM -> 5s -> SIGKILL
    /// force=true: immediate kill
    pub async fn stop(&self, force: bool) -> Result<(), String> {
        {
            let mut status = self.status.lock().await;
            if status.state == DaemonState::Stopped {
                return Ok(());
            }
            status.state = DaemonState::Stopping;
        }

        let port = *self.port.lock().await;

        if !force && port > 0 {
            // Try graceful shutdown via HTTP POST /v1/admin/shutdown
            let client = reqwest::Client::new();
            let shutdown_url = format!("http://127.0.0.1:{}/v1/admin/shutdown", port);

            let shutdown_result = tokio::time::timeout(
                Duration::from_secs(GRACEFUL_SHUTDOWN_SECS),
                client.post(&shutdown_url).send(),
            )
            .await;

            match shutdown_result {
                Ok(Ok(_)) => {
                    // Wait for process to exit
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
                _ => {
                    log::warn!("Graceful shutdown request failed or timed out");
                }
            }
        }

        // Kill the child process
        {
            let mut child_lock = self.child.lock().await;
            if let Some(child) = child_lock.take() {
                let _ = child.kill();
            }
        }

        // Wait for process to fully exit
        tokio::time::sleep(Duration::from_millis(500)).await;

        // Clean up state
        let data_dir = self.data_dir.lock().await.clone();
        lockfile::remove_lockfile(&data_dir);

        {
            let mut status = self.status.lock().await;
            status.running = false;
            status.pid = None;
            status.state = DaemonState::Stopped;
            status.port = 0;
        }

        {
            let mut started_at = self.started_at.lock().await;
            *started_at = None;
        }

        Ok(())
    }

    /// Check health of the running daemon
    pub async fn check_health(&self) -> DaemonStatus {
        let port = *self.port.lock().await;
        let mut status = self.status.lock().await;

        if status.state != DaemonState::Running || port == 0 {
            return status.clone();
        }

        // Update uptime
        let started_at = self.started_at.lock().await;
        if let Some(start) = *started_at {
            status.uptime_secs = start.elapsed().as_secs();
        }

        // Check /health endpoint
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap_or_default();

        let health_url = format!("http://127.0.0.1:{}/health", port);
        match client.get(&health_url).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    match resp.json::<HealthResponse>().await {
                        Ok(health) => {
                            if health.status == "ok" {
                                status.health = HealthStatus::Healthy;
                            } else {
                                status.health = HealthStatus::Unhealthy {
                                    reason: health.status.clone(),
                                };
                            }
                        }
                        Err(_) => {
                            status.health = HealthStatus::Healthy;
                        }
                    }
                } else {
                    status.health = HealthStatus::Unhealthy {
                        reason: format!("HTTP {}", resp.status()),
                    };
                }
            }
            Err(e) => {
                status.health = HealthStatus::Unhealthy {
                    reason: format!("Connection failed: {}", e),
                };
            }
        }

        status.clone()
    }

    /// Get recent log lines from the buffer
    pub async fn get_logs(&self, lines: u32) -> Vec<String> {
        let buffer = self.log_buffer.lock().await;
        let count = std::cmp::min(lines as usize, buffer.len());
        buffer.iter().rev().take(count).rev().cloned().collect()
    }

    /// Get the currently discovered port
    pub async fn get_port(&self) -> u16 {
        *self.port.lock().await
    }

    /// Wait for the daemon /health endpoint to respond
    async fn wait_for_health(&self, port: u16) -> bool {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap_or_default();

        let health_url = format!("http://127.0.0.1:{}/health", port);
        let deadline = Instant::now() + Duration::from_secs(HEALTH_CHECK_TIMEOUT_SECS);

        while Instant::now() < deadline {
            match client.get(&health_url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    return true;
                }
                _ => {
                    tokio::time::sleep(Duration::from_millis(HEALTH_CHECK_INTERVAL_MS)).await;
                }
            }
        }

        false
    }
}

/// Set up Windows Job Object for zombie process prevention (SIDE-06)
#[cfg(windows)]
pub fn setup_job_object() -> Result<(), String> {
    use windows::Win32::System::JobObjects::*;
    use windows::Win32::Foundation::CloseHandle;

    unsafe {
        let job = CreateJobObjectW(None, None)
            .map_err(|e| format!("Failed to create Job Object: {}", e))?;

        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags =
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        let result = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );

        if !result.as_bool() {
            let _ = CloseHandle(job);
            return Err("Failed to set Job Object limits".to_string());
        }

        // Assign current process to the job
        let current = windows::Win32::System::Threading::GetCurrentProcess();
        let assign_result = AssignProcessToJobObject(job, current);
        if !assign_result.as_bool() {
            let _ = CloseHandle(job);
            return Err("Failed to assign process to Job Object".to_string());
        }

        // Intentionally leak the handle so it stays alive for the process lifetime
        std::mem::forget(job);
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn setup_job_object() -> Result<(), String> {
    // No-op on non-Windows platforms
    Ok(())
}

/// Emit a sidecar status event to the WebView
fn emit_status(app: &tauri::AppHandle, stage: &str, port: Option<u16>, message: Option<String>) {
    let event = SidecarStatusEvent {
        stage: stage.to_string(),
        port,
        message,
    };
    app.emit("sidecar-status", event).ok();
}
