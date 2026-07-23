# Operations guide

This document covers running HiroCRM in production: build and start,
required configuration, process supervision, storage and permissions,
backup and restore, retention, upgrades, and what environments are
unsupported. For local development, see the repository's README.

## Node version

HiroCRM requires Node `>=24.17.0 <25`, as declared in `package.json`'s
`engines` field. `.npmrc` in this repository sets only `save-exact=true`;
it does not set `engine-strict`, so `npm ci` prints a warning rather than
failing outright on an out-of-range Node version. Run the version this
declares — an out-of-range Node is not a tested configuration.

## Build and run

Build a production bundle, then run it:

```bash
npm run build
npm run start
```

`npm run dev` starts the Next.js development server and is for local
development only — do not run it in production.

## Required environment variables

Set these in `.env` (copy `.env.example` as a starting point) or in the
environment the process runs under:

| Variable | Required | Purpose |
| --- | --- | --- |
| `ADMIN_USER` | Yes | The shared administrator login username. |
| `ADMIN_PASS` | Yes | The shared administrator login password. |
| `NEXTAUTH_SECRET` | Yes | The JWT signing secret NextAuth uses for sessions. |
| `NEXTAUTH_URL` | Required whenever the origin is not `http://localhost:3000` | The public origin HiroCRM is served from, so auth callbacks resolve correctly. |

Generate `NEXTAUTH_SECRET` with:

```bash
openssl rand -base64 32
```

With `ADMIN_USER` or `ADMIN_PASS` unset, authentication refuses every login
attempt. Rotating `NEXTAUTH_SECRET` invalidates existing sessions — everyone
signed in has to sign in again.

## Reverse proxy and HTTPS

Put HiroCRM behind a reverse proxy that terminates HTTPS whenever it is
reachable beyond a fully trusted private network — for example, anywhere
reachable over the public internet, or from a network segment shared with
untrusted devices. The application itself does not terminate TLS; it
expects a proxy (nginx, Caddy, or similar) in front of it to handle
certificates and forward plain HTTP to the Node process on a private
interface or loopback address.

## Process supervision

Run the process under a supervisor so it restarts on crash and on host
reboot. A complete `systemd` unit example:

```ini
# /etc/systemd/system/hirocrm.service
[Unit]
Description=HiroCRM
After=network.target

[Service]
Type=simple
User=hirocrm
Group=hirocrm
WorkingDirectory=/srv/hirocrm
EnvironmentFile=/srv/hirocrm/.env
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Adjust `User`, `Group`, and `WorkingDirectory` to match where HiroCRM is
deployed and which system account owns its files. Enable and start it with:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hirocrm
```

Check status and logs with `systemctl status hirocrm` and
`journalctl -u hirocrm -f`.

## Storage and permissions

HiroCRM needs a persistent, writable filesystem for two things at the
project root:

- `dev.db`, plus its `-wal` and `-shm` sidecar files while the process is
  running.
- `data/uploads/`, where uploaded screenshot files live.

The system account the process runs under (`User=hirocrm` in the unit
example above) needs read and write permission on both. Create the
`data/uploads/` directory ahead of time if the deploying user's umask would
otherwise leave it unwritable by the service account:

```bash
mkdir -p /srv/hirocrm/data/uploads
chown -R hirocrm:hirocrm /srv/hirocrm
```

Run exactly one instance of HiroCRM against a given `dev.db` file. SQLite's
write-ahead log assumes a single writer process; running two instances
against the same database file is unsupported and risks corrupting it.

## Backup

`dev.db` (with its `-wal` and `-shm` sidecars, or an equivalent SQLite-level
backup) and `data/uploads/` must be backed up and restored as one atomic
set. Restoring only one half leaves either upload files with no lead
referencing them, or leads whose screenshot references point at files that
aren't on disk.

Shut the application down before backing up, so the write-ahead log
checkpoints into `dev.db` and the file on disk is complete and consistent:

```bash
sudo systemctl stop hirocrm
cd /srv/hirocrm
tar czf /srv/backups/hirocrm-$(date +%Y%m%d-%H%M).tar.gz dev.db data/uploads
sudo systemctl start hirocrm
```

