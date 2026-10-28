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
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::voicestudio::download_file;

const VOICE_ONNX_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/id_ID-news_tts-medium.onnx";
const VOICE_JSON_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/id_ID-news_tts-medium.onnx.json";
const VOICE_FILE: &str = "id_ID-news_tts-medium.onnx";
const VOICE_JSON_FILE: &str = "id_ID-news_tts-medium.onnx.json";
// Ukuran penuh yang diketahui (lihat gerbang ukuran di sherpa_setup).
const VOICE_ONNX_BYTES: u64 = 62_950_044;
const VOICE_JSON_BYTES: u64 = 5_050;
// SHA-256 resmi file upstream (diambil dari unduhan HuggingFace yang sama
// persis dengan yang diunduh setup, 29 Okt 2026). ONNX diverifikasi
// hanya saat PRISTINE (marker belum ada); varian +131 byte pasca-append
// dilewati lewat marker. JSON tidak pernah di-append: selalu diverifikasi.
const VOICE_ONNX_SHA256: &str = "ed8f02aa593f7af6b19acbdb8142e0da0dd72f46194eb33d38e0eb10a52597e8";
const VOICE_JSON_SHA256: &str = "1ef677072668a5e172e0759b1d3871f129009d1167f093325a17607f7add5ad7";
const ESPEAK_VOICE: &str = "id";

// Metadata ONNX yang wajib ada agar sherpa-onnx VITS mau init
// (file Piper mentah TIDAK memilikinya — terbukti error C++
// "'sample_rate' does not exist in the metadata"). Nilainya sama
// persis dengan skrip konversi resmi sherpa (model_type, comment,
// language, voice, has_espeak, n_speakers, sample_rate).
// Trik protobuf: field boleh muncul dalam urutan apa pun dan field
// berulang (map) digabung dengan nilai terakhir menang — jadi cukup
// APPEND entri field 14 (metadata_props) di akhir file, tanpa
// pustaka protobuf dan tanpa Python. Total tambahan: 131 byte.
const ONNX_METADATA: &[(&str, &str)] = &[
    ("model_type", "vits"),
    ("comment", "piper"),
    ("language", "Indonesian"),
    ("voice", "id"),
    ("has_espeak", "1"),
    ("n_speakers", "1"),
    ("sample_rate", "22050"),
];

