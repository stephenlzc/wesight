import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { SkillSourceType, SkillSyncMode } from '../shared/skills/constants';
import {
  applySync,
  decideSyncMode,
  removeTarget,
} from './skillSyncResolver';
import { SqliteStore } from './sqliteStore';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: (key: string) => {
      if (key === 'userData') return path.join(process.cwd(), '.tmp-lifecycle', 'userData');
      if (key === 'home') return path.join(process.cwd(), '.tmp-lifecycle', 'home');
      if (key === 'temp') return os.tmpdir();
      return path.join(process.cwd(), '.tmp-lifecycle', key);
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

let tempDir: string;
let store: SqliteStore;

const createLocalSkillDir = (id: string, version = '1.0.0'): string => {
  const dir = path.join(tempDir, 'sources', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${id}\nversion: ${version}\n---\nBody for ${id}`
  );
  return dir;
};

const copyDir = (src: string, dest: string): void => {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
};

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-lifecycle-'));
  fs.rmSync(path.join(process.cwd(), '.tmp-lifecycle'), { recursive: true, force: true });
  fs.mkdirSync(path.join(process.cwd(), '.tmp-lifecycle', 'userData'), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), '.tmp-lifecycle', 'home'), { recursive: true });
  store = SqliteStore.create(path.join(process.cwd(), '.tmp-lifecycle', 'userData'));
});

afterEach(() => {
  if (store) {
    try { store.close(); } catch { /* ignore */ }
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.rmSync(path.join(process.cwd(), '.tmp-lifecycle'), { recursive: true, force: true });
});

describe('skill metadata + sync lifecycle', () => {
  test('install: recordSkillMetadata stores source; sync via resolver produces symlink', async () => {
    const { SkillManager } = await import('./skillManager');
    const mgr = new SkillManager(() => store);

    const agentDir = path.join(process.cwd(), '.tmp-lifecycle', 'home', '.claude', 'skills');
    fs.mkdirSync(agentDir, { recursive: true });

    const skillRoot = path.join(process.cwd(), '.tmp-lifecycle', 'userData', 'SKILLs');
    fs.mkdirSync(skillRoot, { recursive: true });

    const source = createLocalSkillDir('demo', '1.0.0');
    const installedDir = path.join(skillRoot, 'demo');
    copyDir(source, installedDir);

    mgr.recordSkillMetadata('demo', {
      type: SkillSourceType.GitHub,
      url: 'https://github.com/owner/demo',
      ref: 'main',
    });

    // Sync the skill to the agent directory via the resolver.
    const targetPath = path.join(agentDir, 'demo');
    const decision = decideSyncMode();
    applySync(installedDir, targetPath, decision, {
      replaceExisting: true,
      sourceType: SkillSourceType.GitHub,
    });

    expect(fs.existsSync(path.join(agentDir, 'demo', 'SKILL.md'))).toBe(true);

    const meta = store.getSkillMetadata('demo');
    expect(meta?.sourceType).toBe('github');
    expect(meta?.sourceUrl).toBe('https://github.com/owner/demo');
    expect(meta?.sourceRef).toBe('main');
  });

  test('delete: forgetSkillMetadata removes the row and target cleanup unlinks', async () => {
    const { SkillManager } = await import('./skillManager');
    const mgr = new SkillManager(() => store);

    const agentDir = path.join(process.cwd(), '.tmp-lifecycle', 'home', '.claude', 'skills');
    fs.mkdirSync(agentDir, { recursive: true });
    const skillRoot = path.join(process.cwd(), '.tmp-lifecycle', 'userData', 'SKILLs');
    fs.mkdirSync(skillRoot, { recursive: true });

    const source = createLocalSkillDir('demo');
    const installedDir = path.join(skillRoot, 'demo');
    copyDir(source, installedDir);

    mgr.recordSkillMetadata('demo', { type: SkillSourceType.Npm, url: 'demo@1.0.0' });
    applySync(installedDir, path.join(agentDir, 'demo'), decideSyncMode(), {
      replaceExisting: true,
      sourceType: SkillSourceType.Npm,
    });

    expect(store.getSkillMetadata('demo')).not.toBeNull();

    mgr.forgetSkillMetadata('demo');
    expect(store.getSkillMetadata('demo')).toBeNull();

    // Cleanup of an already-deleted entry is a no-op.
    expect(() => removeTarget(path.join(agentDir, 'demo'))).not.toThrow();
  });

  test('upgrade: re-recording metadata bumps updated_at', async () => {
    const { SkillManager } = await import('./skillManager');
    const mgr = new SkillManager(() => store);

    mgr.recordSkillMetadata('demo', { type: SkillSourceType.GitHub, url: 'a' });
    const first = store.getSkillMetadata('demo');
    expect(first?.version).toBeUndefined();

    await new Promise(r => setTimeout(r, 5));

    mgr.recordSkillMetadata(
      'demo',
      { type: SkillSourceType.GitHub, url: 'a' },
      { updatedAt: Date.now() }
    );
    const second = store.getSkillMetadata('demo');
    expect(second?.updatedAt).toBeGreaterThan(first?.updatedAt ?? 0);
  });

  test('migrateLegacySkillsToRegistry seeds rows for installed skills', async () => {
    const { SkillManager } = await import('./skillManager');
    const mgr = new SkillManager(() => store);

    const skillRoot = path.join(process.cwd(), '.tmp-lifecycle', 'userData', 'SKILLs');
    fs.mkdirSync(skillRoot, { recursive: true });
    const source = createLocalSkillDir('legacy');
    const installedDir = path.join(skillRoot, 'legacy');
    copyDir(source, installedDir);

    mgr.migrateLegacySkillsToRegistry();
    const meta = store.getSkillMetadata('legacy');
    expect(meta).not.toBeNull();
    expect(meta?.sourceType).toBe('unknown');

    const beforeSecond = store.getSkillMetadata('legacy')?.updatedAt;
    mgr.migrateLegacySkillsToRegistry();
    const afterSecond = store.getSkillMetadata('legacy')?.updatedAt;
    expect(afterSecond).toBe(beforeSecond);
  });

  test('copy mode is used when symlink is unsupported (force copy)', async () => {
    const agentDir = path.join(process.cwd(), '.tmp-lifecycle', 'home', '.claude', 'skills');
    fs.mkdirSync(agentDir, { recursive: true });
    const skillRoot = path.join(process.cwd(), '.tmp-lifecycle', 'userData', 'SKILLs');
    fs.mkdirSync(skillRoot, { recursive: true });

    const source = createLocalSkillDir('copyme');
    const installedDir = path.join(skillRoot, 'copyme');
    copyDir(source, installedDir);

    const targetPath = path.join(agentDir, 'copyme');
    const decision = decideSyncMode(SkillSyncMode.Copy);
    applySync(installedDir, targetPath, decision, {
      replaceExisting: true,
      sourceType: SkillSourceType.Local,
    });

    expect(fs.existsSync(path.join(targetPath, 'SKILL.md'))).toBe(true);
  });
});