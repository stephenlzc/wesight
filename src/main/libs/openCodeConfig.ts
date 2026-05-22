import type { CoworkApiConfig } from './coworkConfigStore';

export interface OpenCodeProviderConfig {
  name?: string;
  npm?: string;
  options?: Record<string, unknown>;
  models?: Record<string, unknown> | string[] | Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface OpenCodeConfig {
  model?: string;
  provider?: Record<string, OpenCodeProviderConfig>;
  [key: string]: unknown;
}

export interface OpenCodeModelProviderRecord {
  id: string;
  name: string;
  model: string;
  providerKey: string;
  modelId: string;
  apiKey: string;
  baseUrl: string;
  config: OpenCodeConfig;
  isCurrent: boolean;
}

const WESIGHT_PROVIDER_MARKER = 'wesight';

export const DEFAULT_OPENCODE_MODEL = 'anthropic/claude-sonnet-4-5';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

const getString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

export const parseOpenCodeConfig = (value: unknown): OpenCodeConfig => {
  return isRecord(value) ? value as OpenCodeConfig : {};
};

export const parseOpenCodeConfigText = (text: string): OpenCodeConfig => {
  try {
    return parseOpenCodeConfig(JSON.parse(text || '{}'));
  } catch {
    return {};
  }
};

export const splitOpenCodeModel = (model: string): { providerKey: string; modelId: string } => {
  const trimmed = model.trim();
  const slashIndex = trimmed.indexOf('/');
  if (slashIndex <= 0 || slashIndex === trimmed.length - 1) {
    return {
      providerKey: trimmed || 'opencode',
      modelId: trimmed || DEFAULT_OPENCODE_MODEL,
    };
  }
  return {
    providerKey: trimmed.slice(0, slashIndex),
    modelId: trimmed.slice(slashIndex + 1),
  };
};

export const buildOpenCodeModel = (providerKey: string, modelId: string): string => {
  const safeProviderKey = providerKey.trim() || 'opencode';
  const safeModelId = modelId.trim() || DEFAULT_OPENCODE_MODEL;
  if (safeModelId.includes('/')) return safeModelId;
  return `${safeProviderKey}/${safeModelId}`;
};

const sanitizeProviderKey = (value: string): string => {
  const key = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  return key || WESIGHT_PROVIDER_MARKER;
};

const providerDisplayName = (value: string | undefined): string => {
  const normalized = value?.trim() || WESIGHT_PROVIDER_MARKER;
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

const getProviderOptions = (provider: OpenCodeProviderConfig | undefined): Record<string, unknown> => {
  return isRecord(provider?.options) ? provider.options as Record<string, unknown> : {};
};

const getProviderModels = (providerKey: string, provider: OpenCodeProviderConfig): string[] => {
  const models = provider.models;
  if (Array.isArray(models)) {
    return models
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (isRecord(item)) return getString(item.id) || getString(item.name);
        return '';
      })
      .filter(Boolean);
  }
  if (isRecord(models)) {
    return Object.keys(models).filter(Boolean);
  }
  return [];
};

const getCurrentProviderModel = (config: OpenCodeConfig): string => {
  return getString(config.model) || DEFAULT_OPENCODE_MODEL;
};

export const listOpenCodeModelProviders = (config: OpenCodeConfig): OpenCodeModelProviderRecord[] => {
  const providerMap = isRecord(config.provider) ? config.provider as Record<string, OpenCodeProviderConfig> : {};
  const currentModel = getCurrentProviderModel(config);
  const records: OpenCodeModelProviderRecord[] = [];
  const seen = new Set<string>();
  const addRecord = (model: string, providerConfig?: OpenCodeProviderConfig) => {
    const normalizedModel = model.trim();
    if (!normalizedModel || seen.has(normalizedModel)) return;
    seen.add(normalizedModel);
    const { providerKey, modelId } = splitOpenCodeModel(normalizedModel);
    const provider = providerConfig ?? providerMap[providerKey];
    const options = getProviderOptions(provider);
    const name = getString(provider?.name) || providerDisplayName(providerKey);
    records.push({
      id: `opencode-${normalizedModel}`,
      name,
      model: normalizedModel,
      providerKey,
      modelId,
      apiKey: getString(options.apiKey) || getString(options.api_key),
      baseUrl: getString(options.baseURL) || getString(options.baseUrl) || getString(options.base_url),
      config,
      isCurrent: normalizedModel === currentModel,
    });
  };

  addRecord(currentModel);
  for (const [providerKey, provider] of Object.entries(providerMap)) {
    for (const modelId of getProviderModels(providerKey, provider)) {
      addRecord(buildOpenCodeModel(providerKey, modelId), provider);
    }
  }
  return records;
};

export const summarizeOpenCodeSettingsConfig = (
  settingsConfig: Record<string, unknown>,
): { apiKey: string; baseUrl: string; model: string } => {
  const config = parseOpenCodeConfig(settingsConfig.config);
  const model = getString(settingsConfig.model) || getCurrentProviderModel(config);
  const { providerKey } = splitOpenCodeModel(model);
  const providerMap = isRecord(config.provider) ? config.provider as Record<string, OpenCodeProviderConfig> : {};
  const options = getProviderOptions(providerMap[providerKey]);
  return {
    apiKey: getString(options.apiKey) || getString(options.api_key),
    baseUrl: getString(options.baseURL) || getString(options.baseUrl) || getString(options.base_url),
    model,
  };
};

export const settingsConfigFromOpenCodeRecord = (
  record: OpenCodeModelProviderRecord,
): Record<string, unknown> => {
  return {
    config: record.config,
    model: record.model,
  };
};

export const mergeOpenCodeConfigForWesightModel = (
  existingConfig: OpenCodeConfig,
  config: CoworkApiConfig,
  providerName?: string,
): OpenCodeConfig => {
  const isAnthropic = config.apiType === 'anthropic';
  const providerKey = isAnthropic ? 'anthropic' : sanitizeProviderKey(providerName || 'wesight');
  const displayName = isAnthropic ? 'Anthropic' : providerDisplayName(providerName || 'wesight');
  const modelId = config.model.trim() || (isAnthropic ? 'claude-sonnet-4-5' : 'gpt-5.4');
  const providerMap = isRecord(existingConfig.provider)
    ? { ...(existingConfig.provider as Record<string, OpenCodeProviderConfig>) }
    : {};
  const existingProvider = providerMap[providerKey] ?? {};

  providerMap[providerKey] = {
    ...existingProvider,
    name: displayName,
    npm: isAnthropic ? '@ai-sdk/anthropic' : '@ai-sdk/openai-compatible',
    options: {
      ...getProviderOptions(existingProvider),
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    },
    models: {
      ...(isRecord(existingProvider.models) ? existingProvider.models as Record<string, unknown> : {}),
      [modelId]: {
        name: modelId,
      },
    },
  };

  return {
    ...existingConfig,
    model: buildOpenCodeModel(providerKey, modelId),
    provider: providerMap,
  };
};

export const buildOpenCodeRuntimeConfigContent = (
  config: CoworkApiConfig,
  providerName?: string,
): string => {
  return JSON.stringify(mergeOpenCodeConfigForWesightModel({}, config, providerName));
};
