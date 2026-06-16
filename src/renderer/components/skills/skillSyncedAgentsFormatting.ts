import type { SkillSyncMode } from '@shared/skills/constants';

/**
 * Trims a filesystem path so it fits on a single line in the skill
 * detail modal. Keeps the trailing two segments when the path is
 * long enough to wrap; falls back to the full path when it is
 * already short (≤ 48 chars) or shallow (≤ 2 segments).
 *
 * The threshold is a visual judgement — long enough to fit typical
 * Agent skill directories like `~/.claude/skills/<id>` and
 * `~/.codex/skills/<id>` on a single line without wrapping in the
 * default modal width.
 */
export const shortenSyncPath = (path: string): string => {
  if (!path || path.length <= 48) return path;
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return path;
  const tail = parts.slice(-2).join('/');
  return `…/${tail}`;
};

/**
 * Returns true when the entry should be styled with the
 * "symlink" badge colour (blue). Exported so the rendering
 * component can pick the right Tailwind classes without
 * duplicating the literal.
 */
export const isSymlinkMode = (mode: SkillSyncMode | string): boolean => mode === 'symlink';
