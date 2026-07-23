# Contributing to HiroCRM

## Setup

1. Clone the repository and install dependencies with an exact-lockfile
   install:

   ```bash
   npm ci
   ```

2. Copy the environment template and fill in the required values:

   ```bash
   cp .env.example .env
   ```

   `ADMIN_USER`, `ADMIN_PASS`, and `NEXTAUTH_SECRET` are required; generate a
   secret with `openssl rand -base64 32`.

3. Optionally load demo data:

   ```bash
   npm run seed
   ```

   This is optional. A fresh checkout starts with an empty database, and
   nothing seeds automatically during install, build, or start.

4. Start the dev server:

   ```bash
   npm run dev
   ```

## Before opening a pull request

`npm run gate` must pass, unmodified, before a pull request is opened:

```bash
npm run gate
```

This runs five stages in sequence, each gating the next:

1. `npm run build` — a production build.
2. `npm run lint` — ESLint across the codebase.
3. `npm run test` — the unit test suite.
4. `npm run check:copy` — a check on UI copy and design-token usage.
5. `npm run smoke` — API smoke assertions run against a live dev server on a
   scratch database.

CI runs this exact command on every pull request. A pull request that fails
any of the five stages will not be merged, so run it locally first.

## What governs a change

There is no separate design-document repository published alongside this
code. The reference material for how HiroCRM is supposed to behave is:

- The existing code — read the surrounding module before changing it, and
  match its conventions.
- The test suite under the codebase's test files — it encodes the behavior
  the project commits to.
- The screenshots in `screenshots/` — the current visual reference for the
  application's UI.

If a change touches behavior the tests don't cover, add a test that covers
it as part of the same pull request.

## Ideas and bugs

File both as GitHub issues on
[HiroHyun/HiroCRM](https://github.com/HiroHyun/HiroCRM/issues). Check
existing open issues first to avoid duplicates. For security vulnerabilities,
use the private reporting process in `SECURITY.md` instead of a public issue.

## Dependency versions

Every dependency in `package.json` is pinned to an exact version — no `^` or
`~` ranges — and `package-lock.json` is committed. `.npmrc` sets
`save-exact=true` so a plain `npm install` preserves that pinning.

Version bumps are deliberate changes, not routine housekeeping: a bump is
reviewed against the full `npm run gate`, the same as any other pull
request. Dependabot pull requests against this repository are advisory
signal for what's outdated, not something merged automatically — each one
still needs a human review and a green gate.

## Contribution terms

By submitting a pull request, you affirm that you have the right to submit
the work — it is your own, or you have the necessary rights to contribute
it — and you license your contribution under the Apache License, Version
2.0, the same license as the rest of this repository (see `LICENSE`).
