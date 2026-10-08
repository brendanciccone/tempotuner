import { describe, expect, it } from "vitest"
import { fftInPlace, isPowerOfTwo, nextPowerOfTwo } from "@/utils/fft"
import { detectPitchYIN, differenceFunction, MIN_FREQUENCY } from "@/utils/audio-processing"

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

const SAMPLE_RATE = 44100
const FRAME = 8192

const tone = (
  frequency: number,
  { sampleRate = SAMPLE_RATE, length = FRAME, amplitude = 0.5, harmonics = [] as number[] } = {},
): Float32Array<ArrayBuffer> => {
  const buffer = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    let sample = amplitude * Math.sin(2 * Math.PI * frequency * t)
    harmonics.forEach((gain, index) => {
      sample += gain * amplitude * Math.sin(2 * Math.PI * frequency * (index + 2) * t)
    })
    buffer[i] = sample
  }
  return buffer
}

/** The textbook O(N·maxTau) sum the FFT form replaces, kept as the oracle. */
const directDifference = (buffer: Float32Array, maxTau: number): Float32Array => {
  const out = new Float32Array(maxTau + 1)
  for (let tau = 0; tau <= maxTau; tau++) {
    let sum = 0
    for (let i = 0; i < buffer.length - tau; i++) {
      const delta = buffer[i] - buffer[i + tau]
      sum += delta * delta
    }
    out[tau] = sum
  }
  return out
}

const centsBetween = (a: number, b: number): number => 1200 * Math.log2(a / b)

// Deterministic noise so a failure reproduces.
const seededNoise = (length: number, amplitude: number): Float32Array<ArrayBuffer> => {
  let seed = 12345
  const buffer = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    buffer[i] = amplitude * ((seed / 2147483648) * 2 - 1)
  }
  return buffer
}

// ----------------------------------------------------------------
// FFT
// ----------------------------------------------------------------

describe("fftInPlace", () => {
  it("rejects a size that is not a power of two", () => {
    expect(() => fftInPlace(new Float64Array(6), new Float64Array(6))).toThrow(RangeError)
    expect(() => fftInPlace(new Float64Array(0), new Float64Array(0))).toThrow(RangeError)
  })

  it("rejects mismatched real and imaginary lengths", () => {
    expect(() => fftInPlace(new Float64Array(8), new Float64Array(4))).toThrow(RangeError)
  })

  it("matches a naive DFT", () => {
    const n = 16
    const input = Array.from({ length: n }, (_, i) => Math.sin(i * 0.7) + 0.3 * Math.cos(i * 2.1))
    const re = Float64Array.from(input)
    const im = new Float64Array(n)

    fftInPlace(re, im)

    for (let k = 0; k < n; k++) {
      let expectedRe = 0
      let expectedIm = 0
      for (let j = 0; j < n; j++) {
        const angle = (-2 * Math.PI * j * k) / n
        expectedRe += input[j] * Math.cos(angle)
        expectedIm += input[j] * Math.sin(angle)
      }
      expect(re[k]).toBeCloseTo(expectedRe, 9)
      expect(im[k]).toBeCloseTo(expectedIm, 9)
    }
  })

  it("leaves a single sample unchanged", () => {
    const re = Float64Array.of(3)
    const im = Float64Array.of(-1)
    fftInPlace(re, im)
    expect([re[0], im[0]]).toEqual([3, -1])
  })
})

