# Security Policy

## Supported Version

Current supported line:

- `1.1.x`

Older `1.0.x` builds receive no fixes. Upgrade to `1.1.0` or later.

## Reporting a Vulnerability

If you discover a security issue in `CipherBrowse`:

- do not publish exploit details immediately
- provide a clear description of the issue
- include reproduction steps
- include affected commands, inputs, or target URLs if relevant

## Scope

Security-sensitive areas include:

- AI key storage and runtime secrets
- command parsing and alias expansion
- spawned external tools such as `mpv`, `yt-dlp`, and `curl`
- local runtime state under `Main/.cipherbrowse/`
- URL handling for recon and extraction commands

## Notes

- AI keys are stored locally with `AES-256-GCM`
- Gemini keys are sent in the `x-goog-api-key` header, never in the request URL
- each AI key is sent only to its provider's own endpoint. A key for Ollama goes to the `OLLAMA_HOST` server, so set that variable only to a server you trust
- Ollama without a key sends no credentials. It is local by default, but page content and prompts go to whatever host `OLLAMA_HOST` names
- AI prompts include the current page's text. Do not use `/ai` on pages whose content must not leave the machine unless the provider is a local Ollama server
- search history is encrypted with `AES-256-GCM` using a SHA-512-derived local key
- search history is retained for at most `24 hours`
- `/alert` stores only a SHA-256 fingerprint of each page's visible text, never the page itself
- only `http(s)` targets are passed to `curl`, and `mpv` receives only `http(s)` URLs or existing local files, so user input cannot inject command-line options
- HTML exports escape page text and titles
- runtime state is local and should not be committed to Git
