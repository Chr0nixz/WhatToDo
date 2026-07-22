# WhatToDo 项目审计报告

- 更新时间：2026-07-21（Asia/Shanghai）
- 审计对象：`D:\Projects\ToDo` 当前 `main` 分支磁盘代码
- 审计方式：产品文档核对、静态代码审查、浏览器桌面/390px 窄屏烟雾检查、自动化测试、构建与依赖检查
- 审计原则：以当前代码和实际命令结果为准，不沿用旧审计结论，不把尚未执行的桌面验证视为已通过

## 1. 执行摘要

WhatToDo 已经不是功能原型。当前版本具备多工作区、项目、任务多状态、标签、父子任务、附件、多提醒、提醒历史、保存视图、复杂筛选、重复任务、命令面板、批量操作、撤销与恢复、自动备份、导入预览、CSV/ICS 导出、悬浮窗口和中英文界面，整体已达到可日常使用的功能密度。

当前最短板不是继续增加功能数量，而是以下四类工程风险：

1. 数据库迁移失败时存在自动删除并重建数据库的路径，且备份失败不会阻止重置。
2. SQLite 事务与缓存缺少真正的并发控制，快速并行 mutation 可能丢失内存状态更新。
3. 自动备份、旧备份兼容、ICS 互操作和发布锁文件仍存在可验证的不完整行为。
4. 分页、虚拟化和定向 patch 已落地，但启动及大量普通 mutation 仍会全量加载当前工作区任务。

### 1.1 四维度评分

| 维度 | 评分 | 当前判断 |
|---|---:|---|
| 用户交互便捷性 | 7.5/10 | 主要工作流顺畅，键盘、读屏和错误反馈仍有断点 |
| 功能丰富性与完整性 | 7.5/10 | 已可日用，数据安全型功能和跨应用互操作仍欠闭环 |
| 架构鲁棒性与稳定性 | 5.5/10 | migration、并发写入和发布验证是主要风险 |
| 程序运行效率 | 6.5/10 | 前端优化较好，数据加载和 mutation 刷新仍偏重 |

前端技术审计评分为 **16/20**：Accessibility 3/4、Performance 2/4、Responsive 3/4、Theming 4/4、Anti-patterns 4/4。

### 1.2 问题数量

| 维度 | P0 | P1 | P2 | P3 | 合计 |
|---|---:|---:|---:|---:|---:|
| 用户交互便捷性 | 0 | 0 | 6 | 1 | 7 |
| 功能丰富性与完整性 | 0 | 3 | 5 | 0 | 8 |
| 架构鲁棒性与稳定性 | 1 | 4 | 5 | 0 | 10 |
| 程序运行效率 | 0 | 1 | 4 | 1 | 6 |
| **总计** | **1** | **8** | **20** | **2** | **31** |

严重级别定义：

- **P0 Blocking**：存在数据丢失或阻断核心使用的风险，发布前必须修复。
- **P1 Major**：关键可靠性、数据完整性或发布门禁问题，应在下一版本前修复。
- **P2 Minor**：有明确用户或维护成本，允许短期绕过，但应进入近期迭代。
- **P3 Polish**：不阻断使用，适合在质量收口阶段处理。

### 1.3 发布判断

阶段 A 的数据安全与并发项（`ARC-001`～`003`、`FUN-001`/`FUN-002`）以及 `ARC-007`/`ARC-008` 类型与浏览器 runtime 守卫已落地。当前更不宜把未勾选的 [`DESKTOP_VALIDATION.md`](DESKTOP_VALIDATION.md) / 真实 Tauri 桌面验证等同于稳定发布基线；发布前仍需完成桌面清单与 updater 签名环境验证。

## 2. 验证基线

### 2.1 本次通过

