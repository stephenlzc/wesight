import {
  CoworkAgentEngine,
  DefaultAgent,
  isCoworkAgentEngine,
} from '../../shared/cowork/constants';
import type { Agent } from '../coworkStore';

type PromptAgent = Pick<Agent, 'id' | 'name' | 'systemPrompt' | 'identity' | 'agentEngine' | 'enabled'>;

export type AgentRuntimePromptContext = 'chat' | 'im' | 'team';

export interface BuildAgentRuntimePromptInput {
  engine: CoworkAgentEngine;
  agent?: PromptAgent | null;
  agentId?: string | null;
  baseSystemPrompt?: string | null;
  extraSections?: Array<string | null | undefined>;
  context?: AgentRuntimePromptContext;
}

const ENGINE_IDENTITY_PROMPTS: Record<CoworkAgentEngine, string> = {
  [CoworkAgentEngine.ClaudeCode]: [
    '## Engine Identity',
    'You are running through Claude Code, the user\'s local terminal-native coding agent.',
    'Act as a practical software engineering collaborator. Inspect the local workspace, explain what you are doing, edit files carefully, and verify changes when useful.',
  ].join('\n'),
  [CoworkAgentEngine.Codex]: [
    '## Engine Identity',
    'You are running through Codex CLI, the user\'s local coding agent.',
    'Act as a concise coding and automation collaborator. Use the local project context, keep changes scoped, and report concrete outcomes.',
  ].join('\n'),
  [CoworkAgentEngine.CodexApp]: [
    '## Engine Identity',
    'You are running through Codex App, synced with the user\'s local Codex task system.',
    'Act as a visual coding workspace agent. Keep outputs aligned with Codex tasks, tool activity, file changes, and approval flow.',
  ].join('\n'),
  [CoworkAgentEngine.OpenClaw]: [
    '## Engine Identity',
    'You are running through OpenClaw, the user\'s local AI assistant runtime.',
    'Act as a local runtime operator that can coordinate tools, memory, channels, and workspace tasks through OpenClaw.',
  ].join('\n'),
  [CoworkAgentEngine.Hermes]: [
    '## Engine Identity',
    'You are running through Hermes Agent, the user\'s local gateway and messaging agent runtime.',
    'Act as a responsive assistant for gateway-driven chat, IM tasks, local tool use, and workflow handoff.',
  ].join('\n'),
  [CoworkAgentEngine.OpenSquilla]: [
    '## Engine Identity',
    'You are running through OpenSquilla, the user\'s local token-efficient agent runtime.',
    'Use OpenSquilla\'s local router, skills, memory, and model configuration as the execution source.',
  ].join('\n'),
  [CoworkAgentEngine.KimiCode]: [
    '## Engine Identity',
    'You are running through Kimi Code, the user\'s local Kimi coding agent.',
    'Use Kimi Code\'s local login, skills, MCP configuration, and approval flow when executing tasks.',
  ].join('\n'),
  [CoworkAgentEngine.OpenCode]: [
    '## Engine Identity',
    'You are running through OpenCode, the user\'s local terminal coding agent.',
    'Act as a terminal-first software collaborator with clear tool use and concise handoff notes.',
  ].join('\n'),
  [CoworkAgentEngine.QwenCode]: [
    '## Engine Identity',
    'You are running through Qwen Code, the user\'s local Qwen coding agent.',
    'Act as a coding and knowledge-work assistant that uses the local Qwen Code runtime configuration.',
  ].join('\n'),
  [CoworkAgentEngine.DeepSeekTui]: [
    '## Engine Identity',
    'You are running through DeepSeek-TUI, the user\'s local terminal UI agent runtime.',
    'Act as a terminal-oriented assistant that streams progress, tools, and results through WeSight.',
  ].join('\n'),
  [CoworkAgentEngine.GrokBuild]: [
    '## Engine Identity',
    'You are running through Grok CLI, the user\'s local Grok coding agent.',
    'Act as a focused local agent for coding, investigation, and tool-assisted project work.',
  ].join('\n'),
  [CoworkAgentEngine.YdCowork]: [
    '## Engine Identity',
    'You are running through WeSight built-in Cowork runtime.',
    'Act as the default WeSight AI workspace assistant for local project collaboration, tool use, and task completion.',
  ].join('\n'),
};

export function buildEngineIdentityPrompt(engine: CoworkAgentEngine): string {
  return ENGINE_IDENTITY_PROMPTS[engine] || ENGINE_IDENTITY_PROMPTS[CoworkAgentEngine.ClaudeCode];
}

export function normalizeRuntimeAgentId(agentId?: string | null): string {
  if (!agentId) return DefaultAgent.Id;
  if (agentId.startsWith('agent:')) {
    return agentId.slice('agent:'.length).trim() || DefaultAgent.Id;
  }
  return agentId.trim() || DefaultAgent.Id;
}

export function buildAgentRuntimePrompt(input: BuildAgentRuntimePromptInput): string | undefined {
  const engine = isCoworkAgentEngine(input.engine) ? input.engine : CoworkAgentEngine.ClaudeCode;
  const lockedSystemPrompt = input.baseSystemPrompt?.trim();
  if (lockedSystemPrompt?.includes('## Engine Identity')) {
    return lockedSystemPrompt;
  }
  const normalizedAgentId = normalizeRuntimeAgentId(input.agentId || input.agent?.id);
  const isCustomAgent = normalizedAgentId !== DefaultAgent.Id && !normalizedAgentId.startsWith('team:');
  const agent = isCustomAgent && input.agent?.enabled !== false ? input.agent : null;
  const sections: string[] = [];

  appendUniqueSection(sections, buildEngineIdentityPrompt(engine));

  if (agent?.identity?.trim()) {
    appendUniqueSection(sections, `## Agent Identity\n${agent.identity.trim()}`);
  }

  if (agent?.systemPrompt?.trim()) {
    appendUniqueSection(sections, `## Agent Instructions\n${agent.systemPrompt.trim()}`);
  }

  for (const extraSection of input.extraSections || []) {
    appendUniqueSection(sections, extraSection);
  }

  appendUniqueSection(sections, input.baseSystemPrompt);

  return sections.length > 0 ? sections.join('\n\n') : undefined;
}

function appendUniqueSection(sections: string[], value?: string | null): void {
  const section = value?.trim();
  if (!section) return;
  if (sections.some(existing => existing === section || existing.includes(section))) return;
  sections.push(section);
}
