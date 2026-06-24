import { EventEmitter } from 'events';
import { expect, test } from 'vitest';

import type { CoworkMessage, CoworkStore } from '../coworkStore';
import type { CoworkRuntime } from '../libs/agentEngine/types';
import { IMCoworkHandler } from './imCoworkHandler';
import type { IMMessage, IMSessionMapping, Platform } from './types';

class FakeRuntime extends EventEmitter {
  startCalls: Array<{ sessionId: string; prompt: string }> = [];

  async startSession(sessionId: string, prompt: string): Promise<void> {
    this.startCalls.push({ sessionId, prompt });
  }

  async continueSession(): Promise<void> {}

  stopSession(): void {}
  stopAllSessions(): void {}
  respondToPermission(): void {}
  isSessionActive(): boolean {
    return false;
  }
  getSessionConfirmationMode(): string {
    return 'text';
  }
}

interface FakeSession {
  id: string;
  title: string;
  cwd: string;
  systemPrompt: string;
  executionMode: string;
  agentId: string;
  claudeSessionId: string | null;
  status: string;
  messages: CoworkMessage[];
}

class FakeCoworkStore {
  private sessionCounter = 0;
  private messageCounter = 0;
  sessions = new Map<string, FakeSession>();
  agents = new Map<string, { systemPrompt: string; identity: string; agentEngine: string }>();

  getConfig() {
    return {
      workingDirectory: process.cwd(),
      systemPrompt: '',
      executionMode: 'auto',
      agentEngine: 'codex',
    };
  }

  createSession(
    title: string,
    cwd: string,
    systemPrompt: string,
    executionMode: string,
    _initialMessages: unknown[] = [],
    agentId: string = 'main',
  ): FakeSession {
    const session: FakeSession = {
      id: `session-${++this.sessionCounter}`,
      title,
      cwd,
      systemPrompt,
      executionMode,
      agentId,
      claudeSessionId: null,
      status: 'idle',
      messages: [],
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): FakeSession | null {
    return this.sessions.get(id) ?? null;
  }

  getAgent(id: string) {
    const configuredAgent = this.agents.get(id);
    return {
      id,
      name: id,
      description: '',
      systemPrompt: configuredAgent?.systemPrompt ?? '',
      identity: configuredAgent?.identity ?? '',
      model: '',
      agentEngine: configuredAgent?.agentEngine ?? 'codex',
      icon: '',
      skillIds: [],
      enabled: true,
      isDefault: id === 'main',
      source: 'preset',
      presetId: id,
      createdAt: 0,
      updatedAt: 0,
    };
  }

  updateSession(id: string, updates: Partial<FakeSession>): void {
    const session = this.sessions.get(id);
    if (session) {
      Object.assign(session, updates);
    }
  }

  addMessage(sessionId: string, message: Omit<CoworkMessage, 'id' | 'timestamp'>): CoworkMessage {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    const created: CoworkMessage = {
      id: `message-${++this.messageCounter}`,
      timestamp: Date.now(),
      ...message,
    };
    session.messages.push(created);
    return created;
  }
}

class FakeIMStore {
  private mappings: IMSessionMapping[] = [];
  private settings: { skillsEnabled: boolean; platformAgentBindings?: Record<string, string> };

  constructor(settings: { skillsEnabled: boolean; platformAgentBindings?: Record<string, string> } = { skillsEnabled: false }) {
    this.settings = settings;
  }

  getIMSettings() {
    return this.settings;
  }

  listSessionMappings(): IMSessionMapping[] {
    return [...this.mappings];
  }

  getSessionMapping(imConversationId: string, platform: Platform): IMSessionMapping | null {
    return (
      this.mappings.find(
        entry => entry.imConversationId === imConversationId && entry.platform === platform,
      ) ?? null
    );
  }

  getSessionMappingByCoworkSessionId(coworkSessionId: string): IMSessionMapping | null {
    return this.mappings.find(entry => entry.coworkSessionId === coworkSessionId) ?? null;
  }

