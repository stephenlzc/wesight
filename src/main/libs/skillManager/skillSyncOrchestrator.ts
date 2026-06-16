/**
 * Skill Sync Orchestrator
 *
 * Coordinates per-skill sync across enabled sync targets. Wraps the pure
 * decision-making in `skillSyncResolver` with the side effects that v1
 * needs: loading the configured targets, detecting conflicts per target,
 * prompting the user through a callback when a conflict arises, applying
 * the resulting sync, recording the resulting entries into the skill's
 * metadata, and rolling back on cancel.
 *
 * This module is a self-contained alternative to `skillMetadataSync.ts`.
 * It exposes the same surface (sync / remove / resync) with explicit
 * conflict + failure prompts and rollback semantics, useful for tests
 * and for callers that want full control over the user-prompt flow.
 */

import fs from 'fs';
import path from 'path';

import {
  SkillSourceType,
  SkillSyncConflictDecision,
  SkillSyncFailureDecision,
  SkillSyncTargetKind,
  type SkillSyncTargetKind as SkillSyncTargetKindType,
} from '../../../shared/skills/constants';
import type {
  SkillSyncConflict,
  SkillSyncFailure,
  SkillSyncResult,
  SkillSyncTarget,
  SkillSyncTargetEntry,
} from '../../../shared/skills/types';
import {
  applySync,
  decideSyncMode,
  defaultTargetPath,
  detectConflict,
  detectWindowsDeveloperMode,
  removeTarget,
} from '../../skillSyncResolver';

/**
 * Pluggable prompt surface. Implementations live in `main.ts` where the
 * orchestrator is wired up — they translate the descriptor into a
 * renderer dialog and resolve with the user's choice.
 */
export type ConflictPromptFn = (conflict: SkillSyncConflict) => Promise<SkillSyncConflictDecision>;
export type FailurePromptFn = (failure: SkillSyncFailure) => Promise<SkillSyncFailureDecision>;

export type SyncOrchestratorOptions = {
  /**
   * Function that returns the current sync-target configuration. Pulled
   * lazily on each call so reconfiguration takes effect without restart.
   */
  loadSyncTargets: () => SkillSyncTarget[];

  /**
   * Persist a new sync-target configuration. Optional — orchestrator only
   * writes when provided.
   */
  saveSyncTargets?: (targets: SkillSyncTarget[]) => void;

  /**
   * Override the platform detection. Tests pass `linux`/`darwin`/`win32`
   * to avoid touching `process.platform`.
   */
  platform?: NodeJS.Platform;

  /**
   * Override the developer-mode probe. Tests force values to exercise
   * both branches on Windows.
   */
  developerMode?: boolean;

  /**
   * Conflict prompt. If omitted, conflicts resolve to "skip" silently.
   */
  onConflict?: ConflictPromptFn;

  /**
   * Failure prompt. If omitted, failures resolve to "skip" and the
   * orchestrator continues with the next target.
   */
  onFailure?: FailurePromptFn;
};

/**
 * Internal bookkeeping: which (skillId, target) pairs have already been
 * touched during this run, so we can roll back on cancel.
 */
interface TouchedEntry {
  path: string;
  agent: SkillSyncTargetKindType | string;
}

/**
 * Sync `skillDir` (the source directory on disk) to all enabled targets
 * for `skillId`. Records the resulting entries in the per-skill metadata
 * via `recordEntries` so the renderer can show "synced to" badges.
 */
