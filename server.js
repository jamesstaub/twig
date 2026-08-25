/**
 * twig server — static file host + OSC/WebSocket bridge.
 *
 * Runs in two modes with the same file (ESM — package.json sets type:module):
 *   1. Standalone (dev):        `node server.js`
 *   2. Node for Max (M4L):      loaded by [node.script server.js] inside the
 *                               Max device; detected by importing 'max-api'.
 *
 * Message flow — the Max patch speaks plain messages, no OSC syntax needed:
 *   Max patch → [script send drawbar 3 0.7], [script send play 1], … →
 *     node.script → WebSocket broadcast → every connected twig app (jweb)
 *   twig app (user gesture) → WebSocket → [outlet drawbar 6 0.4] etc. —
 *     route with [route drawbar gain note …] into Live-native params to
 *     preserve preset state.
 *
 * Addressing: /twig/<command> — the bridge broadcasts everything to all
 * connected apps. Per-device isolation comes from each device running its
 * own server on its own port (below), not from message addressing.
 * (An optional /twig/<id>/<command> form still exists client-side for
 * shared-server setups, matched against the app's ?instance=<id> param.)
 *
 * Multiple devices in one Live session: each device's node.script binds an
 * ephemeral HTTP port (listen(0)) and announces it via [outlet port <n>];
 * the patch points its own jweb at http://localhost:<n>/. Devices are fully
 * isolated — no shared hub, no cross-device routing, presets stay per-device.
 */

import express from 'express';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3333;

// Detect Node for Max ('max-api' only resolves inside node.script)
let Max = null;
try {
    Max = (await import('max-api')).default;
} catch {
    // standalone mode
}

const log = (msg) => (Max ? Max.post(msg) : console.log(msg));

// ================================
// STATE CACHE
// ================================

// Live's plugin parameters are the source of truth: the patch pushes them
// here (in any order, any time — including before jweb exists), and the app
// fetches GET /state before its first render to bootstrap. The cache also
// tracks upstream app gestures, so a jweb reload restores the latest state.
const STATE_ORDER = [
    'startharmonic', 'stiffness', 'closedness', 'stretch', 'compress',
    'system', 'waveform', 'source', 'adcin', 'adcchannel', 'subharmonic', 'note', 'freq',
    'gain', 'slew', 'drawbars', 'drawbar', 'gate', 'filter', 'res', 'drive', 'pan',
    'adsr', 'seqshape', 'seqgain', 'seqfreq', 'seqres', 'seqstretch',
    'pulsemidi', 'pulseosc', 'midiclock', 'midiout', 'envmode', 'play'
];
const PER_INDEX_COMMANDS = new Set([
    'drawbar', 'gate', 'filter', 'res', 'drive', 'pan', 'adsr',
    'seqshape', 'seqgain', 'seqfreq', 'seqres', 'seqstretch',
    'pulsemidi', 'pulseosc'
]);
const TRANSIENT_COMMANDS = new Set(['reset', 'randomize', 'setdrawbarfundamental']);
const stateCache = new Map(); // cache key → {address, args}

function cacheStateMessage(msg) {
    const parts = msg.address.split('/').filter(Boolean);
    if (parts[0] !== 'twig' || parts.length < 2) return;
    const cmd = parts[1];
    if (TRANSIENT_COMMANDS.has(cmd) || !STATE_ORDER.includes(cmd)) return;

    if (cmd === 'drawbars') {
        // A full set supersedes any individual drawbar entries
        for (const key of [...stateCache.keys()]) {
            if (key.startsWith('drawbar/')) stateCache.delete(key);
        }
        stateCache.set('drawbars', msg);
    } else if (PER_INDEX_COMMANDS.has(cmd)) {
        // Keyed per voice index: drawbar/3, gate/2 … index 0 means "all
        // voices" and supersedes earlier per-voice entries. Delete before
        // set so replay order follows message order (Map.set on an existing
        // key would keep its old position).
        const index = parts[2] ?? msg.args?.[0];
        if (index === undefined) return;
        const key = `${cmd}/${index}`;
        if (Number(index) === 0) {
            for (const k of [...stateCache.keys()]) {
                if (k.startsWith(`${cmd}/`)) stateCache.delete(k);
            }
        } else {
            stateCache.delete(key);
        }
        stateCache.set(key, msg);
    } else if (cmd === 'note' || cmd === 'freq') {
        // Both set the fundamental — keep only the most recent
        stateCache.delete(cmd === 'note' ? 'freq' : 'note');
        stateCache.set(cmd, msg);
    } else {
        stateCache.set(cmd, msg);
    }
}

function stateSnapshot() {
    const rank = (msg) => STATE_ORDER.indexOf(msg.address.split('/').filter(Boolean)[1]);
    return [...stateCache.values()].sort((a, b) => rank(a) - rank(b));
}

