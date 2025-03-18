"use client"

import { useEffect, useState } from "react"
import { ThemeToggle } from "@/components/theme-toggle"
import TapTempo from "@/components/tap-tempo"
import Tuner from "@/components/tuner"

export default function ClientApp() {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<"tempo" | "tuner">("tuner") // Changed default to tuner

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-background to-muted/30">
      <div className="w-full max-w-[340px] sm:max-w-sm md:max-w-md mx-auto">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">TempoTuner</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
            </p>
          </div>
          <ThemeToggle />
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
        {activeTab === "tempo" ? <TapTempo /> : <Tuner key="tuner-component" />}
      </div>
    </main>
  )
}

