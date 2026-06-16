import {
  type SkillSourceType as SkillSourceTypeValue,
  SkillSyncConflictDecision,
} from '@shared/skills/constants';

import { i18nService } from '../../../services/i18n';
import Modal from '../../common/Modal';
import { getSourceTypeLabel, getSyncAgentLabel } from './syncDialogLabels';

type SkillSyncConflictDialogProps = {
  open: boolean;
  skillId: string;
  skillName?: string;
  agent: string;
  path: string;
  existingSourceType?: SkillSourceTypeValue;
  incomingSourceType: SkillSourceTypeValue;
  onResolve: (decision: SkillSyncConflictDecision) => void;
};

export function SkillSyncConflictDialog({
  open,
  skillId,
  skillName,
  agent,
  path,
  existingSourceType,
  incomingSourceType,
  onResolve,
}: SkillSyncConflictDialogProps) {
  if (!open) return null;
  const displayName = skillName || skillId;
  const sameSource = existingSourceType === incomingSourceType;
  const agentName = getSyncAgentLabel(agent);

  return (
    <Modal
      onClose={() => onResolve(SkillSyncConflictDecision.Skip)}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      className="w-full max-w-md mx-4 rounded-2xl bg-surface border border-border shadow-2xl p-6"
    >
      <div className="text-lg font-semibold text-foreground">
        {i18nService.t('skillSyncConflictTitle')
          .replace('{agent}', agentName)
          .replace('{name}', displayName)}
      </div>
      <p className="mt-2 text-sm text-secondary">
        {i18nService.t('skillSyncConflictDescription')
          .replace('{agent}', agentName)
          .replace('{path}', path)}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-border p-2">
          <div className="text-secondary">{i18nService.t('skillSyncConflictExisting')}</div>
          <div className="mt-1 font-medium text-foreground">{getSourceTypeLabel(existingSourceType)}</div>
        </div>
        <div className="rounded-lg border border-border p-2">
          <div className="text-secondary">{i18nService.t('skillSyncConflictIncoming')}</div>
          <div className="mt-1 font-medium text-foreground">{getSourceTypeLabel(incomingSourceType)}</div>
        </div>
      </div>

      {sameSource && (
        <p className="mt-3 text-xs text-secondary">
          {i18nService.t('skillSyncConflictSameSourceHint')}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onResolve(SkillSyncConflictDecision.Replace)}
          className="w-full px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {i18nService.t('skillSyncConflictReplace')}
        </button>
        <button
          type="button"
          onClick={() => onResolve(SkillSyncConflictDecision.Keep)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-surface-raised transition-colors"
        >
          {i18nService.t('skillSyncConflictKeep')}
        </button>
        <button
          type="button"
          onClick={() => onResolve(SkillSyncConflictDecision.Skip)}
          className="w-full px-3 py-2 text-sm rounded-lg text-secondary hover:bg-surface-raised transition-colors"
        >
          {i18nService.t('skillSyncConflictSkip')}
        </button>
      </div>
    </Modal>
  );
}
