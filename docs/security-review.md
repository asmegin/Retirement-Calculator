# Security review and completion record

Reviewed 2026-09-08 against the requested hybrid/public application checklist. This review covers repository code and tests against temporary local servers, static hosting and offline files. It is not a penetration test of a deployed Unraid host, reverse proxy, GitHub account or physical iOS device.

## Completed requirements

| Requirement | Result |
| --- | --- |
| Relative paths and explicit deployment mode | Shared client works at root/project paths and from extracted files. Static mode makes no API or Socket.IO requests. Docker retains authoritative REST persistence and live sync. |
| Static browser storage | New state writes use project-specific IndexedDB transactions. Earlier localStorage and IndexedDB plans migrate on first save without deleting originals. Atomic read/modify/write transactions preserve concurrent tab updates. |
| iOS home screen | Apple standalone/status/title tags, 180 px touch icon, 192/512 px PNG icons and a relative web manifest are included in every generated view. |
| Discreet display | Eye toggle masks amounts, numeric inputs, monetary selectors, table figures and charts. The preference persists locally; calculations and exports retain actual values. |
| Optional encrypted backups | Versioned plain JSON or AES-256-GCM encrypted envelopes; automatic detection, password dialog and legacy raw JSON compatibility. |
| Three-step onboarding | Ages/province/retirement, income/spending period, then core account balances. Skip is available at each step. |
| Demo profiles | Fictional couple and business/rental investor; visible badge and separate browser workspace, including when opened on Docker. Start My Own Plan returns to the personal plan or fresh setup. |
| Privacy notice | Client-side assurance in static mode; accurate own-server notice in Docker. Demo notice explicitly identifies browser-only fictional data. |
| Publishing pipeline | Shared checks gate publication; QEMU/Buildx builds amd64 and arm64 images. The Docker workflow deploys `src/public` to Pages on main/master pushes using the requested Pages action versions. |

## Findings and fixes

| Finding | Impact | Remediation and evidence |
| --- | --- | --- |
| Raw filesystem error messages in several API responses | Disk failures could disclose internal paths or runtime details. | Routes now use a central error handler. Unexpected errors return a generic message; detailed errors stay in server logs. A forced missing-backup-directory test verifies 500 responses omit paths and stack details. |
| JSON normalization accepted dangerous object keys | `Object.assign` could adopt attacker-controlled object prototypes or select inherited strategy entries. | Recursive validation rejects `__proto__`, `constructor` and `prototype` before normalization. Strategy lookup uses an own-property check; projection query values use an allowlist. Hostile-input tests verify rejection and unchanged saved plans. |
| Unbounded planning lifespan / oversized structures | A short hostile request could cause excessive synchronous calculation or memory use. | Validation bounds lifespan, birth/retirement ages, numeric values, nesting, collection sizes, UTF-8 payload size and simulation results before persistence. Huge-horizon requests are rejected before calculation. This is per-request protection, not a claim of resistance to unlimited request flooding. |
| Backup restore filename validation depended on platform path rules | Different Windows/Linux separators and alternate-stream syntax complicated review. | Restore accepts only a restricted basename ending in `.json`; traversal, backslashes, absolute paths and colon syntax are rejected. |
| Imported labels rendered in HTML | Names embedded in results could become active markup. | Dashboard warnings, detail rows and timeline use escaped text; backup names use DOM text nodes. Hostile imported HTML is tested in rendered output. Forms, demos, errors and new dialogs use text/value properties for user content. |
| Exported backups exposed all household data | Anyone with the unencrypted file could read financial details. | Optional password encryption is available. It is never silently downgraded to plaintext. Browser/server storage and automatic snapshots remain unencrypted. |
| Public demos could otherwise overwrite an existing household | Exploring examples could damage the personal plan or shared server state. | Demos use an independent browser store; switching profiles and editing demos do not write personal/server state. Tests cover both static/file and server usage. |

## Cryptographic design

