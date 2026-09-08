# Hybrid deployment

The same Canadian retirement engine and interface run in three environments. This guide describes the current source; the existing v1.0.0 release assets have not been replaced.

| Environment | Runtime | Saved plan | Synchronization |
| --- | --- | --- | --- |
| GitHub Pages or another static host | HTML, CSS and JavaScript only | localStorage in the visitor's browser | BroadcastChannel between tabs on the same origin/project |
| Docker / Unraid / Node.js | Node.js 22, Express and Socket.IO | `DATA_DIR/config.json`, `scenarios.json`, `backups/` | Socket.IO; HTTP refresh every 15 seconds when live sync is unavailable |
| Extracted offline ZIP | Local `file:` pages | Browser local storage through `storage.html` | Shared storage across page navigation; reopen another window to refresh it |

All calculation workers run in the browser. The server also offers `/api/projection` for authenticated scripting. The static site has no API, telemetry, CDN dependency or financial-data upload. Hosting providers still serve and can log ordinary asset requests. Browser plans and automatic snapshots are not encrypted. Portable JSON exports can optionally use password encryption.

## Build and publish a static site

From the repository root, with Node.js 22+:

```bash
node scripts/build-static.js
python -m http.server 8080 --directory dist/pages
```

Open `http://localhost:8080/`. Publish only `dist/pages`; the build copies only `src/public`, regenerates the dedicated pages and offline worker bundle, writes a static runtime configuration, and adds `.nojekyll`. No npm installation is required to build the static artifact. The output directory is fixed and checked before replacement.

