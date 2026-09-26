import BaseComponent from '../base/BaseComponent.js';
import { Sketch } from '../generic/sketch/Sketch.js';
import { themeColor } from '../../theme.js';
import { drawCycle, drawOverview, drawWaveformFrame } from '../waveform/waveformDraw.js';
import { audition } from './audition.js';
import {
    LIBRARY_KINDS, downloadEntry, isPlaying, libraryEntries, playEntry, previewOf,
    removeEntry, renameEntry, storageReport, useEntry,
} from './filesActions.js';

/**
 * FILES — the machine's library, as a place the user can work in.
 *
 * One table per kind (baked waveforms, IRs, sound files, takes), what the
 * library is spending of the machine's storage, and a preview of whichever
 * row is selected — drawn on the same waveform view the Source panel uses.
 *
 * Selecting a row previews it; its buttons put the file to work in the
 * synth, play it, rename it in place, download it or delete it. Deleting
 * takes two clicks — the app has no modals, and a file the user made is
 * not something to lose to a slip.
 *
 * Rows are rebuilt often (every library change), so every handler here is
 * delegated from the panel root: a listener per button would leave the
 * component holding a reference to every row it has ever drawn.
 */

/** Inline SVG in currentColor — iOS Safari draws Unicode symbols as emoji. */
const ICONS = {
    use: '<path d="M3 8.5l3.5 3.5L13 4.5"/>',
    play: '<path d="M5.5 3.5l7 4.5-7 4.5z" fill="currentColor"/>',
    stop: '<path d="M4.5 4.5h7v7h-7z" fill="currentColor"/>',
    rename: '<path d="M3 13h3l7-7-3-3-7 7zM9.5 3.5l3 3"/>',
    download: '<path d="M8 2.5v7m0 0L5 6.5M8 9.5l3-3M3 13h10"/>',
    remove: '<path d="M3 4.5h10M6.5 4.5V2.5h3v2M4.5 4.5l.8 8.5h5.4l.8-8.5"/>',
};

const PREVIEW_HEIGHT = 96;
/** An armed delete forgets it was asked after this long. */
const ARM_MS = 4000;

export class FilesSettingsComponent extends BaseComponent {

    constructor(target) {
        super(target);
        this.entries = {};
        this.selected = null;   // { kind, id }
        this.preview = null;
        this.armed = null;      // { kind, id }
        this.armTimer = null;
        this.renaming = null;   // { kind, id }
        this.sketch = null;
    }

    render() {
        this.teardown();
        this.el.innerHTML = '';
        const sections = document.createElement('div');
        sections.className = 'settings-sections';
        sections.append(this.storageCard(), this.previewCard());
        for (const kind of LIBRARY_KINDS) sections.appendChild(this.tableCard(kind));
        this.el.appendChild(sections);

        this.sketch = new Sketch(this.q('.files-preview-canvas'), {
            draw: (ctx, sk) => this.drawPreview(ctx, sk),
            loop: false,
            fallbackSize: PREVIEW_HEIGHT,
        });
        this.bindDelegates();
        audition.onChange = () => this.syncPlayButtons();
        this.refresh();
    }

    teardown() {
        super.teardown();
        clearTimeout(this.armTimer);
        audition.onChange = null;
        this.sketch?.destroy();
        this.sketch = null;
    }

    // ---- Structure ----------------------------------------------------

    section(title, className, wide = false) {
        const sec = document.createElement('section');
        sec.className = `settings-section ${className}${wide ? ' settings-section-wide' : ''}`;
        const heading = document.createElement('div');
        heading.className = 'settings-section-title';
        heading.textContent = title;
        sec.appendChild(heading);
        return sec;
    }

    storageCard() {
        const card = this.section('On this machine', 'files-storage');
        card.insertAdjacentHTML('beforeend', `
            <div class="files-bar"><span class="files-bar-fill"></span></div>
            <div class="files-figures"></div>
            <div class="settings-row files-location">
                <span class="files-location-text"></span>
                <button type="button" class="action-btn" disabled
                    title="Choosing a folder needs the desktop app">Choose folder…</button>
            </div>
            <p class="settings-hint">Your waveforms, impulse responses and sound files are kept on this
                computer, in this browser's own storage. Nothing is uploaded anywhere.</p>`);
        return card;
    }

    previewCard() {
        const card = this.section('Preview', 'files-preview');
        card.insertAdjacentHTML('beforeend', `
            <div class="files-preview-canvas"></div>
            <div class="files-preview-meta">Select a file to see it here.</div>`);
        return card;
    }

