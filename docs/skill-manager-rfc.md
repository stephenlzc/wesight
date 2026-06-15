# Skill Manager RFC：跨 Agent Skill 统一管理、版本追踪与受控更新

> 状态：草稿（供 issue / PR 拆分讨论）  
> 范围：作为 WeSight 内置功能实现，不拆分为独立应用  
> 关联对话：关于 "skill 在不同 Agent 之间不通用、本地版本旧、需要用户决定是否更新" 的痛点

---

## 1. 现有 WeSight Skill Manager 能力（基线）

| 维度 | 当前已实现 |
|------|-----------|
| 安装来源 | 本地 zip / 文件夹 / SKILL.md、GitHub（repo / tree / blob / `owner/repo` 简写）、npm package、ClawHub URL、SkillHub Marketplace、远程 zip URL |
| 市场浏览 | SkillHub/ClawHub 市场列表、分类、排序、搜索 |
| 安全扫描 | 安装前调用 `skillSecurityScanner`，发现风险时挂起等待用户确认（`install` / `installDisabled` / `cancel`） |
| 升级 | `upgradeSkill` + `upgradeAll`，仅在市场列表里与本地版本比较后触发 |
| 配置 | 每个 skill 独立 `.env`，支持读写 |
| 多根目录 | 用户目录 + Claude Code `~/.claude/skills` + App bundled skills |
| 同步 | 启动时将 bundled skills 同步/修复到用户目录；读取 Claude skills 但不做反向同步 |

关键文件：
- `src/main/skillManager.ts` —— Skill 生命周期管理
- `src/renderer/components/skills/SkillsManager.tsx` —— UI
- `src/shared/skills/constants.ts` —— IPC 通道与市场常量
- `src/renderer/services/skill.ts` —— 渲染层服务
- `src/main/libs/skillSecurity/skillSecurityScanner.ts` —— 安全扫描

---

## 2. 当前问题分析

### 2.1 跨 Agent 共享是"只读"的
- WeSight 能**读取** Claude Code 的 `~/.claude/skills`，但安装/更新新 skill 后不会反向同步到 Claude、Kimi CLI、Codex、OpenClaw 等其他 Agent。
- 用户 Stephen 自己做的简单 skill 已经验证了"软链到各个 Agent"可行，但 WeSight 里还没有系统化的"集中存储 + 多 Agent 软链/复制"能力。

### 2.2 来源与版本信息在安装后丢失
- `SkillRecord` 只有 `version`（来自 SKILL.md frontmatter），没有保留：
  - 原始来源类型（npm / github / marketplace / zip / local）
  - 原始 URL / package spec / git ref
  - 安装时间、commit/tag、作者、fork 关系
- 这导致：非 marketplace 来源的 skill 根本没法检测更新。

### 2.3 更新检测仅限于 Marketplace
- 当前 `getSkillInstallStatus` 只在 marketplace 数据里比较版本。
- GitHub、npm、ClawHub 来源没有主动检查 remote 最新版本的能力。
- 没有后台/周期性检查，也没有"发现新版本，通知用户，由用户决定是否更新"的明确工作流。

### 2.4 缺少统一的本地 Skill Registry / Metadata Index
- 每个 skill 是独立目录，`skills.config.json` 只管理启用顺序。
- 没有一个 `skills.index.json` 或 SQLite 表来统一记录：id、来源、版本、安装时间、更新时间、本地修改状态、跨 Agent 同步状态。

### 2.5 本地修改无法感知
- 用户可能在本地调试/修改了 skill，但 WeSight 无法识别"dirty"状态。
- 直接升级会覆盖本地修改，没有 diff/备份/分支能力。
- 截图中的内部工具已有"修改检测"功能，WeSight 尚未实现。

### 2.6 没有导入/导出与集合包
- 截图中的工具支持：
  - 单个 skill 导出为 `.zip`
  - 集合包导出为 `.collection.zip`
- WeSight 目前只能逐个安装/删除，无法批量导出、备份或分享集合。

### 2.7 仓库管理缺失
- 截图中的工具支持：自定义 GitHub 仓库、官方精选仓库、仓库扫描、未扫描提醒、刷新精选。
- WeSight 的市场目前是直连 SkillHub/ClawHub API，没有"用户可配置的仓库列表"概念。

