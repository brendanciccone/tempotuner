"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Plus, Minus, RotateCcw } from "lucide-react"
import { DEFAULT_A4_FREQ } from "@/utils/note-utils"

interface TunerSettingsProps {
  referenceFreq: number
  useFlats: boolean
  showOctave: boolean
  onToggleNotation: () => void
  onToggleOctaveDisplay: () => void
  onAdjustReferenceFreq: (increment: number) => void
  onResetReferenceFreq: () => void
}

export function TunerSettings({
  referenceFreq,
  useFlats,
  showOctave,
  onToggleNotation,
  onToggleOctaveDisplay,
  onAdjustReferenceFreq,
  onResetReferenceFreq,
}: TunerSettingsProps) {
  // Check if frequency has been changed from default
  const isFrequencyChanged = referenceFreq !== DEFAULT_A4_FREQ

  return (
    <div className="w-full bg-background/10 backdrop-blur-sm rounded-xl p-4 border border-border shadow-sm">
      <div className="flex flex-col gap-4">
        {/* Use Flats Toggle */}
        <div className="flex items-center justify-between w-full">
          <Label htmlFor="notation-toggle" className="text-sm">
            Use Flats
          </Label>
          <Switch id="notation-toggle" checked={useFlats} onCheckedChange={onToggleNotation} />
        </div>

        {/* Show Octave Toggle */}
        <div className="flex items-center justify-between w-full">
          <Label htmlFor="octave-toggle" className="text-sm">
            Show Octave
          </Label>
          <Switch id="octave-toggle" checked={showOctave} onCheckedChange={onToggleOctaveDisplay} />
        </div>

        {/* Reference Frequency Stepper */}
        <div className="flex items-center justify-between w-full">
          <Label htmlFor="reference-freq" className="text-sm">
            Base Frequency
          </Label>
          <div className="flex items-center">
            {isFrequencyChanged && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 mr-1"
                onClick={onResetReferenceFreq}
                title="Reset to 440 Hz"
              >
                <RotateCcw className="h-3 w-3" />
                <span className="sr-only">Reset frequency</span>
              </Button>
            )}
            <div className="flex items-center border border-input rounded-md bg-background/50">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-r-none"
                onClick={() => onAdjustReferenceFreq(-0.5)}
                disabled={referenceFreq <= 420}
              >
                <Minus className="h-3 w-3" />
                <span className="sr-only">Decrease reference frequency</span>
              </Button>
              <div className="px-2 text-sm font-medium tabular-nums min-w-[60px] text-center">
                {referenceFreq.toFixed(1)} Hz
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-l-none"
                onClick={() => onAdjustReferenceFreq(0.5)}
                disabled={referenceFreq >= 460}
              >
                <Plus className="h-3 w-3" />
                <span className="sr-only">Increase reference frequency</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

