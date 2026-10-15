#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod clipboard;
mod diagnostics;
mod files;

use serde_json::{json, Value};
use std::sync::mpsc;
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    platform::windows::WindowExtWindows,
    window::WindowBuilder,
};
use wry::{http::Response, WebContext, WebViewBuilder};

enum AppEvent {
    Request(Value),
    Reply {
        id: u64,
        result: Result<Value, String>,
    },
}

fn main() {
    diagnostics::init();
    if let Err(error) = run() {
        diagnostics::log(&format!("STARTUP ERROR: {error:?}"));
        diagnostics::show_error(&format!("无法启动 MindLite：\n{error}"));
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    diagnostics::log("creating native event loop");
    let event_loop = EventLoopBuilder::<AppEvent>::with_user_event().build();
    diagnostics::log("creating native window");
    let window = WindowBuilder::new()
        .with_title("MindLite")
        .with_inner_size(LogicalSize::new(1240., 820.))
        .with_min_inner_size(LogicalSize::new(640., 480.))
        .with_window_icon(Some(app_icon()))
        .build(&event_loop)?;
    diagnostics::log("native window created");
    let proxy = event_loop.create_proxy();
    let ipc_proxy = proxy.clone();
    let data_directory = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("MindLite")
        .join("WebView");
    std::fs::create_dir_all(&data_directory)?;
    diagnostics::log(&format!(
        "creating WebView2; data_directory={}",
        data_directory.display()
    ));
    let mut web_context = WebContext::new(Some(data_directory));
    let webview = WebViewBuilder::new_with_web_context(&mut web_context)
        .with_custom_protocol("mindlite".into(), move |_, request| {
            let path = request.uri().path();
            let asset: Option<(&str, &[u8])> = match path {
                "/" | "/index.html" => Some(("text/html; charset=utf-8", include_bytes!("../ui/index.html"))),
                "/preview.html" => Some(("text/html; charset=utf-8", include_bytes!("../ui/preview.html"))),
                "/styles.css" => Some(("text/css; charset=utf-8", include_bytes!("../ui/styles.css"))),
                "/refinements.css" => Some(("text/css; charset=utf-8", include_bytes!("../ui/refinements.css"))),
                "/app-icon.png" => Some(("image/png", include_bytes!("../ui/app-icon.png"))),
                "/icons.js" => Some(("text/javascript; charset=utf-8", include_bytes!("../ui/icons.js"))),
                "/bootstrap.js" => Some(("text/javascript; charset=utf-8", include_bytes!("../ui/bootstrap.js"))),
                "/scenes.js" => Some(("text/javascript; charset=utf-8", include_bytes!("../ui/scenes.js"))),
                "/model.js" => Some(("text/javascript; charset=utf-8", include_bytes!("../ui/model.js"))),
                "/layout.js" => Some(("text/javascript; charset=utf-8", include_bytes!("../ui/layout.js"))),
                "/formats.js" => Some(("text/javascript; charset=utf-8", include_bytes!("../ui/formats.js"))),
                "/bridge.js" => Some(("text/javascript; charset=utf-8", include_bytes!("../ui/bridge.js"))),
                "/app.js" => Some(("text/javascript; charset=utf-8", include_bytes!("../ui/app.js"))),
                "/experience.js" => Some(("text/javascript; charset=utf-8", include_bytes!("../ui/experience.js"))),
                _ => None,
            };
            let (mime, body) = asset.unwrap_or(("text/plain", b"Not found"));
            Response::builder()
                .status(if asset.is_some() { 200 } else { 404 })
                .header("Content-Type", mime)
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'")
                .body(body.to_vec().into())
                .unwrap()
        })
        .with_ipc_handler(move |request| {
            let uri = request.uri();
            if !matches!(uri.host(), Some("mindlite.localhost") | Some("localhost")) {
                return;
            }
            if let Ok(value) = serde_json::from_str::<Value>(request.body()) {
                let _ = ipc_proxy.send_event(AppEvent::Request(value));
            }
        })
        .with_navigation_handler(|url| {
            url.starts_with("http://mindlite.localhost/")
                || url.starts_with("mindlite://localhost/")
        })
        .with_hotkeys_zoom(false)
        .with_devtools(false)
        .with_url("mindlite://localhost/index.html")
        .build(&window)?;
    diagnostics::log("WebView2 created; starting event loop");
    let (file_sender, file_receiver) = mpsc::channel::<Value>();
    let file_proxy = proxy.clone();
    std::thread::spawn(move || {
        let mut files = files::Files::new();
        for request in file_receiver {
            let id = request["id"].as_u64().unwrap_or(0);
            let command = request["command"].as_str().unwrap_or("");
            let result = files.handle(command, &request);
            let _ = file_proxy.send_event(AppEvent::Reply { id, result });
        }
    });
    let mut frontend_ready = false;
    event_loop.run(move |event, _, flow| {
        *flow = ControlFlow::Wait;
        match event {
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                if frontend_ready {
                    let _ = webview.evaluate_script("window.MindLiteApp?.requestClose()");
                } else {
                    *flow = ControlFlow::Exit;
                }
            }
            Event::UserEvent(AppEvent::Request(request)) => {
                let id = request["id"].as_u64().unwrap_or(0);
                let command = request["command"].as_str().unwrap_or("").to_string();
                if command == "startup" {
                    frontend_ready = true;
                    diagnostics::log("frontend startup message received");
                }
                if command == "close" {
                    *flow = ControlFlow::Exit;
                } else if command == "diagnostic" {
                    if let Some(message) = request["message"].as_str() {
                        diagnostics::log(&format!(
                            "frontend: {}",
                            message.chars().take(4000).collect::<String>()
                        ));
                    }
                    reply(&webview, id, Ok(Value::Null));
                } else if command == "clipboard_read" {
                    reply(
                        &webview,
                        id,
                        clipboard::read(window.hwnd() as *mut std::ffi::c_void).map(Value::String),
                    );
                } else if command == "clipboard_write" {
                    let result = request["text"]
                        .as_str()
                        .ok_or_else(|| "缺少剪贴板文字。".into())
                        .and_then(|text| {
                            clipboard::write(window.hwnd() as *mut std::ffi::c_void, text)
                        })
                        .map(|_| Value::Null);
                    reply(&webview, id, result);
                } else if command == "state" {
                    let title = request["title"].as_str().unwrap_or("未命名导图");
                    let dirty = request["dirty"].as_bool().unwrap_or(false);
                    window.set_title(&format!(
                        "{}{title} — MindLite",
                        if dirty { "● " } else { "" }
                    ));
                    reply(&webview, id, Ok(Value::Null));
                } else {
                    if file_sender.send(request).is_err() {
                        reply(&webview, id, Err("本地文件服务不可用。".into()));
                    }
                }
            }
            Event::UserEvent(AppEvent::Reply { id, result }) => reply(&webview, id, result),
            _ => (),
        }
    });
}

fn app_icon() -> tao::window::Icon {
    tao::window::Icon::from_rgba(include_bytes!("../pic/icon.rgba").to_vec(), 64, 64)
        .expect("valid application icon")
}
fn reply(webview: &wry::WebView, id: u64, result: Result<Value, String>) {
    let value = match result {
        Ok(data) => json!({"id":id,"ok":true,"data":data}),
        Err(error) => json!({"id":id,"ok":false,"error":error}),
    };
    let _ = webview.evaluate_script(&format!("window.__mindliteReply?.({value})"));
}
