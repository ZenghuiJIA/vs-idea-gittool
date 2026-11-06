# Rebased Git 功能梳理与 IdeaGitTool 扩展路线

## 1. 文档目的

本文基于 Rebased 的 IntelliJ Git 架构和当前 IdeaGitTool 源码，判断下一批最适合增加的功能。

本文只做功能规划，不改变现有 Git 历史，不修改用户工作区文件。

## 2. 当前工程结论

IdeaGitTool 已经不是一个简单的 VSCode Git 扩展。

当前工程已经覆盖 Rebased 的主要交互骨架，并且拥有较完整的 Git 操作层：

- Git 命令执行和控制台输出。
- 多仓库发现和仓库选择。
- 状态、引用、远程仓库和 Stash 缓存。
- Commit、Changelist、Shelf 和 Stash。
- Git Log、提交图、过滤、提交详情和 Diff。
- 文件历史、Annotate、Inline Blame 和分支比较。
- Branches 面板和分支操作。
- Merge、Rebase、Interactive Rebase、Cherry-pick、Revert、Reset。
- 冲突检测、三栏合并编辑器和冲突继续操作。
- Update Project、Smart Checkout、Smart Merge 和保存本地改动。
- Worktree、Local History、Patch 和 Git Console。
- VSCode 和 IntelliJ 两种外观。
- 中英文界面和 AI 提交消息。
- 单元测试、真实 Git 测试、Webview 预览和 VSCode E2E 测试。

因此，下一阶段不应再优先增加普通 Git 命令。

更高价值的工作是补齐可靠性、数据安全、复杂仓库性能和 IntelliJ 与 VSCode 之间的行为差异。

## 3. 当前架构与 Rebased 的对应关系

```text
VSCode Extension Host
├── extension.ts
├── context.ts
├── git
│   ├── exec.ts          Git CLI 进程和输出
│   ├── repository.ts    仓库快照、监听和刷新
│   ├── manager.ts       多仓库发现和选择
│   ├── logStream.ts     增量日志读取
│   └── graph.ts         提交图布局
├── features
│   ├── commit           Commit、Shelf、Stash、Conflict
│   ├── log              Log、Diff、History、Annotate
│   ├── ops              Branch、Remote、Update、Rebase、Worktree
│   └── localHistory     本地快照和恢复
├── host
│   ├── dialog.ts        IntelliJ 风格对话框
│   ├── gitContent.ts    版本文件内容和 Diff URI
│   ├── ui.ts            通知、进度和确认
│   └── webviewHost.ts   Webview RPC
├── shared              Host 与 Webview 的协议和领域模型
└── webview             Commit、Log、Dialog 和 Merge UI
```

该结构与 Rebased 的分层方向一致：

| Rebased 概念 | IdeaGitTool 实现 |
|---|---|
| Git Handler | `src/git/exec.ts` |
| Git Repository | `src/git/repository.ts` |
| Repository Manager | `src/git/manager.ts` |
| Git Operation | `src/features/ops/engine.ts` |
| Changes View | `src/features/commit/view.ts` 与 Commit Webview |
| VCS Log | `src/features/log` 与 Log Webview |
| Conflict Resolver | `src/features/commit/conflicts.ts` 与 Merge Webview |
| Shared Model / RPC | `src/shared` 与 `src/host/webviewHost.ts` |
| IntelliJ Actions | `src/features/*/index.ts` 注册的 VSCode Commands |

## 4. 下一阶段最适合增加的功能

### P0：可靠性和安全性

这些功能优先级最高，因为它们保护用户的提交和工作区。

#### 4.1 统一操作会话

为每次 Git 操作增加统一的 `OperationSession`：

```ts
interface OperationSession {
  id: string;
  root: string;
  operation: string;
  startedAt: number;
  phase: 'checking' | 'saving' | 'running' | 'conflict' | 'restoring' | 'refreshing' | 'done';
  command?: string[];
  cancellable: boolean;
}
```

收益：

- 防止旧操作的慢结果覆盖新状态。
- 统一进度、取消和最终结果。
- 让 Merge、Rebase、Pull、Push 和 Smart Operation 使用同一套生命周期。
- 日志、通知和 UI 都能关联到同一个操作。

建议新增目录：

```text
src/operations/
  session.ts
  coordinator.ts
  outcome.ts
  safety.ts
```

#### 4.2 仓库写锁和操作互斥

当前操作层已经有 `repo.batch()`，但下一阶段应明确禁止同一仓库同时执行冲突操作。

