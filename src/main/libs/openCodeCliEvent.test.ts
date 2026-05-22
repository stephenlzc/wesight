import { describe, expect, test } from 'vitest';

import {
  normalizeOpenCodeCliEvent,
  parseOpenCodeCliJsonLine,
} from './openCodeCliEvent';

describe('openCodeCliEvent', () => {
  test('normalizes assistant text events', () => {
    expect(normalizeOpenCodeCliEvent({
      type: 'text',
      sessionID: 'ses_123',
      text: 'hello',
    })).toEqual({
      kind: 'assistant_text',
      sessionId: 'ses_123',
      text: 'hello',
    });
  });

  test('normalizes tool_use events without output', () => {
    expect(normalizeOpenCodeCliEvent({
      type: 'tool_use',
      tool: 'bash',
      input: { command: 'pwd' },
    })).toEqual({
      kind: 'tool_use',
      sessionId: null,
      toolName: 'bash',
      input: { command: 'pwd' },
    });
  });

  test('normalizes tool_use events with output as tool results', () => {
    expect(normalizeOpenCodeCliEvent({
      type: 'tool_use',
      name: 'read',
      output: 'file contents',
      error: false,
    })).toEqual({
      kind: 'tool_result',
      sessionId: null,
      toolName: 'read',
      output: 'file contents',
      isError: false,
    });
  });

  test('normalizes step lifecycle events', () => {
    expect(normalizeOpenCodeCliEvent({
      type: 'step_start',
      title: 'Planning',
    })).toEqual({
      kind: 'step_start',
      sessionId: null,
      message: 'Planning',
    });

    expect(normalizeOpenCodeCliEvent({
      type: 'step_finish',
      summary: 'Done',
    })).toEqual({
      kind: 'step_finish',
      sessionId: null,
      message: 'Done',
    });
  });

  test('normalizes error events', () => {
    expect(normalizeOpenCodeCliEvent({
      type: 'error',
      message: 'failed',
    })).toEqual({
      kind: 'error',
      sessionId: null,
      message: 'failed',
    });
  });

  test('returns null for non-json lines', () => {
    expect(parseOpenCodeCliJsonLine('plain text')).toBeNull();
  });
});
