//! Tray — the desktop shape the web has no answer for: no window of its own,
//! resident in the menubar, summoned by a global shortcut, watching a system
//! resource (the clipboard) in the background.
//!
//! History is in memory on purpose. A clipboard buffer that survives a reboot
//! is a credential leak waiting to happen; if a fork wants persistence it
//! should be an explicit, encrypted opt-in.

use std::sync::Mutex;
use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, State, WindowEvent,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const CAP: usize = 200;

#[derive(Serialize, Clone)]
pub struct Clip { at: i64, text: String, kind: String }

#[derive(Default)]
pub struct Clips(Mutex<Vec<Clip>>);

/// Cheap classification so the UI can filter without a parser.
fn kind(t: &str) -> &'static str {
    let s = t.trim();
    if s.starts_with("http://") || s.starts_with("https://") { "url" }
    else if s.contains('\n') && s.contains(['{', ';', '(']) { "code" }
    else if s.starts_with("$ ") || s.starts_with("cargo ") || s.starts_with("npm ") || s.starts_with("git ") { "shell" }
    else { "text" }
}

fn now() -> i64 {
    std::time::UNIX_EPOCH.elapsed().map(|d| d.as_millis() as i64).unwrap_or(0)
}

#[tauri::command]
fn history(clips: State<'_, Clips>) -> Vec<Clip> {
    clips.0.lock().unwrap().clone()
}

#[tauri::command]
fn clear(clips: State<'_, Clips>) {
    clips.0.lock().unwrap().clear();
}

#[tauri::command]
fn copy(app: tauri::AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

fn show(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Desktop only — a tray app has no meaning on a phone, so no mobile entry point.
pub fn run() {
    let hotkey = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyV);

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, sc, ev| {
                    if ev.state() == ShortcutState::Pressed && sc == &hotkey {
                        show(app);
                    }
                })
                .build(),
        )
        .manage(Clips::default())
        .invoke_handler(tauri::generate_handler![history, clear, copy])
        // Closing hides: a tray app that quits on close is just a window.
        .on_window_event(|w, e| {
            if let WindowEvent::CloseRequested { api, .. } = e {
                api.prevent_close();
                let _ = w.hide();
            }
        })
        .setup(move |app| {
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, ev| match ev.id().as_ref() {
                    "quit" => app.exit(0),
                    _ => show(app),
                })
                .build(app)?;

            let _ = app.global_shortcut().register(hotkey);

            // The watcher: one thread, 800 ms, dedupe against the newest entry.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                if let Ok(text) = handle.clipboard().read_text() {
                    if !text.trim().is_empty() {
                        let clips = handle.state::<Clips>();
                        let mut v = clips.0.lock().unwrap();
                        if v.first().map(|c| c.text != text).unwrap_or(true) {
                            v.insert(0, Clip { at: now(), kind: kind(&text).into(), text });
                            v.truncate(CAP);
                        }
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(800));
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