建议规则：

- 同一仓库同时只允许一个写操作。
- Fetch 可以和只读 Log 并行。
- Merge、Rebase、Checkout、Reset、Stash 和 Commit 互斥。
- UI 必须显示正在执行的操作。
- 取消操作只在 Git 进程确实退出后解除锁。

#### 4.3 破坏性操作保护

对以下操作增加统一的预览和确认：

- Force Push。
- Reset --hard。
- Clean。
- Delete Branch。
- Drop Commit。
- Rewrite History。
- Abort Merge 或 Rebase。
- 删除 Worktree。
- 清理 Recently Deleted Shelf。

确认界面应显示：

- 仓库路径。
- 当前分支。
- 目标分支或提交。
- 将被删除或覆盖的文件数量。
- 是否存在未推送提交。
- 是否使用 `--force-with-lease`。

#### 4.4 Git 输出结构化记录

当前 Git Console 已经能显示命令。

建议同时保存结构化记录：

```ts
interface GitOperationRecord {
  sessionId: string;
  root: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: number;
  durationMs: number;
  outcome: string;
}
```

这样可以支持：

- 操作详情。
- 失败重试。
- 复制完整命令。
- 诊断报告。
- 测试断言。

### P1：复杂 Git 工作流

#### 4.5 Bisect 工作流

当前领域类型已经包含 `bisect`，但需要确认 UI 和操作是否完整。

建议增加：

- Start Bisect。
- Mark Good。
- Mark Bad。
- Skip。
- 查看 Bisect 日志。
- Reset Bisect。
- 显示当前测试提交。
- 自动执行脚本。
- 与 Log 选择的提交联动。

#### 4.6 Rebase 状态恢复

Interactive Rebase 已存在，但应继续补齐异常恢复：

- 进程被 VSCode 关闭后的状态恢复。
- 检测 `rebase-merge` 和 `rebase-apply` 的详细状态。
- 显示当前步骤和剩余步骤。
- 继续前检查冲突是否全部解决。
- 失败时保留原始输出和操作上下文。
- 支持打开当前 rebase todo 文件。

#### 4.7 Patch 应用和冲突恢复

当前已有 Create Patch 和 Apply Patch 入口。

建议补充：

- Patch 预览。
- Patch 文件编码检测。
- Patch 应用前冲突预测。
- 部分 Patch 应用。
- Patch 应用失败后的回滚。
- Patch 与 Shelf、Stash 的互转。

#### 4.8 Submodule 管理

这是完整 Git 工具的重要缺口。

建议增加：

- Submodule 树视图。
- 初始化和更新 Submodule。
- 更新到远程提交。
- 递归更新。
- 检查 detached 状态。
- 显示 Submodule 未提交改动。
- 在父仓库 Log 中显示 Submodule 变化。
- 子模块仓库单独打开 IdeaGitTool 视图。

#### 4.9 Git LFS 支持

建议先做状态可视化，再做写操作：

- 检测 Git LFS 是否安装。
- 显示 LFS 文件状态。
- 显示指针文件和真实对象区别。
- Pull、Push、Fetch 的 LFS 进度。
- LFS 锁定和解锁。
- LFS 锁冲突提示。

### P1：状态和性能

#### 4.10 增量刷新

当前 `Repository.refresh()` 和文件监听已经存在。

大仓库中建议增加：

- 基于 dirty path 的局部刷新。
- 状态、Refs、Stashes 分开刷新。
- 合并相邻刷新请求。
- 操作期间延迟非必要刷新。
- 只读 Log 与工作区状态解耦。
- 大仓库刷新耗时展示。

#### 4.11 Git Log 查询缓存

当前 Log 使用 `LogStream` 增量加载。

下一步可以增加：

- 按仓库和查询条件缓存提交页。
- 取消无效查询。
- 筛选条件变化时复用已加载提交。
- 超大仓库限制图布局内存。
- Log 结果和当前 HEAD 做代际校验。

#### 4.12 后台诊断面板

增加一个轻量的 `Git Diagnostics`：

- Git 版本。
- 当前 Git 路径。
- Shell 和环境变量摘要。
- 仓库根目录。
- Git Dir 和 Common Dir。
- 当前操作状态。
- 最近失败命令。
- 文件监听状态。
- Credential Helper 配置名称，但不显示凭据。

### P2：交互和平台集成

#### 4.13 GitHub 和 GitLab 基础集成

纯 Git 能力已经较完整。

