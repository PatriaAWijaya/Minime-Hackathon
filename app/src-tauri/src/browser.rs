//! Buka URL di browser sistem (bukan webview app).
//! Satu-satunya URL yang diizinkan: UI Postiz lokal. Alasannya: login
//! Google TIDAK bisa di dalam panel/frame (accounts.google.com memasang
//! X-Frame-Options: DENY dan webview tidak membuka popup OAuth), sehingga
//! pengguna Google harus login lewat browser asli. Dipakai tombol
//! "Buka di browser" di panel Planner.
use std::process::Command;

#[tauri::command]
pub fn open_browser(url: String) -> Result<(), String> {
    if url != "http://localhost:4007" && !url.starts_with("http://localhost:4007/") {
        return Err("URL tidak diizinkan".into());
    }
    Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
