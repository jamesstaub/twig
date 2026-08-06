---
name: headless-verify
description: Verify twig changes end-to-end in a headless browser — screenshots of UI states (desktop/mobile/embed), OSC bridge roundtrips, Web MIDI routing, and live audio-graph checks. Use after any UI, bridge, or audio change instead of assuming the code works.
---

# Headless verification recipe

## Ground rules

- **NEVER touch port 3333** — that is the user's live session (test traffic
  once leaked into it). Always start an isolated server:
  `PORT=3401 node server.js &` … and `lsof -ti :3401 | xargs kill` when done.
- CSS changed? `npm run build` (NOT `node build.js` — that skips Tailwind).
- Test through the built bundle. Raw ESM imports of `js/` modules 404 in a
  page (extensionless imports, bare `p5` specifier).
- No Chrome/Chromium is installed; use Brave with puppeteer-core:
  `executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'`,
  `headless: 'new'`, args `['--no-sandbox']`. `puppeteer-core` and `ws` may
  need `npm i` into the scratchpad (they are not project deps).

## Page access

- `window.TWIG.getState()` → live AppState; `window.TWIG.getAudioEngine()`
  → engine (inspect `engine.oscillators.get('harmonic_0')` node chain).
- Wait ~800ms after `networkidle2` for app init; Web MIDI init is ~2s
  delayed (wait ≥2500ms before MIDI assertions).
- Embed layout: viewport `{width: 1000, height: 170}` + URL `?embed=1`.

## Gestures that don't work via page.mouse

- **Dials** (`.mini-dial canvas`): drive them with synthetic PointerEvents
  dispatched on the canvas — `pointerdown` at center, `pointermove` upward
  (full range ≈ 128px of travel), `pointerup`. `page.mouse` drags do not
  register.
- **Signal modal**: open via the drawbar context menu — dispatch a
  `contextmenu` MouseEvent on `.drawbar[data-index="N"]`, then click the
  `.drawbar-context-menu-item` containing "Overtone Settings".
- MIDI modal: `#open-midi-mapping-btn`. Drawbar view tabs: click the
  `.drawbars-tab` whose text is `gain|filter|sequence`.

## Audio checks

Launch with `--autoplay-policy=no-user-gesture-required`, click the play
toggle (first `.toggle-switch`), wait ~800ms, then inspect nodes via
`TWIG.getAudioEngine().oscillators`. Note: AudioParam `.value` getters can
lag setTargetAtTime ramps — verify configuration (curve set, param
targets), or behavior, not instantaneous values.

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
