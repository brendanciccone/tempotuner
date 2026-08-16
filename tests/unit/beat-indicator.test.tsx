import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { BeatIndicator } from "@/components/beat-indicator"
import { accentForBeat } from "@/utils/metronome-timing"

afterEach(cleanup)

const cells = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-testid='beat-cell']"))

const litIndexes = (container: HTMLElement): number[] =>
  cells(container)
    .map((cell, index) => (cell.dataset.lit === "true" ? index : -1))
    .filter((index) => index !== -1)

// ----------------------------------------------------------------
// Shape and boundaries
// ----------------------------------------------------------------

describe("beat indicator", () => {
  it("draws one cell per beat in the measure", () => {
    const { container } = render(
      <BeatIndicator beatsPerMeasure={7} currentBeat={0} isPlaying={false} isCompoundMeter={false} />,
    )

    expect(cells(container)).toHaveLength(7)
    expect(cells(container).map((cell) => cell.textContent)).toEqual(["1", "2", "3", "4", "5", "6", "7"])
  })

  it("renders nothing rather than throwing on a meterless measure", () => {
    // Guard rather than feature: no time signature in the app has fewer than
    // two beats, but a zero here used to be one Array.from away from a crash.
    const { container } = render(
      <BeatIndicator beatsPerMeasure={0} currentBeat={0} isPlaying isCompoundMeter={false} />,
    )

    expect(cells(container)).toHaveLength(0)
  })

  it("lights nothing while the metronome is stopped", () => {
    const { container } = render(
      <BeatIndicator beatsPerMeasure={4} currentBeat={0} isPlaying={false} isCompoundMeter={false} />,
    )

    expect(litIndexes(container)).toEqual([])
  })

  it("lights exactly the sounding beat, zero-based", () => {
    // The metronome reports the beat that is sounding, not the next one. If
    // that contract flips, this row lights the wrong cell on every beat.
    const { container } = render(
      <BeatIndicator beatsPerMeasure={4} currentBeat={2} isPlaying isCompoundMeter={false} />,
    )

    expect(litIndexes(container)).toEqual([2])
    expect(cells(container)[2].textContent).toBe("3")
  })

  it("lights nothing when the reported beat is outside the measure", () => {
    // A time-signature change shortens the measure before the beat counter
    // resets; an out-of-range beat must go dark, not wrap onto another cell.
    const { container } = render(
      <BeatIndicator beatsPerMeasure={3} currentBeat={5} isPlaying isCompoundMeter={false} />,
    )

    expect(litIndexes(container)).toEqual([])
  })
})

// ----------------------------------------------------------------
// Law 1: the meter is carried by brightness, never by a second hue
// ----------------------------------------------------------------

describe("beat indicator accents", () => {
  it("marks the compound groups from the same map the clicks use", () => {
    const { container } = render(
      <BeatIndicator beatsPerMeasure={6} currentBeat={0} isPlaying isCompoundMeter />,
    )

    expect(cells(container).map((cell) => cell.dataset.accent)).toEqual(
      [0, 1, 2, 3, 4, 5].map((beat) => accentForBeat(beat, true)),
    )
  })

  it("leaves a simple meter with a single accented cell", () => {
    const { container } = render(
      <BeatIndicator beatsPerMeasure={4} currentBeat={0} isPlaying isCompoundMeter={false} />,
    )

    const accents = cells(container).map((cell) => cell.dataset.accent)
    expect(accents).toEqual(["primary", "regular", "regular", "regular"])
  })

  it("gives the lit downbeat the brightest fill on the panel", () => {
    const { container } = render(
      <BeatIndicator beatsPerMeasure={4} currentBeat={0} isPlaying isCompoundMeter={false} />,
    )

    const [downbeat] = cells(container)
    expect(downbeat.className).toContain("bg-fill-bright")
    // Hierarchy is brightness and inverse video: no cell may introduce a hue.
    expect(downbeat.className).not.toMatch(/\b(bg|text|border)-(red|amber|yellow|green|blue)-/)
  })

  it("decays on the phosphor tail instead of snapping off", () => {
    const { container } = render(
      <BeatIndicator beatsPerMeasure={4} currentBeat={1} isPlaying isCompoundMeter={false} />,
    )

    for (const cell of cells(container)) {
      expect(cell.className).toContain("ac-lamp")
    }
  })
})

// ----------------------------------------------------------------
// Assistive tech gets the meter once, not four times a second
// ----------------------------------------------------------------

describe("beat indicator accessibility", () => {
  it("hides the per-beat row from assistive tech", () => {
    const { container } = render(
      <BeatIndicator beatsPerMeasure={4} currentBeat={0} isPlaying isCompoundMeter={false} />,
    )

    const row = container.querySelector("[data-testid='beat-row']")
    expect(row?.getAttribute("aria-hidden")).toBe("true")
    // A live region here would announce a new beat several times a second.
    expect(container.querySelector("[aria-live]")).toBeNull()
  })

  it("states the meter once, in text", () => {
    render(<BeatIndicator beatsPerMeasure={6} currentBeat={0} isPlaying isCompoundMeter />)

    expect(screen.getByText(/6 beats per measure/)).toBeInTheDocument()
    expect(screen.getByText(/groups of three/)).toBeInTheDocument()
  })

  it("does not claim grouping in a simple meter", () => {
    render(<BeatIndicator beatsPerMeasure={4} currentBeat={0} isPlaying isCompoundMeter={false} />)

    expect(screen.queryByText(/groups of three/)).toBeNull()
  })
})
