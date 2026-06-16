/**
 * Skill metadata sync coordinator.
 *
 * Wires skill install / upgrade / delete lifecycle events to:
 *   - the SQLite skill_metadata registry (source, version, install time)
 *   - the cross-agent sync (symlink or copy to each enabled target)
 *
 * Decision-making lives in `skillSyncResolver`. This module is the
 * orchestration layer that SkillManager calls.
 */

import fs from 'fs';
import path from 'path';

import {
  SkillSourceType,
  type SkillSourceType as SkillSourceTypeValue,
  SkillSyncMode,
  type SkillSyncMode as SkillSyncModeValue,
  SkillSyncTargetKind,
  type SkillSyncTargetKind as SkillSyncTargetKindValue,
} from '../../../shared/skills/constants';
import {
  applySync,
  decideSyncMode,
  defaultTargetPath,
  detectConflict,
  detectWindowsDeveloperMode,
  inspectTarget,
  removeTarget,
} from '../../skillSyncResolver';
import type { SkillMetadataRow, SqliteStore } from '../../sqliteStore';

const SYNC_TARGETS_KV_KEY = 'skills.syncTargets.v1';
const FIRST_INSTALL_ONBOARDED_KEY = 'skills.firstInstall.onboarded';

export interface SkillSyncTargetConfig {
  id: string;
  label: string;
  kind: SkillSyncTargetKindValue;
  path: string;
  enabled: boolean;
  exists?: boolean;
  isCustom?: boolean;
}

export interface SkillSyncOutcome {
  target: SkillSyncTargetConfig;
  applied: boolean;
  mode?: SkillSyncModeValue;
  reason: string;
  skipped?: boolean;
  error?: string;
}

const DEFAULT_SYNC_TARGETS: SkillSyncTargetConfig[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    kind: SkillSyncTargetKind.ClaudeCode,
    path: defaultTargetPath(SkillSyncTargetKind.ClaudeCode),
    enabled: false,
  },
  {
    id: 'kimi',
    label: 'Kimi CLI',
    kind: SkillSyncTargetKind.Kimi,
    path: defaultTargetPath(SkillSyncTargetKind.Kimi),
    enabled: false,
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    kind: SkillSyncTargetKind.OpenClaw,
    path: defaultTargetPath(SkillSyncTargetKind.OpenClaw),
    enabled: false,
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    kind: SkillSyncTargetKind.Codex,
    path: defaultTargetPath(SkillSyncTargetKind.Codex),
    enabled: false,
  },
];

const applyOutcomesToMetadata = (
  store: SqliteStore,
  skillId: string,
  outcomes: SkillSyncOutcome[],
): void => {
  const applied = outcomes.filter(o => o.applied && o.mode);
  if (applied.length === 0) return;
  const existing = store.getSkillMetadata(skillId);
  if (!existing) return;
  store.upsertSkillMetadata({
    ...existing,
    syncTargets: applied.map(outcome => ({
      agent: outcome.target.kind,
      path: path.join(outcome.target.path, skillId),
      mode: outcome.mode as SkillSyncMode,
    })),
  });
};

export const SkillMetadataSync = {
  listTargets(store: SqliteStore): SkillSyncTargetConfig[] {
    const stored = store.get<SkillSyncTargetConfig[]>(SYNC_TARGETS_KV_KEY);
    if (!Array.isArray(stored) || stored.length === 0) {
      return DEFAULT_SYNC_TARGETS.map(target => ({
        ...target,
        exists: fs.existsSync(target.path),
      }));
    }
    const knownIds = new Set(DEFAULT_SYNC_TARGETS.map((t: SkillSyncTargetConfig) => t.id));
    const custom = stored.filter((t: SkillSyncTargetConfig) => !knownIds.has(t.id));
    const merged: SkillSyncTargetConfig[] = [];
    DEFAULT_SYNC_TARGETS.forEach((defaultTarget: SkillSyncTargetConfig) => {
      const override = stored.find((t: SkillSyncTargetConfig) => t.id === defaultTarget.id);
      merged.push({
        ...defaultTarget,
        ...override,
        exists: fs.existsSync(override?.path ?? defaultTarget.path),
        isCustom: false,
      });
    });
    for (const customTarget of custom) {
      merged.push({
        ...customTarget,
        exists: fs.existsSync(customTarget.path),
        isCustom: true,
      });
    }
    return merged;
  },

  saveTargets(store: SqliteStore, targets: SkillSyncTargetConfig[]): void {
    store.set(SYNC_TARGETS_KV_KEY, targets);
  },

  isFirstInstallOnboarded(store: SqliteStore): boolean {
    return store.get<boolean>(FIRST_INSTALL_ONBOARDED_KEY) === true;
  },

  markFirstInstallOnboarded(store: SqliteStore): void {
    store.set(FIRST_INSTALL_ONBOARDED_KEY, true);
  },

  syncSkillToTargets(
    store: SqliteStore,
    sourceDir: string,
    skillId: string,
    sourceType: SkillSourceTypeValue,
  ): SkillSyncOutcome[] {
    const targets = this.listTargets(store).filter((t: SkillSyncTargetConfig) => t.enabled);
    if (targets.length === 0) return [];
    const decision = decideSyncMode();
    const outcomes: SkillSyncOutcome[] = [];
    for (const target of targets) {
      const targetPath = path.join(target.path, skillId);
      const conflict = detectConflict(targetPath, sourceType, sourceDir);
      try {
        if (conflict.hasConflict && conflict.reason !== 'managed-different-source') {
          outcomes.push({
            target,
            applied: false,
            reason: conflict.reason ?? 'conflict',
            skipped: true,
          });
          continue;
        }
        applySync(sourceDir, targetPath, decision, {
          replaceExisting: true,
          sourceType,
        });
        outcomes.push({
          target,
          applied: true,
          mode: decision.mode,
          reason: decision.reason,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[SkillMetadataSync] sync failed for ${target.kind}:`, error);
        outcomes.push({
          target,
          applied: false,
          reason: decision.reason,
          error: message,
        });
      }
    }
    applyOutcomesToMetadata(store, skillId, outcomes);
    return outcomes;
  },

  removeSkillFromTargets(store: SqliteStore, skillId: string): void {
    const targets = this.listTargets(store);
    for (const target of targets) {
      const targetPath = path.join(target.path, skillId);
      try {
        removeTarget(targetPath);
      } catch (error) {
        console.warn(`[SkillMetadataSync] remove failed for ${target.kind}:`, error);
      }
    }
  },
};

export { detectWindowsDeveloperMode };
export type { SkillMetadataRow };
