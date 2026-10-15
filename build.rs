use std::{env, path::PathBuf, process::Command};

fn main() {
    println!("cargo:rerun-if-changed=pic/icon.ico");
    println!("cargo:rerun-if-changed=resources.rc");
    println!("cargo:rerun-if-env-changed=MINDLITE_WINDRES");
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let compiler = env::var_os("MINDLITE_WINDRES").map(PathBuf::from).unwrap_or_else(|| {
        root.join("target/toolchain-download/llvm-mingw-20261006-ucrt-x86_64/bin/x86_64-w64-mingw32-windres.exe")
    });
    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("mindlite-icon.o");
    let status = Command::new(compiler)
        .current_dir(root)
        .args(["-i", "resources.rc", "-O", "coff", "-o"])
        .arg(&output)
        .status()
        .expect("Windows resource compiler is required; use build.bat");
    assert!(status.success(), "Failed to compile the application icon");
    println!("cargo:rustc-link-arg={}", output.display());
}
