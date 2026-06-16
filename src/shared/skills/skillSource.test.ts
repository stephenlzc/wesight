/**
 * Tests for the shared SkillSource / SkillMetadata types used by the
 * unified Skill Manager's UI surface. These types are the contract
 * between the main process (skillMetadata rows) and the renderer
 * (skill-detail modal). Lock the shape so future field changes
 * require an intentional update here.
 */
import { expect, test } from 'vitest';

import type { SkillMetadata, SkillSource } from './constants';
import { SkillSourceType } from './constants';
import type { SkillSyncTargetEntry } from './types';

test('SkillSource accepts the minimum shape (type only)', () => {
  const source: SkillSource = { type: SkillSourceType.Unknown };
  expect(source.type).toBe('unknown');
});

test('SkillSource round-trips all optional fields', () => {
  const source: SkillSource = {
    type: SkillSourceType.GitHub,
    url: 'https://github.com/example/skill.git',
    ref: 'main',
    author: 'octocat',
    license: 'MIT',
  };
  expect(source).toEqual({
    type: 'github',
    url: 'https://github.com/example/skill.git',
    ref: 'main',
    author: 'octocat',
    license: 'MIT',
  });
});

test('SkillMetadata has the expected install/update timestamps', () => {
  const now = Date.now();
  const meta: SkillMetadata = {
    id: 'web-search',
    version: '1.0.0',
    sourceType: SkillSourceType.GitHub,
    sourceUrl: 'https://github.com/example/web-search.git',
    sourceRef: 'main',
    author: 'octocat',
    license: 'MIT',
    installedAt: now,
    updatedAt: now,
  };
  expect(meta.id).toBe('web-search');
  expect(meta.installedAt).toBe(now);
  expect(meta.updatedAt).toBe(now);
});

test('SkillMetadata can be populated with no source URL (legacy install)', () => {
  const meta: SkillMetadata = {
    id: 'legacy',
    sourceType: SkillSourceType.Unknown,
    installedAt: 0,
    updatedAt: 0,
  };
  expect(meta.sourceType).toBe('unknown');
  expect(meta.sourceUrl).toBeUndefined();
  expect(meta.installedAt).toBe(0);
});

test('SkillSourceType values are stable', () => {
  // The persisted sourceType values are stored in the skill_metadata
  // SQLite table. Changing any of these strings is a schema-breaking
  // change and must be paired with a migration.
  expect(SkillSourceType).toEqual({
    GitHub: 'github',
    Npm: 'npm',
    SkillHub: 'skillhub',
    ClawHub: 'clawhub',
    Zip: 'zip',
    Local: 'local',
    Unknown: 'unknown',
  });
});

test('SkillSyncTargetEntry accepts the minimum shape (agent + path + mode)', () => {
  const entry: SkillSyncTargetEntry = {
    agent: 'claude-code',
    path: '~/.claude/skills/web-search',
    mode: 'symlink',
  };
  expect(entry.agent).toBe('claude-code');
  expect(entry.path).toBe('~/.claude/skills/web-search');
  expect(entry.mode).toBe('symlink');
});
