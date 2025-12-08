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

// Minify the already-generated styles-compiled.css from Tailwind
esbuild.build({
    entryPoints: ["css/styles-compiled.css"],
    bundle: false,
    outfile: "dist/styles-compiled.css",
    minify: true,
    logLevel: "info"
}).catch(() => process.exit(1));
