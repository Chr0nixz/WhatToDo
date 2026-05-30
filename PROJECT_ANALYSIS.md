# WhatToDo 项目分析与下一步开发计划

更新时间：2026-05-30

## 1. 项目现状

WhatToDo 是一个本地优先的桌面任务与 DDL 管理应用，技术栈为 Tauri 2、React 19、TypeScript、Vite、Tailwind CSS 4 和 SQLite。产品方向保持清晰：围绕每日 DDL、项目任务、工作区、工作文件夹、系统提醒和提醒中心，降低桌面工作流里的切换成本。

当前代码结构：

- `src/data`：类型定义、日期工具、提醒中心分组、项目计算、repository 抽象与 Local/SQLite 实现。
- `src/hooks`：任务数据、主题、提醒 tick 等应用级逻辑。
- `src/components/app`：主页、总览、日期面板、任务详情、项目、工作区、提醒中心、设置等主要 UI。
- `src-tauri`：SQLite 迁移、系统托盘、悬浮窗、Tauri 插件集成。

目前已经完成两轮核心稳定性与提醒体验增强：

- 稳定性迭代：提醒时间正确性、批量到期提醒、提交防重复、删除确认、i18n/date 本地化、SQLite 索引迁移和关键自动化测试。
- 提醒中心迭代：新增提醒中心入口与视图，支持查看已错过、即将提醒、已触发提醒，并支持打开任务、完成任务、稍后提醒和关闭提醒。

## 2. 已完成能力

### 2.1 提醒与数据正确性

- 修复 SQLite `updateTask` 更新提醒时错误使用 `defaultReminderOffset` 的问题，现在按每条 reminder 自身的 `offsetMinutes` 重算 `remindAt`。
- `useReminders` 一次 tick 会处理所有已到期提醒，不再只触发第一条。
- 通知权限被拒绝后会关闭通知设置，避免持续重复请求。
- 到期提醒筛选排除了已完成任务、已删除任务、已触发提醒和未来提醒。
- repository 快照默认过滤软删除任务和项目，避免 UI 继续展示已删除数据。
- LocalRepository 与 SqlRepository 已有恢复类接口：`restoreTask`、`restoreWorkspaceFolder`。

### 2.2 提醒中心可操作版

新增提醒中心能力：

- `AppView` 已扩展 `reminders`，侧边栏新增提醒入口。
- `ReminderCenterView` 按 `effectiveAt = snoozedUntil ?? remindAt` 分组展示：
  - 已错过
  - 即将提醒
  - 已触发
- 只展示当前 workspace 中未删除任务的提醒。
- 已完成任务不进入已错过/即将提醒操作区。
- 每条提醒支持：
  - 打开任务
  - 完成任务
  - 稍后提醒
  - 关闭提醒
- 稍后提醒固定三项：
  - 10 分钟后
  - 1 小时后
  - 明天 09:00 本地时间
- repository 与 `TodoActions` 新增：
  - `snoozeReminder(id, untilIso)`
  - `disableReminder(id)`
- SQLite 复用现有 `reminders.snoozed_until` 和 `enabled` 字段，没有新增表，也没有新增迁移。

### 2.3 SQLite 迁移与查询基础

已新增 SQLite 索引迁移：

```sql
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON reminders(task_id);
```

这些索引覆盖当前最常见的 workspace 过滤和 reminder/task 关联查询。`workspace_folders.workspace_id` 仍可作为后续性能收尾项补充。

### 2.4 操作稳定性

已加提交锁、按钮禁用和 inline error 的位置：

- 任务创建：`TaskComposer`
- 任务详情保存：`TaskDetailPane`
- 项目创建与项目文件夹保存：`ProjectsView`
- 工作区创建与文件夹创建：`WorkspacesView`
- 设置保存：`SettingsView`

已加确认保护的危险操作：

- 删除任务
- 删除工作文件夹
- 归档项目

本轮选择轻量确认优先，不做完整回收站和 toast undo。底层恢复接口已经具备，后续可以在 UI 上扩展撤销体验。

### 2.5 i18n 与日期本地化

