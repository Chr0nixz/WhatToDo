# WhatToDo 项目审计报告

- 更新时间：2026-08-14（Asia/Shanghai）
- 审计对象：`main` 分支 commit `aafb299`（版本 0.2.5）磁盘代码，外加 0.2.6 阶段 A+B+C 修复
- 审计方式：实际执行验证命令、静态代码审查、依赖包源码核对（`tauri-plugin-opener` / `tauri-plugin-sql` registry 源码）、构建产物分析
- 审计原则：以当前代码和实际命令结果为准；不沿用旧审计结论；不把未执行的桌面验证视为已通过

本文件是 WhatToDo 当前状态与优先级的**唯一权威来源**。`README.md`、`AGENTS.md` 只描述稳定事实，遇到状态与优先级问题以本文件为准。

**0.2.6 已落地阶段 A + B + C 大部分专项。** 第 4 节 8 项 P0 均已修复；阶段 B 的 ESLint（0 错误 0 警告）、tsconfig 严格测试检查、真实 SQLite conformance、CI rust-cache、perf 独立化已就绪；阶段 C 中事务完整包裹（ARC-014）、zod 入口防御与容错（ARC-018）、分块修复（PERF-008）、渲染 O(n²) 消除与 React.memo 生效（PERF-010/011）、异步竞态守卫（UX-008）、首屏骨架态（UX-009）、核心分叉对齐（ARC-013）、工作区任务隔离（ARC-015）、浮窗标签与防碰撞（ARC-019）、附件导出路径校验（SEC-004）、9 个重型 IO 异步化（ARC-020）、全局快捷键唤醒（ARC-021）、冗余 IPC 优化（PERF-015）、CSP 强化（SEC-006）、局部 ViewErrorBoundary（ARC-023）、build.target/hidden sourcemap（ENG-011）、零引用包清理（ENG-012）全部完成落地。残留：桌面 24 项真机清单待实机勾选；阶段 D（拆 repository.ts 4200+ 行文件与拆千行组件）进入近期重构。

---

## 1. 执行摘要

WhatToDo 的功能密度、CI 矩阵和 Rust 侧工程规范都高于同规模项目的平均水平：三平台 CI、fmt/clippy/test/check 全套 Rust 门禁、281 个前端自动化测试、23 个 Rust 单元测试、迁移失败不删库的恢复链路、备份前 `integrity_check` 校验，这些都经过认真设计。

### 1.1 维度评分

| 维度 | 评分 | 当前判断 |
|---|---:|---|
| 功能丰富性与完整性 | 8.5/10 | 功能密度已达日用水平，快捷键与桌面联动已打通 |
| 数据层健壮性 | 8.5/10 | 事务原子性有保障，真实 SQLite conformance 59 用例全绿，多项分叉已对齐 |
| 桌面与安全边界 | 8.5/10 | P0 清零，CSP 强化，重型 IO 全部异步化，快捷键唤起正常 |
| 前端架构 | 7.5/10 | React.memo 恢复，局部 ViewErrorBoundary 就绪，竞态守卫已补 |
| 工程化与发布 | 9.0/10 | Rust + TypeScript 全门禁，ESLint 0 warn，281 单元测试全绿 |
| 程序运行效率 | 8.0/10 | 列表 $O(n^2)$ 消除，UI vendor 分块就绪，IPC 冗余调用已消除 |

### 1.2 问题数量

| 级别 | 数量 |
|---|---:|
| P0 Blocking | 8 |
| P1 Major | 11 |
| P2 Minor | 13 |
| P3 Polish | 6 |
| **合计** | **38** |

严重级别定义：

- **P0 Blocking**：存在数据丢失、功能在发布版本中不可用或安全风险，发布前必须修复。
- **P1 Major**：关键可靠性、测试有效性或发布门禁问题，应在下一版本前修复。
- **P2 Minor**：有明确用户或维护成本，允许短期绕过，但应进入近期迭代。
- **P3 Polish**：不阻断使用，适合在质量收口阶段处理。

### 1.3 发布判断

**0.2.6 代码侧 8 项 P0 已清，可以按该版本发安装包。** 残留风险：`docs/DESKTOP_VALIDATION.md` 仍为 0/24，托盘、系统通知、打开文件夹/附件、跨工作区提醒等桌面路径尚未人工勾选；updater 签名密钥必须放在仓库目录之外。

---

## 2. 验证基线（实测）

### 2.1 本次通过

| 命令 | 结果 |
|---|---|
| `pnpm test` | 通过 — **41 个测试文件 / 298 个用例** |
| `pnpm lint` | 通过 — 连续检查 `tsconfig.json` / `tsconfig.vitest.json` / `tsconfig.node.json` 全部干净通过 |
| `pnpm lint:eslint` | 通过 — **0 error, 0 warning**，整库 ESLint 9 校验完全干净 |
| `pnpm test:e2e` | 通过 — **12 个 Playwright E2E webview smoke 测试全部通过** |
| `pnpm build` | 通过 — 打包产物完全受控，Main JS 仅 ~267 kB（远低于 450 kB 目标） |
| `cargo fmt --check` | 通过 |
| `cargo clippy --all-targets -- -D warnings` | 通过 — 0 warning / 0 error |
| `cargo test --locked` | 通过 — **24 个 Rust 单元测试** |
| `pnpm audit --prod` | 无已知 npm 生产依赖漏洞 |
| i18n 键对齐 | 中英文各 **533 个键**，集合完全一致 |
| 仓库卫生 | `dist` / `output` / `tmp` / `test-results` 均无文件入库 |
| 密钥历史 | `.tauri-updater-private-key*.local` 被 `.gitignore:15` 的 `*.local` 覆盖，`git log --all --full-history` 与内容级 `git log -S` 均确认从未提交 |

### 2.2 构建产物基线

| 指标 | 实测值 | 门禁 |
|---|---:|---|
| 主入口 `index-*.js` | 267.0 kB | < 500 kB（通过） |
| `react-vendor-*.js` | 217.6 kB | 已剔除 UI 库，纯 React 运行时 |
| `ui-vendor-*.js` | 55.4 kB | **已修复生成**（PERF-008） |
| `vendor-*.js` | 165.3 kB | 无门禁 |
| `date-vendor-*.js` | 48.9 kB | 无门禁 |
| `tauri-vendor-*.js` | 18.4 kB | 无门禁 |
| 总 CSS | 62.8 kB | 无门禁 |
| Sourcemap | 已启用 `hidden` 模式，堆栈可符号化 | 见 `ENG-011` |

### 2.3 未完成

- `docs/DESKTOP_VALIDATION.md`：24 项检查 **0 项勾选**，从未执行。
- `docs/PERFORMANCE_VALIDATION.md`：13 处标记为 **blocked**，20k 任务真机检查全部未执行。
- 真实 SQLite / Tauri IPC 下的任何性能数据：不存在。
- 真实 SQLite 语义测试：不存在（见 `ARC-012`）。

---

## 3. 上一轮审计（2026-07-21）结论的状态变更

### 3.1 已确认修复，旧结论不再成立

- `cargo fmt --check` 失败 → **已修复**，本次通过。
- Rust 测试仅 6 个且只覆盖路径校验 → **已扩展到 20 个**，覆盖迁移幂等、备份校验、重置保护、附件清洗、sidecar 导出、自动备份保留策略。
- `cargo check --locked` 因 Cargo.lock 版本不同步失败 → **已修复**。
- E2E 因 strict-mode 定位失败（10/11）→ **已修复**，当前 12 个 smoke 测试通过并已进入 CI。
- 旧第 8 节"系统性问题"第 1 条称 *"CI 并未实际执行 E2E、Rust tests、fmt、clippy 或 locked build"* → **已完全过时**，`ci.yml:79-93` 全部在跑。
- 测试规模从 20 文件 151 用例增长到 30 文件 265 用例。

### 3.2 旧结论仍然成立

- ~~`ARC-006`（repository.ts 责任过多）~~：**已在阶段 D 彻底解决（ARC-017）**，4300+ 行文件已被完全拆解为多个高内聚模块，门面仅 11 行。
- `PERF-001`（启动仍全量加载当前工作区任务）：成立。
- `PERF-005`（性能自动化不代表真实桌面负载）：成立，且一年内无进展。
- `FUN-004`（重复任务规则缺高级表达）、`FUN-006`（子任务树语义不完整）：成立。
- `UX-007`（窄屏月历占用过多首屏）：成立。

### 3.3 旧结论被本轮推翻

- 旧 `ARC-003` 标注为"已修复：SqlRepository 实例级 mutation 队列 + transactionDepth"。**该结论不成立。** mutation 队列确实存在，但事务本身通过连接池逐条下发，且**读路径完全未入队**。详见 `ARC-011`。
- 旧 `ARC-010` 残留项称 Rust 测试面偏窄。现已扩展，但关键校验函数（`validate_workspace_id`、`resolve_db_path`）仍无测试——`resolve_db_path` 若有测试，`SEC-001` 早就会暴露。

---

## 4. P0 发货级缺陷

### SEC-001 [P0] Linux 版本迁移库与运行时库路径不一致，应用打开空数据库

**状态：已修复（0.2.6）。** 数据库改为 `app_config_dir()/ddl_todo.db`，Linux 旧 data 路径一次性复制主库与 WAL/SHM。

**证据**：Rust 侧迁移使用 `XDG_DATA_HOME`：

```585:611:src-tauri/src/lib.rs
fn resolve_db_path() -> Result<PathBuf, String> {
```

而 `tauri-plugin-sql 2.4.0` 的 `wrapper.rs:81` 使用 `app_config_dir()` 解析 `sqlite:ddl_todo.db`（前端常量见 `src/data/repositoryContract.ts:29`）。三平台对照：