- `pnpm test`：20 个测试文件、151 个测试全部通过。
- `pnpm build`：TypeScript 与 Vite 生产构建通过。
- `pnpm lint`：通过；当前脚本实际只执行 `tsc --noEmit`。
- `pnpm perf:runtime`：3 个 LocalRepository 性能基线通过。
- `pnpm perf:build`：通过；主入口约 211.7 kB，总 JS 约 822.3 kB，总 CSS 约 60.5 kB。
- `cargo check`：通过，但会修正提交中的 Cargo.lock 包版本。
- `cargo test`：6 个 Rust 单元测试通过，当前仅覆盖文件路径校验。
- `pnpm audit --prod`：未发现已知生产依赖漏洞。
- 浏览器桌面与 390x844 窄屏：应用可挂载，无水平溢出，新增任务表单在窄屏可操作。
- 中英文资源键：各 455 个，键集合完全对齐。

### 2.2 本次失败或未完成

- `pnpm test:e2e`：10/11 通过；新增任务入口测试因页面存在两个同名“添加”按钮而触发 Playwright strict-mode 失败，见 [`e2e/smoke.spec.ts`](../e2e/smoke.spec.ts#L83)。
- `cargo fmt --check`：失败，`src-tauri/src/lib.rs` 未符合 rustfmt。
- `cargo check --locked`：失败，因为 [`Cargo.toml`](../src-tauri/Cargo.toml#L3) 为 0.2.2，而 [`Cargo.lock`](../src-tauri/Cargo.lock#L5840) 中应用包仍为 0.2.1。
- 浏览器控制台：应用挂载时出现两次 Tauri `listen()` 的 `transformCallback` 错误。
- `docs/DESKTOP_VALIDATION.md`：仍是未执行清单，不是验证报告。
- `docs/PERFORMANCE_VALIDATION.md`：20k 任务真实桌面检查仍全部未执行。
- 通知权限、托盘、悬浮窗、真实文件对话框、覆盖写入、数据库迁移失败恢复均未在真实 Tauri 桌面运行时完成验证。

## 3. 当前值得保留的实现

以下能力已落地，旧审计中相应“缺失”结论不再成立：

- 全局 [`ErrorBoundary`](../src/components/app/ErrorBoundary.tsx) 已接入应用根节点。
- 命令面板已支持导航、新增/搜索任务、工作区切换、文件夹、保存视图、主题和语言命令。
- 快速添加已支持“下周三、月底、3天后、每周一、每两周”等中英文规则。
- 任务支持 `todo`、`in_progress`、`completed`、`cancelled` 四种状态。
- 已实现多选、批量状态更新、批量删除、批量移动项目和任务列表键盘导航。
- 已实现标签、父任务、附件、多提醒、提醒事件历史和提醒失败重试入口。
- 保存视图已支持创建、重命名、覆盖过滤条件、设为默认和删除。
- 项目与工作区均有编辑、删除/归档及恢复入口。
- 导入已有 schema 校验、预览、替换/合并模式和导入前备份。
- 重复任务已支持 daily、weekly、monthly、yearly、interval、按星期和截止日期。
- 主要视图已使用分页、懒加载、列表虚拟化和定向 repository patch。
- UI 使用稳定设计 token、8px 以内圆角、可见焦点、暗色主题和 reduced-motion 回退。
- 未发现渐变文字、玻璃拟态、装饰性大圆角、营销 hero 或明显 AI 模板化布局。

## 4. 用户交互便捷性

### UX-001 [P2] 命令面板不是完整的可访问 combobox — **已修复**

**当前状态（Wave 1）**：[`CommandPalette.tsx`](../src/components/app/CommandPalette.tsx) 输入框为 `role="combobox"`，含 `aria-controls` / `aria-expanded` / `aria-activedescendant`；结果 listbox 与 option 对齐。

**残留**：真实 NVDA/VoiceOver 回归仍建议在发布前人工抽检。

### UX-002 [P2] 移动端命令按钮的可访问名称错误 — **已修复**

**当前状态（Wave 1）**：命令入口使用本地化 `aria-label={t("commandPalette")}`，快捷键不再充当唯一名称。

### UX-003 [P2] 月历日期和任务数量缺少完整可访问名称 — **已修复**

**当前状态（Wave 1）**：日期按钮提供含完整日期与任务数量的本地化 `aria-label`，并保留选中态语义。

### UX-004 [P2] 表单错误没有与字段建立程序化关联 — **已修复**

**当前状态（Wave 1）**：关键表单错误使用 `aria-invalid` / 描述关联与提交失败 live region（如 TaskComposer）。

**残留**：并非每个次要表单控件都已统一 FormField 组件；可按需继续收敛。

### UX-005 [P2] OS 全局快捷键与 DOM 快捷键可能双触发 — **已修复**

**当前状态（Wave 1）**：窗口聚焦时由 DOM 处理；全局插件路径对主窗口焦点去重，避免 `Ctrl+K` 等双触发。

### UX-006 [P2] “通知点击”使用窗口聚焦近似，可能误跳任务 — **已修复**

**当前状态（Wave 1）**：不再把任意窗口 focus 当作通知点击；打开任务走显式提醒中心/支持的通知 action 路径。

### UX-007 [P3] 窄屏月历占用过多首屏且日期触控高度偏小

**证据**：390x844 实测无水平溢出，但月历占据首屏大部分区域，日期按钮约 48x34 px；[`index.css`](../src/index.css#L414) 还显式取消了日历按钮的 44px 最小目标。

**建议**：窄屏默认周视图或允许折叠月历；日期按钮至少保持 40-44px 高，避免密集误触。

## 5. 功能丰富性与完整性

### FUN-001 [P1] 自动备份可能显示成功但没有生成文件 — **已修复**

**当前状态（阶段 A + Wave 10）**：设置保存与备份成功文案分离；无目录不可启用；仅真实写入成功后记录 last-run；失败写入 last-error；路径用 Rust `join_backup_path`。Wave 10：按 `retentionCount` / `retentionDays` 清理 `whattodo-auto-*.json` 及对应 `_attachments`；v3 备份的 `clientPreferences.autoBackup` 可恢复间隔/保留策略（**不**覆盖本机 `folder`）。

**残留**：自动备份目录仍是本机路径，不随备份跨设备迁移。

### FUN-002 [P1] 备份 schema 的向后兼容与性能 fixture 失配 — **已修复**

**原证据（已过时）**：曾要求 `defaultSavedViewId` 且 20k fixture 缺该字段，导入预览失败。

**当前状态**：
- [`backupSchema.ts`](../src/data/backupSchema.ts) 对 `defaultSavedViewId` 使用 `.default(null)`，旧备份缺字段可通过。
- [`generate-performance-backup.mjs`](../scripts/generate-performance-backup.mjs) settings 含全部当前字段，生成后调用 [`validate-performance-fixture.mjs`](../scripts/validate-performance-fixture.mjs) 执行 `parseBackupPayload()`，失败则非 0 退出。
- 自动化：[`backupSchema.test.ts`](../src/data/backupSchema.test.ts) 覆盖缺字段默认值、fixture 形态，以及存在时的 20k 文件校验。

**残留**：更老备份若缺 `theme` 等无 default 字段仍会被拒；未来语义不兼容字段需升版本 + 显式迁移。

### FUN-003 [P1] ICS 导出混用了 VEVENT 和 VTODO 语义 — **已修复**

**原证据（已过时）**：曾对所有任务输出 VEVENT，却混入 VTODO 状态属性与零时长 `DTEND`。

**当前状态**：
- [`buildTasksIcs`](../src/data/repository.ts) 导出 `VTODO`（`DUE` / `DUE;VALUE=DATE`），无 `VEVENT`/`DTSTART`/`DTEND`。
- 状态映射：`completed` → `COMPLETED` + `PERCENT-COMPLETE:100`；`in_progress` → `IN-PROCESS` + 50；`todo` → `NEEDS-ACTION`；`cancelled` → `CANCELLED`。
- 含 `CREATED` / `LAST-MODIFIED`、项目 `CATEGORIES`、首个未触发提醒的 `VALARM`。
- [`ics.test.ts`](../src/data/ics.test.ts) 用 RFC 5545 展开解析断言组件语义。

**残留**：未导出本地 `TZID`；不导入 ICS；未做真实日历客户端互操作验证。

### FUN-004 [P2] 重复任务规则仍缺少常见高级表达

**现状**：已支持四种频率、interval、每周多个星期和截止日期。

**缺口**：每月最后一天、每月第 N 个星期 X、按次数结束、排除日期、跳过本次、延后本次、仅修改单次/本次及以后/整组的完整交互语义仍不足。

**建议**：采用 RRULE 风格领域模型或成熟 recurrence 库，避免继续为每种规则增加独立分支。

### FUN-005 [P2] 重复实例不会继承标签和父任务关系 — **已修复**

**当前状态（Wave 2）**：重复模板保存 tags/parentId；新实例继承这些字段（以及既有的 project/folder/priority/notes/提醒策略）。

**残留**：高级 RRULE 与“仅本次/本次及以后/整组”完整交互仍见 FUN-004。

### FUN-006 [P2] 子任务只有 parentId，缺少完整任务树语义

**进展**：
- Wave 3：`wouldCreateParentCycle` 写入防护；列表缩进；详情子任务列表；完成不级联（`subtasksNoCascadeHint`）。
- Wave 8：直接子任务进度 `getDirectChildProgress`；详情与列表显示 completed/total；列表可折叠隐藏子孙。

**残留**：无父子完成级联；无树形重排/拖拽改父子；Composer 未提供快捷建子任务；删除父任务时子任务策略未单独产品化。

### FUN-007 [P2] 搜索与保存视图仍有管理能力缺口 — **已修复**

**当前状态（Wave 2）**：命令面板支持当前/全部工作区搜索范围；保存视图支持 pinned/置顶。

**残留**：复制视图与导出共享仍未做。

### FUN-008 [P2] 导入预览与附件生命周期不完整

**进展**：
- Wave 3：导入预览含实体计数与 merge 冲突摘要；打开附件失败可「重新定位」并 `updateAttachmentPath`。
- Wave 7：Tauri 添加附件时 `copy_managed_attachment` 复制到 `{appData}/attachments/{id}/`；`SqlRepository.deleteAttachment` 删除托管文件；浏览器 Local 仍存外部路径。
- Wave 9：Settings「迁入应用托管目录」对可读的外部路径附件执行 copy + 更新 path（`migrateExternalAttachments`）；缺失源计入 failed，不删原文件。
- Wave 10：备份 schema v3 + `{stem}_attachments/` sidecar；导出把托管附件写成可移植路径并打包二进制；导入前从 sidecar 还原到托管目录；自动备份/导入前备份同样走 bundle。

**残留**：无 `storageKind` 字段；merge 仍按同 ID 覆盖、无策略选择 UI；Relocate 仍可指向外部路径；浏览器导出仍无法打包二进制。

## 6. 项目架构的鲁棒性与稳定性

### ARC-001 [P0] migration 失败会在备份未确认成功时删除数据库 — **已修复**

**当前状态（阶段 A）**：migration/打开失败保留原库；经校验备份后由用户在恢复界面主动重置；Rust 测试覆盖备份失败不删库、确认重置等路径。

**残留**：并非每个历史 schema 版本都有完整 fixture 升级矩阵。

### ARC-002 [P1] duplicate-column 恢复会错误标记整条 migration 完成 — **已修复**

**当前状态（阶段 A）**：按列/表存在性推进 schema（`ensure_column` / repair）；禁止仅凭 duplicate-column 字符串把整版标完成；有相关 Rust 单测。

### ARC-003 [P1] 事务深度和 repository cache 不支持并发 mutation — **已修复**

**当前状态（阶段 A）**：`SqlRepository` 实例级 mutation 队列 + `transactionDepth`；并发 toggle/snooze 测试覆盖；`useTodos` 仍丢弃过期 UI 结果。

### ARC-004 [P1] E2E 已失败但不属于 CI 门禁 — **已修复**

**当前状态（阶段 B）**：CI Linux job 运行 `pnpm test:e2e`；smoke 监听 pageerror；当前 E2E 套件通过。

### ARC-005 [P1] 发布版本同步不包含 Cargo.lock — **已修复**

**当前状态（阶段 B）**：`release-check.mjs` 校验 Cargo.lock 中 whattodo 版本；CI / release 使用 `cargo check --locked`。

### ARC-006 [P2] repository.ts 责任过多且缺共享契约测试

**证据**：[`repository.ts`](../src/data/repository.ts) 体量仍大，同时包含领域规则、LocalRepository、SqlRepository、SQL 组装、cache、备份、CSV、ICS 和映射。

**进展（Wave 11）**：[`repositoryConformance.test.ts`](../src/data/repositoryConformance.test.ts) 双跑扩展覆盖 recurring 完成/禁用、backup replace/merge/v1、failed reminder、loadTaskPage/availableTasks/跨工作区、soft-delete recovery。

**影响**：任何领域变更都需要同时修改多处；真实 rusqlite 集成测仍缺。

**建议**：拆为 repository contract、domain mutation、local adapter、sqlite adapter、backup、csv、ics；conformance 继续扩到真实临时 SQLite。

### ARC-007 [P2] TaskPageResult 返回不完整 Task，却使用完整 Task 类型 — **已修复**

**当前状态**：`TaskSummary` / `TaskPageResult` 已接入；`AppData.tasks` 为摘要；详情 `getTask` 返回完整 Task；Wave 8 将 `taskFilters` 与 `taskPageComparator` 收窄为 `TaskSummary`。备份/ICS/CSV 仍使用完整 `Task`。

### ARC-008 [P2] 浏览器 fallback 无条件调用 Tauri event API — **已修复**

**当前状态（Wave 1）**：仅在 Tauri runtime 注册 listen；浏览器 smoke/E2E 将 pageerror 视为失败。

### ARC-009 [P2] 数据库重置通知存在事件时序风险 — **已修复**

**当前状态（Wave 1）**：前端启动主动 `get_db_init_status`；事件用于后续变化。

### ARC-010 [P2] Rust 质量门禁和桌面验证不足

**进展**：
- CI 已跑 `cargo fmt --check` / clippy / `cargo test --locked` / `cargo check --locked`。
- Wave 8：`lib.rs` rustfmt；`release-check.mjs` 与 release workflow 对齐 fmt/clippy/test；`package.json` 增加 `rust:fmt` / `rust:clippy` / `rust:test`。
- Wave 10：[`DESKTOP_VALIDATION.md`](DESKTOP_VALIDATION.md) 增加可勾选清单、附件 sidecar / 自动备份保留项，并明确 agent 会话对交互桌面项为 **blocked**；Rust 覆盖 sidecar 导出与 auto-backup 清理。

**残留**：交互桌面清单仍需人工 `pnpm tauri dev` 勾选；桌面 20k UI 验证多为 blocked；Rust 测试面仍偏窄。

## 7. 程序运行效率

### PERF-001 [P2] 启动仍加载当前工作区全部任务

**证据**：[`readAll()`](../src/data/repository.ts) 仍 O(N) 加载当前工作区全部 `TaskSummary`（及 reminders/attachments/templates 等）。

**纠偏（Wave 11）**：列表查询已使用 [`TASK_LIST_COLUMNS`](../src/data/repositoryMappers.ts) + `TaskSummary`（**不含 notes**）；详情 notes 经 `getTask(id)` 按需加载。AUDIT 旧述 `SELECT *` 含 notes 已过时。

**残留**：启动仍全量拉取当前工作区 Summary；未做「首屏空列表 + 分页灌入」。统计/日历/提醒 tick 仍依赖内存中的任务切片。

**建议**：AppData 启动只保留必要摘要或首屏页；统计、日历计数和提醒到期检查继续下推 SQL；避免为打开首页加载全部任务行。

### PERF-002 [P1] 大量普通 mutation 后仍执行完整 readAll

**证据**：高频 toggle/status/delete/reminder 与 Tier-1/Tier-2/Tier-3 定向 `commitCache` delta patch 已落地。

**进展**：Tier-1～3 已完成。**Wave 11 收尾**：`selectWorkspace`、删**当前**工作区、`importBackup` 改为 `loadWorkspaceSlices` / 内存组装 + `commitCache`，不再 post-mutation `readAllWithPatch()`。

**仍全量 readAll**：冷启动 `load()` / cache miss `getCache()`。

**影响**：工作区任务量大时，冷启动与首次 miss 仍贵；普通编辑与切工作区已不再二次全表重读。

**建议**：继续压缩 `load()` 启动面（见 PERF-001）；cache miss 可只拉 workspaces + 当前 slice。

### PERF-003 [P2] AppShell 订阅完整 AppData 并重复构建索引

**证据**：曾用 `useTodoData()` 订阅整树，settings 变更也会重渲染外壳。

**进展（Wave 11）**：[`AppShell.tsx`](../src/components/app/AppShell.tsx) 改用 `useTasks` / `useSettings` / `useWorkspaceId` 等 slice；索引仍只依赖 `tasks`/`projects`/`reminders`；`useReminders` 收窄为 `ReminderTickData`；`useAutoBackup` 只依赖 `ready` 布尔。

**残留**：子视图仍接收组装后的 `data` prop；Overview 等未全部改为直接 slice 订阅。

**建议**：让各 view 直接使用 slice selectors；继续保证 patch 不改变无关 slice 的引用。

### PERF-004 [P2] 文本搜索无法利用普通索引 — **本轮不做 FTS5**

**证据**：[`loadTaskPage`](../src/data/repository.ts) 使用 `%query%` 匹配 title、notes、日期、时间和项目名。

**影响**：数据增长后搜索会扫描候选任务；查询和 count 还会分别执行一次相同过滤。

**Wave 5 决策（2026-07-22）**：不引入 SQLite FTS5。LocalRepository 20k `loadTaskPage` P95 远低于预算；本轮未能完成 Tauri 桌面导入与 Home 搜索计时，因此没有用户可见瓶颈证据。短期继续依赖分页查询与非文本过滤；仅在真实桌面记录搜索卡顿后再开 FTS Wave。

**建议（保留）**：桌面 20k 搜索实测后再决定 FTS5；短期可把 count 和 page 查询并发，并为常用非文本过滤补充组合索引与 EXPLAIN QUERY PLAN 基线。

### PERF-005 [P2] 性能自动化不代表真实桌面负载

**证据**：[`repository.perf.test.ts`](../src/data/repository.perf.test.ts#L6) 只测试 LocalRepository 的 2000 条任务，并明确声明不能替代 20k 桌面验证。

**进展（Wave 10）**：[`PERFORMANCE_VALIDATION.md`](PERFORMANCE_VALIDATION.md) / [`DESKTOP_VALIDATION.md`](DESKTOP_VALIDATION.md) 记录自动化绿与桌面 **blocked** 边界；20k fixture + Local/runtime 门禁仍绿。

**缺口**：没有真实 SQLite 文件、Tauri IPC、导入耗时、首屏时间、搜索、mutation 延迟、内存峰值、提醒中心和悬浮窗数据。

**建议**：在本机 `pnpm tauri dev` 导入 `tmp/performance-backup-20000.json` 后填写桌面行：冷启动、切工作区、首屏、搜索、打开详情、完成任务、批量操作、提醒分组、导入和内存峰值；给出 P50/P95。

### PERF-006 [P3] bundle 门槛只约束主入口，不约束总量和关键路由

**现状**：主入口约 211.7 kB，低于 500 kB 限制；总 JS 约 822.3 kB，React vendor 约 287.6 kB，当前 gzip 体积仍可接受。

**建议**：继续保留懒加载；基线同时记录 total JS、初始请求 gzip、最大 lazy route 和 CSS，避免把依赖移动到 vendor 后绕过 main chunk 门槛。

## 8. 系统性问题

1. **验证声明与真实门禁不一致**：README、Playwright 注释和手工清单描述了应执行的验证，但 CI 并未实际执行 E2E、Rust tests、fmt、clippy 或 locked build。
2. **错误反馈仍以局部 catch + 普通文本为主**：视觉上已有反馈，但可访问性、日志、最近失败状态和跨会话诊断不足。
3. **部分性能优化只覆盖高频路径**：Wave 11 后切工作区/导入/删当前工作区已定向 patch；冷启动 `load()` 仍全量 readAll。
4. **类型未区分完整实体与摘要**：TaskPageResult、availableTasks、recovery tasks 在 Local/SQL 下携带的信息不一致。
5. **桌面能力缺自动化层**：通知、托盘、窗口、文件系统和 migration 仍主要依赖人工代码推断。

## 9. 分阶段整改路线

### 阶段 A：数据安全与发布阻断项

1. 修复 `ARC-001`：migration 失败禁止自动删除原库，备份成功且校验后才能由用户主动重置。
2. 修复 `ARC-002`：拆分 migration，逐项检测 schema，不再用 duplicate-column 字符串跳过整版。
3. 修复 `ARC-003`：repository mutation 串行化，补并发 cache/transaction 测试。
4. 修复 `FUN-001`：自动备份必须以真实文件写入成功为准，记录最后成功和失败。
5. 修复 `FUN-002`：补备份默认值/版本迁移，并让 20k fixture 自校验。

阶段 A 验收：旧库升级、备份失败、磁盘错误、两个并发 mutation、自动备份失败均有自动化测试；任何失败不删除用户原始数据。

### 阶段 B：CI 与发布门禁

1. 修复当前 E2E 定位器，并让 `pnpm test:e2e` 进入 CI。
2. 修复 rustfmt，增加 fmt、clippy、cargo test 和 `cargo check --locked`。
3. 修复 Cargo.lock 版本同步和 release-check 校验。
4. 浏览器 smoke 监听 `pageerror` / console error。
5. 为每次 release 保存已完成的 `DESKTOP_VALIDATION.md` 结果，而不是空清单。

阶段 B 验收：干净 checkout 上所有门禁一次通过，CI 与本地 release-check 对版本和测试结论一致。

### 阶段 C：数据层性能与契约

1. 拆分 repository 责任并建立 Local/SQLite 共享 conformance suite。
2. 引入 TaskSummary，详情按 ID 查询。
3. 把普通 CRUD 改为 delta patch，减少 readAll。
4. 用真实 SQLite/Tauri 完成 20k P50/P95 验证，再决定 FTS5 和更多索引。

阶段 C 验收：20k 单工作区下启动、搜索、编辑、完成和批量操作达到明确预算，Local/SQL 契约测试完全一致。

### 阶段 D：交互和功能收口

1. 完成 command palette combobox、日期 aria-label、字段错误关联和 live region。
2. 消除全局/DOM 快捷键双触发，替换通知 focus 近似方案。
3. 修正 ICS 语义，扩展 recurrence 规则和字段继承。
4. 完善子任务树、跨工作区搜索、导入冲突摘要和附件失效恢复。
5. 最后执行视觉、暗色、窄屏、键盘和 reduced-motion polish。

## 10. 建议的持续检查命令

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm perf:runtime
pnpm perf:build

cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
cargo check --locked
```

发布前还必须执行：

- 完整记录 `docs/DESKTOP_VALIDATION.md`。
- 完整记录 `docs/PERFORMANCE_VALIDATION.md` 的 20k 桌面结果。
- 验证真实通知权限允许/拒绝、托盘恢复、关闭到托盘、悬浮窗、文件覆盖写入、自动备份和数据库迁移恢复。
- 运行 `pnpm release:check` 并确认 updater 签名密钥只存在于安全环境。

## 11. 审计结论

WhatToDo 的产品面和前端完成度已经较高，继续堆叠普通功能的边际收益低于修复数据安全与验证体系。下一阶段应按 **migration 数据安全 → 并发与 cache 一致性 → 自动备份与备份兼容 → CI/发布门禁 → 20k 数据层性能 → 交互与功能收口** 的顺序推进。

修复后应重新执行本审计，并同步更新 `README.md`、`PROJECT_ANALYSIS.md`、`DESKTOP_VALIDATION.md` 和 `PERFORMANCE_VALIDATION.md`，避免文档继续保留已经过时的测试数量、构建体积和功能缺口。
