# WhatToDo 项目审计报告

- 更新时间：2026-08-14（Asia/Shanghai）
- 审计对象：`main` 分支 commit `aafb299`（版本 0.2.5）磁盘代码，外加 0.2.6 阶段 A+B 修复
- 审计方式：实际执行验证命令、静态代码审查、依赖包源码核对（`tauri-plugin-opener` / `tauri-plugin-sql` registry 源码）、构建产物分析
- 审计原则：以当前代码和实际命令结果为准；不沿用旧审计结论；不把未执行的桌面验证视为已通过

本文件是 WhatToDo 当前状态与优先级的**唯一权威来源**。`README.md`、`AGENTS.md` 只描述稳定事实，遇到状态与优先级问题以本文件为准。

**0.2.6 已落地阶段 A + B。** 第 4 节 8 项 P0 均已修复；第 11 节阶段 B 的 ESLint、tsconfig 测试检查、真实 SQLite conformance、CI rust-cache、perf 移出默认 test、i18n 键测试与 coverage 脚本已就绪。残留：桌面 24 项真机清单仍未执行；阶段 C/D（筛选分叉、拆千行组件、FTS 等）未做。

---

## 1. 执行摘要

WhatToDo 的功能密度、CI 矩阵和 Rust 侧工程规范都高于同规模项目的平均水平：三平台 CI、fmt/clippy/test/check 全套 Rust 门禁、265 个自动化测试、迁移失败不删库的恢复链路、备份前 `integrity_check` 校验，这些都经过认真设计。

**当前最核心的问题不是功能缺口，而是"项目对自身状态的认知与实际不符"。** 本轮审计发现三个会随安装包发到用户手上的缺陷，它们的共同成因是同一件事：`docs/DESKTOP_VALIDATION.md` 的 24 项真机验证**一项都没有执行过**，所有桌面运行时行为都是靠阅读代码推断的。这类缺陷（Linux 数据库路径、Tauri 权限 ACL、跨工作区提醒）恰好都是"读代码看不出来、跑一次就能发现"的类型。

第二个结构性问题是**前后端工程严谨度的不对称**：Rust 侧有 `cargo fmt --check` + `clippy -D warnings` 强制门禁，而占代码量约 85% 的 TypeScript 侧连 ESLint 都没有配置，`pnpm lint` 实际只是 `tsc --noEmit`。这直接导致 `react-hooks/exhaustive-deps` 从未运行过，代码中已有的 `eslint-disable` 注释全部是无效装饰。

第三个是**测试覆盖的方向性错误**：桌面版用户 100% 走 `SqlRepository`，但该路径在测试中完全由一个手写的 JS 假 SQL 引擎替代，`LocalRepository`（仅用于浏览器回退）反而覆盖最充分。也就是说，测试最扎实的是不发货的那条路径。

### 1.1 维度评分

| 维度 | 评分 | 当前判断 |
|---|---:|---|
| 功能丰富性与完整性 | 8.0/10 | 功能密度已达日用水平，缺口是"以为闭环其实没有"的链路 |
| 数据层健壮性 | 5.0/10 | 事务原子性无保障，两套实现 12 处语义分叉，发货路径零真实测试 |
| 桌面与安全边界 | 5.0/10 | 三个发货级缺陷集中于此；附件导出命令无路径约束 |
| 前端架构 | 6.0/10 | 设计意图正确但被实现抵消（切片订阅、`React.memo` 均失效） |
| 工程化与发布 | 6.5/10 | Rust 侧接近满分，TypeScript 侧无任何规范工具链 |
| 程序运行效率 | 6.0/10 | 优化投入很大，但体积门禁只看主 chunk，列表层有 O(n²) |

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

## 2. 验证基线（2026-08-13 实测）

### 2.1 本次通过

| 命令 | 结果 |
|---|---|
| `pnpm test` | 通过 — **30 个测试文件 / 265 个用例**，耗时 18.4s |
| `pnpm lint` | 通过（注意：实际只执行 `tsc --noEmit`，且不覆盖 `.ts` 测试文件，见 `ENG-004`） |
| `pnpm build` | 通过 |
| `cargo fmt --check` | 通过 |
| `cargo clippy --all-targets -- -D warnings` | 通过 |
| `cargo test --locked` | 通过 — **20 个 Rust 单元测试** |
| `pnpm audit --prod` | 无已知 npm 生产依赖漏洞 |
| i18n 键对齐 | 中英文各 **533 个键**，集合完全一致 |
| 仓库卫生 | `dist` / `output` / `tmp` / `test-results` 均无文件入库 |
| 密钥历史 | `.tauri-updater-private-key*.local` 被 `.gitignore:15` 的 `*.local` 覆盖，`git log --all --full-history` 与内容级 `git log -S` 均确认从未提交 |

### 2.2 构建产物基线

| 指标 | 实测值 | 门禁 |
|---|---:|---|
| 主入口 `index-*.js` | 249.0 kB | < 500 kB（通过） |
| `react-vendor-*.js` | 287.6 kB | **无门禁** |
| `vendor-*.js` | 138.3 kB | 无门禁 |
| `date-vendor-*.js` | 47.7 kB | 无门禁 |
| 总 JS | 867.6 kB | 无门禁 |
| 总 CSS | 60.8 kB | 无门禁 |

