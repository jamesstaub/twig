/**
 * RECORDING STORE — session store of captured performances.
 *
 * Each recording pairs one audio take with one MIDI document on the same
 * timeline (sample 0 of the audio = time 0 of the MIDI):
 *
 *   { key, name, base, audioMode, audio: { sampleRate, channels }, midi: document, duration }
 *
 * `base` is the shared file stem for the .wav/.mid pair. Plain data — no
 * Web Audio objects — so a port to another runtime keeps the shape.
 */
export class RecordingStore {

    constructor() {
        this.recordings = new Map();
        this.count = 0;
    }

    /** @returns {string} key */
    add(recording) {
        this.count++;
        const key = `rec_${this.count}`;
        this.recordings.set(key, { key, ...recording });
        return key;
    }

    get(key) {
        return this.recordings.get(key) || null;
    }

    /** Next sequence number, for naming a take before it is stored. */
    nextNumber() {
        return this.count + 1;
    }

    /** @returns {Array<{key:string, name:string, duration:number}>} in creation order */
    list() {
        return [...this.recordings.values()].map(({ key, name, duration }) => ({ key, name, duration }));
    }

    keyAt(index) {
        return this.list()[index]?.key ?? null;
    }

    indexOf(key) {
        return this.list().findIndex((r) => r.key === key);
    }
}

export const recordingStore = new RecordingStore();
