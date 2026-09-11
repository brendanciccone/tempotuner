import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// ----------------------------------------------------------------
// Dependabot alerts #79 and #80 were both closed by flooring `browserslist` at
// 4.28.7 through a pnpm override, not by changing any code in this repo. That
// makes the fix invisible to every other test here: a regenerated lockfile, a
// dropped override or a resolution that quietly lands below the floor would
// reintroduce both bugs with nothing failing.
//
// These assert the resolved dependency's behaviour rather than the version
// string alone, so they fail on the actual defect rather than on bookkeeping.
// ----------------------------------------------------------------

const require = createRequire(import.meta.url)

type BrowserslistNodeModule = {
  getStat: (
    opts: { stats?: unknown },
    data: Record<string, { versions: string[] }>
  ) => Record<string, unknown> | undefined
}

const browserslistNode = require("browserslist/node.js") as BrowserslistNodeModule

// caniuse-style data, standing in for the real `browserslist.data`. It has no
// own "__proto__" key, which is the whole point: the pre-fix lookup found one
// anyway by walking the prototype chain.
const browserData = { chrome: { versions: ["1.0"] } }

// A custom browserslist-stats.json is read with JSON.parse, which is the only
// way "__proto__" becomes a real own, enumerable property that for..in walks.
// The key has to be in the JSON *text*: `{ __proto__: … }` in an object literal
// sets the prototype instead of defining a key, so building the payload that
// way and stringifying it would silently test nothing.
const statsWithProtoKey = (versions: Record<string, number>) =>
  JSON.parse(`{"__proto__":${JSON.stringify(versions)},"chrome":{"1.0":50}}`) as unknown

describe("browserslist normalizeStats (GHSA / Dependabot #80)", () => {
  it("does not crash on a __proto__ key in custom stats", () => {
    // Pre-fix: `data["__proto__"]` resolved to Object.prototype — truthy, so
    // the branch was taken — and `.versions` was undefined, throwing
    // "Cannot read properties of undefined (reading 'length')" out of the build.
    expect(() =>
      browserslistNode.getStat({ stats: statsWithProtoKey({ "1.0": 100 }) }, browserData)
    ).not.toThrow()
  })

  it("stores __proto__ as an own property instead of writing the prototype", () => {
    // Two versions steers past the branch above and onto `normalized[i] = stats[i]`,
    // which pre-fix invoked the __proto__ setter and swapped the result's
    // prototype for attacker-supplied data rather than storing a key under it.
    const normalized = browserslistNode.getStat(
      { stats: statsWithProtoKey({ "1.0": 1, "2.0": 2 }) },
      browserData
    )

    expect(normalized).toBeDefined()
    expect(Object.getPrototypeOf(normalized)).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(normalized, "__proto__")).toBe(true)
  })

  it("leaves Object.prototype untouched", () => {
    browserslistNode.getStat({ stats: statsWithProtoKey({ "1.0": 1, "2.0": 2 }) }, browserData)

    expect(Object.getPrototypeOf({})).toBe(Object.prototype)
    expect(({} as Record<string, unknown>)["1.0"]).toBeUndefined()
  })

  it("still normalises ordinary browsers", () => {
    const normalized = browserslistNode.getStat(
      { stats: JSON.parse('{"chrome":{"1.0":50}}') },
      browserData
    )

    expect(normalized).toMatchObject({ chrome: { "1.0": 50 } })
  })
})

describe("browserslist query cache (GHSA / Dependabot #79)", () => {
  // The caches are module-private, so there is no non-flaky way to assert the
  // 500-entry FIFO bound from outside — a memory-growth test would measure the
  // GC as much as the cache. The version floor is the assertion instead: 4.28.7
  // is the release that replaced both unbounded object caches with capped Maps,
  // and the behavioural tests above prove that floor is the one installed.
  it("resolves at or above the 4.28.7 floor", () => {
    const { version } = require("browserslist/package.json") as { version: string }
    const [major, minor, patch] = version.split(".").map(Number)

    expect(major).toBe(4)
    expect(minor * 1000 + patch).toBeGreaterThanOrEqual(28 * 1000 + 7)
  })
})

