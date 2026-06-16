# Skill Manager Unified — Deep-Interview Spec / PRD Foundation

## Metadata
- **Project:** WeSight
- **Branch:** `feat/skill-manager-unified`
- **GitHub Issues:** #52–#56
- **This PRD covers:** Issue #52 only (v1)
- **Profile:** standard deep-interview, extended to 15 rounds
- **Final ambiguity:** 12% (below 20% threshold)
- **Interview transcript:** `.omx/interviews/skill-manager-unified-20260615T234500Z.md`
- **Context snapshot:** `.omx/context/skill-manager-unified-20260615T233300Z.md`

---

## 1. Intent

The user experiences pain when using skills across multiple AI agents (Claude Code, Kimi CLI, Codex CLI, OpenClaw). Skills installed in one agent are not reusable in others, and once installed there is no central record of where a skill came from or whether it is stale. WeSight should become the central skill hub: install once, share everywhere, and keep the user in control of updates.

## 2. Desired Outcome

A single, merged PR for Issue #52 that:
1. Introduces a persistent skill metadata registry in SQLite.
2. Records the source of every installed skill.
3. Syncs user-installed skills to configured agent directories via symlinks (with copy fallback).
4. Surfaces source metadata in the WeSight UI.
5. Lays extensible groundwork for Issues #53–#56 without implementing them.

## 3. In-Scope (v1 / Issue #52)

