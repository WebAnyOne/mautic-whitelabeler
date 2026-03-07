const { defineConfig } = require('@playwright/test');

const TEMP_DIR = '/tmp/mautic-whitelabeler-test';

module.exports = defineConfig({
  testDir: '.',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:8888',
    screenshot: 'on',
    headless: true,
  },
  webServer: {
    // Serve static test HTML files from TEMP_DIR (written by setup-mautic.sh).
    // We don't serve MAUTIC_PATH because Mautic PHP requires a database and crashes.
    command: `php -S localhost:8888 -t ${TEMP_DIR}`,
    url: 'http://localhost:8888/health.html',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
