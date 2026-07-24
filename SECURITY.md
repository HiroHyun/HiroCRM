# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes — current preview release |
| < 0.1.0 | No |

HiroCRM is at an early preview stage. Only the `0.1.x` line receives
security fixes right now.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub's private vulnerability
reporting on this repository: open
[HiroHyun/HiroCRM](https://github.com/HiroHyun/HiroCRM), go to the
**Security** tab, and select **Report a vulnerability** to open a draft
security advisory. Do not open a public issue for a security report.

HiroCRM has a single maintainer. Acknowledgement of a report is best-effort:
expect an initial response within two weeks, not a guaranteed
service-level commitment. Include enough detail to reproduce the issue —
affected version, request or configuration that triggers it, and expected
versus actual behavior.

## Security model and boundaries

HiroCRM's design includes deliberate boundaries that are not vulnerabilities
by themselves. Understanding them helps decide what is worth reporting here.

### Shared-credential model

HiroCRM authenticates the whole team against one administrator
credential, set through `ADMIN_USER` and `ADMIN_PASS`. There is no
per-person identity, no per-action attribution, no way to revoke one
person's access without changing the shared credential, no roles, and no
MFA. "Reps" are roster labels used for lead assignment; they are not
accounts and do not require a password or a login. This model is intended
for one operator or a small, mutually trusted team, and it is documented,
deliberate behavior. A report describing this model itself — for example,
"there is no per-user audit trail" or "any team member with the shared
credential has full access" — is a known and documented design boundary,
not a vulnerability. Reports that identify a way to *bypass* authentication
entirely, read another operator's data across separate deployments, or
escalate beyond what the shared credential grants are in scope.

### Screenshot access

Screenshot bytes are stored under `data/uploads/`, outside the directory
Next.js serves statically from `public/`. Every read of a screenshot goes
through a session-guarded route, `GET /uploads/[name]`. An unauthenticated
request to that route receives `401`. An authenticated response carries the
correct image MIME type for the stored file and a `Cache-Control: private,
no-store` header. Filenames are a UUID plus a verified extension; a request
using a directory-traversal pattern or an unrecognized extension receives
`404`. There is no path under `public/` that serves upload contents, so
there is no static-file bypass of the session check.

### Upload validation

Uploads are capped at 10 MB and restricted to an image MIME allowlist. Each
upload is checked by inspecting the file's magic bytes and comparing them
against its claimed MIME type — the declared content type and file
extension alone do not decide the outcome. A request whose claimed MIME
type does not match its actual content receives `415`. A request over the
size cap receives `413`.

### Dependency advisories

Two advisory families are open, both accepted and documented below: the
`postcss` copy that Next.js bundles internally, and a nested `esbuild` copy
that `drizzle-kit` carries. `npm audit` reports both, counting six affected
records across the two dependency chains. The `esbuild` chain is
development-scoped, so `npm audit --omit=dev` narrows the report to `postcss`
alone. GitHub's Dependabot reports the same two families as three alerts, one
per advisory.

Two earlier advisory families, against `sharp` and `xlsx`, were resolved before
first publication; their resolutions are recorded below because each leaves a
visible mark in `package.json`. Every other dependency is pinned to a version
carrying no known advisory at the time of the v0.1.0 release.

### `postcss` dependency advisory (open, accepted)

Next.js pins an exact internal copy of `postcss` inside its own dependency
tree. Two advisories apply to it. GHSA-qx2v-qp2m-jg93 (moderate) reports an XSS
risk in PostCSS's stringified output, fixed in `postcss@8.5.10`.
GHSA-6g55-p6wh-862q (**high**) is fixed in `postcss@8.5.12`. Both fixed
versions are ahead of the copy Next.js currently ships. Forcing a copy the
framework pins exactly would mean building every release on a combination
Next.js has never tested, and `npm audit fix --force` proposes downgrading
Next.js to 9.3.3, which is not a viable remedy.

This copy runs at build time only, processing the repository's own
stylesheets; no user-supplied input reaches it in dev or in production.
HiroCRM's criterion for adopting the fix is the first Next.js release that
bundles `postcss@8.5.12` or later — the version that clears both advisories —
adopted through the normal dependency review and passing the full
`npm run gate`. A report restating the existing `npm audit` output for this pin
will be closed as already tracked.

### `esbuild` dependency advisory (open, accepted)

GHSA-67mh-4wv8-2f99 (moderate) reports that esbuild's development server
answers requests from any origin, letting any website read the responses it
serves. It is fixed in `esbuild@0.25.0`.

HiroCRM never runs `esbuild --serve`. The vulnerable copy is a
development-scoped nested dependency, reached only through
`drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils`, which
pins `esbuild@~0.18.20`; the top-level `esbuild` this project installs is
already past the fix, and no copy of the vulnerable one ships in a build or
runs in a deployment.

`drizzle-kit@0.31.10` is the latest published release and still carries that
chain, so no upgrade path exists — `npm audit fix --force` proposes downgrading
`drizzle-kit` to 0.18.1, which is not a viable remedy. The `@esbuild-kit/*`
packages are deprecated, merged into `tsx`, which `drizzle-kit` already depends
on; the advisory clears when `drizzle-kit` drops them. A report restating this
chain will be closed as already tracked.

### `sharp` dependency advisory (resolved)

`sharp` arrives as a dependency of Next.js, which uses it for the built-in
image optimizer. Versions before 0.35.0 carry inherited libvips advisories
(GHSA-f88m-g3jw-g9cj, covering CVE-2026-33327, CVE-2026-33328, CVE-2026-35590
and CVE-2026-35591). An `overrides` entry in `package.json` forces `sharp` to
`>=0.35.0`, clearing the advisory. The override departs from the `^0.34.5`
range Next.js declares; that departure is deliberate and carries minimal risk
here because HiroCRM sets `images.unoptimized` in `next.config.ts`, so the
`/_next/image` endpoint — the only route through which `sharp` would process
input — is never mounted and the package is never loaded at runtime. The full
`npm run gate` passes with the override in place. The override retires when a
Next.js release declares a `sharp` range that admits 0.35.0 or later on its
own.

### `xlsx` dependency advisory (resolved)

SheetJS distributes current `xlsx` releases from its own CDN
(`cdn.sheetjs.com`); the copy on the npm registry stops at `0.18.5`, which
carries prototype-pollution and ReDoS advisories. HiroCRM installs
`xlsx@0.20.3`, which includes the fixes for both (prototype pollution fixed in
0.19.3, ReDoS in 0.20.2), from `vendor/xlsx-0.20.3.tgz` — a copy of the
official SheetJS tarball committed to this repository. Its sha512 was verified
against the CDN integrity the lockfile previously recorded, so the vendored
bytes are the same bytes the project had been building against, and `npm ci`
needs no SheetJS infrastructure to be reachable.

Updating `xlsx` means replacing that tarball with the new official release,
verifying its hash against the one SheetJS publishes, and running the full
`npm run gate` before the change is committed.

Spreadsheet import remains an operator-only action behind session
authentication; it is not reachable by an unauthenticated request. The trust
boundary for this feature is the workbook itself: import spreadsheets you
authored yourself or received from a source you trust, the same way you would
treat any other document containing embedded macros or formulas from an
unknown sender.