A clean shutdown checkpoints the write-ahead log into `dev.db` and removes
the `-wal` and `-shm` sidecars, so `dev.db` on its own is the complete
database at that point. Naming the sidecars explicitly in the `tar` command
above would make it fail once they are gone.

To capture a backup without stopping the service, use SQLite's own online
backup instead of copying files, then archive the result together with the
uploads:

```bash
cd /srv/hirocrm
sqlite3 dev.db ".backup '/tmp/hirocrm-snapshot.db'"
tar czf /srv/backups/hirocrm-$(date +%Y%m%d-%H%M).tar.gz \
    -C /tmp hirocrm-snapshot.db -C /srv/hirocrm data/uploads
rm /tmp/hirocrm-snapshot.db
```

Copying `dev.db` with `cp` or `tar` while the service is running produces a
torn file: the sidecars hold writes that the main file does not yet contain.

Keep backups on separate storage from the production host, and keep more
than one generation in case a recent backup turns out to be bad.

## Restore drill

Test a restore into a separate location before trusting a backup, without
touching the production instance:

```bash
mkdir -p /srv/hirocrm-restore-test
cd /srv/hirocrm-restore-test
tar xzf /srv/backups/hirocrm-<timestamp>.tar.gz
# archives made with the online-backup method above hold the database under
# its snapshot name; the application expects dev.db
[ -f hirocrm-snapshot.db ] && mv hirocrm-snapshot.db dev.db
cp -r /srv/hirocrm/node_modules /srv/hirocrm/.next /srv/hirocrm-restore-test/ 2>/dev/null || true
```

From `/srv/hirocrm-restore-test`, with a `.env` pointing at a distinct port
(set `PORT=3001` and, if the origin differs, `NEXTAUTH_URL` to match), run:

```bash
npm run start
```

Sign in and confirm the lead count, a specific lead's touchpoint history,
and that lead's screenshot render correctly. Once confirmed, stop the test
instance and delete `/srv/hirocrm-restore-test`. Run this drill after
setting up backups for the first time, and periodically afterward, so a
real restore isn't the first time the procedure is exercised.

## Retention

`scripts/retention.mjs` (`npm run retention`) is an optional cleanup sweep.
It is dry-run by default — without `--apply` it only prints the plan and
writes nothing. It runs three phases in order:

1. Delete leads archived at least `--delete-days` ago (default `1825`),
   along with their touchpoints and screenshot files.
2. Strip screenshots from leads archived at least `--image-days` ago
   (default `365`), leaving the lead row intact.
3. Remove files under `data/uploads/` that no lead references and that are
   older than 24 hours.

Every database write commits before any file is unlinked, so an interrupted
run does not leave the database referencing a file that was already
deleted.

Schedule it with cron using an absolute `cd` and an absolute path to `node`,
since cron jobs do not run with the project directory as their working
directory and a bare `npm` may not be on cron's `PATH`:

```
0 3 * * 0 cd /srv/hirocrm && /usr/bin/node scripts/retention.mjs --apply >> /var/log/hirocrm-retention.log 2>&1
```

Run a dry run (without `--apply`) after any change to `--delete-days` or
`--image-days` before trusting `--apply` with the new values.

## Upgrading

1. Take a backup per the [Backup](#backup) section above.
2. Shut the service down: `sudo systemctl stop hirocrm`.
3. Fetch the new release (`git fetch` and check out the target tag, or
   replace the deployed source with the new release archive).
4. Install dependencies for the pinned versions in the new release:
   `npm ci`.
5. Rebuild: `npm run build`.
6. Start the service: `sudo systemctl start hirocrm`.
7. Confirm the application signs in and loads the dashboard, and check
   `journalctl -u hirocrm` for errors.

Read the release notes for the version being installed before upgrading —
a schema change that requires special handling of an existing `dev.db`
will be called out there. Keep the backup from step 1 until the new version
is confirmed working.

## Unsupported

- Ephemeral filesystems, where local disk writes do not survive a restart
  or a new container instance.
- Serverless platforms, where there is no persistent process or no
  persistent local disk to hold `dev.db` and `data/uploads/`.
- Multiple instances of HiroCRM writing to the same `dev.db` file.

HiroCRM assumes a persistent, single-instance filesystem for its database
file and its upload storage.
