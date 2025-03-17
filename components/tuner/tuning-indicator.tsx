import { ArrowUp, ArrowDown, Check } from "lucide-react"

interface TuningIndicatorProps {
  cents: number
  tuningStatus: "flat" | "sharp" | "in-tune" | null
  signalDetected: boolean
  isNoteLocked: boolean // Add isNoteLocked prop
}

export function TuningIndicator({ cents, tuningStatus, signalDetected, isNoteLocked }: TuningIndicatorProps) {
  return (
    <div className="flex flex-col items-center mb-6">
      <div className="relative w-64 h-16 flex items-center justify-center mb-2">
        {/* Tuning Meter */}
        <div className="absolute w-full h-1 bg-muted"></div>
        {/* In-tune zone indicator */}
        <div
          className={`absolute h-1 transition-colors duration-300 ${
            tuningStatus === "in-tune" && isNoteLocked ? "bg-green-500" : "bg-muted-foreground/30"
          }`}
          style={{
            width: "10%" /* +/- 5 cents = 10% of the total width */,
            left: "45%" /* Position it in the center (50% - 5%) */,
          }}
        ></div>

        {/* Indicator Needle - Show gray centered one when no signal or not locked */}
        <div
          className={`absolute w-1 h-8 transform -translate-x-1/2 transition-all duration-300 ${
            !signalDetected || !isNoteLocked
              ? "bg-gray-400 left-1/2"
              : tuningStatus === "in-tune"
                ? "bg-green-500"
                : "bg-red-500"
          }`}
          style={{
            left: signalDetected && isNoteLocked ? `${50 + Math.min(Math.max(cents, -50), 50)}%` : "50%",
          }}
        ></div>
      </div>

      {/* Tuning Status */}
      <div className="flex items-center justify-center h-8">
        {signalDetected && isNoteLocked && tuningStatus === "flat" && (
          <div className="flex items-center text-red-500">
            <ArrowDown className="h-5 w-5 mr-1" />
            <span>Too Low</span>
          </div>
        )}
        {signalDetected && isNoteLocked && tuningStatus === "in-tune" && (
          <div className="flex items-center text-green-500">
            <Check className="h-5 w-5 mr-1" />
            <span>In Tune</span>
          </div>
        )}
        {signalDetected && isNoteLocked && tuningStatus === "sharp" && (
          <div className="flex items-center text-red-500">
            <ArrowUp className="h-5 w-5 mr-1" />
            <span>Too High</span>
          </div>
        )}
        {(!signalDetected || !isNoteLocked) && (
          <div className="text-muted-foreground text-sm">
            {signalDetected && !isNoteLocked ? "Detecting note..." : "Play a note..."}
          </div>
        )}
      </div>
    </div>
  )
}

