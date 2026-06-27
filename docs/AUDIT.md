# WhatToDo 项目审计报告

更新时间：2026-06-26（Asia/Shanghai）

本次审计基于 `d:\Projects\ToDo` 当前磁盘代码状态（截至 2026-06-26），未依赖文档承诺。所有引用均带文件路径与行号，可直接通过编辑器跳转复核。

## 概览

| 维度 | 严重项 | 中等项 | 轻微项 | 整体评价 |
|---|---|---|---|---|
| 用户交互便捷性 | 7 | 8 | 4 | 基础齐全但缺效率闭环 |
| 功能丰富性完整性 | 19 | 14 | 1 | 数据层扎实，领域深度不足 |
| 架构鲁棒性稳定性 | 8 | 7 | 5 | Local/SQL 一致性是核心隐患 |
| 程序运行效率 | 8 | 10 | 8 | mutation→readAll 全量重读是致命瓶颈 |

最致命的三个跨维度问题：

1. **无 React ErrorBoundary** —— 任意子组件渲染错误直接白屏
2. **每次 mutation 触发 readAll 8 条 SELECT** —— 单次 `toggleTask` 触发 16 条 SQL 查询 + 全树重渲染
3. **LocalRepository 与 SqlRepository 的 settings 存储模型根本不一致** —— 破坏"两个实现行为一致"的核心约束

---

## 一、用户交互便捷性

### 1.1 桌面效率入口

