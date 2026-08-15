"""v1.10.2 Code 块生产兼容回归：真实导入、主题切换与 ZIP 下载。

脚本只使用用户可见 UI、生产 DOM 和浏览器 download 事件，不使用开发期
全局钩子。每个主题使用全新的 Chromium context，不读写用户日常浏览器数据。

覆盖：
1. 通过“导入文稿 → 粘贴全文”真实 UI 导入 fenced Code 块；
2. 长中文、URL、无断点 token 自动换行，Tab、空行与手工换行逐字保真；
3. 编辑区和成品画布没有横向溢出，Code 块后的普通段落仍在安全区；
4. 公考·山水卷、深夜黑都通过真实导出弹窗下载兼容 ZIP；
5. ZIP 内 PNG 为 2160×3600，且右边界、自动换行第二行和末行探针都有字形。

用法：
    python3 tools/export-race-repro/test_code_block_wrap_prod.py \
      [URL] --expected-version v1.10.2 --out /tmp/xhs-code-block-wrap-prod

默认 URL 为 Cloudflare Workers 生产入口；URL host 为 workers.dev 时自动使用
http://127.0.0.1:7897 代理，其他入口（含本地 production preview）直连。
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import io
import json
import math
import os
import re
import sys
import traceback
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Optional
from urllib.parse import urlparse

from PIL import Image
from playwright.async_api import Browser, BrowserContext, Page, async_playwright, expect


DEFAULT_URL = "https://xhs-poster-editor.l-yanjunnn.workers.dev/"
DEFAULT_VERSION = "v1.10.2"
WORKERS_PROXY = "http://127.0.0.1:7897"
CANVAS_SIZE = (2160, 3600)
EXPORT_SCALE = 2
PARAGRAPH_TEXT = "普通段落回归：Code 块后的正文仍应完整显示。"

LONG_CHINESE = "超长中文代码块应该在静态海报的版心内自动换行" * 2 + "中文尾标"
LONG_URL = (
    "https://example.com/articles/"
    + "very-long-path-segment-" * 4
    + "?token="
    + "A9b8C7d6E5f4" * 8
    + "&done=URL_END"
)
LONG_TOKEN = "UNBROKEN_TOKEN_" + "ZX90" * 20 + "_TOKEN_END"
CODE_TEXT = (
    f"{LONG_CHINESE}\n"
    f"{LONG_URL}\n"
    "\n"
    "\tif (ready) {\n"
    f"        const token = \"{LONG_TOKEN}\";\n"
    "\t\treturn token;\n"
    "    }\n"
    "MANUAL_LINE_END"
)
MARKDOWN_FIXTURE = f"```text\n{CODE_TEXT}\n```\n\n{PARAGRAPH_TEXT}\n"

THEMES = (
    {
        "name": "公考·山水卷",
        "id": "builtin-public-exam-landscape",
        "class": "theme-public-exam-landscape",
        "slug": "public-exam",
        "ink": "dark",
    },
    {
        "name": "深夜黑",
        "id": "builtin-dark-night",
        "class": "theme-dark-night",
        "slug": "dark-night",
        "ink": "light",
    },
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="v1.10.2 Code 块真实导入与双主题 PNG 生产回归",
    )
    parser.add_argument(
        "url",
        nargs="?",
        default=os.environ.get("URL", DEFAULT_URL),
        help=f"本地 preview 或生产 URL（默认 {DEFAULT_URL}）",
    )
    parser.add_argument(
        "--expected-version",
        default=os.environ.get("EXPECTED_VERSION", DEFAULT_VERSION),
        help=f"顶栏应显示的版本（默认 {DEFAULT_VERSION}）",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("/tmp/xhs-code-block-wrap-prod"),
        help="ZIP、PNG、preview、失败截图和 result.json 的根目录",
    )
    return parser.parse_args()


def log(message: str) -> None:
    print(f"[v1.10.2 code-wrap prod] {message}", flush=True)


def proxy_for_url(url: str) -> Optional[str]:
    hostname = (urlparse(url).hostname or "").lower()
    if hostname == "workers.dev" or hostname.endswith(".workers.dev"):
        return WORKERS_PROXY
    return None


def assert_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: 实际 {actual!r}，期望 {expected!r}")


async def wait_for_app(page: Page, url: str, expected_version: str) -> None:
    log(f"打开 {url}")
    await page.goto(url, wait_until="domcontentloaded", timeout=120_000)
    await page.locator(".page-preview-group").first.wait_for(timeout=60_000)
    await page.locator(".workspace-blocking-layer").wait_for(
        state="detached",
        timeout=60_000,
    )
    version = ((await page.locator(".topbar-version").text_content()) or "").strip()
    assert_equal(version, expected_version, "顶栏版本")


async def import_code_fixture(page: Page) -> None:
    log("通过导入文稿 UI 粘贴并生成 Code 块草稿")
    await page.get_by_role("button", name="导入文稿", exact=True).click()
    dialog = page.get_by_role("dialog")
    await dialog.get_by_role("heading", name="导入文稿", exact=True).wait_for()
    await dialog.get_by_role("tab", name="粘贴全文", exact=True).click()

    source = dialog.get_by_role("textbox", name="粘贴整篇文稿", exact=True)
    await source.fill(MARKDOWN_FIXTURE)
    assert_equal(await source.input_value(), MARKDOWN_FIXTURE, "导入 textarea 原文")
    await dialog.get_by_role("button", name="解析并预览", exact=True).click()

    await dialog.get_by_role("heading", name="确认解析结果", exact=True).wait_for(
        timeout=30_000,
    )
    await dialog.get_by_text("普通 Markdown / 纯文本", exact=True).wait_for()
    await dialog.locator("span").filter(
        has_text=re.compile(r"^可作为一篇普通图文发布$"),
    ).first.wait_for()
    await dialog.get_by_text("全部位于同一新草稿", exact=True).wait_for()
    await expect(dialog.locator('[title^="第 1 页："]')).to_have_count(1)

    await dialog.get_by_role("button", name="生成到新草稿", exact=True).click()
    await dialog.wait_for(state="hidden", timeout=60_000)
    await expect(page.locator(".page-preview-group")).to_have_count(
        1,
        timeout=60_000,
    )
    await page.wait_for_function(
        """([expectedCode, expectedParagraph]) => {
          const editorPre = document.querySelector(
            '.tiptap-editor .ProseMirror pre',
          )
          const canvasPre = document.querySelector(
            '.page-preview-group .page .content pre',
          )
          const paragraph = document.querySelector(
            '.page-preview-group .page .content > p',
          )
          return editorPre?.textContent === expectedCode &&
            canvasPre?.textContent === expectedCode &&
            paragraph?.textContent === expectedParagraph
        }""",
        arg=[CODE_TEXT, PARAGRAPH_TEXT],
        timeout=60_000,
    )


async def apply_theme(page: Page, theme: dict[str, str]) -> None:
    log(f"应用主题：{theme['name']}")
    await page.get_by_role("button", name="主题库", exact=True).click()
    dialog = page.get_by_role("dialog")
    await dialog.get_by_role("heading", name="主题", exact=True).wait_for()
    card = dialog.locator(f"[data-theme-id=\"{theme['id']}\"]")
    await expect(card).to_have_count(1)
    apply_button = card.get_by_role("button", name="应用", exact=True)
    if await apply_button.count() == 1:
        await apply_button.click()
    else:
        await card.get_by_role("button", name="已应用", exact=True).click()
    await dialog.wait_for(state="hidden", timeout=30_000)
    await page.wait_for_function(
        """([expectedClass, expectedCode]) => {
          const page = document.querySelector('.page-preview-group .page')
          const pre = page?.querySelector('.content pre')
          return page?.classList.contains(expectedClass) &&
            pre?.textContent === expectedCode
        }""",
        arg=[theme["class"], CODE_TEXT],
        timeout=60_000,
    )


async def wait_for_sealed_layout(page: Page, theme_name: str) -> dict[str, Any]:
    await page.wait_for_function(
        """() => {
          const pages = [...document.querySelectorAll(
            '.page-preview-group .page',
          )]
          if (pages.length !== 1) return false
          const terminal = new Set([
            'ready', 'ready-with-warnings', 'font-error', 'error',
          ])
          return pages.every((item) => terminal.has(item.dataset.layoutState))
        }""",
        timeout=90_000,
    )
    state = await page.locator(".page-preview-group .page").evaluate(
        """(item) => ({
          state: item.dataset.layoutState ?? '',
          phase: item.dataset.layoutSnapshotPhase ?? '',
          snapshot: item.dataset.layoutSnapshot ?? '',
          issues: item.dataset.layoutIssues ?? '',
          fontIssues: item.dataset.layoutFontIssues ?? '',
        })""",
    )
    if state["state"] not in ("ready", "ready-with-warnings"):
        raise AssertionError(f"{theme_name}: 画布进入失败态：{state}")
    assert_equal(state["phase"], "sealed", f"{theme_name}: 排版快照 phase")
    if not state["snapshot"]:
        raise AssertionError(f"{theme_name}: 缺少 sealed snapshot ID")
    return state


async def capture_geometry(page: Page) -> dict[str, Any]:
    return await page.evaluate(
        """([expectedCode, expectedParagraph]) => {
          const editorRoot = document.querySelector(
            '.tiptap-editor .ProseMirror',
          )
          const editorPre = editorRoot?.querySelector('pre')
          const pageElement = document.querySelector(
            '.page-preview-group .page',
          )
          const content = pageElement?.querySelector('.content')
          const canvasPre = content?.querySelector('pre')
          const code = canvasPre?.querySelector('code') || canvasPre
          const paragraph = content?.querySelector(':scope > p')
          if (!editorRoot || !editorPre || !pageElement || !content ||
              !canvasPre || !code || !paragraph) {
            throw new Error('Code 块生产回归 fixture DOM 不完整')
          }

          const pageRect = pageElement.getBoundingClientRect()
          const scale = pageRect.width / 1080
          const naturalRect = (rect) => ({
            x: (rect.left - pageRect.left) / scale,
            y: (rect.top - pageRect.top) / scale,
            width: rect.width / scale,
            height: rect.height / scale,
            right: (rect.right - pageRect.left) / scale,
            bottom: (rect.bottom - pageRect.top) / scale,
          })

          const characters = []
          const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT)
          let sourceIndex = 0
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const value = node.nodeValue || ''
            for (let offset = 0; offset < value.length; offset += 1) {
              const range = document.createRange()
              range.setStart(node, offset)
              range.setEnd(node, offset + 1)
              const rect = range.getBoundingClientRect()
              if (rect.width > 0 && rect.height > 0) {
                characters.push({
                  index: sourceIndex + offset,
                  character: value[offset],
                  ...naturalRect(rect),
                })
              }
              range.detach()
            }
            sourceIndex += value.length
          }

          const visible = characters.filter((item) =>
            /[0-9A-Za-z\u3400-\u9fff]/u.test(item.character),
          )
          if (visible.length === 0) throw new Error('没有可用的字形探针')
          visible.sort((a, b) => a.y - b.y || a.x - b.x)

          const lineTops = []
          for (const item of visible) {
            if (!lineTops.some((top) => Math.abs(top - item.y) < 1.5)) {
              lineTops.push(item.y)
            }
          }
          const nextLineProbe = visible.find(
            (item) => Math.abs(item.y - lineTops[1]) < 1.5,
          )
          const rightEdgeProbe = visible.reduce(
            (best, item) => item.right > best.right ? item : best,
          )
          const lastProbe = visible.reduce(
            (best, item) => item.y > best.y ||
              (Math.abs(item.y - best.y) < 1.5 && item.right > best.right)
              ? item : best,
          )

          const editorRootRect = editorRoot.getBoundingClientRect()
          const editorPreRect = editorPre.getBoundingClientRect()
          const preStyle = getComputedStyle(canvasPre)
          const editorPreStyle = getComputedStyle(editorPre)
          const preRect = naturalRect(canvasPre.getBoundingClientRect())
          const paragraphRect = naturalRect(paragraph.getBoundingClientRect())
          const contentRect = naturalRect(content.getBoundingClientRect())
          const contentRight = preRect.right -
            Number.parseFloat(preStyle.paddingRight)

          return {
            editorText: editorPre.textContent,
            canvasText: canvasPre.textContent,
            paragraphText: paragraph.textContent,
            sourceMatches: editorPre.textContent === expectedCode &&
              canvasPre.textContent === expectedCode,
            paragraphMatches: paragraph.textContent === expectedParagraph,
            newlineCount: (canvasPre.textContent.match(/\\n/g) || []).length,
            blankLinePreserved: canvasPre.textContent.includes('\\n\\n'),
            tabCount: (canvasPre.textContent.match(/\\t/g) || []).length,
            manualEndPreserved: canvasPre.textContent.endsWith(
              'MANUAL_LINE_END',
            ),
            editorFits: editorPre.scrollWidth <= editorPre.clientWidth + 1,
            editorWithinRoot: editorPreRect.left >= editorRootRect.left - 1 &&
              editorPreRect.right <= editorRootRect.right + 1,
            canvasFits: canvasPre.scrollWidth <= canvasPre.clientWidth + 1,
            pageFits: pageElement.scrollWidth <= pageElement.clientWidth + 1,
            preWithinContent: preRect.x >= contentRect.x - 0.5 &&
              preRect.right <= contentRect.right + 0.5,
            rightEdgeWithinContent: rightEdgeProbe.right <= contentRight + 0.75,
            lowerContentVisible: lastProbe.bottom <= preRect.bottom + 0.75 &&
              preRect.bottom <= contentRect.bottom + 0.75,
            followingParagraphVisible:
              paragraphRect.bottom <= contentRect.bottom + 0.75,
            overflowWarningVisible: Boolean(
              pageElement.closest('.page-preview-group')?.querySelector(
                '.canvas-overflow-warning',
              ),
            ),
            lineCount: lineTops.length,
            codeWasNotMaterialized:
              !canvasPre.matches('.deterministic-text-layout') &&
              !canvasPre.querySelector(
                '.deterministic-text-layout, .dtl-line, .dtl-atom',
              ),
            whiteSpace: preStyle.whiteSpace,
            overflowWrap: preStyle.overflowWrap,
            wordBreak: preStyle.wordBreak,
            editorWhiteSpace: editorPreStyle.whiteSpace,
            editorOverflowWrap: editorPreStyle.overflowWrap,
            editorWordBreak: editorPreStyle.wordBreak,
            preRect,
            contentRect,
            rightEdgeProbe,
            nextLineProbe,
            lastProbe,
          }
        }""",
        [CODE_TEXT, PARAGRAPH_TEXT],
    )


def assert_geometry(theme_name: str, metrics: dict[str, Any]) -> None:
    assert metrics["sourceMatches"], f"{theme_name}: Code 块 textContent 被改写"
    assert metrics["paragraphMatches"], f"{theme_name}: 后续段落文本被改写"
    assert_equal(metrics["newlineCount"], CODE_TEXT.count("\n"), f"{theme_name}: 换行数")
    assert metrics["blankLinePreserved"], f"{theme_name}: Code 块空行丢失"
    assert_equal(metrics["tabCount"], CODE_TEXT.count("\t"), f"{theme_name}: Tab 数")
    assert metrics["manualEndPreserved"], f"{theme_name}: 手工末行丢失"
    assert metrics["editorFits"], f"{theme_name}: 编辑区 Code 块横向溢出"
    assert metrics["editorWithinRoot"], f"{theme_name}: 编辑区 Code 块越出编辑器"
    assert metrics["canvasFits"], f"{theme_name}: 画布 Code 块横向溢出"
    assert metrics["pageFits"], f"{theme_name}: 页面产生横向溢出"
    assert metrics["preWithinContent"], f"{theme_name}: Code 块越出版心"
    assert metrics["rightEdgeWithinContent"], f"{theme_name}: 最右字形越出内边界"
    assert metrics["lowerContentVisible"], f"{theme_name}: Code 块下半部纵向裁切"
    assert metrics["followingParagraphVisible"], f"{theme_name}: 后续段落越出版心"
    assert not metrics["overflowWarningVisible"], f"{theme_name}: fixture 超出安全区"
    assert metrics["lineCount"] > CODE_TEXT.count("\n") + 1, (
        f"{theme_name}: 未观测到自动换行，lines={metrics['lineCount']}"
    )
    assert metrics["codeWasNotMaterialized"], f"{theme_name}: Code 块误入正文物化器"
    assert_equal(metrics["whiteSpace"], "pre-wrap", f"{theme_name}: 画布 white-space")
    assert_equal(metrics["overflowWrap"], "anywhere", f"{theme_name}: 画布 overflow-wrap")
    assert_equal(metrics["wordBreak"], "normal", f"{theme_name}: 画布 word-break")
    assert_equal(metrics["editorWhiteSpace"], "pre-wrap", f"{theme_name}: 编辑区 white-space")
    assert_equal(metrics["editorOverflowWrap"], "anywhere", f"{theme_name}: 编辑区 overflow-wrap")
    assert_equal(metrics["editorWordBreak"], "normal", f"{theme_name}: 编辑区 word-break")
    if not metrics["nextLineProbe"]:
        raise AssertionError(f"{theme_name}: 缺少自动换行第二行探针")


async def download_export_zip(
    page: Page,
    run_dir: Path,
    theme: dict[str, str],
) -> tuple[Path, str]:
    log(f"{theme['name']}: 通过真实导出 Dialog 下载兼容 ZIP")
    export_button = page.get_by_role("button", name="导出 PNG", exact=True)
    await expect(export_button).to_be_enabled(timeout=60_000)
    await export_button.click()
    dialog = page.get_by_role("dialog")
    await dialog.get_by_role("heading", name="导出 PNG", exact=True).wait_for()

    zip_choice = dialog.locator("button").filter(has_text=re.compile(r"兼容 ZIP"))
    await expect(zip_choice).to_have_count(1)
    await zip_choice.click()
    assert_equal(await zip_choice.get_attribute("aria-pressed"), "true", "兼容 ZIP 选中态")

    topic = f"v1102-code-wrap-{theme['slug']}"
    zip_name = f"{topic}.zip"
    await dialog.get_by_label("文档主题", exact=True).fill(topic)
    await dialog.get_by_label("ZIP 默认名称", exact=True).fill(zip_name)

    async with page.expect_download(timeout=180_000) as download_info:
        await dialog.get_by_role(
            "button",
            name="导出全部 1 张",
            exact=True,
        ).click()
    download = await download_info.value
    failure = await download.failure()
    if failure:
        raise AssertionError(f"{theme['name']}: 浏览器下载失败：{failure}")
    assert_equal(download.suggested_filename, zip_name, f"{theme['name']}: ZIP 文件名")
    zip_path = run_dir / zip_name
    await download.save_as(zip_path)
    await dialog.wait_for(state="hidden", timeout=30_000)
    return zip_path, topic


def validate_zip(
    zip_path: Path,
    topic: str,
    run_dir: Path,
    theme: dict[str, str],
) -> tuple[bytes, dict[str, Any], Path]:
    with zipfile.ZipFile(zip_path) as archive:
        infos = [item for item in archive.infolist() if not item.is_dir()]
        paths = [PurePosixPath(item.filename) for item in infos]
        if any(path.is_absolute() or ".." in path.parts for path in paths):
            raise AssertionError(f"{theme['name']}: ZIP 含非法路径")
        roots = {path.parts[0] for path in paths if path.parts}
        assert_equal(len(roots), 1, f"{theme['name']}: ZIP 顶层目录数")

        png_paths = [path for path in paths if path.suffix.lower() == ".png"]
        assert_equal(len(png_paths), 1, f"{theme['name']}: PNG 数量")
        expected_png_name = f"01_{topic}_cover.png"
        assert_equal(png_paths[0].name, expected_png_name, f"{theme['name']}: PNG 文件名")
        png_data = archive.read(png_paths[0].as_posix())

        manifest_paths = [path for path in paths if path.name == "导出清单.json"]
        assert_equal(len(manifest_paths), 1, f"{theme['name']}: 导出清单数量")
        manifest = json.loads(
            archive.read(manifest_paths[0].as_posix()).decode("utf-8"),
        )
        assert_equal(manifest.get("documentTopic"), topic, f"{theme['name']}: manifest topic")
        assert_equal(manifest.get("sourcePageCount"), 1, f"{theme['name']}: sourcePageCount")
        assert_equal(manifest.get("exportedPageCount"), 1, f"{theme['name']}: exportedPageCount")
        assert_equal(manifest.get("sourcePages"), [1], f"{theme['name']}: sourcePages")
        assert_equal(
            manifest.get("deliveryMode"),
            "compatibility-zip",
            f"{theme['name']}: deliveryMode",
        )
        files = manifest.get("files")
        if not isinstance(files, list) or len(files) != 1:
            raise AssertionError(f"{theme['name']}: manifest.files 非单页：{files!r}")
        assert_equal(files[0].get("fileName"), expected_png_name, f"{theme['name']}: manifest file")

    png_path = run_dir / f"code-wrap-{theme['slug']}.png"
    png_path.write_bytes(png_data)
    return png_data, manifest, png_path


def probe_has_ink(image: Image.Image, probe: dict[str, Any], ink: str) -> int:
    x0 = max(0, math.floor(probe["x"] * EXPORT_SCALE) - 3)
    y0 = max(0, math.floor(probe["y"] * EXPORT_SCALE) - 3)
    x1 = min(image.width, math.ceil(probe["right"] * EXPORT_SCALE) + 3)
    y1 = min(image.height, math.ceil(probe["bottom"] * EXPORT_SCALE) + 3)
    if x1 <= x0 or y1 <= y0:
        raise AssertionError(f"无效 PNG 字形探针：{probe}")
    pixels = list(image.crop((x0, y0, x1, y1)).convert("RGB").getdata())
    if ink == "dark":
        return sum(1 for red, green, blue in pixels if max(red, green, blue) < 145)
    return sum(1 for red, green, blue in pixels if min(red, green, blue) > 165)


def assert_png(
    png_data: bytes,
    theme: dict[str, str],
    metrics: dict[str, Any],
) -> dict[str, Any]:
    image = Image.open(io.BytesIO(png_data)).convert("RGBA")
    assert_equal(image.size, CANVAS_SIZE, f"{theme['name']}: PNG 尺寸")
    for point in ((5, 5), (image.width - 6, 5), (5, image.height - 6), (image.width - 6, image.height - 6)):
        assert_equal(image.getpixel(point)[3], 255, f"{theme['name']}: PNG alpha {point}")

    background = image.convert("RGB").getpixel((5, 5))
    if theme["slug"] == "public-exam":
        red, green, blue = background
        if not (235 <= red <= 255 and 220 <= green <= 252 and 210 <= blue <= 245 and red > blue):
            raise AssertionError(f"公考主题背景像素异常：{background}")
    else:
        if max(background) > 30:
            raise AssertionError(f"深夜黑主题背景像素异常：{background}")

    counts = {
        "rightEdge": probe_has_ink(image, metrics["rightEdgeProbe"], theme["ink"]),
        "wrappedSecondLine": probe_has_ink(image, metrics["nextLineProbe"], theme["ink"]),
        "lastLine": probe_has_ink(image, metrics["lastProbe"], theme["ink"]),
    }
    for label, count in counts.items():
        if count < 8:
            raise AssertionError(f"{theme['name']}: PNG {label} 字形不足（pixels={count}）")
    return {"size": list(image.size), "background": list(background), "inkPixels": counts}


async def run_theme_case(
    browser: Browser,
    *,
    url: str,
    expected_version: str,
    run_dir: Path,
    theme: dict[str, str],
) -> dict[str, Any]:
    context: BrowserContext = await browser.new_context(
        viewport={"width": 1536, "height": 1024},
        accept_downloads=True,
    )
    await context.add_init_script(
        """
        Object.defineProperty(window, 'showSaveFilePicker', {
          configurable: true,
          writable: true,
          value: undefined,
        })
        Object.defineProperty(window, 'showDirectoryPicker', {
          configurable: true,
          writable: true,
          value: undefined,
        })
        """,
    )
    page = await context.new_page()
    page.set_default_timeout(30_000)
    console_errors: list[str] = []
    page_errors: list[str] = []
    page.on(
        "console",
        lambda message: console_errors.append(message.text)
        if message.type == "error"
        else None,
    )
    page.on("pageerror", lambda error: page_errors.append(str(error)))

    try:
        await wait_for_app(page, url, expected_version)
        await import_code_fixture(page)
        await apply_theme(page, theme)
        state = await wait_for_sealed_layout(page, theme["name"])
        metrics = await capture_geometry(page)
        log(
            f"{theme['name']} 几何："
            + json.dumps(
                {
                    "preRect": metrics["preRect"],
                    "contentRect": metrics["contentRect"],
                    "rightEdgeProbe": metrics["rightEdgeProbe"],
                    "canvasFits": metrics["canvasFits"],
                    "pageFits": metrics["pageFits"],
                },
                ensure_ascii=False,
            )
        )
        assert_geometry(theme["name"], metrics)

        preview_path = run_dir / f"code-wrap-{theme['slug']}-preview.png"
        await page.locator(".page-preview-group .page").screenshot(path=preview_path)
        zip_path, topic = await asyncio.wait_for(
            download_export_zip(page, run_dir, theme),
            timeout=200,
        )
        png_data, manifest, png_path = validate_zip(
            zip_path,
            topic,
            run_dir,
            theme,
        )
        png_evidence = assert_png(png_data, theme, metrics)

        if console_errors or page_errors:
            raise AssertionError(
                "页面运行期出现错误："
                + json.dumps(
                    {"consoleErrors": console_errors, "pageErrors": page_errors},
                    ensure_ascii=False,
                )
            )

        log(
            f"{theme['name']} 通过：{metrics['lineCount']} 个可见行，"
            f"PNG 探针={png_evidence['inkPixels']}，产物={png_path}",
        )
        return {
            "theme": theme["name"],
            "layoutState": state,
            "lineCount": metrics["lineCount"],
            "newlineCount": metrics["newlineCount"],
            "tabCount": metrics["tabCount"],
            "styles": {
                "whiteSpace": metrics["whiteSpace"],
                "overflowWrap": metrics["overflowWrap"],
                "wordBreak": metrics["wordBreak"],
            },
            "preview": str(preview_path),
            "zip": str(zip_path),
            "png": str(png_path),
            "pngSha256": hashlib.sha256(png_data).hexdigest(),
            "pngEvidence": png_evidence,
            "manifestFolder": manifest.get("folderName"),
            "consoleErrors": console_errors,
            "pageErrors": page_errors,
        }
    except Exception:
        try:
            failure_path = run_dir / f"failure-{theme['slug']}.png"
            await asyncio.wait_for(page.screenshot(path=failure_path), timeout=15)
            log(f"{theme['name']} 失败截图：{failure_path}")
        except Exception as screenshot_error:
            log(f"{theme['name']} 失败截图也未能保存：{screenshot_error}")
        raise
    finally:
        if console_errors:
            log(f"{theme['name']} console errors:\n  " + "\n  ".join(console_errors))
        if page_errors:
            log(f"{theme['name']} page errors:\n  " + "\n  ".join(page_errors))
        await context.close()


async def async_main(
    args: argparse.Namespace,
    run_dir: Path,
    proxy: Optional[str],
) -> dict[str, Any]:
    async with async_playwright() as playwright:
        launch_options: dict[str, Any] = {"headless": True}
        if proxy:
            launch_options["proxy"] = {"server": proxy}
        else:
            launch_options["args"] = ["--no-proxy-server"]
        browser = await playwright.chromium.launch(**launch_options)
        results: list[dict[str, Any]] = []
        try:
            for theme in THEMES:
                result = await asyncio.wait_for(
                    run_theme_case(
                        browser,
                        url=args.url,
                        expected_version=args.expected_version,
                        run_dir=run_dir,
                        theme=theme,
                    ),
                    timeout=300,
                )
                results.append(result)
        finally:
            await browser.close()
    return {
        "url": args.url,
        "expectedVersion": args.expected_version,
        "proxy": proxy,
        "fixture": {
            "codeLength": len(CODE_TEXT),
            "newlineCount": CODE_TEXT.count("\n"),
            "tabCount": CODE_TEXT.count("\t"),
            "hasBlankLine": "\n\n" in CODE_TEXT,
            "manualLineEnd": CODE_TEXT.endswith("MANUAL_LINE_END"),
        },
        "themes": results,
    }


def main() -> int:
    args = parse_args()
    proxy = proxy_for_url(args.url)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run_dir = args.out.expanduser().resolve() / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    log(f"目标：{args.url}；期望版本：{args.expected_version}")
    log(f"代理：{proxy or '直连'}；产物目录：{run_dir}")
    try:
        result = asyncio.run(async_main(args, run_dir, proxy))
    except Exception as error:
        log(f"失败：{error}")
        traceback.print_exc()
        log(f"诊断产物：{run_dir}")
        return 1

    result_path = run_dir / "result.json"
    result_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    log(f"全部通过；结果：{result_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
