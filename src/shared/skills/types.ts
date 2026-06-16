import type {
  SkillSourceType,
  SkillSyncConflictDecision,
  SkillSyncFailureDecision,
  SkillSyncMode,
  SkillSyncTargetKind,
} from './constants';

export type SkillSourceInfo = {
  type: SkillSourceType;
  url?: string;
  ref?: string;
  author?: string;
  license?: string;
  homepage?: string;
  installedAt?: number;
  updatedAt?: number;
};

export type SkillSyncTargetEntry = {
  agent: SkillSyncTargetKind | string;
  path: string;
  mode: SkillSyncMode;
};

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
  fileHash?: string;
  remoteVersion?: string;
  lastCheckAt?: number;
  dirty?: boolean;
  syncTargets: SkillSyncTargetEntry[];
};

export type SkillSyncTarget = {
  id: string;
  kind: SkillSyncTargetKind;
  label: string;
  path: string;
  enabled: boolean;
  isCustom: boolean;
  builtIn?: boolean;
};

export type SkillSyncTargetsState = {
  targets: SkillSyncTarget[];
  /** True once the user has been prompted to choose targets at least once. */
  firstRunPrompted: boolean;
};

export type SkillSyncConflict = {
  skillId: string;
  agent: SkillSyncTargetKind | string;
  path: string;
  existingSourceType?: SkillSourceType;
  incomingSourceType: SkillSourceType;
};

export type SkillSyncConflictResolution = {
  skillId: string;
  agent: SkillSyncTargetKind | string;
  decision: SkillSyncConflictDecision;
};

export type SkillSyncFailure = {
  skillId: string;
  agent: SkillSyncTargetKind | string;
  path: string;
  mode: SkillSyncMode;
  reason: string;
};

export type SkillSyncFailureResolution = {
  skillId: string;
  agent: SkillSyncTargetKind | string;
  decision: SkillSyncFailureDecision;
};

export type SkillSyncResult = {
  skillId: string;
  attempts: Array<{
    agent: SkillSyncTargetKind | string;
    path: string;
    mode: SkillSyncMode;
    success: boolean;
    reason?: string;
  }>;
};

export type FirstSyncPromptTarget = {
  id: string;
  kind: SkillSyncTargetKind | string;
  label: string;
  path: string;
  enabled: boolean;
  exists: boolean;
  isCustom?: boolean;
};

export type FirstSyncPromptResolution = {
  selectedTargetIds: string[];
  rememberChoice: boolean;
};