// ================================
// HTTP + WEBSOCKET HUB
// ================================

const app = express();
app.use(express.static(path.join(__dirname)));

// Bootstrap snapshot, applied by the app before its first render.
// The command whitelist rides along so the app can detect a stale server
// process (one started before new params were added) and warn instead of
// letting them silently fail to persist.
app.get('/state', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Twig-Commands', STATE_ORDER.join(','));
    res.json(stateSnapshot());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/osc' });

function broadcast(message, exclude = null) {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
}

wss.on('connection', (ws) => {
    log(`[osc-bridge] app connected (${wss.clients.size} total)`);

    // Upstream: app state changes → Max (for Live preset params) and any
    // sibling windows. The origin client is excluded to prevent echo.
    ws.on('message', (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch {
            return;
        }
        if (typeof msg.address !== 'string') return;
        cacheStateMessage(msg);
        broadcast(msg, ws);
        if (Max) {
            // Emit plain, [route]-able messages: /twig/drawbar/6 [0.4]
            // becomes [drawbar 6 0.4] — numeric path segments join the args
            const parts = msg.address.split('/').filter(Boolean);
            const args = msg.args || [];
            if (parts[0] === 'twig' && parts.length > 1) {
                const pathArgs = parts.slice(2).map(p => (isNaN(p) ? p : Number(p)));
                Max.outlet(parts[1], ...pathArgs, ...args);
            } else {
                Max.outlet(msg.address, ...args);
            }
        }
    });

    ws.on('close', () => log(`[osc-bridge] app disconnected (${wss.clients.size} total)`));
});

// ================================
// MAX MESSAGE INPUT
// ================================

if (Max) {
    // Plain command messages from the patch — no OSC syntax needed:
    //   [script send drawbar 3 0.7]   [script send play 1]
    //   [script send drawbars 0.1 0.2 …]   [script send waveform sine]
    const APP_COMMANDS = [
        'drawbar', 'drawbars', 'gain', 'slew', 'note', 'freq',
        'system', 'startharmonic', 'stiffness', 'closedness', 'stretch', 'compress',
        'waveform', 'source', 'adcin', 'adcchannel', 'subharmonic', 'play', 'reset', 'randomize',
        'setdrawbarfundamental', 'gate', 'filter', 'res', 'drive', 'pan',
        'seqshape', 'seqgain', 'seqfreq', 'seqres', 'seqstretch',
        'pulsemidi', 'pulseosc', 'midiclock', 'adsr', 'envmode', 'midiout'
    ];
    for (const cmd of APP_COMMANDS) {
        Max.addHandler(cmd, (...args) => {
            const msg = { address: `/twig/${cmd}`, args };
            cacheStateMessage(msg);
            broadcast(msg);
        });
    }

    // [script send port <n>] — rebind so each device can own a distinct
    // port; the patch then points its jweb at http://localhost:<n>/
    Max.addHandler('port', (p) => {
        const newPort = parseInt(p, 10);
        if (!newPort || newPort === server.address()?.port) return;
        for (const client of wss.clients) client.terminate();
        server.close(() => {
            server.listen(newPort, () => {
                log(`[osc-bridge] rebound to http://localhost:${newPort}`);
                Max.outlet('port', newPort);
            });
        });
    });
}

// ================================
// TEARDOWN
// ================================

// Max terminates this process when the [node.script] object is freed
// (device deleted, set closed) — the OS releases the ports either way.
// These handlers make shutdown immediate and clean: sockets closed,
// clients disconnected, no lingering FIN_WAIT connections.
let shuttingDown = false;

function shutdown(reason) {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`[osc-bridge] shutting down (${reason})`);
    for (const client of wss.clients) client.terminate();
    wss.close();
    server.close(() => process.exit(0));
    // Fallback if a connection refuses to close promptly
    setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (Max) {
    // Explicit patch-driven teardown: [freebang] → [script send teardown]
    Max.addHandler('teardown', () => shutdown('teardown message'));
}

// ================================
// START
// ================================

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        // Standalone dev on a fixed port: another server already serves it.
        log(`[osc-bridge] port ${PORT} already in use — assuming another twig server is running; this instance stays idle`);
        if (!Max) process.exit(1);
    } else {
        throw err;
    }
});

// Under Node for Max, bind an ephemeral port (0 → OS-assigned, collision-free)
// so any number of device instances coexist in one Live session, each fully
// isolated. The patch reads the announced port and points its own jweb at
// http://localhost:<port>/. Standalone dev keeps the fixed port.
server.listen(Max ? 0 : PORT, () => {
    const actualPort = server.address().port;
    log(`🎵 twig server at http://localhost:${actualPort} (ws /osc)${Max ? ' [node4max]' : ''}`);
    if (Max) Max.outlet('port', actualPort);
});
