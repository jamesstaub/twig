import { BaseController } from '../base/BaseController.js';
import { PadGridComponent } from './PadGridComponent.js';
import { AppState } from '../../config.js';
import { calculateFrequency, formatHz } from '../../utils.js';
import { getVoiceLevel, triggerHarmonicAttack, triggerHarmonicRelease } from '../../audio.js';
import { OvertoneSignalActions } from '../overtoneSignal/overtoneSignalActions.js';
import { TRIGGER_KEY_LABELS } from '../../KeyboardShortcuts.js';
import { SourceActions } from '../source/sourceActions.js';
import {
    ENVELOPE_MODE_CHANGED,
    FUNDAMENTAL_CHANGED,
    SOURCE_CHANGED,
    SPECTRAL_SYSTEM_CHANGED,
    SUBHARMONIC_TOGGLED,
} from '../../events.js';

const LOOP_TOGGLE_ID = 'pad-loop-toggle';

/**
 * Trigger surface pads: one per overtone of the current system, gating the
 * voice envelopes (audio.js triggerHarmonicAttack/Release — no-ops
 * outside ADSR mode or while stopped, same as the keyboard's Q–] keys).
 */
export class PadGridController extends BaseController {

    createComponent(selector) {
        return new PadGridComponent(selector);
    }

    getProps() {
        const sys = AppState.currentSystem;
        const labels = (AppState.isSubharmonic && sys.subharmonicLabels) ? sys.subharmonicLabels : sys.labels;
        const voices = sys.ratios.map((ratio, i) => ({
            label: labels[i] || `#${i + 1}`,
            hz: formatHz(calculateFrequency(ratio)),
        }));
        return {
            voices,
            envelopeMode: OvertoneSignalActions.getEnvelopeMode(),
            keyHints: TRIGGER_KEY_LABELS,
            levelOf: getVoiceLevel,
        };
    }

    update() {
        // The component colors pads by ratio; hand it the table before render
        this.component._ratios = AppState.currentSystem.ratios;
        return super.update();
    }

    bindComponentEvents() {
        this.component.onAttack = (index) => triggerHarmonicAttack(index);
        this.component.onRelease = (index) => triggerHarmonicRelease(index);
    }

    /**
     * "Loop Samples": loop the sound file, or play it once per trigger.
     * Disabled outside sound-file mode (the app's rule — inapplicable
     * controls stay, grayed); the state is synth state (bridged, preset).
     */
    bindLoopToggle() {
        const btn = document.getElementById(LOOP_TOGGLE_ID);
        if (!btn) return;
        const sync = () => {
            btn.setAttribute('aria-pressed', String(AppState.soundfileLoop));
            btn.disabled = AppState.sourceMode !== 'soundfile';
        };
        btn.addEventListener('click', () => SourceActions.setSoundfileLoop(!AppState.soundfileLoop));
        document.addEventListener(SOURCE_CHANGED, sync);
        sync();
    }

    bindExternalEvents() {
        this.bindLoopToggle();

        // Coalesced: a fundamental sweep floods FUNDAMENTAL_CHANGED, and each
        // re-render releases held pads (teardown) — one per frame at most
        document.addEventListener(SPECTRAL_SYSTEM_CHANGED, () => this.scheduleUpdate());
        document.addEventListener(SUBHARMONIC_TOGGLED, () => this.scheduleUpdate());
        document.addEventListener(FUNDAMENTAL_CHANGED, () => this.scheduleUpdate());
        document.addEventListener(ENVELOPE_MODE_CHANGED, () => this.scheduleUpdate());
    }
}