首屏阻塞资源约为 `index + react-vendor + vendor` = 675 kB。当前唯一的体积门禁只约束其中 249 kB 的部分，见 `PERF-008` 与 `PERF-012`。

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

- `ARC-006`（repository.ts 责任过多）：文件已增长至 **4233 行**，问题加重。
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

已确认的分叉，全部无对比测试覆盖：

| # | 行为 | Local | SQL | 影响 |
|---|---|---|---|---|
| 1 | overview 排序 | 四档 status rank（`repository.ts:487`） | 只区分 `todo`/其它（`repository.ts:1744`） | `in_progress` 位置不同 |
| 2 | `updateTask` 后提醒 | 不清 `snoozedUntil`（`959-969`） | 清（`2437-2442`） | 改截止时间后提醒按旧贪睡时间触发 |
| 3 | 软删除 | 只写 `deletedAt`（`1235-1241`） | 同时写 `updatedAt`（`2892`） | 排序/同步差异 |
| 4 | `moveTaskToWorkspace` 非法目标 | 回退到第一个工作区（`1429-1432`） | 返回空 patch（`2375-2380`） | **Local 会静默搬走任务** |
| 5 | `selectWorkspace` 校验 | resolve/回退 | 接受任意 id | SQL 侧变空白状态 |
| 6 | `updateProject(archived)` | 项目离开列表（`1449-1452`） | 仍留在列表（`2085`） | UI 结果不同 |
| 7 | 提醒不存在时的事件记录 | 仍写事件（`1253-1267`） | 提前 return | 事件历史不一致 |
| 8 | `deleteAttachment` | 只删元数据（`1016-1022`） | 同时删磁盘文件（`2530-2536`） | Local 留孤儿文件 |
| 9 | `addAttachment` 任务不存在 | 静默写入 | 外键抛错 | 同一调用一成一败 |
| 10 | `createTaskReminder` 顺序 | 追加末尾 | 前插 | 列表顺序不同 |
| 11 | `setTaskParent` 工作区校验 | 显式校验（`983`） | 依赖 cache 隐含前提（`2478`） | 语义等价但脆弱 |
| 12 | **高级筛选未知条件** | AND 组内排除全部（`taskFilters.ts:35+`） | 整条忽略（`repository.ts:456-463`） | **同一视图一个返回空、一个返回全部** |

第 12 项最危险，且 `saved_views.filters_json` 从库中读出后不经任何校验就直接展开（`repositoryMappers.ts:187-199`），"未知 op" 并非纯理论。

**建议**：把 `sqlConditionForFilter` 与 `taskFilters.evalCondition` 收敛到一份 `(field, op)` 条件描述表，同时产出 JS 谓词与 SQL 片段，让分叉在类型层面不可能存在。其余各项每修一处配一个 `runAgainstBoth` 用例。

### ARC-014 [P1] 多步写入缺事务包裹

以下方法执行 2 条及以上写语句但无 `withTransaction`：`markReminderFired`（`repository.ts:2935-2951`）、`markReminderFailed`（`2970-2988`）、`snoozeReminder`（`3005-3021`）、`disableReminder`（`3039-3052`）、`deleteSavedView`（`3134-3162`）、`createWorkspace`（`1811-1816`）、`deleteAttachment`（`2532-2536`，文件删了行没删 = 死链接）、`migrateExternalAttachments`（`2573-2593`）。

另注：`importBackup` 手写 `BEGIN` 但不增加 `transactionDepth`，将来若在其内部调用 `withTransaction` 会直接报 "cannot start a transaction within a transaction"。

### ARC-015 [P2] 孤儿数据与引用完整性

- `reminder_events` 整张表**零外键**（`lib.rs:259-266`），且 `deleteReminder` 硬删提醒时不清理事件行，无保留期策略。这张表随每次触发/失败/贪睡/禁用单调增长，长期运行后会成为最大的表。
- 软删工作区后其任务仍出现在跨工作区任务选择器——`loadAvailableTasks`（`repository.ts:1619-1627`）没有 join 工作区表。
- 归档项目导致任务的项目名丢失：代码中不存在删除项目的路径，只有归档；归档后项目移出 `projects` 切片但任务的 `project_id` 不变，CSV 导出项目列变空、ICS 的 `CATEGORIES` 整行消失。
- 软删任务的附件文件永久残留磁盘（不存在永久删除任务的入口）；`importBackup(replace)` 清空 `attachments` 表但不删任何托管文件。
- 缺失外键：`tasks.workspace_id`、`tasks.parent_id`、`tasks.recurrence_template_id`、`settings.workspace_id`。现有 5 条外键全部无 `ON DELETE` 子句。

### ARC-016 [P2] settings 把全局偏好绑到工作区

