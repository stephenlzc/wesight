export const SkillsIpcChannel = {
  List: 'skills:list',
  SetEnabled: 'skills:setEnabled',
  Delete: 'skills:delete',
  Download: 'skills:download',
  Upgrade: 'skills:upgrade',
  ConfirmInstall: 'skills:confirmInstall',
  GetRoot: 'skills:getRoot',
  AutoRoutingPrompt: 'skills:autoRoutingPrompt',
  GetConfig: 'skills:getConfig',
  SetConfig: 'skills:setConfig',
  TestEmailConnectivity: 'skills:testEmailConnectivity',
  FetchMarketplace: 'skills:fetchMarketplace',
  SearchMarketplace: 'skills:searchMarketplace',
  InstallMarketplaceSkill: 'skills:installMarketplaceSkill',
  GetSyncTargets: 'skills:getSyncTargets',
  SetSyncTargets: 'skills:setSyncTargets',
  GetSkillMetadata: 'skills:getSkillMetadata',
  ListSkillMetadata: 'skills:listSkillMetadata',
  ResolveSyncConflict: 'skills:resolveSyncConflict',
  ReportSyncFailure: 'skills:reportSyncFailure',
  PromptFirstSyncTargets: 'skills:promptFirstSyncTargets',
  Changed: 'skills:changed',
} as const;

export type SkillsIpcChannel = typeof SkillsIpcChannel[keyof typeof SkillsIpcChannel];

export const SkillMarketplaceSourceType = {
  SkillHub: 'skillhub',
  ClawHub: 'clawhub',
  GitHub: 'github',
} as const;

export type SkillMarketplaceSourceType =
  typeof SkillMarketplaceSourceType[keyof typeof SkillMarketplaceSourceType];

export const SkillMarketplaceSort = {
  Recommended: 'recommended',
  Latest: 'latest',
  Trending: 'trending',
  Rating: 'rating',
  Stars: 'stars',
} as const;

export type SkillMarketplaceSort =
  typeof SkillMarketplaceSort[keyof typeof SkillMarketplaceSort];

export const SkillMarketplaceCategory = {
  Featured: 'featured',
  Coding: 'coding',
  Office: 'office',
  Data: 'data',
  Automation: 'automation',
  Research: 'research',
  Media: 'media',
  ImOps: 'im_ops',
  Integration: 'integration',
  Other: 'other',
} as const;

export type SkillMarketplaceCategory =
  typeof SkillMarketplaceCategory[keyof typeof SkillMarketplaceCategory];

export const SkillSourceType = {
  GitHub: 'github',
  Npm: 'npm',
  SkillHub: 'skillhub',
  ClawHub: 'clawhub',
  Zip: 'zip',
  Local: 'local',
  Unknown: 'unknown',
} as const;

export type SkillSourceType = typeof SkillSourceType[keyof typeof SkillSourceType];

/**
 * Provenance descriptor for an installed skill. Sourced from the
 * `skill_metadata` table; surfaced to the renderer so the skill-detail
 * UI can show how the skill was obtained.
 */
export type SkillSource = {
  type: SkillSourceType;
  url?: string;
  ref?: string;
  author?: string;
  license?: string;
};

/**
 * Full metadata row exposed to the renderer. Includes the provenance
 * descriptor plus install/update timestamps. Fields beyond those
 * (fileHash, remoteVersion, lastCheckAt, dirty, syncTargets) are
 * reserved for the future cross-agent sync work (#53-#56) and are
 * intentionally not surfaced to the UI in v1.
 */
export type SkillMetadata = {
  id: string;
  name?: string;
  version?: string;
  sourceType: SkillSourceType;
  sourceUrl?: string;
  sourceRef?: string;
  author?: string;
  license?: string;
  homepage?: string;
  installedAt: number;
  updatedAt: number;
};

export const SkillSyncMode = {
  Symlink: 'symlink',
  Copy: 'copy',
} as const;

export type SkillSyncMode = typeof SkillSyncMode[keyof typeof SkillSyncMode];

export const SkillSyncTargetKind = {
  ClaudeCode: 'claude-code',
  Kimi: 'kimi',
  OpenClaw: 'openclaw',
  Codex: 'codex',
  Custom: 'custom',
} as const;

export type SkillSyncTargetKind =
  typeof SkillSyncTargetKind[keyof typeof SkillSyncTargetKind];

export const SkillSyncConflictDecision = {
  Keep: 'keep',
  Replace: 'replace',
  Skip: 'skip',
} as const;

export type SkillSyncConflictDecision =
  typeof SkillSyncConflictDecision[keyof typeof SkillSyncConflictDecision];

export const SkillSyncFailureDecision = {
  Retry: 'retry',
  Skip: 'skip',
  Cancel: 'cancel',
} as const;

export type SkillSyncFailureDecision =
  typeof SkillSyncFailureDecision[keyof typeof SkillSyncFailureDecision];

export const SkillsMigrationKey = {
  SkillMetadataV1: 'skills.metadata.v1.completed',
  SyncTargetsV1: 'skills.syncTargets.v1.completed',
} as const;

export type SkillsMigrationKey = typeof SkillsMigrationKey[keyof typeof SkillsMigrationKey];
