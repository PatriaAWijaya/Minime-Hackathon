//! Penjadwal + autopost native MiniMe (v61) — pengganti Postiz.
//!
//! Arsitektur: OAuth loopback (desktop) + publish langsung ke API
//! platform lewat curl (tanpa dependensi HTTP baru — konsisten dengan
//! probe `fb_app_status`). Token TIDAK PERNAH di-log; panggilan
//! bertoken memakai file konfigurasi curl sementara (0600) yang
//! dihapus sesudah dipakai, bukan argv (argv terlihat di `ps`).
//!
//! Batas jujur v61: hanya LinkedIn yang dibangun end-to-end
//! (connect + terbit teks/gambar). Platform lain mengembalikan
//! error "belum dibangun" — BUKAN sukses palsu. Penjadwal berjalan
//! selama app terbuka (timer 30 detik di frontend); penjadwalan
//! level OS (launchd) adalah fase berikutnya, bukan v61.

use serde::Deserialize;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

/// Port loopback OAuth — TETAP, karena redirect URI yang didaftarkan
/// di tiap aplikasi provider harus cocok persis dengan ini.
pub const OAUTH_PORT: u16 = 4317;

fn pct_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = |b: u8| -> Option<u8> {
                match b {
                    b'0'..=b'9' => Some(b - b'0'),
                    b'a'..=b'f' => Some(b - b'a' + 10),
                    b'A'..=b'F' => Some(b - b'A' + 10),
                    _ => None,
                }
            };
            if let (Some(h), Some(l)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            out.push(b' ');
        } else {
            out.push(bytes[i]);
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn query_value(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        let mut it = pair.splitn(2, '=');
        if let (Some(k), Some(v)) = (it.next(), it.next()) {
            if k == key {
                return Some(pct_decode(v));
            }
        }
    }
    None
}

