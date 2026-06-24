import { expect, test } from 'vitest';

import { CoworkAgentEngine, DefaultAgent } from '../../shared/cowork/constants';
import { buildAgentRuntimePrompt } from './agentRuntimePrompt';

test('default Agent uses the selected engine identity', () => {
  const prompt = buildAgentRuntimePrompt({
    engine: CoworkAgentEngine.ClaudeCode,
    agentId: DefaultAgent.Id,
    baseSystemPrompt: 'Global WeSight instructions.',
  });

  expect(prompt).toContain('Claude Code');
  expect(prompt).toContain('local terminal-native coding agent');
  expect(prompt).toContain('Global WeSight instructions.');
});

test('default Agent identity changes with the selected engine', () => {
  const prompt = buildAgentRuntimePrompt({
    engine: CoworkAgentEngine.Codex,
    agentId: DefaultAgent.Id,
  });

  expect(prompt).toContain('Codex CLI');
  expect(prompt).not.toContain('Claude Code');
});

test('custom Agent instructions are layered on top of engine identity', () => {
  const prompt = buildAgentRuntimePrompt({
    engine: CoworkAgentEngine.Codex,
    agentId: 'product-manager',
    agent: {
      id: 'product-manager',
      name: 'Product Manager',
      systemPrompt: 'Always output product requirements in PRD format.',
      identity: 'You are a product manager responsible for requirement breakdown.',
      agentEngine: CoworkAgentEngine.Codex,
      enabled: true,
    },
  });

  expect(prompt).toContain('Codex CLI');
  expect(prompt).toContain('## Agent Identity');
  expect(prompt).toContain('You are a product manager responsible for requirement breakdown.');
  expect(prompt).toContain('## Agent Instructions');
  expect(prompt).toContain('Always output product requirements in PRD format.');
});

test('custom Agent without instructions still receives engine identity', () => {
  const prompt = buildAgentRuntimePrompt({
    engine: CoworkAgentEngine.OpenSquilla,
    agentId: 'empty-agent',
    agent: {
      id: 'empty-agent',
      name: 'Empty Agent',
      systemPrompt: '',
      identity: '',
      agentEngine: CoworkAgentEngine.OpenSquilla,
      enabled: true,
    },
  });

  expect(prompt).toContain('OpenSquilla');
  expect(prompt).toContain('token-efficient agent runtime');
});

test('locked runtime prompt is reused unchanged', () => {
  const lockedPrompt = [
    '## Engine Identity',
    'Locked Codex identity.',
    '',
    'Original instructions.',
  ].join('\n');
  const prompt = buildAgentRuntimePrompt({
    engine: CoworkAgentEngine.ClaudeCode,
    agentId: DefaultAgent.Id,
    baseSystemPrompt: lockedPrompt,
  });

  expect(prompt).toBe(lockedPrompt);
  expect(prompt).not.toContain('Claude Code');
});
