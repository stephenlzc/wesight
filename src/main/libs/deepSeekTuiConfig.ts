import type { CoworkApiConfig } from './coworkConfigStore';

export const DEFAULT_DEEPSEEK_TUI_MODEL = 'deepseek-v4-pro';
export const DEFAULT_DEEPSEEK_TUI_BASE_URL = 'https://api.deepseek.com/beta';

export type DeepSeekTuiConfigValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, unknown>
  | undefined;

export interface DeepSeekTuiProviderConfig {
  api_key?: string;
  apiKey?: string;
  base_url?: string;
  baseURL?: string;
  model?: string;
  models?: string[];
  provider?: string;
  [key: string]: DeepSeekTuiConfigValue;
}

export interface DeepSeekTuiConfig {
  provider?: string;
  default_text_model?: string;
  api_key?: string;
  base_url?: string;
  providers?: Record<string, DeepSeekTuiProviderConfig>;
  [key: string]: DeepSeekTuiConfigValue | Record<string, DeepSeekTuiProviderConfig>;
}

export interface DeepSeekTuiModelProviderRecord {
  id: string;
  name: string;
  provider: string;
  model: string;
  config: DeepSeekTuiProviderConfig;
  isCurrent: boolean;
}

export interface DeepSeekTuiSettingsSummary {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

const getString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const stringifyValue = (value: unknown): string => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyValue(item)).join(', ')}]`;
  }
  if (isRecord(value)) {
    const parts = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => `${key} = ${stringifyValue(item)}`);
    return `{ ${parts.join(', ')} }`;
  }
  return JSON.stringify(String(value ?? ''));
};

const parsePrimitiveValue = (rawValue: string): unknown => {
  const value = rawValue.trim();
  if (!value) return '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => parsePrimitiveValue(item.trim()))
      .filter((item) => item !== '');
  }
  return value;
};

const stripInlineComment = (line: string): string => {
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];
    if (char === '"' && !inSingle && previous !== '\\') {
      inDouble = !inDouble;
    } else if (char === '\'' && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '#' && !inSingle && !inDouble) {
      return line.slice(0, index).trimEnd();
    }
  }
  return line;
};

const ensureProviderRecord = (
  config: DeepSeekTuiConfig,
  provider: string,
): DeepSeekTuiProviderConfig => {
  if (!isRecord(config.providers)) {
    config.providers = {};
  }
  const providers = config.providers as Record<string, DeepSeekTuiProviderConfig>;
  const existing = providers[provider];
  if (isRecord(existing)) {
    return existing;
  }
  providers[provider] = {};
  return providers[provider];
};

const normalizeProviderKey = (value: string): string => {
  return value.trim().replace(/-/g, '_') || 'deepseek';
};

const providerDisplayName = (provider: string): string => {
  const known: Record<string, string> = {
    deepseek: 'DeepSeek',
    openai: 'OpenAI Compatible',
    openrouter: 'OpenRouter',
    ollama: 'Ollama',
    vllm: 'vLLM',
    sglang: 'SGLang',
    fireworks: 'Fireworks',
    novita: 'Novita',
    nvidia_nim: 'NVIDIA NIM',
  };
  return known[normalizeProviderKey(provider)] ?? provider
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const sanitizeId = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'deepseek';
};

const isDeepSeekBaseUrl = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized.includes('api.deepseek.com') || normalized.includes('deepseek');
};

const resolveProviderConfig = (
  config: DeepSeekTuiConfig,
  provider: string,
): DeepSeekTuiProviderConfig => {
  const key = normalizeProviderKey(provider);
  const providers = isRecord(config.providers) ? config.providers : {};
  const direct = providers[key];
  const dashed = providers[key.replace(/_/g, '-')];
  return isRecord(direct)
    ? direct as DeepSeekTuiProviderConfig
    : isRecord(dashed)
      ? dashed as DeepSeekTuiProviderConfig
      : {};
};

const readProviderModel = (
  config: DeepSeekTuiConfig,
  provider: string,
): string => {
  const providerConfig = resolveProviderConfig(config, provider);
  const models = Array.isArray(providerConfig.models) ? providerConfig.models : [];
  return getString(providerConfig.model)
    || getString(config.default_text_model)
    || getString(models[0])
    || DEFAULT_DEEPSEEK_TUI_MODEL;
};

export const parseDeepSeekTuiConfigText = (content: string): DeepSeekTuiConfig => {
  const config: DeepSeekTuiConfig = {};
  let currentSection: string[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripInlineComment(rawLine).trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch?.[1]) {
      currentSection = sectionMatch[1].split('.').map((part) => part.trim()).filter(Boolean);
      continue;
    }
    const equalsIndex = line.indexOf('=');
    if (equalsIndex < 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    const value = parsePrimitiveValue(line.slice(equalsIndex + 1));
    if (!key) continue;

    if (currentSection[0] === 'providers' && currentSection[1]) {
      const providerConfig = ensureProviderRecord(config, normalizeProviderKey(currentSection[1]));
      providerConfig[key] = value as DeepSeekTuiConfigValue;
      continue;
    }

    if (currentSection.length > 0) {
      let target: Record<string, unknown> = config;
      for (const section of currentSection) {
        const existing = target[section];
        if (!isRecord(existing)) {
          target[section] = {};
        }
        target = target[section] as Record<string, unknown>;
      }
      target[key] = value;
      continue;
    }

    config[key] = value as DeepSeekTuiConfigValue;
  }

  return config;
};

export const parseDeepSeekTuiConfig = (value: unknown): DeepSeekTuiConfig => {
  if (typeof value === 'string') return parseDeepSeekTuiConfigText(value);
  if (!isRecord(value)) return {};
  const config = { ...value } as DeepSeekTuiConfig;
  if (isRecord(value.providers)) {
    config.providers = {};
    for (const [provider, providerConfig] of Object.entries(value.providers)) {
      if (isRecord(providerConfig)) {
        config.providers[normalizeProviderKey(provider)] = { ...providerConfig } as DeepSeekTuiProviderConfig;
      }
    }
  }
  return config;
};

export const serializeDeepSeekTuiConfig = (input: DeepSeekTuiConfig): string => {
  const config = parseDeepSeekTuiConfig(input);
  const lines: string[] = [];
  const providers = isRecord(config.providers) ? config.providers : {};
  const topLevelKeys = Object.keys(config)
    .filter((key) => key !== 'providers' && !isRecord(config[key]));

  for (const key of topLevelKeys) {
    const value = config[key];
    if (value !== undefined) {
      lines.push(`${key} = ${stringifyValue(value)}`);
    }
  }

  for (const [key, value] of Object.entries(config)) {
    if (key === 'providers' || !isRecord(value)) continue;
    lines.push('');
    lines.push(`[${key}]`);
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (entryValue !== undefined) {
        lines.push(`${entryKey} = ${stringifyValue(entryValue)}`);
      }
    }
  }

  for (const [provider, providerConfig] of Object.entries(providers)) {
    lines.push('');
    lines.push(`[providers.${normalizeProviderKey(provider)}]`);
    for (const [key, value] of Object.entries(providerConfig)) {
      if (value !== undefined) {
        lines.push(`${key} = ${stringifyValue(value)}`);
      }
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
};

export const summarizeDeepSeekTuiSettingsConfig = (
  settingsConfig: Record<string, unknown>,
): DeepSeekTuiSettingsSummary => {
  const config = parseDeepSeekTuiConfig(settingsConfig.config ?? settingsConfig);
  const provider = getString(settingsConfig.provider) || getString(config.provider) || 'deepseek';
  const model = getString(settingsConfig.model) || readProviderModel(config, provider);
  const providerConfig = resolveProviderConfig(config, provider);
  return {
    apiKey: getString(providerConfig.api_key)
      || getString(providerConfig.apiKey)
      || getString(config.api_key),
    baseUrl: getString(providerConfig.base_url)
      || getString(providerConfig.baseURL)
      || getString(config.base_url)
      || (normalizeProviderKey(provider) === 'deepseek' ? DEFAULT_DEEPSEEK_TUI_BASE_URL : ''),
    model,
  };
};

export const listDeepSeekTuiModelProviders = (
  input: DeepSeekTuiConfig,
): DeepSeekTuiModelProviderRecord[] => {
  const config = parseDeepSeekTuiConfig(input);
  const currentProvider = getString(config.provider) || 'deepseek';
  const currentModel = readProviderModel(config, currentProvider);
  const providers = isRecord(config.providers) ? config.providers : {};
  const providerKeys = new Set([
    normalizeProviderKey(currentProvider),
    ...Object.keys(providers).map(normalizeProviderKey),
  ]);

  return Array.from(providerKeys).map((provider) => {
    const providerConfig = resolveProviderConfig(config, provider);
    const model = provider === normalizeProviderKey(currentProvider)
      ? currentModel
      : readProviderModel(config, provider);
    return {
      id: `deepseek-tui-${sanitizeId(provider)}-${sanitizeId(model)}`,
      name: `${providerDisplayName(provider)} · ${model}`,
      provider,
      model,
      config: {
        ...providerConfig,
        model,
      },
      isCurrent: provider === normalizeProviderKey(currentProvider) && model === currentModel,
    };
  });
};

export const settingsConfigFromDeepSeekTuiRecord = (
  record: DeepSeekTuiModelProviderRecord,
): Record<string, unknown> => {
  return {
    provider: record.provider,
    model: record.model,
    config: {
      provider: record.provider,
      default_text_model: record.model,
      providers: {
        [record.provider]: {
          ...record.config,
          model: record.model,
        },
      },
    },
  };
};

export const deepSeekTuiProviderForCoworkConfig = (
  config: CoworkApiConfig,
  providerName?: string,
): 'deepseek' | 'openai' | null => {
  if (config.apiType === 'anthropic') return null;
  const name = providerName?.toLowerCase() ?? '';
  if (name.includes('deepseek') || isDeepSeekBaseUrl(config.baseURL)) {
    return 'deepseek';
  }
  return 'openai';
};

export const buildDeepSeekTuiRuntimeEnv = (
  config: CoworkApiConfig,
  providerName?: string,
): Record<string, string> => {
  const provider = deepSeekTuiProviderForCoworkConfig(config, providerName);
  if (!provider) {
    throw new Error('DeepSeek-TUI 引擎跟随 WeSight 模型设置时，需要选择 DeepSeek 或 OpenAI 兼容模型配置。');
  }
  if (provider === 'deepseek') {
    return {
      DEEPSEEK_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: config.apiKey,
      DEEPSEEK_BASE_URL: config.baseURL || DEFAULT_DEEPSEEK_TUI_BASE_URL,
      DEEPSEEK_MODEL: config.model || DEFAULT_DEEPSEEK_TUI_MODEL,
    };
  }
  return {
    DEEPSEEK_PROVIDER: 'openai',
    OPENAI_API_KEY: config.apiKey,
    OPENAI_BASE_URL: config.baseURL,
    OPENAI_MODEL: config.model,
  };
};

export const mergeDeepSeekTuiConfigForWesightModel = (
  existingConfig: DeepSeekTuiConfig,
  coworkConfig: CoworkApiConfig,
  providerName?: string,
): DeepSeekTuiConfig => {
  const provider = deepSeekTuiProviderForCoworkConfig(coworkConfig, providerName);
  if (!provider) {
    throw new Error('DeepSeek-TUI 引擎跟随 WeSight 模型设置时，需要选择 DeepSeek 或 OpenAI 兼容模型配置。');
  }

  const config = parseDeepSeekTuiConfig(existingConfig);
  const providerConfig = ensureProviderRecord(config, provider);
  providerConfig.model = coworkConfig.model || DEFAULT_DEEPSEEK_TUI_MODEL;
  providerConfig.api_key = coworkConfig.apiKey;
  providerConfig.base_url = coworkConfig.baseURL || (provider === 'deepseek' ? DEFAULT_DEEPSEEK_TUI_BASE_URL : '');
  providerConfig.provider = provider;
  config.provider = provider;
  config.default_text_model = coworkConfig.model || DEFAULT_DEEPSEEK_TUI_MODEL;

  if (provider === 'deepseek') {
    config.api_key = coworkConfig.apiKey;
    config.base_url = coworkConfig.baseURL || DEFAULT_DEEPSEEK_TUI_BASE_URL;
  }

  return config;
};
