# CipherBrowse Installation

Use this guide when GitHub or an organization policy blocks unsigned `.cmd`, `.bat`, or `.exe` uploads. The source code can still be shared normally. Windows users can rebuild the launcher and add media tools locally after downloading the repository.

`Cipherbrowse.cmd` is not compiled. It is a plain text Windows command launcher. "Building" it means creating a local text file named `Cipherbrowse.cmd` in the repository root with the launcher content below.

## Expected Folder Layout

After setup, the repository should look like this:

```text
Cipherbrowse/
  Cipherbrowse.cmd  (created locally)
  INSTALLATION.md
  README.md
  DOCUMENTATION.md
  Main/
    package.json
    src/
      index.js
    tools/
      win32-x64/
        mpv.exe
        yt-dlp.exe
```

`mpv.exe` and `yt-dlp.exe` are local runtime tools. If your GitHub policy blocks `.exe` uploads, do not commit them. Download or copy them onto each Windows machine during installation.

## Requirements

- Windows 10 or newer
- PowerShell or CMD
- Node.js 22 or newer, or internet access so the launcher can download portable Node.js automatically
- `mpv.exe` for image and video playback
- `yt-dlp.exe` for better video extraction

## 1. Download The Source

Download or clone the repository source without blocked binary files.

```powershell
git clone https://github.com/Kivitas/Cipherbrowse.git
cd Cipherbrowse
```

If Git is not available, download the source ZIP from GitHub, extract it, then open PowerShell in the extracted `Cipherbrowse` folder.

## 2. Build `Cipherbrowse.cmd`

Create the launcher from PowerShell in the repository root:

```powershell
@'
@echo off
setlocal
set "APP_ROOT=%~dp0"
set "ENTRY=%APP_ROOT%Main\src\index.js"

:: 1. Check if Node.js is installed globally in the system PATH
set "NODE_CMD=node"
node -v >nul 2>nul
if %ERRORLEVEL% equ 0 goto :RUN

:: 2. Check if Node.js is cached in the user profile
set "LOCAL_NODE_DIR=%USERPROFILE%\.cipherbrowse\bin"
set "NODE_CMD=%LOCAL_NODE_DIR%\node.exe"
if exist "%NODE_CMD%" goto :RUN

:: 3. Check if Node.js is cached in the project directory
set "PROJECT_NODE_DIR=%APP_ROOT%Main\.cipherbrowse\bin"
set "NODE_CMD=%PROJECT_NODE_DIR%\node.exe"
if exist "%NODE_CMD%" goto :RUN

:: 4. If Node is not found, attempt to download it automatically
echo =====================================================================
echo Node.js is required to run CipherBrowse v1.1.0, but was not found.
echo =====================================================================
echo.
echo We will automatically download a portable, lightweight Node.js
echo binary (v24.21.0) so you can run the app without installing
echo anything globally.
echo.

:: Check if curl is available
where curl >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo ERROR: 'curl' was not found on your system.
  echo Please download and install Node.js manually from: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo Downloading Node.js... Please wait.
mkdir "%LOCAL_NODE_DIR%" >nul 2>nul
curl -L -o "%LOCAL_NODE_DIR%\node.exe" "https://nodejs.org/dist/v24.21.0/win-x64/node.exe"

if %ERRORLEVEL% equ 0 (
  set "NODE_CMD=%LOCAL_NODE_DIR%\node.exe"
  goto :DOWNLOAD_OK
)

echo.
echo Retrying download to local project directory...
mkdir "%PROJECT_NODE_DIR%" >nul 2>nul
curl -L -o "%PROJECT_NODE_DIR%\node.exe" "https://nodejs.org/dist/v24.21.0/win-x64/node.exe"

if %ERRORLEVEL% neq 0 (
  echo.
  echo ERROR: Failed to download Node.js.
  echo Please check your internet connection or download Node.js manually.
  echo.
  pause
  exit /b 1
)

set "NODE_CMD=%PROJECT_NODE_DIR%\node.exe"

:DOWNLOAD_OK
echo Download complete!
echo.


:RUN
:: Verify index.js exists
if not exist "%ENTRY%" (
  echo CipherBrowse launcher error:
  echo Could not find "%ENTRY%"
  echo Keep the Main folder beside this .cmd file.
  echo.
  pause
  exit /b 1
)

:: Run the application using the determined Node binary
"%NODE_CMD%" "%ENTRY%" %*

:: If Node exited with an error, pause so the user can read the error trace
if %ERRORLEVEL% neq 0 (
  echo.
  echo [CipherBrowse v1.1.0 exited with error code %ERRORLEVEL%]
  echo.
  rem Detect if launched from Windows Explorer [double-clicked]
  echo %cmdcmdline% | findstr /i /c:"/c" >nul
  if %ERRORLEVEL% equ 0 (
    echo Press any key to close this window...
    pause >nul
  )
)
'@ | Set-Content -Path .\Cipherbrowse.cmd -Encoding ASCII
```

