---
name: headless-verify
description: Verify twig changes end-to-end in a headless browser — screenshots of UI states (desktop/mobile/embed), OSC bridge roundtrips, Web MIDI routing, and live audio-graph checks. Use after any UI, bridge, or audio change instead of assuming the code works.
---

# Headless verification recipe

## Ground rules

- **NEVER touch port 3333** — that is the user's live session (test traffic
  once leaked into it). Always start an isolated server:
  `PORT=3401 node server.js &` … and `lsof -ti :3401 | xargs kill` when done.
  Its bridge cache PERSISTS state between runs (envelope mode, pans,
  filters…): read state before asserting, never assume defaults.
  If another session may be testing at the same time, pick your own port
  (`PORT=3417`): two test pages on one bridge relay play/stop and every
  parameter to each other, which reads as voices vanishing mid-test.
- CSS or JS changed? `npm run build` (esbuild bundles both).
- Test through the built bundle. Raw ESM imports of `js/` modules 404 in a
  page (extensionless imports, bare `p5` specifier).
- No Chrome/Chromium is installed; use Brave with puppeteer-core:
  `executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'`,
  `headless: 'new'`, args `['--no-sandbox']`. `puppeteer-core` and `ws` may
  need `npm i` into the scratchpad (they are not project deps).
- A consolidated regression suite (`suite.js`, ~50 checks across desktop /
  phone portrait / embed) lives in the session scratchpad when one exists;
  recreate it from the recipes below if not.

## Page access

- `window.TWIG.getState()` → live AppState; `window.TWIG.getAudioEngine()`
  → engine (`engine.voice(0).stages` — source, envelope, level, modulator,
  drive, filter, convolution, pan, meter — each holding its nodes, e.g.
  `stages.filter.biquad`, `stages.modulator.node.parameters.get('mode')`;
  `engine.master` is the bus: `input`, `gain`, `limiter`, `analyser`).
- Wait ~800ms after `networkidle2` for app init; Web MIDI init is ~2s
  delayed (wait ≥2500ms before MIDI assertions).
- Embed layout: viewport `{width: 1000, height: 150}` + URL `?embed=1`.
  Touch density: `?coarse=1`. Phone: `{width: 390, height: 844}`.

## Surfaces

- Toolbar: `.surface-toolbar-btn[data-surface="source|gain|trigger|adsr|
  filter|convolution|sequence|settings|dock"]`; `body[data-surface]` and
  `body.viz-dock` reflect the state. "dock" toggles only the tonewheel
  (`#tonewheel-container`); each parameter surface's viz panel
  (`#gain-viz-root`, `#filter-viz-root` scope, `#conv-viz-root`,
  `#adsr-viz-root`) shows with its surface. Panel roots carry the `hidden`
  attribute when not shown.
- The drawbar strip (`#drawbars-control-root`) is shared by gain / filter /
  convolution / adsr: `#drawbars-title` names the family; each column
  `.drawbar[data-index=N]` has the family's primary parameter on the bar
  (`.drawbar-value` readout) and the others as `.mini-dial`s under it
  (labels in `.mini-dial-label`). When the panel is under 420px tall
  (`page.setViewport` height ~520) the dials go and `#drawbars-tabs
  .drawbars-tab` (parameter tabs) appear (the embed band is always
  compact); the toolbar switches families on both shells.
- Overtone toolbar: the bottom bar of the strip (`#drawbars-toolbar`) and
  of the Sequence panel (`#sequence-toolbar`): `[data-action="reset|
  randomize|link|shape"]`; the shape panel is `.shape-panel` inside the
  bar (`.shape-panel-btn` ÷2/×2, `.cycle-stepper-arrow` contour). To
  assert "nothing jumps", snapshot every button's rect, toggle shape,
  compare — and `scrollIntoView` the bar FIRST in embed (puppeteer's
  click scrolls the band sideways, which reads as a jump).
- Sequence: the toolbar's Sequence button → editor in
  `#sequence-inspector` (sections Sequence / Modulation / Pulse Out, gate
  mode in `.inspector-gate-mode select`, its fields as dials in
  `.inspector-gate-params .mini-dial`), the ‹ Overtone N › stepper
  `.inspector-step` inside `#sequence-toolbar`, the drawn sequence in the
  side column (`#sequence-canvas-area canvas` — hash its pixels to assert
  a redraw). Column labels navigate nowhere; there is no inspector sheet.
