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
