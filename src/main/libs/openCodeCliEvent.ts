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

export type OpenCodeCliNormalizedEvent =
  | { kind: 'none'; sessionId: string | null }
  | { kind: 'assistant_text'; sessionId: string | null; text: string }
  | { kind: 'tool_use'; sessionId: string | null; toolName: string; input: Record<string, unknown> }
  | { kind: 'tool_result'; sessionId: string | null; toolName: string; output: string; isError: boolean }
  | { kind: 'step_start'; sessionId: string | null; message: string }
  | { kind: 'step_finish'; sessionId: string | null; message: string | null }
  | { kind: 'error'; sessionId: string | null; message: string };

export const parseOpenCodeCliJsonLine = (line: string): OpenCodeCliNormalizedEvent | null => {
  try {
    return normalizeOpenCodeCliEvent(JSON.parse(line));
  } catch {
    return null;
  }
};

export const normalizeOpenCodeCliEvent = (event: unknown): OpenCodeCliNormalizedEvent => {
  if (!isRecord(event)) {
    return { kind: 'none', sessionId: null };
  }

  const session = isRecord(event.session) ? event.session : {};
  const sessionId = firstString(
    event.sessionID,
    event.sessionId,
    event.session_id,
    session.id,
  );
  const type = String(event.type ?? event.event ?? '');

  if (type === 'error') {
    return {
      kind: 'error',
      sessionId,
      message: firstString(event.message, event.error) ?? 'OpenCode CLI returned an error.',
    };
  }

  if (type === 'text') {
    const text = firstString(event.text, event.content, event.message, event.delta);
    return text
      ? { kind: 'assistant_text', sessionId, text }
      : { kind: 'none', sessionId };
  }

  if (type === 'tool_use') {
    return normalizeOpenCodeToolUse(event, sessionId);
  }

  if (type === 'step_start') {
    return {
      kind: 'step_start',
      sessionId,
      message: firstString(event.title, event.name, event.message) ?? 'OpenCode step started.',
    };
  }

  if (type === 'step_finish') {
    return {
      kind: 'step_finish',
      sessionId,
      message: firstString(event.text, event.output, event.summary, event.message),
    };
  }

  const text = firstString(event.text, event.content, event.message, event.delta);
  if (text) {
    return { kind: 'assistant_text', sessionId, text };
  }
  return { kind: 'none', sessionId };
};

const normalizeOpenCodeToolUse = (
  event: Record<string, unknown>,
  sessionId: string | null,
): OpenCodeCliNormalizedEvent => {
  const part = isRecord(event.part) ? event.part : {};
  const toolName = firstString(event.tool, event.name, event.toolName, part.tool)
    ?? 'OpenCode';
  const input = isRecord(event.input)
    ? event.input
    : isRecord(event.args)
      ? event.args
      : isRecord(event.parameters)
        ? event.parameters
        : {};
  const output = firstString(event.output, event.result, event.text, event.content);
  if (output) {
    return {
      kind: 'tool_result',
      sessionId,
      toolName,
      output,
      isError: Boolean(event.error),
    };
  }
  return {
    kind: 'tool_use',
    sessionId,
    toolName,
    input,
  };
};
