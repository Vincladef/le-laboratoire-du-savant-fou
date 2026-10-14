import { defineConfig } from '@playwright/test';
import { join } from 'node:path';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
const localDir = process.env.LAB_E2E_DIR || mkdtempSync(join(tmpdir(), 'laboratoire-e2e-'));
process.env.LAB_E2E_DIR = localDir;
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 12000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox'],
    },
  },
  webServer: [
    {
      command: 'npm run dev:api',
      url: 'http://127.0.0.1:3002/api/health',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        LAB_LOCAL: '1',
        LAB_LOCAL_DIR: localDir,
        AUTH_BASE_URL: 'http://localhost:5174',
        API_PORT: '3002',
      },
    },
    {
      command: 'npm run dev:web -- --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 60000,
      env: { DEV_API_PORT: '3002' },
    },
  ],
});
