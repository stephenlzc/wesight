/**
 * Unit tests for the SkillManager metadata registry behaviors.
 *
 * SkillManager itself imports Electron APIs that cannot run under vitest,
 * so we test the registry's observable contract through:
 *  - the pure helper functions exposed via `__skillManagerTestUtils`
 *    (round-tripping metadata through rowToSkillSource)
 *  - the underlying SqliteStore CRUD/migration, which SkillManager methods
 *    delegate to without additional logic
 *
 * The combination proves that SkillManager's public registry surface
 * (getSkillMetadata, upsertSkillMetadata, deleteSkillMetadata,
 * migrateLegacySkills) will produce the same observable results when
 * wired up at runtime.
 */
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, expect, test, vi } from 'vitest';

import { SkillSourceType } from '../shared/skills/constants';
import { DB_FILENAME } from './appConstants';
import { __skillManagerTestUtils } from './skillManager';
import { SqliteStore } from './sqliteStore';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getPath: () => os.tmpdir(),
  },
}));

const { rowToSkillSource, classifySourceInput, detectSourceFromInput } = __skillManagerTestUtils;

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// rowToSkillSource round-trips with the SqliteStore
// ---------------------------------------------------------------------------

test('rowToSkillSource reads a freshly upserted row', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-registry-'));
  tempDirs.push(userDataDir);
  const store = SqliteStore.create(userDataDir);
  const now = Date.now();

  store.upsertSkillMetadata({
    id: 'demo-skill',
    name: 'Demo',
    version: '0.1.0',
    sourceType: SkillSourceType.GitHub,
    sourceUrl: 'https://github.com/acme/demo',
    sourceRef: 'main',
    author: 'Acme',
    license: 'MIT',
    homepage: 'https://demo.example.com',
    installedAt: now,
    updatedAt: now,
    syncTargets: [
      { agent: 'claude-code', path: '/home/x/.claude/skills/demo', mode: 'symlink' },
    ],
  });

  const row = store.getSkillMetadata('demo-skill');
  expect(row).toBeTruthy();
  const source = rowToSkillSource(row!);
  expect(source).toEqual({
    type: SkillSourceType.GitHub,
    url: 'https://github.com/acme/demo',
    ref: 'main',
    author: 'Acme',
    license: 'MIT',
    homepage: 'https://demo.example.com',
    installedAt: now,
    updatedAt: now,
  });

  store.close();
});

test('rowToSkillSource leaves optional fields undefined when missing', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-registry-'));
  tempDirs.push(userDataDir);
  const store = SqliteStore.create(userDataDir);

  store.upsertSkillMetadata({
    id: 'minimal',
    sourceType: SkillSourceType.Unknown,
    installedAt: 0,
    updatedAt: 0,
    syncTargets: [],
  });

  const source = rowToSkillSource(store.getSkillMetadata('minimal')!);
  expect(source.type).toBe(SkillSourceType.Unknown);
  expect(source.url).toBeUndefined();
  expect(source.ref).toBeUndefined();
  expect(source.author).toBeUndefined();
  expect(source.license).toBeUndefined();
  expect(source.homepage).toBeUndefined();

  store.close();
});

// ---------------------------------------------------------------------------
// classifySourceInput + detectSourceFromInput can be chained
// ---------------------------------------------------------------------------

test('classification + detector agree on a GitHub URL', () => {
  const url = 'https://github.com/acme/widget';
  const classification = classifySourceInput(url);
  expect(classification.type).toBe(SkillSourceType.GitHub);
  expect(classification.url).toBe(url);

  const source = detectSourceFromInput({
    raw: url,
    type: classification.type,
    url: classification.url,
    ref: classification.ref,
  });
  expect(source.type).toBe(SkillSourceType.GitHub);
  expect(source.url).toBe(url);
  expect(source.installedAt).toBeGreaterThan(0);
  expect(source.updatedAt).toBe(source.installedAt);
});

