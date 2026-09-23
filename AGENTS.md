# AGENTS.md — `go-game` 项目

> 本文件补充 `~/.codex/AGENTS.md`（全局协作风格）。
> 冲突优先级：全局 AGENTS.md < 本文件 < 子目录 AGENTS.md < 用户/系统/开发者直接指令。
> 本文件**只**写项目级意图、边界、历史决策；通用风格、安全、编辑工作流见全局。

---

## 1. 项目轮廓

- **类型**：纯前端围棋对弈应用（Vite + React 18 + TS 5 + Tailwind 4）
- **状态管理**：Zustand
- **测试**：Vitest + jsdom
- **CI**：单文件 `.github/workflows/ci.yml`，跑 lint + vitest + build
- **包管理器**：**pnpm**（见 §2）
- **架构分层**：`src/engine/`（纯逻辑规则）→ `src/ai/`（多档 AI）→ `src/store/`（状态）→ `src/components/`（UI）
- **没有**：引擎进程、服务端、数据库、外部网络调用

---

## 2. 包管理器（钉死）

- **唯一允许的包管理器是 pnpm**。
- 禁止提交 `package-lock.json` / `yarn.lock`、禁止调用 `npm` / `yarn` / `npx`、禁止引导用户执行 `npm install`。
- 安装/构建命令一律使用 README 列出的 `pnpm install` / `pnpm build` / `pnpm exec vitest run`。
- 若 CI 环境未装 pnpm，**停下问用户**，不要自行换 npm。

> 仓库内已有 `pnpm-workspace.yaml`，预留 monorepo 能力；Agent 训练数据 npm 占比高，
> 钉死 pnpm 节省判断成本。

---

## 3. 文档先行（核心工作流）

本仓库的工作节奏与多数项目不同：

1. **新需求/新项目**：先用 exa + deepwiki 做生态情报，再写本地 backlog，再写代码。
   模板见 `docs/open-source-go-ecosystem-analysis.md`（过程档案）与
   `docs/ecosystem-brief.md`（行动版 backlog）。
2. **小改动**：在动代码前，用 1–2 段话和用户对齐"做什么、为什么、不做什么"。

Agent **不允许**跳过这两步直接启动"大重构"或"加新功能"。

---

## 4. 变更纪律（项目级收紧）

- 不主动 `git commit`，等用户确认。
- 提交信息用中文（用户纠正过，勿再用英文）。
- 不主动重构无关代码；除非用户明确要求，或改动导致编译/测试报错。
- 不删除未在任务范围内出现的代码。
- 其余见 `~/.codex/AGENTS.md` "执行习惯" 与 "安全" 段。

---

## 5. 文件不动区

- `node_modules/`、`dist/`、`*.tsbuildinfo`、`.git/`（除非显式要求）
- `pnpm-lock.yaml`（除非新增/升级依赖，且必须说明）
- `eo.log` / `whoami.log`（运行时日志）

---

## 6. 测试纪律

- 修改 `src/engine/` → 主动跑 `pnpm exec vitest run src/engine/`，确保快慢规则等价性不退化。
- 修改 `src/sgf/` → 主动跑 `pnpm exec vitest run src/sgf/`，确保兼容性套件不退化。
- 修改 `src/ai/` → 主动跑 `pnpm exec vitest run src/ai/`，含 `ai-regression.test.ts`。
- 修改 store 或组件 → 至少跑改动文件对应的 `.test.ts(x)`。
- **新功能必须有测试**（除非是纯 UI 排版）。
- 跑完主动报告结果（通过 / 失败条数），不需要等用户问。

---

## 7. 引入新依赖（边界）

- 引入新依赖前停下问用户——本仓库当前刻意保持零运行时依赖（除 React / Zustand / Tailwind）。
- dev 依赖放宽，但仍要说明理由。

---

## 8. 与其他文档的关系

- `~/.codex/AGENTS.md` → 全局协作风格、安全、编辑工作流（**主参考**）。
- README.md → 人类用户项目说明（含 pnpm 命令、部署、规则说明）。
- docs/open-source-go-ecosystem-analysis.md → 生态调研**过程档案**（不再迭代）。
- docs/ecosystem-brief.md → 生态情报**行动版**（backlog + YAGNI 清单，日常维护）。