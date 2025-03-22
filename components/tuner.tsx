"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { useTuner } from "@/hooks/use-tuner"
import { NoteDisplay } from "@/components/tuner/note-display"
import { TuningIndicator } from "@/components/tuner/tuning-indicator"
import { TunerSettings } from "@/components/tuner/tuner-settings"

export default function Tuner() {
  const [mounted, setMounted] = useState(false)
  const [state, actions] = useTuner()
  
  useEffect(() => {
    setMounted(true)
  }, [])

  // Get the display note based on current settings
  const getDisplayNote = () => {
    if (!state.currentNoteWithoutOctave) return "---"
    return state.showOctave && state.currentOctave !== null
      ? `${state.currentNoteWithoutOctave}${state.currentOctave}`
      : state.currentNoteWithoutOctave
  }

  // Return a simple placeholder during server rendering to prevent hydration issues
  if (!mounted) {
    return (
      <Card className="shadow-lg border border-border w-full overflow-hidden bg-card/50 backdrop-blur-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col items-center w-full min-h-[300px]"></div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-lg border border-border w-full overflow-hidden bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col items-center w-full">
          {/* Note Display */}
          <NoteDisplay
            note={getDisplayNote()}
            frequency={state.displayFrequency}
            signalDetected={state.signalDetected}
            tuningStatus={state.tuningStatus}
            cents={state.cents}
            isNoteLocked={state.isNoteLocked}
          />

          {/* Tuning Indicator */}
          <TuningIndicator
            cents={state.cents}
            tuningStatus={state.tuningStatus}
            signalDetected={state.signalDetected}
            isNoteLocked={state.isNoteLocked}
          />

          {/* Settings */}
          <TunerSettings
            referenceFreq={state.referenceFreq}
            useFlats={state.useFlats}
            showOctave={state.showOctave}
            onToggleNotation={actions.toggleNotation}
            onToggleOctaveDisplay={actions.toggleOctaveDisplay}
            onAdjustReferenceFreq={actions.adjustReferenceFreq}
            onResetReferenceFreq={actions.resetReferenceFreq}
          />

          {/* Error Message */}
          {state.error && <div className="mt-6 text-sm text-destructive text-center">{state.error}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

