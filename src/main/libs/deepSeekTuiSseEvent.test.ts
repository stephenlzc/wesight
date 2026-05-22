import { describe, expect, test } from 'vitest';

import {
  normalizeDeepSeekTuiSseEvent,
  parseDeepSeekTuiSseFrame,
} from './deepSeekTuiSseEvent';

describe('deepSeekTuiSseEvent', () => {
  test('parses SSE frames', () => {
    expect(parseDeepSeekTuiSseFrame('event: message.delta\ndata: {"content":"hi"}\n\n')).toEqual({
      event: 'message.delta',
      data: { content: 'hi' },
      id: undefined,
    });
  });

  test('normalizes message delta events', () => {
    expect(normalizeDeepSeekTuiSseEvent('message.delta', { content: 'hello' })).toEqual({
      kind: 'assistant_text',
      text: 'hello',
    });
  });

  test('normalizes tool lifecycle events', () => {
    expect(normalizeDeepSeekTuiSseEvent('tool.started', {
      id: 'tool_1',
      name: 'shell',
      input: { command: 'pwd' },
    })).toEqual({
      kind: 'tool_started',
      toolCallId: 'tool_1',
      toolName: 'shell',
      input: { command: 'pwd' },
    });

    expect(normalizeDeepSeekTuiSseEvent('tool.progress', {
      id: 'tool_1',
      output: 'running',
    })).toEqual({
      kind: 'tool_progress',
      toolCallId: 'tool_1',
      output: 'running',
    });

    expect(normalizeDeepSeekTuiSseEvent('tool.completed', {
      id: 'tool_1',
      name: 'shell',
      output: 'done',
      success: true,
    })).toEqual({
      kind: 'tool_completed',
      toolCallId: 'tool_1',
      toolName: 'shell',
      output: 'done',
      isError: false,
    });
  });

  test('normalizes status and errors', () => {
    expect(normalizeDeepSeekTuiSseEvent('status', { message: 'thinking' })).toEqual({
      kind: 'status',
      message: 'thinking',
    });
    expect(normalizeDeepSeekTuiSseEvent('error', { message: 'failed' })).toEqual({
      kind: 'error',
      message: 'failed',
    });
  });

  test('normalizes approval events', () => {
    expect(normalizeDeepSeekTuiSseEvent('approval.required', {
      approval_id: 'approval_1',
      tool: { name: 'write', input: { path: 'a.txt' } },
    })).toEqual({
      kind: 'approval_required',
      approvalId: 'approval_1',
      toolName: 'write',
      input: { path: 'a.txt' },
      payload: {
        approval_id: 'approval_1',
        tool: { name: 'write', input: { path: 'a.txt' } },
      },
    });
  });

  test('normalizes raw runtime event wrappers', () => {
    expect(normalizeDeepSeekTuiSseEvent('item.delta', {
      seq: 1,
      turn_id: 'turn_1',
      payload: {
        kind: 'agent_message',
        delta: 'hello',
      },
    })).toEqual({
      kind: 'assistant_text',
      text: 'hello',
    });
  });

  test('handles completion and malformed fallback', () => {
    expect(normalizeDeepSeekTuiSseEvent('turn.completed', {})).toEqual({ kind: 'turn_completed' });
    expect(normalizeDeepSeekTuiSseEvent('done', {})).toEqual({ kind: 'done' });
    expect(parseDeepSeekTuiSseFrame('plain text')).toBeNull();
  });
});
