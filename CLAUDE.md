# Nienburg

Cozy, turn-based medieval city builder for the browser. The roadmap and game design live in
`PLAN.md`; work through it one phase at a time and tick off finished items there.

## Commands

- `npm run dev` – dev server
- `npm test` – unit tests (Vitest)
- `npm run lint` – ESLint + Prettier check (`npm run format` to fix formatting)
- `npm run build` – type-check and production build
- `npm run sim` – a bot plays every city and prints when each star falls (`npm run sim -- 200 5`
  for 200 turns and five random seeds). Run it after changing numbers in `src/data/`;
  `tests/balance.test.ts` holds the corridor the results must stay in.

## Art

- Buildings are drawn in `src/render/buildings.ts` from a small kit (walls, gable roofs, windows,
  props). Open the game with `?assets` appended to the URL to see every building side by side.

## Architecture rules

- `src/core/` is pure, deterministic game logic: no DOM, no canvas, no imports from `render/` or
  `ui/` (enforced by ESLint).
- The whole game is one serialisable `GameState` object. No class instances or functions in state.
- Every state change goes through `src/core/actions.ts`.
- Randomness only via the seedable RNG in `src/core/rng.ts`, with its state stored in `GameState`.
- All balancing numbers live in `src/data/`; all player-facing text in both `src/data/i18n/de.ts`
  and `en.ts`.
- Write a test for every rule in `core/`. Check visible changes in a real browser.

## Conventions

- Code and comments in English; the game ships in German and English.
- No war, no time pressure, no permanent loss. No third-party art, names or text from existing games.
- Vite `base` is `/Nienburg/` and must match the repository name for GitHub Pages.
