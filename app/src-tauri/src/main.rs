#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod browser;
mod image;
mod postiz;
mod postiz_install;
mod sherpa;
mod video;
mod voicestudio;

use tauri::utils::config::WebviewUrl;
use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};

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
            postiz::postiz_request,
            postiz_install::postiz_install,
            postiz_install::open_docker_desktop
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("error while running tauri application: {err}");
        std::process::exit(1);
    }
}
