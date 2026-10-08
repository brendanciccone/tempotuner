import type { MetadataRoute } from "next"

export const dynamic = "force-static"

// Lets Android and desktop Chrome install the app with its own name, icon and
// panel colour. The 192/512 icons already shipped in public/ but nothing
// referenced them in a manifest, which is the only place those browsers read
// them from.
const manifest = (): MetadataRoute.Manifest => {
  return {
    name: "TempoTuner",
    short_name: "TempoTuner",
    description: "Chromatic tuner, metronome and tap tempo.",
    start_url: "/",
    display: "standalone",
    background_color: "#000b04",
    theme_color: "#000b04",
    icons: [
      { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  }
}

export default manifest
