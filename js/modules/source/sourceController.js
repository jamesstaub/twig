import { AppState } from '../../config.js';
import { sourceManager } from '../../dsp/SourceManager.js';
import { SOURCE_CHANGED } from '../../events.js';
import { BaseController } from '../base/BaseController.js';
import { SourceActions } from './sourceActions.js';
import SourceComponent from './SourceComponent.js';

export class SourceController extends BaseController {

    createComponent(selector) {
        return new SourceComponent(selector);
    }

    getProps() {
        return {
            sourceMode: AppState.sourceMode,
            adcDeviceId: AppState.adcDeviceId,
            adcChannel: AppState.adcChannel,
            adcDevices: this._adcDevices || [],
            soundfileName: AppState.soundfileName,
        };
    }

    bindComponentEvents() {
        // Callbacks only — DOM listeners live in the component's
        // bindRenderedEvents, re-bound by BaseController after each render
        this.component.onModeChange = (mode) => SourceActions.setSourceMode(mode);
        this.component.onAdcDeviceChange = (id) => SourceActions.setAdcDevice(id);
        this.component.onAdcChannelChange = (ch) => SourceActions.setAdcChannel(ch);
        this.component.onFile = (file) => SourceActions.loadSoundFile(file);
    }

    bindExternalEvents() {
        document.addEventListener(SOURCE_CHANGED, () => this.refreshDevices());
    }

    /** Refresh the ADC device list, then re-render with it. */
    async refreshDevices() {
        if (AppState.sourceMode === 'adc') {
            try {
                this._adcDevices = await sourceManager.inputDevices();
            } catch {
                this._adcDevices = [];
            }
        }
        this.update();
    }
}
