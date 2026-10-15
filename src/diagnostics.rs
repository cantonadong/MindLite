use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::OnceLock,
    time::SystemTime,
};

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

pub fn init() {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("MindLite");
    let folder = if fs::create_dir_all(&base).is_ok() {
        base
    } else {
        std::env::temp_dir()
    };
    let path = folder.join("mindlite-startup.log");
    let _ = fs::write(&path, b"MindLite startup diagnostics\n");
    let _ = LOG_PATH.set(path);
    log(&format!(
        "process={} executable={:?}",
        std::process::id(),
        std::env::current_exe()
    ));
    std::panic::set_hook(Box::new(|info| {
        log(&format!(
            "PANIC: {info}\n{}",
            std::backtrace::Backtrace::force_capture()
        ));
        show_error(&format!("程序启动或运行时发生错误：\n{info}"));
    }));
}

pub fn log(message: &str) {
    if let Some(path) = LOG_PATH.get() {
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{:?} {message}", SystemTime::now());
        }
    }
}

pub fn show_error(message: &str) {
    let path = LOG_PATH
        .get()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "未能创建日志文件".into());
    let body: Vec<u16> = format!("{message}\n\n启动日志：{path}")
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let title: Vec<u16> = "MindLite 启动错误".encode_utf16().chain(Some(0)).collect();
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
            std::ptr::null_mut(),
            body.as_ptr(),
            title.as_ptr(),
            windows_sys::Win32::UI::WindowsAndMessaging::MB_OK
                | windows_sys::Win32::UI::WindowsAndMessaging::MB_ICONERROR,
        );
    }
}
