
- tonewheel
    - the animation is not "realistic" all frequencies should be rotating together
    as if they are on a fixed wheel

- waveform
    - menu: swipable carousel UI of waveform graphics
    - animation when user saves a wave (blink the container, transport it ?)
    - record or load waveform (fft)

- midi: 
    - midi config dialog: set channel received
    - map CC number per slider
    - scale mode: note in plays ADSR of individual partials (CC to set fundamental)
    - timbre mode: note in plays full timbre monophonic (cc to set drawbars)
    - save presets recalled by midi program number. app state in in localstorage

- synthy features
    - portamenteau
    - overdrive, filter, convolution chain
    - dynamic range of harmonic series (eg partials 12-24). only enable for certain scales

    - global record features
    - multichannel output

- subharmonic
- make sure it updates the waveform and viz

- sequencer (deferred caveats)
    - gate/sequence phase has a constant arbitrary offset from the oscillator's
      actual waveform phase (counter-based, not detected). Fine for tremolo/
      envelopes; if waveform-locked AM ever matters, re-anchor the worklet
      phase on detected rising zero-crossings (with hysteresis) — ~30 lines
      in gate-processor.
    - later: multiple sequencers per overtone / decouple sequencers from
      overtones so any pulse source can drive any parameter (virtual patch-bay)