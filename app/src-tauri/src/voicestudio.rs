// VoiceStudio setup + auto-launch — proses EKSTERNAL, TIDAK di-bundle
// (aturan AGPL: VoiceStudio tetap aplikasi terpisah; MiniMe hanya
// mengunduh, memasang, membuka, dan memanggil API lokalnya).
//
// v215: fungsi setup satu paket (vs_install) DIHAPUS PENUH — instalasi /
// upgrade VoiceStudio kini urusan luar app (dipegang Mimi di sisi
// MacBook); app hanya membuka app yang sudah terpasang (vs_launch)
// dan memanggil API lokalnya. Helper unduh + hash di file ini tetap
// dipakai sherpa.rs (unduh model) dan video.rs (hash aset).
// Panggilan agen (vs_launch + agentVoice* di frontend): bila backend
// :3900 mati, buka aplikasinya dan tunggu sampai merespons, baru
// panggil API TTS/clone; audio kembali ke MiniMe sebagai data URL
// (player + unduh di tab Voice = "import" ke MiniMe).
// Batasan jujur: peluncuran PERTAMA bisa memunculkan dialog Gatekeeper
// macOS sekali (klik Open); v0.5.7 bisa meminta accept lisensi model
// di Model Catalogue sekali untuk voice default — keduanya klik
// manusia sekali, setelah itu otomatis penuh. NO SHELL — argv only.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};

use crate::video::find_tool;

const VS_BACKEND_URL: &str = "http://127.0.0.1:3900/v1/models";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VsLaunchResult {
    pub backend_up: bool,
    pub app_path: String,
}

fn home_dir() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

fn find_app() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(home) = home_dir() {
        candidates.push(home.join("Applications").join("VoiceStudio.app"));
    }
    candidates.push(PathBuf::from("/Applications/VoiceStudio.app"));
    candidates.into_iter().find(|c| c.is_dir())
}

pub(crate) fn curl_path() -> PathBuf {
    find_tool("curl").unwrap_or_else(|| PathBuf::from("/usr/bin/curl"))
}

fn backend_up() -> bool {
    let curl = curl_path();
    if !curl.exists() {
        return false;
    }
    match Command::new(curl)
        .args(["-sf", "-m", "3", VS_BACKEND_URL])
        .output()
    {
        Ok(out) => out.status.success(),
        Err(_) => false,
    }
}

fn poll_backend(secs: u64) -> bool {
    let start = Instant::now();
    loop {
        if backend_up() {
            return true;
        }
        if start.elapsed() >= Duration::from_secs(secs) {
            return false;
        }
        std::thread::sleep(Duration::from_secs(2));
    }
}

fn launch_app(app: &PathBuf) -> Result<(), String> {
    let open = find_tool("open").unwrap_or_else(|| PathBuf::from("/usr/bin/open"));
    let out = Command::new(open)
        .arg(app)
        .output()
        .map_err(|e| format!("gagal membuka VoiceStudio.app: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "perintah open gagal: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(())
}

const LAUNCH_TIMEOUT_NOTE: &str = "VoiceStudio dibuka tetapi backend :3900 tidak merespons dalam 60 detik — bila muncul dialog macOS, klik Open; bila muncul permintaan lisensi model, terima di Model Catalogue VoiceStudio lalu coba lagi.";

#[tauri::command]
pub fn vs_launch() -> Result<VsLaunchResult, String> {
    let Some(app) = find_app() else {
        return Err(
            "VoiceStudio belum terpasang di ~/Applications maupun /Applications — jalankan Setup dulu."
                .to_string(),
        );
    };
    if backend_up() {
        return Ok(VsLaunchResult {
            backend_up: true,
            app_path: app.to_string_lossy().to_string(),
        });
    }
    launch_app(&app)?;
    if poll_backend(60) {
        Ok(VsLaunchResult {
            backend_up: true,
            app_path: app.to_string_lossy().to_string(),
        })
    } else {
        Err(LAUNCH_TIMEOUT_NOTE.to_string())
    }
}

pub(crate) fn sha256_file(path: &PathBuf) -> Result<String, String> {
    let mut f = File::open(path).map_err(|e| format!("gagal membuka {}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = f
            .read(&mut buf)
            .map_err(|e| format!("gagal membaca {}: {e}", path.display()))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

// Varian sha256_file yang sekaligus menghitung byte yang di-hash,
// dipakai video_asset_hash agar ukuran yang dilaporkan persis sama
// dengan byte yang masuk hash (tanpa metadata terpisah yang bisa usang).
pub(crate) fn sha256_file_counted(path: &PathBuf) -> Result<(String, u64), String> {
    let mut f = File::open(path).map_err(|e| format!("gagal membuka {}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    let mut total: u64 = 0;
    loop {
        let n = f
            .read(&mut buf)
            .map_err(|e| format!("gagal membaca {}: {e}", path.display()))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        total += n as u64;
    }
    Ok((format!("{:x}", hasher.finalize()), total))
}

pub(crate) fn download_file(
    curl: &PathBuf,
    url: &str,
    dest: &PathBuf,
    max_time: u64,
) -> Result<(), String> {
    let out = Command::new(curl)
        .arg("-L")
        .arg("--fail")
        .arg("--max-time")
        .arg(max_time.to_string())
        .arg("-o")
        .arg(dest)
        .arg(url)
        .output()
        .map_err(|e| format!("gagal menjalankan curl: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "unduhan gagal ({}): {}",
            url,
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(())
}
