import { useCallback, useEffect, useMemo, useState } from 'react';

import { i18nService } from '../../services/i18n';
import { skillService } from '../../services/skill';
import Modal from '../common/Modal';

type SyncTarget = {
  id: string;
  kind: string;
  label: string;
  path: string;
  enabled: boolean;
  isCustom: boolean;
  builtIn?: boolean;
};

type FirstSyncTargetsPromptProps = {
  open: boolean;
  onClose: (selectedTargets: SyncTarget[]) => void;
};

/**
 * Modal that prompts the user the first time they install a skill to choose
 * which sync targets to enable. The caller (download flow) is responsible for
 * reloading sync targets after the prompt closes.
 */
const FirstSyncTargetsPrompt: React.FC<FirstSyncTargetsPromptProps> = ({ open, onClose }) => {
  const [targets, setTargets] = useState<SyncTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = useCallback((key: string) => i18nService.t(key), []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    skillService
      .getSyncTargets()
      .then((result) => {
        if (cancelled) return;
        // Pre-select built-in targets so the user can deselect what they don't want.
        setTargets(result.targets.map((entry) => ({ ...entry })));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  /**
   * Write the first-run flag through the same IPC channel used by the manager.
   * Avoids requiring a dedicated service method.
   */
  const markFirstRunPrompted = useCallback(async () => {
    try {
      await window.electron.skills.setSyncTargetsFirstRunPrompted(true);
    } catch (err) {
      console.warn('Failed to mark first-run prompt:', err);
    }
  }, []);

  const enabledCount = useMemo(
    () => targets.filter((entry) => entry.enabled).length,
    [targets],
  );

  const handleToggle = useCallback((id: string) => {
    setTargets((prev) =>
      prev.map((entry) =>
        entry.id === id ? { ...entry, enabled: !entry.enabled } : entry,
      ),
    );
  }, []);

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    try {
      await skillService.setSyncTargets(targets as never[]);
      await markFirstRunPrompted();
      onClose(targets);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [targets, onClose, markFirstRunPrompted]);

  const handleSkip = useCallback(async () => {
    await markFirstRunPrompted();
    onClose(targets);
  }, [targets, onClose, markFirstRunPrompted]);

  return (
    <Modal
      isOpen={open}
      onClose={() => onClose(targets)}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      className="w-[460px] max-w-[calc(100vw-32px)] rounded-2xl border border-border bg-surface shadow-modal"
    >
      <div className="space-y-4 p-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {t('skillSyncFirstPromptTitle')}
          </h3>
          <p className="mt-1 text-xs text-secondary">
            {t('skillSyncFirstPromptDescription')}
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300/40 bg-red-50/60 p-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <ul className="max-h-[280px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {targets.length === 0 && !loading && (
            <li className="p-3 text-xs text-secondary">
              {t('skillSyncTargetsEmpty')}
            </li>
          )}
          {targets.map((target) => (
            <li key={target.id} className="flex items-center gap-3 p-3">
              <input
                type="checkbox"
                checked={target.enabled}
                onChange={() => handleToggle(target.id)}
                disabled={loading}
                className="h-4 w-4 rounded border-border"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {target.label}
                  </span>
                  {target.builtIn && (
                    <span className="rounded-full bg-primary-muted px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {t('skillSyncTargetBuiltIn')}
                    </span>
                  )}
                </div>
                <code className="block truncate text-[11px] font-mono text-secondary">
                  {target.path}
                </code>
              </div>
            </li>
          ))}
        </ul>

        <p className="text-xs text-secondary">
          {t('skillSyncFirstPromptEnabledCount').replace('{count}', String(enabledCount))}
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleSkip}
            disabled={loading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-raised disabled:opacity-50"
          >
            {t('skillSyncFirstPromptSkip')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {t('skillSyncFirstPromptConfirm')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default FirstSyncTargetsPrompt;
export type { SyncTarget };
