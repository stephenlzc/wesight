/**
 * Pure label helpers used by sync dialogs.
 *
 * The dialog components call these to map enum-style values to i18n
 * strings. Extracted so the routing logic can be unit-tested without
 * rendering React or touching the i18n service.
 */
import {
  type SkillSourceType as SkillSourceTypeValue,
  SkillSyncMode,
  SkillSyncTargetKind,
} from '@shared/skills/constants';

import { i18nService } from '../../../services/i18n';

export function getSyncAgentLabel(agent: string): string {
  switch (agent) {
    case SkillSyncTargetKind.ClaudeCode: return i18nService.t('skillSyncAgentClaudeCode');
    case SkillSyncTargetKind.Kimi: return i18nService.t('skillSyncAgentKimi');
    case SkillSyncTargetKind.OpenClaw: return i18nService.t('skillSyncAgentOpenClaw');
    case SkillSyncTargetKind.Codex: return i18nService.t('skillSyncAgentCodex');
    case SkillSyncTargetKind.Custom: return i18nService.t('skillSyncAgentCustom');
    default: return agent;
  }
}

export function getSyncModeLabel(mode: SkillSyncMode): string {
  switch (mode) {
    case SkillSyncMode.Symlink: return i18nService.t('skillSyncModeSymlink');
    case SkillSyncMode.Copy: return i18nService.t('skillSyncModeCopy');
    default: return mode;
  }
}

export function getSourceTypeLabel(sourceType: SkillSourceTypeValue | undefined): string {
  if (!sourceType) return i18nService.t('skillDetailSourceUnknown');
  switch (sourceType) {
    case 'github': return i18nService.t('skillDetailSourceGithub');
    case 'npm': return i18nService.t('skillDetailSourceNpm');
    case 'skillhub': return i18nService.t('skillDetailSourceSkillhub');
    case 'clawhub': return i18nService.t('skillDetailSourceClawhub');
    case 'zip': return i18nService.t('skillDetailSourceZip');
    case 'local': return i18nService.t('skillDetailSourceLocal');
    case 'unknown': return i18nService.t('skillDetailSourceUnknown');
    default: return sourceType;
  }
}
