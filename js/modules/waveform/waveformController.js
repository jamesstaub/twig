import { AppState } from "../../config.js";
import { DRAWBAR_CHANGE, DRAWBARS_RANDOMIZED, DRAWBARS_RESET, SPECTRAL_SYSTEM_CHANGED, SUBHARMONIC_TOGGLED } from "../../events.js";
import { BaseController } from "../base/BaseController.js";
import { CURRENT_WAVEFORM_CHANGED } from "./waveformActions.js";
import WaveformComponent from "./WaveformComponent.js";


export class WaveformController extends BaseController {
    constructor(selector, options = {}) {
        super(selector);
        this.mode = options.mode || "sum"; // "sum" or "single"
    }

    createComponent(selector) {
        return new WaveformComponent(selector);
    }

    getProps() {
        const { p5Instance, harmonicAmplitudes, currentSystem, currentWaveform, customWaveCoefficients, isSubharmonic } = AppState;
        return {
            p5Instance,
            harmonicAmplitudes,
            currentSystem,
            currentWaveform,
            customWaveCoefficients,
            isSubharmonic,
            mode: this.mode,
        };
    }

    bindExternalEvents() {
        // scheduleUpdate coalesces to one canvas redraw per frame — these
        // events arrive in floods during OSC/MIDI drawbar streams, and a
        // synchronous p5 redraw per event saturates the main thread
        document.addEventListener(DRAWBARS_RESET, () => this.scheduleUpdate());
        document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => this.scheduleUpdate());
        document.addEventListener(SUBHARMONIC_TOGGLED, () => this.scheduleUpdate());
        document.addEventListener(DRAWBAR_CHANGE, () => this.scheduleUpdate());
        document.addEventListener(DRAWBARS_RANDOMIZED, () => this.scheduleUpdate());
        document.addEventListener(CURRENT_WAVEFORM_CHANGED, () => this.scheduleUpdate());
    }
}