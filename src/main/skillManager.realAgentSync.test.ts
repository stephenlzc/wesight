/**
 * Real-agent sync smoke test.
 *
 * This test uses a temp userData dir but the real HOME dir, so the Claude Code
 * sync target points to the actual ~/.claude/skills. It installs a uniquely
 * named skill, verifies a symlink/copy appears at ~/.claude/skills, then
 * deletes the skill and verifies cleanup.
 *
 * Run explicitly with:
 *   RUN_REAL_AGENT_SYNC=1 npx vitest run src/main/skillManager.realAgentSync.test.ts
 *
 * It is excluded from the default `npm test` suite to avoid mutating the
 * developer's agent directories during routine CI.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';

const runRealAgentSync = process.env.RUN_REAL_AGENT_SYNC === '1';
const testOrSkip = runRealAgentSync ? test : test.skip;

import { SkillSyncTargetKind } from '../shared/skills/constants';
import { SkillManager } from './skillManager';
import { SqliteStore } from './sqliteStore';

const skillId = `wesight-sync-verify-${Date.now()}`;
const realHome = os.homedir();
const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-real-sync-'));
const claudeTargetDir = path.join(realHome, '.claude', 'skills');
const claudeTarget = path.join(claudeTargetDir, skillId);
const sourceDir = path.join(os.tmpdir(), skillId);

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: (key: string) => {
      if (key === 'userData' || key === 'appData') return tmpUserData;
      if (key === 'home') return realHome;
      if (key === 'temp') return os.tmpdir();
      return tmpUserData;
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

let store: SqliteStore;
let manager: SkillManager;

beforeAll(() => {
  fs.mkdirSync(path.join(tmpUserData, 'SKILLs'), { recursive: true });
  store = SqliteStore.create(tmpUserData);
  manager = new SkillManager(() => store);
});

afterAll(() => {
  if (store) {
    try { store.close(); } catch { /* ignore */ }
  }
  fs.rmSync(tmpUserData, { recursive: true, force: true });
  // Safety: if the test skill is still in the real Claude dir, remove it.
  if (fs.existsSync(claudeTarget)) {
    fs.rmSync(claudeTarget, { recursive: true, force: true });
  }
});

testOrSkip('installs a skill and syncs it to the real ~/.claude/skills', async () => {
  // Prepare source skill with a deterministic directory name so the installed
  // skill id matches our expectation.
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(
    path.join(sourceDir, 'SKILL.md'),
    `---\nname: ${skillId}\nversion: 1.0.0\n---\n# ${skillId}\nReal-agent sync smoke test.\n`,
  );

  // Enable Claude Code sync target against the real home dir.
  manager.setSyncTargets([
    {
      id: 'claude-code',
      kind: SkillSyncTargetKind.ClaudeCode,
      label: 'Claude Code',
      path: claudeTargetDir,
      enabled: true,
      isCustom: false,
      builtIn: true,
    },
  ]);

  // Install and sync.
  const result = await manager.downloadSkill(sourceDir);
  expect(result.success).toBe(true);
  const record = result.skills?.find(s => s.id === skillId);
  expect(record).toBeTruthy();

  // Verify real target exists and is a symlink (macOS/Linux) or directory (Windows fallback).
  expect(fs.existsSync(claudeTarget)).toBe(true);
  const lstat = fs.lstatSync(claudeTarget);
  if (process.platform === 'win32') {
    expect(lstat.isDirectory() || lstat.isSymbolicLink()).toBe(true);
  } else {
    expect(lstat.isSymbolicLink()).toBe(true);
    const realSkillDir = fs.realpathSync(claudeTarget);
    const recordSkillDir = fs.realpathSync(path.dirname(record?.skillPath ?? ''));
    expect(realSkillDir).toBe(recordSkillDir);
  }

  // Delete and verify cleanup.
  await manager.deleteSkill(skillId);
  expect(fs.existsSync(claudeTarget)).toBe(false);

  fs.rmSync(sourceDir, { recursive: true, force: true });
});
