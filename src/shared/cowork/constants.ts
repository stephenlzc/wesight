export const CoworkAgentEngine = {
  YdCowork: 'yd_cowork',
  OpenClaw: 'openclaw',
  Hermes: 'hermes',
  ClaudeCode: 'claude_code',
  Codex: 'codex',
  OpenCode: 'opencode',
  QwenCode: 'qwen_code',
  DeepSeekTui: 'deepseek_tui',
} as const;

export type CoworkAgentEngine = typeof CoworkAgentEngine[keyof typeof CoworkAgentEngine];

export const CoworkAgentEngineValues = [
  CoworkAgentEngine.YdCowork,
  CoworkAgentEngine.OpenClaw,
  CoworkAgentEngine.Hermes,
  CoworkAgentEngine.ClaudeCode,
  CoworkAgentEngine.Codex,
  CoworkAgentEngine.OpenCode,
  CoworkAgentEngine.QwenCode,
  CoworkAgentEngine.DeepSeekTui,
] as const;

export const CliCoworkAgentEngines = [
  CoworkAgentEngine.OpenClaw,
  CoworkAgentEngine.ClaudeCode,
  CoworkAgentEngine.Codex,
  CoworkAgentEngine.Hermes,
  CoworkAgentEngine.OpenCode,
  CoworkAgentEngine.QwenCode,
  CoworkAgentEngine.DeepSeekTui,
] as const;

export type CliCoworkAgentEngine = typeof CliCoworkAgentEngines[number];

export const ExternalAgentConfigSource = {
  WesightModel: 'wesight_model',
  LocalCli: 'local_cli',
} as const;

export type ExternalAgentConfigSource = typeof ExternalAgentConfigSource[keyof typeof ExternalAgentConfigSource];

export const ExternalAgentConfigSourceValues = [
  ExternalAgentConfigSource.WesightModel,
  ExternalAgentConfigSource.LocalCli,
] as const;

export const OpenCodePermissionMode = {
  Auto: 'auto',
  Conservative: 'conservative',
} as const;

export type OpenCodePermissionMode = typeof OpenCodePermissionMode[keyof typeof OpenCodePermissionMode];

export const OpenCodePermissionModeValues = [
  OpenCodePermissionMode.Auto,
  OpenCodePermissionMode.Conservative,
] as const;

export const QwenCodePermissionMode = {
  Auto: 'auto',
  Conservative: 'conservative',
} as const;

export type QwenCodePermissionMode = typeof QwenCodePermissionMode[keyof typeof QwenCodePermissionMode];

export const QwenCodePermissionModeValues = [
  QwenCodePermissionMode.Auto,
  QwenCodePermissionMode.Conservative,
] as const;

export const DeepSeekTuiPermissionMode = {
  Auto: 'auto',
  Conservative: 'conservative',
} as const;

export type DeepSeekTuiPermissionMode = typeof DeepSeekTuiPermissionMode[keyof typeof DeepSeekTuiPermissionMode];

export const DeepSeekTuiPermissionModeValues = [
  DeepSeekTuiPermissionMode.Auto,
  DeepSeekTuiPermissionMode.Conservative,
] as const;

export function isCoworkAgentEngine(value: unknown): value is CoworkAgentEngine {
  return typeof value === 'string'
    && CoworkAgentEngineValues.includes(value as CoworkAgentEngine);
}

export function isExternalAgentConfigSource(value: unknown): value is ExternalAgentConfigSource {
  return typeof value === 'string'
    && ExternalAgentConfigSourceValues.includes(value as ExternalAgentConfigSource);
}

export function isOpenCodePermissionMode(value: unknown): value is OpenCodePermissionMode {
  return typeof value === 'string'
    && OpenCodePermissionModeValues.includes(value as OpenCodePermissionMode);
}

export function isQwenCodePermissionMode(value: unknown): value is QwenCodePermissionMode {
  return typeof value === 'string'
    && QwenCodePermissionModeValues.includes(value as QwenCodePermissionMode);
}

export function isDeepSeekTuiPermissionMode(value: unknown): value is DeepSeekTuiPermissionMode {
  return typeof value === 'string'
    && DeepSeekTuiPermissionModeValues.includes(value as DeepSeekTuiPermissionMode);
}

export function isCliCoworkAgentEngine(value: unknown): value is CliCoworkAgentEngine {
  return typeof value === 'string'
    && CliCoworkAgentEngines.includes(value as CliCoworkAgentEngine);
}

export function isOpenClawCoworkAgentEngine(value: unknown): boolean {
  return value === CoworkAgentEngine.OpenClaw;
}

export const RuntimeCallStatus = {
  Running: 'running',
  Completed: 'completed',
  Error: 'error',
  Stopped: 'stopped',
} as const;

export type RuntimeCallStatus = typeof RuntimeCallStatus[keyof typeof RuntimeCallStatus];

export const RuntimeCallStatusValues = [
  RuntimeCallStatus.Running,
  RuntimeCallStatus.Completed,
  RuntimeCallStatus.Error,
  RuntimeCallStatus.Stopped,
] as const;

export const RuntimeCallSource = {
  Chat: 'chat',
  Im: 'im',
  Scheduled: 'scheduled',
  Unknown: 'unknown',
} as const;

export type RuntimeCallSource = typeof RuntimeCallSource[keyof typeof RuntimeCallSource];

export const RuntimeCallSourceValues = [
  RuntimeCallSource.Chat,
  RuntimeCallSource.Im,
  RuntimeCallSource.Scheduled,
  RuntimeCallSource.Unknown,
] as const;

export function isRuntimeCallStatus(value: unknown): value is RuntimeCallStatus {
  return typeof value === 'string'
    && RuntimeCallStatusValues.includes(value as RuntimeCallStatus);
}

export function isRuntimeCallSource(value: unknown): value is RuntimeCallSource {
  return typeof value === 'string'
    && RuntimeCallSourceValues.includes(value as RuntimeCallSource);
}

export const CoworkIpcChannel = {
  AgentProvidersList: 'cowork:agentProviders:list',
  AgentProvidersSave: 'cowork:agentProviders:save',
  AgentProvidersDelete: 'cowork:agentProviders:delete',
  AgentProvidersSetCurrent: 'cowork:agentProviders:setCurrent',
  AgentProvidersImportLive: 'cowork:agentProviders:importLive',
  AgentConfigImportLocalToModelSettings: 'cowork:agentConfig:importLocalToModelSettings',
  AgentConfigSyncOpenClawGlobal: 'cowork:agentConfig:syncOpenClawGlobal',
  AgentConfigSyncOpenCodeGlobal: 'cowork:agentConfig:syncOpenCodeGlobal',
  AgentConfigSyncQwenCodeGlobal: 'cowork:agentConfig:syncQwenCodeGlobal',
  AgentConfigSyncDeepSeekTuiGlobal: 'cowork:agentConfig:syncDeepSeekTuiGlobal',
  AgentCliInstall: 'cowork:agentCli:install',
  AgentCliInstallProgress: 'cowork:agentCli:installProgress',
  RuntimeMetricsSummary: 'cowork:runtimeMetrics:summary',
  RuntimeMetricsCalls: 'cowork:runtimeMetrics:calls',
  RuntimeMetricsDetail: 'cowork:runtimeMetrics:detail',
} as const;
export type CoworkIpcChannel = typeof CoworkIpcChannel[keyof typeof CoworkIpcChannel];
