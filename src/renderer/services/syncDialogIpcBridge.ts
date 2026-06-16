/**
 * Bridge between the main-process `SyncDialogCoordinator` IPC events
 * and the renderer-side `syncDialogController`.
 *
 * The coordinator broadcasts a dialog request on one of three channels:
 *   - `skills:syncDialog:conflict` → controller.resolveSyncConflict
 *   - `skills:syncDialog:failure`  → controller.reportSyncFailure
 *   - `skills:syncDialog:firstSync` → controller.promptFirstSyncTargets
 *
 * The controller returns a promise that resolves with the user's
 * decision. This bridge then forwards that decision back to the main
 * process via the matching `ResolveSyncConflict` / `ReportSyncFailure`
 * / `PromptFirstSyncTargets` IPC channel, using the same `requestId`
 * the coordinator generated.
 *
 * Mount `startSyncDialogIpcBridge()` once near the React root (alongside
 * the `SyncDialogHost` mount in App.tsx). It returns a stop function
 * that removes the listeners.
 */
import { skillService } from './skill';
import { syncDialogController } from './syncDialogController';

const startSyncDialogIpcBridge = (): (() => void) => {
  const stopConflict = window.electron.skills.onSyncConflictRequest(async (payload) => {
    const requestId = payload.requestId;
    const conflict = payload.conflict as {
      skillId: string;
      agent: string;
      path: string;
      existingSourceType?: 'github' | 'npm' | 'skillhub' | 'clawhub' | 'zip' | 'local' | 'unknown';
      incomingSourceType: 'github' | 'npm' | 'skillhub' | 'clawhub' | 'zip' | 'local' | 'unknown';
    };
    if (!conflict) {
      console.warn('[SyncDialogIpcBridge] conflict payload missing conflict object');
      return;
    }
    const decision = await syncDialogController.resolveSyncConflict({
      skillId: conflict.skillId,
      agent: conflict.agent,
      path: conflict.path,
      existingSourceType: conflict.existingSourceType,
      incomingSourceType: conflict.incomingSourceType,
    });
    await skillService.resolveSyncConflict(requestId, decision);
  });

  const stopFailure = window.electron.skills.onSyncFailureRequest(async (payload) => {
    const requestId = payload.requestId;
    const failure = payload.failure as {
      skillId: string;
      agent: string;
      path: string;
      mode: 'symlink' | 'copy';
      reason: string;
    };
    if (!failure) {
      console.warn('[SyncDialogIpcBridge] failure payload missing failure object');
      return;
    }
    const decision = await syncDialogController.reportSyncFailure({
      skillId: failure.skillId,
      agent: failure.agent,
      path: failure.path,
      mode: failure.mode,
      reason: failure.reason,
    });
    await skillService.reportSyncFailure(requestId, decision);
  });

  const stopFirstSync = window.electron.skills.onFirstSyncPromptRequest(async (payload) => {
    const requestId = payload.requestId;
    const targets = (payload.targets ?? []) as Array<{
      id: string;
      kind: string;
      label?: string;
      path: string;
      enabled: boolean;
      exists: boolean;
    }>;
    const decision = await syncDialogController.promptFirstSyncTargets({
      skillId: 'first-install',
      targets: targets.map((t) => ({
        id: t.id,
        kind: t.kind,
        label: t.label,
        path: t.path,
        enabled: t.enabled,
        exists: t.exists,
      })),
    });
    await skillService.submitFirstSyncTargets(
      requestId,
      decision.selectedTargetIds,
      decision.rememberChoice,
    );
  });

  return () => {
    stopConflict();
    stopFailure();
    stopFirstSync();
  };
};

export { startSyncDialogIpcBridge };
