/**
 * Pitch worker — runs YIN off the main thread. A module worker served
 * UNBUNDLED (like the worklets): it may import only files that are
 * themselves raw-loadable (yin.js has no imports).
 *
 * in:  { id, data: Float32Array, sampleRate }
 * out: { id, hz: number|null, clarity: number }
 */

import { yinAverage } from '../yin.js';

self.onmessage = (e) => {
    const { id, data, sampleRate } = e.data;
    const r = yinAverage(data, sampleRate);
    self.postMessage({ id, hz: r ? r.hz : null, clarity: r ? r.clarity : 0 });
};
