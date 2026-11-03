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

// Streaming SSE Anthropic lewat Tauri Channel (v239).
//
// Latar: tanpa streaming, jawaban Sonnet baru tampil setelah SELURUH
// output selesai (ribuan token) + QC — itu sumber utama rasa lambat.
// Perintah ini men-spawn curl -N (tanpa buffer) dan mengirim tiap delta
// teks ke Channel begitu baris SSE tiba; hasil akhir (teks penuh +
// token) tetap dikembalikan seperti anthropic_chat, sehingga pemanggil
// yang mengabaikan Channel tetap mendapat jawaban utuh.
// Bila status HTTP bukan 2xx, perintah mengembalikan Err — pemanggil
// WAJIB membuang delta yang sudah terkirim (itu sebabnya router hanya
// menampilkan delta provider pemenang, dan mereset buffer bila provider
// gagal di tengah stream). Kunci tidak pernah ditulis ke log/error.
#[tauri::command]
pub fn anthropic_chat_stream(
    req: AnthropicChatReq,
    on_event: tauri::ipc::Channel<String>,
) -> Result<AnthropicChatRes, String> {
    if req.api_key.trim().is_empty() {
        return Err("kunci Anthropic kosong".to_string());
    }
    let mut body = serde_json::json!({
        "model": req.model,
        "max_tokens": req.max_tokens.unwrap_or(8192),
        "temperature": 0.2,
        "stream": true,
        "messages": [{ "role": "user", "content": req.prompt }],
    });
    if let Some(system) = &req.system {
        body["system"] = serde_json::Value::String(system.clone());
    }
    let body_str =
        serde_json::to_string(&body).map_err(|e| format!("gagal merangkai body Anthropic: {e}"))?;
    let curl = crate::video::find_tool("curl")
        .ok_or_else(|| "curl tidak ditemukan di PATH".to_string())?;
    let mut child = std::process::Command::new(curl)
        .args([
            "-sS",
            "-N",
            "--max-time",
            &req.timeout_secs.unwrap_or(180).max(1).to_string(),
            "-X",
            "POST",
            "-H",
            "Content-Type: application/json",
            "-H",
            &format!("x-api-key: {}", req.api_key),
            "-H",
            "anthropic-version: 2023-06-01",
            "-H",
            "Accept: text/event-stream",
            "--data",
            &body_str,
            "-w",
            "\n%{http_code}",
            "https://api.anthropic.com/v1/messages",
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("gagal menjalankan curl: {e}"))?;
    use std::io::{BufRead, BufReader, Read};
    let mut acc = String::new();
    let mut input_tokens: Option<u32> = None;
    let mut output_tokens: Option<u32> = None;
    let mut http_status: u16 = 0;
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };
            let t = line.trim();
            if t.is_empty() {
                continue;
            }
            // Baris terakhir curl -w: hanya angka status (mis. "200").
            if t.len() == 3 && t.chars().all(|c| c.is_ascii_digit()) {
                http_status = t.parse().unwrap_or(0);
                continue;
            }
            let data = match t.strip_prefix("data:") {
                Some(d) => d.trim(),
                None => continue,
            };
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            let v: serde_json::Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let ev_type = v["type"].as_str().unwrap_or("");
            if ev_type == "message_start" {
                input_tokens = v["message"]["usage"]["input_tokens"]
                    .as_u64()
                    .map(|n| n as u32);
            } else if ev_type == "message_delta" {
                output_tokens = v["usage"]["output_tokens"].as_u64().map(|n| n as u32);
            } else if ev_type == "content_block_delta" {
                if let Some(delta) = v["delta"]["text"].as_str() {
                    acc.push_str(delta);
                    let _ = on_event.send(delta.to_string());
                }
            }
        }
    }
    let mut stderr_text = String::new();
    if let Some(mut stderr) = child.stderr.take() {
        let _ = stderr.read_to_string(&mut stderr_text);
    }
    let _ = child.wait();
    if !(200..300).contains(&http_status) {
        let detail = stderr_text.trim();
        let detail = if detail.is_empty() {
            format!("HTTP {http_status}")
        } else {
            format!(
                "HTTP {http_status}: {}",
                detail.chars().take(300).collect::<String>()
            )
        };
        return Err(detail);
    }
    Ok(AnthropicChatRes {
        text: acc,
        input_tokens,
        output_tokens,
    })
}
