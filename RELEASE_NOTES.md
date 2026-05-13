## v2.3.5 — Reliability & UX Fixes + E2E Testing

### Bug Fixes

- Stop the WebSocket bridge from spamming `/api/health` and reconnect attempts.
  - The background bridge client now single-flights the connect path, dedupes
    pending reconnect timers, and only initializes the keepalive alarm once.
  - The keepalive alarm period was raised from 24s to 60s; it still wakes the
    service worker and reconnects only when the socket is not OPEN.
- Fix first-time AI provider setup: adding a model used to require two tries.
  - Settings persistence now queues `chrome.storage` reads/writes so concurrent
    provider/model updates no longer overwrite each other.
  - `loadFromStorage` now self-heals when `activeModel` is missing from the
    active provider, instead of leaving the panel in an "AI not configured" state.
  - Adding a duplicate model name no longer silently fails; if the provider is
    active and has no `activeModel` yet, the existing model is activated.
- Sidepanel header in English locale: keep the Settings button reachable.
  - The sidepanel body `min-width` was lowered from 350px to 280px so the
    document no longer forces a horizontal scroll when users shrink the
    Chrome side panel below 350px — which was the actual reason the
    Settings button slid out of view.
  - Both header sections now share the available width, and the tab/AI Agent
    labels (and the Classify/Dedup labels) collapse to their icons below
    ~400px so the Settings/Theme buttons are never clipped at common
    side-panel widths.
  - The settings drawer maximum width is bumped from 360px to 420px, while
    still respecting narrower viewports.
- Tab list titles now fill the entire row.
  - Removed the 60-character title clamp; row width and `truncate` decide the
    cut-off naturally.
  - Hover action buttons (summarize / save / open / close) are now overlaid
    above the row with a subtle backdrop, so they only cover the title while
    hovering, instead of permanently stealing layout space.
- Misc TypeScript hygiene: `useRef<typeof setTimeout>` now has an explicit
  initial value to match React 19's stricter typings.

### Testing

- Added Playwright E2E scaffolding for the Chrome extension.
  - New scripts: `npm run test:e2e`, `npm run test:e2e:ui`, `npm run playwright:install`.
  - Tests load the production build from `extension/dist/chrome-mv3` via
    `chromium.launchPersistentContext`, following the WXT-recommended setup.
  - Initial regression coverage:
    - **AI provider persistence**: adding a provider + model once activates and
      persists `activeModel`, and survives a reload.
    - **Sidepanel layout**: long titles take the full row width at 320px
      viewport; hover actions appear on hover.
    - **Bridge request volume**: with a local probe server on port 3456, the
      extension performs exactly one `/api/health` call and one WebSocket
      upgrade in the first ~8s. The probe test is automatically skipped if the
      port is already in use locally.

### Repository

- `.gitignore`: ignore `extension/test-results/` and `extension/playwright-report/`.
- Removed the obsolete `STORE_COPY.md` (the canonical store-listing copy lives
  with the release-time materials, not in the repo root).

### Notes

- Local builds may previously fail with "library load disallowed by system
  policy" or "The service was stopped" on macOS if `node_modules`'s native
  binaries (`@esbuild/darwin-arm64`, `@rollup/rollup-darwin-arm64`) carry the
  `com.apple.quarantine` attribute. If you hit this, run:
  ```
  xattr -dr com.apple.quarantine extension/node_modules/@esbuild extension/node_modules/@rollup
  ```
- No manifest, permission, or persisted-data changes; this release is safe to
  install over v2.3.4 without re-configuring AI providers.
