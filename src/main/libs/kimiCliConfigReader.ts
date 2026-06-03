/**
 * Read Kimi CLI's local configuration file (~/.kimi/config.toml).
 *
 * Used by the Cowork KimiCli engine to surface the locally configured
 * model and provider in the WeSight UI without forcing users to also
 * configure a separate model in the Models page (issue #34 follow-up).
 *
 * Behaviour mirrors the Qwen Code / DeepSeek-TUI local-config reader
 * pattern: the file is parsed leniently, missing fields are tolerated,
 * and WeSight never writes back to the user's `~/.kimi/config.toml`
 * (see issue #33 — credential isolation).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse as parseToml } from 'smol-toml';

const KIMI_CONFIG_PATH = path.join(os.homedir(), '.kimi', 'config.toml');

export interface KimiCliLocalProvider {
  name: string;
  type?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface KimiCliLocalModel {
  name: string;
  provider: string | null;
  model: string | null;
  displayName: string | null;
}

export interface KimiCliLocalConfig {
  configPath: string;
  exists: boolean;
  model: string | null;
  defaultModel: string | null;
  defaultYolo: boolean;
  defaultPlanMode: boolean;
  defaultThinking: boolean;
  providers: KimiCliLocalProvider[];
  models: KimiCliLocalModel[];
  raw: Record<string, unknown> | null;
}

const KIMI_DEFAULT_MODEL = 'kimi-k2.5';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const getString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const collectProviderTable = (
  raw: Record<string, unknown>,
  tableName: string,
): KimiCliLocalProvider[] => {
  const table = raw[tableName];
  if (!isRecord(table)) return [];
  // Kimi CLI provider tables can be either { default = {...} } or
  // { <name> = { type, api_key, base_url, model } }. Accept both.
  const records: KimiCliLocalProvider[] = [];
  for (const [name, value] of Object.entries(table)) {
    if (!isRecord(value)) continue;
    if (name === 'default') continue; // selected type marker, not a provider
    records.push({
      name,
      type: getString(value.type) ?? getString(value.provider) ?? undefined,
      apiKey: getString(value.api_key) ?? getString(value.apiKey) ?? undefined,
      baseUrl: getString(value.base_url) ?? getString(value.baseUrl) ?? undefined,
      model: getString(value.model) ?? undefined,
    });
  }
  return records;
};

const collectModelTable = (raw: Record<string, unknown>): KimiCliLocalModel[] => {
  const table = raw.models;
  if (!isRecord(table)) return [];
  const records: KimiCliLocalModel[] = [];
  for (const [name, value] of Object.entries(table)) {
    if (!isRecord(value)) continue;
    records.push({
      name,
      provider: getString(value.provider) ?? null,
      model: getString(value.model) ?? null,
      displayName: getString(value.display_name) ?? getString(value.displayName) ?? null,
    });
  }
  return records;
};

export const readKimiCliLocalConfig = (
  configPath: string = KIMI_CONFIG_PATH,
): KimiCliLocalConfig => {
  if (!fs.existsSync(configPath)) {
    return {
      configPath,
      exists: false,
      model: null,
      defaultModel: KIMI_DEFAULT_MODEL,
      defaultYolo: false,
      defaultPlanMode: false,
      defaultThinking: false,
      providers: [],
      models: [],
      raw: null,
    };
  }
  let raw: Record<string, unknown>;
  try {
    const text = fs.readFileSync(configPath, 'utf-8');
    raw = parseToml(text) as Record<string, unknown>;
  } catch {
    return {
      configPath,
      exists: true,
      model: null,
      defaultModel: KIMI_DEFAULT_MODEL,
      defaultYolo: false,
      defaultPlanMode: false,
      defaultThinking: false,
      providers: [],
      models: [],
      raw: null,
    };
  }

  const modelFromTopLevel = getString(raw.model);
  const defaultModelKey = getString(raw.default_model) ?? getString(raw.defaultModel);
  const providers = [
    ...collectProviderTable(raw, 'providers'),
    ...collectProviderTable(raw, 'provider'),
  ];
  const models = collectModelTable(raw);

  return {
    configPath,
    exists: true,
    model: defaultModelKey ?? modelFromTopLevel ?? KIMI_DEFAULT_MODEL,
    defaultModel: defaultModelKey ?? KIMI_DEFAULT_MODEL,
    defaultYolo: raw.default_yolo === true,
    defaultPlanMode: raw.default_plan_mode === true,
    defaultThinking: raw.default_thinking === true,
    providers,
    models,
    raw,
  };
};
