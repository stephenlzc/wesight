import { describe, expect, test } from 'vitest';

import {
  buildDeepSeekTuiRuntimeEnv,
  DEFAULT_DEEPSEEK_TUI_MODEL,
  listDeepSeekTuiModelProviders,
  mergeDeepSeekTuiConfigForWesightModel,
  parseDeepSeekTuiConfigText,
  serializeDeepSeekTuiConfig,
  summarizeDeepSeekTuiSettingsConfig,
} from './deepSeekTuiConfig';

describe('deepSeekTuiConfig', () => {
  test('empty config exposes the default DeepSeek model', () => {
    const records = listDeepSeekTuiModelProviders({});

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      provider: 'deepseek',
      model: DEFAULT_DEEPSEEK_TUI_MODEL,
      isCurrent: true,
    });
  });

  test('parses DeepSeek provider config', () => {
    const config = parseDeepSeekTuiConfigText(`
provider = "deepseek"
default_text_model = "deepseek-v4-flash"

[providers.deepseek]
api_key = "sk-deep"
base_url = "https://api.deepseek.com/beta"
model = "deepseek-v4-flash"
`);

    expect(summarizeDeepSeekTuiSettingsConfig({ config })).toEqual({
      apiKey: 'sk-deep',
      baseUrl: 'https://api.deepseek.com/beta',
      model: 'deepseek-v4-flash',
    });
  });

  test('lists OpenAI-compatible local providers', () => {
    const records = listDeepSeekTuiModelProviders(parseDeepSeekTuiConfigText(`
provider = "openai"
default_text_model = "kimi-k2"

[providers.openai]
api_key = "sk-openai"
base_url = "https://api.moonshot.cn/v1"
model = "kimi-k2"
`));

    expect(records[0]).toMatchObject({
      provider: 'openai',
      model: 'kimi-k2',
      isCurrent: true,
    });
  });

  test('merges WeSight model while preserving unknown fields', () => {
    const merged = mergeDeepSeekTuiConfigForWesightModel(
      {
        ui: { theme: 'dark' },
        providers: {
          openai: {
            api_key: 'old',
            base_url: 'https://old.example/v1',
            model: 'old-model',
            extra: 'keep',
          },
        },
      },
      {
        apiKey: 'sk-new',
        baseURL: 'https://api.example.com/v1',
        model: 'gpt-5.4',
        apiType: 'openai',
      },
      'OpenAI',
    );

    expect(merged.ui).toEqual({ theme: 'dark' });
    expect(merged.provider).toBe('openai');
    expect(merged.default_text_model).toBe('gpt-5.4');
    expect(merged.providers?.openai.extra).toBe('keep');
    expect(merged.providers?.openai.api_key).toBe('sk-new');
    expect(merged.providers?.openai.base_url).toBe('https://api.example.com/v1');
  });

  test('serializes config back to TOML text', () => {
    const text = serializeDeepSeekTuiConfig({
      provider: 'deepseek',
      default_text_model: 'deepseek-v4-pro',
      providers: {
        deepseek: {
          api_key: 'sk-deep',
          base_url: 'https://api.deepseek.com/beta',
          model: 'deepseek-v4-pro',
        },
      },
    });

    expect(text).toContain('provider = "deepseek"');
    expect(text).toContain('[providers.deepseek]');
    expect(text).toContain('api_key = "sk-deep"');
  });

  test('builds runtime env and rejects Anthropic-only configs', () => {
    expect(buildDeepSeekTuiRuntimeEnv({
      apiKey: 'sk-deep',
      baseURL: 'https://api.deepseek.com/beta',
      model: 'deepseek-v4-pro',
      apiType: 'openai',
    }, 'DeepSeek')).toMatchObject({
      DEEPSEEK_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: 'sk-deep',
      DEEPSEEK_MODEL: 'deepseek-v4-pro',
    });

    expect(buildDeepSeekTuiRuntimeEnv({
      apiKey: 'sk-openai',
      baseURL: 'https://api.example.com/v1',
      model: 'gpt-5.4',
      apiType: 'openai',
    }, 'OpenAI')).toMatchObject({
      DEEPSEEK_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-openai',
      OPENAI_MODEL: 'gpt-5.4',
    });

    expect(() => buildDeepSeekTuiRuntimeEnv({
      apiKey: 'sk-ant',
      baseURL: 'https://api.anthropic.com/v1',
      model: 'claude-sonnet-4-5',
      apiType: 'anthropic',
    })).toThrow(/DeepSeek-TUI/);
  });
});