主题、语言、通知开关、`closeToTray` 这些明显的全局偏好被按工作区存储。`createWorkspace` 一律使用 `DEFAULT_SETTINGS`（`repository.ts:632`、`1816`），新建工作区会把界面语言重置回 `zh`、主题重置回 `system`。`closeToTray` 还会经 `useTodos.ts:195` 推送到 Rust 侧，切工作区就改变了窗口关闭行为。

**建议**：把 settings 拆成 global / per-workspace 两组。这同时是 `FUN-009` 的加重因素。

### ARC-017 [P2] `repository.ts` 4233 行，责任过多

（继承旧 `ARC-006`，问题加重。）单文件包含领域规则、两套仓储实现、SQL 组装、缓存、备份、CSV、ICS 与映射。最明显的重复块：insert/upsert 语句对约 400 行可压缩到 120 行；settings upsert 出现 3 份完全相同的字面量（`1991-2013`、`3139-3162`、`3924-3949`）；`toggleTask`/`setTaskStatus`/`bulkSetTaskStatus` 是同一逻辑的三份；`normalizeData` 里任务归一化写了 3 遍。

约 15 处方法收尾 `});` 缩进为 8 空格而非 4，说明批量包 `enqueueMutation` 时未跑格式化——这在没有 Prettier 的项目里不会被发现（见 `ENG-003`）。

**建议拆分**：`localRepository.ts` / `sql/sqlRepository.ts` / `sql/sqlTasks.ts` / `sql/sqlReminders.ts` / `sql/sqlWorkspaces.ts` / `sql/sqlRecurring.ts` / `sql/sqlBackup.ts` / `statements.ts` / `taskPageQuery.ts` / `export/csv.ts` / `export/ics.ts`，每个控制在 350 行以内。优先抽 `statements.ts` 与 `taskPageQuery.ts`。

### ARC-018 [P2] 外部数据入口缺 zod 校验

- `repository.importBackup()` 自身不校验，仅依赖 UI 层 `ImportPreviewDialog.tsx:38` 先行调用 `parseBackupPayload`。任何新调用方都能绕过。**建议把校验下沉到 `importBackup` 入口。**
- `saved_views.filters_json` 从库中读出后 `JSON.parse` 未包 try/catch（`repositoryMappers.ts:187-194`），一条损坏数据会让整个工作区加载失败；解析结果也不经 schema 校验就喂给 SQL 构造器。
- `LocalRepository.load()` 对 localStorage 内容直接断言（`repository.ts:522-527`），`JSON.parse` 抛错会让应用起不来。
- 备份缺引用完整性校验：zod 只做逐实体校验，不检查 `reminder.taskId` / `attachment.task_id` / `task.projectId` 是否指向备份内存在的实体，孤儿引用会在导入写到一半时被外键拒绝。

---

## 6. 桌面与安全边界

### SEC-004 [P1] `export_attachment_sidecar` 是无约束的任意文件复制原语

```1321:1358:src-tauri/src/lib.rs
fn export_attachment_sidecar(
    backup_json_path: String,
    items: Vec<AttachmentSidecarItem>,
) -> Result<Vec<String>, String> {
```

`backup_json_path` 完全不校验（连 `validate_text_file_path` 都没调用），`source_path` 也不校验、不限扩展名。等价于"把任意源文件复制到任意可创建目录"。`sanitize_attachment_id` 与 `sanitize_attachment_filename` 只保证最后一段安全，管不住 `sidecar_root` 本身。这是当前权限最宽的命令。

**建议**：对 `backup_json_path` 调用 `validate_text_file_path(&path, &["json"])`，并把 `source_path` 限制在 `managed_attachments_root` 之内。

### SEC-005 [P1] `read_text_file` / `write_text_file` 无根目录约束

```300:324:src-tauri/src/lib.rs
fn validate_text_file_path(path: &str, allowed_extensions: &[&str]) -> Result<PathBuf, String> {
```

校验只有扩展名白名单 + 拒绝 `..` 组件，**没有任何根目录约束**。绝对路径本来就允许，所以 `..` 检查在这里是摆设。可读写磁盘上任意 `.json` / `.csv` / `.ics` / `.txt`。

**建议**：复用已有的 `is_path_within_root`（`lib.rs:1219-1227`），限制到 app data 目录 + 用户通过 dialog 主动选择的路径。

### SEC-006 [P2] CSP 缺关键指令，且含死配置

```25:25:src-tauri/tauri.conf.json
      "csp": "default-src 'self'; script-src 'self'; ..."
```

整体合格（`script-src 'self'` 无 `unsafe-inline`/`unsafe-eval`），但缺 `base-uri 'self'` 与 `form-action 'none'`——这两项**不受 `default-src` 约束**，是实打实的缺口。建议一并补 `object-src 'none'`、`frame-ancestors 'none'`。

`img-src` 里的 `asset:` 与 `http://asset.localhost` 是死配置：未配置 `app.security.assetProtocol`，asset 协议未启用，附件预览走 `openPath` 不经 webview。应删除。

### SEC-007 [P2] `sql:allow-load` + `allow-execute` 无 scope

