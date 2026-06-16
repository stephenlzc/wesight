/**
 * Unit tests for marketplace source parsers and metadata registry helpers
 * in skillManager.ts.
 *
 * Pure utility functions are pulled from `__skillManagerTestUtils` because
 * the main module imports Electron APIs which cannot run under vitest.
 * Parsers that don't depend on Electron are mirrored inline (kept short).
 */
import { expect, test } from 'vitest';

import { SkillSourceType } from '../shared/skills/constants';
import { __skillManagerTestUtils } from './skillManager';

const { compareVersions, rowToSkillSource, detectSourceFromInput, classifySourceInput } = __skillManagerTestUtils;

// ---------------------------------------------------------------------------
// Mirror of parseClawhubUrl from skillManager.ts
// ---------------------------------------------------------------------------

const parseClawhubUrl = (source: string): { name: string } | null => {
  try {
    const url = new URL(source);
    if (url.hostname !== 'clawhub.ai' && url.hostname !== 'www.clawhub.ai') return null;
    const segments = url.pathname.split('/').filter(Boolean);
    // Format: /skills/{owner}/{name}
    if (segments.length >= 3 && segments[0] === 'skills') {
      return { name: segments[2] };
    }
    // Format: /skills/{name}
    if (segments.length >= 2 && segments[0] === 'skills') {
      return { name: segments[1] };
    }
    // Format: /{owner}/{name} (no /skills/ prefix)
    if (segments.length >= 2) {
      return { name: segments[1] };
    }
    return null;
  } catch {
    return null;
  }
};

