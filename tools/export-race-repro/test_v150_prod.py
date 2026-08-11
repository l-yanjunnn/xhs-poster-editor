"""v1.5.0 生产回归：公考双底图、列表分页、高清导出与字形中线。

这个脚本只使用用户可见 UI 和生产 DOM，不依赖 dev-only 的
``window.__editor`` / ``window.__test`` 钩子。每个用例使用全新 Chromium
context，不读写用户日常浏览器的草稿。

用法：
    python3 tools/export-race-repro/test_v150_prod.py [URL] [EXPECTED_VERSION]

Cloudflare 入口依照项目现有生产回归约定，自动使用 127.0.0.1:7897
系统代理；OSS/CDN 入口自动直连。下载证据写入 /tmp/xhs-v150-prod/。
"""

import asyncio
import io
import math
import re
import shutil
import sys
import zipfile
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image
from playwright.async_api import Browser, Page, async_playwright


URL = (
    sys.argv[1]
    if len(sys.argv) > 1
    else "https://xhs-poster-editor.l-yanjunnn.workers.dev/"
)
EXPECTED_VERSION = sys.argv[2] if len(sys.argv) > 2 else "v1.5.0"
USE_PROXY = "workers.dev" in URL
CANVAS_SIZE = (2160, 3600)
PAGE_WIDTH = 1080
EXPORT_SCALE = 2
PUBLIC_EXAM_THEME_ID = "builtin-public-exam-landscape"
COVER_BACKGROUND = "/builtin-assets/bg-public-exam-landscape-cover-v1.png"
INNER_BACKGROUND = "/builtin-assets/bg-public-exam-landscape-inner-v1.png"
COVER_TITLE_RGB = (109, 19, 108)
COVER_SUBTITLE_RGB = (90, 70, 95)
BODY_RGB = (45, 41, 43)
ACCENT_RGB = (138, 75, 124)


def safe_slug(value: str) -> str:
    host = urlparse(value).netloc or "local"
    return re.sub(r"[^A-Za-z0-9.-]+", "-", host).strip("-") or "target"


OUT = Path("/tmp/xhs-v150-prod") / safe_slug(URL)
if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True)


ONE_PAGE_HTML = """
<h1>申论高分方法</h1>
<p>材料阅读 · 归纳概括 · 规范表达</p>
<h2>提出对策题</h2>
<p>先定位问题，再从材料中提炼主体、动作与目标。</p>
<ol start="9">
  <li><p>概括核心问题</p></li>
  <li><p>匹配材料做法</p></li>
  <li><p>压缩为规范表述</p></li>
</ol>
"""

TWO_PAGE_SOURCE_HTML = """
<h1>申论高分方法</h1>
<p>材料阅读 · 归纳概括 · 规范表达</p>
<h2>列表内安全分页</h2>
<ol start="8">
  <li><p>第八项：概括问题</p></li>
  <li><p>第九项：匹配对策</p></li>
  <li><p>第十项：明确主体</p></li>
  <li><p>第十一项：压缩表述</p></li>
</ol>
"""

FIVE_PAGE_HTML = """
<h1>申论高分方法</h1>
<p>材料阅读 · 归纳概括 · 规范表达</p>
<hr class="page-break">
<h2>提出对策题</h2>
<p>先定位问题，再从材料中提炼主体、动作与目标。</p>
<ol start="9">
  <li><p>概括核心问题</p></li>
  <li><p>匹配材料做法</p></li>
  <li><p>压缩为规范表述</p></li>
</ol>
<hr class="page-break">
<h2>归纳概括题</h2>
<p>依据材料划分层次，提炼上位概念。</p>
<hr class="page-break">
<h2>综合分析题</h2>
<p>从表层含义、深层逻辑和实践要求展开。</p>
<hr class="page-break">
<h2>文章写作</h2>
<p>围绕中心论点建立结构，让分论点层层递进。</p>
"""


def log(message: str) -> None:
    print(f"[v1.5 prod] {message}", flush=True)


async def wait_for_app(page: Page) -> None:
    await page.goto(URL, wait_until="domcontentloaded", timeout=120_000)
    await page.wait_for_selector(".page", timeout=60_000)
    await page.wait_for_function(
        "!document.querySelector('.workspace-blocking-layer')",
        timeout=60_000,
    )
    version = (await page.locator(".topbar-version").text_content()) or ""
    assert version == EXPECTED_VERSION, (
        f"线上版本 {version!r} ≠ 期望 {EXPECTED_VERSION!r}"
    )


