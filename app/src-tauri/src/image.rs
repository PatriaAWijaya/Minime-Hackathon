// Penyimpanan file gambar hasil generate (std-only, tanpa dependensi baru).
//
// Pola sama dengan aset Sherpa (~/minime-voices/): file gambar tinggal
// di $HOME/minime-images/ — TIDAK masuk git. Frontend menyimpan metadata
// (judul, prompt, nama file, biaya) di Library (localStorage), dan
// membaca kembali bytes-nya lewat image_read sebagai data URL untuk
// ditampilkan di WebView (tanpa perlu asset protocol / CSP baru).
// Nama file divalidasi ketat: tanpa pemisah path, tanpa traversal.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

fn images_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "direktori HOME tidak ditemukan.".to_string())?;
    Ok(PathBuf::from(home).join("minime-images"))
}

fn safe_name(name: &str) -> Option<String> {
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
    {
        return None;
    }
    Some(name.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageSaveReq {
    pub name: String,
    pub b64: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageSaveRes {
    pub file: String,
    pub bytes: u64,
}

#[tauri::command]
pub fn image_save(req: ImageSaveReq) -> Result<ImageSaveRes, String> {
    let name = safe_name(&req.name).ok_or("nama file tidak valid")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&req.b64)
        .map_err(|e| e.to_string())?;
    let dir = images_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(&name), &bytes).map_err(|e| e.to_string())?;
    Ok(ImageSaveRes {
        file: name,
        bytes: bytes.len() as u64,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageReadReq {
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageReadRes {
    pub file: String,
    pub b64: String,
    pub bytes: u64,
}

#[tauri::command]
pub fn image_read(req: ImageReadReq) -> Result<ImageReadRes, String> {
    let name = safe_name(&req.name).ok_or("nama file tidak valid")?;
    let bytes = std::fs::read(images_dir()?.join(&name)).map_err(|e| e.to_string())?;
    Ok(ImageReadRes {
        file: name,
        b64: base64::engine::general_purpose::STANDARD.encode(&bytes),
        bytes: bytes.len() as u64,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageDeleteReq {
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageDeleteRes {
    pub file: String,
    pub deleted: bool,
}

#[tauri::command]
pub fn image_delete(req: ImageDeleteReq) -> Result<ImageDeleteRes, String> {
    let name = safe_name(&req.name).ok_or("nama file tidak valid")?;
    match std::fs::remove_file(images_dir()?.join(&name)) {
        Ok(()) => Ok(ImageDeleteRes {
            file: name,
            deleted: true,
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(ImageDeleteRes {
            file: name,
            deleted: false,
        }),
        Err(e) => Err(e.to_string()),
    }
}
