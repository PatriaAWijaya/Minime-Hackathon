#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod video;

fn main() {
    if let Err(err) = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            video::video_render,
            video::video_qc,
            video::video_capture,
            video::video_probe,
            video::video_asset_hash
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("error while running tauri application: {err}");
        std::process::exit(1);
    }
}
