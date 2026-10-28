// Engine TTS native Sherpa-ONNX (Apache-2.0) — prototipe tahap 2,
// berdampingan dengan command VoiceStudio lama (bukan pengganti dulu).
//
// Arsitektur v2.0.1 (TERBUKTI dari contoh resmi k2-fsa, BUKAN dari
// sherpa lama): sherpa-onnx TIDAK lagi memakai espeak-ng-data
// (data_dir deprecated/diabaikan). Teks di-phonemize DI LUAR sherpa
// oleh crate piper-phonemize, dan codepoint fonem dilewatkan lewat
// GenerationConfig::phoneme_codepoints. Data phonemize ikut DI DALAM
// crate piper-phonemize — inilah bentuk nyata keputusan bundle Patria
// (tidak ada lagi unduhan espeak-ng-data terpisah). Catatan lisensi:
// metadata crates.io piper-phonemize kosong — lisensi crate itu belum
// diverifikasi (lihat spec); yang terverifikasi = sherpa-onnx Apache.
//
// Voice: Piper VITS id_ID-news_tts-medium (22050 Hz, espeak voice "id",
// 1 speaker, noise 0.667 / noise_w 0.8 / length 1.0 — dari .onnx.json).
// tokens.txt dibuat dari phoneme_id_map .onnx.json dengan format resmi
// sherpa ("fonem id" per baris, terverifikasi: 161 fonem, id 0-160,
// tanpa lubang/tabrakan). Lisensi dataset voice BELUM terverifikasi
// (MODEL_CARD menunjuk Kaggle) — prototipe ini hanya untuk uji lokal
// apel-ke-apel, BUKAN untuk distribusi voice sebelum vonis lisensi.
// Aset TIDAK masuk git: diunduh Setup Sherpa ke ~/minime-voices/.
// NO SHELL — argv only (curl/ditto tidak dipakai di sini; hanya
// unduhan curl + tulis file). Perintah Tauri: sherpa_status,
// sherpa_setup, sherpa_tts.

use serde::{Deserialize, Serialize};
use sherpa_onnx::{
    GenerationConfig, OfflineTts, OfflineTtsConfig, OfflineTtsModelConfig,
    OfflineTtsVitsModelConfig,
};
use std::collections::BTreeMap;
use std::path::PathBuf;

use crate::video::find_tool;
use crate::voicestudio::download_file;

const VOICE_ONNX_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/id_ID-news_tts-medium.onnx";
const VOICE_JSON_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/id_ID-news_tts-medium.onnx.json";
const VOICE_FILE: &str = "id_ID-news_tts-medium.onnx";
const VOICE_JSON_FILE: &str = "id_ID-news_tts-medium.onnx.json";
const ESPEAK_VOICE: &str = "id";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SherpaStatus {
    pub installed: bool,
    pub model_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SherpaSetupResult {
    pub installed: bool,
    pub model_path: String,
    pub tokens_path: String,
}

#[derive(Deserialize)]
pub struct SherpaTtsRequest {
    pub text: String,
    pub speed: Option<f32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SherpaTtsResult {
    pub data_url: String,
    pub sample_rate: u32,
    pub duration_secs: f32,
}

fn asset_dir() -> Option<PathBuf> {
    std::env::var("HOME")
        .ok()
        .map(|h| PathBuf::from(h).join("minime-voices").join("sherpa-id"))
}

fn model_path() -> Option<PathBuf> {
    asset_dir().map(|d| d.join(VOICE_FILE))
}

fn tokens_path() -> Option<PathBuf> {
    asset_dir().map(|d| d.join("tokens.txt"))
}

fn assets_present() -> bool {
    let m = model_path().map(|p| p.is_file()).unwrap_or(false);
    let t = tokens_path().map(|p| p.is_file()).unwrap_or(false);
    m && t
}

#[tauri::command]
pub fn sherpa_status() -> SherpaStatus {
    SherpaStatus {
        installed: assets_present(),
        model_path: model_path().map(|p| p.to_string_lossy().to_string()),
    }
}

fn write_tokens(json_path: &PathBuf, tokens_path: &PathBuf) -> Result<usize, String> {
    let text = std::fs::read_to_string(json_path)
        .map_err(|e| format!("gagal membaca {}: {e}", json_path.display()))?;
    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("config voice bukan JSON valid: {e}"))?;
    let map = v
        .get("phoneme_id_map")
        .and_then(|m| m.as_object())
        .ok_or("phoneme_id_map tidak ada di config voice")?;
    let mut by_id: BTreeMap<u64, String> = BTreeMap::new();
    for (ph, ids) in map {
        let arr = ids
            .as_array()
            .ok_or(format!("phoneme_id_map[{ph}] bukan array"))?;
        let first = arr
            .first()
            .and_then(|x| x.as_u64())
            .ok_or(format!("phoneme_id_map[{ph}] id pertama bukan angka"))?;
        if by_id.insert(first, ph.clone()).is_some() {
            return Err(format!("id fonem ganda: {first}"));
        }
    }
    if by_id.is_empty() {
        return Err("phoneme_id_map kosong".to_string());
    }
    let mut out = String::new();
    for (id, ph) in &by_id {
        out.push_str(&format!("{ph} {id}\n"));
    }
    std::fs::write(tokens_path, out)
        .map_err(|e| format!("gagal menulis {}: {e}", tokens_path.display()))?;
    Ok(by_id.len())
}

#[tauri::command]
pub fn sherpa_setup() -> Result<SherpaSetupResult, String> {
    let Some(dir) = asset_dir() else {
        return Err("direktori HOME tidak ditemukan.".to_string());
    };
    std::fs::create_dir_all(&dir).map_err(|e| format!("gagal membuat {}: {e}", dir.display()))?;
    let curl = find_tool("curl").unwrap_or_else(|| PathBuf::from("/usr/bin/curl"));
    if !curl.exists() {
        return Err("curl tidak ditemukan — tidak bisa mengunduh aset Sherpa.".to_string());
    }
    let onnx = dir.join(VOICE_FILE);
    let json = dir.join(VOICE_JSON_FILE);
    if !onnx.is_file() || onnx.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
        download_file(&curl, VOICE_ONNX_URL, &onnx, 600)?;
    }
    if !json.is_file() || json.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
        download_file(&curl, VOICE_JSON_URL, &json, 120)?;
    }
    let tokens = dir.join("tokens.txt");
    let n = write_tokens(&json, &tokens)?;
    if n == 0 {
        return Err("tokens.txt kosong".to_string());
    }
    Ok(SherpaSetupResult {
        installed: true,
        model_path: onnx.to_string_lossy().to_string(),
        tokens_path: tokens.to_string_lossy().to_string(),
    })
}

