import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SkillSourceType,
  SkillSyncConflictDecision,
  SkillSyncFailureDecision,
  SkillSyncMode,
  SkillSyncTargetKind,
} from '../../../shared/skills/constants';
import type {
  SkillSyncConflict,
  SkillSyncTarget,
} from '../../../shared/skills/types';
import {
  removeSkillFromTargets,
  syncSkillToTargets,
} from './skillSyncOrchestrator';

interface Harness {
  targets: SkillSyncTarget[];
  recorded: Map<string, Array<{ agent: string; path: string; mode: SkillSyncMode }>>;
  loadSyncTargets: () => SkillSyncTarget[];
  recordEntries: (skillId: string, entries: any[]) => void;
  clearEntries: (skillId: string) => void;
}

function makeHarness(home: string): Harness {
  const recorded = new Map<string, Array<{ agent: string; path: string; mode: SkillSyncMode }>>();
  const targets: SkillSyncTarget[] = [
    {
      id: `builtin-${SkillSyncTargetKind.ClaudeCode}`,
      kind: SkillSyncTargetKind.ClaudeCode,
      label: 'Claude Code',
      path: path.join(home, '.claude', 'skills'),
      enabled: true,
      isCustom: false,
      builtIn: true,
    },
    {
      id: `builtin-${SkillSyncTargetKind.Kimi}`,
      kind: SkillSyncTargetKind.Kimi,
      label: 'Kimi',
      path: path.join(home, '.kimi-code', 'skills'),
      enabled: true,
      isCustom: false,
      builtIn: true,
    },
  ];
  return {
    targets,
    recorded,
    loadSyncTargets: () => targets,
    recordEntries: (skillId, entries) => {
      recorded.set(skillId, entries);
    },
    clearEntries: (skillId) => {
      recorded.delete(skillId);
    },
  };
}

let tmpRoot = '';

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-sync-orchestrator-'));
});

