---
name: daily-digest
description: 每天自动汇编一期「AI 每日速递」深色主题日报 HTML，并部署到 GitHub Pages。内容源覆盖 Google News（AI 要闻）、arXiv（AI 论文）、Hacker News + Reddit（社区热议）、Show HN/产品概念、GitHub Trending（开源热门），要求同刊与近 3 天去重。Use when updating or auditing the daily-digest publishing workflow, entry page, or generated issue requirements.
---

# Daily Digest — AI 每日速递

## 1. 定位

每天一刊的 AI 情报日报。一次任务必须完成：

1. 生成 `daily-digest/YYYY-MM-DD.html`
2. 更新 `daily-digest/manifest.js`
3. 更新展示入口
4. commit、pull --rebase、push
5. 验证线上入口包含新刊，且新页面 HTTP 200

部署目标是 user page 仓库 `classmatexiaoming96-ux.github.io` 的 `daily-digest/` 子目录：
`https://classmatexiaoming96-ux.github.io/daily-digest/`

> 本文件是 `github-trending` 仓库里的远端参考副本。可执行脚本和模板的本地工作副本在
> `~/.codex/skills/daily-digest/`；自动任务里的增强版源在当前工作区的
> `automation-skills/daily-digest/`。三者的栏目要求必须保持一致。

## 2. 信源与栏目

栏目顺序固定为：

1. 今日要闻
2. AI 论文
3. 社区热议
4. 产品 · 概念
5. 开源热门

| 桶 | 来源 | 对应栏目 |
|---|---|---|
| `google_news` | Google News RSS（en + zh-CN，`when:1d`） | 今日要闻 |
| `papers` | arXiv Atom API（cs.AI + cs.LG + cs.CL，按提交时间） | AI 论文 |
| `hacker_news` | HN Algolia API（近 36h、points>40，AI 关键词过滤） | 社区热议 |
| `reddit` | r/MachineLearning · LocalLLaMA · artificial · OpenAI · singularity 的 `top?t=day` | 社区热议 |
| `show_hn` | HN Show HN（近 3 天，AI 关键词） | 产品 · 概念 |
| `github` | `github.com/trending` 抓取 + Search API 兜底 | 开源热门 |

## 3. 策展要求

- 今日要闻：5–7 条，含 1 条 lead。只选今天真正发生或迫近的事件，合并重复新闻稿。
- AI 论文：3–5 篇。必须来自 arXiv 原文链接，优先 Agent、推理、代码模型、评测、记忆、RAG、多模态和效率方向。`why` 必须用简体中文讲清“新在哪里、为什么值得看”，不能只翻译摘要。
- 社区热议：4–6 条。从 HN + Reddit 选真正有讨论价值的内容，优先能提炼观点的帖子。
- 产品 · 概念：3–5 条。可来自 Show HN、要闻或 trending，既可以是具体产品，也可以是当周反复出现的概念/趋势。
- 开源热门：5–7 个。必须 AI/LLM/coding-agent/dev-tool 相关，并保留真实 `stars` / `stars_today`。
- 每条内容必须有稳定 `event_key`。论文建议使用 `arxiv-2607-12345` 这类键。
- 同一期内同一事件、论文、产品或仓库只能出现一次；跨来源、跨 URL、换标题也要合并。
- 生成前要避开最近 3 天已展示的主要消息。只有确有新进展时才允许重复，并在摘要第一句写清新增内容。

## 4. 受限网络兼容路径

后台任务可能以 `workspace-write + networkAccess=false` 启动。每个子任务开始时先执行独立顶层 `curl` 预检；不要把联网动作藏进 Python subprocess、`sh -c`、复杂管道或未授权脚本内部。

Daily Digest 在受限模式下必须按这个路径执行：

