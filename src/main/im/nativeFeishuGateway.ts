import type {
  FeishuInstanceConfig,
  FeishuInstanceStatus,
  IMMessage,
} from './types';

type NativeFeishuReplyFn = (text: string) => Promise<void>;
type NativeFeishuMessageCallback = (
  message: IMMessage,
  replyFn: NativeFeishuReplyFn,
) => Promise<void>;

type FeishuApiResponse = {
  code?: number;
  msg?: string;
  data?: Record<string, unknown>;
};

type FeishuClientLike = {
  request(payload: { method: string; url: string }): Promise<FeishuApiResponse>;
  im: {
    messageReaction: {
      create(payload: {
        path: { message_id: string };
        data: { reaction_type: { emoji_type: string } };
      }): Promise<FeishuApiResponse>;
      delete(payload: {
        path: { message_id: string; reaction_id: string };
      }): Promise<unknown>;
    };
    v1: {
      message: {
        reply(payload: {
          path: { message_id: string };
          data: { content: string; msg_type: string };
        }): Promise<unknown>;
        create(payload: {
          params: { receive_id_type: string };
          data: { receive_id: string; content: string; msg_type: string };
        }): Promise<unknown>;
      };
    };
  };
};

type FeishuEventDispatcherLike = {
  register(handlers: Record<string, (data: FeishuReceiveEvent) => Promise<void>>): void;
};

type FeishuWsClientLike = {
  start(options: { eventDispatcher: FeishuEventDispatcherLike }): Promise<void>;
  close?: (options: { force: boolean }) => void;
};

type LarkModuleLike = {
  Client: new (options: Record<string, unknown>) => FeishuClientLike;
  EventDispatcher: new (options: Record<string, unknown>) => FeishuEventDispatcherLike;
  WSClient: new (options: Record<string, unknown>) => FeishuWsClientLike;
  AppType: {
    SelfBuild: unknown;
  };
  Domain: {
    Feishu: unknown;
    Lark: unknown;
  };
  LoggerLevel: {
    warn: unknown;
  };
};

interface NativeFeishuClientState {
  instance: FeishuInstanceConfig;
  configSignature: string;
  client: FeishuClientLike;
  wsClient: FeishuWsClientLike | null;
  botOpenId: string | null;
  status: FeishuInstanceStatus;
}

type FeishuReceiveEvent = {
  sender?: {
    sender_id?: {
      union_id?: string;
      user_id?: string;
      open_id?: string;
    };
    sender_type?: string;
  };
  message?: {
    message_id?: string;
    create_time?: string;
    chat_id?: string;
    chat_type?: string;
    message_type?: string;
    content?: string;
    mentions?: Array<{
      key?: string;
      id?: {
        union_id?: string;
        user_id?: string;
        open_id?: string;
      };
      name?: string;
    }>;
  };
};

interface FeishuTypingIndicatorState {
  messageId: string;
  reactionId: string | null;
}

const FeishuChatType = {
  Direct: 'direct',
  Group: 'group',
} as const;

const MAX_SEEN_MESSAGE_IDS = 1000;
const FEISHU_TEXT_CHUNK_SIZE = 3500;
const FEISHU_TYPING_EMOJI_TYPE = 'Typing';

const getString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const parseJsonObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

const parseFeishuTextContent = (messageType: string, rawContent: string): string => {
  const content = parseJsonObject(rawContent);
  if (messageType === 'text') {
    return getString(content?.text);
  }
  if (messageType === 'post') {
    const title = getString(content?.title);
    const body = JSON.stringify(content?.content ?? content);
    return [title, body].filter(Boolean).join('\n\n').trim();
  }
  return '';
};

const normalizeChatType = (value: string): typeof FeishuChatType[keyof typeof FeishuChatType] => (
  value === 'group' ? FeishuChatType.Group : FeishuChatType.Direct
);

const resolveSenderId = (event: FeishuReceiveEvent): string => {
  const sender = event.sender?.sender_id;
  return getString(sender?.open_id) || getString(sender?.user_id) || getString(sender?.union_id);
};

