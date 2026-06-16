# 人类指令 - 2026-06-16 19:29:39


协调指令：减少冲突，提高协作效率

1. 认领任务前必须先检查 current_tasks/ 下的 .lock 文件，以及 git status，确认没有其他人正在修改你要改的文件。
2. 任务分配建议：
   - Agent-1 负责 src/main/skillSyncResolver.ts（同步策略：symlink/copy/冲突检测）
   - Agent-2 负责 src/main/sqliteStore.test.ts 和 skillMetadataStore 相关测试
   - Agent-3 负责 src/renderer/types/skill.ts 和 shared/skills/constants.ts 的类型与常量扩展
   - Agent-4 负责 src/main/sqliteStore.ts 的 skill_metadata 表迁移
   - Agent-5 负责 src/main/skillManager.ts 中 metadata registry CRUD API
   - Agent-6 负责 src/main/skillManager.ts 中 sync 生命周期集成（install/delete/upgrade）
   - Agent-7 负责 renderer UI：skill 详情展示来源
   - Agent-8 负责 renderer UI：Settings 同步目标管理 + 首次安装引导
3. 每个 agent 在自己负责的文件范围内工作，不要跨文件大改。
4. 每完成一个有意义的小步骤就立即 commit + push，不要等到整个 session 结束。
5. 如果发现自己的改动与其他 agent 冲突，优先通过 git pull --rebase 解决，必要时在 TASKS.md 中记录并让出文件。
6. 新增文件时统一放在 src/main/libs/skillManager/ 目录下（skillMetadataStore.ts、skillSyncResolver.ts 等），不要新建 src/main/skills/ 目录。

