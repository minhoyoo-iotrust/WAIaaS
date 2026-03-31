// WAIaaS Desktop Spike — Minimal Tauri 2 shell
// No IPC commands needed for WalletConnect spike (web-only test)

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