平台功能建议从只读开始：

- 从远程 URL 识别 GitHub 或 GitLab。
- 打开提交、分支和文件页面。
- 打开 Pull Request 或 Merge Request。
- 显示当前分支关联的 PR/MR。
- 显示 CI 状态。
- 之后再增加创建、Review 和合并。

不要把平台 API 直接写入 `src/features/ops`。

建议独立为：

```text
src/providers/
  remoteProvider.ts
  githubProvider.ts
  gitlabProvider.ts
```

#### 4.14 认证和远程交互增强

建议增加：

- SSH 连接诊断。
- Credential Helper 诊断。
- 认证失败后的重试操作。
- HTTP 代理提示。
- WSL Git 选择。
- Git Askpass 状态说明。
- 不保存 Token 到普通配置。

#### 4.15 键盘操作和可访问性

当前已有 IntelliJ 快捷键和自定义 Webview 控件。

下一步应系统检查：

- 所有控件的键盘焦点。
- Tree 行的上下移动。
- Dialog 的默认按钮。
- Escape 和 Enter 行为。
- 屏幕阅读器标签。
- 高对比度主题。
- 减少动画设置。
- Webview 内部和 VSCode 命令的快捷键冲突。

## 5. 不建议现在优先做的功能

### 5.1 继续复制普通 IntelliJ 菜单

当前 Branches、Commit、Log 和操作菜单已经覆盖主要工作流。

继续增加菜单项的收益低于可靠性建设。

### 5.2 自建 Git 对象数据库

当前系统 Git CLI 方案更可靠。

除非将来需要离线 Git，否则不应替换为 JavaScript Git 实现。

### 5.3 过早实现完整 Pull Request 编辑器

平台 API、登录、权限、Review 状态和 CI 状态会显著扩大范围。

先实现远程识别和浏览器跳转更合适。

### 5.4 只增加视觉效果

当前已有 IntelliJ 图标、主题、图形提交线和三栏 Merge UI。

视觉增强应服务于状态、风险和可访问性，而不是单独作为主要版本目标。

## 6. 推荐版本路线

### 0.5：可靠性版本

- OperationSession。
- 仓库写锁。
- 统一破坏性操作确认。
- 结构化 Git Operation Record。
- 操作取消和恢复。
- Git Diagnostics。
- 核心操作的真实 Git 回归测试。

### 0.6：高级 Git 版本

- Bisect。
- Rebase 状态恢复。
- Patch 预览和失败恢复。
- Submodule。
- LFS 状态和进度。
- 大仓库增量刷新。

### 0.7：远程协作版本

- GitHub/GitLab 远程识别。
- 提交、分支和文件浏览。
- 当前分支 PR/MR 状态。
- CI 状态。
- SSH、Credential Helper 和代理诊断。

### 0.8：体验和可访问性版本

- 完整键盘导航。
- Screen Reader 标签。
- 高对比度检查。
- 多窗口和多根工作区体验优化。
- Log 查询缓存和性能报告。

## 7. 建议的实施顺序

第一批建议直接选择以下五项：

1. `OperationSession` 和仓库写锁。
2. 破坏性操作确认和预览。
3. Bisect 工作流。
4. Git Diagnostics 面板。
5. Submodule 状态视图。

理由：

- 第一、二项直接降低数据丢失风险。
- 第三项补齐 Git 高级工作流。
- 第四项降低跨平台排障成本。
- 第五项补齐真实项目常用的仓库能力。

## 8. 每个功能的验收要求

新增功能必须同时满足以下条件：

- 有明确的命令入口和 UI 入口。
- 写操作绑定明确的仓库根目录。
- 能识别 Git 进程退出、冲突和取消。
- 失败时显示真实 stderr，不显示伪成功。
- 操作结束后刷新 Repository Snapshot。
- 不覆盖用户未提交改动，除非用户明确确认。
- 有至少一个临时 Git 仓库测试。
- 有多仓库或错误状态测试，视功能适用。
- 有中英文文案。
- 不把凭据写入普通配置。
- 更新 `ARCHITECTURE.md`、README 或本路线文档。

## 9. 最终判断

IdeaGitTool 当前已经具备实现 Rebased 主要 Git 工作流的基础。

最合适的下一步不是重写架构，也不是继续复制全部 IntelliJ UI。

建议以可靠性为中心，先统一 Git 操作生命周期和仓库状态，再补 Bisect、Submodule、LFS 和远程平台能力。

