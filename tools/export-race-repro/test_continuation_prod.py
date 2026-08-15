"""v1.10.2 跨页续排生产兼容回归。

只使用用户可见的导入、编辑、主题和导出 UI，以及生产页面已经渲染的
DOM；不依赖 dev-only ``window.__editor`` / ``window.__test``。

覆盖：
1. “导入文稿 → 粘贴全文 → 生成到新草稿”；
2. 正文中部真实键盘 Enter，立即点击真实“插入分页”；
3. 编辑区 continuation 属性与局部 text-align-last；
4. 公考 1080×1800 预览中续段末行铺满、真正段尾自然左对齐；
5. 真实兼容 ZIP 下载、三张 2160×3600 PNG 与续段/真段尾像素。

用法：
    python3 tools/export-race-repro/test_continuation_prod.py \
      http://127.0.0.1:4182/ \
      --expected-version v1.10.2 \
      --out /tmp/xhs-continuation-prod

    python3 tools/export-race-repro/test_continuation_prod.py \
      https://xhs-poster-editor.l-yanjunnn.workers.dev/ \
      --expected-version v1.10.2 \
      --out /tmp/xhs-continuation-prod

workers.dev 自动使用 Playwright 代理 ``http://127.0.0.1:7897``；其他
入口直连。每次运行使用全新 Chromium context，并在 ``--out`` 下创建
独立时间戳目录，不读取用户日常浏览器草稿，也不覆盖旧证据。
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
import struct
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Optional
from urllib.parse import urlparse

from PIL import Image
from playwright.async_api import Browser, BrowserContext, Page, async_playwright, expect


DEFAULT_URL = "http://127.0.0.1:4174/"
DEFAULT_OUT = Path("/tmp/xhs-page-break-continuation-prod")
WORKERS_PROXY = "http://127.0.0.1:7897"
CANVAS_SIZE = (2160, 3600)
PAGE_SIZE = (1080, 1800)
EXPORT_SCALE = 2
BODY_RGB = (45, 41, 43)
PUBLIC_EXAM_THEME_ID = "builtin-public-exam-landscape"

LEFT_UNIT = "跨页续排需要让上一页末行沿着版心自然铺满同时保持字距稳定"
RIGHT_UNIT = "正文内容继续写在下一页并以真正段落的自然末行结束用于对照验证"
LEFT_TEXT = LEFT_UNIT * 3
RIGHT_TEXT = RIGHT_UNIT * 2 + "真段尾。"
FULL_TEXT = LEFT_TEXT + RIGHT_TEXT
CONTROL_TEXT = "第三页用于确认原有分页仍是真正段落边界。"
ZIP_NAME = "v1102-continuation-prod.zip"
EXPORT_TOPIC = "v1.10.2 跨页续排生产回归"

IMPORT_MARKDOWN = f"""# 封面

## 跨页续排生产回归

## 真实 Enter 与导出

{FULL_TEXT}

---

## 真段尾对照

{CONTROL_TEXT}

# 正文

生产兼容回归文案
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="v1.10.2 Enter→分页跨页续排生产兼容回归",
    )
    parser.add_argument(
        "url",
        nargs="?",
        default=os.environ.get("URL", DEFAULT_URL),
        help=f"本地 production preview 或生产 URL（默认 {DEFAULT_URL}）",
    )
    parser.add_argument(
        "--expected-version",
        default=os.environ.get("EXPECTED_VERSION"),
        help="可选：顶栏必须显示的版本，如 v1.10.2",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help=f"证据根目录（默认 {DEFAULT_OUT}）",
    )
    return parser.parse_args()


def log(message: str) -> None:
    print(f"[v1.10.2 continuation prod] {message}", flush=True)


def safe_slug(value: str) -> str:
    host = urlparse(value).netloc or "local"
    return re.sub(r"[^A-Za-z0-9.-]+", "-", host).strip("-") or "target"


