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
  shell. Changes dispatch `LAYOUT_MODE_CHANGED`.
- Readouts are inline, never floating: `Dial` renders its own caption
  above the arc and value below it (`.mini-dial-label` / `.mini-dial-value`,
  css/components/dial.css — hosts must NOT add their own captions), and
  every drawbar has a `.drawbar-value` under the bar kept current by
  `syncFill`. `Dial` calls `onChange` BEFORE `draw()` so a `format` that
  reads host state renders the new value. Nothing floats: there is no
  ValueTip. Gotcha: layout.css's `.labeled-control span` restyles every
  span in a panel as a flex heading (`display:flex`); widget text and
  hideable spans inside panels must out-specify it (dial.css uses
  `.mini-dial > …`, the strip's family tabs are hidden with an id-scoped
  rule).
- Embed mode: `body.embed` when the viewport is ≤ `--embed-max-height`
  tall or `?embed=1`; `css/embed.css` (must stay the **last** import in
  styles.css, followed by each component's own `*.embed.css`) reflows the
  app into one ~150px horizontal band that scrolls sideways if it doesn't
  fit — a jweb viewport is often plenty WIDE even though short, so
  desktop's own width-based breakpoints still fire there and need explicit
  embed overrides. Sections become flex children of `body.embed` via
  `.embed-flatten` (`display:contents` on every wrapper) with `order:` per
  panel: navbar, the m4l stack (fundamental/source/system as one narrow
  column, layout.embed.css), the drawbar strip, the waveform and spectrum
  panels, the tonewheel. Hidden there: the toolbar, the pad grid, the
  scope and envelope panels, the settings panel (an overlay instead,
  `body.settings-open`), the inspector's surface root (the sheet is a
  full-band overlay). The band has no toolbar, so the strip's FAMILY tabs
  (gain/filter/convolution/adsr) show only there. There are no modals in
  the app.
- Surfaces shell (`body.surfaces`, i.e. everything but embed):
  `js/modules/surfaces/` — `surfaceState.js` is the UI-only registry
  (`SURFACES`, in toolbar order: source, gain, trigger, adsr, filter,
  convolution, sequence, settings — each a list of panel-root element
  ids; `label` is what fits the rail ("Conv"), optional `title` the full
  name for the tooltip;
  `family` names the drawbar strip's parameter family for the four
  parameter surfaces; `dock: false` keeps the tonewheel off settings;
  `DOCK_ROOTS` = the tonewheel; visible set + dock flag, emits
  `SURFACE_CHANGED`), `ToolbarComponent` is the left icon rail,
  `SurfaceShellComponent` applies state to the DOM: sets `hidden` on every
  panel root the active surface doesn't include (base.css has
  `[hidden]{display:none!important}`), collapses the wrappers whose
  children are all hidden (`#m4l-fundamental-source-panel`,
  `.surface-stack`, `.surface-side`), exposes `body[data-surface="…"]` +
  `body.viz-dock` (`surfaceState.dockShown` = toggle AND the surface
  admits it), then dispatches a synthetic window `resize` so canvases
  re-measure. `SurfacesController` mounts LAST in `initUI()` so every
  panel has sized itself while visible. The dock defaults ON for fine
  pointers and OFF for `body.coarse` — resolved lazily (`dockDefault()`),
  NOT at module import, because `layoutMode.init()` runs later than
  imports. p5 gotcha: the tonewheel sketch's `windowResized` can run
  before `setup()`, so it early-returns until `canvasReady`.
- Page markup (`index.html`): `.control-card` holds exactly two children
  — the `.surface-stack` (every main panel, a flex column; the LAST
  visible one carries `flex:1`) and the `.surface-side` (each parameter
  surface's visualization panel — `#gain-viz-root` waveform + Create
  Oscillator/Download, `#filter-viz-root` output scope, `#conv-viz-root`
  spectrum + Create IR/ring, `#adsr-viz-root` envelope curves — plus
  `#tonewheel-container`, the Viz dock). page-arrangement.css: when the
  side wrapper is not hidden the card is a two-column grid (`:has()`),
  stack | `--dock-width`; in portrait a band on top sized to its content
  (`auto` row, 64px canvases) over the stack. Sizing a panel for a shell
  position belongs in page-arrangement.css, not the component's CSS. On
  the surfaces shell `.page-shell` is height-capped to the viewport, so a
  panel taller than the screen (Settings, Sequence, the strip on a phone
  in landscape) scrolls INSIDE itself — a surface is a screen, never a
  scrolling page. Panel DOM never moves between shells; `this.q()` in
  components scopes lookups to their own root element, so only ever move
  a *root* div.