const resolveMentionIds = (event: FeishuReceiveEvent): string[] => {
  const mentions = Array.isArray(event.message?.mentions) ? event.message.mentions : [];
  const ids: string[] = [];
  for (const mention of mentions) {
    const id = getString(mention.id?.open_id) || getString(mention.id?.user_id) || getString(mention.id?.union_id);
    if (id) ids.push(id);
  }
  return ids;
};

const removeMentionText = (text: string, event: FeishuReceiveEvent): string => {
  const mentions = Array.isArray(event.message?.mentions) ? event.message.mentions : [];
  let next = text;
  for (const mention of mentions) {
    const key = getString(mention.key);
    if (key) {
      next = next.split(key).join('');
    }
  }
  return next.trim();
};

const splitText = (text: string): string[] => {
  const normalized = text.trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let index = 0; index < normalized.length; index += FEISHU_TEXT_CHUNK_SIZE) {
    chunks.push(normalized.slice(index, index + FEISHU_TEXT_CHUNK_SIZE));
  }
  return chunks;
};

const isIdAllowed = (id: string, allowList: string[]): boolean => (
  allowList.map(item => item.trim()).filter(Boolean).includes(id)
);

const buildConfigSignature = (instance: FeishuInstanceConfig): string => JSON.stringify({
  enabled: instance.enabled,
  appId: instance.appId,
  appSecret: instance.appSecret,
  domain: instance.domain,
  dmPolicy: instance.dmPolicy,
  allowFrom: instance.allowFrom,
  groupPolicy: instance.groupPolicy,
  groupAllowFrom: instance.groupAllowFrom,
  groups: instance.groups,
});

export class NativeFeishuGateway {
  private readonly clients = new Map<string, NativeFeishuClientState>();
  private readonly seenMessageIds: string[] = [];
  private readonly seenMessageIdSet = new Set<string>();
  private messageCallback: NativeFeishuMessageCallback | null = null;

  setMessageCallback(callback: NativeFeishuMessageCallback): void {
    this.messageCallback = callback;
  }

