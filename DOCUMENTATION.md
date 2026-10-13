# CipherBrowse Documentation

This is the full command and usage reference for `CipherBrowse 1.1.0`. Requires Node.js 22 or newer.

## 1. Launching

From the repository root:

```powershell
.\Cipherbrowse.cmd
```

If `Cipherbrowse.cmd` is missing because unsigned command files are blocked, rebuild it with [INSTALLATION.md](./INSTALLATION.md).

From the app folder:

```powershell
cd .\Main
npm start
```

## 2. Input Types

CipherBrowse accepts:

- direct URLs
- slash commands
- site search commands
- image search commands
- video search commands

Examples:

```text
example.com
/s cake
/s wiki --query world war 2
/s cats --images
/s yt --query cake
/open 1
/open 2,1
```

## 3. Search

### Generic web search

```text
/s <query>
```

Example:

```text
/s cake recipe
```

### Site search

```text
/s <site> --query <text>
```

Examples:

```text
/s wiki --query world war 2
/s github --query react hooks
/s so --query react hooks
/s npm --query react
/s mdn --query fetch
```

Known site handlers:

- `wiki` / `wikipedia`
- `yt` / `youtube`
- `github` / `gh`
- `so` / `stackoverflow`
- `npm`
- `mdn`
- `reddit`
- `hn`
- `imdb`
- `amazon`
- `arxiv`
- `linkedin`
- `x`

Notes:

- site-specific APIs are used where they are more reliable than scraping
- `/s github` allows about 10 unauthenticated searches a minute per IP. Set the `GITHUB_TOKEN` environment variable to a GitHub token to raise that to about 30. Public search needs no token scopes. If GitHub rejects or limits a request, the error message is shown.
- JavaScript-heavy sites may fall back to search-engine results or video search
- search-engine domains like `google.com` fall back to normal web search instead of broken internal search pages

### Image search

```text
/s cake --images
```

Image results render in a grid and open with:

```text
/open 1,1
/img 2,1
```

### Video search

```text
/s cake --videos
/s yt --query cake
```

Video results render in a grid and open with:

```text
/open 1,1
/play 1,1
```

## 4. Navigation

```text
/open <n>
/open <col,row>
/back
/forward
/reload
/home
/next
/prev
```

Behavior:

- `/open <n>` opens a page result or numbered link
- `/open <col,row>` opens a grid item from image/video search
- `/reload` re-runs the active search mode correctly
- `/next` and `/prev` paginate the current search view

## 5. History and Saved Items

### Page history

```text
/history
/history 3
```

### Search history

```text
/searches
/searches 2
```

Notes:

- search history entries are encrypted at rest
- search history encryption uses `AES-256-GCM` with a SHA-512-derived local key
- search history entries auto-expire after `24 hours`
- page history remains local until you clear or replace it

### Bookmarks

```text
/bookmark
/bookmarks
/bookmarks 1
/bookmark-remove 1
```

### Notes

```text
/note review later
/notes
/note-delete 1
```

### Alerts

```text
/alert https://example.com
/alert check
/alert check 2
/alerts
/alert-remove 1
```

Behavior:

- `/alert <url>` saves a page to watch. It does not fetch the page yet.
- `/alert check` fetches every alert, or one alert when a number is given, and compares a fingerprint of the page's visible text with the last one saved.
- the first check records a baseline. Later checks print `CHANGED` when the text differs and `no change` when it does not.
- markup-only edits (scripts, class names, tracking parameters) do not count as changes.
- only the SHA-256 fingerprint is stored, never the page content.
- pages whose visible text changes on every load, such as timestamps or rotating ads, will report as changed each time.

## 6. Reading Pages

When a page is loaded, CipherBrowse shows:

- URL
- title
- summary line / description
- extracted text
- numbered links
- page images when available

Useful commands:

```text
/readmode
/find fetch
/summarize
/stats
/share
```

## 7. AI

### Add a key

```text
/ai set key --"gemini" -'API_KEY'
/ai set key --"openai" -'API_KEY'
/ai set key --"claude" -'API_KEY'
/ai set key --"openrouter" -'API_KEY'
```

`anthropic` works as a name for Claude, and `meta` or `llama` work as names for OpenRouter.

Ollama needs no key. CipherBrowse asks a local Ollama server at `http://127.0.0.1:11434`, which is tried last and only when no other provider answers. To use another server, set `OLLAMA_HOST` before starting CipherBrowse, for example `OLLAMA_HOST=gpu-box:11434`. A key is needed only for a hosted or proxied Ollama that requires one:

```text
/ai set key --"ollama" -'API_KEY'
```

### Delete keys for a provider

