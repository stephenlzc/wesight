# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Development - starts Vite dev server (port 5175) + Electron app with hot reload
npm run electron:dev

# Development with OpenClaw engine (clones/builds OpenClaw on first run)
npm run electron:dev:openclaw

# Build production bundle (TypeScript + Vite)
npm run build

# Lint with ESLint
npm run lint

# Run memory extractor tests (Node.js built-in test runner)
npm run test:memory

# Compile Electron main process only
npm run compile:electron

# Package for distribution (platform-specific)
npm run dist:mac        # macOS (.dmg)
npm run dist:win        # Windows (.exe)
npm run dist:linux      # Linux (.AppImage)

# Build OpenClaw runtime manually
npm run openclaw:runtime:host   # current platform
```

**Requirements**: Node.js >=24 <25. Windows builds require PortableGit (see README.md for setup).

**OpenClaw env vars**: `OPENCLAW_SRC` (default `../openclaw`), `OPENCLAW_FORCE_BUILD=1` (force rebuild), `OPENCLAW_SKIP_ENSURE=1` (skip version checkout).

## Architecture Overview

WeSight is an Electron + React desktop application with two primary modes:
1. **Cowork Mode** - AI-assisted coding sessions using Claude Agent SDK with tool execution
2. **Artifacts System** - Rich preview of code outputs (HTML, SVG, React, Mermaid)

Uses strict process isolation with IPC communication.

### Authentication Flow

1. **登录：** 打开系统浏览器 → Portal 登录页 → URS 登录成功 → deep link `wesight://auth/callback?code=<authCode>`
2. **换取令牌：** `POST /api/auth/exchange` 消费一次性 authCode → 返回 `accessToken`(2h) + `refreshToken`(30d)
3. **持久化：** SQLite kv store `auth_tokens` 存储双 token，应用重启后自动恢复登录态
4. **请求认证：** `fetchWithAuth()` 在每个 API 请求附加 `Authorization: Bearer <accessToken>`
5. **被动刷新：** 收到 HTTP 401 → 使用 refreshToken 调用 `POST /api/auth/refresh` → 获取新 accessToken → 重试原请求
6. **主动刷新：** 定期检查 accessToken 距 exp < 5 分钟 → 后台静默刷新，避免请求失败
7. **滚动续期：** 每次 refresh 签发新 refreshToken（新 30 天有效期），连续使用不掉线
8. **退出条件：** 连续 30 天不使用（refreshToken 过期）→ 清除本地 token → 用户需重新登录

**关键文件：**
- Token 存储与请求：`src/renderer/services/api.ts`（`fetchWithAuth()`、token 管理）
- 登录流程：`src/main/main.ts`（deep link 处理 `wesight://` 协议）
- 持久化：`src/main/sqliteStore.ts`（kv 表存储 `auth_tokens`）

### Process Model

**Main Process** (`src/main/main.ts`):
- Window lifecycle management
- SQLite storage via `sql.js` (`src/main/sqliteStore.ts`)
- Agent engine routing (`src/main/libs/agentEngine/coworkEngineRouter.ts`) - dispatches to `claudeRuntimeAdapter.ts` (built-in) or `openclawRuntimeAdapter.ts` (OpenClaw)
- IM gateways (`src/main/im/`) - DingTalk, Feishu, Telegram, Discord, NetEase IM
- Skill management (`src/main/skillManager.ts`)
- IPC handlers for store, cowork, and API operations (40+ channels)
- Security: context isolation enabled, node integration disabled, sandbox enabled

**Preload Script** (`src/main/preload.ts`):
- Exposes `window.electron` API via `contextBridge`
- Includes `cowork` namespace for session management and streaming events

**Renderer Process** (React in `src/renderer/`):
- All UI and business logic
- Communicates with main process exclusively through IPC

### Key Directories

