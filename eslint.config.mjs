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
    // Vendored minified opus-recorder encoder worker (served statically).
    "public/opus/**",
    // Standalone Node service, own package.json/tsconfig, own build —
    // not part of this Next.js app's TS project, so type-aware rules
    // silently no-op on it anyway; non-type-aware rules (e.g.
    // react-hooks/rules-of-hooks misfiring on a `use*`-named function
    // that isn't a React hook) don't know that and do fire.
    "services/**",
  ]),
]);

export default eslintConfig;
