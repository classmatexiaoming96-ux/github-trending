# Daily Digest — AI/科技资讯日报

## 1. 概述

**技能名称**: Daily Digest (日报)  
**目标**: 每日抓取 AI/科技资讯，生成结构化日报，供 GitHub Pages 展示。  
**部署平台**: GitHub Pages (`https://classmatexiaoming96-ux.github.io/github-trending/`)  
**入口**: index.html 中的"📰 日报" → 日历页面 → 选择日期查看日报

---

## 2. 数据源

| 模块 | 数据来源 | 说明 |
|------|----------|------|
| Google News | Google News RSS (CN + EN) | 当天 AI/科技相关重大新闻 |
| X (Twitter) AI Trending | Nitter 实例 RSS | AI 领域热门讨论 |

> **备选**: 如果 Nitter 不可用，降级为 GitHub Trending AI 项目列表。

---

## 3. 工作流

```
cron job (每日 08:00 UTC)
└── scripts/daily-digest/prefetch.py
    ├── 抓取 Google News RSS (CN + EN)
    ├── 抓取 X/Nitter Trending RSS
    └── 输出 data/YYYY-MM-DD.json + data/YYYY-MM-DD.html
```

---

## 4. 输出模板

### 日报 HTML (`data/YYYY-MM-DD.html`)

深色风格，包含:
- 导航栏 + 退出按钮
- 日报头部: 日期、星期、摘要
- 模块: Google News (CN)
- 模块: Google News (EN)
- 模块: X AI Trending
- 页脚

### 日报数据结构 (`data/YYYY-MM-DD.json`)

```json
{
  "date": "YYYY-MM-DD",
  "generated_at": "ISO8601",
  "google_news_cn": [ { "title": "...", "link": "...", "pubDate": "...", "source": "..." } ],
  "google_news_en": [ { "title": "...", "link": "...", "pubDate": "...", "source": "..." } ],
  "x_trending": [ { "title": "...", "link": "...", "author": "..." } ],
  "summary": "今日要点摘要"
}
```

---

## 5. 日历页面 (`calendar.html`)

- 展示当前月份日历
- 有日报的日期高亮显示（有点击可进入）
- 无日报的日期灰色不可点击
- 支持切换上/下月份
- 点击有日报的日期 → 跳转对应日报 HTML
- `github-trending/calendar.html` 读取 `data/dates.json`，再对 `data/YYYY-MM-DD.html` 做可访问性验证；只有验证通过的日期才会加 `has-data` 并绑定 click handler。
- 如果 `dates.json` 里有日期但对应 `data/YYYY-MM-DD.html` 不在本仓库，页面不会把该日期显示成可点击日报。这是正确行为，不要把其他仓库的日报 HTML 复制到本仓库，除非明确要求。

### `dates.json` 维护流程

`data/dates.json` 是日历可用日期索引，必须从 `data/` 下真实存在的日报 HTML 文件生成：

```bash
cd data
DATES=$(ls -1 [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].html 2>/dev/null | sed 's/.html$//' | sort -r | head -90 | sed 's/.*/"&"/' | paste -sd, -)
echo "[${DATES}]" > dates.json
```

关键点：
- glob 必须匹配 `*.html`，不是 `*.json`。历史 bug 是 workflow 扫 `YYYY-MM-DD.json`，导致 `dates.json` 长期停留在旧数据。
- JSON 数组里的日期必须加双引号，顺序为倒序，最多保留最近 90 条。
- 生成后用 `cat data/dates.json` 确认内容，再确认每个可点击日期都有对应 `data/YYYY-MM-DD.html`。

### "点不进去"排查链路

按这个顺序查，不要直接改 CSS 或 click handler：

1. `data/dates.json`: 是否包含目标日期，格式是否是合法 JSON 字符串数组。
2. `fetch("data/dates.json")`: 浏览器 Network 是否 200，响应是否为最新内容。
3. `datePageExists()`: 目标 `data/YYYY-MM-DD.html` 是否 200；如果是 404，`populateAvailableDates()` 会过滤掉该日期。
4. `.has-data`: 目标日期格子是否有 `has-data` class。没有这个 class 就不会绑定点击事件。
5. click handler: `createDayEl()` 只给 `available` 日期绑定 `window.location.href = data/YYYY-MM-DD.html`。

链路是：`dates.json` → `fetch` → `HEAD data/YYYY-MM-DD.html` → `AVAILABLE_DATES` → `.has-data` → click handler。

### calendar.html 部署说明

当前有两套容易混淆的日历来源：

```text
github-trending repo
├── calendar.html
├── data/dates.json
├── data/YYYY-MM-DD.html
└── GitHub Pages: /github-trending/calendar.html

classmatexiaoming96-ux.github.io repo
└── daily-digest/
    ├── calendar.html
    ├── manifest.js
    └── assets/calendar.js
```

- `github-trending` 是 `https://classmatexiaoming96-ux.github.io/github-trending/` 的 source of truth。修这个站点的 `/github-trending/calendar.html`、`/github-trending/data/dates.json`、`/github-trending/data/YYYY-MM-DD.html` 时，只改本仓库。
- `classmatexiaoming96-ux.github.io` 是用户页根仓库，`daily-digest/calendar.html` 是另一套日报归档实现，读取 `manifest.js` 并跳到 `index.html#日期`。它不是 `/github-trending/calendar.html` 的发布源。
- 如果某个日期只存在于 `classmatexiaoming96-ux.github.io/daily-digest/`，而不存在于 `github-trending/data/`，那么 `/github-trending/calendar.html` 不应把它显示为可点击日报。

---

## 6. 文件结构

```
daily-digest/
├── SKILL.md                          # 本文件
├── daily-digest.html                 # 日报 HTML 模板

scripts/daily-digest/
├── prefetch.py                       # 数据抓取主脚本
├── prefetch_sources                  # 数据源配置
└── requirements.txt                  # Python 依赖

.github/workflows/
└── daily-digest.yml                  # GitHub Actions 工作流

data/
├── dates.json                        # 可用日期列表 (自动生成)
├── YYYY-MM-DD.json                   # 日报原始数据
└── YYYY-MM-DD.html                   # 日报 HTML 页面

calendar.html                         # 日历页面 (GitHub Pages 入口)
```

---

## 7. 更新机制

- **cron**: 每天 08:00 UTC 执行 `scripts/daily-digest/prefetch.py`
- **GitHub Actions**: 自动化执行，提交生成的 HTML/JSON 文件
- **日期索引**: workflow 必须从 `data/*.html` 生成 `data/dates.json`
- **回退**: 如果某天数据抓取失败，使用缓存或占位内容
