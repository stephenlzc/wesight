import type { CoworkApiConfig } from './coworkConfigStore';

export type QwenCodeAuthType = 'openai' | 'anthropic' | 'gemini';

export interface QwenCodeModelProvider {
  id?: string;
  name?: string;
  envKey?: string;
  baseUrl?: string;
  description?: string;
  generationConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface QwenCodeSettings {
  modelProviders?: Partial<Record<QwenCodeAuthType, QwenCodeModelProvider[]>>;
  env?: Record<string, string>;
  security?: {
    auth?: {
      selectedType?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  model?: {
    name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface QwenCodeModelProviderRecord {
  id: string;
  name: string;
  model: string;
  authType: QwenCodeAuthType;
  apiKey: string;
  baseUrl: string;
  config: QwenCodeSettings;
  isCurrent: boolean;
}

export const DEFAULT_QWEN_CODE_MODEL = 'qwen3-coder-plus';

const WESIGHT_ENV_KEY = {
  openai: 'WESIGHT_QWEN_OPENAI_API_KEY',
  anthropic: 'WESIGHT_QWEN_ANTHROPIC_API_KEY',
  gemini: 'WESIGHT_QWEN_GEMINI_API_KEY',
} as const satisfies Record<QwenCodeAuthType, string>;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

const getString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const isQwenAuthType = (value: unknown): value is QwenCodeAuthType => (
  value === 'openai' || value === 'anthropic' || value === 'gemini'
);

const providerDisplayName = (value: string | undefined): string => {
  const normalized = value?.trim() || 'Qwen Code';
  const known: Record<string, string> = {
    anthropic: 'Anthropic',
    deepseek: 'DeepSeek',
    gemini: 'Gemini',
    kimi: 'Kimi',
    moonshot: 'Moonshot',
    openai: 'OpenAI',
    qwen: 'Qwen',
    wesight: 'WeSight',
  };
  return known[normalized.toLowerCase()]
    ?? normalized
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const qwenAuthTypeForCoworkConfig = (config: CoworkApiConfig): QwenCodeAuthType => {
  return config.apiType === 'anthropic' ? 'anthropic' : 'openai';
};

export const parseQwenCodeSettings = (value: unknown): QwenCodeSettings => {
  return isRecord(value) ? value as QwenCodeSettings : {};
};

export const parseQwenCodeSettingsText = (text: string): QwenCodeSettings => {
  try {
    return parseQwenCodeSettings(JSON.parse(text || '{}'));
  } catch {
    return {};
  }
};

const getProviderEntries = (
  settings: QwenCodeSettings,
  authType: QwenCodeAuthType,
): QwenCodeModelProvider[] => {
  const providers = isRecord(settings.modelProviders) ? settings.modelProviders : {};
  const entries = providers[authType];
  return Array.isArray(entries) ? entries.filter(isRecord) as QwenCodeModelProvider[] : [];
};

const getCurrentModel = (settings: QwenCodeSettings): string => {
  return getString(settings.model?.name) || DEFAULT_QWEN_CODE_MODEL;
};

const getSelectedAuthType = (settings: QwenCodeSettings): QwenCodeAuthType | null => {
  const selectedType = settings.security?.auth?.selectedType;
  return isQwenAuthType(selectedType) ? selectedType : null;
};

const inferAuthTypeForModel = (settings: QwenCodeSettings, model: string): QwenCodeAuthType => {
  const selected = getSelectedAuthType(settings);
  if (selected) return selected;
  for (const authType of ['openai', 'anthropic', 'gemini'] as const) {
    if (getProviderEntries(settings, authType).some((entry) => getString(entry.id) === model)) {
      return authType;
    }
  }
  return 'openai';
};

const getEnvValue = (settings: QwenCodeSettings, envKey: string): string => {
  const env = isRecord(settings.env) ? settings.env : {};
  return getString(env[envKey]);
};

export const listQwenCodeModelProviders = (settings: QwenCodeSettings): QwenCodeModelProviderRecord[] => {
  const currentModel = getCurrentModel(settings);
  const selectedAuthType = inferAuthTypeForModel(settings, currentModel);
  const records: QwenCodeModelProviderRecord[] = [];
  const seen = new Set<string>();

  const addRecord = (authType: QwenCodeAuthType, entry: QwenCodeModelProvider) => {
    const model = getString(entry.id);
    if (!model) return;
    const key = `${authType}:${model}`;
    if (seen.has(key)) return;
    seen.add(key);
    const envKey = getString(entry.envKey);
    records.push({
      id: `qwen-${authType}-${model}`,
      name: getString(entry.name) || providerDisplayName(model),
      model,
      authType,
      apiKey: envKey ? getEnvValue(settings, envKey) : '',
      baseUrl: getString(entry.baseUrl),
      config: settings,
      isCurrent: authType === selectedAuthType && model === currentModel,
    });
  };

  for (const authType of ['openai', 'anthropic', 'gemini'] as const) {
    for (const entry of getProviderEntries(settings, authType)) {
      addRecord(authType, entry);
    }
  }

  if (records.length === 0) {
    records.push({
      id: `qwen-openai-${currentModel}`,
      name: providerDisplayName(currentModel),
      model: currentModel,
      authType: selectedAuthType,
      apiKey: '',
      baseUrl: '',
      config: settings,
      isCurrent: true,
    });
  }
  return records;
};

const findQwenCodeProvider = (
  settings: QwenCodeSettings,
  authType: QwenCodeAuthType,
  model: string,
): QwenCodeModelProvider | null => {
  return getProviderEntries(settings, authType).find((entry) => getString(entry.id) === model) ?? null;
};

export const summarizeQwenCodeSettingsConfig = (
  settingsConfig: Record<string, unknown>,
): { apiKey: string; baseUrl: string; model: string } => {
  const settings = parseQwenCodeSettings(settingsConfig.config);
  const model = getString(settingsConfig.model) || getCurrentModel(settings);
  const authType = isQwenAuthType(settingsConfig.authType)
    ? settingsConfig.authType
    : inferAuthTypeForModel(settings, model);
  const provider = findQwenCodeProvider(settings, authType, model);
  const envKey = getString(provider?.envKey);
  return {
    apiKey: envKey ? getEnvValue(settings, envKey) : '',
    baseUrl: getString(provider?.baseUrl),
    model,
  };
};

export const settingsConfigFromQwenCodeRecord = (
  record: QwenCodeModelProviderRecord,
): Record<string, unknown> => {
  return {
    authType: record.authType,
    config: record.config,
    model: record.model,
  };
};

export const mergeQwenCodeConfigForWesightModel = (
  existingSettings: QwenCodeSettings,
  config: CoworkApiConfig,
  providerName?: string,
): QwenCodeSettings => {
  const authType = qwenAuthTypeForCoworkConfig(config);
  const model = config.model.trim() || DEFAULT_QWEN_CODE_MODEL;
  const envKey = WESIGHT_ENV_KEY[authType];
  const modelProviders = isRecord(existingSettings.modelProviders)
    ? { ...existingSettings.modelProviders } as QwenCodeSettings['modelProviders']
    : {};
  const existingEntries = Array.isArray(modelProviders?.[authType])
    ? [...modelProviders[authType]]
    : [];
  const nextEntry: QwenCodeModelProvider = {
    id: model,
    name: `${providerDisplayName(providerName || 'WeSight')} ${model}`,
    envKey,
    baseUrl: config.baseURL,
    description: 'Configured by WeSight.',
  };
  const index = existingEntries.findIndex((entry) => getString(entry.id) === model);
  if (index >= 0) {
    existingEntries[index] = {
      ...existingEntries[index],
      ...nextEntry,
      generationConfig: existingEntries[index].generationConfig,
    };
  } else {
    existingEntries.push(nextEntry);
  }
  modelProviders[authType] = existingEntries;

  return {
    ...existingSettings,
    env: {
      ...(isRecord(existingSettings.env) ? existingSettings.env as Record<string, string> : {}),
      [envKey]: config.apiKey,
    },
    modelProviders,
    security: {
      ...(isRecord(existingSettings.security) ? existingSettings.security : {}),
      auth: {
        ...(isRecord(existingSettings.security?.auth) ? existingSettings.security.auth : {}),
        selectedType: authType,
      },
    },
    model: {
      ...(isRecord(existingSettings.model) ? existingSettings.model : {}),
      name: model,
    },
  };
};

export const buildQwenCodeRuntimeEnv = (config: CoworkApiConfig): Record<string, string> => {
  const authType = qwenAuthTypeForCoworkConfig(config);
  if (authType === 'anthropic') {
    return {
      ANTHROPIC_API_KEY: config.apiKey,
      ANTHROPIC_BASE_URL: config.baseURL,
      ANTHROPIC_MODEL: config.model,
    };
  }
  return {
    OPENAI_API_KEY: config.apiKey,
    OPENAI_BASE_URL: config.baseURL,
    OPENAI_MODEL: config.model,
    QWEN_MODEL: config.model,
  };
};
