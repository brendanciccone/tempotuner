# Deployment

TempoTuner deploys as a fully static site (Next.js `output: 'export'`) to Cloudflare Workers as a static-assets-only Worker. There is no server runtime — every feature (tuner, metronome, tap tempo) runs client-side in the browser, so the free tier with scale-to-zero covers it completely (static asset requests are free and unlimited).

`wrangler.jsonc` declares the Worker: no `main` script, just `assets.directory: ./out`. Its presence is load-bearing — without it, `wrangler deploy` auto-configuration detects Next.js and installs the OpenNext SSR adapter, which fails against this static-export build (it expects a `standalone` server output that this config intentionally does not produce).

## Deploying to Cloudflare Workers

Requires **Node.js 22+** — the pinned `wrangler` version declares `engines.node >=22.0.0`, so `pnpm run deploy` fails on older Node.

### Primary path: Workers Builds (git-connected)

The Worker is connected to this GitHub repository via Workers Builds. Every push to `main` triggers:

1. Build command: `pnpm run build` (writes the static site to `out/`)
2. Deploy command: `npx wrangler deploy` (uploads `out/` per `wrangler.jsonc`)

Pull requests get preview deployments at `<version>-tempotuner.<account-subdomain>.workers.dev`.

### Manual deploy (from your machine)

```bash
pnpm install
pnpm exec wrangler login   # one time, opens a browser
pnpm run deploy
```

> Use `pnpm run deploy`, not `pnpm deploy` — the latter is a pnpm built-in workspace command and will not run the script.

`pnpm run deploy` always builds first: it runs `pnpm build` and then `wrangler deploy`, so it can never publish stale output.

### Environment variables

None at runtime. The app has no API keys, secrets, or build-time configuration — see `.env.example`. The only dashboard setting that matters is `NODE_VERSION=22` in the Workers Builds settings if the build image ever defaults lower (it currently detects Node 22 from `engines`).

### Domains

Production is the Worker's own URL: **https://tempotuner.fourpixels.workers.dev** — no custom domain is attached. That URL is also the canonical one baked into the site (`metadataBase` and OpenGraph URL in `app/layout.tsx`, `baseUrl` in `app/sitemap.ts`, and the `Sitemap:` line in `public/robots.txt`).

To attach a custom domain later: Worker → **Settings → Domains & Routes → Add → Custom domain**. If you do, update the three canonical-URL spots above to the new domain in the same change.

## Rolling back to Railway

The Railway configuration is still in place as a fallback:

- `next.config.mjs` automatically switches to `output: 'standalone'` when Railway's auto-injected `RAILWAY_ENVIRONMENT` variable is present, so a Railway build of this same repo still produces the always-on server it ran before the migration.
- The Railway service serves on its temporary `*.up.railway.app` domain (the custom domain was never attached to Railway), so it stays reachable there — independent of any DNS changes — until the service is deleted.
- To roll back: remove the custom domain from the Worker and use the Railway temp URL (or attach `tempotuner.app` to the Railway service). No code changes are needed.

Once the Cloudflare deployment is verified in production, the Railway service can be torn down manually; the conditional in `next.config.mjs` can then be simplified to `output: 'export'`.
