//! Penjadwal + autopost native MiniMe (v61) — pengganti Postiz.
//!
//! Arsitektur: OAuth loopback (desktop) + publish langsung ke API
//! platform lewat curl (tanpa dependensi HTTP baru — konsisten dengan
//! probe `fb_app_status`). Token TIDAK PERNAH di-log; panggilan
//! bertoken memakai file konfigurasi curl sementara (0600) yang
//! dihapus sesudah dipakai, bukan argv (argv terlihat di `ps`).
//!
//! Batas jujur: LinkedIn, FB Page, Threads, IG, X, TikTok, dan
//! YouTube dibangun end-to-end (connect + terbit). YouTube HANYA
//! upload video MP4 (resumable, cara Postiz) — API-nya tidak punya
//! endpoint Community post, jadi teks/gambar saja ditolak jujur.
//! Platform yang belum dibangun mengembalikan error "belum dibangun"
//! — BUKAN sukses palsu. Penjadwal berjalan selama app terbuka
//! (timer 30 detik di frontend); penjadwalan level OS (launchd)
//! adalah fase berikutnya.

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

/// Nilai yang diinterpolasi ke file config curl TIDAK BOLEH mengandung
/// CR/LF: parser config curl membaca per baris, jadi newline di nilai
/// mengakhiri baris dan baris berikut diparse sebagai opsi curl baru
/// (audit v66 B-1: caption multi-baris memotong publish foto FB Page,
/// dan baris `output = ...` injeksi bisa membelokkan respons).
/// Token/URL/metode dicek di sini; field teks user TIDAK PERNAH masuk
/// config — ia lewat argumen --form-string (lihat curl_multipart).
fn no_crlf(v: &str, what: &str) -> Result<(), String> {
    if v.contains('\r') || v.contains('\n') {
        return Err(format!("nilai {what} mengandung baris baru — ditolak"));
    }
    Ok(())
}

/// Allowlist MIME gambar untuk publish. Nilai dari frontend tidak
/// pernah diteruskan mentah ke header Content-Type (audit v66 M-3):
/// yang tak dikenal jatuh ke image/jpeg, bukan ke string asing.
fn allow_mime(m: &str) -> &'static str {
    match m {
        "image/png" => "image/png",
        "image/webp" => "image/webp",
        "image/gif" => "image/gif",
        _ => "image/jpeg",
    }
}

/// Argumen --form-string untuk field teks multipart. Beda dengan
/// --form: nilainya literal (caption yang diawali '@' tidak dibaca
/// sebagai file, newline tetap data, bukan sintaksis config).
fn multipart_field_args(text_fields: &[(&str, &str)]) -> Vec<String> {
    let mut out = Vec::new();
    for (k, v) in text_fields {
        out.push("--form-string".to_string());
        out.push(format!("{k}={v}"));
    }
    out
}

/// Panggil API HTTPS lewat curl dengan file konfigurasi sementara
/// (0600, dihapus sesudah dipakai). `json_body` ditulis ke file data
/// terpisah agar tanda kutip JSON tidak pecah di config. `upload_file`
/// = path file biner untuk PUT (dipakai upload media LinkedIn).
/// Varian curl_api dengan header tambahan (dipakai LinkedIn /rest
/// yang wajib LinkedIn-Version; nilai header tervalidasi no_crlf
/// seperti nilai config lainnya).
fn curl_api_h(
    method: &str,
    url: &str,
    token: Option<&str>,
    json_body: Option<&str>,
    upload_file: Option<&std::path::Path>,
    content_type: Option<&str>,
    extra_headers: &[(&str, &str)],
) -> Result<CurlRes, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = std::env::temp_dir();
    let cfg = dir.join(format!("minime-curl-{stamp}.cfg"));
    let body_path = dir.join(format!("minime-curl-{stamp}.body"));
    let mut data_path: Option<std::path::PathBuf> = None;
    // Nilai config divalidasi dulu (lihat no_crlf): URL/metode/token/
    // content-type berasal dari konstanta call-site + token tersimpan,
    // tapi satu newline saja sudah cukup membajak parser config.
    no_crlf(url, "URL")?;
    no_crlf(method, "metode")?;
    if let Some(t) = token {
        no_crlf(t, "token")?;
    }
    if let Some(ct) = content_type {
        no_crlf(ct, "content-type")?;
    }
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
    for (hn, hv) in extra_headers {
        no_crlf(hn, "header")?;
        no_crlf(hv, "header")?;
        cfg_text.push_str(&format!("header = \"{hn}: {hv}\"\n"));
    }
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

/// Wrapper curl_api_h tanpa header tambahan (seluruh call-site lama).
fn curl_api(
    method: &str,
    url: &str,
    token: Option<&str>,
    json_body: Option<&str>,
    upload_file: Option<&std::path::Path>,
    content_type: Option<&str>,
) -> Result<CurlRes, String> {
    curl_api_h(
        method,
        url,
        token,
        json_body,
        upload_file,
        content_type,
        &[],
    )
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
    #[serde(default)]
    pub code_verifier: String,
}

