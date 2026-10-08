# README Maintenance

After completing any feature, bug fix, or behavioral change, review `README.md` and update it if the change affects any of the following sections:

## What to Check

| README Section | Update when… |
|---|---|
| **Features** (## Features) | A new user-facing feature is added, an existing feature changes behavior, or a feature is removed |
| **Screenshots** (`docs/screenshots/`) | The UI visibly changes — re-capture the affected screenshot |
| **Test counts** (the `tests/` line) | Tests are added or removed — update the counts |
| **Environment Variables** | A new env var is introduced or an existing one is renamed/removed |
| **Security** | Security-relevant behavior changes (rate limits, auth guards, fail-closed logic, anti-bot measures) |
| **API routes / endpoints** | A route is added, removed, or its contract changes |
| **Tech stack / dependencies** | A major dependency is added or replaced |

## Rules

1. **Always check** — even if you believe the change is internal-only, scan the sections above before finishing.
2. **Keep counts accurate** — when adding tests, update the unit/security counts on the `tests/` line.
3. **Match existing style** — use the same bullet format, heading hierarchy, and tense already in the README.
4. **Keep it short** — the README describes what the project is and how to run it, not its history. No changelog or "recent additions" lists: what changed and why belongs in commit messages and PR descriptions.
5. **Ask if unsure** — if you can't tell whether a change warrants a README update, flag it for the developer rather than silently skipping it.
