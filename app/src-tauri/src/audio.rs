// Penyimpanan file audio hasil generate/unggahan (std-only, tanpa
// dependensi baru) — cermin image.rs: file tinggal di $HOME/minime-audio/
// (TIDAK masuk git), metadata aset (nama, sumber, durasi, transkrip)
// di localStorage frontend (minime.voiceAssets), bytes dibaca balik
// lewat audio_read sebagai data URL untuk diputar/didekode WebView
// (tanpa perlu asset protocol / CSP baru).
// Nama file divalidasi ketat via image::safe_name: tanpa pemisah path,
// tanpa traversal.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub(crate) fn audio_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "direktori HOME tidak ditemukan.".to_string())?;
    Ok(PathBuf::from(home).join("minime-audio"))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSaveReq {
    pub name: String,
    pub b64: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSaveRes {
    pub file: String,
    pub bytes: u64,
}

#[tauri::command]
pub fn audio_save(req: AudioSaveReq) -> Result<AudioSaveRes, String> {
    let name = crate::image::safe_name(&req.name).ok_or("nama file tidak valid")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&req.b64)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 20_000_000 {
        return Err("audio melebihi 20 MB".to_string());
    }
    let dir = audio_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(&name), &bytes).map_err(|e| e.to_string())?;
    Ok(AudioSaveRes {
        file: name,
        bytes: bytes.len() as u64,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioReadReq {
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioReadRes {
    pub file: String,
    pub b64: String,
    pub bytes: u64,
}

#[tauri::command]
pub fn audio_read(req: AudioReadReq) -> Result<AudioReadRes, String> {
    let name = crate::image::safe_name(&req.name).ok_or("nama file tidak valid")?;
    let bytes = std::fs::read(audio_dir()?.join(&name)).map_err(|e| e.to_string())?;
    Ok(AudioReadRes {
        file: name,
        b64: base64::engine::general_purpose::STANDARD.encode(&bytes),
        bytes: bytes.len() as u64,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeleteReq {
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeleteRes {
    pub file: String,
    pub deleted: bool,
}

#[tauri::command]
pub fn audio_delete(req: AudioDeleteReq) -> Result<AudioDeleteRes, String> {
    let name = crate::image::safe_name(&req.name).ok_or("nama file tidak valid")?;
    match std::fs::remove_file(audio_dir()?.join(&name)) {
        Ok(()) => Ok(AudioDeleteRes {
            file: name,
            deleted: true,
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(AudioDeleteRes {
            file: name,
            deleted: false,
        }),
        Err(e) => Err(e.to_string()),
    }
}
