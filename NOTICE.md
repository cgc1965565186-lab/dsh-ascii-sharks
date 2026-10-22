# Attribution / NOTICE

This project is a DeepSeek Harness client plugin built around the ASCII shark
and fish simulation from:

- **ascii-sharks** — https://github.com/stackedlol/ascii-sharks
  (TypeScript sources: `src/math.ts`, `src/species.ts`, `src/world.ts`,
  `src/renderer.ts`, etc.)

`ascii-sharks-src/math.js`, `species.js`, `world.js` and `renderer.js` are a
plain-JavaScript port of those sources, with modifications for this
integration (visible-water regions, free-roam steering, transparent canvas,
theme palette, ASCII click ripples, Harness shell layout).

The upstream repository **does not contain a license file**. No additional
license is granted here for the ported simulation code; it remains subject to
the upstream author's terms. The Harness integration code (plugin manifest,
`index.js`, `entry.js`, `engine.js`, the `cordis.patch.yml` row, locale files,
icon, and the splash/water-layout additions) was written for this project.

If you are the upstream author and would like the port removed or licensed
differently, please open an issue in this repository.