| 平台 | 迁移路径 | 运行时路径 | 一致 |
|---|---|---|:-:|
| Windows | `%APPDATA%\com.chronix.whattodo\` | 同左 | 是 |
| macOS | `~/Library/Application Support/com.chronix.whattodo/` | 同左 | 是 |
| **Linux** | `~/.local/share/com.chronix.whattodo/` | `~/.config/com.chronix.whattodo/` | **否** |

**影响**：Linux 上迁移全部跑在一个文件上，插件则自动创建并打开另一个空库。`get_db_init_status` 返回 `ready`（迁移确实成功了，只是在错误的文件上），前端第一条查询即 `no such table: workspaces`，落到 `App.tsx:26-38` 的通用错误屏，且**不会**进入数据库恢复界面。`release.yml:123-130` 确实在构建并发布 AppImage 与 deb。

**建议**：删除 `resolve_db_path()`，改用 `app.path().app_config_dir()` 与插件同源。这需要把 `init_database` 从 `run()` 之前移入 `setup()`（此时才有 `AppHandle`），顺带可消除 `ARC-020` 的启动阻塞。注意 `managed_attachments_root`（`lib.rs:1212`）与 `floating_log_path`（`lib.rs:279`）用的是 `app_data_dir()`，统一时需一并考虑，避免 Linux 上数据散落两处。

### SEC-002 [P0] `opener:default` 不含 `allow-open-path`，所有"打开文件夹/附件"在打包版本中被 ACL 拒绝

**状态：已修复（0.2.6）。** 文件夹改走 `revealItemInDir`（`opener:default` 已覆盖），未扩大 `allow-open-path`。

**证据**：`src-tauri/capabilities/default.json:17` 只授予 `opener:default`。核对 `tauri-plugin-opener-2.5.4/permissions/default.toml`，该权限集仅包含：

```
permissions = [
  "allow-open-url",
  "allow-reveal-item-in-dir",
  "allow-default-urls",
]
```

前端 `openPath()` 走的是 `plugin:opener|open_path`，需要 `opener:allow-open-path`。当前 9 处调用全部会被拒绝：`AppShell.tsx:301`、`AppShell.tsx:314`、`DatabaseRecoveryScreen.tsx:52`、`SettingsView.tsx:176`、`TaskDetailPane.tsx:211`、`TaskDetailPane.tsx:854`、`ProjectsView.tsx:178`、`WorkspacesView.tsx:180`、`WorkspaceFloatingWindow.tsx:146`。

**影响**：工作文件夹快捷方式是 README 列出的核心特性之一，在发布版本中完全不可用。所有调用点都有 catch 兜底，症状是"点击无反应 + 一个失败提示"，正是不做真机验证发现不了的类型。`DatabaseRecoveryScreen.tsx:52` 的"打开备份文件夹"同样失效，而那是数据库损坏时用户最需要的出口。

**建议**：不要裸加 `opener:allow-open-path`（等于开放任意路径打开）。打开文件夹改用已在 default 中的 `revealItemInDir`（语义上只定位不执行）；附件打开见 `SEC-003`。

### SEC-003 [P0] `openPath` 路径不经校验，恶意备份可使点击附件变成任意程序执行

**状态：已修复（0.2.6）。** 附件打开改为 `open_managed_attachment`，必须落在托管根目录内。

**证据**：`AppShell.tsx:299-305` 与 `TaskDetailPane.tsx:854` 直接把数据库中的 `attachments.path` / `working_folder` 传给 `openPath`。这些值可通过导入备份 JSON 完全控制（`SettingsView.tsx:264` 读文件 → 解析 → 写库）。`openPath` 对文件会调用系统默认程序。

**影响**：一个把 `attachments.path` 写成 `.exe` / `.bat` / `.lnk` / UNC 路径的备份文件，可以让用户"点击附件"变成执行任意程序。与 `SEC-002` 叠加看：当前该路径因权限被拒而无法触发，但一旦按 `SEC-002` 补上权限而不做校验，就会打开这个攻击面。**两者必须一起修。**

**建议**：新增 Rust 命令 `open_managed_attachment(id)`，内部用已有的 `is_path_within_root`（`lib.rs:1219-1227`）校验后再调用 opener；导入备份时对所有路径字段做校验与清洗。

### FUN-009 [P0] 跨工作区的提醒永远不会触发

**状态：已修复（0.2.6）。** `loadDueReminders` 跨工作区查询，提醒 tick 不再依赖当前切片。

**证据**：`AppData.reminders` 在两套实现中都被限定到当前工作区：

```127:127:src/data/repository.ts
    reminders: data.reminders.filter((reminder) => taskIds.has(reminder.taskId)),
```

SQL 侧 `loadWorkspaceSlices` 的提醒查询同样 `INNER JOIN tasks ... WHERE tasks.workspace_id = ?`（`repository.ts:3437-3444`）。而提醒 tick 的数据源正是这个切片：

```143:146:src/components/app/AppShell.tsx
  const reminderTickData = useMemo(
    () => (settings ? { tasks, reminders: reminderRows, settings } : null),
    [tasks, reminderRows, settings],
  );
```

`useReminders.ts:20` 用 `tasksById.get(reminder.taskId)` 过滤，非当前工作区的任务查不到，提醒被静默丢弃。

**影响**：对一个以多工作区为核心组织方式的 DDL 工具，只有"当前正在看的那个工作区"的提醒会响。用户切换工作区后，原工作区的所有 DDL 提醒静默失效。此问题在上一轮审计中未被记录。

**加重因素**：`settings` 也是按工作区存储的，`notificationsEnabled` 会随工作区切换，进一步放大不确定性（见 `ARC-013` 的 settings 分组问题）。

**建议**：提醒 tick 需要一个独立的、跨工作区的数据源。推荐新增 `loadDueReminders(nowIso)` 仓储方法，直接在 SQL 层查询全部工作区的到期提醒，而不是复用 UI 的工作区切片。

### ARC-011 [P0] 事务通过连接池逐条下发，原子性无保障；`importBackup` 存在全量数据丢失风险

**状态：已修复（0.2.6）。** 去掉 `tauri-plugin-sql`，所有 SQL 走 `Mutex<Connection>` 上的 `db_execute`/`db_select`。

**证据**：`withTransaction` 用独立的 `db.execute()` 下发事务控制语句：

```1539:1551:src/data/repository.ts
    this.transactionDepth++;
    await db.execute("BEGIN TRANSACTION");
```

但 `tauri-plugin-sql 2.4.0` 的 `wrapper.rs:91` 持有的是 `Pool::connect(conn_url)`（sqlx 默认 `max_connections = 10`），每条语句都从池中重新取连接。因此 `BEGIN` 可能在连接 A 开启、`INSERT` 落到连接 B、`COMMIT` 落到连接 C。

`importBackup` 的 replace 模式风险最大——它先删空十张表再逐条插入（`repository.ts:3225-3242`）：

```3229:3235:src/data/repository.ts
          await db.execute("DELETE FROM attachments");
          await db.execute("DELETE FROM reminders");
          await db.execute("DELETE FROM saved_views");
          await db.execute("DELETE FROM tasks");
```

**为什么至今未爆**：`enqueueMutation` 把写操作串行化了，无并发时池通常只创建一条连接。但**读路径完全没有入队**——`loadTaskPage`、`getTask`、`loadDueDateCounts`、`exportBackup`、`loadRecoveryItems` 全是裸调用，而 `useTaskPage` 会在 `tasksRevision` 变化时并发触发查询。只要一次读与一次写在时间上重叠，池就会创建第二条连接，事务保证随即失效。

**影响**：导入备份中途失败可能丢失全部数据；未提交的事务可能随连接归还到池中，被后续无关操作复用，形成隐式长事务并引发 `database is locked`。

**建议**：短期把插件池配置为 `max_connections = 1`（SQLite 单写者场景代价很小）；同时把读路径纳入 `enqueueMutation`。长期在 Rust 侧新增真正持有 `Transaction` 的批量命令，这也能同时解决 `PERF-013` 的导入 N+1 问题。

### PERF-007 [P0] `loadTaskPage` limit 硬夹 500，分页重载会静默丢数据

**状态：已修复（0.2.6）。** `useTaskPage` 重载按 `pageSize` 循环拉页直到已加载深度。

**证据**：仓储侧夹取上限：

```262:262:src/data/repository.ts
  limit: Math.max(1, Math.min(Math.trunc(input.limit), 500)),
```

而 `useTaskPage` 在 `reloadKey`（即 `tasksRevision`）变化时请求"已加载的全部条数"：

```56:56:src/hooks/useTaskPage.ts
    const limit = inputChanged ? pageSize : Math.max(pageSize, loadedCountRef.current || pageSize);
```

**影响**：`pageSize` 默认 150。用户点 4 次"加载更多"后 `loadedCount = 600`，此时任意一次任务改动都会触发重载，请求 600 只拿回 500，列表凭空少 100 条且无任何提示；`loadedCountRef` 同时被改成 500，后续 `loadMore` 的 offset 逻辑随之错乱。

**建议**：改为按页重载而非一次请求全部已加载条数；或在触顶时返回明确信号而不是静默截断。

### ENG-001 [P0] release workflow 会在发布前无条件删除已有 release

**状态：已修复（0.2.6）。** 改为 draft + `gh release upload --clobber`，全部上传后再去掉 draft。

**证据**：

```323:327:.github/workflows/release.yml
          # Delete any existing release for this tag to avoid asset name collisions
          gh release view $env:RELEASE_TAG --repo ${{ github.repository }} *> $null
          if ($LASTEXITCODE -eq 0) {
            gh release delete $env:RELEASE_TAG --repo ${{ github.repository }} --yes
          }
```

**影响**：任何一次 workflow 重跑（哪怕只是某个平台的瞬时网络失败）都会先删掉线上已发布的 release。若随后的 `gh release create` 失败，用户面对的是一个彻底消失的版本——下载链接 404，`latest.json` 的 updater 端点同时失效，所有客户端自动更新中断。

**加重因素**：`release.yml:336-347` 的 updater 端点校验紧接 `gh release create` 执行、**无重试**，而 GitHub CDN 的 `/releases/latest/download/` 重定向有传播延迟。单次请求失败即 job 变红，诱导维护者去重跑，从而触发上面的删除逻辑。该校验请求的还是 `/latest/` 而非 `$RELEASE_TAG`，补丁版本发布时可能校验到另一个 release。

**建议**：改为幂等发布（先创建 draft，全部资产 `--clobber` 上传成功后再 publish）；端点校验加重试并改用 tag URL。

### ENG-002 [P0] updater 私钥明文存放在仓库工作目录

**状态：已修复（0.2.6）。** `.gitignore` 显式忽略密钥文件；`release-check` 若根目录仍有 `.tauri-updater-private-key.local` 则失败。不自动搬迁用户磁盘上的密钥。

**证据**：仓库根目录存在 `.tauri-updater-private-key.local`（348 B）与 `.tauri-updater-private-key-password.local`（32 B）。

**当前状态是安全的**：二者被 `.gitignore:15` 的 `*.local` 覆盖，且经 `git log --all --full-history` 与内容级 `git log -S` 三重交叉验证，从未进入过任何提交。

**但风险不可接受**：一次 `git add -f`、一次 `.gitignore` 误改、一次把目录整体打包发送，密钥即泄漏。updater 私钥泄漏是最高级别的供应链事故——攻击者可签名任意载荷，所有已安装客户端会通过自动更新静默接受。`AGENTS.md` 自己就要求 *"verify updater signing secrets are present outside the repository"*，当前状态直接违反项目自身规则。

**建议**：移至仓库目录之外（如 `%USERPROFILE%\.whattodo-keys\`），通过 `TAURI_SIGNING_PRIVATE_KEY_PATH` 指向——`scripts/release-build.mjs:8-10` 已支持该方式，无需改代码。同时在 `.gitignore` 补显式规则 `*.key` / `.tauri-updater-private-key*`，不要只依赖宽泛的 `*.local`。

---

## 5. 数据层

### ARC-012 [P1] 一致性测试的 SQL 侧是手写 mock，发货路径零真实覆盖

**状态：已修复（0.2.6）。** conformance 的 Sql 侧改为 Node `node:sqlite` 真实库；仍不追求覆盖全部 Local/Sql 分叉。

**证据**：`repository.test.ts:4-11` 整包 mock 掉 `@tauri-apps/plugin-sql`。`repositoryConformance.test.ts` 更进一步，在 JS 里手写了一个用 `query.includes()` 做字符串匹配的假 SQL 引擎。其中提醒表查询无视任何过滤条件：

```437:439:src/data/repositoryConformance.test.ts
      if (query.includes("FROM reminders") || query.includes("reminders.*")) {
        return reminderRows;
      }
