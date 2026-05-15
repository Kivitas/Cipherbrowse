# Security Policy

## Supported Version

Current supported line:

- `1.0.x`

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
- search history is encrypted with `AES-256-GCM` using a SHA-512-derived local key
- search history is retained for at most `24 hours`
- runtime state is local and should not be committed to Git
