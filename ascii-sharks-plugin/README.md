# ASCII Sharks for DeepSeek Harness

An ambient ASCII ocean for the Harness desktop UI. Sharks, small fish schools,
wake trails and bioluminescent dots drift through the empty gutters on either
side of the conversation column. The water is clipped to those gutters, so the
sharks slip behind the chat surface, the composer and the sidebar instead of
covering them.

Underwater simulation ported from
[stackedlol/ascii-sharks](https://github.com/stackedlol/ascii-sharks)
(plain-JS port of the TypeScript sources; the overlay layout, theme adaptation
and clipping are new). The upstream repository carries no license file — this
port is for local, private use.

## How it works

- Host half: `index.js` (`apply()` only). The bundle patch inserts one row
  `ascii-sharks`.
- Client half: `client.js`, loaded by the Harness web module loader, registers
  one entry `ascii-sharks.ocean` into the `shell.overlay` slot at `order: -10`.
- The layer is a full-frame, click-through canvas below the other overlay
  entries (dialogs and toasts cover it).
- Every 500 ms the layer measures the shell layout: the conversation body
  (`[data-conversation-content]`), its width handles, the sidebar/center column
  boundary, the right panel and the bottom row. It paints only the two gutter
  rectangles outside the reading column (34 px clearance).
- On the blank/new-conversation Hero the water also opens the wide bands above
  and below the centred headline + composer block, so the tank becomes a large
  ring around the content instead of two narrow side channels.
- Four sharks (classic, hammerhead, mako, nurse) roam by heading rather than by
  fixed waypoints: every 2.2–5.5 s each picks a new target heading (an
  occasional near U-turn), while a 4–9 s "mood" varies commitment, sideways
  weave and cruise speed. Soft water boundaries only push at an edge that is
  not shared with another water rectangle, so the Hero's bands and side
  channels connect into one roaming area and the path never settles into a
  repeating orbit. When a snout turns into the reading column it is clipped,
  which reads as passing behind the page. Fish school and scatter around them;
  hunting is disabled so the sharks stay in view.
- The population is never reseeded on a layout change — no creature teleports
  back to its spawn point. The same fish and sharks simply keep swimming and
  drift into whatever water the Hero or the active conversation exposes.
- Clicking any visible water point splashes it: the sim gets a wake impulse and
  a flash-expansion scare, while the renderer draws three concentric,
  cell-snapped ASCII ripple bands (`~ - . : '`, two cells thick) plus a `* + o`
  droplet burst, expanding for 2 s. The window listener is passive and
  capture-phase, so the click still reaches the UI underneath; clicks outside
  the water do nothing.
- Colours follow the app theme: deep-water palette on `body[data-ds-dark-theme]`,
  inverted ink on the light theme. `prefers-reduced-motion` draws one still
  frame. The layer is `pointer-events: none` and `aria-hidden`.

## Requirements

DeepSeek Harness Desktop with the `desktop` profile. No dependencies.

## Install / restart

The bundle is installed in the desktop profile by linking this directory:

```sh
# from a Harness session with the plugin manager
plugin_manager install_bundle -> /absolute/path/to/ascii-sharks-plugin
```

The Host row activates immediately and the Host publishes the new Client
module graph to the running page over its plugin event stream, so the ocean
usually appears without a restart. If a build only composes that graph at
boot, restart DSH Desktop once (quit and reopen); sessions are preserved.

`exports["./package.json"]` is required: the Host resolves a client package's
manifest through `require.resolve('<name>/package.json')`, and a manifest
without that export is silently skipped by the Client module scan.

To turn the effect off, disable `ASCII Sharks` in Settings → Plugins (or the
`include:ascii-ocean` row); to remove it, uninstall the `@local/ascii-ocean`
bundle.

## Files

| File | Purpose |
| --- | --- |
| `package.json` | Bundle manifest (`dsh.bundle.patch`, `dsh.client`) |
| `cordis.patch.yml` | Inserts the `ascii-sharks` Host row |
| `index.js` | Host half (no-op) |
| `client.js` | Built Client artifact (single module) |
| `locale/en.json`, `locale/zh.json` | Plugin Manager title/description |
| `icon.svg` | Original shark icon |

## Rebuilding

Build sources live next to the plugin in `../ascii-sharks-src/`:

```sh
cd ../ascii-sharks-src
node build.mjs          # regenerates ../ascii-sharks-plugin/client.js (id from package.json)
node --check ../ascii-sharks-plugin/client.js
```

`world.js` and `renderer.js` are generated from the upstream TypeScript with
`node:module.stripTypeScriptTypes`, then patched: water regions and waypoint
patrols in `world.js`; transparent background, theme palette, fixed cell size
and water clipping in `renderer.js`. `engine.js` and `entry.js` are authored for
this plugin. After rebuilding, a page reload picks up the new bundle revision
(the Host watches `client.js` for changes).
