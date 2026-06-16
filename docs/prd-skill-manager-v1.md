# PRD: Unified Skill Manager — Phase 1 (Issue #52)

> 状态：基于 deep-interview 定稿  
> 分支：`feat/skill-manager-phase1`  
> 覆盖：GitHub issue #52（Skill Metadata Registry + Cross-Agent Sync）  
> 关联：#53–#56 预留扩展点，v1 不实现  
> 实施记录：见 `TASKS.md` 与 `git log feat/skill-manager-phase1`

---

## 1. 背景与目标

### 1.1 痛点
- 不同 Agent（Claude Code、Kimi CLI、Codex CLI、OpenClaw）各自拥有独立的 skill 目录，skill 无法通用。
- WeSight 安装 skill 后没有持久化来源信息，导致后续无法判断版本、来源和更新状态。
- 用户希望 WeSight 成为 skill 的集中管理入口：装一次，多处可用。

### 1.2 目标
第一版实现 Issue #52 的完整闭环：
1. 建立 SQLite skill metadata registry。
2. 记录每个 skill 的来源类型、URL、ref、作者、安装时间等。
3. 将用户安装的 skill 同步到已配置的 Agent 目录（软链优先，复制降级）。
4. 在 UI 中展示来源信息，并提供同步目标管理。
5. 为 #53–#56 预留数据字段和接口，但不实现功能。

---

## 2. 范围

### 2.1 In-Scope
- 新增 `skill_metadata` SQLite 表。
- 安装/升级时写入来源元数据。
- 首次启动时迁移现有 skill。
- 向后兼容扩展 `SkillRecord` / `Skill` 类型。
- 跨 Agent 同步到 Claude Code、Kimi CLI、OpenClaw、Codex CLI、自定义路径。
- Windows 上检测开发者模式，能软链则软链，否则复制。
- 同步冲突时询问用户。
- 同步失败时弹窗提示重试/跳过/取消。
- UI：skill 详情展示来源、Settings 中管理同步目标、首次安装引导。
- 测试：registry CRUD、sync resolver、安装/删除生命周期端到端测试。

### 2.2 Out-of-Scope（v1）
- #53：远程版本检查、更新提醒、批量升级。
- #54：本地修改检测、dirty 状态、导入/导出。
- #55：可配置仓库、市场聚合。
- #56：可配置安全规则、扫描报告历史。
- bundled skill 的反向同步。
- 双向 git 合并 / 冲突解决。

---

## 3. 数据模型

### 3.1 SQLite 表 `skill_metadata`

```sql
CREATE TABLE skill_metadata (
  id TEXT PRIMARY KEY,
  name TEXT,
  version TEXT,
  source_type TEXT,        -- github | npm | skillhub | clawhub | zip | local | unknown
  source_url TEXT,
  source_ref TEXT,         -- branch/tag/commit or npm dist-tag
  author TEXT,
  license TEXT,
  homepage TEXT,
  installed_at INTEGER,
  updated_at INTEGER,
  file_hash TEXT,          -- reserved for #54
  remote_version TEXT,     -- reserved for #53
  last_check_at INTEGER,   -- reserved for #53
  dirty INTEGER DEFAULT 0, -- reserved for #54
  sync_targets TEXT        -- JSON: [{ agent, path, mode: 'symlink' | 'copy' }]
);
```

### 3.2 扩展 `SkillRecord` / `Skill`

```ts
interface SkillRecord {
  // ... existing fields ...
  version?: string;
  source?: {
    type: 'github' | 'npm' | 'skillhub' | 'clawhub' | 'zip' | 'local' | 'unknown';
    url?: string;
    ref?: string;
    author?: string;
    license?: string;
    homepage?: string;
    installedAt?: number;
    updatedAt?: number;
  };
  syncTargets?: Array<{
    agent: string;
    path: string;
    mode: 'symlink' | 'copy';
  }>;
}
```

所有新增字段均为可选，保证向后兼容。

---

## 4. 主要流程

### 4.1 安装 skill 时
1. 执行现有 `downloadSkill()` 逻辑。
2. 成功后解析来源信息。
3. 写入/更新 `skill_metadata` 表。
4. 根据 Settings 中启用的 sync targets 创建软链/复制。
5. 如果目标已存在同 id 但不同来源的 skill，弹窗询问用户。
6. 如果同步失败，弹窗提示重试/跳过/取消；取消则回滚安装。
7. 返回 `SkillRecord` 给 renderer，包含 `source` 字段。

### 4.2 删除 skill 时
1. 删除用户数据目录中的 skill。
2. 从所有已同步的 Agent 目录中移除软链/复制。
3. 可选择是否保留 `skill_metadata` 记录（建议保留但标记为已删除，v1 直接删除）。

### 4.3 升级 skill 时
1. 执行现有 `performSkillUpgrade()` 逻辑。
2. 更新 `skill_metadata` 中的 `version`、`source_url`、`source_ref`、`updated_at`。
3. 重新同步到目标 Agent 目录。

