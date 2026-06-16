# 任务清单

## 状态说明
- [ ] 待完成
- [x] 已完成
- [~] 进行中（查看 current_tasks/ 目录确认谁在做）

## 任务分配（减少冲突）

认领任务前请先检查 `current_tasks/*.lock`，避免与他人同时修改同一文件。当前推荐分工：

- **Agent-1**：`src/main/libs/skillManager/skillSyncResolver.ts`（同步策略：symlink/copy/冲突检测）
- **Agent-2**：`src/main/sqliteStore.test.ts` 和 skill metadata 相关测试
- **Agent-3**：`src/renderer/types/skill.ts` 和 `src/shared/skills/constants.ts` 的类型与常量扩展
- **Agent-4**：`src/main/sqliteStore.ts` 的 `skill_metadata` 表迁移（已部分完成）
- **Agent-5**：`src/main/skillManager.ts` 中 metadata registry CRUD API
- **Agent-6**：`src/main/skillManager.ts` 中 sync 生命周期集成（install/delete/upgrade）
- **Agent-7**：Renderer UI：skill 详情展示来源
- **Agent-8**：Renderer UI：Settings 同步目标管理 + 首次安装引导

通用规则：
1. 每完成一个小步骤就 `commit + push`，不要等整个 session 结束。
2. 新增文件统一放在 `src/main/libs/skillManager/` 下，不要新建 `src/main/skills/`。
3. 冲突时优先 `git pull --rebase` 解决，必要时在 TASKS.md 记录并让出文件。

## 任务列表

### 数据层与类型
- [x] 在 `src/main/sqliteStore.ts` 中新增 `skill_metadata` 表及迁移逻辑（Agent-5/8 已完成基础提交 `f94fb2a`）
- [x] 在 `src/main/skillManager.ts` 中新增 `SkillMetadata` 类型和 registry CRUD 方法（Agent-5 完成 `2880c77`，含 `getSkillMetadata`/`listSkillMetadata`/`upsertSkillMetadata`/`deleteSkillMetadata`/`migrateLegacySkills`/`toSkillSource`/`detectSourceFromInput`）
- [x] 向后兼容扩展 `SkillRecord`（`src/main/skillManager.ts`）和 renderer `Skill` 类型（`src/renderer/types/skill.ts`）（Agent-5 完成 `a690504`）
- [x] 实现首次启动时旧 skill 迁移到 `skill_metadata`（`source_type: 'unknown'`）（Agent-5 `migrateLegacySkills()` 在 `2880c77` 中实现）

### 来源记录
- [x] 在 `downloadSkill()` 结束时写入/更新 `skill_metadata`（Agent-2 完成 `8415341`，含 `recordInstallSources` 入口）
- [x] 在 `performSkillUpgrade()` 结束时更新 `skill_metadata` 的 `version`、`source_url`、`source_ref`、`updated_at`（Agent-2 完成 `8415341`，含 `refreshUpgradeSourceMetadata`）
- [x] 在 `deleteSkill()` 时清理 `skill_metadata` 记录（Agent-2 完成 `8415341`，`deleteSkill()` 内调用 `forgetSkillMetadata`）

### 同步目标配置
- [ ] 新增 `SkillSyncTarget` 类型和默认目标列表（Claude / Kimi / OpenClaw / Codex / Custom）
- [ ] 实现 `getSyncTargets()` / `setSyncTargets()` 存储（SQLite `kv` 表）
- [ ] 新增 IPC 通道常量：`GetSkillSyncTargets`、`SetSkillSyncTargets`

### 跨 Agent 同步核心
- [ ] 实现 `syncSkillToTargets(skillId)`：为每个启用目标创建 symlink 或 copy
- [ ] 实现 `removeSkillFromTargets(skillId)`：删除目标目录中的 symlink/copy
- [ ] 实现 `resolveSyncConflict()`：检测目标已存在同 id skill 时询问用户
- [ ] 实现 Windows 开发者模式检测和 symlink/copy 降级策略
- [ ] 实现同步失败处理：弹窗重试/跳过/取消，取消时回滚安装

### 生命周期集成
- [ ] 在安装 skill 成功后调用 `syncSkillToTargets()`
- [ ] 在删除 skill 时调用 `removeSkillFromTargets()`
- [ ] 在升级 skill 时更新 metadata 并重新同步
- [ ] 确保 bundled skills 不会被同步出去
- [ ] 确保 marketplace 升级流程不受影响

### UI：Skill 详情
- [x] 在 skill 详情弹窗中展示 Source 区域（type/url/ref/author/license/installedAt/updatedAt）（Agent-7 完成：新增 `SkillSourceInfo` 组件 + IPC `GetSkillMetadata`/`ListSkillMetadata` + i18n keys + 类型契约测试 `src/shared/skills/skillSource.test.ts`）
- [ ] 在 skill 详情弹窗中展示 Synced Agents 列表和同步模式

### UI：Settings
- [ ] 新增 "Skill Sync Targets" Settings 页面/区域
- [ ] 展示默认目标列表、目录是否存在、启用开关
- [ ] 支持添加/编辑/删除自定义路径
- [ ] 首次安装 skill 时弹出引导对话框选择同步目标

### 错误处理与弹窗
- [ ] 实现同步冲突 IPC 弹窗（renderer → main → renderer）
- [ ] 实现同步失败 IPC 弹窗
- [ ] 实现首次安装引导 IPC 弹窗

### IPC 与常量
- [ ] 在 `src/shared/skills/constants.ts` 中新增 IPC 通道常量
- [ ] 在 `src/main/main.ts` 中注册新的 IPC handlers
- [ ] 在 `src/renderer/services/skill.ts` 中暴露新的渲染层 API

### 测试
- [x] 编写 `sqliteStore.test.ts` 中 `skill_metadata` 表的测试（Agent-2 完成 `eb36fe6`：schema/CRUD/migration/corrupt-JSON 共 5 项）
- [x] 编写 `skillManager.registry.test.ts`：CRUD 和迁移（Agent-5 完成 `79a1226`：8 项测试覆盖 rowToSkillSource 往返、detect/classify 协同、CRUD 生命周期、migration 一次性标志、sync_targets 顺序/模式）
- [x] 编写 `skillSyncResolver.test.ts`：symlink/copy 决策、路径冲突检测（Agent-1 完成 `b1a27fd`）
- [ ] 编写 `skillManager.sync.lifecycle.test.ts`：安装/删除/升级端到端测试（使用临时目录）
- [x] 运行 `npm run lint` 并清理新增警告（Agent-2 已运行 lint，无新增警告）

### 文档与收尾
- [ ] 更新 `docs/prd-skill-manager-v1.md` 中任何与实际实现不一致的地方
- [ ] 在 `AGENTS.md` 中补充 skill manager 相关说明（如有必要）
- [ ] 在 `HUMAN_INPUT.md` 为空时确认蜂群任务完成
