# Deployment

TempoTuner deploys as a fully static site (Next.js `output: 'export'`) to Cloudflare Pages. There is no server runtime — every feature (tuner, metronome, tap tempo) runs client-side in the browser, so the free tier with scale-to-zero covers it completely.

## Deploying to Cloudflare Pages

Requires **Node.js 22+** — the pinned `wrangler` version declares `engines.node >=22.0.0`, so `pnpm run deploy` fails on older Node.

### First-time setup

1. Authenticate wrangler (opens a browser):

   ```bash
   pnpm exec wrangler login
   ```

2. Create the Pages project (one time only):

   ```bash
   pnpm exec wrangler pages project create tempotuner --production-branch main
   ```

### Deploy

```bash
pnpm install
pnpm run deploy
```

> Use `pnpm run deploy`, not `pnpm deploy` — the latter is a pnpm built-in workspace command and will not run the script.

`pnpm run deploy` always builds first: it runs `pnpm build` (writing the static site to `out/`) and then `wrangler pages deploy out --project-name tempotuner`, so it can never publish stale output.

### Environment variables

None. The app has no API keys, secrets, or build-time configuration — nothing needs to be set in the Cloudflare Pages dashboard. See `.env.example`.

### DNS

In the Cloudflare dashboard, open the Pages project → **Custom domains** → add `tempotuner.app`. Cloudflare creates the records automatically when the zone is on Cloudflare; otherwise point DNS at the Pages subdomain:

| Type  | Name              | Target                   |
| ----- | ----------------- | ------------------------ |
| CNAME | `tempotuner.app`  | `tempotuner.pages.dev`   |
| CNAME | `www` (optional)  | `tempotuner.pages.dev`   |

Apex CNAMEs require Cloudflare DNS (CNAME flattening). Wait for the custom-domain status to read **Active** before tearing anything down.

## Rolling back to Railway

The Railway configuration is still in place as a fallback:

- `next.config.mjs` automatically switches to `output: 'standalone'` when Railway's auto-injected `RAILWAY_ENVIRONMENT` variable is present, so a Railway build of this same repo still produces the always-on server it ran before the migration.
- The Railway service serves on its temporary `*.up.railway.app` domain (the custom domain was never attached to Railway), so it stays reachable there — independent of any DNS changes — until the service is deleted.
- To roll back: remove the custom domain from the Pages project and use the Railway temp URL (or attach `tempotuner.app` to the Railway service). No code changes are needed.

Once the Cloudflare deployment is verified in production, the Railway service can be torn down manually; the conditional in `next.config.mjs` can then be simplified to `output: 'export'`.