/// Tukar authorization code menjadi token (LinkedIn, X via PKCE +
/// Basic auth, TikTok via client_key di body form).
/// Mengembalikan body JSON mentah dari provider untuk disimpan
/// frontend (access_token, expires_in, refresh_token bila ada).
#[tauri::command]
pub fn social_token_exchange(req: TokenExchangeReq) -> Result<String, String> {
    if req.platform == "x" {
        // X: OAuth 2.0 + PKCE; klien rahasia wajib Basic auth.
        let form = form_encode(&[
            ("grant_type", "authorization_code"),
            ("code", &req.code),
            ("redirect_uri", &req.redirect_uri),
            ("code_verifier", &req.code_verifier),
            ("client_id", &req.client_id),
        ]);
        let r = curl_form_basic(
            "https://api.twitter.com/2/oauth2/token",
            &form,
            &req.client_id,
            &req.client_secret,
        )?;
        if r.status != 200 {
            return Err(format!("Token exchange X gagal (HTTP {})", r.status));
        }
        return Ok(r.body);
    }
    if req.platform == "tiktok" {
        let form = form_encode(&[
            ("client_key", &req.client_id),
            ("client_secret", &req.client_secret),
            ("code", &req.code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", &req.redirect_uri),
        ]);
        let r = curl_form_urlencoded("https://open.tiktokapis.com/v2/oauth/token/", &form)?;
        if r.status != 200 {
            return Err(format!("Token exchange TikTok gagal (HTTP {})", r.status));
        }
        return Ok(r.body);
    }
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
    let r = curl_form_urlencoded("https://www.linkedin.com/oauth/v2/accessToken", &form)?;
    if r.status != 200 {
        return Err(format!("Token exchange gagal (HTTP {})", r.status));
    }
    Ok(r.body)
}

/// POST form-urlencoded lewat file data sementara (0600, dihapus
/// sesudah dipakai) — dipakai token exchange LinkedIn + TikTok.
fn curl_form_urlencoded(url: &str, form: &str) -> Result<CurlRes, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dp = std::env::temp_dir().join(format!("minime-form-{stamp}.txt"));
    std::fs::write(&dp, form).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dp, std::fs::Permissions::from_mode(0o600));
    }
    let r = curl_api(
        "POST",
        url,
        None,
        None,
        Some(&dp),
        Some("application/x-www-form-urlencoded"),
    );
    let _ = std::fs::remove_file(dp);
    r
}

