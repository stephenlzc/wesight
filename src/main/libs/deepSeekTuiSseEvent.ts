export type DeepSeekTuiNormalizedEvent =
  | { kind: 'assistant_text'; text: string }
  | { kind: 'tool_started'; toolCallId: string | null; toolName: string; input: Record<string, unknown> }
  | { kind: 'tool_progress'; toolCallId: string | null; output: string }
  | { kind: 'tool_completed'; toolCallId: string | null; toolName: string; output: string; isError: boolean }
  | { kind: 'status'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'approval_required'; approvalId: string; toolName: string; input: Record<string, unknown>; payload: Record<string, unknown> }
  | { kind: 'turn_completed' }
  | { kind: 'done' }
  | { kind: 'none' };

export interface DeepSeekTuiSseFrame {
  event: string;
  data: unknown;
  id?: string;
}

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
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const nestedRecord = (value: Record<string, unknown>, key: string): Record<string, unknown> => {
  const next = value[key];
  return isRecord(next) ? next : {};
};

const extractPayload = (data: unknown): Record<string, unknown> => {
  if (!isRecord(data)) return {};
  const payload = data.payload;
  return isRecord(payload) ? payload : data;
};

const extractToolName = (payload: Record<string, unknown>): string => {
  const tool = nestedRecord(payload, 'tool');
  const item = nestedRecord(payload, 'item');
  const request = nestedRecord(payload, 'request');
  return firstString(payload.name, payload.tool_name, tool.name, item.name, request.name) ?? 'Tool';
};

const extractToolInput = (payload: Record<string, unknown>): Record<string, unknown> => {
  const input = payload.input
    ?? payload.arguments
    ?? nestedRecord(payload, 'tool').input
    ?? nestedRecord(payload, 'request').input;
  return isRecord(input) ? input : {};
};

const extractToolCallId = (payload: Record<string, unknown>, data?: unknown): string | null => {
  return firstString(
    payload.id,
    payload.item_id,
    payload.tool_call_id,
    nestedRecord(payload, 'tool').id,
    nestedRecord(payload, 'item').id,
    nestedRecord(payload, 'request').id,
    isRecord(data) ? data.item_id : null,
  );
};

const normalizeRawRuntimeEvent = (
  eventName: string,
  data: unknown,
  payload: Record<string, unknown>,
): DeepSeekTuiNormalizedEvent => {
  if (eventName === 'item.delta') {
    const kind = firstString(payload.kind, nestedRecord(payload, 'item').kind);
    if (kind === 'agent_message') {
      const text = firstString(payload.delta, payload.content, payload.text);
      return text ? { kind: 'assistant_text', text } : { kind: 'none' };
    }
    if (kind === 'tool_call') {
      const output = firstString(payload.delta, payload.output, payload.text);
      return output
        ? { kind: 'tool_progress', toolCallId: extractToolCallId(payload, data), output }
        : { kind: 'none' };
    }
  }

  if (eventName === 'item.started') {
    return {
      kind: 'tool_started',
      toolCallId: extractToolCallId(payload, data),
      toolName: extractToolName(payload),
      input: extractToolInput(payload),
    };
  }

  if (eventName === 'item.completed' || eventName === 'item.failed') {
    const output = firstString(payload.output, payload.result, payload.text, nestedRecord(payload, 'item').output)
      ?? stringifyPayload(payload);
    return {
      kind: 'tool_completed',
      toolCallId: extractToolCallId(payload, data),
      toolName: extractToolName(payload),
      output,
      isError: eventName === 'item.failed' || Boolean(payload.error),
    };
  }

  return { kind: 'none' };
};

export const parseDeepSeekTuiSseFrame = (frame: string): DeepSeekTuiSseFrame | null => {
  const lines = frame.split(/\r?\n/);
  let event = 'message';
  let id: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }
    if (line.startsWith('id:')) {
      id = line.slice('id:'.length).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }

  if (dataLines.length === 0 && event === 'message') return null;
  const rawData = dataLines.join('\n');
  let data: unknown = rawData;
  if (rawData) {
    try {
      data = JSON.parse(rawData);
    } catch {
      data = rawData;
    }
  }
  return { event, data, id };
};

export const normalizeDeepSeekTuiSseEvent = (
  eventName: string,
  data: unknown,
): DeepSeekTuiNormalizedEvent => {
  if (eventName === 'done') return { kind: 'done' };
  if (eventName === 'turn.completed' || eventName === 'turn.completed.v1') return { kind: 'turn_completed' };
  if (eventName === 'message.delta') {
    const payload = extractPayload(data);
    const text = firstString(payload.content, payload.delta, payload.text);
    return text ? { kind: 'assistant_text', text } : { kind: 'none' };
  }
  if (eventName === 'tool.started') {
    const payload = extractPayload(data);
    return {
      kind: 'tool_started',
      toolCallId: extractToolCallId(payload, data),
      toolName: extractToolName(payload),
      input: extractToolInput(payload),
    };
  }
  if (eventName === 'tool.progress') {
    const payload = extractPayload(data);
    const output = firstString(payload.output, payload.content, payload.delta, payload.text);
    return output
      ? { kind: 'tool_progress', toolCallId: extractToolCallId(payload, data), output }
      : { kind: 'none' };
  }
  if (eventName === 'tool.completed') {
    const payload = extractPayload(data);
    const output = firstString(payload.output, payload.result, payload.content, payload.text)
      ?? stringifyPayload(payload);
    return {
      kind: 'tool_completed',
      toolCallId: extractToolCallId(payload, data),
      toolName: extractToolName(payload),
      output,
      isError: Boolean(payload.error) || payload.success === false,
    };
  }
  if (eventName === 'status') {
    const payload = extractPayload(data);
    const message = firstString(payload.message, payload.status, data);
    return message ? { kind: 'status', message } : { kind: 'none' };
  }
  if (eventName === 'error' || eventName === 'sandbox.denied') {
    const payload = extractPayload(data);
    const message = firstString(payload.message, payload.error, payload.reason, data)
      ?? stringifyPayload(payload);
    return { kind: 'error', message };
  }
  if (eventName === 'approval.required') {
    const payload = extractPayload(data);
    const approvalId = firstString(
      payload.approval_id,
      payload.approvalId,
      payload.id,
      nestedRecord(payload, 'request').id,
    );
    if (!approvalId) return { kind: 'none' };
    return {
      kind: 'approval_required',
      approvalId,
      toolName: extractToolName(payload),
      input: extractToolInput(payload),
      payload,
    };
  }

  return normalizeRawRuntimeEvent(eventName, data, extractPayload(data));
};
