import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import refresh from "eslint-plugin-react-refresh";
export default tseslint.config(
  { ignores: ["dist"] },
  {
    files: ["src/lib/request.js", "src/lib/mobileViewport.js"],
    ...js.configs.recommended,
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["public/sw.js"],
    ...js.configs.recommended,
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": hooks, "react-refresh": refresh },
    rules: {
      ...hooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
);