def make_run_dir(root: Path, url: str) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = root / f"{timestamp}-{safe_slug(url)}"
    run_dir.mkdir(parents=True, exist_ok=False)
    return run_dir


def automatic_proxy(url: str) -> Optional[dict[str, str]]:
    hostname = (urlparse(url).hostname or "").lower()
    if hostname == "workers.dev" or hostname.endswith(".workers.dev"):
        return {"server": WORKERS_PROXY}
    return None


async def wait_for_app(
    page: Page,
    url: str,
    expected_version: Optional[str],
) -> str:
    await page.goto(url, wait_until="domcontentloaded", timeout=120_000)
    await page.locator(".page-preview-group").first.wait_for(timeout=60_000)
    await page.locator(".workspace-blocking-layer").wait_for(
        state="detached",
        timeout=60_000,
    )
    version = ((await page.locator(".topbar-version").text_content()) or "").strip()
    if expected_version and version != expected_version:
        raise AssertionError(
            f"顶栏版本 {version!r} 与 --expected-version {expected_version!r} 不一致",
        )
    hooks = await page.evaluate(
        "() => ({ editor: Boolean(window.__editor), test: Boolean(window.__test) })",
    )
    if hooks != {"editor": False, "test": False}:
        raise AssertionError(f"当前入口暴露了 dev-only hook，不是生产兼容路径：{hooks}")
    return version


async def import_fixture(page: Page) -> None:
    log("通过导入弹窗粘贴全文并生成两页草稿")
    await page.get_by_role("button", name="导入文稿", exact=True).click()
    dialog = page.get_by_role("dialog")
    await dialog.get_by_role("heading", name="导入文稿", exact=True).wait_for()
    await dialog.get_by_role("tab", name="粘贴全文", exact=True).click()
    await dialog.get_by_label("粘贴整篇文稿", exact=True).fill(IMPORT_MARKDOWN)
    await dialog.get_by_role("button", name="解析并预览", exact=True).click()
    await dialog.get_by_role(
        "heading",
        name="确认解析结果",
        exact=True,
    ).wait_for(timeout=60_000)
    thumbnails = dialog.locator('[title^="第 "][title*=" 页："]')
    await expect(thumbnails).to_have_count(2)
    create = dialog.get_by_role("button", name="生成到新草稿", exact=True)
    await expect(create).to_be_enabled()
    await create.click()
    await dialog.wait_for(state="hidden", timeout=90_000)
    await expect(page.locator(".page-preview-group")).to_have_count(
        2,
        timeout=90_000,
    )
    editor = page.locator(".tiptap-editor .ProseMirror").first
    await expect(editor).to_contain_text(LEFT_TEXT)
    await expect(editor).to_contain_text(RIGHT_TEXT)


async def apply_public_exam_theme(page: Page, expected_pages: int) -> None:
    log("通过主题库应用公考·山水卷")
    await page.get_by_role("button", name="主题库", exact=True).click()
    dialog = page.get_by_role("dialog")
    card = dialog.locator(f'[data-theme-id="{PUBLIC_EXAM_THEME_ID}"]')
    await card.wait_for()
    await card.get_by_role("button", name="应用", exact=True).click()
    await dialog.wait_for(state="hidden")
    await page.wait_for_function(
        """([count]) => {
          const pages = Array.from(document.querySelectorAll(
            '.page.theme-public-exam-landscape',
          ))
          return pages.length === count && pages.every((item) => {
            const image = item.querySelector('img.bg')
            return image && image.complete && image.naturalWidth > 0
          }) && !document.querySelector('.workspace-blocking-layer')
        }""",
        arg=[expected_pages],
        timeout=60_000,
    )
    await asyncio.wait_for(
        page.evaluate("document.fonts.ready"),
        timeout=90,
    )


