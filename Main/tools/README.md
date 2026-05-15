CipherBrowse local tools

Place runtime dependencies in this folder so CipherBrowse can use them without relying on system PATH.

Recommended layout on Windows x64:

tools/win32-x64/mpv.exe
tools/win32-x64/yt-dlp.exe

`mpv.exe` is not committed to the source repository because the Windows binary is larger than GitHub's normal file limit. Download or install mpv, then place `mpv.exe` at `tools/win32-x64/mpv.exe` for local playback.

Other supported lookup folders:

tools/<platform>-<arch>/
tools/<platform>/
tools/common/

Examples:

tools/win32-x64/mpv.exe
tools/win32-x64/yt-dlp.exe
tools/darwin-arm64/mpv
tools/linux-x64/mpv

Packaging notes:

- `npm run package:exe` includes `tools/**/*` as pkg assets.
- In packaged mode, CipherBrowse extracts bundled tools into `.cipherbrowse/runtime-tools/` beside the app data folder and launches them from there.
- This keeps the app portable and avoids depending on global installs.
