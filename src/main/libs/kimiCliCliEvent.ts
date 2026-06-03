/**
 * Kimi CLI stream-json 事件归一化。
 *
 * 状态：占位（scaffold）。Kimi CLI 的 `--output-format stream-json` 事件 schema
 * 与 Claude Code `stream-json` 同源（type: system | assistant | tool_use |
 * tool_result | result），但本仓库需要实测后才能确定每种 event 的字段。
 * 当前实现把所有未识别事件归为 `none`，等真实事件可复现后补全。
 *
 * 完整实现见 https://github.com/freestylefly/wesight/issues/34
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

/**
 * 占位实现：只识别 `text` 字段，输出 assistant_text；其他一律视为 none。
 * TODO: 完整识别 system / assistant / tool_use / tool_result / result。
 */
export const normalizeKimiCliCliEvent = (event: unknown): KimiCliNormalizedEvent => {
  if (!isRecord(event)) {
    return { kind: 'none', sessionId: null };
  }
  const sessionId = firstString(event.session_id, event.sessionId, event.sessionID);
  const type = String(event.type ?? '');
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
  const text = firstString(event.text, event.content, event.message, event.delta);
  if (text) {
    return { kind: 'assistant_text', sessionId, text, replace: false };
  }
  return { kind: 'none', sessionId };
};
