use std::fs;
use std::path::Path;

/// Create a PID lockfile at {data_dir}/daemon.pid
/// Returns Err if another instance is already running.
pub fn create_lockfile(data_dir: &str) -> Result<(), String> {
    let lockfile_path = Path::new(data_dir).join("daemon.pid");

    // Check for existing lockfile
    if let Some(existing_pid) = check_lockfile(data_dir) {
        if is_process_alive(existing_pid) {
            return Err(format!(
                "AlreadyRunning: daemon is already running with PID {}",
                existing_pid
            ));
        }
        // Stale lockfile -- remove it
        log::warn!("Removing stale lockfile for PID {}", existing_pid);
        let _ = fs::remove_file(&lockfile_path);
    }

    // Ensure data directory exists
    if let Some(parent) = lockfile_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create data dir: {}", e))?;
    }

    // Write current process PID (we'll update with child PID after spawn)
    fs::write(&lockfile_path, std::process::id().to_string())
        .map_err(|e| format!("Failed to write lockfile: {}", e))?;

    Ok(())
}

/// Update the lockfile with the actual daemon child PID
pub fn update_lockfile_pid(data_dir: &str, pid: u32) -> Result<(), String> {
    let lockfile_path = Path::new(data_dir).join("daemon.pid");
    fs::write(&lockfile_path, pid.to_string())
        .map_err(|e| format!("Failed to update lockfile PID: {}", e))?;
    Ok(())
}

/// Remove the PID lockfile
pub fn remove_lockfile(data_dir: &str) {
    let lockfile_path = Path::new(data_dir).join("daemon.pid");
    let _ = fs::remove_file(lockfile_path);
}

/// Check if a lockfile exists and return the PID if present
pub fn check_lockfile(data_dir: &str) -> Option<u32> {
    let lockfile_path = Path::new(data_dir).join("daemon.pid");
    if lockfile_path.exists() {
        if let Ok(content) = fs::read_to_string(&lockfile_path) {
            return content.trim().parse::<u32>().ok();
        }
    }
    None
}

/// Check if a process with the given PID is alive
#[cfg(unix)]
fn is_process_alive(pid: u32) -> bool {
    // On Unix, kill with signal 0 checks process existence without sending a signal
    unsafe { ::libc::kill(pid as i32, 0) == 0 }
}

#[cfg(windows)]
fn is_process_alive(pid: u32) -> bool {
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::Foundation::CloseHandle;

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        match handle {
            Ok(h) => {
                let _ = CloseHandle(h);
                true
            }
            Err(_) => false,
        }
    }
}