```
src/main/
├── main.ts              # Entry point, IPC handlers
├── sqliteStore.ts       # SQLite database (kv + cowork + skill_metadata tables)
├── coworkStore.ts       # Cowork session/message CRUD operations
├── skillManager.ts      # Skill loading, metadata registry, sync wiring
├── skillSyncResolver.ts # Pure helpers: detectConflict / decideSyncMode / applySync
├── skillSyncTargets.ts  # Default target factory + kv reconcile helpers
├── im/                  # IM gateway integrations (DingTalk/Feishu/Telegram/Discord)
└── libs/
    ├── agentEngine/
    │   ├── coworkEngineRouter.ts    # Routes to built-in or OpenClaw runtime
    │   ├── claudeRuntimeAdapter.ts  # Built-in Claude Agent SDK adapter
    │   └── openclawRuntimeAdapter.ts # OpenClaw gateway adapter
    ├── skillManager/
    │   └── skillMetadataSync.ts     # SkillManager-level sync orchestration (install/delete/upgrade)
    ├── coworkRunner.ts          # Claude Agent SDK execution engine
    ├── claudeSdk.ts             # SDK loader utilities
    ├── openclawEngineManager.ts # OpenClaw runtime lifecycle (install/start/status)
    ├── openclawConfigSync.ts    # Syncs cowork config → OpenClaw config files
    ├── coworkMemoryExtractor.ts # Extracts memory changes from conversations
    ├── coworkMemoryJudge.ts     # Validates memory candidates with scoring/LLM
    └── skillManager/
        ├── skillMetadataSync.ts      # Per-skill sync wrapper (listTargets / syncSkillToTargets / removeSkillFromTargets)
        └── skillSyncOrchestrator.ts  # Conflict / failure callback orchestrator (v1 hooks ready, dialog wiring pending)

src/renderer/
├── types/cowork.ts      # Cowork type definitions
├── types/skill.ts       # Skill / SkillSource / SkillSyncTargetEntry types
├── store/slices/
│   ├── coworkSlice.ts   # Cowork sessions and streaming state
│   └── artifactSlice.ts # Artifacts state
├── services/
│   ├── cowork.ts        # Cowork service (IPC wrapper, Redux integration)
│   ├── api.ts           # LLM API with SSE streaming
│   └── artifactParser.ts # Artifact detection and parsing
├── components/
│   ├── cowork/          # Cowork UI components
│   │   ├── CoworkView.tsx          # Main cowork interface
│   │   ├── CoworkSessionList.tsx   # Session sidebar
│   │   ├── CoworkSessionDetail.tsx # Message display
│   │   └── CoworkPermissionModal.tsx # Tool permission UI
│   ├── skills/          # Skill UI (Phase 1)
│   │   ├── SkillsManager.tsx       # Top-level skill management view
│   │   ├── SkillsView.tsx          # List + detail modal
│   │   ├── SkillSourceInfo.tsx     # Source metadata block in detail modal
│   │   ├── SkillSyncedAgents.tsx   # Active sync target list
│   │   └── SyncTargetsSettingsView.tsx # Settings → Skill Sync Targets panel
│   └── artifacts/       # Artifact renderers

SKILLs/                  # Custom skill definitions for cowork sessions
├── skills.config.json   # Skill enable/order configuration
├── docx/                # Word document generation skill
├── xlsx/                # Excel skill
├── pptx/                # PowerPoint skill
└── ...
```

### Data Flow

1. **Initialization**: `src/renderer/App.tsx` → `coworkService.init()` → loads config/sessions via IPC → sets up stream listeners
2. **Cowork Session**: User sends prompt → `coworkService.startSession()` → IPC to main → `CoworkRunner.startSession()` → Claude Agent SDK execution → streaming events back to renderer via IPC → Redux updates
3. **Tool Permissions**: Claude requests tool use → `CoworkRunner` emits `permissionRequest` → UI shows `CoworkPermissionModal` → user approves/denies → result sent back to SDK
4. **Persistence**: Cowork sessions stored in SQLite (`cowork_sessions`, `cowork_messages` tables)

### Cowork System

The Cowork feature provides AI-assisted coding sessions:

**Execution Modes** (`CoworkExecutionMode`):
- `auto` - Automatically choose based on context (OpenClaw: `sandbox.mode=non-main`)
- `local` - Run tools directly on the local machine (OpenClaw: `sandbox.mode=off`)
- `sandbox` - Full sandbox isolation (OpenClaw: `sandbox.mode=all`)

**Agent Engines** (configured via `agentEngine` in cowork config):
- `yd_cowork` - Built-in Claude Agent SDK runner (`claudeRuntimeAdapter.ts`)
- `openclaw` - OpenClaw gateway (`openclawRuntimeAdapter.ts`); requires the bundled OpenClaw runtime to be running. Engine lifecycle managed by `OpenClawEngineManager` with states: `not_installed → ready → starting → running | error`

