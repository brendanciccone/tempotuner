# TempoTuner

A simple tuner and metronome web app. Uses the Web Audio API to detect pitch in real-time.

## Features

- Chromatic tuner with real-time pitch detection
- Tap tempo for calculating BPM
- Dark/light mode
- Works on mobile and desktop

## Tech

Built with Next.js 15, TypeScript, TailwindCSS, and Shadcn/UI components. Audio processing uses the Web Audio API.

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

## Project Structure

```
app/          → Next.js pages and layouts
components/   → React components (tuner, metronome, UI)
hooks/        → Custom hooks
utils/        → Audio processing utilities
```

## License

MIT
