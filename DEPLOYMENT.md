# Deploy ATHENA independently

## Runtime and storage

Use Node.js 24.19.0 or later in the Node 24 series, or Docker Engine with the Compose plugin. The app uses the built-in `node:sqlite` module. No package installation is needed.

Keep a persistent writable `DATA_DIR`. It holds `athena.sqlite`, its SQLite WAL files, and `uploads/`. Do not put this directory in a public web root, source repository or image build. Use a single application replica. Ephemeral filesystems and static hosts are unsuitable.

## Run locally

From the extracted `athena-independent` directory:

```sh
cp .env.example .env
npm run setup -- editor@example.com
npm test
npm start
```

Replace `editor@example.com` with the real editor address. Setup asks for a password of at least 14 characters and a confirmation, both hidden. No email service or email verification is used; this is a server-admin-provisioned login identity. Visit `http://localhost:3000`, then `/studio`.

If changing the local port, update both `PORT` and `SITE_URL`. The configured origin must exactly match the browser address for sign-in and writes. HTTP and non-Secure cookies are allowed for local development only.

## Deploy using Docker Compose and a domain

Use a Linux host with Docker Compose, a public IP address and persistent disk. Point your domain's DNS A record at that server. Only add an AAAA record if IPv6 really reaches the server. Allow inbound ports 80 and 443; do not expose application port 3000 publicly.

1. Transfer and extract the package on the server.
2. Create `.env` in the project directory containing your domain:

```dotenv
DOMAIN=news.example.com
```

Replace `news.example.com` with a domain you own. Do not include `https://` or a path.

3. Build the application and provision the editor:

```sh
docker compose build web
docker compose run --rm web node scripts/admin.mjs editor@example.com
```

Enter your chosen password at the hidden prompts. The account lives in the persistent `athena_data` volume.

4. Start the site:

```sh
docker compose up -d
docker compose ps
docker compose logs --tail=50 web caddy
```

The supplied Caddy configuration requests and renews HTTPS certificates when DNS and public network access are correct. Certificate issuance cannot be checked until deployment on a real host. The app's `SITE_URL` is automatically `https://` plus `DOMAIN`.

5. Open your domain, sign in at `/studio`, save a test draft, publish it, verify it in a private browser window, then archive it. Check cover uploads and article archive downloads. The newsroom is public; drafts, publishing endpoints and archive exports require an editor session.

## Deploy to another Node/Docker host

Configure:

| Setting | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `SITE_URL` | Your exact HTTPS origin, with no path or trailing slash |
| `HOST` | `0.0.0.0` inside a managed container; use loopback behind a same-machine proxy |
| `PORT` | The port assigned by the host, or `3000` |
| `DATA_DIR` | An absolute path to persistent writable storage |

Start command: `node server.mjs`. Health endpoint: `/health`.

Provide HTTPS at the hosting proxy and preserve the browser's Origin header. All browser writes must come from the configured `SITE_URL`. Keep one replica, mount the persistent disk at `DATA_DIR`, and run `node scripts/admin.mjs YOUR_EDITOR_EMAIL` in an interactive service shell using the same mounted storage. If your host cannot offer an interactive shell or persistent disk, adapt deployment before using it.

Do not deploy the production version with a blank or HTTP `SITE_URL`; it intentionally refuses that configuration. No credentials or ChatGPT headers are accepted as an alternative login mechanism.

## Backup and restore

**Article archive:** the studio's **Download article archive** exports all articles, including drafts and archived stories, as JSON. This is for portability. It excludes credentials and session records, and contains image paths rather than image bytes. No JSON import interface is included; full restores use the complete data directory.

**Full backup:** back up the entire persistent data directory, including uploads. With Compose, temporarily stop only the app while copying so the database and images form one consistent snapshot:

```sh
mkdir -p backups
docker compose stop web
docker compose cp web:/app/data ./backups/athena-data
# If the copy fails, still restart the app, then investigate the backup failure.
docker compose start web
```

