# CipherBrowse Package Documentation

The repository-level usage guide lives at:

- [../DOCUMENTATION.md](../DOCUMENTATION.md)

This file is kept short so the npm package still ships a documentation entry inside `Main/`.

## Local Development

```powershell
npm start
npm run check
npm test
npm run smoke
npm run verify
```

`npm test` runs offline unit tests with `node --test`. `npm run verify` runs live checks and needs internet access.

## Entrypoint

```text
src/index.js
```

## Local Media Tools

```text
tools/win32-x64/mpv.exe
tools/win32-x64/yt-dlp.exe
```

`mpv.exe` and `yt-dlp.exe` are optional local runtime tools and are not committed in the source repo when unsigned executable uploads are blocked. For video and image playback on Windows, install `mpv` and place the executable at:

```text
tools/win32-x64/mpv.exe
```

For better video extraction, place `yt-dlp.exe` at:

```text
tools/win32-x64/yt-dlp.exe
```

## Local Storage

Runtime files are generated under `.cipherbrowse/`. Search history is encrypted in `search-history.enc.json` with `AES-256-GCM` and a SHA-512-derived local key, and entries expire after `24 hours`.
