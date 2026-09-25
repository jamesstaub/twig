# Tutorial

Twig is an instrument designed for exploring harmonic relationships. The intervalic ratios can be expressed as harmony, rhythm and timbre.

## Theory of Operation

Given a fundamental frequency, an overtone system, and a waveform; a series of harmonics is generated. Designed to emulate the drawbars of an organ, these harmonics can be mixed at different levels to create new synthesized timbre.

Twig's audio engine has up to twelve harmonic voices starting from the fundamental. Each voice consists of an oscillator, a resonant filter, overdrive and a convolution module. These components create a series of rich, versitile synthesizer voices that are tuned to a particular harmonic system.

### Oscillator Waveforms
The design principle of Twig is a 


### Other Sound Source

**Sampler**

**Pink/White Noise**

**ADC Input**

### Overtone System

### Filters

### LFO 

### Convolution


## Recording

## MIDI Capabilities

### Control Twig with MIDI CC and Note In

### Send MIDI Clock Signal
Twig can send out one MIDI clock signal from a voice of your choosing, so long as it's frequency is less than 50hz. This will allow you to tempo sync external gear or a DAW to the pulse rate of a low-frequency voice in Twig. 

### Send MIDI Note Out 
When an overtone voice is below 50hz it will by default send a MIDI noteout pulse at the rate of the voice's frequency. The MIDI Note number can be configured in the settings menu. The Gain level of the voice will determine the velocity. You can use the sequencer on a given voice to modulate the gain as well. 


