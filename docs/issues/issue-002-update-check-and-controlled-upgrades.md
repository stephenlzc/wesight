# Issue #2: Background Update Check + User-Controlled Upgrades

## English

**Title:** `feat(skill): background update check and user-controlled upgrades`

**Labels:** `enhancement`, `skill`

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

---

## 中文

**标题：** `feat(skill): 后台更新检查与用户受控升级`

**标签：** `enhancement`, `skill`

```markdown
## 问题
目前只有 SkillHub/ClawHub marketplace 中的 skill 能检测更新。从 GitHub、npm 或 zip 安装的 skill 没有更新路径，用户也不知道有新版本可用。

## 目标
1. 按 `sourceType` 实现通用的"远程版本解析器"：
   - `github`：通过 GitHub API / HTTP 获取 latest release tag 或默认分支 commit。
   - `npm`：查询 npm registry 的 `latest` dist-tag。
   - `skillhub`/`clawhub`：复用现有 marketplace API。
   - `zip`/`local`：标记为"无上游"。
2. 增加后台任务（例如应用启动 + 每天一次），检查已安装 skill 的更新并展示通知/角标。
3. UI：增加 "Updates" 标签页或筛选器，列出可更新的 skill。
4. 升级流程：
   - 展示当前版本 → 新版本，来源支持的changelog也一并展示。
   - 如果本地 skill 是 dirty 状态，提示备份/覆盖/取消。
   - 升级前重新执行安全扫描。
   - 支持"全部升级"，带进度弹窗和取消按钮。

## 验收标准
- [ ] `checkForUpdates()` 能解析 GitHub 和 npm 来源的最新版本。
- [ ] 更新检查带缓存和速率限制。
- [ ] UI 展示可更新数量角标和更新列表。
- [ ] 用户升级单个或全部 skill 时需要明确确认。
- [ ] dirty 状态的 skill 必须经用户显式覆盖才能升级。
- [ ] 针对版本比较和解析逻辑补充测试。
```
