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

---

## 问题
目前 marketplace 只限于 SkillHub/ClawHub。用户希望像包管理器一样，添加自定义 GitHub 仓库或精选列表作为 skill 来源。

## 目标
1. 新增 "Repositories" 设置区：
   - 内置精选仓库（例如 Anthropic 官方 skills）
   - 用户自定义 GitHub 仓库或原始 JSON index URL
   - 每个仓库可单独启用/禁用
2. 仓库索引格式（v1）：
   ```json
   {
     "version": 1,
     "skills": [
       { "id": "...", "name": "...", "version": "...", "source": { "type": "github", "url": "...", "ref": "..." } }
     ]
   }
   ```
3. Marketplace UI 聚合所有启用仓库 + 远程 marketplace 的 skill。
4. "扫描仓库" 操作刷新索引。

## 验收标准
- [ ] UI 支持仓库设置的增删改查。
- [ ] 支持索引获取和缓存。
- [ ] Marketplace 列表按 id 去重，优先展示高优先级来源。
- [ ] 针对索引解析和合并逻辑补充测试。