**状态：已修复（0.2.6）。** 移除 `tauri-plugin-sql` 与 `sql:*` capability；SQL 仅经 `db_execute` / `db_select`。

原证据：`capabilities/default.json` 曾把整个 SQLite 交给渲染进程（含 `workspace-*` 浮窗）。这是 tauri-plugin-sql 架构的固有代价。已不再适用。

**建议**：在 `tauri.conf.json` 的 plugins 段配置 `sql.preload: ["sqlite:ddl_todo.db"]` 并移除 `sql:allow-load`，至少把可加载的库固定为一个。同时考虑把浮窗拆成一份权限更小的独立 capability。

### ARC-019 [P2] 浮窗标签前缀匹配会误销毁其它工作区的窗口

```472:482:src-tauri/src/lib.rs
      for (existing_label, window) in app.webview_windows() {
        if existing_label == legacy_label
          || existing_label.starts_with(&label_prefix)
          || existing_label.starts_with(&previous_label_prefix)
```

工作区 id 允许包含 `-`。存在 `team` 和 `team-alpha` 两个工作区时，为 `team` 开浮窗会因 `previous_label_prefix = "workspace-team-"` 匹配到 `workspace-team-alpha--1234` 并把它一起销毁。

另：标签 nonce 使用毫秒时间戳（`lib.rs:435-439`），同毫秒内两次调用会产生重复标签导致 `build()` 失败。

### ARC-020 [P2] 9 个命令同步执行重 IO，阻塞主线程

Tauri 中不带 `async` 的命令在主线程执行。当前只有 `open_workspace_window` 是 async，其余做重 IO 的包括：`read_text_file`(386)、`write_text_file`(396)、`copy_managed_attachment`(1237)、`export_attachment_sidecar`(1321)、`import_attachment_sidecar`(1360)、`cleanup_auto_backups`(1408)、`backup_database_for_recovery`(1476)、`retry_database_migration`(1500)、`confirm_reset_database`(1531)。

自动备份每 10 分钟触发一次（`useAutoBackup.ts:14`），大库 + 大量附件时会造成可感知的 UI 冻结。修复只需给这些命令加 `async`。

### ARC-021 [P2] 全局快捷键在窗口隐藏时不唤起窗口，操作静默丢失

`useGlobalShortcuts.ts:13` 的 `shouldDeferToDomShortcuts()` 在窗口无焦点时返回 false，handler 会执行——但 handler 只做 React 状态变更（`AppShell.tsx:409-412`），**没有任何一处显示窗口**。应用最小化到托盘时按 `Ctrl+N`，隐藏的窗口里静默打开了一个新建任务对话框，用户什么都看不到。这正是全局快捷键最主要的使用场景。

`lib.rs:271-277` 的 `show_main_window` 已存在，只是没有暴露成命令。

### ENG-007 [P1] Rust 依赖存在已知漏洞

- `sqlx 0.8.0` 命中 **RUSTSEC-2024-0363**（Binary Protocol Misinterpretation，CVSS 8.1，影响 `< 0.8.1`）。`cargo update -p sqlx` 即可，0.8.x 内兼容升级。
- `libsqlite3-sys 0.28.0` 捆绑 SQLite 3.45.0（2024-01），此后修复的 CVE 包括 CVE-2025-6965（内存破坏，High）。攻击面真实存在：`verify_backup_integrity`（`lib.rs:987-998`）会用 `Connection::open` 打开**用户提供的备份文件**并跑 `PRAGMA integrity_check`。升级 `rusqlite` 到 0.32+ 可获取新版本。

升级时注意 `rusqlite` 与 `sqlx-sqlite` 共享 `libsqlite3-sys`（当前都锁在 0.28.0），需对齐避免链接两份 SQLite。

### SEC-008 [P3] 其它

- `floating-window.log`（`lib.rs:286-298`）无轮转、无大小上限、release 构建同样启用，且记录 `document.body.innerText.slice(0, 240)`——把任务标题等用户内容明文落盘。应用 `#[cfg(debug_assertions)]` 包裹或改用 `tauri-plugin-log`。
- 后端错误消息全部是英文硬编码的 `Result<_, String>`，`DatabaseRecoveryScreen.tsx:35` 直接渲染，**绕过 i18n**。
- 托盘启动时硬编码英文（`lib.rs:1580-1581`），要等前端调用 `update_tray_menu` 才本地化；若前端启动失败（如数据库恢复屏场景）则永远是英文。
- `macOSPrivateApi: true`（`tauri.conf.json:13`）导致无法上架 Mac App Store，且当前主窗口未使用透明/vibrancy，可能是不必要的。
- Windows 安装包未做代码签名，首次安装会触发 SmartScreen 警告。

---

## 7. 前端架构

### PERF-009 [P2] AppShell 把切片重新拼回整体，抵消切片订阅的全部收益

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

`taskDepthInList` 与 `getDirectChildren`（`taskTree.ts:73-81`、`31-34`）每次调用都重建覆盖全表的 Map 或做全量 filter，而 `TaskList` 在渲染循环里逐行调用（`TaskList.tsx:617-620`，非虚拟化路径同样，`702-703`）。整体退化为 O(n²)，且无提前返回兜底。

