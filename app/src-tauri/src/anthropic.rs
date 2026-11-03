// Proxy Anthropic Messages API lewat curl sisi server (v237).
//
// Latar: panggilan fetch langsung dari WebView ke api.anthropic.com
// DIBLOKIR CORS — preflight Anthropic tidak mengembalikan
// access-control-allow-origin (Meta mengembalikan *, sehingga lolos;
// dibuktikan curl OPTIONS 3 Nov 2026). Karena itu kaki Anthropic di
// router WAJIB lewat perintah ini (pola vs_api v223), bukan fetch.
// Kunci TIDAK pernah ditulis ke log/error: ia hanya lewat sebagai
// argumen curl proses lokal dan tidak pernah dipantulkan ke pesan
// error (badan error Anthropic tidak mengandung kunci).
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Deserialize)]
pub struct AnthropicChatReq {
    pub api_key: String,
    pub model: String,
    pub system: Option<String>,
    pub prompt: String,
    pub max_tokens: Option<u32>,
    pub timeout_secs: Option<u64>,
}

#[derive(Serialize)]
pub struct AnthropicChatRes {
    pub text: String,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
}

#[tauri::command]
pub fn anthropic_chat(req: AnthropicChatReq) -> Result<AnthropicChatRes, String> {
    if req.api_key.trim().is_empty() {
        return Err("kunci Anthropic kosong".to_string());
    }
    let mut body = serde_json::json!({
        "model": req.model,
        "max_tokens": req.max_tokens.unwrap_or(8192),
        "temperature": 0.2,
        "messages": [{ "role": "user", "content": req.prompt }],
    });
    if let Some(system) = &req.system {
        body["system"] = serde_json::Value::String(system.clone());
    }
    let body_str =
        serde_json::to_string(&body).map_err(|e| format!("gagal merangkai body Anthropic: {e}"))?;
    let curl = crate::video::find_tool("curl")
        .ok_or_else(|| "curl tidak ditemukan di PATH".to_string())?;
    let out = Command::new(curl)
        .args([
            "-sS",
            "--max-time",
            &req.timeout_secs.unwrap_or(120).max(1).to_string(),
            "-X",
            "POST",
            "-H",
            "Content-Type: application/json",
            "-H",
            &format!("x-api-key: {}", req.api_key),
            "-H",
            "anthropic-version: 2023-06-01",
            "--data",
            &body_str,
            "-w",
            "\n%{http_code}",
            "https://api.anthropic.com/v1/messages",
        ])
        .output()
        .map_err(|e| format!("gagal menjalankan curl: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "curl gagal ({}): {}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let stdout = out.stdout;
    let split = stdout
        .iter()
        .rposition(|b| *b == b'\n')
        .ok_or_else(|| "respons curl tanpa baris status".to_string())?;
    let (raw_body, tail) = stdout.split_at(split);
    let status: u16 = String::from_utf8_lossy(&tail[1..])
        .trim()
        .parse()
        .map_err(|_| "baris status curl tidak valid".to_string())?;
    let body_text = String::from_utf8_lossy(raw_body).into_owned();
    if !(200..300).contains(&status) {
        let slice: String = body_text.chars().take(300).collect();
        return Err(format!("HTTP {status}: {slice}"));
    }
    let v: serde_json::Value = serde_json::from_str(&body_text)
        .map_err(|e| format!("respons Anthropic bukan JSON: {e}"))?;
    let text = v["content"].as_array().map(|arr| {
        arr.iter()
            .filter(|b| b["type"] == "text")
            .filter_map(|b| b["text"].as_str())
            .collect::<Vec<_>>()
            .join("")
    });
    Ok(AnthropicChatRes {
        text: text.unwrap_or_default(),
        input_tokens: v["usage"]["input_tokens"].as_u64().map(|n| n as u32),
        output_tokens: v["usage"]["output_tokens"].as_u64().map(|n| n as u32),
    })
}
