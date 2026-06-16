/**
 * Tests for the pure formatting helpers used by SkillSyncedAgents.
 * Extracted so the component file stays focused on rendering and
 * the truncation logic can be locked down with tests that don't
 * need the i18n service or the DOM.
 */
import { expect, test } from 'vitest';

import { isSymlinkMode, shortenSyncPath } from './skillSyncedAgentsFormatting';

test('shortenSyncPath leaves short paths untouched', () => {
  expect(shortenSyncPath('~/.claude/skills/web-search')).toBe('~/.claude/skills/web-search');
  expect(shortenSyncPath('/Users/me/skills/x')).toBe('/Users/me/skills/x');
});

test('shortenSyncPath returns empty input unchanged', () => {
  expect(shortenSyncPath('')).toBe('');
});

test('shortenSyncPath collapses long paths to last two segments', () => {
  const long = '/Users/zhicong/AI_SKILL/wesight-agent-7/skills/web-search';
  expect(shortenSyncPath(long)).toBe('…/skills/web-search');
});

test('shortenSyncPath treats backslash and forward slash as separators', () => {
  // On Windows agents we may see backslash-separated paths. The
  // helper is depth-based (last two segments), so the prefix does
  // not appear in the rendered output.
  const longWindows = 'C:\\Users\\me\\AppData\\Local\\Programs\\Codex\\skills\\web-search';
  expect(shortenSyncPath(longWindows)).toBe('…/skills/web-search');
});

test('shortenSyncPath returns shallow long paths untouched (≤ 2 segments)', () => {
  // 60 chars but only 2 segments — keep the original.
  const shallow = '/some-very-very-very-very-very-long-prefix/skills';
  expect(shortenSyncPath(shallow)).toBe(shallow);
});

test('isSymlinkMode returns true only for the symlink literal', () => {
  expect(isSymlinkMode('symlink')).toBe(true);
  expect(isSymlinkMode('copy')).toBe(false);
  // Defensive: unknown values fall through to the copy styling.
  expect(isSymlinkMode('unknown')).toBe(false);
  expect(isSymlinkMode('')).toBe(false);
});
