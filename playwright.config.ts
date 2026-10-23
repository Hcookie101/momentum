import type { PlaywrightTestConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const config: PlaywrightTestConfig = {
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://localhost:3100",
    // The app is prerendered/SSR'd; expect(...) auto-retries until loaded.
    // (`waitUntil` is a page.goto() option only — not a valid `use` key.)
  },
};

export default config;
