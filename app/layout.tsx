import type React from "react"
import type { Metadata } from "next"
import { Silkscreen, VT323 } from "next/font/google"
import "./globals.css"

// Both faces are bitmap: VT323 carries everything, Silkscreen is reserved for
// the micro labels that ride under 12px.
const vt323 = VT323({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-vt323",
  display: "swap",
})

const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-silkscreen",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://tempotuner.fourpixels.workers.dev"),
  title: "Tuner, Metronome, and Tap Tempo | TempoTuner",
  description: "Chromatic tuner for any instrument, meteronome to practice, and a tap tempo to help you find the BPM of any song and calculate delay and reverb times.",
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    other: [
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  openGraph: {
    title: "Tuner, Metronome, and Tap Tempo | TempoTuner",
    description: "Chromatic tuner for any instrument, meteronome to practice, and a tap tempo to help you find the BPM of any song and calculate delay and reverb times.",
    type: "website",
    url: "https://tempotuner.fourpixels.workers.dev",
    siteName: "TempoTuner",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "TempoTuner - Tuner, Metronome, and Tap Tempo",
      }
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tuner, Metronome, and Tap Tempo | TempoTuner",
    description: "Chromatic tuner for any instrument, meteronome to practice, and a tap tempo to help you find the BPM of any song and calculate delay and reverb times.",
    creator: "@tempotuner",
    images: ["/og-image.png"],
  }
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  scrollBehavior: 'auto',
  themeColor: '#000b04',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${vt323.variable} ${silkscreen.variable}`}>
      <body>
        <div className="ac-screen">{children}</div>
        {/* The glass, a sibling of the frame rather than a child of it: Radix
            portals mount to <body>, so an overlay nested inside the frame would
            stop at the edge of every dropdown and dialog. Each layer needs its
            own node because one element has only a single ::after. */}
        <div className="ac-glass" aria-hidden="true">
          <span className="ac-bloom" />
          <span className="ac-retrace" />
          <span className="ac-mesh" />
          <span className="ac-scanlines" />
        </div>
      </body>
    </html>
  )
}