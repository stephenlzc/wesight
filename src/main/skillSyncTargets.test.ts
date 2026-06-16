import { describe, expect, it } from 'vitest';

import { SkillSyncTargetKind } from '../shared/skills/constants';
import {
  buildDefaultSyncTargetsState,
  BUILT_IN_SYNC_TARGET_KINDS,
  makeCustomSyncTargetId,
  reconcileSyncTargets,
} from './skillSyncTargets';

describe('buildDefaultSyncTargetsState', () => {
  it('returns all built-in kinds disabled with home-relative paths', () => {
    const state = buildDefaultSyncTargetsState('/home/test');
    expect(state.firstRunPrompted).toBe(false);
    expect(state.targets.map(t => t.kind)).toEqual([
      SkillSyncTargetKind.ClaudeCode,
      SkillSyncTargetKind.Kimi,
      SkillSyncTargetKind.OpenClaw,
      SkillSyncTargetKind.Codex,
    ]);
    expect(state.targets.every(t => t.enabled === false)).toBe(true);
    expect(state.targets.every(t => t.isCustom === false)).toBe(true);
    expect(state.targets.every(t => t.builtIn === true)).toBe(true);
    expect(state.targets.find(t => t.kind === SkillSyncTargetKind.ClaudeCode)?.path)
      .toBe('/home/test/.claude/skills');
    expect(state.targets.find(t => t.kind === SkillSyncTargetKind.Codex)?.path)
      .toBe('/home/test/.codex/skills');
  });

  it('exports the canonical list of built-in kinds', () => {
    expect(BUILT_IN_SYNC_TARGET_KINDS).toContain(SkillSyncTargetKind.ClaudeCode);
    expect(BUILT_IN_SYNC_TARGET_KINDS).toContain(SkillSyncTargetKind.Kimi);
    expect(BUILT_IN_SYNC_TARGET_KINDS).toContain(SkillSyncTargetKind.OpenClaw);
    expect(BUILT_IN_SYNC_TARGET_KINDS).toContain(SkillSyncTargetKind.Codex);
  });
});

describe('makeCustomSyncTargetId', () => {
  it('strips path separators and produces a stable id', () => {
    expect(makeCustomSyncTargetId('/tmp/foo bar')).toMatch(/^custom-/);
    expect(makeCustomSyncTargetId('/tmp/foo bar'))
      .toBe(makeCustomSyncTargetId('/tmp/foo bar'));
  });

  it('escapes Windows-style separators consistently', () => {
    expect(makeCustomSyncTargetId('C:\\Users\\me\\skills'))
      .toBe(makeCustomSyncTargetId('C:/Users/me/skills'));
  });
});

describe('reconcileSyncTargets', () => {
  it('preserves default targets when no overrides supplied', () => {
    const defaults = buildDefaultSyncTargetsState('/home/test');
    const result = reconcileSyncTargets(defaults, []);
    expect(result.targets).toEqual(defaults.targets);
    expect(result.firstRunPrompted).toBe(false);
  });

  it('applies enabled flag overrides by id', () => {
    const defaults = buildDefaultSyncTargetsState('/home/test');
    const claudeId = defaults.targets.find(t => t.kind === SkillSyncTargetKind.ClaudeCode)!.id;
    const result = reconcileSyncTargets(defaults, [{ id: claudeId, enabled: true }]);
    const claude = result.targets.find(t => t.id === claudeId)!;
    expect(claude.enabled).toBe(true);
  });

  it('appends new custom entries without dropping defaults', () => {
    const defaults = buildDefaultSyncTargetsState('/home/test');
    const result = reconcileSyncTargets(defaults, [
      {
        id: 'custom-extra',
        kind: SkillSyncTargetKind.Custom,
        label: 'My Agent',
        path: '/opt/my-agent/skills',
        enabled: true,
        isCustom: true,
      },
    ]);
    expect(result.targets.length).toBe(defaults.targets.length + 1);
    const custom = result.targets.find(t => t.id === 'custom-extra')!;
    expect(custom.path).toBe('/opt/my-agent/skills');
    expect(custom.isCustom).toBe(true);
  });

  it('ignores override entries without an id', () => {
    const defaults = buildDefaultSyncTargetsState('/home/test');
    const result = reconcileSyncTargets(defaults, [{ enabled: true }]);
    expect(result.targets).toEqual(defaults.targets);
  });
});
