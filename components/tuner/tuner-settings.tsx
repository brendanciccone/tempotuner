"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
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

// The literal ON / OFF text is mandatory: on a monochrome panel a thumb
// position alone is ambiguous, because there is no colour to say "this is live".
const ToggleState = ({ on }: { on: boolean }) => (
  <span
    className={cn(
      "w-[3ch] text-sm uppercase tracking-body",
      on ? "text-ink-bright text-glow" : "text-ink-dim",
    )}
    aria-hidden="true"
  >
    {on ? "On" : "Off"}
  </span>
)

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
    <div className="relative w-full border-2 border-stroke rounded-lg px-4 pt-6 pb-4">
      {/* Legend chip breaking the top rule — the panel names itself. */}
      <div className="absolute -top-[10px] left-3 px-2 bg-screen-raised text-sm uppercase tracking-display text-ink text-glow leading-none">
        Calibration
      </div>

      <div className="flex flex-col gap-4">
        {/* Use Flats Toggle */}
        <div className="flex items-center justify-between w-full gap-3">
          <Label htmlFor="notation-toggle" className="uppercase tracking-body">
            Use Flats
          </Label>
          <div className="flex items-center gap-3">
            <Switch id="notation-toggle" checked={useFlats} onCheckedChange={onToggleNotation} />
            <ToggleState on={useFlats} />
          </div>
        </div>

        {/* Show Octave Toggle */}
        <div className="flex items-center justify-between w-full gap-3">
          <Label htmlFor="octave-toggle" className="uppercase tracking-body">
            Show Octave
          </Label>
          <div className="flex items-center gap-3">
            <Switch
              id="octave-toggle"
              checked={showOctave}
              onCheckedChange={onToggleOctaveDisplay}
            />
            <ToggleState on={showOctave} />
          </div>
        </div>

        {/* Reference Frequency Stepper. The stepper drops to its own row on a
            narrow panel: at 340px the label and three 44px keys do not fit on
            one line, and a wrapped "BASE / FREQ" reads as two settings. */}
        <div className="flex flex-col gap-2 w-full sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span className="uppercase tracking-body whitespace-nowrap" id="reference-freq-label">
            Base Freq
          </span>
          <div className="flex items-center gap-2">
            {isFrequencyChanged && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onResetReferenceFreq}
                title="Reset to 440 Hz"
              >
                <span aria-hidden="true">↺</span>
                <span className="sr-only">Reset frequency</span>
              </Button>
            )}
            <div
              className="flex items-center border-2 border-input rounded-sm"
              role="group"
              aria-labelledby="reference-freq-label"
            >
              <Button
                variant="ghost"
                size="icon"
                className="rounded-none"
                onClick={() => onAdjustReferenceFreq(-0.5)}
                disabled={referenceFreq <= 420}
              >
                <span aria-hidden="true">−</span>
                <span className="sr-only">Decrease reference frequency</span>
              </Button>
              <div className="px-2 text-sm tabular-nums min-w-[88px] whitespace-nowrap text-center text-ink-bright text-glow">
                {referenceFreq.toFixed(1)} Hz
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-none"
                onClick={() => onAdjustReferenceFreq(0.5)}
                disabled={referenceFreq >= 460}
              >
                <span aria-hidden="true">+</span>
                <span className="sr-only">Increase reference frequency</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
