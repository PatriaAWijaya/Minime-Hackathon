#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sherpa;
mod video;
mod voicestudio;

fn main() {
    if let Err(err) = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            video::video_render,
            video::video_qc,
            video::video_capture,
            video::video_probe,
            video::video_asset_hash,
            video::video_write_ass,
            voicestudio::vs_status,
            voicestudio::vs_launch,
            voicestudio::vs_install,
            sherpa::sherpa_status,
            sherpa::sherpa_setup,
            sherpa::sherpa_tts
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("error while running tauri application: {err}");
        std::process::exit(1);
    }
}
