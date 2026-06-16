/**
 * Coordinator for the renderer-driven sync conflict / failure dialogs.
 *
 * The install / upgrade flow in the main process can run into two
 * situations that need a user decision:
 *   1. A target already contains a skill with the same id from a
 *      different source (conflict → keep / replace / skip).
 *   2. A target sync attempt fails for a non-transient reason
 *      (failure → retry / skip / cancel).
 *
 * Both decisions must be made by the user, but the SkillManager is
 * running in the main process and the dialogs are React components
 * rendered in the renderer. This module bridges the two:
 *
 *   - `requestConflictResolution` / `requestFailureResolution` are
 *     awaited from the main thread; they emit a `webContents.send`
 *     event to every renderer window and pause until the renderer
 *     delivers a decision via the `ResolveSyncConflict` /
 *     `ReportSyncFailure` IPC channels.
 *   - `acceptConflictDecision` / `acceptFailureDecision` are called
 *     by those IPC handlers and resolve the matching pending
 *     promise.
 *   - `requestFirstSyncTargets` shows the first-install prompt
 *     exactly once (or when the renderer explicitly re-prompts); the
 *     renderer delivers the chosen target ids via the
 *     `PromptFirstSyncTargets` IPC.
 *
 * Pending requests time out after 60s. On timeout, the conflict
 * defaults to `Skip` and the failure defaults to `Cancel` so the
 * install flow never hangs forever.
 *
 * The coordinator is intentionally a singleton with no per-window
 * routing — any renderer window can answer any pending request, and
 * the first one to do so wins. This mirrors how the rest of the
 * skill IPC surface treats windows.
 */

import { randomUUID } from 'crypto';
import { BrowserWindow, type WebContents } from 'electron';

import {
  SkillSyncConflictDecision,
  SkillSyncFailureDecision,
} from '../../../shared/skills/constants';
import type {
  FirstSyncPromptResolution,
  FirstSyncPromptTarget,
  SkillSyncConflict,
  SkillSyncFailure,
} from '../../../shared/skills/types';

