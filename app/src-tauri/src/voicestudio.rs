// VoiceStudio setup + auto-launch — proses EKSTERNAL, TIDAK di-bundle
// (aturan AGPL: VoiceStudio tetap aplikasi terpisah; MiniMe hanya
// mengunduh, memasang, membuka, dan memanggil API lokalnya).
//
// Satu paket instalasi (vs_install): bila VoiceStudio.app belum ada,
// unduh rilis v0.5.7 macOS dari GitHub (zip sesuai arsitektur),
// verifikasi SHA-256 dari SHA256SUMS.txt rilis yang sama, ekstrak
// dengan ditto, pasang ke ~/Applications (tanpa admin), lalu buka
// dan tunggu backend aktif. Bila sudah terpasang (versi apa pun),
// unduhan dilewati — tidak ada upgrade paksa.
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
const VS_VERSION: &str = "0.5.7";
const VS_RELEASE_BASE: &str = "https://github.com/debpalash/VoiceStudio/releases/download/v0.5.7";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VsLaunchResult {
    pub backend_up: bool,
    pub app_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VsInstallResult {
    pub installed: bool,
    pub skipped_download: bool,
    pub app_path: String,
    pub backend_up: bool,
    pub version: String,
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

#[tauri::command]
pub fn vs_install() -> Result<VsInstallResult, String> {
    // Sudah terpasang (versi apa pun): lewati unduhan, langsung buka
    // + verifikasi backend — tidak ada upgrade paksa.
    if let Some(app) = find_app() {
        if backend_up() {
            return Ok(VsInstallResult {
                installed: true,
                skipped_download: true,
                app_path: app.to_string_lossy().to_string(),
                backend_up: true,
                version: "existing".to_string(),
            });
        }
        launch_app(&app)?;
        if poll_backend(60) {
            return Ok(VsInstallResult {
                installed: true,
                skipped_download: true,
                app_path: app.to_string_lossy().to_string(),
                backend_up: true,
                version: "existing".to_string(),
            });
        }
        return Err(LAUNCH_TIMEOUT_NOTE.to_string());
    }

    let arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        other => {
            return Err(format!(
                "arsitektur tidak didukung untuk VoiceStudio: {other}"
            ))
        }
    };
    let zip_name = format!("VoiceStudio-{VS_VERSION}-mac-{arch}.zip");
    let zip_url = format!("{VS_RELEASE_BASE}/{zip_name}");
    let sums_url = format!("{VS_RELEASE_BASE}/SHA256SUMS.txt");

    let curl = curl_path();
    if !curl.exists() {
        return Err("curl tidak ditemukan — tidak bisa mengunduh VoiceStudio.".to_string());
    }
    let tmp = std::env::temp_dir().join(format!(
        "minime-vs-install-{}",
        crate::video::unique_suffix()
    ));
    std::fs::create_dir_all(&tmp)
        .map_err(|e| format!("gagal membuat direktori sementara {}: {e}", tmp.display()))?;
    let zip_path = tmp.join(&zip_name);
    let sums_path = tmp.join("SHA256SUMS.txt");
    let _ = std::fs::remove_file(&zip_path);
    let _ = std::fs::remove_file(&sums_path);
    let result = (|| -> Result<PathBuf, String> {
        download_file(&curl, &zip_url, &zip_path, 1200)?;
        download_file(&curl, &sums_url, &sums_path, 120)?;
        let sums = std::fs::read_to_string(&sums_path)
            .map_err(|e| format!("gagal membaca SHA256SUMS.txt: {e}"))?;
        let mut expected: Option<String> = None;
        for line in sums.lines() {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() >= 2 && fields[1].trim_start_matches('*') == zip_name {
                expected = Some(fields[0].to_string());
            }
        }
        let Some(expected) = expected else {
            return Err(format!(
                "checksum untuk {zip_name} tidak ada di SHA256SUMS.txt"
            ));
        };
        let actual = sha256_file(&zip_path)?;
        if actual.to_lowercase() != expected.to_lowercase() {
            return Err(format!(
                "checksum tidak cocok untuk {zip_name} (unduhan rusak) — instalasi dibatalkan"
            ));
        }
        let ditto = find_tool("ditto").unwrap_or_else(|| PathBuf::from("/usr/bin/ditto"));
        let unpack = tmp.join("unpack");
        let _ = std::fs::remove_dir_all(&unpack);
        let out = Command::new(&ditto)
            .arg("-x")
            .arg("-k")
            .arg(&zip_path)
            .arg(&unpack)
            .output()
            .map_err(|e| format!("gagal menjalankan ditto: {e}"))?;
        if !out.status.success() {
            return Err(format!(
                "ekstrak gagal: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        let mut found: Option<PathBuf> = None;
        let entries =
            std::fs::read_dir(&unpack).map_err(|e| format!("gagal membaca hasil ekstrak: {e}"))?;
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir()
                && p.file_name()
                    .map(|n| n == "VoiceStudio.app")
                    .unwrap_or(false)
            {
                found = Some(p);
                break;
            }
        }
        let Some(src) = found else {
            return Err("VoiceStudio.app tidak ditemukan di dalam zip rilis.".to_string());
        };
        let Some(home) = home_dir() else {
            return Err("direktori HOME tidak ditemukan.".to_string());
        };
        let apps_dir = home.join("Applications");
        std::fs::create_dir_all(&apps_dir)
            .map_err(|e| format!("gagal membuat {}: {e}", apps_dir.display()))?;
        let dest = apps_dir.join("VoiceStudio.app");
        if !dest.exists() {
            let out = Command::new(&ditto)
                .arg(&src)
                .arg(&dest)
                .output()
                .map_err(|e| format!("gagal menyalin VoiceStudio.app: {e}"))?;
            if !out.status.success() {
                return Err(format!(
                    "salin ke ~/Applications gagal: {}",
                    String::from_utf8_lossy(&out.stderr).trim()
                ));
            }
        }
        Ok(dest)
    })();
    let _ = std::fs::remove_dir_all(&tmp);
    let dest = result?;
    launch_app(&dest)?;
    if poll_backend(60) {
        Ok(VsInstallResult {
            installed: true,
            skipped_download: false,
            app_path: dest.to_string_lossy().to_string(),
            backend_up: true,
            version: VS_VERSION.to_string(),
        })
    } else {
        Err(LAUNCH_TIMEOUT_NOTE.to_string())
    }
}
