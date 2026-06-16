/**
 * Skill Sync Targets factory + helpers.
 *
 * Builds the default list of sync targets from the user's home directory
 * and provides the runtime state shape used by the kv store. The factory
 * is pure (depends only on inputs) so the migration code in SqliteStore
 * can call it without touching the filesystem.
 */

import os from 'os';
import path from 'path';

import { SkillSyncTargetKind } from '../shared/skills/constants';
import type { SkillSyncTargetsState } from '../shared/skills/types';
import { defaultTargetPath } from './skillSyncResolver';

const DEFAULT_TARGET_LABELS: Record<string, string> = {
  [SkillSyncTargetKind.ClaudeCode]: 'Claude Code',
  [SkillSyncTargetKind.Kimi]: 'Kimi CLI',
  [SkillSyncTargetKind.OpenClaw]: 'OpenClaw',
  [SkillSyncTargetKind.Codex]: 'Codex CLI',
};

export const BUILT_IN_SYNC_TARGET_KINDS: string[] = [
  SkillSyncTargetKind.ClaudeCode,
  SkillSyncTargetKind.Kimi,
  SkillSyncTargetKind.OpenClaw,
  SkillSyncTargetKind.Codex,
];

/**
 * Build the default sync target state: all built-in targets present,
 * all disabled (per PRD §6.2 — default is "off", first install prompts).
 */
export function buildDefaultSyncTargetsState(
  homeDir: string = os.homedir(),
): SkillSyncTargetsState {
  const targets = BUILT_IN_SYNC_TARGET_KINDS.map((kind) => ({
    id: `builtin-${kind}`,
    kind,
    label: DEFAULT_TARGET_LABELS[kind] ?? kind,
    path: defaultTargetPath(kind, homeDir),
    enabled: false,
    isCustom: false,
    builtIn: true,
  }));
  return { targets, firstRunPrompted: false };
}

/**
 * Path-safe id derived from a custom path. Used when the user adds a
 * custom sync target — collisions are unlikely but we still escape the
 * separator for stability.
 */
export function makeCustomSyncTargetId(targetPath: string): string {
  const cleaned = path.resolve(targetPath).replace(/[\\/]+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '_');
  return `custom-${cleaned}`;
}

/**
 * Merge a list of user-supplied overrides into the default state. Existing
 * entries (matched by id) keep their enabled flag and any custom path.
 * New custom entries are appended. Entries removed by the user are dropped.
 */
export function reconcileSyncTargets(
  defaults: SkillSyncTargetsState,
  overrides: Array<{
    id?: string;
    kind?: string;
    label?: string;
    path?: string;
    enabled?: boolean;
    isCustom?: boolean;
  }>,
): SkillSyncTargetsState {
  const byId = new Map<string, SkillSyncTargetsState['targets'][number]>();
  for (const target of defaults.targets) {
    byId.set(target.id, target);
  }
  for (const override of overrides) {
    if (!override.id) continue;
    const existing = byId.get(override.id);
    byId.set(override.id, {
      id: override.id,
      kind: override.kind ?? existing?.kind ?? SkillSyncTargetKind.Custom,
      label: override.label ?? existing?.label ?? override.id,
      path: override.path ?? existing?.path ?? defaultTargetPath(SkillSyncTargetKind.Custom),
      enabled: override.enabled ?? existing?.enabled ?? false,
      isCustom: override.isCustom ?? existing?.isCustom ?? true,
      builtIn: existing?.builtIn,
    });
  }
  return {
    targets: Array.from(byId.values()),
    firstRunPrompted: defaults.firstRunPrompted,
  };
}
