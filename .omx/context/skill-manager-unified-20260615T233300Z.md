# Deep-Interview Context Snapshot: skill-manager-unified

## Task Statement
User wants to implement GitHub issues #52-#56 for WeSight, covering a unified skill manager with cross-agent skill sharing, metadata registry, update detection, dirty-state detection, import/export archives, configurable repositories, and extensible security scanning.

## Desired Outcome
A focused PRD that captures the user's real priorities and boundaries before any code is written, followed by phased implementation of the skill-manager feature set.

## Stated Solution
The user has already filed 5 issues and an RFC. They now want a deep interview to clarify true needs before writing the PRD and implementation.

## Probable Intent Hypothesis
The user experienced real pain using skills across multiple AI agents (Claude, Kimi, Codex, OpenClaw) where skills are siloed and stale. They want WeSight to become a central skill hub that installs once, shares everywhere, and keeps versions under user control.

## Known Facts / Evidence
- WeSight already supports many install sources: local zip/folder/SKILL.md, GitHub, npm, ClawHub, SkillHub marketplace, remote zip URL.
- `SkillManager` reads from user data `SKILLs/`, Claude Code `~/.claude/skills`, bundled skills, and OpenSquilla `~/.opensquilla/skills`.
- `SkillRecord` only carries id/name/description/enabled/isOfficial/isBuiltIn/updatedAt/prompt/skillPath/version — no source tracking.
- Update detection is marketplace-only; non-marketplace sources cannot be checked for updates.
- Security scan runs before install, returns risk level, but rules are hard-coded and reports are ephemeral.
- UI has Installed + Marketplace tabs, remote import for GitHub/ClawHub, bulk upgrade all.
- SQLite `kv` table stores `skills_state`; no dedicated `skill_metadata` table.
- No tests for install/upgrade/sync/update-check/dirty-detection/import-export.

## Constraints
- Electron main/renderer process isolation; all skill operations go through IPC.
- Must preserve existing bundled skill sync behavior.
- Must work on macOS/Windows/Linux.
- Skill directories can contain `node_modules`, `.env`, `_meta.json`.
- Existing skill frontmatter only has `name`, `description`, `official`, `version`.

## Unknowns / Open Questions
- Which of the 5 issues should be implemented first?
- Which agents must be supported as sync targets?
- Symlink vs copy strategy per OS and per agent.
- Update check frequency and notification UX.
- Whether dirty detection should ignore `.env` / `_meta.json` / `node_modules`.
- Whether user wants import/export in v1 or can defer.
- Whether repository management and marketplace aggregation are v1 or v2.
- Whether security scanner should hard-block critical findings.

## Decision-Boundary Unknowns
- What OMX/model may decide without user confirmation?
- Which features are MVP vs future?
- What is the acceptable scope for the first PR?

## Likely Codebase Touchpoints
- `src/main/skillManager.ts`
- `src/main/sqliteStore.ts`
- `src/shared/skills/constants.ts`
- `src/renderer/types/skill.ts`
- `src/renderer/components/skills/SkillsManager.tsx`
- `src/renderer/services/skill.ts`
- `src/main/libs/skillSecurity/skillSecurityScanner.ts`
- `src/main/skillHubMarketplace.ts`
- New modules likely under `src/main/libs/skillUpdate/`, `src/main/libs/skillRepo/`

## Prompt-Safe Initial-Context Summary Status
not_needed — context fits within safe prompt budget.
