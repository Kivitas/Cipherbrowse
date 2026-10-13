# Changelog

All notable changes to CipherBrowse. Earlier 1.0.x releases are recorded in the git history (`git log`).

## 1.1.0 - 2026-10-13

### Fixed

- AI commands never reached a provider. The key store is async, but `/ai`, `/aikey show` and `/doctor` read it synchronously, so every provider looked unconfigured.
- `/ai set key` reported "Added" for duplicate keys and did not wait for the write to finish.
- `/export html` wrote page text and titles without escaping. Entity decoding can produce literal `<` characters, so exported files could contain live markup.
- `/play` and `/img` passed any argument to `mpv`. Input starting with `--` could set mpv options such as `--script=`. Only `http(s)` URLs and existing local files are accepted now.
- `curl`-backed commands (`/headers`, `/scan`, and others) could receive input that curl parses as an option. Only `http(s)` targets reach curl now.
- Rate-limit detection matched any error containing "tokens", so a request-size error could make CipherBrowse try every saved key.
- Model fallback did not recognize Anthropic's `not_found_error` type or retired models.
- `/passgen` had modulo bias and no length limits. It now uses `crypto.randomInt` and clamps the length to 8-256.
- `/export` and `/doctor` wrote files before the data folder was guaranteed to exist.

### Security

- The Gemini API key moved from the request URL to the `x-goog-api-key` header, so it no longer appears in URLs, logs or error text.

### Changed

- AI model lists updated. Claude: `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-5-5`. OpenAI: `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna`. Gemini: `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-2.5-flash`. `gemini-2.0-flash` and `gemini-1.5-flash` are retired.
- The AI provider set is now Gemini, OpenAI, Anthropic (Claude), OpenRouter, and Ollama. The 1.0 `meta` provider is OpenRouter. Keys already stored under `meta` move to `openrouter` automatically, and `meta` and `llama` still resolve as names.
- A model that returns HTTP 404 now falls through to the next model for every provider.
- Requires Node.js 22 or newer. Node 18 and 20 are past end of life. The portable Node in the launcher is now v24.21.0.
- `/alert` now checks pages. The old version only saved URLs.
- Duplicate HTTP fetch code merged into one implementation.
- About 300 lines of unused banner code removed from `src/index.js`.
- CI runs unit tests and a smoke test on Node 22 and 24. The live `verify` job runs only on pushes to `main`, so upstream site changes do not block pull requests.
- `.editorconfig` line endings match the repository's LF policy. Windows scripts stay CRLF.

### Added

- Ollama provider. It runs against a local server with no key, `OLLAMA_HOST` selects another server, and a key is optional for hosted Ollama. `/doctor` reports whether the server is running.
- `/alert check [n]` monitors pages for visible-text changes. The first check records a baseline. Only SHA-256 fingerprints are stored.
- `/dns <domain>` lists A, AAAA, CNAME, MX, NS and TXT records using Node's built-in resolver.
- `/wayback <url>` finds the closest Internet Archive snapshot.
- Offline unit test suite (`npm test`, 25 tests) for parsing, AI request building, key storage, encryption and the new recon helpers.
- Dependabot configuration for GitHub Actions.
- `CHANGELOG.md` and a "Adding or Changing a Command" section in `CONTRIBUTING.md`.

### Removed

- `test-curl.js`, an unused debug script at the repository root.