### 3.1 Data layer
- New SQLite table `skill_metadata` with columns:
  - `id TEXT PRIMARY KEY`
  - `name TEXT`
  - `version TEXT`
  - `source_type TEXT` (`github` | `npm` | `skillhub` | `clawhub` | `zip` | `local`)
  - `source_url TEXT`
  - `source_ref TEXT` (branch/tag/commit or npm dist-tag)
  - `author TEXT`
  - `license TEXT`
  - `homepage TEXT`
  - `installed_at INTEGER`
  - `updated_at INTEGER`
  - `file_hash TEXT` (reserved for #54, nullable in v1)
  - `remote_version TEXT` (reserved for #53, nullable in v1)
  - `last_check_at INTEGER` (reserved for #53, nullable in v1)
  - `dirty INTEGER` (reserved for #54, default 0 in v1)
  - `sync_targets TEXT` — JSON array of `{ agent, path, mode: 'symlink' | 'copy' }`
- Migration of existing installed skills into `skill_metadata` on first run.
- Backward-compatible extension of `SkillRecord` and renderer `Skill` type with an optional `source` object.

### 3.2 Cross-agent sync
- Supported sync targets (configurable):
  - Claude Code: `~/.claude/skills`
  - Kimi CLI: `~/.kimi-code/skills`
  - OpenClaw: configurable path
  - Codex CLI: configurable path
  - Custom paths (user-defined)
- Sync strategy per target:
  - macOS/Linux: symlink preferred.
  - Windows: try symlink if developer mode is enabled; otherwise copy.
- Sync lifecycle:
  - On skill install: create symlink/copy in enabled targets.
  - On skill delete: remove symlink/copy from targets.
  - On skill upgrade: replace symlink/copy atomically.
- Conflict handling when target already has same `id` but different origin:
  - Show modal asking user to keep existing / replace with WeSight version / skip this target.
- Error handling:
  - If sync fails (missing dir, permission, conflict not resolved), show modal with retry / skip / cancel action.
  - Cancel rolls back the install/delete operation.

### 3.3 Settings & UI
- New "Skill Sync Targets" section in Settings:
  - List default targets (Claude, Kimi, OpenClaw, Codex).
  - Detect whether each target directory exists.
  - Allow enable/disable per target.
  - Allow add/remove custom paths.
- Skill detail modal:
  - Show source type, URL, ref, author, license, installed/updated time.
  - Show list of synced agents.
- On first skill install:
  - Show a one-time onboarding dialog to choose which agents to sync to.

### 3.4 Integration points
- Capture source metadata at the end of `downloadSkill()` and `performSkillUpgrade()`.
- Keep bundled skill sync behavior unchanged; bundled skills are NOT synced out.
- Marketplace upgrade flow continues to work; `getSkillInstallStatus` may use registry as a fallback data source.

### 3.5 Testing
- Unit tests for `skill_metadata` registry CRUD and migration.
- Unit tests for sync resolver (symlink vs copy per OS).
- End-to-end tests for install/delete lifecycle with sync targets (using temp directories).

## 4. Out-of-Scope / Non-Goals (v1)

- **#53 update detection**: no remote version checking, no update badges, no upgrade prompts. The `remote_version` and `last_check_at` columns are reserved but unused.
- **#54 dirty detection**: no file hash comparison, no dirty badge, no discard-changes action. The `file_hash` and `dirty` columns are reserved but unused.
- **#55 configurable repositories**: no user-defined GitHub repos, no repository index format, no marketplace aggregation.
- **#56 extensible security scanner**: security rules remain hard-coded, reports remain ephemeral. No rule file loader, no report history.
- Two-way git merge / conflict resolution.
- Replacing marketplace APIs with a local package registry.
- Syncing bundled skills out to agents.

## 5. Decision Boundaries

The implementation may decide without further user confirmation:
- Exact TypeScript interface names and internal module layout.
- Whether to use `fs.symlink` vs `fs.link` vs copy on each OS, as long as the documented strategy is followed.
- Migration strategy for existing skills (e.g., infer `source_type: 'unknown'`).
- UI styling details, as long as the required fields are shown.
- Cache/refresh policy for detecting target directory existence.

Must ask the user if:
- A target agent already has a skill with the same id but a different origin.
- A sync fails and the user must choose retry/skip/cancel.

## 6. Constraints

- Electron main/renderer isolation: all operations exposed via IPC.
- Must remain backward compatible: old skills without metadata continue to work.
- Must work on macOS, Windows, Linux.
- Must not break bundled skill sync or marketplace upgrade flow.
- `SkillRecord`/`Skill` type extensions must be optional/nullable.
- Skill directories may contain `.env`, `_meta.json`, `node_modules`, `.git`; these should be excluded from any hash computation when #54 arrives.

## 7. Acceptance Criteria

- [ ] `skill_metadata` table exists and is queried by `SkillManager`.
- [ ] Existing skills are migrated into the registry on first run with `source_type: 'unknown'`.
- [ ] Installing a skill from any supported source writes correct `source_type`, `source_url`, `source_ref` into the registry.
- [ ] Installing a skill creates symlinks/copies in all enabled sync targets.
- [ ] Deleting a skill removes symlinks/copies from all enabled sync targets.
- [ ] Upgrading a skill updates registry metadata and re-syncs to targets atomically.
- [ ] Target conflict modal appears when a same-id skill exists with a different origin.
- [ ] Sync failure modal appears with retry/skip/cancel actions.
- [ ] UI shows source metadata in skill detail modal.
- [ ] Settings page allows managing sync targets and custom paths.
- [ ] First install triggers onboarding to choose sync targets.
- [ ] Bundled skills are not synced out.
- [ ] Existing tests pass; new tests cover registry and install/delete lifecycle.

## 8. Assumptions Exposed

1. The user believes a full #52 loop (registry + source + sync + UI) is technically feasible and "sounds bigger than it is."
2. User control is more important than automation: conflicts and failures always surface a modal rather than silently choosing a default.
3. Cross-agent sync is the highest-value visible feature; metadata registry alone would not be worth shipping.
4. Windows symlink support is acceptable as best-effort with copy fallback.

## 9. Pressure-Pass Findings

- Round 7 revisited the tension between "validate technical feasibility" and the chosen broad scope. The user clarified that the scope is intentionally end-to-end but each piece is small, so the real feasibility risk is the integration, not any single module.
- This shifted the spec from "invisible data refactor" to "user-visible registry + sync feature."

## 10. Technical Context Findings

- `SkillManager` already discovers skills from multiple roots (`listSkills`, l.1505).
- `SkillRecord` currently has no source tracking (l.191).
- Marketplace update detection is the only update path today; non-marketplace skills cannot be checked.
- SQLite `kv` table already stores `skills_state`; adding a dedicated table follows existing patterns.
- No existing tests cover install/delete/sync/update-check/dirty-detection.

## 11. Extension Points for #53–#56

- `skill_metadata.remote_version` and `last_check_at` reserved for update checker (#53).
- `skill_metadata.file_hash` and `dirty` reserved for dirty detection (#54).
- `skill_metadata.source` shape is compatible with repository index entries (#55).
- Security scan reports can later be linked to `skill_metadata.id` (#56).

## 12. Residual Risks

- The user requested end-to-end tests, which may require mocking Electron IPC and filesystem paths.
- Windows symlink detection must be robust across different Windows editions and privilege levels.
- The first-install onboarding adds UI scope that may need iteration.

## 13. Recommended Next Step

Proceed to `$ralplan` or write the canonical PRD (`docs/prd-skill-manager-v1.md`) based on this spec, then begin implementation.