const parseSkillHubSource = (source: string): { slug: string } | null => {
  const trimmed = source.trim();
  if (trimmed.startsWith('skillhub:')) {
    const slug = trimmed.slice('skillhub:'.length).trim();
    return slug ? { slug } : null;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (!['skillhub.lol', 'www.skillhub.lol', 'skillhub.club', 'www.skillhub.club'].includes(host)) {
      return null;
    }
    const segments = url.pathname.split('/').filter(Boolean);
    const skillIndex = segments.indexOf('skills');
    if (skillIndex < 0 || !segments[skillIndex + 1]) {
      return null;
    }
    return { slug: decodeURIComponent(segments[skillIndex + 1]) };
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// /{owner}/{name} format
// ---------------------------------------------------------------------------

test('clawhub: /{owner}/{name} extracts skill name', () => {
  expect(parseClawhubUrl('https://clawhub.ai/steipete/slack')).toEqual({ name: 'slack' });
});

test('clawhub: /{owner}/{name} with www prefix', () => {
  expect(parseClawhubUrl('https://www.clawhub.ai/steipete/slack')).toEqual({ name: 'slack' });
});

test('clawhub: /{owner}/{name} with trailing slash', () => {
  expect(parseClawhubUrl('https://clawhub.ai/anthropic/web-search/')).toEqual({ name: 'web-search' });
});

// ---------------------------------------------------------------------------
// /skills/{owner}/{name} format
// ---------------------------------------------------------------------------

test('clawhub: /skills/{owner}/{name} extracts skill name', () => {
  expect(parseClawhubUrl('https://clawhub.ai/skills/steipete/slack')).toEqual({ name: 'slack' });
});

test('clawhub: /skills/{owner}/{name} with trailing slash', () => {
  expect(parseClawhubUrl('https://clawhub.ai/skills/anthropic/web-search/')).toEqual({ name: 'web-search' });
});

// ---------------------------------------------------------------------------
// /skills/{name} format
// ---------------------------------------------------------------------------

test('clawhub: /skills/{name} extracts skill name', () => {
  expect(parseClawhubUrl('https://clawhub.ai/skills/slack')).toEqual({ name: 'slack' });
});

// ---------------------------------------------------------------------------
// Rejected inputs
// ---------------------------------------------------------------------------

test('clawhub: non-clawhub hostname returns null', () => {
  expect(parseClawhubUrl('https://github.com/steipete/slack')).toBeNull();
});

test('clawhub: root path returns null', () => {
  expect(parseClawhubUrl('https://clawhub.ai/')).toBeNull();
});

test('clawhub: single segment path returns null', () => {
  expect(parseClawhubUrl('https://clawhub.ai/about')).toBeNull();
});

test('clawhub: invalid URL returns null', () => {
  expect(parseClawhubUrl('not-a-url')).toBeNull();
});

test('clawhub: empty string returns null', () => {
  expect(parseClawhubUrl('')).toBeNull();
});

test('skillhub: scheme source extracts slug', () => {
  expect(parseSkillHubSource('skillhub:docs-writer')).toEqual({ slug: 'docs-writer' });
});

test('skillhub: web URL extracts slug', () => {
  expect(parseSkillHubSource('https://skillhub.lol/skills/docs-writer')).toEqual({ slug: 'docs-writer' });
});

test('skillhub: API host URL extracts slug', () => {
  expect(parseSkillHubSource('https://skillhub.club/skills/docs-writer')).toEqual({ slug: 'docs-writer' });
});

test('skillhub: non-skillhub input returns null', () => {
  expect(parseSkillHubSource('https://github.com/owner/repo')).toBeNull();
});

// ---------------------------------------------------------------------------
// compareVersions
// ---------------------------------------------------------------------------

test('compareVersions: equal versions return 0', () => {
  expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
});

test('compareVersions: major wins over minor', () => {
  expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
  expect(compareVersions('1.9.9', '2.0.0')).toBe(-1);
});

test('compareVersions: minor wins over patch', () => {
  expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
});

test('compareVersions: missing segments are treated as 0', () => {
  expect(compareVersions('1.0', '1.0.0')).toBe(0);
  expect(compareVersions('1.0.1', '1.0')).toBe(1);
});

test('compareVersions: non-numeric segments are treated as 0', () => {
  expect(compareVersions('1.x.0', '1.0.0')).toBe(0);
});

// ---------------------------------------------------------------------------
// rowToSkillSource
// ---------------------------------------------------------------------------

test('rowToSkillSource: maps all fields', () => {
  const now = Date.now();
  const source = rowToSkillSource({
    id: 'foo',
    sourceType: 'github',
    sourceUrl: 'https://github.com/a/b',
    sourceRef: 'main',
    author: 'Alice',
    license: 'MIT',
    homepage: 'https://example.com',
    installedAt: now,
    updatedAt: now,
    syncTargets: [],
  });
  expect(source).toEqual({
    type: 'github',
    url: 'https://github.com/a/b',
    ref: 'main',
    author: 'Alice',
    license: 'MIT',
    homepage: 'https://example.com',
    installedAt: now,
    updatedAt: now,
  });
});

test('rowToSkillSource: missing sourceType falls back to unknown', () => {
  const source = rowToSkillSource({
    id: 'foo',
    sourceType: '',
    installedAt: 0,
    updatedAt: 0,
    syncTargets: [],
  });
  expect(source.type).toBe(SkillSourceType.Unknown);
});

test('rowToSkillSource: preserves unknown source type', () => {
  const source = rowToSkillSource({
    id: 'legacy',
    sourceType: 'unknown',
    installedAt: 0,
    updatedAt: 0,
    syncTargets: [],
  });
  expect(source.type).toBe('unknown');
});

// ---------------------------------------------------------------------------
// detectSourceFromInput
// ---------------------------------------------------------------------------

test('detectSourceFromInput: stamps installedAt and updatedAt to now', () => {
  const before = Date.now();
  const source = detectSourceFromInput({
    raw: 'https://github.com/a/b',
    type: SkillSourceType.GitHub,
    url: 'https://github.com/a/b',
    ref: 'main',
  });
  const after = Date.now();
  expect(source.type).toBe('github');
  expect(source.url).toBe('https://github.com/a/b');
  expect(source.ref).toBe('main');
  expect(source.installedAt).toBeGreaterThanOrEqual(before);
  expect(source.installedAt).toBeLessThanOrEqual(after);
  expect(source.updatedAt).toBe(source.installedAt);
});

test('detectSourceFromInput: missing url and ref are left undefined', () => {
  const source = detectSourceFromInput({
    raw: '/local/path',
    type: SkillSourceType.Local,
  });
  expect(source.type).toBe('local');
  expect(source.url).toBeUndefined();
  expect(source.ref).toBeUndefined();
});

// ---------------------------------------------------------------------------
// classifySourceInput
// ---------------------------------------------------------------------------

test('classifySourceInput: empty string maps to unknown', () => {
  expect(classifySourceInput('')).toEqual({ type: 'unknown' });
  expect(classifySourceInput('   ')).toEqual({ type: 'unknown' });
});

test('classifySourceInput: skillhub shorthand detected', () => {
  expect(classifySourceInput('skillhub:docs-writer')).toEqual({
    type: 'skillhub',
    url: 'skillhub:docs-writer',
  });
});

test('classifySourceInput: skillhub URL detected', () => {
  expect(classifySourceInput('https://skillhub.lol/skills/docs-writer')).toEqual({
    type: 'skillhub',
    url: 'https://skillhub.lol/skills/docs-writer',
  });
});

test('classifySourceInput: clawhub URL detected', () => {
  expect(classifySourceInput('https://clawhub.ai/steipete/slack')).toEqual({
    type: 'clawhub',
    url: 'https://clawhub.ai/steipete/slack',
  });
});

test('classifySourceInput: github URL detected', () => {
  expect(classifySourceInput('https://github.com/owner/repo')).toEqual({
    type: 'github',
    url: 'https://github.com/owner/repo',
  });
});

test('classifySourceInput: github URL with subpath detected', () => {
  expect(classifySourceInput('https://github.com/owner/repo/tree/main/skills/foo')).toEqual({
    type: 'github',
    url: 'https://github.com/owner/repo/tree/main/skills/foo',
  });
});

test('classifySourceInput: owner/repo shortform maps to unknown', () => {
  // parseGithubRepoSource only matches full URLs and SSH form, so the
  // shortform (owner/repo) is intentionally classified as unknown.
  expect(classifySourceInput('owner/repo')).toEqual({
    type: 'unknown',
    url: 'owner/repo',
  });
});

test('classifySourceInput: unrecognized URL maps to unknown', () => {
  expect(classifySourceInput('https://example.com/something')).toEqual({
    type: 'unknown',
    url: 'https://example.com/something',
  });
});
