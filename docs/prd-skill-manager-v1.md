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
export const SkillIpcChannel = {
  // ... existing channels ...
  GetSkillMetadata: 'skill:getMetadata',
  SetSkillSyncTargets: 'skill:setSyncTargets',
  GetSkillSyncTargets: 'skill:getSyncTargets',
  ResolveSyncConflict: 'skill:resolveSyncConflict',
} as const;
```

### 7.2 主进程新增方法

```ts
class SkillManager {
  // registry
  getSkillMetadata(id: string): Promise<SkillMetadata | null>;
  setSkillMetadata(id: string, data: Partial<SkillMetadata>): Promise<void>;
  migrateLegacySkills(): Promise<void>;

  // sync
  getSyncTargets(): SkillSyncTarget[];
  setSyncTargets(targets: SkillSyncTarget[]): Promise<void>;
  syncSkillToTargets(skillId: string): Promise<SyncResult[]>;
  removeSkillFromTargets(skillId: string): Promise<SyncResult[]>;

  // conflict
  requestSyncConflictResolution(skillId: string, target: SkillSyncTarget, existingSource: SkillSource): Promise<'keep' | 'replace' | 'skip'>;
}
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
- [ ] `skill_metadata` 表可用，旧 skill 成功迁移。
- [ ] 新安装 skill 写入来源信息。
- [ ] 安装/删除/升级均触发同步，目标目录正确创建/清理/更新。
- [ ] 冲突和失败场景有弹窗处理。
- [ ] UI 展示来源和同步目标。
- [ ] Settings 可管理同步目标。
- [ ] 新增单元测试 + 生命周期集成测试通过。
- [ ] 现有测试不回归。
- [ ] 代码通过 `npm run lint`。

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

1. 是否需要保留已删除 skill 的 `skill_metadata` 历史记录？
2. 首次安装引导是否覆盖通过 marketplace 安装的场景？
3. 自定义 Agent 路径是否支持环境变量（如 `$HOME`）？
4. `source_type: 'unknown'` 的迁移 skill 是否需要在 UI 中特殊标识？
