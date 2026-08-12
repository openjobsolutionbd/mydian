// ESLint কনফিগ — শুধু bug ধরার জন্য, style/formatting নিয়ম নেই।
// প্রতি push-এর আগে scripts/verify.py এটা চালায়।
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["app.js", "js/api.js", "js/cache.js", "js/tree.js"],
    // js/editor.js ইচ্ছাকৃতভাবে বাদ — ওটা bundled+minified থার্ড-পার্টি
    // লাইব্রেরি কোড, নিজেদের লেখা কোড না, lint করার দরকার নেই।
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        fetch: "readonly",
        console: "readonly",
        alert: "readonly",
        confirm: "readonly",
        FormData: "readonly",
        FileReader: "readonly",
        URL: "readonly",
        Blob: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        btoa: "readonly",
        atob: "readonly",
        indexedDB: "readonly",
        CSS: "readonly",
      },
    },
    rules: {
      // no-unused-vars ডিফল্টে "error", কিন্তু function argument-এ
      // ব্যবহার না হওয়া "err"/"e" (catch block) খুবই সাধারণ প্যাটার্ন —
      // সেগুলোতে warning যথেষ্ট, error না।
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      // ফাইলের নাম sanitize করতে ইচ্ছাকৃতভাবে control character বাদ
      // দেওয়া হয় (sanitizeFilename) — এটা bug না, প্যাটার্ন বন্ধ রাখা হলো।
      "no-control-regex": "off",
    },
  },
  {
    files: ["worker/worker.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        Response: "readonly",
        Request: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        console: "readonly",
        URL: "readonly",
        btoa: "readonly",
        atob: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
    },
  },
];
