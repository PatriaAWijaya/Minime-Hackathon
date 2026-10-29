//! Panggilan API publik Postiz lokal lewat Rust, bukan fetch webview.
//!
//! Alasan (temuan 29 Okt 2026): fetch dari origin app (tauri://localhost)
//! ke localhost:4007 adalah cross-origin; preflight Postiz menjawab 204
//! TANPA Access-Control-Allow-Origin untuk origin itu (header tersebut
//! hanya dikembalikan untuk origin localhost:4007 — terbukti via curl).
//! Akibatnya browser memblokir upload + schedule Batch dari app, dan
//! rig yang mem-mock fetch tidak pernah menangkapnya. Perintah Rust
//! berjalan di luar webview sehingga tidak kena CORS sama sekali.
//!
//! Batasan keamanan (disengaja, mengikuti pola allowlist browser.rs):
//! hanya ke Postiz lokal 127.0.0.1:4007, hanya tiga path API publik
//! (POST /api/public/v1/upload dan /posts, GET /api/public/v1/integrations
//! untuk uji koneksi wizard Setup Postiz v50), dan kunci API hanya dikirim
//! sebagai header Authorization ke localhost — tidak pernah ditulis
//! ke log, tidak pernah masuk error string, tidak pernah keluar dari
//! perintah ini. Ini BUKAN proxy HTTP umum.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use crate::image::{images_dir, safe_name};

const POSTIZ_ADDR: &str = "127.0.0.1:4007";
const BOUNDARY: &str = "----MiniMePostizBoundary";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostizReq {
    pub op: String,
    pub key: String,
    pub file: Option<String>,
    pub json: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostizRes {
    pub status: u16,
    pub body: String,
}

fn http_post(path: &str, key: &str, content_type: &str, body: &[u8]) -> Result<PostizRes, String> {
    let mut stream =
        TcpStream::connect(POSTIZ_ADDR).map_err(|e| format!("Postiz tidak terjangkau: {e}"))?;
    stream.set_read_timeout(Some(Duration::from_secs(30))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(30))).ok();
    let head = format!(
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:4007\r\nAuthorization: {key}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(head.as_bytes())
        .and_then(|_| stream.write_all(body))
        .map_err(|e| e.to_string())?;
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).map_err(|e| e.to_string())?;
    parse_response(&raw)
}

fn http_get(path: &str, key: &str) -> Result<PostizRes, String> {
    let mut stream =
        TcpStream::connect(POSTIZ_ADDR).map_err(|e| format!("Postiz tidak terjangkau: {e}"))?;
    stream.set_read_timeout(Some(Duration::from_secs(30))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(30))).ok();
    let head = format!(
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:4007\r\nAuthorization: {key}\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(head.as_bytes())
        .map_err(|e| e.to_string())?;
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).map_err(|e| e.to_string())?;
    parse_response(&raw)
}

fn parse_response(raw: &[u8]) -> Result<PostizRes, String> {
    let sep = b"\r\n\r\n";
    let pos = raw
        .windows(sep.len())
        .position(|w| w == sep)
        .ok_or("respons Postiz tidak valid")?;
    let head = String::from_utf8_lossy(&raw[..pos]);
    let mut lines = head.lines();
    let status_line = lines.next().ok_or("respons Postiz kosong")?;
    let status: u16 = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())
        .ok_or("status Postiz tidak valid")?;
    let mut content_length: Option<usize> = None;
    let mut chunked = false;
    for line in lines {
        let lower = line.to_ascii_lowercase();
        if let Some(v) = lower.strip_prefix("content-length:") {
            content_length = v.trim().parse::<usize>().ok();
        }
        if lower.starts_with("transfer-encoding:") && lower.contains("chunked") {
            chunked = true;
        }
    }
    let body_raw = &raw[pos + sep.len()..];
    let body: Vec<u8> = if chunked {
        dechunk(body_raw)?
    } else if let Some(n) = content_length {
        body_raw.get(..n).unwrap_or(body_raw).to_vec()
    } else {
        body_raw.to_vec()
    };
    Ok(PostizRes {
        status,
        body: String::from_utf8_lossy(&body).into_owned(),
    })
}

fn dechunk(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut rest = data;
    loop {
        let end = rest
            .windows(2)
            .position(|w| w == b"\r\n")
            .ok_or("chunk Postiz tidak valid")?;
        let size_str = String::from_utf8_lossy(&rest[..end]);
        let size_hex = size_str.trim().split(';').next().unwrap_or("");
        let size =
            usize::from_str_radix(size_hex, 16).map_err(|_| "ukuran chunk Postiz tidak valid")?;
        if size == 0 {
            break;
        }
        let chunk_start = end + 2;
        let chunk_end = chunk_start + size;
        let chunk = rest
            .get(chunk_start..chunk_end)
            .ok_or("chunk Postiz terpotong")?;
        out.extend_from_slice(chunk);
        rest = rest.get(chunk_end + 2..).unwrap_or(&[]);
    }
    Ok(out)
}

fn multipart_body(file_name: &str, bytes: &[u8]) -> (String, Vec<u8>) {
    let mut body = Vec::new();
    body.extend_from_slice(
        format!(
            "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{file_name}\"\r\nContent-Type: image/webp\r\n\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{BOUNDARY}--\r\n").as_bytes());
    (format!("multipart/form-data; boundary={BOUNDARY}"), body)
}

#[tauri::command]
pub fn postiz_request(req: PostizReq) -> Result<PostizRes, String> {
    if req.key.trim().is_empty() {
        return Err("API key Postiz kosong".into());
    }
    match req.op.as_str() {
        "upload" => {
            let name = req
                .file
                .as_deref()
                .and_then(safe_name)
                .ok_or("nama file tidak valid")?;
            let bytes = std::fs::read(images_dir()?.join(&name)).map_err(|e| e.to_string())?;
            let (content_type, body) = multipart_body(&name, &bytes);
            http_post("/api/public/v1/upload", &req.key, &content_type, &body)
        }
        "post" => {
            let json = req
                .json
                .filter(|s| !s.trim().is_empty())
                .ok_or("body JSON kosong")?;
            http_post(
                "/api/public/v1/posts",
                &req.key,
                "application/json",
                json.as_bytes(),
            )
        }
        // Uji koneksi wizard Setup Postiz: GET read-only, tanpa efek samping.
        // 200 = kunci valid (+ daftar integrations = channel terhubung);
        // 401 = kunci ditolak (pesan Postiz: "Invalid API key").
        "ping" => http_get("/api/public/v1/integrations", &req.key),
        _ => Err("op Postiz tidak dikenal".into()),
    }
}