  async start(instances: FeishuInstanceConfig[]): Promise<void> {
    const enabledInstances = instances.filter(instance => (
      instance.enabled && instance.appId && instance.appSecret
    ));
    const enabledIds = new Set(enabledInstances.map(instance => instance.instanceId));

    for (const instanceId of Array.from(this.clients.keys())) {
      const existing = this.clients.get(instanceId);
      const nextInstance = enabledInstances.find(instance => instance.instanceId === instanceId);
      if (!existing || !nextInstance || existing.configSignature !== buildConfigSignature(nextInstance)) {
        await this.stopInstance(instanceId);
      }
    }

    for (const instance of enabledInstances) {
      if (this.clients.has(instance.instanceId)) continue;
      await this.startInstance(instance);
    }

    for (const instanceId of Array.from(this.clients.keys())) {
      if (!enabledIds.has(instanceId)) {
        await this.stopInstance(instanceId);
      }
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.clients.keys()).map(instanceId => this.stopInstance(instanceId)));
  }

  isConnected(): boolean {
    return Array.from(this.clients.values()).some(state => state.status.connected);
  }

  getStatus(instances: FeishuInstanceConfig[]): FeishuInstanceStatus[] {
    return instances.map((instance) => {
      const state = this.clients.get(instance.instanceId);
      return state?.status ?? {
        instanceId: instance.instanceId,
        instanceName: instance.instanceName,
        connected: false,
        startedAt: null,
        botOpenId: null,
        error: instance.enabled && instance.appId && instance.appSecret ? null : 'Feishu instance is not enabled or configured.',
        lastInboundAt: null,
        lastOutboundAt: null,
      };
    });
  }

  async sendConversationReply(conversationId: string, text: string): Promise<boolean> {
    const parsed = this.parseConversationId(conversationId);
    if (!parsed) return false;
    const state = this.clients.get(parsed.instanceId);
    if (!state) return false;
    await this.sendReply(state, parsed.chatId, null, text);
    return true;
  }

  private async startInstance(instance: FeishuInstanceConfig): Promise<void> {
    const Lark = await import('@larksuiteoapi/node-sdk') as unknown as LarkModuleLike;
    const domain = this.resolveDomain(instance.domain, Lark);
    const status: FeishuInstanceStatus = {
      instanceId: instance.instanceId,
      instanceName: instance.instanceName,
      connected: false,
      startedAt: null,
      botOpenId: null,
      error: null,
      lastInboundAt: null,
      lastOutboundAt: null,
    };
    const client = new Lark.Client({
      appId: instance.appId,
      appSecret: instance.appSecret,
      appType: Lark.AppType.SelfBuild,
      domain,
    });
    const state: NativeFeishuClientState = {
      instance,
      configSignature: buildConfigSignature(instance),
      client,
      wsClient: null,
      botOpenId: null,
      status,
    };
    this.clients.set(instance.instanceId, state);

    try {
      state.botOpenId = await this.resolveBotOpenId(client);
      state.status.botOpenId = state.botOpenId;
    } catch (error) {
      console.warn('[NativeFeishuGateway] Failed to resolve bot info:', error);
    }

    const dispatcher = new Lark.EventDispatcher({});
    dispatcher.register({
      'im.message.receive_v1': async (data: FeishuReceiveEvent) => {
        await this.handleReceive(state.instance.instanceId, data);
      },
    });

    const wsClient = new Lark.WSClient({
      appId: instance.appId,
      appSecret: instance.appSecret,
      domain,
      loggerLevel: Lark.LoggerLevel.warn,
      autoReconnect: true,
      source: 'wesight',
      onReady: () => {
        status.connected = true;
        status.startedAt = new Date().toISOString();
        status.error = null;
      },
      onError: (error: Error) => {
        status.connected = false;
        status.error = error.message;
      },
      onReconnecting: () => {
        status.connected = false;
      },
      onReconnected: () => {
        status.connected = true;
        status.error = null;
      },
    });
    state.wsClient = wsClient;
    await wsClient.start({ eventDispatcher: dispatcher });
  }

  private async stopInstance(instanceId: string): Promise<void> {
    const state = this.clients.get(instanceId);
    if (!state) return;
    try {
      state.wsClient?.close?.({ force: true });
    } catch (error) {
      console.warn('[NativeFeishuGateway] Failed to close WS client:', error);
    }
    state.status.connected = false;
    this.clients.delete(instanceId);
  }

  private async handleReceive(instanceId: string, event: FeishuReceiveEvent): Promise<void> {
    const state = this.clients.get(instanceId);
    if (!state || !this.messageCallback) return;

    const messageId = getString(event.message?.message_id);
    if (!messageId || this.hasSeenMessage(messageId)) return;
    this.rememberMessage(messageId);

    const senderType = getString(event.sender?.sender_type);
    if (senderType && senderType !== 'user') return;

    const senderId = resolveSenderId(event);
    if (!senderId || senderId === state.botOpenId) return;

    const chatId = getString(event.message?.chat_id);
    if (!chatId) return;
    const chatType = normalizeChatType(getString(event.message?.chat_type));
    if (!this.isAllowed(state.instance, chatType, chatId, senderId, event, state.botOpenId)) {
      return;
    }

    const messageType = getString(event.message?.message_type);
    const rawContent = getString(event.message?.content);
    const content = removeMentionText(parseFeishuTextContent(messageType, rawContent), event);
    if (!content) return;

    state.status.lastInboundAt = Date.now();
    const conversationId = `${state.instance.instanceId}:${chatType}:${chatId}`;
    const createdAt = Number(event.message?.create_time);
    const message: IMMessage = {
      platform: 'feishu',
      messageId,
      conversationId,
      senderId,
      content,
      chatType,
      timestamp: Number.isFinite(createdAt) ? createdAt : Date.now(),
    };

    const typingState = await this.addTypingIndicator(state, messageId);
    try {
      await this.messageCallback(message, async (text) => {
        await this.sendReply(state, chatId, messageId, text);
      });
    } finally {
      await this.removeTypingIndicator(state, typingState);
    }
  }

  private async addTypingIndicator(
    state: NativeFeishuClientState,
    messageId: string,
  ): Promise<FeishuTypingIndicatorState> {
    const typingState: FeishuTypingIndicatorState = {
      messageId,
      reactionId: null,
    };

    try {
      const response = await state.client.im.messageReaction.create({
        path: {
          message_id: messageId,
        },
        data: {
          reaction_type: {
            emoji_type: FEISHU_TYPING_EMOJI_TYPE,
          },
        },
      });
      typingState.reactionId = getString(response?.data?.reaction_id) || null;
    } catch (error) {
      console.debug('[NativeFeishuGateway] Failed to add Feishu typing reaction:', error);
    }

    return typingState;
  }

  private async removeTypingIndicator(
    state: NativeFeishuClientState,
    typingState: FeishuTypingIndicatorState,
  ): Promise<void> {
    if (!typingState.reactionId) {
      return;
    }

    try {
      await state.client.im.messageReaction.delete({
        path: {
          message_id: typingState.messageId,
          reaction_id: typingState.reactionId,
        },
      });
    } catch (error) {
      console.debug('[NativeFeishuGateway] Failed to remove Feishu typing reaction:', error);
    }
  }

  private isAllowed(
    instance: FeishuInstanceConfig,
    chatType: typeof FeishuChatType[keyof typeof FeishuChatType],
    chatId: string,
    senderId: string,
    event: FeishuReceiveEvent,
    botOpenId: string | null,
  ): boolean {
    if (chatType === FeishuChatType.Direct) {
      if (instance.dmPolicy === 'disabled') return false;
      if (instance.dmPolicy === 'allowlist' || instance.dmPolicy === 'pairing') {
        return isIdAllowed(senderId, instance.allowFrom || []);
      }
      return true;
    }

    if (instance.groupPolicy === 'disabled') return false;
    if (instance.groupPolicy === 'allowlist' && !isIdAllowed(chatId, instance.groupAllowFrom || [])) {
      return false;
    }

    const groupConfig = instance.groups?.[chatId] ?? instance.groups?.['*'];
    const requireMention = groupConfig?.requireMention !== false;
    if (!requireMention) return true;
    if (!botOpenId) return true;
    return resolveMentionIds(event).includes(botOpenId);
  }

  private async sendReply(
    state: NativeFeishuClientState,
    chatId: string,
    replyToMessageId: string | null,
    text: string,
  ): Promise<void> {
    const chunks = splitText(text);
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      if (replyToMessageId && index === 0) {
        await state.client.im.v1.message.reply({
          path: { message_id: replyToMessageId },
          data: {
            content: JSON.stringify({ text: chunk }),
            msg_type: 'text',
          },
        });
      } else {
        await state.client.im.v1.message.create({
          params: { receive_id_type: 'chat_id' },
          data: {
            receive_id: chatId,
            content: JSON.stringify({ text: chunk }),
            msg_type: 'text',
          },
        });
      }
    }
    state.status.lastOutboundAt = Date.now();
  }

  private async resolveBotOpenId(client: FeishuClientLike): Promise<string | null> {
    const response = await client.request({
      method: 'GET',
      url: '/open-apis/bot/v3/info',
    });
    if (response?.code !== 0) {
      throw new Error(response?.msg || `code ${response?.code ?? 'unknown'}`);
    }
    const data = response.data ?? {};
    const bot = data.bot && typeof data.bot === 'object'
      ? data.bot as Record<string, unknown>
      : null;
    return getString(data.open_id)
      || getString(bot?.open_id)
      || null;
  }

  private resolveDomain(domain: string, Lark: LarkModuleLike): unknown {
    if (domain === 'lark') return Lark.Domain.Lark;
    if (domain === 'feishu') return Lark.Domain.Feishu;
    return domain.replace(/\/+$/, '');
  }

  private hasSeenMessage(messageId: string): boolean {
    return this.seenMessageIdSet.has(messageId);
  }

  private rememberMessage(messageId: string): void {
    this.seenMessageIdSet.add(messageId);
    this.seenMessageIds.push(messageId);
    while (this.seenMessageIds.length > MAX_SEEN_MESSAGE_IDS) {
      const removed = this.seenMessageIds.shift();
      if (removed) this.seenMessageIdSet.delete(removed);
    }
  }

  private parseConversationId(conversationId: string): { instanceId: string; chatId: string } | null {
    const [instanceId, _chatType, ...chatParts] = conversationId.split(':');
    const chatId = chatParts.join(':');
    if (!instanceId || !chatId) return null;
    return { instanceId, chatId };
  }
}
