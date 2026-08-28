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
        return { status, transport, selected, recordings: recordingStore.list() };
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
        c.onDownload = (kind) => (kind === 'wav' ? RecordingActions.downloadWav() : RecordingActions.downloadMidi());
    }

    bindExternalEvents() {
        document.addEventListener(RECORDER_CHANGED, () => this.scheduleUpdate());
        document.addEventListener(RECORDINGS_CHANGED, () => this.scheduleUpdate());
    }
}
