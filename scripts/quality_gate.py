#!/usr/bin/env python3
"""github-trending-monitor quality gate.

Validate generated project pages against the legacy layout/content guardrails
and the newer source-depth checks that prevent citation-only pages.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


LAYOUT_ANCHORS = ("--ink:", "--panel:", "--star:", "--ease:", ".shell{", ".nav{", ".bg-stars")
KEY_CSS_VARS = {"ink", "panel", "star", "ease", "mono", "sans", "serif"}
MIN_MAIN_CODE_WRAPS = 6
MIN_CHILD_CODE_WRAPS = 3
BASE_SCORE = 30
LOW_EXPLANATION_RATIO = 0.30
SOURCE_REF_RE = re.compile(
    r"(?:src|lib|packages?|cmd|internal)/[a-zA-Z0-9_/.\-]+\."
    r"(?:ts|js|tsx|jsx|py|go|rs|java|kt|swift)"
)
SOURCE_PATH_PATTERN = (
    r"(?:src|sources?|lib|packages?|cmd|internal|app|server|client|tests?|scripts|frontend|backend|core|eval|agents?)/"
    r"[a-zA-Z0-9_/.\-]+\.(?:ts|js|tsx|jsx|py|go|rs|java|kt|swift|md)"
)
LINE_REF_RE = re.compile(r"(?<![\d/]):(\d{2,4})(?![\d])")
PATH_LINE_REF_RE = re.compile(rf"(?<![\w./-]){SOURCE_PATH_PATTERN}:\d{{1,5}}")
CODE_REF_RE = re.compile(rf"<code>{SOURCE_PATH_PATTERN}:\d{{1,5}}</code>")
BULK_LINE_PILE_RE = re.compile(
    rf"(?:<code>{SOURCE_PATH_PATTERN}:[0-9]+</code>[·、,，;；\s]+){{7,}}"
    rf"<code>{SOURCE_PATH_PATTERN}:[0-9]+</code>"
)
PATH_LINE_REF_PARSE_RE = re.compile(rf"(?<![\w./-])({SOURCE_PATH_PATTERN}):(\d{{1,5}})")
PARAGRAPH_RE = re.compile(r"<p\b[^>]*>.*?</p>", re.DOTALL | re.IGNORECASE)
TAG_RE = re.compile(r"<[^>]+>")
REF_TEXT_RE = re.compile(r"[\w./-]+:\d+")
EXPLANATION_CHAR_RE = re.compile(r"[A-Za-z\u4e00-\u9fff]")


@dataclass
class PageMetrics:
    name: str
    path: str
    page_type: str
    size_kb: int
    line_refs: int
    code_wraps: int
    min_code_wraps: int
    bulk_line_piles: int
    code_refs: int
    low_explanation_refs: int
    explanation_ratio: float
    explanation_paragraphs: int
    h3_count: int
    layout_missing: list[str]
    banned_design: list[str]


@dataclass
class GateResult:
    project: str
    passed: bool
    main_page: dict
    sub_pages: dict
    index: dict
    pages: list[PageMetrics]
    score: dict
    all_errors: list[str]
    warnings: list[str]

    @property
    def ok(self) -> bool:
        return self.passed

    @property
    def errors(self) -> list[str]:
        return self.all_errors


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def layout_missing(content: str) -> list[str]:
    checks: tuple[tuple[str, str | re.Pattern[str]], ...] = (
        ("--ink:", "--ink:"),
        ("--panel:", "--panel:"),
        ("--star:", "--star:"),
        ("--ease:", "--ease:"),
        (".shell{", re.compile(r"\.shell\s*\{")),
        (".nav{", re.compile(r"\.nav\s*\{")),
        (".bg-stars", ".bg-stars"),
    )
    missing: list[str] = []
    for label, needle in checks:
        if isinstance(needle, str):
            if needle not in content:
                missing.append(label)
        elif not needle.search(content):
            missing.append(label)
    return missing


def old_design_system(content: str) -> list[str]:
    banned: list[str] = []
    if "--bg-card" in content and "--bg-elev" in content and "--ink" not in content:
        banned.append("--bg-card/--bg-elev system (B 系)")
    if "--glow-amber" in content and "--ink:" not in content:
        banned.append("--glow-amber system (A 系)")
    return banned


def css_vars(content: str) -> set[str]:
    return set(re.findall(r"--([a-z0-9-]+)\s*:", content))


def deep_link_count(content: str, project: str) -> int:
    links = re.findall(r'<a[^>]+class="[^"]*deep-link[^"]*"[^>]+href="([^"]+)"', content)
    return len([href for href in links if href.startswith(f"{project}/")])


def strip_html_for_explanation(fragment: str) -> str:
    text = TAG_RE.sub(" ", fragment)
    return REF_TEXT_RE.sub(" ", text)


def low_explanation_count(content: str) -> int:
    low = 0
    for match in PATH_LINE_REF_RE.finditer(content):
        start = max(0, match.start() - 200)
        end = min(len(content), match.end() + 200)
        nearby_text = strip_html_for_explanation(content[start:end])
        if len(EXPLANATION_CHAR_RE.findall(nearby_text)) < 30:
            low += 1
    return low


def explanation_ratio(content: str) -> float:
    code_refs = len(PATH_LINE_REF_RE.findall(content))
    if not code_refs:
        return 0.0
    explained_refs = code_refs - low_explanation_count(content)
    return explained_refs / code_refs


def count_explanation_paragraphs(content: str) -> int:
    blocks = PARAGRAPH_RE.findall(content)
    if not blocks:
        blocks = [part for part in re.split(r"\n\s*\n+", content) if part.strip()]

    count = 0
    for block in blocks:
        if not PATH_LINE_REF_RE.search(block):
            continue
        text = TAG_RE.sub(" ", block)
        if len(EXPLANATION_CHAR_RE.findall(text)) >= 100:
            count += 1
    return count


def bulk_line_pile_count(content: str) -> int:
    return len(BULK_LINE_PILE_RE.findall(content))


def score_grade(score: float) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


def score_ratio(actual: int | float, threshold: int | float) -> float:
    if threshold <= 0:
        return 1.0
    return min(float(actual) / float(threshold), 1.0)


def compute_score(
    metrics: PageMetrics,
    *,
    deep_links: int | None = None,
    index_card_ok: bool | None = None,
) -> dict:
    """Return a simple 100-point score without changing PASS/FAIL checks."""
    if metrics.bulk_line_piles >= 10:
        return {
            "path": metrics.path,
            "score": 0,
            "grade": "F",
            "penalties": {
                "bulk_line_piles": metrics.bulk_line_piles * 15,
                "low_explanation_ratio": (
                    20
                    if metrics.code_refs > 0 and metrics.explanation_ratio < LOW_EXPLANATION_RATIO
                    else 0
                ),
            },
        }

    min_explanation_paragraphs = 6 if metrics.page_type == "main" else 3
    min_h3 = 10 if metrics.page_type == "main" else 3
    min_deep_links = 2 if metrics.page_type == "main" else 0

    code_score = 15 * score_ratio(metrics.code_wraps, metrics.min_code_wraps)
    explanation_paragraph_score = 15 * score_ratio(
        metrics.explanation_paragraphs, min_explanation_paragraphs
    )
    explanation_ratio_score = 20 * max(0.0, min(metrics.explanation_ratio, 1.0))
    h3_score = 5 * score_ratio(metrics.h3_count, min_h3)
    deep_score = 5 * score_ratio(deep_links or 0, min_deep_links)
    layout_score = 5 if not metrics.layout_missing and not metrics.banned_design else 0
    index_score = 5 if index_card_ok is not False else 0

    bulk_penalty = metrics.bulk_line_piles * 15
    low_ratio_penalty = (
        20 if metrics.code_refs > 0 and metrics.explanation_ratio < LOW_EXPLANATION_RATIO else 0
    )

    raw_score = (
        BASE_SCORE
        + code_score
        + explanation_paragraph_score
        + explanation_ratio_score
        + h3_score
        + deep_score
        + layout_score
        + index_score
        - bulk_penalty
        - low_ratio_penalty
    )
    final_score = int(round(max(0, min(100, raw_score))))

    return {
        "path": metrics.path,
        "score": final_score,
        "grade": score_grade(final_score),
        "components": {
            "base": BASE_SCORE,
            "code_wraps": round(code_score, 1),
            "explanation_paragraphs": round(explanation_paragraph_score, 1),
            "explanation_ratio": round(explanation_ratio_score, 1),
            "h3_count": round(h3_score, 1),
            "deep_links": round(deep_score, 1),
            "layout_shell": layout_score,
            "index_card": index_score,
        },
        "penalties": {
            "bulk_line_piles": bulk_penalty,
            "low_explanation_ratio": low_ratio_penalty,
        },
    }


def compute_project_score(result: GateResult) -> dict:
    pages: list[dict] = []
    main_deep_links = result.main_page.get("deep_links")
    index_card_ok = result.index.get("has_card")
    for metrics in result.pages:
        if metrics.page_type == "main":
            page_score = compute_score(metrics, deep_links=main_deep_links, index_card_ok=index_card_ok)
        else:
            page_score = compute_score(metrics, deep_links=None, index_card_ok=None)
        pages.append(page_score)

    max_score = len(pages) * 100
    total = sum(page["score"] for page in pages)
    average = int(round((total / max_score) * 100)) if max_score else 0
    return {
        "total": total,
        "max": max_score,
        "average": average,
        "grade": score_grade(average),
        "pages": pages,
    }


def verify_line_numbers(content: str, sources_dir: Path) -> list[str]:
    errors: list[str] = []
    seen: set[tuple[str, int]] = set()
    for ref_path, line_text in PATH_LINE_REF_PARSE_RE.findall(content):
        line_no = int(line_text)
        key = (ref_path, line_no)
        if key in seen:
            continue
        seen.add(key)

        source = sources_dir / ref_path
        if not source.exists():
            errors.append(f"{ref_path}:{line_no} 源文件不存在")
            continue
        try:
            line_count = sum(1 for _ in source.open("r", encoding="utf-8", errors="ignore"))
        except OSError as exc:
            errors.append(f"{ref_path}:{line_no} 源文件读取失败: {exc}")
            continue
        if line_no < 1 or line_no > line_count:
            errors.append(f"{ref_path}:{line_no} 行号超出源码范围 1..{line_count}")
    return errors


def page_metrics(root: Path, project: str, path: Path) -> PageMetrics:
    content = read_text(path)
    rel = path.relative_to(root).as_posix()
    page_type = "main" if path.name == f"{project}.html" else "child"
    min_code_wraps = MIN_MAIN_CODE_WRAPS if page_type == "main" else MIN_CHILD_CODE_WRAPS
    return PageMetrics(
        name=path.name,
        path=rel,
        page_type=page_type,
        size_kb=len(content) // 1024,
        line_refs=len(LINE_REF_RE.findall(content)),
        code_wraps=content.count('<div class="code-wrap"'),
        min_code_wraps=min_code_wraps,
        bulk_line_piles=bulk_line_pile_count(content),
        code_refs=len(PATH_LINE_REF_RE.findall(content)),
        low_explanation_refs=low_explanation_count(content),
        explanation_ratio=explanation_ratio(content),
        explanation_paragraphs=count_explanation_paragraphs(content),
        h3_count=len(re.findall(r"<h3[^>]*>", content)),
        layout_missing=layout_missing(content),
        banned_design=old_design_system(content),
    )


def apply_page_depth_checks(metrics: PageMetrics) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    min_line_refs = 50 if metrics.page_type == "main" else 20
    min_explanation_ratio = 0.70 if metrics.page_type == "main" else 0.60
    min_explanation_paragraphs = 6 if metrics.page_type == "main" else 3
    if metrics.line_refs < min_line_refs:
        errors.append(f"{metrics.path} 行号引用数 {metrics.line_refs} < {min_line_refs}")
    if metrics.code_wraps < metrics.min_code_wraps:
        errors.append(f"{metrics.path} 真实代码块数 {metrics.code_wraps} < {metrics.min_code_wraps}")
    if metrics.explanation_paragraphs < min_explanation_paragraphs:
        errors.append(
            f"{metrics.path} 独立讲解段落数 {metrics.explanation_paragraphs} < {min_explanation_paragraphs}"
        )
    if metrics.code_refs == 0:
        errors.append(f"{metrics.path} code path:NN 引用数 0")
    elif metrics.explanation_ratio < min_explanation_ratio:
        errors.append(
            f"{metrics.path} 讲解密度 {metrics.explanation_ratio:.0%} < {min_explanation_ratio:.0%} "
            f"({metrics.code_refs - metrics.low_explanation_refs}/{metrics.code_refs})"
        )
    if metrics.bulk_line_piles:
        errors.append(f"{metrics.path} 命中批量行号堆砌段 {metrics.bulk_line_piles} 处")
    if metrics.low_explanation_refs and metrics.explanation_ratio >= min_explanation_ratio:
        warnings.append(
            f"{metrics.path} 讲解密度不足的 path:NN 引用 "
            f"{metrics.low_explanation_refs}/{metrics.code_refs}"
        )

    return errors, warnings


def check_main_page(
    root: Path, project: str, sources_dir: Path | None = None
) -> tuple[dict, PageMetrics | None, list[str]]:
    main = root / f"{project}.html"
    if not main.exists():
        return {"exists": False, "errors": [f"主页面不存在: {main}"]}, None, []

    content = read_text(main)
    metrics = page_metrics(root, project, main)
    errors: list[str] = []
    warnings: list[str] = []

    if metrics.layout_missing:
        errors.append(f"layout shell 缺失锚点: {metrics.layout_missing}")
    if metrics.banned_design:
        errors.append(f"检测到旧设计系统: {metrics.banned_design}")

    src_count = len(set(SOURCE_REF_RE.findall(content)))

    if metrics.h3_count < 10:
        errors.append(f"H3 章节数 {metrics.h3_count} < 10")

    deep_count = deep_link_count(content, project)
    if deep_count < 2:
        errors.append(f"深度阅读入口 {deep_count} < 2")

    depth_errors, depth_warnings = apply_page_depth_checks(metrics)
    errors.extend(depth_errors)
    warnings.extend(depth_warnings)
    if sources_dir:
        line_errors = verify_line_numbers(content, sources_dir)
        errors.extend([f"{metrics.path}: {error}" for error in line_errors])

    has_mermaid = "mermaid" in content.lower()
    has_flow = ".flow" in content
    if not has_mermaid and not has_flow:
        warnings.append("没有 mermaid 或 ASCII flow 块（架构图缺失）")

    return (
        {
            "exists": True,
            "size_kb": metrics.size_kb,
            "src_refs": src_count,
            "line_refs": metrics.line_refs,
            "code_wraps": metrics.code_wraps,
            "min_code_wraps": metrics.min_code_wraps,
            "bulk_line_piles": metrics.bulk_line_piles,
            "code_refs": metrics.code_refs,
            "low_explanation_refs": metrics.low_explanation_refs,
            "explanation_ratio": metrics.explanation_ratio,
            "explanation_paragraphs": metrics.explanation_paragraphs,
            "h3_count": metrics.h3_count,
            "deep_links": deep_count,
            "has_mermaid": has_mermaid,
            "has_flow": has_flow,
            "errors": errors,
            "warnings": warnings,
        },
        metrics,
        warnings,
    )


def check_sub_pages(
    root: Path, project: str, sources_dir: Path | None = None
) -> tuple[dict, list[PageMetrics], list[str]]:
    sub_dir = root / project
    if not sub_dir.exists():
        return {"exists": False, "errors": [f"子页面目录不存在: {sub_dir}"]}, [], []

    sub_pages = sorted(sub_dir.glob("*.html"))
    if len(sub_pages) < 2:
        return {"exists": True, "count": len(sub_pages), "errors": [f"子页面数 {len(sub_pages)} < 2"]}, [], []

    errors: list[str] = []
    warnings: list[str] = []
    pages: list[dict] = []
    metrics_list: list[PageMetrics] = []
    main_path = root / f"{project}.html"
    main_vars = css_vars(read_text(main_path)) if main_path.exists() else set()

    for sub_page in sub_pages:
        content = read_text(sub_page)
        metrics = page_metrics(root, project, sub_page)
        metrics_list.append(metrics)

        if metrics.layout_missing:
            errors.append(f"{sub_page.name}: layout shell 缺失 {metrics.layout_missing}")
        if metrics.banned_design:
            errors.append(f"{sub_page.name}: 检测到旧设计系统 {metrics.banned_design}")
        if metrics.h3_count < 3:
            errors.append(f"{sub_page.name}: H3 数 {metrics.h3_count} < 3")

        sub_vars = css_vars(content)
        if main_vars and not main_vars.issubset(sub_vars):
            key_missing = (main_vars - sub_vars) & KEY_CSS_VARS
            if key_missing:
                errors.append(f"{sub_page.name}: 与主页 CSS vars 不一致, 缺 {key_missing}")

        depth_errors, depth_warnings = apply_page_depth_checks(metrics)
        errors.extend([e.replace(f"{metrics.path} ", f"{sub_page.name}: ") for e in depth_errors])
        warnings.extend(depth_warnings)
        if sources_dir:
            line_errors = verify_line_numbers(content, sources_dir)
            errors.extend([f"{sub_page.name}: {error}" for error in line_errors])

        pages.append(
            {
                "name": metrics.name,
                "size_kb": metrics.size_kb,
                "line_refs": metrics.line_refs,
                "code_wraps": metrics.code_wraps,
                "min_code_wraps": metrics.min_code_wraps,
                "bulk_line_piles": metrics.bulk_line_piles,
                "code_refs": metrics.code_refs,
                "low_explanation_refs": metrics.low_explanation_refs,
                "explanation_ratio": metrics.explanation_ratio,
                "explanation_paragraphs": metrics.explanation_paragraphs,
                "h3_count": metrics.h3_count,
            }
        )

    return {"exists": True, "count": len(sub_pages), "pages": pages, "errors": errors, "warnings": warnings}, metrics_list, warnings


def check_index(root: Path, project: str) -> dict:
    index = root / "index.html"
    if not index.exists():
        return {"exists": False, "errors": ["index.html 不存在"], "warnings": []}

    content = read_text(index)
    has_card = f'href="{project}.html"' in content or f"#{project}" in content
    return {
        "exists": True,
        "has_card": has_card,
        "errors": [] if has_card else [f'index.html 未包含项目卡片（href="{project}.html" 或 #{project} 锚点）'],
        "warnings": [],
    }


def evaluate_project(root: Path, project: str, sources_dir: Path | None = None) -> GateResult:
    main_result, main_metrics, main_warnings = check_main_page(root, project, sources_dir)
    sub_result, sub_metrics, sub_warnings = check_sub_pages(root, project, sources_dir)
    index_result = check_index(root, project)

    all_errors = main_result.get("errors", []) + sub_result.get("errors", []) + index_result.get("errors", [])
    warnings = main_warnings + sub_warnings + index_result.get("warnings", [])
    pages = ([main_metrics] if main_metrics else []) + sub_metrics

    result = GateResult(
        project=project,
        passed=not all_errors,
        main_page=main_result,
        sub_pages=sub_result,
        index=index_result,
        pages=pages,
        score={},
        all_errors=all_errors,
        warnings=warnings,
    )
    result.score = compute_project_score(result)
    main_score = next(
        (page_score for page_score in result.score.get("pages", []) if page_score.get("path") == f"{project}.html"),
        None,
    )
    if main_score and main_score["score"] < 60:
        result.all_errors.append(f"{project}.html 主页面评分 {main_score['score']} < 60")
        result.passed = False
    return result


def print_text(result: GateResult) -> None:
    print(f"=== Quality Gate · {result.project} ===\n")

    main = result.main_page
    if main.get("exists"):
        print(f"主页面 · {result.project}.html ({main['size_kb']}KB)")
        print(f"  源码引用: {main.get('src_refs', '?')}  行号引用: {main.get('line_refs', '?')}")
        print(f"  真实代码块: {main.get('code_wraps', '?')}/{main.get('min_code_wraps', '?')}")
        print(
            f"  讲解段落: {main.get('explanation_paragraphs', '?')}  "
            f"讲解密度: {main.get('explanation_ratio', 0):.0%}"
        )
        print(f"  H3 章节: {main.get('h3_count', '?')}  深度阅读: {main.get('deep_links', '?')}")
        print(f"  架构图: mermaid={main.get('has_mermaid', False)}, flow={main.get('has_flow', False)}")

    sub = result.sub_pages
    print(f"\n子页面 · {result.project}/ ({'存在' if sub.get('exists') else '缺失'})")
    for page in sub.get("pages", []):
        print(
            f"  {page['name']:50s} {page['size_kb']:3d}KB  "
            f"L_refs={page['line_refs']:3d}  code={page['code_wraps']:2d}/{page['min_code_wraps']}  "
            f"expl={page['explanation_paragraphs']:2d}  ratio={page['explanation_ratio']:.0%}  "
            f"H3={page['h3_count']}"
        )

    print(f"\nindex.html · {'包含卡片' if result.index.get('has_card') else '缺卡片'}")

    if result.score.get("pages"):
        print("\n=== 评分 ===")
        for page_score in result.score["pages"]:
            print(f"{page_score['path']}: {page_score['score']} 分 ({page_score['grade']})")
        print(
            f"\n总分：{result.score['total']} / {result.score['max']} "
            f"({result.score['average']}%)"
        )
        print(f"等级：{result.score['grade']}")

    if result.all_errors:
        print(f"\nFAIL · {len(result.all_errors)} 个错误:")
        for error in result.all_errors:
            print(f"  - {error}")
        return

    if result.warnings:
        print(f"\nWARN · {len(result.warnings)} 个警告:")
        for warning in result.warnings:
            print(f"  - {warning}")
    print("\nPASS · 所有质量门通过")


def result_to_json(result: GateResult) -> str:
    data = asdict(result)
    data["ok"] = result.passed
    return json.dumps(data, ensure_ascii=False, indent=2)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate generated github-trending project pages.")
    parser.add_argument("project", help="项目名（小写连字符，如 opentag）")
    parser.add_argument("--root", "--page-dir", dest="root", default=".", help="页面所在目录，默认当前目录")
    parser.add_argument("--sources", type=Path, help="可选源码目录，用于校验 code path:NN 行号真实性")
    parser.add_argument("--json", action="store_true", help="JSON 输出")
    return parser.parse_args(list(argv))


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    sources_dir = args.sources.resolve() if args.sources else None
    result = evaluate_project(Path(args.root).resolve(), args.project, sources_dir)
    if args.json:
        print(result_to_json(result))
    else:
        print_text(result)
    return 0 if result.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
