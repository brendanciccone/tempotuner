import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TuningIndicator } from "@/components/tuner/tuning-indicator"
import { IN_TUNE_CENTS, METER_RANGE_CENTS, findClosestNote, DEFAULT_A4_FREQ } from "@/utils/note-utils"

afterEach(cleanup)

/** The needle's left offset, as a number of percent. */
const needleOffset = (container: HTMLElement): number => {
  const needle = container.querySelector<HTMLElement>("[data-testid='needle']")
  if (!needle) throw new Error("needle not found")
  return Number.parseFloat(needle.style.left)
}

/** The in-tune zone's left edge and width, as percentages. */
const zoneBounds = (container: HTMLElement): { left: number; width: number } => {
  const zone = container.querySelector<HTMLElement>("[data-testid='in-tune-zone']")
  if (!zone) throw new Error("zone not found")
  return { left: Number.parseFloat(zone.style.left), width: Number.parseFloat(zone.style.width) }
}

const renderAt = (cents: number, status: "flat" | "sharp" | "in-tune") =>
  render(<TuningIndicator cents={cents} tuningStatus={status} signalDetected />)

// ----------------------------------------------------------------
// Boundaries and disagreements first
// ----------------------------------------------------------------

describe("tuning meter geometry", () => {
  it("puts the needle exactly on the zone edge at the in-tune boundary", () => {
    // Regression: a 1.1 multiplier on the needle with no matching change to the
    // zone meant the drawn target spanned ±9.09 cents while the classifier
    // called ±5 in tune. Between those, the needle sat inside the lit zone and
    // the panel read "sharp".
    const { container } = renderAt(IN_TUNE_CENTS, "in-tune")
    const { left, width } = zoneBounds(container)

    expect(needleOffset(container)).toBeCloseTo(left + width, 5)
  })

  it("puts the needle on the other zone edge at the negative boundary", () => {
    const { container } = renderAt(-IN_TUNE_CENTS, "in-tune")

    expect(needleOffset(container)).toBeCloseTo(zoneBounds(container).left, 5)
  })

  it("keeps the needle outside the zone as soon as the status leaves in-tune", () => {
    const { container } = renderAt(IN_TUNE_CENTS + 1, "sharp")
    const { left, width } = zoneBounds(container)

    expect(needleOffset(container)).toBeGreaterThan(left + width)
  })

  it("clamps the needle to the meter edges beyond full scale", () => {
    const { container: low } = renderAt(-METER_RANGE_CENTS * 4, "flat")
    expect(needleOffset(low)).toBe(0)

    const { container: high } = renderAt(METER_RANGE_CENTS * 4, "sharp")
    expect(needleOffset(high)).toBe(100)
  })

  it("reaches the edges exactly at the range the scale labels claim", () => {
    // The labels read -50 / +50, so full deflection has to mean 50 cents.
    const { container } = renderAt(METER_RANGE_CENTS, "sharp")

    expect(needleOffset(container)).toBe(100)
  })

  it("parks the needle at centre with no signal", () => {
    const { container } = render(
      <TuningIndicator cents={40} tuningStatus={null} signalDetected={false} />,
    )

    expect(needleOffset(container)).toBe(50)
  })
})

// ----------------------------------------------------------------
// The meter and the classifier must agree across the whole range
// ----------------------------------------------------------------

describe("meter agrees with the classifier", () => {
  it("lights the zone exactly when the detected pitch is in tune", () => {
    // Sweep real frequencies rather than asserting on the constant, so the two
    // halves of the system are compared through their actual behaviour.
    for (let cents = -20; cents <= 20; cents++) {
      const frequency = DEFAULT_A4_FREQ * Math.pow(2, cents / 1200)
      const { tuningStatus, cents: reported } = findClosestNote(frequency, DEFAULT_A4_FREQ, false)

      const { container } = renderAt(reported, tuningStatus)
      const { left, width } = zoneBounds(container)
      const offset = needleOffset(container)
      const insideZone = offset >= left - 1e-6 && offset <= left + width + 1e-6

      expect(insideZone, `${reported} cents: status ${tuningStatus}, needle at ${offset}%`).toBe(
        tuningStatus === "in-tune",
      )
      cleanup()
    }
  })
})
