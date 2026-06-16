/**
 * Sync dialog controller.
 *
 * Single renderer-side event bus that the IPC integration layer pushes
 * dialog requests into, and the `SyncDialogHost` component consumes.
 *
 * Three event sources currently route through this controller:
 *   - `promptFirstSyncTargets` — shown after the first successful skill
 *     install (or first open of the skills panel) when the user has not
 *     picked a sync target yet.
 *   - `resolveSyncConflict` — shown when a target directory already
 *     contains a skill with the same id but a different source.
 *   - `reportSyncFailure` — shown when a sync attempt throws (e.g.
 *     symlink EPERM on a non-developer-mode Windows install).
 *
 * Each request carries a `resolve` callback that the host invokes with
 * the user's decision. Callers `await` the promise to receive the
 * decision string from the shared-constants enums.
 */
import {
  type SkillSourceType as SkillSourceTypeValue,
  SkillSyncConflictDecision,
  SkillSyncFailureDecision,
  type SkillSyncMode,
} from '@shared/skills/constants';

import { i18nService } from './i18n';

export type FirstSyncPromptTarget = {
  id: string;
  kind: string;
  label?: string;
  path: string;
  enabled: boolean;
  exists: boolean;
};

export type FirstSyncPromptRequest = {
  skillId: string;
  skillName?: string;
  targets: FirstSyncPromptTarget[];
  resolve: (decision: {
    selectedTargetIds: string[];
    rememberChoice: boolean;
  }) => void;
};

export type SyncConflictRequest = {
  skillId: string;
  skillName?: string;
  agent: string;
  path: string;
  existingSourceType?: SkillSourceTypeValue;
  incomingSourceType: SkillSourceTypeValue;
  resolve: (decision: SkillSyncConflictDecision) => void;
};

export type SyncFailureRequest = {
  skillId: string;
  skillName?: string;
  agent: string;
  path: string;
  mode: SkillSyncMode;
  reason: string;
  disableCancel?: boolean;
  resolve: (decision: SkillSyncFailureDecision) => void;
};

export type SyncDialogState = {
  firstInstall?: FirstSyncPromptRequest;
  conflict?: SyncConflictRequest;
  failure?: SyncFailureRequest;
};

type Listener = (state: SyncDialogState) => void;

const noopFirstInstall = (): {
  selectedTargetIds: string[];
  rememberChoice: boolean;
} => ({ selectedTargetIds: [], rememberChoice: false });

class SyncDialogController {
  private state: SyncDialogState = {};
  private listeners = new Set<Listener>();

  getState(): SyncDialogState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  promptFirstSyncTargets(input: {
    skillId: string;
    skillName?: string;
    targets: FirstSyncPromptTarget[];
  }): Promise<{ selectedTargetIds: string[]; rememberChoice: boolean }> {
    return new Promise((resolve) => {
      this.update({
        firstInstall: {
          ...input,
          resolve: (decision) => {
            this.clear('firstInstall');
            resolve(decision);
          },
        },
      });
    });
  }

  resolveSyncConflict(input: {
    skillId: string;
    skillName?: string;
    agent: string;
    path: string;
    existingSourceType?: SkillSourceTypeValue;
    incomingSourceType: SkillSourceTypeValue;
  }): Promise<SkillSyncConflictDecision> {
    return new Promise((resolve) => {
      this.update({
        conflict: {
          ...input,
          resolve: (decision) => {
            this.clear('conflict');
            resolve(decision);
          },
        },
      });
    });
  }

  reportSyncFailure(input: {
    skillId: string;
    skillName?: string;
    agent: string;
    path: string;
    mode: SkillSyncMode;
    reason: string;
    disableCancel?: boolean;
  }): Promise<SkillSyncFailureDecision> {
    return new Promise((resolve) => {
      this.update({
        failure: {
          ...input,
          resolve: (decision) => {
            this.clear('failure');
            resolve(decision);
          },
        },
      });
    });
  }

  /**
   * Used by the host's modal `onClose` to dismiss without deciding.
   * The promise resolves to a benign default (Skip / manage-later) so
   * callers can `await` without handling a rejection.
   */
  dismissAll(): void {
    const previous = this.state;
    this.state = {};
    if (previous.firstInstall?.resolve) {
      previous.firstInstall.resolve(noopFirstInstall());
    }
    if (previous.conflict?.resolve) {
      // Skip is the only safe default — Replace could overwrite user data.
      previous.conflict.resolve(SkillSyncConflictDecision.Skip);
    }
    if (previous.failure?.resolve) {
      previous.failure.resolve(SkillSyncFailureDecision.Skip);
    }
    this.emit();
  }

  private update(partial: Partial<SyncDialogState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  private clear(key: keyof SyncDialogState): void {
    if (this.state[key] === undefined) return;
    const next: SyncDialogState = { ...this.state };
    delete next[key];
    this.state = next;
    this.emit();
  }

  private emit(): void {
    const snapshot = this.state;
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.warn('[SyncDialogController] listener error:', error);
      }
    });
  }
}

export const syncDialogController = new SyncDialogController();

/**
 * Translate a `SkillSourceType` (or unknown string) into a human-readable
 * fallback for dialog titles when the skill name is missing.
 */
export function describeUnknownSkill(skillId: string): string {
  return skillId || i18nService.t('skillDetailSourceUnknown');
}
