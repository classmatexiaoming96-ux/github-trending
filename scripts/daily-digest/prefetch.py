#!/usr/bin/env python3
# ============================================================
# Daily Digest — 数据预获取脚本
# 功能: 抓取 Google News、AI Trending，生成日报 JSON + HTML
# 使用: python prefetch.py [日期 YYYY-MM-DD]
# ============================================================

import os
import sys
import json
import argparse
import re
from datetime import datetime, timezone
from html import escape
from pathlib import Path
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

# 导入数据源配置
sys.path.insert(0, str(Path(__file__).parent))
from prefetch_sources import (
    GOOGLE_NEWS_CN_URL, GOOGLE_NEWS_CN_LABEL, GOOGLE_NEWS_CN_ICON,
    GOOGLE_NEWS_EN_URL, GOOGLE_NEWS_EN_LABEL, GOOGLE_NEWS_EN_ICON,
    X_TRENDING_URL, X_TRENDING_LABEL, X_TRENDING_ICON,
    NITTER_INSTANCES,
    MAX_ITEMS_PER_SOURCE,
    OUTPUT_DATA_DIR,
    DEBUG,
)

# ============================================================
# 工具函数
# ============================================================

def log(msg):
    if DEBUG:
        print(f"[prefetch] {msg}", file=sys.stderr)

def fetch_url(url, timeout=15):
    """获取 URL 内容，返回 (content, error)
    优先使用 urllib，失败后回退到 curl (绕过 Cloudflare)"""
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content = resp.read().decode("utf-8", errors="replace")
            # 检查是否被 Cloudflare 拦截
            if "not a bot" in content.lower() or "captcha" in content.lower():
                log("urllib blocked by Cloudflare, falling back to curl")
                return _fetch_with_curl(url, timeout)
            return content, None
    except Exception as e:
        log(f"urllib failed: {e}, falling back to curl")
        return _fetch_with_curl(url, timeout)


def _fetch_with_curl(url, timeout=15):
    """使用 curl 获取 URL (绕过 Cloudflare 验证)"""
    import subprocess
    try:
        cmd = ["curl", "-sL", "--max-time", str(timeout), url]
        # 如果设置了代理环境变量
        proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
        if proxy:
            cmd.extend(["--proxy", proxy])
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 5)
        if result.returncode == 0 and result.stdout:
            return result.stdout, None
        return None, f"curl failed (exit {result.returncode}): {result.stderr[:200]}"
    except Exception as e:
        return None, f"curl error: {e}"

def parse_rss(xml_content, max_items=10):
    """解析 RSS XML，返回条目列表"""
    items = []
    try:
        root = ET.fromstring(xml_content)
        # RSS 2.0
        channel = root.find("channel")
        if channel is None:
            return items
        for item in channel.findall("item")[:max_items]:
            title = item.findtext("title", "")
            link = item.findtext("link", "")
            pub_date = item.findtext("pubDate", "")
            desc = item.findtext("description", "")
            source = item.findtext("source", "")

            # 清理 HTML
            title = re.sub(r"<[^>]+>", "", title).strip()
            desc = re.sub(r"<[^>]+>", "", desc).strip() if desc else ""

            if title:
                items.append({
                    "title": title,
                    "link": link,
                    "pubDate": pub_date,
                    "description": desc[:200] + "..." if len(desc) > 200 else desc,
                    "source": source,
                })
    except ET.ParseError as e:
        log(f"RSS parse error: {e}")
    return items

def fetch_google_news(url, label, icon, max_items=10):
    """抓取 Google News RSS"""
    log(f"Fetching Google News: {label}")
    content, err = fetch_url(url)
    if err or not content:
        log(f"Google News fetch failed: {err}")
        return []
    items = parse_rss(content, max_items)
    for item in items:
        item["source_label"] = label
        item["source_icon"] = icon
    return items

