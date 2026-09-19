---
name: add-bridged-param
description: Checklist for adding a new synth parameter to twig so it is controllable from the UI, applied to live audio, synced over the OSC/WebSocket bridge, and persisted across page reloads and in Max4Live. Use whenever adding or extending per-overtone or global state (e.g. ADSR, presets, new filter/sequencer params).
---

# Adding a bridged synth parameter

Every user-facing parameter in twig flows through the same five layers.
Miss one and the param will work in the UI but silently fail to persist or
sync. The per-overtone `drive` param (git log) is a complete worked example
touching every file below.

## 1. State — `js/config.js`

Add the field to `AppState`. Per-overtone params are sparse objects keyed by
voice index (`oscillatorDrives: {}`), so unset voices fall back to a default
in the getter, not in the store. Document the range in the comment.

## 2. Audio — `js/dsp/engine/` + `js/audio.js`

- Engine: the param belongs to a stage in `js/dsp/engine/stages/` — add a
  setter to the existing stage, or a new `Stage` subclass (`own()` every
  node so `dispose()` unhooks it; build it in a passthrough "off" state —
  null WaveShaper curve, open filter… — so it can be enabled mid-playback
  without rewiring) placed in `Voice.js`'s `chain(…)`. Then add ONE entry
  to `Voice.js`'s `APPLY` table mapping the param name to that setter (and
  to the `VoiceParams` typedef). Creation and live updates both go through
  `voice.set()`, so there is nothing else to write in the engine.
- `js/audio.js`: pass the AppState value in `createHarmonicVoice`'s spec,
  and add `updateHarmonicX(index)`:
  `audioEngine.voice(index)?.set({ x: … }, AppState.masterSlewValue)` — a
  stopped synth has no voices, so no playing guard is needed.

## 3. Actions — `js/modules/overtoneSignal/overtoneSignalActions.js` (or the relevant actions module)

- `getX(index)` with the default; `setX(index, v)` that clamps, writes
  AppState, calls `updateHarmonicX(index)`, then `this._changed(index, 'x')`.
- Export shared range constants here (like `Q_MAX`, `DRIVE_MAX`) — one
  number used by every dial and the OSC clamp.
- Consider the bulk ops: should view-scoped Reset/Randomize
  (`resetFilters` etc.) include it?

## 4. OSC bridge — `js/modules/osc/oscClient.js` AND `server.js`

Client:
- add the command name to `COMMANDS`
- add an inbound `case` in `apply()` (use `perVoiceArgs` + `forVoices` for
  per-voice commands; clamp with the shared constant; route through the
  actions layer so all UI surfaces sync)
- add the upstream branch in the `OVERTONE_SIGNAL_CHANGED` handler (or bind
  the relevant event) emitting `command/<n> [value]`
- document the address in the header comment block

Server (`server.js`) — all three lists:
- `STATE_ORDER` (replay position matters: e.g. filter before drive)
- `PER_INDEX_COMMANDS` if per-voice
- `APP_COMMANDS` (Max message handler)

**The running bridge process must be restarted afterward** — the lists live
in the process, and a stale server silently drops the new command from its
state cache (param then fails to persist across page reloads).

## 5. UI

- A per-overtone parameter of an existing family (gain, filter,
  convolution, adsr): ONE descriptor in `js/modules/drawbars/drawbarParams.js`
  (`{ key, label, min, max, step, color?, get(i), set(i, v), format(i, v) }`,
  `set` writing the stored parameter through the actions). The strip then
  shows it as a dial under the bars, as a tab when compact, on the bars
  when chosen, shaped/linked/reset for free; `refreshColumn` re-reads it
  on `OVERTONE_SIGNAL_CHANGED` (any `kind`). A new family = a new entry
  in `FAMILIES` + `FAMILY_ORDER` + a surface in `surfaceState.js` with
  `family:` and a viz panel root.
- Sequence/modulation/pulse parameters instead belong in the inspector
  (`js/modules/inspector/InspectorComponent.js`): write through
  `this.apply(index, e, (i) => …)` so the controller can tell the
  inspector's own writes from external ones.

## Verify

Run the headless-verify skill's roundtrip test: inbound message → state;
UI gesture → upstream message + server cache; page reload → value restored
from `GET /state`; live audio node updated mid-playback. Tell the user to
add the new message name to their Max patch's `[route …]` if they want it
in Live presets.
