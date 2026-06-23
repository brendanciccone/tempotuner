# TempoTuner

A simple tuner and metronome web app. Uses the Web Audio API to detect pitch in real-time.

## Features

- Chromatic tuner with real-time pitch detection
- Tap tempo for calculating BPM
- Dark/light mode
- Works on mobile and desktop

## Tech

Built with Next.js 16, TypeScript, TailwindCSS, and Shadcn/UI components. Audio processing uses the Web Audio API.

Deployed as a static export (`output: 'export'`) to Cloudflare Workers (static assets) — see [DEPLOY.md](DEPLOY.md). Railway remains available as a fallback via the standalone build.

## Setup

Requires Node.js 22+ and PNPM. (Next.js 16 needs at least Node 20.9; the pinned `wrangler` used by `pnpm run deploy` needs 22.)

```bash
pnpm install
pnpm dev
```

## Scripts

- `pnpm dev` - Start dev server
- `pnpm build` - Production build
- `pnpm start` - Start production server (Railway fallback only; not used on Cloudflare)
- `pnpm run deploy` - Build and deploy `out/` to Cloudflare Workers (must be `pnpm run deploy`, not `pnpm deploy`)
- `pnpm lint` - Run linter
- `pnpm test` - Run all tests
- `pnpm test:unit` - Run unit tests
- `pnpm test:integration` - Run integration tests
- `pnpm test:security` - Run security tests

## Project Structure

```
app/          → Next.js pages and layouts
components/   → React components (tuner, metronome, UI)
hooks/        → Custom hooks
utils/        → Audio processing utilities
tests/        → Unit, integration, and security tests
```

### Test Types

- **Unit** (`tests/unit/`) — 47 tests covering audio processing, note detection, tuner initialization, and the `useTuner` hook orchestration (including secure-context detection, mediaDevices feature detection, sample-rate fallback, DOMException-name error mapping, the cleanup→re-initialize retry path, a regression guard that `cleanup()` awaits `AudioContext.close()`, and the iOS Safari `needs-gesture` → `startWithGesture` flow)

## Recent Additions

### June 2026

- Resolved all open Dependabot alerts (dev-dependency transitives): bumped the `vite` override to `8.0.16` (fixes the `server.fs.deny` Windows bypass and the bundled `launch-editor` NTLMv2 UNC-path disclosure; also drops the `esbuild` dependency in favour of rolldown), upgraded `wrangler` to `4.104.0` (pulls `esbuild@0.28.1`, `undici@7.28.0`, and `ws@8.21.0`), and added an `undici@^7.28.0` override to patch the remaining `jsdom` path — `pnpm audit` is now clean
- Added `public/_headers`: hashed assets under `/_next/static/*` are now served with `Cache-Control: public,max-age=31536000,immutable`, eliminating revalidation round-trips for repeat visitors

- Canonical URLs (OpenGraph `metadataBase`/`url`, sitemap, robots.txt) now point at the production Worker URL `tempotuner.fourpixels.workers.dev` — no custom domain is attached
- Switched the Cloudflare target from Pages to Workers static assets (Cloudflare's recommended platform for new projects): added `wrangler.jsonc` declaring an assets-only Worker serving `out/`, which also prevents `wrangler deploy` auto-config from installing the OpenNext SSR adapter against this static-export build
- Migrated hosting from Railway (always-on container) to Cloudflare (static export, scale-to-zero, free tier): `next.config.mjs` now builds `output: 'export'` with unoptimized images, `pnpm run deploy` publishes `out/` via a pinned `wrangler` devDependency, and `DEPLOY.md` documents setup, DNS, and the Railway rollback path (`RAILWAY_ENVIRONMENT` switches the build back to standalone)

### May 2026

- Supply-chain hardening: `package.json` pins pnpm via `packageManager` and blocks all install scripts with an empty `pnpm.onlyBuiltDependencies` allowlist; Renovate enforces a 7-day release-age quarantine on non-security updates
- New repo rules: error-handling boundaries, dependency-discipline (no `latest` tags, justify new packages), and a duplication guideline that discourages premature abstraction
- Cross-browser tuner hardening: secure-context check, `navigator.mediaDevices` feature detection (in-app webviews / older browsers), and 44100Hz sample-rate fallback for hardware that rejects it
- Specific error messages mapped from DOMException names: permission denied, no microphone, microphone in use, unsupported constraints, insecure context
- iOS Safari "tap to start" prompt when the AudioContext stays suspended after `resume()` outside a user gesture
- "Try again" retry button on permission errors instead of asking users to reload the page
- ARIA roles (`tablist` / `tab` / `tabpanel`) and keyboard focus on the Tuner/Tempo switcher

### March 2026

- Fix tuner initialization to request microphone permissions immediately on load
- Add test infrastructure with Vitest

## License

MIT