Encryption uses the browser's Web Crypto implementation, not a custom cipher:

- Each export generates a fresh 16-byte random salt and 12-byte random IV with `crypto.getRandomValues`.
- PBKDF2 with SHA-256 and 250,000 iterations derives a non-exportable AES-256-GCM key.
- AES-GCM uses a 128-bit authentication tag. GCM needs no zero-padding; the browser appends/verifies its tag. Canonical padded base64 encodes binary fields without corrupting Unicode plaintext or passwords.
- Import validates version, base64, lengths and a bounded integer iteration count (100,000–1,000,000) before deriving the embedded key parameters. This prevents an attacker from supplying a pathological work factor.
- Wrong-password or authentication-tag failure reports **Incorrect password**, leaves the saved plan intact and allows retry/cancellation. Corruption can cause the same failure; the program cannot distinguish it from a wrong password.
- Passwords are not written to browser storage, plan data, URLs, server requests or logs. Dialog values are cleared after success or cancellation. JavaScript strings cannot be reliably zeroized; no stronger memory-erasure claim is made.
- Native AES-GCM performs authentication checking; there is no application-level timing-sensitive password or tag comparison. Backend Basic Auth compares fixed-length SHA-256 digests using `crypto.timingSafeEqual`.

Tests independently decrypt browser-compatible exports using Node's PBKDF2 and cipher API, then check Unicode round trips, random IV/salt uniqueness, tampering, wrong passwords and malformed metadata. Browser tests verify the actual export/import dialogs and preservation of the current plan.

Web Crypto requires a secure context. HTTPS and localhost work; supported offline browsers also expose it for local files. Plain HTTP on an Unraid LAN address may not provide it, so the UI explains how to use an HTTPS or offline copy. See [Web Crypto key derivation](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey) and [AES-GCM encryption](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt).

## Backend and deployment review

The server accepts configuration mutations only through validated REST routes. Socket.IO sends saved configuration updates and does not register a client configuration-write handler. HTTP Basic Auth covers pages, runtime configuration, API and Socket.IO handshakes when explicitly enabled through environment variables. With authentication unset it is disabled; explicitly enabling it without both credentials fails startup. Credentials are never emitted by the runtime script or system endpoint. `/healthz` exposes readiness only.

Writes remain serialized, flushed to a uniquely named temporary file and atomically renamed. Automatic snapshots precede changes and are capped at 30. Corrupt existing files fail visibly. Tests exercise concurrent saves, snapshot uniqueness, restoration, corrupt data and injected replacement failure.

The container runs without root privileges and supports read-only root filesystems, dropped capabilities and a persistent data mount. CI builds/runs the image and checks health, authentication and restart persistence. Multi-platform builds follow [Docker's QEMU/Buildx workflow](https://docs.docker.com/build/ci/github-actions/multi-platform/). Apple metadata follows [Apple's web app configuration guidance](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html).

## Practical limits

- This is a shared household server, not a public multi-tenant service. Use authentication plus HTTPS or a private VPN for remote access. Configure any internet-facing reverse proxy for appropriate access and rate limits.
- Browser display masking is not encryption. Anyone with access to the browser profile or server data directory can read unencrypted saved state. Encrypted exports still depend on password strength.
- Browser storage can be cleared or fill up. Offline file pages should be edited in one window at a time. Hosted browser plans use IndexedDB transactions across tabs. A failed storage write leaves the last saved record intact and reports failure.
- No site was published and no GitHub repository visibility was changed during this local implementation. Automatic Pages deployment begins after the updated workflow is pushed and Pages is configured to use GitHub Actions.
- Docker runtime checks require a Docker-capable runner. Local tests cannot certify an Unraid host or physical iOS installation.

Run `npm test` in `src`, then build static assets and run `public-ux-smoke.py`, `static-smoke.py` and `dual-mode-smoke.py` as described in the [deployment guide](hybrid-deployment.md).
