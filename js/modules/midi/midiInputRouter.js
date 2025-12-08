import { smoothUpdateMasterGain } from "../../utils.js";
import { DrawbarsActions } from "../drawbars/drawbarsActions.js";


export class MidiInputRouter {
    constructor() {
        this.lastCC = {};
    }

    async init() {
        const midi = await navigator.requestMIDIAccess();
        for (let input of midi.inputs.values()) {
            input.onmidimessage = (msg) => this.route(msg);
        }
    }

    route(msg) {
        const [status, data1, data2] = msg.data;

        const isCC = (status & 0xF0) === 0xB0;
        if (isCC) return this.handleCC(data1, data2);

        const isNoteOn = (status & 0xF0) === 0x90 && data2 > 0;
        const isNoteOff = (status & 0xF0) === 0x80 || data2 === 0;
        if (isNoteOn) return this.handleNoteOn(data1, data2);
        if (isNoteOff) return this.handleNoteOff(data1);
    }

    handleCC(cc, val) {
        const norm = val / 127;
        switch (cc) {
            case 7:
                smoothUpdateMasterGain(norm);
                break;
            case 10:
                break;
            default:
                break;
        }

        // throttle flood of CC changes
        if (this.lastCC[cc] === val) return;
        this.lastCC[cc] = val;
        // Drawbar CCs 20 - 31
        if (cc > 19 && cc < 32) {
            DrawbarsActions.setDrawbar(cc - 20, norm);
        }
    }

    handleNoteOn(note, vel) {
        // AudioActions.noteOn(note, vel / 127);
    }

    handleNoteOff(note) {
        // AudioActions.noteOff(note);
    }
}