async def run_enter_then_page_break(page: Page) -> None:
    editor = page.locator(".tiptap-editor .ProseMirror").first
    selection = await editor.evaluate(
        """(root, fixture) => {
          const paragraph = Array.from(root.children).find(
            (item) => item.tagName === 'P' && item.textContent === fixture.full,
          )
          if (!paragraph) throw new Error('导入后找不到跨页长段落')
          const walker = document.createTreeWalker(
            paragraph,
            NodeFilter.SHOW_TEXT,
          )
          let remaining = fixture.leftLength
          let textNode = walker.nextNode()
          while (textNode && remaining > textNode.data.length) {
            remaining -= textNode.data.length
            textNode = walker.nextNode()
          }
          if (!textNode || remaining <= 0 || remaining >= textNode.data.length) {
            throw new Error(`无法在正文中部建立选区：remaining=${remaining}`)
          }
          root.focus()
          const range = document.createRange()
          range.setStart(textNode, remaining)
          range.collapse(true)
          const selection = window.getSelection()
          selection.removeAllRanges()
          selection.addRange(range)
          return {
            active: document.activeElement === root,
            paragraphText: paragraph.textContent,
            offset: remaining,
          }
        }""",
        {"full": FULL_TEXT, "leftLength": len(LEFT_TEXT)},
    )
    if not selection["active"] or selection["paragraphText"] != FULL_TEXT:
        raise AssertionError(f"生产 DOM 选区未正确建立：{selection}")

    log("真实键盘 Enter 后立即点击真实“插入分页”")
    await page.keyboard.press("Enter")
    await page.get_by_role("button", name="插入分页", exact=True).click()
    await page.wait_for_function(
        """([left, right]) => {
          const root = document.querySelector('.tiptap-editor .ProseMirror')
          const breaks = Array.from(root?.querySelectorAll(
            ':scope > hr.page-break',
          ) ?? [])
          const continuation = breaks.find((item) =>
            item.getAttribute('data-page-break-continuation') === 'true'
          )
          const ordinary = breaks.find((item) => item !== continuation)
          return breaks.length === 2 && continuation && ordinary &&
            continuation.previousElementSibling?.textContent === left &&
            continuation.nextElementSibling?.textContent === right &&
            ordinary.previousElementSibling?.textContent === right &&
            document.querySelectorAll('.page').length === 3
        }""",
        arg=[LEFT_TEXT, RIGHT_TEXT],
        timeout=30_000,
    )


async def wait_for_sealed_pages(page: Page, expected_count: int) -> None:
    await page.wait_for_function(
        """([count]) => {
          const pages = Array.from(document.querySelectorAll('.page'))
          return pages.length === count && pages.every((item) =>
            item.offsetWidth === 1080 && item.offsetHeight === 1800 &&
            item.dataset.layoutState === 'ready' &&
            item.dataset.layoutSnapshotPhase === 'sealed' &&
            Number(item.dataset.layoutIssueCount ?? '0') === 0 &&
            Boolean(item.dataset.layoutSnapshot)
          )
        }""",
        arg=[expected_count],
        timeout=90_000,
    )


