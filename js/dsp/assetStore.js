/**
 * ASSET STORE — the user's own material, kept on the machine.
 *
 * Everything a session produces or imports that isn't a parameter: baked
 * waveforms, impulse responses, sound files. Presets are parameters and
 * live in localStorage (presetStore.js); these are payloads, so they live
 * in IndexedDB, which holds megabytes without apology.
 *
 * CONTENT ADDRESSED: an asset's id IS the hash of what it contains, so
 * saving the same bake twice stores it once, a preset that references
 * `custom_9f86d0…` means one exact waveform forever, and a future sync
 * service is "send the ids the server doesn't have" rather than a
 * reconciliation problem. Ids keep the app's own prefixes (`custom_` is
 * load-bearing: audio.js reads it to know a waveform is baked).
 *
 * Records are stored as plain structured-cloneable objects — Float32Array
 * and ArrayBuffer go in as they are, so there is no serialization format
 * to version. `meta` is whatever the kind needs to rebuild itself.
 *
 * Storage can be unavailable (private mode, a locked-down webview). The
 * store then keeps everything in memory for the session and says so once:
 * the app behaves exactly as it did before any of this existed.
 */

const DB_NAME = 'twig';
const DB_VERSION = 1;
const STORE = 'assets';

/** Asset kinds, and the id prefix each one carries. */
export const ASSET = {
    wave: { kind: 'wave', prefix: 'custom_' },
    ir: { kind: 'ir', prefix: 'ir_' },
    soundfile: { kind: 'soundfile', prefix: 'sf_' },
};

/** Hash characters kept in an id — 12 hex chars is 48 bits, ample here. */
const ID_LENGTH = 12;

/**
 * How long to wait for the database to open before giving up on it. An
 * IndexedDB open can hang indefinitely — a pending delete from another
 * tab, a locked profile — and the app awaits this at boot, so a stuck
 * request must degrade to a session-only library rather than a synth
 * that never starts.
 */
const OPEN_TIMEOUT_MS = 3000;

let dbPromise = null;
let memoryOnly = false;
const memory = new Map();

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB unavailable'));
            return;
        }
        const timer = setTimeout(() => reject(new Error(`open timed out after ${OPEN_TIMEOUT_MS} ms`)), OPEN_TIMEOUT_MS);
        const settle = (fn) => (value) => { clearTimeout(timer); fn(value); };
        resolve = settle(resolve);
        reject = settle(reject);
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onblocked = () => reject(new Error('open blocked by another tab'));
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: 'id' });
                store.createIndex('kind', 'kind');
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }).catch((err) => {
        if (!memoryOnly) {
            memoryOnly = true;
            console.warn('[assets] no persistent storage — this session only:', err.message);
        }
        return null;
    });
    return dbPromise;
}

