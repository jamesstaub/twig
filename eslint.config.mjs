import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // Frontend files use browser globals
  {
    files: ["index.html", "js/**/*.{js,mjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.browser }
  },
  // Node server and CJS files use Node globals
  {
    files: ["server.js", "**/*.cjs"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.node }
  }
]);
