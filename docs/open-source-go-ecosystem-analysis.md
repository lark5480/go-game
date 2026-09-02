# 开源围棋项目生态分析报告

> 调研方法：使用 Exa-search 检索 GitHub 上主流项目（引擎 / GUI / 在线平台 / 基础库），
> 对代表性项目用 DeepWiki 深入解析其架构与实现细节。
> 星标 / issue 数为检索快照，仅用于量级参考。

---

## 一、生态的分层格局

围棋开源生态与国际象棋高度相似：**一个绝对主导的引擎 + 一堆薄壳 GUI + 一个半开源的在线平台 + 一批年久失修的基础库**。

| 层 | 代表项目 | 角色 |
|---|---|---|
| 引擎 | **KataGo**、Leela Zero、Sayuri、Pachi、GNU Go | 只提供 GTP / JSON 协议，无 UI |
| 桌面 GUI | **Sabaki**、**KaTrain**、q5Go、Ogatak、LizzieYzy Next、Kaya、frank_go、popojan/goban | 棋谱编辑 + 分析可视化 |
| Web / 在线 | **OGS(online-go.com)**、zGo、BUGOUT、seki、weiqi.com | 对局撮合、实时通信、复盘 |
| 基础库 | @sabaki/*、online-go/goban、wgo.js、besogo、glift、sgfmill、sente、**SGFC** | SGF 解析、棋盘渲染、GTP 封装 |

---

## 二、多维度横向对比

| 项目 | 技术栈 | 星标 | 活跃度 | AI 引擎集成方式 | 棋谱格式 | 跨平台 | 测试/CI | 关键短板 |
|---|---|---|---|---|---|---|---|---|
| **KataGo** | C++17/CMake，CUDA·TensorRT·OpenCL·Eigen·Metal | ~5k | 高（2026 仍在迭代） | 自身即引擎：GTP + JSON analysis engine | SGF 读写（dataio/sgf） | Win/Linux/macOS | `katago runtests` 内建测试 | 无 GUI；编译与首次 OpenCL tuning 门槛高；配置项过载；单核心维护者 |
| **Leela Zero** | C++/Qt | ~5.6k | **事实停更**（v0.17=2019，训练服 2021-02 关停，374 open issues） | GTP | SGF | 三平台 | Travis/AppVeyor 均已失效 | 已被 KataGo 取代，仅历史价值 |
| **Sabaki** | Electron 43 + Preact，@sabaki/* 生态 | ~2.7k | **复活**（v0.60.0, 2026-07 大版本） | `EngineSyncer` + @sabaki/gtp，三段式位置同步；`lz-analyze`/`kata-analyze` 解析 | 读 SGF/NGF/GIB/UGF，**只写 SGF** | Win/macOS(ARM)/Linux | Mocha + Playwright E2E + golden GTP transcripts | 导出格式单一；~100+ open issues；子库群多年低维护；主题渲染 bug |
| **KaTrain** | Python 3.11+ / Kivy | ~2k | 中（PyPI v1.19，社区在推 v2 重构分支） | KataGo **analysis engine**（非 GTP）+ 优先级查询队列 + stderr 崩溃恢复；10+ 种弱化 AI | SGF/GIB/NGF，编码嗅探 + foxwq komi 修正 | Win/macOS/Linux/pipx/brew | pytest（无 KataGo 时自动 skip，`CI=true` 全跳）；CI 仅 macOS 打包 | Kivy/KV 技术债；引擎路径在 CI 中零覆盖；包体巨大 |
| **q5Go** | C++/Qt5 | ~193 | 低-中 | KataGo/LZ 分析 + 批量目录分析 + GTP 对战 | SGF + 多格式导出，棋盘至 52 路 | 三平台 | 无公开测试套件 | Qt5 未迁 Qt6；自建 DB 与 Kombilo 不兼容；文档=changelog |
| **Ogatak** | Electron **9** + 原生 JS（零 npm 依赖） | ~138 | 低-中 | analysis engine 优先，`desired/running` 单查询 + `terminate` 节流；GTP 为降级路径 | 读 SGF/NGF/GIB/UGI，写 SGF；**让分与中盘编辑处理最正确** | 三平台 | **无任何测试与 CI** | Electron 9 存在安全风险；功能面窄 |
| **Kaya** | Tauri v2 + React 19 + Rust + Bun monorepo(14 包) | ~96 | **高**（2026 仍频繁发版） | **KataGo → ONNX Runtime**：`Engine` 抽象基类 → `OnnxEngine`(WASM/WebGPU) / `TauriEngine`(CUDA·CoreML·DirectML·NNAPI) | SGF 导入导出 + OGS URL 导入 + 拍照识谱(RT-DETR) | Win/macOS/Linux/Web/Android(实验) | bun test + Playwright（含 desktop config）+ format/type-check | 纯神经网络推理无完整 MCTS，棋力弱于原生 KataGo；Win 未代码签名；SGF 覆盖度无文档 |
| **OGS** | React+TS+Vite，`goban` 子模块双构建 | ~1.5k | 高（150 贡献者） | AI Review 走 `leela_zero`/`katago`，独立 AI WebSocket | SGF 上传/粘贴/下载（对局中限流防作弊） | Web/移动端 | Jest + Playwright + AGENTS.md + docs.online-go.com | **后端闭源**（仅前端/goban/rating 开源），无法自建实例 |
| **zGo** | React 18 + Express 5 + better-sqlite3 + ws | 小 | 新兴 | KataGo GTP via `child_process`，一键重启引擎 | SGF | Web/PWA | Vitest 128 tests | 单机单引擎进程；仅 EN/KR |
| **BUGOUT** | Rust 微服务 + Redis Streams + Sabaki 衍生前端 | ~80 | **停滞**（默认分支 `unstable`，82 open issues） | KataGo on Jetson Nano（5W） | SGF | Web | — | 分布式单体过度设计 |
| **wgo.js / besogo / glift** | Canvas / SVG 纯 JS | 337/134/120 | 低 / 低 / 停更 | 无 | SGF | Web | glift 用已下线的 Travis | wgo 长期停在 `3.0.0-alpha.10`(2021)；besogo README 直接列出**不支持的 SGF 属性**（如 `PL` 被忽略） |

### 结论性判断

1. **引擎层已经收敛，问题全在"最后一公里"**。KataGo 的 `docs/Analysis_Engine.md` 和 GTP 扩展文档质量很高，但 KataGo README 自己都在吐槽："很多 GUI 报错做得很差，会完全吞掉 KataGo 的错误信息" —— 这是整个生态最普遍的缺陷。
2. **GUI 层同质化 + 反复重造轮子**。Sabaki / Ogatak / q5Go / Kaya / KaTrain 各写了一套 SGF 解析器和一套引擎进程管理，导致同一个 SGF 在不同软件里表现不一致（Ogatak README 明确以"能正确处理让子与中盘 board edits"作为卖点，反证他人不行）。
3. **SGF 兼容性是系统性欠债**。FF[4] 的压缩点列 `[aa:cc]`、`[tt]` vs `[]` pass、27–52 路用大写字母、矩形棋盘 `SZ[13:9]`、setup/move 同节点必须拆分、`HA` 与 `AB` 数量不符、以及最致命的 **CA 编码 + 转义符的"字节级 vs 字符级"歧义**（GB2312/Big5/Shift_JIS 非 ASCII-safe，`0x5c` 会出现在多字节序列尾字节，导致文件转 UTF-8 后彻底不可解析），几乎没有一个 JS/TS 实现完整覆盖。而 FF[4] 参考实现 **SGFC**（Codeberg，含 74+ 编号诊断）几乎无人拿来做一致性测试。
4. **在线平台是最大空白**。OGS 后端闭源，Dragon Go Server 是古董 PHP，其余（zGo/seki/BUGOUT）都是个人项目。这是最有价值的可切入点。

---

## 三、针对具体项目的可落地改进建议

### 3.1 Sabaki —— 补齐导出格式 + 拆分引擎层

| # | 问题 | 具体动作 |
|---|---|---|
| S1 | `src/modules/fileformats/` 只有 SGF 有 writer，NGF/GIB/UGF 是只读的死胡同 | 为每个 fileformat 模块补 `stringify(gameTrees)`，统一 `{extensions, parse, stringify, canWrite}` 接口；文件菜单加"Export As…"，用 SGFC 生成的样本做 round-trip 断言（parse→stringify→parse 树同构） |
| S2 | 无法一次导出多局/批量转换 | 新增 CLI 入口 `sabaki convert --in dir --to sgf --ff4-strict`，复用同一 fileformats 模块，让 Sabaki 同时成为可脚本化的转换工具 |
| S3 | `EngineSyncer.sync()` 的三段式重放（incremental replay / rearrange / full rearrange）无单测，是历史 bug 高发区 | 把 `sync` 抽成纯函数 `planSync(engineState, targetBoard) → Command[]`，对"让子局 + 中盘 AB/AE 编辑 + 分支跳转"编写表驱动测试 |
| S4 | 引擎启动失败时用户只看到"loading" | 在 `EngineSyncer` 里保留 stderr ring buffer（最后 200 行），启动超时（默认 30s，OpenCL 首次 tuning 场景可延长）后弹窗直接展示 stderr 原文 + "复制启动命令"按钮 |
| S5 | 只支持 `lz-analyze`/`kata-analyze`，无法利用批量能力 | 新增 `analysisProtocol: 'gtp' \| 'katago-json'` 引擎配置项；JSON 模式下"整局分析"用一条含 `analyzeTurns` 的查询替代逐手轮询，并实现 `terminate_all` 用于取消 |
| S6 | 子库群（@sabaki/sgf、immutable-gametree、deadstones）版本漂移 | 在主仓库加一个 `integration` 测试 workflow，对每个子库跑一次 npm dist-tag `next` 的联合构建 |

### 3.2 KaTrain —— 修复"测试形同虚设"与 CI 覆盖

| # | 问题 | 具体动作 |
|---|---|---|
| K1 | 测试在 `CI=true` 时全量 skip，等于引擎交互零回归保护 | 录制真实 KataGo analysis engine 的请求/响应对，落成 `tests/fixtures/*.jsonl`；把 `MockEngine` 改为回放 fixture 的 replayer，使 `KataGoEngine` 的队列/优先级/超时/`terminate` 逻辑在无 GPU 的 CI 上可测 |
| K2 | CI 只有 `osxbuild.yaml` | 增加 matrix（ubuntu/windows/macos × py3.11-3.13）跑 pytest + `pipx install .` 冒烟；发布前跑一次真实 KataGo Eigen(CPU) 后端的 3 手对局 smoke test |
| K3 | `sgf_parser.py` 的兼容性补丁（Windows-1252/GB2312→GBK、foxwq komi 修正）是隐性知识 | 建 `tests/sgf_compat/` 语料库：野狐/Tygem/弈城/KGS/OGS 各来源真实文件 + 期望值 YAML；同时把这些启发式规则文档化 |
| K4 | Kivy/KV 技术债（社区已有 v2 重构分支，风险大） | 不要一次性重写。按分支里已验证的方向增量落地：先抽 `katrain/gui/components/`（buttons/forms/layout/popup）与 `PopupManager`，每次 PR 只搬迁一个面板 |
| K5 | 引擎崩溃只弹恢复框 | 引入指数退避自动重启 + 崩溃时把 stderr 尾部与 `analysis_config.cfg` 摘要一起写入可一键复制的诊断报告 |

### 3.3 Ogatak —— 从"零测试 + Electron 9"脱困

| # | 问题 | 具体动作 |
|---|---|---|
| O1 | **Electron 9**（Chromium 83，多个已知 RCE 级 CVE） | 参照 Sabaki v0.60.0 的做法逐个大版本升级，移除 `remote`、引入 `contextIsolation` + preload IPC 白名单 |
| O2 | 无测试、无 CI，而它最大的资产恰恰是"SGF 正确性" | 把 `load_sgf/load_ngf/load_gib/load_ugi` 与 `save_sgf` 抽成不依赖 Electron 的纯模块，用 node:test 跑：① round-trip 同构；② 让子局 `HA`/`AB` 一致性；③ 中盘 `AE`/`AB` 编辑后的棋盘状态 |
| O3 | `desired/running` 单查询模型无法做整局分析 | 保留单查询用于交互，另开一条 batch 通道：`analyzeTurns` 一次提交全局，配 `id` 前缀区分交互/批量，取消时对批量 id 调 `terminate` |
| O4 | 不含 KataGo，"setup takes at least a minute's effort" | 加"首次运行向导"：检测 PATH/常见安装位置 → 提供官方 release 直链下载 + 校验 sha256 → 自动生成 `analysis.cfg` → 跑一次 `katago benchmark` 并展示实测 visits/s |

### 3.4 Kaya —— ONNX 路线的棋力与可信度

| # | 问题 | 具体动作 |
|---|---|---|
| Y1 | ONNX 只做单次网络前向，缺搜索，标注为"KataGo 分析"易误导用户 | 在 Rust 侧实现轻量 MCTS：批量 `run_inference` + PUCT + Dirichlet 噪声，暴露 `visits` 参数；UI 上明确区分 "policy-only" / "search(N visits)" 两种模式 |
| Y2 | `Engine` 抽象已存在但只有 ONNX 实现，无法接原生 KataGo | 补 `KataGoProcessEngine`（Tauri sidecar 起 `katago analysis`，走 JSON 协议），`capabilities()` 声明是否支持 `ownership`/`scoreLead`/`humanSL` 供 UI 降级 |
| Y3 | `@kaya/sgf` 的格式覆盖度无文档、无一致性测试 | 建 `packages/sgf/test/conformance/`，用 SGFC 的诊断样例逐条断言行为；README 加"支持/不支持属性矩阵" |
| Y4 | Windows SmartScreen 告警 | 申请 OV/EV 代码签名或走 Azure Trusted Signing；至少在 Release 页提供 sha256 与 `winget` manifest |
| Y5 | Android 实验性、NNAPI 在非 Android 静默回退 CPU | 在 UI 显示"实际生效的 execution provider"，避免用户以为在用 GPU |

### 3.5 KataGo —— 降低集成方的踩坑成本

| # | 问题 | 具体动作 |
|---|---|---|
| G1 | 首次 OpenCL tuning 数分钟无输出，GUI 侧表现为"卡死" | 在 tuning 期间向 stdout 发结构化进度（或 stderr 固定前缀），并在 `Analysis_Engine.md` 里给出"GUI 开发者应如何呈现启动阶段"的推荐做法 |
| G2 | `numAnalysisThreads` × `numSearchThreadsPerAnalysisThread` 的权衡靠注释文字传达 | 提供 `katago genconfig --for-interactive-gui` / `--for-batch-server` 两个 preset |
| G3 | 集成方普遍不实现 `terminate` / `terminate_all` | 在文档里增加一节 "Reference client checklist"（query id 命名、`isDuringSearch` 作为完成标记、终止后仍会收到一条 `noResults` 回包、字段前向兼容），并把 `python/query_analysis_engine_example.py` 扩展成含取消与并发的完整参考实现 |

### 3.6 在线平台层（zGo / seki / 新建项目）—— 生态最大空白

- **引擎池化**：zGo 目前 `child_process` 单进程 + "一键重启"，是明显瓶颈。改为独立的 `analysis-worker` 服务：进程池 + 请求队列 + 每用户配额 + 结果按 `(position hash, visits, rules)` 缓存（KataGo 回包自带 `thisHash`/`symHash`，可直接做缓存键）。
- **对局引擎接口标准化**：定义一层与引擎无关的 HTTP/WS 契约（`POST /analyze {moves, rules, komi, boardSize, maxVisits, includeOwnership}` → SSE 增量 + 终态），后端可换 KataGo GTP、KataGo analysis、ONNX，前端不感知。这正是 seki 的 `seki-gtp` bridge 的思路，值得抽成独立包复用。
- **反作弊与 SGF 下载**：借 OGS 的成熟策略（对局进行中匿名用户与对局者不可下载 SGF，登录观战者可下载），但要**把规则写进 API 文档**。
- **填补 OGS 后端空白**：OGS 后端因"代码太乱"长期不开源已成社区共识。现实路径不是等它开源，而是**复用其已开源的 `online-go/goban`**（`goban-engine` 为纯 Node 构建，含 BoardState/GobanEngine/MoveTree/JGOF/autoscoring/protocol 定义）作为新服务端的规则内核。

### 3.7 基础库层 —— 建立一次性的公共资产

这是投入产出比最高的一项，且能一次性缓解上面所有项目的问题：

1. **建立 `sgf-conformance-suite`**（独立仓库，CC0/MIT）
   - 用 SGFC 作为 oracle，生成覆盖全部编号诊断的输入/期望输出对；
   - 补充真实世界语料：野狐/Tygem GIB/wBaduk NGF/UGF/KGS/OGS/Kogo's Joseki Dictionary（超大树）；
   - 提供 JSON 描述的期望值（节点数、棋盘状态快照、被保留的未知属性列表），语言无关；
   - 各实现（@sabaki/sgf、@kaya/sgf、Ogatak、sgfmill、besogo、wgo.js）接入后自动生成"兼容性矩阵"徽章。
2. **优先修复清单**（各库通用）
   - 压缩点列 `[aa:cc]` 展开与写回；
   - `[tt]` ↔ `[]` pass 双向兼容（≤19 路）；
   - 27–52 路的大写字母坐标 + 矩形 `SZ[w:h]`；
   - `CA` 编码：明确采用**先按声明字符集解码、再做字符级反转义**，并对已被误转成 UTF-8 的历史文件做启发式救援（这是中日韩棋谱最高频的"打不开"原因）；
   - setup/move 同节点自动拆分为两节点（`N[]` 留在前一节点）；
   - 未知属性必须原样保留并告警，不得静默丢弃。
3. **besogo / wgo.js / glift**：besogo 应合入 `PL` 支持（PR #30 已存在，2022 年至今未合）并把 README 的"不支持属性"清单转成 CI 断言；wgo.js 需要从 `3.0.0-alpha.10`(2021) 收尾发 3.0 正式版或明确标注 unmaintained；glift 的 Travis 徽章已失效，应迁 GitHub Actions 或归档。

---

## 四、优先级建议

| 优先级 | 事项 | 理由 |
|---|---|---|
| P0 | Ogatak 升级 Electron + 加 SGF 纯模块测试 | 安全风险 + 它的正确性资产未被固化 |
| P0 | 建立 `sgf-conformance-suite` | 一次投入，全生态受益，是"改进 SGF 兼容性"最实质的做法 |
| P0 | KaTrain 引擎交互 fixture 回放测试 + 多平台 CI | 当前引擎逻辑零回归保护 |
| P1 | Sabaki 多格式导出 + `planSync` 可测化 | 用户最高频诉求 + 最大 bug 源 |
| P1 | Kaya 补 `KataGoProcessEngine` + SGF 一致性测试 | 补齐棋力短板，兑现"KataGo 分析"承诺 |
| P1 | 各 GUI 统一"引擎 stderr 可见化 + 启动向导" | KataGo 官方 FAQ 里最大痛点 |
| P2 | 在线平台引擎池化 + 引擎无关 API 契约 | 生态空白，但工程量大 |
| P2 | q5Go 迁 Qt6；besogo 合 PR #30；wgo.js 定版或归档 | 降低长期腐化 |

---

## 附录：本报告与本仓库（`go-game`）的关系

**第三节的 P0–P2 改动，没有一条属于本仓库。** 它们的目标分别是 Ogatak（Electron）、
KaTrain（Python + Kivy）、Sabaki（Electron）、Kaya（Rust + Tauri）、KataGo（C++）、
zGo / besogo / wgo.js 等第三方项目，需要在各自上游仓库提 PR，无法在这里实现。

本仓库是纯前端应用（Vite + React + TS），AI 为自研 UCT（`src/ai/mcts.ts`），与
KataGo / ONNX 无集成关系，也没有 Electron / Python / Rust 组件。

因此把报告的**方法论**本地化，形成本仓库自己的实施顺序：

| 本地优先级 | 映射原报告 | 本仓库动作 | 状态 |
|---|---|---|---|
| L-P0-1 | P0-2 | SGF 兼容层（`src/sgf/`）+ 兼容性测试套件 | 已完成（43 项测试） |
| L-P0-2 | P0-3 | CI：GitHub Actions 跑 lint + `vitest run` + build | 已完成 |
| L-P1-1 | P1-1 | 棋谱导入导出接入对局 UI | 已完成（含让子；仅导入主分支） |
| L-P1-2 | P1-3 | AI 降级可见化（Worker 失败/超时回退初级时提示） | 已完成（4 个降级点） |
| L-P2-1 | P2-1 | `chooseAiMove` 可插拔引擎适配器 | **评估后不做**——理由见下 |

### 关于 L-P2-1：评估后决定不实施

原报告把「引擎无关 API 契约」列为值得做的一半，前提是**存在多个可替换的引擎实现**。
本仓库只有自研 UCT 一种实现，也没有接入 KataGo/ONNX 的计划，此时引入抽象层属于为假想
需求付费（YAGNI）：多一层间接、多一个需要维护的接口，却换不来任何当下可用的能力。

真正需要它时（例如确实要接入外部引擎），抽象成本并不会显著上升，反而届时才拥有真实的
第二实现来校正接口设计——这正是避免过早抽象的理由。因此该项**暂不实施**。
