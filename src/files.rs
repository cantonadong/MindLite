use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

const MAX_DOCUMENT: u64 = 20 * 1024 * 1024;
static NEXT_TEMP: AtomicU64 = AtomicU64::new(1);

pub struct Files {
    current: Option<PathBuf>,
    approved: HashSet<PathBuf>,
    startup: Option<PathBuf>,
    recovery: PathBuf,
}

impl Files {
    pub fn new() -> Self {
        let base = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        Self {
            current: None,
            approved: HashSet::new(),
            startup: std::env::args_os().nth(1).map(PathBuf::from),
            recovery: base.join("MindLite").join("recovery.mindlite"),
        }
    }

    pub fn handle(&mut self, command: &str, request: &Value) -> Result<Value, String> {
        match command {
            "startup" => {
                if let Some(path) = self.startup.take() {
                    let path = std::path::absolute(path)
                        .map_err(|e| format!("无法确定文件完整路径：{e}"))?;
                    let content = read_document(&path)?;
                    self.approved.insert(path.clone());
                    return Ok(json!({"content":content,"path":path.to_string_lossy()}));
                }
                let mut recovery_path = None;
                let recovery = if self.recovery.exists() {
                    read_document_limited(&self.recovery, MAX_DOCUMENT * 6 + 65536)
                        .ok()
                        .map(|content| {
                            if let Ok(record) = serde_json::from_str::<Value>(&content) {
                                if record["recoveryVersion"] == 1 {
                                    if let Some(snapshot) = record["content"].as_str() {
                                        recovery_path = record["path"]
                                            .as_str()
                                            .map(PathBuf::from)
                                            .filter(|path| path.is_absolute());
                                        return snapshot.to_owned();
                                    }
                                }
                            }
                            // Earlier recovery files contain the document directly.
                            content
                        })
                } else {
                    None
                };
                if let Some(path) = &recovery_path {
                    self.approved.insert(path.clone());
                }
                Ok(json!({"recovery":recovery,"recoveryPath":recovery_path}))
            }
            "open" => {
                let import = request["importMM"].as_bool().unwrap_or(false);
                let mut dialog = rfd::FileDialog::new().set_title(if import {
                    "导入 FreeMind 导图"
                } else {
                    "打开思维导图"
                });
                dialog = if import {
                    dialog.add_filter("FreeMind 导图", &["mm"])
                } else {
                    dialog
                        .add_filter("思维导图", &["mm", "mindlite"])
                        .add_filter("FreeMind 导图", &["mm"])
                        .add_filter("旧版 MindLite 文档", &["mindlite"])
                };
                let Some(path) = dialog.pick_file() else {
                    return Ok(Value::Null);
                };
                let content = read_document(&path)?;
                self.approved.insert(path.clone());
                Ok(json!({"path":path.to_string_lossy(),"content":content}))
            }
            "set_current" => {
                if request["path"].is_null() {
                    self.current = None;
                } else {
                    let path = PathBuf::from(field(request, "path")?);
                    if !self.approved.contains(&path) {
                        return Err("文件尚未通过本地对话框授权。".into());
                    }
                    self.current = Some(path);
                }
                Ok(Value::Null)
            }
            "save" => {
                let content = field(request, "content")?;
                if content.len() as u64 > MAX_DOCUMENT {
                    return Err("文档超过 20 MB 保存限制。".into());
                }
                if !content.trim_start().starts_with("<?xml") || !content.contains("<map ") {
                    return Err("FreeMind 文档内容无效，未执行保存。".into());
                }
                let save_as = request["saveAs"].as_bool().unwrap_or(false);
                // A restored/opened document retains its original destination,
                // including legacy .mindlite names. Only explicit Save As or
                // an unbound document needs a new destination.
                crate::diagnostics::log(&format!(
                    "save: save_as={save_as}; has_current={}",
                    self.current.is_some()
                ));
                let path = if !save_as && self.current.is_some() {
                    self.current.clone().unwrap()
                } else {
                    let name = suggested(request, "mm");
                    let mut dialog = rfd::FileDialog::new()
                        .set_title("保存 FreeMind 导图")
                        .add_filter("FreeMind 导图", &["mm"])
                        .set_file_name(&name);
                    if let Some(parent) = self.current.as_ref().and_then(|p| p.parent()) {
                        dialog = dialog.set_directory(parent);
                    }
                    let Some(path) = dialog.save_file() else {
                        return Ok(Value::Null);
                    };
                    with_extension(path, "mm")?
                };
                atomic_write(&path, content.as_bytes())?;
                self.approved.insert(path.clone());
                self.current = Some(path.clone());
                Ok(json!({"path":path.to_string_lossy()}))
            }
            "export" => {
                let kind = field(request, "kind")?;
                if !["mm", "svg", "png"].contains(&kind) {
                    return Err("不支持的导出格式。".into());
                }
                let content = field(request, "content")?;
                if content.len() > 128 * 1024 * 1024 {
                    return Err("导出内容过大，请缩小图片后重试。".into());
                }
                let bytes = if request["encoding"] == "base64" {
                    STANDARD.decode(content).map_err(|_| "图片编码无效。")?
                } else {
                    content.as_bytes().to_vec()
                };
                let name = suggested(request, kind);
                let Some(path) = rfd::FileDialog::new()
                    .set_title("导出思维导图")
                    .add_filter(kind.to_uppercase(), &[kind])
                    .set_file_name(&name)
                    .save_file()
                else {
                    return Ok(Value::Null);
                };
                let path = with_extension(path, kind)?;
                if self.current.as_ref() == Some(&path) {
                    return Err("不能将导出文件覆盖到当前 MindLite 文档。".into());
                }
                atomic_write(&path, &bytes)?;
                Ok(json!({"path":path.to_string_lossy()}))
            }
            "checkpoint" => {
                if request["content"].is_null() {
                    match fs::remove_file(&self.recovery) {
                        Ok(()) => (),
                        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
                        Err(e) => return Err(format!("清理恢复记录失败：{e}")),
                    }
                } else {
                    let content = field(request, "content")?;
                    if content.len() as u64 > MAX_DOCUMENT {
                        return Err("恢复记录过大。".into());
                    }
                    if let Some(parent) = self.recovery.parent() {
                        fs::create_dir_all(parent).map_err(|e| format!("无法创建恢复目录：{e}"))?;
                    }
                    // Keep the snapshot and its native-approved destination in
                    // one atomic record, so a crash cannot mix two documents.
                    let record = serde_json::to_vec(&json!({
                        "recoveryVersion":1,
                        "content":content,
                        "path":self.current,
                    }))
                    .map_err(|e| format!("无法生成恢复记录：{e}"))?;
                    atomic_write(&self.recovery, &record)?;
                }
                Ok(Value::Null)
            }
            _ => Err("未知的本地命令。".into()),
        }
    }
}

