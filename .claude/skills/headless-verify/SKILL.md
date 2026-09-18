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
  → engine (inspect `engine.oscillators.get('harmonic_0')` node chain).
- Wait ~800ms after `networkidle2` for app init; Web MIDI init is ~2s
  delayed (wait ≥2500ms before MIDI assertions).
- Embed layout: viewport `{width: 1000, height: 150}` + URL `?embed=1`.
  Touch density: `?coarse=1`. Phone: `{width: 390, height: 844}`.

## Surfaces

- Toolbar: `.surface-toolbar-btn[data-surface="trigger|source|gain|filter|
  sequence|convolution|adsr|settings|dock"]`; `body[data-surface]` and
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
  .drawbars-tab` (parameter tabs) appear; in embed `#drawbars-family-tabs`
  switches families. Reset/Randomize (`#reset-drawbars-button`,
  `#randomize-drawbars-button`) apply to the family.
- Sequence: click `#drawbar-label-N` (or the overtone menu's "Inspect")
  → the sheet `#inspector-sheet` (`body.inspector-open`) beside the
  current surface, sections Sequence / Modulation / Pulse Out, gate mode
  in `.inspector-gate-mode select`; `.inspector-expand` → the Sequence
  surface (`#sequence-control-root`), `.inspector-close` / Escape closes.
- Trigger: `.trigger-pad[data-index=N]` in `#pad-grid` (4 columns, 3 in
  portrait) — `pointerdown` (distinct `pointerId`s for chords) /
  `pointerup`; `.held` marks pressed pads. Silent unless Trigger mode AND
  playing; spy on `TWIG.getAudioEngine().triggerOscillatorAttack/Release`
  to assert gating. Trigger/Drone switches: `.envelope-mode-switch` inside
  `#trigger-mode-root` (Trigger surface), `#source-mode-root` (Source
  surface, fundamental header) and `#navbar-mode-root` (embed only); all
  show the state in `.envelope-mode-label`; `TWIG.getState().envelopeMode`
  is 'adsr' (Trigger) | 'open' (Drone); `body.adsr-mode` follows.
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
- **Tool row**: `#drawbar-shape-toggle` (then a plain press sculpts the
  row; panel in `#drawbars-shape-dock` with `.drawbar-shape-btn` ÷2/×2 and
  a `.cycle-stepper-arrow` contour stepper) and `#drawbar-link-toggle`
  (`body.link-all`; a dial drag then writes every voice). They are
  mutually exclusive, and `aria-pressed` also mirrors a held Shift / Cmd.

## Audio checks

Launch with `--autoplay-policy=no-user-gesture-required`, click the play
toggle (`.play-toggle-container .toggle-switch`), wait ~800ms, then inspect
nodes via `TWIG.getAudioEngine().oscillators`. Note: AudioParam `.value`
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
