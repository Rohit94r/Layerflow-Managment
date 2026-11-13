import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "drizzle/**", "node_modules/**", ".playwright-mcp/**", "next-env.d.ts"] },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Module boundary (BUILD.md §4.2): UI never imports the database client directly.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/server/db", "**/server/db"], importNames: ["db"], message: "Use a module service instead of querying the database from UI code." },
          ],
        },
      ],
    },
  },
  {
    // Services, server helpers, route handlers and tests are allowed to use the database.
    files: ["src/modules/**", "src/server/**", "src/app/api/**", "src/test/**", "src/instrumentation.ts"],
    rules: { "no-restricted-imports": "off" },
  },
];

export default config;
