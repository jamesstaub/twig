/**
 * ZIP WRITER (STORE only) — pure. No browser APIs, no app state.
 *
 * Builds a standard .zip archive with method 0 (no compression): WAV
 * payloads are already large and float audio barely deflates, so storing
 * keeps this dependency-free and byte-predictable. Classic zip32 layout —
 * local headers, central directory, end-of-central-directory — readable
 * by every extractor. 4 GB total is the format's ceiling here.
 */

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
    const d = date || new Date(1980, 0, 1);
    return {
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
        date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
}

/**
 * @param {Array<{name: string, data: Uint8Array}>} entries - names are
 *   stored as given (use "folder/file.ext" for a folder layout); ASCII only
 * @param {Date} [date] - Timestamp stamped on every entry
 * @returns {Uint8Array} the archive
 */
export function buildZip(entries, date) {
    const { time, date: dosDate } = dosDateTime(date);
    const nameBytes = entries.map((e) => Uint8Array.from([...e.name].map((c) => c.charCodeAt(0) & 0x7f)));
    const crcs = entries.map((e) => crc32(e.data));

    const localSize = entries.reduce((n, e, i) => n + 30 + nameBytes[i].length + e.data.length, 0);
    const centralSize = entries.reduce((n, _, i) => n + 46 + nameBytes[i].length, 0);
    const out = new Uint8Array(localSize + centralSize + 22);
    const view = new DataView(out.buffer);
    let pos = 0;
    const offsets = [];

    // Local file header + data per entry
    entries.forEach((entry, i) => {
        offsets.push(pos);
        view.setUint32(pos, 0x04034b50, true);
        view.setUint16(pos + 4, 20, true);              // version needed
        view.setUint16(pos + 6, 0, true);               // flags
        view.setUint16(pos + 8, 0, true);               // method: store
        view.setUint16(pos + 10, time, true);
        view.setUint16(pos + 12, dosDate, true);
        view.setUint32(pos + 14, crcs[i], true);
        view.setUint32(pos + 18, entry.data.length, true);
        view.setUint32(pos + 22, entry.data.length, true);
        view.setUint16(pos + 26, nameBytes[i].length, true);
        view.setUint16(pos + 28, 0, true);              // extra length
        out.set(nameBytes[i], pos + 30);
        out.set(entry.data, pos + 30 + nameBytes[i].length);
        pos += 30 + nameBytes[i].length + entry.data.length;
    });

    // Central directory
    const centralStart = pos;
    entries.forEach((entry, i) => {
        view.setUint32(pos, 0x02014b50, true);
        view.setUint16(pos + 4, 20, true);              // made by
        view.setUint16(pos + 6, 20, true);              // version needed
        view.setUint16(pos + 8, 0, true);
        view.setUint16(pos + 10, 0, true);
        view.setUint16(pos + 12, time, true);
        view.setUint16(pos + 14, dosDate, true);
        view.setUint32(pos + 16, crcs[i], true);
        view.setUint32(pos + 20, entry.data.length, true);
        view.setUint32(pos + 24, entry.data.length, true);
        view.setUint16(pos + 28, nameBytes[i].length, true);
        // extra/comment/disk/internal attrs all zero
        view.setUint32(pos + 38, 0, true);              // external attrs
        view.setUint32(pos + 42, offsets[i], true);
        out.set(nameBytes[i], pos + 46);
        pos += 46 + nameBytes[i].length;
    });

    // End of central directory
    view.setUint32(pos, 0x06054b50, true);
    view.setUint16(pos + 8, entries.length, true);
    view.setUint16(pos + 10, entries.length, true);
    view.setUint32(pos + 12, pos - centralStart, true);
    view.setUint32(pos + 16, centralStart, true);
    return out;
}
