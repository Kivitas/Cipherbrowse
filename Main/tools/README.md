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

- `npm run pkg:win` writes the packaged Windows executable to `dist/Cipherbrowse.exe`.
- Media tools are local runtime dependencies. Keep `mpv.exe`, `yt-dlp.exe`, `mpv.com`, and DLL files out of source control when unsigned executable uploads are blocked.
- This keeps the source repository portable and avoids depending on global installs.