def parse_nitter_html(html_content, max_items=10):
    """从 Nitter HTML 页面解析推文（RSS 端点不可用时使用）"""
    items = []
    try:
        # 提取推文块：找 tweet-content + username + tweet-link
        # Nitter 搜索页面每条推文的结构：
        # <div class="timeline-item"> 内包含 tweet-content, username, tweet-link
        tweet_pattern = re.compile(
            r'<div\s+class="timeline-item[^"]*".*?'
            r'class="tweet-content[^"]*"[^>]*>(.*?)</(?:div|span)>',
            re.DOTALL
        )
        contents = tweet_pattern.findall(html_content)

        usernames = re.findall(
            r'class="username[^"]*"[^>]*>@*([^<]+)',
            html_content
        )
        links = re.findall(
            r'class="tweet-link[^"]*"\s+href="([^"]+)"',
            html_content
        )

        # 按 max_items 限制
        count = min(len(contents), max_items)
        for i in range(count):
            content = re.sub(r'<[^>]+>', '', contents[i]).strip()
            if not content:
                continue
            username = usernames[i].strip() if i < len(usernames) else ""
            link = links[i] if i < len(links) else ""
            # 补全相对链接
            if link and link.startswith("/"):
                link = "https://nitter.tiekoetter.com" + link

            items.append({
                "title": content[:120],
                "link": link,
                "pubDate": "",
                "description": content[:200] + "..." if len(content) > 200 else content,
                "source": f"@{username}",
            })

        if items:
            log(f"Nitter HTML parse: {len(items)} tweets")
        else:
            log("Nitter HTML parse: no tweets found, trying RSS fallback")
    except Exception as e:
        log(f"Nitter HTML parse error: {e}")

    return items


def fetch_nitter(url, label, icon, max_items=10):
    """抓取 Nitter (X/Twitter) 搜索结果
    优先尝试 RSS，失败后回退到 HTML 页面解析"""
    log(f"Fetching Nitter: {label}")
    content, err = fetch_url(url)
    if err or not content:
        log(f"Nitter fetch failed: {err}")
        return []

    # 1) 尝试 RSS 解析
    items = parse_rss(content, max_items)
    if items:
        for item in items:
            item["source_label"] = label
            item["source_icon"] = icon
        return items

    # 2) RSS 不行 → HTML 回退
    log("RSS empty, falling back to HTML parsing")
    items = parse_nitter_html(content, max_items)
    for item in items:
        item["source_label"] = label
        item["source_icon"] = icon
    return items

def generate_summary(news_cn, news_en, x_trending):
    """生成日报摘要文字"""
    total = len(news_cn) + len(news_en) + len(x_trending)
    parts = []
    if news_cn:
        parts.append(f"Google News 中文 {len(news_cn)} 条")
    if news_en:
        parts.append(f"Google News 英文 {len(news_en)} 条")
    if x_trending:
        parts.append(f"X AI Trending {len(x_trending)} 条")
    return f"今日共抓取 {total} 条资讯: {', '.join(parts)}"

def escape_html(s):
    """HTML 转义"""
    if s is None:
        return ""
    return escape(str(s))

# ============================================================
# 日报 HTML 生成
# ============================================================

