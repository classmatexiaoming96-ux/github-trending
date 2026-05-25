# Agent Infrastructure Teardown · 三大 Coding Agent 项目源码深度解析

源码级深度解析本周 GitHub Trending 上最火的三个 coding agent 项目，做成技术博客风格网页，部署于 GitHub Pages。

🔗 **在线访问：** https://classmatexiaoming96-ux.github.io/github-trending/

## 解析的三个项目

| 层次 | 项目 | Stars (本周) | 语言 | 定位 |
|------|------|------|------|------|
| 索引层 | [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) | 20.6k (+2,456) | TypeScript | 为 coding agent 预建的语义代码知识图谱（本地、零 API、经 MCP 服务） |
| 认知层 | [Lum1104/Understand-Anything](https://github.com/Lum1104/Understand-Anything) | 23.1k (+2,299) | TypeScript | 把任意代码库变成可交互、可搜索、可问答的知识图谱（多 agent 流水线 + 可视化 Dashboard） |
| 能力层 | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | 26.9k (+2,193) | Python | Anthropic 官方维护的 Claude Code 插件目录与治理体系 |

## 内容覆盖

每个项目均从源码出发，分析了：项目概述与定位、核心架构设计、技术亮点、源码结构解读、以及对 coding agent 生态的意义；最后给出三者的互补关系与趋势判断。

- **CodeGraph**：分层流水线、tree-sitter WASM 抽取、框架感知的引用解析与回调合成、`node:sqlite` + FTS5 存储、10 个 MCP 工具与自适应预算。
- **Understand-Anything**：「确定性结构 × LLM 语义」混合范式、七个专家 agent 的接力、Louvain 语义批处理、指纹增量分析、业务域叠加层、React Flow + ELK 可视化。
- **Claude Plugins**：插件五块积木（commands/skills/agents/hooks/MCP）、SHA 锁定供应链治理、用 Claude 做 LLM 策略安全扫描、七条 CI/CD 治理流水线。

## 技术实现

- 纯静态站点：单页 `index.html` + `assets/styles.css` + `assets/main.js`，无构建步骤。
- 手写 CSS 设计系统：暗色技术博客主题，每个项目独立强调色（CodeGraph 青 / Understand-Anything 金 / Claude Plugins 珊瑚），响应式布局。
- 渐进增强 JS：滚动进度条、移动端菜单、`IntersectionObserver` 元素入场与基准条动画。

## 本地预览

```bash
python3 -m http.server 8000   # 然后访问 http://localhost:8000
```

## 部署

本站点为纯静态文件，直接从 `main` 分支根目录发布：

1. 仓库 **Settings → Pages → Source** 选择 **Deploy from a branch**；
2. Branch 选 **`main`**，目录选 **`/ (root)`**，保存即可。

几十秒后即可通过 https://classmatexiaoming96-ux.github.io/github-trending/ 访问。

> 如果更想用 GitHub Actions 自动部署，仓库内已附带工作流模板 `.github/pages-deploy.workflow.example.yml`：把它移动到 `.github/workflows/deploy.yml`（需用带 `workflow` scope 的 token 推送），并把 Pages Source 改为 **GitHub Actions** 即可。

---

*Built with Claude Code · 内容基于三个项目源码逐层拆解撰写，数据为 2026-05 GitHub Trending 快照。*