fn append_onnx_metadata(path: &Path) -> Result<usize, String> {
    let mut buf: Vec<u8> = Vec::new();
    for (k, v) in ONNX_METADATA {
        let kb = k.as_bytes();
        let vb = v.as_bytes();
        let mut entry: Vec<u8> = Vec::new();
        entry.push(0x0A);
        entry.push(kb.len() as u8);
        entry.extend_from_slice(kb);
        entry.push(0x12);
        entry.push(vb.len() as u8);
        entry.extend_from_slice(vb);
        buf.push(0x72);
        buf.push(entry.len() as u8);
        buf.extend_from_slice(&entry);
    }
    let mut f = std::fs::OpenOptions::new()
        .append(true)
        .open(path)
        .map_err(|e| format!("gagal membuka {}: {e}", path.display()))?;
    f.write_all(&buf)
        .map_err(|e| format!("gagal menambah metadata {}: {e}", path.display()))?;
    Ok(buf.len())
}

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
#[serde(rename_all = "camelCase")]
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
    let mut ids: Vec<u64> = by_id.keys().copied().collect();
    ids.sort_unstable();
    if ids != (0..by_id.len() as u64).collect::<Vec<_>>() {
        return Err("phoneme_id_map tidak kontinu 0..n".to_string());
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
    let curl = crate::voicestudio::curl_path();
    if !curl.exists() {
        return Err("curl tidak ditemukan — tidak bisa mengunduh aset Sherpa.".to_string());
    }
    let onnx = dir.join(VOICE_FILE);
    let json = dir.join(VOICE_JSON_FILE);
    let marker = dir.join(".metadata-appended");
    // Unduhan parsial selalu LEBIH KECIL dari ukuran penuh, jadi ukuran
    // >= nilai berarti file utuh (termasuk varian +131 byte pasca-append
    // metadata, dan versi suara yang lebih besar di masa depan).
    let onnx_len = onnx.metadata().map(|m| m.len()).unwrap_or(0);
    if !onnx.is_file() || onnx_len < VOICE_ONNX_BYTES {
        let _ = std::fs::remove_file(&onnx);
        let _ = std::fs::remove_file(&marker);
        download_file(&curl, VOICE_ONNX_URL, &onnx, 600)?;
    }
    // Verifikasi integritas file PRISTINE (marker belum ada = metadata
    // belum di-append, jadi hash harus sama persis dengan upstream).
    // Bila marker sudah ada, file adalah varian +131 byte pasca-append
    // dan pengecekan hash dilewati (marker adalah jangkar kepercayaannya).
    // File yang gagal hash dihapus agar setup berikutnya mengunduh ulang.
    if !marker.is_file() {
        let h = crate::voicestudio::sha256_file(&onnx)?;
        if h != VOICE_ONNX_SHA256 {
            let _ = std::fs::remove_file(&onnx);
            let _ = std::fs::remove_file(&marker);
            return Err(
                "SHA-256 model Sherpa tidak cocok dengan upstream — unduhan dihapus, ulangi Setup"
                    .to_string(),
            );
        }
    }
    let json_len = json.metadata().map(|m| m.len()).unwrap_or(0);
    if !json.is_file() || json_len < VOICE_JSON_BYTES {
        let _ = std::fs::remove_file(&json);
        download_file(&curl, VOICE_JSON_URL, &json, 120)?;
    }
    // JSON tidak pernah di-append: hash-nya harus selalu sama persis.
    let hj = crate::voicestudio::sha256_file(&json)?;
    if hj != VOICE_JSON_SHA256 {
        let _ = std::fs::remove_file(&json);
        return Err(
            "SHA-256 JSON fonem Sherpa tidak cocok dengan upstream — unduhan dihapus, ulangi Setup"
                .to_string(),
        );
    }
    let tokens = dir.join("tokens.txt");
    write_tokens(&json, &tokens)?;
    // Konversi sekali: tambah metadata ONNX (file Piper mentah tidak
    // memilikinya). Marker mencegah append ganda pada setup berikutnya
    // (append ganda pun tak merusak — map protobuf menang nilai terakhir
    // yang identik — tapi tetap dihindari).
    if !marker.is_file() {
        append_onnx_metadata(&onnx)?;
        std::fs::write(&marker, "vits piper id 22050\n")
            .map_err(|e| format!("gagal menulis {}: {e}", marker.display()))?;
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
    let tmp = std::env::temp_dir().join(format!(
        "minime-sherpa-{}.wav",
        crate::video::unique_suffix()
    ));
    if !audio.save(tmp.to_str().unwrap_or("")) {
        let _ = std::fs::remove_file(&tmp);
        return Err("gagal menyimpan WAV Sherpa".to_string());
    }
    let bytes = match std::fs::read(&tmp) {
        Ok(b) => b,
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            return Err(format!("gagal membaca WAV Sherpa: {e}"));
        }
    };
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
    if req.text.chars().count() > 20_000 {
        return Err("naskah melebihi 20.000 karakter".to_string());
    }
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

    // Uji TANPA aset: append metadata harus menambah tepat 131 byte
    // dan memuat ketujuh kunci (format protobuf field 14). Jalan di
    // gate default (bukan ignor).
    #[test]
    fn onnx_metadata_append_is_exact() {
        let tmp =
            std::env::temp_dir().join(format!("minime-meta-test-{}.onnx", std::process::id()));
        std::fs::write(&tmp, b"fake-onnx").expect("tulis temp");
        let n = append_onnx_metadata(&tmp).expect("append metadata");
        assert_eq!(n, 131, "total byte metadata");
        let bytes = std::fs::read(&tmp).expect("baca temp");
        assert_eq!(bytes.len(), 9 + 131, "ukuran akhir");
        for (k, _) in ONNX_METADATA {
            assert!(
                bytes.windows(k.len()).any(|w| w == k.as_bytes()),
                "kunci {k} hilang"
            );
        }
        let _ = std::fs::remove_file(&tmp);
    }

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
