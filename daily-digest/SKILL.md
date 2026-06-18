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
- **回退**: 如果某天数据抓取失败，使用缓存或占位内容
