"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import Image from "next/image"
import TapTempo from "@/components/tap-tempo"
import Tuner from "@/components/tuner"
import { Button } from "@/components/ui/button"
import { Settings } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type TabId = "tuner" | "tempo"
const TAB_ORDER: readonly TabId[] = ["tuner", "tempo"] as const

export default function ClientApp() {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>("tuner")
  const [selectedStyle, setSelectedStyle] = useState("default")
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    tuner: null,
    tempo: null,
  })

  // WAI-ARIA tabs keyboard pattern (manual activation): arrow keys / Home / End
  // move focus only. The user activates with Enter or Space (handled natively by
  // <button>). Manual activation is correct here because switching tabs unmounts
  // the Tuner, which would otherwise re-prompt for mic permission on every arrow press.
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: TabId) => {
    const currentIndex = TAB_ORDER.indexOf(current)
    let nextIndex: number | null = null

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % TAB_ORDER.length
        break
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length
        break
      case "Home":
        nextIndex = 0
        break
      case "End":
        nextIndex = TAB_ORDER.length - 1
        break
    }

    if (nextIndex === null) return
    event.preventDefault()
    // Move focus only; do NOT change activeTab. Enter/Space on the focused tab
    // will fire its onClick and switch panels.
    tabRefs.current[TAB_ORDER[nextIndex]]?.focus()
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  // Apply the selected style to the root element
  useEffect(() => {
    document.documentElement.setAttribute('data-style', selectedStyle)
  }, [selectedStyle])

  // Return null on server to prevent hydration issues
  if (!mounted) {
    return null
  }

  return (
    <main className={`flex min-h-screen flex-col bg-background p-4 sm:p-6`}>
      <div className="w-full max-w-[340px] sm:max-w-sm md:max-w-md mx-auto">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <Image
              src="/android-chrome-192x192.png"
              alt="TempoTuner logo"
              width={32}
              height={32}
              className="rounded-[5px] border border-border shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
            />
            <h1 className="text-2xl sm:text-3xl font-medium tracking-[-0.04em]">TempoTuner</h1>
            <p className="text-xs sm:text-sm text-muted-foreground"></p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full">
                  <Settings className="h-5 w-5" />
                  <span className="sr-only">Settings</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <h4 className="font-medium">Style</h4>
                    <Select value={selectedStyle} onValueChange={setSelectedStyle}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select style" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="neon">Neon</SelectItem>
                        <SelectItem value="cyberpunk">Cyberpunk</SelectItem>
                        <SelectItem value="soft">Soft</SelectItem>
                        <SelectItem value="classic">Classic</SelectItem>
                        <SelectItem value="arcade">Arcade</SelectItem>
                        <SelectItem value="nature">Nature</SelectItem>
                        <SelectItem value="minimalist">Minimalist</SelectItem>
                        <SelectItem value="typewriter">Typewriter</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Tab Buttons */}
        <div
          role="tablist"
          aria-label="Tool selection"
          className="flex w-full mb-4 border border-border rounded-lg overflow-hidden"
        >
          <button
            ref={(el) => {
              tabRefs.current.tuner = el
            }}
            role="tab"
            id="tab-tuner"
            aria-selected={activeTab === "tuner"}
            aria-controls="panel-tuner"
            tabIndex={activeTab === "tuner" ? 0 : -1}
            onClick={() => setActiveTab("tuner")}
            onKeyDown={(e) => handleTabKeyDown(e, "tuner")}
            className={`flex-1 py-2 text-center font-medium text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeTab === "tuner"
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-card text-foreground hover:bg-muted/50"
            }`}
          >
            Tuner
          </button>
          <button
            ref={(el) => {
              tabRefs.current.tempo = el
            }}
            role="tab"
            id="tab-tempo"
            aria-selected={activeTab === "tempo"}
            aria-controls="panel-tempo"
            tabIndex={activeTab === "tempo" ? 0 : -1}
            onClick={() => setActiveTab("tempo")}
            onKeyDown={(e) => handleTabKeyDown(e, "tempo")}
            className={`flex-1 py-2 text-center font-medium text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeTab === "tempo"
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-card text-foreground hover:bg-muted/50"
            }`}
          >
            Tempo
          </button>
        </div>

        {/* Content */}
        <div
          role="tabpanel"
          id="panel-tempo"
          aria-labelledby="tab-tempo"
          hidden={activeTab !== "tempo"}
        >
          {activeTab === "tempo" && <TapTempo />}
        </div>
        <div
          role="tabpanel"
          id="panel-tuner"
          aria-labelledby="tab-tuner"
          hidden={activeTab !== "tuner"}
        >
          {activeTab === "tuner" && <Tuner key="tuner-component" />}
        </div>
      </div>
    </main>
  )
}

