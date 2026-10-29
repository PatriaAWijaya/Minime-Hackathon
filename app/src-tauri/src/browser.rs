//! Buka URL di browser sistem (bukan webview app). Hanya halaman
//! developer provider yang diizinkan (Meta + LinkedIn) — dipakai
//! tombol "Buka dashboard" dari kartu kanal native: pengguna membuat
//! aplikasi provider di sana (termasuk menambah redirect URI
//! loopback 127.0.0.1:4317), karena login OAuth provider TIDAK bisa
//! di dalam webview (X-Frame-Options: DENY dan webview tidak membuka
//! popup OAuth).
use std::process::Command;

#[tauri::command]
pub fn open_browser(url: String) -> Result<(), String> {
    if url != "http://localhost:4007"
        && !url.starts_with("http://localhost:4007/")
        && url != "https://developers.facebook.com/apps"
        && !url.starts_with("https://developers.facebook.com/apps/")
        && url != "https://www.linkedin.com/developers/apps"
        && !url.starts_with("https://www.linkedin.com/developers/apps/")
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
/// Dipakai handler navigasi supaya tautan keluar dari app tidak
/// mentok di webview — provider menolak login di webview, dan
/// webview tidak membuka popup OAuth.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NavDecision {
    /// Izinkan di dalam webview: app sendiri + layanan lokal port 4007.
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
/// OAuth di dalam frame panel; fetch/XHR tidak memicunya.
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
    if host == "js.stripe.com" || host.ends_with(".stripe.com") || host.ends_with(".stripe.network")
    {
        return NavDecision::Allow;
    }
    if host == "localhost" || host == "127.0.0.1" || host == "::1" {
        // Layanan lokal hanya di port 4007 (aturan kompatibilitas;
        // tidak ada layanan lokal aktif di v63 — Postiz dihapus).
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

/// Probe status aplikasi Facebook (v59, perintah Patria: user cukup klik
/// di MiniMe). Mengambil halaman dialog OAuth dengan App ID yang
/// lolos klasifikasi OpenExternal; sisanya ditolak (jalur ini tidak
/// pernah membuka URL lokal/app). Perintah Tauri `open_external_url`
/// maupun handler navigasi memanggil fungsi yang sama.
/// Anti-ganda: URL yang sama persis dalam 10 detik terakhir hanya
/// dibuka sekali — handler navigasi dan jendela baru bisa sama-sama
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
