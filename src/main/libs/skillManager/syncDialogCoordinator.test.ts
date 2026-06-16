/**
 * Tests for the sync dialog coordinator. These cover the main
 * request/response lifecycle and the timeout fallback. They stub out
 * Electron's BrowserWindow so the coordinator can be exercised
 * without an actual app.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron's BrowserWindow so we can drive the coordinator
// without launching a real window.
type MockWindow = {
  destroyed: boolean;
  isDestroyed: () => boolean;
  webContents: { send: ReturnType<typeof vi.fn> };
};

const liveWindows: MockWindow[] = [];

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => liveWindows,
  },
}));

vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');
  let counter = 0;
  return {
    ...actual,
    randomUUID: () => `test-uuid-${++counter}`,
  };
});

import { SkillSyncConflictDecision, SkillSyncFailureDecision } from '../../../shared/skills/constants';
import { SyncDialogCoordinator } from './syncDialogCoordinator';

const makeWindow = (): MockWindow => {
  const win: MockWindow = {
    destroyed: false,
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  };
  liveWindows.push(win);
  return win;
};

const clearWindows = (): void => {
  liveWindows.length = 0;
};

describe('SyncDialogCoordinator', () => {
  beforeEach(() => {
    clearWindows();
    SyncDialogCoordinator._resetForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    SyncDialogCoordinator._resetForTests();
    vi.useRealTimers();
    clearWindows();
  });

  it('returns Skip when no renderer window is alive', async () => {
    const decision = await SyncDialogCoordinator.requestConflictResolution({
      skillId: 'demo',
      agent: 'claude-code',
      path: '/tmp/demo',
      incomingSourceType: 'github',
    });
    expect(decision).toBe(SkillSyncConflictDecision.Skip);
  });

  it('broadcasts a conflict prompt to every live window', async () => {
    const winA = makeWindow();
    const winB = makeWindow();

    const promise = SyncDialogCoordinator.requestConflictResolution({
      skillId: 'demo',
      agent: 'claude-code',
      path: '/tmp/demo',
      incomingSourceType: 'github',
    });

    expect(winA.webContents.send).toHaveBeenCalledOnce();
    expect(winB.webContents.send).toHaveBeenCalledOnce();
    const [channel, payload] = winA.webContents.send.mock.calls[0];
    expect(channel).toBe('skills:syncDialog:conflict');
    expect(payload).toMatchObject({
      conflict: { skillId: 'demo', agent: 'claude-code' },
    });
    expect(typeof payload.requestId).toBe('string');

    // Resolve by accepting a decision.
    const resolved = SyncDialogCoordinator.acceptConflictDecision(
      payload.requestId,
      SkillSyncConflictDecision.Replace,
    );
    expect(resolved).toBe(true);
    await expect(promise).resolves.toBe(SkillSyncConflictDecision.Replace);
  });

  it('returns false when accepting an unknown request id', () => {
    expect(
      SyncDialogCoordinator.acceptConflictDecision('nope', SkillSyncConflictDecision.Keep),
    ).toBe(false);
  });

  it('rejects unknown decision values', async () => {
    const win = makeWindow();
    const promise = SyncDialogCoordinator.requestFailureResolution({
      skillId: 'demo',
      agent: 'kimi',
      path: '/tmp/demo',
      mode: 'symlink',
      reason: 'boom',
    });
    expect(win.webContents.send).toHaveBeenCalledOnce();
    const requestId = win.webContents.send.mock.calls[0][1].requestId;

    // 'invalid' is not in the failure decision union; the helper
    // rejects the pending promise and the caller should observe the
    // rejection rather than a resolved value. The return is `true`
    // because the request id was found and cleared.
    const accepted = SyncDialogCoordinator.acceptFailureDecision(requestId, 'invalid' as never);
    expect(accepted).toBe(true);
    await expect(promise).rejects.toThrow(/Invalid failure decision/);
  });

  it('defaults to Skip on timeout for conflict requests', async () => {
    makeWindow();
    const promise = SyncDialogCoordinator.requestConflictResolution({
      skillId: 'demo',
      agent: 'claude-code',
      path: '/tmp/demo',
      incomingSourceType: 'github',
    });
    vi.advanceTimersByTime(60_001);
    await expect(promise).resolves.toBe(SkillSyncConflictDecision.Skip);
  });

  it('defaults to Skip on timeout for failure requests', async () => {
    makeWindow();
    const promise = SyncDialogCoordinator.requestFailureResolution({
      skillId: 'demo',
      agent: 'codex',
      path: '/tmp/demo',
      mode: 'copy',
      reason: 'EACCES',
    });
    vi.advanceTimersByTime(60_001);
    await expect(promise).resolves.toBe(SkillSyncFailureDecision.Skip);
  });

  it('handles first-sync prompt with selected targets', async () => {
    const win = makeWindow();
    const promise = SyncDialogCoordinator.requestFirstSyncTargets([
      {
        id: 'claude-code',
        kind: 'claude-code',
        label: 'Claude Code',
        path: '/tmp/claude',
        enabled: false,
        exists: true,
      },
      {
        id: 'kimi',
        kind: 'kimi',
        label: 'Kimi CLI',
        path: '/tmp/kimi',
        enabled: false,
        exists: false,
      },
    ]);

    expect(win.webContents.send).toHaveBeenCalledOnce();
    const [channel, payload] = win.webContents.send.mock.calls[0];
    expect(channel).toBe('skills:syncDialog:firstSync');
    expect(payload.targets).toHaveLength(2);

    const accepted = SyncDialogCoordinator.acceptFirstSyncTargets(
      payload.requestId,
      ['claude-code'],
      true,
    );
    expect(accepted).toBe(true);
    await expect(promise).resolves.toEqual({
      selectedTargetIds: ['claude-code'],
      rememberChoice: true,
    });
  });

  it('cleans non-string target ids from the renderer response', async () => {
    const win = makeWindow();
    const promise = SyncDialogCoordinator.requestFirstSyncTargets([
      { id: 'a', kind: 'a', label: 'A', path: '/a', enabled: true, exists: true },
    ]);
    const requestId = win.webContents.send.mock.calls[0][1].requestId;
    SyncDialogCoordinator.acceptFirstSyncTargets(
      requestId,
      // 42 is not a string and should be filtered out
      ['a', 42 as unknown as string, null as unknown as string],
      true,
    );
    await expect(promise).resolves.toEqual({
      selectedTargetIds: ['a'],
      rememberChoice: true,
    });
  });

  it('treats non-array selectedTargetIds as an empty list', async () => {
    const win = makeWindow();
    const promise = SyncDialogCoordinator.requestFirstSyncTargets([
      { id: 'a', kind: 'a', label: 'A', path: '/a', enabled: true, exists: true },
    ]);
    const requestId = win.webContents.send.mock.calls[0][1].requestId;
    SyncDialogCoordinator.acceptFirstSyncTargets(
      requestId,
      null as unknown as string[],
      false,
    );
    await expect(promise).resolves.toEqual({
      selectedTargetIds: [],
      rememberChoice: false,
    });
  });

  it('returns empty selection when no window is alive', async () => {
    const result = await SyncDialogCoordinator.requestFirstSyncTargets([
      { id: 'a', kind: 'a', label: 'A', path: '/a', enabled: true, exists: true },
    ]);
    expect(result).toEqual({ selectedTargetIds: [], rememberChoice: false });
  });

  it('ignores send failures on a single window', async () => {
    const win = makeWindow();
    win.webContents.send = vi.fn(() => {
      throw new Error('renderer gone');
    });
    const promise = SyncDialogCoordinator.requestConflictResolution({
      skillId: 'demo',
      agent: 'claude-code',
      path: '/tmp/demo',
      incomingSourceType: 'github',
    });
    // Should not throw, and request should still be pending
    expect(SyncDialogCoordinator.hasPendingRequests()).toBe(true);
    SyncDialogCoordinator._resetForTests();
    // Swallow the resulting rejection
    await promise.catch(() => undefined);
  });
});
