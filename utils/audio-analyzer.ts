// Core audio processing utilities
import { detectLowFrequencySignal, detectPitchZeroCrossing, detectPitchYIN } from "@/utils/audio-processing"

export class AudioAnalyzer {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private buffer: Float32Array | null = null
  private isInitialized = false
  private onError: (message: string) => void

  constructor(onError: (message: string) => void) {
    this.onError = onError
  }

  async initialize(): Promise<boolean> {
    try {
      // Create audio context with proper fallbacks
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      } else if (this.audioContext.state === "suspended") {
        await this.audioContext.resume()
      }

      // Request microphone access with explicit error handling
      if (!this.stream) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
      }

      // Set up analyzer with optimized settings for better low frequency detection
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 16384 // Large FFT size for better low frequency resolution
      this.analyser.smoothingTimeConstant = 0.5 // Reduced for better responsiveness (was 0.6)

      // Connect audio source to analyzer
      this.source = this.audioContext.createMediaStreamSource(this.stream)
      this.source.connect(this.analyser)

      // Create buffer for analysis
      this.buffer = new Float32Array(this.analyser.fftSize)

      this.isInitialized = true
      return true
    } catch (err) {
      console.error("Error accessing microphone:", err)
      this.onError("Microphone access denied. Please allow microphone access and reload the page.")
      return false
    }
  }

  getAudioData(): Float32Array | null {
    if (!this.isInitialized || !this.analyser || !this.buffer) return null

    this.analyser.getFloatTimeDomainData(this.buffer)
    return this.buffer
  }

  getSampleRate(): number {
    return this.audioContext?.sampleRate || 44100
  }

  // Detect pitch using the most appropriate algorithm based on signal characteristics
  detectPitch(buffer: Float32Array): number {
    if (!this.audioContext) return 0

    // Detect if we're likely dealing with a low frequency signal
    const isLowFrequency = detectLowFrequencySignal(buffer, this.audioContext.sampleRate)

    // Use appropriate pitch detection method
    if (isLowFrequency) {
      // Always use zero-crossing for very low frequencies
      return detectPitchZeroCrossing(buffer, this.audioContext.sampleRate)
    } else {
      // Use YIN algorithm for mid to high frequencies
      return detectPitchYIN(buffer, this.audioContext.sampleRate)
    }
  }

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

