# Contributing to CipherBrowse

Thank you for your interest in contributing.

## Requirements

- Node.js `22+` (CI tests 22 and 24)
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
npm test
npm run smoke
npm run verify
```

`check`, `test` and `smoke` must pass before opening a PR. `verify` runs live searches against third-party sites; if it fails because an upstream site changed, say so in the PR rather than hiding the failure.

## Adding or Changing a Command

1. Add the handler in `src/index.js` and a `case` in `dispatch()`.
2. Add the command to `ALL_COMMANDS` and the help rows in `src/features/help.js`.
3. Put any parsing or formatting logic in a `src/features/*.js` module so it can be unit-tested without the network.
4. Add tests for that logic in `scripts/test.js`.
5. Update `DOCUMENTATION.md`, and add an entry to `CHANGELOG.md`.

## Structure

```text
Cipherbrowse/
  INSTALLATION.md
  CHANGELOG.md
  Main/
    src/
      index.js
      core/        config, network, storage, security, text
      features/    ai, page, media, recon, search, video, help
      ui/          render
    scripts/
      test.js      unit tests (node --test)
      verify.js    live smoke checks
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
