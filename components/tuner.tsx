"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
    <Card className="w-full overflow-hidden pt-0">
      {/* Full-width inverse strip — the machine's own heading for the region. */}
      <div className="bg-fill text-on-fill text-center py-1 px-4 uppercase tracking-display">
        Chromatic Tuner
      </div>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col items-center w-full">
          <NoteDisplay
            note={getDisplayNote()}
            frequency={state.displayFrequency}
            signalDetected={state.signalDetected}
            tuningStatus={state.tuningStatus}
            cents={state.cents}
          />

          <TuningIndicator
            cents={state.cents}
            tuningStatus={state.tuningStatus}
            signalDetected={state.signalDetected}
          />

          {/* Initialising prompt — shown while the mic permission request is in flight. */}
          {state.isInitializing && !state.error && !state.needsUserGesture && (
            <div
              className="w-full mb-4 text-sm text-ink-dim text-center uppercase tracking-body"
              role="status"
              aria-live="polite"
            >
              Requesting microphone access
              <span className="blink" aria-hidden="true">
                █
              </span>
            </div>
          )}

          {/* Tap-to-start prompt for iOS Safari (AudioContext requires user gesture). */}
          {state.needsUserGesture && !state.error && (
            <div className="w-full mb-4 flex flex-col items-center gap-2">
              {/* No aria-label: it would shadow the visible text and leave
                  speech-input users unable to say what they can see. */}
              <Button onClick={handleStartWithGesture}>
                <span aria-hidden="true">✳</span> Tap to start tuner
              </Button>
              <p className="text-sm text-ink-dim text-center uppercase tracking-body">
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

          {/* Law 1: a fault is inverse video plus blink, never a red box. */}
          {state.error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mt-6 w-full flex flex-col items-center gap-3"
            >
              <div className="w-full bg-fill-bright text-on-fill px-3 py-1 text-sm uppercase tracking-body text-center">
                <span className="blink" aria-hidden="true">
                  ✳✳{" "}
                </span>
                Fault: {state.error}
              </div>
              {/* A superset of the visible text, so "try again" still matches. */}
              <Button
                onClick={handleRetry}
                variant="outline"
                aria-label="Try again — retry microphone access"
              >
                <span aria-hidden="true">↺</span> Try again
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
