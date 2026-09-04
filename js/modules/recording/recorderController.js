import { BaseController } from '../base/BaseController.js';
import { AppState } from '../../config.js';
import { RECORDER_CHANGED, RECORDINGS_CHANGED } from '../../events.js';
import { openModal, closeModal } from '../generic/modal/modalActions.js';
import { RecorderComponent } from './RecorderComponent.js';
import { RecorderConfigModalComponent } from './RecorderConfigModalComponent.js';
import { RecordingActions } from './recordingActions.js';
import { recordingStore } from './RecordingStore.js';

export class RecorderController extends BaseController {
    createComponent(selector) {
        return new RecorderComponent(selector);
    }

    getProps() {
        const { status, transport, selected } = AppState.recorder;
        return {
            status, transport, selected,
            recordings: recordingStore.list(),
            stemsAvailable: recordingStore.get(selected)?.audioMode === 'multitrack',
        };
    }

    bindComponentEvents() {
        const c = this.component;
        c.onRecord = () => RecordingActions.toggleRecord();
        c.onConfig = () => {
            const modal = new RecorderConfigModalComponent(document.createElement('div'));
            openModal(modal, { onClose: () => closeModal() });
        };
        c.onSelect = (key) => RecordingActions.select(key);
        c.onSelectStep = (step) => RecordingActions.selectStep(step);
        c.onTogglePlay = () => RecordingActions.togglePlay();
        c.onReset = () => RecordingActions.reset();
        c.onDownload = (kind) => {
            if (kind === 'wav') RecordingActions.downloadWav();
            else if (kind === 'mid') RecordingActions.downloadMidi();
            else RecordingActions.downloadStems();
        };
    }

    bindExternalEvents() {
        document.addEventListener(RECORDER_CHANGED, () => {
            this.scheduleUpdate();
            this._syncTicker();
        });
        document.addEventListener(RECORDINGS_CHANGED, () => this.scheduleUpdate());
    }

    /**
     * Elapsed-time ticker: runs only while a take is armed/recording and
     * recomputes from the audio clock each tick, so a throttled background
     * page shows a stale number briefly but never a wrong one.
     */
    _syncTicker() {
        const active = AppState.recorder.status !== 'idle';
        if (active && !this._ticker) {
            this._ticker = setInterval(() => {
                this.component.setElapsed(RecordingActions.recordingElapsed());
            }, 250);
        } else if (!active && this._ticker) {
            clearInterval(this._ticker);
            this._ticker = null;
        }
    }
}
