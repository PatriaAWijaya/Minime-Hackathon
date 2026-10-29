//! Buka URL di browser sistem (bukan webview app).
//! Hanya dua URL yang diizinkan: UI Postiz lokal dan halaman unduh
//! Docker Desktop. Alasan Postiz: login Google TIDAK bisa di dalam
//! panel/frame (accounts.google.com memasang X-Frame-Options: DENY
//! dan webview tidak membuka popup OAuth), sehingga pengguna Google
//! harus login lewat browser asli. Dipakai tombol "Buka di browser"
//! di panel Planner. Alasan Docker: instalasi Docker Desktop adalah
//! satu-satunya langkah instalasi Postiz yang tidak bisa diotomasi
//! dari app (aplikasi macOS) — wizard mengarahkan pengguna ke halaman
//! resminya, selebihnya satu klik.
use std::process::Command;

#[tauri::command]
pub fn open_browser(url: String) -> Result<(), String> {
    if url != "http://localhost:4007"
        && !url.starts_with("http://localhost:4007/")
        && url != "https://www.docker.com/products/docker-desktop/"
    {
        return Err("URL tidak diizinkan".into());
    }
    Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Keputusan untuk satu navigasi webview (klik link / location.href)
/// maupun permintaan jendela baru (window.open / target=_blank).
/// Dipakai handler navigasi v56 supaya menu Postiz di panel bisa
/// jalan dari dalam app: alur OAuth Add Channel (location.href ke
/// provider) maupun tautan/popup menu lain yang keluar dari Postiz
/// tidak boleh mentok di webview — provider menolak login di
/// webview, dan webview tidak membuka popup OAuth.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NavDecision {
    /// Izinkan di dalam webview: app sendiri + UI Postiz lokal.
    Allow,
    /// Tolak di webview; buka di browser sistem (hanya https eksternal).
    OpenExternal,
    /// Tolak mentah-mentah: skema tak dikenal, host lokal bukan 4007,
    /// http eksternal, atau URL ber-userinfo.
    Deny,
}

/// Klasifikasi murni (tanpa efek samping) supaya bisa diuji unit.
/// Catatan wry 0.57: decidePolicyForNavigationAction dipanggil untuk
/// SEMUA navigasi termasuk iframe, jadi handler ini melihat navigasi
/// OAuth di dalam frame panel Postiz; fetch/XHR tidak memicunya.
pub fn classify_navigation(url: &str) -> NavDecision {
    if url == "about:blank" {
        return NavDecision::Allow;
    }
    let Some((scheme_raw, rest)) = url.split_once("://") else {
        return NavDecision::Deny;
    };
    let scheme = scheme_raw.to_ascii_lowercase();
    if scheme == "tauri" {
        return NavDecision::Allow;
    }
    if scheme != "http" && scheme != "https" {
        return NavDecision::Deny;
    }
    let authority = rest.split('/').next().unwrap_or("");
    // Userinfo (a@b) tidak pernah sah untuk navigasi OAuth/menu.
    if authority.contains('@') {
        return NavDecision::Deny;
    }
    let (host_raw, port) = match authority.split_once(':') {
        Some((h, p)) => (h, Some(p)),
        None => (authority, None),
    };
    let host = host_raw
        .trim_matches(|c| c == '[' || c == ']')
        .to_ascii_lowercase();
    if host == "tauri.localhost" {
        return NavDecision::Allow;
    }
    // Frame pihak ketiga yang wajib tetap di dalam halaman (mis.
    // Stripe.js di UI billing Postiz: js.stripe.com + *.stripe.network):
    // membukanya di browser sistem tidak berguna dan merusak UI-nya.
    // Aturan sufiks, bukan daftar host satu per satu, karena Stripe
    // memakai beberapa host frame (m-outer, inner, dsb.).
    if host == "js.stripe.com"
        || host.ends_with(".stripe.com")
        || host.ends_with(".stripe.network")
    {
        return NavDecision::Allow;
    }
    if host == "localhost" || host == "127.0.0.1" || host == "::1" {
        // UI Postiz lokal hanya di port 4007.
        return if port == Some("4007") {
            NavDecision::Allow
        } else {
            NavDecision::Deny
        };
    }
    // Host eksternal: hanya https yang boleh dilempar ke browser sistem.
    if scheme == "https" {
        NavDecision::OpenExternal
    } else {
        NavDecision::Deny
    }
}

