import { AppState } from '../../config.js';
import { INSPECTOR_CHANGED, OVERTONE_SIGNAL_CHANGED, PLAY_STATE_CHANGED, SPECTRAL_SYSTEM_CHANGED } from '../../events.js';
import { BaseController } from '../base/BaseController.js';
import { harmonicCyclePosition } from '../../audio.js';
import { inspectorState } from '../inspector/inspectorState.js';
import { OvertoneSignalActions } from '../overtoneSignal/overtoneSignalActions.js';
import { previewCycleCount } from '../overtoneSignal/sequencePreview.js';
import SequenceVizComponent from './SequenceVizComponent.js';

/**
 * SequenceVizController — the Sequence panel's side visualization: the
 * selected voice's sequence, redrawn whenever that voice's gate or
 * sequencer changes (from the editor, a linked write, or the bridge), the
 * selection moves, or the panel resizes; its playhead runs while playing.
 * UI-only: it never mutates state.
 */
export class SequenceVizController extends BaseController {

    createComponent(selector) {
        return new SequenceVizComponent(selector);
    }

    getProps() {
        const index = inspectorState.index;
        const gate = OvertoneSignalActions.getGate(index);
        const seq = OvertoneSignalActions.getSequencer(index);
        return {
            index,
            // The playhead folds the clock into exactly the cycles drawn
            cycles: previewCycleCount(gate, seq.stretch),
            playing: AppState.isPlaying,
            positionOf: () => harmonicCyclePosition(index),
        };
    }

    /** The panel's label names the voice: "Sequence 3". */
    update() {
        const label = document.querySelector('#sequence-viz-root > label');
        if (label) label.textContent = `Sequence ${inspectorState.index + 1}`;
        return super.update();
    }

    bindExternalEvents() {
        document.addEventListener(OVERTONE_SIGNAL_CHANGED, (e) => {
            const { index, kind } = e.detail || {};
            if (index === inspectorState.index && (kind === 'gate' || kind === 'seq')) this.scheduleUpdate();
        });
        for (const evt of [INSPECTOR_CHANGED, SPECTRAL_SYSTEM_CHANGED, PLAY_STATE_CHANGED]) {
            document.addEventListener(evt, () => this.scheduleUpdate());
        }
        // Re-render at the container's real width whenever the panel
        // reflows (window resize, surface switch) — the first render can
        // land before layout settles.
        this._resizeObserver = new ResizeObserver(() => this.scheduleUpdate());
        this._resizeObserver.observe(this.component.el);
    }

    destroy() {
        this._resizeObserver?.disconnect();
        super.destroy();
    }
}
