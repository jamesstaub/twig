import { AppState } from "../../config.js";
import {
    DRAWBAR_CHANGE, DRAWBARS_RANDOMIZED, DRAWBARS_RESET, FUNDAMENTAL_CHANGED,
    IR_RING_CHANGED, SPECTRAL_SYSTEM_CHANGED, SUBHARMONIC_TOGGLED,
} from "../../events.js";
import { BaseController } from "../base/BaseController.js";
import { CURRENT_WAVEFORM_CHANGED } from "../waveform/waveformActions.js";
import SpectrumComponent from "./SpectrumComponent.js";

export class SpectrumController extends BaseController {

    createComponent(selector) {
        return new SpectrumComponent(selector);
    }

    getProps() {
        const primitive = AppState.currentWaveform;
        const coeffs = AppState.customWaveCoefficients?.[primitive];
        return {
            ratios: AppState.currentSystem.ratios,
            amplitudes: AppState.harmonicAmplitudes,
            isSubharmonic: AppState.isSubharmonic,
            f0: AppState.fundamentalFrequency,
            primitive,
            custom: coeffs
                ? { real: coeffs.real, imag: coeffs.imag, period: AppState.customWavePeriodMultipliers?.[primitive] || 1 }
                : null,
            ringSeconds: AppState.irRingSeconds,
        };
    }

    bindExternalEvents() {
        // Coalesced: drawbar streams arrive in floods
        for (const evt of [DRAWBAR_CHANGE, DRAWBARS_RESET, DRAWBARS_RANDOMIZED, SPECTRAL_SYSTEM_CHANGED,
            SUBHARMONIC_TOGGLED, CURRENT_WAVEFORM_CHANGED, FUNDAMENTAL_CHANGED, IR_RING_CHANGED]) {
            document.addEventListener(evt, () => this.scheduleUpdate());
        }
        // Re-render at the container's real width whenever the panel
        // reflows (window resize, source-mode gating, embed) — the first
        // render can land before layout settles
        if (typeof ResizeObserver !== "undefined") {
            new ResizeObserver(() => this.scheduleUpdate()).observe(this.component.el);
        } else {
            window.addEventListener("resize", () => this.scheduleUpdate());
        }
    }
}
