import { BaseController } from '../base/BaseController.js';
import { ToolbarComponent } from './ToolbarComponent.js';
import { SurfaceShellComponent } from './SurfaceShellComponent.js';
import { SideToggleComponent } from './SideToggleComponent.js';
import { SOURCE, SURFACES, surfaceState } from './surfaceState.js';
import { LAYOUT_MODE_CHANGED, SURFACE_CHANGED } from '../../events.js';

/**
 * Wires the surface toolbar and the side-column toggle to surfaceState,
 * and re-applies the shell (panel visibility + body attributes) whenever
 * the active surface, the side column, or the layout shell changes. The
 * toolbar can collapse (the embed band, where it costs a row of a very
 * short screen) — UI-only, held here: body.toolbar-collapsed.
 */
export class SurfacesController extends BaseController {

    constructor(toolbarSelector, shellSelector, sideToggleSelector) {
        super(toolbarSelector);
        this.shell = new SurfaceShellComponent(shellSelector);
        this.collapsed = false;
        // One per panel whose surfaces have a side column
        this.sideToggles = [...document.querySelectorAll(sideToggleSelector)].map((el) => {
            const toggle = new SideToggleComponent(el);
            toggle.onToggle = () => surfaceState.toggleSide();
            return toggle;
        });
    }

    createComponent(selector) {
        return new ToolbarComponent(selector);
    }

    getProps() {
        return {
            surfaces: SURFACES.map((s) => ({ ...s, showing: surfaceState.showing(s.id), independent: s.id === SOURCE })),
            active: surfaceState.active,
            sourceDocked: surfaceState.sourceDocked,
            collapsed: this.collapsed,
            visibleRoots: surfaceState.visibleRoots(),
            allRoots: surfaceState.allRoots(),
        };
    }

    update() {
        const props = super.update();
        this.shell.render(props);
        for (const toggle of this.sideToggles) toggle.render({ open: surfaceState.side });
        return props;
    }

    bindComponentEvents() {
        this.component.onSelect = (id) => surfaceState.show(id);
        this.component.onToggleCollapsed = () => {
            this.collapsed = !this.collapsed;
            document.body.classList.toggle('toolbar-collapsed', this.collapsed);
            this.update();
        };
    }

    bindExternalEvents() {
        document.addEventListener(SURFACE_CHANGED, () => this.update());
        document.addEventListener(LAYOUT_MODE_CHANGED, () => this.update());
    }
}
