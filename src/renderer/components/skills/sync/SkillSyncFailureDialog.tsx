import {
  SkillSyncFailureDecision,
  SkillSyncMode,
} from '@shared/skills/constants';

import { i18nService } from '../../../services/i18n';
import Modal from '../../common/Modal';
import { getSyncAgentLabel, getSyncModeLabel } from './syncDialogLabels';

type SkillSyncFailureDialogProps = {
  open: boolean;
  skillId: string;
  skillName?: string;
  agent: string;
  path: string;
  mode: SkillSyncMode;
  reason: string;
  /**
   * When true, the "Cancel" option is suppressed. Use this when the
   * failure is part of an upgrade or removal flow that cannot be
   * cancelled without leaving the system in an inconsistent state.
   */
  disableCancel?: boolean;
  onResolve: (decision: SkillSyncFailureDecision) => void;
};

export function SkillSyncFailureDialog({
  open,
  skillId,
  skillName,
  agent,
  path,
  mode,
  reason,
  disableCancel = false,
  onResolve,
}: SkillSyncFailureDialogProps) {
  if (!open) return null;
  const displayName = skillName || skillId;
  const agentName = getSyncAgentLabel(agent);

  return (
    <Modal
      onClose={() => onResolve(SkillSyncFailureDecision.Skip)}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      className="w-full max-w-md mx-4 rounded-2xl bg-surface border border-border shadow-2xl p-6"
    >
      <div className="text-lg font-semibold text-foreground">
        {i18nService.t('skillSyncFailureTitle')
          .replace('{agent}', agentName)
          .replace('{name}', displayName)}
      </div>
      <p className="mt-2 text-sm text-secondary">
        {i18nService.t('skillSyncFailureDescription')}
      </p>

      <div className="mt-4 space-y-2 text-xs">
        <div className="flex items-start gap-2">
          <span className="text-secondary flex-shrink-0 w-14">{i18nService.t('skillSyncFailurePathLabel')}</span>
          <code className="font-mono text-foreground break-all flex-1">{path}</code>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-secondary flex-shrink-0 w-14">{i18nService.t('skillSyncFailureModeLabel')}</span>
          <span className="text-foreground flex-1">{getSyncModeLabel(mode)}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-secondary flex-shrink-0 w-14">{i18nService.t('skillSyncFailureReasonLabel')}</span>
          <span className="text-red-500 dark:text-red-400 flex-1 break-words">{reason}</span>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onResolve(SkillSyncFailureDecision.Retry)}
          className="w-full px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {i18nService.t('skillSyncFailureRetry')}
        </button>
        <button
          type="button"
          onClick={() => onResolve(SkillSyncFailureDecision.Skip)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-surface-raised transition-colors"
        >
          {i18nService.t('skillSyncFailureSkip')}
        </button>
        {!disableCancel && (
          <button
            type="button"
            onClick={() => onResolve(SkillSyncFailureDecision.Cancel)}
            className="w-full px-3 py-2 text-sm rounded-lg text-secondary hover:bg-surface-raised transition-colors"
          >
            {i18nService.t('skillSyncFailureCancel')}
          </button>
        )}
      </div>
    </Modal>
  );
}