### 2.8 安全扫描规则需要可扩展
- 已有扫描器，但对话中多次强调"安全扫描很重要"。
- 需要支持：规则热更新、扫描报告持久化、按来源设置不同安全级别、白名单/黑名单。

---

## 3. 需求目标（User Stories）

1. **跨 Agent 共享**：我在 WeSight 安装一个 skill 后，可以选择软链/复制到 Claude Code、Kimi CLI、Codex、OpenClaw 等已配置的 Agent。
2. **来源追踪**：每个 skill 记录来源类型、URL、ref、安装时间、作者，UI 上能查看。
3. **版本/更新检测**：支持 GitHub tag/release/commit、npm latest、marketplace 版本检查；发现更新时提示用户，由用户决定是否升级。
4. **受控更新**：升级前显示 changelog/diff；检测到本地有修改时提示备份或放弃；支持一键升级全部或逐个确认。
5. **修改检测**：识别本地修改过的 skill，标记 dirty 状态。
6. **导入/导出/集合包**：支持导出 skill 为 zip、导出集合包、从 zip 批量导入。
7. **仓库管理**：用户可以添加自定义 GitHub 仓库作为 skill 来源，定期扫描仓库内的 skill。
8. **安全扫描增强**：规则可配置，安装前/升级前强制扫描，高风险自动阻止。

---

## 4. 建议拆分的 GitHub Issue

### Issue #1（元数据与跨 Agent 同步基础设施）
**标题**：`feat(skill): add skill metadata registry and cross-agent symlink sync`

**标签**：`enhancement`, `skill`, `rfc`

**正文**：
```markdown
## Problem
Currently WeSight can read skills from `~/.claude/skills`, but skills installed through WeSight are not shared back to Claude Code, Kimi CLI, Codex, OpenClaw, or other agent runtimes. There is also no persistent record of where a skill came from (GitHub / npm / marketplace / zip), making updates impossible for non-marketplace sources.

## Goals
1. Introduce a local skill metadata registry (SQLite or JSON index) that records for each installed skill:
   - `id`, `name`, `version`, `installedAt`, `updatedAt`
   - `sourceType`: `github` | `npm` | `skillhub` | `clawhub` | `zip` | `local`
   - `sourceUrl`, `sourceRef` (branch/tag/commit or npm dist-tag)
   - `author`, `license`, `homepage`
   - `syncedAgents`: record of which agent directories currently link to this skill
   - `dirty`: whether local modifications have been detected
2. Add a "Skill Sync Targets" settings page where users can enable/configure agent directories:
   - Claude Code: `~/.claude/skills`
   - Kimi CLI: `~/.kimi-code/skills`
   - OpenClaw: configurable
   - Custom paths
3. When a skill is installed/updated/deleted, optionally sync it to configured targets via symlink (preferred) or copy fallback.
4. Keep bundled skills and user-installed skills separate; do not sync bundled skills out.

## Non-Goals
- Full two-way git merge / conflict resolution.
- Replacing marketplace APIs with a local package registry.

## Acceptance Criteria
- [ ] New `SkillMetadata` type and registry API in main process.
- [ ] Existing skills are migrated into the registry on first run.
- [ ] UI shows source metadata in skill detail modal.
- [ ] User can configure sync targets and enable/disable sync per target.
- [ ] Installing a skill creates symlinks in configured targets.
- [ ] Deleting a skill removes symlinks from targets.
- [ ] Unit tests for registry read/write and symlink sync.

## Open Questions
- Should symlinks be used on Windows? (Windows 10+ supports unprivileged symlinks in developer mode; otherwise fallback to copy.)
- How do we handle a target agent that already has a skill with the same id but different origin?
```

### Issue #2（版本检查与受控更新）
**标题**：`feat(skill): background update check and user-controlled upgrades`

**标签**：`enhancement`, `skill`

