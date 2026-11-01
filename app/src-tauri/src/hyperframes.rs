// HyperFrames — render motion-graphics/teks/caption lokal (HTML -> MP4).
//
// Kedudukan jujur: HyperFrames adalah TOOL pihak ketiga (Apache-2.0,
// CLI npm `hyperframes`), BUKAN karya event — yang dibangun di event
// adalah panel + perintah Rust + wiring ke timeline/ekspor di sini.
// Probe 29 Okt 2026 LOLOS pada CLI 0.8.212 (klip vertikal 15 dtk
// 1080x1920 h264+aac, gerak terbukti); versi CLI dipin 0.8.212 supaya
// perilaku render sama dengan probe.
//
// Format komposisi yang diterima CLI (dari probe): root ber-atribut
// data-composition-id + data-start/data-duration/data-width/data-height,
// klip ber-atribut data-start/data-duration/data-track-index, dan
// timeline GSAP paused di window.__timelines. File ./gsap.min.js
// (GSAP 3.14.2, dari folder probe yang sama) selalu ditulis berdampingan
// dengan komposisi, sehingga contoh bawaan panel langsung jalan tanpa
// mengunduh apa pun — dan komposisi user boleh ikut mereferensikannya.
//
// Temuan uji VM 2 Nov 2026: CLI menolak render bila /tmp sempit
// (tmpfs 512M) — TMPDIR anak diarahkan ke folder job supaya temp render
// tidak bergantung pada /tmp. PATH anak diperkaya homebrew karena app
// yang jalan dari Dock punya PATH minimal dan npx butuh node.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Command, Stdio};

const HF_VERSION: &str = "0.8.212";
const GSAP: &[u8] = include_bytes!("../assets/gsap.min.js");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HfRenderReq {
    pub html: String,
    pub quality: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HfRenderRes {
    pub path: String,
    pub quality: String,
    pub bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HfCheckRes {
    pub found: bool,
    pub version: String,
    pub method: String,
}

enum Cli {
    Direct(PathBuf),
    Npx(PathBuf),
}

fn resolve_cli() -> Result<Cli, String> {
    if let Some(p) = crate::video::find_tool("hyperframes") {
        return Ok(Cli::Direct(p));
    }
    if let Some(n) = crate::video::find_tool("npx") {
        return Ok(Cli::Npx(n));
    }
    Err(
        "hyperframes tidak ditemukan (PATH + /opt/homebrew/bin + /usr/local/bin + ~/bin)"
            .to_string(),
    )
}

fn child_path() -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Ok(p) = std::env::var("PATH") {
        for d in p.split(':') {
            if !d.is_empty() {
                parts.push(d.to_string());
            }
        }
    }
    for d in ["/opt/homebrew/bin", "/usr/local/bin"] {
        if !parts.iter().any(|x| x == d) {
            parts.push(d.to_string());
        }
    }
    if let Ok(h) = std::env::var("HOME") {
        let b = format!("{h}/bin");
        if !parts.iter().any(|x| x == &b) {
            parts.push(b);
        }
    }
    parts.join(":")
}

fn run_cli(
    cli: &Cli,
    args: &[&str],
    tmpdir: &std::path::Path,
) -> Result<std::process::Output, String> {
    let mut cmd = match cli {
        Cli::Direct(p) => {
            let mut c = Command::new(p);
            c.args(args);
            c
        }
        Cli::Npx(n) => {
            let mut c = Command::new(n);
            c.arg("--yes")
                .arg(format!("hyperframes@{HF_VERSION}"))
                .args(args);
            c
        }
    };
    cmd.env("PATH", child_path())
        .env("TMPDIR", tmpdir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::video::output_timeout(&mut cmd, 600)
}

#[tauri::command]
pub fn hyperframes_check() -> Result<HfCheckRes, String> {
    let cli = resolve_cli()?;
    let method = match &cli {
        Cli::Direct(_) => "biner",
        Cli::Npx(_) => "npx",
    }
    .to_string();
    let out = run_cli(&cli, &["--version"], &std::env::temp_dir())?;
    let version = String::from_utf8_lossy(&out.stdout)
        .trim()
        .lines()
        .next()
        .unwrap_or("")
        .to_string();
    if !out.status.success() || version.is_empty() {
        return Err(format!(
            "hyperframes --version gagal. {}",
            crate::video::tail(&String::from_utf8_lossy(&out.stderr), 800)
        ));
    }
    Ok(HfCheckRes {
        found: true,
        version,
        method,
    })
}

#[tauri::command]
pub fn hyperframes_render(req: HfRenderReq) -> Result<HfRenderRes, String> {
    let quality = match req.quality.as_str() {
        "draft" | "looks" | "delivery" => req.quality.clone(),
        _ => return Err("kualitas harus draft, looks, atau delivery".to_string()),
    };
    let html = req.html.trim().to_string();
    if html.is_empty() {
        return Err("komposisi HTML kosong".to_string());
    }
    if html.len() > 1_000_000 {
        return Err("komposisi HTML melebihi 1 MB".to_string());
    }
    let cli = resolve_cli()?;
    let home = std::env::var("HOME").map_err(|_| "direktori HOME tidak ditemukan.".to_string())?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let dir = PathBuf::from(home)
        .join("Movies")
        .join("minime-hyperframes")
        .join(format!("hf-{ts}"));
    std::fs::create_dir_all(&dir).map_err(|e| format!("gagal membuat folder job: {e}"))?;
    std::fs::write(dir.join("index.html"), &html)
        .map_err(|e| format!("gagal menulis komposisi: {e}"))?;
    std::fs::write(dir.join("gsap.min.js"), GSAP)
        .map_err(|e| format!("gagal menulis gsap: {e}"))?;
    let out_path = dir.join("out.mp4");
    let out_str = out_path.to_string_lossy().to_string();
    let dir_str = dir.to_string_lossy().to_string();
    // 1. Pastikan browser headless (idempotent; unduh sekali bila belum ada).
    let ensure = run_cli(&cli, &["browser", "ensure"], &dir)?;
    if !ensure.status.success() {
        return Err(format!(
            "hyperframes browser ensure gagal. {}",
            crate::video::tail(&String::from_utf8_lossy(&ensure.stderr), 1200)
        ));
    }
    // 2. Render (argumen tetap; tidak ada input user di argv).
    let rendered = run_cli(
        &cli,
        &["render", "--quality", &quality, "-o", &out_str, &dir_str],
        &dir,
    )?;
    let ok = rendered.status.success() && out_path.is_file();
    if !ok {
        return Err(format!(
            "render gagal. {}",
            crate::video::tail(&String::from_utf8_lossy(&rendered.stderr), 1500)
        ));
    }
    let bytes = std::fs::metadata(&out_path).map(|m| m.len()).unwrap_or(0);
    Ok(HfRenderRes {
        path: out_str,
        quality,
        bytes,
    })
}
