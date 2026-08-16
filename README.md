# TempoTuner

A simple tuner and metronome web app. Uses the Web Audio API to detect pitch in real-time.

## Features

- Chromatic tuner with real-time pitch detection
- Tap tempo for calculating BPM
- Metronome with common, compound and odd time signatures
- Visual beat indicator: one cell per beat in the measure, lit in time with the click, with the accents of a compound meter readable at rest
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

Energizing is instant and de-energizing is not. A control that lights — a soft key under a finger, a selected tab, the tap pad on the downbeat, a sounding beat cell — snaps on in a single frame, because drive arriving is not a gradual event; when the drive stops, the cell relaxes over `--decay` (90ms) on `--decay-ease`. `.ac-lamp` carries this: the base rule owns the tail and every "currently driven" selector (`:hover`, `:active`, `[data-lit]`, `aria-pressed`, `aria-selected`, `aria-expanded`) zeroes the duration, so the direction of the edge picks the duration. Nothing in the transition list moves or resizes — it is colour and glow only, which is why it is not gated behind `prefers-reduced-motion`.

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
- `pnpm lint` - Run ESLint (flat config in `eslint.config.mjs`, `eslint-config-next` rules)
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

- **Unit** (`tests/unit/`) — 110 tests covering audio processing, note detection, tuner initialization, metronome accents and beat scheduling (the downbeat differs in timbre and not only in gain, a compound meter groups in threes, a bad beat index or a non-finite AudioContext time throws rather than propagating a NaN into a timer, and a beat scheduled 100ms ahead of the clock paints 100ms later), the beat indicator (one cell per beat, the sounding beat lit zero-based, nothing lit while stopped or when the reported beat falls outside the measure, accents read from the same map the clicks use, and the row hidden from assistive tech behind a single static statement of the meter), tuning-meter geometry (the needle lands exactly on the zone edge at the in-tune boundary, clamps at full scale, and agrees with the classifier across a swept ±20 cent range), tap-tempo input (one tap per keyboard activation and per pointer press, no tap when another control is activated, and the two-second reset), the `cn()` class merger (the custom `text-micro` and `tracking-*` tokens resolve as the scales they belong to, and ordinary conflicts still resolve), the theme regression guards (single theme, no `data-style` variants, no light/dark pair, no second hue in the UI, the 18px bitmap floor, the contrast gates: each stop against `--screen`, AA on all three surfaces, inverse-video legibility, ramp monotonicity, and the persistence model: both decay durations inside the UI caps, only the OFF edge decaying, and nothing geometric in the transition list), and the `useTuner` hook orchestration (including secure-context detection, mediaDevices feature detection, sample-rate fallback, DOMException-name error mapping, the cleanup→re-initialize retry path, a regression guard that `cleanup()` awaits `AudioContext.close()`, and the iOS Safari `needs-gesture` → `startWithGesture` flow)

## Recent Additions

### August 2026

- Added a visual beat indicator to the metronome and fixed the two things that made it worth adding. The measure is now drawn as one cell per beat — a sounding beat is a solid discharge block, the downbeat the brightest thing in the row, and at rest the accented cells stay legible so a 6/8 reads as 3+3 before the metronome is even running. It is useful with the volume down and it is the only way to see where the accents fall in an odd meter. Two defects sat underneath it. The beat was painted at the moment its click was *scheduled*, and the scheduler runs 100ms ahead of the AudioContext clock, so the display led the sound by up to 40% of a beat at 240 BPM; the paint is now queued for the click's own start time, and the pending paints are cancelled on stop, on a time-signature change and on unmount. The metronome also reported the *next* beat rather than the sounding one, which the tap pad compensated for by flashing on index 1 — both now agree that the downbeat is 0. Separately, compound accents were read from state captured by the `setTimeout` chain at the moment it started, so switching 4/4 to 6/8 mid-run kept clicking flat until you stopped and restarted; that value moves to a ref like every other value the scheduler reads. The accent map and the click voices are now one pure module shared by the audio and the display, so the panel cannot show a downbeat where the click does not put one, and the per-beat `console.log` block (five lines per click, four times a second at 240 BPM) is gone

- Gave the panel phosphor persistence. Every lit control snapped both on and off, which no emitter does: drive arriving is instant, drive stopping is a relaxation. `.ac-lamp` now carries a 90ms decay on colour, border and glow, and every selector meaning "currently driven" zeroes the duration, so the direction of the edge chooses between an instant frame and the tail. It is applied to the soft keys, the tabs, the tap pad, the tuning status strip and the new beat cells. The durations are the UI caps — 250ms for anything a user waits on, 60ms for a control de-energizing — rather than a decay figure for this tube, which is a look rather than a part number; inventing a spectral tail for it would be inventing a measurement. Nothing in the transition list moves or resizes, so it stays on under `prefers-reduced-motion`

