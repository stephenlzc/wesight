/**
 * Skill Sync Resolver
 *
 * Pure functions for deciding how to sync a skill directory to a target
 * location. The lifecycle hooks (install/upgrade/delete) live in
 * SkillManager; this module only answers "what should we do here".
 *
 * Decision rules (per PRD §5.2):
 * - macOS / Linux: prefer fs.symlink('dir').
 * - Windows: detect developer mode. If symlinks are allowed, use them;
 *   otherwise fall back to recursive copy.
 * - If the target already exists and is not managed by us, return a
 *   conflict descriptor so the caller can prompt the user.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  type SkillSourceType,
  SkillSyncMode,
  type SkillSyncTargetKind,
} from '../shared/skills/constants';

const WESIGHT_LINK_MARKER_FILENAME = '.wesight-skill-link';
/**
 * Marker file content written inside every symlink/copy WeSight creates.
 * Lets us recognise directories we own at sync time without trusting
 * lstat alone (which only tells us it's a symlink, not that *we* made it).
 */
const WESIGHT_LINK_MARKER_VALUE = 'wesight-managed';

export interface SyncTargetSpec {
  kind: SkillSyncTargetKind | string;
  path: string;
}

export interface SyncModeDecision {
  mode: SkillSyncMode;
  /** Human-readable reason explaining the mode (used in dialogs / logs). */
  reason: string;
}

export interface ExistingTargetInfo {
  /** True if the path exists at all (file, dir, symlink, broken link). */
  exists: boolean;
  /** True if the path resolves to a symlink. */
  isSymlink: boolean;
  /** True if the symlink is broken (target missing). */
  isBrokenSymlink: boolean;
  /** True if WeSight previously created this entry (marker present). */
  isManaged: boolean;
  /** Source type parsed from a marker file, when present. */
  managedSourceType?: SkillSourceType;
}

export interface ConflictDescriptor {
  hasConflict: boolean;
  reason?: 'foreign-directory' | 'foreign-symlink' | 'broken-symlink' | 'managed-same-source' | 'managed-different-source';
  existingSourceType?: SkillSourceType;
  incomingSourceType: SkillSourceType;
}

/**
 * Detect Windows Developer Mode by checking the registry. Returns false on
 * non-Windows platforms or if the lookup fails. We never throw from here —
 * the resolver must remain usable in test environments without Windows.
 */
export function detectWindowsDeveloperMode(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    // Dynamic require keeps this module loadable on macOS/Linux tests.
    const { execSync } = require('child_process') as typeof import('child_process');
    const output = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense',
      { encoding: 'utf-8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const match = output.match(/AllowDevelopmentWithoutDevLicense\s+REG_DWORD\s+(0x[0-9a-fA-F]+|\d+)/);
    if (!match) return false;
    const value = match[1].toLowerCase();
    return value === '0x1' || value === '1';
  } catch {
    return false;
  }
}

/**
 * Pick the sync mode for a given platform. Pure: depends only on inputs.
 * Tests pass an explicit `developerMode` to avoid touching the registry.
 */
export function decideSyncMode(
  platform: NodeJS.Platform = process.platform,
  developerMode: boolean = detectWindowsDeveloperMode(),
): SyncModeDecision {
  if (platform === 'win32') {
    if (developerMode) {
      return { mode: SkillSyncMode.Symlink, reason: 'windows-developer-mode' };
    }
    return { mode: SkillSyncMode.Copy, reason: 'windows-non-developer-mode' };
  }
  return { mode: SkillSyncMode.Symlink, reason: 'posix-symlink' };
}

/**
 * Resolve the default target directory for a given agent kind. Pure:
 * no filesystem side effects. `~` is expanded to the user's home directory.
 */
export function defaultTargetPath(kind: SkillSyncTargetKind | string, homeDir?: string): string {
  const home = homeDir ?? os.homedir();
  switch (kind) {
    case 'claude-code':
      return path.join(home, '.claude', 'skills');
    case 'kimi':
      return path.join(home, '.kimi-code', 'skills');
    case 'openclaw':
      return path.join(home, '.openclaw', 'skills');
    case 'codex':
      return path.join(home, '.codex', 'skills');
    default:
      return path.join(home, '.wesight', 'skills', String(kind));
  }
}

/**
 * Inspect what's currently at the target path. Never throws — a missing
 * path simply returns `exists: false`.
 */
export function inspectTarget(targetPath: string): ExistingTargetInfo {
  const info: ExistingTargetInfo = {
    exists: false,
    isSymlink: false,
    isBrokenSymlink: false,
    isManaged: false,
  };

  let lstat: fs.Stats | null = null;
  try {
    lstat = fs.lstatSync(targetPath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code !== 'ENOENT') {
      console.warn(`[SkillSyncResolver] lstat failed for ${targetPath}:`, err);
    }
    return info;
  }

  info.exists = true;
  info.isSymlink = lstat.isSymbolicLink();

  if (info.isSymlink) {
    let realStat: fs.Stats | null = null;
    try {
      realStat = fs.statSync(targetPath);
    } catch {
      info.isBrokenSymlink = true;
    }
    if (realStat) {
      info.isManaged = readMarker(targetPath).isManaged;
      info.managedSourceType = readMarker(targetPath).sourceType;
    }
    return info;
  }

  if (lstat.isDirectory()) {
    const marker = readMarker(targetPath);
    info.isManaged = marker.isManaged;
    info.managedSourceType = marker.sourceType;
  }

  return info;
}

interface MarkerReadResult {
  isManaged: boolean;
  sourceType?: SkillSourceType;
}

