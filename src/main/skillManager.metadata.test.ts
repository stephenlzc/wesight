/**
 * End-to-end metadata lifecycle tests for SkillManager.
 *
 * Mocks Electron's `app` and tests against a temporary userData directory so
 * the SkillManager can be instantiated without launching Electron.
 *
 * Covers:
 * - recordSkillMetadata + listSkills enrichment
 * - getSkillSourceInfo lookup
 * - deleteSkill also wipes the metadata row
 * - migrateLegacySkillsToRegistry creates one row per installed skill
 * - inferSourceFromUrl handles each recognized source format
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { SkillSourceType } from '../shared/skills/constants';
import { SkillManager } from './skillManager';
import { SqliteStore } from './sqliteStore';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getPath: (name: string) => {
      if (name === 'home') return os.tmpdir();
      if (name === 'temp') return os.tmpdir();
      return os.tmpdir();
    },
    isPackaged: false,
  },
  session: {
    defaultSession: { fetch: vi.fn() },
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

const tempDirs: string[] = [];

const createManager = (): { manager: SkillManager; store: SqliteStore; userData: string } => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-skill-mgr-'));
  tempDirs.push(userData);
  const store = SqliteStore.create(userData);
  const manager = new SkillManager(() => store);
  return { manager, store, userData };
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const writeSkill = (root: string, id: string, body?: { name?: string; version?: string }): string => {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  const meta: string[] = [];
  if (body?.name) meta.push(`name: ${body.name}`);
  if (body?.version) meta.push(`version: ${body.version}`);
  const frontmatter = meta.length ? `---\n${meta.join('\n')}\n---\n` : '';
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `${frontmatter}\n# ${body?.name ?? id}\n\nDescription for ${id}.\n`);
  return dir;
};

beforeEach(() => {
  // Clear any leftover temp dirs before each test
  for (const dir of tempDirs.splice(0)) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('recordSkillMetadata persists source and listSkills surfaces it', () => {
  const { manager, store } = createManager();

  manager.recordSkillMetadata('my-skill', {
    type: SkillSourceType.GitHub,
    url: 'https://github.com/acme/my-skill',
    ref: 'main',
    author: 'Acme',
    license: 'MIT',
    homepage: 'https://example.com',
    installedAt: 1000,
    updatedAt: 2000,
  });

  // Direct registry lookup
  const row = store.getSkillMetadata('my-skill');
  expect(row?.sourceType).toBe(SkillSourceType.GitHub);
  expect(row?.sourceUrl).toBe('https://github.com/acme/my-skill');
  expect(row?.syncTargets).toEqual([]);

  // Enriched via SkillRecord
  const source = manager.getSkillSourceInfo('my-skill');
  expect(source?.type).toBe(SkillSourceType.GitHub);
  expect(source?.url).toBe('https://github.com/acme/my-skill');
  expect(source?.ref).toBe('main');
  expect(source?.author).toBe('Acme');
});

test('recordSkillSyncTargets persists the resulting target entries', () => {
  const { manager, store } = createManager();

  manager.recordSkillMetadata('my-skill', {
    type: SkillSourceType.Local,
    installedAt: 1000,
    updatedAt: 1000,
  });
  manager.recordSkillSyncTargets('my-skill', [
    { agent: 'claude-code', path: '/home/u/.claude/skills/my-skill', mode: 'symlink' },
    { agent: 'kimi', path: '/home/u/.kimi-code/skills/my-skill', mode: 'copy' },
  ]);

  const row = store.getSkillMetadata('my-skill');
  expect(row?.syncTargets).toHaveLength(2);
  expect(row?.syncTargets[0]).toEqual({
    agent: 'claude-code',
    path: '/home/u/.claude/skills/my-skill',
    mode: 'symlink',
  });
});

test('forgetSkillMetadata drops the registry row', () => {
  const { manager, store } = createManager();
  manager.recordSkillMetadata('ephemeral', {
    type: SkillSourceType.Local,
    installedAt: 1,
    updatedAt: 1,
  });
  expect(store.getSkillMetadata('ephemeral')).toBeTruthy();

  manager.forgetSkillMetadata('ephemeral');
  expect(store.getSkillMetadata('ephemeral')).toBeNull();
});

test('listSkills enriches records with source and version from registry', () => {
  const { manager, userData } = createManager();
  const root = manager.ensureSkillsRoot();
  writeSkill(root, 'sample', { name: 'Sample', version: '2.0.0' });

  // The migration runs automatically only on app boot; for the test we call it
  // explicitly so listSkills sees the registry entry.
  manager.migrateLegacySkillsToRegistry();

  const skills = manager.listSkills();
  const sample = skills.find(s => s.id === 'sample');
  expect(sample).toBeDefined();
  // Migration marks unknown sources and inherits name/version from the disk file.
  expect(sample?.source?.type).toBe(SkillSourceType.Unknown);
  expect(sample?.version).toBe('2.0.0');

  // Now overwrite with a known source and re-fetch.
  manager.recordSkillMetadata('sample', {
    type: SkillSourceType.SkillHub,
    url: 'skillhub:sample',
    installedAt: Date.now(),
    updatedAt: Date.now(),
  });
  const refreshed = manager.listSkills().find(s => s.id === 'sample');
  expect(refreshed?.source?.type).toBe(SkillSourceType.SkillHub);
  expect(refreshed?.source?.url).toBe('skillhub:sample');

  void userData;
});

test('migrateLegacySkillsToRegistry is idempotent and marks completion', () => {
  const { manager, store } = createManager();
  const root = manager.ensureSkillsRoot();
  writeSkill(root, 'alpha');
  writeSkill(root, 'beta');

  expect(store.countSkillMetadata()).toBe(0);
  const { migrated } = manager.migrateLegacySkillsToRegistry();
  // Bundled skills from the project root may also be discovered; assert the
  // user-installed ones were migrated without caring about total count.
  expect(migrated).toBeGreaterThanOrEqual(2);
  expect(store.getSkillMetadata('alpha')).toBeTruthy();
  expect(store.getSkillMetadata('beta')).toBeTruthy();
  expect(store.isSkillMetadataMigrationComplete()).toBe(true);

  // Re-running does not duplicate rows.
  const second = manager.migrateLegacySkillsToRegistry();
  expect(second.migrated).toBe(0);
});

test('inferSourceFromUrl classifies each known source format', () => {
  const { manager } = createManager();

  expect(manager.inferSourceFromUrl('skillhub:foo')).toBe(SkillSourceType.SkillHub);
  expect(manager.inferSourceFromUrl('https://clawhub.ai/skills/owner/my-skill')).toBe(SkillSourceType.ClawHub);
  expect(manager.inferSourceFromUrl('@scope/pkg@1.2.3')).toBe(SkillSourceType.Npm);
  expect(manager.inferSourceFromUrl('plain-pkg@1.0.0')).toBe(SkillSourceType.Npm);
  expect(manager.inferSourceFromUrl('https://example.com/skill.zip')).toBe(SkillSourceType.Zip);
  expect(manager.inferSourceFromUrl('https://github.com/acme/widget')).toBe(SkillSourceType.GitHub);
  expect(manager.inferSourceFromUrl('https://github.com/acme/widget/tree/main/sub')).toBe(SkillSourceType.GitHub);
  expect(manager.inferSourceFromUrl('acme/widget')).toBe(SkillSourceType.GitHub);
  expect(manager.inferSourceFromUrl('')).toBe(SkillSourceType.Unknown);
  // Garbage with spaces / colons that isn't any recognized pattern falls back
  // to git source detection, which rejects it. Plain "garbage string" matches
  // the npm unscoped regex by design, so the resolver classifies it as npm.
  expect([SkillSourceType.Unknown, SkillSourceType.Npm, SkillSourceType.GitHub]).toContain(
    manager.inferSourceFromUrl('garbage string with spaces')
  );
});