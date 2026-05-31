# WhatToDo 项目分析与下一步开发计划

更新时间：2026-05-31（Asia/Shanghai）

## 1. 当前状态

WhatToDo 是一个本地优先的桌面 DDL/任务规划应用，技术栈为 Tauri 2、React 19、TypeScript、Vite、Tailwind CSS 4 和 SQLite。当前功能已经覆盖每日 DDL、总览筛选、项目、工作区、工作文件夹、提醒中心、恢复中心、导入导出、保存视图、重复任务、悬浮窗口和中英文 UI。

最新自动化基线：

- `pnpm test` 通过：14 个测试文件，50 个用例。
- `pnpm build` 通过，主入口 JS chunk 约 100.8 kB。
- `pnpm perf:build` 通过，记录 JS/CSS 体积基线。
- `pnpm perf:fixture` 可生成 20k 任务性能验证备份。
- `cd src-tauri && cargo check` 通过。
- `git diff --check` 无空白错误，仅有 Windows LF/CRLF 提示。

上一轮已完成前端代码拆分，`pnpm build` 不再出现 Vite 主 chunk 体积警告。

## 2. 已完成的关键改进

### 2.1 可靠性与安全边界

- `useReminders` 已改为使用稳定 ref 保存最新 data/action，并增加 tick 运行锁、取消标记和提醒 id 去重，降低重复触发风险。
- 到期提醒筛选已使用 `tasksById` Map，避免提醒多时反复 `tasks.find`。
- SQLite 多步写入已增加事务保护，覆盖任务+提醒、重复模板+首个实例、任务更新+提醒更新、完成重复任务+生成下一实例等路径。
- Tauri CSP 已从 `null` 收紧，capability windows 已从 `*` 收紧到 `main` 和 `workspace-*`。
- `read_text_file`、`write_text_file`、`open_workspace_window` 已增加参数校验、扩展名限制和窗口参数清洗。
- 已新增 `DESKTOP_VALIDATION.md`，作为真实桌面运行验证清单。

### 2.2 提醒与任务编辑体验

- 创建任务和任务详情页已支持提醒提前量选择：无提醒、10 分钟、30 分钟、1 小时、1 天。
- 新增 `updateTaskReminder` 数据层/API，LocalRepository 与 SqlRepository 均支持启用、停用和重设任务提醒。
- 提醒失败会被持久化，并在提醒中心失败分组显示最后错误和尝试状态。
- 提醒中心支持重试、稍后提醒、关闭提醒、打开任务和完成任务。

### 2.3 可恢复操作与系统反馈

- 任务删除、工作区文件夹删除、项目归档已改成直接执行并显示 undo toast，不再先弹 `window.confirm`。
- 打开文件夹、打开悬浮窗口、导入导出、导入前备份写入等系统操作已增加局部失败反馈。
- 设置页发布流程已引用 `DESKTOP_VALIDATION.md`，发布前可以按清单验证提醒、托盘、悬浮窗、文件夹和导入导出。

### 2.4 快速添加与日期显示

- 快速添加解析现在返回结构化 `matches`，UI 会显示日期、时间、项目、优先级和提醒的解析结果 chips。
- 解析预览可以清除，清除只隐藏 chips，不回滚已经套用到表单的字段。
- 日期和提醒时间显示已集中到 `src/data/dateFormat.ts` 的 helper，任务行、提醒中心、任务详情、项目与恢复列表等位置已接入统一格式。
- 中英文 i18n key 保持对齐。

### 2.5 重复任务与数据备份

- 已支持 daily、weekly、monthly 重复任务。
- 创建重复任务会创建模板和首个实例。
- 完成当前重复实例时会生成下一次实例，并避免重复生成相同日期实例。
- 支持关闭重复模板，关闭后不再生成未来实例。
- Backup payload 已升级到版本 2，包含重复任务模板；版本 1 备份仍可导入。

## 3. 四个维度的剩余不足

### 3.1 用户交互便捷性

- 缺少桌面效率入口：全局快捷键快速新增、命令面板、快速搜索任务、快速打开文件夹、快速切换工作区尚未实现。
- 快速添加解析规则仍偏窄，对“下周三”“周五前”“月底”“每周一”“每两周”“不提醒但保留日期”等自然表达支持不足。
- 部分 icon-only 按钮仍主要依赖 `title`，可继续补齐显式 `aria-label` 和键盘焦点验证。
- 真实桌面运行体验尚未完整执行验证清单，尤其是通知权限、托盘恢复、悬浮窗和真实文件夹路径失败场景。

### 3.2 程序功能丰富性和完整性

- 重复任务规则仍是基础版：只支持每天、每周、每月，`interval` 实际固定为 1；暂不支持每 2 周、每周一三五、每月最后一天、结束次数等规则。
- “更新未来重复”目前主要更新模板，不会同步已经生成的未来实例，文案和行为仍需要进一步明确或拆成多种更新路径。
- 提醒历史仍不完整：当前保存最后失败原因和尝试时间，但没有完整事件日志记录触发、关闭、稍后、重试、成功的时间线。
- 保存视图只有创建、应用、删除；缺少重命名、覆盖当前视图、设为默认、排序或置顶。
- 项目和工作区管理仍不完整：项目缺少完整编辑/删除入口，工作区缺少编辑和删除入口。
- 导入导出仍缺少导入预览、选择性合并、schema 细粒度校验、自动定期备份。
- ICS 导出偏基础，缺少时区、提醒 `VALARM` 和更准确的结束时间。

