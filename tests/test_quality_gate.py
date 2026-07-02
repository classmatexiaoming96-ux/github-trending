import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.quality_gate import evaluate_project


REPO_ROOT = Path(__file__).resolve().parents[1]
STYLE = """
<style>
:root{--ink:#111;--panel:#fff;--star:#0af;--ease:cubic-bezier(.2,.8,.2,1);--mono:ui-monospace;--sans:Arial;--serif:Georgia}
.shell{max-width:1180px}.nav{display:flex}.bg-stars{position:fixed}
</style>
"""


def make_code_wrap(ref_start, count=10):
    rows = "\n".join(
        f'<tr><td class="ln">{ref_start + i}</td><td><code>print({i})</code></td></tr>'
        for i in range(count)
    )
    return f'<div class="code-wrap"><table>{rows}</table></div>'


def make_explained_paragraph(prefix, start, count):
    refs = " ".join(
        f"第 {i} 个证据 <code>{prefix}:{start + i}</code> 说明状态如何进入下一层处理，"
        for i in range(count)
    )
    return (
        "<p>这一段解释源码路径背后的设计取舍、调用关系、失败路径和边界条件，"
        "不是只把文件名和行号堆在一起给读者猜。"
        f"{refs}"
        "这些引用共同支撑本段结论，并说明为什么这里是架构上的关键转折点。</p>"
    )


def make_valid_main(project):
    h3s = "".join(f"<h3>主章节 {i}</h3>" for i in range(10))
    links = (
        f'<a class="deep-link" href="{project}/{project}-a.html">A</a>'
        f'<a class="deep-link" href="{project}/{project}-b.html">B</a>'
    )
    paragraphs = "\n".join(
        make_explained_paragraph("sources/demo/app.py", 100 + i * 10, 9)
        for i in range(6)
    )
    return STYLE + h3s + links + make_code_wrap(10) * 6 + paragraphs


def make_valid_child():
    h3s = "".join(f"<h3>子章节 {i}</h3>" for i in range(3))
    paragraphs = "\n".join(
        make_explained_paragraph("sources/demo/child.py", 200 + i * 10, 7)
        for i in range(3)
    )
    return STYLE + h3s + make_code_wrap(20) * 3 + paragraphs


class QualityGateTest(unittest.TestCase):
    def write_page(self, root, relative, body):
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f"<html><body>{body}</body></html>", encoding="utf-8")

    def write_valid_project(self, root, project="demo"):
        self.write_page(root, "index.html", f'<a href="{project}.html">Demo</a>')
        self.write_page(root, f"{project}.html", make_valid_main(project))
        self.write_page(root, f"{project}/{project}-a.html", make_valid_child())
        self.write_page(root, f"{project}/{project}-b.html", make_valid_child())

    def test_opentag_antipattern_fails(self):
        result = evaluate_project(REPO_ROOT, "opentag")

        self.assertFalse(result.ok)
        self.assertTrue(
            any("讲解密度" in error or "独立讲解段落" in error or "行号堆砌" in error for error in result.errors),
            result.errors,
        )

    def test_all_bare_line_refs_page_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_valid_project(root)
            pile = " · ".join(f"<code>sources/demo/app.py:{100 + i}</code>" for i in range(50))
            bare = STYLE + "".join(f"<h3>主章节 {i}</h3>" for i in range(10))
            bare += '<a class="deep-link" href="demo/demo-a.html">A</a>'
            bare += '<a class="deep-link" href="demo/demo-b.html">B</a>'
            bare += make_code_wrap(10) * 6 + f"<p>{pile}</p>"
            self.write_page(root, "demo.html", bare)

            result = evaluate_project(root, "demo")

            self.assertFalse(result.ok)
            self.assertTrue(any("讲解密度" in error for error in result.errors), result.errors)
            self.assertTrue(any("批量行号堆砌" in error for error in result.errors), result.errors)

    def test_real_explanation_page_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_valid_project(root)

            result = evaluate_project(root, "demo")

            self.assertTrue(result.ok, result.errors)
            self.assertGreaterEqual(result.pages[0].explanation_ratio, 0.70)
            self.assertGreaterEqual(result.pages[0].explanation_paragraphs, 6)


if __name__ == "__main__":
    unittest.main()
