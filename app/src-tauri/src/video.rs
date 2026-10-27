// Engine video Tier 1 (Rust): eksekusi FFmpeg + QC + capture verifikasi.
// Dipanggil frontend lewat Tauri invoke. TIDAK memakai shell: Command menerima
// argv langsung, jadi path file user tidak bisa menjadi injeksi perintah.
// Pencarian ffmpeg/ffprobe: PATH, lalu /opt/homebrew/bin (Homebrew Mac),
// /usr/local/bin, ~/bin — karena app yang dibuka dari Finder tidak mewarisi
// PATH shell user.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderRequest {
    pub args: Vec<String>,
    pub output: String,
}

#[derive(Serialize)]
pub struct RenderResult {
    pub success: bool,
    pub output: String,
    pub duration_ms: u64,
    pub stderr_tail: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QcRequest {
    pub path: String,
    pub expected_duration: f64,
}

#[derive(Serialize)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
}

#[derive(Serialize)]
pub struct QcResult {
    pub duration: f64,
    pub has_video: bool,
    pub has_audio: bool,
    pub black: Vec<Segment>,
    pub silent: Vec<Segment>,
    pub passed: bool,
    pub notes: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRequest {
    pub path: String,
    pub at: f64,
}

#[derive(Serialize)]
pub struct CaptureResult {
    pub data_url: String,
}

fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(p) {
        Ok(m) => m.is_file() && (m.permissions().mode() & 0o111) != 0,
        Err(_) => false,
    }
}

fn find_tool(name: &str) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(path) = std::env::var("PATH") {
        for d in path.split(':') {
            if !d.is_empty() {
                dirs.push(PathBuf::from(d));
            }
        }
    }
    dirs.push(PathBuf::from("/opt/homebrew/bin"));
    dirs.push(PathBuf::from("/usr/local/bin"));
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(PathBuf::from(home).join("bin"));
    }
    for d in dirs {
        let cand = d.join(name);
        if is_executable(&cand) {
            return Some(cand);
        }
    }
    None
}

fn tail(s: &str, n: usize) -> String {
    if s.len() <= n {
        s.to_string()
    } else {
        s[s.len() - n..].to_string()
    }
}

// Ambil angka setelah label "black_start:" / "silence_end:" dst. dari satu baris.
fn num_after(line: &str, label: &str) -> Option<f64> {
    let i = line.find(label)?;
    let rest = &line[i + label.len()..];
    let mut num = String::new();
    for ch in rest.chars() {
        if ch.is_ascii_digit() || ch == '.' || ch == '-' {
            num.push(ch);
        } else if !num.is_empty() {
            break;
        }
    }
    if num.is_empty() {
        None
    } else {
        num.parse::<f64>().ok()
    }
}

fn segments_from_stderr(stderr: &str, start_label: &str, end_label: &str) -> Vec<Segment> {
    let mut out: Vec<Segment> = Vec::new();
    let mut cur_start: Option<f64> = None;
    for line in stderr.lines() {
        if let Some(s) = num_after(line, start_label) {
            cur_start = Some(s);
        }
        if let Some(e) = num_after(line, end_label) {
            if let Some(s) = cur_start.take() {
                out.push(Segment { start: s, end: e });
            }
        }
    }
    out
}

#[tauri::command]
pub fn video_render(req: RenderRequest) -> Result<RenderResult, String> {
    if req.args.is_empty() {
        return Err("argv ffmpeg kosong".to_string());
    }
    if req.output.is_empty() {
        return Err("output kosong".to_string());
    }
    let ffmpeg = find_tool("ffmpeg")
        .ok_or_else(|| "ffmpeg tidak ditemukan (PATH + /opt/homebrew/bin + /usr/local/bin + ~/bin)".to_string())?;
    let started = std::time::Instant::now();
    let out = Command::new(&ffmpeg)
        .args(&req.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("gagal menjalankan ffmpeg: {e}"))?;
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    let file_ok = Path::new(&req.output).is_file();
    let success = out.status.success() && file_ok;
    Ok(RenderResult {
        success,
        output: req.output.clone(),
        duration_ms: started.elapsed().as_millis() as u64,
        stderr_tail: if success {
            String::new()
        } else if file_ok {
            tail(&stderr, 1500)
        } else {
            format!("file output tidak terbentuk. {}", tail(&stderr, 1500))
        },
    })
}

