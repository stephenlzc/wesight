import { useState } from 'react';

import { i18nService } from '../../../services/i18n';
import Modal from '../../common/Modal';
import { getSyncAgentLabel } from './syncDialogLabels';

export type FirstSyncPromptTarget = {
  id: string;
  kind: string;
  label?: string;
  path: string;
  enabled: boolean;
  exists: boolean;
};

export type FirstSyncPromptResolution = {
  /** Target IDs the user wants to enable. Empty array means "skip / manage later". */
  selectedTargetIds: string[];
  /**
   * When true, the renderer will mark the firstRunPrompted flag so the
   * dialog does not appear again until the user resets it in Settings.
   */
  rememberChoice: boolean;
};

type SkillFirstSyncPromptDialogProps = {
  open: boolean;
  /**
   * Targets surfaced to the user. Only enabled, on-disk targets are
   * eligible for selection — disabled or missing ones appear in the
   * list but are disabled in the checkbox column.
   */
  targets: FirstSyncPromptTarget[];
  onResolve: (resolution: FirstSyncPromptResolution) => void;
};

const resolveLabel = (target: FirstSyncPromptTarget): string => {
  if (target.label) return target.label;
  return getSyncAgentLabel(target.kind) || target.kind;
};

export function SkillFirstSyncPromptDialog({
  open,
  targets,
  onResolve,
}: SkillFirstSyncPromptDialogProps) {
  const eligible = targets.filter((t) => t.enabled && t.exists);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(eligible.map((t) => t.id)));
  const [remember, setRemember] = useState(true);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onResolve({
      selectedTargetIds: Array.from(selected),
      rememberChoice: remember,
    });
  };

  const handleSkip = () => {
    onResolve({
      selectedTargetIds: [],
      rememberChoice: remember,
    });
  };

  return (
    <Modal
      onClose={handleSkip}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      className="w-full max-w-md mx-4 rounded-2xl bg-surface border border-border shadow-2xl p-6"
    >
      <div className="text-lg font-semibold text-foreground">
        {i18nService.t('skillFirstSyncPromptTitle')}
      </div>
      <p className="mt-2 text-sm text-secondary">
        {i18nService.t('skillFirstSyncPromptDescription')}
      </p>

      <ul className="mt-4 space-y-2 max-h-64 overflow-y-auto">
        {targets.map((target) => {
          const isEligible = target.enabled && target.exists;
          const isSelected = selected.has(target.id);
          return (
            <li
              key={target.id}
              className={`flex items-center gap-3 p-2 rounded-lg border border-border ${
                isEligible ? 'bg-surface' : 'bg-surface-raised/40 opacity-60'
              }`}
            >
              <input
                type="checkbox"
                id={`first-sync-target-${target.id}`}
                checked={isEligible && isSelected}
                disabled={!isEligible}
                onChange={() => toggle(target.id)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary disabled:opacity-50"
              />
              <label
                htmlFor={`first-sync-target-${target.id}`}
                className="flex-1 cursor-pointer"
              >
                <div className="text-sm font-medium text-foreground">
                  {resolveLabel(target)}
                </div>
                <div className="text-xs text-secondary font-mono truncate" title={target.path}>
                  {target.path}
                </div>
                {!target.exists && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    {i18nService.t('skillFirstSyncPromptTargetMissing')}
                  </div>
                )}
                {!target.enabled && target.exists && (
                  <div className="text-xs text-secondary mt-0.5">
                    {i18nService.t('skillFirstSyncPromptTargetDisabled')}
                  </div>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      <label className="mt-4 flex items-center gap-2 text-xs text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
        />
        {i18nService.t('skillFirstSyncPromptRememberChoice')}
      </label>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleSkip}
          className="px-3 py-1.5 text-sm rounded-lg text-secondary hover:bg-surface-raised transition-colors"
        >
          {i18nService.t('skillFirstSyncPromptManageLater')}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {i18nService.t('skillFirstSyncPromptConfirm')}
        </button>
      </div>
    </Modal>
  );
}
