import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

// ----------------------------------------------------------------
// The app ships exactly one theme: the Amber Console panel. These are
// regression guards, not style opinions — the multi-theme switcher
// (data-style="neon" | "cyberpunk" | "soft" | …) and the light/dark pair it
// sat on were removed, and nothing should quietly reintroduce either.
// ----------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../..")
const globalsCss = readFileSync(path.join(repoRoot, "app/globals.css"), "utf8")
const packageJson: unknown = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf8"),
)

const SOURCE_DIRS = ["app", "components", "hooks", "lib", "utils"] as const
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".css"]

const collectSourceFiles = (dir: string): string[] => {
  const entries = readdirSync(dir)
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return collectSourceFiles(full)
    return SOURCE_EXTENSIONS.includes(path.extname(full)) ? [full] : []
  })
}

const sourceFiles = SOURCE_DIRS.flatMap((dir) => collectSourceFiles(path.join(repoRoot, dir)))

const filesContaining = (pattern: RegExp): string[] =>
  sourceFiles
    .filter((file) => pattern.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(repoRoot, file))

// ----------------------------------------------------------------
// Only one theme survives
// ----------------------------------------------------------------

describe("single theme", () => {
  it("defines no data-style theme variants", () => {
    expect(filesContaining(/data-style/)).toEqual([])
  })

  it("defines no light/dark pair", () => {
    // The panel is a piece of hardware, not a colour scheme: there is no
    // .dark class, no prefers-color-scheme fork, and no next-themes provider.
    expect(globalsCss).not.toMatch(/\.dark\b|class~="dark"|prefers-color-scheme/)
    expect(filesContaining(/next-themes/)).toEqual([])
  })

  it("does not depend on next-themes", () => {
    expect(packageJson).toHaveProperty("dependencies")
    const { dependencies, devDependencies } = packageJson as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(dependencies).not.toHaveProperty("next-themes")
    expect(devDependencies).not.toHaveProperty("next-themes")
  })
})

// ----------------------------------------------------------------
// Law 1: one gas, many intensities
// ----------------------------------------------------------------

describe("phosphor palette", () => {
  it("defines the five discharge stops and the three surfaces", () => {
    const expectedTokens = {
      "--screen": "#000b04",
      "--screen-raised": "#001307",
      "--screen-well": "#000301",
      "--phosphor-100": "#37ff79",
      "--phosphor-90": "#00e34c",
      "--phosphor-70": "#00b73d",
      "--phosphor-50": "#009130",
      "--phosphor-30": "#004d1a",
      "--on-fill": "#00250d",
    }

    for (const [token, value] of Object.entries(expectedTokens)) {
      expect(globalsCss).toMatch(new RegExp(`${token}:\\s*${value};`))
    }
  })

  it("introduces no second hue in the UI", () => {
    // Hierarchy is brightness, inverse video and blink. A red "flat" or an
    // amber "sharp" would carry meaning the monochrome panel cannot express.
    // Tailwind's own `green-*` scale counts as a second hue too: the gas comes
    // from the phosphor tokens, and a text-green-500 would be off-ramp green
    // sitting next to it.
    expect(filesContaining(/\b(?:text|bg|border)-(?:red|green|emerald|blue|yellow|amber)-\d{2,3}\b/))
      .toEqual([])
  })

  it("maps the shadcn contract onto the ramp so no primitive keeps a default", () => {
    const requiredMappings = [
      "--color-background",
      "--color-foreground",
      "--color-primary",
      "--color-primary-foreground",
      "--color-muted-foreground",
      "--color-destructive",
      "--color-border",
      "--color-input",
      "--color-ring",
    ]

    for (const token of requiredMappings) {
      expect(globalsCss).toMatch(new RegExp(`${token}:\\s*var\\(`))
    }
  })
})

