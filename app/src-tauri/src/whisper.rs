// Transkrip Whisper lokal untuk Voice Editor (chunk 3 Video Tier 2 yang
// tertunda, kini dibangun sebagai fitur editor suara — bukan placeholder).
//
// Jalur: file audio di ~/minime-audio/ -> whisper-cli (Homebrew,
// /opt/homebrew/bin/whisper-cli; fallback nama di PATH) + model
// ~/whisper-models/ggml-small.bin -> JSON (-oj) -> segmen
// {start, end, text} detik. Bahasa dipaksa Indonesia (-l id).
//
// Kejujuran yang dijaga:
// - Bila biner/model tidak ada, perintah GAGAL dengan pesan jelas
//   (bukan transkrip kosong/palsu). Transkrip kosong HANYA bila
//   whisper mengembalikan 0 segmen (hening) — frontend menampilkannya
//   sebagai "tidak ada ucapan terdeteksi", bukan teks karangan.
// - Hanya timestamp SEGMEN (bukan per-kata): whisper-cli segmen sudah
//   terbukti untuk Bahasa Indonesia; per-kata belum diverifikasi.
// - Tanpa timeout buatan: klip dibatasi 20 MB oleh audio_save
//   (WAV mono 16 kHz ~10 menit), model small di Apple Silicon jalan
//   lebih cepat dari realtime untuk klip sepanjang itu.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperReq {
    pub file: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WhisperSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperRes {
    pub segments: Vec<WhisperSegment>,
    pub text: String,
}

/// "HH:MM:SS,mmm" atau "HH:MM:SS.mmm" -> detik (desimal).
/// Mengembalikan None bila format tidak dikenali (segmen dilewati,
/// bukan ditebak).
pub fn parse_timestamp(s: &str) -> Option<f64> {
    let s = s.trim();
    let mut parts = s.split(':');
    let h: f64 = parts.next()?.parse().ok()?;
    let m: f64 = parts.next()?.parse().ok()?;
    let sec_part = parts.next()?;
    if parts.next().is_some() {
        return None;
    }
    let sec_part = sec_part.replace(',', ".");
    let mut sec_it = sec_part.split('.');
    let sec: f64 = sec_it.next()?.parse().ok()?;
    let ms: f64 = match sec_it.next() {
        Some(frac) => {
            let frac = format!("{:0<3}", frac);
            let frac: String = frac.chars().take(3).collect();
            frac.parse::<f64>().ok()? / 1000.0
        }
        None => 0.0,
    };
    if sec_it.next().is_some() {
        return None;
    }
    Some(h * 3600.0 + m * 60.0 + sec + ms)
}

/// Parse JSON whisper-cli (-oj): {"transcription": [{"timestamps":
/// {"from": "00:00:00,000", "to": "00:00:05,120"}, "offsets": {"from":
/// 0, "to": 5120}, "text": "..."}]}. Fallback ke offsets (ms) bila
/// timestamps tidak ada. Item tanpa waktu valid dilewati.
pub fn parse_whisper_json(body: &str) -> Result<Vec<WhisperSegment>, String> {
    let v: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "JSON whisper tidak terbaca".to_string())?;
    let items = v
        .get("transcription")
        .and_then(|t| t.as_array())
        .ok_or("JSON whisper tanpa transcription".to_string())?;
    let mut out = Vec::new();
    for it in items {
        let text = it
            .get("text")
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if text.is_empty() {
            continue;
        }
        let (start, end) = match (
            it.get("timestamps")
                .and_then(|t| t.get("from"))
                .and_then(|x| x.as_str())
                .and_then(parse_timestamp),
            it.get("timestamps")
                .and_then(|t| t.get("to"))
                .and_then(|x| x.as_str())
                .and_then(parse_timestamp),
        ) {
            (Some(s), Some(e)) => (s, e),
            _ => match (
                it.get("offsets")
                    .and_then(|o| o.get("from"))
                    .and_then(|x| x.as_f64()),
                it.get("offsets")
                    .and_then(|o| o.get("to"))
                    .and_then(|x| x.as_f64()),
            ) {
                (Some(s), Some(e)) => (s / 1000.0, e / 1000.0),
                _ => continue,
            },
        };
        out.push(WhisperSegment { start, end, text });
    }
    Ok(out)
}

fn whisper_bin() -> PathBuf {
    let brew = PathBuf::from("/opt/homebrew/bin/whisper-cli");
    if brew.exists() {
        return brew;
    }
    PathBuf::from("whisper-cli")
}

#[tauri::command]
pub fn whisper_transcribe(req: WhisperReq) -> Result<WhisperRes, String> {
    let name = crate::image::safe_name(&req.file).ok_or("nama file tidak valid")?;
    let audio = crate::audio::audio_dir()?.join(&name);
    if !audio.exists() {
        return Err(format!("file audio tidak ditemukan: {name}"));
    }
    let home = std::env::var("HOME").map_err(|_| "direktori HOME tidak ditemukan.".to_string())?;
    let model = PathBuf::from(&home).join("whisper-models/ggml-small.bin");
    if !model.exists() {
        return Err(
            "model whisper tidak ditemukan (~/whisper-models/ggml-small.bin) — pasang dulu".into(),
        );
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let base = std::env::temp_dir().join(format!("minime-whisper-{stamp}"));
    let out = Command::new(whisper_bin())
        .args([
            "-m",
            &model.to_string_lossy(),
            "-l",
            "id",
            "-oj",
            "-of",
            &base.to_string_lossy(),
            &audio.to_string_lossy(),
        ])
        .output()
        .map_err(|e| format!("whisper-cli gagal dijalankan: {e}"))?;
    let json_path = base.with_extension("json");
    let body = std::fs::read_to_string(&json_path).map_err(|_| {
        let tail = String::from_utf8_lossy(&out.stderr);
        let tail: String = tail
            .chars()
            .rev()
            .take(300)
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        format!("whisper tidak menghasilkan JSON ({tail})")
    })?;
    let _ = std::fs::remove_file(&json_path);
    let segments = parse_whisper_json(&body)?;
    let text = segments
        .iter()
        .map(|s| s.text.clone())
        .collect::<Vec<_>>()
        .join(" ");
    Ok(WhisperRes { segments, text })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timestamp_formats() {
        assert!((parse_timestamp("00:00:05,120").unwrap() - 5.12).abs() < 1e-9);
        assert!((parse_timestamp("01:02:03.500").unwrap() - 3723.5).abs() < 1e-9);
        assert!((parse_timestamp("00:00:00,000").unwrap() - 0.0).abs() < 1e-9);
        assert!(parse_timestamp("bukan-waktu").is_none());
        assert!(parse_timestamp("00:00:05").is_some());
    }

    #[test]
    fn json_segments_and_fallback() {
        let body = r#"{"transcription": [
          {"timestamps": {"from": "00:00:00,000", "to": "00:00:02,500"}, "text": "Halo dunia"},
          {"offsets": {"from": 2500, "to": 4000}, "text": "lanjut"},
          {"text": "tanpa waktu"}
        ]}"#;
        let segs = parse_whisper_json(body).unwrap();
        assert_eq!(segs.len(), 2);
        assert_eq!(segs[0].text, "Halo dunia");
        assert!((segs[1].start - 2.5).abs() < 1e-9);
        assert!((segs[1].end - 4.0).abs() < 1e-9);
    }
}
