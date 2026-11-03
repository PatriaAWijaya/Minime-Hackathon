//! Browser riset teks (v206): cari + buka halaman lewat curl, tanpa
//! dependensi HTTP baru — konsisten dengan social.rs yang memakai curl.
//! Dipakai agen Riset untuk riset live: hasil cari + teks halaman
//! dikembalikan ke model sebagai konteks, lengkap dengan URL sumber
//! sehingga laporan bisa mengutip halaman yang benar-benar dibuka.
//! BUKAN browser visual: agen membaca teks halaman, bukan tampilannya.
//! Batas jujur: mesin cari = DuckDuckGo HTML (tanpa kunci); halaman
//! yang butuh login dilaporkan gagal, bukan dikarang isinya.

use serde::Serialize;
use std::process::Command;

const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 MiniMe-Research/1.0";
const MAX_SEARCH_RESULTS: usize = 10;
const MAX_FETCH_CHARS: usize = 12000;

#[derive(Serialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[derive(Serialize)]
pub struct SearchOut {
    pub results: Vec<SearchResult>,
}

#[derive(Serialize)]
pub struct FetchOut {
    pub url: String,
    pub title: String,
    pub text: String,
}

fn curl_path() -> Result<std::path::PathBuf, String> {
    crate::video::find_tool("curl").ok_or_else(|| "curl tidak ditemukan di PATH".to_string())
}

/// GET lewat curl; mengembalikan (kode HTTP, body). URL lewat argv
/// (bukan shell) sehingga aman dari injeksi; tidak ada secret di sini.
fn curl_get(url: &str, max_time: u64) -> Result<(u16, String), String> {
    let path = curl_path()?;
    let out = Command::new(path)
        .args([
            "-sS",
            "-L",
            "--max-time",
            &max_time.to_string(),
            "-A",
            UA,
            "-w",
            "\n%{http_code}",
            url,
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
    let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
    match stdout.rfind('\n') {
        Some(i) => {
            let code = stdout[i + 1..].trim().parse::<u16>().unwrap_or(0);
            Ok((code, stdout[..i].to_string()))
        }
        None => Ok((0, stdout)),
    }
}

/// Percent-encode untuk nilai query (spasi -> +).
fn url_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Decode %XX (+ -> spasi, benar untuk nilai query seperti uddg).
fn pct_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
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
    String::from_utf8_lossy(&out).into_owned()
}

/// Host dari URL (tanpa userinfo/port, huruf kecil). None bila skema
/// bukan http(s) — dipakai gerbang host sebelum fetch.
fn host_of(url: &str) -> Option<String> {
    let rest = url
        .strip_prefix("http://")
        .or_else(|| url.strip_prefix("https://"))?;
    let hostport = rest.split(['/', '?', '#']).next().unwrap_or("");
    let hostport = hostport.rsplit('@').next().unwrap_or(hostport);
    let host = hostport.split(':').next().unwrap_or(hostport);
    Some(
        host.trim_matches(|c| c == '[' || c == ']')
            .to_ascii_lowercase(),
    )
}

/// Host lokal/privat yang tidak boleh dibuka browser riset (mencegah
/// fetch menyentuh layanan lokal mesin user).
fn host_blocked(host: &str) -> bool {
    if host == "localhost" || host == "127.0.0.1" || host == "::1" {
        return true;
    }
    if host.starts_with("10.") || host.starts_with("192.168.") {
        return true;
    }
    if let Some(rest) = host.strip_prefix("172.") {
        if let Some(oct) = rest.split('.').next().and_then(|o| o.parse::<u8>().ok()) {
            if (16..=31).contains(&oct) {
                return true;
            }
        }
    }
    false
}

/// Ambil nilai atribut href="..." dari potongan tag (maks 400 karakter).
fn attr_href(tag: &str) -> Option<String> {
    let rel = tag.find("href=\"")?;
    let start = rel + 6;
    let end = tag[start..].find('"')? + start;
    Some(tag[start..end].to_string())
}

/// Normalisasi href hasil DuckDuckGo: uddg=... -> URL asli (decode),
/// //host/path -> https://host/path, sisanya apa adanya.
fn normalize_href(href: &str) -> String {
    if let Some(pos) = href.find("uddg=") {
        let rest = &href[pos + 5..];
        let end = rest.find('&').unwrap_or(rest.len());
        return pct_decode(&rest[..end]);
    }
    if let Some(stripped) = href.strip_prefix("//") {
        return format!("https://{stripped}");
    }
    href.to_string()
}

/// Parse halaman hasil html.duckduckgo.com: anchor result__a (judul +
/// href) + snippet result__snippet sesudahnya. Toleran terhadap urutan
/// atribut (href dicari di 400 karakter sesudah nama kelas).
fn parse_ddg_html(html: &str) -> Vec<SearchResult> {
    let mut results: Vec<SearchResult> = Vec::new();
    let mut rest = html;
    while results.len() < MAX_SEARCH_RESULTS {
        let Some(a_pos) = rest.find("result__a") else {
            break;
        };
        let chunk = &rest[a_pos..];
        let window = &chunk[..chunk.len().min(400)];
        let Some(href_raw) = attr_href(window) else {
            rest = &rest[a_pos + 1..];
            continue;
        };
        // Judul = teks antara '>' penutup tag <a ...> dan </a>.
        let Some(gt) = chunk.find('>') else {
            break;
        };
        let Some(end) = chunk[gt + 1..].find("</a>") else {
            break;
        };
        let title = strip_tags(&chunk[gt + 1..gt + 1 + end]);
        let title = title.trim().to_string();
        if title.is_empty() {
            rest = &chunk[gt + 1 + end + 4..];
            continue;
        }
        // Snippet: blok result__snippet pertama sesudah judul.
        let mut snippet = String::new();
        let after = &chunk[gt + 1 + end + 4..];
        if let Some(s_pos) = after.find("result__snippet") {
            let s_chunk = &after[s_pos..];
            if let Some(s_gt) = s_chunk.find('>') {
                if let Some(s_end) = s_chunk[s_gt + 1..].find("</a>") {
                    snippet = strip_tags(&s_chunk[s_gt + 1..s_gt + 1 + s_end])
                        .trim()
                        .to_string();
                }
            }
        }
        results.push(SearchResult {
            title,
            url: normalize_href(&href_raw),
            snippet,
        });
        rest = after;
    }
    results
}

/// Hapus semua tag <...> (isi di antaranya dipertahankan).
fn strip_tags(s: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ => {
                if !in_tag {
                    out.push(c);
                }
            }
        }
    }
    out
}