function readMarker(targetPath: string): MarkerReadResult {
  // For a symlink, the marker lives inside the symlink target (the
  // directory the link points to). For a real directory, the marker
  // lives inside it.
  const candidate = path.join(targetPath, WESIGHT_LINK_MARKER_FILENAME);
  try {
    const raw = fs.readFileSync(candidate, 'utf8');
    if (!raw.startsWith(WESIGHT_LINK_MARKER_VALUE)) {
      return { isManaged: false };
    }
    const sourceType = raw.replace(WESIGHT_LINK_MARKER_VALUE, '').trim() || undefined;
    return {
      isManaged: true,
      sourceType: sourceType as SkillSourceType | undefined,
    };
  } catch {
    return { isManaged: false };
  }
}

/**
 * Write the marker file inside a freshly created symlink/copy target.
 * Exported so tests can assert on its format without going through sync().
 */
export function writeMarker(targetPath: string, sourceType: SkillSourceType): void {
  const markerPath = path.join(targetPath, WESIGHT_LINK_MARKER_FILENAME);
  const value = sourceType
    ? `${WESIGHT_LINK_MARKER_VALUE}:${sourceType}`
    : WESIGHT_LINK_MARKER_VALUE;
  fs.writeFileSync(markerPath, value, 'utf8');
}

/**
 * Decide whether installing into `targetPath` conflicts with an existing
 * entry. Pure: does not mutate anything. The caller is responsible for
 * prompting the user when `hasConflict` is true.
 *
 * - Missing path → no conflict.
 * - Symlink pointing at our source → no conflict (idempotent).
 * - Managed entry (marker present) with same source type → no conflict.
 * - Managed entry with different source type → conflict (user choice).
 * - Foreign directory / foreign symlink → conflict.
 */
export function detectConflict(
  targetPath: string,
  incomingSourceType: SkillSourceType,
  sourceDir: string,
): ConflictDescriptor {
  const info = inspectTarget(targetPath);
  if (!info.exists) {
    return { hasConflict: false, incomingSourceType };
  }

  // Our symlink already pointing at this source: idempotent re-sync.
  if (info.isSymlink && !info.isBrokenSymlink) {
    try {
      const realTarget = fs.realpathSync(targetPath);
      const realSource = fs.realpathSync(sourceDir);
      if (realTarget === realSource) {
        return { hasConflict: false, incomingSourceType };
      }
    } catch {
      // Fall through to generic conflict.
    }
  }

  if (info.isManaged) {
    if (info.managedSourceType === incomingSourceType) {
      return {
        hasConflict: false,
        reason: 'managed-same-source',
        existingSourceType: info.managedSourceType,
        incomingSourceType,
      };
    }
    return {
      hasConflict: true,
      reason: 'managed-different-source',
      existingSourceType: info.managedSourceType,
      incomingSourceType,
    };
  }

  if (info.isBrokenSymlink) {
    return {
      hasConflict: true,
      reason: 'broken-symlink',
      incomingSourceType,
    };
  }

  if (info.isSymlink) {
    return {
      hasConflict: true,
      reason: 'foreign-symlink',
      incomingSourceType,
    };
  }

  return {
    hasConflict: true,
    reason: 'foreign-directory',
    incomingSourceType,
  };
}

/**
 * Apply a sync decision: create a symlink or copy the directory. Removes
 * any previous entry at `targetPath` first when `replaceExisting` is true.
 * Throws on filesystem failure; the caller decides how to recover.
 */
export function applySync(
  sourceDir: string,
  targetPath: string,
  decision: SyncModeDecision,
  options: {
    replaceExisting: boolean;
    sourceType: SkillSourceType;
  },
): void {
  const parent = path.dirname(targetPath);
  fs.mkdirSync(parent, { recursive: true });

  if (options.replaceExisting) {
    removeTarget(targetPath);
  } else if (fs.existsSync(targetPath)) {
    const err = new Error(`target already exists: ${targetPath}`);
    (err as NodeJS.ErrnoException).code = 'EEXIST';
    throw err;
  }

  if (decision.mode === SkillSyncMode.Symlink) {
    try {
      fs.symlinkSync(sourceDir, targetPath, 'dir');
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code === 'EPERM' || err?.code === 'EACCES') {
        // No symlink permission: fall back to copy without throwing.
        copyDirectoryRecursive(sourceDir, targetPath);
        writeMarker(targetPath, options.sourceType);
        return;
      }
      throw err;
    }
    writeMarker(targetPath, options.sourceType);
    return;
  }

  copyDirectoryRecursive(sourceDir, targetPath);
  writeMarker(targetPath, options.sourceType);
}

/**
 * Remove a previously created symlink or copy. Safe to call when the
 * target doesn't exist.
 */
export function removeTarget(targetPath: string): void {
  let lstat: fs.Stats | null = null;
  try {
    lstat = fs.lstatSync(targetPath);
  } catch {
    return;
  }
  if (lstat.isSymbolicLink()) {
    try {
      fs.unlinkSync(targetPath);
    } catch (error) {
      console.warn(`[SkillSyncResolver] failed to unlink ${targetPath}:`, error);
    }
    return;
  }
  if (lstat.isDirectory()) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[SkillSyncResolver] failed to remove ${targetPath}:`, error);
    }
  }
}

function copyDirectoryRecursive(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });
  const entries = fs.readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(source, entry.name);
    const dst = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(src, dst);
    } else if (entry.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(src);
      fs.symlinkSync(linkTarget, dst);
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}