```text
/ai delete key --"openai"
```

### Show key status

```text
/aikey show
```

### Models

Each provider tries its models in order. A model that is retired or unknown to the key falls through to the next one.

| Provider | Models tried, in order |
| --- | --- |
| Google Gemini | `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-2.5-flash` |
| OpenAI | `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna` |
| Anthropic Claude | `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-5-5` |
| OpenRouter | `openrouter/auto`, `meta-llama/llama-3.3-70b-instruct`, `meta-llama/llama-3.1-8b-instruct` |
| Ollama (local, no key) | `llama3.3`, `qwen3`, `gemma3` (models must be pulled on the server first) |

Model IDs live in `Main/src/features/ai.js`. Edit that list to pin a different model.

### Ask AI

```text
/ai --query "Explain this page"
```

Behavior:

- current page context is included automatically when a page is loaded
- providers are tried in sequence when keys are present
- multiple keys per provider are supported
- if a key is rejected, the next one is tried
- if keys are rate-limited, CipherBrowse can fall through to the next configured key
- successful replies are rendered inline as `cipherbrowse> <provider> response`

Important:

- keys are stored locally
- key material is encrypted locally with `AES-256-GCM`
- the local encryption secret is stored beside the runtime data as `aikeys.secret`

## 8. Video and Image Playback

### Video

```text
/play 1,1
/play https://www.youtube.com/watch?v=...
/playpage
```

### Image

```text
/img 1,1
/img https://example.com/image.jpg
```

Playback behavior:

- `mpv` is used for display and playback
- `yt-dlp` is used to improve extraction
- for many video pages, CipherBrowse attempts to resolve a direct playable URL before opening `mpv`

Windows setup:

```text
Main/tools/win32-x64/mpv.exe
```

Download or install `mpv`, then place `mpv.exe` in that folder. CipherBrowse also checks the system `PATH`, but the local folder is the recommended setup for this project layout.

Limits:

- DRM-protected sites can still fail
- some sites require browser cookies or login state

## 9. Export

```text
/export md
/export html
/export json
/export all
```

Exports are written into:

```text
Main/.cipherbrowse/exports/
```

## 10. Recon and Diagnostics

```text
/doctor
/install-help
/install-global
/sysinfo
/log
/whois example.com
/ping example.com
/headers https://example.com
/robots https://example.com
/ssl example.com
/myip
/ipinfo 8.8.8.8
/trace
/dns example.com
/wayback https://example.com
/scan https://example.com
/extract https://example.com
/crawl https://example.com
/rss https://example.com/feed.xml
```

Notes:

- `/dns` uses Node's built-in resolver and lists A, AAAA, CNAME, MX, NS and TXT records. It needs no extra tools.
- `/wayback` asks the Internet Archive for the closest saved snapshot of a URL. A URL with no snapshot prints `No archived snapshot found.`
- `/headers`, `/scan` and `/wayback` accept only `http(s)` URLs.

## 11. Utility Commands

```text
/hash hello
/encode hello
/decode aGVsbG8=
/rot13 hello
/hex hello
/unhex 68656c6c6f
/passgen 24
```

## 12. Customization

```text
/theme green
/theme amber
/theme blue
/theme cyan
/theme white
/proxy tor
/proxy off
/alias docs=/s mdn --query
```

## 13. Storage

Runtime data is stored in:

```text
Main/.cipherbrowse/
```

Typical files:

- `state.json`
- `search-history.enc.json`
- `search-history.secret`
- `session.log`
- `aikeys.json`
- `aikeys.secret`
- `bookmarks.json`
- `notes.json`
- `alerts.json`
- `aliases.json`
- `exports/`

These files are local runtime data and should not be committed.

## 14. Local Media Tools

Optional Windows media tools live under:

```text
Main/tools/win32-x64/
```

Expected local files:

- `mpv.exe`
- `yt-dlp.exe`

These executable files are intentionally not committed when unsigned executable uploads are blocked. For playback, install mpv on PATH or place `mpv.exe` in `Main/tools/win32-x64/`. For better video extraction, place `yt-dlp.exe` in the same folder.

## 15. Verification

Run:

```powershell
cd .\Main
npm run check
npm test
npm run smoke
npm run verify
```

`npm test` runs offline unit tests for parsing, AI request building, key storage, and encryption. `npm run verify` runs live searches against third-party sites.

## 16. Repository Hygiene

The checked-in project contains source, documentation, templates, screenshots, and bundled tools. Runtime files under `Main/.cipherbrowse/` are generated locally and ignored by Git.

## 17. Screenshots

Generated screenshots are stored in:

```text
screenshots/
```