    tableCard({ kind, title, empty, note }) {
        const card = this.section(title, 'files-kind', true);
        card.dataset.kind = kind;
        const table = document.createElement('table');
        table.className = 'files-table';
        table.innerHTML = '<tbody></tbody>';
        const none = document.createElement('p');
        none.className = 'settings-hint files-empty';
        none.textContent = empty;
        card.append(table, none);
        if (note) {
            const hint = document.createElement('p');
            hint.className = 'settings-hint';
            hint.textContent = note;
            card.appendChild(hint);
        }
        return card;
    }

    // ---- Filling ------------------------------------------------------

    /** Re-read the library and redraw every table. */
    async refresh() {
        const [entries, storage] = await Promise.all([libraryEntries(), storageReport()]);
        this.entries = entries;
        this.renderStorage(storage);
        for (const { kind } of LIBRARY_KINDS) this.renderTable(kind);
        // Whatever was selected may be gone — deleted here or elsewhere
        if (this.selected && !this.entryOf(this.selected)) this.select(null);
        else this.markSelection();
    }

    renderStorage({ usage, libraryBytes, quota, ephemeral }) {
        const share = quota?.quota ? Math.min(1, libraryBytes / quota.quota) : 0;
        this.q('.files-bar-fill').style.width = `${Math.max(share * 100, libraryBytes ? 0.5 : 0)}%`;
        const counts = LIBRARY_KINDS
            .filter(({ kind }) => usage[kind])
            .map(({ kind, title }) => `${title} ${usage[kind].count}`)
            .join(' · ');
        this.q('.files-figures').textContent = `${formatBytes(libraryBytes)} stored` +
            `${quota?.quota ? ` of ${formatBytes(quota.quota)} this browser allows` : ''} — ${counts}`;
        this.q('.files-location-text').textContent = ephemeral
            ? 'No storage available — this session only'
            : "Folder · this browser's storage";
    }

    renderTable(kind) {
        const card = this.q(`.files-kind[data-kind="${kind}"]`);
        const body = card.querySelector('tbody');
        const entries = this.entries[kind] || [];
        body.innerHTML = '';
        card.querySelector('.files-empty').hidden = entries.length > 0;
        for (const entry of entries) body.appendChild(this.row(entry));
        this.markSelection();
    }

    row(entry) {
        const tr = document.createElement('tr');
        tr.className = 'files-row';
        tr.dataset.id = entry.id;
        tr.dataset.kind = entry.kind;

        const name = document.createElement('td');
        name.className = 'files-name';
        name.appendChild(this.nameCell(entry));
        if (entry.inUse) {
            const tag = document.createElement('span');
            tag.className = 'files-inuse';
            tag.textContent = 'in use';
            name.appendChild(tag);
        }

        const detail = document.createElement('td');
        detail.className = 'files-detail';
        detail.textContent = entry.detail;

        const size = document.createElement('td');
        size.className = 'files-size';
        size.textContent = formatBytes(entry.bytes);

        tr.append(name, detail, size, this.actionsCell(entry));
        return tr;
    }

