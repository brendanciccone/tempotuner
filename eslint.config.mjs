import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

// Next 16 removed the `next lint` subcommand, which is what used to supply this
// config implicitly. ESLint is invoked directly now, so the config has to be a
// real file in the repo.
const config = [
  {
    ignores: [".next/**", "out/**", "node_modules/**", "next-env.d.ts"],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
]

export default config
