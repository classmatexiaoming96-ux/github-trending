## 任务：为 odysseus 生成 GitHub Pages 分析页面

### 项目信息
- GitHub：https://github.com/pewdiepie-archdaemon/odysseus
- Stars：8924★（极高热度）
- 技术栈：Python (FastAPI/uvicorn) + TypeScript frontend
- 已克隆路径：`/root/repos/github-trending/sources/odysseus/`

### 架构速览
```
odysseus/
├── app.py              # FastAPI 入口
├── core/               # 核心模块
│   ├── models.py       # 数据模型
│   ├── database.py     # SQLite/ChromaDB
│   ├── session_manager.py
│   ├── auth.py         # 认证
│   ├── middleware.py    # 中间件
│   └── atomic_io.py / platform_compat.py
├── config/             # 配置（含 searxng 等）
├── docker/             # Docker 相关
├── docs/               # 截图
├── mcp_servers/        # MCP 服务器配置
└── package.json
```

### 核心能力（从 README 提取）
1. **Chat** — 多后端聊天（vLLM/llama.cpp/Ollama/OpenRouter/OpenAI）
2. **Agent** — 内置 opencode，MCP 工具调用，web/files/shell/skills/memory
3. **Cookbook** — 硬件感知模型推荐+下载+服务（VRAM aware）
4. **Deep Research** — 多步研究，结果可视化报告
5. **Memory/Skills** — ChromaDB + fastembed 向量检索，持久化记忆
6. **Email** — IMAP/SMTP + AI triage（自动摘要/回复/标签）
7. **Calendar** — CalDAV 同步
8. **Documents** — 多标签编辑器，AI 辅助写作
9. **Notes/Tasks** — AI 可执行的 todo + cron 任务
10. **Mobile PWA** — 响应式 + 可安装

### 你的任务

1. **读源码深入分析**：
   - `app.py` — FastAPI 应用结构、路由组织
   - `core/agent.py` 或相关 Agent 实现（找 opencode 集成点）
   - `core/memory.py` 或 Skills 实现（ChromaDB 向量存储）
   - `core/research.py` — Deep Research 多步流程
   - `core/email.py` — AI triage 实现
   - `mcp_servers/` — MCP 配置

2. **生成 `odysseus.html`**（放在 `/root/repos/github-trending/` 下，tab ID = `od`）

3. **内容要求**（与 kimi-code tab 同等深度）：
   - 项目定位 + 竞品对比（vs ChatGPT/Claude/本地方案）
   - 架构流程图（ASCII/mermaid）
   - 核心模块源码拆解：Agent（opencode 集成）、Memory（ChromaDB+fastembed）、Deep Research、Email Triage
   - 关键技术：opencode、MCP、ChromaDB 向量检索、CalDAV、IMAP/SMTP
   - 失败模式（如 Cookbook GPU 检测、IMAP 连接失败处理）
   - 对自托管 AI workspace 生态的意义

4. **更新 index.html**：添加 tab 按钮 `odysseus` + tab-panel

5. **验证 + push**：
   - HTTP 200 验证
   - `git add -A && git commit -m "feat: add odysseus tab — self-hosted AI workspace (8924★)" && git push`

### 约束
- 不要删除任何现有内容
- 保持深色主题 CSS 一致性
- 直接用 Read 工具读源码（不要用 git status/diff）