struct TtsData {
    data_url: String,
    sample_rate: u32,
    duration_secs: f32,
}

fn run_sherpa_tts(text: &str, speed: f32) -> Result<TtsData, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("naskah kosong".to_string());
    }
    let speed = speed.clamp(0.5, 2.0);
    let Some(model) = model_path() else {
        return Err("direktori HOME tidak ditemukan.".to_string());
    };
    let Some(tokens) = tokens_path() else {
        return Err("direktori HOME tidak ditemukan.".to_string());
    };
    if !model.is_file() || !tokens.is_file() {
        return Err("aset Sherpa belum terpasang — jalankan Setup Sherpa dulu.".to_string());
    }
    let vits = OfflineTtsVitsModelConfig {
        model: Some(model.to_string_lossy().to_string()),
        tokens: Some(tokens.to_string_lossy().to_string()),
        noise_scale: 0.667,
        noise_scale_w: 0.8,
        length_scale: 1.0,
        ..Default::default()
    };
    let config = OfflineTtsConfig {
        model: OfflineTtsModelConfig {
            vits,
            num_threads: 2,
            debug: false,
            ..Default::default()
        },
        ..Default::default()
    };
    let Some(tts) = OfflineTts::create(&config) else {
        return Err("gagal membuat engine Sherpa".to_string());
    };
    let Some(result) = piper_phonemize::phonemize(text, ESPEAK_VOICE) else {
        return Err("gagal phonemize".to_string());
    };
    let mut phoneme_codepoints: Vec<Vec<i32>> = Vec::new();
    for i in 0..result.num_sentences() {
        let phonemes = result.get_phonemes(i).unwrap_or_default();
        phoneme_codepoints.push(phonemes.into_iter().collect());
    }
    let gen_config = GenerationConfig {
        sid: 0,
        speed,
        phoneme_codepoints: Some(phoneme_codepoints),
        ..Default::default()
    };
    let Some(audio) = tts.generate_with_config(
        "",
        &gen_config,
        Some(|_s: &[f32], _p: f32| -> bool { true }),
    ) else {
        return Err("gagal generate Sherpa".to_string());
    };
    let sample_rate_raw = audio.sample_rate();
    let samples = audio.samples();
    if samples.is_empty() || sample_rate_raw <= 0 {
        return Err("Sherpa menghasilkan audio kosong".to_string());
    }
    let sample_rate = sample_rate_raw as u32;
    let duration_secs = samples.len() as f32 / sample_rate as f32;
    let tmp = std::env::temp_dir().join(format!("minime-sherpa-{}.wav", std::process::id()));
    if !audio.save(tmp.to_str().unwrap_or("")) {
        return Err("gagal menyimpan WAV Sherpa".to_string());
    }
    let bytes = std::fs::read(&tmp).map_err(|e| format!("gagal membaca WAV Sherpa: {e}"))?;
    let _ = std::fs::remove_file(&tmp);
    let data_url = format!(
        "data:audio/wav;base64,{}",
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes)
    );
    Ok(TtsData {
        data_url,
        sample_rate,
        duration_secs,
    })
}

#[tauri::command]
pub fn sherpa_tts(req: SherpaTtsRequest) -> Result<SherpaTtsResult, String> {
    let d = run_sherpa_tts(&req.text, req.speed.unwrap_or(1.0))?;
    Ok(SherpaTtsResult {
        data_url: d.data_url,
        sample_rate: d.sample_rate,
        duration_secs: d.duration_secs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Uji IGNOR (tidak jalan di gate default): butuh aset Setup Sherpa
    // di ~/minime-voices/sherpa-id. Dijalankan di MacBook:
    // cargo test --bin minime sherpa -- --ignored --nocapture
    // Menulis /tmp/minime-sherpa-test.wav untuk QC shell (ffprobe +
    // transkripsi silang Whisper).
    #[test]
    #[ignore]
    fn sherpa_tts_produces_wav() {
        assert!(assets_present(), "aset Sherpa belum terpasang");
        let d =
            run_sherpa_tts("Halo, ini uji suara Sherpa native.", 1.0).expect("sherpa_tts gagal");
        assert_eq!(d.sample_rate, 22050, "sample rate voice = 22050");
        assert!(
            d.duration_secs > 1.0,
            "durasi terlalu pendek: {} dtk",
            d.duration_secs
        );
        let b64 = d
            .data_url
            .strip_prefix("data:audio/wav;base64,")
            .expect("prefix data_url");
        let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64)
            .expect("decode base64");
        std::fs::write("/tmp/minime-sherpa-test.wav", bytes).expect("tulis wav uji");
    }
}