function transact(db, mode, run) {
    return new Promise((resolve, reject) => {
        // A transaction that never settles would hang whatever awaits it
        const timer = setTimeout(() => reject(new Error('transaction timed out')), OPEN_TIMEOUT_MS);
        const done = resolve, failed = reject;
        resolve = (v) => { clearTimeout(timer); done(v); };
        reject = (e) => { clearTimeout(timer); failed(e); };
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

export const assetStore = {
    /** True when nothing will survive a reload (storage was unavailable). */
    get ephemeral() {
        return memoryOnly;
    },

    /**
     * Save an asset under the hash of its content; an identical one that
     * is already stored is left alone and its id returned.
     *
     * @param {Object} asset
     * @param {string} asset.kind - An ASSET kind
     * @param {Array} asset.identity - What makes this asset itself: the
     *   parts to hash (strings, numbers, typed arrays). NOT the name — the
     *   same bake under two names is one asset.
     * @param {Object} asset.payload - The stored fields (typed arrays welcome)
     * @param {Object} [asset.meta] - Display data: name, and whatever the kind needs
     * @returns {Promise<string>} the id
     */
    async put({ kind, identity, payload, meta = {} }) {
        const spec = ASSET[kind];
        if (!spec) throw new Error(`Unknown asset kind: ${kind}`);
        const id = spec.prefix + (await digest(identity)).slice(0, ID_LENGTH);
        const record = { id, kind, savedAt: Date.now(), meta, ...payload };

        const db = await openDb();
        if (!db) {
            if (!memory.has(id)) memory.set(id, record);
            return id;
        }
        const existing = await transact(db, 'readonly', (store) => store.getKey(id));
        if (existing === undefined) await transact(db, 'readwrite', (store) => store.put(record));
        return id;
    },

    /** One asset, or null. */
    async get(id) {
        const db = await openDb();
        if (!db) return memory.get(id) ?? null;
        return (await transact(db, 'readonly', (store) => store.get(id))) ?? null;
    },

    /**
     * Rename an asset. The id is the hash of the CONTENT, and a name is
     * not content — so renaming is a metadata write and every preset that
     * references the asset keeps pointing at it.
     */
    async setName(id, name) {
        const db = await openDb();
        if (!db) {
            const record = memory.get(id);
            if (record) record.meta = { ...record.meta, name };
            return;
        }
        const record = await transact(db, 'readonly', (store) => store.get(id));
        if (!record) return;
        record.meta = { ...record.meta, name };
        await transact(db, 'readwrite', (store) => store.put(record));
    },

    /** Every asset of a kind, oldest first. */
    async list(kind) {
        const db = await openDb();
        if (!db) {
            return [...memory.values()].filter((r) => r.kind === kind).sort((a, b) => a.savedAt - b.savedAt);
        }
        const all = await transact(db, 'readonly', (store) => store.index('kind').getAll(kind));
        return (all || []).sort((a, b) => a.savedAt - b.savedAt);
    },

    async remove(id) {
        memory.delete(id);
        const db = await openDb();
        if (db) await transact(db, 'readwrite', (store) => store.delete(id));
    },

    /**
     * A kind's assets WITHOUT their payloads: what the library view lists.
     * The bytes are counted here and the records dropped, so browsing a
     * library of sound files doesn't hold every file in memory.
     */
    async summaries(kind) {
        return (await this.list(kind)).map((record) => ({
            id: record.id,
            kind: record.kind,
            name: record.meta?.name || '',
            meta: record.meta || {},
            savedAt: record.savedAt,
            bytes: recordBytes(record),
        }));
    },

    /** Bytes held, by kind — for a future library view and storage limits. */
    async usage() {
        const out = {};
        for (const kind of Object.keys(ASSET)) {
            const records = await this.list(kind);
            out[kind] = { count: records.length, bytes: records.reduce((sum, r) => sum + recordBytes(r), 0) };
        }
        return out;
    },

    /**
     * What the browser has granted this origin and how much of it is spent,
     * or null where it won't say. Its figure covers everything the origin
     * stores, not only the library.
     */
    async quota() {
        try {
            const estimate = await navigator.storage?.estimate?.();
            return estimate ? { usage: estimate.usage || 0, quota: estimate.quota || 0 } : null;
        } catch {
            return null;
        }
    },
};

function recordBytes(record) {
    let bytes = 0;
    for (const value of Object.values(record)) {
        if (ArrayBuffer.isView(value)) bytes += value.byteLength;
        else if (value instanceof ArrayBuffer) bytes += value.byteLength;
    }
    return bytes;
}

/**
 * Hex digest of the parts that identify an asset. SHA-256 where the
 * platform offers it (a secure context, which localhost is); otherwise a
 * plain 64-bit FNV-1a, since this is addressing and dedupe, not security.
 */
async function digest(parts) {
    const bytes = concat(parts);
    if (globalThis.crypto?.subtle) {
        try {
            const hash = await crypto.subtle.digest('SHA-256', bytes);
            return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
        } catch {
            // Fall through to the plain hash
        }
    }
    return fnv1a(bytes);
}

function concat(parts) {
    const chunks = parts.map((part) => {
        if (typeof part === 'string') return new TextEncoder().encode(part);
        if (typeof part === 'number') return new Uint8Array(new Float64Array([part]).buffer);
        if (ArrayBuffer.isView(part)) return new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
        if (part instanceof ArrayBuffer) return new Uint8Array(part);
        return new TextEncoder().encode(String(part));
    });
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.length;
    }
    return out;
}

function fnv1a(bytes) {
    // 64-bit FNV-1a in two 32-bit halves (no BigInt in the hot path)
    let hi = 0xcbf2, lo = 0x9ce484222325;
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ hi ^ (lo & 0xffff);
    for (let i = 0; i < bytes.length; i++) {
        h1 = Math.imul(h1 ^ bytes[i], 0x01000193) >>> 0;
        h2 = Math.imul(h2 + bytes[i] + 1, 0x85ebca6b) >>> 0;
    }
    return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'));
}
