// The site is a single page, so the sitemap is one <url> entry. It is written
// by hand rather than through @astrojs/sitemap: that integration emits
// sitemap-index.xml + sitemap-0.xml, which would move the /sitemap.xml URL that
// robots.txt and search consoles already point at.
export const renderSitemap = (site: URL, lastModified: Date): string => {
  if (Number.isNaN(lastModified.getTime())) {
    throw new RangeError("renderSitemap: lastModified is not a valid date")
  }

  const loc = new URL("/", site).href
  const lastmod = lastModified.toISOString().split("T")[0]

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "<url>",
    `<loc>${loc}</loc>`,
    `<lastmod>${lastmod}</lastmod>`,
    "<changefreq>weekly</changefreq>",
    "<priority>1</priority>",
    "</url>",
    "</urlset>",
    "",
  ].join("\n")
}
