#!/usr/bin/env node
/**
 * Screenshot helper for the Skill Manager PR.
 *
 * Builds the production renderer + electron bundles, launches Electron,
 * opens Settings > Skill Sync, and captures screenshots for the PR description.
 *
 * Requires a globally installed playwright reachable via NODE_PATH:
 *   NODE_PATH=$(npm root -g) node scripts/screenshot-skill-manager.mjs
 */
import { spawn } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs', 'res', 'skill-manager-screenshots');
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-screenshot-home-'));
fs.mkdirSync(outDir, { recursive: true });

const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');

async function build() {
  console.log('[screenshot] building production bundles...');
  await new Promise((resolve, reject) => {
    const proc = spawn('npm', ['run', 'build'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`build exited ${code}`))));
  });
}

async function main() {
  await build();

  const isMac = process.platform === 'darwin';
  const electronExe = isMac
    ? path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
    : path.join(root, 'node_modules', 'electron', 'dist', 'electron');

  console.log('[screenshot] launching electron...');
  const app = await electron.launch({
    executablePath: electronExe,
    args: [path.join(root, 'dist-electron', 'main.js')],
    cwd: root,
    env: {
      ...process.env,
      HOME: tmpHome,
      NODE_ENV: 'production',
    },
  });

  try {
    const window = await app.firstWindow();
    window.on('console', (msg) => console.log('[electron:console]', msg.type(), msg.text()));
    await window.waitForLoadState('domcontentloaded', { timeout: 60000 });
    await window.waitForTimeout(2000);

    // Screenshot 1: main window.
    await window.screenshot({ path: path.join(outDir, '01-main-window.png') });
    console.log('[screenshot] 01-main-window.png');

    // Open Settings by clicking the sidebar button.
    await window.locator('text=Settings').click();
    await window.waitForTimeout(1200);

    // Screenshot 2: Settings modal open.
    await window.screenshot({ path: path.join(outDir, '02-settings-open.png') });
    console.log('[screenshot] 02-settings-open.png');

    // Click the "Skill Sync" tab (English locale in fresh HOME).
    const skillSyncTab = window.locator('text=Skill Sync');
    if (await skillSyncTab.count()) {
      await skillSyncTab.click();
      await window.waitForTimeout(1000);
      await window.screenshot({ path: path.join(outDir, '03-sync-targets-settings.png') });
      console.log('[screenshot] 03-sync-targets-settings.png');
    } else {
      console.log('[screenshot] Skill Sync tab not found, skipping');
    }

    // Close settings and navigate to Skills.
    await window.locator('text=Cancel').click();
    await window.waitForTimeout(500);
    await window.locator('text=Skills').click();
    await window.waitForTimeout(1000);
    await window.screenshot({ path: path.join(outDir, '04-skills-list.png') });
    console.log('[screenshot] 04-skills-list.png');
  } finally {
    await app.close();
    try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  console.log('[screenshot] done:', outDir);
}

main().catch((error) => {
  console.error('[screenshot] failed:', error);
  process.exit(1);
});
