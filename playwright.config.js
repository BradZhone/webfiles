// @ts-check
const { defineConfig } = require('@playwright/test');

/**
 * Playwright configuration for WebFiles.
 *
 * Starts a dedicated test server on port 18765 with WEBFILES_NOAUTH=1
 * so tests can run without authentication.
 */
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:18765',
    trace: 'on-first-retry',
  },

  webServer: {
    command: 'WEBFILES_NOAUTH=1 WEBFILES_PORT=18765 node server.js',
    url: 'http://localhost:18765/login',
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
    stdout: 'ignore',
    stderr: 'pipe',
  },

  projects: [
    {
      name: 'api',
      testMatch: /api\.spec\.js/,
    },
    {
      name: 'ui',
      testMatch: /vault-ui\.spec\.js/,
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
});
