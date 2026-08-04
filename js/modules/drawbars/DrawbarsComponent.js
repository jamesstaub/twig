import { AppState } from "../../config.js";
import { harmonicColor } from "../../theme.js";
import BaseComponent from "../base/BaseComponent.js";
import { calculateFrequency } from "../../utils.js";
import { DrawbarsActions } from "./drawbarsActions.js";
import { showStatus } from "../../domUtils.js";
import OvertoneSignalModalComponent from "../generic/modal/OvertoneSignalModalComponent.js";
import { openModal, closeModal } from "../generic/modal/modalActions.js";

const DRAWBAR_SLIDER_SELECTOR = ".drawbar-slider";

async function copyFrequency(freq) {
    const text = freq.toFixed(4).replace(/\.?0+$/, '');
    try {
        await navigator.clipboard.writeText(text);
        showStatus(`Copied ${text} Hz`, 'success');
    } catch {
        // Clipboard API unavailable (insecure context / embedded webview)
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        showStatus(ok ? `Copied ${text} Hz` : 'Copy failed', ok ? 'success' : 'error');
    }
}

export class DrawbarsComponent extends BaseComponent {

    constructor(elementId) {
        super(elementId);
        this.sliders = [];
    }

    render(props = {}) {
        this.el.innerHTML = "";
        this.sliders = [];

        this.setupDrawbars();
        this.updateDrawbarLabels(props.isSubharmonic);
    }

    /**
     * Called by BaseComponent AFTER render().
     */
    bindRenderedEvents() {
        this.sliders = this.qAll(DRAWBAR_SLIDER_SELECTOR);

        // Right-click on any drawbar: frequency context menu
        this.bindEvent(this.el, "contextmenu", (e) => {
            const drawbar = e.target.closest(".drawbar");
            if (!drawbar || drawbar.dataset.index === undefined) return;
            e.preventDefault();
            this.showContextMenu(Number(drawbar.dataset.index), e.clientX, e.clientY);
        });

        this.sliders.forEach(slider => {
            // Mouse / keyboard: use native range input event
            this.bindEvent(slider, "input", (e) => this.handleDrawbarChange(e));

            // Touch: custom vertical-drag handler.
            //
            // The slider is rotated -90deg in CSS so it renders vertically, but
            // the browser's native touch tracking uses the element's pre-rotation
            // coordinate space — meaning only a fraction of finger movement
            // registers. We bypass that entirely by:
            //   1. Attaching listeners to the wrapper (the visual 140×25px area)
            //      whose getBoundingClientRect() is already in screen coordinates.
            //   2. Mapping touchY directly to value (top = max, bottom = min).
            //   3. Calling preventDefault() to block container scroll.
            const wrapper = slider.parentElement; // .drawbar-input-wrapper

            let dragStartY = 0;
            let dragStartValue = 0;

            this.bindEvent(wrapper, "touchstart", (e) => {
                e.preventDefault();
                dragStartY = e.touches[0].clientY;
                dragStartValue = parseFloat(slider.value);
            }, { passive: false });

            this.bindEvent(wrapper, "touchmove", (e) => {
                e.preventDefault();
                const rect = wrapper.getBoundingClientRect();
                const touchY = e.touches[0].clientY;
                // Clamp touch within wrapper bounds, then map to [0, 1].
                // Top of wrapper = max (1), bottom = min (0).
                const clampedY = Math.max(rect.top, Math.min(rect.bottom, touchY));
                const newValue = 1 - (clampedY - rect.top) / rect.height;
                slider.value = newValue;
                slider.setAttribute("aria-valuenow", newValue);
                const index = Number(slider.dataset.index);
                this.onChange?.(index, newValue);
            }, { passive: false });
        });
    }

    setupDrawbars() {
        const numPartials = AppState.currentSystem.ratios.length;

        if (!Array.isArray(AppState.harmonicAmplitudes) ||
            AppState.harmonicAmplitudes.length !== numPartials) {

            AppState.harmonicAmplitudes = Array(numPartials).fill(0);
            AppState.harmonicAmplitudes[0] = 1.0;
        }

        for (let i = 0; i < numPartials; i++) {
            const value = AppState.harmonicAmplitudes[i];
            this.el.appendChild(this.createDrawbar(i, value));
        }
    }