- Source docking: at ≥1361×864 (or 1280×912) the page opens with
  `body.source-docked` — Source above the active surface, BOTH toolbar
  buttons pressed; the Source button toggles the dock. To test one
  surface at a time, click Source once first (or use 1180×720, where
  Source is a surface of its own). Guard clicks with the button's
  `aria-pressed`, since a second click undocks.
- Embed (`?embed=1`, test at 1000×150): the toolbar is a row across the
  top (`.surface-toolbar-btn[data-surface=…]`, click via `evaluate` — the
  band scrolls sideways under puppeteer's own click),
  `.surface-toolbar-collapse` toggles `body.toolbar-collapsed`. Every
  surface must fit the 150px band with the toolbar expanded.
- Trigger: `.trigger-pad[data-index=N]` in `#pad-grid` (4 columns, 3 in
  portrait) — `pointerdown` (distinct `pointerId`s for chords) /
  `pointerup`; `.held` marks pressed pads. Silent unless Trigger mode AND
  playing; wrap `attack` / `release` on each of
  `TWIG.getAudioEngine().voices.values()` to assert gating. The Trigger/Drone switch is `#navbar-mode-root
  .envelope-mode-switch` (navbar, beside Play), state named in
  `.envelope-mode-label`; `TWIG.getState().envelopeMode` is 'adsr'
  (Trigger) | 'open' (Drone); `body.adsr-mode` follows.
- Settings: the toolbar button or the recorder's ⚙ → tabs
  `.settings-tab[data-tab="midi|recorder"]` over `#midi-settings` /
  `#recorder-settings`, no dock; in embed an overlay (`body.settings-open`,
  `.settings-close`).

## Gestures that don't work via page.mouse

- **Dials** (`.mini-dial canvas`): synthetic PointerEvents dispatched on
  the canvas — `pointerdown` at center, `pointermove` upward (full range ≈
  128px), `pointerup`. `page.mouse` drags do not register. Drag DOWN when
  the dial may already be at max (persisted state), or the drag is a no-op.
- **Bars**: press by dispatching `pointerdown` then `pointerup` on
  `.drawbar[data-index=N] .drawbar-input-wrapper` at the wanted clientY
  (top = max; `shiftKey: true` sculpts the row). Swipe-draw: `pointerdown`
  on one wrapper, then `pointermove`s dispatched on `#drawbars` (the strip
  captures the pointer) at other columns' x/y, then `pointerup` —
  `pointerType: 'touch'` works the same.
- **Shape / link**: the toolbar's `[data-action="shape"]` (then a plain
  bar press, dial drag or modulation slider `input` sculpts every voice)
  and `[data-action="link"]` (`body.link-all`; an edit then writes every
  voice). Mutually exclusive; `aria-pressed` also mirrors a held Shift /
  Cmd, a held Shift shows `.shape-panel` too, and the Sequence bar's
  `.inspector-title-voice` reads "All voices" while either is in effect. With a square contour a shaped row is two-level — correct, not a
  bug.

## Audio checks

Launch with `--autoplay-policy=no-user-gesture-required`, click the play
toggle (`.play-toggle-container .toggle-switch`), wait ~800ms, then inspect
nodes via `TWIG.getAudioEngine().voices` (Map, keyed by overtone index).
Pulses only fire for voices ≤ 50 Hz — drop the fundamental before
asserting them. On a cold headless launch the context clock can take a
moment to start advancing; params then still read their defaults.
Note: AudioParam `.value`
getters can lag setTargetAtTime ramps — verify configuration (curve set,
param targets), or behavior, not instantaneous values.
`getOutputAnalyser()` (js/audio.js) is the post-limiter tap the scope reads.

## OSC bridge roundtrip

Connect a plain `ws` client to `ws://localhost:3401/osc` as a Max stand-in:

1. inbound: `ws.send(JSON.stringify({address:'/twig/<cmd>/<n>', args:[v]}))`
   → assert page state changed
2. upstream: perform the UI gesture → assert the ws client received
   `/twig/<cmd>/<n>`
3. persistence: `GET http://localhost:3401/state` contains the entry, and a
   `page.reload()` restores the value (bootstrap)

## Web MIDI (input/output routing)

jweb and default headless deny real MIDI — stub it BEFORE app boot with
`page.evaluateOnNewDocument`, replacing `navigator.requestMIDIAccess` with a
fake: inputs map with a port object exposing settable `onmidimessage`,
outputs map with a `send()` recorder. Fire synthetic messages through the
stored `onmidimessage` and observe `TWIG.getState()` / recorded sends —
this exercises the real bundled routers end to end.