这样可以把当前工程从“功能丰富的 Rebased UI 复刻”推进为“可长期使用的 VSCode Git 工作台”。

## 10. 第二阶段实现状态

本阶段已完成以下基础能力：

- Git 命令结果写入结构化 `GitOperationRecord`。
- 取消的 Git 命令记录为 `cancelled`。
- 增加破坏性操作预览模型和统一确认函数。
- 增加 Rebase 状态读取，包括当前步骤、总步骤和 todo 文件。
- 增加 Patch 失败后的回滚入口。
- 增加 Git LFS 安装、状态和锁读取。
- 增加 GitHub 和 GitLab 远程 URL 识别以及提交、分支和文件 URL 生成。

本阶段的功能已经通过 TypeScript 检查和完整测试。

下一步仍需把破坏性预览接入 Reset、Drop、Delete Branch、Force Push 和 Worktree 删除的全部 UI 路径，并为远程 URL 入口增加浏览器动作。

## 11. Fork 使用策略

本项目按本地 fork 方式继续开发。

本阶段不创建 Pull Request，不执行推送，不修改上游仓库。

代码、测试和文档只保留在当前 fork 工作区，验证通过后再由项目维护者决定是否发布。

本阶段已将统一破坏性预览接入 Hard Reset、删除分支、强制删除 Worktree 和 Force Push，并增加 `Open Remote Git Page` 命令。

## 12. 本地 fork 当前进度

统一安全预览现在覆盖以下高风险操作：

- Hard Reset。
- Drop Commit。
- Delete Branch。
- Abort Merge、Rebase、Cherry-pick、Revert 和 Bisect。
- Force Push。
- Force Delete Worktree。

远程只读入口现在提供 `Open Remote Git Page` 命令。

当前工作只保留在本地 fork，不创建 Pull Request，不执行远程推送。

## 13. 最近一次本地回归

Drop Commit 和 Abort 操作已接入统一破坏性操作预览。

最近一次 `npm test` 结果为 123 项通过，0 项失败。

本地 fork 仍未创建 Pull Request，也未执行推送。

## 14. 操作取消状态

操作会话现在记录：

- 是否请求取消。
- `cancelled` 终态。
- 取消后的结构化 Git 记录。
- 取消请求后的会话快照。

最近一次回归测试为 124 项通过，0 项失败。

## 15. 诊断增强

Git Diagnostics 现在显示最近十条结构化 Git 操作记录，包括操作名称、结果和耗时。

这让本地 fork 可以直接检查取消、失败和慢操作，而不需要复制完整输出日志。

## 16. 诊断菜单入口

Git Diagnostics 现在加入 Git 主菜单。

用户不需要打开命令面板即可查看 Git 环境、仓库状态、Rebase、LFS 和最近操作记录。

## 17. 会话关联

Repository 写操作现在把 OperationSession 的 ID、操作名称和仓库路径传给底层 Git 记录。

诊断记录因此可以把一次复合操作中的多个 Git 命令归到同一个操作会话。

## 18. 复合操作诊断聚合

诊断面板现在按 OperationSession 聚合最近 Git 命令。

输出包含：

- 操作结果集合。
- 复合命令数量。
- 总耗时。
- 会话短 ID。

这避免一个 Rebase 或 Update 操作被多条底层命令分散显示。

## 19. 诊断导出

新增 `Copy Git Diagnostics` 命令。

用户可以将 Git 环境、仓库状态、LFS、Rebase 和聚合操作记录复制到剪贴板。

复制内容不包含凭据值。

## 20. 远程页面 URL

远程只读 URL 现在覆盖提交、分支和文件页面。

支持 GitHub、GitLab 和 Bitbucket 的基础 URL 规则。

## 21. 日志远程菜单

Git Log 提交上下文菜单现在可以打开：

- 当前提交远程页面。
- 当前分支远程页面。
- 当前文件远程页面。

## 22. 当前本地 fork 基线

当前 fork 已完成本轮路线中的核心可靠性和只读协作能力：

- 统一 OperationSession 和仓库写锁。
- 结构化 Git 命令记录和取消状态。
- 破坏性操作预览。
- Git Diagnostics 和复制诊断。
- Bisect、Submodule 和 LFS 状态。
- Patch 失败恢复。
- GitHub、GitLab 和 Bitbucket 远程提交、分支和文件 URL。
- Git Log 远程上下文菜单。

所有改动只保留在本地 fork。

本轮不创建 Pull Request，不执行远程推送。