    nameCell(entry) {
        if (this.sameEntry(this.renaming, entry)) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'files-name-input';
            input.value = entry.name;
            // Focus once the row is in the document
            requestAnimationFrame(() => { input.focus(); input.select(); });
            return input;
        }
        const span = document.createElement('span');
        span.className = 'files-name-text';
        span.textContent = entry.name;
        span.title = entry.name;
        return span;
    }

    actionsCell(entry) {
        const cell = document.createElement('td');
        cell.className = 'files-actions';
        const playing = isPlaying(entry);
        const armed = this.sameEntry(this.armed, entry);
        cell.append(
            this.iconButton('use', LIBRARY_KINDS.find((k) => k.kind === entry.kind).use),
            this.iconButton(playing ? 'stop' : 'play', playing ? 'Stop' : 'Play'),
            this.iconButton('rename', 'Rename'),
            this.iconButton('download', 'Download'),
            this.iconButton('remove', armed ? 'Delete for good?' : 'Delete', armed ? 'files-armed' : ''),
        );
        return cell;
    }

    iconButton(icon, label, className = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `action-btn files-icon-btn ${className}`.trim();
        // 'stop' is the play button wearing another face: one action name
        button.dataset.action = icon === 'stop' ? 'play' : icon;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.innerHTML = svg(icon);
        return button;
    }

    // ---- Events (delegated from the panel root) ------------------------

    bindDelegates() {
        this.bindEvent(this.el, 'click', (e) => {
            const button = e.target.closest('.files-icon-btn');
            const row = e.target.closest('.files-row');
            if (!row) return;
            const entry = this.entryOf(row.dataset);
            if (!entry) return;
            if (!button) {
                this.select(entry);
                return;
            }
            this.act(button.dataset.action, entry);
        });
        // A rename commits when the field loses focus, wherever focus goes
        this.bindEvent(this.el, 'focusout', (e) => {
            if (e.target.classList?.contains('files-name-input')) this.commitRename(e.target.value);
        });
        this.bindEvent(this.el, 'keydown', (e) => {
            if (!e.target.classList?.contains('files-name-input')) return;
            if (e.key === 'Enter') e.target.blur();
            else if (e.key === 'Escape') {
                const renaming = this.renaming;
                this.renaming = null;
                if (renaming) this.renderTable(renaming.kind);
            }
        });
    }

    async act(action, entry) {
        switch (action) {
            case 'use':
                await useEntry(entry);
                this.refresh();
                break;
            case 'play':
                await playEntry(entry, this.sameEntry(this.selected, entry) ? this.preview : null);
                this.syncPlayButtons();
                break;
            case 'rename':
                this.renaming = { kind: entry.kind, id: entry.id };
                this.renderTable(entry.kind);
                break;
            case 'download':
                await downloadEntry(entry);
                break;
            case 'remove':
                await this.remove(entry);
                break;
        }
    }

    /** First click arms, second deletes; the arming lapses on its own. */
    async remove(entry) {
        if (this.sameEntry(this.armed, entry)) {
            this.armed = null;
            clearTimeout(this.armTimer);
            await removeEntry(entry);
            this.refresh();
            return;
        }
        const previous = this.armed;
        this.armed = { kind: entry.kind, id: entry.id };
        clearTimeout(this.armTimer);
        if (previous && previous.kind !== entry.kind) this.renderTable(previous.kind);
        this.renderTable(entry.kind);
        this.armTimer = setTimeout(() => {
            const armed = this.armed;
            this.armed = null;
            if (armed) this.renderTable(armed.kind);
        }, ARM_MS);
    }

    async commitRename(value) {
        const renaming = this.renaming;
        if (!renaming) return;
        this.renaming = null;
        const entry = this.entryOf(renaming);
        if (!entry) return;
        await renameEntry(entry, value);
        this.refresh();
    }

    /** Only the play/stop faces changed — don't rebuild rows under a pointer. */
    syncPlayButtons() {
        for (const row of this.qAll('.files-row')) {
            const entry = this.entryOf(row.dataset);
            const button = row.querySelector('[data-action="play"]');
            if (!entry || !button) continue;
            const playing = isPlaying(entry);
            button.title = playing ? 'Stop' : 'Play';
            button.innerHTML = svg(playing ? 'stop' : 'play');
        }
    }

    // ---- Selection and preview ----------------------------------------

    async select(entry) {
        this.selected = entry ? { kind: entry.kind, id: entry.id } : null;
        this.markSelection();
        if (!entry) {
            this.preview = null;
            this.q('.files-preview-meta').textContent = 'Select a file to see it here.';
            this.sketch?.redraw();
            return;
        }
        this.q('.files-preview-meta').textContent = `${entry.name} — reading…`;
        const preview = await previewOf(entry);
        if (!this.sameEntry(this.selected, entry)) return; // another row won
        this.preview = preview;
        this.q('.files-preview-meta').textContent = preview
            ? `${entry.name} — ${entry.detail}${preview.sampleRate ? ` · ${(preview.sampleRate / 1000).toFixed(1)} kHz` : ''}`
            : `${entry.name} — nothing to draw`;
        this.sketch?.redraw();
    }

    markSelection() {
        for (const row of this.qAll('.files-row')) {
            const on = this.sameEntry(this.selected, row.dataset);
            row.classList.toggle('selected', on);
            row.setAttribute('aria-selected', String(on));
        }
    }

    drawPreview(ctx, sk) {
        drawWaveformFrame(ctx, sk.width, sk.height, {
            background: themeColor('--viz-bg'),
            grid: themeColor('--viz-grid'),
        });
        if (!this.preview) return;
        const trace = themeColor('--viz-trace');
        if (this.preview.table) drawCycle(ctx, this.preview.table, sk.width, sk.height, trace, 2);
        else if (this.preview.overview) drawOverview(ctx, this.preview.overview, sk.width, sk.height, trace);
    }

    // ---- Lookups ------------------------------------------------------

    /** The live entry behind a row's dataset (or a remembered selection). */
    entryOf(ref) {
        return ref ? (this.entries[ref.kind] || []).find((e) => e.id === ref.id) || null : null;
    }

    sameEntry(a, b) {
        return Boolean(a && b) && a.kind === b.kind && a.id === b.id;
    }
}

function svg(icon) {
    return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"
        stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg>`;
}

const UNITS = ['B', 'kB', 'MB', 'GB'];

function formatBytes(bytes) {
    let value = bytes || 0;
    let unit = 0;
    while (value >= 1024 && unit < UNITS.length - 1) { value /= 1024; unit++; }
    return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}
