"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Metronome } from "@/components/metronome"

export default function TapTempo() {
  const [taps, setTaps] = useState<number[]>([])
  const [bpm, setBpm] = useState<number | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isMetronomePlaying, setIsMetronomePlaying] = useState(false)
  const [currentBeat, setCurrentBeat] = useState(0)

  const calculateBPM = useCallback((tapTimes: number[]) => {
    if (tapTimes.length < 2) return null

    // Calculate time differences between taps
    const intervals = []
    for (let i = 1; i < tapTimes.length; i++) {
      intervals.push(tapTimes[i] - tapTimes[i - 1])
    }

    // Calculate average interval
    const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length

    // Convert to BPM (60000 ms in a minute)
    // No upper limit here - we want to calculate the exact BPM
    return Math.round(60000 / averageInterval)
  }, [])

  const handleTap = useCallback(() => {
    const now = Date.now()

    // If it's been more than 2 seconds since last tap, reset
    if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
      setTaps([now])
      setBpm(null)
      return
    }

    // Keep only the last 8 taps for a more accurate recent tempo
    const newTaps = [...taps, now].slice(-8)
    setTaps(newTaps)

    // Calculate BPM if we have at least 2 taps
    if (newTaps.length >= 2) {
      const calculatedBpm = calculateBPM(newTaps)
      setBpm(calculatedBpm)
    }

    // Trigger animation
    setIsAnimating(true)
    setTimeout(() => setIsAnimating(false), 100)
  }, [taps, calculateBPM])

  // Add keyboard event listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent spacebar from scrolling the page
      if (e.code === "Space") {
        e.preventDefault()
      }
      handleTap()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleTap])

  // Handle metronome state changes
  const handleMetronomeStateChange = (playing: boolean, beat: number) => {
    setIsMetronomePlaying(playing)
    setCurrentBeat(beat)

    // Animate tap button on beat 1 (regardless of any other conditions)
    if (playing && beat === 1) {
      setIsAnimating(true)
      setTimeout(() => setIsAnimating(false), 100)
    }
  }

  // Determine if we should show the pulse animation
  const showPulse = isMetronomePlaying && currentBeat === 1

  return (
    <Card className="shadow-lg border border-border w-full overflow-hidden bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col items-center w-full">
          {/* BPM Display */}
          <div className="text-center w-full mb-6 sm:mb-8">
            <div
              className={`text-6xl sm:text-7xl font-bold tabular-nums select-none tracking-tighter ${bpm === null ? "text-muted-foreground opacity-50" : ""}`}
            >
              {bpm !== null ? bpm : "---"}
            </div>
            <div className="text-sm text-muted-foreground mt-1 font-medium">BEATS PER MINUTE</div>
          </div>

          {/* Tap Tempo Section */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative">
              {/* Pulse Animation Ring */}
              {showPulse && (
                <div
                  className="absolute -inset-4 rounded-full bg-primary/10 animate-pulse-ring"
                  style={{ animationDuration: bpm ? `${60 / bpm}s` : "1s" }}
                />
              )}

              {/* Tap Button */}
              <div
                className={`w-36 sm:w-40 aspect-square rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl cursor-pointer transition-all select-none user-select-none shadow-lg hover:shadow-xl active:shadow-md ${
                  isAnimating ? "scale-95" : ""
                }`}
                onClick={handleTap}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    handleTap()
                  }
                }}
                style={{ WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none', userSelect: 'none' }}
              >
                <span className="pointer-events-none" style={{ WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none', userSelect: 'none' }}>TAP</span>
              </div>
            </div>
          </div>

          {/* Metronome Section */}
          <div className="w-full max-w-md mx-auto mt-4">
            <Metronome
              initialBpm={bpm || 120}
              onBpmChange={(newBpm) => {
                // Set our tap tempo BPM without any limits
                setBpm(newBpm)
              }}
              onStateChange={handleMetronomeStateChange}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