export async function syncSkillToTargets(
  skillId: string,
  sourceType: SkillSourceType,
  skillDir: string,
  options: SyncOrchestratorOptions & {
    recordEntries: (skillId: string, entries: SkillSyncTargetEntry[]) => void;
  },
): Promise<SkillSyncResult> {
  const targets = options.loadSyncTargets().filter((t) => t.enabled);
  const result: SkillSyncResult = { skillId, attempts: [] };
  if (targets.length === 0) return result;

  const platform = options.platform ?? process.platform;
  const decision = decideSyncMode(platform, options.developerMode ?? detectWindowsDeveloperMode());
  const touched: TouchedEntry[] = [];
  const successEntries: SkillSyncTargetEntry[] = [];

  for (const target of targets) {
    const baseDir = resolveTargetDir(target, path.dirname(skillDir));
    const targetPath = path.join(baseDir, skillId);

    if (!sourceExistsAt(skillDir)) {
      const reason = `source directory not found: ${skillDir}`;
      result.attempts.push({
        agent: target.kind,
        path: targetPath,
        mode: decision.mode,
        success: false,
        reason,
      });
      const action = await reportFailure(options.onFailure, {
        skillId,
        agent: target.kind,
        path: targetPath,
        mode: decision.mode,
        reason,
      });
      if (action === SkillSyncFailureDecision.Cancel) {
        rollback(touched);
        return result;
      }
      continue;
    }

    const conflict = detectConflict(targetPath, sourceType, skillDir);
    let shouldReplace = false;
    if (conflict.hasConflict) {
      const userChoice = await resolveConflict(options.onConflict, {
        skillId,
        agent: target.kind,
        path: targetPath,
        existingSourceType: conflict.existingSourceType,
        incomingSourceType: conflict.incomingSourceType,
      });
      if (userChoice === SkillSyncConflictDecision.Skip) {
        result.attempts.push({
          agent: target.kind,
          path: targetPath,
          mode: decision.mode,
          success: false,
          reason: 'skipped by user',
        });
        continue;
      }
      if (userChoice === SkillSyncConflictDecision.Replace) {
        shouldReplace = true;
      }
      if (userChoice === SkillSyncConflictDecision.Keep) {
        result.attempts.push({
          agent: target.kind,
          path: targetPath,
          mode: decision.mode,
          success: false,
          reason: 'kept existing',
        });
        continue;
      }
    } else if (conflict.reason === 'managed-same-source') {
      shouldReplace = true;
    } else if (targetPointsAtSource(targetPath, skillDir)) {
      // Existing entry already points at our source: re-apply to refresh
      // the marker in case the source type changed.
      shouldReplace = true;
    }

    try {
      applySync(skillDir, targetPath, decision, {
        replaceExisting: shouldReplace,
        sourceType,
      });
      touched.push({ path: targetPath, agent: target.kind });
      successEntries.push({
        agent: target.kind,
        path: targetPath,
        mode: decision.mode,
      });
      result.attempts.push({
        agent: target.kind,
        path: targetPath,
        mode: decision.mode,
        success: true,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result.attempts.push({
        agent: target.kind,
        path: targetPath,
        mode: decision.mode,
        success: false,
        reason,
      });
      const action = await reportFailure(options.onFailure, {
        skillId,
        agent: target.kind,
        path: targetPath,
        mode: decision.mode,
        reason,
      });
      if (action === SkillSyncFailureDecision.Cancel) {
        rollback(touched);
        return result;
      }
    }
  }

  if (successEntries.length > 0) {
    options.recordEntries(skillId, successEntries);
  }
  return result;
}

/**
 * Remove a previously synced skill from every recorded entry.
 */
export function removeSkillFromTargets(
  skillId: string,
  options: SyncOrchestratorOptions & {
    recordedEntries?: SkillSyncTargetEntry[];
    clearEntries: (skillId: string) => void;
  },
): void {
  const recorded = options.recordedEntries ?? [];
  const fallbackTargets = options.loadSyncTargets().filter((t) => t.enabled);

  const pathsToClean: string[] = recorded.length > 0
    ? recorded.map((e) => e.path)
    : fallbackTargets.map((t) => resolveTargetDir(t, '/'));

  for (const targetPath of pathsToClean) {
    try {
      removeTarget(targetPath);
    } catch (error) {
      console.warn(`[SkillSyncOrchestrator] failed to remove ${targetPath}:`, error);
    }
  }
  options.clearEntries(skillId);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function resolveTargetDir(target: SkillSyncTarget, fallbackParent: string): string {
  if (target.path && target.path.trim().length > 0) {
    return target.path;
  }
  if (Object.values(SkillSyncTargetKind).includes(target.kind as SkillSyncTargetKindType)) {
    return defaultTargetPath(target.kind as SkillSyncTargetKindType);
  }
  return path.join(fallbackParent, target.id);
}

function sourceExistsAt(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function targetPointsAtSource(targetPath: string, sourceDir: string): boolean {
  try {
    const lstat = fs.lstatSync(targetPath);
    if (!lstat.isSymbolicLink()) return false;
    const realTarget = fs.realpathSync(targetPath);
    const realSource = fs.realpathSync(sourceDir);
    return realTarget === realSource;
  } catch {
    return false;
  }
}

async function resolveConflict(
  prompt: ConflictPromptFn | undefined,
  conflict: SkillSyncConflict,
): Promise<SkillSyncConflictDecision> {
  if (!prompt) return SkillSyncConflictDecision.Skip;
  try {
    const choice = await prompt(conflict);
    return choice ?? SkillSyncConflictDecision.Skip;
  } catch (error) {
    console.warn('[SkillSyncOrchestrator] conflict prompt failed, skipping:', error);
    return SkillSyncConflictDecision.Skip;
  }
}

async function reportFailure(
  prompt: FailurePromptFn | undefined,
  failure: SkillSyncFailure,
): Promise<SkillSyncFailureDecision> {
  if (!prompt) return SkillSyncFailureDecision.Skip;
  try {
    const choice = await prompt(failure);
    return choice ?? SkillSyncFailureDecision.Skip;
  } catch (error) {
    console.warn('[SkillSyncOrchestrator] failure prompt failed, skipping:', error);
    return SkillSyncFailureDecision.Skip;
  }
}

function rollback(touched: TouchedEntry[]): void {
  for (const entry of touched) {
    try {
      removeTarget(entry.path);
    } catch (error) {
      console.warn(`[SkillSyncOrchestrator] rollback failed for ${entry.path}:`, error);
    }
  }
}
