import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// The tests run in Chromium (Chrome, Edge), Firefox and WebKit (Safari), through Playwright.
export default defineConfig({
    test: {
        browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
        },
    },
});
