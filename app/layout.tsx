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
  openGraph: {
    title: "Tuner, Metronome, and Tap Tempo | TempoTuner",
    description: "Chromatic tuner for any instrument, meteronome to practice, and a tap tempo to help you find the BPM of any song and calculate delay and reverb times.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tuner, Metronome, and Tap Tempo | TempoTuner",
    description: "Chromatic tuner for any instrument, meteronome to practice, and a tap tempo to help you find the BPM of any song and calculate delay and reverb times.",
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



import './globals.css'