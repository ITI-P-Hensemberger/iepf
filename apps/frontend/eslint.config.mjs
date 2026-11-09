import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // New in eslint-config-next 16.4. The existing data loading breaks these rules in many
    // files: keep them visible as warnings until docs/TODO.md item 25 replaces that pattern.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    // An unused import is a leftover from a change: fail the lint, as the backend does.
    rules: {
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated from the backend OpenAPI document (pnpm --filter iepf-backend run api:types).
    "lib/api/schema.ts",
    // Playwright output.
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
