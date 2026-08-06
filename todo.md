
- waveform
    - menu: swipable carousel UI of waveform graphics
    - animation when user clicks "create oscillator" it should fly from the wavetable canvas into the oscillator canvas
    - record or load waveform (fft)


    - dynamic range of harmonic series (eg partials 12-24). only enable for certain scales
    - global record feature 
    - can web audio support multichannel output? what about in an electron app?

- subharmonic
  - need a better way to visualize subharmonics in tonewheel canvas. is there some way to "invert" it?



hosting/deployment.
    - the free limited version of twg.com could have a limited number of instances or "rooms". which are synced on the server.
    - like a live chatroom, everyone is sharing the same global state. users can pool their funds to buy new rooms. 
    - smart users can disable web sockets to use the app without getting highjacked. 
    - a limited number of simultaneous users can be in a room at a time.


Controls:
    - if you CMD+CLICK on dials and drawbars it sets the value for all inputs of that type. a subtle color change should indicate that they're locked together. maybe double tap on touch device or a lock icon appears when editing? 
    - add a filter UI to the value tip and overtone settings modal so we can see a output spectrum and a filter curve when editng filter parameters
    - the sequencer tab's viewtip should not disappear so long as any of the controls are "active" or "focused"


Add a `K` toggle. this enables keyboard control of the synth. 
- `1` through `=` set fundamental
- `Q` throgh `]` trigger an ADSR on each overtone voice. 
- need to decide if/how we want to also expose that ADSR to midi input because we currently use midi input for fundamental and block low midi notes to avoid loopback. we could instead reserve midi 1-12 for these ADSRs and trust the user to set different channels or MIDI ports to avoid loopback (Or let it happen!)
- global setting for "ADSR" mode or "Open" mode. Open by default. add a trigger button below each drawbar in ADSR mode. 


Presets:
- Add a console command to dump app state as json
- save json to a preset folder in repo
- add a build step that bundles these presets 
- add a preset menu to the top navbar 
- similarly add a "copy/pase all settings" button which saves state to local storage and lets you paste into a different instance of the app for easy multi-browser-tab jamming
-  presets can be recalled by midi program number
  
the tab view buttons should have a subtle indicator when they are in a "dirty" state


doublecheck the filter cutoff slider options. desired behavior is for the slider to move through 
frequency choices based on the currently selected overtone system where the fundamental is this particular overtone's frequency, not the main fundamental frequency of twig.

- sequencer (deferred caveats)
    - gate/sequence phase has a constant arbitrary offset from the oscillator's
      actual waveform phase (counter-based, not detected). Fine for tremolo/
      envelopes; if waveform-locked AM ever matters, re-anchor the worklet
      phase on detected rising zero-crossings (with hysteresis) — ~30 lines
      in gate-processor.
    - later: multiple sequencers per overtone / decouple sequencers from
      overtones so any pulse source can drive any parameter (virtual patch-bay)