async def replace_document_via_paste(
    page: Page,
    html: str,
    expected_pages: int,
) -> None:
    """从真实 contenteditable 派发 paste，走生产粘贴/归一化链路。"""
    editor = page.locator(".tiptap-editor .ProseMirror, .ProseMirror").first
    await editor.click()
    await page.keyboard.press("Meta+a")
    await page.keyboard.press("Backspace")
    handled = await editor.evaluate(
        """
        (root, markup) => {
          root.focus()
          const template = document.createElement('template')
          template.innerHTML = markup
          const clipboard = new DataTransfer()
          clipboard.setData('text/html', markup)
          clipboard.setData('text/plain', template.content.textContent ?? '')
          const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: clipboard,
          })
          return !root.dispatchEvent(event)
        }
        """,
        html,
    )
    assert handled, "ProseMirror 没有接管 paste 事件"
    await page.wait_for_function(
        "(count) => document.querySelectorAll('.page').length === count",
        arg=expected_pages,
        timeout=30_000,
    )


async def insert_page_break_inside_list(page: Page) -> None:
    """在有序列表第 2 项内点击分页，验证 1 → 2 页与顶层 HR。"""
    editor = page.locator(".tiptap-editor .ProseMirror, .ProseMirror").first
    items = editor.locator(":scope > ol > li")
    assert await items.count() == 4, "生产 DOM 未保留 4 个有序列表项"
    await items.nth(1).locator("p").click(position={"x": 30, "y": 12})
    await page.get_by_role("button", name="插入分页", exact=True).click()
    await page.wait_for_function(
        "document.querySelectorAll('.page').length === 2",
        timeout=30_000,
    )
    structure = await editor.evaluate(
        """
        (root) => ({
          rootBreaks: [...root.querySelectorAll('hr.page-break')]
            .filter((item) => item.parentElement === root).length,
          nestedBreaks: root.querySelectorAll(
            'ol hr.page-break, ul hr.page-break, blockquote hr.page-break',
          ).length,
          listStarts: [...root.children]
            .filter((item) => item.tagName === 'OL')
            .map((item) => Number(item.getAttribute('start') || '1')),
          listTexts: [...root.children]
            .filter((item) => item.tagName === 'OL')
            .map((item) => item.textContent.trim()),
        })
        """
    )
    assert structure["rootBreaks"] == 1, structure
    assert structure["nestedBreaks"] == 0, structure
    assert structure["listStarts"] == [8, 10], structure
    assert structure["listTexts"] == [
        "第八项：概括问题第九项：匹配对策",
        "第十项：明确主体第十一项：压缩表述",
    ], structure


async def apply_public_exam_theme(page: Page, expected_pages: int) -> None:
    await page.get_by_role("button", name="主题库", exact=True).click()
    dialog = page.get_by_role("dialog")
    card = dialog.locator(f'[data-theme-id="{PUBLIC_EXAM_THEME_ID}"]')
    await card.wait_for()
    await card.get_by_role("button", name="应用", exact=True).click()
    await dialog.wait_for(state="hidden")
    await page.wait_for_function(
        """
        (count) => {
          const pages = [...document.querySelectorAll(
            '.page.theme-public-exam-landscape',
          )]
          return pages.length === count && pages.every((item) => {
            const image = item.querySelector('img.bg')
            return image && image.complete && image.naturalWidth > 0
          }) && !document.querySelector('.workspace-blocking-layer')
        }
        """,
        arg=expected_pages,
        timeout=60_000,
    )
    await page.evaluate("document.fonts.ready")
    await page.wait_for_function(
        """
        () => {
          const h2s = [...document.querySelectorAll('.page .content h2')]
          const markers = [...document.querySelectorAll(
            '.page [data-optical-list-marker]',
          )]
          return h2s.every((item) =>
            item.dataset.opticalH2 === 'ready' &&
            item.style.getPropertyValue('--h2-optical-center-y') &&
            item.style.getPropertyValue('--h2-optical-bar-height')
          ) && markers.every((item) =>
            item.style.getPropertyValue('--optical-list-marker-shift-y')
          )
        }
        """,
        timeout=30_000,
    )


