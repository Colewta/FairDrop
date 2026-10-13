import { defineConfig } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: './tests', timeout: 180000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5177', browserName: 'chromium', channel: 'msedge', headless: true, screenshot: 'only-on-failure' },
  webServer: [
    { command: `${process.platform === 'win32' ? 'venv\\Scripts\\python.exe' : 'venv/bin/python'} -m uvicorn app.main:app --host 127.0.0.1 --port 8017 --no-access-log`,
      cwd: '../Backend', url: 'http://127.0.0.1:8017/health', timeout: 120000,
      env: { FAIRDROP_STORAGE_DIR: path.resolve('test-results', `api-${Date.now()}`), FAIRDROP_API_TOKEN: '', FRONTEND_ORIGINS: 'http://127.0.0.1:5177' } },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5177', url: 'http://127.0.0.1:5177',
      env: { VITE_API_URL: 'http://127.0.0.1:8017' } },
  ],
});