// ----------------------------------------------------------------
// Contrast is a gate, not a taste setting. Rotating the hue at constant
// lightness silently moves every ratio, so the ramp has to be re-solved rather
// than re-tinted — and this is what catches it when it isn't.
// ----------------------------------------------------------------

const channelLuminance = (channel: number): number => {
  const scaled = channel / 255
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of a `#rrggbb` string. */
const relativeLuminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return (
    0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
  )
}

const contrastRatio = (a: string, b: string): number => {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Pull a `--token: #rrggbb;` declaration out of globals.css. */
const readToken = (token: string): string => {
  const match = globalsCss.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6});`))
  if (!match) throw new Error(`${token} is not defined in app/globals.css`)
  return match[1]
}

describe("contrast gates", () => {
  const surfaces = ["--screen", "--screen-raised", "--screen-well"] as const

  // The gate each stop is solved to against --screen.
  const gates = {
    "--phosphor-100": 15.0,
    "--phosphor-90": 11.5,
    "--phosphor-70": 7.47,
    "--phosphor-50": 4.8,
  }

  // A stop is solved as a real number and then written as 8-bit hex, so the
  // shipped colour can land a hundredth or so under the value it was solved to.
  // That is rounding, not a palette that missed its gate.
  const QUANTISATION_TOLERANCE = 0.05

  for (const [stop, gate] of Object.entries(gates)) {
    it(`holds ${stop} at ${gate}:1 against --screen`, () => {
      expect(contrastRatio(readToken(stop), readToken("--screen"))).toBeGreaterThanOrEqual(
        gate - QUANTISATION_TOLERANCE,
      )
    })
  }

  it("keeps every text-carrying stop at AA on all three surfaces", () => {
    // --phosphor-50 is the dim stop and the only one that carries text below
    // 18px (the Silkscreen micro labels), so it is gated for normal text
    // rather than for non-text UI. --phosphor-30 is decorative and exempt.
    const textStops = ["--phosphor-100", "--phosphor-90", "--phosphor-70", "--phosphor-50"]

    for (const stop of textStops) {
      for (const surface of surfaces) {
        const ratio = contrastRatio(readToken(stop), readToken(surface))
        expect(ratio, `${stop} on ${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it("keeps inverse video readable in both fill intensities", () => {
    // A solid discharge block is the machine talking; if its text drops below
    // AA the loudest element on the panel is the least legible one.
    for (const fill of ["--phosphor-90", "--phosphor-100"]) {
      expect(contrastRatio(readToken("--on-fill"), readToken(fill))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("keeps the ramp monotonic", () => {
    const ordered = ["--phosphor-30", "--phosphor-50", "--phosphor-70", "--phosphor-90", "--phosphor-100"]
    const luminances = ordered.map((stop) => relativeLuminance(readToken(stop)))

    for (let i = 1; i < luminances.length; i++) {
      expect(luminances[i], `${ordered[i]} is not brighter than ${ordered[i - 1]}`).toBeGreaterThan(
        luminances[i - 1],
      )
    }
  })
})

// ----------------------------------------------------------------
// The bitmap faces set a floor the rest of the scale has to respect
// ----------------------------------------------------------------

describe("terminal type scale", () => {
  it("never drops the terminal face below 18px", () => {
    // VT323 is a bitmap face; under 18px it stops resolving. --text-micro is
    // the one exception and belongs to Silkscreen.
    const sizes = [...globalsCss.matchAll(/--text-(?!micro)([a-z0-9]+):\s*(\d+)px;/g)]

    expect(sizes.length).toBeGreaterThan(0)
    for (const [, name, px] of sizes) {
      expect(Number(px), `--text-${name} is below the bitmap floor`).toBeGreaterThanOrEqual(18)
    }
  })

  it("keeps both bitmap faces wired to the loaded webfonts", () => {
    expect(globalsCss).toMatch(/--font-terminal:\s*var\(--font-vt323\)/)
    expect(globalsCss).toMatch(/--font-micro:\s*var\(--font-silkscreen\)/)
  })
})
