# CipherBrowse Package Documentation

The repository-level usage guide lives at:

- [../DOCUMENTATION.md](../DOCUMENTATION.md)

This file is kept short so the npm package still ships a documentation entry inside `Main/`.

## Local Development

```powershell
npm start
npm run check
npm run smoke
npm run verify
```

## Entrypoint

```text
src/index.js
```

## Bundled Tools

```text
tools/win32-x64/mpv.exe
tools/win32-x64/yt-dlp.exe
```

`mpv.exe` is optional and not committed in the source repo because the Windows binary exceeds GitHub's normal file size limit. For video and image playback on Windows, install `mpv` and place the executable at:

```text
tools/win32-x64/mpv.exe
```

## Local Storage

Runtime files are generated under `.cipherbrowse/`. Search history is encrypted in `search-history.enc.json` with `AES-256-GCM` and a SHA-512-derived local key, and entries expire after `24 hours`.