async def measure_contract(page: Page) -> dict[str, Any]:
    return await page.evaluate(
        """([leftText, rightText]) => {
          const pages = Array.from(document.querySelectorAll('.page'))
          const root = document.querySelector('.tiptap-editor .ProseMirror')
          const breaks = Array.from(root.querySelectorAll(':scope > hr.page-break'))
          const continuationBreak = breaks.find((item) =>
            item.getAttribute('data-page-break-continuation') === 'true'
          )
          const ordinaryBreak = breaks.find((item) => item !== continuationBreak)
          const editorContinuation = continuationBreak?.previousElementSibling
          const editorParagraph = ordinaryBreak?.previousElementSibling
          const continuationBlock = pages[0]?.querySelector(
            '.content > p[data-page-continuation-terminal="true"]',
          )
          const paragraphBlock = Array.from(
            pages[1]?.querySelectorAll('.content > p') ?? [],
          ).find((item) => item.textContent === rightText)
          if (!continuationBreak || !ordinaryBreak || !editorContinuation ||
              !editorParagraph || !continuationBlock || !paragraphBlock) {
            throw new Error('生产续排 fixture DOM 不完整')
          }

          const terminalLine = (block) => {
            const lines = Array.from(block.querySelectorAll(':scope > .dtl-line'))
            const line = lines.at(-1)
            if (!line) throw new Error('确定性末行尚未物化')
            const atoms = Array.from(block.querySelectorAll(
              `:scope > .dtl-atom[data-layout-line="${line.dataset.layoutLine}"]`,
            )).filter((atom) => atom.textContent)
            const pageElement = block.closest('.page')
            const pageRect = pageElement.getBoundingClientRect()
            const scale = pageRect.width / pageElement.offsetWidth
            const naturalRect = (element) => {
              const value = element.getBoundingClientRect()
              return {
                x: (value.left - pageRect.left) / scale,
                y: (value.top - pageRect.top) / scale,
                right: (value.right - pageRect.left) / scale,
                bottom: (value.bottom - pageRect.top) / scale,
                width: value.width / scale,
                height: value.height / scale,
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
            pages: pages.map((item) => ({
              width: item.offsetWidth,
              height: item.offsetHeight,
              state: item.dataset.layoutState,
              phase: item.dataset.layoutSnapshotPhase,
              issueCount: Number(item.dataset.layoutIssueCount ?? '0'),
              snapshot: item.dataset.layoutSnapshot,
            })),
            continuation: {
              text: continuationBlock.textContent,
              marker: continuationBlock.getAttribute(
                'data-page-continuation-terminal',
              ),
              line: terminalLine(continuationBlock),
            },
            paragraph: {
              text: paragraphBlock.textContent,
              marker: paragraphBlock.getAttribute(
                'data-page-continuation-terminal',
              ),
              line: terminalLine(paragraphBlock),
            },
          }
        }""",
        arg=[LEFT_TEXT, RIGHT_TEXT],
    )


def assert_contract(metrics: dict[str, Any]) -> None:
    editor = metrics["editor"]
    if editor != {
        "continuationAttribute": "true",
        "ordinaryAttribute": None,
        "continuationText": LEFT_TEXT,
        "paragraphText": RIGHT_TEXT,
        "continuationTextAlignLast": "justify",
        "paragraphTextAlignLast": "left",
    }:
        raise AssertionError(f"编辑区 continuation 契约不一致：{editor}")

    if len(metrics["pages"]) != 3:
        raise AssertionError(f"预览页数不为 3：{metrics['pages']}")
    for geometry in metrics["pages"]:
        if (geometry["width"], geometry["height"]) != PAGE_SIZE:
            raise AssertionError(f"预览不是 1080×1800：{geometry}")
        if (
            geometry["state"] != "ready"
            or geometry["phase"] != "sealed"
            or geometry["issueCount"] != 0
            or not geometry["snapshot"]
        ):
            raise AssertionError(f"预览未通过封存门禁：{geometry}")

    continuation = metrics["continuation"]
    line = continuation["line"]
    if continuation["text"] != LEFT_TEXT or continuation["marker"] != "true":
        raise AssertionError(f"续段渲染 marker 错误：{continuation}")
    if (
        line["end"] != "continuation"
        or line["justified"] != "true"
        or abs(line["actualRight"] - line["target"]) > 0.01
        or abs(line["residual"]) > 0.01
        or not line["firstAtom"]
        or not line["lastAtom"]
    ):
        raise AssertionError(f"续段末行未铺满：{line}")

    paragraph = metrics["paragraph"]
    line = paragraph["line"]
    if paragraph["text"] != RIGHT_TEXT or paragraph["marker"] is not None:
        raise AssertionError(f"真正段尾被误标：{paragraph}")
    if (
        line["end"] != "paragraph"
        or line["justified"] != "false"
        or line["target"] - line["actualRight"] < 30
    ):
        raise AssertionError(f"真正段尾未保持自然左对齐：{line}")


