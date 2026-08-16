/**
 * The metronome's accent map and its scheduling arithmetic, kept as pure
 * functions because two consumers have to agree on them: the audio scheduler,
 * which decides what a beat SOUNDS like, and the beat indicator, which decides
 * what the same beat LOOKS like. Two copies of "is this beat accented?" would
 * drift the moment either side gained a meter, and the panel would show a
 * downbeat where the click did not put one.
 */

/** How loud a beat is within its measure. */
export type BeatAccent = "primary" | "secondary" | "regular"

export interface ClickVoice {
  type: OscillatorType
  frequency: number
  gain: number
}

/**
 * The accent of a beat within its measure.
 *
 * `beatIndex` is zero-based: 0 is the downbeat. A compound meter (6/8, 9/8,
 * 12/8) groups in threes, so every third beat carries a secondary accent.
 */
export const accentForBeat = (beatIndex: number, isCompoundMeter: boolean): BeatAccent => {
  if (!Number.isInteger(beatIndex) || beatIndex < 0) {
    throw new RangeError(`beatIndex must be a non-negative integer, got ${beatIndex}`)
  }

  if (beatIndex === 0) return "primary"
  if (isCompoundMeter && beatIndex % 3 === 0) return "secondary"
  return "regular"
}

/**
 * The three click voices. They are deliberately far apart in both timbre and
 * pitch: on a phone speaker a downbeat that differs only in gain is inaudible
 * against the room.
 */
const CLICK_VOICES: Record<BeatAccent, ClickVoice> = {
  primary: { type: "triangle", frequency: 880, gain: 0.7 }, // A5
  secondary: { type: "sine", frequency: 659.25, gain: 0.4 }, // E5
  regular: { type: "sine", frequency: 440, gain: 0.25 }, // A4
}

export const clickVoiceForAccent = (accent: BeatAccent): ClickVoice => CLICK_VOICES[accent]

/**
 * How long to wait before painting a beat that has been scheduled to sound at
 * `scheduledTime` on the AudioContext clock.
 *
 * Clicks are scheduled up to 100ms ahead of the clock, so painting one at the
 * moment it is SCHEDULED lights the display before the sound arrives — at 240
 * BPM that is 40% of a beat, and the panel visibly runs ahead of the click.
 * Both arguments are AudioContext times, in seconds.
 */
export const beatPaintDelayMs = (scheduledTime: number, currentTime: number): number => {
  if (!Number.isFinite(scheduledTime) || !Number.isFinite(currentTime)) {
    throw new RangeError(
      `beat paint delay needs finite AudioContext times, got scheduled=${scheduledTime} current=${currentTime}`,
    )
  }

  // A beat already due (the scheduler ran late) paints immediately rather than
  // being pushed into the past.
  return Math.max(0, (scheduledTime - currentTime) * 1000)
}
