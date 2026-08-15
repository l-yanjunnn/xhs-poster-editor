"""v1.10.2 Code 块长内容换行与 PNG 回归（本地 dev server）。

验证：
1. 编辑区与画布 Code 块都不产生横向溢出；
2. 超长中文、URL/无断点 token 会自动换行，原文的缩进、Tab、空行和手工换行不变；
3. Code 块不进入确定性正文物化器，普通段落/行内 code 不受影响；
4. 公考·山水卷与深夜黑的 2160×3600 PNG 中，右侧最近边界字形和
   自动换行后的下一行字形都真实进图。

用法：
    cd app && ./node_modules/.bin/vite --host 127.0.0.1 --port 5173
    python3 tools/export-race-repro/test_code_block_wrap_local.py [URL]

脚本使用全新 Chromium context，不读写用户日常浏览器的草稿。
PNG 证据只写入 /tmp/xhs-code-block-wrap，不污染仓库。
"""
from __future__ import annotations

import asyncio
import base64
import math
import sys
from pathlib import Path

from PIL import Image
from playwright.async_api import Page, async_playwright


URL = next(
    (argument for argument in sys.argv[1:] if not argument.startswith("--")),
    "http://127.0.0.1:5173/",
)
PUBLIC_ONLY = "--public-only" in sys.argv
SKIP_EXPORT = "--skip-export" in sys.argv
OUT = Path("/tmp/xhs-code-block-wrap")
OUT.mkdir(parents=True, exist_ok=True)

LONG_CHINESE = "超长中文代码块应该在静态海报的版心内自动换行" * 4 + "中文尾标"
LONG_URL = (
    "https://example.com/articles/"
    + "very-long-path-segment-" * 8
    + "?token="
    + "A9b8C7d6E5f4" * 8
    + "&done=URL_END"
)
LONG_TOKEN = "UNBROKEN_TOKEN_" + "ZX90" * 38 + "_TOKEN_END"
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
PARAGRAPH_TEXT = "普通段落回归："
INLINE_CODE_TEXT = "inline_code"

DOCUMENT_WITH_INLINE_CODE = {
    "type": "doc",
    "content": [
        {
            "type": "codeBlock",
            "attrs": {"language": None},
            "content": [{"type": "text", "text": CODE_TEXT}],
        },
        {
            "type": "paragraph",
            "content": [
                {"type": "text", "text": PARAGRAPH_TEXT},
                {
                    "type": "text",
                    "marks": [{"type": "code"}],
                    "text": INLINE_CODE_TEXT,
                },
                {"type": "text", "text": "。"},
            ],
        },
    ],
}

# 行内 code 会进入项目现有的确定性字体预检；当前字体栈首选
# JetBrains Mono 却未内置字面，与本次 pre 换行无关。PNG fixture
# 保留同样的普通段落文本但不加 inline-code mark，不绕过生产门禁。
EXPORT_DOCUMENT = {
    "type": "doc",
    "content": [
        DOCUMENT_WITH_INLINE_CODE["content"][0],
        {
            "type": "paragraph",
            "content": [
                {
                    "type": "text",
                    "text": PARAGRAPH_TEXT + INLINE_CODE_TEXT + "。",
                }
            ],
        },
    ],
}

THEMES = (
    ("公考·山水卷", "public-exam", "dark"),
    ("深夜黑", "dark-night", "light"),
)


async def pick_theme(page: Page, theme: str) -> None:
    group = page.get_by_role("group", name="主题", exact=True).last
    await group.get_by_role("combobox").click()
    await page.get_by_role("option", name=theme, exact=True).click()
    expected_class = {
        "公考·山水卷": "theme-public-exam-landscape",
        "深夜黑": "theme-dark-night",
    }[theme]
    await page.wait_for_function(
        "([className]) => document.querySelector('.page')?.classList.contains(className)",
        arg=[expected_class],
        timeout=15_000,
    )


