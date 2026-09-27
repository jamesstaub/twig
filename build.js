import esbuild from "esbuild";
import { rmSync } from "node:fs";

/**
 * The whole build, and the only description of it. `node build.js` builds
 * once; `node build.js --watch` rebuilds on change and is what `npm run
 * dev` uses — the watch used to be a SECOND copy of these settings as
 * esbuild CLI flags in package.json, which drifted the moment the CSS
 * needed `external` for the self-hosted fonts and failed to resolve them.
 * One config, two modes.
 */
const watch = process.argv.includes("--watch");

// Chunk names carry a content hash, so every build would otherwise leave
// the previous build's chunks behind in dist/
rmSync("dist/chunks", { recursive: true, force: true });

const BUILDS = [
    // The app. `splitting` is what makes a dynamic import a separate file:
    // the panels most sessions never open (Presets, Settings) and the export
    // codecs land in dist/chunks/ and are fetched on first use, not at boot.
    {
        entryPoints: ["js/app.js"],
        bundle: true,
        splitting: true,
        outdir: "dist",
        entryNames: "app",
        chunkNames: "chunks/[name]-[hash]",
        format: "esm",
        target: "es2020",
    },

    // The gate worklet: its sources live in js/dsp/worklets/ + js/dsp/gate/
    // (patterns and contours are shared with the app), and addModule() loads
    // the bundle — one dependency-free file, as a worklet module must be on
    // every runtime this ships to (jweb included).
    {
        entryPoints: ["js/dsp/worklets/gate-processor.js"],
        bundle: true,
        outfile: "dist/gate-processor.js",
        format: "esm",
        target: "es2020",
    },

    // Plain hand-written CSS, no framework: esbuild bundles css/styles.css by
    // resolving its @import chain (theme.css, base.css, every component file)
    // into one minified file — no separate compile step needed first.
    {
        entryPoints: ["css/styles.css"],
        bundle: true,
        outfile: "dist/styles-compiled.css",
        // The self-hosted font files are served from assets/, not bundled:
        // left external, their url() passes through to the stylesheet as
        // written (esbuild otherwise reads `/assets/…` as a filesystem path)
        external: ["/assets/*"],
    },
];

// Shipped output is minified with no sourcemap; a watch is for reading, so
// it trades those the other way. Nothing else differs between the two.
const mode = watch
    ? { minify: false, sourcemap: true, logLevel: "info" }
    : { minify: true, sourcemap: false, logLevel: "info" };

try {
    for (const config of BUILDS) {
        const options = { ...config, ...mode };
        if (watch) {
            const context = await esbuild.context(options);
            await context.watch();
        } else {
            await esbuild.build(options);
        }
    }
    if (watch) console.log("watching js, worklet and css…");
} catch {
    process.exit(1);
}