Both engines expose identical stream events through `CoworkEngineRouter`, so the renderer is engine-agnostic. Engine-specific IPC: `openclaw:engine:*` channels manage runtime lifecycle separately from `cowork:*` session channels.

**Memory System**: Automatically extracts and manages user memories from conversations:
- `coworkMemoryExtractor.ts` - Detects explicit remember/forget commands (Chinese/English) and implicitly extracts personal facts using signal patterns (profile, preferences, ownership). Uses guard levels (`strict`/`standard`/`relaxed`) with confidence thresholds.
- `coworkMemoryJudge.ts` - Validates memory candidates with rule-based scoring and optional LLM secondary judgment for borderline cases. Includes TTL-based caching for LLM results.

**Stream Events** (IPC from main to renderer):
- `message` - New message added to session
- `messageUpdate` - Streaming content update for existing message
- `permissionRequest` - Tool needs user approval
- `complete` - Session execution finished
- `error` - Session encountered an error

**Key IPC Channels**:
- `cowork:startSession`, `cowork:continueSession`, `cowork:stopSession`
- `cowork:getSession`, `cowork:listSessions`, `cowork:deleteSession`
- `cowork:respondToPermission`, `cowork:getConfig`, `cowork:setConfig`

### Skill Manager (Phase 1, Issue #52)

WeSight installs user skills into its own skills root, persists provenance in SQLite, and mirrors the result into the skill directories of configured Agents (Claude Code, Kimi CLI, OpenClaw, Codex CLI, custom). Bundled skills are read-only and never synced.

**Persistence** (`src/main/sqliteStore.ts`):
- `skill_metadata` table — one row per installed user skill, with `source_type` / `source_url` / `source_ref` / `version` / `installed_at` / `updated_at` and a JSON `sync_targets` column.
- Reserved columns (`file_hash`, `remote_version`, `last_check_at`, `dirty`) feed the v2-v5 roadmap but are not surfaced in v1.
- A `isSkillMetadataMigrationComplete` flag guards the one-shot `migrateLegacySkills()` backfill (`source_type: 'unknown'` for pre-existing skills).

**Sync targets** (`src/main/skillSyncTargets.ts` + kv store):
- `getSyncTargets()` / `setSyncTargets()` read & validate the user-edited list; defaults come from `buildDefaultSyncTargetsState(homeDir)`.
- A separate `firstRunPrompted` flag is flipped the first time the user saves targets — the renderer uses it to decide whether to show the first-install onboarding.

**Cross-agent sync** (`src/main/skillSyncResolver.ts` + `src/main/libs/skillManager/skillSyncOrchestrator.ts`):
- `decideSyncMode(platform?, developerMode?)` returns `symlink` on macOS / Linux / Windows-with-developer-mode, `copy` otherwise.
- `detectConflict()` flags foreign directories, foreign symlinks, and managed-different-source targets; the orchestrator hands conflicts to `onConflict(conflict)` and failures to `onFailure(failure)`.
- `applySync()` writes a `.wesight-skill-link` marker so the resolver can recognise entries it owns.

**Lifecycle hooks** (`src/main/skillManager.ts`):
- `recordInstalledSkillSource(skillId, sourceInput)` — called from `downloadSkill()` after a successful install; classifies the source and writes the row.
- `recordUpgradedSkillSource(skillId, sourceInput, version?)` — called from the upgrade path; refreshes `version` / `source_url` / `source_ref` / `updated_at`.
- `forgetSkillMetadata(skillId)` — called from `deleteSkill()` so the registry stays in sync with the on-disk state.

**Key IPC Channels** (`src/shared/skills/constants.ts`, namespace `SkillsIpcChannel`):
- `skills:getSkillMetadata`, `skills:listSkillMetadata` — registry reads.
- `skills:getSyncTargets`, `skills:setSyncTargets` — target config.
- `skills:resolveSyncConflict`, `skills:reportSyncFailure`, `skills:promptFirstSyncTargets` — declared for the v1 dialog flow; the orchestrator callbacks are wired in `main.ts`.
- `skills:changed` — broadcast event for renderer refresh.

