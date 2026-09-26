import { BaseController } from "../base/BaseController.js";
import { DownloadControlComponent } from "./DownloadControlComponent.js";
import { DownloadControlActions } from "./downloadControlActions.js";
import { AppState, IR_RING_MAX_SECONDS } from "../../config.js";
import { CONVOLUTION_IRS_CHANGED, IR_RING_CHANGED, LIBRARY_CHANGED, ROUTING_MODE_CHANGED, SOURCE_CHANGED } from "../../events.js";
import { irManager } from "../../dsp/IRManager.js";
import { Dial } from "../generic/dial/Dial.js";
import { handleAddToWaveforms } from "../waveform/waveformActions.js";
import { ConvolutionActions } from "../convolution/convolutionActions.js";
import { openSettings } from "../settings/settingsSurface.js";

export class DownloadControlController extends BaseController {
    createComponent(selector) {
        return new DownloadControlComponent(selector);
    }

    getProps() {
        return {
            routingMode: AppState.audioRoutingMode,
            isSubharmonic: AppState.isSubharmonic
        };
    }

    bindComponentEvents() {
        // Bind DOM events for routing mode and download button
        this.component.onRoutingChange = (mode) => {
            DownloadControlActions.setRoutingMode(mode);
        };

        this.component.onDownload = () => {
            const { routingMode, isSubharmonic } = this.getProps();
            DownloadControlActions.handleExportWAV(routingMode, isSubharmonic);
        };

        this.component.onAddToWaveforms = () => {
            // The baked oscillator is inherently mono — routing mode only
            // affects WAV export
            handleAddToWaveforms(this.getProps().isSubharmonic);
        };

        document.getElementById('create-ir-button')?.addEventListener('click', () => {
            ConvolutionActions.createIRFromCurrent();
        });

        // The IRs live in the file manager. The steppers that pick one are
        // buttons, not a menu, so this is where the library is reached from
        // — shown once there is an IR to manage.
        const manage = document.getElementById('manage-ir-button');
        if (manage) {
            manage.addEventListener('click', () => openSettings('files'));
            const syncManage = () => { manage.hidden = irManager.list().length === 0; };
            document.addEventListener(CONVOLUTION_IRS_CHANGED, syncManage);
            document.addEventListener(LIBRARY_CHANGED, syncManage);
            syncManage();
        }

        // Ring-time dial for the next Create IR: 0 = one loop, else seconds
        // of exponential decay (a modal resonator)
        const ringRoot = document.getElementById('ir-ring-root');
        if (ringRoot) {
            this._ringDial = new Dial({
                min: 0, max: IR_RING_MAX_SECONDS, step: 0.1, value: AppState.irRingSeconds, size: 22, label: 'ring',
                format: (v) => (v === 0 ? 'one loop' : `ring ${v.toFixed(1)}s`),
                onChange: (v) => ConvolutionActions.setRingSeconds(v),
            });
            ringRoot.appendChild(this._ringDial.el);
            document.addEventListener(IR_RING_CHANGED, () => this._ringDial.setValue(AppState.irRingSeconds));
        }
    }

    bindExternalEvents() {
        document.addEventListener(ROUTING_MODE_CHANGED, () => this.update());

        // Baking (Create Oscillator / Download / Create IR) samples the
        // oscillator bank — in external source modes the action rows stay
        // where they are, grayed out and disabled (nothing in a panel
        // appears or disappears). Applied at init too (bridge bootstrap
        // replays before controllers bind).
        const applySourceGating = () => {
            const external = AppState.sourceMode !== 'oscillators';
            for (const id of ['wavetable-actions', 'ir-actions']) {
                const row = document.getElementById(id);
                if (!row) continue;
                row.classList.toggle('is-disabled', external);
                row.title = external ? 'Available with the Oscillators source' : '';
                // Baking needs the oscillators; reaching the library does not
                for (const control of row.querySelectorAll('button:not(.files-link), select')) {
                    control.disabled = external;
                }
            }
        };
        document.addEventListener(SOURCE_CHANGED, applySourceGating);
        applySourceGating();
    }
}