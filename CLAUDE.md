Keep components modular and concerns clearly separated.

Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.

Choose the simplest implementation that fully meets the current
requirements.

Avoid speculative abstractions, configuration, and indirection.

Grow the system in layers. Start from the smallest version that works end
to end, and add each new capability on top of a product that already works. 

Never trade a working product for unfinished complexity.

Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. 

Do not reimplement common functionality without a clear reason.

Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.

Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.

---

# twig — project notes

Web-audio additive synthesizer, also embedded in a Max4Live device (`twig.amxd`)
via jweb, with a Node-for-Max `node.script` bridge. Vanilla ES modules, no
framework; esbuild bundle; Tailwind v4 utilities plus hand-written component
CSS under `css/components/`.

## Build & run

- `npm run build` — Tailwind compile THEN esbuild bundle. **Required for any
  CSS change.** Running `node build.js` alone only bundles JS and minifies the
  previously-compiled CSS — a stale-CSS trap that has bitten before.
- `node server.js` (PORT env, default 3333) — static host + OSC/WebSocket
  bridge. The same file runs under `[node.script]` inside the M4L device,
  binding an ephemeral port announced via `[outlet port <n>]`.
- The jweb page must be reloaded after a `dist/` rebuild. The bridge server
  process must be **restarted** after `server.js` changes — its command
  whitelists (`STATE_ORDER` etc.) live in the running process, so new
  commands silently fail to persist until restart.

## Architecture

- State: `AppState` in `js/config.js` (mutable singleton). Per-overtone params
  are sparse objects keyed by voice index: `oscillatorGates`, `oscillatorFilters`,
  `oscillatorDrives`, `oscillatorPans`, `oscillatorPulseOuts`, `oscillatorSequencers`.
- All writes go through actions modules (`js/modules/*/…Actions.js`), which
  (1) mutate AppState, (2) call the matching `updateHarmonicX()` in
  `js/audio.js` to hit the live audio graph, and (3) dispatch a CustomEvent
  from `js/events.js`. UI components never mutate AppState directly.
- `js/modules/osc/oscClient.js` listens for those events and mirrors every
  state change upstream over the WebSocket (so the Max patch can persist it
  in Live params); inbound bridge messages apply through the same actions
  behind an anti-echo flag. `server.js` caches state and serves `GET /state`,
  which the app applies before first render (bootstrap — this is the only
  persistence; there is no localStorage).
- Per-voice audio chain (`js/dsp/AudioEngine.js`): osc → gain → gate worklet
  (3 outputs: audio, cutoff-CV, Q-CV into the biquad's AudioParams) → drive
  WaveShaper → lowpass biquad → panner → shared compressor → master gain →
  limiter. Every node exists for every voice so features can be enabled
  mid-playback without rewiring; "off" states are passthrough (null
  WaveShaper curve, 20 kHz cutoff, gate mode 0).
- The gate worklet (`js/dsp/worklets/gate-processor.js`) is served
  **unbundled** — no imports allowed in that file. Arbitrary data (0/1
  sequences, shape tables) goes over `port.postMessage`, numbers go as
  AudioParams.
- Filter cutoffs are series-relative, not absolute Hz: the multiplier is a
  1-based partial index into the current system's ratio table applied to the
  voice's audible base (lowest integer multiple of its pitch clearing 20 Hz)
  — see `harmonicFilterCutoff` in `js/audio.js`.
- To add a new bridged parameter, follow the checklist in
  `.claude/skills/add-bridged-param`.
- Embed mode: `body.embed` is applied when the viewport is ≤ 220px tall or
  `?embed=1`; `css/embed.css` (must stay the **last** import in styles.css)
  reflows the app into one ~170px horizontal band. Modals become horizontal
  scrolling bands there; `.signal-section-body` exists so section content can
  flow column-on-desktop / row-in-embed with pure CSS.

## Testing

- **NEVER test against port 3333** — that is the user's live session. Use
  `PORT=3401 node server.js`.
- Source modules cannot be imported raw in a page (extensionless imports in
  the fundamental modules, bare `p5` specifier) — always test through the
  built bundle.
- `window.TWIG` debug API: `getState()`, `getAudioEngine()`,
  `pulses.subscribe(voice|'*', fn)`.
- Headless browser recipe (Brave + puppeteer-core, MIDI stubbing, dial
  gestures, audio-graph checks): `.claude/skills/headless-verify`.

## Gotchas

- A global `canvas { width:100% !important }` rule hijacks any new canvas;
  escape it with `style.setProperty(…, 'important')` (see `Dial.js`,
  which also sets `object-fit: fill`).
- The overtone-system `<select>` id is `ratio-system-select` (not
  `system-select`).
- Web MIDI init is delayed ~2s after page load; jweb denies Web MIDI
  entirely (the OSC bridge is the control path there); hidden/occluded pages
  get their main-thread timers throttled — audio-critical paths must not
  depend on rAF or setTimeout.
- MIDI feedback-loop guard: input drops notes below
  `midiConfig.inputNoteMin` (default 13) so IAC-looped pulse note-outs
  (1–12 by default) can't retrigger the fundamental. A pulse note remapped
  above the floor on a shared port will still loop — the separate
  input/output channel settings cover that case.
- `midiConfig` (channels, CC/note maps, note floor) is **not** bridged or
  persisted to Max yet — browser-session only.
- Native `<select>` dropdowns don't open inside jweb — embed-facing controls
  need button/icon alternatives (see the sequence view's waveform strip).
