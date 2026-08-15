"""v1.10.2 Enter→分页跨页续排回归（本地 dev server）。

验证真实用户路径和同一份封存几何：
1. 正文中部真实按 Enter，再点击工具栏“插入分页”；
2. 编辑区只把 continuation 分页前的正文末行设为 justify；
3. 公考 1080×1800 画布的续段末行铺满，真正段尾保持自然末行；
4. 2160×3600 PNG 复用预览 snapshot/行几何，并产出稳定可核对的哈希；
5. 切到旧主题“极简白”后，真正段尾仍不会被拉满。

用法：
    cd app && ./node_modules/.bin/vite --host 127.0.0.1 --port 5173
    python3 tools/export-race-repro/test_continuation_local.py [URL]

脚本使用全新 Chromium context，不读取用户日常浏览器草稿。
证据只写入 /tmp/xhs-page-break-continuation，不污染仓库。
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import math
import sys
from pathlib import Path

from PIL import Image
from playwright.async_api import Page, async_playwright


URL = next(
    (argument for argument in sys.argv[1:] if not argument.startswith("--")),
    "http://127.0.0.1:5173/",
)
OUT = Path("/tmp/xhs-page-break-continuation")
OUT.mkdir(parents=True, exist_ok=True)

LEFT_UNIT = "跨页续排需要让上一页末行沿着版心自然铺满同时保持字距稳定"
RIGHT_UNIT = "正文内容继续写在下一页并以真正段落的自然末行结束用于对照验证"
LEFT_TEXT = LEFT_UNIT * 3
RIGHT_TEXT = RIGHT_UNIT * 2 + "真段尾。"
FULL_TEXT = LEFT_TEXT + RIGHT_TEXT
CONTROL_TEXT = "第三页用于确认原有分页仍是真正段落边界。"

DOCUMENT = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [{"type": "text", "text": FULL_TEXT}],
        },
        {
            "type": "horizontalRule",
            "attrs": {"continuation": False},
        },
        {
            "type": "paragraph",
            "content": [{"type": "text", "text": CONTROL_TEXT}],
        },
    ],
}


async def pick_theme(page: Page, theme: str, expected_class: str) -> None:
    group = page.get_by_role("group", name="主题", exact=True).last
    await group.get_by_role("combobox").click()
    await page.get_by_role("option", name=theme, exact=True).click()
    await page.wait_for_function(
        "([className]) => document.querySelector('.page')?.classList.contains(className)",
        arg=[expected_class],
        timeout=15_000,
    )


async def wait_for_sealed_pages(page: Page, expected_count: int) -> None:
    await page.wait_for_function(
        """([count]) => {
          const pages = Array.from(document.querySelectorAll('.page'))
          return pages.length === count && pages.every((item) =>
            item.dataset.layoutSnapshotPhase === 'sealed' &&
            item.dataset.layoutState === 'ready' &&
            Number(item.dataset.layoutIssueCount ?? '0') === 0 &&
            Boolean(item.dataset.layoutSnapshot)
          )
        }""",
        arg=[expected_count],
        timeout=45_000,
    )


async def install_fixture_and_run_user_path(page: Page) -> None:
    await page.evaluate(
        "(doc) => window.__editor.commands.setContent(doc)", DOCUMENT
    )
    await page.wait_for_function(
        """([text, control]) => {
          const json = window.__editor.getJSON()
          return json.content?.length === 3 &&
            window.__editor.state.doc.firstChild?.textContent === text &&
            window.__editor.state.doc.lastChild?.textContent === control &&
            document.querySelectorAll('.page').length === 2
        }""",
        arg=[FULL_TEXT, CONTROL_TEXT],
        timeout=15_000,
    )

    cursor = await page.evaluate(
        """([fullText, leftLength]) => {
          const editor = window.__editor
          let position = -1
          editor.state.doc.descendants((node, pos) => {
            if (position >= 0 || !node.isText || node.text !== fullText) return true
            position = pos + leftLength
            return false
          })
          if (position < 0) throw new Error('找不到跨页长段落')
          editor.commands.setTextSelection(position)
          editor.commands.focus()
          return { position }
        }""",
        arg=[FULL_TEXT, len(LEFT_TEXT)],
    )
    assert cursor["position"] > 0, cursor
    await page.wait_for_function(
        "document.activeElement === window.__editor.view.dom", timeout=5_000
    )

    # 必须是真实键盘事件；直接调用 splitBlock 无法证明 Enter provenance。
    await page.keyboard.press("Enter")
    await page.wait_for_function(
        """() => {
          const types = window.__editor.getJSON().content?.map((node) => node.type)
          return JSON.stringify(types) === JSON.stringify([
            'paragraph', 'paragraph', 'horizontalRule', 'paragraph',
          ]) && window.__editor.state.selection.$from.parentOffset === 0
        }""",
        timeout=5_000,
    )

    # Btn 的 pointerdown 会保留选区；click 走生产 insertRootPageBreak 命令。
    await page.get_by_role("button", name="插入分页", exact=True).click()
    await page.wait_for_function(
        """() => {
          const json = window.__editor.getJSON()
          const types = json.content?.map((node) => node.type)
          const breaks = json.content?.filter((node) => node.type === 'horizontalRule')
          return JSON.stringify(types) === JSON.stringify([
            'paragraph', 'horizontalRule', 'paragraph',
            'horizontalRule', 'paragraph',
          ]) && breaks?.length === 2 &&
            breaks[0]?.attrs?.continuation === true &&
            breaks[1]?.attrs?.continuation === false &&
            document.querySelectorAll('.page').length === 3
        }""",
        timeout=15_000,
    )


async def measure_contract(page: Page) -> dict:
    return await page.evaluate(
        """([leftText, rightText]) => {
          const pages = Array.from(document.querySelectorAll('.page'))
          const editorBreaks = Array.from(
            document.querySelectorAll('.tiptap-editor hr.page-break'),
          )
          const continuationBreak = editorBreaks.find(
            (item) => item.getAttribute('data-page-break-continuation') === 'true',
          )
          const ordinaryBreak = editorBreaks.find(
            (item) => item !== continuationBreak,
          )
          const editorContinuation = continuationBreak?.previousElementSibling
          const editorParagraph = ordinaryBreak?.previousElementSibling
          const continuationBlock = pages[0]?.querySelector(
            '.content > p[data-page-continuation-terminal="true"]',
          )
          const paragraphBlock = pages[1]?.querySelector('.content > p')
          if (!continuationBreak || !ordinaryBreak || !editorContinuation ||
              !editorParagraph || !continuationBlock || !paragraphBlock) {
            throw new Error('续排 E2E fixture DOM 不完整')
          }

          const lastLine = (block) => {
            const lines = Array.from(block.querySelectorAll(':scope > .dtl-line'))
            const line = lines.at(-1)
            if (!line) throw new Error('确定性排版末行尚未物化')
            const atoms = Array.from(block.querySelectorAll(
              `:scope > .dtl-atom[data-layout-line="${line.dataset.layoutLine}"]`,
            )).filter((atom) => atom.textContent)
            const pageElement = block.closest('.page')
            const pageRect = pageElement.getBoundingClientRect()
            const scale = pageRect.width / pageElement.offsetWidth
            const naturalRect = (element) => {
              const rect = element.getBoundingClientRect()
              return {
                x: (rect.left - pageRect.left) / scale,
                y: (rect.top - pageRect.top) / scale,
                right: (rect.right - pageRect.left) / scale,
                bottom: (rect.bottom - pageRect.top) / scale,
                width: rect.width / scale,
                height: rect.height / scale,
              }
            }
            return {
              count: lines.length,
              end: line.dataset.layoutEnd,
              justified: line.dataset.layoutJustified,
              actualRight: Number(line.dataset.layoutRight),
              target: Number(line.dataset.layoutTarget),
              residual: Number(line.dataset.layoutResidual),
              lineRect: naturalRect(line),
              firstAtom: atoms.length ? naturalRect(atoms[0]) : null,
              lastAtom: atoms.length ? naturalRect(atoms.at(-1)) : null,
            }
          }

          return {
            editor: {
              continuationAttribute:
                continuationBreak.getAttribute('data-page-break-continuation'),
              ordinaryAttribute:
                ordinaryBreak.getAttribute('data-page-break-continuation'),
              continuationText: editorContinuation.textContent,
              paragraphText: editorParagraph.textContent,
              continuationTextAlignLast:
                getComputedStyle(editorContinuation).textAlignLast,
              paragraphTextAlignLast:
                getComputedStyle(editorParagraph).textAlignLast,
            },
            pageGeometry: pages.map((item) => ({
              width: item.offsetWidth,
              height: item.offsetHeight,
              state: item.dataset.layoutState,
              phase: item.dataset.layoutSnapshotPhase,
              snapshot: item.dataset.layoutSnapshot,
              issueCount: Number(item.dataset.layoutIssueCount ?? '0'),
            })),
            continuation: {
              text: continuationBlock.textContent,
              marker: continuationBlock.getAttribute(
                'data-page-continuation-terminal',
              ),
              line: lastLine(continuationBlock),
            },
            paragraph: {
              text: paragraphBlock.textContent,
              marker: paragraphBlock.getAttribute(
                'data-page-continuation-terminal',
              ),
              line: lastLine(paragraphBlock),
            },
            expected: { leftText, rightText },
          }
        }""",
        arg=[LEFT_TEXT, RIGHT_TEXT],
    )


def assert_contract(metrics: dict, *, theme: str) -> None:
    editor = metrics["editor"]
    assert editor["continuationAttribute"] == "true", editor
    assert editor["ordinaryAttribute"] is None, editor
    assert editor["continuationText"] == LEFT_TEXT, editor
    assert editor["paragraphText"] == RIGHT_TEXT, editor
    assert editor["continuationTextAlignLast"] == "justify", editor
    assert editor["paragraphTextAlignLast"] in ("left", "start"), editor

    assert len(metrics["pageGeometry"]) == 3, metrics["pageGeometry"]
    for geometry in metrics["pageGeometry"]:
        assert (geometry["width"], geometry["height"]) == (1080, 1800), geometry
        assert geometry["state"] == "ready", geometry
        assert geometry["phase"] == "sealed", geometry
        assert geometry["issueCount"] == 0, geometry
        assert geometry["snapshot"], geometry

    continuation = metrics["continuation"]
    line = continuation["line"]
    assert continuation["text"] == LEFT_TEXT, continuation
    assert continuation["marker"] == "true", continuation
    assert line["end"] == "continuation", line
    assert line["justified"] == "true", line
    assert abs(line["actualRight"] - line["target"]) <= 0.01, line
    assert abs(line["residual"]) <= 0.01, line
    assert line["firstAtom"] and line["lastAtom"], line

    paragraph = metrics["paragraph"]
    line = paragraph["line"]
    assert paragraph["text"] == RIGHT_TEXT, paragraph
    assert paragraph["marker"] is None, paragraph
    assert line["end"] == "paragraph", line
    assert line["justified"] == "false", line
    assert line["target"] - line["actualRight"] >= 30, (
        f"{theme}: 真段尾视觉差距不足，fixture 需调整：{line}"
    )


async def export_public_exam_png(page: Page, metrics: dict) -> tuple[bytes, dict]:
    result = await page.evaluate(
        """async () => {
          const source = document.querySelectorAll('.page')[0]
          const sourceSnapshot = source.dataset.layoutSnapshot
          const terminal = source.querySelector(
            '.content > p[data-page-continuation-terminal="true"]',
          )
          const lastLine = Array.from(
            terminal.querySelectorAll(':scope > .dtl-line'),
          ).at(-1)
          const geometryBefore = JSON.stringify({
            end: lastLine.dataset.layoutEnd,
            justified: lastLine.dataset.layoutJustified,
            right: lastLine.dataset.layoutRight,
            target: lastLine.dataset.layoutTarget,
            residual: lastLine.dataset.layoutResidual,
          })
          const canvas = await window.__test.pageToPngCanvas(source)
          const geometryAfter = JSON.stringify({
            end: lastLine.dataset.layoutEnd,
            justified: lastLine.dataset.layoutJustified,
            right: lastLine.dataset.layoutRight,
            target: lastLine.dataset.layoutTarget,
            residual: lastLine.dataset.layoutResidual,
          })
          return {
            width: canvas.width,
            height: canvas.height,
            sourceSnapshot,
            sourceSnapshotAfter: source.dataset.layoutSnapshot,
            canvasSnapshot: canvas.dataset.layoutSnapshot,
            renderHash: canvas.dataset.layoutRenderHash,
            baselineHash: canvas.dataset.layoutExportBaselineHash,
            geometryBefore,
            geometryAfter,
            dataUrl: canvas.toDataURL('image/png'),
          }
        }"""
    )
    encoded = result.pop("dataUrl").split(",", 1)[1]
    png = base64.b64decode(encoded)
    result["pngSha256"] = hashlib.sha256(png).hexdigest()
    result["line"] = metrics["continuation"]["line"]
    return png, result


def probe_has_dark_ink(image: Image.Image, rect: dict) -> tuple[bool, int]:
    x0 = max(0, math.floor(rect["x"] * 2) - 3)
    y0 = max(0, math.floor(rect["y"] * 2) - 3)
    x1 = min(image.width, math.ceil(rect["right"] * 2) + 3)
    y1 = min(image.height, math.ceil(rect["bottom"] * 2) + 3)
    crop = image.crop((x0, y0, x1, y1)).convert("RGB")
    count = sum(1 for red, green, blue in crop.getdata() if max(red, green, blue) < 145)
    return count >= 8, count


async def main() -> None:
    console_errors: list[str] = []
    page_errors: list[str] = []
    async with async_playwright() as playwright:
        print("[STAGE] 启动全新 Chromium context", flush=True)
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1600, "height": 1200})
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
        await asyncio.wait_for(
            page.wait_for_function("window.__editor && window.__test", timeout=30_000),
            timeout=35,
        )

        print("[STAGE] 公考主题：执行真实 Enter→插入分页", flush=True)
        await asyncio.wait_for(
            pick_theme(page, "公考·山水卷", "theme-public-exam-landscape"),
            timeout=20,
        )
        await asyncio.wait_for(install_fixture_and_run_user_path(page), timeout=35)
        await asyncio.wait_for(wait_for_sealed_pages(page, 3), timeout=50)

        public_metrics = await asyncio.wait_for(measure_contract(page), timeout=10)
        assert_contract(public_metrics, theme="公考·山水卷")
        await page.locator(".page").nth(0).screenshot(
            path=OUT / "public-exam-continuation-preview.png"
        )
        await page.locator(".page").nth(1).screenshot(
            path=OUT / "public-exam-true-paragraph-preview.png"
        )

        print("[STAGE] 公考主题：生成 2160×3600 PNG", flush=True)
        png, export = await asyncio.wait_for(
            export_public_exam_png(page, public_metrics), timeout=90
        )
        assert (export["width"], export["height"]) == (2160, 3600), export
        assert export["sourceSnapshot"] == export["sourceSnapshotAfter"], export
        assert export["canvasSnapshot"] == export["sourceSnapshot"], export
        assert export["geometryBefore"] == export["geometryAfter"], export
        assert export["renderHash"], export
        assert export["baselineHash"], export
        assert len(export["pngSha256"]) == 64, export
        png_path = OUT / "public-exam-continuation-2160x3600.png"
        png_path.write_bytes(png)
        image = Image.open(png_path).convert("RGB")
        assert image.size == (2160, 3600), image.size
        first_ok, first_pixels = probe_has_dark_ink(
            image, public_metrics["continuation"]["line"]["firstAtom"]
        )
        last_ok, last_pixels = probe_has_dark_ink(
            image, public_metrics["continuation"]["line"]["lastAtom"]
        )
        assert first_ok, f"PNG 续段末行左侧首字未进图（pixels={first_pixels}）"
        assert last_ok, f"PNG 续段末行右侧末字未进图（pixels={last_pixels}）"

        print("[STAGE] 旧主题极简白：回归真正段尾不拉满", flush=True)
        await asyncio.wait_for(
            pick_theme(page, "极简白", "theme-minimal-white"), timeout=20
        )
        await asyncio.wait_for(wait_for_sealed_pages(page, 3), timeout=50)
        legacy_metrics = await asyncio.wait_for(measure_contract(page), timeout=10)
        assert_contract(legacy_metrics, theme="极简白")
        await page.locator(".page").nth(1).screenshot(
            path=OUT / "minimal-white-true-paragraph-preview.png"
        )

        assert not console_errors, f"console errors: {console_errors}"
        assert not page_errors, f"page errors: {page_errors}"
        report = {
            "url": URL,
            "publicExam": public_metrics,
            "export": export,
            "legacyTheme": legacy_metrics,
            "png": str(png_path),
            "pngInkPixels": {"first": first_pixels, "last": last_pixels},
            "consoleErrors": console_errors,
            "pageErrors": page_errors,
        }
        (OUT / "report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(
            "[PASS] Enter→分页续排三端一致；"
            f"snapshot={export['sourceSnapshot']}，"
            f"render={export['renderHash']}，PNG sha256={export['pngSha256']}，"
            f"证据={OUT}",
            flush=True,
        )
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
