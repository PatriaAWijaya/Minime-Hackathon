#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod browser;
mod image;
mod postiz;
mod postiz_install;
mod sherpa;
mod social;
mod video;
mod voicestudio;

use tauri::utils::config::WebviewUrl;
use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};

/// Jembatan OAuth panel (v57). Disuntik ke semua frame; hanya aktif
/// di frame Postiz (localhost:4007). Membungkus window.fetch sebelum
/// skrip halaman dimuat: respons /integrations/social/* yang membawa
/// {url} dikirim ke frame utama via postMessage. Respons asli tetap
/// dikembalikan utuh (clone) sehingga alur Postiz tidak terganggu.
const POSTIZ_OAUTH_BRIDGE: &str = r#"(function () {
  try {
    var host = window.location.host || "";
    if (host !== "localhost:4007" && host !== "127.0.0.1:4007") return;
    if (window.__minimeOauthBridge) return;
    window.__minimeOauthBridge = true;
    var origFetch = window.fetch;
    if (!origFetch) return;
    window.fetch = async function () {
      var res = await origFetch.apply(this, arguments);
      try {
        var a0 = arguments[0];
        var u = typeof a0 === "string" ? a0 : (a0 && a0.url) || "";
        if (u.indexOf("/integrations/social/") !== -1) {
          var data = await res.clone().json();
          if (data && typeof data.url === "string" && data.url) {
            window.parent.postMessage({ type: "minime-oauth-url", url: data.url }, "*");
          }
        }
      } catch (e) {}
      return res;
    };
  } catch (e) {}
})();"#;

fn main() {
    if let Err(err) = tauri::Builder::default()
        .setup(|app| {
            // Jendela utama dibuat di sini (bukan dari tauri.conf.json)
            // supaya handler navigasi + jendela baru bisa dipasang.
            // Panel Postiz di dalam webview tidak boleh bernavigasi
            // keluar (provider OAuth menolak login di webview) dan
            // tidak boleh membuka popup liar: yang eksternal dilempar
            // ke browser sistem, yang lokal/app tetap di dalam app.
            // Ukuran + judul sama dengan konfigurasi sebelumnya
            // (1280x800, "MiniMe").
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("MiniMe")
                .inner_size(1280.0, 800.0)
                // Jembatan OAuth panel (v57): script ini disuntik ke
                // SEMUA frame (main + iframe Postiz + frame lain) saat
                // dokumen mulai dimuat. Di frame Postiz saja ia
                // membungkus window.fetch: tiap respons
                // /integrations/social/* yang membawa {url} dikirim ke
                // frame utama via postMessage, sehingga klik tile
                // channel yang penugasan location.href-nya macet di
                // webview tetap membuka login di browser sistem.
                // Respons asli dikembalikan utuh ke Postiz (clone),
                // jadi alur panel tidak diganggu. Di frame lain
                // (app, Stripe, dsb.) script langsung berhenti.
                .initialization_script_for_all_frames(POSTIZ_OAUTH_BRIDGE)
                .on_navigation(|url| match browser::classify_navigation(url.as_str()) {
                    browser::NavDecision::Allow => {
                        browser::log_nav(url.as_str(), browser::NavDecision::Allow, "nav");
                        true
                    }
                    browser::NavDecision::Deny => {
                        browser::log_nav(url.as_str(), browser::NavDecision::Deny, "nav");
                        false
                    }
                    browser::NavDecision::OpenExternal => {
                        let r = browser::open_external_url(url.as_str());
                        browser::log_nav(
                            url.as_str(),
                            browser::NavDecision::OpenExternal,
                            if r.is_ok() {
                                "nav open-ok"
                            } else {
                                "nav open-ERR"
                            },
                        );
                        false
                    }
                })
                .on_new_window(
                    |url, _features| match browser::classify_navigation(url.as_str()) {
                        browser::NavDecision::Allow => NewWindowResponse::Allow,
                        browser::NavDecision::Deny => NewWindowResponse::Deny,
                        browser::NavDecision::OpenExternal => {
                            let r = browser::open_external_url(url.as_str());
                            browser::log_nav(
                                url.as_str(),
                                browser::NavDecision::OpenExternal,
                                if r.is_ok() {
                                    "win open-ok"
                                } else {
                                    "win open-ERR"
                                },
                            );
                            NewWindowResponse::Deny
                        }
                    },
                )
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            video::video_render,
            video::video_qc,
            video::video_capture,
            video::video_probe,
            video::video_asset_hash,
            video::video_write_ass,
            voicestudio::vs_launch,
            voicestudio::vs_install,
            sherpa::sherpa_status,
            sherpa::sherpa_setup,
            sherpa::sherpa_tts,
            image::image_save,
            image::image_read,
            image::image_delete,
            browser::open_browser,
            browser::open_external_url,
            browser::fb_app_status,
            postiz::postiz_request,
            postiz_install::postiz_install,
            postiz_install::open_docker_desktop,
            postiz_install::postiz_provider_env,
            social::social_oauth_listen,
            social::social_token_exchange,
            social::social_linkedin_me,
            social::social_publish,
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("error while running tauri application: {err}");
        std::process::exit(1);
    }
}