- Pinned security floors for two more transitive dependencies, closing both remaining high-severity Dependabot alerts. `nanoid@^3.0.0` now floors at `^3.3.17` (GHSA-2v37-7h3g-55p8 / CVE-2026-67213 — `customAlphabet`/`customRandom` computed `step` as `Math.ceil(1.6 * mask * defaultSize / alphabet.length)`, which is `0` at size 0, so the inner byte loop never ran and the outer `while (true)` spun forever; 3.3.17 adds a `size <= 0` guard) and `js-yaml@^4.0.0` floors at `^4.3.1` (GHSA-5p4m-2wfm-xmqj — `resolveYamlOmap` deduplicated `!!omap` keys with an `Array.indexOf` scan inside the per-element loop, making a default-schema `yaml.load()` quadratic in entry count; 4.3.1 backports the 5.x fix as an O(1) `hasOwnProperty` lookup, taking an 80,000-entry document from ~2.6s to ~0.26s and restoring linear growth). Both arrive as transitives — `nanoid` via `postcss`, `js-yaml` via `eslint` → `@eslint/eslintrc` — and unusually for this repo both dependents already accepted the patched versions, so the overrides pin a floor rather than lift a pin. Neither library is reachable from app code: `nanoid` runs only in `postcss` at build time and `js-yaml` only in ESLint, which reads a flat `eslint.config.mjs` and parses no YAML

- Raised the `undici` override from `^7.28.0` to `^7.29.0`, resolving five Dependabot alerts at once — GHSA-4cwx-7wf7-3272 (high; `Cache-Control: private=""` slipping past the shared-cache guard, plus an uncaught `TypeError` when a header mixes bare `private` with `private="hdr"`), GHSA-jr45-8vmc-qm54, GHSA-8xcm-r25x-g524, GHSA-v3r7-h72x-cjcm and GHSA-m8rv-5g2x-5cg5. All five are fixed in 7.29.0 and all reach the tree as dev-only transitives, through `jsdom` (which accepts `^7.24.5`) and through `wrangler` → `miniflare` (which pins `7.28.0` exactly, so only the override lifts it). Nothing in the app calls undici — none of the affected surfaces (the cache and retry interceptors, `setCookie`, the HTTP/1.1 blob-body path) run in a static export — so this closes the alerts without touching runtime behaviour

### July 2026

- Closed the `tracking-*` half of the `cn()` token bug and stopped the metronome swallowing Web Audio errors. The `text-micro` fix registered one custom token with `tailwind-merge`; the three `--tracking-*` tokens had the identical defect one property over — unregistered, they matched none of its groups, so two survived a merge together and CSS source order picked the winner instead of call order. No call site collided yet, but every UI primitive that sets tracking also merges `className`, so the first override would have lost silently exactly the way `SelectLabel` did. Separately, three `catch` blocks in the metronome discarded every error rather than the expected already-stopped/already-closed `InvalidStateError`; they now rethrow anything else, and the one wrapped around an array `findIndex`/`splice` — which cannot throw — is gone rather than narrowed
- Made `pnpm lint` actually run. Next 16 removed the `next lint` subcommand, so the script read `lint` as a directory name and died — meaning the repo had no working linter, and no ESLint dependency or config had ever been committed (`next lint` used to supply both implicitly). ESLint 9 and `eslint-config-next` are now real devDependencies with a flat config in `eslint.config.mjs`. The first real run surfaced 22 pre-existing problems; the mechanically safe ones are fixed here — two `any` casts on `webkitAudioContext` (the `Window` augmentation in `utils/audio-analyzer.ts` already types it), three unused catch bindings, an unused `getRMS` import, and a `cleanupOscillators` declaration hoisted above the unmount effect that captured it from the temporal dead zone. `ClientApp`'s `mounted` gate is gone: `ClientWrapper` already gates on mount with a real `role="status"` loading state, so the second gate only returned `null` for one extra render and left the prerendered body empty. First paint now ships `Initialising █` in the static HTML. The remaining 13 are pre-existing and left alone deliberately — 9 sit in unimported shadcn boilerplate, and 4 are `react-hooks/set-state-in-effect` on working, tested code (the SSR mount gate, the metronome's prop-to-state sync, the tuner's async init) whose fixes are behavioral restructures, not lint cleanups
- Fixed the tuning meter disagreeing with its own reading. The needle carried a `1.1` multiplier that nothing else accounted for, so the meter's edges were really ±45.5 cents while the labels claimed ±50, and the drawn target spanned ±9.09 cents against a classifier that calls ±5 in tune. Between 5 and 9 cents off, the needle sat *inside* the lit target while the panel read "sharp". The needle, the zone and the scale labels now derive from one exported `IN_TUNE_CENTS` / `METER_RANGE_CENTS` pair, so the needle crosses the zone edge at the same instant the status flips
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
