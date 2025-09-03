// Core audio processing utilities
import { detectLowFrequencySignal, detectPitchZeroCrossing, detectPitchYIN } from "@/utils/audio-processing"
// Browser-only: microphone permissions handled via getUserMedia

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
        console.log('AudioAnalyzer: Creating new AudioContext')
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      } else if (this.audioContext.state === "suspended") {
        console.log('AudioAnalyzer: Resuming suspended AudioContext')
        await this.audioContext.resume()
      }

      // Request microphone access with explicit error handling
      if (!this.stream) {
        console.log('AudioAnalyzer: Requesting microphone stream')
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
        console.log('AudioAnalyzer: Microphone stream obtained successfully')
      }

      // Set up analyzer with optimized settings for better frequency detection
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 4096 // Further reduced for faster response and better performance
      this.analyser.smoothingTimeConstant = 0.2 // Further reduced for better responsiveness

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

  // Detect pitch using optimized algorithm selection for guitar strings
  detectPitch(buffer: Float32Array): number {
    if (!this.audioContext) return 0

    const sampleRate = this.audioContext.sampleRate
    
    // For guitar tuning, use different algorithms based on frequency ranges
    // Zero-crossing works better for low E and A (below 110Hz)
    // YIN works better for mid to high frequencies
    const isLowFrequency = detectLowFrequencySignal(buffer, sampleRate)
    
    if (isLowFrequency) {
      // Use zero-crossing for low frequencies (E, A strings)
      return detectPitchZeroCrossing(buffer, sampleRate)
    } else {
      // For mid to high frequencies, use YIN with optimized parameters
      const yinFrequency = detectPitchYIN(buffer, sampleRate)
      
      // For mid-range frequencies (100-300Hz), cross-check with zero-crossing
      // This helps correct potential errors in either algorithm
      if (yinFrequency > 100 && yinFrequency < 300) {
        const zcFrequency = detectPitchZeroCrossing(buffer, sampleRate)
        
        // If both algorithms detected something in a similar range, average them
        // This helps eliminate the tendency to be sharp or flat
        if (zcFrequency > 0 && Math.abs(yinFrequency - zcFrequency) / yinFrequency < 0.1) {
          // Weighted average with more emphasis on YIN for mid-range
          return (yinFrequency * 0.7 + zcFrequency * 0.3);
        }
      }
      
      return yinFrequency;
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