- 新增 `src/data/dateFormat.ts`，集中处理中英文日期、月份、周几和选中日期标题。
- `DatePane`、`HomeView`、提醒中心日期展示已按当前语言切换。
- 中文显示中文日期格式，例如 `2026年5月30日`、`2026年5月`、`一/二/三`。
- 英文保持原有风格，例如 `May 30, 2026`、`May 2026`、`Mon/Tue/Wed`。
- 主页任务列表标题从固定“今天”改为基于选中日期显示：今天、明天或具体日期。
- loading/error、设置页说明、文件夹选择标题、侧边栏按钮标题、提醒中心文案等可见文案已进入 `src/i18n/index.ts`。

### 2.6 Tauri 开发体验补充

- `tauri.conf.json` 的 devUrl 已切到 `http://127.0.0.1:5173`。
- 新增 `scripts/tauri-before-dev.mjs`，用于复用已有 Vite dev server 或启动新的 dev server。
- capability 已补充悬浮窗尺寸相关权限，支持当前窗口操作需求。

## 3. 验证状态

当前已验证：

- `pnpm test` 通过：9 个测试文件，25 个用例。
- `pnpm build` 通过。
- `cargo check` 通过。
- `git diff --check` 无空白错误，仅有 Windows CRLF 提示。
- 浏览器冒烟验证通过：
  - 中文首页、设置页文案、英文切换后的日期格式正常。
  - 提醒中心中文/英文入口、空状态、分组、稍后按钮、关闭提醒、打开任务、完成任务均能正常显示。

新增或扩展的测试覆盖：

- repository：reminder offset、软删除/恢复、workspace 过滤、`snoozeReminder`、`disableReminder`。
- reminders：批量到期、已完成任务、已删除任务、已触发提醒、未来提醒过滤。
- reminder center：分组逻辑、`snoozedUntil` 优先级、稍后时间计算、UI 操作。
- date/i18n：中英文日期、周几、主页选中日期标题。
- UI 表单：空标题错误、重复点击不会重复创建。

未完整执行：

- Tauri dev 下的桌面实机验证，包括通知权限允许/拒绝、到期提醒、稍后提醒到新时间后再次触发、关闭到托盘、打开工作区悬浮窗。

## 4. 当前仍值得优化的问题

### P1. 桌面端手动验证闭环

浏览器与自动化测试已经覆盖主要前端行为，但通知、托盘、悬浮窗和文件夹打开依赖 Tauri runtime，仍需要在 `pnpm tauri dev` 下逐项确认：

- 通知权限允许后能触发到期提醒。
- 通知权限拒绝后设置状态正确回写。
- 稍后提醒后不会立即重复触发，到新时间后仍可触发。
- 关闭主窗口后应用进入托盘而不是退出。
- 托盘菜单能恢复主窗口。
- 工作区悬浮窗能打开、置顶、调整尺寸、关闭。
- 打开工作文件夹在不同路径状态下行为一致。

### P1. 提醒失败可见化

当前提醒中心能展示已错过、即将提醒和已触发提醒，但不持久化通知失败原因。下一步建议：

- 对 `sendNotification` 失败做可见状态记录。
- 在提醒中心增加“触发失败”分组或失败状态标签。
- 给失败提醒提供重试、稍后提醒和关闭提醒操作。
- 增加 reminders hook 的失败路径测试。

### P1. 删除/归档撤销机制

当前用 `window.confirm` 先保证不误触，成本低但体验一般。下一步可以基于已有恢复接口做轻量 undo：

- 删除任务后显示 toast undo。
- 删除工作文件夹后允许撤销。
- 归档项目后允许恢复。
- 增加“已归档项目”入口。

### P2. 设置保存交互细节

当前设置项每次变更都会进入保存状态并短暂禁用控件，稳定性优先，但输入 `defaultReminderOffset` 这类数字字段时体验可能偏硬。后续可以：

- 对数字设置使用本地草稿 + blur/save。
- 或增加 debounce，减少连续保存。
- 保存失败时保留用户输入并提供重试。

### P2. 查询性能与大数据列表

当前 mutation 后仍以 `readAll()` 刷新整个数据快照。数据量小的时候简单可靠，数据量变大后需要进一步优化：

