
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
    - cmd/ctrl link-all implemented (drawbars + dials + modal controls, body.link-all glow). still open: a touch-device equivalent — double tap or a lock icon while editing?
    - add a filter UI to the value tip and overtone settings modal so we can see a output spectrum and a filter curve when editng filter parameters
  - valuetip over drawbar  shift+click linked edit: obstructs the mouse in Max4Live mode. it must avoid the active slider on the X axis



keyboard / ADSR (implemented: `1`-`=` set fundamental, `Q`-`]` gate per-overtone
ADSRs with keydown/keyup sustain, navbar Open/ADSR toggle, ADSR dials in the
overtone settings modal, trigger pads under drawbars in ADSR mode, bridged as
/twig/adsr/<n> and /twig/envmode)
- need to decide if/how we want to also expose the per-overtone ADSRs to midi input because we currently use midi input for fundamental and block low midi notes to avoid loopback. we could instead reserve midi 1-12 for these ADSRs and trust the user to set different channels or MIDI ports to avoid loopback (Or let it happen!)


Presets:
- Add a console command to dump app state as json
- save json to a preset folder in repo
- add a build step that bundles these presets 
- add a preset menu to the top navbar 
- similarly add a "copy/pase all settings" button which saves state to local storage and lets you paste into a different instance of the app for easy multi-browser-tab jamming
-  presets can be recalled by midi program number
  
the tab view buttons should have a subtle indicator when they are in a "dirty" state



Slider UI:
  - in several places we have sliders that traverse the given overtone series (filter cutoff, convolution tuning). we need a consistent UI input element 
- 

- sequencer (deferred caveats)
    - gate/sequence phase has a constant arbitrary offset from the oscillator's
      actual waveform phase (counter-based, not detected). Fine for tremolo/
      envelopes; if waveform-locked AM ever matters, re-anchor the worklet
      phase on detected rising zero-crossings (with hysteresis) — ~30 lines
      in gate-processor.
    - later: multiple sequencers per overtone / decouple sequencers from
      overtones so any pulse source can drive any parameter (virtual patch-bay)


hover over the ADSR buttons to show the key mapping that controls it

when you use the qwerty keys to trigger ADSR the trigger buttons should light up as if they were clicked.




add "copy milisecond value" to the right click context menu of overtones



