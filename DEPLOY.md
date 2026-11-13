# Deployment

TempoTuner deploys as a fully static site (Astro static output) to Cloudflare Workers as a static-assets-only Worker. There is no server runtime — every feature (tuner, metronome, tap tempo) runs client-side in the browser, so the free tier with scale-to-zero covers it completely (static asset requests are free and unlimited).

`wrangler.jsonc` declares the Worker: no `main` script, just `assets.directory: ./dist`. Its presence is load-bearing — without it, `wrangler deploy` auto-configuration detects Astro and installs the `@astrojs/cloudflare` SSR adapter, which this static site must not use.

## Deploying to Cloudflare Workers

Requires **Node.js 22.23.4+** — Astro 7's minimum, which also covers the pinned `wrangler`'s `>=22.0.0`. The exact version is pinned in `.node-version`; on older Node the Astro CLI refuses to start, so a build fails loudly rather than producing bad output.

### Primary path: Workers Builds (git-connected)

The Worker is connected to this GitHub repository via Workers Builds. Every push to `main` triggers:

1. Build command: `pnpm run build` (type-checks, then writes the static site to `dist/`)
2. Deploy command: `npx wrangler deploy` (uploads `dist/` per `wrangler.jsonc`)

Pull requests get preview deployments at `<version>-tempotuner.<account-subdomain>.workers.dev`.

The build downloads the two webfonts (VT323, Silkscreen) from Google Fonts and self-hosts them under `/_astro/fonts/`, so the build machine needs to reach `fonts.google.com`, `fonts.googleapis.com` and `fonts.gstatic.com`. Visitors' browsers never contact Google.

### Manual deploy (from your machine)

```bash
pnpm install
pnpm exec wrangler login   # one time, opens a browser
pnpm run deploy
```

> Use `pnpm run deploy`, not `pnpm deploy` — the latter is a pnpm built-in workspace command and will not run the script.

`pnpm run deploy` always builds first: it runs `pnpm build` and then `wrangler deploy`, so it can never publish stale output.

### Environment variables

None at runtime. The app has no API keys, secrets, or build-time configuration — see `.env.example`. Node comes from `.node-version`; if a Workers Builds run ever reports an older Node, set `NODE_VERSION` to the same version in the Workers Builds settings.

### Domains

Production is the Worker's own URL: **https://tempotuner.fourpixels.workers.dev** — no custom domain is attached. That URL is also the canonical one baked into the site: `site` in `astro.config.mjs` (which feeds the OpenGraph tags and `sitemap.xml`) and the `Sitemap:` line in `public/robots.txt`.

To attach a custom domain later: Worker → **Settings → Domains & Routes → Add → Custom domain**. If you do, update both canonical-URL spots above to the new domain in the same change.

## Railway (retired fallback)

Railway used to be the rollback target: `next.config.mjs` switched Next.js to its `standalone` server build when Railway's `RAILWAY_ENVIRONMENT` variable was present. That server build went away with the move to Astro, and there is no `start` script any more, so a fresh Railway deploy of this repo will fail. Railway keeps serving its last successful deployment (the Next.js build) on its `*.up.railway.app` domain until the service is deleted.

To roll back now, redeploy an earlier Worker version from the Cloudflare dashboard (Worker → **Deployments**), or revert the change in git and let Workers Builds redeploy. The Railway service can be torn down manually.