async def theme_snapshot(page: Page) -> dict:
    return await page.evaluate(
        """
        () => {
          const pages = [...document.querySelectorAll('.page')]
          const cover = pages[0]
          const imagePath = (item) =>
            new URL(item.currentSrc || item.src).pathname
          return {
            pageCount: pages.length,
            backgrounds: pages.map((item) =>
              imagePath(item.querySelector('img.bg')),
            ),
            coverTitle: getComputedStyle(
              cover.querySelector('.content > h1:first-of-type'),
            ).color,
            coverSubtitle: getComputedStyle(
              cover.querySelector('.content > h1:first-of-type + p'),
            ).color,
          }
        }
        """
    )


def assert_theme_snapshot(snapshot: dict, expected_pages: int) -> None:
    assert snapshot["pageCount"] == expected_pages, snapshot
    assert snapshot["backgrounds"] == [COVER_BACKGROUND] + [
        INNER_BACKGROUND
    ] * (expected_pages - 1), snapshot
    assert snapshot["coverTitle"] == "rgb(109, 19, 108)", snapshot
    assert snapshot["coverSubtitle"] == "rgb(90, 70, 95)", snapshot


async def capture_geometry(page: Page) -> dict:
    """
    记录预览中的逻辑画布坐标。导出固定 scale=2，因此可用
    这些坐标在 PNG 中分别找到竖线、H2 字形、序号与首行文字。
    """
    geometry = await page.evaluate(
        """
        () => {
          const pages = [...document.querySelectorAll('.page')]
          const opticalPage = pages.find((item) =>
            item.querySelector('.content h2') &&
            item.querySelector('[data-optical-list-marker]'),
          )
          if (!opticalPage) return null
          const h2 = opticalPage.querySelector('.content h2')
          const markers = [...opticalPage.querySelectorAll(
            '[data-optical-list-marker]',
          )]
          const marker = markers[Math.min(1, markers.length - 1)]
          const item = marker?.parentElement
          const listText = [...(item?.children ?? [])].find(
            (child) => child.tagName === 'P',
          ) ?? item
          const pageRect = opticalPage.getBoundingClientRect()
          const scale = pageRect.width / 1080
          const rect = (target, useRange = false) => {
            let value
            if (useRange) {
              const range = document.createRange()
              range.selectNodeContents(target)
              value = range.getBoundingClientRect()
              range.detach()
            } else {
              value = target.getBoundingClientRect()
            }
            return {
              x: (value.left - pageRect.left) / scale,
              y: (value.top - pageRect.top) / scale,
              width: value.width / scale,
              height: value.height / scale,
            }
          }
          return {
            pageIndex: pages.indexOf(opticalPage),
            h2: rect(h2),
            h2Text: rect(h2, true),
            h2Center: h2.style.getPropertyValue('--h2-optical-center-y'),
            h2Height: h2.style.getPropertyValue('--h2-optical-bar-height'),
            h2Ready: h2.dataset.opticalH2,
            markerText: rect(marker, true),
            markerShift: marker.style.getPropertyValue(
              '--optical-list-marker-shift-y',
            ),
            markerFontSize: Number.parseFloat(getComputedStyle(marker).fontSize),
            markerLabel: marker.textContent,
            listText: rect(listText, true),
            markerCount: markers.length,
            markerColumns: marker.closest('ol')?.dataset
              .opticalListMarkerColumns ?? '',
          }
        }
        """
    )
    assert geometry is not None, "找不到同时含 H2 与有序列表的页"
    return geometry


def css_px(value: str) -> float:
    match = re.fullmatch(r"\s*(-?(?:\d+(?:\.\d*)?|\.\d+))px\s*", value)
    assert match, f"不是有效 CSS px：{value!r}"
    result = float(match.group(1))
    assert math.isfinite(result)
    return result


