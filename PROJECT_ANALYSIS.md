# WhatToDo 项目分析与下一步开发计划

更新时间：2026-05-30

## 1. 项目现状

WhatToDo 是一个本地优先的桌面任务与 DDL 管理应用，技术栈为 Tauri 2、React 19、TypeScript、Vite、Tailwind CSS 4 和 SQLite。当前产品方向比较清晰：围绕每日 DDL、项目任务、工作区、工作文件夹和系统提醒，降低桌面工作流里的切换成本。

代码结构保持得比较直接：

- `src/data`：类型定义、日期工具、项目计算、repository 抽象与 Local/SQLite 实现。
- `src/hooks`：任务数据、主题、提醒等应用级逻辑。
- `src/components/app`：主页、日期面板、任务详情、项目、工作区、设置等主要 UI。
- `src-tauri`：SQLite 迁移、系统托盘、悬浮窗、Tauri 插件集成。

本轮稳定性迭代已经完成了计划中的大部分核心项：提醒时间修复、批量到期提醒、提交防重复、删除确认、i18n/date 本地化、SQLite 索引迁移和关键自动化测试。

## 2. 已完成的稳定性优化

### 2.1 提醒与数据正确性

- 修复 SQLite `updateTask` 更新提醒时错误使用 `defaultReminderOffset` 的问题。现在会按每条 reminder 自身的 `offsetMinutes` 重算 `remindAt`。
- `useReminders` 一次 tick 会处理所有已到期提醒，不再只触发第一条。
- 通知权限被拒绝后会关闭通知设置，避免持续重复请求。
- 到期提醒筛选排除了已完成任务、已删除任务、已触发提醒和未来提醒。
- LocalRepository 与 SqlRepository 增加了最小恢复接口：`restoreTask`、`restoreWorkspaceFolder`。
- repository 快照默认过滤软删除的任务和项目，避免 UI 继续展示已删除数据。

### 2.2 SQLite 迁移与查询基础

新增 SQLite 索引迁移：

```sql
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON reminders(task_id);
```

这些索引覆盖了当前最常见的 workspace 过滤和 reminder/task 关联查询。`workspace_folders.workspace_id` 仍可作为后续性能收尾项补充。

### 2.3 操作稳定性

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

### 2.4 i18n 与日期本地化

- 新增 `src/data/dateFormat.ts`，集中处理中英文日期、月份、周几和选中日期标题。
- `DatePane` 和 `HomeView` 已按当前语言切换 `date-fns` locale。
- 中文显示中文日期格式，例如 `2026年5月30日`、`2026年5月`、`一/二/三`。
- 英文保持原有风格，例如 `May 30, 2026`、`May 2026`、`Mon/Tue/Wed`。
- 主页任务列表标题从固定“今天”改为基于选中日期显示：今天、明天或具体日期。
- loading/error、设置页说明、文件夹选择标题、侧边栏按钮标题等可见文案已进入 `src/i18n/index.ts`。

### 2.5 测试补充

新增或扩展的测试覆盖：

- repository：reminder offset、软删除/恢复、workspace 过滤。
- reminders：批量到期、已完成任务、已删除任务、已触发提醒、未来提醒过滤。
- date/i18n：中英文日期、周几、主页选中日期标题。
- UI 表单：空标题错误、重复点击不会重复创建。

当前已验证：

- `pnpm test` 通过
- `pnpm build` 通过
- `cargo check` 通过
- 浏览器冒烟验证通过：中文首页、设置页文案、英文切换后的日期格式正常

未完整执行：

- Tauri dev 下的桌面实机验证，包括通知权限允许/拒绝、到期提醒、关闭到托盘、打开工作区悬浮窗。

## 3. 当前仍值得优化的问题

### P1. 桌面端手动验证闭环

本轮已经通过自动化测试和浏览器冒烟验证，但桌面能力依赖 Tauri runtime，仍需要在 `pnpm tauri dev` 下逐项确认：