**[严重] 全局快捷键处理器为内联闭包导致每次 AppShell 重渲染都重新注册 OS 快捷键**
[AppShell.tsx:234](file:///d:/Projects/ToDo/src/components/app/AppShell.tsx) 传入 `onNewTask: () => setTaskCreateOpen(true)` 是内联箭头函数，[useGlobalShortcuts.ts:51](file:///d:/Projects/ToDo/src/hooks/useGlobalShortcuts.ts) 的 `useEffect` 依赖数组包含 `onNewTask/onOpenPalette/onSearchTasks`。任意 state 变化触发 effect 反复 `unregisterAll()` + `register()`，存在"快捷键短暂失效窗口"。

**[严重] 应用内与 OS 级快捷键双重监听可能导致双触发**
[useGlobalShortcuts.ts:26-34](file:///d:/Projects/ToDo/src/hooks/useGlobalShortcuts.ts) 在 OS 层注册 `Ctrl+K/N/Shift+F`，[useCommandPalette.ts:142-160](file:///d:/Projects/ToDo/src/hooks/useCommandPalette.ts) 在 window 层又监听相同组合。窗口聚焦时按键可能先后都执行，`Ctrl+K` 直接开了又关。

**[中等] 命令面板缺「切换主题/语言」命令**
[commandPalette.ts:38-144](file:///d:/Projects/ToDo/src/data/commandPalette.ts) 的 `manage` 组只有"编辑工作区/项目"，未接入 `actions.saveSettings` 切换主题/语言。

### 1.2 快速添加与自然语言解析

**[严重] 大量常见中文日期表达完全不支持**
[quickAdd.ts:101-207](file:///d:/Projects/ToDo/src/data/quickAdd.ts) 中无 `下周三`、`周五前`、`月底`、`每周一`、`每两周`、`3天后`、`下周`、`本周末` 等正则。`后天` 只到第 2 天，`3天后`/`一周后`/`下周五` 全部不识别，会被当作标题文本残留。

**[严重] 「清除预览」只清标签不回滚字段，误导用户**
[TaskComposer.tsx:348,511](file:///d:/Projects/ToDo/src/components/app/TaskComposer.tsx) 的"清除预览"按钮仅 `setQuickAddMatches([])`，但 [TaskComposer.tsx:77-93](file:///d:/Projects/ToDo/src/components/app/TaskComposer.tsx) 的 `applyQuickAdd` 已把 `dueDate/dueTime/priority/projectId/reminderOffset` 写入表单字段。点"清除预览"后标签消失但日期/优先级仍是解析后的值，用户以为撤销了实际没有。

**[中等] 无实时输入预览，必须手动点「解析输入」**
[TaskComposer.tsx:177](file:///d:/Projects/ToDo/src/components/app/TaskComposer.tsx) 的 `applyQuickAdd` 仅由 Wand2 按钮触发，输入框 `onChange` 只清 `parseFeedback`，没有防抖自动解析。

### 1.3 键盘可访问性与无障碍

**[严重] TaskDetailPane 未保存确认对话框非 Radix 实现，无焦点陷阱/Esc/聚焦**
[TaskDetailPane.tsx:507-525](file:///d:/Projects/ToDo/src/components/app/TaskDetailPane.tsx) 是手写 `<div role="dialog">`，Tab 会跑到背景表单、Esc 不关闭、打开后焦点不在任何按钮上。同样 [OverviewView.tsx:362-376](file:///d:/Projects/ToDo/src/components/app/OverviewView.tsx) 的 saved-view 菜单也是手写浮层无 outside-click 处理。

**[严重] 任务列表无键盘导航（j/k 切换、Enter 打开、Space 完成）**
[TaskList.tsx:105-206](file:///d:/Projects/ToDo/src/components/app/TaskList.tsx) 的 `<article>` 与内部按钮均无 `onKeyDown`、`tabIndex`、`role="listitem"`。Tab 只能逐个走，无上下键浏览，快捷完成缺失。

**[中等] 部分图标按钮仅 `title` 无 `aria-label`**
[WorkspacesView.tsx:333,375,385](file:///d:/Projects/ToDo/src/components/app/WorkspacesView.tsx) 和 [ProjectsView.tsx:256](file:///d:/Projects/ToDo/src/components/app/ProjectsView.tsx) 多处 `title=` 无 `aria-label`；[TaskDetailPane.tsx:269](file:///d:/Projects/ToDo/src/components/app/TaskDetailPane.tsx) 未保存状态点是纯装饰 `<span>` 无可访问性语义。

### 1.4 错误反馈与可恢复操作

**[严重] 无全局 ErrorBoundary，运行时渲染错误直接白屏**
[main.tsx:10-14](file:///d:/Projects/ToDo/src/main.tsx) 仅 `<React.StrictMode><App/></React.StrictMode>`，[App.tsx:28-40](file:///d:/Projects/ToDo/src/App.tsx) 只处理 `useTodos` 初始加载错误且要求 `!data`。任意子组件抛错会导致整树卸载白屏，桌面端用户无恢复入口。

**[中等] Undo toast 仅覆盖 4 类操作，无键盘快捷键**
[AppShell.tsx:129-148](file:///d:/Projects/ToDo/src/components/app/AppShell.tsx) 只对 `deleteTask`/`deleteWorkspaceFolder`/`archiveProject`/`deleteWorkspace` 包装 showUndo。缺失 `deleteSavedView`、`disableReminder` 等；[AppShell.tsx:574-586](file:///d:/Projects/ToDo/src/components/app/AppShell.tsx) toast 只能鼠标点"撤销"，无 `Ctrl+Z`、无 Esc、8 秒后静默消失。

**[中等] 命令面板「打开文件夹」失败完全静默**
[AppShell.tsx:167-173](file:///d:/Projects/ToDo/src/components/app/AppShell.tsx) 的 `openFolder` catch 块为空，从命令面板触发 ([commandPalette.ts:88-91,100](file:///d:/Projects/ToDo/src/data/commandPalette.ts)) 失败时无任何 toast/banner。

### 1.5 桌面实机验证状态

**[严重] 桌面实机验证完全未执行/未记录**
[docs/DESKTOP_VALIDATION.md](file:///d:/Projects/ToDo/docs/DESKTOP_VALIDATION.md) 是清单而非已完成报告，无任何勾选记录。通知权限拒绝路径、托盘恢复焦点、悬浮窗真实失效路径、stale folder path 失败提示等关键路径仅靠代码推断。

### 1.6 任务列表与详情面板流畅度

**[严重] 无拖拽排序、无批量选择、无多选操作**
全仓 grep `batch|selectAll|multiSelect|selectedIds` 0 匹配。[TaskList.tsx](file:///d:/Projects/ToDo/src/components/app/TaskList.tsx) 无 checkbox 多选、无全选、无批量完成/删除/移动项目；`Task` 类型无 `sortOrder`/`pinned` 字段，无拖拽实现。

**[中等] 列表为「加载更多」按钮，无无限滚动**
[TaskList.tsx:209-227](file:///d:/Projects/ToDo/src/components/app/TaskList.tsx) 仅一个 button，无 `IntersectionObserver` 自动加载。

**[中等] 详情面板切换任务时未保存内容丢失**
[TaskDetailPane.tsx:210-224](file:///d:/Projects/ToDo/src/components/app/TaskDetailPane.tsx) `requestClose`/`requestDelete` 才检查 isDirty，但用户在详情面板编辑后直接点侧栏切换视图或选另一任务，`selectedTaskId` 变化触发 `useEffect`（[TaskDetailPane.tsx:58-74](file:///d:/Projects/ToDo/src/components/app/TaskDetailPane.tsx)）直接重置表单，未保存内容丢失且无提示。

**[中等] 详情面板底部三按钮无键盘快捷键**
[TaskDetailPane.tsx:485-502](file:///d:/Projects/ToDo/src/components/app/TaskDetailPane.tsx) 完成/保存/删除仅鼠标，无 `Ctrl+S` 保存、`Ctrl+Enter` 完成。

### 1.7 国际化与本地化

**[严重] 全程无 IME 输入法组合态处理，中文输入与快捷键冲突**
全仓无 `composition`/`isComposing` 业务匹配。[useCommandPalette.ts:142-160](file:///d:/Projects/ToDo/src/hooks/useCommandPalette.ts) 的 window 级 `matchesShortcut` 不检查 `event.nativeEvent.isComposing`，中文输入法组词期间可能误触快捷键。

**[中等] 命令面板命令的 keywords 仅有英文**
[commandPalette.ts:57-137](file:///d:/Projects/ToDo/src/data/commandPalette.ts) 的 keywords 都是 `["add","create"]`、`["find","search"]` 等，中文用户搜"添加"找不到"新建任务"。

**[中等] 后端托盘文案未本地化**
[lib.rs:748-752](file:///d:/Projects/ToDo/src-tauri/src/lib.rs) tray 菜单硬编码 "Open WhatToDo"/"Quit"、tooltip "WhatToDo"，中文用户在系统托盘看到的是英文。

### 1.8 改进建议清单（交互维度）

**P0 严重**：
1. 修复全局快捷键内联闭包导致的反复注册与双触发（[AppShell.tsx:234](file:///d:/Projects/ToDo/src/components/app/AppShell.tsx) + [useGlobalShortcuts.ts:51](file:///d:/Projects/ToDo/src/hooks/useGlobalShortcuts.ts)）
2. 引入全局 `ErrorBoundary`（[main.tsx](file:///d:/Projects/ToDo/src/main.tsx) 或 [App.tsx](file:///d:/Projects/ToDo/src/App.tsx)）
3. 扩展 [quickAdd.ts](file:///d:/Projects/ToDo/src/data/quickAdd.ts) 中文日期解析并修复"清除预览"不回滚字段问题
4. 为 TaskList 增加键盘导航 + 多选批量操作
5. 按清单逐项执行桌面实机验证并记录结果

**P1 中等**：
6. TaskDetailPane 未保存确认弹窗与 OverviewView saved-view 菜单改用 Radix Dialog/Popover
7. Undo toast 扩展覆盖 + `Ctrl+Z` + Esc 关闭
8. `openFolder` 失败统一反馈
9. 切换任务时未保存提示
10. 命令面板新增「切换主题/语言」命令 + keywords 补中文同义词
11. 后端托盘菜单本地化
12. 列表无限滚动 + 详情面板 `Ctrl+S` 保存

**P2 轻微**：
13. 全部 icon-only 按钮补 `aria-label`
14. IME `isComposing` 守卫加到所有 keydown handler
15. `useGlobalShortcuts` 清理竞态与重复 `unregisterAll` 修正

---

## 二、程序功能丰富性和完整性

### 2.1 重复任务规则

**[严重] 频率支持严重不全，interval 字段被锁死为 1**
[types.ts:15](file:///d:/Projects/ToDo/src/data/types.ts) `RecurrenceFrequency = "daily" | "weekly" | "monthly"` 缺 `yearly`；[recurrence.ts:33-47](file:///d:/Projects/ToDo/src/data/recurrence.ts) `getNextRecurrenceDate` 无 yearly 分支、无 BYDAY/BYMONTHDAY 规则；[repository.ts:1877](file:///d:/Projects/ToDo/src/data/repository.ts) `createRecurringTemplate` 中 `interval: 1` 硬编码，UI 也无 interval 输入控件。

**[严重] 不支持"每周一三五""每月最后一天""每月第N个周X"**
[recurrence.ts:38-39](file:///d:/Projects/ToDo/src/data/recurrence.ts) weekly 分支只是简单 `addDays`，无 weekdays 数组；[recurrence.ts:23-31](file:///d:/Projects/ToDo/src/data/recurrence.ts) `nextMonthlyDate` 只是 clamp 到月末，无法表达"最后一个周五"或"第二个周一"。

**[严重] "更新未来重复实例"并未真正同步已生成的未来实例**
[TaskDetailPane.tsx:159-188](file:///d:/Projects/ToDo/src/components/app/TaskDetailPane.tsx) `updateFutureRepeats` 仅调用 `actions.updateRecurringTaskTemplate`；[repository.ts:664-672](file:///d:/Projects/ToDo/src/data/repository.ts)（Local）和 [1393-1421](file:///d:/Projects/ToDo/src/data/repository.ts)（SQL）的 `updateRecurringTaskTemplate` 只更新模板记录本身，**不更新已生成的未来 Task 实例**。

**[中等] 删除未完成重复实例不生成下一个**
[repository.ts:811-817](file:///d:/Projects/ToDo/src/data/repository.ts)（Local）、[1532-1536](file:///d:/Projects/ToDo/src/data/repository.ts)（SQL）只在 `toggleTask` 完成时触发下一实例生成，直接 `deleteTask` 一个未完成重复实例不会生成下一个，重复链可能断裂。

### 2.2 提醒系统

**[严重] 提醒历史不完整，仅记录最后一次失败**
[types.ts:95-106](file:///d:/Projects/ToDo/src/data/types.ts) `Reminder` 类型只有单值字段 `failedAt`/`lastError`/`lastAttemptedAt`/`firedAt`，无 `attempts: ReminderAttempt[]` 时间线数组。每次失败覆盖前一次 ([repository.ts:841-850,1554-1563](file:///d:/Projects/ToDo/src/data/repository.ts))，无法回溯触发/关闭/稍后/重试/成功的完整历史。

**[严重] 一个任务只能有一个提醒**
[repository.ts:751](file:///d:/Projects/ToDo/src/data/repository.ts) `updateTaskReminder` 用 `find()` 取第一个；SQL 版 [repository.ts:1484-1488](file:///d:/Projects/ToDo/src/data/repository.ts) 用 `LIMIT 1`；`createReminder` ([repository.ts:1842-1859](file:///d:/Projects/ToDo/src/data/repository.ts)) 只创建单条。用户无法为同一任务设置"提前1天"和"提前1小时"两个提醒。

**[严重] 无失败重试策略，无指数退避，无最大重试次数**
[useReminders.ts:118-120](file:///d:/Projects/ToDo/src/hooks/useReminders.ts) tick 间隔固定 30 秒，失败提醒被 [useReminders.ts:21](file:///d:/Projects/ToDo/src/hooks/useReminders.ts) 的 `dueRemindersForData` 排除，不会自动重试。用户必须手动点击"重试"。

**[严重] 通知不支持点击跳转任务**
[useReminders.ts:97-102](file:///d:/Projects/ToDo/src/hooks/useReminders.ts) `onOpenTask(task.id)` 在发送通知后**立即**执行，不等用户点击通知。[lib.rs:728-789](file:///d:/Projects/ToDo/src-tauri/src/lib.rs) 未注册 `tauri-plugin-notification` 的 `on_notification` 回调。

**[中等] 提醒提前量/稍后选项固定不可自定义**
[TaskDetailPane.tsx:26](file:///d:/Projects/ToDo/src/components/app/TaskDetailPane.tsx) `reminderOffsetOptions = [10, 30, 60, 1440]`；[reminderCenter.ts:81-94](file:///d:/Projects/ToDo/src/data/reminderCenter.ts) 稍后选项固定 10分钟/1小时/明天9点。

### 2.3 保存视图管理

**[严重] 过滤条件不支持复合条件（OR/NOT/嵌套）**
[types.ts:108-115](file:///d:/Projects/ToDo/src/data/types.ts) `TaskViewFilters` 所有条件是 AND 关系，无 OR、无 NOT、无嵌套分组。无标签过滤、无文本搜索过滤、无自定义日期范围（只有 today/week/overdue/all）。

**[中等] 缺少排序/置顶/手动排序**
[savedViews.ts](file:///d:/Projects/ToDo/src/data/savedViews.ts) 按 `createdAt DESC` 固定排序，[types.ts:117-124](file:///d:/Projects/ToDo/src/data/types.ts) `SavedTaskView` 类型无 `sortOrder`/`pinned` 字段。

实际已实现：创建/应用/重命名/覆盖过滤条件/设为默认/删除（见 [OverviewView.tsx:132-184](file:///d:/Projects/ToDo/src/components/app/OverviewView.tsx)）。

### 2.4 项目和工作区管理

**[中等] 项目编辑入口分散**
[ProjectEditDialog.tsx:61-65](file:///d:/Projects/ToDo/src/components/app/ProjectEditDialog.tsx) 只能改 name/dueDate/color，**不能改 workingFolder**（只能在 ProjectsView 单独面板中改）。`paused`/`completed` 状态 ([types.ts:9](file:///d:/Projects/ToDo/src/data/types.ts)) 完全无 UI 入口。

**[中等] 工作区编辑/删除入口**
[WorkspaceEditDialog.tsx](file:///d:/Projects/ToDo/src/components/app/WorkspaceEditDialog.tsx) 已实现创建/编辑/删除/切换，但恢复只在 Settings 恢复中心，主视图内无入口。

**[严重] Local 与 SQL 设置存储模型根本不一致**（详见维度三 3.1）

### 2.5 导入导出与备份

**[严重] 导入是破坏性覆盖，无预览无合并**
[repository.ts:911-915](file:///d:/Projects/ToDo/src/data/repository.ts)（Local）`importBackup` 直接 `this.data = normalizeBackupPayload(payload)` 替换全部数据；SQL 版 ([repository.ts:1649-1725](file:///d:/Projects/ToDo/src/data/repository.ts)) 先 `DELETE FROM` 所有表再插入。**无导入预览、无选择性合并、无冲突检测**。

**[严重] Schema 校验极其薄弱**
[repository.ts:2004-2007](file:///d:/Projects/ToDo/src/data/repository.ts) `normalizeBackupPayload` 只检查版本号，不校验数组是否存在、字段是否完整、类型是否正确。`{ "whattodoBackupVersion": 2 }` 的空对象会通过校验产生空数据覆盖。项目已依赖 `zod` ([package.json:48](file:///d:/Projects/ToDo/package.json)) 但**未在备份导入路径使用**。

**[严重] 无自动定期备份**
[SettingsView.tsx:176-187](file:///d:/Projects/ToDo/src/components/app/SettingsView.tsx) 只有手动"导出备份"按钮，[types.ts:126-135](file:///d:/Projects/ToDo/src/data/types.ts) `Settings` 类型无 `autoBackup*` 字段。

**[严重] ICS 导出不符合 RFC 5545**
[repository.ts:2054-2080](file:///d:/Projects/ToDo/src/data/repository.ts) `buildTasksIcs`：
- 无时区：`icsDate` 是 naive 时间，无 `TZID` 或 `Z` 后缀
- 无 VALARM：不导出提醒信息
- DTSTART 和 DTEND 相同（持续时间为 0）
- `STATUS:COMPLETED` 对 VEVENT 无效（RFC 5545 规定只能是 TENTATIVE/CONFIRMED/CANCELLED）
- 无 VTODO 支持

**[中等] CSV 导出字段不完整**
[repository.ts:2032-2049](file:///d:/Projects/ToDo/src/data/repository.ts) `buildTasksCsv` 只导出 8 列，缺少 taskId/completedAt/createdAt/reminderOffset/recurrence，无法重新导入。

**[中等] 文件 IO 无原子写入、无路径遍历防护**
[lib.rs:287-291](file:///d:/Projects/ToDo/src-tauri/src/lib.rs) `write_text_file` 直接 `fs::write`，写入中途崩溃产生损坏文件；[lib.rs:218-236](file:///d:/Projects/ToDo/src-tauri/src/lib.rs) `validate_text_file_path` 只检查扩展名不检查路径遍历。

### 2.6 任务核心字段与操作

**[严重] Task 字段严重不足**
[types.ts:54-72](file:///d:/Projects/ToDo/src/data/types.ts) `Task` 类型缺少：
- 子任务/检查清单：无 `parentId`/`subtasks`
- 标签：无 `tags: string[]`
- 附件：无 `attachments`
- 富文本描述：`notes: string` 是纯文本
- 预估时间/实际时间：无 `estimate`/`actual`
- 开始日期：只有 `dueDate`，无 `startDate`

**[严重] 完全没有批量操作**
[useTodos.ts:28-72](file:///d:/Projects/ToDo/src/hooks/useTodos.ts) `TodoActions` 所有操作都是单任务，无 `bulkComplete`/`bulkDelete`/`bulkMoveToProject`/`bulkUpdatePriority`/`bulkUpdateDueDate`。[TaskList.tsx](file:///d:/Projects/ToDo/src/components/app/TaskList.tsx) 无多选机制。

**[严重] 无拖拽排序、手动排序、置顶**
[types.ts:171](file:///d:/Projects/ToDo/src/data/types.ts) `TaskPageSort = "createdDesc" | "dueAsc" | "overview"` 三种固定排序，无 `manual`/`custom`，无 `priorityDesc`。Task 类型无 `sortOrder`/`pinned` 字段。

**[严重] 任务状态机过于简单**
[types.ts:11](file:///d:/Projects/ToDo/src/data/types.ts) `TaskStatus = "todo" | "completed"` 只有 2 个状态。缺少 `in_progress`/`blocked`/`cancelled`/`deferred`，无法表达"开始工作但未完成"或"因依赖阻塞"。

### 2.7 设置与个性化

**[中等] 缺少多项常用配置**
[types.ts:126-135](file:///d:/Projects/ToDo/src/data/types.ts) `Settings` 类型缺少：每周第一天、时间格式（12h/24h）、日期格式、自动备份配置、提醒声音、稍后提醒默认值、快捷键自定义。

### 2.8 搜索与筛选

**[中等] Home 视图搜索过于简陋**
[HomeView.tsx:47-56](file:///d:/Projects/ToDo/src/components/app/HomeView.tsx) 只搜 `title`，不搜 notes/dueTime/项目名，与 OverviewView 和 CommandPalette 的搜索范围不一致。

**[中等] CommandPalette 只搜当前工作区**
[AppShell.tsx:209-210](file:///d:/Projects/ToDo/src/components/app/AppShell.tsx) 非真正全局搜索。

### 2.9 改进建议清单（功能维度）

**高优先级（严重项）**：
1. 扩展 `RecurrenceRule` 增加 `byWeekday`/`byMonthDay`/`weekOfMonth`/`count`，实现 RRULE 风格日期计算，添加 `yearly` 频率
2. 让 `interval` 可配置，移除 [repository.ts:1877](file:///d:/Projects/ToDo/src/data/repository.ts) 的硬编码 `interval: 1`
3. 在 `updateRecurringTaskTemplate` 中批量更新所有未完成未来 Task 实例的可变字段
4. 新建 `ReminderAttempt` 类型与 `reminder_attempts` 表，提醒历史改追加而非覆盖
5. 移除 `updateTaskReminder` 的单提醒限制，UI 支持多提醒
6. 自动重试 + 指数退避：`Reminder` 增加 `retryCount`/`nextRetryAt`，tick 中自动重试 `2^retryCount * 60s`
7. 通知点击跳转：`sendNotification` 传 `data: { taskId }`，lib.rs 注册 `on_notification_click` 事件
8. 重构 `TaskViewFilters` 为 `FilterGroup` 树形结构支持嵌套
9. 安全导入：预览模式 + 选择性合并 + zod schema 校验
10. 自动备份：Settings 增加配置项 + Tauri 后端定时任务
11. 修复 ICS 导出：VTIMEZONE + VALARM + VTODO 或修正 STATUS
12. Task 增加 `parentId`/`tags`/`attachments`，新建 `attachments` 表
13. 批量操作：TodoActions 增加批量方法 + TaskList 多选模式
14. 扩展状态机：`todo`/`in_progress`/`blocked`/`completed`/`cancelled`

**中优先级**：手动排序/置顶字段、统一搜索、跨工作区全局搜索、ProjectEditDialog 补 workingFolder、原子文件写入、CSV 字段补全、设置补全。

---

## 三、项目架构鲁棒性和稳定性

### 3.1 LocalRepository 与 SqlRepository 语义对齐

**[严重] 设置存储模型根本不一致（per-workspace vs global）**
- [repository.ts:1245-1272](file:///d:/Projects/ToDo/src/data/repository.ts) `SqlRepository.saveSettings`：settings 表以 workspace_id 为主键，按工作区存储
- [repository.ts:557-560](file:///d:/Projects/ToDo/src/data/repository.ts) `LocalRepository.saveSettings`：单一全局 `this.data.settings`，整体写入 localStorage
- [repository.ts:907-909](file:///d:/Projects/ToDo/src/data/repository.ts) Local 的 `exportBackup` 只导出 `{ [this.workspaceId]: this.data.settings }`，**丢失其他工作区设置**

违反 AGENTS.md 第 15 行"LocalRepository 和 SqlRepository should behave consistently"。

**[严重] importBackup 设置处理数据丢失**
[repository.ts:2023](file:///d:/Projects/ToDo/src/data/repository.ts) `normalizeBackupPayload` 只保留选中工作区的 settings，丢弃其余；SQL 版 [repository.ts:1670-1672](file:///d:/Projects/ToDo/src/data/repository.ts) 保留全部。

**[严重] createWorkspace 设置初始化不一致**
[repository.ts:461-475](file:///d:/Projects/ToDo/src/data/repository.ts)（Local）新工作区继承当前全局 settings；[repository.ts:1161-1174](file:///d:/Projects/ToDo/src/data/repository.ts)（SQL）调用 `insertSettings(db, id, DEFAULT_SETTINGS)` 重置为默认。

**[中等] moveTaskToWorkspace 校验不一致**
[repository.ts:685](file:///d:/Projects/ToDo/src/data/repository.ts)（Local）有 `resolveWorkspaceId` 校验；[repository.ts:1431](file:///d:/Projects/ToDo/src/data/repository.ts)（SQL）无校验，由于 FK 未启用可制造孤儿任务。

**[中等] 事务覆盖范围不对等**
`SqlRepository` 仅 5 个方法用 `withTransaction`；`createWorkspace` ([repository.ts:1166-1171](file:///d:/Projects/ToDo/src/data/repository.ts))、`deleteSavedView` ([repository.ts:1603-1614](file:///d:/Projects/ToDo/src/data/repository.ts)) 等多语句操作无事务保护。LocalRepository 通过单次 `persist()` 天然原子。

### 3.2 SqlRepository 测试覆盖

**[严重] SqlRepository 测试严重不足（2 vs 11）**
[repository.test.ts](file:///d:/Projects/ToDo/src/data/repository.test.ts) 中 `LocalRepository` 有 11 个用例，`SqlRepository` **仅 2 个**："updates snoozed and disabled reminder fields" 和 "loads task pages with SQL filters and reminder rows"。

完全未覆盖：重复任务、备份导入、保存视图、失败提醒、workspace 过滤、软删除恢复、批量操作、事务回滚、createWorkspace 设置初始化、moveTaskToWorkspace 孤儿数据。

**[中等] useReminders hook 本身无测试**
[useReminders.test.ts](file:///d:/Projects/ToDo/src/hooks/useReminders.test.ts) 仅测试纯函数 `dueRemindersForData`，未测试 tick 并发控制、permission denied 回退、markReminderFailed 调用路径。

### 3.3 错误处理与失败恢复

**[严重] 无 React ErrorBoundary**（同维度一）

**[严重] useReminders 外层 catch 静默吞掉所有错误**
[useReminders.ts:110-111](file:///d:/Projects/ToDo/src/hooks/useReminders.ts) `} catch { return; }` —— `isPermissionGranted()`、`requestPermission()`、`dueRemindersForData` 任何抛错都被完全静默，用户无任何反馈。

**[中等] Tauri 命令错误暴露不充分**
[lib.rs:272-275](file:///d:/Projects/ToDo/src-tauri/src/lib.rs) `set_close_to_tray` 返回 `()` 而非 `Result`，无法向 frontend 传递失败。[lib.rs:293-449](file:///d:/Projects/ToDo/src-tauri/src/lib.rs) `open_workspace_window` 大量 `let _ =` 静默忽略失败。

**[中等] repository.ts 非事务方法无回滚**
`createWorkspace` 若 `insertSettings` 失败，workspace 已插入无回滚；`deleteSavedView` DELETE + 可能的 saveSettings 无事务。[useTodos.ts:80-91](file:///d:/Projects/ToDo/src/hooks/useTodos.ts) `run` 失败时不回滚 UI 状态。

### 3.4 Tauri 安全边界

**[严重] read_text_file/write_text_file 路径无范围限制**
[lib.rs:218-236](file:///d:/Projects/ToDo/src-tauri/src/lib.rs) `validate_text_file_path` 仅校验非空 + 扩展名，**不限制路径范围**。可读取/覆写系统任意 `.json/.csv/.ics/.txt` 文件。

**[中等] CSP 包含开发服务器地址**
[tauri.conf.json:25](file:///d:/Projects/ToDo/src-tauri/tauri.conf.json) `connect-src` 含 `http://127.0.0.1:5173 ws://127.0.0.1:5173`，生产环境若本机运行恶意 5173 服务可被诱导连接。`*.githubusercontent.com` 通配符较宽。

**[中等] capabilities 给 frontend 全 SQL 权限**
[capabilities/default.json:18-21](file:///d:/Projects/ToDo/src-tauri/capabilities/default.json) `sql:allow-load`/`execute`/`select` 全部授予，任何 XSS 可执行任意 SQL（含 DELETE/DROP）。

### 3.5 数据迁移与版本管理

**[严重] 迁移失败直接重置数据库（数据全毁）**
[lib.rs:686-693](file:///d:/Projects/ToDo/src-tauri/src/lib.rs) 迁移失败后 `reset_database(&db_path)` 删除 db + wal + shm 重新创建空库，**无自动备份**。仅通过 `db-reset` 事件 ([lib.rs:778](file:///d:/Projects/ToDo/src-tauri/src/lib.rs)) 通知 frontend 显示 banner。

**[严重] 迁移不可回滚**
[lib.rs:473-526](file:///d:/Projects/ToDo/src-tauri/src/lib.rs) `apply_migrations` 仅向前迁移，无 DOWN 脚本。一旦迁移应用无法回退（降级应用会因 schema 不匹配而崩溃）。

**[中等] 推断已应用迁移的逻辑脆弱**
[lib.rs:528-603](file:///d:/Projects/ToDo/src-tauri/src/lib.rs) `infer_applied_migrations` 通过检查表/列/索引是否存在推断版本，部分应用会导致推断错误，`bootstrap_migration_tracking` 记录后该迁移永不会重跑，留下不一致 schema。

**[中等] ALTER TABLE 无幂等保护**
[lib.rs:81-83](file:///d:/Projects/ToDo/src-tauri/src/lib.rs) `ADD_PROJECT_WORKING_FOLDER_SQL` 等 ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS，迁移表损坏重跑会因"column already exists"失败 → 触发数据库重置。

### 3.6 类型安全

**[中等] SQL 结果类型断言无运行时校验**
[repository.ts:243-261](file:///d:/Projects/ToDo/src/data/repository.ts) `rowToTask` 用 `row.priority as Task["priority"]` unsafe 断言；[repository.ts:297-308](file:///d:/Projects/ToDo/src/data/repository.ts) `rowToSavedTaskView` 的 `JSON.parse(String(row.filters_json))` 无 try/catch，损坏的 filters_json 会导致整个 readAll 失败。

**[轻微] i18n key 无类型约束**
[i18n/index.ts:7-580](file:///d:/Projects/ToDo/src/i18n/index.ts) 未做 `declare module 'i18next'` 类型增强，`t("nonExistentKey")` 不报编译错误。

### 3.7 并发与竞态

**[严重] SQLite 未启用 WAL 模式 + 单连接 + FK 未启用**
[repository.ts:1735-1738](file:///d:/Projects/ToDo/src/data/repository.ts) `this.db ??= await Database.load(DB_URL)` 单连接懒加载，全文 grep `PRAGMA|journal_mode|WAL|foreign_keys` 无业务匹配（[lib.rs:542](file:///d:/Projects/ToDo/src-tauri/src/lib.rs) 仅 `PRAGMA table_info`）。

后果：
- 默认 DELETE journal mode，写时阻塞读，频繁写入冻结 UI 查询
- FK 定义形同虚设，`moveTaskToWorkspace` 可制造孤儿任务，删除 workspace 不级联
- 主窗口与浮窗两个 Webview 各自 `Database.load` 同一 DB，无 `busy_timeout` 会立即报 `SQLITE_BUSY`

**[中等] useTodos mutation 无队列/取消**
[useTodos.ts:80-91](file:///d:/Projects/ToDo/src/hooks/useTodos.ts) `run` 无 mutex，连续 `createTask` 两次并发，第二个 `setData(next)` 可能覆盖第一个结果。`selectWorkspace` ([useTodos.ts:143](file:///d:/Projects/ToDo/src/hooks/useTodos.ts)) 快速切换多个 `readAll()` 竞态。无 AbortController 取消机制。

### 3.8 测试基础设施

**[中等] 测试 setup 极简**
[test/setup.ts](file:///d:/Projects/ToDo/src/test/setup.ts) 仅 16 行，只 mock `window.matchMedia`。无 MSW、无 Tauri API 全局 mock 层（各测试自行 mock `@tauri-apps/plugin-sql`）。

**[中等] 无集成/E2E 测试**
无端到端测试（无 Playwright/Cypress 依赖），无"Tauri command → SQLite → repository → hook → component"全链路集成测试。

**[中等] 无覆盖率配置 / CI 未跑 lint/clippy**
[vite.config.ts:18-22](file:///d:/Projects/ToDo/vite.config.ts) `test` 配置无 `coverage` 字段；[ci.yml:67-74](file:///d:/Projects/ToDo/.github/workflows/ci.yml) 仅 `pnpm test`、`pnpm build`、`cargo check`，无 `pnpm lint`、`cargo clippy`、`pnpm audit`。[package.json:6-19](file:///d:/Projects/ToDo/package.json) 也无 lint 脚本。

**[轻微] 无 Rust 侧测试**
[src-tauri/src/lib.rs](file:///d:/Projects/ToDo/src-tauri/src/lib.rs) 无 `#[cfg(test)] mod tests`，CI 仅 `cargo check`。

### 3.9 构建与发布

**[中等] release-check.mjs 不校验公钥与私钥匹配**
[release-check.mjs:29-35](file:///d:/Projects/ToDo/scripts/release-check.mjs) 仅检查 `pubkey` 非空和 `endpoints` 非空，不验证 pubkey 与签名私钥是否匹配。私钥轮换但未更新 pubkey 时签名产物无法被 updater 验证。

**[中等] release-build.mjs 默认密码空串**
[release-build.mjs:12](file:///d:/Projects/ToDo/scripts/release-build.mjs) `env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= ""`，密码为空静默通过可能掩盖配置缺失。

### 3.10 改进建议清单（架构维度）

**P0 严重**：
1. 修复 Local/SQL 设置一致性：Local 改为 `Record<string, Settings>` 按 workspaceId 索引，`exportBackup`/`importBackup` 保留全部
2. 引入全局 React ErrorBoundary
3. [useReminders.ts:110](file:///d:/Projects/ToDo/src/hooks/useReminders.ts) `catch {}` 改为记录错误并回调
4. `validate_text_file_path` 增加路径范围限制
5. 迁移失败前自动导出当前 DB 为备份文件
6. 初始化 DB 时执行 `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;`
7. 为 SqlRepository 补齐与 LocalRepository 一一对应的对等用例

**P1 中等**：
8. `withTransaction` 用 `SAVEPOINT` 支持嵌套；`createWorkspace`/`deleteSavedView` 等多语句操作统一包裹事务
9. `moveTaskToWorkspace` 增加校验防止孤儿数据
10. 生产 CSP 移除 dev server 地址
11. `infer_applied_migrations` 改为逐列检查迁移内所有 schema 变更
12. ALTER TABLE 迁移用 `BEGIN; ALTER...; COMMIT;` 包裹并捕获"duplicate column"错误
13. `normalizeBackupPayload` 用 zod schema 校验
14. `rowToTask` 等用 guard 校验枚举字段
15. `useTodos.run` 引入请求序列号 + AbortController
16. package.json 增加 `lint` 脚本，CI 增加 lint/clippy/audit
17. `release-check.mjs` 增加公钥/私钥匹配校验

---

## 四、程序运行效率

### 4.1 Repository 全量读取问题（致命瓶颈）

**[严重] 33 个 mutation 全部触发 readAll（8 条 SELECT），单次 toggleTask 触发 16 条 SQL**
[repository.ts](file:///d:/Projects/ToDo/src/data/repository.ts) 中所有 mutation 方法（共约 33 个）在尾部都调用 `this.readAll()` 返回完整 AppData。readAll 每次执行 **8 条串行 SELECT**（[repository.ts:1742-1781](file:///d:/Projects/ToDo/src/data/repository.ts)），含**当前 workspace 全部未删除任务（20k 行）**。

**单次 `toggleTask` 端到端流程**：
1. `SqlRepository.toggleTask` 内部先 `readAll()`（8 条 SELECT）找当前任务 ([repository.ts:1509](file:///d:/Projects/ToDo/src/data/repository.ts))
2. 执行 UPDATE
3. 再次 `readAll()` 返回（[repository.ts:1529](file:///d:/Projects/ToDo/src/data/repository.ts)），共 **16 条 SELECT**
4. `useTodos` 的 `setData(next)` 替换整个 AppData ([useTodos.ts:83](file:///d:/Projects/ToDo/src/hooks/useTodos.ts))
5. OverviewView 的 `useTaskPage({ reloadKey: data.tasks })` ([OverviewView.tsx:108](file:///d:/Projects/ToDo/src/components/app/OverviewView.tsx)) 检测到新引用，重新 `loadTaskPage(0)`，又 **3 条 SELECT**
6. 整棵组件树重渲染

**单次勾选 = 19 条 SQL 查询 + 全量重渲染。**

**[严重] 6 个方法双重 readAll（先查后改后返回）**
- `updateWorkspace` ([repository.ts:1177+1191](file:///d:/Projects/ToDo/src/data/repository.ts))
- `updateProject` ([repository.ts:1302+1316](file:///d:/Projects/ToDo/src/data/repository.ts))
- `updateRecurringTaskTemplate` ([repository.ts:1394+1420](file:///d:/Projects/ToDo/src/data/repository.ts))
- `updateTask` ([repository.ts:1443+1468](file:///d:/Projects/ToDo/src/data/repository.ts))
- `updateTaskReminder` ([repository.ts:1472+1481](file:///d:/Projects/ToDo/src/data/repository.ts))
- `toggleTask` ([repository.ts:1509+1529](file:///d:/Projects/ToDo/src/data/repository.ts))

### 4.2 SQL 查询效率

**[严重] readAll 的 tasks 查询缺复合索引**
[repository.ts:1755-1757](file:///d:/Projects/ToDo/src/data/repository.ts) 用 `ORDER BY created_at DESC`，现有复合索引是 `(workspace_id, deleted_at, due_date)` 与 `(workspace_id, deleted_at, status)`，**没有 `(workspace_id, deleted_at, created_at)`**，ORDER BY 需要额外排序步骤。20k 行排序有成本。

**[中等] 全部 SELECT *，列表读取 notes/timezone 等无用字段**
readAll 的 8 条查询、loadAvailableTasks ([repository.ts:1021](file:///d:/Projects/ToDo/src/data/repository.ts))、loadRecoveryItems ([repository.ts:1031-1047](file:///d:/Projects/ToDo/src/data/repository.ts))、loadTaskPage 主查询 ([repository.ts:1135](file:///d:/Projects/ToDo/src/data/repository.ts))、exportBackup 的 8 条查询 ([repository.ts:1618-1637](file:///d:/Projects/ToDo/src/data/repository.ts)) 全部 `SELECT *`，列表渲染只需 id/title/dueDate/dueTime/priority/status/projectId 等少量字段，notes 应在 TaskDetailPane 打开时单独按 id 懒加载。

**[中等] readAll 8 条 SELECT 串行，未 Promise.all 并行**
[repository.ts:1742-1781](file:///d:/Projects/ToDo/src/data/repository.ts) 逐条 `await`，无 `Promise.all` 并行化。

### 4.3 前端渲染效率

**[严重] 列表无虚拟化，loadMore 累加不清退，20k 全加载 DOM 崩溃**
[TaskList.tsx:100](file:///d:/Projects/ToDo/src/components/app/TaskList.tsx) `visibleTasks.map(...)` 把所有传入的 tasks 一次性渲染为 DOM `<article>` 节点。[useTaskPage.ts:82](file:///d:/Projects/ToDo/src/hooks/useTaskPage.ts) loadMore 把新页 `[...current.tasks, ...next.tasks]` 累加，**无淘汰机制**。用户连续点 10 次 loadMore 后 DOM 里有 1500 个节点，20k 任务全加载后 = 20000 个 DOM 节点，会卡死。

**[严重] TaskList 未 React.memo**
[TaskList.tsx:49](file:///d:/Projects/ToDo/src/components/app/TaskList.tsx) `export function TaskList` 未用 React.memo 包裹。父组件每次重渲染整个列表重渲染，即使 props 相同。

**[严重] 状态管理：单一 AppData blob，无 selector，mutation 后全树重渲染**
[useTodos.ts:76,83](file:///d:/Projects/ToDo/src/hooks/useTodos.ts) 用单个 `useState<AppData | null>`，所有 mutation 通过 `setData(next)` 替换整个 AppData。**没有 selector、没有 context 拆分、没有 zustand/jotai 原子订阅**。AppShell 把 `data` 透传给所有视图，每次 mutation 全部重渲染。例如用户在 ReminderCenterView snooze 一个提醒 → HomeView（不可见）也重渲染。

**[严重] readAll → useTaskPage reloadKey=data.tasks 级联**
[OverviewView.tsx:108](file:///d:/Projects/ToDo/src/components/app/OverviewView.tsx)、[ProjectsView.tsx:98](file:///d:/Projects/ToDo/src/components/app/ProjectsView.tsx)、[WorkspaceFloatingWindow.tsx:42](file:///d:/Projects/ToDo/src/components/app/WorkspaceFloatingWindow.tsx) 都把 `data.tasks` 整个数组作为 `reloadKey`，每次 readAll 返回新引用 → loadTaskPage 重跑整页。

**[中等] buildAppIndexes 在 AppShell + HomeView 重复构建两份**
[AppShell.tsx:153](file:///d:/Projects/ToDo/src/components/app/AppShell.tsx) 与 [HomeView.tsx:40](file:///d:/Projects/ToDo/src/components/app/HomeView.tsx) 各 `useMemo(() => buildAppIndexes(data), [data])` 一次。每次 readAll 返回新 data → buildAppIndexes 重跑 O(n) → 重建 5 个 Map/Set。20k 任务下每次 mutation 都做一次 20k 元素 Map 构建，且两处重复。

**[中等] OverviewView counts 对全部 tasks 做 3 次遍历**
[OverviewView.tsx:82-90](file:///d:/Projects/ToDo/src/components/app/OverviewView.tsx) all/open/completed/overdue 各 filter 一次，可合并为单次 reduce。

**[中等] DatePane taskCountsByDate 每次 data 变化对全量 tasks reduce**
[DatePane.tsx:30](file:///d:/Projects/ToDo/src/components/app/DatePane.tsx) + [date.ts:85-93](file:///d:/Projects/ToDo/src/data/date.ts) 20k 任务下每次 mutation 都跑一遍 O(n)。

**[中等] TaskDetailPane effect 依赖 reminders 数组，mutation 后重置表单**
[TaskDetailPane.tsx:58-74](file:///d:/Projects/ToDo/src/components/app/TaskDetailPane.tsx) useEffect 依赖 `[reminders, settings.defaultReminderOffset, task]`，readAll 后 reminders 引用变化 → effect 触发 → `setTitle/setNotes/setDueDate/...` 全部重置为 task 原值。**若用户正在编辑未保存，mutation（哪怕是别的 task 的 toggle）会清空当前输入**。

### 4.4 SQLite 配置

**[严重] 无 WAL 模式、无 busy_timeout**（同维度三 3.7）

### 4.5 大数据集验证状态

**[严重] 20k 桌面验证全部 not run，仅测 bundle 体积**
[PERFORMANCE_VALIDATION.md:17-22](file:///d:/Projects/ToDo/docs/PERFORMANCE_VALIDATION.md) 手动桌面检查全部 "not run"。[perf-baseline.mjs:43-45](file:///d:/Projects/ToDo/scripts/perf-baseline.mjs) 只测 bundle 体积不测运行时性能。**即：20k 任务的真实桌面运行性能从未被验证过**，所有性能假设都是纸面推断。

### 4.6 内存与资源释放

**[中等] useGlobalShortcuts 依赖不稳定回调可能导致频繁 register/unregister**
[useGlobalShortcuts.ts:51](file:///d:/Projects/ToDo/src/hooks/useGlobalShortcuts.ts) 依赖 `[onNewTask, onOpenPalette, onSearchTasks]`，AppShell 传入的回调若不稳定 effect 会反复重建。

**[中等] useTaskPage loadMore 累积无淘汰，20k 全驻留内存**
[useTaskPage.ts:82](file:///d:/Projects/ToDo/src/hooks/useTaskPage.ts) 累积无淘汰，20k 全加载后 20k 个 Task 对象 + Reminder 全部驻留 React state。

### 4.7 Bundle 与依赖

**[中等] radix-ui 元包与 @radix-ui/* 单包并存可能重复打包**
[package.json:22-25,40](file:///d:/Projects/ToDo/package.json) 同时有 `@radix-ui/react-dialog` 等子包和 `"radix-ui": "^1.4.3"` 元包，若代码同时从两处 import Tree-shaking 可能无法去重。

**[轻微] shadcn CLI 误放 dependencies、tw-animate-css 可移 devDependencies**
[package.json:45,47](file:///d:/Projects/ToDo/package.json)。**[轻微] zod 可能未使用** ([package.json:48](file:///d:/Projects/ToDo/package.json))，需 `pnpm depcheck` 确认。

### 4.8 提醒中心与定时任务效率

**[轻微] 单次 tick 内 tasksById Map 构建两次**
[useReminders.ts:13+79](file:///d:/Projects/ToDo/src/hooks/useReminders.ts) `dueRemindersForData` 内部构建一次，外层又构建一次。

### 4.9 改进建议清单（效率维度，按 ROI 排序）

**第一优先级（投入小，收益巨大）**：
1. **mutation 返回局部对象而非 readAll**：改 `TodoRepository` 接口，snoozeReminder/markReminderFired/disableReminder/toggleTask/deleteTask 等返回 `Promise<Reminder | Task>`，用 SQLite `UPDATE ... RETURNING *` 取回单行。预计单次 mutation 的 SQL 从 16 条降到 1 条，20k 场景从 ~150ms 降到 < 5ms。
2. **断开 useTaskPage 的 reloadKey=data.tasks 级联**：改为 `reloadKey: data.tasks.length` 或显式 dirty 标志。否则即便修了第 1 点，每次 mutation 仍会重跑 loadTaskPage。
3. **开启 SQLite WAL + busy_timeout**：在 [lib.rs](file:///d:/Projects/ToDo/src-tauri/src/lib.rs) migration 第一步或 init_database 后执行 `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;`。解决浮窗双连接争用与写阻塞读。
4. **去掉双重 readAll**：updateTask/updateProject/toggleTask 等"先 readAll 找当前对象"改为直接 `SELECT * FROM tasks WHERE id=?` 单行查询（命中主键索引）。

**第二优先级（投入中等，收益显著）**：
5. TaskList 引入虚拟列表（`@tanstack/react-virtual` 或 `react-virtuoso`），只渲染可视区 ~20 行。
6. TaskList 包 React.memo，配合 props 引用稳定。
7. appIndexes 单例化：useTodos 内 `useMemo` 后通过 Context 暴露，删除重复构建。
8. readAll 的 8 条 SELECT 并行化 `Promise.all`。
9. SELECT * 收窄，TaskDetailPane 打开时单独 `SELECT notes FROM tasks WHERE id=?` 懒加载。
10. 补索引 `idx_tasks_workspace_deleted_created_at`。

**第三优先级（长期收益）**：
11. 状态管理重构：引入 zustand（或 useSyncExternalStore）按 slice 订阅，让 ReminderCenterView 只订阅 reminders。
12. mutation 增量索引：appIndexes 改为可变更新而非全量重建。
13. 运行时性能基准：新增 `scripts/perf-runtime.mjs` 驱动桌面 app 导入 20k fixture 测量 loadTaskPage/toggleTask/loadMore 耗时。
14. 清理依赖：shadcn→devDependencies，确认 zod 是否使用，统一 radix-ui import 来源。

**第四优先级（细节优化）**：
15. useReminders 去除双 Map 构建
16. TaskDetailPane effect 依赖收窄为 `[task?.id]`
17. useGlobalShortcuts 回调稳定化
18. OverviewView counts 合并遍历为单次 reduce

---

## 跨维度优先级矩阵

| 优先级 | 关键改进项 |
|---|---|
| **P0 立即修复** | 1. 引入全局 ErrorBoundary（维度一/三）<br>2. mutation 返回局部对象 + 断开 reloadKey 级联 + 开启 WAL（维度四）<br>3. 修复 Local/SQL settings 一致性（维度三）<br>4. 修复全局快捷键内联闭包导致的反复注册（维度一）<br>5. 修复 TaskDetailPane 切换任务时未保存内容丢失（维度一/四）<br>6. 迁移失败前自动备份（维度三） |
| **P1 计划修复** | 7. SqlRepository 测试补齐（维度三）<br>8. 扩展 quickAdd 中文日期解析（维度一）<br>9. 桌面实机验证（维度一）<br>10. TaskList 虚拟化 + React.memo（维度四）<br>11. 修复 ICS 导出标准合规（维度二）<br>12. 安全导入预览 + zod 校验（维度二）<br>13. 路径范围限制 + 生产 CSP 收紧（维度三） |
| **P2 功能补全** | 14. 重复任务规则扩展（interval/byWeekday/yearly）（维度二）<br>15. 提醒历史时间线 + 多提醒 + 通知点击跳转（维度二）<br>16. 批量操作 + 多选模式（维度一/二）<br>17. 任务字段扩展（子任务/标签/附件）（维度二）<br>18. 状态机扩展（in_progress/blocked/cancelled）（维度二） |
| **P3 长期优化** | 19. 状态管理重构（zustand 按 slice 订阅）（维度四）<br>20. 运行时性能基准与 CI 断言（维度四）<br>21. 复合过滤条件（FilterGroup 树）（维度二）<br>22. 自动备份（维度二）<br>23. E2E 测试与覆盖率门槛（维度三） |

---

## 报告说明

- 所有结论均基于 `d:\Projects\ToDo` 当前磁盘代码状态（截至 2026-06-26），未依赖文档承诺。
- 引用的文件路径与行号均可直接通过编辑器跳转复核。
- 项目核心结论：**WhatToDo 在基础 CRUD、数据持久化、迁移系统、workspace 隔离、undo 机制、分页 API 等方面做得扎实，但在「mutation→readAll 全量重读」性能瓶颈、「Local/SQL 一致性」、「重复规则/提醒/批量等任务管理领域深度」、「全局错误边界与桌面实机验证」上存在系统性不足**，需要按上述 P0→P3 优先级分阶段落地。