#[tauri::command]
pub fn video_qc(req: QcRequest) -> Result<QcResult, String> {
    if !Path::new(&req.path).is_file() {
        return Err(format!("file tidak ditemukan: {}", req.path));
    }
    let ffprobe = find_tool("ffprobe")
        .ok_or_else(|| "ffprobe tidak ditemukan (PATH + /opt/homebrew/bin + /usr/local/bin + ~/bin)".to_string())?;
    let ffmpeg = find_tool("ffmpeg")
        .ok_or_else(|| "ffmpeg tidak ditemukan (PATH + /opt/homebrew/bin + /usr/local/bin + ~/bin)".to_string())?;
    // Durasi + jenis stream lewat ffprobe JSON.
    let probe = Command::new(&ffprobe)
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "json",
            &req.path,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("gagal menjalankan ffprobe: {e}"))?;
    let pj: serde_json::Value = serde_json::from_slice(&probe.stdout)
        .map_err(|e| format!("ffprobe JSON tidak bisa dibaca: {e}"))?;
    let duration = pj
        .get("format")
        .and_then(|f| f.get("duration"))
        .and_then(|d| d.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    let mut has_video = false;
    let mut has_audio = false;
    if let Some(streams) = pj.get("streams").and_then(|s| s.as_array()) {
        for st in streams {
            match st.get("codec_type").and_then(|c| c.as_str()) {
                Some("video") => has_video = true,
                Some("audio") => has_audio = true,
                _ => {}
            }
        }
    }
    // Black detect (hitam >= 0.5 dtk, ambang 10%) + silence detect (hening >= 2 dtk).
    let black = Command::new(&ffmpeg)
        .args([
            "-nostdin",
            "-i",
            &req.path,
            "-vf",
            "blackdetect=d=0.5:pix_th=0.10",
            "-an",
            "-f",
            "null",
            "-",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("gagal blackdetect: {e}"))?;
    let black_segs = segments_from_stderr(
        &String::from_utf8_lossy(&black.stderr),
        "black_start:",
        "black_end:",
    );
    let silent = Command::new(&ffmpeg)
        .args([
            "-nostdin",
            "-i",
            &req.path,
            "-af",
            "silencedetect=noise=-40dB:d=2.0",
            "-vn",
            "-f",
            "null",
            "-",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("gagal silencedetect: {e}"))?;
    let silent_segs = segments_from_stderr(
        &String::from_utf8_lossy(&silent.stderr),
        "silence_start:",
        "silence_end:",
    );
    // Vonis: hitam >= 1.0 dtk = gagal (klip tak terlihat); selisih durasi > 1.0
    // dtk = gagal; hening >= 3.0 dtk = peringatan; tanpa video = gagal.
    let mut notes: Vec<String> = Vec::new();
    let mut failed = false;
    if !has_video {
        notes.push("tidak ada stream video".to_string());
        failed = true;
    }
    if (duration - req.expected_duration).abs() > 1.0 {
        notes.push(format!(
            "durasi {duration:.1} dtk, ekspektasi {expected:.1} dtk (selisih > 1 dtk)",
            expected = req.expected_duration
        ));
        failed = true;
    }
    for s in &black_segs {
        if s.end - s.start >= 1.0 {
            notes.push(format!(
                "segmen hitam {:.1}-{:.1} dtk ({:.1} dtk)",
                s.start,
                s.end,
                s.end - s.start
            ));
            failed = true;
        }
    }
    for s in &silent_segs {
        if s.end - s.start >= 3.0 {
            notes.push(format!(
                "peringatan: hening {:.1}-{:.1} dtk ({:.1} dtk)",
                s.start,
                s.end,
                s.end - s.start
            ));
        }
    }
    if !has_audio {
        notes.push("peringatan: tanpa audio".to_string());
    }
    Ok(QcResult {
        duration,
        has_video,
        has_audio,
        black: black_segs,
        silent: silent_segs,
        passed: !failed,
        notes,
    })
}

#[tauri::command]
pub fn video_capture(req: CaptureRequest) -> Result<CaptureResult, String> {
    if !Path::new(&req.path).is_file() {
        return Err(format!("file tidak ditemukan: {}", req.path));
    }
    let ffmpeg = find_tool("ffmpeg")
        .ok_or_else(|| "ffmpeg tidak ditemukan (PATH + /opt/homebrew/bin + /usr/local/bin + ~/bin)".to_string())?;
    let tmp = std::env::temp_dir().join(format!("minime-capture-{}.jpg", std::process::id()));
    let tmp_str = tmp.to_string_lossy().to_string();
    let status = Command::new(&ffmpeg)
        .args([
            "-nostdin",
            "-ss",
            &req.at.to_string(),
            "-i",
            &req.path,
            "-frames:v",
            "1",
            "-q:v",
            "5",
            "-y",
            &tmp_str,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|e| format!("gagal menjalankan ffmpeg capture: {e}"))?;
    if !status.success() || !tmp.is_file() {
        return Err("capture frame gagal".to_string());
    }
    let bytes = std::fs::read(&tmp).map_err(|e| format!("gagal membaca frame: {e}"))?;
    let _ = std::fs::remove_file(&tmp);
    Ok(CaptureResult {
        data_url: format!("data:image/jpeg;base64,{}", base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            &bytes
        )),
    })
}
