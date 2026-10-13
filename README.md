# CipherBrowse

CipherBrowse is a terminal browser and search toolkit built for plain CMD / PowerShell use. It combines text-page browsing, site-aware search, image and video search grids, mpv playback, AI prompts with user-supplied API keys, page-change alerts, exports, bookmarks, notes, and recon-style utilities in one CLI.

The source repository keeps the runnable app under `Main/`. Windows users can rebuild the optional top-level `Cipherbrowse.cmd` launcher locally with [INSTALLATION.md](./INSTALLATION.md) when GitHub or organization policy blocks unsigned command files.

## Version

`1.1.0` — see [CHANGELOG.md](./CHANGELOG.md) for what changed.

## Features

- direct page browsing from the terminal
- generic web search with `/s <query>`
- site-specific search with `/s <site> --query <text>`
- image search grids with `/s <query> --images`
- video search grids with `/s <query> --videos`
- image opening through `mpv`
- video playback through `mpv` and optional local `yt-dlp`
- AI chat with your own keys for Google Gemini, OpenAI, Anthropic Claude, OpenRouter, and Ollama (local, no key)
- page-change alerts: `/alert <url>` then `/alert check` records a baseline and reports when visible text changes
- bookmarks, notes, exports, history, and page tools
- recon utilities like `/headers`, `/dns`, `/wayback`, `/robots`, `/ssl`, `/whois`, `/trace`, `/myip`

## Launch

After rebuilding the local launcher, from the repository root:

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

- Node.js `22+` (CI tests Node 22 and 24)
- Windows
- optional local media tools under `Main/tools/win32-x64/`

If GitHub or an organization policy strips unsigned `.cmd`, `.bat`, or `.exe` files, follow [INSTALLATION.md](./INSTALLATION.md) to rebuild `Cipherbrowse.cmd` locally and install `mpv` and `yt-dlp`.

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
/alert https://example.com
/alert check
/doctor
```

## AI Commands

CipherBrowse does not ship paid AI access. Users add their own keys.

```text
/ai set key --"gemini" -'API_KEY'
/ai set key --"openai" -'API_KEY'
/ai set key --"claude" -'API_KEY'
/ai set key --"openrouter" -'API_KEY'
/ai set key --"ollama" -'API_KEY'
/ai delete key --"gemini"
/aikey show
/ai --query "Summarize the current page"
```

Ollama needs no key. With no other keys stored, CipherBrowse asks a local Ollama server (`OLLAMA_HOST`, default `127.0.0.1:11434`).

Behavior:

- multiple keys can be stored per provider
- models are tried in order; a model the key cannot use (retired or not found) falls through to the next one
- if one key is rate-limited or exhausted, CipherBrowse tries the next key
- if all configured keys fail, the CLI reports that clearly
- successful replies render inline in terminal chat form: `cipherbrowse> <provider> response`
- stored AI keys are encrypted locally with `AES-256-GCM`
- Gemini keys are sent in a request header, not in the URL

## Screenshots

Example captures are stored in [screenshots](./screenshots). They show the 1.0 interface.

## Repository Layout

```text
Cipherbrowse/
  README.md
  CHANGELOG.md
  INSTALLATION.md
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
      ui/
      index.js
    tools/
```

## Development

Useful commands:

```powershell
cd .\Main
npm run check
npm test
npm run smoke
npm run verify
```

`npm test` runs offline unit tests. `npm run verify` runs live searches against third-party sites, so an upstream change can fail it.

## Limitations

- this is a text browser, not a full JavaScript browser engine
- some search engines and sites still vary by region and anti-bot rules
- video playback needs `mpv`; install it locally or place `mpv.exe` under `Main/tools/win32-x64/`
- some video sites may still need browser cookies or upstream extractor support
- `/alert` detects changes in the page's visible text; pages that change on every load (timestamps, ads, rotating content) will report as changed

## Local Data

- runtime files are written under `Main/.cipherbrowse/`
- AI keys are stored in `aikeys.json` with local `AES-256-GCM` encryption
- the local AES secret is stored in `aikeys.secret`
- search history is stored separately in `search-history.enc.json`
- search history encryption uses `AES-256-GCM` with a SHA-512-derived local key
- the search-history secret is stored in `search-history.secret`
- search history expires automatically after `24 hours`
- alerts store only a SHA-256 fingerprint of each page's visible text, never the page itself

## License

This project is licensed under `GNU AGPL v3.0`.

## GitHub

- Owner: `Kivitas`
- Repository URL: [github.com/Kivitas/Cipherbrowse](https://github.com/Kivitas/Cipherbrowse)

## Repository Files

- [DOCUMENTATION.md](./DOCUMENTATION.md) for full command usage
- [CHANGELOG.md](./CHANGELOG.md) for release history
- [INSTALLATION.md](./INSTALLATION.md) for rebuilding the local Windows launcher and media tools
- [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow
- [SECURITY.md](./SECURITY.md) for reporting and security scope

## Full Usage

See [DOCUMENTATION.md](./DOCUMENTATION.md).
