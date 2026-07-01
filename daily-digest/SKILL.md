# Daily Digest — AI 每日速递

## 1. 概述

**技能名称**: Daily Digest (日报)  
**目标**: 每日抓取 AI/科技资讯，生成结构化日报，供 GitHub Pages 展示。  
**单一部署位置**: GitHub Pages (`https://classmatexiaoming96-ux.github.io/daily-digest/`)  
**单一源仓库**: `classmatexiaoming96-ux.github.io` (user page repo)  
**入口**: user page 主页 → Hero 项目索引「📰 每日 AI 速递」→ `daily-digest/`  
**技能定义文档**: `/root/repos/skills/daily-digest/SKILL.md`（这里是简洁版，详细版见技能仓库）

> **注意**：`github-trending` 仓库不再维护 daily-digest 内容。2026-07-01 已删除所有 daily-digest 相关文件，
> 将 `calendar.html` 改为跳转到 `daily-digest/calendar.html` 的迁移页。所有日报内容都归属于 user page 仓库。
> 此 SKILL.md 保留在此仅做文档参考，不复用。

## 2. 数据源（2026-07-01 审计确认）

| 模块 | 数据来源 | 说明 |
|------|----------|------|
| Google News | Google News RSS (CN + EN) | 当天 AI/科技相关重大新闻 |
| Hacker News | HN Algolia API（近 36h, points>40, AI 关键词过滤） | 社区热议 |
| Reddit | r/MachineLearning · LocalLLaMA · artificial · OpenAI · singularity | 社区热议 |
| Show HN | HN Show HN（近 3 天） | 产品·概念 |
| GitHub | `github.com/trending` 抓取 + Search API 兜底 | 开源热门 |

> **X/Twitter 替代策略**：旧版（github-trending 时期）曾用 Nitter 实例抓取 X/Twitter，
> 但 Nitter 实例普遍不稳定且多已下线。实际 cron 流程使用 skills 仓库的脚本，
> 以 **HN + Reddit** 替代 X/Twitter 作为社区热议源，效果更稳定。
> 如果未来需要恢复 X 数据，可考虑三条路：
> 1. 找可用 Nitter 实例（当前列表已标注失效）
> 2. 使用 X API 需要申请开发者密钥
> 3. 用第三方分析工具（如 TweetHunter、Brandwatch）提供的数据简报

## 3. 工作流（实际 cron 流程）

由 Hermes Agent cron job 每日 08:00 UTC 执行，分 3 步：

```
cron job (Hermes Agent)
├── Step 1: prefetch.py
│   └── 抓取 Google News + HN + Reddit + Show HN + GitHub Trending
│   └── 输出 ~/.hermes/daily-digest/data/YYYY-MM-DD.json
├── Step 2: 人工策展
│   └── 读 raw data → 筛选/提炼 → 写入 ~/.hermes/daily-digest/content/YYYY-MM-DD.json
└── Step 3: build.py
    └── content/*.json + 模板 → YYYY-MM-DD.html + manifest.js
    └── push 到 user page 仓库的 daily-digest/ 目录
```

> 不依赖 GitHub Actions。prefetch 走本机 cron，通过 Hermes agent 驱动。
> 部署目标是 `classmatexiaoming96-ux.github.io`，不是 `github-trending`。

## 4. 文件结构

```
user page repo (classmatexiaoming96-ux.github.io)
├── index.html              # 主页，Hero 有「📰 每日 AI 速递」卡片
├── daily-digest/           # 日报模块 ← 唯一 source of truth
│   ├── index.html          # viewer（iframe + manifest.js）
│   ├── calendar.html       # 日历视图
│   ├── manifest.js         # 归档清单 (auto-generated)
│   ├── 2025-06-17.html     # No.41
│   ├── 2025-06-18.html     # No.42
│   ├── 2026-06-30.html     # No.43
│   ├── 2026-07-01.html     # No.44（最新）
│   └── assets/             # 样式/脚本
│       ├── digest.css
│       ├── calendar.css
│       ├── calendar.js
│       └── viewer.js
└── .github/workflows/
    └── pages.yml           # 仅 GitHub Pages 部署，不负责日报生成

Hermes 执行端 (~/.hermes/skills/daily-digest/)
├── SKILL.md                # 详尽的技能定义文档
├── scripts/
│   ├── prefetch.py         # 数据抓取
│   └── build.py            # HTML 生成 + manifest 维护
├── templates/
│   └── digest.template.html
└── web/                    # viewer/日历/样式脚手架
    ├── index.html
    ├── calendar.html
    ├── manifest.js
    └── assets/
```

