// midiConfigActions.js
// Actions for updating midiConfig and propagating changes
import { midiConfig } from '../../config.js';

const listeners = [];

export function updateMidiInputChannel(channel) {
    midiConfig.inputChannel = channel;
    notifyListeners();
}

export function updateMidiDrawbarCC(index, cc) {
    midiConfig.drawbarsCC[index] = cc;
    notifyListeners();
}

export function onMidiConfigChange(listener) {
    listeners.push(listener);
}

function notifyListeners() {
    listeners.forEach(fn => fn(midiConfig));
}
