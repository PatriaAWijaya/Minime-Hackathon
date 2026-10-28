// Engine video (Rust): Tier 1 eksekusi FFmpeg + QC + capture verifikasi,
// Tier 2 probe media + hash aset.
// Dipanggil frontend lewat Tauri invoke. TIDAK memakai shell: Command menerima
// argv langsung, jadi path file user tidak bisa menjadi injeksi perintah.
// Pencarian ffmpeg/ffprobe: PATH, lalu /opt/homebrew/bin (Homebrew Mac),
// /usr/local/bin, ~/bin — karena app yang dibuka dari Finder tidak mewarisi
// PATH shell user.
// Batas kepercayaan (audit 29 Okt): pemanggil adalah compiler lokal
// tepercaya (video.ts), BUKAN argv bebas — video_render memakai allowlist
// flag + output yang dikurung; probe/qc/capture memakai timeout keras.
// Path BACA dibiarkan apa adanya (compiler membaca aset user di mana
// saja); path TULIS dikurung ke temp/Movies/minime-* (output_allowed).

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeRequest {
    pub path: String,
}

#[derive(Serialize)]
pub struct StreamInfo {
    pub index: u32,
    pub codec_type: String,
    pub codec_name: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
}

#[derive(Serialize)]
pub struct ProbeInfo {
    pub duration: f64,
    pub has_video: bool,
    pub has_audio: bool,
    pub streams: Vec<StreamInfo>,
    pub format_name: String,
}

#[derive(Serialize)]
pub struct ProbeResult {
    pub duration: f64,
    pub size: u64,
    pub streams: Vec<StreamInfo>,
    pub format_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashRequest {
    pub path: String,
}

#[derive(Serialize)]
pub struct HashResult {
    pub sha256: String,
    pub size: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteAssRequest {
    pub content: String,
}

#[derive(Serialize)]
pub struct WriteAssResult {
    pub path: String,
}

fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(p) {
        Ok(m) => m.is_file() && (m.permissions().mode() & 0o111) != 0,
        Err(_) => false,
    }
}

pub(crate) fn find_tool(name: &str) -> Option<PathBuf> {
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
        // Potong di batas karakter: potong byte mentah bisa panic bila
        // jatuh di tengah karakter multi-byte (mis. nama file non-ASCII).
        let mut start = s.len() - n;
        while !s.is_char_boundary(start) {
            start += 1;
        }
        s[start..].to_string()
    }
}

// Sufiks unik per panggilan (PID saja balapan pada klik ganda):
// dipakai nama temp di video_capture, sherpa_tts, vs_install.
pub(crate) fn unique_suffix() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{}-{}", std::process::id(), nanos)
}

// Probe ffprobe JSON sekali, dipakai video_qc dan video_probe (tanpa duplikasi
// parser). Mengembalikan durasi, jenis stream, daftar stream, dan nama format.
fn probe_file(ffprobe: &PathBuf, path: &str) -> Result<ProbeInfo, String> {
    let mut probe_cmd = Command::new(ffprobe);
    probe_cmd
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration:format_name",
            "-show_entries",
            "stream=index:codec_type:codec_name:width:height",
            "-of",
            "json",
            path,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let probe = output_timeout(&mut probe_cmd, 120)
        .map_err(|e| format!("gagal menjalankan ffprobe: {e}"))?;
    let pj: serde_json::Value = serde_json::from_slice(&probe.stdout)
        .map_err(|e| format!("ffprobe JSON tidak bisa dibaca: {e}"))?;
    let duration = pj
        .get("format")
        .and_then(|f| f.get("duration"))
        .and_then(|d| d.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    let format_name = pj
        .get("format")
        .and_then(|f| f.get("format_name"))
        .and_then(|f| f.as_str())
        .unwrap_or("")
        .to_string();
    let mut has_video = false;
    let mut has_audio = false;
    let mut streams: Vec<StreamInfo> = Vec::new();
    if let Some(arr) = pj.get("streams").and_then(|s| s.as_array()) {
        for st in arr {
            let codec_type = st
                .get("codec_type")
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string();
            let codec_name = st
                .get("codec_name")
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string();
            if codec_type == "video" {
                has_video = true;
            }
            if codec_type == "audio" {
                has_audio = true;
            }
            streams.push(StreamInfo {
                index: st.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as u32,
                codec_type,
                codec_name,
                width: st.get("width").and_then(|w| w.as_i64()),
                height: st.get("height").and_then(|h| h.as_i64()),
            });
        }
    }
    Ok(ProbeInfo {
        duration,
        has_video,
        has_audio,
        streams,
        format_name,
    })
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

// Jalankan proses dengan timeout keras. Pipa dibaca di thread terpisah
// (agar anak tidak menggantung saat pipa penuh), thread utama mem-poll
// try_wait; bila lewat batas, anak di-kill dan di-reap. Tanpa ini, satu
// FFmpeg menggantung = invoke menggantung selamanya.
fn output_timeout(cmd: &mut Command, secs: u64) -> Result<std::process::Output, String> {
    use std::io::Read;
    use std::sync::mpsc;
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("gagal menjalankan proses: {e}"))?;
    let out_pipe = child.stdout.take();
    let err_pipe = child.stderr.take();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut out = Vec::new();
        let mut err = Vec::new();
        if let Some(mut s) = out_pipe {
            let _ = s.read_to_end(&mut out);
        }
        if let Some(mut s) = err_pipe {
            let _ = s.read_to_end(&mut err);
        }
        let _ = tx.send((out, err));
    });
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                // Anak selesai; tunggu drainer membaca sisa pipa.
                let (stdout, stderr) = rx.recv().unwrap_or_default();
                return Ok(std::process::Output {
                    status,
                    stdout,
                    stderr,
                });
            }
            Ok(None) => {
                if start.elapsed().as_secs() >= secs {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = rx.recv_timeout(std::time::Duration::from_secs(5));
                    return Err(format!("proses melebihi timeout {secs} detik — dibatalkan"));
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(e) => return Err(format!("gagal menunggu proses: {e}")),
        }
    }
}

