import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    // Duration math is epoch-ms; wall-clock mutation is the
    // calendar module's job alone (day/week boundaries in src/lib/dates.ts).
    ignores: ["src/lib/dates.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^set(Hours|Date|Month|FullYear|Minutes|Seconds|Milliseconds)$/]",
          message:
            "Wall-clock Date mutators live in src/lib/dates.ts only — use epoch-ms math or the dates module.",
        },
      ],
    },
  },
]);
