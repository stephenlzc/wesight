# Deep-Interview Transcript: skill-manager-unified

## Metadata
- **Profile:** standard (max 12 rounds, extended to 15 by user request)
- **Final ambiguity:** 12%
- **Threshold:** 20%
- **Rounds:** 15
- **Context type:** brownfield
- **Context snapshot:** `.omx/context/skill-manager-unified-20260615T233300Z.md`

## Rounds Summary

| Round | Target | Question | Answer |
|-------|--------|----------|--------|
| 1 | intent/priority | 如果第一版只能做一个核心闭环，怎么选？ | 只做最小版：#52 的 registry 部分 |
| 2 | intent/assumption | 选择背后的主要顾虑？ | 想先验证技术可行性 |
| 3 | scope/boundary | "只做 registry" 最小范围里必须包含什么？ | 建表 + 迁移 + 来源 + 软链 + UI 展示来源 |
| 4 | scope/sync targets | 软链同步到哪些 Agent 必须支持？ | Claude Code + Kimi CLI + OpenClaw + Codex CLI + 自定义路径 |
| 5 | tradeoff/boundary | 目标 Agent 已存在同 id skill 怎么办？ | 询问用户选择保留哪个 |
| 6 | constraint/feasibility | Windows 上软链怎么处理？ | 检测开发者模式，能软链就软链，否则复制 |
| 7 | pressure pass | 为什么不做成只建表+迁移？ | 范围其实可控，只是听起来大 |
| 8 | success criteria | PR 合并前必须看到什么？ | UI 看来源 + 安装自动同步 + 删除清理 + 单元测试 |
| 9 | non-goals | 第一版哪些明确不做？ | #53-#56 可以预留接口，但不实现功能 |
| 10 | constraints | 是否可以改 SkillRecord/Skill/IPC 类型？ | 可以扩展字段，但要向后兼容 |
| 11 | implementation preference | registry 用什么存储？ | SQLite 新表 skill_metadata |
| 12 | closure | 还有什么必须明确的点？ | 错误处理策略、UI 交互细节、测试覆盖范围 |
| 13 | error handling | 同步失败怎么提示？ | 弹窗通知并让用户重试/跳过 |
| 14 | UI interaction | Agent 同步目标默认开启还是关闭？ | 首次安装 skill 时再引导用户选择 |
| 15 | test coverage | 最低测试要求？ | registry + symlink/copy + 安装/删除生命周期端到端测试 |

## Key Insights

1. **MVP is #52 only**, but the user wants it to be a complete user-perceivable feature, not just an invisible data-layer refactor.
2. **Technical feasibility concern** drove the choice of #52, but the user believes the scoped-down full loop (registry + source tracking + sync + UI) is manageable.
3. **User control is paramount**: conflicts are resolved by asking the user; sync targets are not auto-enabled until first install.
4. **Cross-platform pragmatism**: symlinks on macOS/Linux, developer-mode symlinks on Windows, copy fallback otherwise.
5. **Backward compatibility is required**: existing `SkillRecord`/`Skill` types can be extended but must not break old skills or existing flows.
6. **Extensibility is expected**: #53-#56 are out of scope for v1, but the design must leave clear extension points.
7. **Testing is taken seriously**: end-to-end coverage of install/delete lifecycle is expected.