fn field<'a>(request: &'a Value, key: &str) -> Result<&'a str, String> {
    request[key]
        .as_str()
        .ok_or_else(|| format!("缺少参数：{key}"))
}

fn suggested(request: &Value, extension: &str) -> String {
    let name: String = request["suggested"]
        .as_str()
        .unwrap_or("思维导图")
        .chars()
        .filter(|c| !c.is_control() && !"\\/:*?\"<>|".contains(*c))
        .take(50)
        .collect();
    let name = name.trim().trim_matches('.');
    let name = if name.is_empty()
        || ["CON", "PRN", "AUX", "NUL", "COM1", "LPT1"].contains(&name.to_uppercase().as_str())
    {
        "思维导图"
    } else {
        name
    };
    format!("{name}.{extension}")
}

fn with_extension(mut path: PathBuf, extension: &str) -> Result<PathBuf, String> {
    if path.extension().is_none() {
        path.set_extension(extension);
        if path.exists() {
            let answer = rfd::MessageDialog::new()
                .set_title("确认覆盖文件")
                .set_description(format!("{} 已存在，是否覆盖？", path.display()))
                .set_buttons(rfd::MessageButtons::YesNo)
                .show();
            if answer != rfd::MessageDialogResult::Yes {
                return Err("已取消覆盖文件。".into());
            }
        }
    } else if !path
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case(extension))
    {
        return Err(format!("文件扩展名必须为 .{extension}，请重新选择文件名。"));
    }
    Ok(path)
}

fn read_document(path: &Path) -> Result<String, String> {
    read_document_limited(path, MAX_DOCUMENT)
}

fn read_document_limited(path: &Path, limit: u64) -> Result<String, String> {
    let file = fs::File::open(path).map_err(|e| format!("无法打开文件：{e}"))?;
    let mut content = String::new();
    file.take(limit + 1)
        .read_to_string(&mut content)
        .map_err(|e| format!("无法读取 UTF-8 文档：{e}"))?;
    if content.len() as u64 > limit {
        return Err("文件超过读取大小限制。".into());
    }
    Ok(content)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let temp = parent.join(format!(
        ".mindlite-{}-{}.tmp",
        std::process::id(),
        NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows_sys::Win32::Storage::FileSystem::{
                MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
            };
            let from: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
            let to: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
            if unsafe {
                MoveFileExW(
                    from.as_ptr(),
                    to.as_ptr(),
                    MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
                )
            } == 0
            {
                return Err(std::io::Error::last_os_error());
            }
        }
        #[cfg(not(windows))]
        fs::rename(&temp, path)?;
        Ok::<(), std::io::Error>(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result.map_err(|e| format!("写入失败，原文件保留：{e}"))
}