async def install_fixture(
    page: Page,
    document: dict,
    *,
    expect_inline_code: bool,
    require_sealed: bool,
) -> None:
    await page.evaluate(
        "(doc) => window.__editor.commands.setContent(doc)", document
    )
    try:
        await page.wait_for_function(
            """([codeText, paragraphText, inlineText, expectInlineCode]) => {
              const editorPre = document.querySelector('.tiptap-editor pre')
              const editorParagraph = document.querySelector('.tiptap-editor p')
              const canvasPre = document.querySelector('.page .content pre')
              const paragraph = document.querySelector('.page .content > p')
              const editorInlineText = Array.from(
                editorParagraph?.querySelectorAll('code') ?? [],
                (item) => item.textContent ?? '',
              ).join('')
              const inlineTextInCanvas = Array.from(
                paragraph?.querySelectorAll('code') ?? [],
                (item) => item.textContent ?? '',
              ).join('')
              return document.querySelectorAll('.page').length === 1 &&
                editorPre?.textContent === codeText &&
                canvasPre?.textContent === codeText &&
                paragraph?.textContent === paragraphText + inlineText + '。' &&
                (expectInlineCode
                  ? editorInlineText === inlineText && inlineTextInCanvas === inlineText
                  : editorInlineText === '' && inlineTextInCanvas === '')
            }""",
            arg=[CODE_TEXT, PARAGRAPH_TEXT, INLINE_CODE_TEXT, expect_inline_code],
            timeout=5_000,
        )
    except Exception:
        diagnostics = await page.evaluate(
            """() => {
              const editorPre = document.querySelector('.tiptap-editor pre')
              const canvasPre = document.querySelector('.page .content pre')
              const paragraph = document.querySelector('.page .content > p')
              return {
                editorHtml: window.__editor?.getHTML(),
                editorPreText: editorPre?.textContent,
                canvasPreText: canvasPre?.textContent,
                paragraphHtml: paragraph?.outerHTML,
                pageCount: document.querySelectorAll('.page').length,
                layoutState: document.querySelector('.page')?.dataset.layoutState,
              }
            }"""
        )
        print(f"[DIAG] fixture DOM 未就绪: {diagnostics}", flush=True)
        raise
    if not require_sealed:
        return
    await page.wait_for_function(
        """() => {
          const state = document.querySelector('.page')?.dataset.layoutState
          return state === 'ready' || state === 'ready-with-warnings' ||
            state === 'font-error' || state === 'error'
        }""",
        timeout=30_000,
    )
    layout_state = await page.locator(".page").evaluate(
        """(item) => ({
          state: item.dataset.layoutState,
          phase: item.dataset.layoutSnapshotPhase,
          issues: item.dataset.layoutIssues,
          fontIssues: item.dataset.layoutFontIssues,
        })"""
    )
    assert (
        layout_state["phase"] == "sealed"
        and layout_state["state"] in ("ready", "ready-with-warnings")
    ), f"画布排版未封存：{layout_state}"


