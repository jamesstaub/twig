import { surfaceState } from '../surfaces/surfaceState.js';

/**
 * The Settings surface's own lazy mount. The panel is built the first time
 * anything asks for it — the toolbar, the recorder's ⚙, or one of the
 * "manage files" entries in the oscillator menu and the Convolution panel.
 *
 * It lives here rather than in ui.js so that the callers, which ui.js
 * itself imports, can reach Settings without importing ui.js back: that
 * cycle is what splitting the bundle has to pay for.
 */

let mounting = null;

/** Build the panel once; resolves with the controller. */
export function mountSettings() {
    if (!mounting) {
        mounting = import('./settingsController.js').then(({ SettingsController }) => {
            const controller = new SettingsController('#settings-control-root');
            controller.init();
            return controller;
        });
    }
    return mounting;
}

/** Show the Settings surface on a tab ('midi' | 'recorder' | 'files'). */
export async function openSettings(tab) {
    surfaceState.show('settings');
    (await mountSettings()).selectTab(tab);
}