- 通知权限允许后能触发到期提醒。
- 通知权限拒绝后设置状态正确回写。
- 关闭主窗口后应用进入托盘而不是退出。
- 托盘菜单能恢复主窗口。
- 工作区悬浮窗能打开、置顶、关闭。
- 打开工作文件夹在不同路径状态下行为一致。

### P1. 提醒失败与稍后提醒体验

当前提醒触发失败会被捕获，避免整个 tick 崩掉，但用户层面的失败反馈还比较弱。下一步建议：

- 增加提醒中心，显示即将提醒、已错过、已触发和失败提醒。
- 支持稍后提醒：10 分钟、1 小时、明天。
- 对 `sendNotification` 失败做可见状态记录，而不是只依赖 console。

### P1. 删除/归档撤销机制

当前用 `window.confirm` 先保证不误触，成本低但体验一般。下一步可以基于已经加入的恢复接口做轻量 undo：

- 删除任务后显示 toast undo。
- 删除工作文件夹后允许撤销。
- 归档项目后允许恢复。
- 增加“已归档项目”入口。

### P2. Repository 测试继续补齐 SQLite 语义

现有 repository 测试重点覆盖 LocalRepository 和核心语义。后续可以进一步把 SQLite mock 或测试工厂做深：

- 覆盖 SqlRepository 的 reminder offset 更新 SQL 行为。
- 覆盖软删除后 `readAll()` 不返回已删除数据。
- 覆盖 workspace 维度下 projects/tasks/reminders 的隔离。

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

## 4. 可新增功能方向

### 4.1 提醒中心

提醒中心是最适合接在本轮之后的功能，因为底层提醒逻辑已经更稳定。建议包含：

- 即将提醒
- 已错过
- 已触发
- 触发失败
- 已禁用

可操作项：

- 完成任务
- 稍后提醒
- 修改提醒时间
- 关闭提醒
- 打开任务详情

### 4.2 自然语言快速添加

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

这会显著提升桌面端快速记录效率，但建议在提醒中心之后做，避免同时引入过多解析边界。

### 4.3 重复任务

适合课程作业、例会、账单、复盘等固定任务。需要新增：

- recurrence rule 字段
- 下一次实例生成逻辑
- 完成当前实例与结束整个重复任务的区别
- 重复任务提醒的生成与更新策略

### 4.4 全局快捷键与命令面板

桌面应用适合增加：

- 全局快捷键快速添加任务
- 命令面板搜索任务、项目、工作区、文件夹
- 快速打开项目文件夹
- 快速切换工作区

### 4.5 导入、导出和备份

本地优先应用需要明确的数据安全能力：

- JSON 备份与恢复
- CSV 导出
- ICS 日历导出
- 自动定期备份到用户指定目录

### 4.6 更强筛选和保存视图

Overview 可以继续增强：

- 按优先级筛选
- 按项目筛选
- 按是否有提醒筛选
- 按是否有关联工作文件夹筛选
- 保存常用视图，例如“本周高优先级”“所有逾期”“无项目任务”

## 5. 下一步开发计划

### 阶段一：桌面验证与缺口修复（1-2 天）

1. 在 `pnpm tauri dev` 下跑完整桌面验证清单。
2. 修复通知权限、托盘、悬浮窗、打开文件夹中发现的问题。
3. 补一条 README 桌面验证清单，避免后续回归遗漏。

### 阶段二：提醒体验增强（3-5 天）

1. 增加提醒中心基础视图。
2. 支持稍后提醒：10 分钟、1 小时、明天。
3. 记录提醒触发失败状态并在提醒中心展示。
4. 增加 reminders hook 的失败路径测试。

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

## 6. 推荐优先级

短期最建议先做：

1. Tauri 桌面实机验证。
2. 提醒中心与稍后提醒。
3. 删除/归档 undo。

原因是这三项直接决定“任务管理应用是否可靠”：提醒要能被看见，误删要能挽回，桌面能力要在真实 runtime 里稳定。
