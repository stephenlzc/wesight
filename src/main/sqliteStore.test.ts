import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, expect, test, vi } from 'vitest';

import { ExternalAgentConfigSource } from '../shared/cowork/constants';
import { DB_FILENAME } from './appConstants';
import { SqliteStore } from './sqliteStore';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getPath: () => os.tmpdir(),
  },
}));

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrates the old Codex config source default to local CLI', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-sqlite-'));
  tempDirs.push(userDataDir);
  const dbPath = path.join(userDataDir, DB_FILENAME);
  const db = new BetterSqlite3(dbPath);
  const now = Date.now();
  db.exec(`
    CREATE TABLE kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE cowork_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db
    .prepare('INSERT INTO cowork_config (key, value, updated_at) VALUES (?, ?, ?)')
    .run('codexConfigSource', ExternalAgentConfigSource.WesightModel, now);
  db.close();

  const store = SqliteStore.create(userDataDir);
  const row = store
    .getDatabase()
    .prepare("SELECT value FROM cowork_config WHERE key = 'codexConfigSource'")
    .get() as { value: string } | undefined;
  const migrationFlag = store.get<string>('cowork.codexConfigSource.defaultLocalCli.v1.completed');
  store.close();

  expect(row?.value).toBe(ExternalAgentConfigSource.LocalCli);
  expect(migrationFlag).toBe('1');
});

test('skill_metadata table is created on first init', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-skill-metadata-'));
  tempDirs.push(userDataDir);
  const store = SqliteStore.create(userDataDir);

  const tableInfo = store.getDatabase()
    .pragma('table_info(skill_metadata)') as Array<{ name: string }>;
  const columns = tableInfo.map(c => c.name);

  expect(columns).toContain('id');
  expect(columns).toContain('source_type');
  expect(columns).toContain('installed_at');
  expect(columns).toContain('updated_at');
  expect(columns).toContain('sync_targets');
  expect(store.countSkillMetadata()).toBe(0);
  expect(store.isSkillMetadataMigrationComplete()).toBe(false);

  store.close();
});

test('skill_metadata upsert/get/list/delete lifecycle', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-skill-metadata-'));
  tempDirs.push(userDataDir);
  const store = SqliteStore.create(userDataDir);
  const now = Date.now();

  store.upsertSkillMetadata({
    id: 'github:acme/widget',
    name: 'Widget',
    version: '1.2.3',
    sourceType: 'github',
    sourceUrl: 'https://github.com/acme/widget',
    sourceRef: 'main',
    author: 'Acme',
    license: 'MIT',
    homepage: 'https://example.com',
    installedAt: now,
    updatedAt: now,
    dirty: false,
    syncTargets: [
      { agent: 'claude-code', path: '/home/x/.claude/skills/widget', mode: 'symlink' },
    ],
  });

  const fetched = store.getSkillMetadata('github:acme/widget');
  expect(fetched).toBeTruthy();
  expect(fetched?.sourceType).toBe('github');
  expect(fetched?.version).toBe('1.2.3');
  expect(fetched?.syncTargets).toHaveLength(1);
  expect(fetched?.syncTargets[0]).toEqual({
    agent: 'claude-code',
    path: '/home/x/.claude/skills/widget',
    mode: 'symlink',
  });

  expect(store.listSkillMetadata()).toHaveLength(1);

  // Update should overwrite
  store.upsertSkillMetadata({
    id: 'github:acme/widget',
    version: '1.2.4',
    updatedAt: now + 1000,
    sourceType: 'github',
    installedAt: now,
    syncTargets: [
      { agent: 'claude-code', path: '/home/x/.claude/skills/widget', mode: 'copy' },
      { agent: 'kimi', path: '/home/x/.kimi/skills/widget', mode: 'symlink' },
    ],
  });

  const updated = store.getSkillMetadata('github:acme/widget');
  expect(updated?.version).toBe('1.2.4');
  expect(updated?.syncTargets).toHaveLength(2);

  store.deleteSkillMetadata('github:acme/widget');
  expect(store.getSkillMetadata('github:acme/widget')).toBeNull();
  expect(store.listSkillMetadata()).toHaveLength(0);

  store.close();
});

test('skill_metadata migration flag persists across store instances', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-skill-metadata-'));
  tempDirs.push(userDataDir);

  const store = SqliteStore.create(userDataDir);
  expect(store.isSkillMetadataMigrationComplete()).toBe(false);
  store.markSkillMetadataMigrationComplete();
  expect(store.isSkillMetadataMigrationComplete()).toBe(true);
  store.close();

  const reopened = SqliteStore.create(userDataDir);
  expect(reopened.isSkillMetadataMigrationComplete()).toBe(true);
  reopened.close();
});

test('skill_metadata gracefully handles corrupted sync_targets JSON', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-skill-metadata-'));
  tempDirs.push(userDataDir);
  const store = SqliteStore.create(userDataDir);
  const now = Date.now();

  store.getDatabase()
    .prepare(`INSERT INTO skill_metadata
      (id, source_type, installed_at, updated_at, sync_targets)
      VALUES (?, ?, ?, ?, ?)`)
    .run('legacy-skill', 'unknown', now, now, '{not valid json');

  const fetched = store.getSkillMetadata('legacy-skill');
  expect(fetched).toBeTruthy();
  expect(fetched?.syncTargets).toEqual([]);

  store.close();
});

test('sync targets kv storage round-trips enabled state and filters malformed entries', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-sync-targets-'));
  tempDirs.push(userDataDir);
  const store = SqliteStore.create(userDataDir);

  // Empty by default
  expect(store.getSkillSyncTargets()).toEqual([]);
  expect(store.getSkillSyncTargetsFirstRunPrompted()).toBe(false);

  // Round-trip a valid list
  store.setSkillSyncTargets([
    {
      id: 'builtin-claude-code',
      kind: 'claude-code',
      label: 'Claude Code',
      path: '/home/test/.claude/skills',
      enabled: true,
      isCustom: false,
      builtIn: true,
    },
    {
      id: 'custom-extra',
      kind: 'custom',
      label: 'My Agent',
      path: '/opt/my-agent/skills',
      enabled: false,
      isCustom: true,
    },
  ]);
  const stored = store.getSkillSyncTargets();
  expect(stored).toHaveLength(2);
  expect(stored[0].id).toBe('builtin-claude-code');
  expect(stored[0].enabled).toBe(true);
  expect(stored[1].id).toBe('custom-extra');

  // First-run prompted flag
  store.setSkillSyncTargetsFirstRunPrompted(true);
  expect(store.getSkillSyncTargetsFirstRunPrompted()).toBe(true);

  store.close();
});

test('sync targets getter discards malformed entries from kv', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-sync-targets-bad-'));
  tempDirs.push(userDataDir);
  const store = SqliteStore.create(userDataDir);

  // Plant a junk entry directly into kv to simulate corruption / older version
  store.getDatabase()
    .prepare('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)')
    .run('skills.syncTargets', JSON.stringify([
      { id: 'good', kind: 'custom', label: 'Good', path: '/x', enabled: true, isCustom: true },
      { id: 'bad', kind: 'custom' /* missing fields */ },
      'not even an object',
      null,
    ]), Date.now());

  const stored = store.getSkillSyncTargets();
  expect(stored).toHaveLength(1);
  expect(stored[0].id).toBe('good');

  store.close();
});
