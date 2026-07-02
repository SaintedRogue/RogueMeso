import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Zepp OS mini-app: its own ecosystem (@zos/* runtime globals, zeus bundler) — not
    // part of the Next.js toolchain. See zepp-beacon/README.md.
    "zepp-beacon/**",
  ]),
]);

export default eslintConfig;
