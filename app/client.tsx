"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { ThemeToggle } from "@/components/theme-toggle"
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

export default function ClientApp() {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<"tempo" | "tuner">("tuner")

  useEffect(() => {
    setMounted(true)
  }, [])

  // Return null on server to prevent hydration issues
  if (!mounted) {
    return null
  }

  return (
    <main className="flex min-h-screen flex-col p-4 sm:p-6 bg-background">
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
            <ThemeToggle />
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
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select style" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Tab Buttons */}
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
        {activeTab === "tempo" && <TapTempo />}
        {activeTab === "tuner" && <Tuner key="tuner-component" />}
      </div>
    </main>
  )
}

