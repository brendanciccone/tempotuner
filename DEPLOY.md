# Deployment

TempoTuner deploys as a fully static site (Astro static output) to a static-assets-only Cloudflare Worker named `tempotuner`. There is no server runtime: the tuner, metronome and tap tempo all run in the browser, and static asset requests are free and unlimited on every Workers plan.

`wrangler.jsonc` declares the Worker: no `main` script, just `assets.directory: ./dist` and the 404 page. Its presence is load-bearing. Without it, `wrangler deploy` auto-configuration detects Astro and installs the `@astrojs/cloudflare` SSR adapter, which this static site must not use.

## Workers Builds (the normal path)

The Worker is connected to this GitHub repository through Workers Builds:

| Setting | Value |
|---|---|
| Build command | `pnpm run verify` (lint, tests, then `astro check` and the build to `dist/`) |
| Deploy command | `npx wrangler deploy` (uploads `dist/` per `wrangler.jsonc`) |
| Non-production branch builds | Worker Previews, `npx wrangler preview` (needs Wrangler 4.135.0 or later) |

A merge to `main` builds and deploys. A pull request builds a Worker Preview with its own URL; the Worker has no bindings, so its `previews` block in `wrangler.jsonc` is empty (`wrangler preview` refuses to run without one) and a preview exposes nothing beyond the site itself.

Workers Builds reads the Node version from `.node-version` (`24`); Astro needs 22.23.4 or later. The pnpm version comes from `packageManager` in `package.json`.

The build downloads the two webfonts (VT323, Silkscreen) from Google Fonts and self-hosts them under `/_astro/fonts/`, so the build machine needs to reach `fonts.google.com`, `fonts.googleapis.com` and `fonts.gstatic.com`. Visitors' browsers never contact Google.

## Manual deploy (owner only)

A fallback for when Workers Builds is unavailable:

```bash
pnpm install
pnpm exec wrangler login   # one time, opens a browser
pnpm run deploy
```

Use `pnpm run deploy`, not `pnpm deploy`: the latter is a built-in pnpm workspace command and will not run the script. `pnpm run deploy` always builds first, so it never publishes stale output.

## Rolling back

Redeploy an earlier version from the Cloudflare dashboard (Worker, then **Deployments**), or revert the change in git and let Workers Builds redeploy.

## Environment variables

None. The app has no API keys, secrets or build-time configuration (see `.env.example`).

## Domains

Production is the Worker's own URL: **https://tempotuner.fourpixels.workers.dev**. No custom domain is attached. That URL is also the canonical one baked into the site: `site` in `astro.config.mjs` (the OpenGraph tags, the canonical link and `sitemap.xml`) and the `Sitemap:` line in `public/robots.txt`.

To attach a custom domain later: Worker, then **Settings**, **Domains & Routes**, **Add**, **Custom domain**. If you do, update both canonical-URL spots above to the new domain in the same change.
