# 围棋生态情报简报（`go-game` 专项）

> 目的：在动手前摸清"哪些轮子已经存在、哪些坑已经有人踩过"，避免重造和重蹈。
> 方法：exa 概览 + deepwiki 精读 + 直接读 `package.json` / 源码核验。
> 适用：本仓库（纯前端 + 自研多等级 AI，无引擎进程、无服务端）。
> 最后更新：2026-09-03（核实各外部项目仓库地址与最新状态）

---

## 1. 调研目标

1. 我的项目可能要"复用"哪些围棋生态资产？
2. 哪些坑在生态里已经被反复踩过、我的实现必须避开？
3. 哪些边界已经划定，我的实现不要再去触碰？

不在本次范围内（且原报告已覆盖）：
- 引擎选型（KataGo / Leela Zero）——本仓库不接引擎进程；
- GUI / 平台对比（Sabaki / KaTrain / OGS）——本仓库不是 GUI 替代品；
- 引擎协议封装（GTP / analysis engine）——本仓库只有自研 AI。

---

## 2. 候选清单（仅"可能被复用"的资产）

按对本项目的潜在影响排序，每项 ≤30 行。

### 2.1 `@sabaki/sgf` + `@sabaki/gtp`
- **仓库**：https://github.com/SabakiHQ/sgf
- **是什么**：Sabaki 抽离出来的 SGF 解析 + GTP 协议库。SGF 部分纯 TS，~3000 行。
- **状态**：v3.5.0（截至 2026-09 仍在发布）；SGF 部分维护活跃，GTP 部分跟随 Sabaki 大版本。
- **可复用点**：SGF 的"坐标压缩点列展开 + 写回"、"未知属性保留"、"CA 编码反转义"已经踩过所有坑。
- **不接的理由**：本仓库已在 `src/sgf/` 自研同等能力（详见 `src/sgf/record.test.ts`、`sgf.test.ts`）。**已发生替代**。

### 2.2 `sgfmill`
- **仓库**：https://github.com/mattheww/sgfmill
- **是什么**：Python SGF 库，作者是欧洲围棋协会技术委员会，权威性高。
- **状态**：活跃但小众；Python 生态。
- **可复用点**：作为 SGF 兼容性 oracle（与 SGFC 对照）。
- **不接的理由**：本项目是前端 TS，Python oracle 要走 CI 子进程 + JSON 输出。收益-成本不划算。

### 2.3 `online-go/goban`
- **仓库**：https://github.com/online-go/goban
- **是什么**：OGS 前端剥离出来的"围棋规则 + 棋盘状态 + 计分"内核，纯 TS，双构建（Node + ESM）。
- **状态**：OGS 主仓一更它就更，活跃度极高（2025–2026 持续）。
- **可复用点**：
  - `BoardState` / `GobanEngine` 是一套成熟的规则引擎（含禁着点、自杀、虚手）；
  - `autoscoring` 是当前最被认可的 JS 计分实现；
  - `JGOF` 是 OGS 棋谱传输格式。
- **可考虑接**：**计分兜底**。本仓库 `src/engine/scoring.ts` 自研是够用的简单版本，若未来要支持死子识别 / 区域计分（中日规则切换），goban 的 `autoscoring` 是首选。
- **不接的部分**：渲染层（goban 是 React 组件，与我的状态管理耦合方式不匹配）。

### 2.4 `wgo.js` / `glift` / `besogo`
- **仓库**：
  - `wgo.js`：https://github.com/waltheri/wgo.js
  - `glift`：https://github.com/artasparks/glift
  - `besogo`：https://github.com/yewang/besogo
- **是什么**：纯 JS / SVG 棋盘渲染库。
- **状态**：wgo.js 卡在 `3.0.0-alpha.10`（2021）；glift 的 Travis 徽章已下线；besogo 在 PR 上挂死。
- **可复用点**：无。三个都已实质停滞。
- **不接的理由**：本仓库用 Tailwind 自绘 SVG 棋盘（`src/components/Board/GoBoard.tsx`），依赖极简，不引入停滞库。

