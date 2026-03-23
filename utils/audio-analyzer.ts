import { detectPitchYIN, getRMS, SIGNAL_THRESHOLD } from "@/utils/audio-processing"

// Noise floor tracking constants
const NOISE_FLOOR_ALPHA = 0.05 // Slow EMA for ambient noise estimation
const NOISE_FLOOR_MULTIPLIER = 3 // Signal must be N× above noise floor
const NOISE_FLOOR_MIN = SIGNAL_THRESHOLD // Never go below the hard minimum

/**
 * AudioAnalyzer class handles microphone input and pitch detection
 *
 * Uses FFT size of 8192 for good low-frequency resolution.
 * At 44100Hz sample rate:
 * - 8192 samples ≈ 186ms of audio
 * - Minimum detectable period = 4096 samples → ~10.8Hz
 * - Supports all standard instrument tuning ranges
 *
 * Includes adaptive noise floor tracking: measures ambient RMS during
 * silence and sets the effective signal threshold relative to it. This
 * handles both quiet instruments and noisy environments automatically.
 */
export class AudioAnalyzer {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private buffer: Float32Array<ArrayBuffer> | null = null
  private isInitialized = false
  private onError: (message: string) => void

  // Adaptive noise floor
  private noiseFloor: number = SIGNAL_THRESHOLD
  private noiseFloorInitialized: boolean = false

  // FFT size of 8192 provides better low-frequency accuracy:
  // - At 44100Hz: 8192 samples ≈ 186ms of audio
  // - Minimum detectable period = 4096 samples → ~10.8Hz
  // - Much better accuracy for bass guitar/low piano (E2 = 82.4Hz)
  // - The extra latency is offset by EMA smoothing in NoteDetector
  private readonly FFT_SIZE = 8192

  constructor(onError: (message: string) => void) {
    this.onError = onError
  }

  /**
   * Initialize the audio context and microphone access
   * Returns true on success, false on failure
   */
  async initialize(): Promise<boolean> {
    try {
      // Create audio context with proper fallbacks
      if (!this.audioContext) {
        console.log("AudioAnalyzer: Creating new AudioContext")
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        this.audioContext = new AudioContextClass()
      } else if (this.audioContext.state === "suspended") {
        console.log("AudioAnalyzer: Resuming suspended AudioContext")
        await this.audioContext.resume()
      }

      // Request microphone access with settings optimized for pitch detection
      // Disable all processing that could interfere with pitch detection
      if (!this.stream) {
        console.log("AudioAnalyzer: Requesting microphone stream")
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
        console.log("AudioAnalyzer: Microphone stream obtained successfully")
      }

      // Set up analyzer with optimized settings for pitch detection
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = this.FFT_SIZE
      // Low smoothing for responsive pitch tracking
      this.analyser.smoothingTimeConstant = 0

      // Connect audio source to analyzer
      this.source = this.audioContext.createMediaStreamSource(this.stream)
      this.source.connect(this.analyser)

      // Create buffer for analysis (time-domain data for YIN algorithm)
      this.buffer = new Float32Array(this.analyser.fftSize)

      this.isInitialized = true
      return true
    } catch (err) {
      console.error("Error accessing microphone:", err)
      this.onError("Microphone access denied. Please allow microphone access and reload the page.")
      return false
    }
  }

  /**
   * Get the current audio buffer (time-domain data)
   * Returns null if not initialized
   */
  getAudioData(): Float32Array<ArrayBuffer> | null {
    if (!this.isInitialized || !this.analyser || !this.buffer) return null

    this.analyser.getFloatTimeDomainData(this.buffer)
    return this.buffer
  }

  /**
   * Get the sample rate of the audio context
   */
  getSampleRate(): number {
    return this.audioContext?.sampleRate || 44100
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
   * Detect pitch using YIN algorithm
   * Returns frequency in Hz, or 0 if no pitch detected
   */
  detectPitch(buffer: Float32Array<ArrayBuffer>): number {
    if (!this.audioContext) return 0
    return detectPitchYIN(buffer, this.audioContext.sampleRate)
  }

  /**
   * Clean up all resources
   * Call this when the tuner is stopped
   */
  cleanup(): void {
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.analyser = null
    this.buffer = null
    this.isInitialized = false
  }
}
