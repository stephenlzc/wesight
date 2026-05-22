import { describe, expect, test } from 'vitest';

import {
  buildOpenCodeRuntimeConfigContent,
  DEFAULT_OPENCODE_MODEL,
  listOpenCodeModelProviders,
  mergeOpenCodeConfigForWesightModel,
  parseOpenCodeConfigText,
  summarizeOpenCodeSettingsConfig,
} from './openCodeConfig';

describe('openCodeConfig', () => {
  test('empty config still exposes the default current model', () => {
    const records = listOpenCodeModelProviders({});

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      model: DEFAULT_OPENCODE_MODEL,
      isCurrent: true,
    });
  });

  test('invalid config text parses as an empty config', () => {
    expect(parseOpenCodeConfigText('{')).toEqual({});
  });

  test('lists configured provider models and marks the current model', () => {
    const records = listOpenCodeModelProviders({
      model: 'kimi/k2',
      provider: {
        kimi: {
          name: 'Kimi',
          options: {
            apiKey: 'sk-kimi',
            baseURL: 'https://api.moonshot.cn/v1',
          },
          models: {
            k2: { name: 'K2' },
            'k2-thinking': { name: 'K2 Thinking' },
          },
        },
      },
    });

    expect(records.map((record) => record.model)).toEqual(['kimi/k2', 'kimi/k2-thinking']);
    expect(records[0]).toMatchObject({
      name: 'Kimi',
      apiKey: 'sk-kimi',
      baseUrl: 'https://api.moonshot.cn/v1',
      isCurrent: true,
    });
  });

  test('merges WeSight openai-compatible model while preserving unknown fields', () => {
    const merged = mergeOpenCodeConfigForWesightModel(
      {
        theme: 'dark',
        provider: {
          kimi: {
            name: 'Kimi',
            npm: '@ai-sdk/openai-compatible',
            options: {
              apiKey: 'old-key',
              baseURL: 'https://old.example/v1',
              custom: true,
            },
            models: {
              k2: { name: 'K2' },
            },
          },
        },
      },
      {
        apiKey: 'sk-new',
        baseURL: 'https://api.moonshot.cn/v1',
        model: 'k2.6',
        apiType: 'openai',
      },
      'Kimi',
    );

    expect(merged.theme).toBe('dark');
    expect(merged.model).toBe('kimi/k2.6');
    expect(merged.provider?.kimi).toMatchObject({
      name: 'Kimi',
      npm: '@ai-sdk/openai-compatible',
      options: {
        apiKey: 'sk-new',
        baseURL: 'https://api.moonshot.cn/v1',
        custom: true,
      },
    });
    expect(merged.provider?.kimi?.models).toMatchObject({
      k2: { name: 'K2' },
      'k2.6': { name: 'k2.6' },
    });
  });

  test('maps Anthropic models to the official provider entry', () => {
    const merged = mergeOpenCodeConfigForWesightModel(
      {},
      {
        apiKey: 'sk-ant',
        baseURL: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        apiType: 'anthropic',
      },
      'Anthropic',
    );

    expect(merged.model).toBe('anthropic/claude-sonnet-4-5');
    expect(merged.provider?.anthropic).toMatchObject({
      name: 'Anthropic',
      npm: '@ai-sdk/anthropic',
      options: {
        apiKey: 'sk-ant',
        baseURL: 'https://api.anthropic.com',
      },
    });
  });

  test('summarizes model credentials from stored OpenCode config', () => {
    const summary = summarizeOpenCodeSettingsConfig({
      config: {
        model: 'deepseek/deepseek-v4-pro',
        provider: {
          deepseek: {
            options: {
              apiKey: 'sk-ds',
              baseURL: 'https://api.deepseek.com/v1',
            },
          },
        },
      },
    });

    expect(summary).toEqual({
      apiKey: 'sk-ds',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek/deepseek-v4-pro',
    });
  });

  test('builds runtime config content for OPENCODE_CONFIG_CONTENT', () => {
    const parsed = JSON.parse(buildOpenCodeRuntimeConfigContent({
      apiKey: 'sk-runtime',
      baseURL: 'https://api.example.com/v1',
      model: 'my-model',
      apiType: 'openai',
    }, 'Custom Provider'));

    expect(parsed.model).toBe('custom_provider/my-model');
    expect(parsed.provider.custom_provider.options.apiKey).toBe('sk-runtime');
  });
});