同时 `TaskListImpl` 有 **0 个 `useCallback`**：`toggleCollapse`(334)、`toggleCheck`(346)、`requestDeleteTask`(401) 都是裸函数，每次渲染换新引用后作为 props 传给 `React.memo` 包裹的 `TaskRow`（`TaskList.tsx:86`）。加上 `childProgress` 每次返回新对象字面量、`onDeleteTask` 是每次求值的三元表达式——**memo 的浅比较必然失败，一次都不会命中**（`TaskList.tsx:763-766` 的注释描述的效果并未实现）。

### PERF-011 [P2] TaskDetailPane 父任务候选是 O(n²) 且渲染 n 个 DOM option

```100:111:src/components/app/TaskDetailPane.tsx
  const parentTaskOptions = useMemo(
```

`wouldCreateParentCycle` 内部同样 `new Map(tasks.map(...))`（`taskTree.ts:15`），对每个候选调用一次。结果直接渲染成 n 个 `<option>`。应改为带搜索的异步 combobox。

### ARC-022 [P2] 四个千行组件

`TaskDetailPane.tsx`（1174 行，**35 个 `useState`**，0 个 `useCallback`）、`OverviewView.tsx`（1056 行，内含 4 个未分文件的子组件）、`SettingsView.tsx`（952 行，0 个 `useMemo`/`useCallback`，7 个几乎零耦合的 section）、`AppShell.tsx`（947 行，18 个 state + 4 个 ref）。

`TaskDetailPane` 另有一处真实误解：`468` 行的 `key={task.id}` 加在**内部 div** 上，而 state 住在外层组件里，完全不起重置作用——所以才需要 `158-178` 那个"用 effect 把 props 同步进 state"的模式，而该 effect 的依赖只有 `task?.id`/`task?.updatedAt`，函数体却读了 `isDirty`、`reminders`、`settings`，全是陈旧闭包值。

### UX-008 [P2] 缺竞态保护的异步 effect

```126:128:src/components/app/SettingsView.tsx
  useEffect(() => {
    void loadRecoveryItems();
  }, [data.workspaceId]);
```

无 `active`/`cancelled` 标志，快速切换工作区时先发起的请求可能后返回，把旧工作区的已删除任务写进 state。

`useCommandPalette.ts:136-150` 同类问题：cleanup 只清 debounce 定时器，已在飞行中的请求不取消，两个请求谁后到谁覆盖——搜索关键词越短返回越慢，很容易显示上一个关键词的结果。

对比 `useTaskPage.ts:58,82-84`、`AppShell.tsx:269,277-279`、`ReminderCenterView.tsx:72,91-93` 都正确做了保护，说明团队知道正确写法，只是缺工具强制执行（见 `ENG-003`）。

### UX-009 [P2] HomeView 加载期间显示"今天没有任务"

`HomeView` 直接把 `taskPage.tasks` 传给 `TaskList`（`HomeView.tsx:250`），加载期间为空数组，于是显示空状态文案。**用户在加载中看到的是"无任务"这个错误信息。** 同时它也不消费 `taskPage.error`，加载失败同样静默显示空状态。

`OverviewView.tsx:487-494`、`ProjectsView.tsx:383-390`、`WorkspacesView.tsx:400-407` 有几乎逐字复制的三分支加载块，唯独 HomeView 没有。全项目零 skeleton。

### UX-010 [P2] TaskDetailPane 窄屏是模态但无模态语义

`TaskDetailPane.tsx:460-466` 在 `max-md` 断点下是 `absolute` + `z-40` + 全屏遮罩的模态面板，但没有 `role="dialog"`、`aria-modal`、焦点陷阱、Escape 关闭或关闭后焦点恢复。键盘用户可以 Tab 到被遮罩盖住的背景内容。遮罩本身是个全屏 `<button>`（`452-459`），会出现在 Tab 序列里。

### UX-011 [P3] 其它可访问性缺口

整体基线不错（`aria-label` 覆盖良好、9 个对话框全走 Radix、有 focus-visible outline 与 `prefers-reduced-motion`、触摸目标 44px 下限）。剩余：

- Overview 的 tablist 缺 `aria-controls`，对应面板无 `role="tabpanel"`（`OverviewView.tsx:311-330`、`486`）。
- "有未保存更改"只用一个 1.5px 色点 + `title` 表达（`TaskDetailPane.tsx:473-475`），`title` 在 `<span>` 上对屏幕阅读器基本不可达。
- TaskList 的 j/k 键盘导航容器是 `tabIndex={0}` 的裸 div，无 `role`/`aria-activedescendant`（`TaskList.tsx:587-592`），对屏幕阅读器完全不可感知。
- 承接旧 `UX-007`：窄屏月历占首屏过多，日期按钮约 48x34 px，`index.css:414` 还显式取消了 44px 最小目标。

### ARC-023 [P2] ErrorBoundary 只有一个，且 lazy 视图无局部边界

