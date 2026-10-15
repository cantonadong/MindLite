@echo off
setlocal
cd /d "%~dp0"
if not exist "MindLite.exe" (
  echo MindLite.exe is missing. Run this launcher from the dist folder.
  pause
  exit /b 1
)
if not exist "WebView2Loader.dll" (
  echo WebView2Loader.dll is missing. Keep it beside MindLite.exe.
  pause
  exit /b 1
)
echo Starting MindLite...
"%~dp0MindLite.exe"
set "mindlite_exit=%errorlevel%"
echo Exit code: %mindlite_exit%
echo Exit code: %mindlite_exit% > "%~dp0launch-result.log"
if "%mindlite_exit%"=="-1073741515" echo A required DLL could not be found.
if "%mindlite_exit%"=="-1073741511" echo A required DLL entry point could not be found.
if "%mindlite_exit%"=="-1073741701" echo Windows rejected an EXE or DLL image.
echo Startup log: %%LOCALAPPDATA%%\MindLite\mindlite-startup.log
if not "%mindlite_exit%"=="0" pause
exit /b %mindlite_exit%
