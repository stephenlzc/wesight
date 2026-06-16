/**
 * Tests for skillMetadataSync orchestrator. Mirrors the shape of the
 * production module so it can run without booting Electron.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { SkillSourceType, SkillSyncTargetKind } from '../../../shared/skills/constants';

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'home') return os.homedir();
      return os.tmpdir();
    },
  },
}));

const mockDecideSyncMode = vi.fn(() => ({ mode: 'symlink' as const, reason: 'posix-symlink' }));
const mockApplySync = vi.fn();
const mockRemoveTarget = vi.fn();
const mockDetectConflict = vi.fn(() => ({ hasConflict: false, incomingSourceType: 'github' as const }));

vi.mock('../../skillSyncResolver', () => ({
  decideSyncMode: (...args: unknown[]) => mockDecideSyncMode(...args),
  applySync: (...args: unknown[]) => mockApplySync(...args),
  removeTarget: (...args: unknown[]) => mockRemoveTarget(...args),
  detectConflict: (...args: unknown[]) => mockDetectConflict(...args),
  defaultTargetPath: (kind: string) => path.join(os.tmpdir(), `mock-target-${kind}`),
  inspectTarget: () => ({ exists: false, isSymlink: false, isBrokenSymlink: false, isManaged: false }),
  detectWindowsDeveloperMode: () => false,
}));

interface FakeStore {
  data: Map<string, unknown>;
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T): void;
  delete(key: string): void;
  getSkillMetadata: (id: string) => { id: string; syncTargets: unknown[] } | null;
  upsertSkillMetadata: (row: { id: string; syncTargets: unknown[] }) => void;
  deleteSkillMetadata: (id: string) => void;
}

const createFakeStore = (): FakeStore => {
  const data = new Map<string, unknown>();
  return {
    data,
    get<T = unknown>(key: string): T | undefined {
      return data.get(key) as T | undefined;
    },
    set<T = unknown>(key: string, value: T): void {
      data.set(key, value);
    },
    delete(key: string): void {
      data.delete(key);
    },
    getSkillMetadata: vi.fn((id: string) => ({ id, syncTargets: [] })),
    upsertSkillMetadata: vi.fn(),
    deleteSkillMetadata: vi.fn(),
  };
};

import { SkillMetadataSync } from './skillMetadataSync';

const tempDirs: string[] = [];

beforeEach(() => {
  mockDecideSyncMode.mockClear();
  mockApplySync.mockClear();
  mockRemoveTarget.mockClear();
  mockDetectConflict.mockClear();
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('listTargets returns defaults when no overrides are stored', () => {
  const store = createFakeStore();
  const targets = SkillMetadataSync.listTargets(store as never);
  expect(targets).toHaveLength(4);
  expect(targets.map(t => t.kind)).toEqual([
    SkillSyncTargetKind.ClaudeCode,
    SkillSyncTargetKind.Kimi,
    SkillSyncTargetKind.OpenClaw,
    SkillSyncTargetKind.Codex,
  ]);
  expect(targets.every(t => t.enabled === false)).toBe(true);
});

test('saveTargets persists and listTargets merges overrides', () => {
  const store = createFakeStore();
  const customDir = path.join(os.tmpdir(), 'wesight-custom-target');
  fs.mkdirSync(customDir, { recursive: true });
  tempDirs.push(customDir);

  SkillMetadataSync.saveTargets(store as never, [
    {
      id: 'claude-code',
      label: 'Claude Code',
      kind: SkillSyncTargetKind.ClaudeCode,
      path: customDir,
      enabled: true,
    },
  ]);
  const restored = SkillMetadataSync.listTargets(store as never);
  const claude = restored.find(t => t.id === 'claude-code');
  expect(claude?.enabled).toBe(true);
  expect(claude?.path).toBe(customDir);
});

test('syncSkillToTargets is a no-op when no targets are enabled', () => {
  const store = createFakeStore();
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-meta-sync-'));
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: test\n---\nbody', 'utf8');
  tempDirs.push(skillDir);

  const outcomes = SkillMetadataSync.syncSkillToTargets(
    store as never,
    skillDir,
    'my-skill',
    SkillSourceType.GitHub,
  );
  expect(outcomes).toEqual([]);
  expect(mockApplySync).not.toHaveBeenCalled();
});

test('syncSkillToTargets calls applySync for each enabled target', () => {
  const store = createFakeStore();
  const claudeDir = path.join(os.tmpdir(), 'wesight-claude-target');
  fs.mkdirSync(claudeDir, { recursive: true });
  tempDirs.push(claudeDir);
  SkillMetadataSync.saveTargets(store as never, [
    {
      id: 'claude-code',
      label: 'Claude Code',
      kind: SkillSyncTargetKind.ClaudeCode,
      path: claudeDir,
      enabled: true,
    },
  ]);
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-meta-sync-'));
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: test\n---\nbody', 'utf8');
  tempDirs.push(skillDir);

  const outcomes = SkillMetadataSync.syncSkillToTargets(
    store as never,
    skillDir,
    'my-skill',
    SkillSourceType.GitHub,
  );
  expect(outcomes).toHaveLength(1);
  expect(outcomes[0].applied).toBe(true);
  expect(mockApplySync).toHaveBeenCalledTimes(1);
});

test('removeSkillFromTargets invokes removeTarget for each known target', () => {
  const store = createFakeStore();
  const dir = path.join(os.tmpdir(), 'wesight-remove-target');
  fs.mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  SkillMetadataSync.saveTargets(store as never, [
    {
      id: 'claude-code',
      label: 'Claude Code',
      kind: SkillSyncTargetKind.ClaudeCode,
      path: dir,
      enabled: false,
    },
  ]);
  SkillMetadataSync.removeSkillFromTargets(store as never, 'my-skill');
  expect(mockRemoveTarget).toHaveBeenCalledWith(path.join(dir, 'my-skill'));
});

test('first-install onboarding flag round-trips', () => {
  const store = createFakeStore();
  expect(SkillMetadataSync.isFirstInstallOnboarded(store as never)).toBe(false);
  SkillMetadataSync.markFirstInstallOnboarded(store as never);
  expect(SkillMetadataSync.isFirstInstallOnboarded(store as never)).toBe(true);
});

test('syncSkillToTargets invokes onConflict when target has a foreign entry with the same id', () => {
  const store = createFakeStore();
  store.set('skills.syncTargets.v1', [
    {
      id: 'claude-code',
      label: 'Claude Code',
      kind: SkillSyncTargetKind.ClaudeCode,
      path: path.join(os.tmpdir(), 'mock-target-claude-code'),
      enabled: true,
    },
  ]);
  mockDetectConflict.mockReturnValueOnce({
    hasConflict: true,
    reason: 'foreign-directory',
    existingSourceType: SkillSourceType.GitHub,
    incomingSourceType: SkillSourceType.Npm,
  });
  const onConflict = vi.fn();
  const onFailure = vi.fn();

  const outcomes = SkillMetadataSync.syncSkillToTargets(
    store as never,
    '/tmp/src',
    'skill-x',
    SkillSourceType.Npm,
    { onConflict, onFailure },
  );

  expect(mockApplySync).not.toHaveBeenCalled();
  expect(onConflict).toHaveBeenCalledTimes(1);
  expect(onConflict).toHaveBeenCalledWith(expect.objectContaining({
    conflict: expect.objectContaining({ reason: 'foreign-directory', existingSourceType: SkillSourceType.GitHub }),
  }));
  expect(onFailure).not.toHaveBeenCalled();
  expect(outcomes[0].skipped).toBe(true);
});

test('syncSkillToTargets invokes onFailure when applySync throws', () => {
  const store = createFakeStore();
  store.set('skills.syncTargets.v1', [
    {
      id: 'claude-code',
      label: 'Claude Code',
      kind: SkillSyncTargetKind.ClaudeCode,
      path: path.join(os.tmpdir(), 'mock-target-claude-code'),
      enabled: true,
    },
  ]);
  mockApplySync.mockImplementationOnce(() => {
    throw new Error('EPERM: symlink not permitted');
  });
  const onConflict = vi.fn();
  const onFailure = vi.fn();

  const outcomes = SkillMetadataSync.syncSkillToTargets(
    store as never,
    '/tmp/src',
    'skill-y',
    SkillSourceType.GitHub,
    { onConflict, onFailure },
  );

  expect(onConflict).not.toHaveBeenCalled();
  expect(onFailure).toHaveBeenCalledTimes(1);
  expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('EPERM') }));
  expect(outcomes[0].applied).toBe(false);
  expect(outcomes[0].error).toContain('EPERM');
});