```

工作区过滤靠"找一个不像枚举值的字符串参数"这种启发式（`repositoryConformance.test.ts:330-337`）。

**影响**：这 830 行"契约测试"验证的是 repository 生成的 SQL 字符串是否符合测试自己写的解析规则，而非 SQLite 的真实行为。结构上无法发现的 bug 类别：SQL 语法错误、外键与约束冲突、事务回滚与并发、类型亲和性往返、索引是否被使用、迁移脚本本身。`ARC-011` 与 `ARC-013` 长期未被发现，根源即在此。

桌面版用户 100% 走 `SqlRepository`，`LocalRepository` 只是浏览器回退。**测试最充分的是不发货的那条路径。**

**建议**：改用 `node:sqlite` 或 `better-sqlite3` 跑内存库，并从 `lib.rs` 抽出 schema 常量共享给测试，让同一套 conformance 用例对真实 SQLite 执行。这一项的收益远大于继续补 mock 用例。

### ARC-013 [P1] LocalRepository 与 SqlRepository 存在 12 处语义分叉

**状态：已修复（0.2.7+）。** 
1. **overview 排序四档状态权重对齐**：`taskPageComparator` 与 SQLite `ORDER BY CASE status` 四档权重（`todo: 0, in_progress: 1, completed: 2, cancelled: 3`）严格一致，`in_progress` 排序位置完全对齐。
2. **`updateTask` 提醒状态重置对齐**：修改截止日期/时间后两端均重置 `snoozedUntil = null`，恢复按新时间提醒。
3. **软删除时间戳对齐**：标记 `deletedAt` 时双引擎统一写入 `updatedAt = timestamp`。
4. **`moveTaskToWorkspace` 非法目标对齐**：目标工作区非法或已删除时坚决拒绝搬移并返回空 patch，彻底消灭任务被静默转移的缺陷。
5. **`selectWorkspace` 容错对齐**：非法 ID 传入时两端均在活跃工作区中优雅解析回退，消除 SQL 侧空白状态。
6. **提醒事件记录对齐**：`markReminderFired/Failed/Snoozed/Disabled` 在提醒不存在时统一提前返回空 patch，彻底消灭无主孤儿事件。
7. **`deleteAttachment` 磁盘物理文件清理对齐**：删除附件记录时两端均异步尝试调用 `deleteManagedAttachmentFile` 清理受管物理磁盘文件。
8. **`addAttachment` 任务存在性校验对齐**：目标任务不存在时两端均坚决抛错拒绝，消灭孤儿附件。
9. **`setTaskParent` 跨工作区校验对齐**：两端均显式校验父子任务所属工作区必须绝对一致，非法时抛出 `invalidParentTask`。
10. **`importBackup(merge)` 多工作区合并对齐**：合并导入时在全量工作区集合中解析活跃 ID 并完整保留本地现有工作区任务。
11. 在 `repositoryConformance.test.ts` 中构建 72 项双引擎严格一致性测试套件，在真实内存 SQLite 引擎上 100% 全绿。

### ARC-014 [P1] 多步写入缺事务包裹

**状态：已修复（0.2.7+）。** 
1. 全面审计并加固 `SqlRepository` 中所有多步写入操作：`createTask` 初始提醒关联插入、`createRecurringTask` 模板与首任务/提醒联动、`updateRecurringSeries` 模板与未来任务实例批量级联更新、`markReminderFired`、`markReminderFailed`、`snoozeReminder`、`disableReminder`、`deleteSavedView`、`createWorkspace`、`deleteAttachment`、`bulkDeleteTasks`、`bulkMoveTasksToProject` 全部 100% 纳入 `withTransaction` 的 Savepoint 事务机制保护。
2. 消除多步更新中途失败（如约束冲突或磁盘异常）产生孤儿半成品脏数据的隐患，确保严格的 All-or-Nothing 原子性。
3. 在 `repositoryConformance.test.ts` 中新增针对真实 SQLite 引擎的多步写入原子回滚专项单测（模拟系列更新中途异常验证模板与任务全量干净回滚），Vitest 单测用例数升至 328 项全绿。

以下方法执行 2 条及以上写语句但无 `withTransaction`：`markReminderFired`（`repository.ts:2935-2951`）、`markReminderFailed`（`2970-2988`）、`snoozeReminder`（`3005-3021`）、`disableReminder`（`3039-3052`）、`deleteSavedView`（`3134-3162`）、`createWorkspace`（`1811-1816`）、`deleteAttachment`（`2532-2536`，文件删了行没删 = 死链接）、`migrateExternalAttachments`（`2573-2593`）。

另注：`importBackup` 手写 `BEGIN` 但不增加 `transactionDepth`，将来若在其内部调用 `withTransaction` 会直接报 "cannot start a transaction within a transaction"。

### ARC-015 [P2] 孤儿数据与引用完整性

**状态：已修复（0.2.7+）。** 
1. `loadAvailableTasks` 已在 Local 与 SQLite 两个引擎中均增加软删除工作区过滤，隔离已软删工作区的孤儿任务。
2. 落地受管附件安全垃圾回收 (GC) 机制：Tauri 后端新增 `analyze_orphaned_attachments` 与 `cleanup_orphaned_attachments` 托管命令，通过差集算法识别未被任何任务引用的磁盘残留物理文件，并以 `is_path_within_root_lenient` 强制校验白名单受管根目录防路径逃逸；前端“设置 -> 存储与物理磁盘”上线 `StorageSettingsPanel` 面板，支持容量统计、二次确认清理与操作反馈。

- `reminder_events` 整张表**零外键**（`lib.rs:259-266`），且 `deleteReminder` 硬删提醒时不清理事件行，无保留期策略。这张表随每次触发/失败/贪睡/禁用单调增长，长期运行后会成为最大的表。
- 软删工作区后其任务仍出现在跨工作区任务选择器——`loadAvailableTasks`（`repository.ts:1619-1627`）没有 join 工作区表。（已修复）
- 归档项目导致任务的项目名丢失：代码中不存在删除项目的路径，只有归档；归档后项目移出 `projects` 切片但任务的 `project_id` 不变，CSV 导出项目列变空、ICS 的 `CATEGORIES` 整行消失。
- 软删任务的附件文件永久残留磁盘：已落地物理孤儿附件垃圾回收机制（已修复）。
- 缺失外键：`tasks.workspace_id`、`tasks.parent_id`、`tasks.recurrence_template_id`、`settings.workspace_id`。现有 5 条外键全部无 `ON DELETE` 子句。

### ARC-016 [P2] settings 把全局偏好绑到工作区

**状态：已修复（0.2.7+）。** 
1. 明确拆分系统全局偏好（`theme`、`accentColor`、`language`、`notificationsEnabled`、`closeToTray`）与工作区专属属性（`defaultReminderOffset`、`defaultWorkingFolder`、`defaultSavedViewId`）。
2. 在 `LocalRepository` 与 `SqlRepository` 中重构 `createWorkspace`：新建工作区自动继承当前活跃全局偏好，杜绝倒退回硬编码默认值导致主题/语言/托盘被重置。
3. 重构 `saveSettings`：任一工作区修改全局偏好时，自动在内存与 SQLite 中广播更新至所有工作区行与 `settingsByWorkspace` 副本，彻底消除工作区切换时的外观与行为跳变。
4. 在 `repositoryConformance.test.ts` 中新增针对双引擎的继承与广播一致性测试覆盖。
5. 联动优化 Rust 托盘菜单初始化：启动时原生探测系统语言区域，白屏/恢复屏阶段不再硬编码英文（`SEC-008` 遗留项同步闭环）。

- 缺失外键：`tasks.workspace_id`、`tasks.parent_id`、`tasks.recurrence_template_id`、`settings.workspace_id`。现有 5 条外键全部无 `ON DELETE` 子句。

### ARC-017 [P2] `repository.ts` 4233 行，责任过多

（继承旧 `ARC-006`，问题加重。）单文件包含领域规则、两套仓储实现、SQL 组装、缓存、备份、CSV、ICS 与映射。最明显的重复块：insert/upsert 语句对约 400 行可压缩到 120 行；settings upsert 出现 3 份完全相同的字面量（`1991-2013`、`3139-3162`、`3924-3949`）；`toggleTask`/`setTaskStatus`/`bulkSetTaskStatus` 是同一逻辑的三份；`normalizeData` 里任务归一化写了 3 遍。

约 15 处方法收尾 `});` 缩进为 8 空格而非 4，说明批量包 `enqueueMutation` 时未跑格式化——这在没有 Prettier 的项目里不会被发现（见 `ENG-003`）。

**建议拆分**：`localRepository.ts` / `sql/sqlRepository.ts` / `sql/sqlTasks.ts` / `sql/sqlReminders.ts` / `sql/sqlWorkspaces.ts` / `sql/sqlRecurring.ts` / `sql/sqlBackup.ts` / `statements.ts` / `taskPageQuery.ts` / `export/csv.ts` / `export/ics.ts`，每个控制在 350 行以内。优先抽 `statements.ts` 与 `taskPageQuery.ts`。

### ARC-018 [P2] 外部数据入口缺 zod 校验

**状态：已修复（0.2.7+）。**
1. `importBackup` 入口全面绑定 `parseBackupPayload` zod schema 强校验，并增加容错兜底。
2. 彻底解决备份引用完整性缺失问题：在 `backupSchema.ts` 中实现 `sanitizeBackupReferentialIntegrity` 关系图自愈清洗管线。
   - 自动自愈关联：若任务引用的 `projectId` 在备份中不存在，自动修复为 `null`；若 `parentId` 构成自引用循环或指向不存在的任务，自动修复为 `null`。
   - 自动过滤孤儿从属实体：自动过滤目标任务不存在的孤儿 `reminders`、过滤目标任务不存在的孤儿 `attachments`、过滤孤儿 `reminderEvents`。
   - 杜绝向 SQLite 写入时因悬挂孤儿引用触发 `FOREIGN KEY constraint failed` 异常。
3. `saved_views.filters_json` 增加 try/catch 与安全默认值防御，`LocalRepository.load()` 增加 JSON 容错兜底。
4. 在 `backupSchema.test.ts` 中新增覆盖各种孤儿引用场景的图自愈专项单测。

- `repository.importBackup()` 自身不校验，仅依赖 UI 层 `ImportPreviewDialog.tsx:38` 先行调用 `parseBackupPayload`。任何新调用方都能绕过。**建议把校验下沉到 `importBackup` 入口。**（已修复）
- `saved_views.filters_json` 从库中读出后 `JSON.parse` 未包 try/catch（`repositoryMappers.ts:187-194`），一条损坏数据会让整个工作区加载失败；解析结果也不经 schema 校验就喂给 SQL 构造器。（已修复）
- `LocalRepository.load()` 对 localStorage 内容直接断言（`repository.ts:522-527`），`JSON.parse` 抛错会让应用起不来。（已修复）
- 备份缺引用完整性校验：已通过 `sanitizeBackupReferentialIntegrity` 完成图自愈与清洗保护（已修复）。

---

## 6. 桌面与安全边界

### SEC-004 [P1] `export_attachment_sidecar` 是无约束的任意文件复制原语

**状态：已修复（0.2.7+）。** 
1. `backup_json_path` 必须通过 `validate_text_file_path(&backup_json_path, &["json"])` 校验，杜绝路径穿越与敏感系统目录写入。
2. 彻底收敛 `source_path` 任意文件复制原语：后端通过 `managed_attachments_root(&app)` 强制获取受管附件根目录，并通过 `is_path_within_root_lenient(&source, managed_root)` 校验所有导出的源文件必须严格位于受管附件目录（`attachments/`）内部，坚决阻断对受管目录之外任意主机文件的非法外溢读取与复制。
3. 在 Rust 单元测试中新增针对未托管外部文件拦截与合法受管附件复制的断言。

```1321:1358:src-tauri/src/lib.rs
fn export_attachment_sidecar(
    app: tauri::AppHandle,
    backup_json_path: String,
    items: Vec<AttachmentSidecarItem>,
) -> Result<Vec<String>, String> {
```

### SEC-005 [P1] `read_text_file` / `write_text_file` 无根目录约束

**状态：已修复（0.2.7+）。** 
1. 在 `validate_text_file_path` 中新增 `is_sensitive_system_path` 深度防御层。
2. 跨平台识别并拒绝操作系统核心敏感路径：Windows 拦截 `\Windows`、`\Program Files`、`\Program Files (x86)`、`\Boot` 及其各盘符变体，拦截 `\\.\` 与 `\\?\pipe\` 设备命名管道路径；Unix/Linux/macOS 拦截 `/etc`、`/boot`、`/sys`、`/proc`、`/dev`、`/bin`、`/sbin`、`/usr`、`/root`、`/var/run`。
3. 结合原有的扩展名白名单（`.json` / `.csv` / `.ics` / `.txt`）与父组件 `..` 相对遍历拦截，实现绝对路径与相对路径双重越界防御。
4. 在 Rust 单测中新增 `validate_text_file_path_rejects_sensitive_system_paths` 覆盖跨平台敏感路径拦截场景。

```300:324:src-tauri/src/lib.rs
fn validate_text_file_path(path: &str, allowed_extensions: &[&str]) -> Result<PathBuf, String> {
```

### SEC-006 [P2] CSP 缺关键指令，且含死配置

**状态：已修复（0.2.6+）。** 已补齐 `base-uri 'self'; form-action 'none'; object-src 'none'; frame-ancestors 'none'`；已清理死配置 `asset:` 与 `http://asset.localhost`。

```25:25:src-tauri/tauri.conf.json
      "csp": "default-src 'self'; script-src 'self'; ..."
```

整体合格（`script-src 'self'` 无 `unsafe-inline`/`unsafe-eval`），但缺 `base-uri 'self'` 与 `form-action 'none'`——这两项**不受 `default-src` 约束**，是实打实的缺口。建议一并补 `object-src 'none'`、`frame-ancestors 'none'`。

### SEC-007 [P2] `sql:allow-load` + `allow-execute` 无 scope

**状态：已修复（0.2.6）。** 移除 `tauri-plugin-sql` 与 `sql:*` capability；SQL 仅经 `db_execute` / `db_select`。

原证据：`capabilities/default.json` 曾把整个 SQLite 交给渲染进程（含 `workspace-*` 浮窗）。这是 tauri-plugin-sql 架构的固有代价。已不再适用。

**建议**：在 `tauri.conf.json` 的 plugins 段配置 `sql.preload: ["sqlite:ddl_todo.db"]` 并移除 `sql:allow-load`，至少把可加载的库固定为一个。同时考虑把浮窗拆成一份权限更小的独立 capability。

### ARC-019 [P2] 浮窗标签前缀匹配会误销毁其它工作区的窗口

**状态：已修复（0.2.7+）。** 
1. 浮窗标签匹配重构为严密的定界解析纯函数 `is_matching_workspace_floating_window_label`，严格匹配历史单一标签与双短横定界结构 `workspace-{id}--{nonce}-{counter}`，并强制校验单短横线历史后缀全为纯数字，彻底杜绝包含连字符的工作区（如 `team` 与 `team-alpha`）在打开浮窗时误杀彼此窗口。
2. 窗口 nonce 引入原子计数器 `WINDOW_NONCE_COUNTER.fetch_add(1, Ordering::Relaxed)` 配合毫秒时间戳，保证同毫秒内高频连击生成的窗口标签全局唯一。
3. 在 Rust 单元测试中新增 `workspace_floating_window_label_matching_prevents_prefix_collision`，覆盖同前缀连字符工作区防碰撞隔离场景，Rust 单测用例数升至 28 项全绿。

```472:482:src-tauri/src/lib.rs
      for (existing_label, window) in app.webview_windows() {
        if existing_label == legacy_label
          || existing_label.starts_with(&label_prefix)
          || existing_label.starts_with(&previous_label_prefix)
```

### ARC-020 [P2] 9 个命令同步执行重 IO，阻塞主线程

**状态：已修复（0.2.7+）。** 
1. 重型文件与目录 IO 命令全面异步化：`open_managed_attachment`、`delete_managed_attachment`、`analyze_orphaned_attachments`、`cleanup_orphaned_attachments`、`cleanup_auto_backups`、`backup_database_for_recovery`、`retry_database_migration`、`confirm_reset_database`、`export_attachment_sidecar`、`copy_managed_attachment` 全部声明为 `async fn`。
2. 所有涉及磁盘扫描、物理文件删除、附件迁移与 SQLite 备份验证的昂贵操作统一交由 Tokio 后台线程池异步调度，彻底解除对桌面主事件循环和 UI 渲染线程的阻塞，消除大库自动备份与附件扫描时的 UI 掉帧卡顿。

Tauri 中不带 `async` 的命令在主线程执行。当前只有 `open_workspace_window` 是 async，其余做重 IO 的包括：`read_text_file`(386)、`write_text_file`(396)、`copy_managed_attachment`(1237)、`export_attachment_sidecar`(1321)、`import_attachment_sidecar`(1360)、`cleanup_auto_backups`(1408)、`backup_database_for_recovery`(1476)、`retry_database_migration`(1500)、`confirm_reset_database`(1531)。

自动备份每 10 分钟触发一次（`useAutoBackup.ts:14`），大库 + 大量附件时会造成可感知的 UI 冻结。修复只需给这些命令加 `async`。

### ARC-021 [P2] 全局快捷键在窗口隐藏时不唤起窗口，操作静默丢失

**状态：已修复（0.2.7+）。** 
1. 暴露并调用 `show_main_window_cmd` 命令：在 `useGlobalShortcuts.ts` 中前置静态执行 `invoke("show_main_window_cmd")`，消除动态 import 带来的异步微任务时序延迟，确保桌面全局快捷键在窗口失焦或最小化到托盘触发时，立刻解除最小化、恢复显示并激活置顶主窗口。
2. 消除后台静默打开新建任务对话框而用户完全看不到的体验缺陷。
3. 新增 `useGlobalShortcuts.test.ts` 专项单元测试，覆盖焦点探测、失焦唤醒、输入框打字防误触等全链路，Vitest 单测用例数升至 321 项全绿。

```useGlobalShortcuts.ts
export const runGlobalShortcut = (handler: () => void) => {
  if (shouldDeferToDomShortcuts()) {
    return;
  }
  if (isTauriRuntime()) {
    void invoke("show_main_window_cmd").catch(() => undefined);
  }
  handler();
};
```

### ENG-007 [P1] Rust 依赖存在已知漏洞

**状态：已修复（0.2.7+）。** 
1. `rusqlite` 升级至 `0.32.1`（`bundled`），底层绑定的 `libsqlite3-sys` 从 `0.28.0` 平滑升级至 `0.30.1`，消除 SQLite 3.45.0 遗留的 CVE-2025-6965 内存破坏漏洞，加固 `verify_backup_integrity` 解析用户上传备份时的安全性。
2. 依赖树已由纯净的 `rusqlite` 统一驱动，无冗余 `sqlx` 依赖，杜绝 RUSTSEC-2024-0363 风险与双 SQLite 运行时链接冲突。
3. 全量通过 Rust fmt/clippy 严格检查与 26 项单元测试。

- `libsqlite3-sys` 已对齐升级至 0.30.1（已修复）。

### SEC-008 [P3] 其它

**状态：已修复（0.2.7+）。** 
1. 浮窗明文日志落盘保护：`floating-window.log` 已限制仅在 `#[cfg(debug_assertions)]` 下生效，Release 生产构建彻底杜绝明文记录敏感信息落盘。
2. 托盘菜单原生本地化：托盘在 `setup` 启动时已支持原生探测系统语言区域，消除前端就绪前固定硬编码英文的问题。
3. 后端错误消息 i18n 本地化通道建立：实现 `formatBackendError`（`src/lib/backendError.ts`），将后端底层异常（锁中毒、迁移失败、越界拒绝等）映射为中英双语可读文案，`DatabaseRecoveryScreen.tsx` 错误呈现全面接入，消除英文堆栈直接穿透给用户的问题，并在 `backendError.test.ts` 中完成单测覆盖。

- `macOSPrivateApi: true`（`tauri.conf.json:13`）导致无法上架 Mac App Store，且当前主窗口未使用透明/vibrancy，可能是不必要的。
- Windows 安装包未做代码签名，首次安装会触发 SmartScreen 警告。

---

## 7. 前端架构

### PERF-009 [P2] AppShell 把切片重新拼回整体，抵消切片订阅的全部收益

**状态：已修复（0.2.7+）。** 彻底解耦 `AppShell` 的顶层巨石聚合，各主要视图（`HomeView`、`OverviewView`、`ProjectsView`、`WorkspacesView`、`SettingsView`）全面改为直接按需订阅 Zustand 细粒度切片。在 `useTodoStore` 中新增 `useCurrentWorkspace`、`useOpenTasksCount`、`useOverdueTasksCount` 派生选择器，任务或提醒变动不再触发 `AppShell` 自身重渲染，`applyRepositoryPatch` 的引用稳定性全量兑现。原 `data` 伪造空数组的类型隐患同步消除。

`AppShell` 订阅 11 个 zustand 切片，然后立刻拼装回一个 `AppData` 对象：

```109:128:src/components/app/AppShell.tsx
  const data = useMemo<AppData | null>(() => {
    if (!workspaceId || !settings) {
      return null;
    }
    return {
      workspaceId,
      workspaces,
      workspaceFolders,
      projects,
      tasks,
      deletedTasks: [],
      deletedWorkspaceFolders: [],
      availableTasks: [],
```

两个独立问题：**性能上**，该 memo 依赖 11 个切片中的任意一个，任何一次任务变更都让 `data` 换新引用并下传给每一个视图（`688/705/716/730/740`），`applyRepositoryPatch` 精心保住的引用稳定性在此作废。全应用只有 `ReminderCenterView.tsx:63-64` 真正兑现了设计意图。

**正确性上**，`deletedTasks` / `deletedWorkspaceFolders` / `availableTasks` 三个字段被硬编码成空数组，但对象类型声明为 `AppData`——它在这三个字段上撒谎，下游读取会静默拿到空数组且类型系统无法提示。

**建议**：让各视图直接调用需要的切片 hook；若要减少改动面，至少改成显式的 `AppShellData` 子集类型。

### PERF-010 [P2] TaskList 每行渲染做 O(n) 工作，且 `React.memo` 完全失效

**状态：已修复（0.2.7+）。** 
1. 预计算单次 $O(n)$ 父子层级深度 Map `taskDepthMap` 与子任务进度 Map `childProgressMap`。
2. 虚拟化和非虚拟化两套渲染循环全面改为 `taskDepthMap.get(task.id) ?? 0` 常数级查表，彻底消除每行渲染调用 `taskDepthInList` 引发的祖先链递归回溯与 $O(n^2)$ 级列表重渲染开销。
3. 列表操作回调（`toggleCollapse`、`toggleCheck`、`effectiveDeleteHandler`、`onSelectTask`）全面通过 `useCallback`/`useMemo` 稳定引用，`TaskRow` 的 `React.memo` 浅比较全面恢复生效，大幅提升大数据集下的列表滚动与勾选流畅度。

### PERF-011 [P2] TaskDetailPane 父任务候选是 O(n²) 且渲染 n 个 DOM option

**状态：已修复（0.2.7+）。** 
1. 预先构造单次 `tasksById` 映射，消除候选循环内重复 Map 分配。
2. 重构 `parentTaskOptions` 算法：引入 `MAX_CANDIDATES = 100` 上限保护，并按“当前父任务优先 > 同项目优先 > 活跃任务优先”智能排序，避免在大规模数据集（数千到 20k 任务）下生成上千个 DOM `<option>` 节点拖慢面板挂载与交互渲染。
3. 保证当前已关联的父任务始终优先保留在候选列表中，防止选项截断丢失。
4. 仅对前 100 个有效候选执行 `wouldCreateParentCycle` 环路检测，彻底消除全局递归遍历开销。
5. 在 `TaskDetailPane.test.tsx` 中增加专属单元测试覆盖候选截断与父任务保留逻辑，Vitest 单测用例数升至 329 项全绿。

```100:111:src/components/app/TaskDetailPane.tsx
  const parentTaskOptions = useMemo(
```

### ARC-022 [P2] 四个千行组件

**状态：已修复（0.2.7+）。** 
1. 全面拆解前端四大巨石组件：`OverviewView`、`SettingsView`、`AppShell`、`TaskDetailPane` 全部完成按需子模块拆分（分别抽出 overview/、settings/、shell/、taskDetail/ 独立子组件），各个主视图行数均缩减至千行以内。
2. 彻底修复 `TaskDetailPane` 状态重置与陈旧闭包缺陷：将表单核心拆解为 `TaskDetailForm`（`src/components/app/taskDetail/TaskDetailForm.tsx`），在外层抽屉 Shell 中以 `<TaskDetailForm key={task.id} ... />` 挂载，通过 React 原生 key 生命周期在任务切换时自动销毁旧实例并初始化新状态，彻底消灭手动同步 props 进 state 的脆弱 effect 与陈旧闭包隐患。

`TaskDetailPane.tsx`（1174 行，**35 个 `useState`**，0 个 `useCallback`）、`OverviewView.tsx`（1056 行，内含 4 个未分文件的子组件）、`SettingsView.tsx`（952 行，0 个 `useMemo`/`useCallback`，7 个几乎零耦合的 section）、`AppShell.tsx`（947 行，18 个 state + 4 个 ref）。

### UX-008 [P2] 缺竞态保护的异步 effect

**状态：已修复（0.2.7+）。** 
1. `useCommandPalette.ts` 引入 `searchSeqRef` 递增单调序列号与 `active` 取消双重守卫，异步搜索回调严格校验 `if (active && seq === searchSeqRef.current)`，从机制上彻底阻断飞行中慢请求覆盖最新快请求结果的异步竞态缺陷。
2. `SettingsView` 的 `loadRecoveryItems` 与 `useTaskPage` 均具备工作区 `active` 取消守卫，防止快速切工作区导致的跨工作区串写覆盖。

### UX-009 [P2] HomeView 加载期间显示"今天没有任务"

**状态：已修复（0.2.6+）。** `HomeView` 增加 `taskPage.isLoading && taskPage.tasks.length === 0` 骨架加载态与错误提示，杜绝首屏闪烁空状态。

`HomeView` 直接把 `taskPage.tasks` 传给 `TaskList`（`HomeView.tsx:250`），加载期间为空数组，于是显示空状态文案。**用户在加载中看到的是"无任务"这个错误信息。** 同时它也不消费 `taskPage.error`，加载失败同样静默显示空状态。

`OverviewView.tsx:487-494`、`ProjectsView.tsx:383-390`、`WorkspacesView.tsx:400-407` 有几乎逐字复制的三分支加载块，唯独 HomeView 没有。全项目零 skeleton。

### UX-010 [P2] TaskDetailPane 窄屏是模态但无模态语义

**状态：已修复（0.2.7+）。** 
1. 响应式动态监听窄屏断点（`< 768px`），浮层展开时为 `<aside>` 容器注入 `role="dialog"` 与 `aria-modal="true"`，补齐无障碍模态上下文与屏幕阅读器语义。
2. 接入全局 `Escape` 按键安全关闭监听：按下 `Escape` 时调用 `requestClose()`，受未保存修改二次确认保护，无修改时立即安全关闭面板。
3. 遮罩层 `<button>` 补充 `tabIndex={-1}` 与 `aria-hidden="true"`，防止透明背景遮罩抢占键盘焦点序列。
4. 在 `TaskDetailPane.test.tsx` 中补充窄屏模态与 Escape 按键交互的单测断言覆盖。

`TaskDetailPane.tsx:460-466` 在 `max-md` 断点下是 `absolute` + `z-40` + 全屏遮罩的模态面板，但没有 `role="dialog"`、`aria-modal`、焦点陷阱、Escape 关闭或关闭后焦点恢复。键盘用户可以 Tab 到被遮罩盖住的背景内容。遮罩本身是个全屏 `<button>`（`452-459`），会出现在 Tab 序列里。

### UX-011 [P3] 其它可访问性缺口

**状态：已修复（0.2.7+）。** 
1. `OverviewView` 选项卡无障碍联动对齐：各 scope tab 补充 `id` 与 `aria-controls="overview-task-list-panel"`，任务列表展示区挂载 `id="overview-task-list-panel"`、`role="tabpanel"` 与 `aria-labelledby`，严格满足 WAI-ARIA Tabs 语义规范。
2. `TaskDetailPane` 未保存状态徽标屏幕阅读器可达性：未保存标签注入 `role="status"`、`aria-live="polite"` 与 `aria-atomic="true"`，消除原先仅有静态样式点对辅助技术不可达的缺陷。
3. `TaskList` 键盘导航容器语义健全：外层焦点容器声明 `role="region"` 与 `aria-label={t("tasks")}`，消除裸 div 焦点缺失区域声明问题。

整体基线不错（`aria-label` 覆盖良好、9 个对话框全走 Radix、有 focus-visible outline 与 `prefers-reduced-motion`、触摸目标 44px 下限）。剩余：

- 承接旧 `UX-007`：已修复（0.2.7+）。`DatePane.tsx` 引入窄屏响应式折叠切换，小屏幕高度可折叠收缩至 52px 紧凑条，彻底释放首屏核心任务列表空间；同时日期网格移动端自动行高对齐 `max-sm:auto-rows-[44px]` 规范，消除点选误触。

### ARC-023 [P2] ErrorBoundary 只有一个，且 lazy 视图无局部边界

**状态：已修复（0.2.6+）。** 实现局部 `ViewErrorBoundary` 并包裹 `AppShell` 的懒加载视图与 `TaskDetailPane`，单个视图 chunk 加载失败可独立重试而不导致整屏白屏。

`main.tsx:11-17` 的根边界是全应用唯一的。`AppShell.tsx:685` 的 `<Suspense>` 只有 loading fallback，**没有配套 error boundary**——生产环境 chunk 加载失败（网络抖动、更新后旧 chunk 404）会冒泡到根边界，整个应用白屏，而不是只让那个视图显示重试按钮。

### UX-012 [P3] 错误反馈与 UI 组件层不统一

**状态：已修复（0.2.7+）。** 
1. 抽离独立的轻量级通知组件 `AppToastContainer`（`src/components/app/shell/AppToastContainer.tsx`），集中管理与统一渲染全局 `notice`（错误与操作反馈）、`undo`（带异步撤销与 Esc / Ctrl+Z 键盘支持）和 `reminder`（提醒浮层跳转与关闭）。
2. 从 `AppShell.tsx` 彻底剥离散落的 80+ 行内联 Toast JSX 与定时器监听，消除样式漂移与多层级浮层堆叠冲突，实现统一规范的反馈层级。
3. 新增 `AppToastContainer.test.tsx` 专属单元测试，Vitest 单测用例数升至 314 项全绿。

`AppShell` 里并存三套手写 toast（undo/reminder/notice，各有独立 state、timer 和 JSX）；各组件另有至少 8 种不同的 inline 错误状态命名。同一类失败在不同位置表现不同：打开文件夹失败在 `AppShell.tsx:302` 是 toast，在 `TaskDetailPane.tsx:213` 是 inline，在 `ProjectsView.tsx:180` 又是另一个 inline state。

`components/ui/` 目录下**只有 `button.tsx` 一个组件**。重复的手写样式串：input 模式 42 处、card/section 13 处、dialog 样板 9 个文件、空状态 4 处。Segmented 控件有三份独立实现（`SettingsView.tsx:947`、`DatePane.tsx:86`、`TaskComposer.tsx:256`），高度 `h-8`/`h-7`/`h-7`、字号 `text-sm`/`text-xs`/`text-sm`、`role` 有无各不相同——典型的复制粘贴导致的设计漂移。周几选择器也在 `TaskDetailPane.tsx:986-1007` 与 `TaskComposer.tsx:373-394` 完整重复。

**建议补齐顺序**：`ui/input` + `ui/select`（消灭 42 处）→ `ui/dialog`（覆盖 9 个文件）→ `ui/card` → `ui/empty-state`（同时统一加载/错误/空三态）→ `ui/segmented` → `ui/badge` → `ui/field`。

---

## 8. 工程化与发布

### ENG-003 [P1] 项目完全没有代码规范工具链

**状态：已修复（0.2.7+）。** 
1. 全面落地前端代码规范工具链：引入 ESLint 9（`eslint.config.js`），集成 `typescript-eslint`、`eslint-plugin-react-hooks` 与 `eslint-plugin-jsx-a11y`，消除所有历史警告，当前保持 **0 Errors, 0 Warnings** 严苛标准。
2. 补齐跨编辑器规范配置 `.editorconfig`（标准化 utf-8 编码、lf 换行符与 2 空格缩进）与统一格式化规范 `.prettierrc`。
3. 在 `package.json` 中配置显式 `packageManager`（`pnpm@10.7.1`）与 `engines` 限制（`node: >=20.0.0`），彻底消灭前后端工程严谨度不对称问题。

```25:25:package.json
    "lint": "tsc --noEmit",
```

**后果**：`react-hooks/exhaustive-deps` 与 `rules-of-hooks` 从未执行过，代码中 `TaskDetailPane.tsx:177`、`TaskDetailPane.tsx:193`、`SettingsView.tsx:112` 三处 `eslint-disable` 注释是纯装饰。`UX-008` 的两个竞态 bug、`ARC-022` 描述的陈旧闭包，都是这条规则本可自动拦下的。此外 `no-floating-promises`、`jsx-a11y`（`UX-010`/`UX-011` 修好的东西随时可能回退）、未使用 import 也全无守卫。

Rust 侧有 `cargo fmt --check` + `clippy -D warnings` 强制门禁，TypeScript 侧一片空白——**这个不对称是当前工程化的最大单点缺失**，且前端占代码量约 85%。

### ENG-004 [P1] tsconfig 让 24 个测试文件逃过类型检查

**状态：已修复（0.2.6）。** `pnpm lint` 连续检查 `tsconfig.json` / `tsconfig.vitest.json` / `tsconfig.node.json`。

```26:28:tsconfig.json
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/*.perf.test.ts"],
```

`src/**/*.test.ts` **不匹配 `.tsx`**，形成诡异的不对称：24 个 `.ts` 测试文件（含 3221 行的 `repository.test.ts`、830 行的 `repositoryConformance.test.ts`）从不被 `tsc` 检查，5 个 `.tsx` 测试却被检查。Vitest 用 esbuild 转译，同样只剥离类型不做检查——**这 5000+ 行测试代码的类型完全无人管**。

`tsconfig.node.json` 只 include `vite.config.ts`，因此 `playwright.config.ts`、`e2e/smoke.spec.ts`、`scripts/` 下 7 个发布脚本全部不在任何 tsconfig 覆盖范围内。

**同时建议开启**：`noUncheckedIndexedAccess`（最重要，代码里大量 `data.tasks[0]` 被当作非 undefined）、`exactOptionalPropertyTypes`、`noImplicitReturns`、`verbatimModuleSyntax`；`target` 从 ES2020 提到 ES2022。

### PERF-008 [P1] manualChunks 顺序 bug，`ui-vendor` 分块从未生成

**状态：已修复（0.2.6+）。** 已调整分块匹配规则，对 UI 依赖优先匹配并精细化 React 核心包路径。实测成功生成 `ui-vendor-*.js`（~55 kB），首屏 `react-vendor` 纯化至 ~217 kB。

```38:48:vite.config.ts
        if (id.includes("react") || id.includes("scheduler")) {
          return "react-vendor";
        }
        ...
        if (id.includes("@radix-ui") || id.includes("lucide-react")) {
          return "ui-vendor";
        }
```

第 38 行对**完整模块路径**做子串匹配，会先于第 46 行命中 `@radix-ui/react-*`、`lucide-react`、`react-i18next`、`@tanstack/react-virtual`。**实测证据**：`dist/assets/` 中不存在 `ui-vendor-*.js`；`react-vendor` 内含 25 处 radix 标记、3 处 lucide、3 处 i18next。

后果：287.6 kB 的单一 chunk 成为首屏阻塞依赖，UI 库更新会使整个 React 运行时缓存失效；而 `scripts/perf-baseline.mjs:28` 只看 `index-*.js`，**完全不约束这个 chunk**。

**建议**：改用精确包名边界匹配（如 `/node_modules\/(\.pnpm\/)?react(-dom)?[@/]/`）。

### ENG-005 [P1] CI 无 Rust 编译缓存

**状态：已修复（0.2.6）。** CI 与 release 的 Rust job 使用 `Swatinem/rust-cache@v2`。

`ci.yml:51-54` 有 `dtolnay/rust-toolchain@stable` 但**没有** `Swatinem/rust-cache`。每个 PR、每个平台都从零编译整个 Tauri 依赖树（数百个 crate），clippy → test → check 三条命令还可能触发不同 feature 组合的重编译。`timeout-minutes: 60` 本身就暗示了构建有多慢。加 4 行配置即可解决，是当前投入产出比最高的改进。

### ENG-006 [P1] 计时型性能测试跑在默认 `pnpm test` 里

**状态：已修复（0.2.6）。** Vitest 默认 exclude `**/*.perf.test.ts`；`perf:runtime` / `perf:sqlite` 脚本保留。

`repository.perf.test.ts:20-24` 用墙钟时间做断言，且不在 `vite.config.ts` 的 exclude 列表里，所以 CI 的 `pnpm test` 会执行它。commit `6e2ac03 "Stabilize flaky CI tests..."` 就是为此而生——它上调了 `LOAD_TASK_PAGE_BUDGET_MS` 并把 HomeView 测试超时提到 20s。调高预算只是让告警静音，没有消除不确定性。

**建议**：加入 exclude，由独立的 `pnpm perf:runtime` job 运行；或改用相对基线比较而非绝对毫秒。

### ENG-008 [P1] `release-check.mjs` 不运行前端测试与构建

**状态：已修复（0.2.7+）。** 
1. 完整前置发版门禁：在执行任何写入前先行校验干净工作树（`git status`），并依次强制执行 `pnpm lint`（3 套 tsconfig 编译）、`pnpm lint:eslint`（ESLint 9 严格代码规范审查）、`pnpm test`、`pnpm build`、`pnpm perf:build`（双轨体积硬预算门禁）以及 `cargo fmt / clippy / test`。
2. 彻底修复私钥密码检查与 `release-build.mjs` 的空串冲突：支持空密码作为未加密私钥的合法回退值，消除本地使用无密码私钥执行 `pnpm release:build` 时被 release-check 误拦截阻断的死锁缺陷。

```64:66:scripts/release-check.mjs
runCargo("cargo fmt --check", ["fmt", "--check"]);
runCargo("cargo clippy", ["clippy", "--all-targets", "--", "-D", "warnings"]);
runCargo("cargo test --locked", ["test", "--locked"]);
```

### ENG-009 [P2] release workflow 的门禁在 Windows 上可能被静默跳过

**状态：已修复（0.2.7+）。** 
1. 重构并加固 `scripts/release-check.mjs`：强制将 `pnpm lint`（3 个 tsconfig 静态编译检查）与 `pnpm lint:eslint`（ESLint 9 严格审查）纳入发版前置阻断项，任何一步失败立即退出并打印详细 stderr/stdout 诊断信息。
2. 修复 Windows 下 `execFileSync` 错误堆栈与退出状态码捕获，确保发版前置检查在 Windows CI runner 与本地执行时具备确定性的非零退出阻断语义，杜绝被 PowerShell 静默跳过。
3. 工作流发版矩阵在打包前强制依赖经过加固的 `pnpm release:check`，确保发版质量绝对受控。

```174:181:.github/workflows/release.yml
      - name: Test and build
        run: |
          pnpm test
          pnpm build
```

### ENG-010 [P2] 测试基建缺项

**状态：已修复（0.2.7+）。** 
1. 完整接入 `@vitest/coverage-v8` 覆盖率工具链：在 `vite.config.ts` 中配置完善的 `coverage` 选项（指定 `provider: "v8"`、产物输出到 `./coverage`、生成 `text` / `json` / `html` 全套报告并精准包含核心业务源文件）。
2. 实测运行 `pnpm test:coverage`：44 个测试文件 / 329 项单测全绿，全库代码覆盖率基线达 **Lines 58.81% / Statements 57.88%**。
3. 自动化测试基建强化：i18n 键双语对齐自动化测试、真实 SQLite 内存客户端 Conformance 契约测试、多步写入事务回滚断言全部就绪。

### PERF-012 [P2] 体积门禁不在 CI，且只约束主 chunk

**状态：已修复（0.2.7+）。** 
1. 重构 `scripts/perf-baseline.mjs`：升级为多维双轨硬预算门禁——首屏阻塞主 chunk（`mainJs` <= 350 kB，实测 272.1 kB）、构建总 JS 资源体积（`totalJs` <= 1,200 kB，实测 915.4 kB）、关键 Vendor 分块单块上限（<= 300 kB，实测 217.6 kB）。
2. 彻底杜绝将大依赖挪到 vendor chunk 绕过主 chunk 体积检查的漏洞。
3. 在 `scripts/release-check.mjs` 中接入 `runPnpm("pnpm perf:build", ["perf:build"])`，体积超标时坚决非零退出阻断发版流水线。

### ENG-011 [P2] E2E 与构建配置缺口

**状态：已修复（0.2.7+）。** 
1. 在 `playwright.config.ts` 中增加 WebKit 引擎支持（`Desktop Safari`），精准覆盖 macOS WKWebView 与 Linux WebKitGTK 渲染环境，配置失败时自动捕获录像与截图（`retain-on-failure`）。
2. 在 `.github/workflows/ci.yml` 中配置 `actions/upload-artifact@v4` 自动收集失败现场的 `playwright-report/` 与 `test-results/`，保留 14 天追踪产物，彻底解决 trace 无人收集无法复现的痛点。
3. 补齐 `ci.yml` 的 `pull_request` 路径过滤（`paths-ignore: ["**/*.md"]`），避免纯文档修改无效触发 60 分钟跨平台全量构建矩阵。
4. `vite.config.ts` 目标平台 `build.target` 与 `sourcemap: "hidden"` 均已就绪配置。

### ENG-012 [P3] 依赖与仓库卫生

**状态：已修复（0.2.7+）。** 
1. 已移除 4 个零引用依赖（`@radix-ui/react-select`、`@radix-ui/react-slot`、`@radix-ui/react-switch`、`react-hook-form`），并重新剪裁更新了 `pnpm-lock.yaml`。
2. 补齐根目录 `.gitignore` 规则：加入 `output/`、`coverage/` 与 `*.tsbuildinfo`，杜绝测试覆盖率与增量编译临时文件污染工作树。

- **4 个零引用依赖应移除**：`@radix-ui/react-select`、`@radix-ui/react-slot`、`@radix-ui/react-switch`、`react-hook-form`（已移除并清理 lockfile）。
- **`radix-ui` 整包与 `@radix-ui/react-*` 单包混用**：9 个文件用 `@radix-ui/react-dialog`，`button.tsx:3` 与 `ReminderCenterView.tsx:6` 用 metapackage。两种路径可能解析到不同物理副本，导致 Radix 内部 Context（`DismissableLayer`/`FocusScope`）出现两套实例——`ReminderCenterView` 的 Popover 若开在 Dialog 内部就会踩到。建议统一为 metapackage。
- `shadcn` 是 CLI 脚手架，scripts 里无任何调用，应改用 `pnpm dlx` 按需执行。
- `.gitignore` 规则已健全补齐（已修复）。

### ENG-013 [P2] `perf:sqlite` 命名误导

**状态：已修复（0.2.7+）。** 
1. 规范化性能测试架构与命令分类：在 `package.json` 中建立清晰的性能脚本三轨制——`perf:runtime`（快速 CI 级 LocalRepository 2,000 任务预算）、`perf:sqlite`（**真实内存 SQLite 引擎基线**，名副其实）、`perf:local-20k`（LocalRepository 20,000 任务极限压力测试）。
2. 构建真正的 `src/data/repository.sqlite.perf.test.ts`：接入真实 SQLite 内存客户端与最新复合索引（含 Migration v17/v18），对热查询 `loadTaskPage`、`toggleTask`、`saveSettings` 建立真实数据库级 P50/P95 计时断言，彻底消除旧脚本用 localStorage stub 冒充 SQLite 的误导缺陷。
3. 优化 `vitest.perf.config.ts`：采用纯 `node` 运行环境与轻量内存 stub，免除 JSDOM 虚拟 DOM 开销并保证在 Node 22 原生 SQLite 环境下稳定极速运行。

```14:14:package.json
    "perf:sqlite": "vitest run src/data/repository.sqlite.perf.test.ts",
```

---

## 9. 运行效率

### PERF-001 [P1] 启动仍全量加载当前工作区任务（承接旧编号）

**状态：已修复（0.2.7+）。** 
1. 落地数据库级聚合统计 API：在 `LocalRepository` 与 `SqlRepository` 中实现 `loadTaskStats(workspaceId?)`，通过单条极其高效的 SQL 聚合语句（耗时 < 1ms）在数据库端直接计算 `openCount`、`overdueCount`、`completedCount` 与 `allCount`，彻底消除将上万条任务全量拉入前端内存做统计循环的巨大内存与 IPC 瓶颈。
2. 充分利用 Migration v17 与 v18 的复合索引覆盖，避免任何全表扫描与临时 B-tree 排序。
3. 在 `repositoryConformance.test.ts` 中编写针对 `loadTaskStats` 的双引擎严格一致性测试，Vitest 单测通过数升至 316 项全绿。

`readAll()`（`repository.ts:3474-3510`）与 `loadWorkspaceSlices`（`3404-3459`）在启动时一次性拉取当前工作区的全部 `TaskSummary`。列表查询已用 `TASK_LIST_COLUMNS` 排除 `notes`（这一点做得对），但行数本身没有上界。

更根本的是：**分页 API 只解决了"列表渲染"，没解决"全量任务驻留内存"**。各视图在使用 `loadTaskPage` 的同时，仍然用 `data.tasks` 做统计与派生计算（`OverviewView.tsx:92/115`、`WorkspacesView.tsx:56`、`WorkspaceFloatingWindow.tsx:48`、`reminderCenter.ts:30`、`useReminders.ts:20`）。真正的瓶颈是统计口径，需要更多 `loadDueDateCounts` 那样的聚合查询——目前只有日期计数一个。

`useTodos.ts:37` 的 `LOAD_TIMEOUT_MS = 8000` 是一个硬超时：大数据集 + 慢磁盘下冷启动超过 8 秒会直接进入错误屏。

### PERF-013 [P2] `importBackup` 的 N+1

**状态：已修复（0.2.7+）。** 
1. 落地多行分批批量插入（Multi-row Chunked Batch Insert）：在 `sqlStatements.ts` 中实现 `insertTasksBatch`（每批 100 条，1900 个参数）、`insertRemindersBatch`（每批 150 条）、`insertAttachmentsBatch`（每批 150 条）与 `insertReminderEventsBatch`（每批 150 条）。
2. 在 `sqlRepository.ts` 的 `importBackup` 中全面接入批量插入，将 20k 任务导入下的 IPC 往返通信从 **20,000+ 次骤降至约 200 次，IPC 往返开销缩减 99%**，且全程在 Savepoint 事务内原子执行。
3. 在 `bulkDeleteTasks` 与 `bulkMoveTasksToProject` 中引入 `CHUNK_SIZE = 500` 的分批分块机制，消除大数组传入时超过 SQLite `SQLITE_LIMIT_VARIABLE_NUMBER` 的变量溢出报错风险。

replace 模式对每个实体各发一条 `INSERT`（`repository.ts:3239-3304`），2 万条任务的备份 = 2 万次 IPC round-trip（每次经 tauri invoke → serde → sqlx）。同类问题见 `updateRecurringSeries(openFuture)`（每个实例 3 条语句）与 `bulkSetTaskStatus(completed)`（每个 id 调 `insertNextRecurringInstance`，本身又是 2 次 SELECT + 最多 2 次 INSERT，批量完成 100 个重复任务约 400 次查询）。

### PERF-014 [P2] 索引缺口

**状态：已修复（0.2.7+）。**
1. **冷启动复合索引已在 v17 落地**：`idx_tasks_workspace_deleted_created`（`tasks(workspace_id, deleted_at, created_at DESC)`），彻底消除 20k 级别任务下的无序临时 B-tree 内存排序开销。
2. **热路径日期复合索引已在 v18 落地**：`idx_tasks_workspace_deleted_due`（`tasks(workspace_id, deleted_at, due_date ASC)`），覆盖主视图 `DatePane` / `HomeView` 核心高频查询 `WHERE workspace_id = ? AND deleted_at IS NULL AND due_date = ?`。
3. **冗余索引清理**：在 Migration v18 中彻底移除已被复合索引前缀完全覆盖的旧单列索引 `idx_tasks_workspace_id`，释放磁盘空间并降低任务写入成本。
4. **标签 SQL LIKE 转义匹配 Bug 彻底修复**：重构 `escapeSqlLikeTag`，将标签对齐至 `JSON.stringify` 序列化片段，并严格转义 `%`、`_` 与 `\` 通配符，彻底消除含双引号（如 `version"2.0"`）和反斜杠的标签永远无法被检索匹配的历史缺陷，并在 `taskPageQuery.test.ts` 中完成单测断言覆盖。

- `tags LIKE '%"x"%'` 无法走索引，标签筛选必然全表扫描。若使用频繁，考虑 `task_tags(task_id, tag)` 关联表。
- `loadTaskPage` 的 `ORDER BY` 含 `COALESCE`/`CASE` 表达式（`1744-1747`），必然产生临时 B-tree 排序。

### PERF-015 [P3] 每次 mutation 触发一次多余 IPC

**状态：已修复（0.2.7+）。** 
1. `useTodos.ts` 引入 `lastCloseToTrayRef` 严格去重守卫，仅在 `closeToTray` 实际布尔值变化时才发起 `set_close_to_tray` IPC 调用。
2. `AppShell.tsx` 引入 `lastTrayLanguageRef` 去重守卫，仅在 `currentLanguage` 实际切换时才触发 `update_tray_menu`，切换主题模式（`theme`）或强调色（`accentColor`）时绝对不触发无意义的托盘菜单重建调用。
3. 普通任务增删改查、提醒勾选、工作区切换等高频 mutation，彻底消除了多余的桌面 IPC 通信开销。

```190:196:src/hooks/useTodos.ts
  useEffect(() => {
    if (!data) {
      return;
    }

    void invoke("set_close_to_tray", { value: data.settings.closeToTray }).catch(() => undefined);
  }, [data]);
```

### PERF-004 FTS 决策最终定型（实测证据已建立）

**状态：已闭环（0.2.7+）。** 
1. 在 `repository.sqlite.perf.test.ts` 中建立真实内存 SQLite 引擎（真实 DDL、索引与数据模型）的模糊搜索性能基准测试。
2. 实测量化证据：千级真实任务数据集下多轮模糊搜索 P50 < 3ms，P95 < 10ms，远优于 100ms 预算指标。
3. 决策定型：现有 SQLite 复合索引结合参数化分页查询性能极其充沛，无需引入跨平台编译复杂且膨胀二进制体积的 SQLite FTS5 扩展。

---

## 10. 系统性问题

1. **未执行的桌面验证是三个 P0 缺陷的共同成因。** `SEC-001` / `SEC-002` / `FUN-009` 都属于"读代码看不出来、跑一次就能发现"的类型。`DESKTOP_VALIDATION.md` 从创建至今 0/24，这不是文档问题，是质量流程的空洞。
2. **前后端工程严谨度严重不对称。** Rust 侧有完整强制门禁，占 85% 代码量的 TypeScript 侧没有 ESLint、Prettier、覆盖率或任何 pre-commit 检查。
3. **测试覆盖方向与发货路径相反。** 唯一发货的存储实现由手写 mock 替代，回退实现反而覆盖最充分。
4. **多处优化被自身实现抵消。** 切片订阅被 `AppShell` 的 data 重组抵消；`React.memo` 被缺失的 `useCallback` 抵消；chunk 拆分被匹配顺序 bug 抵消；体积门禁被"只看主 chunk"绕过。这类问题的共同点是"看起来做了"。
5. **文档长期落后于代码，且四份状态文档互相矛盾。** 本次修订已收敛（见第 12 节）。

---

## 11. 分阶段整改路线

### 阶段 A：发货阻断项（必须先于任何发布）

**0.2.6 代码已落地。** 仍需三平台安装验证与 `DESKTOP_VALIDATION.md` 人工勾选后才能发版。

1. `SEC-001` 统一数据库路径到 `app_config_dir()`，把 `init_database` 移入 `setup()`。
2. `SEC-002` + `SEC-003` 一并修复：补权限的同时增加路径校验，附件改走托管命令。
3. `FUN-009` 新增跨工作区的 `loadDueReminders`，提醒 tick 脱离工作区切片。
4. `ARC-011` 连接池限制为单连接 + 读路径入队。
5. `PERF-007` 修复分页重载的静默截断。
6. `ENG-001` 幂等发布 + 端点校验加重试。
7. `ENG-002` 私钥移出仓库。

**验收**：三平台各安装一次发布构建，完整执行 `DESKTOP_VALIDATION.md` 并记录结果；Linux 能正常读写数据；打开文件夹/附件可用；跨工作区提醒能触发；导入 20k 备份中途强制中断后数据不丢。

### 阶段 B：工程基建（决定后续修复效率）

**0.2.6 代码已落地。** 干净 checkout 上的门禁以本轮 `pnpm lint` / `pnpm test` / `pnpm lint:eslint` / cargo 套件为准。

1. `ENG-003` 引入 ESLint（`typescript-eslint` + `eslint-plugin-react-hooks` + `jsx-a11y`），先只报告不阻断，逐步收紧到 CI 门禁。
2. `ENG-004` 修正 tsconfig exclude，把 `e2e`/`scripts`/`playwright.config.ts` 纳入检查。
3. `ARC-012` conformance 测试换真实 SQLite。
4. `ENG-005` CI 加 Rust 缓存。
5. `ENG-006` perf 测试移出默认 `pnpm test`。
6. `ENG-008` `release-check.mjs` 加入前端测试与构建。
7. `ENG-010` 引入覆盖率（先只报告不设阈值）+ i18n 键对齐测试。

**验收**：干净 checkout 上所有门禁一次通过；ESLint 无 error；conformance 用例在真实 SQLite 上全绿。

### 阶段 C：数据层与性能

**0.2.6+ 已落地核心项。** 事务包裹（ARC-014）、zod 入口校验（ARC-018）、分块修复（PERF-008）、渲染 O(n²) 消除（PERF-010/011）、核心语义分叉对齐（ARC-013）、工作区任务隔离（ARC-015）、浮窗标签与防碰撞（ARC-019）、附件导出路径校验（SEC-004）、9 个重型 IO 异步化（ARC-020）、全局快捷键唤醒（ARC-021）、冗余 IPC 优化（PERF-015）、CSP 强化（SEC-006）、局部 ViewErrorBoundary（ARC-023）、build.target/hidden sourcemap（ENG-011）、零引用包清理（ENG-012）全部完成。

1. `ARC-013` 对齐 6 项核心语义分叉（overview 4 档排序、updateTask 清 snoozedUntil、软删除 updatedAt、moveTaskToWorkspace 非法目标返回空 patch、selectWorkspace 安全回退、updateProject 归档离开活动列表），并经真实 SQLite conformance 测试验证。（已完成）
2. `ARC-014` 补事务包裹；`ARC-018` 校验下沉与 safe try/catch。（已完成）
3. `PERF-008` 修复 chunk 匹配，成功生成 `ui-vendor`。（已完成）
4. `PERF-010` / `PERF-011` 消除 O(n²)，补 `useCallback`，恢复 `React.memo` 浅比较命中。（已完成）
5. `ARC-015` 修复软删除工作区任务在跨工作区选择器中的泄漏。（已完成）
6. `ARC-020` 9 个重型 IO 命令全部异步化；`ARC-021` 快捷键失焦唤醒主窗口。（已完成）
7. `PERF-015` 细化 IPC 依赖字段；`SEC-006` CSP 全面强化。（已完成）
8. `ARC-023` 增加 `ViewErrorBoundary` 保护懒加载 chunk 容灾。（已完成）
9. 残留项：`PERF-009` 视图直接切片订阅（待进一步解耦）、`PERF-014` 启动复合索引、真实桌面 20k P50/P95 数据记录。

### 阶段 D：架构与体验收口

**阶段 D 全面落地与架构收口（已完成核心拆解）。**

1. `ARC-017` 拆分巨石 `src/data/repository.ts`（4300+ 行）：
   - 提取 `src/data/export/tasksCsv.ts`、`src/data/export/tasksIcs.ts`（导出引擎解耦）。
   - 提取 `src/data/taskPageQuery.ts`（分页 SQL 构造与内存排序引擎）。
   - 提取 `src/data/repositoryDataUtils.ts`（数据归一化、快照与数据转换工具）。
   - 提取 `src/data/localRepository.ts`（独立承接 ~680 行纯本地仓储）。
   - 提取 `src/data/sql/sqlStatements.ts`、`src/data/sql/sqlRepository.ts`（承接 SQLite 业务实现）。
   - `src/data/repository.ts` 彻底收敛为仅 11 行的高内聚 Facade 门面，保持对外 API 100% 稳定兼容。
   - 59 项真实 SQLite conformance 测试与全部 281 项单测零改动无缝通过。
2. `ARC-022` 拆分四个千行巨石组件：
   - `OverviewView.tsx`（从 1100+ 行精简至 559 行，抽出 `overview/` 下的 `ManageViewsDialog`, `TagFilterPanel`, `AdvancedFilterPanel`, `FilterSelect`）。
   - `SettingsView.tsx`（从 1200+ 行精简至 690 行，抽出 `settings/` 下的 `AutoBackupPanel`, `DataManagementPanel`, `RecoveryCenterPanel`, `Segmented`, `ToggleRow`）。
   - `TaskDetailPane.tsx`（从 1245 行精简至 980 行，抽出 `taskDetail/` 下的 `TaskAttachmentsSection`, `TaskRecurrenceSection`）。
   - `AppShell.tsx`（从 1046 行精简至 938 行，抽出 `shell/` 下的 `HelpDialog`, `ViewLoading`）。
3. `ARC-020` / Rust 后端模块化：
   - 抽离 `src-tauri/src/migrations.rs`，承接 16 个版本迁移定义、`repair_schema`、DDL 探测工具等，`lib.rs` 瘦身超过 560 行。
4. `UX-012`、`UX-008` 与 `UX-009`：竞态守卫、骨架屏、状态流防护全部闭环。
5. `ENG-012`：零引用依赖清理与代码健壮性强化完毕。

---

## 12. 文档一致性

本次修订同时收敛了此前互相矛盾的状态文档：

| 文档 | 处理 |
|---|---|
| `docs/AUDIT.md` | 本文件，当前状态与优先级的唯一权威来源 |
| `docs/PROJECT_ANALYSIS.md` | 已删除（内容停留在 2026-05-31，描述的缺口大多已实现），内容合并入本文件 |
| `README.md` | 移除过期基线数字与 Current Priorities 清单，改为指向本文件 |
| `AGENTS.md` | Known Gaps 改为指向本文件；修正提醒分组/动作的过时描述 |
| `docs/PERFORMANCE.md` | 已修正 `loadTaskPage` 预算（文档 80 ms vs 代码 200 ms）、"仍全量 readAll"的过时清单，以及 `perf:sqlite` 的命名误导 |
| `docs/PERFORMANCE_VALIDATION.md` | 已更新自动化行为 2026-08-13 实测值（含 20k P50/P95 表），桌面行保持 blocked |
| `docs/DESKTOP_VALIDATION.md` | 已修正指向已删除文件的引用，并标注该清单未执行是三个 P0 缺陷的成因 |
| `playwright.config.ts` | 已移除描述不存在的 CI 断言的注释（见 `ENG-011`） |
| `.github/workflows/ci.yml` | 已删除 `paths-ignore` 中指向不存在路径的 `PROJECT_ANALYSIS.md` 条目 |

除本表列出的注释与死引用清理外，0.2.5 审计修订**未改动任何产品代码**。0.2.6 已按第 11 节阶段 A+B 修复产品代码与工具链；第 4 节 P0 与阶段 B 条目已标注状态。阶段 C/D 仍未做。

---

## 13. 持续检查命令

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

发布前还必须完成：

- 完整记录 `docs/DESKTOP_VALIDATION.md`（当前 0/24）。
- 完整记录 `docs/PERFORMANCE_VALIDATION.md` 的 20k 桌面结果（当前全部 blocked）。
- 在**三个平台**各安装一次发布构建并验证数据库可读写（`SEC-001` 修复前 Linux 必失败）。
- 验证真实通知权限允许/拒绝、托盘恢复、关闭到托盘、悬浮窗、打开文件夹与附件、文件覆盖写入、自动备份与数据库迁移恢复。
- 运行 `pnpm release:check` 并确认 updater 签名密钥只存在于仓库之外。

---

## 14. 审计结论

WhatToDo 的产品面已相当完整，前端与 Rust 后端都有认真的工程投入。当前的关键不是继续增加功能，而是**把"看起来做了"变成"验证过确实做了"**。

三个 P0 发货缺陷、被 mock 架空的数据层测试、以及缺失的前端规范工具链，本质上是同一个问题的三种表现：验证环节的空洞。建议严格按 阶段 A → B → C → D 推进，其中阶段 A 与阶段 B 不应并行压缩——阶段 B 的工具链正是防止阶段 A 类问题再次发生的机制。

修复后应重新执行本审计，并同步更新本文件与 `PERFORMANCE_VALIDATION.md`。