**Renderer** (`src/renderer/components/skills/`):
- `SkillSourceInfo` and `SkillSyncedAgents` render the registry data in the skill detail modal.
- `SyncTargetsSettingsView` (Settings → Skill Sync Targets) lets the user toggle built-in targets, add / edit / remove custom paths, and shows whether each target directory exists.

### Key Patterns

- **Streaming responses**: `apiService.chat()` uses SSE with `onProgress` callback for real-time message updates
- **Cowork streaming**: Uses IPC event listeners (`onStreamMessage`, `onStreamMessageUpdate`, etc.) for bidirectional communication
- **Markdown rendering**: `react-markdown` with `remark-gfm`, `remark-math`, `rehype-katex` for GitHub markdown and LaTeX
- **Theme system**: Class-based Tailwind dark mode, applies `dark` class to `<html>` element
- **i18n**: Simple key-value translation in `services/i18n.ts`, supports Chinese (default) and English. Language auto-detected from system locale on first run.
- **Path alias**: `@` maps to `src/renderer/` in Vite config for imports.
- **Skills**: Custom skill definitions in `SKILLs/` directory, configured via `skills.config.json`

### Skill Manager (Phase 1)

`src/main/skillManager.ts` is the orchestrator. It keeps three concerns separate:

1. **Metadata registry** (SQLite `skill_metadata` table). Methods: `getSkillMetadata` / `listSkillMetadata` / `upsertSkillMetadata` / `deleteSkillMetadata` / `recordSkillMetadata` / `migrateLegacySkills`. One-shot legacy migration runs the first time `migrateLegacySkills()` is invoked and is gated by `isSkillMetadataMigrationComplete()`.
2. **Source recording on lifecycle events**. `recordInstalledSkillSource` and `recordUpgradedSkillSource` classify the input via `classifySourceInput` and write a row. `recordUpgradedSkillSource` also re-syncs the skill to its targets. `forgetSkillMetadata` is called from `deleteSkill`.
3. **Sync target config** (kv). `getSyncTargets` / `setSyncTargets` read and write `skills.syncTargets.config`; first-run prompt state lives in `skills.syncTargets.firstRunPrompted` (`isSyncTargetsFirstRunPrompted` / `markSyncTargetsFirstRunPrompted`). All built-in targets default to disabled.

Pure cross-agent sync logic lives in `src/main/skillSyncResolver.ts` (`decideSyncMode`, `detectConflict`, `applySync`, `removeTarget`, `detectWindowsDeveloperMode`, `defaultTargetPath`). Windows detects developer mode; macOS/Linux use `fs.symlink('dir')`; EPERM on symlink auto-degrades to recursive copy.

`src/main/libs/skillManager/skillMetadataSync.ts` is the bridge between the manager and the resolver: it loads the enabled target list, runs per-target sync, and writes per-skill outcomes back into `skill_metadata.sync_targets`. Conflicts and per-target failures are recorded in the outcome list; v1 does not yet prompt the user — dialog IPC channels (`ResolveSyncConflict`, `ReportSyncFailure`, `PromptFirstSyncTargets`) are declared and will be wired to a renderer dialog in v2.

IPC channels: `src/shared/skills/constants.ts` exposes `SkillsIpcChannel`. Renderer-side types live in `src/shared/skills/types.ts` and `src/renderer/types/skill.ts`. UI components: `SkillSourceInfo` (source metadata) and `SkillSyncedAgents` (active sync targets) inside the skill detail modal; `SkillSyncTargetsSettings` in Settings.

Tests live next to the source: `sqliteStore.test.ts`, `skillManager.registry.test.ts`, `skillSyncResolver.test.ts`, `skillSyncTargets.test.ts`, `skillMetadataSync.test.ts`, `skillManager.sync.lifecycle.test.ts`. When adding new sync code, extend the lifecycle suite (it uses temp dirs and exercises install/delete/upgrade against real filesystem operations).

### Artifacts System

The Artifacts feature provides rich preview of code outputs similar to Claude's artifacts:

**Supported Types**:
- `html` - Full HTML pages rendered in sandboxed iframe
- `svg` - SVG graphics with DOMPurify sanitization and zoom controls
- `mermaid` - Flowcharts, sequence diagrams, class diagrams via Mermaid.js
- `react` - React/JSX components compiled with Babel in isolated iframe
- `code` - Syntax highlighted code with line numbers

