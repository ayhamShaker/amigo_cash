import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // plain <a> links are intentional: every page is server-rendered and links work without JS
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-page-custom-font": "off",
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.property.name='$queryRawUnsafe']", message: "Use tagged $queryRaw so values are parameterised." },
        { selector: "CallExpression[callee.property.name='$executeRawUnsafe']", message: "Use tagged $executeRaw so values are parameterised." },
      ],
    },
  },
  {
    files: ["tests/**"],
    rules: { "no-restricted-syntax": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**", "prototype/**", "coverage/**"]),
]);
