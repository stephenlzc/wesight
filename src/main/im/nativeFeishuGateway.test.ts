import { expect, test, vi } from 'vitest';

import { NativeFeishuGateway } from './nativeFeishuGateway';
import type { FeishuInstanceConfig, FeishuInstanceStatus } from './types';

type FeishuReceiveEventForTest = {
  sender?: {
    sender_id?: {
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
  };
};

type MockFeishuClient = {
  im: {
    messageReaction: {
      create: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    v1: {
      message: {
        reply: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
      };
    };
  };
};

type NativeFeishuClientStateForTest = {
  instance: FeishuInstanceConfig;
  configSignature: string;
  client: MockFeishuClient;
  wsClient: null;
  botOpenId: string | null;
  status: FeishuInstanceStatus;
};

type NativeFeishuGatewayTestAccess = NativeFeishuGateway & {
  clients: Map<string, NativeFeishuClientStateForTest>;
  handleReceive(instanceId: string, event: FeishuReceiveEventForTest): Promise<void>;
};

const createInstance = (): FeishuInstanceConfig => ({
  instanceId: 'inst-1',
  instanceName: 'Feishu Bot',
  enabled: true,
  appId: 'cli_a',
  appSecret: 'secret',
  domain: 'feishu',
  dmPolicy: 'open',
  allowFrom: [],
  groupPolicy: 'open',
  groupAllowFrom: [],
  groups: {},
  historyLimit: 50,
  replyMode: 'auto',
  mediaMaxMb: 30,
  debug: false,
});

const createStatus = (): FeishuInstanceStatus => ({
  instanceId: 'inst-1',
  instanceName: 'Feishu Bot',
  connected: true,
  startedAt: new Date().toISOString(),
  botOpenId: 'bot-open-id',
  error: null,
  lastInboundAt: null,
  lastOutboundAt: null,
});

const createReceiveEvent = (messageId = 'msg-1'): FeishuReceiveEventForTest => ({
  sender: {
    sender_id: {
      open_id: 'user-open-id',
    },
    sender_type: 'user',
  },
  message: {
    message_id: messageId,
    create_time: String(Date.now()),
    chat_id: 'chat-1',
    chat_type: 'p2p',
    message_type: 'text',
    content: JSON.stringify({ text: 'hello' }),
  },
});

function createHarness(options: {
  createThrows?: boolean;
  deleteThrows?: boolean;
} = {}) {
  const calls: string[] = [];
  const reactionCreate = vi.fn(async () => {
    calls.push('reaction.create');
    if (options.createThrows) {
      throw new Error('create failed');
    }
    return { data: { reaction_id: 'reaction-1' } };
  });
  const reactionDelete = vi.fn(async () => {
    calls.push('reaction.delete');
    if (options.deleteThrows) {
      throw new Error('delete failed');
    }
    return {};
  });
  const reply = vi.fn(async () => ({}));
  const create = vi.fn(async () => ({}));
  const client: MockFeishuClient = {
    im: {
      messageReaction: {
        create: reactionCreate,
        delete: reactionDelete,
      },
      v1: {
        message: {
          reply,
          create,
        },
      },
    },
  };
  const gateway = new NativeFeishuGateway();
  const access = gateway as unknown as NativeFeishuGatewayTestAccess;
  access.clients.set('inst-1', {
    instance: createInstance(),
    configSignature: 'sig',
    client,
    wsClient: null,
    botOpenId: 'bot-open-id',
    status: createStatus(),
  });

  return {
    access,
    calls,
    reactionCreate,
    reactionDelete,
  };
}

test('adds a Feishu typing reaction before processing and removes it after completion', async () => {
  const { access, calls, reactionCreate, reactionDelete } = createHarness();
  const callback = vi.fn(async () => {
    calls.push('message.callback');
  });
  access.setMessageCallback(callback);

  await access.handleReceive('inst-1', createReceiveEvent());

  expect(calls).toEqual(['reaction.create', 'message.callback', 'reaction.delete']);
  expect(reactionCreate).toHaveBeenCalledWith({
    path: { message_id: 'msg-1' },
    data: {
      reaction_type: {
        emoji_type: 'Typing',
      },
    },
  });
  expect(reactionDelete).toHaveBeenCalledWith({
    path: {
      message_id: 'msg-1',
      reaction_id: 'reaction-1',
    },
  });
});

test('removes the typing reaction when message processing throws', async () => {
  const { access, calls, reactionDelete } = createHarness();
  access.setMessageCallback(async () => {
    calls.push('message.callback');
    throw new Error('processing failed');
  });

  await expect(access.handleReceive('inst-1', createReceiveEvent())).rejects.toThrow('processing failed');

  expect(calls).toEqual(['reaction.create', 'message.callback', 'reaction.delete']);
  expect(reactionDelete).toHaveBeenCalledTimes(1);
});

test('continues message processing when creating the typing reaction fails', async () => {
  const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  const { access, calls, reactionDelete } = createHarness({ createThrows: true });
  const callback = vi.fn(async () => {
    calls.push('message.callback');
  });
  access.setMessageCallback(callback);

  await access.handleReceive('inst-1', createReceiveEvent());

  expect(calls).toEqual(['reaction.create', 'message.callback']);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(reactionDelete).not.toHaveBeenCalled();
  debugSpy.mockRestore();
});

test('does not fail message processing when removing the typing reaction fails', async () => {
  const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  const { access, calls, reactionDelete } = createHarness({ deleteThrows: true });
  const callback = vi.fn(async () => {
    calls.push('message.callback');
  });
  access.setMessageCallback(callback);

  await access.handleReceive('inst-1', createReceiveEvent());

  expect(calls).toEqual(['reaction.create', 'message.callback', 'reaction.delete']);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(reactionDelete).toHaveBeenCalledTimes(1);
  debugSpy.mockRestore();
});