- The drawbar strip (`js/modules/drawbars/`) is ONE panel
  (`#drawbars-control-root`) shared by the Gain, Filter, Convolution and
  ADSR surfaces. `drawbarParams.js` is the pure parameter table:
  `FAMILIES[name].params` — each `{ key, label, min, max, step, color?,
  get(i), set(i, v), format(i, v) }` writing through the actions layer
  (`set` writes the STORED parameter, never a derived output, so linked and
  shaped writes copy positions across voices); families also carry
  `reset`/`randomize` (the overtone toolbar's buttons) and, for convolution,
  the per-column IR stepper + `enabled(i)` (no IR = bypassed column).
  `DrawbarsComponent` shows `params[paramIndex]` on the bars and the rest
  as dials under each bar (`.drawbar-aux-dials`) — unless `compact`
  (`DrawbarsController.syncCompact`, a ResizeObserver: panel height <
  `COMPACT_STRIP_HEIGHT` 420px), when only the bars show and the header's
  parameter tabs (`#drawbars-tabs`, `renderHeader`) put the chosen
  parameter on the bars instead. The controller sets the family from
  `SURFACE_CHANGED` (`SURFACES[].family`) or, in embed, from the family
  tabs; `refreshColumn(index)` re-reads every control of one column on
  `DRAWBAR_CHANGE` / `OVERTONE_SIGNAL_CHANGED` regardless of kind. Adding
  a per-overtone parameter to a surface = one descriptor in a family.
- Strip gestures: ONE pointer handler on `#drawbars` owns every bar
  gesture (`pointerdown` on a `.drawbar-input-wrapper` snapshots all
  column rects, then each move applies to the column under the pointer —
  `columnAt` / `applyPointerToColumn` — so a finger swiped across the row
  DRAWS the parameter; a touch press-and-hold instead opens the overtone
  menu, restoring the row it would have drawn). `.drawbar-input-wrapper`
  and `.drawbar-slider` are `touch-action: none`; the column's label/aux
  areas keep `pan-x`. The column label opens the inspector
  (`onInspect(index)`, wired by ui.js — the strip never imports the
  inspector). Under 40rem the columns are `flex: 1 1 0` with a 20px floor
  (12 voices fit a phone beside the toolbar; more scroll).
- Overtone toolbar (`js/modules/overtoneToolbar/`, overtone-toolbar.css):
  the fixed bar at the bottom of every per-overtone panel — the drawbar
  strip (`#drawbars-toolbar`) and the Sequence panel (`#sequence-toolbar`)
  — `[Reset][Randomize] [slot] [dock] [link][shape]`, buttons addressed as
  `[data-action="reset|randomize|link|shape"]`. The host passes what
  Reset/Randomize mean (ui.js: the strip's family; every voice's gate for
  Sequence) and may mount content in `slotEl` (the Sequence panel's voice
  stepper). NOTHING in the bar may move when the shape panel appears:
  wide, the dock is a permanent `flex:1` cell and the groups' min-height
  ≥ the panel's height; narrow (`@container` on the bar's own width — a
  side sheet narrows it too), the dock is a row ABOVE the buttons that is
  0px until used, so it takes height from the scrolling area while the
  bottom-anchored buttons stay put; at phone widths the slot gets its own
  row and link/shape go icon-only. In embed the dock reserves the panel's
  width (the strip is `min-width: max-content` there; an appearing panel
  would widen it). **Link** = `linkLock` in `linkAll.js` (`isLinkAll(e)` =
  lock || cmd/ctrl). **Shape** = `js/modules/shape/shapeMode.js`
  (`isGesture(e)` = lock || shift; contour, cycles and the last gesture,
  re-applied when the panel changes either; `SHAPE_MODE_CHANGED`): an edit
  sculpts that parameter across EVERY voice along a contour, anchored on
  the edited voice (`applyRow` on 0-1 positions / `applyParam` on a
  range; pure math in `rowShape.js`). The two are mutually exclusive
  (the toolbar controller clears the other), each button also lights
  while its key is held — and holding shift shows the shape panel, so
  desktop can reach its controls without the lock — and leaving the `tools: true` surfaces drops
  both (ui.js). `ShapePanel.js` is a pure view over shapeMode (contour
  preview, contour stepper, ÷2/×2); `generic/cycleStepper.js` is the
  ‹ › stepper it and the IR picker share. The strip shapes bars and
  dials (`shapeParamRow`, snapped to the parameter's step); the inspector
  shapes its ranged controls (`applyValue`). Gate contours are unipolar
  0-1 and share one definition, mirrored in `shapeContour()`
  (sequencePreview.js) and `shapeValue()` (gate-processor.js).
- Sequence surface = the inspector (`js/modules/inspector/`): one voice's
  sequence gate + shape, modulation depths and pulse outs. Gate fields
  are `Dial`s with per-mode ranges and defaults (`GATE_PARAM_DIALS`:
  alternating 1–32 on / 0–32 off, euclidean 0–32 pulses / 1–32 steps,
  probability 0–100%); entering a mode loads its defaults, because x/y
  mean different things per mode, and `Dial`'s `resetValue` makes
  double-click return there. Mode 4 keeps the 0/1 pattern text field.
  `inspectorState` (UI-only: selected index + sheet open,
  `INSPECTOR_CHANGED`) is the model; while link or shape is in effect
  (lock or held key) the title reads "All voices" (`setScope`, updated IN
  PLACE on `LINK_ALL_CHANGED` / `SHAPE_MODE_CHANGED` — shift can go down
  mid-drag, and a re-render would destroy the control; the title has a
  fixed width in the bar so the ‹ › buttons don't move); `InspectorController` homes the ONE
  component instance in the surface (`#sequence-inspector`, scrolling
  above the panel's overtone toolbar, with the ‹ Overtone N › header
  mounted in the toolbar's slot — `headerSlot`) or in the sheet
  (`#inspector-sheet`, beside any other surface while open, header on
  top with expand/close — in-flow side column in landscape with a sticky
  header, overlay bottom sheet in portrait, full-band overlay in embed;
  inspector.css, `--sheet-width` / `--sheet-height`). It re-renders on
  `OVERTONE_SIGNAL_CHANGED` for the selected index EXCEPT its own writes
  (`apply()` / `applyValue()` set `component.writing`; re-rendering under
  a control mid-drag would destroy it). Opened from a drawbar column
  label, the overtone menu (right-click / press-and-hold on bars and
  pads, `js/modules/generic/overtoneMenu.js`), or the toolbar; Escape
  closes the sheet.
- Trigger surface (`js/modules/pads/`): `#pad-grid-root` = a title over
  `#pad-grid`, the `PadGridComponent` root — one big pad per overtone,
  always 4 columns (3 in portrait) × rows that share the panel's height.
  Pads gate the voice envelopes through `triggerHarmonicAttack/Release`
  (the same path as the Q–] keys and the strip's small trigger pads), so
  they are silent in Drone mode (grid dimmed) or while stopped; no
  velocity by design. Each pad captures its own pointer (multi-touch =
  chords), `teardown()` releases every held pad (the controller
  re-renders on system/fundamental/envelope changes), and a per-frame
  `--pad-level` glow from `getVoiceLevel` lights whatever sounds.
  `TRIGGER_KEY_LABELS` (KeyboardShortcuts.js) supplies the key hints.
- Trigger/Drone (`js/modules/envelopeMode/`): `AppState.envelopeMode`
  'adsr' (Trigger: voices rest silent and are gated per overtone) | 'open'
  (Drone: every voice sounds). `EnvelopeModeToggleComponent` renders a
  label naming the current state + `.toggle-switch` into an
  `.envelope-mode-root`; it lives in the navbar beside Play
  (`#navbar-mode-root`, a global like Play — ui.js mounts it and keeps
  `body.adsr-mode` in sync; the strip's trigger pads show under it).
  Toggle switches app-wide use the muted `--toggle-*` tokens (theme.css),
  not the red/green accents.
- Source surface: `#m4l-fundamental-source-panel` = fundamental (Hz,
  octave, one-octave keyboard), signal source (mode, waveform picker,
  oscillator preview), overtone system. It is a GRID sized by container
  queries on the stack's own width (`.surface-stack` is `container:
  surface-stack / inline-size`, page-arrangement.css) — the viewport lies
  once the toolbar, dock or sheet take their share: one column under
  40rem (phones), fundamental | source over a full-width system panel
  from 40rem, three across from 72rem and on short screens (`max-height:
  30rem`, a phone in landscape). Everything in it flexes rather than
  being fixed: the keyboard's keys share its width and its height floats
  between a floor and a cap (keyboard.css; `body.coarse` raises the
  floor), and the preview's AREA owns the height
  (`#current-waveform-canvas-area`: `flex:1`, a `vh`-scaled floor) with
  the canvas absolutely filling it — `WaveformComponent.boxSize()` sizes
  the bitmap from that box (width AND height changes, ResizeObserver) and
  has no dependency on the tonewheel's p5 instance. Where the system panel
  is full-width its dials sit beside the menu (form-controls.css). The
  Overtone System's description is an in-flow disclosure
  (`#system-description`) toggled by the "?" button — click, not hover
  (jweb/touch have no reliable hover), in flow, not floating;
  `setDescription` writes trusted config.js HTML only. Start harmonic and
  the system's tunable params render as one inline row of Dials
  (`#system-dials-row`). Under them, `#system-frequencies`: every
  overtone's frequency as ONE sideways-scrolling row (never wrapping, so
  the panel's height doesn't depend on the voice count), each entry
  tinted `partialColor`; `renderFrequencies` rebuilds items only when the
  voice count changes, and `FUNDAMENTAL_CHANGED` calls it alone (a sweep
  must not rebuild the menu). Entries go one-line where height is scarce;
  hidden in embed. `formatFrequency` / `formatHz` (utils.js) are the one
  voice-frequency formatter (pads, this list).
- Visualizations (side column): waveform (`WaveformController`, p5,
  `#waveform-canvas-area`; the Source panel has a second, `mode: 'single'`
  instance for the chosen oscillator), spectrum (`SpectrumComponent`,
  `HEIGHT = 96` written as an inline `!important` style — keep it equal to
  `.viz-canvas canvas`'s CSS height), the output oscilloscope
  (`js/modules/scope/`: reads `getOutputAnalyser()` — the engine's
  post-limiter AnalyserNode — in a rAF loop that runs only while playing
  and the panel is laid out, triggered on a rising zero-crossing), and
  the envelope curves (`js/modules/envelopeViz/`: every voice's ADSR
  polyline over a shared time axis, `partialColor` per voice, pure
  `envelopeCurvePoints` helper). The bake/export action rows
  (`#wavetable-actions`, `#ir-actions`) hide in external source modes
  (downloadControlController). Canvas gotchas: the global `canvas {
  width:100% !important … }` rule hijacks new canvases (escape with
  `style.setProperty(…, 'important')`); `#tonewheel-canvas` is
  `position:absolute; inset:0` because an empty flex child with flex-grow
  inside a grid-stretched ancestor is a circular sizing dependency that
  Chromium resolves by falling back to its WIDTH; the tonewheel sketch
  sizes its square from `Math.min(clientWidth, clientHeight)`.
- Settings surface (`js/modules/settings/`, `#settings-control-root`):
  MIDI | Recording tabs (`selectTab`) over `MidiSettingsComponent`
  (ports/channels per MIDI role, pulse toggles, mapping tables;
  re-rendered on `MIDI_OUTPUT_CHANGED` since ports arrive late) and
  `RecorderSettingsComponent` (wav/mid layout, take length, tempo mode;
  `syncChecked` on `RECORDER_CHANGED`). The toolbar button and the
  recorder's ⚙ (`SettingsController.open(tab)`) get there; in embed the
  same root becomes a full-band overlay with its own × / Escape.
- Navbar: Play/Stop, Trigger/Drone, the recorder strip, Gain/Slew. Above 64rem it is the fixed one-row bar with
  `.app-container` padded to `--navbar-height` (base.css). Below 64rem on
  the surfaces shell (phones both ways, portrait tablets) it becomes a
  STATIC, WRAPPING block at the top of a full-height flex column
  (`body.surfaces.app-container`, page-arrangement.css): Play·Trigger/
  Drone·(collapsed recorder) / recorder / Gain·Slew — the recorder collapses to ● + an
  expand button (`RecorderComponent.expanded`, `.rec-expanded`) and joins
  row 1 while collapsed. A wrapping navbar has no known height, which is
  why the fixed-navbar + padding scheme can't be used there; the logo is
  dropped; the Gain/Slew range inputs must be allowed to shrink
  (`min-width:0`). On short viewports (`max-height: 30rem`) the toolbar
  rail goes icons-only and scrolls.
- `--drawbar-track-length`: the strip's sliders grow to the column's
  measured height — a rotated `<input type=range>`'s PRE-rotation `width`
  becomes its visual length, and CSS can't derive one axis from the other
  on a rotated element — published by `DrawbarsComponent.syncTrackLengths()`
  from each `.drawbar-input-wrapper` via a ResizeObserver (the available
  height depends on sibling rows, which fire no resize event). Keep a real
  `min-height` floor on the wrapper (not 0) so a squeeze can't collapse
  the sliders, and `flex-shrink:0` on `.drawbar-slider` (its 26px-wide
  wrapper plus a range input's own `min-width:auto` would otherwise clamp
  the length to the intrinsic ~129px). Either failure looks the same:
  the focus ring covering less than the drawn groove.

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
