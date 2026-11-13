import { describe, expect, it } from "vitest"
import { renderSitemap } from "@/lib/sitemap"

// ----------------------------------------------------------------
// The sitemap used to come from Next's MetadataRoute generator and is now
// written by hand, so these pin the shape search consoles already accept.
// ----------------------------------------------------------------

const SITE = new URL("https://tempotuner.fourpixels.workers.dev")
const BUILD_DATE = new Date("2026-11-13T17:42:00Z")

describe("renderSitemap", () => {
  it("throws on an invalid date rather than writing NaN into lastmod", () => {
    expect(() => renderSitemap(SITE, new Date("not a date"))).toThrow(RangeError)
  })

  it("lists exactly one URL: the site root", () => {
    const xml = renderSitemap(SITE, BUILD_DATE)

    expect(xml.match(/<url>/g)).toHaveLength(1)
    expect(xml).toContain("<loc>https://tempotuner.fourpixels.workers.dev/</loc>")
  })

  it("points at the root even when the site URL carries a path", () => {
    const xml = renderSitemap(new URL("https://example.com/some/page"), BUILD_DATE)

    expect(xml).toContain("<loc>https://example.com/</loc>")
  })

  it("writes lastmod as a UTC calendar date", () => {
    // 23:30 at UTC-5 is already the next day in UTC; the date must not depend
    // on the build machine's timezone.
    const xml = renderSitemap(SITE, new Date("2026-11-13T23:30:00-05:00"))

    expect(xml).toContain("<lastmod>2026-11-14</lastmod>")
  })

  it("is a sitemaps.org urlset with the declared XML prolog", () => {
    const xml = renderSitemap(SITE, BUILD_DATE)

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain("<changefreq>weekly</changefreq>")
    expect(xml).toContain("<priority>1</priority>")
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true)
  })
})
