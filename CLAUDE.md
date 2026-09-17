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
framework; esbuild bundles both JS and the hand-written CSS (`css/styles.css`
@imports theme, base, and every `css/components/*` file — no Tailwind).

## Build & run

- `npm run build` (= `node build.js`) — esbuild bundles `js/` to
  `dist/app.js` and resolves `css/styles.css`'s @import chain into
  `dist/styles-compiled.css`. One step covers JS and CSS changes.
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
  which the app applies before first render (bootstrap). Persistence is
  split by kind: the bridge cache holds SYNTH state (everything bridged);
  the user's local app configuration — `midiConfig` and `recorderConfig`
  in `js/appConfig.js` (MIDI routing/mappings, recorder modes) — lives in
  localStorage, loaded before bootstrap so bridged values win. Recordings
  and IRs remain session-only.
- Per-voice audio chain (`js/dsp/AudioEngine.js`): source → gain → gate
  worklet (3 outputs: audio, cutoff-CV, Q-CV into the biquad's AudioParams)
  → drive WaveShaper → lowpass biquad → convolution stage (dry/wet mix
  around a ConvolverNode with 0-1 gain; feedback (−0.99..0.99, negative
  inverts each recirculation) is a delay line around the wet signal — Chrome won't process a signal reaching a convolver through
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
  external mode) form a resonant filter bank. The gate worklet, sequencer,
  and pulses run on external-source voices too (their clock is the voice
  frequency). External modes hide only the waveform picker and wavetable
  actions; the fundamental stays visible — it tunes the bank.
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
- Layout mode (`js/modules/layout/layoutMode.js`, UI-only, never bridged):
  the **shell** is `embed` (viewport ≤ `--embed-max-height`, theme.css
  220px, or `?embed=1`) or `surfaces` (everything else — desktop and touch
  share it), exposed as `body.embed` | `body.surfaces`; **coarse**
  (`pointer: coarse`, or `?coarse=1` to preview touch density with a
  mouse) is `body.coarse` and swaps control density without changing the
  shell. Changes dispatch `LAYOUT_MODE_CHANGED`. This is the foundation
  of the touch/surface UI overhaul (see the memory file
  `project_touch_ui_overhaul` for the plan and phase status).
- Readouts are inline, never floating: `Dial` renders its own caption
  above the arc and value below it (`.mini-dial-label` / `.mini-dial-value`,
  css/components/dial.css — hosts must NOT add their own captions), and
  every drawbar has a `.drawbar-value` under the bar kept current by
  `syncFill`. `Dial` calls `onChange` BEFORE `draw()` so a `format` that
  reads host state (the inspector's cutoff "φ^2 · 660 Hz") renders the new
  value. Nothing floats any more: `ValueTip` is gone, and `Dial` has no
  tip options. Gotcha: layout.css's `.labeled-control span` restyles
  every span in a panel as a flex heading; widget text inside panels must
  out-specify it (dial.css uses `.mini-dial > …`).
- Embed mode: `body.embed` (see layout mode above) when the viewport is
  ≤ `--embed-max-height` (theme.css, 220px) tall or `?embed=1`;
  `css/embed.css` (must stay the **last** import in styles.css,
  followed by each component's own `*.embed.css`) reflows the app into one
  ~150px horizontal band that scrolls sideways if it doesn't fit — a jweb
  viewport is often plenty WIDE even though short, so desktop's own
  width-based breakpoints (e.g. the Wavetable row's 48rem/80rem) still
  fire there and need explicit embed overrides, not just narrow-viewport
  assumptions. The surface toolbar is hidden and every panel root stays
  visible (the shell skips embed entirely).
  Sections become flex children of `body.embed` via `.embed-flatten`
  (`display:contents` on intermediate wrapper divs) with `order:` per
  section. The inspector sheet and the Settings panel become full-band
  horizontal scrolling overlays there (`body.settings-open`);
  `.inspector-section-body` exists so section content can flow
  column-normally / row-in-embed with pure CSS. There are no modals in
  the app any more.
- Surfaces shell (`body.surfaces`, i.e. everything but embed):
  `js/modules/surfaces/` — `surfaceState.js` is the UI-only registry
  (`SURFACES`: play/mix/source/system/wavetable → panel-root element ids;
  `DOCK_ROOTS`; visible set + viz-dock flag, emits `SURFACE_CHANGED`),
  `ToolbarComponent` is the left icon rail (`#surface-toolbar`),
  `SurfaceShellComponent` applies state to the DOM: sets `hidden` on every
  panel root the active surface doesn't include (base.css has
  `[hidden]{display:none!important}`), collapses the row wrappers whose
  children are all hidden, and exposes `body[data-surface="…"]` +
  `body.viz-dock`, then dispatches a synthetic window `resize` so canvases
  re-measure. Surfaces: play (fundamental + source + pads), mix, voice,
  system, wavetable, settings — a registry entry's `dock: false`
  (settings) keeps the canvases off that surface even with the dock
  toggle on (`surfaceState.dockShown` vs the toggle's `dock`). `SurfacesController` mounts LAST in `initUI()` so every
  panel has sized itself while visible. `css/components/page-arrangement.css`
  arranges whatever is left showing (single centered panel for
  Source/Fundamental/System; 2:1 Wavetable+Tonewheel; dock = second grid
  column beside the surface, or a `--dock-height` band on top in
  portrait). Markup: `.control-card` holds exactly two children — the
  `.surface-stack` (every non-dock panel, a flex column; the LAST
  visible one carries `flex:1`) and the `.wavetable-tonewheel-row` — so
  the dock grid is always two cells however many panels a surface shows
  (Play shows two: the fundamental strip over the pad grid; placing
  every child on grid row 1 overlapped them). Both wrappers, plus
  `#m4l-fundamental-source-panel`, are in the shell's WRAPPERS list and
  collapse when all their panels are hidden; in embed all three are
  `.embed-flatten` (display:contents) and the band order comes from
  `order:` on the panels themselves. The dock defaults ON for fine pointers and OFF for
  `body.coarse` — that default is read lazily (`dockDefault()`), NOT at
  module import, because `layoutMode.init()` runs later than imports.
  Sizing a panel for a shell position belongs in page-arrangement.css,
  not the component's CSS (a viz.css mobile `min-width` on
  `#tonewheel-container` once fought the dock band). The Wavetable/
  Tonewheel row is column below 48rem, row above, grid from 80rem; the
  `.result-grid` canvases are side by side except in the narrow side
  dock where they stack. Panel DOM never moves between shells — the
  `#m4l-fundamental-source-panel` group exists for the embed band, and
  `this.q()` in components scopes lookups to their own root element, so
  only ever move a *root* div. p5 gotcha: the tonewheel sketch's
  `windowResized` can run before `setup()` (p5 subscribes to resize
  immediately but defers setup to page load), so it early-returns until
  `canvasReady` — any synthetic resize before load would otherwise throw
  on `p.height`.
- Inspector (`js/modules/inspector/`): the full per-overtone editor —
  left column: gain & pan (the gain dial IS the drawbar, via
  `DrawbarsActions.setDrawbar`, mirrored on `DRAWBAR_CHANGE`), filter &
  drive, convolution, ADSR envelope with a hold-to-trigger pad, pulse
  outs; right column: sequence (gate + shape) and modulation depths
  (`.inspector-main` / `.inspector-aside`; one column in the sheet, one
  row in embed). It replaced the overtone modal. `inspectorState`
  (UI-only: selected index + sheet open, emits `INSPECTOR_CHANGED`) is
  the model; `InspectorComponent` renders from AppState via the actions;
  `InspectorController` homes the ONE component instance in either the
  Voice surface's panel (`#voice-control-root`, when that surface is
  active) or the sheet (`#inspector-sheet`, beside any other surface
  while open — an in-flow side column in landscape, an overlay bottom
  sheet in portrait, a full-band overlay in embed; inspector.css /
  inspector.embed.css, `--sheet-width` / `--sheet-height` tokens). It
  re-renders on `OVERTONE_SIGNAL_CHANGED` for the selected index EXCEPT
  for its own writes: every handler goes through `component.apply()`
  which sets `component.writing` while the actions run, and the
  controller skips those — re-rendering under a dial mid-drag would
  destroy the dial. Opened from a drawbar column label click (the one
  always-present tap target), the context menu, or the Voice toolbar
  button; Escape closes the sheet. DrawbarsComponent only calls
  `onInspect(index)` — ui.js wires that to `inspectorState.open`, so
  the strip never imports the inspector.
- Mix header modes (`#drawbar-shape-toggle` / `#drawbar-link-toggle`,
  wired in drawbarsController; both UI-only, both dropped on leaving the
  Mix surface via `SURFACE_CHANGED`). **Shape** = `DrawbarsComponent.
  shapeMode`: every bar or dial drag sculpts the whole row, exactly what
  a shift-drag does (`isShapeGesture(e)`); the math is the pure
  `rowShape.js` `shapedRow()` (0-1 positions; the component maps them
  back into each parameter's range so a shaped filter row sets series
  steps). The panel (contour preview, contour stepper, ÷2/×2 cycles —
  each re-applies the remembered last gesture) is BUILT by the strip
  (`shapePanel()`, once) but DOCKED by the controller in
  `#drawbars-shape-dock`, the band between the header and the bars: the
  strip is a sideways-scrolling row and clips anything appended to it
  (and in portrait `justify-content:center` overflow slides it
  off-screen left). **Link** = `linkLock` in `linkAll.js`
  (`isLinkAll(e)` = lock || cmd/ctrl; emits `LINK_ALL_CHANGED`) — the
  touch stand-in for the modifier, honored by the inspector too. Gate
  contours are unipolar 0-1 and share one definition, mirrored in
  `shapeContour()` (sequencePreview.js) and `shapeValue()`
  (gate-processor.js) — change both together. `square` is a real 50%
  pulse (high first half, low second half) — NOT a constant, which would
  pin every shaped row to 1; index 6 is `hold` (constant 1 = pattern
  gating only), used when a custom wave has gone missing. `shapedRow()`
  anchors the contour's FIRST maximum on the dragged column: the peak for
  sine/triangle, the leading edge of the high half for square, so a
  shaped row starts high at the column you dragged. On phone
  portrait the header (title, tabs, toggles) wraps to three lines — a
  wider-than-viewport centered card shifts LEFT and takes every child
  with it, so header content must always be allowed to wrap.
- Play surface (`js/modules/play/`): the fundamental strip
  (`#fundamental-control-root`: Hz input, octave stepper, one-octave
  keyboard — the panel spans the width there; `body.coarse` enlarges the
  keys) over `#pad-grid-root`, a `PadGridComponent` with one big pad per
  overtone of the current system. Pads gate the voice envelopes through
  `triggerHarmonicAttack/Release` — the same path as the Q–] keys and
  the strip's small trigger pads — so they are silent outside ADSR mode
  or while stopped; the grid shows a "Switch to ADSR" button in open
  mode instead of dead pads. No velocity by design (the voice's own ADSR
  from the inspector is the articulation). Each pad captures its own
  pointer (multi-touch = chords), and `teardown()` releases every held
  pad, because the controller re-renders on system/fundamental/envelope
  changes (`scheduleUpdate`, rAF-coalesced) and a re-render mid-hold
  would otherwise strand a gated voice. A per-frame `--pad-level` glow
  from `getVoiceLevel` lights whatever sounds, keyboard-triggered
  included. `TRIGGER_KEY_LABELS` (KeyboardShortcuts.js) supplies the
  key hints. Hidden in embed (play.embed.css).
- Settings surface (`js/modules/settings/`, `#settings-control-root`):
  `MidiSettingsComponent` (ports/channels per MIDI role, pulse toggles,
  drawbar-CC and pulse-note mapping tables; re-rendered on
  `MIDI_OUTPUT_CHANGED` since ports arrive late) and
  `RecorderSettingsComponent` (wav/mid layout, take length, tempo mode;
  `syncChecked` on `RECORDER_CHANGED`), both in place — the modal layer
  (ModalComponent/modalActions/`#modal-root`) is gone. MIDI | Recording
  are tabs (`selectTab`); the toolbar's Settings button and the
  recorder's ⚙ (`SettingsController.open(tab)`) get there:
  on the surfaces shell that is `surfaceState.show('settings')` (+
  scrollIntoView of the section); in embed the same root becomes a
  full-band overlay (`body.settings-open`, settings.embed.css) with its
  own × / Escape. `body.surfaces .page-shell` is height-capped to the
  viewport (page-arrangement.css) precisely so tall panels like this one
  and the Voice surface scroll INSIDE themselves — a surface is a
  screen, never a scrolling page; layout.css's `min-height` alone let a
  tall panel grow the page.
- Navbar: above 64rem it is the fixed one-row bar with `.app-container`
  padded to `--navbar-height` (base.css) and the page shell sized to
  the rest. Below 64rem on the surfaces shell (phones both ways,
  portrait tablets — one row of everything needs ~1100px) it becomes a
  STATIC, WRAPPING block at the top of a full-height flex column
  (`body.surfaces.app-container`, page-arrangement.css; rows in
  navbar.css: Play·Open/ADSR, recorder, Gain·Slew — the recorder joins
  row 1 from 48rem). The Open/ADSR switch is styled like Play/Stop: one
  label (`#envelope-mode-label`) naming the current state. A wrapping navbar has no known height, which
  is why the fixed-navbar + padding scheme can't be used there; the
  logo is dropped. The Gain/Slew groups and their range inputs must be
  allowed to shrink (`min-width:0; flex:1 1 0`) — a range input's
  intrinsic width is rigid and the pair overflows a phone otherwise.
  On short viewports (`max-height: 30rem`, landscape phones) the
  surface toolbar goes icons-only and scrolls. Embed keeps its own
  navbar layout (embed.css).
- The drawbar strip (`DrawbarsComponent`) is a touch surface: ONE
  pointer handler on `#drawbars` owns every bar gesture (`pointerdown`
  on a `.drawbar-input-wrapper` snapshots all column rects, then each
  move applies to the column under the pointer — `columnAt` /
  `applyPointerToColumn` — so a finger swiped across the row DRAWS the
  spectrum; shape mode shapes per pointed column). `.drawbar-input-
  wrapper` and `.drawbar-slider` are `touch-action: none` (a sideways
  finger must never become a scroll and cancel the pointer); the
  column's label/aux areas keep `pan-x` so an overflowing strip can
  still be scrolled from there. Per-column controls are ONLY: label
  (opens the inspector), the bar + `.drawbar-value`, amp dot, ADSR
  trigger pad, and in the convolution view the IR stepper — pan, res,
  drive and the convolution send dials live in the inspector now, and
  the sequence view is a read-only `.drawbar-seq-summary` (the
  inspector's preview + mode/stretch text) that opens the inspector;
  `syncSignal` refreshes it on gate/seq changes. Under 40rem the
  columns are `flex: 1 1 0` with a 20px floor (12 voices fit a phone
  beside the toolbar; more scroll), the summary text hides, and only
  the preview remains.
- `.page-shell`/`.page-content`/`.control-card` are a flex chain filling
  the viewport below the fixed navbar (`.page-shell`'s `min-height:
  calc(100vh - navbar-height)`, `.control-card{flex:1}`) so leftover
  vertical space goes somewhere instead of leaving dead space under the
  card. On the Mix surface `#drawbars-control-root{flex:1}` absorbs it
  (the other surfaces' wrappers grow the same way), and the
  actual sliders grow to match via `--drawbar-track-length` — a CSS var
  DrawbarsComponent.syncTrackLengths() publishes from each column's
  measured post-layout height (a rotated `<input type=range>`'s
  PRE-rotation `width` becomes its visual length, and CSS can't derive
  one axis from the other on a rotated element). That mechanism used to
  be embed-only; it's now read by the base (desktop) `.drawbar-slider`
  rule too, with a `min-height` FLOOR (not 0) on `.drawbar-input-wrapper`
  so a squeeze (mobile, where the stacked page is naturally taller than
  the viewport and flex has no spare space to hand out) can't collapse
  the sliders toward nothing — always give a flex-grow chain like this a
  real min-height at the layer that's actually visible, not `min-height:0`
  all the way down. `--drawbar-track-length` is kept live with a
  ResizeObserver on each `.drawbar-input-wrapper` (not just a
  window-resize listener) — the wrapper's available height now depends on
  sibling rows too (a system switch adding a param-dial row, a late
  web-font swap reflowing label text, …), none of which fire a resize
  event; a stale cached length shows up as the slider's actual draggable
  range (and its focus ring) covering less than the visible groove drawn
  by `.drawbar-track` (which is plain `height:100%`, always current).
  Separately, `.drawbar-slider` needs `flex-shrink:0`: it's a flex child
  of `.drawbar-input-wrapper`, whose own WIDTH is a fixed 26px (the
  slider's thin axis, pre-rotation) — every desired track length
  "overflows" that 26px main axis, and without `flex-shrink:0` the
  browser's default flex-shrink plus a range input's own `min-width:auto`
  floor silently clamps the rendered length to the input's intrinsic
  min-content size (~129px in Chromium) instead of the requested value,
  regardless of what `--drawbar-track-length` says. This is exactly the
  same symptom (slider length disagreeing with the drawn track) as the
  stale-var problem above but from a completely different cause — check
  both if it recurs.
- Canvas heights are capped in CSS so they can't dictate a row's height on
  their own (`.result-canvas canvas`, `#current-waveform-canvas-area
  canvas`) — the spectrum canvas's matching cap is a JS constant (`HEIGHT`
  in `SpectrumComponent.js`, written as an inline `!important` style that
  CSS cannot override), so keep both in sync by hand if either changes.
  The Wavetable panel's two canvases sit side by side (`.result-grid` is
  `display:grid; grid-auto-flow:column` over the flat `canvas, actions,
  canvas, actions` markup — auto-flow:column NEEDS an explicit
  `grid-template-rows` to know when to wrap into the next column, or all
  4 items just spread across 4 implicit columns in one row instead).
  `#tonewheel-container` shares `.labeled-control`'s background/padding so
  it reads as one more panel, and stretches (`align-items:stretch`,
  page 2's default) to match the Wavetable panel's height. The tonewheel's
  own p5 sketch (`tonewheelActions.js`) sizes its square canvas from
  `Math.min(container.clientWidth, container.clientHeight)`, not just
  width — with a wide-but-short container (2:1 next to a compact
  Wavetable panel) sizing from width alone reproduces exactly the old
  "canvas forces the row tall" bug, just via a different path. The
  injected `#tonewheel-canvas` div (TonewheelComponent creates it fresh
  each render) is `position:absolute; inset:0`, not flexed — an empty
  flex child with flex-grow but no intrinsic content is a circular sizing
  dependency against a grid-stretched ancestor (the grid needs content
  height to size the row; the flex child needs the row already sized to
  know its own height), and Chromium resolves that circularity by
  quietly falling back to the child's WIDTH — recreating the very bug the
  square-fit fix above was meant to solve. Absolute positioning removes
  it from intrinsic-size contribution entirely. When a flex/grid row's
  height doesn't respond to editing the content you expect, suspect one
  of these two circularities first; temporarily setting
  `align-items:flex-start` via devtools can mislead here too — an
  already-created canvas doesn't retroactively shrink just because
  alignment changed after the fact, so re-load the page after any such
  experiment rather than trusting a live toggle.
- The Overtone System's description is an in-flow disclosure
  (`#system-description`, under the system menu) toggled by the "?"
  button (`#system-info-btn`, `SpectralSystemComponent.bindInfoButton`)
  — click, not hover (jweb/touch have no reliable hover), and in flow,
  not floating (a popover lands under fingers or off-screen).
  `setDescription` writes trusted, internally-authored HTML only
  (config.js description strings — never anything from the bridge or
  user input). Start harmonic and the current system's tunable params
  (stretch, stiffness, …) render as one inline row of Dials
  (`#system-dials-row`, `SpectralSystemComponent.renderDials`), each a
  plain `Dial` (caption above, readout below, like every dial).

## Performance recording (audio + MIDI)

- Navbar strip (`js/modules/recording/`): ● record, ⚙ settings (audio
  mono/stereo/multitrack = one mono channel per overtone; MIDI single
  channel/track vs a track + channel per overtone), take menu with
  steppers, ▶/❚❚, ⏮, wav/mid downloads — plus zip for multitrack takes:
  the stems as one mono float .wav per overtone, named by each voice's
  frequency at recording start, packed by the pure store-only writer
  `js/dsp/zipStore.js`. Stem exports (zip and the multichannel .wav) are
  normalized by ONE common gain when the take's global peak exceeds full
  scale — stems are pre-master, and a resonant filter bank runs 20-30 dB
  hot; unnormalized float overs play back clipped in DAWs (a clipped
  resonant sine masquerades as a raw square). The stems zip also carries
  the take's .mid. Take-length setting: manual, or "sync loop" — the bank
  restarts with every oscillator scheduled to phase 0 on one shared frame
  and the recorder's end frame is enforced on the audio thread, capturing
  exactly T = P/f0 seconds, P from choosePeriodMultiplier (custom-wave
  period correction folded in). Loops ≤ 2 s capture the SECOND
  realignment period (t0+T..t0+2T, past the master-chain transient);
  longer ones record the FIRST, from the restart itself — waiting out a
  long first period looked like a hang (irrational systems at high start
  harmonics reach minutes). No reachable T within 5 min → open-ended
  take from the phase-aligned restart. Exact for rational systems;
  snapped-P residue is the audible seam for irrational ones. Gates and
  sequencers keep running but their pattern periods are not folded into P. One .wav + one .mid per take, sharing a file
  stem. Browser-session only — not bridged to Max.
- Layers, bottom-up: pure codecs (`js/dsp/midiFile.js` SMF format-1
  writer + tempo-map math; `WAVExporter` with 32-bit float) → browser
  capture/playback with no app knowledge (`js/dsp/AudioRecorder.js` +
  unbundled `worklets/recorder-processor.js`; `js/dsp/RecordingPlayer.js`)
  → app logic (`midiCapture.js` pulse-bus sink, `midiDocument.js` pure
  log→document, `midiPlayback.js` look-ahead scheduler, `RecordingStore`,
  `recordingActions.js` owning `AppState.recorder`) → UI. Keep it that
  way: the DSP/codec files must stay portable to a native rewrite.
- Alignment contract: audio sample 0 == MIDI time 0 on the AudioContext
  clock. The worklet reports the exact frame it started; MIDI events are
  the gate worklets' cycle-boundary times (`pulseCycleBoundaryAudioTime`),
  so no wall-clock hop is involved. The master chain's two
  DynamicsCompressors add a fixed look-ahead delay (12 ms — measured at
  init by `AudioEngine.measureMasterLatency`, an offline impulse render)
  which the recorder trims from master-tapped takes; stems (`stemTap(i)`,
  a persistent per-index GainNode fed by each voice's `stemOut` before
  the panner) have none. Verified to ~0.01 ms.
- Tempo: the overtone set as MIDI clock defines the beat (one cycle = one
  quarter note, as the live clock does). Arming waits for that voice's
  next boundary so the take starts ON a beat; the tempo map comes from
  the measured beat times (`tempoMapFromBeats`, runs averaged so
  sub-sample stamping jitter can't accumulate), so clock-voice notes land
  exactly on the 960-PPQ grid. No clock voice → flat 120 BPM, absolute
  timing still correct. Export default is `tempoMode: 'fixed'` — only the
  initial tempo is written and notes are placed by absolute time under it,
  because DAWs flatten imported tempo maps in most paths (Ableton only
  builds tempo automation from an Arrangement-view import); `'map'`
  writes every change. The document always keeps the true map (playback
  clock follows it); the mode applies at download.
- `pulseMidi.js` is the single pulse→MIDI mapping (note, velocity,
  channel, clock voice); both the live Web MIDI router and the file
  capture use it so a .mid holds exactly what external gear received.
- Playback: master takes go straight to `destination` (already through
  the chain); multitrack takes are mixed down (`RecordingPlayer.mixdown`)
  and fed into the live compressor so they sound as recorded. MIDI is
  replayed through the output router with Web MIDI future timestamps
  (1.5 s look-ahead) — events already handed off still fire after pause.

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
- `midiConfig` (js/appConfig.js: channels, CC/note maps, note floor, input
  port `inputId`, clock/transport port `clockOutputId`) persists in
  localStorage, not through Max. Exception: the note-out port (`outputId`)
  is additionally bridged as `/twig/midiout`, and the bridge value wins at
  boot. MIDI roles are split: note
  blips → `outputId`+`outputChannel`; clock ticks and play-toggle transport
  start/stop → `clockOutputId` (defaults to note-out port; channel-less by
  MIDI spec); note/CC in → `inputId` (null = all inputs) + `inputChannel`.
- The app self-diagnoses a stale bridge process: `GET /state` carries an
  `x-twig-commands` header (the server's `STATE_ORDER`), and the client
  warns on boot when its commands are missing from it.
- Native `<select>` dropdowns don't open inside jweb — embed-facing controls
  need button/icon alternatives (see the sequence view's waveform strip).
