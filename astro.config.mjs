import { defineConfig, fontProviders } from "astro/config"
import react from "@astrojs/react"
import tailwindcss from "@tailwindcss/vite"

// Both faces are bitmap: VT323 carries everything, Silkscreen is reserved for
// the micro labels that ride under 12px. Each has a single weight and no
// italic, so only 400/normal is requested. The files are downloaded at build
// time and served from this site, never hotlinked from Google.
const bitmapFace = (name, cssVariable) => ({
  provider: fontProviders.google(),
  name,
  cssVariable,
  weights: [400],
  styles: ["normal"],
  subsets: ["latin"],
  display: "swap",
  fallbacks: ["monospace"],
})

export default defineConfig({
  // The canonical URL: the layout's OpenGraph tags and the sitemap both read
  // it from here. public/robots.txt carries its own copy.
  site: "https://tempotuner.fourpixels.workers.dev",
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [bitmapFace("VT323", "--font-vt323"), bitmapFace("Silkscreen", "--font-silkscreen")],
})