/// Decode entitas HTML umum + numerik desimal/heksadesimal.
fn decode_entities(s: &str) -> String {
    let mut out = s
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");
    // Entitas numerik &#123; dan &#x7B; (satu pass, tanpa regex).
    while let Some(pos) = out.find("&#") {
        let rest = &out[pos + 2..];
        let (digits, hex) =
            if let Some(hexpart) = rest.strip_prefix('x').or_else(|| rest.strip_prefix('X')) {
                (hexpart, true)
            } else {
                (rest, false)
            };
        let end = digits.find(';').unwrap_or_else(|| {
            digits
                .find(|c: char| !(c.is_ascii_alphanumeric()))
                .unwrap_or(digits.len())
        });
        let num = &digits[..end];
        let parsed = if hex {
            u32::from_str_radix(num, 16).ok()
        } else {
            num.parse::<u32>().ok()
        };
        let Some(code) = parsed.and_then(char::from_u32) else {
            break;
        };
        let semi = if digits.len() > end && digits.as_bytes().get(end) == Some(&b';') {
            1
        } else {
            0
        };
        out.replace_range(pos..pos + 2 + end + semi, &code.to_string());
    }
    out
}

/// Hapus blok <script...>...</script> dan <style...>...</style>
/// (case-insensitive pada nama tag, isi di antaranya dibuang).
fn drop_block(html: &str, tag: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let open_pat = format!("<{tag}");
    let close_pat = format!("</{tag}>");
    let mut out = String::new();
    let mut rest = html;
    let mut rest_lower = lower.as_str();
    while let Some(pos) = rest_lower.find(&open_pat) {
        out.push_str(&rest[..pos]);
        let after_open = &rest_lower[pos..];
        let Some(gt) = after_open.find('>') else {
            break;
        };
        let content_start = pos + gt + 1;
        match rest_lower[content_start..].find(&close_pat) {
            Some(end) => {
                let skip = content_start + end + close_pat.len();
                rest = &rest[skip..];
                rest_lower = &rest_lower[skip..];
            }
            None => {
                rest = "";
                break;
            }
        }
    }
    out.push_str(rest);
    out
}

