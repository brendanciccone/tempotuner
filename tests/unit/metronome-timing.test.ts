import { describe, expect, it } from "vitest"
import {
  type BeatAccent,
  accentForBeat,
  beatPaintDelayMs,
  clampMetronomeBpm,
  clickVoiceForAccent,
  MAX_METRONOME_BPM,
  MIN_METRONOME_BPM,
  parseTimeSignature,
} from "@/utils/metronome-timing"

// ----------------------------------------------------------------
// Bad input first: both helpers are called from a scheduler that runs off the
// AudioContext clock, where a NaN propagates silently into a timer.
// ----------------------------------------------------------------

describe("accentForBeat", () => {
  it("rejects a beat index that is not a non-negative integer", () => {
    expect(() => accentForBeat(-1, false)).toThrow(RangeError)
    expect(() => accentForBeat(1.5, false)).toThrow(RangeError)
    expect(() => accentForBeat(Number.NaN, false)).toThrow(RangeError)
  })

  it("accents the downbeat in every meter", () => {
    expect(accentForBeat(0, false)).toBe("primary")
    expect(accentForBeat(0, true)).toBe("primary")
  })

  it("leaves a simple meter flat after the downbeat", () => {
    for (const beat of [1, 2, 3, 4, 6]) {
      expect(accentForBeat(beat, false)).toBe("regular")
    }
  })

  it("groups a compound meter in threes", () => {
    // 6/8 is 3+3: the fourth beat carries the secondary accent, nothing else.
    expect(accentForBeat(3, true)).toBe("secondary")
    expect(accentForBeat(6, true)).toBe("secondary")
    for (const beat of [1, 2, 4, 5]) {
      expect(accentForBeat(beat, true)).toBe("regular")
    }
  })
})

describe("clickVoiceForAccent", () => {
  it("gives the downbeat a different timbre, not just more gain", () => {
    // A downbeat that differs only in level is inaudible on a phone speaker.
    const primary = clickVoiceForAccent("primary")
    const regular = clickVoiceForAccent("regular")

    expect(primary.type).not.toBe(regular.type)
    expect(primary.frequency).toBeGreaterThan(regular.frequency)
    expect(primary.gain).toBeGreaterThan(regular.gain)
  })

  it("puts the secondary accent between the two", () => {
    const { gain: primary } = clickVoiceForAccent("primary")
    const { gain: secondary } = clickVoiceForAccent("secondary")
    const { gain: regular } = clickVoiceForAccent("regular")

    expect(secondary).toBeGreaterThan(regular)
    expect(secondary).toBeLessThan(primary)
  })

  it("keeps every voice inside unity gain", () => {
    // `satisfies` rather than `as const`: this list has to stay checked against
    // the exported accent contract, so adding a fourth accent fails here.
    const accents = ["primary", "secondary", "regular"] satisfies readonly BeatAccent[]

    for (const accent of accents) {
      const { gain } = clickVoiceForAccent(accent)
      expect(gain).toBeGreaterThan(0)
      expect(gain).toBeLessThanOrEqual(1)
    }
  })
})

// ----------------------------------------------------------------
// The beat has to be painted when it SOUNDS
// ----------------------------------------------------------------

describe("beatPaintDelayMs", () => {
  it("rejects non-finite clock values", () => {
    expect(() => beatPaintDelayMs(Number.NaN, 1)).toThrow(RangeError)
    expect(() => beatPaintDelayMs(1, Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it("waits out the scheduler's lookahead", () => {
    // Clicks are scheduled up to 100ms ahead of the clock. Painting on schedule
    // rather than on sound put the display 100ms early — 40% of a beat at 240
    // BPM, which reads as the panel running ahead of the click.
    expect(beatPaintDelayMs(10.1, 10)).toBeCloseTo(100, 6)
    expect(beatPaintDelayMs(10.015, 10)).toBeCloseTo(15, 6)
  })

  it("paints immediately for a beat that is already due", () => {
    // The scheduler ran late; the click is in the past. A negative delay would
    // be coerced to 0 by setTimeout anyway, but only after arithmetic that is
    // easier to reason about clamped.
    expect(beatPaintDelayMs(9.95, 10)).toBe(0)
    expect(beatPaintDelayMs(10, 10)).toBe(0)
  })
})

// ----------------------------------------------------------------
// Tempo range
// ----------------------------------------------------------------

describe("clampMetronomeBpm", () => {
  it("rejects a non-finite tempo rather than scheduling against it", () => {
    expect(() => clampMetronomeBpm(Number.NaN)).toThrow(RangeError)
    expect(() => clampMetronomeBpm(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it("holds a tap tempo outside the range at the nearest playable edge", () => {
    expect(clampMetronomeBpm(300)).toBe(MAX_METRONOME_BPM)
    expect(clampMetronomeBpm(12)).toBe(MIN_METRONOME_BPM)
    expect(clampMetronomeBpm(0)).toBe(MIN_METRONOME_BPM)
  })

  it("passes a playable tempo through unchanged, edges included", () => {
    expect(clampMetronomeBpm(MIN_METRONOME_BPM)).toBe(MIN_METRONOME_BPM)
    expect(clampMetronomeBpm(97)).toBe(97)
    expect(clampMetronomeBpm(MAX_METRONOME_BPM)).toBe(MAX_METRONOME_BPM)
  })
})

// ----------------------------------------------------------------
// Time signatures
// ----------------------------------------------------------------

describe("parseTimeSignature", () => {
  it("rejects anything that is not N/M with positive integers", () => {
    for (const bad of ["", "4", "4/", "/4", "0/4", "4/0", "a/b", "4/4/4", " 4/4", "-3/4", "2.5/4"]) {
      expect(() => parseTimeSignature(bad), bad).toThrow(RangeError)
    }
  })

  it("reads simple meters as one beat per numerator, not compound", () => {
    expect(parseTimeSignature("2/4")).toEqual({ beatsPerMeasure: 2, isCompoundMeter: false })
    expect(parseTimeSignature("3/4")).toEqual({ beatsPerMeasure: 3, isCompoundMeter: false })
    expect(parseTimeSignature("4/4")).toEqual({ beatsPerMeasure: 4, isCompoundMeter: false })
    expect(parseTimeSignature("5/4")).toEqual({ beatsPerMeasure: 5, isCompoundMeter: false })
  })

  it("marks 6/8, 9/8 and 12/8 as compound", () => {
    expect(parseTimeSignature("6/8")).toEqual({ beatsPerMeasure: 6, isCompoundMeter: true })
    expect(parseTimeSignature("9/8")).toEqual({ beatsPerMeasure: 9, isCompoundMeter: true })
    expect(parseTimeSignature("12/8")).toEqual({ beatsPerMeasure: 12, isCompoundMeter: true })
  })

  it("leaves 7/8 and 3/8 uncompounded", () => {
    // 7/8 is an odd meter, not threes; 3/8 is a single group of three.
    expect(parseTimeSignature("7/8").isCompoundMeter).toBe(false)
    expect(parseTimeSignature("3/8").isCompoundMeter).toBe(false)
  })
})
