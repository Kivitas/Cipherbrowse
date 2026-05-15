# CipherBrowse

CipherBrowse is a terminal browser and search toolkit built for plain CMD / PowerShell use. It combines text-page browsing, site-aware search, image and video search grids, mpv playback, AI prompts with user-supplied API keys, exports, bookmarks, notes, and recon-style utilities in one CLI.

This repository is structured so people launch the app from the top level with `Cipherbrowse.cmd`, while the actual app code and bundled tools live under `Main/`.

## Version

`1.0.0`

## Features

- direct page browsing from the terminal
- generic web search with `/s <query>`
- site-specific search with `/s <site> --query <text>`
- image search grids with `/s <query> --images`
- video search grids with `/s <query> --videos`
- image opening through `mpv`
- video playback through `mpv` and bundled `yt-dlp`
- AI chat using user-supplied API keys
- bookmarks, notes, alerts, exports, history, and page tools
- recon utilities like `/headers`, `/robots`, `/ssl`, `/whois`, `/trace`, `/myip`

## Launch

From the repository root:

```powershell
.\Cipherbrowse.cmd
```

Directly from the app folder:

```powershell
cd .\Main
npm start
```

## Installation

Requirements:

- Node.js `18+`
- Windows
- optional local media tools under `Main/tools/win32-x64/`

For video and image playback, install `mpv` and place the executable here:

```text
Main/tools/win32-x64/mpv.exe
```

`mpv.exe` is not committed to the repository because the Windows binary is larger than GitHub's normal file limit.

Optional global install:

```powershell
cd .\Main
npm install -g .
cbrowse
```

## Quick Start

```text
example.com
/s cake
/s wiki --query "world war 2"
/s cats --images
/s yt --query "cake"
/open 1
/open 2,1
/img 1,1
/play 1,1
/doctor
```

## AI Commands

CipherBrowse does not ship paid AI access. Users add their own keys.

```text
/ai set key --"gemini" -'API_KEY'
/ai set key --"openai" -'API_KEY'
/ai delete key --"gemini"
/aikey show
/ai --query "Summarize the current page"
```

Behavior:

- multiple keys can be stored per provider
- if one key is rate-limited or exhausted, CipherBrowse tries the next key
- if all configured keys fail, the CLI reports that clearly
- successful replies render inline in terminal chat form: `cipherbrowse> <provider> response`
- stored AI keys are encrypted locally with `AES-256-GCM`

## Screenshots

Example captures are stored in [screenshots](./screenshots).

## Repository Layout

```text
Cipherbrowse/
  Cipherbrowse.cmd
  README.md
  DOCUMENTATION.md
  CONTRIBUTING.md
  SECURITY.md
  LICENSE
  screenshots/
  Main/
    package.json
    README.md
    DOCUMENTATION.md
    LICENSE
    scripts/
    src/
      core/
      features/
      index.js
    tools/
```

## Development

Useful commands:

```powershell
cd .\Main
npm run check
npm run smoke
npm run verify
```

## Limitations

- this is a text browser, not a full JavaScript browser engine
- some search engines and sites still vary by region and anti-bot rules
- video playback needs `mpv`; install it locally or place `mpv.exe` under `Main/tools/win32-x64/`
- some video sites may still need browser cookies or upstream extractor support

## Local Data

- runtime files are written under `Main/.cipherbrowse/`
- AI keys are stored in `aikeys.json` with local `AES-256-GCM` encryption
- the local AES secret is stored in `aikeys.secret`
- search history is stored separately in `search-history.enc.json`
- search history encryption uses `AES-256-GCM` with a SHA-512-derived local key
- the search-history secret is stored in `search-history.secret`
- search history expires automatically after `24 hours`

## License

This project is licensed under `GNU AGPL v3.0`.

## GitHub

- Owner: `Kivitas`
- Repository URL: [github.com/Kivitas/Cipherbrowse](https://github.com/Kivitas/Cipherbrowse)

## Repository Files

- [DOCUMENTATION.md](./DOCUMENTATION.md) for full command usage
- [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow
- [SECURITY.md](./SECURITY.md) for reporting and security scope

## Full Usage

See [DOCUMENTATION.md](./DOCUMENTATION.md).