### 4.4 首次启动迁移
1. 扫描所有已安装 skill。
2. 为每个 skill 插入一条 `skill_metadata` 记录，`source_type` 为 `unknown`。
3. 尝试从 `SKILL.md` frontmatter 或目录结构推断 `name` 和 `version`。

---

## 5. 跨 Agent 同步策略

### 5.1 默认目标配置

| Agent | 默认路径 |
|-------|---------|
| Claude Code | `~/.claude/skills` |
| Kimi CLI | `~/.kimi-code/skills` |
| OpenClaw | 可配置（默认 `~/.openclaw/skills`） |
| Codex CLI | 可配置（默认 `~/.codex/skills`） |
| Custom | 用户指定 |

### 5.2 同步模式选择

| 平台 | 策略 |
|------|------|
| macOS / Linux | 优先 `fs.symlink(target, linkPath, 'dir')` |
| Windows | 检测开发者模式；若可用则创建 directory symlink，否则完整复制 |

### 5.3 冲突处理

如果目标目录已存在同名 skill 目录，且不是由 WeSight 创建的软链：
1. 扫描两个目录的 `SKILL.md` 来源信息。
2. 弹窗展示："Claude Code 已存在 `xxx`，来源为 GitHub/未知。是否保留现有 / 用 WeSight 版本替换 / 跳过此 Agent？"
3. 根据用户选择执行。

---

## 6. UI/UX

### 6.1 Skill 详情弹窗
- 新增 "Source" 区域，展示：
  - Source type
  - Source URL（可点击）
  - Ref
  - Author / License / Homepage
  - Installed at / Updated at
- 新增 "Synced Agents" 列表，展示每个 Agent 的同步状态和模式（symlink/copy）。

### 6.2 Settings → Skill Sync Targets
- 列表展示所有默认 + 自定义目标。
- 每个目标显示：
  - Agent 名称
  - 路径
  - 目录是否存在
  - 启用/禁用开关
- 支持添加、编辑、删除自定义路径。
- 默认所有目标**禁用**，首次安装时引导开启。

### 6.3 首次安装引导
- 用户第一次通过 WeSight 安装 skill 时：
  - 弹出 "选择要同步的 Agent" 对话框。
  - 列出已检测到目录的 Agent。
  - 用户选择后，这些目标自动启用。
  - 提供 "以后在 Settings 中管理" 选项。

### 6.4 同步失败弹窗
- 标题："无法同步到 {Agent}"
- 内容：失败原因 + 路径
- 按钮：重试、跳过此 Agent、取消安装

---

## 7. 接口与 IPC

### 7.1 新增 IPC 通道（在 `src/shared/skills/constants.ts` 中）

```ts
export const SkillsIpcChannel = {
  // ... existing channels ...
  GetSyncTargets: 'skills:getSyncTargets',
  SetSyncTargets: 'skills:setSyncTargets',
  GetSkillMetadata: 'skills:getSkillMetadata',
  ListSkillMetadata: 'skills:listSkillMetadata',
  ResolveSyncConflict: 'skills:resolveSyncConflict',
  ReportSyncFailure: 'skills:reportSyncFailure',
  PromptFirstSyncTargets: 'skills:promptFirstSyncTargets',
  Changed: 'skills:changed',
} as const;
```

> 实施注：v1 阶段 `ResolveSyncConflict` / `ReportSyncFailure` / `PromptFirstSyncTargets` 的常量已定义；对应的 IPC handler 与渲染层对话框由后续 issue 接入。orchestrator 走 `src/main/libs/skillManager/skillSyncOrchestrator.ts` 的 `onConflict` / `onFailure` 回调。

### 7.2 主进程新增方法

`SkillManager`（`src/main/skillManager.ts`）实际暴露的与 v1 相关的 API：

```ts
class SkillManager {
  // --- metadata registry ---
  recordSkillMetadata(skillId: string, data: Partial<SkillMetadataRow>): void;
  recordSkillSyncTargets(skillId: string, entries: SkillSyncTargetEntry[]): void;
  forgetSkillMetadata(skillId: string): void;
  getSkillSourceInfo(skillId: string): SkillSource | undefined;
  getSkillMetadata(id: string): SkillMetadataRow | null;
  listSkillMetadata(): SkillMetadataRow[];
  upsertSkillMetadata(id: string, data: Partial<SkillMetadataRow>): SkillMetadataRow;
  deleteSkillMetadata(id: string): void;
  migrateLegacySkills(): { migrated: number; skipped: number };
  toSkillSource(row: SkillMetadataRow): SkillSource;
  detectSourceFromInput(input: { ... }): SkillSource;
  inferSourceFromUrl(url: string): SkillSource['type'];

  // --- sync targets ---
  getSyncTargets(): SkillSyncTarget[];
  setSyncTargets(targets: SkillSyncTarget[]): { success: boolean; error?: string };
  markSyncTargetsFirstRunPrompted(): void;
  isSyncTargetsFirstRunPrompted(): boolean;

  // --- lifecycle hooks (called by downloadSkill / deleteSkill / upgradeSkill) ---
  recordInstalledSkillSource(skillId: string, sourceInput: string): void;
  recordUpgradedSkillSource(skillId: string, sourceInput: string, version?: string): void;
}
```

