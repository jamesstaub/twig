/**
 * Port id for a flexible selector against a port list ({id, name} objects):
 * exact port id, 0-based index into the list (matching how system/waveform
 * bridge addresses menus), or a port name — exact first, then
 * case-insensitive substring. An unresolved string is returned as-is so it
 * can name a port that appears later (statechange re-picks resolve it).
 */
export function resolvePortSelector(ports, selector) {
    if (typeof selector === 'number') return ports[Math.round(selector)]?.id ?? null;
    const s = String(selector ?? '').trim();
    if (!s) return null;
    const port = ports.find((p) => p.id === s) ||
        ports.find((p) => p.name === s) ||
        ports.find((p) => p.name.toLowerCase().includes(s.toLowerCase()));
    return port ? port.id : s;
}
