// ESLint flat config (v9+). Minimal pragmatic rules — evita ruido en código existente.
// Strict rules para nuevos features se introducen gradualmente.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "migrations/**",
      "playwright-report*",
      "playwright-discovery.cjs",
      "test-results/**",
      ".env*",
      "screenshot-*.png",
      "tmp-*.ts",
      "docs/assets/**", // GitHub Pages bundle (minified, no lint)
      "docs/**/*.js", // any built JS under docs
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["client/**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        navigator: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        atob: "readonly",
        btoa: "readonly",
        encodeURIComponent: "readonly",
        decodeURIComponent: "readonly",
        Blob: "readonly",
        FormData: "readonly",
        File: "readonly",
        FileReader: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        MouseEvent: "readonly",
        KeyboardEvent: "readonly",
        FocusEvent: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLButtonElement: "readonly",
        Element: "readonly",
        Node: "readonly",
      },
    },
    settings: { react: { version: "detect" } },
    rules: {
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Pragmatic loosening — el código existente tiene muchos imports unused
    // (lucide icons), expression patterns en JSX, y aliases this. Convertimos
    // a warning para visibilidad sin bloquear; errores reales (no-undef,
    // hooks, etc.) siguen siendo errors.
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-this-alias": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-escape": "off",
      "no-control-regex": "off",
      "prefer-const": "warn",
    },
  },
  prettier, // último — desactiva reglas que chocan con Prettier.
];