// ----------------------------------------------------------------
// The September 2026 floors — Next.js 16.3.3+, sharp 0.35.4+, js-yaml 4.3.2+ —
// have the same shape as the browserslist one above: two of them live in
// `pnpm.overrides` and the third is a pinned version, so nothing this repo owns
// changes and no other test here would notice a regression.
//
// Unlike browserslist there is no behaviour to drive from a test. Both Next.js
// advisories need a running server (the Windows path handler, the AVIF branch of
// the Image Optimization API) that the static export does not emit, and the
// sharp advisory is a libheif defect in a native binary. The floor is the
// assertion, so these guard the comparison itself as well as the versions: the
// mistake this PR started from was reading 16.2.12 as patched when the fix
// landed in 16.3.3, which any comparison that stops at the patch number accepts.
// ----------------------------------------------------------------

// Resolved from the cwd rather than from `import.meta.url`: the jsdom
// environment hands modules a non-`file:` URL, which readFileSync rejects.
// Vitest runs from the directory holding vitest.config.ts, which is the root.
const lockfile = readFileSync(resolve(process.cwd(), "pnpm-lock.yaml"), "utf8")

// pnpm writes concrete versions as `  name@1.2.3:` under `packages:` and as
// `  name@1.2.3(peer@4.5.6):` under `snapshots:`. Ranges in the `overrides:`
// block ("^4.3.2") carry no patch triple after the `@`, so they never match.
const lockedVersionsOf = (name: string) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const entries = lockfile.matchAll(new RegExp(`^ {2}${escaped}@(\\d+\\.\\d+\\.\\d+)[:(]`, "gm"))

  return [...new Set([...entries].map(([, version]) => version))]
}

const isAtLeast = (version: string, floor: string) => {
  const parts = version.split(".").map(Number)
  const floorParts = floor.split(".").map(Number)

  for (let i = 0; i < 3; i += 1) {
    if (parts[i] !== floorParts[i]) return parts[i] > floorParts[i]
  }

  return true
}

describe("patched-release comparison", () => {
  // A guard that cannot fail is worse than no guard. 16.2.12 vs 16.3.3 is the
  // case that matters: the higher patch number sits on the unpatched minor.
  it("reads a higher patch on a lower minor as below the floor", () => {
    expect(isAtLeast("16.2.12", "16.3.3")).toBe(false)
    expect(isAtLeast("16.3.3", "16.3.3")).toBe(true)
    expect(isAtLeast("16.3.4", "16.3.3")).toBe(true)
  })

  it("rejects the release immediately below each floor", () => {
    expect(isAtLeast("0.35.3", "0.35.4")).toBe(false)
    expect(isAtLeast("4.3.1", "4.3.2")).toBe(false)
    expect(isAtLeast("4.28.6", "4.28.7")).toBe(false)
  })
})

describe.each([
  { name: "next", floor: "16.3.3", advisories: "GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4" },
  { name: "sharp", floor: "0.35.4", advisories: "GHSA-rgj7-g3m4-5g8c" },
  { name: "js-yaml", floor: "4.3.2", advisories: "GHSA-2883-xcg3-v3hh" },
])("$name floor ($advisories)", ({ name, floor }) => {
  // A rename or a dropped dependency would leave the version assertion below
  // with nothing to iterate, passing while the floor went unchecked.
  it("appears in the lockfile", () => {
    expect(lockedVersionsOf(name).length).toBeGreaterThan(0)
  })

  it(`resolves every entry at or above ${floor}`, () => {
    const belowFloor = lockedVersionsOf(name).filter((version) => !isAtLeast(version, floor))

    expect(belowFloor).toEqual([])
  })
})
