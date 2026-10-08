import { describe, expect, it } from "vitest"
import { fftInPlace, isPowerOfTwo, nextPowerOfTwo } from "@/utils/fft"
import {
  analysisFrameSize,
  detectPitchYIN,
  differenceFunction,
  MIN_FREQUENCY,
  PITCH_SEARCH_FLOOR,
} from "@/utils/audio-processing"

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

  // C7 is the case that matters: its period is only ~21 samples, and the
  // sub-sample fit used to run on the normalized curve, which left it 2 cents
  // sharp. Refining on the raw difference function holds it under a cent.
  it.each([
    ["E1 (bass low E)", 41.2],
    ["E2 (guitar low E)", 82.41],
    ["A4", 440],
    ["C7", 2093],
  ])("reads %s within a cent", (_, frequency) => {
    const detected = detectPitchYIN(tone(frequency), SAMPLE_RATE)
    expect(Math.abs(centsBetween(detected, frequency))).toBeLessThan(1)
  })

  it.each([
    ["A4", 440],
    ["E5 (violin E)", 659.26],
    ["E6", 1318.5],
  ])("reads %s within a cent at a Bluetooth headset's 16kHz", (_, frequency) => {
    // The context runs at the device rate, and a Bluetooth headset mic drops
    // the device to 16kHz, where a short period spans only a few samples:
    // E6 read 6 cents sharp before the refinement moved to the raw curve.
    const rate = 16000
    const detected = detectPitchYIN(tone(frequency, { sampleRate: rate, length: analysisFrameSize(rate) }), rate)
    expect(Math.abs(centsBetween(detected, frequency))).toBeLessThan(1)
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

// ----------------------------------------------------------------
// Frame size per device rate
// ----------------------------------------------------------------

describe("analysisFrameSize", () => {
  it("rejects a sample rate that is not a positive finite number", () => {
    expect(() => analysisFrameSize(0)).toThrow(RangeError)
    expect(() => analysisFrameSize(-48000)).toThrow(RangeError)
    expect(() => analysisFrameSize(Number.NaN)).toThrow(RangeError)
    expect(() => analysisFrameSize(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it("keeps the 8192-sample frame at common device rates", () => {
    expect(analysisFrameSize(44100)).toBe(8192)
    expect(analysisFrameSize(48000)).toBe(8192)
    expect(analysisFrameSize(96000)).toBe(8192)
  })

  it("grows the frame at high rates so the lowest note's period still fits in half of it", () => {
    for (const rate of [176400, 192000]) {
      const frame = analysisFrameSize(rate)
      expect(frame).toBe(16384)
      expect(frame / 2).toBeGreaterThan(rate / MIN_FREQUENCY)
    }
  })

  it("never exceeds AnalyserNode's 32768-sample maximum", () => {
    expect(analysisFrameSize(384000)).toBe(32768)
    expect(analysisFrameSize(768000)).toBe(32768)
  })
})

describe("detectPitchYIN at high device rates", () => {
  // Regression: the context now runs at the device rate, and pro interfaces
  // and DACs run at 176.4/192kHz. A fixed 8192-sample frame holds lags only
  // up to 4095 samples there — 46.9Hz at 192kHz — so a bass E1 read as F#1.
  it.each([
    ["B0 (5-string low B)", 30.87],
    ["D1 (drop D)", 36.71],
    ["E1 (bass low E)", 41.2],
    ["E2 (guitar low E)", 82.41],
  ])("reads %s within a cent at 192kHz with the frame sized for the rate", (_, frequency) => {
    const rate = 192000
    const detected = detectPitchYIN(tone(frequency, { sampleRate: rate, length: analysisFrameSize(rate) }), rate)
    expect(Math.abs(centsBetween(detected, frequency))).toBeLessThan(1)
  })

  it.each([44100, 48000, 96000, 192000])("reads A0 in tune and 10 cents flat at %s Hz", (rate) => {
    // Regression: the lag search stopped at A0's own period, so A0 always
    // landed on the edge of the window, which the edge guard rejects. The
    // search now runs down to half a semitone below A0.
    for (const centsOff of [0, -10]) {
      const frequency = MIN_FREQUENCY * 2 ** (centsOff / 1200)
      const detected = detectPitchYIN(
        tone(frequency, { sampleRate: rate, length: analysisFrameSize(rate), harmonics: [0.5, 0.3] }),
        rate,
      )
      expect(Math.abs(centsBetween(detected, frequency))).toBeLessThan(1)
    }
  })

  it("searches down to the G#0/A0 boundary and no further", () => {
    expect(centsBetween(PITCH_SEARCH_FLOOR, MIN_FREQUENCY)).toBeCloseTo(-50, 6)
    // G#0 is out of range: it must not come back as a wrong in-range note.
    expect(detectPitchYIN(tone(25.96, { sampleRate: 48000, length: analysisFrameSize(48000) }), 48000)).toBe(0)
  })

  it("reports no pitch rather than a wrong note when the period is longer than the frame can hold", () => {
    // An 8192-sample frame at 192kHz cannot contain an E1 period search; the
    // best lag is the edge of the window, which is not a period.
    expect(detectPitchYIN(tone(41.2, { sampleRate: 192000, length: 8192 }), 192000)).toBe(0)
  })
})