/// (judul, teks bersih) dari HTML mentah, dipotong MAX_FETCH_CHARS.
fn clean_text(html: &str) -> (String, String) {
    let lower = html.to_ascii_lowercase();
    let title = match (lower.find("<title>"), lower.find("</title>")) {
        (Some(a), Some(b)) if b > a => strip_tags(&html[a + 7..b]).trim().to_string(),
        _ => String::new(),
    };
    let no_script = drop_block(html, "script");
    let no_style = drop_block(&no_script, "style");
    let stripped = strip_tags(&no_style);
    let decoded = decode_entities(&stripped);
    let collapsed = decoded.split_whitespace().collect::<Vec<_>>().join(" ");
    let text: String = collapsed.chars().take(MAX_FETCH_CHARS).collect();
    (title, text)
}

#[tauri::command]
pub fn research_search(query: String) -> Result<SearchOut, String> {
    let q = query.trim();
    if q.is_empty() {
        return Err("kata kunci kosong".to_string());
    }
    if q.len() > 500 {
        return Err("kata kunci terlalu panjang".to_string());
    }
    let url = format!("https://html.duckduckgo.com/html/?q={}", url_encode(q));
    let (code, body) = curl_get(&url, 25)?;
    if code != 200 {
        return Err(format!("mesin cari menjawab HTTP {code}"));
    }
    let results = parse_ddg_html(&body);
    if results.is_empty() {
        return Err(
            "mesin cari tidak mengembalikan hasil (mungkin diblokir) — coba lagi".to_string(),
        );
    }
    Ok(SearchOut { results })
}

#[tauri::command]
pub fn research_fetch(url: String) -> Result<FetchOut, String> {
    let u = url.trim();
    if !(u.starts_with("http://") || u.starts_with("https://")) {
        return Err("hanya URL http(s) yang boleh dibuka".to_string());
    }
    let host = host_of(u).unwrap_or_default();
    if host_blocked(&host) {
        return Err(format!("host {host} diblokir"));
    }
    let (code, body) = curl_get(u, 30)?;
    if code != 200 {
        return Err(format!("halaman menjawab HTTP {code}"));
    }
    let (title, text) = clean_text(&body);
    if text.is_empty() {
        return Err("halaman kosong / tidak bisa dibaca".to_string());
    }
    Ok(FetchOut {
        url: u.to_string(),
        title,
        text,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ddg_parses_two_results_and_uddg() {
        let html = r#"<a rel="nofollow" class="result__a" href="https://contoh.com/satu">Satu Judul</a><a class="result__snippet" href="x">Cuplikan satu</a><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fcontoh.com%2Fdua&amp;rut=abc">Dua Judul</a>"#;
        let r = parse_ddg_html(html);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].title, "Satu Judul");
        assert_eq!(r[0].url, "https://contoh.com/satu");
        assert_eq!(r[0].snippet, "Cuplikan satu");
        assert_eq!(r[1].url, "https://contoh.com/dua");
    }

    #[test]
    fn clean_text_drops_script_and_decodes() {
        let html = "<html><head><title>Judul Tes</title><style>.x{color:red}</style><script>var a=1;</script></head><body><p>Halo &amp; selamat &#65;&#x42; datang</p></body></html>";
        let (title, text) = clean_text(html);
        assert_eq!(title, "Judul Tes");
        assert_eq!(text, "Halo & selamat A* datang");
        assert!(!text.contains("var a"));
        assert!(!text.contains("color:red"));
    }

    #[test]
    fn host_guard_blocks_private() {
        assert!(host_blocked("localhost"));
        assert!(host_blocked("127.0.0.1"));
        assert!(host_blocked("10.0.0.5"));
        assert!(host_blocked("192.168.1.1"));
        assert!(host_blocked("172.16.0.1"));
        assert!(host_blocked("172.31.255.255"));
        assert!(!host_blocked("172.32.0.1"));
        assert!(!host_blocked("contoh.com"));
        assert_eq!(
            host_of("https://user@contoh.com:8080/jalan?x=1"),
            Some("contoh.com".to_string())
        );
    }
}
