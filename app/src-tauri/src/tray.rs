//! The menu bar icon: the studio's robot head as a template image, and a two-item menu.
//! Any click (left or right) opens the same menu.

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};

const OPEN_ID: &str = "open";
const QUIT_ID: &str = "quit";
const NAME: &str = "AI Studio";

/// Build the tray. `on_quit` is the single quit every Quit path shares.
pub fn install(app: &AppHandle, on_quit: fn(&AppHandle)) -> tauri::Result<()> {
    let open = MenuItemBuilder::with_id(OPEN_ID, "Open AI Studio").build(app)?;
    let quit = MenuItemBuilder::with_id(QUIT_ID, "Quit AI Studio").accelerator("CmdOrCtrl+Q").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&open, &quit]).build()?;
    TrayIconBuilder::with_id("main")
        .icon(tauri::include_image!("icons/tray-template@2x.png"))
        .icon_as_template(true)
        .tooltip(NAME)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            OPEN_ID => show_main(app),
            QUIT_ID => on_quit(app),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

/// Show the one studio window and bring it to the front (never a second window, no reload).
pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}
