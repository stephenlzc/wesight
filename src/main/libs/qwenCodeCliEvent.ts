const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

const firstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
};

const stringifyPayload = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export type QwenCodeCliNormalizedEvent =
  | { kind: 'none'; sessionId: string | null }
  | { kind: 'assistant_text'; sessionId: string | null; text: string; replace: boolean }
  | { kind: 'tool_use'; sessionId: string | null; toolName: string; input: Record<string, unknown> }
  | { kind: 'tool_result'; sessionId: string | null; toolName: string; output: string; isError: boolean }
  | { kind: 'error'; sessionId: string | null; message: string };

export const parseQwenCodeCliJsonLine = (line: string): QwenCodeCliNormalizedEvent | null => {
  try {
    return normalizeQwenCodeCliEvent(JSON.parse(line));
  } catch {
    return null;
  }
};

export const normalizeQwenCodeCliEvent = (event: unknown): QwenCodeCliNormalizedEvent => {
  if (!isRecord(event)) {
    return { kind: 'none', sessionId: null };
  }

  const sessionId = firstString(event.session_id, event.sessionId, event.sessionID);
  const type = String(event.type ?? '');
  if (type === 'system') {
    return { kind: 'none', sessionId };
  }
  if (type === 'stream_event' && isRecord(event.event)) {
    return normalizeQwenStreamEvent(event.event, sessionId);
  }
  if (type === 'assistant' && isRecord(event.message)) {
    return normalizeQwenAssistantMessage(event.message, sessionId);
  }
  if (type === 'result') {
    if (event.is_error || String(event.subtype ?? '') !== 'success') {
      const error = isRecord(event.error) ? event.error : {};
      return {
        kind: 'error',
        sessionId,
        message: firstString(error.message, event.error, event.result) ?? 'Qwen Code CLI run failed.',
      };
    }
    const result = firstString(event.result);
    return result
      ? { kind: 'assistant_text', sessionId, text: result, replace: true }
      : { kind: 'none', sessionId };
  }

  const text = firstString(event.text, event.content, event.message, event.delta);
  if (text) {
    return { kind: 'assistant_text', sessionId, text, replace: false };
  }
  return { kind: 'none', sessionId };
};

const normalizeQwenStreamEvent = (
  event: Record<string, unknown>,
  sessionId: string | null,
): QwenCodeCliNormalizedEvent => {
  const type = String(event.type ?? '');
  if (type !== 'content_block_delta' || !isRecord(event.delta)) {
    return { kind: 'none', sessionId };
  }
  const text = firstString(event.delta.text, event.delta.thinking);
  return text
    ? { kind: 'assistant_text', sessionId, text, replace: false }
    : { kind: 'none', sessionId };
};

const normalizeQwenAssistantMessage = (
  message: Record<string, unknown>,
  sessionId: string | null,
): QwenCodeCliNormalizedEvent => {
  const content = message.content;
  if (!Array.isArray(content)) {
    const text = firstString(content);
    return text
      ? { kind: 'assistant_text', sessionId, text, replace: true }
      : { kind: 'none', sessionId };
  }
  const textParts: string[] = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    const blockType = String(block.type ?? '');
    if (blockType === 'text') {
      const text = firstString(block.text);
      if (text) textParts.push(text);
    } else if (blockType === 'tool_use') {
      return {
        kind: 'tool_use',
        sessionId,
        toolName: firstString(block.name) ?? 'Tool',
        input: isRecord(block.input) ? block.input : {},
      };
    } else if (blockType === 'tool_result') {
      const output = firstString(block.content, block.text, block.result) ?? stringifyPayload(block);
      return {
        kind: 'tool_result',
        sessionId,
        toolName: firstString(block.name) ?? 'Tool',
        output,
        isError: Boolean(block.is_error || block.error),
      };
    }
  }
  if (textParts.length > 0) {
    return {
      kind: 'assistant_text',
      sessionId,
      text: textParts.join('\n'),
      replace: true,
    };
  }
  return { kind: 'none', sessionId };
};
