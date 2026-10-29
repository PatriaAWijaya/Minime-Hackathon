//! Buka URL di browser sistem (bukan webview app).
//! Hanya dua URL yang diizinkan: UI Postiz lokal dan halaman unduh
//! Docker Desktop. Alasan Postiz: login Google TIDAK bisa di dalam
//! panel/frame (accounts.google.com memasang X-Frame-Options: DENY
//! dan webview tidak membuka popup OAuth), sehingga pengguna Google
//! harus login lewat browser asli. Dipakai tombol "Buka di browser"
//! di panel Planner. Alasan Docker: instalasi Docker Desktop adalah
//! satu-satunya langkah instalasi Postiz yang tidak bisa diotomasi
//! dari app (aplikasi macOS) — wizard mengarahkan pengguna ke halaman
//! resminya, selebihnya satu klik.
use std::process::Command;

#[tauri::command]
pub fn open_browser(url: String) -> Result<(), String> {
    if url != "http://localhost:4007"
        && !url.starts_with("http://localhost:4007/")
        && url != "https://www.docker.com/products/docker-desktop/"
    {
        return Err("URL tidak diizinkan".into());
    }
    Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
