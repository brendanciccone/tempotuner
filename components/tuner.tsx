"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Mic, RotateCcw } from "lucide-react"
import { useTuner } from "@/hooks/use-tuner"
import { NoteDisplay } from "@/components/tuner/note-display"
import { TuningIndicator } from "@/components/tuner/tuning-indicator"
import { TunerSettings } from "@/components/tuner/tuner-settings"

// Parent components (ClientWrapper, ClientApp) already gate rendering until
// client-side mount, so this component never runs during SSR and needs no
// additional hydration guard.
export default function Tuner() {
  const [state, actions] = useTuner()

  const getDisplayNote = () => {
    if (!state.currentNoteWithoutOctave) return "---"
    return state.showOctave && state.currentOctave !== null
      ? `${state.currentNoteWithoutOctave}${state.currentOctave}`
      : state.currentNoteWithoutOctave
  }

  const handleStartWithGesture = () => {
    void actions.startWithGesture()
  }

  const handleRetry = () => {
    void actions.retry()
  }

  return (
    <Card className="shadow-lg border border-border w-full overflow-hidden bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col items-center w-full">
          <NoteDisplay
            note={getDisplayNote()}
            frequency={state.displayFrequency}
            signalDetected={state.signalDetected}
            tuningStatus={state.tuningStatus}
            cents={state.cents}
            isNoteLocked={state.isNoteLocked}
          />

          <TuningIndicator
            cents={state.cents}
            tuningStatus={state.tuningStatus}
            signalDetected={state.signalDetected}
            isNoteLocked={state.isNoteLocked}
          />

          {/* Tap-to-start prompt for iOS Safari (AudioContext requires user gesture). */}
          {state.needsUserGesture && !state.error && (
            <div className="w-full mb-4 flex flex-col items-center gap-2">
              <Button
                onClick={handleStartWithGesture}
                className="gap-2"
                aria-label="Start tuner"
              >
                <Mic className="h-4 w-4" />
                Tap to start tuner
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Your browser needs a tap to enable the microphone.
              </p>
            </div>
          )}

          <TunerSettings
            referenceFreq={state.referenceFreq}
            useFlats={state.useFlats}
            showOctave={state.showOctave}
            onToggleNotation={actions.toggleNotation}
            onToggleOctaveDisplay={actions.toggleOctaveDisplay}
            onAdjustReferenceFreq={actions.adjustReferenceFreq}
            onResetReferenceFreq={actions.resetReferenceFreq}
          />

          {state.error && (
            <div className="mt-6 w-full flex flex-col items-center gap-2">
              <div className="text-sm text-error-high-contrast text-center">
                {state.error}
              </div>
              <Button
                onClick={handleRetry}
                variant="outline"
                size="sm"
                className="gap-2"
                aria-label="Retry microphone access"
              >
                <RotateCcw className="h-3 w-3" />
                Try again
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