  createSessionMapping(
    imConversationId: string,
    platform: Platform,
    coworkSessionId: string,
    agentId: string = 'main',
  ): IMSessionMapping {
    const mapping: IMSessionMapping = {
      imConversationId,
      platform,
      coworkSessionId,
      agentId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    this.mappings.push(mapping);
    return mapping;
  }

  updateSessionLastActive(imConversationId: string, platform: Platform): void {
    const mapping = this.getSessionMapping(imConversationId, platform);
    if (mapping) {
      mapping.lastActiveAt = Date.now();
    }
  }

  deleteSessionMapping(imConversationId: string, platform: Platform): void {
    this.mappings = this.mappings.filter(
      entry => entry.imConversationId !== imConversationId || entry.platform !== platform,
    );
  }
}

function createFeishuMessage(content: string): IMMessage {
  return {
    platform: 'feishu',
    messageId: `im-${Date.now()}`,
    conversationId: 'feishu-app:direct:chat-1',
    senderId: 'user-1',
    senderName: 'Tester',
    content,
    chatType: 'direct',
    timestamp: Date.now(),
  };
}

test('IM completion replies with only the current turn for a reused Feishu session', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore();
  const session = coworkStore.createSession('[飞书] Tester/chat-1', process.cwd(), '', 'auto');
  imStore.createSessionMapping('feishu-app:direct:chat-1', 'feishu', session.id);

  coworkStore.addMessage(session.id, {
    type: 'user',
    content: '旧问题',
    metadata: {},
  });
  coworkStore.addMessage(session.id, {
    type: 'assistant',
    content: '旧回复',
    metadata: {},
  });

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime as unknown as CoworkRuntime,
    coworkStore: coworkStore as unknown as CoworkStore,
    imStore,
  });

  const pendingReply = handler.processMessage(createFeishuMessage('你好'));
  await new Promise(resolve => setImmediate(resolve));

  coworkStore.addMessage(session.id, {
    type: 'user',
    content: '你好',
    metadata: {},
  });
  coworkStore.addMessage(session.id, {
    type: 'assistant',
    content: '你好，我是 WeSight。',
    metadata: {},
  });
  runtime.emit('complete', session.id);

  await expect(pendingReply).resolves.toBe('你好，我是 WeSight。');
  handler.destroy();
});

test('Feishu IM sessions prefer instance-level Agent binding', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore({
    skillsEnabled: false,
    platformAgentBindings: {
      'feishu:feishu-app': 'agent:claude-agent',
      feishu: 'agent:fallback-agent',
    },
  });

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime as unknown as CoworkRuntime,
    coworkStore: coworkStore as unknown as CoworkStore,
    imStore,
  });

  const pendingReply = handler.processMessage(createFeishuMessage('你好'));
  await new Promise(resolve => setImmediate(resolve));

  const createdSession = [...coworkStore.sessions.values()][0];
  expect(createdSession.agentId).toBe('claude-agent');

  coworkStore.addMessage(createdSession.id, {
    type: 'assistant',
    content: '实例 Agent 已响应。',
    metadata: {},
  });
  runtime.emit('complete', createdSession.id);

  await expect(pendingReply).resolves.toBe('实例 Agent 已响应。');
  handler.destroy();
});

