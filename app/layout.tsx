import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
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
    url: "https://tempotuner.app",
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}