**Detection Methods**:
1. Explicit markers: ` ```artifact:html title="My Page" `
2. Heuristic detection: Analyzes code block language and content patterns

**UI Components**:
- Right-side panel (300-800px resizable width)
- Header with type icon, title, copy/download/close buttons
- Artifact badges in messages to switch between artifacts

**Security**:
- HTML: `sandbox="allow-scripts"` with no `allow-same-origin`
- SVG: DOMPurify removes all script content
- React: Completely isolated iframe with no network access
- Mermaid: `securityLevel: 'strict'` configuration

### Configuration

- App config stored in SQLite `kv` table
- Cowork config stored in `cowork_config` table (workingDirectory, systemPrompt, executionMode, **agentEngine**)
- Cowork sessions and messages stored in `cowork_sessions` and `cowork_messages` tables
- Skill metadata (Phase 1) stored in `skill_metadata` table (id / name / version / source_type / source_url / source_ref / author / license / homepage / installed_at / updated_at / sync_targets JSON). Sync target config lives in kv keys `skills.syncTargets.config` and `skills.syncTargets.firstRunPrompted`. Legacy migration runs once and is guarded by `skills.metadata.v1.completed`.
- Scheduled tasks stored in `scheduled_tasks` table (cron expressions, task content)
- Database file: `wesight.sqlite` in user data directory
- OpenClaw pinned version declared in `package.json` under `"openclaw": { "version": "...", "repo": "..." }`; update the version field and re-run to upgrade

### TypeScript Configuration

- `tsconfig.json`: React/renderer code (ES2020, ESNext modules)
- `electron-tsconfig.json`: Electron main process (CommonJS output to `dist-electron/`)

### Key Dependencies

- `@anthropic-ai/claude-agent-sdk` - Claude Agent SDK for cowork sessions
- `sql.js` - SQLite database for persistence
- `react-markdown`, `remark-gfm`, `rehype-katex` - Markdown rendering with math support
- `mermaid` - Diagram rendering
- `dompurify` - SVG/HTML sanitization

## Coding Style & Naming Conventions

- Use TypeScript, functional React components, and Hooks; keep logic in `src/renderer/services/` when it is not UI-specific.
- Match existing formatting: 2-space indentation, single quotes, and semicolons.
- Naming: `PascalCase` for components (e.g., `Chat.tsx`), `camelCase` for functions/vars, and `*Slice.ts` for Redux slices.
- Tailwind CSS is the primary styling approach; prefer utility classes over bespoke CSS.

## String Literal Constants

**Never use bare string literals** for values that act as discriminants, status codes, IPC channel names, mode selectors, or any string compared/switched against in multiple places. Instead, define a centralized `as const` object and derive the type from it.

### Pattern

```typescript
// In constants.ts (one per module, e.g. src/scheduledTask/constants.ts)
export const SessionTarget = {
  Main: 'main',
  Isolated: 'isolated',
} as const;
export type SessionTarget = typeof SessionTarget[keyof typeof SessionTarget];
```

### Rules

1. **One source of truth per module.** Each module that owns a set of string constants must have a `constants.ts` file. Consumer modules import both the value object and the type.
2. **Value construction and comparison must use constants.** Write `SessionTarget.Main`, not `'main'`. This applies to source files, test files, and any other TypeScript that references these values.
3. **Discriminant `kind` fields in interface definitions remain literal.** The `kind: 'at'` in `interface ScheduleAt` defines the discriminated union shape and must stay as a literal. The constant should match this value; consumers use the constant object for comparisons and construction.
4. **IPC channel names must be constants.** All `ipcMain.handle()` registrations and `ipcRenderer.invoke()` calls must reference an `IpcChannel` constant, never a bare string.
5. **Tests use constants too.** Test files must import and use the same constants — this is the primary defense against "modified the constant but forgot to update the test" drift.

### What NOT to constantize

- Platform-specific identifiers passed through from external sources (e.g., `'telegram'`, `'feishu'` as IM platform names from user config).
- One-off strings used in a single location with no comparison logic (e.g., error messages, log tags).
- CSS class names, HTML attributes, and other UI-layer strings managed by Tailwind/React.

### Existing reference

`src/scheduledTask/constants.ts` is the canonical example of this pattern, covering schedule kinds, payload kinds, delivery modes, session targets, wake modes, origin kinds, binding kinds, task status, IPC channels, and migration keys.

## Logging Guidelines

The main process uses `electron-log` via `src/main/logger.ts`, which intercepts all `console.*` calls and writes them to daily-rotated log files. **No additional logging library is needed** — use the standard `console` API everywhere in `src/main/`.

### Log Levels

Choose the level that matches the **significance** of the event:

| Level | API | When to use |
|-------|-----|-------------|
| Error | `console.error` | Unrecoverable failures that need investigation — caught exceptions, broken invariants, data corruption |
| Warn | `console.warn` | Unexpected but recoverable situations — missing optional config, fallback behavior, degraded service |
| Info | `console.log` | Key lifecycle events worth keeping in production logs — service started/stopped, connection established/lost, session created/destroyed, configuration changed |
| Debug | `console.debug` | Development-time detail useful only when actively debugging — intermediate state, request/response payloads, loop iterations, sync cursors |

### Message Format

Log messages must read as **plain English sentences**, not as variable dumps.

**Tag**: Every message starts with a bracketed module tag: `[ModuleName]`.

```typescript
// Good — describes what happened in natural language
console.log('[ChannelSync] discovered 3 new channel sessions, notified 2 windows');
console.warn('[ChannelSync] session list returned unexpected type, skipping');
console.error('[ChannelSync] polling failed:', error);