    updateDrawbarLabels(isSubharmonic) {
        const labels = (isSubharmonic && AppState.currentSystem.subharmonicLabels)
            ? AppState.currentSystem.subharmonicLabels
            : AppState.currentSystem.labels;

        labels.forEach((txt, idx) => {
            const el = this.q(`#drawbar-label-${idx}`);
            this.updateContent(el, txt);
        });
    }

    createDrawbar(index, value) {
        const wrapper = document.createElement("div");
        wrapper.className = "drawbar";
        wrapper.dataset.index = index;
        // Color the drawbar like its partial's ring in the p5 tonewheel
        wrapper.style.setProperty("--drawbar-color", harmonicColor(index));
        // Disable browser touch handling for the entire drawbar column (label
        // area included) so our custom touch handler gets every gesture.
        wrapper.style.touchAction = 'pan-x';

        const label = document.createElement("span");
        label.className = "drawbar-label";
        label.id = `drawbar-label-${index}`;
        this.updateContent(label, AppState.currentSystem.labels[index] || "");

        const track = document.createElement("div");
        track.className = "drawbar-track";

        const slider = document.createElement("input");
        slider.type = "range";
        slider.className = "drawbar-slider";
        slider.min = "0";
        slider.max = "1";
        slider.step = "0.01";
        slider.value = value;
        slider.dataset.index = index;
        // Override CSS touch-action: pan-x so the browser doesn't intercept
        // the gesture before our touchstart fires.
        slider.style.touchAction = 'pan-x';

        const wrap = document.createElement("div");
        wrap.className = "drawbar-input-wrapper";
        wrap.append(track, slider);

        wrapper.append(label, wrap);
        return wrapper;
    }

    updateSingleDrawbar(index, value) {
        // rather than a full rerender, just set one slider value
        if (this.sliders[index]) {
            this.sliders[index].value = value;
        }
    }

    handleDrawbarChange(e) {

        const index = Number(e.target.dataset.index);
        const value = Number(e.target.value);

        this.onChange?.(index, value);
        e.target.setAttribute("aria-valuenow", value);
    }

    setValue(index, value) {
        if (this.sliders[index]) {
            this.sliders[index].value = value;
        }
    }

    showContextMenu(index, x, y) {
        this.closeContextMenu();

        const ratio = AppState.currentSystem.ratios[index];
        if (!(ratio > 0)) return;
        const freq = calculateFrequency(ratio);
        const freqLabel = `${freq.toFixed(freq >= 100 ? 2 : 3)} Hz`;

        const menu = document.createElement("div");
        menu.className = "drawbar-context-menu";

        const addItem = (label, action) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "drawbar-context-menu-item";
            btn.textContent = label;
            btn.addEventListener("click", () => {
                this.closeContextMenu();
                action();
            });
            menu.appendChild(btn);
        };

        addItem(`Copy Frequency (${freqLabel})`, () => copyFrequency(freq));
        addItem("Set as Fundamental", () => DrawbarsActions.setDrawbarAsFundamental(index));
        addItem("Overtone Settings", () => {
            const modal = new OvertoneSignalModalComponent(document.createElement('div'));
            openModal(modal, { index, onClose: () => closeModal() });
        });

        // Body-attached + fixed so the drawbar strip's overflow can't clip it
        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - rect.width - 4))}px`;
        menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - rect.height - 4))}px`;

        this._contextMenu = menu;
        this._menuDismiss = (e) => {
            if (!menu.contains(e.target)) this.closeContextMenu();
        };
        this._menuEsc = (e) => {
            if (e.key === "Escape") this.closeContextMenu();
        };
        // Defer so the opening right-click doesn't immediately dismiss
        setTimeout(() => {
            document.addEventListener("mousedown", this._menuDismiss);
            document.addEventListener("keydown", this._menuEsc);
        }, 0);
    }

    closeContextMenu() {
        if (this._contextMenu) {
            this._contextMenu.remove();
            this._contextMenu = null;
        }
        if (this._menuDismiss) {
            document.removeEventListener("mousedown", this._menuDismiss);
            this._menuDismiss = null;
        }
        if (this._menuEsc) {
            document.removeEventListener("keydown", this._menuEsc);
            this._menuEsc = null;
        }
    }

    teardown() {
        this.closeContextMenu();
        super.teardown();
    }
}
