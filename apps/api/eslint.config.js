import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "storage/**", "apps/api/storage/**"],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-useless-escape": "off",
      "no-extra-boolean-cast": "off",
      "prefer-const": "off",
      "no-constant-condition": "off",
      "no-constant-binary-expression": "off",
      "preserve-caught-error": "off",
      "no-useless-assignment": "off",
    },
  },
];