DAILY_DIGEST_CSS = """
/* ============================================================
   Daily Digest — 日报页面样式 (深色主题)
   ============================================================ */
:root {
  --bg:        #0a0b0e;
  --bg-grad:   #0c0e14;
  --bg-elev:   #111319;
  --bg-card:   #14161e;
  --bg-card-2: #181b24;
  --border:    rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.14);

  --text:      #e7e9f0;
  --text-dim:  #a3a9b8;
  --text-faint:#6f7585;

  --gold:   #e0b07a;
  --gold-2: #d4a574;
  --cyan:   #54d6e0;
  --amber:  #e9b873;
  --coral:  #e08a64;
  --green:  #7fcf9e;
  --violet: #b3a4f0;

  --radius: 14px;
  --maxw: 900px;

  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --disp: "Space Grotesk", var(--sans);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html { scroll-behavior: smooth; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

body::before {
  content: "";
  position: fixed; inset: 0; z-index: -2;
  background:
    radial-gradient(900px 520px at 78% -8%, rgba(224, 176, 122, 0.10), transparent 60%),
    radial-gradient(720px 460px at 8% 12%, rgba(84, 214, 224, 0.07), transparent 55%),
    var(--bg);
}
body::after {
  content: "";
  position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background-image:
    linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(circle at 50% 30%, black, transparent 80%);
}

/* ---- nav ---- */
.dd-nav {
  position: sticky; top: 0; z-index: 90;
  backdrop-filter: blur(16px);
  background: rgba(10, 11, 14, 0.85);
  border-bottom: 1px solid var(--border);
  padding: 12px 0;
}
.dd-nav .wrap { display: flex; align-items: center; justify-content: space-between; max-width: var(--maxw); margin: 0 auto; padding: 0 24px; }
.dd-nav-brand { display: flex; align-items: center; gap: 10px; font-family: var(--disp); font-weight: 700; font-size: 16px; }
.dd-nav-brand .dot { width: 10px; height: 10px; border-radius: 50%; background: linear-gradient(135deg, var(--cyan), var(--gold)); box-shadow: 0 0 10px var(--gold); }
.dd-nav-actions { display: flex; gap: 10px; }
.dd-btn {
  font-family: var(--sans); font-size: 13px; font-weight: 500;
  color: var(--text-dim); background: var(--bg-card);
  border: 1px solid var(--border); border-radius: 9px;
  padding: 8px 16px; cursor: pointer; text-decoration: none;
  transition: color .2s, background .2s, border-color .2s;
  display: inline-flex; align-items: center; gap: 7px;
}
.dd-btn:hover { color: var(--text); background: var(--bg-card-2); border-color: var(--border-strong); }
.dd-btn.primary { background: rgba(84, 214, 224, 0.12); border-color: rgba(84, 214, 224, 0.3); color: var(--cyan); }
.dd-btn.primary:hover { background: rgba(84, 214, 224, 0.2); }

/* ---- header ---- */
.dd-header {
  max-width: var(--maxw); margin: 0 auto; padding: 48px 24px 36px;
  border-bottom: 1px solid var(--border); text-align: center;
}
.dd-header .date {
  font-family: var(--mono); font-size: 12px; letter-spacing: .1em;
  color: var(--cyan); text-transform: uppercase; margin-bottom: 12px;
}
.dd-header h1 {
  font-family: var(--disp); font-weight: 700; letter-spacing: -.03em;
  font-size: clamp(2rem, 5vw, 3.2rem); margin-bottom: 14px;
  background: linear-gradient(110deg, var(--cyan), var(--gold) 50%, var(--coral));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.dd-header .summary { color: var(--text-dim); font-size: 1rem; max-width: 600px; margin: 0 auto; }
.dd-header .stats { display: flex; gap: 12px; justify-content: center; margin-top: 18px; flex-wrap: wrap; }
.dd-header .stat {
  font-family: var(--mono); font-size: 11px; letter-spacing: .06em;
  color: var(--text-faint); border: 1px solid var(--border);
  border-radius: 999px; padding: 5px 14px;
}
.dd-header .stat b { color: var(--gold); font-weight: 600; }

/* ---- content ---- */
.dd-content { max-width: var(--maxw); margin: 0 auto; padding: 40px 24px 80px; }

.dd-section { margin-bottom: 52px; }
.dd-section-head {
  display: flex; align-items: center; gap: 12px; margin-bottom: 22px;
}
.dd-section-head .icon { font-size: 1.3rem; }
.dd-section-head h2 {
  font-family: var(--disp); font-weight: 600; font-size: 1.2rem;
  letter-spacing: -.01em;
}
.dd-section-head .line { flex: 1; height: 1px; background: var(--border); }

/* ---- news cards ---- */
.news-list { display: flex; flex-direction: column; gap: 12px; }
.news-card {
  display: flex; gap: 16px; padding: 18px 20px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); transition: border-color .2s, transform .2s;
  text-decoration: none; color: inherit;
}
.news-card:hover { border-color: var(--border-strong); transform: translateX(4px); }
.news-card .num {
  font-family: var(--mono); font-size: 11px; color: var(--text-faint);
  min-width: 24px; padding-top: 3px;
}
.news-card .body { flex: 1; }
.news-card h3 {
  font-family: var(--disp); font-weight: 600; font-size: 1rem;
  letter-spacing: -.01em; line-height: 1.3; margin-bottom: 6px;
  color: var(--text);
}
.news-card p { font-size: 13.5px; color: var(--text-dim); margin-bottom: 8px; }
.news-card .meta { display: flex; gap: 12px; flex-wrap: wrap; }
.news-card .meta span {
  font-family: var(--mono); font-size: 11px; color: var(--text-faint);
}
.news-card .meta .source { color: var(--cyan); }
.news-card .arrow { color: var(--text-faint); font-size: 18px; align-self: center; transition: transform .2s, color .2s; }
.news-card:hover .arrow { color: var(--cyan); transform: translateX(3px); }

/* ---- x/trending cards ---- */
.x-card {
  display: flex; gap: 14px; padding: 16px 18px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); transition: border-color .2s;
  text-decoration: none; color: inherit;
}
.x-card:hover { border-color: var(--border-strong); }
.x-card .avatar {
  width: 40px; height: 40px; border-radius: 10px;
  background: linear-gradient(135deg, var(--violet), var(--cyan));
  display: flex; align-items: center; justify-content: center;
  font-family: var(--mono); font-weight: 700; font-size: 14px;
  flex: none;
}
.x-card .body { flex: 1; }
.x-card .author { font-family: var(--disp); font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.x-card .author .handle { font-family: var(--mono); font-size: 12px; color: var(--text-faint); font-weight: 400; }
.x-card h3 { font-size: 14px; color: var(--text-dim); line-height: 1.4; }
.x-card .stats { display: flex; gap: 14px; margin-top: 8px; }
.x-card .stat { font-family: var(--mono); font-size: 11px; color: var(--text-faint); display: flex; align-items: center; gap: 4px; }

/* ---- footer ---- */
.dd-footer {
  max-width: var(--maxw); margin: 0 auto; padding: 24px;
  border-top: 1px solid var(--border); text-align: center;
}
.dd-footer p { font-family: var(--mono); font-size: 11.5px; color: var(--text-faint); }
.dd-footer a { color: var(--text-dim); text-decoration: none; }
.dd-footer a:hover { color: var(--gold); }

/* ---- empty state ---- */
.empty-state {
  text-align: center; padding: 48px 24px;
  color: var(--text-faint); font-size: 14px;
}
.empty-state .icon { font-size: 2rem; margin-bottom: 12px; opacity: .5; }

/* ---- responsive ---- */
@media (max-width: 600px) {
  .dd-header h1 { font-size: 1.8rem; }
  .news-card { flex-direction: column; }
  .news-card .arrow { display: none; }
}
"""

