import { AppState } from '../../config.js';
import { soundfileConfig } from '../../appConfig.js';
import { sourceManager } from '../../dsp/SourceManager.js';
import { LIBRARY_CHANGED, RECORDINGS_CHANGED, SOURCE_CHANGED } from '../../events.js';
import { BaseController } from '../base/BaseController.js';
import { SourceActions } from './sourceActions.js';
import { samplerLibrary } from './sourceLibrary.js';
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
            library: this._library || [],
            soundfile: {
                mode: soundfileConfig.mode,
                tune: soundfileConfig.tune,
                fundamental: AppState.soundfileFundamental,
                range: AppState.soundfileRange,
                detectedHz: sourceManager.fileFundamental,
                source: sourceManager.fileSource,
            },
        };
    }

    bindComponentEvents() {
        // Callbacks only — DOM listeners live in the component's
        // bindRenderedEvents, re-bound by BaseController after each render
        this.component.onModeChange = (mode) => SourceActions.setSourceMode(mode);
        this.component.onAdcDeviceChange = (id) => SourceActions.setAdcDevice(id);
        this.component.onAdcChannelChange = (ch) => SourceActions.setAdcChannel(ch);
        this.component.onFile = (file) => SourceActions.loadSoundFile(file);
        this.component.onLibraryPick = (entry) => SourceActions.loadLibraryEntry(entry);
        this.component.onSoundfileMode = (mode) => SourceActions.setSoundfileMode(mode);
        this.component.onSoundfileTune = (on) => SourceActions.setSoundfileTune(on);
        this.component.onSoundfileFundamental = (hz) => SourceActions.setSoundfileFundamental(hz);
        this.component.onSoundfileRange = (range) => SourceActions.setSoundfileRange(range);
    }

    bindExternalEvents() {
        document.addEventListener(SOURCE_CHANGED, () => this.refreshDevices());
        // The sampler's menu lists the whole library, which grows from
        // everywhere: a bake, a Create IR, an import, a deletion — and
        // takes, which are the one kind that lives outside the store
        for (const event of [LIBRARY_CHANGED, RECORDINGS_CHANGED]) {
            document.addEventListener(event, () => this.refreshLibrary());
        }
    }

    /** Refresh the ADC device list, then re-render with it. */
    async refreshDevices() {
        const mode = AppState.sourceMode;
        if (mode === 'adc') {
            try {
                this._adcDevices = await sourceManager.inputDevices();
            } catch {
                this._adcDevices = [];
            }
        }
        // ENTERING sound-file mode reads the library, so the menu is right
        // rather than flashing empty — but SOURCE_CHANGED also fires for
        // every range drag and fundamental step, which must not each cost
        // a pass over storage. While the mode is left, library events are
        // ignored; coming back is what re-reads.
        const entering = mode === 'soundfile' && this._sourceMode !== 'soundfile';
        this._sourceMode = mode;
        if (entering) {
            await this.refreshLibrary();
            return;
        }
        this.update();
    }

    /** Re-read the machine's library; only the sampler's menu shows it. */
    async refreshLibrary() {
        if (AppState.sourceMode !== 'soundfile') return;
        this._library = await samplerLibrary();
        this.update();
    }
}
