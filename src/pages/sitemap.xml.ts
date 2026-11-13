import type { APIRoute } from "astro"
import { renderSitemap } from "@/lib/sitemap"

// Prerendered once at build time, so lastmod is the build date.
export const GET: APIRoute = ({ site }) => {
  if (!site) {
    throw new Error("sitemap.xml: `site` is not set in astro.config.mjs")
  }

  return new Response(renderSitemap(site, new Date()), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  })
}