跨 Agent 同步的纯函数（`src/main/skillSyncResolver.ts`）和编排器（`src/main/libs/skillManager/skillSyncOrchestrator.ts`）：

```ts
// 纯决策（无副作用）
decideSyncMode(platform?, developerMode?): SyncModeDecision;
detectConflict(targetPath, incomingSourceType, sourceDir?): ConflictDescriptor;
inspectTarget(targetPath): ExistingTargetInfo;
applySync(sourceDir, targetPath, decision, opts?): void;
removeTarget(targetPath): void;
writeMarker(targetPath, sourceType): void;
defaultTargetPath(kind, homeDir?): string;

// 编排（副作用：调用回调、写入 metadata、按需回滚）
syncSkillToTargets(skillId, sourceType, skillDir, options): Promise<SkillSyncResult>;
removeSkillFromTargets(skillId, options): void;
resyncSkillToTargets(skillId, sourceType, skillDir, options): Promise<SkillSyncResult>;
```

---

## 8. 测试策略

### 8.1 单元测试
- `skillMetadataStore.test.ts`：CRUD、迁移、字段序列化。
- `skillSyncResolver.test.ts`：
  - symlink vs copy 决策逻辑
  - Windows 开发者模式检测 mock
  - 路径冲突检测

### 8.2 集成/端到端测试
- `skillManager.sync.lifecycle.test.ts`：
  - 安装 skill → 目标目录出现软链/复制
  - 删除 skill → 目标目录清理
  - 升级 skill → 目标目录更新
  - 冲突场景 → 用户选择后被正确执行

### 8.3 手动验证
- 在 macOS 上安装 skill，验证 `~/.claude/skills` 出现软链。
- 在 Windows 上验证开发者模式/复制降级。
- 验证 bundled skills 不会被同步出去。
- 验证 marketplace 升级不受影响。

---

## 9. 里程碑与验收

### PR 合并标准
- [x] `skill_metadata` 表可用，旧 skill 成功迁移（`migrateLegacySkills()`，`isSkillMetadataMigrationComplete` 一次性 guard）。
- [x] 新安装 skill 写入来源信息（`recordInstalledSkillSource` / `recordUpgradedSkillSource`）。
- [x] 安装/删除/升级均触发同步，目标目录正确创建/清理/更新（`syncSkillToTargets` / `removeSkillFromTargets` 钩入生命周期）。
- [ ] 冲突和失败场景有弹窗处理（orchestrator 回调已就绪，对话框与取消回滚的 IPC handler 后续接入）。
- [x] UI 展示来源和同步目标（`SkillSourceInfo` + `SkillSyncedAgents` 在 `SkillsManager` 详情弹窗中）。
- [x] Settings 可管理同步目标（`SyncTargetsSettingsView` 列表/编辑/添加/删除）。
- [x] 新增单元测试 + 生命周期集成测试通过（85 项 skill 相关测试通过）。
- [x] 现有测试不回归。
- [x] 代码通过 `npm run lint`（仅有 3 处与本次工作无关的 simple-import-sort 旧问题）。

---

## 10. 扩展路线图

| 阶段 | Issue | 内容 |
|------|-------|------|
| v1 | #52 | 本 PRD：registry + 来源 + 跨 Agent 同步 |
| v2 | #53 | 基于 registry 的远程版本检查和用户确认升级 |
| v3 | #54 | 本地修改检测 + skill 导入/导出/集合包 |
| v4 | #55 | 可配置仓库和市场聚合 |
| v5 | #56 | 可扩展安全扫描和报告历史 |

---

## 11. 待确认事项（PRD 定稿前）

1. **已删除 skill 的元数据历史**：v1 直接删除（`deleteSkill` 调用 `forgetSkillMetadata`），不保留历史；如未来需要审计/恢复，再迁回单独的历史表。
2. **首次安装引导覆盖范围**：`firstRunPrompted` 是按 sync-target 维度跟踪的；用户首次设置/写入目标即标记为已提示，marketplace 安装走相同 `downloadSkill` 路径，复用同一引导。
3. **自定义 Agent 路径**：`setSyncTargets` 接受用户输入的绝对路径字符串；不做 `$HOME` 等环境变量展开（`buildDefaultSyncTargetsState` 在初始化时一次性基于 `os.homedir()` 落盘具体路径）。
4. **`source_type: 'unknown'` 的 UI 标识**：UI 通过 `SkillSourceInfo` 展示 `sourceType`，renderer 不再额外加 badge；用户在 Settings 中可手动删除重建或重新 `downloadSkill` 时覆盖。