def assert_optical_dom(
    geometry: dict,
    expected_marker_label=None,
) -> None:
    center = css_px(geometry["h2Center"])
    height = css_px(geometry["h2Height"])
    shift = css_px(geometry["markerShift"])
    assert geometry["h2Ready"] == "ready", geometry
    assert 0 < center < geometry["h2"]["height"], geometry
    assert 0 < height <= geometry["h2"]["height"] * 1.5, geometry
    assert geometry["markerCount"] >= 1, geometry
    assert int(geometry["markerColumns"]) >= 2, geometry
    if expected_marker_label is not None:
        assert geometry["markerLabel"] == expected_marker_label, geometry
    assert abs(shift) <= geometry["markerFontSize"] * 0.4 + 0.01, geometry


async def export_current(
    page: Page,
    name: str,
    expected_pages: int,
) -> list[bytes]:
    button = page.get_by_role("button", name="导出 PNG", exact=True)
    await button.wait_for()
    await page.wait_for_function(
        "!document.querySelector('.topbar-export')?.disabled",
        timeout=60_000,
    )
    await button.click()
    dialog = page.get_by_role("dialog")
    await dialog.get_by_placeholder("输入文件名").fill(name)
    async with page.expect_download(timeout=180_000) as download_info:
        await dialog.get_by_role("button", name="导出", exact=True).click()
    download = await download_info.value
    suffix = Path(download.suggested_filename).suffix.lower()
    assert suffix == (".png" if expected_pages == 1 else ".zip"), (
        download.suggested_filename
    )
    artifact = OUT / download.suggested_filename
    await download.save_as(artifact)
    await dialog.wait_for(state="hidden")

    if suffix == ".png":
        images = [artifact.read_bytes()]
    else:
        with zipfile.ZipFile(artifact) as archive:
            members = [
                item
                for item in archive.namelist()
                if item.lower().endswith(".png")
            ]
            members.sort(
                key=lambda item: int(
                    re.search(r"-(\d+)\.png$", item, re.IGNORECASE).group(1)
                )
            )
            assert len(members) == expected_pages, members
            images = [archive.read(member) for member in members]

    assert len(images) == expected_pages, len(images)
    for index, data in enumerate(images, start=1):
        (OUT / f"{name}-page-{index}.png").write_bytes(data)
    return images


def assert_png_basics(images: list[bytes], expected_pages: int) -> None:
    assert len(images) == expected_pages
    for index, data in enumerate(images):
        image = Image.open(io.BytesIO(data)).convert("RGBA")
        assert image.size == CANVAS_SIZE, (index + 1, image.size)
        w, h = image.size
        for point in ((5, 5), (w - 6, 5), (5, h - 6), (w - 6, h - 6)):
            assert image.getpixel(point)[3] == 255, (index + 1, point)

        sample = image.convert("RGB").getpixel((200, 164))
        if index == 0:
            assert min(sample) > 220, ("cover", sample)
        else:
            assert (
                sample[0] > 100
                and sample[1] < 115
                and sample[2] > 100
                and abs(sample[0] - sample[2]) < 35
            ), (f"inner-{index + 1}", sample)


def scaled_box(rect: dict, padding: int = 4) -> tuple[int, int, int, int]:
    left = max(0, math.floor(rect["x"] * EXPORT_SCALE) - padding)
    top = max(0, math.floor(rect["y"] * EXPORT_SCALE) - padding)
    right = min(
        CANVAS_SIZE[0],
        math.ceil((rect["x"] + rect["width"]) * EXPORT_SCALE) + padding,
    )
    bottom = min(
        CANVAS_SIZE[1],
        math.ceil((rect["y"] + rect["height"]) * EXPORT_SCALE) + padding,
    )
    assert right > left and bottom > top, rect
    return left, top, right, bottom


def matching_bbox(
    image: Image.Image,
    box: tuple[int, int, int, int],
    target: tuple[int, int, int],
    tolerance: int,
    minimum_pixels: int,
) -> tuple[int, int, int, int, int]:
    rgb = image.convert("RGB")
    left, top, right, bottom = box
    matches: list[tuple[int, int]] = []
    for y in range(top, bottom):
        for x in range(left, right):
            pixel = rgb.getpixel((x, y))
            if max(abs(pixel[i] - target[i]) for i in range(3)) <= tolerance:
                matches.append((x, y))
    assert len(matches) >= minimum_pixels, (
        f"区域 {box} 只找到 {len(matches)} 个接近 {target} 的像素"
    )
    xs = [item[0] for item in matches]
    ys = [item[1] for item in matches]
    return min(xs), min(ys), max(xs), max(ys), len(matches)


