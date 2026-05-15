# CipherBrowse (Main Package)

This folder contains the runnable package for CipherBrowse `1.0.0`.

For repository-level usage, launcher instructions, screenshots, and the full GitHub-facing project overview, see:

- [../README.md](../README.md)
- [../DOCUMENTATION.md](../DOCUMENTATION.md)

## Package Quick Start

```powershell
npm start
node .\src\index.js --help
```

## Useful Scripts

```powershell
npm run check
npm run smoke
npm run verify
```

## Runtime Data

Local runtime files are created under `.cipherbrowse/`. Search history is stored in `search-history.enc.json` with `AES-256-GCM` and a SHA-512-derived local key, then pruned after `24 hours`.

## License

`GNU AGPL v3.0`