```bash
curl -fsSIL --retry 8 --retry-all-errors --retry-delay 2 --max-time 20 https://news.google.com/

python3 /Users/miaoxiaoming/.codex/skills/daily-digest/scripts/prefetch.py \
  --date "$(date +%F)" \
  --out ~/.hermes/daily-digest/data

curl -fsSL --retry 4 --retry-all-errors --retry-delay 8 --max-time 45 \
  'https://export.arxiv.org/api/query?search_query=cat%3Acs.AI%20OR%20cat%3Acs.LG%20OR%20cat%3Acs.CL&start=0&max_results=40&sortBy=submittedDate&sortOrder=descending' \
  -o /tmp/daily-digest-arxiv.xml

python3 scripts/merge_arxiv.py \
  --bundle ~/.hermes/daily-digest/data/$(date +%F).json \
  --xml /tmp/daily-digest-arxiv.xml
```

Google News、HN、GitHub、arXiv 四个关键桶中任意两个为空时，不得继续生成并发布；先重试一次并报告具体空桶。

## 5. Content Schema

```jsonc
{
  "date": "2026-07-13",
  "weekday": "星期一",
  "edition": 54,
  "intro": "一句话导读…",
  "headline_title": "用于 manifest/日历的当期标题",
  "sections": {
    "headlines": {
      "lead": { "event_key": "", "tag": "", "title": "", "summary": "", "source": "", "url": "", "time": "" },
      "items": [ { "event_key": "", "title": "", "summary": "", "source": "", "url": "", "time": "", "tag": "" } ]
    },
    "papers": {
      "items": [ { "event_key": "arxiv-id", "title": "", "why": "", "summary": "", "authors": [""], "categories": ["cs.AI"], "published": "", "url": "" } ]
    },
    "community": {
      "items": [ { "event_key": "", "title": "", "summary": "", "quote": "", "platform": "Hacker News", "points": 0, "comments": 0, "url": "" } ]
    },
    "products": {
      "items": [ { "event_key": "", "icon": "", "name": "", "tagline": "", "summary": "", "tag": "", "url": "" } ]
    },
    "repos": {
      "items": [ { "event_key": "", "owner": "", "name": "", "desc": "", "lang": "", "stars": "", "stars_today": "", "url": "", "tag": "" } ]
    }
  }
}
```

## 6. 校验

生成后至少检查：

```bash
grep -c "assets/digest.css" ~/.hermes/daily-digest/$(date +%F).html
grep -c '>AI 论文<' ~/.hermes/daily-digest/$(date +%F).html
grep -o 'sec-no">[0-9]*' ~/.hermes/daily-digest/$(date +%F).html
```

预期：

- 样式引用为 `1`
- 有合格论文时 `AI 论文` 为 `1`
- 五栏齐全时可见 `01 02 03 04 05`

推送前检查 `git diff daily-digest/manifest.js`，确保不会把旧刊标题和导读压缩成只剩日期。推送后验证：

```bash
curl -fsSL https://classmatexiaoming96-ux.github.io/daily-digest/manifest.js | grep "$(date +%F)"
curl -fsSI https://classmatexiaoming96-ux.github.io/daily-digest/$(date +%F).html
```

## 7. 已知陷阱

| 坑 | 后果 | 规避 |
|---|---|---|
| 使用旧版四栏 skill | 没有 AI 论文栏目 | 以本文件和 `~/.codex/skills/daily-digest/SKILL.md` 的五栏要求为准 |
| arXiv 抓取失败后继续发布 | 论文栏缺失 | 重试；无法安全补足时在报告中明确失败原因 |
| 论文只是新闻稿重复版本 | 论文栏没有新增价值 | 只放 arXiv 原文，并写中文 `why` |
| 同一事件跨来源重复 | 主页面信息密度下降 | 统一 `event_key`，依赖 build.py 的同刊与近 3 天去重 |
| manifest 旧刊元数据被覆盖 | 日历/阅读器标题丢失 | 以线上 manifest 为基底，只插入新刊对象 |
| 推错仓库 | 全站 404 或入口缺失 | 生成内容推 `classmatexiaoming96-ux.github.io`，本仓库只保存参考文档和拆解页 |