test('classification + detector agree on a SkillHub shorthand', () => {
  const classification = classifySourceInput('skillhub:docs-writer');
  expect(classification.type).toBe(SkillSourceType.SkillHub);

  const source = detectSourceFromInput({
    raw: 'skillhub:docs-writer',
    type: classification.type,
    url: classification.url,
  });
  expect(source.type).toBe(SkillSourceType.SkillHub);
  expect(source.url).toBe('skillhub:docs-writer');
});

test('classification falls back to unknown for empty input', () => {
  const classification = classifySourceInput('');
  expect(classification.type).toBe(SkillSourceType.Unknown);

  const source = detectSourceFromInput({
    raw: '',
    type: classification.type,
  });
  expect(source.type).toBe(SkillSourceType.Unknown);
  expect(source.url).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Registry CRUD through the SqliteStore (SkillManager delegates to this)
// ---------------------------------------------------------------------------

test('registry: insert → get → list → update → delete', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-registry-'));
  tempDirs.push(userDataDir);
  const store = SqliteStore.create(userDataDir);
  const now = Date.now();

  // insert
  store.upsertSkillMetadata({
    id: 'a',
    sourceType: SkillSourceType.GitHub,
    installedAt: now,
    updatedAt: now,
    syncTargets: [],
  });
  store.upsertSkillMetadata({
    id: 'b',
    sourceType: SkillSourceType.Npm,
    installedAt: now,
    updatedAt: now,
    syncTargets: [],
  });

  // get
  expect(store.getSkillMetadata('a')?.sourceType).toBe(SkillSourceType.GitHub);
  expect(store.getSkillMetadata('b')?.sourceType).toBe(SkillSourceType.Npm);
  expect(store.getSkillMetadata('missing')).toBeNull();

  // list (ordered by id)
  const list = store.listSkillMetadata();
  expect(list.map(r => r.id)).toEqual(['a', 'b']);

  // update (preserves installedAt, bumps updatedAt)
  store.upsertSkillMetadata({
    id: 'a',
    version: '1.0.0',
    sourceType: SkillSourceType.GitHub,
    installedAt: now,
    updatedAt: now + 1,
    syncTargets: [],
  });
  const updated = store.getSkillMetadata('a')!;
  expect(updated.version).toBe('1.0.0');
  expect(updated.installedAt).toBe(now);
  expect(updated.updatedAt).toBe(now + 1);

  // delete
  store.deleteSkillMetadata('a');
  expect(store.getSkillMetadata('a')).toBeNull();
  expect(store.listSkillMetadata().map(r => r.id)).toEqual(['b']);

  store.close();
});

test('registry: migration flag is one-shot', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-registry-'));
  tempDirs.push(userDataDir);
  const store = SqliteStore.create(userDataDir);
  expect(store.isSkillMetadataMigrationComplete()).toBe(false);

  store.markSkillMetadataMigrationComplete();
  expect(store.isSkillMetadataMigrationComplete()).toBe(true);

  // Subsequent insert/delete should not affect the flag.
  store.upsertSkillMetadata({
    id: 'x',
    sourceType: SkillSourceType.Local,
    installedAt: Date.now(),
    updatedAt: Date.now(),
    syncTargets: [],
  });
  expect(store.isSkillMetadataMigrationComplete()).toBe(true);

  store.close();
});

test('registry: sync_targets round-trip preserves order and modes', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-registry-'));
  tempDirs.push(userDataDir);
  const store = SqliteStore.create(userDataDir);

  const targets = [
    { agent: 'claude-code', path: '/a/.claude/skills/x', mode: 'symlink' as const },
    { agent: 'kimi', path: '/a/.kimi/skills/x', mode: 'copy' as const },
    { agent: 'codex', path: '/a/.codex/skills/x', mode: 'symlink' as const },
  ];

  store.upsertSkillMetadata({
    id: 'multi-target',
    sourceType: SkillSourceType.GitHub,
    installedAt: 0,
    updatedAt: 0,
    syncTargets: targets,
  });

  const fetched = store.getSkillMetadata('multi-target')!;
  expect(fetched.syncTargets).toEqual(targets);

  store.close();
});