`main.tsx:11-17` 的根边界是全应用唯一的。`AppShell.tsx:685` 的 `<Suspense>` 只有 loading fallback，**没有配套 error boundary**——生产环境 chunk 加载失败（网络抖动、更新后旧 chunk 404）会冒泡到根边界，整个应用白屏，而不是只让那个视图显示重试按钮。

### UX-012 [P3] 错误反馈与 UI 组件层不统一

`AppShell` 里并存三套手写 toast（undo/reminder/notice，各有独立 state、timer 和 JSX）；各组件另有至少 8 种不同的 inline 错误状态命名。同一类失败在不同位置表现不同：打开文件夹失败在 `AppShell.tsx:302` 是 toast，在 `TaskDetailPane.tsx:213` 是 inline，在 `ProjectsView.tsx:180` 又是另一个 inline state。

`components/ui/` 目录下**只有 `button.tsx` 一个组件**。重复的手写样式串：input 模式 42 处、card/section 13 处、dialog 样板 9 个文件、空状态 4 处。Segmented 控件有三份独立实现（`SettingsView.tsx:947`、`DatePane.tsx:86`、`TaskComposer.tsx:256`），高度 `h-8`/`h-7`/`h-7`、字号 `text-sm`/`text-xs`/`text-sm`、`role` 有无各不相同——典型的复制粘贴导致的设计漂移。周几选择器也在 `TaskDetailPane.tsx:986-1007` 与 `TaskComposer.tsx:373-394` 完整重复。

**建议补齐顺序**：`ui/input` + `ui/select`（消灭 42 处）→ `ui/dialog`（覆盖 9 个文件）→ `ui/card` → `ui/empty-state`（同时统一加载/错误/空三态）→ `ui/segmented` → `ui/badge` → `ui/field`。

---

## 8. 工程化与发布

### ENG-003 [P1] 项目完全没有代码规范工具链

**状态：部分修复（0.2.6）。** 已加 ESLint 9（`rules-of-hooks` error，`exhaustive-deps` / a11y 为 warn）。历史 warn 本阶段不清。

检索 `{.eslintrc*, eslint.config.*, .prettierrc*, .editorconfig, .husky/**, commitlint.config.*, .lintstagedrc*, .npmrc, .nvmrc}` —— **0 个文件命中**。`package.json` 也没有 `packageManager` / `engines` 字段。

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

**状态：已修复（0.2.6）。** cargo 之后运行 `pnpm test` 与 `pnpm build`。

```64:66:scripts/release-check.mjs
runCargo("cargo fmt --check", ["fmt", "--check"]);
runCargo("cargo clippy", ["clippy", "--all-targets", "--", "-D", "warnings"]);
runCargo("cargo test --locked", ["test", "--locked"]);
```

只有三条 cargo 命令，**没有 `pnpm test` / `pnpm build` / `pnpm test:e2e`**。本地执行 `pnpm release:build` 可以在 265 个前端测试全红的情况下产出一个签名完整的安装包。CI 的 `release.yml:176` 补上了这一步，但本地路径正是最容易被用来出紧急修复版的那条。

另有两个相关缺陷：

- **签名密码检查是死代码**：`release-check.mjs:110` 的 `"..." in process.env` 使得只要变量存在（哪怕空串）就算已提供，而 `release-build.mjs:12` 在调用 check 之前就把它设成了空串。该警告永远不会触发。
- **干净树检查顺序错误**：cargo 命令在前、`git status` 在后（`release-check.mjs:64-71`），若 cargo 修改了 `Cargo.lock`（`clippy` 那条未加 `--locked`），干净树检查会因脚本自身造成的改动而失败。应把 `git status` 移到最前。

### ENG-009 [P2] release workflow 的门禁在 Windows 上可能被静默跳过

```174:181:.github/workflows/release.yml
      - name: Test and build
        run: |
          pnpm test
          pnpm build
```

多行 `run` 在 PowerShell（Windows runner 默认 shell）下**不会**因中间命令非零退出而中止，只有最后一条的退出码决定 step 结果。Windows 上 `pnpm test` 失败可能被静默吞掉，直到 `cargo check` 成功就算通过。Linux/macOS 用 bash 有 `set -e` 语义，不受影响。

同时这套完整门禁在 5 个 runner 上重复执行（`prepare` 的 `release:check` + 4 个 build 平台），而 `cargo fmt --check` 是平台无关的。

### ENG-010 [P2] 测试基建缺项

**状态：部分修复（0.2.6）。** 已加 i18n 键对齐测试与 `pnpm test:coverage`（无 CI 阈值）。完整覆盖率门禁仍未做。

