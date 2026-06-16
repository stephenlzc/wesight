import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SkillSyncMode,
  SkillSourceType,
  SkillSyncTargetKind,
} from '../shared/skills/constants';

import {
  applySync,
  decideSyncMode,
  defaultTargetPath,
  detectConflict,
  detectWindowsDeveloperMode,
  inspectTarget,
  removeTarget,
  writeMarker,
} from './skillSyncResolver';

let tmpRoot = '';

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-sync-resolver-'));
});

afterEach(() => {
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describe('decideSyncMode', () => {
  it('uses symlink on linux', () => {
    const decision = decideSyncMode('linux');
    expect(decision.mode).toBe(SkillSyncMode.Symlink);
  });

  it('uses symlink on darwin', () => {
    const decision = decideSyncMode('darwin');
    expect(decision.mode).toBe(SkillSyncMode.Symlink);
  });

  it('uses symlink on windows when developer mode is enabled', () => {
    const decision = decideSyncMode('win32', true);
    expect(decision.mode).toBe(SkillSyncMode.Symlink);
  });

  it('falls back to copy on windows without developer mode', () => {
    const decision = decideSyncMode('win32', false);
    expect(decision.mode).toBe(SkillSyncMode.Copy);
  });
});

describe('detectWindowsDeveloperMode', () => {
  it('returns false on non-windows platforms', () => {
    if (process.platform === 'win32') return;
    expect(detectWindowsDeveloperMode()).toBe(false);
  });
});

describe('defaultTargetPath', () => {
  it('returns the canonical home-relative path for known agent kinds', () => {
    const home = '/home/test';
    expect(defaultTargetPath(SkillSyncTargetKind.ClaudeCode, home))
      .toBe(path.join(home, '.claude', 'skills'));
    expect(defaultTargetPath(SkillSyncTargetKind.Kimi, home))
      .toBe(path.join(home, '.kimi-code', 'skills'));
    expect(defaultTargetPath(SkillSyncTargetKind.OpenClaw, home))
      .toBe(path.join(home, '.openclaw', 'skills'));
    expect(defaultTargetPath(SkillSyncTargetKind.Codex, home))
      .toBe(path.join(home, '.codex', 'skills'));
  });

  it('falls back to a wesight-managed subdir for custom kinds', () => {
    const home = '/home/test';
    expect(defaultTargetPath('custom-agent', home))
      .toBe(path.join(home, '.wesight', 'skills', 'custom-agent'));
  });
});

describe('inspectTarget', () => {
  it('returns exists=false for missing paths', () => {
    const info = inspectTarget(path.join(tmpRoot, 'does-not-exist'));
    expect(info.exists).toBe(false);
  });

  it('flags a directory containing the marker as managed', () => {
    const dir = path.join(tmpRoot, 'mydir');
    fs.mkdirSync(dir);
    writeMarker(dir, SkillSourceType.GitHub);
    const info = inspectTarget(dir);
    expect(info.exists).toBe(true);
    expect(info.isSymlink).toBe(false);
    expect(info.isManaged).toBe(true);
    expect(info.managedSourceType).toBe(SkillSourceType.GitHub);
  });

  it('flags a foreign directory as not managed', () => {
    const dir = path.join(tmpRoot, 'foreign');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Hi');
    const info = inspectTarget(dir);
    expect(info.exists).toBe(true);
    expect(info.isManaged).toBe(false);
  });

  it('detects a broken symlink', () => {
    const linkPath = path.join(tmpRoot, 'broken-link');
    fs.symlinkSync(path.join(tmpRoot, 'does-not-exist'), linkPath);
    const info = inspectTarget(linkPath);
    expect(info.exists).toBe(true);
    expect(info.isSymlink).toBe(true);
    expect(info.isBrokenSymlink).toBe(true);
  });
});

describe('detectConflict', () => {
  it('reports no conflict on a missing target', () => {
    const source = path.join(tmpRoot, 'source');
    fs.mkdirSync(source);
    const decision = detectConflict(
      path.join(tmpRoot, 'target'),
      SkillSourceType.GitHub,
      source,
    );
    expect(decision.hasConflict).toBe(false);
  });

  it('reports no conflict when our marker shows the same source type', () => {
    const source = path.join(tmpRoot, 'source');
    fs.mkdirSync(source);
    const target = path.join(tmpRoot, 'target');
    fs.mkdirSync(target);
    writeMarker(target, SkillSourceType.GitHub);
    const decision = detectConflict(target, SkillSourceType.GitHub, source);
    expect(decision.hasConflict).toBe(false);
  });

  it('reports conflict when our marker shows a different source type', () => {
    const source = path.join(tmpRoot, 'source');
    fs.mkdirSync(source);
    const target = path.join(tmpRoot, 'target');
    fs.mkdirSync(target);
    writeMarker(target, SkillSourceType.SkillHub);
    const decision = detectConflict(target, SkillSourceType.GitHub, source);
    expect(decision.hasConflict).toBe(true);
    expect(decision.reason).toBe('managed-different-source');
    expect(decision.existingSourceType).toBe(SkillSourceType.SkillHub);
  });

  it('reports conflict for a foreign directory', () => {
    const source = path.join(tmpRoot, 'source');
    fs.mkdirSync(source);
    const target = path.join(tmpRoot, 'foreign');
    fs.mkdirSync(target);
    const decision = detectConflict(target, SkillSourceType.GitHub, source);
    expect(decision.hasConflict).toBe(true);
    expect(decision.reason).toBe('foreign-directory');
  });
});

describe('applySync + removeTarget', () => {
  it('creates a directory symlink and writes the marker', () => {
    if (process.platform === 'win32') return; // symlink semantics differ
    const source = path.join(tmpRoot, 'source');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'SKILL.md'), '# source');
    const target = path.join(tmpRoot, 'target');

    applySync(source, target, decideSyncMode('darwin'), {
      replaceExisting: false,
      sourceType: SkillSourceType.GitHub,
    });

    const lstat = fs.lstatSync(target);
    expect(lstat.isSymbolicLink()).toBe(true);
    const info = inspectTarget(target);
    expect(info.isManaged).toBe(true);
    expect(info.managedSourceType).toBe(SkillSourceType.GitHub);

    removeTarget(target);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('falls back to copy mode when requested', () => {
    const source = path.join(tmpRoot, 'source');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'SKILL.md'), '# source');
    const target = path.join(tmpRoot, 'target');

    applySync(source, target, { mode: SkillSyncMode.Copy, reason: 'test' }, {
      replaceExisting: false,
      sourceType: SkillSourceType.Local,
    });

    const lstat = fs.lstatSync(target);
    expect(lstat.isSymbolicLink()).toBe(false);
    expect(lstat.isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8')).toBe('# source');
    const info = inspectTarget(target);
    expect(info.isManaged).toBe(true);
    expect(info.managedSourceType).toBe(SkillSourceType.Local);
  });

  it('replaces existing entry when replaceExisting=true', () => {
    if (process.platform === 'win32') return;
    const source = path.join(tmpRoot, 'source');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'SKILL.md'), '# source');
    const target = path.join(tmpRoot, 'target');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'old.txt'), 'stale');

    applySync(source, target, decideSyncMode('darwin'), {
      replaceExisting: true,
      sourceType: SkillSourceType.GitHub,
    });

    expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(target, 'old.txt'))).toBe(false);
  });
});