Use a fresh, dated backup destination each time. Store an encrypted off-server copy. Full backups include password hashes and sessions and must remain private. Back up before upgrades and regularly thereafter. Never use `docker compose down -v` unless you intend to erase the database and uploads.

To restore, stop the app, copy the contents of a verified complete backup into its data volume, ensure ownership allows the `node` user (UID 1000) to read and write it, then restart. Do not merge an old SQLite file with newer `-wal` or `-shm` files. Restore the whole consistent directory. Re-run editor setup after a recovery to reset the password and revoke previous sessions.

## Password reset and session security

Run the same setup command again on the server to replace the editor email/password and sign out existing sessions:

```sh
docker compose run --rm web node scripts/admin.mjs editor@example.com
```

There is no password-reset email service. Only a hosting administrator with server access can reset the account. Passwords are stored as salted scrypt hashes; session tokens are hashed in the database. Production cookies are HttpOnly, Secure and SameSite=Strict and expire after eight hours. Writes require the session's CSRF token and the configured Origin. Sign-in has a persistent eight-attempt, fifteen-minute global limit for the single editor; server account reset clears the lockout. This global limit favours restricting guessing and can temporarily block a legitimate editor during an attack.

Image uploads accept JPEG, PNG and WebP signatures, reject SVG, and are capped at 5 MB. Image processing/optimisation is not included. Only upload images you have permission to publish. Uploaded images are public assets when their URLs are known; do not use uploads for confidential documents.

## Editing conventions

The editor stores plain text with blank lines between paragraphs. `## ` introduces a section heading. Full `https://` source URLs become links in published articles. Arbitrary HTML is escaped; it does not execute. This is intentionally not a full Markdown or rich-text editor.

Saving an older version of an article returns a conflict instead of overwriting a newer edit in another tab. Copy unsaved text before reloading to resolve a conflict. Drafts are saved explicitly; there is no autosave. The editor warns before discarding unsaved changes.

Archiving is reversible and does not delete uploaded images. Keep an eye on storage as image uploads accumulate.

## Verification performed for this release

Automated HTTP-level tests passed for account sign-in, anonymous-access rejection, ignoring platform identity headers, CSRF and Origin enforcement, private drafts, publishing, safe text rendering, optimistic edit conflicts, valid image upload, SVG and oversized-upload rejection, article export, archiving and restoration, database/image persistence after restart, logout revocation, production cookie flags, persistent sign-in throttling, and refusing insecure production configuration.

All application JavaScript was syntax checked. The new browser editor has not been interactively tested in this environment. Docker was unavailable here, so the container build, real-domain HTTPS issuance and external hosting deployment remain to be verified on your host. The Node application itself was exercised locally against a real SQLite database.

## Maintenance and references

Keep Node.js 24 and the Caddy image patched, test upgrades before applying them, and retain backups. The supplied Node image is pinned to the tested runtime version; review and update that pin as security patches become available.

Primary runtime/deployment references:
- https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
- https://caddyserver.com/docs/quick-starts/https
- https://caddyserver.com/docs/running
- https://docs.docker.com/compose/how-tos/production/

## Railway deployment notes

Railway is an available external-hosting option. Deploy this Dockerfile as a single web service, attach a volume at `/app/data`, and generate its public HTTPS domain. Configure `SITE_URL` to that exact domain before using the editor. Use Railway's HTTPS ingress directly; the Caddy service is for the self-managed Compose route and is not required on Railway.

Railway documents that its volumes are mounted as root and instructs non-root Docker images to use `RAILWAY_RUN_UID=0`. Apply that documented setting if using this image with a Railway volume, or provision a supported volume-permissions arrangement before deployment. Keep the service in its normal container isolation and never expose database files publicly. Run the editor setup in the running service's interactive shell, with the volume mounted; pre-deploy commands do not have the volume.

A Railway account must be connected before deployment can be performed on your behalf. No Railway service, volume, domain or paid plan has been created by this package.

References: https://docs.railway.com/volumes and https://docs.railway.com/guides/docker-compose
