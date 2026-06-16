import {
  ArrowPathIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { i18nService } from '../../services/i18n';
import { skillService } from '../../services/skill';

type LocalSyncTarget = {
  id: string;
  kind: string;
  label: string;
  path: string;
  enabled: boolean;
  isCustom: boolean;
  builtIn?: boolean;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

const SyncTargetsSettingsView: React.FC = () => {
  const [targets, setTargets] = useState<LocalSyncTarget[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [editingPath, setEditingPath] = useState<Record<string, string>>({});
  const [newPath, setNewPath] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const t = useCallback((key: string) => i18nService.t(key), []);

  const refresh = useCallback(async () => {
    setStatus({ kind: 'loading' });
    try {
      const result = await skillService.getSyncTargets();
      setTargets(result.targets);
      setStatus({ kind: 'ready' });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sortedTargets = useMemo(
    () => [...targets].sort((a, b) => {
      if (a.isCustom !== b.isCustom) return a.isCustom ? 1 : -1;
      return a.label.localeCompare(b.label);
    }),
    [targets],
  );

  const persist = useCallback(async (next: LocalSyncTarget[]) => {
    setStatus({ kind: 'saving' });
    try {
      const ok = await skillService.setSyncTargets(next);
      if (ok) {
        setTargets(next);
      }
      setStatus({ kind: 'ready' });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const handleToggle = useCallback(
    async (target: LocalSyncTarget) => {
      const next = targets.map((entry) =>
        entry.id === target.id ? { ...entry, enabled: !entry.enabled } : entry,
      );
      await persist(next);
    },
    [targets, persist],
  );

  const handlePathSave = useCallback(
    async (target: LocalSyncTarget) => {
      const draft = editingPath[target.id];
      if (draft === undefined || draft === target.path) {
        setEditingPath((prev) => {
          const { [target.id]: _drop, ...rest } = prev;
          return rest;
        });
        return;
      }
      const next = targets.map((entry) =>
        entry.id === target.id ? { ...entry, path: draft } : entry,
      );
      await persist(next);
      setEditingPath((prev) => {
        const { [target.id]: _drop, ...rest } = prev;
        return rest;
      });
    },
    [editingPath, targets, persist],
  );

  const handleAddCustom = useCallback(async () => {
    const trimmedPath = newPath.trim();
    if (!trimmedPath) return;
    const id = `custom-${Date.now().toString(36)}`;
    const next: LocalSyncTarget[] = [
      ...targets,
      {
        id,
        kind: 'custom',
        label: newLabel.trim() || trimmedPath,
        path: trimmedPath,
        enabled: false,
        isCustom: true,
      },
    ];
    await persist(next);
    setNewPath('');
    setNewLabel('');
  }, [newPath, newLabel, targets, persist]);

  const handleRemove = useCallback(
    async (target: LocalSyncTarget) => {
      if (target.builtIn) return;
      const next = targets.filter((entry) => entry.id !== target.id);
      await persist(next);
    },
    [targets, persist],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface-raised/40 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-foreground">
              {t('skillSyncTargetsTitle')}
            </h4>
            <p className="mt-1 text-xs text-secondary">
              {t('skillSyncTargetsDescription')}
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={status.kind === 'loading' || status.kind === 'saving'}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${status.kind === 'loading' ? 'animate-spin' : ''}`} />
            {t('refresh')}
          </button>
        </div>

        {status.kind === 'error' && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-300/40 bg-red-50/60 p-3 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300">
            <XCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{status.message}</span>
          </div>
        )}

        {status.kind === 'loading' && targets.length === 0 ? (
          <div className="mt-4 text-xs text-secondary">{t('loading')}</div>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {sortedTargets.map((target) => {
              const isEditing = editingPath[target.id] !== undefined;
              const draft = isEditing ? editingPath[target.id] : target.path;
              return (
                <li key={target.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <div className="flex-1 min-w-0">
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
                    <div className="mt-1 flex items-center gap-2">
                      {isEditing ? (
                        <input
                          type="text"
                          value={draft}
                          onChange={(e) => setEditingPath((prev) => ({ ...prev, [target.id]: e.target.value }))}
                          className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs font-mono text-foreground"
                          spellCheck={false}
                        />
                      ) : (
                        <code className="flex-1 truncate rounded bg-surface px-2 py-1 text-xs font-mono text-secondary">
                          {target.path}
                        </code>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditing) {
                            handlePathSave(target);
                          } else {
                            setEditingPath((prev) => ({ ...prev, [target.id]: target.path }));
                          }
                        }}
                        className="rounded border border-border px-2 py-1 text-xs text-secondary hover:bg-surface-raised"
                      >
                        {isEditing ? t('save') : t('edit')}
                      </button>
                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPath((prev) => {
                              const { [target.id]: _drop, ...rest } = prev;
                              return rest;
                            });
                          }}
                          className="rounded border border-border px-2 py-1 text-xs text-secondary hover:bg-surface-raised"
                        >
                          {t('cancel')}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={target.enabled}
                        onChange={() => handleToggle(target)}
                        disabled={status.kind === 'saving'}
                        className="h-4 w-4 rounded border-border"
                      />
                      <span className="text-xs text-secondary">
                        {target.enabled ? t('skillSyncEnabled') : t('skillSyncDisabled')}
                      </span>
                    </label>
                    {target.enabled && (
                      <CheckCircleIcon className="h-4 w-4 text-green-500" />
                    )}
                    {!target.builtIn && (
                      <button
                        type="button"
                        onClick={() => handleRemove(target)}
                        className="rounded p-1 text-secondary hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        aria-label={t('delete')}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
            {targets.length === 0 && status.kind !== 'loading' && (
              <li className="py-3 text-xs text-secondary">{t('skillSyncTargetsEmpty')}</li>
            )}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface-raised/40 p-5">
        <h4 className="text-base font-semibold text-foreground">
          {t('skillSyncAddCustomTitle')}
        </h4>
        <p className="mt-1 text-xs text-secondary">{t('skillSyncAddCustomDescription')}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t('skillSyncAddCustomLabelPlaceholder')}
            className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
          />
          <input
            type="text"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder={t('skillSyncAddCustomPathPlaceholder')}
            className="flex-1 rounded border border-border bg-surface px-2 py-1.5 text-xs font-mono text-foreground"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={handleAddCustom}
            disabled={!newPath.trim() || status.kind === 'saving'}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {t('add')}
          </button>
        </div>
      </section>
    </div>
  );
};

export default SyncTargetsSettingsView;