**正文**：
```markdown
## Problem
Today update detection only works for skills that exist in the SkillHub/ClawHub marketplace. Skills installed from GitHub, npm, or zip have no update path, and users are not notified when a newer version is available.

## Goals
1. Implement a generic "remote version resolver" per `sourceType`:
   - `github`: fetch latest release tag or default branch commit via GitHub API / HTTP.
   - `npm`: query npm registry for `latest` dist-tag.
   - `skillhub`/`clawhub`: use existing marketplace API.
   - `zip`/`local`: mark as "no upstream".
2. Add a background job (e.g., on app launch + once per day) that checks installed skills for updates and emits a notification/badge.
3. UI: "Updates" tab or filter showing skills with available updates.
4. Upgrade flow:
   - Show current → new version and source-specific changelog if available.
   - If local skill is dirty, prompt to backup/overwrite/cancel.
   - Re-run security scan before install.
   - Support "update all" with progress dialog and cancel.

## Acceptance Criteria
- [ ] `checkForUpdates()` resolves latest version for GitHub and npm sources.
- [ ] Update check is cached and rate-limited.
- [ ] UI shows update badge count and update list.
- [ ] User can upgrade one or all skills with explicit confirmation.
- [ ] Dirty skills cannot be upgraded without explicit user override.
- [ ] Tests for version comparison and resolver logic.
```

### Issue #3（本地修改检测与导入/导出）
**标题**：`feat(skill): detect local modifications and support skill archive import/export`

**标签**：`enhancement`, `skill`

**正文**：
```markdown
## Problem
Users often tweak skills locally. Currently WeSight has no way to detect these modifications before an upgrade overwrites them. There is also no way to back up or share a set of skills as an archive.

## Goals
1. Track a canonical checksum/hash for each skill file set at install/upgrade time.
2. Compare current files against the recorded checksum to detect local modifications (`dirty` state).
3. UI: show "modified" badge on skill cards and in detail modal.
4. Export:
   - Single skill → `.zip`
   - Selected skills / all user skills → `.collection.zip` with manifest
5. Import:
   - Accept `.zip` (single skill) and `.collection.zip` (multiple skills).
   - Read manifest, validate, scan security, install.

## Acceptance Criteria
- [ ] Dirty detection implemented and performant.
- [ ] UI shows dirty badge and "discard local changes" action.
- [ ] Export produces valid zip/collection zip.
- [ ] Import handles both formats.
- [ ] Tests for hash computation and archive round-trip.
```

### Issue #4（可配置 Skill 仓库与市场聚合）
**标题**：`feat(skill): configurable skill repositories and marketplace aggregation`

**标签**：`enhancement`, `skill`, `marketplace`

**正文**：
```markdown
## Problem
The marketplace is currently limited to SkillHub/ClawHub. Users want to add custom GitHub repositories or curated lists as skill sources, similar to package managers.

## Goals
1. Add a "Repositories" settings section:
   - Built-in curated repo (e.g., Anthropic official skills)
   - User-defined GitHub repos or raw JSON index URLs
   - Enable/disable per repo
2. Repository index format (v1):
   ```json
   {
     "version": 1,
     "skills": [
       { "id": "...", "name": "...", "version": "...", "source": { "type": "github", "url": "...", "ref": "..." } }
     ]
   }
   ```
3. Marketplace UI aggregates skills from all enabled repos + remote marketplaces.
4. "Scan repository" action refreshes the index.

## Acceptance Criteria
- [ ] Repo settings CRUD in UI.
- [ ] Index fetching and caching.
- [ ] Marketplace list deduplicates by id, preferring higher-priority source.
- [ ] Tests for index parsing and merge logic.
```

### Issue #5（安全扫描增强）
**标题**：`feat(skill): extensible security scanner with rule configuration and report history`

**标签**：`enhancement`, `skill`, `security`

**正文**：
```markdown
## Problem
Security scanning is already performed at install time, but rules are hard-coded, reports are ephemeral, and users cannot tune severity or view historical scan results.

## Goals
1. Move rule definitions to a configurable JSON/YAML file in user data.
2. Support severity levels and per-source overrides.
3. Persist scan reports in SQLite with timestamp.
4. UI: show "Safe / Warning / Dangerous" status per skill; click to view detailed report.
5. Hard-block installation if critical rules trigger.

## Acceptance Criteria
- [ ] Configurable rule loader.
- [ ] Scan reports persisted and queryable.
- [ ] UI shows risk level badge and report viewer.
- [ ] Critical findings block install even on manual confirmation.
```

