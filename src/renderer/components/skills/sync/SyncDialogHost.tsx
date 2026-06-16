/**
 * Host component for the three sync dialogs.
 *
 * Subscribes to `syncDialogController` and renders whichever dialog has a
 * pending request. Mounted once near the React root (see App.tsx) so
 * dialogs appear above the rest of the UI regardless of which view the
 * user is currently looking at.
 */
import { useEffect, useState } from 'react';

import { syncDialogController, type SyncDialogState } from '../../../services/syncDialogController';
import {
  SkillFirstSyncPromptDialog,
} from './SkillFirstSyncPromptDialog';
import { SkillSyncConflictDialog } from './SkillSyncConflictDialog';
import { SkillSyncFailureDialog } from './SkillSyncFailureDialog';

export function SyncDialogHost(): JSX.Element {
  const [state, setState] = useState<SyncDialogState>(() => syncDialogController.getState());

  useEffect(() => {
    return syncDialogController.subscribe(setState);
  }, []);

  return (
    <>
      <SkillFirstSyncPromptDialog
        open={Boolean(state.firstInstall)}
        targets={state.firstInstall?.targets ?? []}
        onResolve={(resolution) => {
          state.firstInstall?.resolve(resolution);
        }}
      />
      <SkillSyncConflictDialog
        open={Boolean(state.conflict)}
        skillId={state.conflict?.skillId ?? ''}
        skillName={state.conflict?.skillName}
        agent={state.conflict?.agent ?? ''}
        path={state.conflict?.path ?? ''}
        existingSourceType={state.conflict?.existingSourceType}
        incomingSourceType={state.conflict?.incomingSourceType ?? 'unknown'}
        onResolve={(decision) => {
          state.conflict?.resolve(decision);
        }}
      />
      <SkillSyncFailureDialog
        open={Boolean(state.failure)}
        skillId={state.failure?.skillId ?? ''}
        skillName={state.failure?.skillName}
        agent={state.failure?.agent ?? ''}
        path={state.failure?.path ?? ''}
        mode={state.failure?.mode ?? 'symlink'}
        reason={state.failure?.reason ?? ''}
        disableCancel={state.failure?.disableCancel ?? false}
        onResolve={(decision) => {
          state.failure?.resolve(decision);
        }}
      />
    </>
  );
}