PowerShell writes the file with Windows line endings. If you create it manually in Notepad, save it as `Cipherbrowse.cmd`, not `Cipherbrowse.cmd.txt`.

Confirm that Windows sees the file:

```powershell
Get-Item .\Cipherbrowse.cmd
```

## 3. Install Or Rebuild mpv

CipherBrowse uses `mpv` for `/img`, `/play`, and `/playpage`. On Windows, the app first checks this local path:

```text
Main/tools/win32-x64/mpv.exe
```

Create the tools folder:

```powershell
New-Item -ItemType Directory -Force .\Main\tools\win32-x64
```

Download the Windows 64-bit mpv build from the official mpv installation page:

[mpv.io/installation](https://mpv.io/installation/)

Extract the downloaded archive, then copy `mpv.exe` into CipherBrowse:

```powershell
Copy-Item "C:\path\to\extracted\mpv.exe" .\Main\tools\win32-x64\mpv.exe
```

If the mpv archive includes support files or DLLs beside `mpv.exe`, keep them in the same folder:

```powershell
Copy-Item "C:\path\to\extracted\*" .\Main\tools\win32-x64\ -Recurse -Force
```

Important: `mpv.com` alone is not enough for this project. CipherBrowse searches for `mpv.exe` on Windows.

You can also install mpv globally and add it to `PATH`. The local `Main/tools/win32-x64/mpv.exe` path is recommended because it keeps CipherBrowse portable.

## 4. Install Or Rebuild yt-dlp

CipherBrowse uses `yt-dlp` with mpv for many video pages. The expected local path is:

```text
Main/tools/win32-x64/yt-dlp.exe
```

If your repository copy does not include `yt-dlp.exe`, download the Windows executable from the official yt-dlp release page:

[github.com/yt-dlp/yt-dlp/releases](https://github.com/yt-dlp/yt-dlp/releases)

Copy it into the tools folder:

```powershell
Copy-Item "C:\path\to\yt-dlp.exe" .\Main\tools\win32-x64\yt-dlp.exe
```

## 5. Run CipherBrowse

From the repository root:

```powershell
.\Cipherbrowse.cmd
```

If Node.js is already installed, the launcher uses it. If Node.js is missing, the launcher tries to download a portable `node.exe` into:

```text
%USERPROFILE%\.cipherbrowse\bin\
```

If that fails, it retries under:

```text
Main/.cipherbrowse/bin/
```

## 6. Verify The Installation

Start CipherBrowse:

```powershell
.\Cipherbrowse.cmd
```

At the `cipherbrowse>` prompt, run:

```text
/doctor
```

Expected tool results should show paths for `mpv` and `yt-dlp`, for example:

```text
mpv       C:\...\Cipherbrowse\Main\tools\win32-x64\mpv.exe
yt-dlp    C:\...\Cipherbrowse\Main\tools\win32-x64\yt-dlp.exe
```

Then test media playback:

```text
/s test image --images
/img 1,1
/s yt --query test video
/play 1,1
```

## 7. Optional Global CLI Install

If Node.js is installed globally, you can install the CLI command names:

```powershell
cd .\Main
npm install -g .
cbrowse
```

This installs `cbrowse` and `cipherbrowse` as command aliases. The root `Cipherbrowse.cmd` launcher is still useful for portable source-folder usage.

## 8. What Not To Commit

If your GitHub policy blocks unsigned command and executable files, keep these files local:

```text
Cipherbrowse.cmd
Main/tools/win32-x64/mpv.exe
Main/tools/win32-x64/yt-dlp.exe
Main/.cipherbrowse/
```

`Main/.cipherbrowse/` contains local runtime state, downloaded portable Node.js, keys, history, logs, and exports. It should never be committed.

If you prepare a release ZIP outside GitHub source control, you may include the rebuilt `Cipherbrowse.cmd`, `mpv.exe`, and `yt-dlp.exe` in that ZIP after checking your signing and distribution requirements.
