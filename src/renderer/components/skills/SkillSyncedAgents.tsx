import type { SkillSyncMode } from '@shared/skills/constants';

import { i18nService } from '../../services/i18n';
import type { SkillSyncTargetEntry } from '../../types/skill';
import { isSymlinkMode, shortenSyncPath } from './skillSyncedAgentsFormatting';

type SkillSyncedAgentsProps = {
  /**
   * Sync destinations recorded for the current skill. Sourced from
   * the `skill_metadata.sync_targets` JSON column via SkillManager.
   * Each entry is one (agent, path, mode) tuple written by the
   * cross-agent sync orchestrator after install or upgrade.
   */
  targets: SkillSyncTargetEntry[] | undefined;
};

const agentLabel = (agent: string): string => {
  switch (agent) {
    case 'claude-code': return i18nService.t('skillSyncAgentClaudeCode');
    case 'kimi': return i18nService.t('skillSyncAgentKimi');
    case 'openclaw': return i18nService.t('skillSyncAgentOpenClaw');
    case 'codex': return i18nService.t('skillSyncAgentCodex');
    case 'custom': return i18nService.t('skillSyncAgentCustom');
    default: return agent;
  }
};

const modeLabel = (mode: SkillSyncMode): string => {
  switch (mode) {
    case 'symlink': return i18nService.t('skillSyncModeSymlink');
    case 'copy': return i18nService.t('skillSyncModeCopy');
    default: return mode;
  }
};

/**
 * Displays the per-skill cross-agent sync destinations recorded by
 * the SkillManager. Each row shows the agent kind, the resolved path
 * inside that agent's skills folder, and whether the link was made
 * with a symlink or a full copy.
 *
 * Returns null when there are no recorded targets — the absence of
 * a target list means the skill predates the sync registry, was
 * bundled, or has not yet been synced.
 */
export function SkillSyncedAgents({ targets }: SkillSyncedAgentsProps) {
  if (!targets || targets.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center text-xs">
        <span className="w-16 flex-shrink-0 text-secondary">
          {i18nService.t('skillDetailSyncedAgents')}
        </span>
        <span className="text-xs text-secondary">
          {i18nService.t('skillSyncedAgentsCount').replace('{count}', String(targets.length))}
        </span>
      </div>
      <ul className="space-y-1 pl-16">
        {targets.map((entry, index) => (
          <li
            key={`${entry.agent}:${entry.path}:${index}`}
            className="flex items-center text-xs gap-1.5"
          >
            <span className="px-1.5 py-0.5 rounded bg-surface-raised text-foreground font-medium">
              {agentLabel(String(entry.agent))}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded font-medium font-mono ${
                isSymlinkMode(entry.mode)
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
            >
              {modeLabel(entry.mode as SkillSyncMode)}
            </span>
            <span
              className="text-secondary font-mono truncate"
              title={entry.path}
            >
              {shortenSyncPath(entry.path)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
