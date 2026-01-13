// Notes with their corresponding frequencies (A4 = 440Hz)
export const NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
export const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

// Default reference frequency for A4
export const DEFAULT_A4_FREQ = 440.0

export interface NoteInfo {
  note: string
  noteName: string
  octave: number
  frequency: number // The detected/input frequency
  exactFrequency: number // The nominal frequency of the note (e.g., 440Hz for A4)
  cents: number
  tuningStatus: "flat" | "sharp" | "in-tune"
}

// Find the closest note to a given frequency
export const findClosestNote = (frequency: number, referenceFreq: number, useFlats: boolean): NoteInfo => {
  // A4 is 440Hz, which is 69 semitones above C0 (scientific pitch notation)
  // Calculate how many semitones away from A4 this frequency is
  const semitoneFromA4 = 12 * Math.log2(frequency / referenceFreq)

  // Round to the nearest semitone
  const roundedSemitone = Math.round(semitoneFromA4)

  // Calculate the MIDI note number (A4 = 69)
  const midiNote = 69 + roundedSemitone

  // Calculate the octave (C4 is the 4th octave)
  // MIDI note 60 is C4, so we calculate octave based on that
  const octave = Math.floor((midiNote - 12) / 12)

  // Calculate the note index within the octave (0 = C, 1 = C#/Db, etc.)
  const positiveMod = (n: number, m: number) => ((n % m) + m) % m
  const noteIndex = positiveMod(midiNote - 12, 12)
  if (noteIndex < 0 || noteIndex >= 12 || !Number.isFinite(noteIndex)) {
    return {
      note: "?",
      noteName: "?",
      octave: 0,
      frequency,
      exactFrequency: frequency, // Fallback to detected frequency
      cents: 0,
      tuningStatus: "in-tune",
    }
  }

  // Get the note name based on preference (sharp or flat)
  const noteName = useFlats ? NOTES_FLAT[noteIndex] : NOTES_SHARP[noteIndex]

  // Calculate the exact frequency of the closest note
  const exactFrequency = referenceFreq * Math.pow(2, roundedSemitone / 12)

  // Calculate cents (how far from the closest note)
  const cents = Math.round(1200 * Math.log2(frequency / exactFrequency))

  // Determine if the note is flat, sharp, or in tune
  let tuningStatus: "flat" | "sharp" | "in-tune" = "in-tune"
  if (cents < -5) tuningStatus = "flat"
  else if (cents > 5) tuningStatus = "sharp"

  return {
    note: `${noteName}${octave}`,
    noteName,
    octave,
    frequency,
    exactFrequency,
    cents,
    tuningStatus,
  }
}

