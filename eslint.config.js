import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        Bun: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["error", {
        "args": "none",
        "varsIgnorePattern": "^_",
        "caughtErrors": "none"
      }],
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["error", "always"],
      "curly": ["error", "all"],
      "semi": ["error", "always"],
      "quotes": ["error", "double", { "avoidEscape": true }],
      "comma-dangle": ["error", "never"],
      "object-curly-spacing": ["error", "always"],
      "array-bracket-spacing": ["error", "never"],
      "comma-spacing": ["error", { "before": false, "after": true }],
      "keyword-spacing": ["error", { "before": true, "after": true }],
      "space-before-blocks": ["error", "always"],
      "space-before-function-paren": ["error", "always"],
      "space-infix-ops": "error",
      "no-trailing-spaces": "error",
      "no-multiple-empty-lines": ["error", { "max": 1 }],
      "indent": ["error", 2],
      "no-duplicate-imports": "error",
      "no-unreachable": "error"
    }
  },
  {
    files: ["test.js"],
    rules: {
      "no-console": "off"
    }
  },
  {
    files: ["index.js"],
    rules: {
      "no-undef": "off"
    }
  },
  {
    ignores: [
      "node_modules/",
      "bun.lock",
      "package-lock.json"
    ]
  }
];