DAILY_DIGEST_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI 日报 · {date_str}</title>
<meta name="description" content="每日 AI/科技资讯日报 — {date_str}" />
<meta property="og:title" content="AI 日报 · {date_str}" />
<meta property="og:description" content="每日 AI/科技资讯摘要" />
<meta property="og:type" content="article" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%230a0b0e'/%3E%3Ccircle cx='30' cy='35' r='10' fill='%2354d6e0'/%3E%3Ccircle cx='70' cy='35' r='10' fill='%23e9b873'/%3E%3Ccircle cx='30' cy='70' r='10' fill='%23e08a64'/%3E%3Ccircle cx='70' cy='70' r='10' fill='%237fcf9e'/%3E%3C/svg%3E" />
<style>
{css}
</style>
</head>
<body>

<!-- 导航栏 -->
<nav class="dd-nav">
  <div class="wrap">
    <a class="dd-nav-brand" href="calendar.html">
      <span class="dot"></span>
      <span>AI 日报</span>
    </a>
    <div class="dd-nav-actions">
      <a class="dd-btn" href="calendar.html">📅 日历</a>
    </div>
  </div>
</nav>

<!-- 头部 -->
<header class="dd-header">
  <div class="date">{date_weekday} · {date_str}</div>
  <h1>AI 日报</h1>
  <p class="summary">{summary}</p>
  <div class="stats">
    <span class="stat"><b>{news_cn_count}</b> 条 · Google News 中文</span>
    <span class="stat"><b>{news_en_count}</b> 条 · Google News EN</span>
    <span class="stat"><b>{x_count}</b> 条 · X AI Trending</span>
  </div>
</header>