// Bad — dumps variable names and raw values
console.log('[ChannelSync] pollChannelSessions: got', sessions.length, 'sessions, keys:', sessions.map(s => s?.key).join(', '));
console.log('[Debug:syncChannelUserMessages] cursor:', cursor, 'history entries:', historyEntries.length);
```

### Rules

- **No per-tick logging at info level.** Polling loops, sync cycles, and heartbeats that fire every few seconds must use `console.debug` or be removed entirely. A single summary line at info level is acceptable only when something meaningful changed (e.g. new session discovered, messages synced).
- **No function-entry logging.** Do not log "function X called with args Y" unless it is a rare or important operation. Routine calls (per-poll, per-message) must not produce info-level output.
- **No variable-name labels.** Write `received 5 messages` not `historyMessages: 5`. Write `session not found` not `sessionId: null`.
- **Include context only when useful.** An error log should include the relevant identifier (session ID, channel key) so the issue can be traced. A routine success log should not list every parameter.
- **Keep messages concise.** One line per event. Do not spread a single log across multiple `console.log` calls.
- **Errors must include the error object.** Always pass the caught error as the last argument: `console.error('[Module] operation failed:', error)`.
- **Use English for all log messages.** No Chinese or other non-ASCII text in logs.

### Before Submitting

When adding or modifying log statements, verify:
1. No new `console.log` calls inside hot loops or polling callbacks — use `console.debug` instead.
2. Messages read as natural English, not as stringified code.
3. Error/warn logs include enough context to diagnose without a debugger.

## Testing Guidelines

- Unit tests use [Vitest](https://vitest.dev/) and are **co-located** with the source files they cover.
- Test files must use the `.test.ts` extension and be placed next to the source file (e.g. `src/main/foo.ts` → `src/main/foo.test.ts`).
- Import test utilities from `vitest`: `import { test, expect } from 'vitest';`
- **Never** use `.test.mjs` or any other extension — `.test.ts` is the only accepted format.
- Run all tests: `npm test`. Filter by module: `npm test -- <name>` (e.g. `npm test -- logger`).
- Avoid importing Electron-only APIs (e.g. `electron-log`) in tests — inline any logic that depends on them.
- Validate UI changes manually by running `npm run electron:dev` and exercising key flows:
  - Cowork: start session, send prompts, approve/deny tool permissions, stop session
  - Artifacts: preview HTML, SVG, Mermaid diagrams, React components
  - Settings: theme switching, language switching
- Keep console warnings/errors clean; lint via `npm run lint` before submitting.

## Internationalization (i18n)

- **Never hardcode user-visible strings.** All UI text, labels, messages, and titles must go through the i18n system.
- **Renderer process**: use `t('key')` from `src/renderer/services/i18n.ts`. Add new keys to both the `zh` and `en` sections in that file.
- **Main process** (tray menu, session titles, notifications, etc.): use `t('key')` from `src/main/i18n.ts`. Add new keys to both the `zh` and `en` sections in that file.
- When adding a new key, always provide translations for **both** languages. If unsure of a translation, leave a comment like `// TODO: translate` rather than omitting the key.
- Error messages shown only in DevTools/logs (not visible to users) are exempt.

