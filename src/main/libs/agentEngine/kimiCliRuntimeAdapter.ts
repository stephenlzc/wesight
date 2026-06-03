/**
 * Kimi CLI Cowork 运行时适配器（占位 / scaffold）。
 *
 * 状态：仅实现 CoworkRuntime 接口外壳，所有会话调用都立即返回「尚未实现」错误。
 * 完整功能（spawn `kimi --print --output-format stream-json`、事件归一化、
 * 权限模式 `--yolo` / `--plan` 路由、本机 `~/.kimi/config.toml` 复用等）
 * 将在后续 commit 中补全，跟踪于
 *   https://github.com/freestylefly/wesight/issues/34
 *
 * 设计选择：单独建一个 adapter 而不是复用 `ExternalCliRuntimeAdapter`，
 * 因为后者与现有 9 个引擎的命令拼装、env 注入、provider store 紧密耦合，
 * 引入 Kimi CLI 一次性会污染 ~15 处分支；先以独立类落位，等行为稳定后再决定
 * 是否合并到 `ExternalCliRuntimeAdapter`。
 */

import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter } from 'events';

import type {
  CoworkContinueOptions,
  CoworkRuntime,
  CoworkRuntimeEvents,
  CoworkStartOptions,
} from './types';

const NOT_IMPLEMENTED_MESSAGE = '[KimiCli] engine is not yet implemented; tracked in issue #34.';

export class KimiCliRuntimeAdapter extends EventEmitter implements CoworkRuntime {
  constructor() {
    super();
  }

  override on<U extends keyof CoworkRuntimeEvents>(
    event: U,
    listener: CoworkRuntimeEvents[U],
  ): this {
    return super.on(event, listener);
  }

  override off<U extends keyof CoworkRuntimeEvents>(
    event: U,
    listener: CoworkRuntimeEvents[U],
  ): this {
    return super.off(event, listener);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async startSession(sessionId: string, _prompt: string, _options: CoworkStartOptions = {}): Promise<void> {
    this.emit('error', sessionId, NOT_IMPLEMENTED_MESSAGE);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async continueSession(sessionId: string, _prompt: string, _options: CoworkContinueOptions = {}): Promise<void> {
    this.emit('error', sessionId, NOT_IMPLEMENTED_MESSAGE);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  stopSession(_sessionId: string): void {
    // No-op: no sessions are ever started by the scaffold.
  }

  stopAllSessions(): void {
    // No-op.
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  respondToPermission(_requestId: string, _result: PermissionResult): void {
    // No-op: no permission requests are ever emitted by the scaffold.
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isSessionActive(_sessionId: string): boolean {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getSessionConfirmationMode(_sessionId: string): 'modal' | 'text' | null {
    return null;
  }
}
