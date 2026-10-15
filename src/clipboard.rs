use std::{ffi::c_void, ptr, thread, time::Duration};
use windows_sys::Win32::{
    Foundation::GlobalFree,
    System::{
        DataExchange::{
            CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, SetClipboardData,
        },
        Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE},
    },
};

const UNICODE_TEXT: u32 = 13;
const MAX_TEXT: usize = 4 * 1024 * 1024;

struct Clipboard;
impl Clipboard {
    fn open(owner: *mut c_void) -> Result<Self, String> {
        for _ in 0..5 {
            if unsafe { OpenClipboard(owner) } != 0 {
                return Ok(Self);
            }
            thread::sleep(Duration::from_millis(5));
        }
        Err("剪贴板正被其他应用占用，请稍后重试。".into())
    }
}
impl Drop for Clipboard {
    fn drop(&mut self) {
        unsafe {
            CloseClipboard();
        }
    }
}

pub fn read(owner: *mut c_void) -> Result<String, String> {
    let _clipboard = Clipboard::open(owner)?;
    unsafe {
        let handle = GetClipboardData(UNICODE_TEXT);
        if handle.is_null() {
            return Ok(String::new());
        }
        let bytes = GlobalSize(handle);
        if bytes > MAX_TEXT || bytes < 2 {
            return Err("剪贴板文字过大或格式无效。".into());
        }
        let data = GlobalLock(handle) as *const u16;
        if data.is_null() {
            return Err("无法读取剪贴板。".into());
        }
        let slice = std::slice::from_raw_parts(data, bytes / 2);
        let length = slice.iter().position(|&c| c == 0).unwrap_or(slice.len());
        let text = String::from_utf16_lossy(&slice[..length]);
        GlobalUnlock(handle);
        Ok(text)
    }
}

pub fn write(owner: *mut c_void, text: &str) -> Result<(), String> {
    let units: Vec<u16> = text.encode_utf16().chain(Some(0)).collect();
    if units.len() * 2 > MAX_TEXT {
        return Err("复制内容过大，请选择较小的子树。".into());
    }
    let _clipboard = Clipboard::open(owner)?;
    unsafe {
        let memory = GlobalAlloc(GMEM_MOVEABLE, units.len() * 2);
        if memory.is_null() {
            return Err("剪贴板内存分配失败。".into());
        }
        let data = GlobalLock(memory) as *mut u16;
        if data.is_null() {
            GlobalFree(memory);
            return Err("无法写入剪贴板。".into());
        }
        ptr::copy_nonoverlapping(units.as_ptr(), data, units.len());
        GlobalUnlock(memory);
        if EmptyClipboard() == 0 || SetClipboardData(UNICODE_TEXT, memory).is_null() {
            GlobalFree(memory);
            return Err("无法更新剪贴板，请重试。".into());
        }
        // Ownership transfers to Windows after SetClipboardData succeeds.
    }
    Ok(())
}
