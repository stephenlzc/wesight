/**
 * Performance benchmarks for the unified skill manager.
 *
 * These tests are not strict regressions — they record baseline timings so
 * future changes can be compared. They run against real filesystem/SQLite
 * but use temp directories to avoid polluting the developer's machine.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { SkillSourceType, SkillSyncTargetKind } from '../shared/skills/constants';
import { SkillManager } from './skillManager';
import { SqliteStore } from './sqliteStore';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: (key: string) => {
      if (key === 'userData') return path.join(process.cwd(), '.tmp-perf', 'userData');
      if (key === 'home') return path.join(process.cwd(), '.tmp-perf', 'home');
      if (key === 'temp') return os.tmpdir();
      return path.join(process.cwd(), '.tmp-perf', key);
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

const tempDirs: string[] = [];
let store: SqliteStore;

const createManager = (): SkillManager => {
  const userData = path.join(process.cwd(), '.tmp-perf', 'userData', `u-${tempDirs.length}`);
  fs.mkdirSync(userData, { recursive: true });
  tempDirs.push(userData);
  store = SqliteStore.create(userData);
  return new SkillManager(() => store);
};

const writeSkill = (root: string, id: string): void => {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${id}\nversion: 1.0.0\n---\nBody for ${id}\n`);
};

beforeEach(() => {
  fs.rmSync(path.join(process.cwd(), '.tmp-perf'), { recursive: true, force: true });
  fs.mkdirSync(path.join(process.cwd(), '.tmp-perf', 'userData'), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), '.tmp-perf', 'home'), { recursive: true });
});

afterEach(() => {
  if (store) {
    try { store.close(); } catch { /* ignore */ }
  }
  for (const dir of tempDirs.splice(0)) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  fs.rmSync(path.join(process.cwd(), '.tmp-perf'), { recursive: true, force: true });
});

function measureMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

async function measureMsAsync(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

test('metadata registry: record 100 skill metadata rows', () => {
  const mgr = createManager();
  const ms = measureMs(() => {
    for (let i = 0; i < 100; i += 1) {
      mgr.recordSkillMetadata(`skill-${i}`, {
        type: SkillSourceType.GitHub,
        url: `https://github.com/example/skill-${i}`,
      });
    }
  });
  expect(ms).toBeLessThan(500);
  console.log(`[Perf] record 100 metadata rows: ${ms.toFixed(2)}ms`);
});

test('metadata registry: list 1000 skill metadata rows', () => {
  const mgr = createManager();
  for (let i = 0; i < 1000; i += 1) {
    mgr.recordSkillMetadata(`skill-${i}`, { type: SkillSourceType.Local });
  }
  const ms = measureMs(() => {
    mgr.listSkillMetadata();
  });
  expect(ms).toBeLessThan(100);
  console.log(`[Perf] list 1000 metadata rows: ${ms.toFixed(2)}ms`);
});

test('sync targets: reconcile 50 sync targets', () => {
  const mgr = createManager();
  const homeDir = path.join(process.cwd(), '.tmp-perf', 'home');
  const overrides = Array.from({ length: 50 }, (_, i) => ({
    id: `custom-${i}`,
    kind: SkillSyncTargetKind.Custom,
    label: `Custom ${i}`,
    path: path.join(homeDir, `custom-agent-${i}`, 'skills'),
    enabled: i % 2 === 0,
    isCustom: true,
  }));
  const ms = measureMs(() => {
    mgr.setSyncTargets(overrides);
  });
  expect(ms).toBeLessThan(100);
  console.log(`[Perf] reconcile 50 sync targets: ${ms.toFixed(2)}ms`);
});

test('sync: sync 20 skills to 3 enabled targets (symlink)', async () => {
  const mgr = createManager();
  const homeDir = path.join(process.cwd(), '.tmp-perf', 'home');
  const skillRoot = path.join(process.cwd(), '.tmp-perf', 'userData', 'SKILLs');
  fs.mkdirSync(skillRoot, { recursive: true });

  mgr.setSyncTargets([
    {
      id: 'claude-code',
      kind: SkillSyncTargetKind.ClaudeCode,
      label: 'Claude Code',
      path: path.join(homeDir, '.claude', 'skills'),
      enabled: true,
      isCustom: false,
      builtIn: true,
    },
    {
      id: 'kimi',
      kind: SkillSyncTargetKind.Kimi,
      label: 'Kimi CLI',
      path: path.join(homeDir, '.kimi-code', 'skills'),
      enabled: true,
      isCustom: false,
      builtIn: true,
    },
    {
      id: 'codex',
      kind: SkillSyncTargetKind.Codex,
      label: 'Codex CLI',
      path: path.join(homeDir, '.codex', 'skills'),
      enabled: true,
      isCustom: false,
      builtIn: true,
    },
  ]);

  for (let i = 0; i < 20; i += 1) {
    const id = `skill-${i}`;
    writeSkill(skillRoot, id);
    mgr.recordSkillMetadata(id, { type: SkillSourceType.GitHub });
  }

  const ms = await measureMsAsync(async () => {
    for (let i = 0; i < 20; i += 1) {
      await mgr.syncSkillToTargets(`skill-${i}`);
    }
  });
  expect(ms).toBeLessThan(2000);
  console.log(`[Perf] sync 20 skills to 3 targets: ${ms.toFixed(2)}ms`);
});

test('sync resolver: detect existing target 1000 times', async () => {
  const mgr = createManager();
  const homeDir = path.join(process.cwd(), '.tmp-perf', 'home');
  const targetPath = path.join(homeDir, '.claude', 'skills', 'demo');
  fs.mkdirSync(targetPath, { recursive: true });
  fs.writeFileSync(path.join(targetPath, 'SKILL.md'), '---\nname: demo\n---\n');

  const skillRoot = path.join(process.cwd(), '.tmp-perf', 'userData', 'SKILLs');
  fs.mkdirSync(skillRoot, { recursive: true });
  writeSkill(skillRoot, 'demo');
  mgr.recordSkillMetadata('demo', { type: SkillSourceType.GitHub });

  const ms = await measureMsAsync(async () => {
    for (let i = 0; i < 1000; i += 1) {
      await mgr.syncSkillToTargets('demo');
    }
  });
  expect(ms).toBeLessThan(5000);
  console.log(`[Perf] detect existing target 1000x: ${ms.toFixed(2)}ms`);
});