- 任务列表按视图查询，而不是每次读完整 workspace。
- Overview 和 WorkspaceTaskPicker 支持分页或虚拟滚动。
- 搜索输入增加 debounce。
- 补充 `idx_workspace_folders_workspace_id`。

### P2. Tauri 安全边界

发布前仍建议收紧：

- 明确 CSP，避免长期保持 `null`。
- capability 的 `windows` 从 `"*"` 收敛到主窗口和悬浮窗 label。
- 按窗口拆分权限，减少默认窗口拥有的插件能力。
- 对 `open_workspace_window` 参数做更严格校验。

### P3. 清理模板资源与文档

可以清理或替换：

- `public/vite.svg`
- `public/tauri.svg`
- `src/assets/react.svg`
- 根目录旧截图或与当前 UI 不一致的手动截图

同时建议更新 README，补充开发、测试、打包、数据位置、Tauri 桌面验证清单。

## 5. 可新增功能方向

### 5.1 提醒失败与提醒历史

在提醒中心基础上继续增强：

- 记录通知发送失败。
- 记录用户关闭、稍后、触发的操作时间。
- 支持查看提醒历史。
- 支持手动重新触发或重试通知。

### 5.2 自然语言快速添加

支持输入：

```text
明天下午3点交周报 #工作 !高 提前30分钟
```

自动解析：

- 标题
- due date / due time
- project
- priority
- reminder offset

这会显著提升桌面端快速记录效率，但建议在提醒中心和桌面实机验证稳定后再做。

### 5.3 重复任务

适合课程作业、例会、账单、复盘等固定任务。需要新增：

- recurrence rule 字段
- 下一次实例生成逻辑
- 完成当前实例与结束整个重复任务的区别
- 重复任务提醒的生成与更新策略

### 5.4 全局快捷键与命令面板

桌面应用适合增加：

- 全局快捷键快速添加任务。
- 命令面板搜索任务、项目、工作区、文件夹。
- 快速打开项目文件夹。
- 快速切换工作区。

### 5.5 导入、导出和备份

本地优先应用需要明确的数据安全能力：

- JSON 备份与恢复。
- CSV 导出。
- ICS 日历导出。
- 自动定期备份到用户指定目录。

### 5.6 更强筛选和保存视图

Overview 可以继续增强：

- 按优先级筛选。
- 按项目筛选。
- 按是否有提醒筛选。
- 按是否有关联工作文件夹筛选。
- 保存常用视图，例如“本周高优先级”“所有逾期”“无项目任务”。

## 6. 下一步开发计划

### 阶段一：桌面验证与缺口修复（1-2 天）

1. 在 `pnpm tauri dev` 下跑完整桌面验证清单。
2. 验证通知权限允许/拒绝、到期提醒、稍后提醒、托盘、悬浮窗和打开文件夹。
3. 修复实机验证发现的问题。
4. 补 README 桌面验证清单，避免后续回归遗漏。

### 阶段二：提醒失败可见化（2-4 天）

1. 为提醒触发失败增加最小状态记录。
2. 在提醒中心展示失败提醒。
3. 支持失败提醒重试、稍后提醒和关闭。
4. 增加 hook 与 UI 测试，覆盖通知失败路径。

### 阶段三：撤销与归档视图（2-4 天）

1. 基于 `restoreTask` 增加删除任务 undo。
2. 基于 `restoreWorkspaceFolder` 增加删除文件夹 undo。
3. 增加已归档项目入口和恢复项目能力。
4. 增加对应 UI 测试。

### 阶段四：性能与发布前收口（3-5 天）

1. 补 `workspace_folders.workspace_id` 索引。
2. 对搜索和大列表增加 debounce、分页或虚拟滚动。
3. 收紧 Tauri CSP 和 capability。
4. 清理模板资源和过期截图。
5. 更新 README 的开发、测试、打包和数据位置说明。

## 7. 推荐优先级

短期最建议先做：

1. Tauri 桌面实机验证。
2. 提醒失败可见化。
3. 删除/归档 undo。

原因是这三项直接决定“任务管理应用是否可靠”：提醒要在真实桌面环境里稳定触发，失败要能被用户看见，误删要能挽回。