def box_center_y(box: tuple[int, int, int, int, int]) -> float:
    return (box[1] + box[3]) / 2


def assert_cover_colors_in_export(data: bytes) -> None:
    # 坐标来自公考 Cover 的固定安全区；按颜色而非纯明度找字，
    # 避免纸纹/山水底图被误当成标题。
    image = Image.open(io.BytesIO(data)).convert("RGB")
    title_region = (180, 600, 1980, 940)
    subtitle_region = (180, 840, 1980, 1260)
    matching_bbox(image, title_region, COVER_TITLE_RGB, 18, 40)
    matching_bbox(image, subtitle_region, COVER_SUBTITLE_RGB, 18, 30)


def assert_optical_export(data: bytes, geometry: dict) -> None:
    image = Image.open(io.BytesIO(data)).convert("RGB")
    h2 = geometry["h2"]
    bar_rect = {
        "x": h2["x"],
        "y": h2["y"],
        "width": 18,
        "height": h2["height"],
    }
    h2_bar = matching_bbox(
        image,
        scaled_box(bar_rect, 8),
        ACCENT_RGB,
        22,
        80,
    )
    h2_text = matching_bbox(
        image,
        scaled_box(geometry["h2Text"], 8),
        BODY_RGB,
        30,
        80,
    )
    marker = matching_bbox(
        image,
        scaled_box(geometry["markerText"], 10),
        BODY_RGB,
        30,
        8,
    )
    list_text = matching_bbox(
        image,
        scaled_box(geometry["listText"], 8),
        BODY_RGB,
        30,
        40,
    )

    h2_error = abs(box_center_y(h2_bar) - box_center_y(h2_text))
    marker_error = abs(box_center_y(marker) - box_center_y(list_text))
    assert h2_error <= 6, ("H2 竖线/字形中线误差", h2_error, h2_bar, h2_text)
    assert marker_error <= 6, (
        "列表序号/首行字形中线误差",
        marker_error,
        marker,
        list_text,
    )
    log(
        f"导出字形中线：H2 误差 {h2_error:.1f}px，"
        f"列表误差 {marker_error:.1f}px"
    )


async def run_case(browser: Browser, case: str) -> None:
    context = await browser.new_context(
        viewport={"width": 1536, "height": 1024},
        accept_downloads=True,
    )
    page = await context.new_page()
    page.set_default_timeout(30_000)
    try:
        await wait_for_app(page)
        if case == "1-page":
            expected_pages = 1
            await replace_document_via_paste(page, ONE_PAGE_HTML, 1)
        elif case == "2-page-list-break":
            expected_pages = 2
            await replace_document_via_paste(page, TWO_PAGE_SOURCE_HTML, 1)
            await insert_page_break_inside_list(page)
        elif case == "5-page":
            expected_pages = 5
            await replace_document_via_paste(page, FIVE_PAGE_HTML, 5)
        else:
            raise AssertionError(f"未知用例：{case}")

        await apply_public_exam_theme(page, expected_pages)
        snapshot = await theme_snapshot(page)
        assert_theme_snapshot(snapshot, expected_pages)

        geometry = await capture_geometry(page)
        assert_optical_dom(
            geometry,
            expected_marker_label="10." if case == "5-page" else None,
        )
        name = f"v150-{safe_slug(URL)}-{case}"
        images = await export_current(page, name, expected_pages)
        assert_png_basics(images, expected_pages)
        assert_cover_colors_in_export(images[0])

        if case == "5-page":
            assert geometry["pageIndex"] == 1, geometry
            assert_optical_export(images[geometry["pageIndex"]], geometry)
        log(f"{case} 通过：{expected_pages} 页")
    finally:
        await context.close()


async def main() -> None:
    log(f"目标 {URL}，期望版本 {EXPECTED_VERSION}")
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
            proxy={"server": "http://127.0.0.1:7897"} if USE_PROXY else None,
        )
        try:
            for case in ("1-page", "2-page-list-break", "5-page"):
                await run_case(browser, case)
        finally:
            await browser.close()
    log(f"全部通过；导出证据：{OUT}")


if __name__ == "__main__":
    asyncio.run(main())
