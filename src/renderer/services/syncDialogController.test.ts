/**
 * Tests for the renderer-side sync dialog controller.
 *
 * Verifies the small state machine: only one dialog of each kind is
 * open at a time, decisions resolve the corresponding promise, and
 * `dismissAll` resolves pending promises with safe defaults.
 */
import {
  SkillSyncConflictDecision,
  SkillSyncFailureDecision,
} from '@shared/skills/constants';
import { beforeEach, expect, test, vi } from 'vitest';

import { syncDialogController } from './syncDialogController';

vi.mock('./i18n', () => ({
  i18nService: {
    t: (key: string) => key,
  },
}));

beforeEach(() => {
  // Drain any leftover pending requests from previous tests.
  syncDialogController.dismissAll();
});

test('promptFirstSyncTargets resolves with the user selection', async () => {
  const listener = vi.fn();
  syncDialogController.subscribe(listener);

  const promise = syncDialogController.promptFirstSyncTargets({
    skillId: 'skill-1',
    targets: [
      { id: 'claude-code', kind: 'claude-code', path: '/tmp/cc', enabled: true, exists: true },
    ],
  });

  expect(listener).toHaveBeenCalled();
  const state = syncDialogController.getState();
  expect(state.firstInstall?.skillId).toBe('skill-1');

  state.firstInstall?.resolve({ selectedTargetIds: ['claude-code'], rememberChoice: true });
  await expect(promise).resolves.toEqual({ selectedTargetIds: ['claude-code'], rememberChoice: true });
  expect(syncDialogController.getState().firstInstall).toBeUndefined();
});

test('resolveSyncConflict resolves with the chosen decision', async () => {
  const promise = syncDialogController.resolveSyncConflict({
    skillId: 'skill-2',
    agent: 'claude-code',
    path: '/tmp/cc/skill-2',
    existingSourceType: 'github',
    incomingSourceType: 'npm',
  });

  const state = syncDialogController.getState();
  expect(state.conflict?.skillId).toBe('skill-2');
  state.conflict?.resolve(SkillSyncConflictDecision.Replace);

  await expect(promise).resolves.toBe(SkillSyncConflictDecision.Replace);
  expect(syncDialogController.getState().conflict).toBeUndefined();
});

test('reportSyncFailure resolves with the chosen decision', async () => {
  const promise = syncDialogController.reportSyncFailure({
    skillId: 'skill-3',
    agent: 'codex',
    path: '/tmp/codex/skill-3',
    mode: 'symlink',
    reason: 'EPERM',
  });

  const state = syncDialogController.getState();
  expect(state.failure?.reason).toBe('EPERM');
  state.failure?.resolve(SkillSyncFailureDecision.Retry);

  await expect(promise).resolves.toBe(SkillSyncFailureDecision.Retry);
  expect(syncDialogController.getState().failure).toBeUndefined();
});

test('dismissAll resolves all pending dialogs with safe defaults', async () => {
  const firstInstall = syncDialogController.promptFirstSyncTargets({
    skillId: 'skill-x',
    targets: [],
  });
  const conflict = syncDialogController.resolveSyncConflict({
    skillId: 'skill-x',
    agent: 'claude-code',
    path: '/tmp',
    incomingSourceType: 'github',
  });
  const failure = syncDialogController.reportSyncFailure({
    skillId: 'skill-x',
    agent: 'claude-code',
    path: '/tmp',
    mode: 'symlink',
    reason: 'EPERM',
  });

  syncDialogController.dismissAll();

  await expect(firstInstall).resolves.toEqual({ selectedTargetIds: [], rememberChoice: false });
  await expect(conflict).resolves.toBe(SkillSyncConflictDecision.Skip);
  await expect(failure).resolves.toBe(SkillSyncFailureDecision.Skip);
  expect(syncDialogController.getState()).toEqual({});
});

test('subscribe returns an unsubscribe handle', () => {
  const listener = vi.fn();
  const unsubscribe = syncDialogController.subscribe(listener);
  syncDialogController.promptFirstSyncTargets({ skillId: 's', targets: [] });
  expect(listener).toHaveBeenCalled();
  listener.mockClear();
  unsubscribe();
  syncDialogController.dismissAll();
  expect(listener).not.toHaveBeenCalled();
});