- **无覆盖率工具**：`vite.config.ts:18-29` 的 test 块没有 `coverage`，devDependencies 也无 `@vitest/coverage-v8`。"265 个用例"对质量的指示意义因此很弱。
- **36 个源文件零测试**，最高风险的是 `useTodos.ts`（295 行，AGENTS.md 列为核心）、`useTodoStore.ts`、`appIndexes.ts`、`repositoryMappers.ts`、`ErrorBoundary.tsx`（最后一道防线）、以及 19 个 UI 组件中的 18 个。
- **i18n 键对齐无自动化守卫**：本次人工核对为 533/533 对齐，但新增文案时漏配另一语言不会被任何检查拦住。这是一个 10 行就能写出来的测试。
- **15 个测试文件完全没有错误路径断言**，包括 `importPreview.test.ts`——而导入是破坏性操作。
- **零处 `vi.setSystemTime()`**，测试数据全部硬编码 2026 年日期，当前已是 8 月，fixture 中约 2/3 的 `dueDate` 已落到过去。依赖"未来/过期"语义的逻辑（提醒分组、日期区间筛选）会随真实时间推移悄悄改变语义而不报错。
- `src/test/setup.ts` 只 mock 了 `matchMedia`，缺 `ResizeObserver`/`IntersectionObserver`（项目使用 `@tanstack/react-virtual`）；未设 `restoreMocks`/`clearMocks`/`testTimeout`。

### PERF-012 [P2] 体积门禁不在 CI，且只约束主 chunk

`scripts/perf-baseline.mjs:43-46` 定义了 500 kB 硬门禁但从不在 CI 执行。且它只检查 `index-*.js`（249 kB），287.6 kB 的 `react-vendor` 与 867.6 kB 的总量完全不受约束——把依赖移到 vendor chunk 即可绕过门槛。

**建议**：纳入 CI，门禁改为同时约束「首屏阻塞 JS 总量」与「总 JS」。

### ENG-011 [P2] E2E 与构建配置缺口

- ~~`playwright.config.ts` 的注释描述了一个不存在的 CI 检查~~ —— **本次已修**：该注释声称"at least 10 passing tests"由 CI 的 post-suite assertion 保证，但 `ci.yml` 中没有任何统计测试数量的步骤。已删除该虚构描述并改为说明真实的引擎覆盖范围。若确实需要这个门禁，应在 CI 中真正实现它。
- **只跑 Chromium**（`playwright.config.ts:32-37`）。Tauri 在 macOS 用 WKWebView、Linux 用 WebKitGTK，当前只覆盖三个目标平台中一个的渲染引擎。
- **`vite.config.ts` 未设 `build.target`**。Tauri 官方模板按平台设置（Windows `chrome105` / 其它 `safari13`）。macOS 的 WKWebView 比 Chromium 保守，输出不支持的语法会在 macOS 上白屏——而"E2E 只跑 Chromium"意味着这类问题在 CI 里完全测不到。**两个缺口叠加，macOS 是当前风险最高的目标平台。**
- **无 sourcemap**，`ErrorBoundary` 捕获的堆栈是压缩后的乱码。建议 `sourcemap: 'hidden'`。
- CI 失败时不上传 Playwright trace/report（`trace: "on-first-retry"` 已配置但产物无人收集）。
- `ci.yml` 的 `paths-ignore` 只对 push 生效，纯文档 PR 仍会触发三平台全量构建。（其中指向不存在路径的 `PROJECT_ANALYSIS.md` 条目**本次已删除**。）

### ENG-012 [P3] 依赖与仓库卫生

- **4 个零引用依赖应移除**：`@radix-ui/react-select`、`@radix-ui/react-slot`、`@radix-ui/react-switch`、`react-hook-form`（所有表单都是手写受控组件）。
- **`radix-ui` 整包与 `@radix-ui/react-*` 单包混用**：9 个文件用 `@radix-ui/react-dialog`，`button.tsx:3` 与 `ReminderCenterView.tsx:6` 用 metapackage。两种路径可能解析到不同物理副本，导致 Radix 内部 Context（`DismissableLayer`/`FocusScope`）出现两套实例——`ReminderCenterView` 的 Popover 若开在 Dialog 内部就会踩到。建议统一为 metapackage。
- `shadcn` 是 CLI 脚手架，scripts 里无任何调用，应改用 `pnpm dlx` 按需执行。
- `.gitignore` 缺 `output/`（该目录已存在）、`coverage/`、`*.tsbuildinfo`；`.impeccable/` 有 ignore 规则但 `.impeccable/design.json` 已被跟踪，规则与实际矛盾。
- 依赖更新：`lucide-react` 1.17→1.31、`radix-ui` 1.4→1.6、`vite` 8.0.14→8.2.1、`jsdom` 29→30 等；`typescript` 6.0.3→7.0.2 为大版本，需单独评估。

### ENG-013 [P2] `perf:sqlite` 命名误导

```14:14:package.json
    "perf:sqlite": "vitest run src/data/repository.sqlite.perf.test.ts",
```

该文件导入的是 `LocalRepository`，跑在 localStorage stub 上（文件顶部注释已诚实说明）。文件名、script 名与 `PERFORMANCE.md:45` 的表格标题都带 "sqlite"，容易让人误以为 SQLite 路径已有性能基线。建议改名为 `perf:local-20k`。

---

## 9. 运行效率

### PERF-001 [P1] 启动仍全量加载当前工作区任务（承接旧编号）