GitHub Pages installation is documented in the [README](../README.md#github-pages--static-hosting). The [workflow](../.github/workflows/pages.yaml) runs calculation, storage, HTTP, browser and Docker checks. The Docker workflow calls those checks, publishes `linux/amd64` and `linux/arm64` images, and deploys `src/public` to Pages on each main/master push. A manual run on those branches also publishes. Select **GitHub Actions** as the Pages source first. The workflow does not alter repository visibility or publish plan files. Confirm the site's visibility when enabling Pages for a private repository. See [GitHub's workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Assets and navigation use relative paths. Both `https://example.com/` and `https://example.com/Retirement-Calculator/` work without a build-time base URL. Use the supplied `.html` links; a static host does not have the server's extensionless routes. Keep the full directory structure, including `vendor` and `icons`. Static hosting does not cache the app for a disconnected first visit; use the standalone ZIP for offline use.

## Docker and Unraid

From a checkout, prepare a persistent writable data directory, then build:

```bash
docker compose up -d --build
docker compose logs -f retirement-calculator
```

The current image runs as UID/GID `1000:1000`. Compose supports `APP_UID` and `APP_GID` overrides. A Linux bind mount must already be writable by that identity. Back up existing data before adjusting ownership. Unraid appdata is commonly owned by `99:100`; match that with `APP_UID=99` / `APP_GID=100` in Compose, or `--user 99:100` in Unraid's Extra Parameters. These are Docker user settings, not `PUID`/`PGID` environment variables consumed by the application.

Unraid mappings remain port `3333` and `/mnt/user/appdata/retirement-calculator` → `/app/data`. To use this checkout before a new release is published, build `docker build -t retirement-calculator:local ./src` and select that local image. The published `1.0.0` tag is the earlier release, not an alias for these source changes.

Compose enables a read-only root filesystem, drops Linux capabilities and prevents privilege escalation; only the data mount and temporary filesystem are writable. The Dockerfile installs locked production dependencies with `npm ci`, builds the client, and copies only runtime files into the final image. Health checks use `/healthz`, which returns readiness only and is accessible without authentication. Termination stops new connections and allows queued writes to complete.

Set `BASIC_AUTH_ENABLED=true`, `BASIC_AUTH_USER` and `BASIC_AUTH_PASS` to protect pages, API requests and Socket.IO. Missing credentials prevent startup. Health is intentionally excluded. For access beyond a trusted LAN, use HTTPS through a reverse proxy or private VPN; Basic Auth alone does not encrypt traffic. A proxy must preserve the original `Host` header, forward authentication, and support WebSocket upgrades if live sync is desired. Do not cache `/api/*`, `/runtime-config.js` or authenticated responses. The app rejects cross-origin writes and Socket.IO handshakes.

Run one server process per data directory. This is one shared household plan, not a multi-user account service. Writes are serialized and snapshots are capped at 30. The last successful whole-plan save wins; configuration editors preserve unsaved edits when another window updates the saved plan. For consistent full backups, stop the container and copy the entire data directory, including scenarios.

## Upgrading and moving plans

1. Export the current plan as JSON. Back up the full server data directory if you use Docker; scenario collections are separate from the exported main plan.
2. Stop the old server before changing its image or data-directory ownership. Retain the same `/app/data` mapping.
3. Build/restart the new version. The server normalizes the existing configuration and snapshots it before any normalization changes. Missing files initialize neutral defaults; malformed existing files report an error instead of being silently replaced.
4. On a static site, the app first reads the project-specific `state-v3` localStorage record. If absent, it reads the earlier IndexedDB plan, then the old `state-v2` / `retirement-*-v1` local-storage records. The first successful change writes the complete state to localStorage. Legacy records are retained for rollback and are not updated.
5. Check the displayed household and balances, then export a fresh JSON copy. Keep exports before changing hostnames, ports, project paths, browsers or offline folders: these can change the storage location.

Older deployments used origin-wide browser keys. If several calculators previously shared those keys, each new project can initially copy that same legacy plan; verify the imported household. New saves are isolated by project path, although other scripts on the same web origin can access browser storage. Browser preferences and the server's last confirmed cached plan use separate keys from static plans.

Both static and offline modes now write to localStorage. HTTPS/localhost browsers with Web Locks serialize multi-tab edits; use one editing window on other hosts or when Web Locks is unavailable. Its single state record prevents partial plan/scenario/backup updates; edit it in one window at a time. In all browser modes, quota or storage denial reports a failed save and leaves the last saved state intact. Browser clearing, private browsing and device loss can remove all local plans and backups. Export Plan regularly.

Switching between Docker and Pages is deliberate: export on the source installation and import on the destination. Scenarios must be exported individually as plans if they need to move too. There is no automatic upload or reconciliation between installations.

## Server interruptions

Server mode is fixed by `/runtime-config.js`. An API or WebSocket failure never changes the persistence destination. Without WebSockets, HTTP saves continue and background refresh provides synchronization. Without the API, the interface reports **Server offline · saves unavailable** and may display the last confirmed cached plan. A failed request can be ambiguous if its response was lost after a successful disk write; reconnect and inspect the saved plan before applying an alternative.

Export Plan preserves the edits currently in a page. Failed saves are not queued for automatic replay. Reload or reopen after reconnecting; import an exported alternative only when you intend to replace the saved plan. A failed initial load without a cache displays an error, not a newly saved household.

## Code map and verification

| File | Responsibility |
| --- | --- |
| `src/public/engine.js`, `planning-core.js` | Shared calculations for browser, workers and Node |
| `src/public/plan-schema.js` | Common plan validation and normalization |
| `src/public/runtime-config.js` | Explicit static default; dynamically replaced by the server |
| `src/public/storage.js` | Stable `AppStorage` interface and server transport, caching and sync |
| `src/public/browser-store.js` | Browser storage, Web Locks, read-only IndexedDB migration and offline bridge client |
| `src/server-store.js` | Serialized filesystem persistence, flushed atomic replacement and backups |
| `src/public/worker-tasks.js` | One task dispatcher shared by HTTP and offline workers |
| `src/build-client.js` | Dedicated pages and offline worker source generation |
| `scripts/build-static.js` | Deployable static artifact |

Run the checks from the repository root:

```bash
cd src
npm ci --ignore-scripts
npm test
cd ..
node scripts/build-static.js
python -m pip install -r src/test/requirements.txt
python src/test/public-ux-smoke.py
python src/test/static-smoke.py
python src/test/dual-mode-smoke.py
python scripts/package-standalone.py
```

Browser tests default to installed Edge. For Chromium, install it with `python -m playwright install chromium` and set `BROWSER_CHANNEL=chromium`. Set `NODE_EXE` if Node is not on PATH. Tests use temporary data and do not modify a live household. CI installs Chromium and also builds/runs the hardened Docker image, checks authentication/health and verifies that data survives restart.

The lockfile includes a `qs` override to use the patched 6.16 line while Express 4 declares an older compatible dependency range. Review the override when updating Express. Dependency audits complement these tests; they do not validate tax assumptions. Tax model scope and limitations remain in the [calculation notes](calculation-notes.md).

Public onboarding, demo isolation, encrypted backups and security findings are described in the [security review](security-review.md) and [README](../README.md).
