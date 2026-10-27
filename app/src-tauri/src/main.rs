#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(err) = tauri::Builder::default().run(tauri::generate_context!()) {
        eprintln!("error while running tauri application: {err}");
        std::process::exit(1);
    }
}
