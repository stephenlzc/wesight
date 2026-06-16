/**
 * Tests for the sync-dialog label helpers. These cover the enum-to-i18n
 * routing used by SkillSyncConflictDialog, SkillSyncFailureDialog, and
 * SkillFirstSyncPromptDialog.
 */
import { SkillSyncMode, SkillSyncTargetKind } from '@shared/skills/constants';
import { expect, test, vi } from 'vitest';

import { getSourceTypeLabel, getSyncAgentLabel, getSyncModeLabel } from './syncDialogLabels';

const tSpy = vi.fn((key: string) => key);

vi.mock('../../../services/i18n', () => ({
  i18nService: {
    t: (key: string) => tSpy(key),
  },
}));

test('getSyncAgentLabel returns the i18n key for known kinds', () => {
  tSpy.mockClear();
  expect(getSyncAgentLabel(SkillSyncTargetKind.ClaudeCode)).toBe('skillSyncAgentClaudeCode');
  expect(getSyncAgentLabel(SkillSyncTargetKind.Kimi)).toBe('skillSyncAgentKimi');
  expect(getSyncAgentLabel(SkillSyncTargetKind.OpenClaw)).toBe('skillSyncAgentOpenClaw');
  expect(getSyncAgentLabel(SkillSyncTargetKind.Codex)).toBe('skillSyncAgentCodex');
  expect(getSyncAgentLabel(SkillSyncTargetKind.Custom)).toBe('skillSyncAgentCustom');
  expect(tSpy).toHaveBeenCalledTimes(5);
});

test('getSyncAgentLabel returns the raw string for unknown kinds', () => {
  tSpy.mockClear();
  expect(getSyncAgentLabel('mystery-agent')).toBe('mystery-agent');
  expect(tSpy).not.toHaveBeenCalled();
});

test('getSyncModeLabel maps to the symlink/copy i18n keys', () => {
  tSpy.mockClear();
  expect(getSyncModeLabel(SkillSyncMode.Symlink)).toBe('skillSyncModeSymlink');
  expect(getSyncModeLabel(SkillSyncMode.Copy)).toBe('skillSyncModeCopy');
  expect(tSpy).toHaveBeenCalledTimes(2);
});

test('getSyncModeLabel returns the raw string for unknown modes', () => {
  tSpy.mockClear();
  expect(getSyncModeLabel('weird' as unknown as SkillSyncMode)).toBe('weird');
  expect(tSpy).not.toHaveBeenCalled();
});

test('getSourceTypeLabel maps every documented source type', () => {
  tSpy.mockClear();
  expect(getSourceTypeLabel('github')).toBe('skillDetailSourceGithub');
  expect(getSourceTypeLabel('npm')).toBe('skillDetailSourceNpm');
  expect(getSourceTypeLabel('skillhub')).toBe('skillDetailSourceSkillhub');
  expect(getSourceTypeLabel('clawhub')).toBe('skillDetailSourceClawhub');
  expect(getSourceTypeLabel('zip')).toBe('skillDetailSourceZip');
  expect(getSourceTypeLabel('local')).toBe('skillDetailSourceLocal');
  expect(getSourceTypeLabel('unknown')).toBe('skillDetailSourceUnknown');
  expect(tSpy).toHaveBeenCalledTimes(7);
});

test('getSourceTypeLabel falls back to "unknown" when undefined', () => {
  tSpy.mockClear();
  expect(getSourceTypeLabel(undefined)).toBe('skillDetailSourceUnknown');
  expect(tSpy).toHaveBeenCalledWith('skillDetailSourceUnknown');
});

test('getSourceTypeLabel returns the raw string for unknown source types', () => {
  tSpy.mockClear();
  expect(getSourceTypeLabel('obscure-source' as unknown as Parameters<typeof getSourceTypeLabel>[0])).toBe('obscure-source');
  expect(tSpy).not.toHaveBeenCalled();
});
