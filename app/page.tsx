"use client"

import { useState, useEffect } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import TapTempo from "@/components/tap-tempo"
import Tuner from "@/components/tuner"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export default function Home() {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<"tempo" | "tuner">("tuner") // Changed default to tuner

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <main className="flex min-h-screen flex-col items-center justify-start md:justify-center p-4 sm:p-6 pt-8 md:pt-0 bg-background">
            <div className="w-full max-w-[340px] sm:max-w-sm md:max-w-md mx-auto">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">TempoTuner</h1>
                </div>
                {mounted ? <ThemeToggle /> : <div className="w-9 h-9" />}
              </div>

              {/* Tab Buttons - Reordered */}
              <div className="flex w-full mb-4 border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setActiveTab("tuner")}
                  className={`flex-1 py-2 text-center font-medium text-sm transition-colors ${
                    activeTab === "tuner" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted/50"
                  }`}
                >
                  Tuner
                </button>
                <button
                  onClick={() => setActiveTab("tempo")}
                  className={`flex-1 py-2 text-center font-medium text-sm transition-colors ${
                    activeTab === "tempo" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted/50"
                  }`}
                >
                  Tempo
                </button>
              </div>

              {/* Content */}
              {mounted ? (
                activeTab === "tempo" ? (
                  <TapTempo />
                ) : (
                  <Tuner key="tuner-component" />
                )
              ) : (
                <div className="min-h-[400px] w-full bg-card/50 animate-pulse rounded-lg" />
              )}
            </div>
          </main>
        </ThemeProvider>
      </body>
    </html>
  )
}

