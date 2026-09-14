# Project instructions

This repository is the Mora game-design assessment prototype, working title Fireline / 火线街区.

- Read README.md and docs/04-devlog.md before making changes. Read docs/07-rules.md once it exists.
- Keep game-design rationale and significant conversation outcomes in Chinese Markdown documentation. Record concise decisions, alternatives, observations, and evidence, not private reasoning transcripts.
- Distinguish proposed rules, implemented behavior, automated checks, browser QA, and actual human playtests. Never invent feedback or actual hours.
- Preserve user work. Check Git status before editing and before syncing. Never force push.
- Keep deterministic simulation separate from Three.js rendering and use a fixed simulation step.
- Prioritize one complete build / simulate / observe / modify / retry loop over extra features.
- Use TypeScript, Three.js and Vite unless the user changes the technical plan. Keep the game static-host compatible, including GitHub Pages repository subpaths.
- Keep credentials, the original assessment PDF, local absolute paths, dependencies and temporary outputs out of commits.
- Run appropriate type/build and deterministic-rule checks when changing mechanics. Include browser interaction checks for playable changes.
- Update README status and docs/04-devlog.md in the same work session as meaningful implementation changes.
- Do not publish a private repository or deploy a public site without the user's authorization for that action.
