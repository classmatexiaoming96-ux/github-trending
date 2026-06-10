## 任务：生成深度源码解析页面（5个项目）

### 通用要求
每个项目要求：
1. **项目定位 + 竞品对比**（一句话定位、三行核心价值）
2. **架构流程图**（ASCII/mermaid，多层流水线要分 stage 画）
3. **核心模块源码拆解**（至少 4 个模块，每个模块要有：文件名 + 关键代码 + 数据流说明）
4. **关键技术实现细节**（至少 3 个，每个要讲清楚"为什么这样做"）
5. **失败模式与边界条件**（至少 2 个，要具体场景）
6. **对 coding agent 生态的意义**
7. **参考链接**：GitHub + 相关文档

内容要和 kimi-code.html 同等深度（kimi-code.html 约 430 行）。

---

## 项目 1：memory-os（tab: mo）

**GitHub**: https://github.com/ClaudioDrews/memory-os
**Stars**: 856
**源码路径**: `/root/repos/github-trending/sources/memory-os/`
**输出文件**: `memory-os.html`（覆盖现有内容）
**Tab ID**: `mo`

**分析重点**：
- Layer 7 Ground Truth SOUL.md 的权威层级设计（最关键的一层）
- Layer 3 fact_store.db 的信任评分贝叶斯计算
- Layer 5 Qdrant 4级回退链 + embedding 管道
- Layer 4 Icarus fork hooks.py 的 pre_llm_call/post_llm_call
- Docker 三容器协同（Qdrant + Redis + ARQ Worker）
- 7个 cronjob 的协同关系

---

## 项目 2：sandboxd（tab: sa）

**GitHub**: https://github.com/tastyeffectco/sandboxd
**Stars**: 528
**源码路径**: `/root/repos/github-trending/sources/sandboxd/`
**输出文件**: `sandboxd.html`（覆盖现有内容）
**Tab ID**: `sa`

**分析重点**：
- 两进程架构：control-plane (main.go) + runtimed (容器内 supervisor)
- Reconciler 启动时扫描孤儿资源的状态机
- Idle Reaper（35min 无活动 docker stop）+ Pressure Reaper
- runtimed 健康探测（down/start/ready/error 四态）
- TaskResult + TokenUsage 任务生命周期
- Traefik 路由 + sandboxd_net 网络隔离
- 内存感知的 wake 拒绝机制

---

## 项目 3：guard-skills（tab: gu）

**GitHub**: https://github.com/amElnagdy/guard-skills
**Stars**: 498
**源码路径**: `/root/repos/github-trending/sources/guard-skills/`
**输出文件**: `guard-skills.html`（覆盖现有内容）
**Tab ID**: `gu`

**分析重点**：
- 14 个 LLM 特异性失败模式（references/ai-failure-modes.md）
- clean-code-guard 的 8步强制交付检查
- 三模式：guard-pass / live / review 的触发条件和行为差异
- 每个 guard 的 SKILL.md 结构 + references/ 内容
- 零网络依赖的实现（纯文本 SKILL.md）
- 与 AlignDev 的互补关系（约定→执行→验证）

---

## 项目 4：align-dev（tab: al）

**GitHub**: https://github.com/razr001/align-dev
**Stars**: 351
**源码路径**: `/root/repos/github-trending/sources/align-dev/`
**输出文件**: `align-dev.html`（覆盖现有内容）
**Tab ID**: `al`

**分析重点**：
- 7步可视化向导的 WizardState 数据模型
- lib/document-generator.ts 的分段函数设计（s1Overview → s7DesignTokens）
- lib/skill-generator.ts 生成 SKILL.md 的逻辑
- lib/pkg-versions.ts 实时版本查询（npm registry API + FALLBACK_VERSIONS）
- frontend-align.md + SKILL.md 双输出物的协同关系
- 与 guard-skills 的互补关系

---

## 项目 5：pi-dynamic-workflows（tab: pi）

**GitHub**: https://github.com/Michaelliv/pi-dynamic-workflows
**Stars**: 895
**源码路径**: `/root/repos/github-trending/sources/pi-dynamic-workflows/`
**输出文件**: `pi-dynamic-workflows.html`（覆盖现有内容）
**Tab ID**: `pi`

**分析重点**：
- 双层 AST 防线：meta export 纯 AST 字面量求值（拒绝 spread/computed key/插值）
- assertDeterministicAst 遍历整棵树拦截 Date.now()/Math.random()
- node:vm 白名单上下文（process 替换成只剩 cwd() 的冻结对象）
- agent() 生命周期：Pi 会话 spawn + structuredClone 检查
- parallel() 对"传 promise 不传函数"的防呆校验
- fail-soft 错误哲学（单 agent 失败 → null + 日志 + ✗，不连坐）
- terminate:true 结构化输出终结型工具
- 与原版 Claude Code Dynamic Workflows 的对照（哪些实现了，哪些是提示词注入）

---

## 执行步骤

1. 逐个读取每个项目的关键源码文件
2. 生成符合现有站点风格的 standalone HTML 页面
3. 页面需要：深色主题、管道流程图、代码块、统计数据栏
4. 完成后用 HTTP 验证每个文件可访问
5. git add -A && git commit && git push

### 约束
- 不要删除任何现有内容
- 保持现有 CSS 风格一致
- 独立页面放在仓库根目录（如 memory-os.html）
- 每个页面的 tab-panel 在 index.html 中已有定义，不需要修改 index.html
- 直接用 Read 工具读源码（不要用 git status/diff）