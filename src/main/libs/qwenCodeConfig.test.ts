import { describe, expect, test } from 'vitest';

import {
  buildQwenCodeRuntimeEnv,
  DEFAULT_QWEN_CODE_MODEL,
  listQwenCodeModelProviders,
  mergeQwenCodeConfigForWesightModel,
  parseQwenCodeSettingsText,
  summarizeQwenCodeSettingsConfig,
} from './qwenCodeConfig';

describe('qwenCodeConfig', () => {
  test('empty config exposes a default current model', () => {
    const records = listQwenCodeModelProviders({});

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      model: DEFAULT_QWEN_CODE_MODEL,
      authType: 'openai',
      isCurrent: true,
    });
  });

  test('invalid config text parses as an empty config', () => {
    expect(parseQwenCodeSettingsText('{')).toEqual({});
  });

  test('lists local providers and resolves env keys', () => {
    const records = listQwenCodeModelProviders({
      env: {
        DASHSCOPE_API_KEY: 'sk-dash',
      },
      security: {
        auth: {
          selectedType: 'openai',
        },
      },
      model: {
        name: 'qwen3.6-plus',
      },
      modelProviders: {
        openai: [
          {
            id: 'qwen3.6-plus',
            name: 'Qwen Plus',
            envKey: 'DASHSCOPE_API_KEY',
            baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          },
        ],
      },
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      name: 'Qwen Plus',
      model: 'qwen3.6-plus',
      apiKey: 'sk-dash',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      isCurrent: true,
    });
  });

  test('merges WeSight model while preserving unknown fields', () => {
    const merged = mergeQwenCodeConfigForWesightModel(
      {
        ui: { theme: 'dark' },
        env: {
          OTHER_KEY: 'keep',
        },
        modelProviders: {
          openai: [
            {
              id: 'old-model',
              name: 'Old Model',
              envKey: 'OTHER_KEY',
              baseUrl: 'https://old.example/v1',
            },
          ],
        },
      },
      {
        apiKey: 'sk-new',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: 'qwen3-coder-plus',
        apiType: 'openai',
      },
      'Qwen',
    );

    expect(merged.ui).toEqual({ theme: 'dark' });
    expect(merged.env?.OTHER_KEY).toBe('keep');
    expect(merged.env?.WESIGHT_QWEN_OPENAI_API_KEY).toBe('sk-new');
    expect(merged.security?.auth?.selectedType).toBe('openai');
    expect(merged.model?.name).toBe('qwen3-coder-plus');
    expect(merged.modelProviders?.openai?.map((entry) => entry.id)).toEqual([
      'old-model',
      'qwen3-coder-plus',
    ]);
  });

  test('summarizes stored Qwen settings', () => {
    const summary = summarizeQwenCodeSettingsConfig({
      authType: 'openai',
      model: 'qwen3-coder-plus',
      config: {
        env: {
          WESIGHT_QWEN_OPENAI_API_KEY: 'sk-qwen',
        },
        modelProviders: {
          openai: [
            {
              id: 'qwen3-coder-plus',
              envKey: 'WESIGHT_QWEN_OPENAI_API_KEY',
              baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
            },
          ],
        },
      },
    });

    expect(summary).toEqual({
      apiKey: 'sk-qwen',
      baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
      model: 'qwen3-coder-plus',
    });
  });

  test('builds runtime env for OpenAI-compatible and Anthropic configs', () => {
    expect(buildQwenCodeRuntimeEnv({
      apiKey: 'sk-openai',
      baseURL: 'https://api.example.com/v1',
      model: 'qwen3-coder-plus',
      apiType: 'openai',
    })).toMatchObject({
      OPENAI_API_KEY: 'sk-openai',
      OPENAI_BASE_URL: 'https://api.example.com/v1',
      OPENAI_MODEL: 'qwen3-coder-plus',
    });

    expect(buildQwenCodeRuntimeEnv({
      apiKey: 'sk-ant',
      baseURL: 'https://api.anthropic.com/v1',
      model: 'claude-sonnet-4-5',
      apiType: 'anthropic',
    })).toMatchObject({
      ANTHROPIC_API_KEY: 'sk-ant',
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com/v1',
      ANTHROPIC_MODEL: 'claude-sonnet-4-5',
    });
  });
});
