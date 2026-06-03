/**
 * Kimi CLI 配置与环境变量工具。
 *
 * 状态：占位（scaffold）。仅暴露最小 API 以让路由与 UI 编译通过。
 * 完整实现见 https://github.com/freestylefly/wesight/issues/34
 */

import type { CoworkApiConfig } from './coworkConfigStore';

/** Kimi CLI 在「WeSight 模型」配置源下注入的 env var 集合。 */
export interface KimiCliRuntimeEnv {
  KIMI_API_KEY: string;
  KIMI_BASE_URL: string;
  KIMI_MODEL_NAME: string;
}

/**
 * 把 WeSight 的 CoworkApiConfig 翻译为 Kimi CLI 进程 env。
 *
 * 真实实现需要参考 Kimi CLI 官方文档读取 `~/.kimi/config.toml`，
 * 并尊重「WeSight 不写回本机配置文件」的凭据隔离原则（issue #33）。
 * 当前为占位：仅透传三组核心 env 变量。
 */
export const buildKimiCliRuntimeEnv = (config: CoworkApiConfig): KimiCliRuntimeEnv => {
  return {
    KIMI_API_KEY: config.apiKey,
    KIMI_BASE_URL: config.baseURL,
    KIMI_MODEL_NAME: config.model,
  };
};

/** Kimi CLI 二进制名。 */
export const KIMI_CLI_BINARY = 'kimi';

/** Kimi CLI 默认模型（与 src/shared/providers/constants.ts 中 Moonshot 默认保持一致）。 */
export const DEFAULT_KIMI_CLI_MODEL = 'kimi-k2.5';