---

## 5. 推荐 PR 拆分顺序

| 阶段 | PR | 内容 | 改动面 |
|------|-----|------|--------|
| 1 | `feat(skill): skill metadata registry` | 新增 `SkillMetadata` 类型、registry store、安装时写入 metadata、启动迁移 | `src/main/skillManager.ts`, `src/main/sqliteStore.ts`, types |
| 2 | `feat(skill): cross-agent sync targets` | 设置页 + symlink/copy sync 到 Claude/Kimi/OpenClaw/custom | `src/main/skillManager.ts`, `src/renderer/components/skills/`, IPC |
| 3 | `feat(skill): update checker` | GitHub/npm remote version resolver、后台检查、更新列表 UI | `src/main/libs/skillUpdate/`, UI, IPC |
| 4 | `feat(skill): controlled upgrade flow` | 升级确认、dirty 提示、批量升级、安全扫描前置 | `src/renderer/components/skills/`, `src/main/skillManager.ts` |
| 5 | `feat(skill): dirty detection and import/export` | 文件 hash、dirty badge、zip/collection 导入导出 | `src/main/skillManager.ts`, UI |
| 6 | `feat(skill): configurable repositories` | 仓库设置、index 聚合、市场 UI 改造 | `src/main/libs/skillRepo/`, UI |
| 7 | `feat(skill): security scanner v2` | 可配置规则、报告持久化、报告查看器 | `src/main/libs/skillSecurity/`, UI |

---

## 6. 关键技术决策建议

### 6.1 Metadata 存储
- **推荐**：SQLite 新表 `skill_metadata`（与现有 `kv` 表一致，便于查询和迁移）。
- 结构：
  ```sql
  CREATE TABLE skill_metadata (
    id TEXT PRIMARY KEY,
    source_type TEXT,
    source_url TEXT,
    source_ref TEXT,
    installed_at INTEGER,
    updated_at INTEGER,
    version TEXT,
    remote_version TEXT,
    last_check_at INTEGER,
    file_hash TEXT,
    dirty INTEGER,
    sync_targets TEXT -- JSON array
  );
  ```

### 6.2 跨 Agent 同步
- **优先 symlink**：Linux/macOS 天然支持；Windows 10+ 在开发者模式下支持无特权 symlink，否则 fallback 到 copy。
- 在 metadata 中记录 `syncedAgents`，便于卸载时清理。
- 冲突处理：如果目标目录已存在同名 skill 且不是我们的 symlink，提示用户覆盖/跳过/重命名。

### 6.3 版本检查
- GitHub：先查 `releases/latest`，fallback 到默认 branch HEAD commit。
- npm：请求 `https://registry.npmjs.org/{pkg}` 读 `dist-tags.latest`。
- 加入缓存（24h）和并发限制，避免触发 API rate limit。

### 6.4 修改检测
- 安装/升级后计算每个文件（除 `.env`、`_meta.json`、`node_modules`、`.git`）的 SHA-256，存为 JSON。
- 定期检查或按需比较。

---

## 7. 与现有代码的兼容点

- `SkillRecord` 需要扩展 `source` 字段，但可保持向后兼容（老 skill 的 `source_type: 'unknown'`）。
- `downloadSkill` 和 `upgradeSkill` 需要在成功后将来源信息写入 registry。
- `SkillsManager.tsx` 的 detail modal 已经预留了 source/author/url 展示位，只需要把本地 skill 的 metadata 接进去。
- 安全扫描已有挂起确认机制，增强版可以复用 `pendingInstalls` 流程。

---

## 8. 待确认问题

1. 是否需要支持 Agent 的双向同步？（即：Claude 里装的 skill 是否要在 WeSight 中显示为"外部来源"并可管理？）
2. Windows 上是否强制要求管理员权限做 symlink，还是默认 copy fallback？
3. 是否要内置官方 Anthropic skills 仓库索引？
4. 更新检查频率和后台任务调度是否复用现有的 `scheduledTask` 模块？
