use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Emitter, Manager, PhysicalPosition, State,
};

#[derive(Clone, Copy)]
struct Motion {
    enabled: bool,
    direction: i32,
}

impl Default for Motion {
    fn default() -> Self {
        Self {
            enabled: false,
            direction: -1,
        }
    }
}

struct AppState {
    motion: Arc<Mutex<Motion>>,
}

struct TrayState(#[allow(dead_code)] TrayIcon);

#[tauri::command]
fn set_walking(state: State<AppState>, enabled: bool, direction: String) -> Result<(), String> {
    let mut motion = state.motion.lock().map_err(|error| error.to_string())?;
    motion.enabled = enabled;
    motion.direction = if direction == "right" { 1 } else { -1 };
    Ok(())
}

#[tauri::command]
fn reset_position(app: AppHandle) -> Result<(), String> {
    place_near_bottom_right(&app)
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn toggle_pet_visibility(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window missing".to_string())?;
    if window.is_visible().map_err(|error| error.to_string())? {
        window.hide().map_err(|error| error.to_string())?;
    } else {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn setup_tray(app: &AppHandle) -> Result<TrayIcon, Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "显示/隐藏小欣子", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, "reset", "回到右下角", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &show,
            &reset,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("萌宠小欣子")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                let _ = toggle_pet_visibility(app);
            }
            "reset" => {
                let _ = place_near_bottom_right(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(tray)
}

fn place_near_bottom_right(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window missing".to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "monitor missing".to_string())?;
    let window_size = window.outer_size().map_err(|error| error.to_string())?;
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let x = monitor_position.x + monitor_size.width as i32 - window_size.width as i32 - 24;
    let y = monitor_position.y + monitor_size.height as i32 - window_size.height as i32 - 72;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())
}

fn start_motion_loop(app: AppHandle, motion: Arc<Mutex<Motion>>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(45));
        let current = match motion.lock() {
            Ok(value) => *value,
            Err(_) => continue,
        };
        if !current.enabled {
            continue;
        }

        let Some(window) = app.get_webview_window("pet") else {
            continue;
        };
        if !window.is_visible().unwrap_or(false) {
            continue;
        }
        let Ok(position) = window.outer_position() else {
            continue;
        };
        let Ok(size) = window.outer_size() else {
            continue;
        };
        let Ok(Some(monitor)) = window.current_monitor() else {
            continue;
        };
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let min_x = monitor_position.x;
        let max_x = monitor_position.x + monitor_size.width as i32 - size.width as i32;
        let mut direction = current.direction;
        let mut next_x = position.x + direction * 5;
        if next_x <= min_x {
            next_x = min_x;
            direction = 1;
        } else if next_x >= max_x {
            next_x = max_x;
            direction = -1;
        }

        if direction != current.direction {
            if let Ok(mut state) = motion.lock() {
                state.direction = direction;
            }
            let label = if direction < 0 { "left" } else { "right" };
            let _ = window.emit("walk-direction", serde_json::json!({ "direction": label }));
        }
        let _ = window.set_position(PhysicalPosition::new(next_x, position.y));
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let motion = Arc::new(Mutex::new(Motion::default()));
    let motion_for_setup = motion.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState { motion })
        .setup(move |app| {
            let tray = setup_tray(app.handle())?;
            app.manage(TrayState(tray));
            let _ = place_near_bottom_right(app.handle());
            start_motion_loop(app.handle().clone(), motion_for_setup.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![set_walking, reset_position, quit_app])
        .run(tauri::generate_context!())
        .expect("error while running Pet Xiaoxinzi");
}