type ConflictEntry = {
  resolve: (decision: SkillSyncConflictDecision) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type FailureEntry = {
  resolve: (decision: SkillSyncFailureDecision) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type FirstSyncEntry = {
  resolve: (result: FirstSyncPromptResolution) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

const DEFAULT_TIMEOUT_MS = 60_000;

const pendingConflicts = new Map<string, ConflictEntry>();
const pendingFailures = new Map<string, FailureEntry>();
const pendingFirstSync = new Map<string, FirstSyncEntry>();

const clearAndResolve = <T>(
  map: Map<string, { resolve: (v: T) => void; timer: NodeJS.Timeout }>,
  requestId: string,
  value: T,
): boolean => {
  const entry = map.get(requestId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  map.delete(requestId);
  entry.resolve(value);
  return true;
};

const clearAndReject = (
  map: Map<string, { reject: (e: Error) => void; timer: NodeJS.Timeout }>,
  requestId: string,
  error: Error,
): boolean => {
  const entry = map.get(requestId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  map.delete(requestId);
  entry.reject(error);
  return true;
};

const broadcast = (channel: string, payload: Record<string, unknown>): void => {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(channel, payload);
    } catch (error) {
      console.warn(`[SyncDialogCoordinator] failed to send ${channel}:`, error);
    }
  }
};

const hasAnyLiveWindow = (): boolean => {
  const windows = BrowserWindow.getAllWindows();
  return windows.some((win: BrowserWindow) => !win.isDestroyed());
};

export const SyncDialogCoordinator = {
  hasPendingRequests(): boolean {
    return pendingConflicts.size + pendingFailures.size + pendingFirstSync.size > 0;
  },

  /**
   * Ask the renderer to resolve a sync conflict. Returns the user's
   * decision. Defaults to `Skip` on timeout, or when no renderer
   * window is currently available.
   */
  async requestConflictResolution(conflict: SkillSyncConflict): Promise<SkillSyncConflictDecision> {
    if (!hasAnyLiveWindow()) {
      console.log('[SyncDialogCoordinator] no live window, defaulting conflict to Skip');
      return SkillSyncConflictDecision.Skip;
    }

    const requestId = randomUUID();
    return new Promise<SkillSyncConflictDecision>((resolve, reject) => {
      const timer = setTimeout(() => {
        const entry = pendingConflicts.get(requestId);
        if (entry) {
          pendingConflicts.delete(requestId);
          console.warn(`[SyncDialogCoordinator] conflict prompt timed out for ${conflict.skillId} on ${conflict.agent}, defaulting to Skip`);
          entry.resolve(SkillSyncConflictDecision.Skip);
        }
      }, DEFAULT_TIMEOUT_MS);
      pendingConflicts.set(requestId, { resolve, reject, timer });
      broadcast('skills:syncDialog:conflict', { requestId, conflict });
    });
  },

  /**
   * Ask the renderer to resolve a sync failure. Returns the user's
   * decision. Defaults to `Skip` on timeout.
   */
  async requestFailureResolution(failure: SkillSyncFailure): Promise<SkillSyncFailureDecision> {
    if (!hasAnyLiveWindow()) {
      console.log('[SyncDialogCoordinator] no live window, defaulting failure to Skip');
      return SkillSyncFailureDecision.Skip;
    }

    const requestId = randomUUID();
    return new Promise<SkillSyncFailureDecision>((resolve, reject) => {
      const timer = setTimeout(() => {
        const entry = pendingFailures.get(requestId);
        if (entry) {
          pendingFailures.delete(requestId);
          console.warn(`[SyncDialogCoordinator] failure prompt timed out for ${failure.skillId} on ${failure.agent}, defaulting to Skip`);
          entry.resolve(SkillSyncFailureDecision.Skip);
        }
      }, DEFAULT_TIMEOUT_MS);
      pendingFailures.set(requestId, { resolve, reject, timer });
      broadcast('skills:syncDialog:failure', { requestId, failure });
    });
  },

  /**
   * Ask the renderer to show the first-install prompt. Returns the
   * selected target ids and the remember flag. If the renderer is
   * unavailable, returns an empty selection and `rememberChoice=false`.
   */
  async requestFirstSyncTargets(targets: FirstSyncPromptTarget[]): Promise<FirstSyncPromptResolution> {
    if (!hasAnyLiveWindow()) {
      return { selectedTargetIds: [], rememberChoice: false };
    }

    const requestId = randomUUID();
    return new Promise<FirstSyncPromptResolution>((resolve, reject) => {
      const timer = setTimeout(() => {
        const entry = pendingFirstSync.get(requestId);
        if (entry) {
          pendingFirstSync.delete(requestId);
          console.warn('[SyncDialogCoordinator] first-sync prompt timed out, returning empty selection');
          entry.resolve({ selectedTargetIds: [], rememberChoice: false });
        }
      }, DEFAULT_TIMEOUT_MS);
      pendingFirstSync.set(requestId, { resolve, reject, timer });
      broadcast('skills:syncDialog:firstSync', { requestId, targets });
    });
  },

  /**
   * Called by the `ResolveSyncConflict` IPC handler. Returns true if
   * a pending request was matched and resolved.
   */
  acceptConflictDecision(requestId: string, decision: SkillSyncConflictDecision): boolean {
    if (!Object.values(SkillSyncConflictDecision).includes(decision)) {
      return clearAndReject(pendingConflicts, requestId, new Error(`Invalid conflict decision: ${decision}`));
    }
    return clearAndResolve(pendingConflicts, requestId, decision);
  },

  /**
   * Called by the `ReportSyncFailure` IPC handler. Returns true if
   * a pending request was matched and resolved.
   */
  acceptFailureDecision(requestId: string, decision: SkillSyncFailureDecision): boolean {
    if (!Object.values(SkillSyncFailureDecision).includes(decision)) {
      return clearAndReject(pendingFailures, requestId, new Error(`Invalid failure decision: ${decision}`));
    }
    return clearAndResolve(pendingFailures, requestId, decision);
  },

  /**
   * Called by the `PromptFirstSyncTargets` IPC handler. Returns true
   * if a pending request was matched and resolved.
   */
  acceptFirstSyncTargets(
    requestId: string,
    selectedTargetIds: string[],
    rememberChoice: boolean,
  ): boolean {
    const cleaned = Array.isArray(selectedTargetIds) ? selectedTargetIds.filter((id) => typeof id === 'string') : [];
    return clearAndResolve(pendingFirstSync, requestId, {
      selectedTargetIds: cleaned,
      rememberChoice: rememberChoice === true,
    });
  },

  /**
   * Test-only / shutdown helper. Clears all pending requests by
   * rejecting them with the supplied error.
   */
  _resetForTests(): void {
    for (const [id, entry] of pendingConflicts) {
      clearTimeout(entry.timer);
      entry.reject(new Error('coordinator reset'));
      pendingConflicts.delete(id);
    }
    for (const [id, entry] of pendingFailures) {
      clearTimeout(entry.timer);
      entry.reject(new Error('coordinator reset'));
      pendingFailures.delete(id);
    }
    for (const [id, entry] of pendingFirstSync) {
      clearTimeout(entry.timer);
      entry.reject(new Error('coordinator reset'));
      pendingFirstSync.delete(id);
    }
  },
};

export type { FirstSyncPromptResolution, FirstSyncPromptTarget, SkillSyncConflict, SkillSyncFailure };
// Re-export WebContents for tests that may want to assert on the sender.
export type { WebContents };
