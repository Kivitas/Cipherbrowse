# Contributing to CipherBrowse

Thank you for your interest in contributing.

## Requirements

- Node.js `18+`
- Git

## Development Setup

```powershell
git clone https://github.com/Kivitas/Cipherbrowse.git
cd Cipherbrowse\Main
npm install
npm start
```

## Before Submitting a Pull Request

Run all checks from the `Main` directory:

```powershell
npm run check
npm run smoke
npm run verify
```

All three must pass before opening a PR.

## Structure

```text
Cipherbrowse/
  Cipherbrowse.cmd
  Main/
    src/
      index.js
      core/
      features/
    scripts/
      verify.js
    tools/
    package.json
```

## Style Guidelines

- use `"use strict"` at the top of every module
- use 2-space indentation and LF line endings
- prefer small, explicit command handlers over hidden side effects
- keep terminal output simple, readable, and consistent with the current ANSI theme
- do not hardcode machine-specific paths; route filesystem access through config/runtime helpers
- update docs when command behavior changes

## Commit Messages

Use short imperative sentences:

```text
fix: resolve bing image parse regression
feat: add /diff command for page comparison
chore: tighten verify test coverage
```

## Reporting Issues

Use GitHub Issues and include:

- OS and Node.js version
- exact commands used
- expected output vs actual output

## Security Issues

See [SECURITY.md](./SECURITY.md) for responsible disclosure.

## License

By contributing you agree your code is released under the `GNU AGPL v3.0` license.
