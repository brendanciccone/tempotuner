import type { APIContext } from "astro"
import { describe, expect, it } from "vitest"
import { GET } from "@/src/pages/sitemap.xml"

// ----------------------------------------------------------------
// The endpoint only reads `site` from Astro's context. A full APIContext needs
// a running Astro build, so the tests hand it the one field it uses; the cast
// is confined to this boundary.
// ----------------------------------------------------------------

const contextWithSite = (site: URL | undefined): APIContext =>
  ({ site }) as unknown as APIContext

describe("GET /sitemap.xml", () => {
  it("fails the build when `site` is missing from astro.config.mjs", async () => {
    await expect(async () => GET(contextWithSite(undefined))).rejects.toThrow(/`site` is not set/)
  })

  it("serves XML", async () => {
    const res = await GET(contextWithSite(new URL("https://tempotuner.fourpixels.workers.dev")))

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/xml; charset=utf-8")
  })

  it("lists the configured site's root", async () => {
    const res = await GET(contextWithSite(new URL("https://tempotuner.fourpixels.workers.dev")))
    const body = await res.text()

    expect(body).toContain("<loc>https://tempotuner.fourpixels.workers.dev/</loc>")
    expect(body).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/)
  })
})