afterEach(() => {
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describe('syncSkillToTargets', () => {
  it('writes nothing when no targets are enabled', async () => {
    const harness = makeHarness(tmpRoot);
    harness.targets.forEach((t) => { t.enabled = false; });
    const skillDir = path.join(tmpRoot, 'skills', 'widget');
    fs.mkdirSync(skillDir, { recursive: true });

    const result = await syncSkillToTargets('widget', SkillSourceType.GitHub, skillDir, {
      loadSyncTargets: harness.loadSyncTargets,
      recordEntries: harness.recordEntries,
      platform: 'linux',
      developerMode: true,
    });

    expect(result.attempts).toHaveLength(0);
    expect(harness.recorded.size).toBe(0);
  });

  it('creates a symlink in each enabled target and records entries', async () => {
    const harness = makeHarness(tmpRoot);
    const skillDir = path.join(tmpRoot, 'skills', 'widget');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# widget');

    const result = await syncSkillToTargets('widget', SkillSourceType.GitHub, skillDir, {
      loadSyncTargets: harness.loadSyncTargets,
      recordEntries: harness.recordEntries,
      platform: 'linux',
      developerMode: true,
    });

    expect(result.attempts.every((a) => a.success)).toBe(true);
    expect(harness.recorded.get('widget')).toHaveLength(2);
    for (const target of harness.targets) {
      const targetLink = path.join(target.path, 'widget');
      const lstat = fs.lstatSync(targetLink);
      expect(lstat.isSymbolicLink()).toBe(true);
    }
  });

  it('skips targets when the user chooses skip on conflict', async () => {
    const harness = makeHarness(tmpRoot);
    const skillDir = path.join(tmpRoot, 'skills', 'widget');
    fs.mkdirSync(skillDir, { recursive: true });

    const foreign = path.join(harness.targets[0].path, 'widget');
    fs.mkdirSync(foreign, { recursive: true });
    fs.writeFileSync(path.join(foreign, 'SKILL.md'), '# foreign');

    const result = await syncSkillToTargets('widget', SkillSourceType.GitHub, skillDir, {
      loadSyncTargets: harness.loadSyncTargets,
      recordEntries: harness.recordEntries,
      platform: 'linux',
      developerMode: true,
      onConflict: async () => SkillSyncConflictDecision.Skip,
    });

    const claudeAttempt = result.attempts.find((a) => a.path.includes('claude'));
    const kimiAttempt = result.attempts.find((a) => a.path.includes('kimi'));
    expect(claudeAttempt?.success).toBe(false);
    expect(claudeAttempt?.reason).toBe('skipped by user');
    expect(kimiAttempt?.success).toBe(true);
    expect(harness.recorded.get('widget')).toHaveLength(1);
  });

  it('replaces foreign target when the user chooses replace', async () => {
    const harness = makeHarness(tmpRoot);
    const skillDir = path.join(tmpRoot, 'skills', 'widget');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# widget');

    const foreign = path.join(harness.targets[0].path, 'widget');
    fs.mkdirSync(foreign, { recursive: true });
    fs.writeFileSync(path.join(foreign, 'JUNK.txt'), 'noise');

    const result = await syncSkillToTargets('widget', SkillSourceType.GitHub, skillDir, {
      loadSyncTargets: harness.loadSyncTargets,
      recordEntries: harness.recordEntries,
      platform: 'linux',
      developerMode: true,
      onConflict: async () => SkillSyncConflictDecision.Replace,
    });

    expect(result.attempts.every((a) => a.success)).toBe(true);
    const link = path.join(harness.targets[0].path, 'widget');
    const lstat = fs.lstatSync(link);
    expect(lstat.isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(link, 'JUNK.txt'))).toBe(false);
  });

  it('rolls back partial sync when the user cancels on failure', async () => {
    const harness = makeHarness(tmpRoot);
    const skillDir = path.join(tmpRoot, 'skills', 'widget');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# widget');

    const blocker = path.join(tmpRoot, 'blocker');
    fs.writeFileSync(blocker, 'not a dir');
    harness.targets[1].path = path.join(blocker, 'skills');

    const failureDecisions: SkillSyncFailureDecision[] = [SkillSyncFailureDecision.Cancel];
    const result = await syncSkillToTargets('widget', SkillSourceType.GitHub, skillDir, {
      loadSyncTargets: harness.loadSyncTargets,
      recordEntries: harness.recordEntries,
      platform: 'linux',
      developerMode: true,
      onFailure: async () => failureDecisions.shift() ?? SkillSyncFailureDecision.Skip,
    });

    const claudeLink = path.join(harness.targets[0].path, 'widget');
    expect(fs.existsSync(claudeLink)).toBe(false);
    expect(harness.recorded.has('widget')).toBe(false);
    expect(result.attempts.some((a) => !a.success)).toBe(true);
  });

  it('continues with remaining targets when the user skips a failure', async () => {
    const harness = makeHarness(tmpRoot);
    const skillDir = path.join(tmpRoot, 'skills', 'widget');
    fs.mkdirSync(skillDir, { recursive: true });

    const blocker = path.join(tmpRoot, 'blocker');
    fs.writeFileSync(blocker, 'not a dir');
    harness.targets[0].path = path.join(blocker, 'skills');

    const result = await syncSkillToTargets('widget', SkillSourceType.GitHub, skillDir, {
      loadSyncTargets: harness.loadSyncTargets,
      recordEntries: harness.recordEntries,
      platform: 'linux',
      developerMode: true,
      onFailure: async () => SkillSyncFailureDecision.Skip,
    });

    const failed = result.attempts.find((a) => !a.success);
    const succeeded = result.attempts.find((a) => a.success);
    expect(failed?.path).toContain('blocker');
    expect(succeeded?.path).toContain('kimi');
  });

  it('returns early without syncing when source directory is missing', async () => {
    const harness = makeHarness(tmpRoot);
    const missingDir = path.join(tmpRoot, 'skills', 'ghost');

    const result = await syncSkillToTargets('ghost', SkillSourceType.GitHub, missingDir, {
      loadSyncTargets: harness.loadSyncTargets,
      recordEntries: harness.recordEntries,
      platform: 'linux',
      developerMode: true,
      onFailure: async () => SkillSyncFailureDecision.Skip,
    });

    expect(result.attempts.every((a) => !a.success)).toBe(true);
    expect(harness.recorded.size).toBe(0);
  });

  it('idempotently re-syncs when marker shows the same source type', async () => {
    const harness = makeHarness(tmpRoot);
    const skillDir = path.join(tmpRoot, 'skills', 'widget');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# widget');

    await syncSkillToTargets('widget', SkillSourceType.GitHub, skillDir, {
      loadSyncTargets: harness.loadSyncTargets,
      recordEntries: harness.recordEntries,
      platform: 'linux',
      developerMode: true,
    });

    const result = await syncSkillToTargets('widget', SkillSourceType.GitHub, skillDir, {
      loadSyncTargets: harness.loadSyncTargets,
      recordEntries: harness.recordEntries,
      platform: 'linux',
      developerMode: true,
    });

    expect(result.attempts.every((a) => a.success)).toBe(true);
    expect(harness.recorded.get('widget')).toHaveLength(2);
  });
});

describe('removeSkillFromTargets', () => {
  it('removes entries recorded in metadata', () => {
    const harness = makeHarness(tmpRoot);
    const skillDir = path.join(tmpRoot, 'skills', 'widget');
    fs.mkdirSync(skillDir, { recursive: true });

    const recorded = harness.targets.map((t) => ({
      agent: t.kind,
      path: path.join(t.path, 'widget'),
      mode: SkillSyncMode.Symlink,
    }));
    for (const entry of recorded) {
      fs.mkdirSync(path.dirname(entry.path), { recursive: true });
      fs.symlinkSync(skillDir, entry.path, 'dir');
    }
    harness.recorded.set('widget', recorded);

    removeSkillFromTargets('widget', {
      loadSyncTargets: harness.loadSyncTargets,
      recordedEntries: recorded,
      clearEntries: (id) => harness.recorded.delete(id),
    });

    for (const entry of recorded) {
      expect(fs.existsSync(entry.path)).toBe(false);
    }
    expect(harness.recorded.has('widget')).toBe(false);
  });

  it('falls back to enabled targets when no entries are recorded', () => {
    const harness = makeHarness(tmpRoot);
    const skillDir = path.join(tmpRoot, 'skills', 'widget');
    fs.mkdirSync(skillDir, { recursive: true });

    for (const target of harness.targets) {
      fs.mkdirSync(target.path, { recursive: true });
      fs.symlinkSync(skillDir, path.join(target.path, 'widget'), 'dir');
    }

    removeSkillFromTargets('widget', {
      loadSyncTargets: harness.loadSyncTargets,
      clearEntries: (id) => harness.recorded.delete(id),
    });

    for (const target of harness.targets) {
      expect(fs.existsSync(path.join(target.path, 'widget'))).toBe(false);
    }
  });

  it('tolerates missing targets gracefully', () => {
    const harness = makeHarness(tmpRoot);
    expect(() =>
      removeSkillFromTargets('ghost', {
        loadSyncTargets: harness.loadSyncTargets,
        recordedEntries: [{ agent: 'claude-code', path: path.join(tmpRoot, 'nope'), mode: SkillSyncMode.Symlink }],
        clearEntries: () => {},
      }),
    ).not.toThrow();
  });
});

describe('conflict descriptor content', () => {
  it('forwards existing source type to the prompt', async () => {
    const harness = makeHarness(tmpRoot);
    const skillDir = path.join(tmpRoot, 'skills', 'widget');
    fs.mkdirSync(skillDir, { recursive: true });

    const targetPath = path.join(harness.targets[0].path, 'widget');
    fs.mkdirSync(targetPath, { recursive: true });
    fs.writeFileSync(path.join(targetPath, '.wesight-skill-link'), 'wesight-managed:skillhub');

    const seen: SkillSyncConflict[] = [];
    await syncSkillToTargets('widget', SkillSourceType.GitHub, skillDir, {
      loadSyncTargets: harness.loadSyncTargets,
      recordEntries: harness.recordEntries,
      platform: 'linux',
      developerMode: true,
      onConflict: async (conflict) => {
        seen.push(conflict);
        return SkillSyncConflictDecision.Skip;
      },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].existingSourceType).toBe(SkillSourceType.SkillHub);
    expect(seen[0].incomingSourceType).toBe(SkillSourceType.GitHub);
  });
});
