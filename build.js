import esbuild from "esbuild";

esbuild.build({
    entryPoints: ["js/app.js"],
    bundle: true,
    outfile: "dist/app.js",
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
