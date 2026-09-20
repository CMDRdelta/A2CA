export default [
  {
    files: ["resources/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        window: "readonly", document: "readonly", location: "readonly", navigator: "readonly",
        console: "readonly", URL: "readonly", URLSearchParams: "readonly", Blob: "readonly",
        FileReader: "readonly", Headers: "readonly", AbortController: "readonly", fetch: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly",
        Image: "readonly", XMLSerializer: "readonly", DOMParser: "readonly", TextDecoder: "readonly",
        TextEncoder: "readonly", crypto: "readonly", alert: "readonly", confirm: "readonly",
        requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly", sessionStorage: "readonly",
        A2CA: "readonly", $3Dmol: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-redeclare": "error",
      "no-unused-vars": ["warn", {"args": "none", "caughtErrors": "none"}]
    }
  }
];
