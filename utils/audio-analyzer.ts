import { analysisFrameSize, detectPitchYIN, SIGNAL_THRESHOLD } from "@/utils/audio-processing"

// Augment Window so we can access the legacy webkit-prefixed AudioContext
// constructor without a cast. Some older WebKit builds (and Safari versions
// predating the unprefixed constructor) only expose this name.
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

// Noise floor tracking constants
const NOISE_FLOOR_ALPHA = 0.05 // Slow EMA for ambient noise estimation
const NOISE_FLOOR_MULTIPLIER = 3 // Signal must be N× above noise floor
const NOISE_FLOOR_MIN = SIGNAL_THRESHOLD // Never go below the hard minimum

// Only a fallback for getSampleRate() before a context exists; the context
// itself always runs at the device's own rate (see createAudioContext).
const FALLBACK_SAMPLE_RATE = 44100

/**
 * Discriminated outcome of {@link AudioAnalyzer.initialize}.
 *
 * `success` means the mic stream is live and the AudioContext is running.
 * `needs-gesture` means the AudioContext was created but is still suspended
 * after `resume()` (typical on iOS Safari without a user gesture). The caller
 * should surface a "tap to start" UI that calls {@link AudioAnalyzer.resume}.
 * `error` carries an actionable message already shown to the user.
 * `cancelled` means {@link AudioAnalyzer.cleanup} ran while initialisation was
 * still waiting (typically on the permission prompt); anything acquired late
 * has already been released and there is nothing to report.
 */
export type InitResult = "success" | "needs-gesture" | "error" | "cancelled"

/**
 * Categorised failure reason. Used by {@link AudioAnalyzer} to map raw
 * errors / feature-detection results to user-facing messages.
 */
type FailureReason =
  | "insecure-context"
  | "unsupported-browser"
  | "permission-denied"
  | "no-microphone"
  | "microphone-busy"
  | "constraints-unsupported"
  | "aborted"
  | "audio-context-unavailable"
  | "unknown"

const FAILURE_MESSAGES: Record<FailureReason, string> = {
  "insecure-context":
    "Microphone access requires a secure connection (HTTPS). Please reload over HTTPS.",
  "unsupported-browser":
    "This browser doesn't support microphone input. Try the latest Chrome, Firefox, Safari, or Edge — and avoid in-app browsers (Instagram, TikTok, etc.).",
  "permission-denied":
    "Microphone access denied. Allow microphone access in your browser settings, then try again.",
  "no-microphone":
    "No microphone was found. Please connect a microphone and try again.",
  "microphone-busy":
    "Your microphone is in use by another app. Close other apps using the mic and try again.",
  "constraints-unsupported":
    "Your microphone doesn't support the requested settings. Try a different input device.",
  "aborted": "Microphone request was cancelled. Try again to start the tuner.",
  "audio-context-unavailable":
    "Web Audio is not available in this browser. Please use a modern browser.",
  "unknown": "Couldn't start the tuner. Please try again.",
}

/**
 * AudioAnalyzer class handles microphone input and pitch detection
 *
 * The analysis frame is sized from the device's sample rate (see
 * analysisFrameSize): 8192 samples at 44.1–96kHz, larger at 176.4/192kHz, so
 * the lowest note's period always fits in half a frame.
 *
 * Browser compatibility:
 * - Falls back to getByteTimeDomainData when getFloatTimeDomainData is missing (older iOS Safari)
 * - Runs the AudioContext at the device's own sample rate (Firefox refuses to connect a mic to any other)
 * - Falls back to `webkitAudioContext` when the unprefixed constructor is missing
 * - Handles AudioContext "interrupted" state (tab switch, lock screen on iOS)
 * - Surfaces a `needs-gesture` outcome when iOS Safari leaves the context suspended after resume()
 * - Maps DOMException names to specific user-facing messages
 */
export class AudioAnalyzer {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private buffer: Float32Array<ArrayBuffer> | null = null
  private byteBuffer: Uint8Array<ArrayBuffer> | null = null // Fallback for older iOS Safari
  private useFloatData: boolean = true // false when getFloatTimeDomainData is unavailable
  private isInitialized = false
  private onError: (message: string) => void

  // Adaptive noise floor
  private noiseFloor: number = SIGNAL_THRESHOLD
  private noiseFloorInitialized: boolean = false

  constructor(onError: (message: string) => void) {
    this.onError = onError
  }

  /**
   * Initialise the audio context and microphone access.
   *
   * Returns:
   * - "success" when the mic stream is live and the context is running
   * - "needs-gesture" when the context is still suspended (iOS Safari without user gesture)
   * - "error" when initialisation failed; an actionable message has been delivered via onError
   * - "cancelled" when cleanup() ran before initialisation finished
   */
  async initialize(): Promise<InitResult> {
    // 1. Secure-context check — getUserMedia silently fails over plain HTTP
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      this.fail("insecure-context")
      return "error"
    }

