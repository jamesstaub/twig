
import { smoothUpdateMasterGain } from "../../utils.js";
import { DrawbarsActions } from "../drawbars/drawbarsActions.js";
import { FundamentalActions } from "../fundamental/fundamentalActions.js";
import { midiConfig } from "../../config.js";
import { onMidiConfigChange } from "./midiConfigActions.js";


export class MidiInputRouter {

    constructor() {
        this.lastCC = {};
        this._currentConfig = { ...midiConfig };
        onMidiConfigChange((newConfig) => {
            this._currentConfig = { ...newConfig };
        });
    }


    async init() {
        const midi = await navigator.requestMIDIAccess();
        for (let input of midi.inputs.values()) {
            input.onmidimessage = (msg) => this.route(msg);
        }
    }


    route(msg) {
        const [status, data1, data2] = msg.data;
        const channel = (status & 0x0F) + 1; // MIDI channels are 1-16

        // Only respond to configured input channel
        if (channel !== this._currentConfig.inputChannel) return;

        const isCC = (status & 0xF0) === 0xB0;
        if (isCC) return this.handleCC(data1, data2);

        const isNoteOn = (status & 0xF0) === 0x90 && data2 > 0;
        const isNoteOff = (status & 0xF0) === 0x80 || data2 === 0;
        if (isNoteOn) return this.handleNoteOn(data1, data2);
        if (isNoteOff) return this.handleNoteOff(data1);
    }

    handleCC(cc, val) {
        const norm = val / 127;
        // Master Gain (CC7)
        if (cc === 7) {
            smoothUpdateMasterGain(norm);
        }

        // throttle flood of CC changes
        if (this.lastCC[cc] === val) return;
        this.lastCC[cc] = val;

        // Drawbar CCs from current config
        const drawbarIdx = this._currentConfig.drawbarsCC.indexOf(cc);
        if (drawbarIdx !== -1) {
            DrawbarsActions.setDrawbar(drawbarIdx, norm);
        }
    }

    handleNoteOn(note) {
        FundamentalActions.setFundamentalByMidi(note);
    }

    handleNoteOff(note) {
        // AudioActions.noteOff(note);
    }
}