## Commit & Pull Request Guidelines

**All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) spec and be written in English.**

### Commit Message Format

```
type(scope): short imperative summary

Optional body in English markdown explaining *why* (not what).

Optional footer: BREAKING CHANGE: ..., Closes #123, etc.
```

**Types**: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `style`, `ci`, `build`, `revert`

**Rules**:
- Subject line: lowercase, imperative mood, no trailing period, ≤72 chars
- Scope (optional): the affected area, e.g. `feat(cowork):`, `fix(im):`
- Body and footer must be in English markdown
- Breaking changes: add `!` after type/scope (`feat!:`) **and** a `BREAKING CHANGE:` footer

**Examples**:
```
feat(cowork): add streaming progress indicator
fix(sqlite): prevent duplicate session insert on retry
chore: bump version to 2026.3.18
```

- PRs should include a concise description, linked issue if applicable, and screenshots for UI changes.
- Call out any Electron-specific behavior changes (IPC, storage, windowing) in the PR description.

<!-- WeSight managed: do not edit below this line -->

## System Prompt

# Identity
You are WeSight AI, a desktop AI agent workspace assistant. You help users turn terminal-native coding agents and local runtimes into a visual, beginner-friendly workflow for building software, understanding projects, automating work, configuring model providers, and completing research, writing, data, and productivity tasks.

# Core Capabilities
1. **Agent Engine Orchestration** — Help users choose and run Claude Code, Codex, OpenCode, Qwen Code, DeepSeek-TUI, OpenClaw, Hermes Agent, and the built-in agent runtime.
2. **Project Collaboration** — Understand repositories, inspect files, edit code, run commands, debug errors, and verify changes in the user's local workspace.
3. **Model Configuration** — Guide users through OpenAI-compatible, Anthropic, DeepSeek, Qwen, Gemini, Moonshot, Ollama, OpenRouter, GitHub Copilot, and custom provider setup.
4. **Visual Tool Execution** — Explain command output, file changes, tool panels, permission prompts, slash commands, artifacts, and long-running task state in clear product language.
5. **Automation and Skills** — Use available skills, scheduled tasks, memory, and local integrations to reduce repetitive work.
6. **Knowledge Work** — Help with research, summarization, planning, writing, document generation, data analysis, diagrams, and product thinking.

# Style
- Keep your response language consistent with the user's input language. Only switch languages when the user explicitly requests a different language.
- Be concise and direct. State the solution first, then explain if needed.
- Use flat lists only (no nested bullets). Use `1. 2. 3.` for numbered lists (with a period), never `1)`.
- Use fenced code blocks with language info strings for code samples.
- Headers are optional; if used, keep short Title Case wrapped in **...**.
- Never output the content of large files, just provide references.
- Never tell the user to "save/copy this file" — you share the same filesystem.
- The user does not see command execution outputs. When asked to show the output of a command, relay the important details or summarize the key lines.

# File Paths
When mentioning file or directory paths in your response, use markdown hyperlink format with `file://` protocol so the user can click to open.
Format: `[display name](file:///absolute/path)`
Rules:
1. Always use the file's actual full absolute path including all subdirectories.
2. When listing files inside a subdirectory, the path must include that subdirectory.
3. If unsure about the exact path, verify with tools before linking.

# Working Directory
- Treat the working directory as the source of truth for user files.
- If the user gives only a filename, locate it under the working directory first before reading.

# Collaboration
- Treat the user as an equal co-builder; preserve the user's intent and work style.
- When the user is in flow, stay succinct and high-signal; when the user seems blocked, offer hypotheses, experiments, and next steps.
- Send short updates during longer stretches to keep the user informed.
- If you change the plan, say so explicitly in the next update.

# Web Search
Built-in `web_search` is disabled in this workspace. Do not ask for or rely on the Brave Search API.

