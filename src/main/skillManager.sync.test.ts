/**
 * Tests for the cross-agent sync core methods on SkillManager:
 * - listSyncTargets / setSyncTargets
 * - syncSkillToTargets (symlink, copy mode, conflict handling)
 * - removeSkillFromTargets
 * - syncAllSkillsToTargets
 *
 * Built-in (bundled) skills must be excluded from sync. The resolver and
 * store are exercised end-to-end against temporary directories so the
 * tests reflect real filesystem behavior.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { SkillSourceType, SkillSyncConflictDecision, SkillSyncFailureDecision, SkillSyncMode, SkillSyncTargetKind } from '../shared/skills/constants';
import { SkillManager } from './skillManager';
import { SqliteStore } from './sqliteStore';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: (key: string) => {
      if (key === 'userData') return path.join(process.cwd(), '.tmp-sync-core', 'userData');
      if (key === 'home') return path.join(process.cwd(), '.tmp-sync-core', 'home');
      if (key === 'temp') return os.tmpdir();
      return path.join(process.cwd(), '.tmp-sync-core', key);
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

const tempDirs: string[] = [];
let store: SqliteStore;

const createManager = (): SkillManager => {
  const userData = path.join(process.cwd(), '.tmp-sync-core', 'userData', `u-${tempDirs.length}`);
  fs.mkdirSync(userData, { recursive: true });
  tempDirs.push(userData);
  store = SqliteStore.create(userData);
  return new SkillManager(() => store);
};

const writeSkill = (root: string, id: string): string => {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${id}\nversion: 1.0.0\n---\nBody for ${id}\n`);
  return dir;
};

const seedTargetConfig = (manager: SkillManager, homeDir: string) => {
  manager.setSyncTargets([
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
      enabled: false,
      isCustom: false,
      builtIn: true,
    },
  ]);
};

beforeEach(() => {
  fs.rmSync(path.join(process.cwd(), '.tmp-sync-core'), { recursive: true, force: true });
  fs.mkdirSync(path.join(process.cwd(), '.tmp-sync-core', 'userData'), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), '.tmp-sync-core', 'home'), { recursive: true });
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
  fs.rmSync(path.join(process.cwd(), '.tmp-sync-core'), { recursive: true, force: true });
});

test('listSyncTargets returns the configured target list', () => {
  const mgr = createManager();
  const homeDir = path.join(process.cwd(), '.tmp-sync-core', 'home');
  seedTargetConfig(mgr, homeDir);
  const targets = mgr.listSyncTargets();
  expect(targets).toHaveLength(2);
  expect(targets[0].id).toBe('claude-code');
  expect(targets[0].enabled).toBe(true);
  expect(targets[1].id).toBe('kimi');
  expect(targets[1].enabled).toBe(false);
});

test('syncSkillToTargets creates symlinks for each enabled target', async () => {
  const mgr = createManager();
  const homeDir = path.join(process.cwd(), '.tmp-sync-core', 'home');
  const skillRoot = path.join(process.cwd(), '.tmp-sync-core', 'userData', 'SKILLs');
  fs.mkdirSync(skillRoot, { recursive: true });
  writeSkill(skillRoot, 'demo');

  seedTargetConfig(mgr, homeDir);
  mgr.recordSkillMetadata('demo', { type: SkillSourceType.GitHub, url: 'https://github.com/x/demo' });

  const result = await mgr.syncSkillToTargets('demo');
  expect(result.attempts).toHaveLength(1);
  expect(result.attempts[0].success).toBe(true);
  expect(result.attempts[0].mode).toBe(SkillSyncMode.Symlink);

  // The symlink should now exist on disk pointing into the skill root.
  const targetPath = path.join(homeDir, '.claude', 'skills', 'demo');
  expect(fs.existsSync(path.join(targetPath, 'SKILL.md'))).toBe(true);
  const lstat = fs.lstatSync(targetPath);
  expect(lstat.isSymbolicLink()).toBe(true);

  // Metadata should now record the synced target.
  const meta = store.getSkillMetadata('demo');
  expect(meta?.syncTargets).toHaveLength(1);
  expect(meta?.syncTargets[0].agent).toBe(SkillSyncTargetKind.ClaudeCode);
});

test('syncSkillToTargets is a no-op when no targets are enabled', async () => {
  const mgr = createManager();
  const homeDir = path.join(process.cwd(), '.tmp-sync-core', 'home');
  const skillRoot = path.join(process.cwd(), '.tmp-sync-core', 'userData', 'SKILLs');
  fs.mkdirSync(skillRoot, { recursive: true });
  writeSkill(skillRoot, 'demo');

  // Disable both targets by configuring them with enabled=false.
  mgr.setSyncTargets([
    {
      id: 'claude-code',
      kind: SkillSyncTargetKind.ClaudeCode,
      label: 'Claude Code',
      path: path.join(homeDir, '.claude', 'skills'),
      enabled: false,
      isCustom: false,
      builtIn: true,
    },
    {
      id: 'kimi',
      kind: SkillSyncTargetKind.Kimi,
      label: 'Kimi CLI',
      path: path.join(homeDir, '.kimi-code', 'skills'),
      enabled: false,
      isCustom: false,
      builtIn: true,
    },
  ]);
  mgr.recordSkillMetadata('demo', { type: SkillSourceType.GitHub });

  const result = await mgr.syncSkillToTargets('demo');
  expect(result.attempts).toEqual([]);
});

test('syncSkillToTargets is safe to call with an unknown skill when no targets are enabled', async () => {
  const mgr = createManager();
  const homeDir = path.join(process.cwd(), '.tmp-sync-core', 'home');
  mgr.setSyncTargets([
    {
      id: 'claude-code',
      kind: SkillSyncTargetKind.ClaudeCode,
      label: 'Claude Code',
      path: path.join(homeDir, '.claude', 'skills'),
      enabled: false,
      isCustom: false,
      builtIn: true,
    },
  ]);
  const result = await mgr.syncSkillToTargets('definitely-not-a-skill');
  expect(result.attempts).toEqual([]);
});

test('syncSkillToTargets invokes resolveConflict callback for foreign directory', async () => {
  const mgr = createManager();
  const homeDir = path.join(process.cwd(), '.tmp-sync-core', 'home');
  const skillRoot = path.join(process.cwd(), '.tmp-sync-core', 'userData', 'SKILLs');
  fs.mkdirSync(skillRoot, { recursive: true });
  writeSkill(skillRoot, 'demo');
  seedTargetConfig(mgr, homeDir);
  mgr.recordSkillMetadata('demo', { type: SkillSourceType.GitHub });

  // Pre-populate the target directory with a foreign folder.
  const targetDir = path.join(homeDir, '.claude', 'skills', 'demo');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'SKILL.md'), 'foreign content');

  let conflictSeen: { agent: string; incoming: string; existing?: string } | null = null;
  const result = await mgr.syncSkillToTargets('demo', {
    resolveConflict: (_id, conflict) => {
      conflictSeen = {
        agent: conflict.agent as string,
        incoming: conflict.incomingSourceType,
        existing: conflict.existingSourceType,
      };
      return SkillSyncConflictDecision.Skip;
    },
  });

  expect(conflictSeen).not.toBeNull();
  expect(conflictSeen?.incoming).toBe(SkillSourceType.GitHub);
  expect(result.attempts[0].success).toBe(false);
  expect(result.attempts[0].reason).toBe('user-skipped');

  // The foreign directory should still exist (we skipped).
  expect(fs.existsSync(path.join(targetDir, 'SKILL.md'))).toBe(true);
});

test('syncSkillToTargets invokes resolveConflict and replaces when user chooses Replace', async () => {
  const mgr = createManager();
  const homeDir = path.join(process.cwd(), '.tmp-sync-core', 'home');
  const skillRoot = path.join(process.cwd(), '.tmp-sync-core', 'userData', 'SKILLs');
  fs.mkdirSync(skillRoot, { recursive: true });
  writeSkill(skillRoot, 'demo');
  seedTargetConfig(mgr, homeDir);
  mgr.recordSkillMetadata('demo', { type: SkillSourceType.GitHub });

  const targetDir = path.join(homeDir, '.claude', 'skills', 'demo');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'old.md'), 'stale');

  const result = await mgr.syncSkillToTargets('demo', {
    resolveConflict: () => SkillSyncConflictDecision.Replace,
  });
  expect(result.attempts[0].success).toBe(true);

  // The replaced symlink should now point to the new source.
  expect(fs.existsSync(path.join(targetDir, 'SKILL.md'))).toBe(true);
  expect(fs.existsSync(path.join(targetDir, 'old.md'))).toBe(false);
});

test('syncSkillToTargets modeOverride forces copy mode', async () => {
  const mgr = createManager();
  const homeDir = path.join(process.cwd(), '.tmp-sync-core', 'home');
  const skillRoot = path.join(process.cwd(), '.tmp-sync-core', 'userData', 'SKILLs');
  fs.mkdirSync(skillRoot, { recursive: true });
  writeSkill(skillRoot, 'demo');
  seedTargetConfig(mgr, homeDir);
  mgr.recordSkillMetadata('demo', { type: SkillSourceType.Local });

  const result = await mgr.syncSkillToTargets('demo', {
    modeOverride: SkillSyncMode.Copy,
  });
  expect(result.attempts[0].mode).toBe(SkillSyncMode.Copy);
  expect(result.attempts[0].success).toBe(true);

  const targetPath = path.join(homeDir, '.claude', 'skills', 'demo');
  const lstat = fs.lstatSync(targetPath);
  expect(lstat.isSymbolicLink()).toBe(false);
  expect(lstat.isDirectory()).toBe(true);
});

test('removeSkillFromTargets unlinks synced entries', async () => {
  const mgr = createManager();
  const homeDir = path.join(process.cwd(), '.tmp-sync-core', 'home');
  const skillRoot = path.join(process.cwd(), '.tmp-sync-core', 'userData', 'SKILLs');
  fs.mkdirSync(skillRoot, { recursive: true });
  writeSkill(skillRoot, 'demo');
  seedTargetConfig(mgr, homeDir);
  mgr.recordSkillMetadata('demo', { type: SkillSourceType.GitHub });

  await mgr.syncSkillToTargets('demo');
  const targetPath = path.join(homeDir, '.claude', 'skills', 'demo');
  expect(fs.existsSync(targetPath)).toBe(true);

  const result = mgr.removeSkillFromTargets('demo');
  expect(result.attempts).toHaveLength(1);
  expect(result.attempts[0].success).toBe(true);
  expect(fs.existsSync(targetPath)).toBe(false);

  // Metadata should have cleared sync_targets.
  const meta = store.getSkillMetadata('demo');
  expect(meta?.syncTargets).toEqual([]);
});

test('removeSkillFromTargets is a no-op for unsynced skills', () => {
  const mgr = createManager();
  mgr.recordSkillMetadata('demo', { type: SkillSourceType.GitHub });
  const result = mgr.removeSkillFromTargets('demo');
  expect(result.attempts).toEqual([]);
});

test('syncAllSkillsToTargets syncs every user-installed skill', async () => {
  const mgr = createManager();
  const homeDir = path.join(process.cwd(), '.tmp-sync-core', 'home');
  const skillRoot = path.join(process.cwd(), '.tmp-sync-core', 'userData', 'SKILLs');
  fs.mkdirSync(skillRoot, { recursive: true });
  writeSkill(skillRoot, 'demo-a');
  writeSkill(skillRoot, 'demo-b');
  seedTargetConfig(mgr, homeDir);
  mgr.recordSkillMetadata('demo-a', { type: SkillSourceType.GitHub });
  mgr.recordSkillMetadata('demo-b', { type: SkillSourceType.Npm });

  const summary = await mgr.syncAllSkillsToTargets();
  expect(summary.synced).toBe(2);
  expect(summary.results).toHaveLength(2);
  expect(summary.results.every(r => r.attempts[0]?.success)).toBe(true);
});

test('resolveSyncConflict replays sync with the chosen decision', async () => {
  const mgr = createManager();
  const homeDir = path.join(process.cwd(), '.tmp-sync-core', 'home');
  const skillRoot = path.join(process.cwd(), '.tmp-sync-core', 'userData', 'SKILLs');
  fs.mkdirSync(skillRoot, { recursive: true });
  writeSkill(skillRoot, 'demo');
  seedTargetConfig(mgr, homeDir);
  mgr.recordSkillMetadata('demo', { type: SkillSourceType.GitHub });

  const targetDir = path.join(homeDir, '.claude', 'skills', 'demo');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'old.md'), 'stale');

  const result = await mgr.resolveSyncConflict('demo', SkillSyncTargetKind.ClaudeCode, SkillSyncConflictDecision.Replace);
  expect(result.attempts[0].success).toBe(true);
  expect(fs.existsSync(path.join(targetDir, 'SKILL.md'))).toBe(true);
  expect(fs.existsSync(path.join(targetDir, 'old.md'))).toBe(false);
});