async def measure(page: Page, *, expect_inline_code: bool) -> dict:
    return await page.evaluate(
        """([expectedCode, paragraphText, inlineText, expectInlineCode]) => {
          const editorPre = document.querySelector('.tiptap-editor pre')
          const pageElement = document.querySelector('.page')
          const content = pageElement.querySelector('.content')
          const canvasPre = content.querySelector('pre')
          const code = canvasPre.querySelector('code') || canvasPre
          const paragraph = content.querySelector('p')
          const inlineCodes = Array.from(paragraph.querySelectorAll('code'))
          const editorParagraph = document.querySelector('.tiptap-editor p')
          const editorInlineCodes = Array.from(
            editorParagraph?.querySelectorAll('code') ?? [],
          )
          if (!editorPre || !pageElement || !content || !canvasPre ||
              !paragraph ||
              (expectInlineCode &&
               (inlineCodes.length === 0 || editorInlineCodes.length === 0))) {
            throw new Error('回归 fixture DOM 不完整')
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
            }
            sourceIndex += value.length
          }

          const visible = characters.filter((item) => /[0-9A-Za-z\u3400-\u9fff]/u.test(item.character))
          if (visible.length === 0) throw new Error('没有可用的字形探针')

          const lineTops = []
          for (const item of visible.sort((a, b) => a.y - b.y || a.x - b.x)) {
            if (!lineTops.some((top) => Math.abs(top - item.y) < 1.5)) {
              lineTops.push(item.y)
            }
          }
          const secondLineTop = lineTops[1]
          const nextLineProbe = visible.find(
            (item) => Math.abs(item.y - secondLineTop) < 1.5,
          )
          const rightEdgeProbe = visible.reduce(
            (best, item) => item.right > best.right ? item : best,
          )
          const lastProbe = visible.reduce(
            (best, item) => item.y > best.y ||
              (Math.abs(item.y - best.y) < 1.5 && item.right > best.right)
              ? item : best,
          )
          const preStyle = getComputedStyle(canvasPre)
          const preRect = naturalRect(canvasPre.getBoundingClientRect())
          const paragraphRect = naturalRect(paragraph.getBoundingClientRect())
          const contentRect = naturalRect(content.getBoundingClientRect())
          const contentRight = preRect.right - parseFloat(preStyle.paddingRight)

          return {
            editorText: editorPre.textContent,
            canvasText: canvasPre.textContent,
            paragraphText: paragraph.textContent,
            inlineText: inlineCodes.length > 0
              ? inlineCodes.map((item) => item.textContent ?? '').join('')
              : null,
            inlineWhiteSpace: Array.from(new Set(
              inlineCodes.map((item) => getComputedStyle(item).whiteSpace),
            )).sort().join(','),
            editorInlineText: editorInlineCodes.length > 0
              ? editorInlineCodes.map((item) => item.textContent ?? '').join('')
              : null,
            editorInlineWhiteSpace: Array.from(new Set(
              editorInlineCodes.map((item) => getComputedStyle(item).whiteSpace),
            )).sort().join(','),
            editorFits: editorPre.scrollWidth <= editorPre.clientWidth + 1,
            canvasFits: canvasPre.scrollWidth <= canvasPre.clientWidth + 1,
            pageFits: pageElement.scrollWidth <= pageElement.clientWidth + 1,
            preWithinContent: preRect.right <= contentRect.right + 0.5,
            rightEdgeWithinContent: rightEdgeProbe.right <= contentRight + 0.75,
            lowerContentVisible: lastProbe.bottom <= preRect.bottom + 0.75 &&
              preRect.bottom <= contentRect.bottom + 0.75,
            followingParagraphVisible:
              paragraphRect.bottom <= contentRect.bottom + 0.75,
            lineCount: lineTops.length,
            codeWasNotMaterialized:
              !canvasPre.matches('.deterministic-text-layout') &&
              !canvasPre.querySelector('.deterministic-text-layout, .dtl-line, .dtl-atom'),
            paragraphWasMaterialized: paragraph.matches('.deterministic-text-layout'),
            sourceMatches:
              editorPre.textContent === expectedCode &&
              canvasPre.textContent === expectedCode,
            paragraphMatches:
              paragraph.textContent === paragraphText + inlineText + '。',
            preRect,
            rightEdgeProbe,
            nextLineProbe,
            lastProbe,
            snapshot: pageElement.dataset.layoutSnapshot,
          }
        }""",
        [CODE_TEXT, PARAGRAPH_TEXT, INLINE_CODE_TEXT, expect_inline_code],
    )