describe("nextPowerOfTwo / isPowerOfTwo", () => {
  it("rounds up to the next power of two", () => {
    expect(nextPowerOfTwo(1)).toBe(1)
    expect(nextPowerOfTwo(9796)).toBe(16384)
    expect(nextPowerOfTwo(16384)).toBe(16384)
  })

  it("rejects values below one and non-finite values", () => {
    expect(() => nextPowerOfTwo(0)).toThrow(RangeError)
    expect(() => nextPowerOfTwo(Number.NaN)).toThrow(RangeError)
    expect(() => nextPowerOfTwo(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it("recognises powers of two only", () => {
    expect(isPowerOfTwo(8192)).toBe(true)
    expect(isPowerOfTwo(0)).toBe(false)
    expect(isPowerOfTwo(12)).toBe(false)
    expect(isPowerOfTwo(2.5)).toBe(false)
  })
})

// ----------------------------------------------------------------
// YIN difference function
// ----------------------------------------------------------------

describe("differenceFunction", () => {
  it("rejects a lag range outside the frame", () => {
    const buffer = tone(440, { length: 64 })
    expect(() => differenceFunction(buffer, 64, new Float32Array(65))).toThrow(RangeError)
    expect(() => differenceFunction(buffer, -1, new Float32Array(1))).toThrow(RangeError)
    expect(() => differenceFunction(buffer, 1.5, new Float32Array(3))).toThrow(RangeError)
  })

  it("rejects an output buffer too small for the lag range", () => {
    expect(() => differenceFunction(tone(440, { length: 64 }), 10, new Float32Array(10))).toThrow(
      RangeError,
    )
  })

  it("matches the direct sum on a real instrument-like frame", () => {
    // The FFT form must be a pure speed-up: any drift here would move every
    // reading the tuner shows.
    const maxTau = Math.floor(SAMPLE_RATE / MIN_FREQUENCY)
    const buffer = tone(82.41, { harmonics: [0.4, 0.2] })
    const noise = seededNoise(FRAME, 0.01)
    for (let i = 0; i < FRAME; i++) buffer[i] += noise[i]

    const fast = new Float32Array(maxTau + 1)
    differenceFunction(buffer, maxTau, fast)
    const expected = directDifference(buffer, maxTau)

    for (let tau = 0; tau <= maxTau; tau++) {
      expect(Math.abs(fast[tau] - expected[tau])).toBeLessThanOrEqual(1e-4 * Math.max(1, expected[tau]))
    }
  })

  it("is zero at lag zero and never negative", () => {
    const buffer = tone(441, { length: 2048 })
    const out = new Float32Array(1024)
    differenceFunction(buffer, 1023, out)

    expect(out[0]).toBe(0)
    expect(Math.min(...out)).toBeGreaterThanOrEqual(0)
  })

  it("gives zero difference everywhere for a silent frame", () => {
    const out = new Float32Array(101).fill(7)
    differenceFunction(new Float32Array(512), 100, out)
    expect(out.every((value) => value === 0)).toBe(true)
  })
})

// ----------------------------------------------------------------
// detectPitchYIN
// ----------------------------------------------------------------

describe("detectPitchYIN", () => {
  it("returns 0 for silence", () => {
    expect(detectPitchYIN(new Float32Array(FRAME), SAMPLE_RATE)).toBe(0)
  })

  it("returns 0 for a signal below the RMS gate", () => {
    expect(detectPitchYIN(tone(440, { amplitude: 0.01 }), SAMPLE_RATE)).toBe(0)
  })

  it("returns 0 for a frame too short to hold any lag in range", () => {
    expect(detectPitchYIN(tone(440, { length: 8 }), SAMPLE_RATE)).toBe(0)
  })

  it("returns 0 for broadband noise rather than inventing a note", () => {
    expect(detectPitchYIN(seededNoise(FRAME, 0.5), SAMPLE_RATE)).toBe(0)
  })

  // A C7 period is only ~21 samples, so the parabolic sub-sample fit leaves
  // about two cents of error there; still well inside the ±5 cent in-tune band.
  it.each([
    ["E1 (bass low E)", 41.2, 1],
    ["E2 (guitar low E)", 82.41, 1],
    ["A4", 440, 1],
    ["C7", 2093, 3],
  ])("reads %s within %s cent(s)", (_, frequency, toleranceCents) => {
    const detected = detectPitchYIN(tone(frequency), SAMPLE_RATE)
    expect(Math.abs(centsBetween(detected, frequency))).toBeLessThan(toleranceCents)
  })

  it("reads the fundamental of a harmonic-rich tone", () => {
    const detected = detectPitchYIN(tone(110, { harmonics: [0.8, 0.6, 0.4] }), SAMPLE_RATE)
    expect(Math.abs(centsBetween(detected, 110))).toBeLessThan(1)
  })

  it("reads correctly at a 48kHz device rate", () => {
    // The AudioContext now runs at the device's own rate, which is 48kHz on
    // most hardware, so detection cannot assume 44.1kHz.
    const detected = detectPitchYIN(tone(196, { sampleRate: 48000 }), 48000)
    expect(Math.abs(centsBetween(detected, 196))).toBeLessThan(1)
  })
})
