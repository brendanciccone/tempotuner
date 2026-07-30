# TempoTuner

A simple tuner and metronome web app. Uses the Web Audio API to detect pitch in real-time.

## Features

- Chromatic tuner with real-time pitch detection
- Tap tempo for calculating BPM
- Metronome with common, compound and odd time signatures
- Delay & reverb calculator derived from the current tempo
- Green Console theme: a single monochrome phosphor-green terminal with CRT scanlines, bloom and cell mesh
- Works on mobile and desktop

## Tech

Built with Next.js 16, TypeScript, TailwindCSS, and Shadcn/UI components. Audio processing uses the Web Audio API.

### Theme

The app ships exactly **one** theme and no light/dark switch — the panel is a piece of hardware, not a colour scheme. Its structure, type scale, 4px cell grid, glow tokens and screen simulations are adapted from [Amber Console](https://github.com/DutchDiederik/AmberConsole) by Diederik (BSD-3-Clause), reimplemented as Tailwind v4 design tokens in `app/globals.css` so every Shadcn primitive inherits it. Type is set in VT323 with Silkscreen for micro labels, both loaded via `next/font`.

The gas is swapped for a P1-style phosphor green — the Pip-Boy ramp — which is the only departure from the source. That is a whole-panel change, not a spot colour: Amber Console ships two palettes and switches between them wholesale for exactly this reason.

The ramp sits higher than the amber one it replaces, and deliberately. Amber caps at 10.57:1 because it must — no fully-saturated colour at hue 24° exceeds L=0.318, so its top stop can only brighten by whitening. Green has no such ceiling, so every stop is re-solved (never re-tinted, which silently moves contrast) and `--phosphor-100` lands at 15.00:1, within a tenth of the reference greens `#18ff6c` and `#00ff41`.

| Stop | Hex | vs `--screen` | Role |
|---|---|---|---|
| `--phosphor-100` | `#37ff79` | 15.00:1 | hot highlight / focus |
| `--phosphor-90` | `#00e34c` | 11.52:1 | primary discharge |
| `--phosphor-70` | `#00b73d` | 7.47:1 | secondary |
| `--phosphor-50` | `#009130` | 4.85:1 | dim / disabled |
| `--phosphor-30` | `#004d1a` | 1.98:1 | trace / ghost (decorative) |

The dim stop is gated at 4.8:1 rather than the source's 3.42:1 because it is the only stop carrying text below 18px — the Silkscreen micro labels — where 3.42 fails WCAG AA on every surface. `tests/unit/theme.test.ts` enforces the gates, AA on all three surfaces, inverse-video legibility, and ramp monotonicity.

Six rules the UI is styled against:

1. **One gas, many intensities** — hierarchy is brightness, inverse video and blink. No red for "flat", no amber for "sharp"
2. **Inverse video is importance** — a solid discharge block is the machine talking
3. **Everything is a box** — 2px rules do the layout; elevation does not exist
4. **The character grid rules** — spacing snaps to 4px half-cells, leading is 1.15
5. **Casing is semantic** — ALL CAPS is system text, Title Case is a soft key
6. **Ornament is typographic** — `✳ █ ▼ ▲` and box rules, never an SVG icon

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

- **Unit** (`tests/unit/`) — 75 tests covering audio processing, note detection, tuner initialization, tap-tempo input (one tap per key press and per pointer press, no tap when another control is activated, and the two-second reset), the `cn()` class merger (the custom `text-micro` token survives a colour class, and ordinary conflicts still resolve), the theme regression guards (single theme, no `data-style` variants, no light/dark pair, no second hue in the UI, the 18px bitmap floor, and the contrast gates: each stop against `--screen`, AA on all three surfaces, inverse-video legibility, ramp monotonicity), and the `useTuner` hook orchestration (including secure-context detection, mediaDevices feature detection, sample-rate fallback, DOMException-name error mapping, the cleanup→re-initialize retry path, a regression guard that `cleanup()` awaits `AudioContext.close()`, and the iOS Safari `needs-gesture` → `startWithGesture` flow)

## Recent Additions

### July 2026

- Cut the screen simulation's main-thread cost by ~73% (0.067s → 0.018s of CPU per six idle seconds) by drifting the scanlines with a `transform` on an over-tall layer instead of an animated `background-position`. Identical on screen; the old form repainted the full viewport every frame. Measurement also corrected an assumption — the scanlines were the expensive layer, roughly 4× the plasma bleed sitting next to them, which is the opposite of what the code comments claimed
- Moved the screen simulation to a fixed, body-level `.ac-glass` layer above the portal z-index. Radix mounts dropdowns and dialogs to `<body>`, so an overlay nested in the frame stopped at their edge and they rendered flat against a panel visibly behind glass. The amplified plasma glow moved to `:root` for the same reason
- Redrew the favicons, app icons and OG image in the phosphor palette. The mark is unchanged in concept — the tuning needle parked in the lit zone, the same instrument the old icon showed — but rendered under the console's own rules: flat fills, box rules, one gas, no gradients or elevation. Sizes 48px and up carry the graduations, needle glow and scanlines; 16px and 32px drop to a scale line and a bold needle, because below ~48px the detail smears into a blob. `favicon.ico` is now PNG-in-ICO at 16/32/48
- Fixed two tap-tempo bugs that predate the retheme, both caused by the window-level "any key taps" listener also seeing Enter and Space. Activating the focused pad counted the press twice and roughly tripled the reading (346 BPM measured for a 120 BPM input); and activating *any* control — the metronome toggle, the tempo keys — silently logged a tap too, corrupting the average for keyboard users. The pad is now a real `<button>` whose click does the tapping, and the window listener steps aside for activation keys on interactive elements while still tapping on every other key from anywhere
- Fixed `SelectLabel` rendering at 22px instead of 10px: `tailwind-merge` has no knowledge of custom `@theme` tokens, so it classified `text-micro` as a colour utility and dropped it. `cn()` now registers the token in the font-size group
- Swapped the panel's gas from amber to a P1-style phosphor green (the Pip-Boy ramp). The whole tube changes, not one element — a spot green for "in tune" beside an amber panel would read as a rendering fault rather than a signal, and would break the one rule the design is emphatic about. The five stops are re-solved at hue 140° rather than re-tinted, and the ramp sits higher than amber's because green has the luminance headroom amber lacks. A side effect worth having: the dim stop moves from 3.42:1 to 4.85:1, which clears WCAG AA for the sub-18px micro labels that previously failed it. New contrast tests enforce the gates
- Retheme: every style variant is gone (`default`, `neon`, `cyberpunk`, `soft`, `classic`, `arcade`, `nature`, `minimalist`, `typewriter`) and so is the light/dark pair, replaced by a single [Amber Console](https://github.com/DutchDiederik/AmberConsole) panel. `app/globals.css` is rewritten around the amber ramp, VT323/Silkscreen and the CRT/plasma overlays; the Settings dialog and its style picker are removed with the themes they switched; icons give way to typographic ornament; and `next-themes` and `sonner` (its only remaining consumer) are dropped from `package.json`. Tuning state now reads through brightness and inverse video rather than red/green, and `tests/unit/theme.test.ts` guards all of it
- Resolved two high-severity Dependabot alerts: raised the `postcss` override to `^8.5.24` (GHSA-r28c-9q8g-f849 — a `sourceMappingURL` path traversal that let untrusted CSS disclose arbitrary `.map` file contents, patched in 8.5.18) and added a `sharp@^0.35.3` override (GHSA-f88m-g3jw-g9cj — libvips CVE-2026-33327/33328/35590/35591, patched in 0.35.0). Both arrive transitively — `postcss` via `next` and `autoprefixer`, `sharp` via `wrangler` → `miniflare` and `next` — and both dependents pin versions that need an override to lift. `pnpm audit` is clean again

### June 2026

- Resolved all open Dependabot alerts (dev-dependency transitives): bumped the `vite` override to `8.0.16` (fixes the `server.fs.deny` Windows bypass and the bundled `launch-editor` NTLMv2 UNC-path disclosure), upgraded `wrangler` to `4.104.0` (pulls the patched `esbuild@0.28.1`, `undici@7.28.0`, and `ws@8.21.0`), and added an `undici@^7.28.0` override to patch the remaining `jsdom` path — `pnpm audit` is now clean
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

MIT.

### Third-party notices

The theme adapts [Amber Console](https://github.com/DutchDiederik/AmberConsole) — Copyright (c) 2026, Diederik — under the BSD 3-Clause License. The full notice, conditions and disclaimer are retained in [`LICENSES/amber-console.BSD-3-Clause.txt`](LICENSES/amber-console.BSD-3-Clause.txt), as clause 1 requires.