### 2.5 `SGFC`（WASM）
- **主页**：https://www.red-bean.com/sgf/sgfc/
- **是什么**：SGF 规范的参考实现，作者同时是 SGF 标准的维护者。
- **状态**：v1.2（2024），仍维护；提供 WASM / CLI / C 三种产物。
- **可复用点**：作为 SGF 解析的 oracle —— "SGFC 怎么读，我的就读出来一致"。
- **可考虑接**：把 SGFC 包成 WASM，仅用于 CI 跑兼容性回归；不进运行时 bundle。
- **不接的部分**：运行时路径（+1 MB WASM 包体不值）。

---

## 3. 契合度矩阵

| 候选 | 我的模块 | 接入成本 | 阻塞风险 | 是否值得 |
|---|---|---|---|---|
| `@sabaki/sgf` | `src/sgf/` 整层 | — | — | ❌ 已自研 |
| `sgfmill`（Python oracle） | CI SGF 回归 | 半天（pip + 子进程 + JSON） | CI 装 Python 依赖 | ⚠️ 仅当 SGFC WASM 失败时回退 |
| `online-go/goban`（仅 `autoscoring`） | `src/engine/scoring.ts` | 1 天（移植 + 测） | OGS 大改时不向后兼容 | ✅ 计分兜底（按需启动） |
| `wgo.js / glift / besogo` | — | — | 已停滞 | ❌ 不接 |
| `SGFC`（WASM, CI only） | CI 兼容性 oracle | 半天（wasm-pack + 跑分） | +1 MB WASM 仅 CI | ✅ 高 ROI |

---

## 4. 本地实施计划（backlog）

| ID | 事项 | 来源 | 状态 |
|---|---|---|---|
| L-P0-1 | SGF 兼容层（`src/sgf/`）+ 兼容性测试 | 2.1 复用经验 | ✅ 完成（`record.test.ts` + `sgf.test.ts`） |
| L-P0-2 | CI：GitHub Actions 跑 lint + `vitest run` + build | 2.5 SGFC 待接入 | ✅ 完成（`.github/workflows/ci.yml`） |
| L-P0-3 | AI 多等级实现 + 回归测试 | 自研经验 | ✅ 完成（`src/ai/easy-ai.ts` + `mcts.ts` + `ai-regression.test.ts`） |
| L-P1-1 | SGF 棋谱导入接入对局 UI（含让子） | 2.1 | ✅ 完成 |
| L-P1-2 | AI 降级可见化（Worker 失败/超时回退初级时提示） | 自研经验 | ✅ 完成（`src/ai/ai-status.ts`） |
| L-P1-3 | SGF 导出接入主分支（`Controls` 导出按钮 + `buildSgf` + 往返测试） | 2.1 | ✅ 完成（`record.test.ts` "exporting a record"） |
| L-P2-1 | SGFC WASM 作为 CI oracle | 2.5 | ⬜ 未排期 |
| L-P2-2 | `online-go/goban.autoscoring` 计分兜底 | 2.3 | ⬜ 未排期（按需启动） |

---

## 5. YAGNI 清单（评估后明确不做）

### 5.1 引擎无关 AI 抽象层（`chooseAiMove` 适配器）
**不做**。本仓库有 easy / medium 两档自研 AI（medium 由 `mcts.ts` 实现），无外部引擎计划。
引入抽象 = 为假想需求付费；真要接外部引擎时，第二实现会反向校正接口设计。

### 5.2 GTP / analysis engine 协议封装
**不做**。本仓库不接引擎进程，连 `child_process` 都不引入。
若未来要做"对接 KataGo"，新报告再说。

### 5.3 OGS JGOF 棋谱协议接入
**不做**。本仓库棋谱只走 SGF 一种格式，OGS 用户通过 SGF 互转（OGS 本身也支持 SGF 上传/下载）。
若要做 OGS 接入，那是另一个项目。

### 5.4 引擎 stderr 可见化 / 启动向导
**不做**。本仓库没有引擎 stderr。AI 降级提示已在 L-P1-2 覆盖。

---

## 6. 与原报告的关系

- 本文件**是** `docs/open-source-go-ecosystem-analysis.md` 的"行动版"；
- 原报告作为调研过程档案保留，**不再迭代**；生态层更新（如某库大版本）只更新本文件 §2 / §3 / §4。
- 调研方法论（exa + deepwiki + 直接读源码）见原报告。