test('Feishu IM sessions include the bound Agent instructions', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  coworkStore.agents.set('product-manager', {
    systemPrompt: '必须使用产品经理格式输出。',
    identity: '你是负责需求拆解的产品经理。',
    agentEngine: 'codex',
  });
  const imStore = new FakeIMStore({
    skillsEnabled: false,
    platformAgentBindings: {
      'feishu:feishu-app': 'agent:product-manager',
    },
  });

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime as unknown as CoworkRuntime,
    coworkStore: coworkStore as unknown as CoworkStore,
    imStore,
  });

  const pendingReply = handler.processMessage(createFeishuMessage('帮我拆需求'));
  await new Promise(resolve => setImmediate(resolve));

  const createdSession = [...coworkStore.sessions.values()][0];
  expect(createdSession.systemPrompt).toContain('Codex CLI');
  expect(createdSession.systemPrompt).toContain('必须使用产品经理格式输出。');
  expect(createdSession.systemPrompt).toContain('## Agent Identity');
  expect(createdSession.systemPrompt).toContain('你是负责需求拆解的产品经理。');

  coworkStore.addMessage(createdSession.id, {
    type: 'assistant',
    content: '已按产品经理格式输出。',
    metadata: {},
  });
  runtime.emit('complete', createdSession.id);

  await expect(pendingReply).resolves.toBe('已按产品经理格式输出。');
  handler.destroy();
});

test('default IM Agent uses the current engine identity', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore({
    skillsEnabled: false,
    platformAgentBindings: {},
  });

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime as unknown as CoworkRuntime,
    coworkStore: coworkStore as unknown as CoworkStore,
    imStore,
  });

  const pendingReply = handler.processMessage(createFeishuMessage('你是什么身份'));
  await new Promise(resolve => setImmediate(resolve));

  const createdSession = [...coworkStore.sessions.values()][0];
  expect(createdSession.agentId).toBe('main');
  expect(createdSession.systemPrompt).toContain('Codex CLI');
  expect(createdSession.systemPrompt).not.toContain('Claude Code');

  coworkStore.addMessage(createdSession.id, {
    type: 'assistant',
    content: '我是 Codex CLI。',
    metadata: {},
  });
  runtime.emit('complete', createdSession.id);

  await expect(pendingReply).resolves.toBe('我是 Codex CLI。');
  handler.destroy();
});

test('Feishu IM sessions fall back to platform Agent binding', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore({
    skillsEnabled: false,
    platformAgentBindings: {
      feishu: 'agent:fallback-agent',
    },
  });

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime as unknown as CoworkRuntime,
    coworkStore: coworkStore as unknown as CoworkStore,
    imStore,
  });

  const pendingReply = handler.processMessage(createFeishuMessage('你好'));
  await new Promise(resolve => setImmediate(resolve));

  const createdSession = [...coworkStore.sessions.values()][0];
  expect(createdSession.agentId).toBe('fallback-agent');

  coworkStore.addMessage(createdSession.id, {
    type: 'assistant',
    content: '平台 Agent 已响应。',
    metadata: {},
  });
  runtime.emit('complete', createdSession.id);

  await expect(pendingReply).resolves.toBe('平台 Agent 已响应。');
  handler.destroy();
});

test('Feishu IM creates a new session when instance Agent binding changes', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore({
    skillsEnabled: false,
    platformAgentBindings: {
      'feishu:feishu-app': 'agent:new-agent',
    },
  });
  const oldSession = coworkStore.createSession('[飞书] Tester/chat-1', process.cwd(), '', 'auto', [], 'old-agent');
  imStore.createSessionMapping('feishu-app:direct:chat-1', 'feishu', oldSession.id, 'old-agent');

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime as unknown as CoworkRuntime,
    coworkStore: coworkStore as unknown as CoworkStore,
    imStore,
  });

  const pendingReply = handler.processMessage(createFeishuMessage('你好'));
  await new Promise(resolve => setImmediate(resolve));

  const createdSessions = [...coworkStore.sessions.values()];
  expect(createdSessions).toHaveLength(2);
  const newSession = createdSessions.find(session => session.id !== oldSession.id);
  expect(newSession?.agentId).toBe('new-agent');
  expect(imStore.getSessionMapping('feishu-app:direct:chat-1', 'feishu')?.coworkSessionId).toBe(newSession?.id);

  coworkStore.addMessage(newSession!.id, {
    type: 'assistant',
    content: '新 Agent 已响应。',
    metadata: {},
  });
  runtime.emit('complete', newSession!.id);

  await expect(pendingReply).resolves.toBe('新 Agent 已响应。');
  handler.destroy();
});
