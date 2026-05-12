# TempoTuner

A simple tuner and metronome web app. Uses the Web Audio API to detect pitch in real-time.

## Features

- Chromatic tuner with real-time pitch detection
- Tap tempo for calculating BPM
- Dark/light mode
- Works on mobile and desktop

## Tech

Built with Next.js 16, TypeScript, TailwindCSS, and Shadcn/UI components. Audio processing uses the Web Audio API.

## Setup

Requires Node.js 18+ and PNPM.

```bash
pnpm install
pnpm dev
```

## Scripts

- `pnpm dev` - Start dev server
- `pnpm build` - Production build
- `pnpm start` - Start production server
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

- **Unit** (`tests/unit/`) — 40 tests covering audio processing, note detection, and tuner initialization (including secure-context detection, mediaDevices feature detection, sample-rate fallback, DOMException-name error mapping, the cleanup→re-initialize retry path, and a regression guard that `cleanup()` awaits `AudioContext.close()`)

## Recent Additions

### May 2026

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
