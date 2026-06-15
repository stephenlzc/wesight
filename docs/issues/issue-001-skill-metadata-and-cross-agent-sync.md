# Issue #1: Skill Metadata Registry + Cross-Agent Sync

## English

**Title:** `feat(skill): add skill metadata registry and cross-agent symlink sync`

**Labels:** `enhancement`, `skill`, `rfc`

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

---

## 中文

**标题：** `feat(skill): 增加 Skill 元数据注册表与跨 Agent 软链同步`

**标签：** `enhancement`, `skill`, `rfc`

```markdown
## 问题
目前 WeSight 可以读取 `~/.claude/skills` 中的 skill，但通过 WeSight 安装的 skill 无法反向同步到 Claude Code、Kimi CLI、Codex、OpenClaw 等其他 Agent 运行时。同时，安装后也没有持久化记录 skill 的来源（GitHub / npm / marketplace / zip），导致非 marketplace 来源的 skill 无法更新。

## 目标
1. 引入本地 skill 元数据注册表（SQLite 或 JSON 索引），为每个已安装 skill 记录：
   - `id`、`name`、`version`、`installedAt`、`updatedAt`
   - `sourceType`：`github` | `npm` | `skillhub` | `clawhub` | `zip` | `local`
   - `sourceUrl`、`sourceRef`（分支/tag/commit 或 npm dist-tag）
   - `author`、`license`、`homepage`
   - `syncedAgents`：当前哪些 Agent 目录链接到了该 skill
   - `dirty`：是否检测到本地修改
2. 新增 "Skill Sync Targets" 设置页，用户可以启用/配置 Agent 目录：
   - Claude Code：`~/.claude/skills`
   - Kimi CLI：`~/.kimi-code/skills`
   - OpenClaw：可配置路径
   - 自定义路径
3. 安装/更新/删除 skill 时，可选地通过软链（优先）或复制降级方式同步到已配置目标。
4. bundled skills 与用户安装的 skill 保持隔离，不要把 bundled skills 同步出去。

## 非目标
- 完整的双向 git 合并 / 冲突解决。
- 用本地包注册表替代 marketplace API。

## 验收标准
- [ ] 主进程新增 `SkillMetadata` 类型和 registry API。
- [ ] 首次启动时将现有 skill 迁移进注册表。
- [ ] UI 在 skill 详情弹窗中展示来源元数据。
- [ ] 用户可以配置同步目标，并单独启用/禁用每个目标。
- [ ] 安装 skill 时在已配置目标中创建软链。
- [ ] 删除 skill 时清理目标中的软链。
- [ ] 针对 registry 读写和软链同步补充单元测试。

## 待确认问题
- Windows 上是否使用软链？（Windows 10+ 在开发者模式下支持无特权软链，否则降级为复制。）
- 如果目标 Agent 已存在同 id 但不同来源的 skill，应如何处理？
```