async def download_export_zip(page: Page, run_dir: Path) -> Path:
    log("通过真实导出 Dialog 下载兼容 ZIP")
    await page.wait_for_function(
        "!document.querySelector('.topbar-export')?.disabled",
        timeout=90_000,
    )
    await page.get_by_role("button", name="导出 PNG", exact=True).click()
    dialog = page.get_by_role("dialog")
    await dialog.get_by_role("heading", name="导出 PNG", exact=True).wait_for()
    zip_choice = dialog.locator("button").filter(has_text=re.compile(r"兼容 ZIP"))
    await expect(zip_choice).to_have_count(1)
    await zip_choice.click()
    await dialog.get_by_label("文档主题", exact=True).fill(EXPORT_TOPIC)
    await dialog.get_by_label("ZIP 默认名称", exact=True).fill(ZIP_NAME)

    async with page.expect_download(timeout=240_000) as download_info:
        await dialog.get_by_role(
            "button",
            name="导出全部 3 张",
            exact=True,
        ).last.click()
    download = await download_info.value
    failure = await download.failure()
    if failure:
        raise AssertionError(f"浏览器下载失败：{failure}")
    if download.suggested_filename != ZIP_NAME:
        raise AssertionError(
            f"下载文件名 {download.suggested_filename!r} ≠ {ZIP_NAME!r}",
        )
    zip_path = run_dir / ZIP_NAME
    await download.save_as(zip_path)
    await dialog.wait_for(state="hidden", timeout=30_000)
    return zip_path


def png_size(data: bytes) -> tuple[int, int]:
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError("导出成员不是完整 PNG")
    return struct.unpack(">II", data[16:24])


def extract_export(zip_path: Path, run_dir: Path) -> tuple[list[bytes], dict[str, Any]]:
    with zipfile.ZipFile(zip_path) as archive:
        members = [
            PurePosixPath(name)
            for name in archive.namelist()
            if name.lower().endswith(".png")
        ]
        members.sort(
            key=lambda item: int(re.match(r"^(\d+)_", item.name).group(1)),
        )
        if len(members) != 3:
            raise AssertionError(f"ZIP PNG 数量不是 3：{members}")
        images = [archive.read(member.as_posix()) for member in members]
        for index, data in enumerate(images, start=1):
            if png_size(data) != CANVAS_SIZE:
                raise AssertionError(
                    f"第 {index} 张不是 2160×3600：{png_size(data)}",
                )
            (run_dir / f"export-{index:02d}.png").write_bytes(data)

        manifest_paths = [
            name for name in archive.namelist() if PurePosixPath(name).name == "导出清单.json"
        ]
        if len(manifest_paths) != 1:
            raise AssertionError(f"ZIP 导出清单数量错误：{manifest_paths}")
        manifest = json.loads(archive.read(manifest_paths[0]).decode("utf-8"))
        if manifest.get("sourcePageCount") != 3 or manifest.get("exportedPageCount") != 3:
            raise AssertionError(f"导出清单页数错误：{manifest}")

    return images, {
        "zip": str(zip_path),
        "members": [member.as_posix() for member in members],
        "manifestSourcePageCount": manifest.get("sourcePageCount"),
        "manifestExportedPageCount": manifest.get("exportedPageCount"),
        "sha256": [hashlib.sha256(data).hexdigest() for data in images],
    }


def scaled_box(rect: dict[str, float], padding: int = 4) -> tuple[int, int, int, int]:
    return (
        max(0, math.floor(rect["x"] * EXPORT_SCALE) - padding),
        max(0, math.floor(rect["y"] * EXPORT_SCALE) - padding),
        min(CANVAS_SIZE[0], math.ceil(rect["right"] * EXPORT_SCALE) + padding),
        min(CANVAS_SIZE[1], math.ceil(rect["bottom"] * EXPORT_SCALE) + padding),
    )


