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

---

## 问题
用户经常会在本地调试或修改 skill。目前 WeSight 无法在升级前识别这些本地修改，导致升级直接覆盖。同时也没有把一组 skill 打包备份或分享的能力。

## 目标
1. 在安装/升级时为每个 skill 的文件集合记录基准 checksum/hash。
2. 将当前文件与记录的 checksum 比较，检测本地修改（`dirty` 状态）。
3. UI：在 skill 卡片和详情弹窗中展示"已修改"标识。
4. 导出：
   - 单个 skill → `.zip`
   - 选中 skill / 全部用户 skill → `.collection.zip`（带 manifest）
5. 导入：
   - 支持 `.zip`（单个 skill）和 `.collection.zip`（多个 skill）。
   - 读取 manifest、校验、安全扫描、安装。

## 验收标准
- [ ] 实现高效可用的 dirty 检测。
- [ ] UI 展示 dirty 标识和"放弃本地修改"操作。
- [ ] 导出能生成有效的 zip / collection zip。
- [ ] 导入能处理两种格式。
- [ ] 针对 hash 计算和归档 round-trip 补充测试。
