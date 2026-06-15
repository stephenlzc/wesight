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

---

## 问题
安装时已经执行了安全扫描，但规则是硬编码的，报告是临时的，用户也无法调整严重级别或查看历史扫描结果。

## 目标
1. 将规则定义移到用户数据目录下的可配置 JSON/YAML 文件。
2. 支持严重级别和按来源覆盖规则。
3. 将扫描报告按时间戳持久化到 SQLite。
4. UI：每个 skill 展示 "Safe / Warning / Dangerous" 状态，可点击查看详细报告。
5. 触发 critical 规则时强制阻止安装。

## 验收标准
- [ ] 实现可配置的规则加载器。
- [ ] 扫描报告持久化并可查询。
- [ ] UI 展示风险等级标识和报告查看器。
- [ ] 即使手动确认，critical 发现也阻止安装。