def body_color_positions(
    image: Image.Image,
    box: tuple[int, int, int, int],
    tolerance: int = 28,
) -> list[tuple[int, int]]:
    rgb = image.convert("RGB")
    left, top, right, bottom = box
    matches: list[tuple[int, int]] = []
    for y in range(top, bottom):
        for x in range(left, right):
            pixel = rgb.getpixel((x, y))
            if max(abs(pixel[index] - BODY_RGB[index]) for index in range(3)) <= tolerance:
                matches.append((x, y))
    return matches


def assert_export_pixels(
    images: list[bytes],
    metrics: dict[str, Any],
) -> dict[str, int]:
    continuation_image = Image.open(io.BytesIO(images[0])).convert("RGB")
    paragraph_image = Image.open(io.BytesIO(images[1])).convert("RGB")
    continuation_line = metrics["continuation"]["line"]
    paragraph_line = metrics["paragraph"]["line"]

    first_matches = body_color_positions(
        continuation_image,
        scaled_box(continuation_line["firstAtom"]),
    )
    last_matches = body_color_positions(
        continuation_image,
        scaled_box(continuation_line["lastAtom"]),
    )
    paragraph_last_matches = body_color_positions(
        paragraph_image,
        scaled_box(paragraph_line["lastAtom"]),
    )
    if len(first_matches) < 8 or len(last_matches) < 8:
        raise AssertionError(
            "PNG 续段末行没有同时触达左右字形："
            f"left={len(first_matches)}, right={len(last_matches)}",
        )
    if len(paragraph_last_matches) < 8:
        raise AssertionError(
            f"PNG 真段尾末字未进图：pixels={len(paragraph_last_matches)}",
        )

    paragraph_last = paragraph_line["lastAtom"]
    target_right = paragraph_line["lineRect"]["x"] + paragraph_line["target"]
    tail_rect = {
        "x": paragraph_last["right"] + 6,
        "y": paragraph_last["y"],
        "right": target_right,
        "bottom": paragraph_last["bottom"],
    }
    if tail_rect["right"] - tail_rect["x"] < 20:
        raise AssertionError(f"真段尾 PNG 空白区不足：{tail_rect}")
    tail_matches = body_color_positions(paragraph_image, scaled_box(tail_rect, 0))
    if len(tail_matches) > 4:
        raise AssertionError(
            f"PNG 真段尾右侧空白区出现正文色字形：pixels={len(tail_matches)}",
        )

    return {
        "continuationFirstAtomPixels": len(first_matches),
        "continuationLastAtomPixels": len(last_matches),
        "paragraphLastAtomPixels": len(paragraph_last_matches),
        "paragraphTailPixels": len(tail_matches),
    }


def assert_line_geometry_unchanged(
    before: dict[str, Any],
    after: dict[str, Any],
    label: str,
) -> None:
    for key in ("count", "end", "justified"):
        if after[key] != before[key]:
            raise AssertionError(
                f"真实导出后{label} {key} 改变：{before[key]!r} -> {after[key]!r}",
            )
    for key in ("actualRight", "target", "residual"):
        if abs(after[key] - before[key]) > 0.01:
            raise AssertionError(
                f"真实导出后{label} {key} 改变：{before[key]} -> {after[key]}",
            )
    for rect_name in ("lineRect", "firstAtom", "lastAtom"):
        before_rect = before[rect_name]
        after_rect = after[rect_name]
        if (before_rect is None) != (after_rect is None):
            raise AssertionError(
                f"真实导出后{label} {rect_name} 出现/消失",
            )
        if before_rect is None:
            continue
        for key in ("x", "y", "right", "bottom", "width", "height"):
            if abs(after_rect[key] - before_rect[key]) > 0.05:
                raise AssertionError(
                    f"真实导出后{label} {rect_name}.{key} 改变："
                    f"{before_rect[key]} -> {after_rect[key]}",
                )