/// Tunggu SATU callback OAuth di 127.0.0.1:4317 (maks 180 detik).
/// Mengembalikan JSON {"code": "...", "state": "..."} atau Err.
/// Dipanggil frontend BERSAMAAN dengan membuka URL OAuth di browser:
/// promise invoke ini menggantung sampai callback tiba.
#[tauri::command]
pub fn social_oauth_listen() -> Result<String, String> {
    let listener = TcpListener::bind(("127.0.0.1", OAUTH_PORT))
        .map_err(|e| format!("Port {OAUTH_PORT} tidak bisa dipakai: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let start = Instant::now();
    loop {
        if start.elapsed() > Duration::from_secs(180) {
            return Err("Waktu tunggu login habis (180 detik)".into());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
                let mut buf = Vec::new();
                let mut chunk = [0u8; 4096];
                loop {
                    match stream.read(&mut chunk) {
                        Ok(0) => break,
                        Ok(n) => {
                            buf.extend_from_slice(&chunk[..n]);
                            if buf.len() > 8192 || buf.windows(4).any(|w| w == b"\r\n\r\n") {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
                let text = String::from_utf8_lossy(&buf).to_string();
                let target = text
                    .lines()
                    .next()
                    .unwrap_or("")
                    .split_whitespace()
                    .nth(1)
                    .unwrap_or("")
                    .to_string();
                let query = target.splitn(2, '?').nth(1).unwrap_or("").to_string();
                let page = "<html><body style=\"font-family:sans-serif;text-align:center;padding-top:40px\"><h2>Login selesai</h2><p>Kembali ke MiniMe. Tab ini bisa ditutup.</p></body></html>";
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    page.len(),
                    page
                );
                let _ = stream.write_all(resp.as_bytes());
                if let Some(err) = query_value(&query, "error") {
                    return Err(format!("Login ditolak provider: {err}"));
                }
                let code = query_value(&query, "code")
                    .ok_or("Callback tanpa code — periksa redirect URI di aplikasi provider")?;
                let state = query_value(&query, "state").unwrap_or_default();
                let out = serde_json::json!({ "code": code, "state": state });
                return Ok(out.to_string());
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

struct CurlRes {
    status: u16,
    body: String,
}

/// Panggil API HTTPS lewat curl dengan file konfigurasi sementara
/// (0600, dihapus sesudah dipakai). `json_body` ditulis ke file data
/// terpisah agar tanda kutip JSON tidak pecah di config. `upload_file`
/// = path file biner untuk PUT (dipakai upload media LinkedIn).
fn curl_api(
    method: &str,
    url: &str,
    token: Option<&str>,
    json_body: Option<&str>,
    upload_file: Option<&std::path::Path>,
    content_type: Option<&str>,
) -> Result<CurlRes, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = std::env::temp_dir();
    let cfg = dir.join(format!("minime-curl-{stamp}.cfg"));
    let body_path = dir.join(format!("minime-curl-{stamp}.body"));
    let mut data_path: Option<std::path::PathBuf> = None;
    let mut cfg_text = String::new();
    cfg_text.push_str("silent = true\n");
    cfg_text.push_str(&format!("url = \"{url}\"\n"));
    cfg_text.push_str(&format!("request = \"{method}\"\n"));
    cfg_text.push_str(&format!("output = \"{}\"\n", body_path.to_string_lossy()));
    cfg_text.push_str("write-out = \"%{http_code}\"\n");
    if let Some(t) = token {
        cfg_text.push_str(&format!("header = \"Authorization: Bearer {t}\"\n"));
    }
    if let Some(ct) = content_type {
        cfg_text.push_str(&format!("header = \"Content-Type: {ct}\"\n"));
    }
    // Header LinkedIn (diabaikan platform lain yang tidak mengenalnya).
    cfg_text.push_str("header = \"X-Restli-Protocol-Version: 2.0.0\"\n");
    if let Some(j) = json_body {
        let dp = dir.join(format!("minime-curl-{stamp}.json"));
        std::fs::write(&dp, j).map_err(|e| e.to_string())?;
        cfg_text.push_str(&format!("data-binary = \"@{}\"\n", dp.to_string_lossy()));
        data_path = Some(dp);
    }
    if let Some(f) = upload_file {
        cfg_text.push_str(&format!("data-binary = \"@{}\"\n", f.to_string_lossy()));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::write(&cfg, &cfg_text).map_err(|e| e.to_string())?;
        let _ = std::fs::set_permissions(&cfg, std::fs::Permissions::from_mode(0o600));
    }
    #[cfg(not(unix))]
    {
        std::fs::write(&cfg, &cfg_text).map_err(|e| e.to_string())?;
    }
    let out = std::process::Command::new("curl")
        .args(["-K", &cfg.to_string_lossy()])
        .output()
        .map_err(|e| e.to_string())?;
    let status: u16 = String::from_utf8_lossy(&out.stdout)
        .trim()
        .parse()
        .unwrap_or(0);
    let body = std::fs::read_to_string(&body_path).unwrap_or_default();
    let _ = std::fs::remove_file(&cfg);
    let _ = std::fs::remove_file(&body_path);
    if let Some(dp) = data_path {
        let _ = std::fs::remove_file(dp);
    }
    if status == 0 {
        return Err(format!(
            "curl gagal: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(CurlRes { status, body })
}

fn form_encode(pairs: &[(&str, &str)]) -> String {
    pairs
        .iter()
        .map(|(k, v)| {
            let enc = |s: &str| -> String {
                let mut o = String::new();
                for b in s.bytes() {
                    match b {
                        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                            o.push(b as char)
                        }
                        _ => o.push_str(&format!("%{b:02X}")),
                    }
                }
                o
            };
            format!("{}={}", enc(k), enc(v))
        })
        .collect::<Vec<_>>()
        .join("&")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenExchangeReq {
    pub platform: String,
    pub code: String,
    pub redirect_uri: String,
    pub client_id: String,
    pub client_secret: String,
}

/// Tukar authorization code menjadi token (v61: LinkedIn saja).
/// Mengembalikan body JSON mentah dari provider untuk disimpan
/// frontend (access_token, expires_in, refresh_token bila ada).
#[tauri::command]
pub fn social_token_exchange(req: TokenExchangeReq) -> Result<String, String> {
    if req.platform != "linkedin" {
        return Err(format!("Token exchange {} belum dibangun", req.platform));
    }
    let form = form_encode(&[
        ("grant_type", "authorization_code"),
        ("code", &req.code),
        ("redirect_uri", &req.redirect_uri),
        ("client_id", &req.client_id),
        ("client_secret", &req.client_secret),
    ]);
    // Form dikirim lewat file data (bukan argv/JSON) agar encoding tepat.
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dp = std::env::temp_dir().join(format!("minime-form-{stamp}.txt"));
    std::fs::write(&dp, &form).map_err(|e| e.to_string())?;
    let r = curl_api(
        "POST",
        "https://www.linkedin.com/oauth/v2/accessToken",
        None,
        None,
        Some(&dp),
        Some("application/x-www-form-urlencoded"),
    );
    let _ = std::fs::remove_file(dp);
    let r = r?;
    if r.status != 200 {
        return Err(format!("Token exchange gagal (HTTP {})", r.status));
    }
    Ok(r.body)
}

/// Profil LinkedIn (userinfo) — dipakai untuk label channel + URN author.
#[tauri::command]
pub fn social_linkedin_me(token: String) -> Result<String, String> {
    let r = curl_api(
        "GET",
        "https://api.linkedin.com/v2/userinfo",
        Some(&token),
        None,
        None,
        None,
    )?;
    if r.status != 200 {
        return Err(format!("Gagal membaca profil LinkedIn (HTTP {})", r.status));
    }
    Ok(r.body)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishReq {
    pub platform: String,
    pub text: String,
    pub image_b64: String,
    pub image_mime: String,
    pub access_token: String,
    #[serde(default)]
    pub page_id: String,
    #[serde(default)]
    pub page_token: String,
    #[serde(default)]
    pub image_url: String,
    #[serde(default)]
    pub image_file: String,
}

/// Gambar untuk publish: utamakan referensi file (antrean — hemat
/// localStorage, tanpa risiko kuota), fallback base64 (terbit langsung).
/// File dibaca dari ~/minime-images/ lewat safe_name (tanpa traversal).
fn resolve_image(req: &PublishReq) -> Result<Option<(Vec<u8>, String)>, String> {
    if !req.image_file.is_empty() {
        let name = crate::image::safe_name(&req.image_file).ok_or("nama file tidak valid")?;
        let dir = crate::image::images_dir()?;
        let bytes = std::fs::read(dir.join(name)).map_err(|e| e.to_string())?;
        let mime = if req.image_mime.is_empty() {
            "image/jpeg"
        } else {
            req.image_mime.as_str()
        };
        return Ok(Some((bytes, mime.to_string())));
    }
    if !req.image_b64.is_empty() {
        let bytes =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &req.image_b64)
                .map_err(|e| e.to_string())?;
        let mime = if req.image_mime.is_empty() {
            "image/jpeg"
        } else {
            req.image_mime.as_str()
        };
        return Ok(Some((bytes, mime.to_string())));
    }
    Ok(None)
}

/// POST multipart (satu file) lewat curl config sementara — dipakai
/// upload foto Facebook Page. Field teks dikirim sebagai `form`
/// biasa; file sebagai `form = "field=@path;type=mime"`.
fn curl_multipart(
    url: &str,
    token: &str,
    text_fields: &[(&str, &str)],
    file_field: &str,
    file_path: &std::path::Path,
    file_mime: &str,
) -> Result<CurlRes, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = std::env::temp_dir();
    let cfg = dir.join(format!("minime-mp-{stamp}.cfg"));
    let body_path = dir.join(format!("minime-mp-{stamp}.body"));
    let mut cfg_text = String::new();
    cfg_text.push_str("silent = true\n");
    cfg_text.push_str(&format!("url = \"{url}\"\n"));
    cfg_text.push_str("request = \"POST\"\n");
    cfg_text.push_str(&format!("output = \"{}\"\n", body_path.to_string_lossy()));
    cfg_text.push_str("write-out = \"%{http_code}\"\n");
    cfg_text.push_str(&format!("header = \"Authorization: Bearer {token}\"\n"));
    for (k, v) in text_fields {
        let v_esc = v.replace('\\', "\\\\").replace('"', "\\\"");
        cfg_text.push_str(&format!("form = \"{k}={v_esc}\"\n"));
    }
    cfg_text.push_str(&format!(
        "form = \"{file_field}=@{};type={file_mime}\"\n",
        file_path.to_string_lossy()
    ));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::write(&cfg, &cfg_text).map_err(|e| e.to_string())?;
        let _ = std::fs::set_permissions(&cfg, std::fs::Permissions::from_mode(0o600));
    }
    #[cfg(not(unix))]
    {
        std::fs::write(&cfg, &cfg_text).map_err(|e| e.to_string())?;
    }
    let out = std::process::Command::new("curl")
        .args(["-K", &cfg.to_string_lossy()])
        .output()
        .map_err(|e| e.to_string())?;
    let status: u16 = String::from_utf8_lossy(&out.stdout)
        .trim()
        .parse()
        .unwrap_or(0);
    let body = std::fs::read_to_string(&body_path).unwrap_or_default();
    let _ = std::fs::remove_file(&cfg);
    let _ = std::fs::remove_file(&body_path);
    if status == 0 {
        return Err(format!(
            "curl gagal: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(CurlRes { status, body })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaExchangeReq {
    pub code: String,
    pub redirect_uri: String,
    pub client_id: String,
    pub client_secret: String,
}

/// Tukar code Meta (FB/Threads) menjadi token jangka panjang (60 hari):
/// short-lived -> fb_exchange_token. Mengembalikan body JSON long-lived.
#[tauri::command]
pub fn social_meta_exchange(req: MetaExchangeReq) -> Result<String, String> {
    let short_url = format!(
        "https://graph.facebook.com/v25.0/oauth/access_token?client_id={}&redirect_uri={}&client_secret={}&code={}",
        req.client_id, req.redirect_uri, req.client_secret, req.code
    );
    let short = curl_api("GET", &short_url, None, None, None, None)?;
    if short.status != 200 {
        return Err(format!("Token Meta gagal (HTTP {})", short.status));
    }
    let short_tok = serde_json::from_str::<serde_json::Value>(&short.body)
        .ok()
        .and_then(|v| {
            v.get("access_token")
                .and_then(|t| t.as_str())
                .map(|t| t.to_string())
        })
        .ok_or("Token Meta tanpa access_token")?;
    let long_url = format!(
        "https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id={}&client_secret={}&fb_exchange_token={}",
        req.client_id, req.client_secret, short_tok
    );
    let long = curl_api("GET", &long_url, None, None, None, None)?;
    if long.status != 200 {
        return Err(format!(
            "Token jangka panjang Meta gagal (HTTP {})",
            long.status
        ));
    }
    Ok(long.body)
}

/// Daftar Page yang dikelola token user Meta (untuk dipilih di kartu).
#[tauri::command]
pub fn social_meta_pages(token: String) -> Result<String, String> {
    let r = curl_api(
        "GET",
        "https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token&limit=100",
        Some(&token),
        None,
        None,
        None,
    )?;
    if r.status != 200 {
        return Err(format!("Daftar Page gagal (HTTP {})", r.status));
    }
    Ok(r.body)
}

fn fb_page_publish(req: &PublishReq) -> Result<String, String> {
    if req.page_id.is_empty() || req.page_token.is_empty() {
        return Err("Page belum dipilih".into());
    }
    let img = resolve_image(req)?;
    if img.is_none() {
        let body = serde_json::json!({ "message": req.text }).to_string();
        let url = format!("https://graph.facebook.com/v25.0/{}/feed", req.page_id);
        let r = curl_api(
            "POST",
            &url,
            Some(&req.page_token),
            Some(&body),
            None,
            Some("application/json"),
        )?;
        if r.status != 200 {
            return Err(format!("Publish FB Page gagal (HTTP {})", r.status));
        }
        return Ok("ok".into());
    }
    let (bytes, mime) = img.unwrap();
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = std::env::temp_dir().join(format!("minime-fb-{stamp}.bin"));
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    let url = format!("https://graph.facebook.com/v25.0/{}/photos", req.page_id);
    let r = curl_multipart(
        &url,
        &req.page_token,
        &[("caption", &req.text)],
        "source",
        &tmp,
        &mime,
    );
    let _ = std::fs::remove_file(&tmp);
    let r = r?;
    if r.status != 200 {
        return Err(format!("Upload foto FB Page gagal (HTTP {})", r.status));
    }
    Ok("ok".into())
}

fn threads_publish(req: &PublishReq) -> Result<String, String> {
    // Teks saja, atau gambar via URL publik. File lokal ditolak tegas
    // (bukan di-drop diam-diam menjadi teks).
    if !req.image_b64.is_empty() || !req.image_file.is_empty() {
        return Err("Threads butuh URL gambar publik untuk gambar (bukan file lokal)".into());
    }
    let body = if req.image_url.is_empty() {
        serde_json::json!({ "media_type": "TEXT", "text": req.text }).to_string()
    } else {
        serde_json::json!({ "media_type": "IMAGE", "image_url": req.image_url, "text": req.text })
            .to_string()
    };
    let c = curl_api(
        "POST",
        "https://graph.threads.net/v1.0/me/threads",
        Some(&req.access_token),
        Some(&body),
        None,
        Some("application/json"),
    )?;
    if c.status != 200 {
        return Err(format!("Container Threads gagal (HTTP {})", c.status));
    }
    let cid = serde_json::from_str::<serde_json::Value>(&c.body)
        .ok()
        .and_then(|v| v.get("id").and_then(|i| i.as_str()).map(|i| i.to_string()))
        .ok_or("Container Threads tanpa id")?;
    let body2 = serde_json::json!({ "creation_id": cid }).to_string();
    let p = curl_api(
        "POST",
        "https://graph.threads.net/v1.0/me/threads_publish",
        Some(&req.access_token),
        Some(&body2),
        None,
        Some("application/json"),
    )?;
    if p.status != 200 {
        return Err(format!("Publish Threads gagal (HTTP {})", p.status));
    }
    Ok("ok".into())
}

fn ig_publish(req: &PublishReq) -> Result<String, String> {
    // IG API hanya menerima URL gambar publik — file lokal tidak bisa.
    if req.image_url.is_empty() {
        return Err("IG butuh URL gambar publik (bukan file lokal)".into());
    }
    if req.page_id.is_empty() || req.page_token.is_empty() {
        return Err("Akun IG belum dipilih".into());
    }
    let body = serde_json::json!({ "image_url": req.image_url, "caption": req.text }).to_string();
    let url = format!("https://graph.facebook.com/v25.0/{}/media", req.page_id);
    let c = curl_api(
        "POST",
        &url,
        Some(&req.page_token),
        Some(&body),
        None,
        Some("application/json"),
    )?;
    if c.status != 200 {
        return Err(format!("Container IG gagal (HTTP {})", c.status));
    }
    let cid = serde_json::from_str::<serde_json::Value>(&c.body)
        .ok()
        .and_then(|v| v.get("id").and_then(|i| i.as_str()).map(|i| i.to_string()))
        .ok_or("Container IG tanpa id")?;
    let body2 = serde_json::json!({ "creation_id": cid }).to_string();
    let url2 = format!(
        "https://graph.facebook.com/v25.0/{}/media_publish",
        req.page_id
    );
    let p = curl_api(
        "POST",
        &url2,
        Some(&req.page_token),
        Some(&body2),
        None,
        Some("application/json"),
    )?;
    if p.status != 200 {
        return Err(format!("Publish IG gagal (HTTP {})", p.status));
    }
    Ok("ok".into())
}

/// Ambil ID akun IG Business/Creator yang tertaut ke satu Page.
#[tauri::command]
pub fn social_meta_ig_id(page_id: String, token: String) -> Result<String, String> {
    let url =
        format!("https://graph.facebook.com/v25.0/{page_id}?fields=instagram_business_account");
    let r = curl_api("GET", &url, Some(&token), None, None, None)?;
    if r.status != 200 {
        return Err(format!("Akun IG Page gagal (HTTP {})", r.status));
    }
    Ok(r.body)
}

/// Terbitkan SATU postingan ke SATU platform (v61: LinkedIn;
/// v62a: + FB Page + Threads teks; v62b: + IG via URL gambar).
/// Platform lain mengembalikan error jelas — tidak ada sukses palsu.
#[tauri::command]
pub fn social_publish(req: PublishReq) -> Result<String, String> {
    match req.platform.as_str() {
        "linkedin" => linkedin_publish(&req),
        "facebook_page" => fb_page_publish(&req),
        "threads" => threads_publish(&req),
        "instagram" => ig_publish(&req),
        other => Err(format!("Publish {other} belum dibangun")),
    }
}

fn linkedin_publish(req: &PublishReq) -> Result<String, String> {
    let me = curl_api(
        "GET",
        "https://api.linkedin.com/v2/userinfo",
        Some(&req.access_token),
        None,
        None,
        None,
    )?;
    if me.status != 200 {
        return Err(format!("Token LinkedIn tidak valid (HTTP {})", me.status));
    }
    let sub = serde_json::from_str::<serde_json::Value>(&me.body)
        .ok()
        .and_then(|v| v.get("sub").and_then(|s| s.as_str()).map(|s| s.to_string()))
        .ok_or("Profil LinkedIn tanpa sub")?;
    let author = format!("urn:li:person:{sub}");
    let text_json = serde_json::Value::String(req.text.clone()).to_string();
    let img = resolve_image(req)?;
    if img.is_none() {
        let body = format!(
            "{{\"author\":\"{author}\",\"lifecycleState\":\"PUBLISHED\",\"specificContent\":{{\"com.linkedin.ugc.ShareContent\":{{\"shareCommentary\":{{\"text\":{text_json}}},\"shareMediaCategory\":\"NONE\"}}}},\"visibility\":{{\"com.linkedin.ugc.MemberNetworkVisibility\":\"PUBLIC\"}}}}"
        );
        let r = curl_api(
            "POST",
            "https://api.linkedin.com/v2/ugcPosts",
            Some(&req.access_token),
            Some(&body),
            None,
            Some("application/json"),
        )?;
        if r.status != 201 {
            return Err(format!("Publish LinkedIn gagal (HTTP {})", r.status));
        }
        return Ok("ok".into());
    }
    // Dengan gambar: registerUpload -> PUT biner -> ugcPost IMAGE.
    let (bytes, mime) = img.unwrap();
    let reg_body = format!(
        "{{\"registerUploadRequest\":{{\"recipes\":[\"urn:li:digitalmediaRecipe:feedshare-image\"],\"owner\":\"{author}\",\"serviceRelationships\":[{{\"relationshipType\":\"OWNER\",\"identifier\":\"urn:li:userGeneratedContent\"}}]}}}}"
    );
    let reg = curl_api(
        "POST",
        "https://api.linkedin.com/v2/assets?action=registerUpload",
        Some(&req.access_token),
        Some(&reg_body),
        None,
        Some("application/json"),
    )?;
    if reg.status != 200 {
        return Err(format!(
            "Register upload LinkedIn gagal (HTTP {})",
            reg.status
        ));
    }
    let reg_v: serde_json::Value =
        serde_json::from_str(&reg.body).map_err(|_| "Respons registerUpload tidak terbaca")?;
    let asset = reg_v
        .get("value")
        .and_then(|v| v.get("asset"))
        .and_then(|a| a.as_str())
        .ok_or("registerUpload tanpa asset")?
        .to_string();
    let upload_url = reg_v
        .get("value")
        .and_then(|v| v.get("uploadMechanism"))
        .and_then(|m| m.get("com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"))
        .and_then(|m| m.get("uploadUrl"))
        .and_then(|u| u.as_str())
        .ok_or("registerUpload tanpa uploadUrl")?
        .to_string();
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = std::env::temp_dir().join(format!("minime-li-{stamp}.bin"));
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    let up = curl_api(
        "PUT",
        &upload_url,
        Some(&req.access_token),
        None,
        Some(&tmp),
        Some(&mime),
    );
    let _ = std::fs::remove_file(&tmp);
    let up = up?;
    if up.status != 201 && up.status != 200 {
        return Err(format!("Upload media LinkedIn gagal (HTTP {})", up.status));
    }
    let body = format!(
        "{{\"author\":\"{author}\",\"lifecycleState\":\"PUBLISHED\",\"specificContent\":{{\"com.linkedin.ugc.ShareContent\":{{\"shareCommentary\":{{\"text\":{text_json}}},\"shareMediaCategory\":\"IMAGE\",\"media\":[{{\"status\":\"READY\",\"media\":\"{asset}\"}}]}}}},\"visibility\":{{\"com.linkedin.ugc.MemberNetworkVisibility\":\"PUBLIC\"}}}}"
    );
    let r = curl_api(
        "POST",
        "https://api.linkedin.com/v2/ugcPosts",
        Some(&req.access_token),
        Some(&body),
        None,
        Some("application/json"),
    )?;
    if r.status != 201 {
        return Err(format!("Publish LinkedIn gagal (HTTP {})", r.status));
    }
    Ok("ok".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pct_decode_roundtrip() {
        assert_eq!(pct_decode("hello%20world"), "hello world");
        assert_eq!(pct_decode("a%2Bb"), "a+b");
        assert_eq!(pct_decode("x+y"), "x y");
        assert_eq!(pct_decode("abc"), "abc");
    }

    #[test]
    fn query_value_picks_code() {
        assert_eq!(
            query_value("code=AQ123&state=xyz", "code"),
            Some("AQ123".to_string())
        );
        assert_eq!(
            query_value("code=AQ123&state=xyz", "state"),
            Some("xyz".to_string())
        );
        assert_eq!(query_value("error=access_denied", "code"), None);
    }

    #[test]
    fn form_encode_escapes() {
        let f = form_encode(&[("redirect_uri", "http://127.0.0.1:4317/callback")]);
        assert_eq!(f, "redirect_uri=http%3A%2F%2F127.0.0.1%3A4317%2Fcallback");
    }
}