/// Buka URL eksternal di browser sistem. Hanya menerima URL yang
/// lolos klasifikasi OpenExternal; sisanya ditolak (jalur ini tidak
/// pernah membuka URL lokal/app). Perintah Tauri `open_external_url`
/// (dipakai pendengar jembatan OAuth di frontend) maupun handler
/// navigasi memanggil fungsi yang sama.
/// Anti-ganda: URL yang sama persis dalam 10 detik terakhir hanya
/// dibuka sekali — jembatan fetch dan handler navigasi bisa sama-sama
/// memicu URL yang sama untuk satu klik, dan tab ganda tidak berguna
/// (state OAuth sekali pakai).
#[tauri::command]
pub fn open_external_url(url: &str) -> Result<(), String> {
    if classify_navigation(url) != NavDecision::OpenExternal {
        return Err("URL tidak diizinkan untuk browser eksternal".into());
    }
    {
        use std::sync::Mutex;
        use std::time::{Duration, Instant};
        static LAST_OPEN: Mutex<Option<(String, Instant)>> = Mutex::new(None);
        if let Ok(mut guard) = LAST_OPEN.lock() {
            if let Some((last, at)) = guard.as_ref() {
                if last == url && at.elapsed() < Duration::from_secs(10) {
                    return Ok(());
                }
            }
            *guard = Some((url.to_string(), Instant::now()));
        }
    }
    Command::new("open")
        .arg(url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Log debug sementara v56.1: setiap keputusan navigasi/jendela-baru
/// dicatat ke /tmp/minime-nav-debug.log (best-effort, tidak pernah
/// menggagalkan navigasi). Hanya skema+host+path yang dicatat, TANPA
/// query string (state OAuth tidak ikut tercatat). Dipakai untuk
/// membuktikan apakah klik tile channel di panel benar-benar sampai
/// ke handler atau mentok di frontend Postiz.
pub fn log_nav(url: &str, decision: NavDecision, note: &str) {
    use std::io::Write;
    let bare = url.split('?').next().unwrap_or(url);
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("/tmp/minime-nav-debug.log")
    {
        let _ = writeln!(f, "{secs} | {bare} | {decision:?} | {note}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_cases() {
        assert_eq!(
            classify_navigation("tauri://localhost/index.html"),
            NavDecision::Allow
        );
        assert_eq!(classify_navigation("about:blank"), NavDecision::Allow);
        assert_eq!(
            classify_navigation("http://localhost:4007/"),
            NavDecision::Allow
        );
        assert_eq!(
            classify_navigation("http://localhost:4007/launches"),
            NavDecision::Allow
        );
        assert_eq!(
            classify_navigation("http://127.0.0.1:4007/"),
            NavDecision::Allow
        );
        assert_eq!(
            classify_navigation("https://www.facebook.com/v19.0/dialog/oauth?x=1"),
            NavDecision::OpenExternal
        );
        assert_eq!(
            classify_navigation("https://accounts.google.com/o/oauth2/auth"),
            NavDecision::OpenExternal
        );
        // Frame Stripe.js wajib tetap di halaman (bukan tab browser).
        assert_eq!(
            classify_navigation("https://js.stripe.com/v3/m-outer.html"),
            NavDecision::Allow
        );
        assert_eq!(
            classify_navigation("https://m.stripe.network/inner.html"),
            NavDecision::Allow
        );
        assert_eq!(
            classify_navigation("http://example.com/"),
            NavDecision::Deny
        );
        assert_eq!(
            classify_navigation("http://localhost:3000/"),
            NavDecision::Deny
        );
        assert_eq!(classify_navigation("http://localhost/"), NavDecision::Deny);
        assert_eq!(classify_navigation("data:text/html,hi"), NavDecision::Deny);
        assert_eq!(
            classify_navigation("https://user@evil.example/"),
            NavDecision::Deny
        );
        assert_eq!(classify_navigation(""), NavDecision::Deny);
    }
}