async def run_ui(
    browser: Browser,
    args: argparse.Namespace,
    run_dir: Path,
) -> dict[str, Any]:
    context: BrowserContext = await browser.new_context(
        viewport={"width": 1600, "height": 1200},
        accept_downloads=True,
    )
    # 仅关闭原生文件 picker，让生产交付层走用户可选的兼容 ZIP；
    # 不暴露、替换或调用任何应用内部 hook。
    await context.add_init_script(
        """Object.defineProperty(window, 'showSaveFilePicker', {
          configurable: true,
          writable: true,
          value: undefined,
        })""",
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
        version = await wait_for_app(page, args.url, args.expected_version)
        await import_fixture(page)
        await apply_public_exam_theme(page, 2)
        await run_enter_then_page_break(page)
        await wait_for_sealed_pages(page, 3)
        metrics = await measure_contract(page)
        assert_contract(metrics)

        await page.locator(".page").nth(0).screenshot(
            path=run_dir / "preview-continuation.png",
        )
        await page.locator(".page").nth(1).screenshot(
            path=run_dir / "preview-true-paragraph.png",
        )
        snapshots_before = [item["snapshot"] for item in metrics["pages"]]
        zip_path = await download_export_zip(page, run_dir)
        await wait_for_sealed_pages(page, 3)
        metrics_after = await measure_contract(page)
        snapshots_after = [item["snapshot"] for item in metrics_after["pages"]]
        if snapshots_after != snapshots_before:
            raise AssertionError(
                f"真实导出改写了预览 snapshot：{snapshots_before} -> {snapshots_after}",
            )
        assert_line_geometry_unchanged(
            metrics["continuation"]["line"],
            metrics_after["continuation"]["line"],
            "续段行几何",
        )
        assert_line_geometry_unchanged(
            metrics["paragraph"]["line"],
            metrics_after["paragraph"]["line"],
            "真段尾行几何",
        )

        images, export = extract_export(zip_path, run_dir)
        pixels = assert_export_pixels(images, metrics)
        if console_errors or page_errors:
            raise AssertionError(
                "运行期错误："
                + json.dumps(
                    {"consoleErrors": console_errors, "pageErrors": page_errors},
                    ensure_ascii=False,
                ),
            )
        return {
            "url": args.url,
            "version": version,
            "proxy": WORKERS_PROXY if automatic_proxy(args.url) else None,
            "devHooks": {"editor": False, "test": False},
            "metrics": metrics,
            "snapshotsBefore": snapshots_before,
            "snapshotsAfter": snapshots_after,
            "export": export,
            "pixels": pixels,
            "consoleErrors": console_errors,
            "pageErrors": page_errors,
        }
    except Exception:
        try:
            await page.screenshot(path=run_dir / "failure.png", full_page=True)
        except Exception as screenshot_error:
            log(f"失败截图未能保存：{screenshot_error}")
        raise
    finally:
        await context.close()


async def main() -> None:
    args = parse_args()
    run_dir = make_run_dir(args.out, args.url)
    proxy = automatic_proxy(args.url)
    log(
        f"目标 {args.url}；期望版本 {args.expected_version or '不限定'}；"
        f"代理 {proxy['server'] if proxy else '直连'}",
    )
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
            proxy=proxy,
            args=[] if proxy else ["--no-proxy-server"],
        )
        try:
            report = await run_ui(browser, args, run_dir)
        finally:
            await browser.close()

    report_path = run_dir / "report.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    continuation = report["metrics"]["continuation"]["line"]
    paragraph = report["metrics"]["paragraph"]["line"]
    log(
        "PASS：生产 UI Enter→分页与真实 ZIP/PNG 一致；"
        f"续段 {continuation['actualRight']}={continuation['target']}，"
        f"真段尾 {paragraph['actualRight']}<{paragraph['target']}；"
        f"证据 {run_dir}",
    )
    log(f"报告 {report_path}")


if __name__ == "__main__":
    asyncio.run(main())
