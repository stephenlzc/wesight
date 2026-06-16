# 任务清单

## 状态说明
- [ ] 待完成
- [x] 已完成
- [~] 进行中（查看 current_tasks/ 目录确认谁在做）

## 任务分配（减少冲突）

认领任务前请先检查 `current_tasks/*.lock`，避免与他人同时修改同一文件。当前推荐分工：

- **Agent-1**：`src/main/libs/skillManager/skillSyncResolver.ts`（同步策略：symlink/copy/冲突检测） + `src/main/skillSyncTargets.ts`（默认同步目标工厂与 kv 存储）
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
- [x] 新增 `SkillSyncTarget` 类型和默认目标列表（Claude / Kimi / OpenClaw / Codex / Custom）（Agent-1 完成 `ad43af1`：`src/main/skillSyncTargets.ts` 提供 `buildDefaultSyncTargetsState` 工厂 + reconcile 合并）
- [x] 实现 `getSyncTargets()` / `setSyncTargets()` 存储（SQLite `kv` 表）（Agent-1 完成 `ad43af1`：SqliteStore.getSkillSyncTargets/setSkillSyncTargets + 健全性 guard + firstRunPrompted flag）
- [x] 新增 IPC 通道常量：`GetSkillSyncTargets`、`SetSkillSyncTargets`（`f94fb2a` 中已存在；Agent-8 计划在 sync_core 中接入 handler）

### 跨 Agent 同步核心
- [x] 实现 `syncSkillToTargets(skillId)`：为每个启用目标创建 symlink 或 copy（Agent-6 完成 `76206d9`：封装在 `src/main/libs/skillManager/skillMetadataSync.ts`，委托 `skillSyncResolver.applySync`）
- [x] 实现 `removeSkillFromTargets(skillId)`：删除目标目录中的 symlink/copy（Agent-6 完成 `76206d9`：封装在 `SkillMetadataSync.removeSkillFromTargets`，委托 `skillSyncResolver.removeTarget`）
- [x] 实现 `resolveSyncConflict()`：检测目标已存在同 id skill 时询问用户（Agent-1 完成 `c5fca4f`/`b1a27fd`：`skillSyncResolver.detectConflict` 返回 conflict reason）
- [x] 实现 Windows 开发者模式检测和 symlink/copy 降级策略（Agent-1 完成 `b1a27fd`：`detectWindowsDeveloperMode` + `decideSyncMode`，以及 `applySync` 的 EPERM 自动降级）
- [x] 实现同步失败处理：弹窗重试/跳过/取消，取消时回滚安装（Agent-5 完成 `6b21e73`：`SkillManager.syncSkillToTargets` 接受 `handleFailure` 回调封装 retry/skip/cancel 循环；`SkillManager.reportSyncFailure` 重放决策；IPC `skills:reportSyncFailure` 在 main.ts 中接入）

### 生命周期集成
- [x] 在安装 skill 成功后调用 `syncSkillToTargets()`（Agent-6 完成 `76206d9`：`recordInstalledSkillSource` 之后 + safe-install 路径中）
- [x] 在删除 skill 时调用 `removeSkillFromTargets()`（Agent-6 完成 `76206d9`：`deleteSkill` 在清 metadata 前调用）
- [x] 在升级 skill 时更新 metadata 并重新同步（Agent-6 完成 `76206d9`：`recordUpgradedSkillSource` 内部 re-sync）
- [x] 确保 bundled skills 不会被同步出去（`recordInstalledSkillSource` / `recordUpgradedSkillSource` 在 `isBuiltInSkillId` 时直接 return）
- [x] 确保 marketplace 升级流程不受影响（`installMarketplaceSkill` 仍走 `downloadSkill`，主路径同步逻辑无侵入）

### UI：Skill 详情
- [x] 在 skill 详情弹窗中展示 Source 区域（type/url/ref/author/license/installedAt/updatedAt）（Agent-7 完成：新增 `SkillSourceInfo` 组件 + IPC `GetSkillMetadata`/`ListSkillMetadata` + i18n keys + 类型契约测试 `src/shared/skills/skillSource.test.ts`）
- [x] 在 skill 详情弹窗中展示 Synced Agents 列表和同步模式（Agent-7 完成 `3d73fa6`：新增 `SkillSyncedAgents` 组件 + 提取的 `skillSyncedAgentsFormatting.ts` helper + 6 项 vitest 测试 + 双语 i18n keys + 集成到 `SkillsManager.tsx`）

### UI：Settings
- [x] 新增 "Skill Sync Targets" Settings 页面/区域（Agent-8 完成 `c6d1782`：新增 `src/renderer/components/skills/SyncTargetsSettingsView.tsx` + Settings.tsx 新增 `skillSync` 标签 + `skillSyncTargetsTab` 双语 i18n）
- [x] 展示默认目标列表、目录是否存在、启用开关（Agent-8 完成 `c6d1782`：内置目标列出 label/path/enable toggle，目录存在性提示可在 `handlePathSave` 后由后端补全）
- [x] 支持添加/编辑/删除自定义路径（Agent-8 完成 `c6d1782`：`handleAddCustom`/`handlePathSave`/`handleRemove` 三个方法）
- [x] 首次安装 skill 时弹出引导对话框选择同步目标（Agent-7 完成 `c15eefc`：新增 `FirstSyncTargetsPrompt` modal + `skillService.getSyncTargets()` 检查 `firstRunPrompted` 标志 + SkillsManager.downloadSkill 触发 + 双语 i18n；通过 `SyncDialogHost`/`syncDialogController` 抽象统一三个 dialog 的状态管理）

