# Deploying TempoTuner

TempoTuner is a fully client-side Next.js app: every route is statically
prerendered at build time (`/`, `/_not-found`, `/sitemap.xml`), there are no
API routes, no middleware, no scheduled jobs, and no backend services. That
makes deployment close to zero-config on Vercel.

## Vercel (primary)

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new). Vercel
   auto-detects Next.js — keep the defaults:
   - Build command: `next build` (default)
   - Install command: `pnpm install` (detected from `pnpm-lock.yaml` and the
     `packageManager` field)
   - Output: handled by Vercel's Next.js builder; the `output: 'standalone'`
     setting in `next.config.mjs` is ignored on Vercel and kept only for the
     Railway fallback
2. Deploy. No framework or project settings need to change.

### Environment variables

**None.** The app reads no `process.env` values at build or run time (see
`.env.example`). There is no `CRON_SECRET` because there are no cron jobs.

### Cron jobs

None. There is no `vercel.json` because no crons, redirects, or function
config are needed.

### DNS cutover (tempotuner.app)

1. In the Vercel project, add the domains `tempotuner.app` and
   `www.tempotuner.app` (Settings → Domains).
2. At your DNS provider:
   - `tempotuner.app` → `A` record to `76.76.21.21` (Vercel's apex IP), or use
     Vercel nameservers
   - `www` → `CNAME` to `cname.vercel-dns.com`
3. Wait for Vercel to issue the TLS certificate (usually under a minute after
   DNS propagates), then verify `https://tempotuner.app` loads and the tuner
   can request microphone access (requires HTTPS — Vercel provides this
   automatically).
4. Only after verifying, remove the custom domain from the Railway service.

## Railway (fallback)

The repo still runs on Railway unchanged:

- Railway builds with `pnpm build`; `output: 'standalone'` in
  `next.config.mjs` produces `.next/standalone/server.js`.
- Start command: `node .next/standalone/server.js` (the standalone server
  respects Railway's injected `PORT` automatically). Plain `next start` also
  works if the start command is set to that, though Next.js warns when
  `standalone` output is configured.
- No environment variables are required there either.

### Rolling back from Vercel to Railway

1. Re-enable (or never disable) the Railway service — it deploys from the same
   repo with no config changes.
2. Point DNS back: `tempotuner.app` → the Railway-provided domain/target it
   was using before the migration.
3. Remove the domains from the Vercel project so certificate issuance doesn't
   conflict.

## Behavioral differences on Vercel

- **Cold starts: none in practice.** All routes are prerendered static files
  served from Vercel's CDN; no serverless function runs per request, so there
  is no cold-start penalty despite leaving an always-on container.
- **Function timeouts: not applicable.** There are no API routes or
  server-rendered pages, so Vercel's function duration limits never come into
  play.
- **`next/image`** uses Vercel's native image optimization (the only image is
  the local logo asset; no remote patterns needed).
- **Sitemap `lastmod`** is the build date (it's `force-static`), same as on
  Railway — it changes per deploy, not per request.