### 3.3 项目架构鲁棒性和稳定性

- SqlRepository 测试覆盖仍偏浅。LocalRepository 覆盖较多，SQLite 侧还应补充重复任务、备份导入、保存视图、失败提醒、workspace 过滤和软删除恢复的 SQL 语义测试。
- LocalRepository 与 SqlRepository 仍有语义差异风险，例如 SQLite 设置是按 workspace 存储，Local fallback 仍更接近单份 settings。
- Tauri 安全边界已有第一轮收紧，但仍需要真实桌面验证和发布前复核，确认 CSP 不影响 updater、文件导入导出、悬浮窗和通知。
- 桌面实机验证尚未记录结果，`DESKTOP_VALIDATION.md` 是清单，但不是已完成报告。

### 3.4 程序运行效率

- SqlRepository 每次 mutation 后基本仍会 `readAll()`，一次读取当前 workspace 的 projects、tasks、folders、reminders、settings、saved views 和 recurring templates；但跨工作区候选任务和恢复中心数据已改为按需读取。
- 多处查询仍使用 `SELECT *`，会读取当前视图暂时不需要的字段。
- `availableTasks` 已从主加载路径拆出，打开工作区任务选择器时才通过 `loadAvailableTasks()` 查询。
- Overview、Projects、WorkspaceTaskPicker、Home 和悬浮窗口已加入 150 条窗口渲染和加载更多。
- `loadTaskPage()` 已作为第一步 repository 分页查询 API 落地，但主要视图尚未迁移到查询下推。
- 前端主 JS chunk 已通过 lazy view 和 `manualChunks` 降到约 100.8 kB；后续重点转向真实桌面运行和大数据集交互验证。

## 4. 推荐优先级

### P0：验证与回归补齐

1. 在 `pnpm tauri dev` 下执行 `DESKTOP_VALIDATION.md`，记录通过/失败结果。
2. 修复实机验证发现的问题，尤其是通知权限、托盘恢复、悬浮窗、真实文件夹打开和导入导出。
3. 扩展 SqlRepository 语义测试，覆盖 LocalRepository 已覆盖的关键行为。

### P1：交互效率闭环

1. 增加命令面板，优先支持新增任务、搜索任务、打开文件夹、切换工作区。
2. 增强快速添加自然语言解析规则和解析预览。
3. 继续补齐 icon-only 按钮的可访问性标签和键盘路径。

### P2：功能完整性

1. 明确重复任务更新语义：只更新当前实例、更新模板、更新未完成未来实例。
2. 增加提醒事件历史。
3. 完善保存视图、项目、工作区管理能力。
4. 增强备份导入预览、合并和自动备份。

### P3：性能收口

1. 继续将 repository 拆出更多按视图查询能力，减少每次 mutation 后的全量 `readAll()`。
2. 用 20k 任务数据集验证 Home、Overview、Projects、Workspaces、WorkspaceTaskPicker 和悬浮窗口的窗口渲染体验。
3. 评估是否需要把具体视图迁移到 `loadTaskPage()` 查询下推。
4. 持续跟踪 `pnpm perf:build`，防止主入口 chunk 回升到 500 kB 以上。

## 5. 下一步开发计划

### 阶段一：桌面实机验证与 SQL 测试补齐（1-2 天）

1. 按 `DESKTOP_VALIDATION.md` 执行真实桌面验证。
2. 记录验证结果，并把失败项拆成明确 issue。
3. 补充 SqlRepository 测试：重复任务生成、事务回滚、失败提醒、备份导入、workspace 过滤、软删除恢复。
4. 修复验证和 SQL 测试暴露的问题。

### 阶段二：命令面板和快捷入口（3-5 天）

1. 增加命令面板 UI，保持紧凑工作台风格。
2. 支持新增任务、搜索任务、打开任务详情、打开工作文件夹、切换工作区。
3. 后续接入全局快捷键，桌面端优先，浏览器 fallback 保持普通快捷键。

### 阶段三：重复任务与提醒历史（4-6 天）

1. 明确 recurrence rule 模型和 future instance 更新策略。
2. 拆分“更新模板”“更新未完成未来实例”“只更新当前实例”的 UI 文案和行为。
3. 增加提醒事件日志，记录触发、失败、重试、稍后、关闭、成功。

### 阶段四：性能和数据管理（4-7 天）

1. 基于 20k 任务数据集做真实交互性能验证。
2. 继续让主要视图迁移到 repository 分页查询，优先减少 mutation 后的全量 `readAll()`。
3. 评估导出路径和提醒中心的大数据量表现。
4. 增强备份导入预览、合并策略和自动备份计划。
