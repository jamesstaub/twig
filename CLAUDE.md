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
- Per-voice audio chain (`js/dsp/AudioEngine.js`): source → gain → gate
  worklet (3 outputs: audio, cutoff-CV, Q-CV into the biquad's AudioParams)
  → drive WaveShaper → lowpass biquad → convolution stage (dry/wet mix
  around a ConvolverNode with ±gain; feedback is a delay line around the
  wet signal — Chrome won't process a signal reaching a convolver through
  a cycle, and a DelayNode in a cycle adds one render quantum, which is
  subtracted; loop period = the IR's duration or a series partial ("tune",
  filter-cutoff convention, ≥ 2 quanta via integer multiples). IRs from
  `js/dsp/IRManager.js`, baked via "Create IR" with an optional ring/decay
  time, and pitched per voice by voiceFreq / bakeFrequency) → panner → shared
  compressor → master gain → limiter. Every node exists for every voice so
  features can be enabled mid-playback without rewiring; "off" states are
  passthrough (null WaveShaper curve, 20 kHz cutoff, gate mode 0, conv
  dry 1/wet 0/no buffer).
- The voice's head is an OscillatorNode in `sourceMode: 'oscillators'`, or
  a per-voice tap on one shared external node (`js/dsp/SourceManager.js`:
  ADC/soundfile/pink/white) — voices keep their frequency identity so the
  pitch-tracked lowpasses (forced to multiplier 1 / Q 30 on entering an
  external mode) form a resonant filter bank. External modes hide the
  sequencer, waveform picker, and wavetable actions; the fundamental stays
  visible — it tunes the bank.
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

## Wavetable baking (DSP)

- "Create oscillator" and WAV export are **coefficient-domain** — no
  time-domain sampling, no DFT. `js/dsp/PartialSpectrum.js` (pure, no Web
  Audio/AppState) places each drawbar partial on an integer Fourier bin of a
  grid spanning `periodMultiplier` (P) fundamental periods:
  `bin = round(ratio × P)`. One bin per component = zero spectral leakage =
  loop-continuous by construction. The old sample-then-DFT path smeared
  irrational ratios across bins (audible buzz) — do not reintroduce it.
- Playback compensates by running the oscillator at `freq / P`
  (`getFrequencyCorrection` in `js/audio.js`); WAV export compensates via the
  file's sample-rate header (`sampleRate / P`).
- Pitch is exact for rational systems (grid hits the denominator LCM) and
  snapped to ≤ 0.5 cents otherwise (accepted tradeoff). Bright primitives
  (square/saw, 128-harmonic stacks) eat the bin budget and force coarser
  grids — several cents on irrational systems; sine primitives get sub-cent.
  Primitive stacks are band-limited at the creation-time Nyquist to match
  what the live voices sound like.
- Amplitude semantics: the drawbar mix IS baked in (each partial's amplitude
  ÷ its primitive's time-domain peak, matching PeriodicWave normalization of
  live voices). Acceptance test: bake → reset drawbars to fundamental-only →
  sounds identical to pre-bake (gain only; filter/gate/drive/sequencer are
  post-processing, never baked). The bake itself is mono; stereo/multichannel
  apply to WAV export only (stereo keeps the mix, multichannel = full-scale
  per-voice stems).
- Period selection (`chooseBeatPreservingPeriod`): smallest P meeting the
  cents tolerance where every component also gets its OWN bin — components
  sharing a bin vector-sum into a static partial, freezing the slow beating
  ("shimmer") that near-coincident components produce live, which matters
  when baking complex waves from complex waves. Out-of-budget components
  count as collisions (never "resolve" a clash by silencing). Falls back to
  pitch-only `choosePeriodMultiplier` when separation is impossible.
  Experimental — revert commit `3868b7c` alone to restore smallest-P.
  Physics limit either way: a loop cannot beat slower than `f0 / P`; the
  aperiodic drift of live stacked voices is not fully bakeable.
- Verified browser facts (headless probes): PeriodicWave renders up to
  coefficient 2048 and silently drops higher bins (`MAX_SPECTRUM_BIN = 2047`
  in `js/audio.js`), and is natively mipmapped — band-limits by the
  oscillator's actual frequency, which is exactly right since bins map to
  true output frequencies. Do NOT add custom mipmap levels or band-limiting
  (the old `mipmap` branch is obsolete).
- Nested bakes work: a custom wave used as a primitive maps its bins through
  its own stored P (`source.period`); its stack snaps per-component instead
  of base-snapped, since a multi-period table has no single fundamental.

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
- `midiConfig` (channels, CC/note maps, note floor, input port `inputId`,
  clock/transport port `clockOutputId`) is **not** bridged or persisted to
  Max yet — browser-session only. Exception: the note-out port (`outputId`)
  is bridged as `/twig/midiout` and persists. MIDI roles are split: note
  blips → `outputId`+`outputChannel`; clock ticks and play-toggle transport
  start/stop → `clockOutputId` (defaults to note-out port; channel-less by
  MIDI spec); note/CC in → `inputId` (null = all inputs) + `inputChannel`.
- The app self-diagnoses a stale bridge process: `GET /state` carries an
  `x-twig-commands` header (the server's `STATE_ORDER`), and the client
  warns on boot when its commands are missing from it.
- Native `<select>` dropdowns don't open inside jweb — embed-facing controls
  need button/icon alternatives (see the sequence view's waveform strip).