/// POST form-urlencoded dengan Basic auth (client_id:client_secret
/// base64) — dipakai token exchange + refresh X. Secret TIDAK PERNAH
/// di argv/log; hanya di file config sementara 0600.
fn curl_form_basic(
    url: &str,
    form: &str,
    basic_user: &str,
    basic_pass: &str,
) -> Result<CurlRes, String> {
    use base64::Engine as _;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = std::env::temp_dir();
    let cfg = dir.join(format!("minime-xform-{stamp}.cfg"));
    let body_path = dir.join(format!("minime-xform-{stamp}.body"));
    let dp = dir.join(format!("minime-xform-{stamp}.txt"));
    std::fs::write(&dp, form).map_err(|e| e.to_string())?;
    let cred =
        base64::engine::general_purpose::STANDARD.encode(format!("{basic_user}:{basic_pass}"));
    // Base64 tidak mengandung CR/LF menurut konstruksi, tapi satu baris
    // baru di sini akan membajak parser config (lihat no_crlf) — cek
    // defensif, murah, dan gagal tertutup bila asumsi itu pecah.
    no_crlf(&cred, "kredensial")?;
    no_crlf(url, "URL")?;
    let cfg_text = format!(
        "silent = true\nurl = \"{url}\"\nrequest = \"POST\"\noutput = \"{}\"\nwrite-out = \"%{{http_code}}\"\nheader = \"Authorization: Basic {cred}\"\nheader = \"Content-Type: application/x-www-form-urlencoded\"\ndata-binary = \"@{}\"\n",
        body_path.to_string_lossy(),
        dp.to_string_lossy()
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::write(&cfg, &cfg_text).map_err(|e| e.to_string())?;
        let _ = std::fs::set_permissions(&cfg, std::fs::Permissions::from_mode(0o600));
        let _ = std::fs::set_permissions(&dp, std::fs::Permissions::from_mode(0o600));
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
    let _ = std::fs::remove_file(&dp);
    if status == 0 {
        return Err(format!(
            "curl gagal: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(CurlRes { status, body })
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
        let mime = allow_mime(req.image_mime.as_str());
        return Ok(Some((bytes, mime.to_string())));
    }
    if !req.image_b64.is_empty() {
        let bytes =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &req.image_b64)
                .map_err(|e| e.to_string())?;
        let mime = allow_mime(req.image_mime.as_str());
        return Ok(Some((bytes, mime.to_string())));
    }
    Ok(None)
}

/// POST multipart (satu file) — dipakai upload foto Facebook Page dan
/// upload media X. KEAMANAN (audit v66 B-1): field teks TIDAK PERNAH
/// diinterpolasi ke file config — caption batch selalu multi-baris
/// (judul + \n\n + konsep) dan newline di config memotong caption
/// bahkan bisa menginjeksikan opsi curl. Karena itu config hanya
/// memuat nilai aman (token tervalidasi no_crlf), sementara field teks
/// lewat argumen --form-string (literal, newline = data) dan file lewat
/// --form. Token tetap TIDAK PERNAH di argv (hanya di config 0600);
/// caption bukan rahasia (teks postingan yang akan publik).
fn curl_multipart(
    url: &str,
    token: &str,
    text_fields: &[(&str, &str)],
    file_field: &str,
    file_path: &std::path::Path,
    file_mime: &str,
) -> Result<CurlRes, String> {
    no_crlf(url, "URL")?;
    no_crlf(token, "token")?;
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
    let mut cmd = std::process::Command::new("curl");
    cmd.args(["-K", &cfg.to_string_lossy()]);
    cmd.args(multipart_field_args(text_fields));
    cmd.arg("--form");
    cmd.arg(format!(
        "{file_field}=@{};type={}",
        file_path.to_string_lossy(),
        allow_mime(file_mime)
    ));
    let out = cmd.output().map_err(|e| e.to_string())?;
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
/// Cara Postiz: selain /me/accounts, ambil juga owned_pages +
/// client_pages tiap bisnis (menangkap Page yang tidak dicentang
/// di dialog OAuth). Kegagalan lapis bisnis ditoleransi — daftar
/// /me/accounts tetap dipakai. Bentuk kembali {data:[...]} agar
/// frontend lama (pj.data) tidak berubah.
#[tauri::command]
pub fn social_meta_pages(token: String) -> Result<String, String> {
    let mut out: Vec<serde_json::Value> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut push_pages = |v: &serde_json::Value,
                          out: &mut Vec<serde_json::Value>,
                          seen: &mut std::collections::HashSet<String>| {
        if let Some(arr) = v.get("data").and_then(|d| d.as_array()) {
            for pg in arr {
                let id = pg.get("id").and_then(|i| i.as_str()).unwrap_or("");
                let has_token = pg.get("access_token").and_then(|t| t.as_str()).is_some();
                if !id.is_empty() && has_token && seen.insert(id.to_string()) {
                    out.push(pg.clone());
                }
            }
        }
    };
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
    let v: serde_json::Value =
        serde_json::from_str(&r.body).map_err(|_| "Daftar Page tidak terbaca")?;
    push_pages(&v, &mut out, &mut seen);
    if let Ok(biz) = curl_api(
        "GET",
        "https://graph.facebook.com/v25.0/me/businesses?fields=id&limit=100",
        Some(&token),
        None,
        None,
        None,
    ) {
        if biz.status == 200 {
            if let Ok(bv) = serde_json::from_str::<serde_json::Value>(&biz.body) {
                if let Some(arr) = bv.get("data").and_then(|d| d.as_array()) {
                    for b in arr {
                        let bid = b.get("id").and_then(|i| i.as_str()).unwrap_or("");
                        if bid.is_empty() {
                            continue;
                        }
                        for kind in ["owned_pages", "client_pages"] {
                            let url = format!(
                                "https://graph.facebook.com/v25.0/{bid}/{kind}?fields=id,name,access_token&limit=100"
                            );
                            if let Ok(pr) = curl_api("GET", &url, Some(&token), None, None, None) {
                                if pr.status == 200 {
                                    if let Ok(pv) =
                                        serde_json::from_str::<serde_json::Value>(&pr.body)
                                    {
                                        push_pages(&pv, &mut out, &mut seen);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(serde_json::json!({ "data": out }).to_string())
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
/// v62a: + FB Page + Threads teks; v62b: + IG via URL gambar;
/// v64: + X teks/gambar, + TikTok foto via URL publik).
/// Platform lain mengembalikan error jelas — tidak ada sukses palsu.
/// Permintaan refresh generik (LinkedIn / TikTok / YouTube):
/// client_id + client_secret + refresh_token, grant refresh_token.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshReq {
    pub client_id: String,
    pub client_secret: String,
    pub refresh_token: String,
}

#[tauri::command]
pub fn social_linkedin_refresh(req: RefreshReq) -> Result<String, String> {
    let form = form_encode(&[
        ("grant_type", "refresh_token"),
        ("refresh_token", &req.refresh_token),
        ("client_id", &req.client_id),
        ("client_secret", &req.client_secret),
    ]);
    let r = curl_form_urlencoded("https://www.linkedin.com/oauth/v2/accessToken", &form)?;
    if r.status != 200 {
        return Err(format!("Refresh LinkedIn gagal (HTTP {})", r.status));
    }
    Ok(r.body)
}

#[tauri::command]
pub fn social_tiktok_refresh(req: RefreshReq) -> Result<String, String> {
    let form = form_encode(&[
        ("client_key", &req.client_id),
        ("client_secret", &req.client_secret),
        ("grant_type", "refresh_token"),
        ("refresh_token", &req.refresh_token),
    ]);
    let r = curl_form_urlencoded("https://open.tiktokapis.com/v2/oauth/token/", &form)?;
    if r.status != 200 {
        return Err(format!("Refresh TikTok gagal (HTTP {})", r.status));
    }
    Ok(r.body)
}

/// Threads (cara Postiz — BUKAN alur Facebook): authorize di
/// threads.net, tukar code di graph.threads.net, lalu perpanjang
/// dengan th_exchange_token menjadi token 58 hari. Alur lama
/// (dialog Facebook + fb_exchange_token) menghasilkan token
/// Facebook, bukan token Threads — publish ke graph.threads.net
/// dengan token itu pasti 401. Perintah ini memperbaiki connect
/// Threads yang belum pernah terbukti live.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadsExchangeReq {
    pub code: String,
    pub redirect_uri: String,
    pub client_id: String,
    pub client_secret: String,
}

#[tauri::command]
pub fn social_threads_exchange(req: ThreadsExchangeReq) -> Result<String, String> {
    let short_url = format!(
        "https://graph.threads.net/oauth/access_token?client_id={}&redirect_uri={}&grant_type=authorization_code&client_secret={}&code={}",
        req.client_id, req.redirect_uri, req.client_secret, req.code
    );
    let short = curl_api("GET", &short_url, None, None, None, None)?;
    if short.status != 200 {
        return Err(format!("Token Threads gagal (HTTP {})", short.status));
    }
    let short_tok = serde_json::from_str::<serde_json::Value>(&short.body)
        .ok()
        .and_then(|v| {
            v.get("access_token")
                .and_then(|t| t.as_str())
                .map(|t| t.to_string())
        })
        .ok_or("Token Threads tanpa access_token")?;
    let long_url = format!(
        "https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret={}&access_token={}",
        req.client_secret, short_tok
    );
    let long = curl_api("GET", &long_url, None, None, None, None)?;
    if long.status != 200 {
        return Err(format!(
            "Token jangka panjang Threads gagal (HTTP {})",
            long.status
        ));
    }
    Ok(long.body)
}

#[tauri::command]
pub fn social_threads_me(token: String) -> Result<String, String> {
    let r = curl_api(
        "GET",
        "https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url",
        Some(&token),
        None,
        None,
        None,
    )?;
    if r.status != 200 {
        return Err(format!("Profil Threads gagal (HTTP {})", r.status));
    }
    Ok(r.body)
}

/// Refresh Threads (cara Postiz): token baru disimpan sebagai
/// access DAN refresh (rotasi 58 hari) di sisi frontend.
#[tauri::command]
pub fn social_threads_refresh(token: String) -> Result<String, String> {
    let url = format!(
        "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token={token}"
    );
    let r = curl_api("GET", &url, None, None, None, None)?;
    if r.status != 200 {
        return Err(format!("Refresh Threads gagal (HTTP {})", r.status));
    }
    Ok(r.body)
}

/// YouTube (cara Postiz): OAuth Google (scope youtube.upload),
/// picker channel, lalu upload video resumable. Teks/gambar saja
/// ditolak jujur — API YouTube tidak punya endpoint Community post.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeExchangeReq {
    pub code: String,
    pub redirect_uri: String,
    pub client_id: String,
    pub client_secret: String,
}

#[tauri::command]
pub fn social_youtube_exchange(req: YoutubeExchangeReq) -> Result<String, String> {
    let form = form_encode(&[
        ("code", &req.code),
        ("client_id", &req.client_id),
        ("client_secret", &req.client_secret),
        ("redirect_uri", &req.redirect_uri),
        ("grant_type", "authorization_code"),
    ]);
    let r = curl_form_urlencoded("https://oauth2.googleapis.com/token", &form)?;
    if r.status != 200 {
        return Err(format!("Token YouTube gagal (HTTP {})", r.status));
    }
    Ok(r.body)
}

#[tauri::command]
pub fn social_youtube_channels(token: String) -> Result<String, String> {
    let r = curl_api(
        "GET",
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        Some(&token),
        None,
        None,
        None,
    )?;
    if r.status != 200 {
        return Err(format!("Daftar channel YouTube gagal (HTTP {})", r.status));
    }
    Ok(r.body)
}

#[tauri::command]
pub fn social_youtube_refresh(req: RefreshReq) -> Result<String, String> {
    let form = form_encode(&[
        ("client_id", &req.client_id),
        ("client_secret", &req.client_secret),
        ("refresh_token", &req.refresh_token),
        ("grant_type", "refresh_token"),
    ]);
    let r = curl_form_urlencoded("https://oauth2.googleapis.com/token", &form)?;
    if r.status != 200 {
        return Err(format!("Refresh YouTube gagal (HTTP {})", r.status));
    }
    Ok(r.body)
}

#[tauri::command]
pub fn social_publish(req: PublishReq) -> Result<String, String> {
    match req.platform.as_str() {
        "linkedin" => linkedin_publish(&req),
        "facebook_page" => fb_page_publish(&req),
        "threads" => threads_publish(&req),
        "instagram" => ig_publish(&req),
        "x" => x_publish(&req),
        "tiktok" => tiktok_publish(&req),
        "youtube" => youtube_publish(&req),
        other => Err(format!("Publish {other} belum dibangun")),
    }
}

/// POST JSON dengan tangkapan header respons (YouTube: URI sesi
/// resumable ada di header `location`, bukan body). Pola config-file
/// yang sama dengan curl_api (0600, no_crlf, token tidak di argv).
fn curl_post_capture_headers(
    url: &str,
    token: &str,
    body: &str,
    extra_headers: &[(&str, &str)],
) -> Result<(u16, String, String), String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = std::env::temp_dir();
    let cfg = dir.join(format!("minime-yt-{stamp}.cfg"));
    let body_path = dir.join(format!("minime-yt-{stamp}.body"));
    let header_path = dir.join(format!("minime-yt-{stamp}.hdr"));
    let json_path = dir.join(format!("minime-yt-{stamp}.json"));
    no_crlf(url, "URL")?;
    no_crlf(token, "token")?;
    let mut cfg_text = String::new();
    cfg_text.push_str("silent = true\n");
    cfg_text.push_str(&format!("url = \"{url}\"\n"));
    cfg_text.push_str("request = \"POST\"\n");
    cfg_text.push_str(&format!("output = \"{}\"\n", body_path.to_string_lossy()));
    cfg_text.push_str(&format!(
        "dump-header = \"{}\"\n",
        header_path.to_string_lossy()
    ));
    cfg_text.push_str("write-out = \"%{http_code}\"\n");
    cfg_text.push_str(&format!("header = \"Authorization: Bearer {token}\"\n"));
    cfg_text.push_str("header = \"Content-Type: application/json\"\n");
    for (hn, hv) in extra_headers {
        no_crlf(hn, "header")?;
        no_crlf(hv, "header")?;
        cfg_text.push_str(&format!("header = \"{hn}: {hv}\"\n"));
    }
    cfg_text.push_str(&format!(
        "data-binary = \"@{}\"\n",
        json_path.to_string_lossy()
    ));
    std::fs::write(&json_path, body).map_err(|e| e.to_string())?;
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
    let resp_body = std::fs::read_to_string(&body_path).unwrap_or_default();
    let headers = std::fs::read_to_string(&header_path).unwrap_or_default();
    let _ = std::fs::remove_file(&cfg);
    let _ = std::fs::remove_file(&body_path);
    let _ = std::fs::remove_file(&header_path);
    let _ = std::fs::remove_file(&json_path);
    if status == 0 {
        return Err(format!(
            "curl gagal: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    // Nilai header TIDAK dilowercase (URI sesi case-sensitive).
    Ok((status, resp_body, header_value(&headers, "location")))
}

/// PUT satu chunk video ke URI sesi resumable; kembalikan
/// (status, body, header respons) agar 308 bisa dibaca Range-nya.
fn curl_put_chunk(
    url: &str,
    token: &str,
    chunk_file: &std::path::Path,
    content_range: &str,
) -> Result<(u16, String, String), String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = std::env::temp_dir();
    let cfg = dir.join(format!("minime-ytc-{stamp}.cfg"));
    let body_path = dir.join(format!("minime-ytc-{stamp}.body"));
    let header_path = dir.join(format!("minime-ytc-{stamp}.hdr"));
    no_crlf(url, "URL")?;
    no_crlf(token, "token")?;
    no_crlf(content_range, "range")?;
    let mut cfg_text = String::new();
    cfg_text.push_str("silent = true\n");
    cfg_text.push_str(&format!("url = \"{url}\"\n"));
    cfg_text.push_str("request = \"PUT\"\n");
    cfg_text.push_str(&format!("output = \"{}\"\n", body_path.to_string_lossy()));
    cfg_text.push_str(&format!(
        "dump-header = \"{}\"\n",
        header_path.to_string_lossy()
    ));
    cfg_text.push_str("write-out = \"%{http_code}\"\n");
    cfg_text.push_str(&format!("header = \"Authorization: Bearer {token}\"\n"));
    cfg_text.push_str("header = \"Content-Type: video/mp4\"\n");
    cfg_text.push_str(&format!("header = \"Content-Range: {content_range}\"\n"));
    cfg_text.push_str(&format!(
        "data-binary = \"@{}\"\n",
        chunk_file.to_string_lossy()
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
    let resp_body = std::fs::read_to_string(&body_path).unwrap_or_default();
    let headers = std::fs::read_to_string(&header_path).unwrap_or_default();
    let _ = std::fs::remove_file(&cfg);
    let _ = std::fs::remove_file(&body_path);
    let _ = std::fs::remove_file(&header_path);
    if status == 0 {
        return Err(format!(
            "curl gagal: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok((status, resp_body, headers))
}

/// Nilai satu header respons (nama case-insensitive, nilai
/// apa adanya — URI sesi YouTube case-sensitive).
fn header_value(headers: &str, name: &str) -> String {
    for line in headers.lines() {
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case(name) {
                return v.trim().to_string();
            }
        }
    }
    String::new()
}

/// Ujung range dari header `Range: bytes=A-B` (balasan 308
/// resumable upload) — None bila tidak ada / tidak terbaca.
fn range_end(headers: &str) -> Option<u64> {
    let v = header_value(headers, "range");
    let rest = v.trim().trim_start_matches("bytes=");
    let (_, e) = rest.split_once('-')?;
    e.trim().parse::<u64>().ok()
}

/// Byte video untuk YouTube: file dari ~/minime-images/ (antrean)
/// atau base64 (terbit langsung). MIME mentah dari pemanggil —
/// BUKAN allow_mime (yang memetakan video ke image/jpeg).
fn youtube_bytes(req: &PublishReq) -> Result<(Vec<u8>, String), String> {
    if !req.image_file.is_empty() {
        let name = crate::image::safe_name(&req.image_file).ok_or("nama file video tidak valid")?;
        let dir = crate::image::images_dir()?;
        let bytes = std::fs::read(dir.join(&name)).map_err(|_| "file video tidak ditemukan")?;
        let mime = if req.image_mime.is_empty() {
            "video/mp4".to_string()
        } else {
            req.image_mime.clone()
        };
        return Ok((bytes, mime));
    }
    if !req.image_b64.is_empty() {
        let bytes =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &req.image_b64)
                .map_err(|e| e.to_string())?;
        let mime = if req.image_mime.is_empty() {
            "video/mp4".to_string()
        } else {
            req.image_mime.clone()
        };
        return Ok((bytes, mime));
    }
    Err("YouTube butuh file video MP4".into())
}

fn youtube_publish(req: &PublishReq) -> Result<String, String> {
    let (bytes, mime) = youtube_bytes(req)?;
    if mime != "video/mp4" {
        return Err("YouTube v71 hanya menerima video MP4".into());
    }
    let total = bytes.len() as u64;
    if total == 0 {
        return Err("File video kosong".into());
    }
    let title_raw: String = req
        .text
        .lines()
        .next()
        .unwrap_or("")
        .chars()
        .take(100)
        .collect();
    let title = if title_raw.trim().is_empty() {
        "MiniMe".to_string()
    } else {
        title_raw
    };
    let desc: String = req.text.chars().take(5000).collect();
    let meta = serde_json::json!({
        "snippet": { "title": title, "description": desc },
        "status": { "privacyStatus": "public" },
    })
    .to_string();
    // (1) Sesi resumable — URI ada di header location.
    let (status, _body, location) = curl_post_capture_headers(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        &req.access_token,
        &meta,
        &[
            ("X-Upload-Content-Type", "video/mp4"),
            ("X-Upload-Content-Length", &total.to_string()),
        ],
    )?;
    if status != 200 && status != 201 {
        return Err(format!("Sesi upload YouTube gagal (HTTP {status})"));
    }
    if location.is_empty() {
        return Err("Sesi upload YouTube tanpa URI".into());
    }
    // (2) Chunk 8 MB (cara Postiz); 308 = lanjut dari offset Range.
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = std::env::temp_dir().join(format!("minime-yt-{stamp}.bin"));
    let result = (|| -> Result<String, String> {
        let mut offset: u64 = 0;
        let mut retries = 0;
        while offset < total {
            let end = (offset + 8 * 1024 * 1024).min(total) - 1;
            std::fs::write(&tmp, &bytes[offset as usize..=end as usize])
                .map_err(|e| e.to_string())?;
            let range = format!("bytes {offset}-{end}/{total}");
            let (st, body, headers) = curl_put_chunk(&location, &req.access_token, &tmp, &range)?;
            if st == 200 || st == 201 {
                let v: serde_json::Value = serde_json::from_str(&body)
                    .map_err(|_| "Respons upload YouTube tidak terbaca")?;
                let id = v
                    .get("id")
                    .and_then(|i| i.as_str())
                    .ok_or("Upload YouTube tanpa id video")?;
                return Ok(id.to_string());
            }
            if st == 308 {
                let mut next = offset;
                if let Some(e2) = range_end(&headers) {
                    next = e2 + 1;
                }
                if next == offset {
                    retries += 1;
                    if retries > 3 {
                        return Err(
                            "Upload YouTube macet (server tidak mengonfirmasi progres)".into()
                        );
                    }
                } else {
                    retries = 0;
                    offset = next;
                }
                continue;
            }
            if st == 401 {
                return Err("Token YouTube kedaluwarsa saat upload (HTTP 401)".into());
            }
            if st == 404 || st == 410 {
                return Err("Sesi upload YouTube kedaluwarsa (HTTP 404/410) — ulangi".into());
            }
            if st == 429 || (500..600).contains(&st) {
                retries += 1;
                if retries > 3 {
                    return Err(format!("Upload YouTube gagal (HTTP {st})"));
                }
                std::thread::sleep(Duration::from_secs(2));
                continue;
            }
            return Err(format!("Upload YouTube gagal (HTTP {st})"));
        }
        Err("Upload YouTube selesai tanpa id video".into())
    })();
    let _ = std::fs::remove_file(&tmp);
    result.map(|_| "ok".into())
}

fn linkedin_publish(req: &PublishReq) -> Result<String, String> {
    // Posts API modern (cara Postiz) — ugcPosts legacy ditinggalkan.
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
    let img = resolve_image(req)?;
    if img.is_none() {
        let body = serde_json::json!({
            "author": author,
            "commentary": req.text,
            "visibility": "PUBLIC",
            "distribution": { "feedDistribution": "MAIN_FEED" },
            "lifecycleState": "PUBLISHED",
        })
        .to_string();
        let r = curl_api_h(
            "POST",
            "https://api.linkedin.com/rest/posts",
            Some(&req.access_token),
            Some(&body),
            None,
            Some("application/json"),
            &[("LinkedIn-Version", "202601")],
        )?;
        if r.status != 201 && r.status != 200 {
            return Err(format!("Publish LinkedIn gagal (HTTP {})", r.status));
        }
        return Ok("ok".into());
    }
    // Video ditolak jujur: alur lama mengirim video sebagai resep
    // feedshare-image (pasti ditolak LinkedIn); upload video chunked
    // adalah pekerjaan lanjutan, bukan sukses palsu.
    if req.image_mime.starts_with("video/") {
        return Err("LinkedIn video belum didukung di v71 (hanya teks + gambar)".into());
    }
    let (bytes, mime) = img.unwrap();
    // Gambar: initializeUpload -> PUT biner -> rest/posts (content.media).
    let init_body = serde_json::json!({ "owner": author }).to_string();
    let init = curl_api_h(
        "POST",
        "https://api.linkedin.com/rest/images?action=initializeUpload",
        Some(&req.access_token),
        Some(&init_body),
        None,
        Some("application/json"),
        &[("LinkedIn-Version", "202601")],
    )?;
    if init.status != 200 && init.status != 201 {
        return Err(format!("Init upload LinkedIn gagal (HTTP {})", init.status));
    }
    let init_v: serde_json::Value =
        serde_json::from_str(&init.body).map_err(|_| "Respons initializeUpload tidak terbaca")?;
    let upload_url = init_v
        .get("value")
        .and_then(|v| v.get("uploadUrl"))
        .and_then(|u| u.as_str())
        .ok_or("initializeUpload tanpa uploadUrl")?
        .to_string();
    let image_urn = init_v
        .get("value")
        .and_then(|v| v.get("image"))
        .and_then(|u| u.as_str())
        .ok_or("initializeUpload tanpa image URN")?
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
    // Catatan Postiz: gambar personal tidak bisa dipoll statusnya
    // (token w_member_social tidak bisa membaca kembali asetnya) —
    // Postiz menunggu grace period; kami posting langsung seperti
    // alur lama (PUT 201 = siap).
    let body = serde_json::json!({
        "author": author,
        "commentary": req.text,
        "visibility": "PUBLIC",
        "distribution": { "feedDistribution": "MAIN_FEED" },
        "lifecycleState": "PUBLISHED",
        "content": { "media": { "id": image_urn } },
    })
    .to_string();
    let r = curl_api_h(
        "POST",
        "https://api.linkedin.com/rest/posts",
        Some(&req.access_token),
        Some(&body),
        None,
        Some("application/json"),
        &[("LinkedIn-Version", "202601")],
    )?;
    if r.status != 201 && r.status != 200 {
        return Err(format!("Publish LinkedIn gagal (HTTP {})", r.status));
    }
    Ok("ok".into())
}

/// Profil X (users/me) — dipakai untuk label channel.
#[tauri::command]
pub fn social_x_me(token: String) -> Result<String, String> {
    let r = curl_api(
        "GET",
        "https://api.twitter.com/2/users/me",
        Some(&token),
        None,
        None,
        None,
    )?;
    if r.status != 200 {
        return Err(format!("Gagal membaca profil X (HTTP {})", r.status));
    }
    Ok(r.body)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XRefreshReq {
    pub refresh_token: String,
    pub client_id: String,
    pub client_secret: String,
}

/// Refresh token X (2 jam) — refresh_token BEROTASI: respons membawa
/// refresh_token BARU yang harus disimpan frontend (yang lama langsung
/// tidak valid). Dipakai scheduler sebelum publish bila token kedaluwarsa.
#[tauri::command]
pub fn social_x_refresh(req: XRefreshReq) -> Result<String, String> {
    let form = form_encode(&[
        ("grant_type", "refresh_token"),
        ("refresh_token", &req.refresh_token),
        ("client_id", &req.client_id),
    ]);
    let r = curl_form_basic(
        "https://api.twitter.com/2/oauth2/token",
        &form,
        &req.client_id,
        &req.client_secret,
    )?;
    if r.status != 200 {
        return Err(format!("Refresh token X gagal (HTTP {})", r.status));
    }
    Ok(r.body)
}

/// Ambil media_id dari respons upload media X v2 — id bisa string
/// maupun angka (Snowflake 64-bit; angka JANGAN diparse ke float).
fn x_media_id(body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    let id = v.get("id")?;
    if let Some(s) = id.as_str() {
        return Some(s.to_string());
    }
    if let Some(n) = id.as_u64() {
        return Some(n.to_string());
    }
    None
}

/// Terbitkan ke X: teks saja, atau teks + 1 gambar (upload media v2
/// multipart, lalu POST /2/tweets dengan media_ids). Batas X: 280
/// karakter — dicek di sini supaya pesannya jelas, bukan 400 mentah.
fn x_publish(req: &PublishReq) -> Result<String, String> {
    if req.text.chars().count() > 280 {
        return Err("Teks X maksimal 280 karakter".into());
    }
    let mut media_ids: Vec<String> = Vec::new();
    let img = resolve_image(req)?;
    if let Some((bytes, mime)) = img {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let tmp = std::env::temp_dir().join(format!("minime-x-{stamp}.bin"));
        std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
        let r = curl_multipart(
            "https://api.x.com/2/media/upload",
            &req.access_token,
            &[("media_category", "tweet_image"), ("media_type", &mime)],
            "media",
            &tmp,
            &mime,
        );
        let _ = std::fs::remove_file(&tmp);
        let r = r?;
        if r.status != 200 && r.status != 201 {
            return Err(format!("Upload media X gagal (HTTP {})", r.status));
        }
        let mid = x_media_id(&r.body).ok_or("Upload media X tanpa id")?;
        media_ids.push(mid);
    }
    let mut body = serde_json::json!({ "text": req.text });
    if !media_ids.is_empty() {
        body["media"] = serde_json::json!({ "media_ids": media_ids });
    }
    let r = curl_api(
        "POST",
        "https://api.twitter.com/2/tweets",
        Some(&req.access_token),
        Some(&body.to_string()),
        None,
        Some("application/json"),
    )?;
    if r.status != 200 && r.status != 201 {
        return Err(format!("Publish X gagal (HTTP {})", r.status));
    }
    Ok("ok".into())
}

/// Judul TikTok: maksimal 90 karakter — deskripsi membawa teks penuh
/// sehingga tidak ada isi yang hilang karena pemotongan judul.
fn tiktok_title(text: &str) -> String {
    text.chars().take(90).collect()
}

/// Terbitkan foto ke TikTok (Content Posting API, DIRECT_POST):
/// HANYA via URL gambar publik (PULL_FROM_URL) — file lokal ditolak
/// tegas seperti pola IG/Threads. TikTok hanya menerima JPEG/WEBP
/// untuk foto (PNG ditolak). Judul = 90 karakter pertama teks,
/// deskripsi = teks penuh, privasi PUBLIC_TO_EVERYONE. Status
/// di-poll sampai PUBLISH_COMPLETE (maks ~30 detik); bila masih
/// diproses, kembalikan error jelas supaya antrean bisa retry.
/// CATATAN JUJUR: klien yang belum lolos audit TikTok hanya tampil
/// privat sampai audit selesai — itu batas dari TikTok, bukan bug.
fn tiktok_publish(req: &PublishReq) -> Result<String, String> {
    if !req.image_b64.is_empty() || !req.image_file.is_empty() {
        return Err("TikTok foto butuh URL gambar publik (bukan file lokal)".into());
    }
    if req.image_url.is_empty() {
        return Err("TikTok butuh minimal 1 URL gambar publik".into());
    }
    let low = req.image_url.to_lowercase();
    let clean = low.split(['?', '#']).next().unwrap_or("");
    if clean.ends_with(".png") {
        return Err("TikTok foto hanya menerima JPEG/WEBP (bukan PNG)".into());
    }
    let body = serde_json::json!({
        "post_info": {
            "title": tiktok_title(&req.text),
            "description": req.text,
            "privacy_level": "PUBLIC_TO_EVERYONE",
            "disable_comment": false,
        },
        "source_info": {
            "source": "PULL_FROM_URL",
            "photo_images": [req.image_url],
            "photo_cover_index": 0,
        },
        "post_mode": "DIRECT_POST",
        "media_type": "PHOTO",
    });
    let r = curl_api(
        "POST",
        "https://open.tiktokapis.com/v2/post/publish/content/init/",
        Some(&req.access_token),
        Some(&body.to_string()),
        None,
        Some("application/json"),
    )?;
    if r.status != 200 {
        return Err(format!("Init foto TikTok gagal (HTTP {})", r.status));
    }
    let v: serde_json::Value =
        serde_json::from_str(&r.body).map_err(|_| "Respons init TikTok tidak terbaca")?;
    let code_ok = v
        .get("error")
        .and_then(|e| e.get("code"))
        .and_then(|c| c.as_str())
        == Some("ok");
    let publish_id = v
        .get("data")
        .and_then(|d| d.get("publish_id"))
        .and_then(|p| p.as_str())
        .map(|p| p.to_string());
    let (code_ok, publish_id) = match (code_ok, publish_id) {
        (true, Some(p)) => (true, p),
        _ => (false, String::new()),
    };
    if !code_ok {
        return Err(format!(
            "Init foto TikTok ditolak: {}",
            r.body.chars().take(200).collect::<String>()
        ));
    }
    let mut last_status = String::new();
    for _ in 0..10 {
        let sb = serde_json::json!({ "publish_id": publish_id }).to_string();
        let sr = curl_api(
            "POST",
            "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
            Some(&req.access_token),
            Some(&sb),
            None,
            Some("application/json"),
        )?;
        if sr.status != 200 {
            return Err(format!("Status TikTok gagal (HTTP {})", sr.status));
        }
        let sv: serde_json::Value =
            serde_json::from_str(&sr.body).map_err(|_| "Respons status TikTok tidak terbaca")?;
        let st = sv
            .get("data")
            .and_then(|d| d.get("status"))
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string();
        last_status = st.clone();
        if st == "PUBLISH_COMPLETE" {
            return Ok("ok".into());
        }
        if st.to_uppercase().contains("FAIL") {
            return Err(format!("Publish TikTok gagal (status {st})"));
        }
        std::thread::sleep(std::time::Duration::from_secs(3));
    }
    Err(format!(
        "TikTok masih memproses (status terakhir: {last_status}) — coba Terbitkan sekarang lagi"
    ))
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

    // Audit v66 B-1/M-3: regresi injeksi config curl.
    #[test]
    fn multipart_args_keep_newlines_as_data() {
        // Caption batch selalu multi-baris; argumen --form-string harus
        // membawa newline utuh sebagai SATU nilai (bukan dua baris
        // config, bukan opsi curl baru).
        let args = multipart_field_args(&[("caption", "Judul\n\nKonsep baris dua")]);
        assert_eq!(args.len(), 2);
        assert_eq!(args[0], "--form-string");
        assert_eq!(args[1], "caption=Judul\n\nKonsep baris dua");
        // Caption diawali '@' tidak boleh dibaca sebagai file.
        let args = multipart_field_args(&[("caption", "@bukan-file")]);
        assert_eq!(args[1], "caption=@bukan-file");
    }

    #[test]
    fn crlf_rejected_and_mime_allowlisted() {
        assert!(no_crlf("token-biasa", "token").is_ok());
        assert!(no_crlf("baris\noutput = \"/tmp/x\"", "token").is_err());
        assert!(no_crlf("baris\r\nlain", "token").is_err());
        assert_eq!(allow_mime("image/png"), "image/png");
        assert_eq!(allow_mime("image/webp"), "image/webp");
        assert_eq!(allow_mime("image/gif"), "image/gif");
        // Tak dikenal / ber-newline -> fallback aman, bukan string asing.
        assert_eq!(allow_mime(""), "image/jpeg");
        assert_eq!(allow_mime("image/jpeg\noutput = \"/tmp/x\""), "image/jpeg");
    }

    #[test]
    fn header_value_keeps_case_and_range_end() {
        let h = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nLocation: https://Upload.Example/Session/AbC123\r\n\r\n";
        assert_eq!(
            header_value(h, "location"),
            "https://Upload.Example/Session/AbC123"
        );
        assert_eq!(
            header_value(h, "LOCATION"),
            "https://Upload.Example/Session/AbC123"
        );
        assert_eq!(header_value(h, "x-tidak-ada"), "");
        let h308 = "HTTP/1.1 308 Resume Incomplete\r\nRange: bytes=0-8388607\r\n\r\n";
        assert_eq!(range_end(h308), Some(8388607));
        assert_eq!(range_end("HTTP/1.1 308\r\n\r\n"), None);
        assert_eq!(range_end("HTTP/1.1 308\r\nRange: bytes=0-abc\r\n"), None);
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
    fn x_media_id_string_and_number() {
        assert_eq!(
            x_media_id("{\"id\": \"1234567890123456789\"}"),
            Some("1234567890123456789".to_string())
        );
        assert_eq!(
            x_media_id("{\"id\": 1234567890123456789}"),
            Some("1234567890123456789".to_string())
        );
        assert_eq!(x_media_id("{\"nope\": 1}"), None);
    }

    #[test]
    fn tiktok_title_caps_at_90_chars() {
        let long = "a".repeat(200);
        assert_eq!(tiktok_title(&long).chars().count(), 90);
        assert_eq!(tiktok_title("pendek"), "pendek");
    }

    #[test]
    fn form_encode_escapes() {
        let f = form_encode(&[("redirect_uri", "http://127.0.0.1:4317/callback")]);
        assert_eq!(f, "redirect_uri=http%3A%2F%2F127.0.0.1%3A4317%2Fcallback");
    }
}