`readAll()`（`repository.ts:3474-3510`）与 `loadWorkspaceSlices`（`3404-3459`）在启动时一次性拉取当前工作区的全部 `TaskSummary`。列表查询已用 `TASK_LIST_COLUMNS` 排除 `notes`（这一点做得对），但行数本身没有上界。

更根本的是：**分页 API 只解决了"列表渲染"，没解决"全量任务驻留内存"**。各视图在使用 `loadTaskPage` 的同时，仍然用 `data.tasks` 做统计与派生计算（`OverviewView.tsx:92/115`、`WorkspacesView.tsx:56`、`WorkspaceFloatingWindow.tsx:48`、`reminderCenter.ts:30`、`useReminders.ts:20`）。真正的瓶颈是统计口径，需要更多 `loadDueDateCounts` 那样的聚合查询——目前只有日期计数一个。

`useTodos.ts:37` 的 `LOAD_TIMEOUT_MS = 8000` 是一个硬超时：大数据集 + 慢磁盘下冷启动超过 8 秒会直接进入错误屏。

### PERF-013 [P2] `importBackup` 的 N+1

replace 模式对每个实体各发一条 `INSERT`（`repository.ts:3239-3304`），2 万条任务的备份 = 2 万次 IPC round-trip（每次经 tauri invoke → serde → sqlx）。同类问题见 `updateRecurringSeries(openFuture)`（每个实例 3 条语句）与 `bulkSetTaskStatus(completed)`（每个 id 调 `insertNextRecurringInstance`，本身又是 2 次 SELECT + 最多 2 次 INSERT，批量完成 100 个重复任务约 400 次查询）。

`IN (${placeholders})` 在 `bulkDeleteTasks` 等处未分批，超过 `SQLITE_MAX_VARIABLE_NUMBER` 会直接报错。

### PERF-014 [P2] 索引缺口

- **缺 `tasks(workspace_id, deleted_at, created_at)`**：启动最主要的查询是 `WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`（`repository.ts:3429-3432`），现有索引都不满足这个排序，2 万任务时每次加载都要临时排序。
- `tags LIKE '%"x"%'` 无法走索引，标签筛选必然全表扫描。若使用频繁，考虑 `task_tags(task_id, tag)` 关联表。
- `loadTaskPage` 的 `ORDER BY` 含 `COALESCE`/`CASE` 表达式（`1744-1747`），必然产生临时 B-tree 排序。
- v9 的复合索引已覆盖 v6 的 `idx_tasks_workspace_id` 前缀，后者成为冗余索引，拖慢写入。

另注一个隐蔽 bug：`escapeSqlLikeTag`（`repository.ts:289`）把 `"` 转成 `\"`，但 tags 在库里是 `JSON.stringify` 的结果，其中的引号已被转义——**含双引号或反斜杠的标签永远匹配不到**。

### PERF-015 [P3] 每次 mutation 触发一次多余 IPC

```190:196:src/hooks/useTodos.ts
  useEffect(() => {
    if (!data) {
      return;
    }

    void invoke("set_close_to_tray", { value: data.settings.closeToTray }).catch(() => undefined);
  }, [data]);
```

依赖整个 `data` 对象，任何一次 mutation 都会触发一次 IPC 往返。应依赖 `data.settings.closeToTray`。`AppShell.tsx:190-199` 的 `update_tray_menu` 同理（依赖了 `settings` 与冗余的 `settings?.language`，改主题色也会触发）。

### PERF-004 FTS 决策维持不变

维持 Wave 5 决策：**本轮不引入 SQLite FTS5**。LocalRepository 20k `loadTaskPage` P95 远低于预算，且仍无真实桌面搜索计时证据。待 `DESKTOP_VALIDATION.md` 与 `PERFORMANCE_VALIDATION.md` 记录真实数据后再评估。

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

1. `ARC-013` 统一筛选引擎，逐条修复 12 处分叉并配 `runAgainstBoth` 用例。
2. `ARC-014` 补事务；`ARC-018` 校验下沉。
3. `PERF-008` 修 chunk 匹配；`PERF-012` 门禁改为约束首屏总量。
4. `PERF-010` / `PERF-011` 消除 O(n²)，补 `useCallback`。
5. `PERF-009` 视图直接订阅切片，删除 `AppShell` 的 data 重组。
6. `PERF-014` 补索引；`PERF-013` 批量导入下沉到 Rust。
7. `ARC-015` 孤儿数据治理。
8. 用真实 SQLite + Tauri 完成 20k P50/P95 验证，填写 `PERFORMANCE_VALIDATION.md`，再决定 FTS5。

### 阶段 D：架构与体验收口

1. `ARC-017` 拆分 `repository.ts`；`lib.rs` 按第 6 节建议拆为 12 个模块。
2. `ARC-022` 拆分四个千行组件。
3. `UX-012` 补齐 `ui/` 组件层，统一 toast 与 inline 错误。
4. `UX-008` ~ `UX-011` 竞态、加载态、模态语义与可访问性收口。
5. `ENG-012` 依赖清理与升级。
6. `SEC-008` 桌面细节收口。

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