async def export_png(page: Page) -> tuple[bytes, dict]:
    result = await page.evaluate(
        """async () => {
          const source = document.querySelector('.page')
          const sourceSnapshot = source.dataset.layoutSnapshot
          const canvas = await window.__test.pageToPngCanvas(source, {
            allowWarnings: source.dataset.layoutState === 'ready-with-warnings',
          })
          return {
            width: canvas.width,
            height: canvas.height,
            snapshotMatches: canvas.dataset.layoutSnapshot === sourceSnapshot,
            dataUrl: canvas.toDataURL('image/png'),
          }
        }""",
    )
    encoded = result.pop("dataUrl").split(",", 1)[1]
    return base64.b64decode(encoded), result


def probe_has_ink(image: Image.Image, probe: dict, ink: str) -> tuple[bool, int]:
    """用 DOM 字符 rect 到 2x PNG 中取样。浅底主题找暗色字形，
    深色主题找亮色字形；因此同时验证换行与导出样式真实进图。"""
    x0 = max(0, math.floor(probe["x"] * 2) - 3)
    y0 = max(0, math.floor(probe["y"] * 2) - 3)
    x1 = min(image.width, math.ceil(probe["right"] * 2) + 3)
    y1 = min(image.height, math.ceil(probe["bottom"] * 2) + 3)
    crop = image.crop((x0, y0, x1, y1)).convert("RGB")
    pixels = list(crop.getdata())
    if ink == "dark":
        count = sum(1 for red, green, blue in pixels if max(red, green, blue) < 145)
    else:
        count = sum(1 for red, green, blue in pixels if min(red, green, blue) > 165)
    return count >= 8, count