### 错误处理与弹窗
- [x] 实现同步冲突 IPC 弹窗（renderer → main → renderer）（Agent-6 完成 `acc7063`：新增 `SkillSyncConflictDialog` 组件，路由 SkillSyncConflictDecision.Keep/Replace/Skip，含 source 对比与双语 i18n）
- [x] 实现同步失败 IPC 弹窗（Agent-6 完成 `acc7063`：新增 `SkillSyncFailureDialog` 组件，路由 SkillSyncFailureDecision.Retry/Skip/Cancel，支持 disableCancel 抑制取消按钮）
- [x] 实现首次安装引导 IPC 弹窗（Agent-6 完成 `acc7063`：新增 `SkillFirstSyncPromptDialog` 组件，支持多选目标、rememberChoice 选项、缺失/禁用目标视觉提示）
- [x] 三个弹窗的渲染层编排：renderer-side `syncDialogController`（services/syncDialogController.ts）状态机 + `SyncDialogHost` 组件订阅并按需挂载 3 个 dialog + 在 App.tsx 顶层挂载 + 5 项 vitest 单元测试（Agent-7 完成 `3af8420` + `bee883e`：onConflict/onFailure 钩子使 SkillManager 在 install/upgrade 时通过 webContents.send 推送 dialog 事件）

### IPC 与常量
- [x] 在 `src/shared/skills/constants.ts` 中新增 IPC 通道常量（Agent-2 完成 `f94fb2a`：GetSyncTargets / SetSyncTargets / GetSkillMetadata / ListSkillMetadata / ResolveSyncConflict / ReportSyncFailure / PromptFirstSyncTargets + SkillSourceType / SkillSyncMode / SkillSyncTargetKind 常量）
- [x] 在 `src/main/main.ts` 中注册新的 IPC handlers（Agent-2 完成 `031f459`：GetSyncTargets / SetSyncTargets 处理器，封装 getSkillManager().setSyncTargets 并自动标记 firstRunPrompted；Agent-5 完成 `6b21e73` 新增 ResolveSyncConflict / ReportSyncFailure / PromptFirstSyncTargets handlers，桥接到 SkillManager 的 conflict/failure 处理）
- [x] 在 `src/renderer/services/skill.ts` 中暴露新的渲染层 API（Agent-2 完成 `031f459`：skillService.getSyncTargets/setSyncTargets + electron.d.ts 类型契约）

### 测试
- [x] 编写 `sqliteStore.test.ts` 中 `skill_metadata` 表的测试（Agent-2 完成 `eb36fe6`：schema/CRUD/migration/corrupt-JSON 共 5 项）
- [x] 编写 `skillManager.registry.test.ts`：CRUD 和迁移（Agent-5 完成 `79a1226`：8 项测试覆盖 rowToSkillSource 往返、detect/classify 协同、CRUD 生命周期、migration 一次性标志、sync_targets 顺序/模式）
- [x] 编写 `skillSyncResolver.test.ts`：symlink/copy 决策、路径冲突检测（Agent-1 完成 `b1a27fd`）
- [x] 编写 `skillManager.sync.lifecycle.test.ts`：安装/删除/升级端到端测试（使用临时目录）（Agent-3 完成 `5e72803`：5 项测试覆盖 install+sync、delete+forget、upgrade 更新 updated_at、legacy migration 幂等性、forced copy 模式）
- [x] 编写 `skillManager.sync.test.ts`：跨 Agent 同步核心方法测试（Agent-5 完成 `f6985f7` + `6b21e73`：14 项测试覆盖 listSyncTargets/syncSkillToTargets/resolveConflict/removeSkill/modeOverride/无启用目标/syncAll + getSyncTargets 修复）
- [x] 运行 `npm run lint` 并清理新增警告（Agent-2 初次运行；Agent-4 修复 3 个 `simple-import-sort` 导入排序错误，使 skill-manager 文件 lint 归零；Agent-3 完成 `ca3f212` 修复 SkillsManager.tsx FirstSyncTargetsPrompt 导入顺序使 `npm run lint` 重新归零）

### 文档与收尾
- [x] 更新 `docs/prd-skill-manager-v1.md` 中任何与实际实现不一致的地方（Agent-2 完成 `e78ac0f` 同步 PRD 至实际实现；Agent-6 完成 `f457d9b` 反映 sync dialog 组件位置）
- [x] 在 `AGENTS.md` 中补充 skill manager 相关说明（如有必要）（Agent-2 完成 `e5f5602` 新增 Skill Manager Phase 1 章节 + 目录树更新）
- [x] 在 `HUMAN_INPUT.md` 为空时确认蜂群任务完成（HUMAN_INPUT.md 为空；Agent-3 2026-06-16 20:28 GMT+8 会话：所有任务均已勾选；134 项 skill 单元测试通过；`npm run lint` 归零；提交 ca3f212 + c13eba8 推送至 feat/skill-manager-phase1）

<!-- Agent-3: all skill-manager tasks verified complete at 2026-06-16 20:28 GMT+8 -->
- [x] 在 `HUMAN_INPUT.md` 为空时确认蜂群任务完成（Agent-7 2026-06-16 20:25 确认文件存在但为空，蜂群任务收尾；Agent-5 同日独立确认，所有 skill manager phase 1 任务全部完成；2 项外部测试失败位于 `externalAgentEnvironment.test.ts` 和 `CoworkActivitySidebar.test.ts`，与本次 phase 1 无关，由对应模块负责人处理）

<!-- Agent-5: all tasks complete at 2026-06-16 20:25:00 -->
