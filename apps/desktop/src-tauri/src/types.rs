use serde::{Deserialize, Serialize};

/// Daemon process state enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DaemonState {
    Stopped,
    Starting,
    Running,
    Stopping,
    Crashed,
    Error,
}

/// Health status from /health endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HealthStatus {
    Healthy,
    Unhealthy { reason: String },
    Unknown,
}

/// Health response from daemon /health endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: Option<String>,
    pub uptime: Option<u64>,
    pub kill_switch: Option<String>,
}

/// Overall daemon status returned to WebView
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub port: u16,
    pub uptime_secs: u64,
    pub health: HealthStatus,
    pub restart_count: u32,
    pub state: DaemonState,
}

impl Default for DaemonStatus {
    fn default() -> Self {
        Self {
            running: false,
            pid: None,
            port: 0,
            uptime_secs: 0,
            health: HealthStatus::Unknown,
            restart_count: 0,
            state: DaemonState::Stopped,
        }
    }
}

/// Arguments for start_daemon IPC command
#[derive(Debug, Clone, Deserialize)]
pub struct StartDaemonArgs {
    pub port: Option<u16>,
    pub config_path: Option<String>,
}

/// Arguments for stop_daemon IPC command
#[derive(Debug, Clone, Deserialize)]
pub struct StopDaemonArgs {
    pub force: Option<bool>,
}

/// Arguments for get_daemon_logs IPC command
#[derive(Debug, Clone, Deserialize)]
pub struct GetLogsArgs {
    pub lines: Option<u32>,
    pub since: Option<String>,
}

/// Arguments for send_notification IPC command
#[derive(Debug, Clone, Deserialize)]
pub struct NotificationArgs {
    pub title: String,
    pub body: String,
    pub icon: Option<String>,
}

/// Sidecar status event emitted to WebView splash screen
#[derive(Debug, Clone, Serialize)]
pub struct SidecarStatusEvent {
    pub stage: String,
    pub port: Option<u16>,
    pub message: Option<String>,
}
