# Agent Infrastructure Teardown · GitHub Trending 项目源码深度解析

源码级深度解析当周 GitHub Trending 上最火的 coding-agent 与个人 AI 基础设施项目，做成可切换 Tab 的技术博客网页，部署于 GitHub Pages。

🔗 **在线访问：** https://classmatexiaoming96-ux.github.io/github-trending/

## 解析的项目

页面顶部 Tab 切换，每个项目独立深度解析：

| Tab | 项目 | Stars | 语言 | 层次 |
|---|---|---|---|---|
| CodeGraph | [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) | 20.6k | TypeScript | 索引层 · agent 的代码索引后端 |
| Understand-Anything | [Lum1104/Understand-Anything](https://github.com/Lum1104/Understand-Anything) | 23.1k | TypeScript | 认知层 · 给人看的代码地图 |
| Claude Plugins | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | 26.9k | Python | 能力层 · 官方插件生态治理 |
| OpenHuman Memory Tree | [tinyhumansai/openhuman](https://github.com/tinyhumansai/openhuman) | 28.6k | Rust + Tauri | 记忆层 · 私人 AI 的本地知识库 |

## 每个 Tab 覆盖的内容

每个项目从源码出发，分析其核心架构、技术亮点、源码结构、与生态意义。例如 **OpenHuman Memory Tree** Tab 详细讲解了：

- 热路径 ingest → canonicalize → chunk → fast-score → SQLite 事务的设计
- 内容寻址的确定性 chunk ID（SHA-256 取前 32 hex）
- 三棵互补的记忆树（source / topic / global），及其桶封 (bucket-sealing) 规则
- 主题树的热度公式与级联封口
- 持久化 SQLite 作业队列 + 3 worker + UTC 调度器
- 六种检索原语 + 混合排序
- safety 层的四类敏感信息拦截
- 为什么这不是又一个套壳向量库

## 技术实现

- 纯静态站点：单 `index.html` + `assets/styles.css` + `assets/main.js`，无构建步骤。
- **Tab 切换**：JS 监听点击 + URL hash（`#cg`/`#ua`/`#cp`/`#oh`），切换时滚回顶部并淡入。
- 每个项目独立强调色（CodeGraph 青 / UA 金 / Claude Plugins 珊瑚 / OpenHuman 绿）。
- 渐进增强：滚动进度条、IntersectionObserver 入场动画、返回顶部按钮、移动端 Tab 横滚。

## 本地预览

```bash
python3 -m http.server 8000   # 然后访问 http://localhost:8000
# 直接打开特定项目：http://localhost:8000/#oh
```

## 部署

本站点为纯静态文件，从 `main` 分支根目录直接发布：

1. 仓库 **Settings → Pages → Source** 选择 **Deploy from a branch**；
2. Branch 选 **`main`**，目录选 **`/ (root)`**，保存即可。

几十秒后即可通过 https://classmatexiaoming96-ux.github.io/github-trending/ 访问。

> 如果更想用 GitHub Actions 自动部署，仓库内附带工作流模板 `.github/pages-deploy.workflow.example.yml`：把它移动到 `.github/workflows/deploy.yml`（需带 `workflow` scope 的 token 推送），并把 Pages Source 改为 **GitHub Actions** 即可。

---

*Built with Claude Code · 基于各项目源码逐文件拆解撰写。*