// Output render hanya boleh ke temp dir, ~/Movies, atau file bernama
// minime-* (konvensi bukti manual app). Path relatif dan direktori lain
// ditolak — cegah WebView yang terkompromi menimpa file sembarang.
// (HOME dibaca dari env, bukan helper voicestudio yang privat.)
fn output_allowed(p: &str) -> bool {
    let path = Path::new(p);
    if !path.is_absolute() {
        return false;
    }
    if let Ok(tmp) = std::env::temp_dir().canonicalize() {
        if path.starts_with(&tmp) {
            return true;
        }
    }
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        if path.starts_with(home.join("Movies")) {
            return true;
        }
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with("minime-") {
                return true;
            }
        }
    }
    false
}

// Allowlist flag ffmpeg = kosakata PERSIS yang diemisikan compiler
// video.ts (compileTimeline: -nostdin -y -i -filter_complex -map -c:v
// -pix_fmt -r -c:a -b:a). Flag di luar daftar = error jujur, bukan
// dibiarkan lolos — cegah opsi eksotis (tee, protocol, filter script).
const FFMPEG_FLAGS: [&str; 10] = [
    "-nostdin",
    "-y",
    "-i",
    "-filter_complex",
    "-map",
    "-c:v",
    "-pix_fmt",
    "-r",
    "-c:a",
    "-b:a",
];
fn validate_render_args(args: &[String], output: &str) -> Result<(), String> {
    if args.is_empty() {
        return Err("argv ffmpeg kosong".to_string());
    }
    if output.is_empty() {
        return Err("output kosong".to_string());
    }
    if args[args.len() - 1] != output {
        return Err("arg terakhir harus output".to_string());
    }
    let mut i = 0;
    while i < args.len() - 1 {
        let a = &args[i];
        if !a.starts_with('-') {
            return Err(format!("arg posisi tak terduga: {a}"));
        }
        if !FFMPEG_FLAGS.contains(&a.as_str()) {
            return Err(format!("flag ffmpeg tidak diizinkan: {a}"));
        }
        // Flag bernilai wajib diikuti nilai (nilai tidak boleh diawali
        // '-' dan tidak boleh menempati posisi output).
        if matches!(
            a.as_str(),
            "-i" | "-filter_complex" | "-map" | "-c:v" | "-pix_fmt" | "-r" | "-c:a" | "-b:a"
        ) {
            if i + 1 >= args.len() - 1 || args[i + 1].starts_with('-') {
                return Err(format!("flag {a} tanpa nilai"));
            }
            i += 2;
        } else {
            i += 1;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn video_render(req: RenderRequest) -> Result<RenderResult, String> {
    validate_render_args(&req.args, &req.output)?;
    if !output_allowed(&req.output) {
        return Err(
            "output di luar direktori yang diizinkan (temp, Movies, atau minime-*)".to_string(),
        );
    }
    let ffmpeg = find_tool("ffmpeg").ok_or_else(|| {
        "ffmpeg tidak ditemukan (PATH + /opt/homebrew/bin + /usr/local/bin + ~/bin)".to_string()
    })?;
    let started = std::time::Instant::now();
    let mut cmd = Command::new(&ffmpeg);
    cmd.args(&req.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let out =
        output_timeout(&mut cmd, 600).map_err(|e| format!("gagal menjalankan ffmpeg: {e}"))?;
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
    let ffprobe = find_tool("ffprobe").ok_or_else(|| {
        "ffprobe tidak ditemukan (PATH + /opt/homebrew/bin + /usr/local/bin + ~/bin)".to_string()
    })?;
    let ffmpeg = find_tool("ffmpeg").ok_or_else(|| {
        "ffmpeg tidak ditemukan (PATH + /opt/homebrew/bin + /usr/local/bin + ~/bin)".to_string()
    })?;
    // Durasi + jenis stream lewat probe_file (dipakai bersama video_probe).
    let info = probe_file(&ffprobe, &req.path)?;
    let duration = info.duration;
    let has_video = info.has_video;
    let has_audio = info.has_audio;
    // Black detect (hitam >= 0.5 dtk, ambang 10%) + silence detect (hening >= 2 dtk).
    let mut black_cmd = Command::new(&ffmpeg);
    black_cmd
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
        .stderr(Stdio::piped());
    let black =
        output_timeout(&mut black_cmd, 120).map_err(|e| format!("gagal blackdetect: {e}"))?;
    let black_segs = segments_from_stderr(
        &String::from_utf8_lossy(&black.stderr),
        "black_start:",
        "black_end:",
    );
    let mut silent_cmd = Command::new(&ffmpeg);
    silent_cmd
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
        .stderr(Stdio::piped());
    let silent =
        output_timeout(&mut silent_cmd, 120).map_err(|e| format!("gagal silencedetect: {e}"))?;
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
    let ffmpeg = find_tool("ffmpeg").ok_or_else(|| {
        "ffmpeg tidak ditemukan (PATH + /opt/homebrew/bin + /usr/local/bin + ~/bin)".to_string()
    })?;
    let tmp = std::env::temp_dir().join(format!("minime-capture-{}.jpg", unique_suffix()));
    let tmp_str = tmp.to_string_lossy().to_string();
    let mut cap_cmd = Command::new(&ffmpeg);
    cap_cmd
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
        .stderr(Stdio::piped());
    let status = output_timeout(&mut cap_cmd, 120)
        .map_err(|e| format!("gagal menjalankan ffmpeg capture: {e}"))?;
    if !status.status.success() || !tmp.is_file() {
        let _ = std::fs::remove_file(&tmp);
        return Err("capture frame gagal".to_string());
    }
    let bytes = match std::fs::read(&tmp) {
        Ok(b) => b,
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            return Err(format!("gagal membaca frame: {e}"));
        }
    };
    let _ = std::fs::remove_file(&tmp);
    Ok(CaptureResult {
        data_url: format!(
            "data:image/jpeg;base64,{}",
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes)
        ),
    })
}

#[tauri::command]
pub fn video_probe(req: ProbeRequest) -> Result<ProbeResult, String> {
    let meta =
        std::fs::metadata(&req.path).map_err(|_| format!("file tidak ditemukan: {}", req.path))?;
    if !meta.is_file() {
        return Err(format!("bukan file: {}", req.path));
    }
    let ffprobe = find_tool("ffprobe").ok_or_else(|| {
        "ffprobe tidak ditemukan (PATH + /opt/homebrew/bin + /usr/local/bin + ~/bin)".to_string()
    })?;
    let info = probe_file(&ffprobe, &req.path)?;
    Ok(ProbeResult {
        duration: info.duration,
        size: meta.len(),
        streams: info.streams,
        format_name: info.format_name,
    })
}

#[tauri::command]
pub fn video_asset_hash(req: HashRequest) -> Result<HashResult, String> {
    // Satu pass: hash + hitung byte yang di-hash. Ukuran yang dilaporkan
    // adalah persis byte yang masuk hash (bukan metadata sebelum/sesudah
    // yang bisa berubah di tengah jalan).
    let (sha256, size) = crate::voicestudio::sha256_file_counted(&PathBuf::from(&req.path))?;
    Ok(HashResult { sha256, size })
}

#[tauri::command]
pub fn video_write_ass(req: WriteAssRequest) -> Result<WriteAssResult, String> {
    if req.content.trim().is_empty() {
        return Err("konten ASS kosong".to_string());
    }
    if req.content.len() > 1_000_000 {
        return Err("konten ASS melebihi 1 MB".to_string());
    }
    // Sidecar: file menetap di temp dir (dipakai player/editor + ffmpeg penuh
    // nanti), ditimpa tiap simpan baru dari proses yang sama.
    let path = std::env::temp_dir().join(format!("minime-subs-{}.ass", std::process::id()));
    std::fs::write(&path, &req.content).map_err(|e| format!("gagal menulis ASS: {e}"))?;
    Ok(WriteAssResult {
        path: path.to_string_lossy().to_string(),
    })
}
