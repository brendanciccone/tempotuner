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

describe("amber console palette", () => {
  it("defines the five discharge stops and the three surfaces", () => {
    const expectedTokens = {
      "--screen": "#100600",
      "--screen-raised": "#1b0c02",
      "--screen-well": "#060200",
      "--amber-100": "#ffa86d",
      "--amber-90": "#ff6b08",
      "--amber-70": "#dd5800",
      "--amber-50": "#ab4500",
      "--amber-30": "#5b2500",
      "--on-fill": "#1e0c00",
    }

    for (const [token, value] of Object.entries(expectedTokens)) {
      expect(globalsCss).toMatch(new RegExp(`${token}:\\s*${value};`))
    }
  })

  it("introduces no second hue in the UI", () => {
    // Hierarchy is brightness, inverse video and blink. A red "flat" or a green
    // "in tune" would carry meaning the monochrome panel cannot express, and it
    // is exactly the regression this guards against.
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
