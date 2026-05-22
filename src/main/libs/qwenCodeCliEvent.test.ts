import { describe, expect, test } from 'vitest';

import {
  normalizeQwenCodeCliEvent,
  parseQwenCodeCliJsonLine,
} from './qwenCodeCliEvent';

describe('qwenCodeCliEvent', () => {
  test('normalizes streaming text deltas', () => {
    expect(normalizeQwenCodeCliEvent({
      type: 'stream_event',
      session_id: 'ses_123',
      event: {
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: 'hello',
        },
      },
    })).toEqual({
      kind: 'assistant_text',
      sessionId: 'ses_123',
      text: 'hello',
      replace: false,
    });
  });

  test('normalizes assistant text messages', () => {
    expect(normalizeQwenCodeCliEvent({
      type: 'assistant',
      session_id: 'ses_123',
      message: {
        content: [
          { type: 'text', text: 'hello' },
          { type: 'text', text: 'world' },
        ],
      },
    })).toEqual({
      kind: 'assistant_text',
      sessionId: 'ses_123',
      text: 'hello\nworld',
      replace: true,
    });
  });

  test('normalizes tool use messages', () => {
    expect(normalizeQwenCodeCliEvent({
      type: 'assistant',
      session_id: 'ses_123',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'bash',
            input: { command: 'pwd' },
          },
        ],
      },
    })).toEqual({
      kind: 'tool_use',
      sessionId: 'ses_123',
      toolName: 'bash',
      input: { command: 'pwd' },
    });
  });

  test('normalizes tool result messages', () => {
    expect(normalizeQwenCodeCliEvent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_result',
            name: 'bash',
            content: 'done',
            is_error: false,
          },
        ],
      },
    })).toEqual({
      kind: 'tool_result',
      sessionId: null,
      toolName: 'bash',
      output: 'done',
      isError: false,
    });
  });

  test('normalizes result errors', () => {
    expect(normalizeQwenCodeCliEvent({
      type: 'result',
      subtype: 'error_during_execution',
      session_id: 'ses_123',
      is_error: true,
      error: {
        message: 'No auth type is selected.',
      },
    })).toEqual({
      kind: 'error',
      sessionId: 'ses_123',
      message: 'No auth type is selected.',
    });
  });

  test('normalizes successful result text', () => {
    expect(normalizeQwenCodeCliEvent({
      type: 'result',
      subtype: 'success',
      session_id: 'ses_123',
      result: 'final answer',
    })).toEqual({
      kind: 'assistant_text',
      sessionId: 'ses_123',
      text: 'final answer',
      replace: true,
    });
  });

  test('returns null for non-json lines', () => {
    expect(parseQwenCodeCliJsonLine('plain text')).toBeNull();
  });
});
