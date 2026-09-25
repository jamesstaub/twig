import esbuild from "esbuild";

// The app. `splitting` is what makes a dynamic import a separate file:
// the panels most sessions never open (Presets, Settings) and the export
// codecs land in dist/chunks/ and are fetched on first use, not at boot.
esbuild.build({
    entryPoints: ["js/app.js"],
    bundle: true,
    splitting: true,
    outdir: "dist",
    entryNames: "app",
    chunkNames: "chunks/[name]-[hash]",
    format: "esm",
    minify: true,
    sourcemap: false,
    target: "es2020",
    logLevel: "info"
}).catch(() => process.exit(1));

// The gate worklet: its sources live in js/dsp/worklets/ + js/dsp/gate/
// (patterns and contours are shared with the app), and addModule() loads
// the bundle — one dependency-free file, as a worklet module must be on
// every runtime this ships to (jweb included).
esbuild.build({
    entryPoints: ["js/dsp/worklets/gate-processor.js"],
    bundle: true,
    outfile: "dist/gate-processor.js",
    format: "esm",
    minify: true,
    sourcemap: false,
    target: "es2020",
    logLevel: "info"
}).catch(() => process.exit(1));

// Plain hand-written CSS, no framework: esbuild bundles css/styles.css by
// resolving its @import chain (theme.css, base.css, every component file)
// into one minified file — no separate compile step needed first.
esbuild.build({
    entryPoints: ["css/styles.css"],
    bundle: true,
    outfile: "dist/styles-compiled.css",
    minify: true,
    logLevel: "info"
}).catch(() => process.exit(1));
