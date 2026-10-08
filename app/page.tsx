import ClientApp from "./client"

// Rendered straight into the static export, with no client-only mount gate:
// nothing in the tree reads browser APIs during render (audio and the mic
// start in effects), so the full panel ships in the HTML and paints before
// any JavaScript has loaded instead of an "Initialising" placeholder.
export default function Home() {
  return <ClientApp />
}
