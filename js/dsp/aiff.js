/**
 * AIFF / AIFF-C decoder — pure, no Web Audio.
 *
 * Chromium's decodeAudioData has no AIFF demuxer (every variant fails with
 * "Unable to decode audio data"), and AIFF is the default export of Logic,
 * Pro Tools and most Mac tools. It is plain PCM in IFF chunks, so this
 * reads it directly: the COMM chunk (channels, frames, bit depth, an
 * 80-bit extended sample rate, and for AIFF-C the compression type) and
 * the SSND chunk's samples. Handles 8/16/24/32-bit big-endian integers,
 * AIFF-C 'sowt' (little-endian, what Apple writes) and 'fl32'/'fl64'
 * floats. Anything compressed (ima4, ulaw, …) throws with a clear message.
 */

const FLOAT32 = new Set(['fl32', 'FL32']);
const FLOAT64 = new Set(['fl64', 'FL64']);

/** True when the bytes are an AIFF or AIFF-C file. */
export function isAiff(arrayBuffer) {
    if (arrayBuffer.byteLength < 12) return false;
    const tag = (o) => String.fromCharCode(...new Uint8Array(arrayBuffer, o, 4));
    return tag(0) === 'FORM' && (tag(8) === 'AIFF' || tag(8) === 'AIFC');
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{sampleRate: number, channels: Float32Array[]}} de-interleaved, −1..1
 */
export function decodeAiff(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const tag = (o) => String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
    if (!isAiff(arrayBuffer)) throw new Error('Not an AIFF file');
    const aifc = tag(8) === 'AIFC';

    let comm = null;
    let ssnd = null;
    let offset = 12;
    while (offset + 8 <= view.byteLength) {
        const id = tag(offset);
        const size = view.getUint32(offset + 4);
        const body = offset + 8;
        if (id === 'COMM') {
            comm = {
                channels: view.getInt16(body),
                frames: view.getUint32(body + 2),
                bits: view.getInt16(body + 6),
                sampleRate: readExtended(view, body + 8),
                compression: aifc && size >= 22 ? tag(body + 18) : 'NONE',
            };
        } else if (id === 'SSND') {
            const dataOffset = view.getUint32(body);
            ssnd = { start: body + 8 + dataOffset, end: Math.min(view.byteLength, body + size) };
        }
        offset = body + size + (size % 2); // chunks are word-aligned
    }
    if (!comm || !ssnd) throw new Error('AIFF is missing its COMM or SSND chunk');

    const { channels, frames, bits, sampleRate, compression } = comm;
    const float32 = FLOAT32.has(compression);
    const float64 = FLOAT64.has(compression);
    const little = compression === 'sowt';
    if (!(compression === 'NONE' || little || float32 || float64)) {
        throw new Error(`Compressed AIFF-C (${compression.trim()}) is not supported — export as PCM or WAV`);
    }
    if (!(channels > 0) || !(sampleRate > 0)) throw new Error('AIFF has an invalid COMM chunk');
    const bytes = bits / 8;
    if (![1, 2, 3, 4, 8].includes(bytes)) throw new Error(`Unsupported AIFF bit depth: ${bits}`);

    const available = Math.floor((ssnd.end - ssnd.start) / (bytes * channels));
    const count = Math.min(frames, available);
    const out = Array.from({ length: channels }, () => new Float32Array(count));
    let p = ssnd.start;
    for (let i = 0; i < count; i++) {
        for (let c = 0; c < channels; c++) {
            out[c][i] = readSample(view, p, bytes, little, float32, float64);
            p += bytes;
        }
    }
    return { sampleRate, channels: out };
}

function readSample(view, p, bytes, little, float32, float64) {
    if (float32) return view.getFloat32(p, little);
    if (float64) return view.getFloat64(p, little);
    switch (bytes) {
        case 1: return view.getInt8(p) / 128;
        case 2: return view.getInt16(p, little) / 32768;
        case 3: {
            const b0 = view.getUint8(p), b1 = view.getUint8(p + 1), b2 = view.getUint8(p + 2);
            const raw = little ? (b2 << 16) | (b1 << 8) | b0 : (b0 << 16) | (b1 << 8) | b2;
            return ((raw << 8) >> 8) / 8388608; // sign-extend 24 → 32
        }
        default: return view.getInt32(p, little) / 2147483648;
    }
}

/** The 80-bit IEEE 754 extended float AIFF stores the sample rate in. */
function readExtended(view, p) {
    const se = view.getUint16(p);
    const exponent = (se & 0x7fff) - 16383;
    const hi = view.getUint32(p + 2);
    const lo = view.getUint32(p + 6);
    const mantissa = hi / 0x80000000 + lo / 0x80000000 / 0x100000000; // 1.xxx
    const value = mantissa * Math.pow(2, exponent);
    return se & 0x8000 ? -value : value;
}