async def main() -> None:
    console_errors: list[str] = []
    page_errors: list[str] = []
    async with async_playwright() as playwright:
        print("[STAGE] 启动 Chromium", flush=True)
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1000})
        page = await context.new_page()
        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        print(f"[STAGE] 打开 {URL}", flush=True)
        await asyncio.wait_for(
            page.goto(URL, wait_until="domcontentloaded", timeout=60_000),
            timeout=65,
        )
        print("[STAGE] 等待 dev E2E 钩子与画布", flush=True)
        await asyncio.wait_for(
            page.wait_for_function("window.__editor && window.__test", timeout=30_000),
            timeout=35,
        )
        await asyncio.wait_for(
            page.wait_for_selector(".page", timeout=30_000), timeout=35
        )
        themes = THEMES[:1] if PUBLIC_ONLY else THEMES
        for theme, slug, ink in themes:
            print(f"[STAGE] {theme}: 切换主题", flush=True)
            await asyncio.wait_for(pick_theme(page, theme), timeout=15)
            print(f"[STAGE] {theme}: 验证行内 code 未受 pre 规则影响", flush=True)
            await asyncio.wait_for(
                install_fixture(
                    page,
                    DOCUMENT_WITH_INLINE_CODE,
                    expect_inline_code=True,
                    require_sealed=False,
                ),
                timeout=35,
            )
            inline_metrics = await asyncio.wait_for(
                measure(page, expect_inline_code=True), timeout=10
            )
            assert inline_metrics["sourceMatches"], f"{theme}: Code 块 textContent 被改写"
            assert inline_metrics["editorFits"], f"{theme}: 编辑区 Code 块横向溢出"
            assert inline_metrics["canvasFits"], f"{theme}: 画布 Code 块横向溢出"
            assert inline_metrics["codeWasNotMaterialized"], f"{theme}: Code 块误入确定性物化器"
            assert inline_metrics["paragraphMatches"], f"{theme}: 普通段落文本被改写"
            assert inline_metrics["inlineText"] == INLINE_CODE_TEXT, f"{theme}: 行内 code 文本被改写"
            assert inline_metrics["inlineWhiteSpace"] == "pre", (
                f"{theme}: 画布行内 code 的确定性行内空白语义改变："
                f"{inline_metrics['inlineWhiteSpace']!r}"
            )
            assert inline_metrics["editorInlineText"] == INLINE_CODE_TEXT, f"{theme}: 编辑区行内 code 文本被改写"
            assert inline_metrics["editorInlineWhiteSpace"] == "break-spaces", (
                f"{theme}: 编辑区行内 code 误继承 pre-wrap："
                f"{inline_metrics['editorInlineWhiteSpace']!r}"
            )

            print(f"[STAGE] {theme}: 写入导出 fixture 并等待封存", flush=True)
            await asyncio.wait_for(
                install_fixture(
                    page,
                    EXPORT_DOCUMENT,
                    expect_inline_code=False,
                    require_sealed=True,
                ),
                timeout=40,
            )
            print(f"[STAGE] {theme}: 采集导出 DOM 几何", flush=True)
            metrics = await asyncio.wait_for(
                measure(page, expect_inline_code=False), timeout=10
            )

            assert metrics["sourceMatches"], f"{theme}: Code 块 textContent 被改写"
            assert metrics["editorFits"], f"{theme}: 编辑区 Code 块横向溢出"
            assert metrics["canvasFits"], f"{theme}: 画布 Code 块横向溢出"
            assert metrics["pageFits"], f"{theme}: 页面产生横向溢出"
            assert metrics["preWithinContent"], f"{theme}: Code 块超出内容区"
            assert metrics["rightEdgeWithinContent"], f"{theme}: 最右字形超出 Code 内边界"
            assert metrics["lowerContentVisible"], f"{theme}: 换行后下半部被纵向裁切"
            assert metrics["followingParagraphVisible"], (
                f"{theme}: Code 块后的普通段落超出内容区"
            )
            assert metrics["lineCount"] > CODE_TEXT.count("\n") + 1, (
                f"{theme}: 未观测到自动换行，lines={metrics['lineCount']}"
            )
            assert metrics["codeWasNotMaterialized"], f"{theme}: Code 块误入确定性物化器"
            assert metrics["paragraphWasMaterialized"], f"{theme}: 普通段落确定性排版回归"
            assert metrics["paragraphMatches"], f"{theme}: 普通段落文本被改写"

            if SKIP_EXPORT:
                print(
                    f"[PASS] {theme}: 导出前 DOM/换行几何/封存门禁通过",
                    flush=True,
                )
                continue

            print(f"[STAGE] {theme}: 生成 2160×3600 PNG", flush=True)
            png, export = await asyncio.wait_for(export_png(page), timeout=60)
            print(f"[STAGE] {theme}: PNG 生成完成", flush=True)
            assert (export["width"], export["height"]) == (2160, 3600), export
            assert export["snapshotMatches"], f"{theme}: PNG 与预览快照不一致"
            output_path = OUT / f"code-wrap-{slug}.png"
            output_path.write_bytes(png)
            image = Image.open(output_path).convert("RGB")

            right_ok, right_count = probe_has_ink(
                image, metrics["rightEdgeProbe"], ink
            )
            next_ok, next_count = probe_has_ink(
                image, metrics["nextLineProbe"], ink
            )
            last_ok, last_count = probe_has_ink(image, metrics["lastProbe"], ink)
            assert right_ok, f"{theme}: PNG 右边界字形未进图（pixels={right_count}）"
            assert next_ok, f"{theme}: PNG 自动换行的第二行未进图（pixels={next_count}）"
            assert last_ok, f"{theme}: PNG 下半部文字未进图（pixels={last_count}）"

            print(
                f"[PASS] {theme}: {metrics['lineCount']} 个可见行，"
                f"右边界/第二行/末行像素="
                f"{right_count}/{next_count}/{last_count}，PNG={output_path}"
                , flush=True
            )

        await browser.close()

    assert not page_errors, f"page errors: {page_errors}"
    assert not console_errors, f"console errors: {console_errors}"
    if SKIP_EXPORT:
        scope = "导出前 DOM/几何回归"
    elif PUBLIC_ONLY:
        scope = "公考主题 PNG 回归"
    else:
        scope = "双主题 PNG 回归"
    print(f"[PASS] Code 块静态换行、文本保真与{scope}全部通过")


asyncio.run(main())
