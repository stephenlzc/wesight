/**
 * Kimi CLI stream-json 事件归一化。
 *
 * Kimi CLI 的 `--output-format stream-json --include-partial-messages` 事件
 * schema 是 Claude Code `stream-json` 的超集（见
 * https://moonshotai.github.io/kimi-cli/en/reference/kimi-command.html）。
 * 字段名 snake_case / camelCase 都接受。
 *
 * Claude Code 事件类型（也是 Kimi 输出的子集）：
 *   - `system`  { subtype: 'init' | 'hook_started' | 'hook_response', session_id, ... }
 *   - `assistant` { message: { content: [{ type: 'text' | 'tool_use', text | (id, name, input) }] }, session_id }
 *   - `user`  { message: { content: [{ type: 'tool_result', tool_use_id, content, is_error }] }, session_id }
 *   - `result`  { subtype: 'success' | 'failure', is_error, duration_ms, result, error, session_id }
 *   - `stream_event`  { event: { type: 'content_block_delta', delta: { type: 'text_delta', text } }, session_id }
 *
 * 本归一化器的目标：
 *   - text 类 assistant 输出 → assistant_text（流式 append + 最终 replace）
 *   - tool_use 类 → tool_use
 *   - tool_result 类 → tool_result
 *   - result success → assistant_text replace=true
 *   - system / 不可识别 → none
 */

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

export type KimiCliNormalizedEvent =
  | { kind: 'none'; sessionId: string | null }
  | { kind: 'assistant_text'; sessionId: string | null; text: string; replace: boolean }
  | { kind: 'tool_use'; sessionId: string | null; toolName: string; input: Record<string, unknown> }
  | { kind: 'tool_result'; sessionId: string | null; toolName: string; output: string; isError: boolean }
  | { kind: 'error'; sessionId: string | null; message: string };

const firstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
};

export const parseKimiCliJsonLine = (line: string): KimiCliNormalizedEvent | null => {
  try {
    return normalizeKimiCliCliEvent(JSON.parse(line));
  } catch {
    return null;
  }
};

const extractSessionId = (event: Record<string, unknown>): string | null => {
  return firstString(event.session_id, event.sessionId, event.sessionID);
};

const readContentArray = (
  message: Record<string, unknown> | undefined,
): Array<Record<string, unknown>> => {
  if (!message) return [];
  const content = message.content;
  if (!Array.isArray(content)) return [];
  return content.filter(isRecord);
};

const handleAssistantMessage = (
  sessionId: string | null,
  message: Record<string, unknown>,
): KimiCliNormalizedEvent => {
  const blocks = readContentArray(message);
  // Look for the first tool_use block; if found, emit tool_use
  for (const block of blocks) {
    if (block.type === 'tool_use' || block.tool_use_id) {
      const input = isRecord(block.input) ? block.input : {};
      return {
        kind: 'tool_use',
        sessionId,
        toolName: String(block.name ?? 'unknown'),
        input,
      };
    }
  }
  // Otherwise concatenate all text blocks
  const text = blocks
    .filter((block) => block.type === 'text' || typeof block.text === 'string')
    .map((block) => String(block.text ?? ''))
    .join('');
  if (text) {
    return { kind: 'assistant_text', sessionId, text, replace: false };
  }
  return { kind: 'none', sessionId };
};

const handleUserMessage = (
  sessionId: string | null,
  message: Record<string, unknown>,
): KimiCliNormalizedEvent => {
  const blocks = readContentArray(message);
  // tool_result comes through the user-role message in Claude Code's schema
  for (const block of blocks) {
    if (block.type === 'tool_result' || block.tool_use_id) {
      // Content can be a string or a list of content blocks. Flatten.
      let output: string;
      if (typeof block.content === 'string') {
        output = block.content;
      } else if (Array.isArray(block.content)) {
        output = block.content
          .filter(isRecord)
          .map((b) => String(b.text ?? ''))
          .join('');
      } else {
        output = '';
      }
      return {
        kind: 'tool_result',
        sessionId,
        toolName: String(block.tool_use_id ?? 'unknown'),
        output,
        isError: Boolean(block.is_error),
      };
    }
  }
  return { kind: 'none', sessionId };
};

const handleStreamEventDelta = (
  sessionId: string | null,
  outerEvent: Record<string, unknown>,
): KimiCliNormalizedEvent => {
  // When --include-partial-messages is on, content_block_delta arrives
  // wrapped in a stream_event envelope.
  const streamEvent = isRecord(outerEvent.event) ? outerEvent.event : null;
  if (!streamEvent) return { kind: 'none', sessionId };
  if (streamEvent.type !== 'content_block_delta') return { kind: 'none', sessionId };
  const delta = isRecord(streamEvent.delta) ? streamEvent.delta : null;
  if (!delta) return { kind: 'none', sessionId };
  if (delta.type === 'text_delta' && typeof delta.text === 'string') {
    return { kind: 'assistant_text', sessionId, text: delta.text, replace: false };
  }
  return { kind: 'none', sessionId };
};

export const normalizeKimiCliCliEvent = (event: unknown): KimiCliNormalizedEvent => {
  if (!isRecord(event)) {
    return { kind: 'none', sessionId: null };
  }
  const sessionId = extractSessionId(event);
  const type = String(event.type ?? '');

  if (type === 'assistant') {
    const message = isRecord(event.message) ? event.message : undefined;
    return handleAssistantMessage(sessionId, message ?? {});
  }

  if (type === 'user') {
    const message = isRecord(event.message) ? event.message : undefined;
    return handleUserMessage(sessionId, message ?? {});
  }

  if (type === 'stream_event') {
    return handleStreamEventDelta(sessionId, event);
  }

  if (type === 'result') {
    const isError = Boolean(event.is_error) || String(event.subtype ?? '') !== 'success';
    if (isError) {
      const errorRecord = isRecord(event.error) ? event.error : {};
      return {
        kind: 'error',
        sessionId,
        message: firstString(errorRecord.message, event.error, event.result) ?? 'Kimi CLI run failed.',
      };
    }
    const result = firstString(event.result);
    return result
      ? { kind: 'assistant_text', sessionId, text: result, replace: true }
      : { kind: 'none', sessionId };
  }

  // Fallback: handle flat text-only events (some Kimi configurations emit
  // these instead of the full Claude-Code-compatible envelope).
  const text = firstString(event.text, event.content, event.message, event.delta);
  if (text) {
    return { kind: 'assistant_text', sessionId, text, replace: false };
  }

  return { kind: 'none', sessionId };
};
