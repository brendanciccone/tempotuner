interface NoteDisplayProps {
  note: string
  frequency: number | null
  signalDetected: boolean
  tuningStatus: "flat" | "sharp" | "in-tune" | null
  cents: number
  isNoteLocked: boolean // Add isNoteLocked prop
}

export function NoteDisplay({ note, frequency, signalDetected, tuningStatus, cents, isNoteLocked }: NoteDisplayProps) {
  // Get the color for the note display based on tuning status
  const getNoteDisplayColor = () => {
    if (!signalDetected || !isNoteLocked) return "text-muted-foreground opacity-50"
    if (tuningStatus === "flat" || tuningStatus === "sharp") return "text-red-500"
    if (tuningStatus === "in-tune") return "text-green-500"
    return ""
  }

  return (
    <div className="text-center w-full mb-6">
      <div
        className={`text-6xl sm:text-7xl font-bold tabular-nums select-none tracking-tighter transition-colors duration-200 ${getNoteDisplayColor()}`}
      >
        {signalDetected && isNoteLocked ? note : "---"}
      </div>
      <div className="text-sm text-muted-foreground mt-1 font-medium">
        {frequency && signalDetected && isNoteLocked
          ? `${frequency.toFixed(1)} Hz (${cents > 0 ? "+" : ""}${cents} ct)`
          : "FREQUENCY"}
      </div>
    </div>
  )
}