<!-- 内容 -->
<main class="dd-content">

  <!-- Google News 中文 -->
  <section class="dd-section">
    <div class="dd-section-head">
      <span class="icon">{google_news_cn_icon}</span>
      <h2>{google_news_cn_label}</h2>
      <div class="line"></div>
    </div>
    <div class="news-list">
{google_news_cn_items}
    </div>
  </section>

  <!-- Google News 英文 -->
  <section class="dd-section">
    <div class="dd-section-head">
      <span class="icon">{google_news_en_icon}</span>
      <h2>{google_news_en_label}</h2>
      <div class="line"></div>
    </div>
    <div class="news-list">
{google_news_en_items}
    </div>
  </section>

  <!-- X AI Trending -->
  <section class="dd-section">
    <div class="dd-section-head">
      <span class="icon">{x_trending_icon}</span>
      <h2>{x_trending_label}</h2>
      <div class="line"></div>
    </div>
    <div class="news-list">
{x_trending_items}
    </div>
  </section>

</main>

<!-- 页脚 -->
<footer class="dd-footer">
  <p>AI 日报 · {date_str} · 由 GitHub Actions 自动生成</p>
  <p><a href="calendar.html">← 返回日历</a></p>
</footer>

</body>
</html>
"""

def build_news_card(item, index):
    """构建单条新闻卡片 HTML"""
    num = str(index).zfill(2)
    title = escape_html(item.get("title", ""))
    desc = escape_html(item.get("description", ""))
    link = escape_html(item.get("link", "#"))
    pub_date = escape_html(item.get("pubDate", ""))
    source = escape_html(item.get("source", item.get("source_label", "")))

    # 提取日期部分
    date_display = pub_date
    if pub_date:
        try:
            from email.utils import parsedate_to_datetime
            dt = parsedate_to_datetime(pub_date)
            date_display = dt.strftime("%m-%d %H:%M")
        except:
            date_display = re.sub(r"\s+\d{4}$", "", pub_date)

    return f'''      <a class="news-card" href="{link}" target="_blank" rel="noopener">
        <span class="num">{num}</span>
        <div class="body">
          <h3>{title}</h3>
          {f"<p>{desc}</p>" if desc else ""}
          <div class="meta">
            <span class="source">{source}</span>
            <span>{date_display}</span>
          </div>
        </div>
        <span class="arrow">→</span>
      </a>'''

def build_x_card(item, index):
    """构建 X 卡片 HTML"""
    num = str(index).zfill(2)
    title = escape_html(item.get("title", ""))
    link = escape_html(item.get("link", "#"))
    author = escape_html(item.get("author", ""))
    pub_date = escape_html(item.get("pubDate", ""))

    # 提取 handle
    handle = ""
    if "@" in author:
        handle = author
        author = author.split("@")[0] if author else author

    date_display = pub_date
    if pub_date:
        try:
            from email.utils import parsedate_to_datetime
            dt = parsedate_to_datetime(pub_date)
            date_display = dt.strftime("%m-%d %H:%M")
        except:
            date_display = re.sub(r"\s+\d{4}$", "", pub_date)

    return f'''      <a class="x-card" href="{link}" target="_blank" rel="noopener">
        <div class="avatar">{num}</div>
        <div class="body">
          <div class="author">{escape_html(author)} <span class="handle">{escape_html(handle)}</span></div>
          <h3>{title}</h3>
          <div class="stats">
            <span class="stat">🕐 {date_display}</span>
          </div>
        </div>
      </a>'''

def weekdays_cn(date_obj):
    """返回中文星期"""
    weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    return weekdays[date_obj.weekday()]

def generate_daily_html(date_str, news_cn, news_en, x_trending):
    """生成完整日报 HTML"""
    date_obj = datetime.strptime(date_str, "%Y-%m-%d")
    date_weekday = weekdays_cn(date_obj)
    summary = generate_summary(news_cn, news_en, x_trending)

    # 构建新闻条目 HTML
    news_cn_items_html = "\n".join(
        build_news_card(item, i+1) for i, item in enumerate(news_cn)
    ) if news_cn else '<div class="empty-state"><div class="icon">📰</div><p>暂无数据</p></div>'

    news_en_items_html = "\n".join(
        build_news_card(item, i+1) for i, item in enumerate(news_en)
    ) if news_en else '<div class="empty-state"><div class="icon">🌐</div><p>No data available</p></div>'

    x_items_html = "\n".join(
        build_x_card(item, i+1) for i, item in enumerate(x_trending)
    ) if x_trending else '<div class="empty-state"><div class="icon">𝕏</div><p>暂无数据</p></div>'

    return DAILY_DIGEST_HTML_TEMPLATE.format(
        date_str=date_str,
        date_weekday=date_weekday,
        summary=escape_html(summary),
        news_cn_count=len(news_cn),
        news_en_count=len(news_en),
        x_count=len(x_trending),
        google_news_cn_icon=GOOGLE_NEWS_CN_ICON,
        google_news_cn_label=GOOGLE_NEWS_CN_LABEL,
        google_news_cn_items=news_cn_items_html,
        google_news_en_icon=GOOGLE_NEWS_EN_ICON,
        google_news_en_label=GOOGLE_NEWS_EN_LABEL,
        google_news_en_items=news_en_items_html,
        x_trending_icon=X_TRENDING_ICON,
        x_trending_label=X_TRENDING_LABEL,
        x_trending_items=x_items_html,
        css=DAILY_DIGEST_CSS,
    )

# ============================================================
# 主流程
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Daily Digest 数据抓取")
    parser.add_argument("date", nargs="?", help="日期 YYYY-MM-DD (默认今天)")
    parser.add_argument("--output-dir", default="data", help="输出目录")
    parser.add_argument("--no-push", action="store_true", help="不执行 git add/commit/push")
    args = parser.parse_args()

    # 确定日期
    if args.date:
        date_str = args.date
    else:
        date_str = datetime.now().strftime("%Y-%m-%d")

    print(f"[Daily Digest] 生成日期: {date_str}", file=sys.stderr)

    # 创建输出目录
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 抓取数据
    news_cn = fetch_google_news(GOOGLE_NEWS_CN_URL, GOOGLE_NEWS_CN_LABEL, GOOGLE_NEWS_CN_ICON, MAX_ITEMS_PER_SOURCE)
    news_en = fetch_google_news(GOOGLE_NEWS_EN_URL, GOOGLE_NEWS_EN_LABEL, GOOGLE_NEWS_EN_ICON, MAX_ITEMS_PER_SOURCE)
    x_trending = fetch_nitter(X_TRENDING_URL, X_TRENDING_LABEL, X_TRENDING_ICON, MAX_ITEMS_PER_SOURCE)

    print(f"[Daily Digest] 抓取完成: CN={len(news_cn)}, EN={len(news_en)}, X={len(x_trending)}", file=sys.stderr)

    # 构建 JSON 数据
    data = {
        "date": date_str,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "google_news_cn": news_cn,
        "google_news_en": news_en,
        "x_trending": x_trending,
        "summary": generate_summary(news_cn, news_en, x_trending),
    }

    # 写入 JSON
    json_path = output_dir / f"{date_str}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[Daily Digest] JSON 已写入: {json_path}", file=sys.stderr)

    # 生成 HTML
    html_content = generate_daily_html(date_str, news_cn, news_en, x_trending)
    html_path = output_dir / f"{date_str}.html"
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"[Daily Digest] HTML 已写入: {html_path}", file=sys.stderr)

    # Git 操作
    if not args.no_push:
        try:
            import subprocess
            repo_dir = Path(__file__).parent.parent.parent.resolve()
            subprocess.run(["git", "add", str(json_path), str(html_path)], cwd=repo_dir, check=True)
            subprocess.run([
                "git", "commit", "-m",
                f"docs: add daily digest {date_str}"
            ], cwd=repo_dir, check=True)
            subprocess.run(["git", "push"], cwd=repo_dir, check=True)
            print(f"[Daily Digest] 已提交并推送", file=sys.stderr)
        except Exception as e:
            print(f"[Daily Digest] Git 操作失败: {e}", file=sys.stderr)

    print(f"[Daily Digest] 完成!", file=sys.stderr)

if __name__ == "__main__":
    main()