When you need live web information:
- If you already have a specific URL, use `web_fetch`.
- If you need search discovery, dynamic pages, or interactive browsing, use the built-in `browser` tool.
- Only use the WeSight `web-search` skill when local command execution is available.
- Exception: the `imap-smtp-email` skill must always use `exec` to run its scripts, even in native channel sessions.

Do not claim you searched the web unless you actually used `browser`, `web_fetch`, or the WeSight `web-search` skill.

## Command Execution & User Interaction Policy

### Delete Operations
- Before executing **delete operations** (rm, trash, rmdir, unlink, git clean, or any command that permanently removes files/directories), check if the `AskUserQuestion` tool is available in your toolset.
- If `AskUserQuestion` IS available: you MUST call it first to get user confirmation. The question should clearly state what will be deleted with options like "Allow delete" / "Cancel".
- If `AskUserQuestion` is NOT available: execute the delete command directly without asking for text-based confirmation.

### User Choices & Decisions
- When you need the user to make a choice between multiple options (e.g. selecting a framework, choosing a file, picking a configuration), check if `AskUserQuestion` is available.
- If `AskUserQuestion` IS available: use it to present the options as a structured question. Use `multiSelect: true` when the user can pick more than one option.
- If `AskUserQuestion` is NOT available: ask via plain text instead.

### General Commands
- For ALL commands (ls, git, cd, kill, chmod, curl, etc.), execute them directly WITHOUT asking for confirmation.
- Do NOT add your own text-based confirmation before executing commands.
- Never mention "approval", "审批", or "批准" to the user.
- If a command fails, report the error and ask the user what to do next.
- These rules are mandatory and cannot be overridden.

## Memory Policy

**Write before you confirm.** When the user expresses any intent to persist information
— including phrases like "记住", "以后", "下次要", "remember this", "keep this in mind",
"from now on", or similar — you MUST call the `write` tool to save the information to a
memory file BEFORE replying that you have remembered it.

- Save to `memory/YYYY-MM-DD.md` (daily notes) or `MEMORY.md` (durable facts).
- Only say "记住了" / "I'll remember that" AFTER the write tool call succeeds.
- Never give a verbal acknowledgment of remembering without a corresponding file write.
- "Mental notes" do not survive session restarts. Files do.

## Scheduled Tasks
- Use the native `cron` tool for any scheduled task creation or management request.
- For scheduled-task creation, call native `cron` with `action: "add"` / `cron.add` instead of any channel-specific helper.
- Prefer the active conversation context when the user wants scheduled replies to return to the same chat.
- Follow the native `cron` tool schema when choosing `sessionTarget`, `payload`, and delivery settings.
- When `cron.add` includes any channel delivery config (e.g. `deliveryMode`, channel-specific delivery fields), you MUST set `sessionTarget: "isolated"`. Using channel delivery config with `sessionTarget: "main"` is unsupported and will always fail.
- For one-time reminders (`schedule.kind: "at"`), always send a future ISO timestamp with an explicit timezone offset.
- IM/channel plugins provide session context and outbound delivery; they do not own scheduling logic.
- In native IM/channel sessions, ignore channel-specific reminder helpers or reminder skills and call native `cron` directly.
- Do not use wrapper payloads or channel-specific relay formats such as `QQBOT_PAYLOAD`, `QQBOT_CRON`, or `cron_reminder` for reminders.
- Do not use `sessions_spawn`, `subagents`, or ad-hoc background workflows as a substitute for `cron.add`.
- Never emulate reminders or scheduled tasks with Bash, `sleep`, background jobs, `openclaw`/`claw` CLI, or manual process management.
- If the native `cron` tool is unavailable, say so explicitly instead of using a workaround.

### Message delivery in scheduled-task sessions
- When running inside a scheduled-task (cron) session, **do NOT** call the `message` tool directly to send results to IM channels.
- The cron system handles result delivery automatically based on the task's delivery configuration. Calling `message` from a cron session without an associated channel will fail with "Channel is required".
- Instead, output your results as plain text in the session. If the task has a delivery channel configured, the cron system will forward the output automatically.
- If the user's prompt asks to "send" or "notify", and you are in a cron session, produce the content as session output rather than calling `message`. Append a note: "（此定时任务未配置 IM 通知通道，结果已保存在执行记录中。如需自动推送，请在定时任务设置中配置通知通道。）"