## 5. 日历页面 (`daily-digest/calendar.html`)

- 展示当前月份日历，左侧「‹ 上个月」右侧「› 下个月」
- 有日报的日期高亮显示（可点击 → `index.html#YYYY-MM-DD`）
- 无日报的日期灰色不可点击
- 基于 client-side `manifest.js` 数据，不发 fetch 请求
- 新一期只需 build.py 重写 manifest.js

## 6. 「点不进去」排查链路

按这个顺序查：

1. `manifest.js`（远端）→ `<script src="manifest.js">` 加载后 `window.DIGESTS` 是否有目标日期
2. 对应 `daily-digest/YYYY-MM-DD.html` 是否存在（curl 是否 200）
3. `.cal-cell.has` class 是否加到目标日期上（calendar.js 检查 manifest.js 数据决定）
4. click handler: `calendar.js` 只在有 `.has` 的 cell 上绑定跳转 → `index.html#YYYY-MM-DD`
5. `index.html` 通过 `location.hash` 加载对应 iframe 内容

链路：`manifest.js` → `calendar.js` → `.has` class → click handler → `index.html#hash` → iframe load

> 注意：旧 `github-trending/data/` 下的文件已被删除；现在 path 是 `daily-digest/YYYY-MM-DD.html`。

## 7. 已知陷阱（2026-07-01 复盘）

| 坑 | 后果 | 规避 |
|---|---|---|
| `github-trending` 仓库曾错放 daily-digest 内容 | 两个仓库不一致、「点不进去」 | 2026-07-01 已删旧数据 + 改跳转页，切到单一仓库 |
| Nitter 实例不稳定 | X/Twitter 数据流中断 | 已用 HN + Reddit 替代 |
| prefetch 直接写 `data/` 目录 | 跳过了人工策展环节，质量差 | 改用 2 步：prefetch→raw data→人工策展→content→build→HTML |
| 工作流用 glob `*.json` 而不是 `*.html` | dates.json 长期为旧数据（2025-06 幽灵） | 已改用 `*.html` glob，且当前不再需要 dates.json |

## 8. 审计结论（2026-07-01）

2026-07-01 对 daily-digest SKILL.md 完整审计发现：

### 8.1 三份文档不一致（已全部修复）

| 维度 | ~~github-trending 新版~~ | skills 仓库（真实源） | user page 仓库 |
|------|------------------------|----------------------|---------------|
| 部署目标 | ❌ 说的 `github-trending/` | ✅ `daily-digest/` | N/A |
| 数据源 | ❌ 说的 Nitter/X | ✅ HN+Reddit | N/A |
| 工作流 | ❌ 说的 GitHub Actions | ✅ Hermes cron | N/A |
| 文件结构 | ❌ 说的旧结构 | ✅ 当前实际结构 | N/A |

### 8.2 X/Twitter 数据源状态

- 旧代码（github-trending `prefetch.py`）使用 Nitter 实例抓 X/Twitter（RSS 格式）
- Nitter 实例清单：`nitter.net`、`nitter.privacydev.net`、`nitter.poast.org`、`nitter.unixfox.eu`（多数不稳定）
- **实际 cron 使用的脚本（skills 仓库）已弃用 Nitter**，改用 HN + Reddit 替代
- 如果效铭需要恢复 X/Twitter 数据，需：
  1. 找一个可用 Nitter 实例（skills 仓库 prefetch.py 第 183 行已有 reddit fallback 逻辑，可做参考）
  2. 或申请 X API 密钥
  3. 或维持现有 HN+Reddit 替代方案（当前已正常产出 4 期日报）

### 8.3 skills 仓库远端状态

- skills 仓库 local = origin/main（已同步），daily-digest 模块自 3 月起无改动
- github-trending 的旧 prefetch.py/prefetch_sources 已变成死代码（不再被任何 cron/workflow 引用）
