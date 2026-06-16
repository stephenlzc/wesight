import type { SkillSourceType } from '@shared/skills/constants';

import { i18nService } from '../../services/i18n';
import type { SkillSource } from '../../types/skill';

type SkillSourceInfoProps = {
  source: SkillSource | undefined;
  /**
   * Best-effort installation timestamp (ms) — typically the SKILL.md
   * mtime when we don't have richer metadata. Used as a fallback
   * display value when the source row is missing.
   */
  fallbackInstalledAt?: number;
};

const sourceTypeLabel = (type: SkillSourceType): string => {
  switch (type) {
    case 'github': return i18nService.t('skillDetailSourceGithub');
    case 'npm': return i18nService.t('skillDetailSourceNpm');
    case 'skillhub': return i18nService.t('skillDetailSourceSkillhub');
    case 'clawhub': return i18nService.t('skillDetailSourceClawhub');
    case 'zip': return i18nService.t('skillDetailSourceZip');
    case 'local': return i18nService.t('skillDetailSourceLocal');
    case 'unknown':
    default:
      return i18nService.t('skillDetailSourceUnknown');
  }
};

const formatDate = (timestamp: number | undefined): string => {
  if (!timestamp || !Number.isFinite(timestamp)) return '—';
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return '—';
  }
};

/**
 * Displays the metadata-derived provenance of an installed skill
 * (source type / URL / ref / author / license, plus install/update
 * times). Shown inside the skill-detail modal in the manager UI.
 *
 * Falls back to the "Unknown source" message for legacy installs
 * that predate the skill_metadata table — those rows are written
 * with source_type='unknown' on first start.
 */
export function SkillSourceInfo({ source, fallbackInstalledAt }: SkillSourceInfoProps) {
  if (!source) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center text-xs">
        <span className="w-16 flex-shrink-0 text-secondary">
          {i18nService.t('skillDetailSource')}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-surface-raised text-foreground font-medium">
          {sourceTypeLabel(source.type)}
        </span>
        {source.ref && (
          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-surface-raised text-foreground font-medium font-mono">
            {source.ref}
          </span>
        )}
        {source.author && (
          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-surface-raised text-foreground font-medium">
            {source.author}
          </span>
        )}
        {source.license && (
          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-surface-raised text-foreground font-medium">
            {source.license}
          </span>
        )}
      </div>

      {source.url && (
        <div className="flex items-start text-xs">
          <span className="w-16 flex-shrink-0 text-secondary pt-0.5">URL</span>
          <button
            type="button"
            className="text-primary hover:underline break-all text-left"
            onClick={(e) => {
              e.stopPropagation();
              window.electron.shell.openExternal(source.url as string);
            }}
          >
            {source.url}
          </button>
        </div>
      )}

      <div className="flex items-start text-xs">
        <span className="w-16 flex-shrink-0 text-secondary pt-0.5">
          {i18nService.t('skillDetailInstalledAt')}
        </span>
        <span className="text-foreground">
          {formatDate(fallbackInstalledAt)}
        </span>
      </div>
    </div>
  );
}