    // 2. Feature detection — covers in-app webviews, ancient browsers, locked-down profiles
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      this.fail("unsupported-browser")
      return "error"
    }

    // The context this attempt runs against. cleanup() replaces it with null,
    // which is how every await below tells that the attempt was abandoned.
    let context: AudioContext | null = null

    try {
      // 3. Create AudioContext with vendor-prefix fallback
      if (!this.audioContext) {
        const created = this.createAudioContext()
        if (!created) {
          this.fail("audio-context-unavailable")
          return "error"
        }
        this.audioContext = created
      }
      context = this.audioContext

      // 4. Try to resume — handles "suspended" (initial) and "interrupted" (tab switch / lock screen)
      await this.tryResume()
      if (this.audioContext !== context) return "cancelled"

      // 5. Request microphone with pitch-detection-friendly constraints
      if (!this.stream) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
        // cleanup() can run while the permission prompt is open — the user
        // switches to the Tempo tab without answering it. The grant arrives
        // afterwards, and a stream kept from it would hold the microphone (and
        // the browser's recording indicator) open with nothing to release it.
        if (this.audioContext !== context) {
          stream.getTracks().forEach((track) => track.stop())
          return "cancelled"
        }
        this.stream = stream
      }

      // 6. Wire up the analyser
      this.analyser = context.createAnalyser()
      this.analyser.fftSize = analysisFrameSize(context.sampleRate)
      this.analyser.smoothingTimeConstant = 0 // Low smoothing for responsive pitch tracking

      this.source = context.createMediaStreamSource(this.stream)
      this.source.connect(this.analyser)

      this.buffer = new Float32Array(this.analyser.fftSize)

      // 7. Detect whether getFloatTimeDomainData is available (missing on older iOS Safari)
      if (typeof this.analyser.getFloatTimeDomainData !== "function") {
        this.useFloatData = false
        // Cast is required because `new Uint8Array(n)` infers the generic as
        // `ArrayBufferLike` under TS 5.7+ buffer-typed arrays, but the field
        // type is the narrower `Uint8Array<ArrayBuffer>` (we never use a
        // SharedArrayBuffer here — getByteTimeDomainData writes into a plain
        // ArrayBuffer-backed view).
        this.byteBuffer = new Uint8Array(this.analyser.fftSize) as Uint8Array<ArrayBuffer>
      }

      this.isInitialized = true

      // 8. iOS Safari: even after resume(), the context can stay suspended
      // (or in iOS's non-standard "interrupted" state) without an in-gesture
      // call. Surface that to the UI so it can prompt for a tap.
      if (this.isSuspended()) {
        return "needs-gesture"
      }

      return "success"
    } catch (err) {
      // A refusal (or any failure) that lands after cleanup() belongs to an
      // attempt nobody is waiting on; reporting it would put a stale error on
      // whatever mounted next.
      if (context !== null && this.audioContext !== context) return "cancelled"
      this.fail(this.classifyError(err), err)
      return "error"
    }
  }

  /**
   * Map a DOMException (or any unknown error) to a {@link FailureReason}.
   * Names follow the WebRTC spec: https://w3c.github.io/mediacapture-main/#methods
   */
  private classifyError(err: unknown): FailureReason {
    if (
      typeof err === "object" &&
      err !== null &&
      "name" in err &&
      typeof err.name === "string"
    ) {
      switch (err.name) {
        case "NotAllowedError":
        case "PermissionDeniedError": // legacy alias
          return "permission-denied"
        case "NotFoundError":
        case "DevicesNotFoundError": // legacy alias
          return "no-microphone"
        case "NotReadableError":
        case "TrackStartError": // legacy alias
          return "microphone-busy"
        case "OverconstrainedError":
        case "ConstraintNotSatisfiedError": // legacy alias
          return "constraints-unsupported"
        case "SecurityError":
          return "insecure-context"
        case "AbortError":
          return "aborted"
        case "TypeError":
          // getUserMedia throws TypeError when called with no audio/video constraints
          // or in non-secure contexts on some browsers
          return "unsupported-browser"
      }
    }
    return "unknown"
  }

  /**
   * Create an AudioContext at the device's own sample rate.
   *
   * No `sampleRate` is requested, on purpose. Firefox constructs a context at
   * any rate it is asked for, but then refuses to connect a microphone stream
   * to it unless the rate matches the device ("Connecting AudioNodes from
   * AudioContexts with different sample-rate is currently not supported") — so
   * asking for 44100Hz broke the tuner outright on the common 48kHz mic. YIN
   * reads the context's actual rate, so nothing here depends on a fixed one,
   * and leaving it to the device avoids resampling the input at all.
   */
  private createAudioContext(): AudioContext | null {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext

    if (typeof AudioContextClass !== "function") {
      return null
    }

    try {
      return new AudioContextClass()
    } catch (err) {
      // The constructor throws when the platform cannot open an audio device
      // (or has hit its context limit); that is reported as Web Audio being
      // unavailable, with the underlying error logged for diagnosis.
      console.error("AudioAnalyzer: AudioContext construction failed", err)
      return null
    }
  }

  /**
   * Attempt to resume the AudioContext. Swallows errors — the caller checks
   * `state` afterwards to decide whether a user gesture is still required.
   */
  private async tryResume(): Promise<void> {
    if (!this.audioContext) return
    // iOS Safari adds an "interrupted" state that isn't in the standard typedef
    const state = this.audioContext.state as string
    if (state === "suspended" || state === "interrupted") {
      try {
        await this.audioContext.resume()
      } catch {
        // Resume failure is expected on iOS without a user gesture; UI handles it.
      }
    }
  }

  private fail(reason: FailureReason, err?: unknown): void {
    if (err !== undefined) {
      console.error("AudioAnalyzer:", reason, err)
    }
    this.onError(FAILURE_MESSAGES[reason])
  }

  /**
   * Get the current audio buffer (time-domain data as Float32Array)
   * Returns null if not initialized.
   *
   * On older iOS Safari where getFloatTimeDomainData doesn't exist, falls back to
   * getByteTimeDomainData and converts unsigned bytes [0, 255] to floats [-1, 1].
   */
  getAudioData(): Float32Array<ArrayBuffer> | null {
    if (!this.isInitialized || !this.analyser || !this.buffer) return null

    if (this.useFloatData) {
      this.analyser.getFloatTimeDomainData(this.buffer)
    } else if (this.byteBuffer) {
      this.analyser.getByteTimeDomainData(this.byteBuffer)
      for (let i = 0; i < this.byteBuffer.length; i++) {
        // Convert [0, 255] → [-1.0, 1.0] (128 maps to 0.0)
        this.buffer[i] = (this.byteBuffer[i] - 128) / 128
      }
    }

    return this.buffer
  }

  /**
   * Get the sample rate of the audio context (whatever the hardware actually gave us).
   */
  getSampleRate(): number {
    return this.audioContext?.sampleRate || FALLBACK_SAMPLE_RATE
  }

  /**
   * Get the effective signal threshold, accounting for ambient noise.
   * The threshold is max(hardMin, noiseFloor * multiplier), so it adapts
   * to the environment — a quiet room gets a lower threshold (more sensitive),
   * a noisy room gets a higher threshold (fewer false triggers).
   */
  getEffectiveThreshold(): number {
    return Math.max(NOISE_FLOOR_MIN, this.noiseFloor * NOISE_FLOOR_MULTIPLIER)
  }

  /**
   * Update the ambient noise floor estimate.
   * Call this with the current RMS when no signal is detected (silence frames).
   * Uses a slow EMA so it adapts gradually to changing environments.
   */
  updateNoiseFloor(rms: number): void {
    if (!this.noiseFloorInitialized) {
      this.noiseFloor = rms
      this.noiseFloorInitialized = true
    } else {
      this.noiseFloor += NOISE_FLOOR_ALPHA * (rms - this.noiseFloor)
    }
  }

  /**
   * Resume the AudioContext if it was suspended or interrupted.
   * Call this from a user-gesture handler (button click) on iOS Safari, or on
   * visibility change when the user returns to the tab.
   *
   * Returns true if the context is running after the call, false otherwise.
   */
  async resume(): Promise<boolean> {
    if (!this.audioContext) return false
    await this.tryResume()
    return this.audioContext.state === "running"
  }

  /**
   * Whether the audio context is still suspended and needs a user gesture
   * to resume. Used by the UI to decide whether to show a "tap to start" prompt.
   */
  isSuspended(): boolean {
    if (!this.audioContext) return false
    const state = this.audioContext.state as string
    return state === "suspended" || state === "interrupted"
  }

  /**
   * Detect pitch using YIN algorithm
   * Returns frequency in Hz, or 0 if no pitch detected
   */
  detectPitch(buffer: Float32Array<ArrayBuffer>): number {
    if (!this.audioContext) return 0
    return detectPitchYIN(buffer, this.audioContext.sampleRate)
  }

  /**
   * Release all resources. Returns a Promise that resolves when the AudioContext
   * has fully closed — important to await before re-creating a context (retry flow),
   * since the Web Audio spec only releases creation-blocking resources after close()
   * resolves. Browsers limit concurrent AudioContexts; on Safari/iOS this race is
   * a known cause of flaky mic re-init.
   *
   * The unmount path is allowed to fire-and-forget; only explicit retry must await.
   */
  async cleanup(): Promise<void> {
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }

    // Capture the close() promise before nulling the ref so callers can await it.
    const context = this.audioContext
    this.audioContext = null
    this.analyser = null
    this.buffer = null
    this.byteBuffer = null
    this.isInitialized = false

    if (context) {
      try {
        await context.close()
      } catch {
        // Closing an already-closed context throws on some browsers; ignore.
      }
    }
  }
}
