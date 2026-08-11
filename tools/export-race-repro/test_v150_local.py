"""V1.5.x 本地回归：分页不变量、双底图、公考主题与 v1.4 全量基线。

用法：
    cd app && ./node_modules/.bin/vite --host 127.0.0.1 --port 4174 --strictPort
    python3 tools/export-race-repro/test_v150_local.py [URL] [EXPECTED_VERSION]

脚本每次启动全新 Chromium context，不读取或修改用户日常浏览器中的草稿。
验收截图写入 /tmp/xhs-v150-rc/，不污染仓库。
"""

import asyncio
import sys
import zipfile
from pathlib import Path
from typing import Optional

from PIL import Image
from playwright.async_api import Locator, Page, async_playwright


URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4174/"
EXPECTED_VERSION = sys.argv[2] if len(sys.argv) > 2 else "v1.5.0"
OUT = Path("/tmp/xhs-v150-rc")
OUT.mkdir(parents=True, exist_ok=True)

DATA_SVG = (
    "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 "
    "width=%22800%22 height=%22400%22%3E%3Crect width=%22800%22 "
    "height=%22400%22 fill=%22%23699bf7%22/%3E%3C/svg%3E"
)
RESOLVED_DATA_SVG = DATA_SVG.replace("%23699bf7", "%237B3B8B")


def log(message: str) -> None:
    print(f"[v1.5] {message}", flush=True)


async def wait_for_app(page: Page) -> None:
    await page.goto(URL, wait_until="domcontentloaded", timeout=60_000)
    await page.wait_for_selector(".page", timeout=30_000)
    await page.wait_for_function("window.__editor && window.__test")
    await page.wait_for_function(
        "!document.querySelector('.workspace-blocking-layer')",
        timeout=30_000,
    )
    version = (await page.locator(".topbar-version").text_content()) or ""
    assert version == EXPECTED_VERSION, version


async def next_layout(page: Page) -> None:
    await page.evaluate(
        """
        () => new Promise((resolve) => requestAnimationFrame(
          () => requestAnimationFrame(resolve),
        ))
        """
    )


async def set_document(page: Page, document: dict, page_count: int) -> None:
    await page.evaluate(
        "(doc) => window.__editor.commands.setContent(doc)",
        document,
    )
    await page.wait_for_function(
        "(count) => document.querySelectorAll('.page').length === count",
        arg=page_count,
    )
    await next_layout(page)


def image_node(image_id: str, width: Optional[str], align: str = "left") -> dict:
    return {
        "type": "image",
        "attrs": {
            "src": DATA_SVG,
            "assetId": None,
            "imageId": image_id,
            "width": width,
            "height": None,
            "align": align,
        },
    }


async def image_attrs(page: Page, image_id: str) -> dict:
    result = await page.evaluate(
        """
        (wantedId) => {
          let found = null
          const walk = (node) => {
            if (found || !node) return
            if (node.type === 'image' && node.attrs?.imageId === wantedId) {
              found = node.attrs
              return
            }
            for (const child of node.content ?? []) walk(child)
          }
          walk(window.__editor.getJSON())
          return found
        }
        """,
        image_id,
    )
    assert result is not None, f"找不到图片节点 {image_id}"
    return result


async def wait_for_image_attr(
    page: Page,
    image_id: str,
    key: str,
    value: Optional[str],
) -> None:
    await page.wait_for_function(
        """
        ([wantedId, key, expected]) => {
          let actual = Symbol('missing')
          const walk = (node) => {
            if (typeof actual !== 'symbol' || !node) return
            if (node.type === 'image' && node.attrs?.imageId === wantedId) {
              actual = node.attrs?.[key] ?? null
              return
            }
            for (const child of node.content ?? []) walk(child)
          }
          walk(window.__editor.getJSON())
          return typeof actual !== 'symbol' && actual === expected
        }
        """,
        arg=[image_id, key, value],
    )


async def select_image(page: Page, image_id: str) -> Locator:
    image = page.locator(f'.page img[data-image-id="{image_id}"]')
    await image.wait_for()
    await image.click()
    await page.wait_for_function(
        "(id) => window.__editor.getAttributes('image').imageId === id",
        arg=image_id,
    )
    await page.locator(".image-selection-box").wait_for()
    return image


async def recent_actions(page: Page) -> list[str]:
    return await page.locator(".recent-actions li strong").all_text_contents()


async def center(locator: Locator) -> tuple[float, float]:
    box = await locator.bounding_box()
    assert box is not None, f"元素不可见：{locator}"
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


async def drag_by(
    page: Page,
    locator: Locator,
    delta_x: float,
    *,
    escape: bool = False,
) -> None:
    x, y = await center(locator)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + delta_x, y, steps=6)
    if escape:
        await page.keyboard.press("Escape")
    await page.mouse.up()
    await next_layout(page)


async def click_undo(page: Page) -> None:
    button = page.get_by_role("button", name="撤销", exact=True)
    await page.wait_for_function(
        "!document.querySelector('.topbar-history button[aria-label=\"撤销\"]')?.disabled"
    )
    await button.click()


async def click_redo(page: Page) -> None:
    button = page.get_by_role("button", name="重做", exact=True)
    await page.wait_for_function(
        "!document.querySelector('.topbar-history button[aria-label=\"重做\"]')?.disabled"
    )
    await button.click()


async def wait_autosaved_after_change(page: Page) -> None:
    await page.wait_for_function(
        "document.querySelector('.topbar-save-status')?.textContent.includes('已保存') === false",
        timeout=5_000,
    )
    await page.wait_for_function(
        "document.querySelector('.topbar-save-status')?.textContent.includes('已保存')",
        timeout=15_000,
    )


async def highlight_attrs(page: Page) -> Optional[dict]:
    return await page.evaluate(
        """
        () => {
          let found = null
          const walk = (node) => {
            if (found || !node) return
            const mark = node.marks?.find((item) => item.type === 'textHighlight')
            if (mark) {
              found = mark.attrs
              return
            }
            for (const child of node.content ?? []) walk(child)
          }
          walk(window.__editor.getJSON())
          return found
        }
        """
    )


async def wait_for_highlight(page: Page, opacity: Optional[float]) -> None:
    await page.wait_for_function(
        """
        (expected) => {
          let found = null
          const walk = (node) => {
            if (found || !node) return
            const mark = node.marks?.find((item) => item.type === 'textHighlight')
            if (mark) {
              found = mark.attrs
              return
            }
            for (const child of node.content ?? []) walk(child)
          }
          walk(window.__editor.getJSON())
          if (expected === null) return found === null
          return found && Math.abs(found.opacity - expected) < 0.0001
        }
        """,
        arg=opacity,
    )


async def assert_three_column_layout(page: Page) -> None:
    log("验证 1536 / 1440 / 1280 三栏布局")
    viewports = [(1536, 1024), (1440, 900), (1280, 800)]
    for width, height in viewports:
        await page.set_viewport_size({"width": width, "height": height})
        await next_layout(page)
        metrics = await page.evaluate(
            """
            () => {
              const rect = (selector) => {
                const value = document.querySelector(selector).getBoundingClientRect()
                return {
                  x: value.x,
                  y: value.y,
                  width: value.width,
                  height: value.height,
                  right: value.right,
                  bottom: value.bottom,
                }
              }
              return {
                innerWidth,
                innerHeight,
                scrollWidth: document.documentElement.scrollWidth,
                topbar: rect('.workspace-topbar'),
                actions: rect('.topbar-actions'),
                grid: rect('.workspace-grid'),
                editor: rect('.workspace-editor-panel'),
                canvas: rect('.workspace-canvas-panel'),
                inspector: rect('.workspace-inspector-panel'),
              }
            }
            """
        )
        topbar = metrics["topbar"]
        editor = metrics["editor"]
        canvas = metrics["canvas"]
        inspector = metrics["inspector"]
        actions = metrics["actions"]
        assert metrics["scrollWidth"] <= width + 1, metrics
        assert abs(topbar["height"] - 74) <= 1, metrics
        assert abs(metrics["grid"]["y"] - topbar["bottom"]) <= 1, metrics
        assert abs(editor["right"] - canvas["x"]) <= 1, metrics
        assert abs(canvas["right"] - inspector["x"]) <= 1, metrics
        assert abs(inspector["right"] - width) <= 1, metrics
        assert editor["width"] >= 380, metrics
        assert canvas["width"] >= 500, metrics
        assert inspector["width"] >= 330, metrics
        assert actions["x"] >= 0 and actions["right"] <= width, metrics
        assert actions["y"] >= 0 and actions["bottom"] <= topbar["bottom"], metrics
        await page.screenshot(path=str(OUT / f"layout-{width}x{height}.png"))

    await page.set_viewport_size({"width": 1536, "height": 1024})
    await next_layout(page)


async def assert_image_gestures(page: Page) -> None:
    log("验证无移动不提交、缩放/对齐单次 undo-redo 与 Esc 回滚")
    await set_document(
        page,
        {"type": "doc", "content": [image_node("no-move", None)]},
        1,
    )
    await select_image(page, "no-move")
    before_actions = await recent_actions(page)
    handle = page.locator(".image-resize-handle--right-bottom").first
    x, y = await center(handle)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.wait_for_function("document.querySelector('.topbar-export').disabled")
    await page.mouse.up()
    await page.wait_for_function("!document.querySelector('.topbar-export').disabled")
    assert (await image_attrs(page, "no-move"))["width"] is None
    assert await recent_actions(page) == before_actions

    await set_document(
        page,
        {"type": "doc", "content": [image_node("resize-one", "50%")]},
        1,
    )
    image = await select_image(page, "resize-one")
    before_actions = await recent_actions(page)
    page_box = await page.locator(".page").bounding_box()
    assert page_box is not None
    # 50% -> 66% 在 0.4 预览下约 59 CSS px，用真实画布比例计算。
    resize_delta = page_box["width"] * (920 / 1080) * (0.66 - 0.50)
    await drag_by(page, handle, resize_delta)
    await wait_for_image_attr(page, "resize-one", "width", "66%")
    after_resize_actions = await recent_actions(page)
    assert len(after_resize_actions) == len(before_actions) + 1
    assert after_resize_actions[0] == "调整为 66%", after_resize_actions
    await click_undo(page)
    await wait_for_image_attr(page, "resize-one", "width", "50%")
    await click_redo(page)
    await wait_for_image_attr(page, "resize-one", "width", "66%")
    assert await recent_actions(page) == after_resize_actions

    await set_document(
        page,
        {"type": "doc", "content": [image_node("align-one", "50%", "left")]},
        1,
    )
    image = await select_image(page, "align-one")
    before_actions = await recent_actions(page)
    grip = page.locator(".image-drag-grip").first
    page_box = await page.locator(".page").bounding_box()
    image_box = await image.bounding_box()
    assert page_box is not None and image_box is not None
    center_delta = (
        page_box["x"]
        + page_box["width"] / 2
        - image_box["width"] / 2
        - image_box["x"]
    )
    await drag_by(page, grip, center_delta)
    await wait_for_image_attr(page, "align-one", "align", "center")
    after_align_actions = await recent_actions(page)
    assert len(after_align_actions) == len(before_actions) + 1
    assert after_align_actions[0] == "居中对齐", after_align_actions
    await click_undo(page)
    await wait_for_image_attr(page, "align-one", "align", "left")
    await click_redo(page)
    await wait_for_image_attr(page, "align-one", "align", "center")

    # 已发生 DOM 预览变化后按 Esc：JSON 与最近操作都必须不变。
    before_escape_attrs = await image_attrs(page, "align-one")
    before_escape_actions = await recent_actions(page)
    handle = page.locator(".image-resize-handle--right-bottom").first
    await drag_by(page, handle, -35, escape=True)
    assert await image_attrs(page, "align-one") == before_escape_attrs
    assert await recent_actions(page) == before_escape_actions
    assert not await page.get_by_role("button", name="导出 PNG").is_disabled()


async def assert_second_page_mapping_and_layers(page: Page) -> None:
    log("验证第二页 imageId 映射与编辑辅助层结构")
    document = {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "第一页"}]},
            image_node("page-one-image", "33%"),
            {"type": "horizontalRule"},
            {"type": "paragraph", "content": [{"type": "text", "text": "第二页"}]},
            image_node("page-two-image", "50%"),
        ],
    }
    await set_document(page, document, 2)
    groups = page.locator(".page-preview-group")
    assert await groups.count() == 2
    assert await groups.nth(0).locator('[data-image-id="page-one-image"]').count() == 1
    assert await groups.nth(1).locator('[data-image-id="page-two-image"]').count() == 1
    await select_image(page, "page-two-image")
    assert await groups.nth(0).locator(".image-selection-box").count() == 0
    assert await groups.nth(1).locator(".image-selection-box").count() == 1
    selected_id = await page.evaluate(
        "window.__editor.getAttributes('image').imageId"
    )
    assert selected_id == "page-two-image", selected_id

    before_actions = await recent_actions(page)
    await page.get_by_role("button", name="75%", exact=True).click()
    await wait_for_image_attr(page, "page-two-image", "width", "75%")
    assert (await image_attrs(page, "page-one-image"))["width"] == "33%"
    assert await page.locator(".page").count() == 2
    after_actions = await recent_actions(page)
    assert len(after_actions) == len(before_actions) + 1
    assert after_actions[0] == "调整为 75%", after_actions

    for label in ("裁切参考", "排版参考"):
        switch = page.get_by_role("switch", name=label, exact=True)
        if await switch.get_attribute("aria-checked") != "true":
            await switch.click()
    await next_layout(page)

    structure = await page.evaluate(
        """
        () => {
          const helperSelector = [
            '.canvas-interaction-layer',
            '.cover-crop-preview',
            '.layout-guides',
            '.image-selection-box',
            '.snap-guide',
            '.gesture-feedback',
            '.canvas-overflow-warning',
            '[data-preview-only]',
          ].join(',')
          const pages = [...document.querySelectorAll('.page')]
          return {
            pages: pages.length,
            layers: document.querySelectorAll('.canvas-interaction-layer').length,
            pageHelpers: pages.reduce(
              (sum, item) => sum + item.querySelectorAll(helperSelector).length,
              0,
            ),
            siblingLayers: pages.every((item) =>
              item.parentElement?.querySelector(':scope > .canvas-interaction-layer'),
            ),
            cropCount: document.querySelectorAll('.cover-crop-preview').length,
            layoutCount: document.querySelectorAll('.layout-guides').length,
            selectionCount: document.querySelectorAll('.image-selection-box').length,
          }
        }
        """
    )
    assert structure == {
        "pages": 2,
        "layers": 2,
        "pageHelpers": 0,
        "siblingLayers": True,
        "cropCount": 1,
        "layoutCount": 2,
        "selectionCount": 1,
    }, structure

    # 拖到吸附点时 snap/feedback 也必须仍在 .page 外，随后 Esc 回滚。
    second_image = groups.nth(1).locator('[data-image-id="page-two-image"]')
    page_box = await groups.nth(1).locator(".page").bounding_box()
    image_box = await second_image.bounding_box()
    grip = groups.nth(1).locator(".image-drag-grip")
    assert page_box is not None and image_box is not None
    delta = (
        page_box["x"]
        + page_box["width"] / 2
        - image_box["width"] / 2
        - image_box["x"]
    )
    x, y = await center(grip)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + delta, y, steps=6)
    await page.locator(".snap-guide").wait_for()
    assert await page.locator(".page .snap-guide").count() == 0
    assert await page.locator(".page .gesture-feedback").count() == 0
    await page.keyboard.press("Escape")
    await page.mouse.up()
    await wait_for_image_attr(page, "page-two-image", "align", "left")


async def assert_highlight(page: Page) -> None:
    log("验证荧光笔 50% / 0% / 100% 与 undo-redo")
    await set_document(
        page,
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "abcdef"}],
                }
            ],
        },
        1,
    )
    await page.evaluate(
        "() => window.__editor.commands.setTextSelection({ from: 1, to: 4 })"
    )
    slider = page.get_by_role("slider", name="荧光笔透明度")
    await slider.wait_for()

    await page.get_by_role(
        "button", name="应用 50% 荧光笔", exact=True
    ).click()
    await wait_for_highlight(page, 0.5)
    mark = await highlight_attrs(page)
    assert mark == {"color": "#7B3B8B", "opacity": 0.5}, mark
    assert await page.locator(".page [data-text-highlight]").text_content() == "abc"
    assert (
        await page.locator(".page [data-text-highlight]").get_attribute(
            "data-highlight-opacity"
        )
        == "0.5"
    )
    await click_undo(page)
    await wait_for_highlight(page, None)
    await click_redo(page)
    await wait_for_highlight(page, 0.5)

    await slider.focus()
    await page.keyboard.press("Home")
    await wait_for_highlight(page, 0)
    assert await slider.evaluate("(el) => document.activeElement === el")
    await click_undo(page)
    await wait_for_highlight(page, 0.5)
    await click_redo(page)
    await wait_for_highlight(page, 0)

    await slider.focus()
    await page.keyboard.press("End")
    await wait_for_highlight(page, 1)
    assert await slider.evaluate("(el) => document.activeElement === el")
    await click_undo(page)
    await wait_for_highlight(page, 0)
    await click_redo(page)
    await wait_for_highlight(page, 1)

    after_actions = await recent_actions(page)
    # 最近操作固定只保留 5 条；这里用头部顺序确认三次输入各记录一次，
    # 同时确认 undo/redo 没有产生重复业务日志。
    assert after_actions[:3] == [
        "荧光笔 100%",
        "荧光笔 0%",
        "荧光笔 50%",
    ], after_actions

    # 粘贴/旧 JSON 不得绕过固定基色不变量。
    await set_document(
        page,
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "fixed-color",
                            "marks": [
                                {
                                    "type": "textHighlight",
                                    "attrs": {"color": "#FF0000", "opacity": 0.75},
                                }
                            ],
                        }
                    ],
                }
            ],
        },
        1,
    )
    mark = await highlight_attrs(page)
    assert mark == {"color": "#7B3B8B", "opacity": 0.75}, mark
    rendered = await page.locator(".page [data-text-highlight]").first.get_attribute("style")
    assert rendered and "rgba(123, 59, 139, 0.75)" in rendered, rendered


async def assert_image_keyboard_and_resource_history(page: Page) -> None:
    log("验证图片键盘可达性与资源同步后的 undo 边界")
    await set_document(
        page,
        {"type": "doc", "content": [image_node("keyboard-image", "50%", "left")]},
        1,
    )
    image = page.locator('.page .content [data-image-id="keyboard-image"]').first
    await image.wait_for()
    assert await image.get_attribute("role") == "button"
    assert await image.get_attribute("tabindex") == "0"
    await image.focus()
    await page.keyboard.press("Enter")
    await page.locator(".image-selection-box").wait_for()
    assert await page.locator(
        ".image-selection-box .image-drag-grip[tabindex], "
        ".image-selection-box .image-resize-handle[tabindex]"
    ).count() == 0

    checked = page.locator('[role="radio"][aria-checked="true"]')
    await checked.focus()
    await page.keyboard.press("ArrowRight")
    await wait_for_image_attr(page, "keyboard-image", "align", "center")

    # 模拟 retryResources 的 addToHistory=false src 同步。撤销对齐时
    # 只能还原语义属性，不能把旧 blob/data src 带回来。
    await page.evaluate(
        """
        ([wantedId, resolvedSrc]) => {
          const editor = window.__editor
          let position = null
          editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'image' && node.attrs.imageId === wantedId) {
              position = pos
              return false
            }
            return true
          })
          if (position === null) throw new Error('missing image')
          editor.view.dispatch(
            editor.state.tr
              .setNodeAttribute(position, 'src', resolvedSrc)
              .setMeta('addToHistory', false),
          )
        }
        """,
        ["keyboard-image", RESOLVED_DATA_SVG],
    )
    await click_undo(page)
    attrs = await image_attrs(page, "keyboard-image")
    assert attrs["align"] == "left", attrs
    assert attrs["src"] == RESOLVED_DATA_SVG, attrs
    await click_redo(page)
    attrs = await image_attrs(page, "keyboard-image")
    assert attrs["align"] == "center", attrs
    assert attrs["src"] == RESOLVED_DATA_SVG, attrs


async def assert_draft_history_boundary(page: Page) -> None:
    log("验证草稿切换后撤销不跨文档")
    await set_document(
        page,
        {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "draft-a"}]}
            ],
        },
        1,
    )
    await wait_autosaved_after_change(page)
    await page.get_by_role("button", name="打开草稿管理", exact=True).click()
    dialog = page.get_by_role("dialog")
    await dialog.get_by_placeholder("例如：行政执法卷第一题").fill("V1.4 history-b")
    await dialog.get_by_role("button", name="另存为", exact=True).click()
    await dialog.get_by_text("V1.4 history-b", exact=True).first.wait_for()
    await page.keyboard.press("Escape")

    await set_document(
        page,
        {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "draft-b"}]}
            ],
        },
        1,
    )
    await wait_autosaved_after_change(page)
    await page.get_by_role("button", name="打开草稿管理", exact=True).click()
    original = dialog.locator("article", has_text="未命名草稿")
    await original.get_by_role("button", name="打开", exact=True).click()
    await page.wait_for_function("window.__editor.getText().includes('draft-a')")
    undo = page.get_by_role("button", name="撤销", exact=True)
    assert await undo.is_disabled()
    assert await page.evaluate("window.__editor.commands.undo()") is False
    assert await page.evaluate("window.__editor.getText()") == "draft-a"


async def assert_missing_image_preflight(page: Page) -> None:
    log("验证缺图导出预检的重新检查 / 仍然导出")
    await set_document(
        page,
        {
            "type": "doc",
            "content": [
                {
                    "type": "image",
                    "attrs": {
                        "src": "data:image/png;base64,broken",
                        "assetId": "missing-v140",
                        "imageId": "broken-v140",
                        "width": "50%",
                        "height": None,
                        "align": "left",
                    },
                }
            ],
        },
        1,
    )
    await page.wait_for_function(
        """
        () => {
          const image = document.querySelector(
            '.page img[data-image-id="broken-v140"]',
          )
          return image && image.complete && image.naturalWidth === 0
        }
        """
    )
    await page.get_by_role("button", name="导出 PNG").click()
    dialog = page.get_by_role("dialog")
    await dialog.wait_for()
    await dialog.get_by_role("button", name="导出", exact=True).click()
    alert = dialog.get_by_role("alert")
    await alert.wait_for()
    alert_text = (await alert.text_content()) or ""
    assert "部分资源尚未就绪" in alert_text, alert_text
    assert "missing-v140" in alert_text, alert_text
    assert "图片载入失败" in alert_text, alert_text
    assert await dialog.get_by_role(
        "button", name="重新检查", exact=True
    ).count() == 1
    assert await dialog.get_by_role(
        "button", name="仍然导出", exact=True
    ).count() == 1

    await dialog.get_by_role("button", name="重新检查", exact=True).click()
    await dialog.get_by_role("alert").wait_for()
    await page.wait_for_function(
        """
        () => {
          const dialog = document.querySelector('[role="dialog"]')
          const retry = [...dialog.querySelectorAll('button')].find(
            (button) => button.textContent.includes('重新检查'),
          )
          return retry && !retry.disabled
        }
        """
    )

    async with page.expect_download(timeout=90_000) as download_info:
        await dialog.get_by_role("button", name="仍然导出", exact=True).click()
    download = await download_info.value
    assert download.suggested_filename.endswith(".png"), download.suggested_filename
    download_path = await download.path()
    assert download_path is not None
    with Image.open(download_path) as image:
        assert image.size == (2160, 3600), image.size
    await dialog.wait_for(state="hidden")


async def assert_page_break_invariants(page: Page) -> None:
    log("验证原始 setContent、段尾分页和含分页列表粘贴")

    await page.wait_for_timeout(600)
    await page.evaluate(
        """
        () => {
          const editor = window.__editor
          window.__pageBreakBaseline = editor.getJSON()
          editor.commands.setContent({
            type: 'doc',
            content: [
              {
                type: 'orderedList',
                attrs: { start: 6 },
                content: [{
                  type: 'listItem',
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: '前半' }] },
                    { type: 'horizontalRule' },
                    { type: 'paragraph', content: [{ type: 'text', text: '后半' }] },
                  ],
                }],
              },
              { type: 'paragraph', content: [{ type: 'text', text: '结尾' }] },
            ],
          })
        }
        """
    )
    await page.wait_for_function(
        """
        () => {
          let rootBreaks = 0
          let nestedBreaks = 0
          window.__editor.state.doc.descendants((node, _pos, parent) => {
            if (node.type.name !== 'horizontalRule') return true
            if (parent?.type.name === 'doc') rootBreaks += 1
            else nestedBreaks += 1
            return true
          })
          return rootBreaks === 1 && nestedBreaks === 0 &&
            document.querySelectorAll('.page').length === 2
        }
        """
    )
    normalized = await page.evaluate(
        """
        () => ({
          text: window.__editor.state.doc.textContent,
          rootTypes: window.__editor.getJSON().content.map((node) => node.type),
        })
        """
    )
    assert normalized["text"] == "前半后半结尾", normalized
    assert "horizontalRule" in normalized["rootTypes"], normalized
    assert await page.evaluate("window.__editor.commands.undo()") is True
    await page.wait_for_function(
        """
        () => JSON.stringify(window.__editor.getJSON()) ===
          JSON.stringify(window.__pageBreakBaseline)
        """
    )
    assert await page.evaluate("window.__editor.commands.redo()") is True
    await page.wait_for_function(
        "document.querySelectorAll('.page').length === 2"
    )

    await page.evaluate(
        """
        () => {
          const editor = window.__editor
          editor.commands.setContent('<p>第一页末尾</p>')
          editor.commands.setTextSelection(editor.state.doc.firstChild.content.size + 1)
        }
        """
    )
    await page.get_by_role("button", name="插入分页", exact=True).click()
    await page.wait_for_function(
        """
        () => window.__editor.state.selection.constructor.name === 'TextSelection' &&
          window.__editor.state.selection.$from.parent.type.name === 'paragraph' &&
          document.querySelectorAll('.page').length === 2
        """
    )
    await page.keyboard.type("第二页输入")
    await page.wait_for_function(
        """
        () => document.querySelectorAll('.page')[1]?.textContent.includes('第二页输入')
        """
    )

    paste_result = await page.evaluate(
        """
        () => {
          const editor = window.__editor
          editor.commands.setContent(
            '<ol start="8"><li><p>已有一</p></li><li><p>已有二</p></li></ol>',
          )
          let cursor = -1
          editor.state.doc.descendants((node, pos) => {
            if (cursor >= 0 || !node.isText || !node.text.includes('已有一')) return true
            cursor = pos + node.text.indexOf('已有一') + 2
            return false
          })
          editor.commands.setTextSelection(cursor)
          const clipboard = new DataTransfer()
          clipboard.setData(
            'text/html',
            '<ol start="4"><li><p>粘贴四</p><hr class="page-break"></li>' +
              '<li><p>粘贴五</p></li></ol>',
          )
          clipboard.setData('text/plain', '粘贴四\\n粘贴五')
          const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: clipboard,
          })
          return editor.view.dom.dispatchEvent(event)
        }
        """
    )
    assert paste_result is False, "分页粘贴应被生产插件 preventDefault"
    await page.wait_for_function(
        """
        () => window.__editor.state.doc.textContent === '已有一粘贴四粘贴五已有二' &&
          document.querySelectorAll('.page').length === 2
        """
    )
    starts = await page.evaluate(
        """
        () => window.__editor.getJSON().content
          .filter((node) => node.type === 'orderedList')
          .map((node) => node.attrs.start)
        """
    )
    assert starts == [8, 4, 5, 9], starts
    assert await page.evaluate("window.__editor.commands.undo()") is True
    await page.wait_for_function(
        "window.__editor.state.doc.textContent === '已有一已有二'"
    )
    assert await page.evaluate("window.__editor.commands.redo()") is True
    await page.wait_for_function(
        "window.__editor.state.doc.textContent === '已有一粘贴四粘贴五已有二'"
    )


async def assert_public_exam_theme(page: Page) -> None:
    log("验证公考双底图、语义色、三档预览与两页 ZIP 导出")
    document = {
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 1},
                "content": [{"type": "text", "text": "申论高分方法"}],
            },
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": "材料阅读 · 归纳概括 · 规范表达",
                    }
                ],
            },
            {"type": "horizontalRule"},
            {
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": "提出对策题"}],
            },
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": "先定位问题，再从材料中提炼主体、动作与目标。",
                    }
                ],
            },
            {
                "type": "blockquote",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "text",
                                "text": "对策必须能对应问题，并具备可执行性。",
                            }
                        ],
                    }
                ],
            },
            {
                "type": "heading",
                "attrs": {"level": 3},
                "content": [{"type": "text", "text": "作答步骤"}],
            },
            {
                "type": "orderedList",
                "attrs": {"start": 1},
                "content": [
                    {
                        "type": "listItem",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {"type": "text", "text": "概括核心问题"}
                                ],
                            }
                        ],
                    },
                    {
                        "type": "listItem",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {"type": "text", "text": "匹配材料做法"}
                                ],
                            }
                        ],
                    },
                    {
                        "type": "listItem",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [
                                    {"type": "text", "text": "压缩为规范表述"}
                                ],
                            }
                        ],
                    },
                ],
            },
        ],
    }
    await set_document(page, document, 2)
    before_theme = await page.evaluate("window.__editor.getJSON()")

    for label in ("裁切参考", "排版参考"):
        switch = page.get_by_role("switch", name=label, exact=True)
        if await switch.get_attribute("aria-checked") == "true":
            await switch.click()

    await page.get_by_role("button", name="主题库", exact=True).click()
    dialog = page.get_by_role("dialog")
    card = dialog.locator(
        '[data-theme-id="builtin-public-exam-landscape"]'
    )
    await card.wait_for()
    assert await card.locator('[data-page-backgrounds="cover-inner"]').count() == 1
    await card.get_by_role("button", name="应用", exact=True).click()
    await dialog.wait_for(state="hidden")
    await page.wait_for_function(
        """
        () => {
          const pages = [...document.querySelectorAll(
            '.page.theme-public-exam-landscape',
          )]
          const backgrounds = pages.map((item) => item.querySelector('img.bg'))
          return pages.length === 2 && backgrounds.every(
            (image) => image && image.complete && image.naturalWidth > 0,
          ) && !document.querySelector('.workspace-blocking-layer')
        }
        """
    )
    await next_layout(page)

    after_theme = await page.evaluate("window.__editor.getJSON()")
    assert after_theme == before_theme, "样式主题不得替换或改写正文 JSON"

    visual = await page.evaluate(
        """
        () => {
          const pages = [...document.querySelectorAll('.page')]
          const cover = pages[0]
          const inner = pages[1]
          const coverStyle = getComputedStyle(cover)
          const innerStyle = getComputedStyle(inner)
          const coverTag = cover.querySelector('.page-tag')
          const innerTag = inner.querySelector('.page-tag')
          const path = (item) => new URL(item.currentSrc || item.src).pathname
          return {
            coverBackground: path(cover.querySelector('img.bg')),
            innerBackground: path(inner.querySelector('img.bg')),
            coverTitle: getComputedStyle(
              cover.querySelector('.content > h1:first-of-type'),
            ).color,
            coverSubtitle: getComputedStyle(
              cover.querySelector('.content > h1:first-of-type + p'),
            ).color,
            innerText: getComputedStyle(
              inner.querySelector('.content > p'),
            ).color,
            coverPadding: [
              coverStyle.getPropertyValue('--page-padding-x').trim(),
              coverStyle.getPropertyValue('--page-padding-top').trim(),
              coverStyle.getPropertyValue('--page-padding-bottom').trim(),
            ],
            innerPadding: [
              innerStyle.getPropertyValue('--page-padding-x').trim(),
              innerStyle.getPropertyValue('--page-padding-top').trim(),
              innerStyle.getPropertyValue('--page-padding-bottom').trim(),
            ],
            overlays: pages.map(
              (item) => getComputedStyle(item.querySelector('.overlay')).opacity,
            ),
            logos: pages.reduce(
              (total, item) => total + item.querySelectorAll('.logo').length,
              0,
            ),
            coverTagDisplay: getComputedStyle(coverTag).display,
            innerTagTop: getComputedStyle(innerTag).top,
            innerTagRight: getComputedStyle(innerTag).right,
          }
        }
        """
    )
    assert visual["coverBackground"].endswith(
        "/builtin-assets/bg-public-exam-landscape-cover-v1.png"
    ), visual
    assert visual["innerBackground"].endswith(
        "/builtin-assets/bg-public-exam-landscape-inner-v1.png"
    ), visual
    assert visual["coverTitle"] == "rgb(109, 19, 108)", visual
    assert visual["coverSubtitle"] == "rgb(90, 70, 95)", visual
    assert visual["innerText"] == "rgb(45, 41, 43)", visual
    assert visual["coverPadding"] == ["120px", "340px", "620px"], visual
    assert visual["innerPadding"] == ["96px", "180px", "300px"], visual
    assert visual["overlays"] == ["0", "0"], visual
    assert visual["logos"] == 0, visual
    assert visual["coverTagDisplay"] == "none", visual
    assert visual["innerTagTop"] == "112px", visual
    assert visual["innerTagRight"] == "96px", visual

    title_input = page.get_by_role("textbox", name="主标题颜色", exact=True)
    subtitle_input = page.get_by_role("textbox", name="副标题颜色", exact=True)
    await title_input.fill("#123")
    await title_input.blur()
    await page.get_by_role("alert").filter(has_text="6 位十六进制颜色").wait_for()
    assert await page.locator(
        '.page--first .content > h1:first-of-type'
    ).evaluate("(item) => getComputedStyle(item).color") == "rgb(109, 19, 108)"

    await page.get_by_role(
        "button", name="恢复模板颜色", exact=True
    ).click()
    await page.wait_for_function(
        """
        () => {
          const input = document.querySelector(
            'input[aria-label="主标题颜色"]',
          )
          return input?.value === '#6D136C' && !input.hasAttribute('aria-invalid')
        }
        """
    )

    await title_input.fill("#123456")
    await title_input.press("Enter")
    await subtitle_input.fill("#654321")
    await subtitle_input.press("Enter")
    await page.wait_for_function(
        """
        () => {
          const cover = document.querySelector('.page--first')
          return getComputedStyle(
            cover.querySelector('.content > h1:first-of-type'),
          ).color === 'rgb(18, 52, 86)' && getComputedStyle(
            cover.querySelector('.content > h1:first-of-type + p'),
          ).color === 'rgb(101, 67, 33)'
        }
        """
    )
    await page.get_by_role(
        "button", name="恢复模板颜色", exact=True
    ).click()
    await page.wait_for_function(
        """
        () => getComputedStyle(
          document.querySelector('.page--first .content > h1:first-of-type'),
        ).color === 'rgb(109, 19, 108)'
        """
    )

    for width, height in ((1280, 800), (1440, 900), (1536, 1024)):
        await page.set_viewport_size({"width": width, "height": height})
        await page.locator(".workspace-canvas-pages").evaluate(
            "(item) => { item.scrollTop = 0 }"
        )
        await next_layout(page)
        await page.screenshot(
            path=str(OUT / f"public-exam-{width}x{height}.png")
        )

    await page.set_viewport_size({"width": 1536, "height": 1024})
    await next_layout(page)
    await page.locator(".page").nth(0).screenshot(
        path=str(OUT / "public-exam-preview-cover.png")
    )
    await page.locator(".page").nth(1).screenshot(
        path=str(OUT / "public-exam-preview-inner.png")
    )

    await page.get_by_role("button", name="导出 PNG", exact=True).click()
    export_dialog = page.get_by_role("dialog")
    filename = export_dialog.get_by_role("textbox")
    await filename.fill("public-exam-v150")
    async with page.expect_download(timeout=120_000) as download_info:
        await export_dialog.get_by_role("button", name="导出", exact=True).click()
    download = await download_info.value
    assert download.suggested_filename == "public-exam-v150.zip"
    zip_path = OUT / "public-exam-v150.zip"
    await download.save_as(str(zip_path))
    await export_dialog.wait_for(state="hidden")

    with zipfile.ZipFile(zip_path) as archive:
        members = sorted(
            name for name in archive.namelist() if name.lower().endswith(".png")
        )
        assert members == [
            "public-exam-v150-1.png",
            "public-exam-v150-2.png",
        ], members
        for member in members:
            archive.extract(member, OUT)

    cover_export = OUT / members[0]
    inner_export = OUT / members[1]
    with Image.open(cover_export) as cover_image, Image.open(
        inner_export
    ) as inner_image:
        assert cover_image.size == (2160, 3600), cover_image.size
        assert inner_image.size == (2160, 3600), inner_image.size
        cover_pixel = cover_image.convert("RGB").getpixel((200, 164))
        inner_pixel = inner_image.convert("RGB").getpixel((200, 164))
        assert min(cover_pixel) > 220, cover_pixel
        assert (
            inner_pixel[0] > 100
            and inner_pixel[1] < 115
            and inner_pixel[2] > 100
            and abs(inner_pixel[0] - inner_pixel[2]) < 35
        ), inner_pixel

    log(f"公考主题截图与导出：{OUT}")


async def main() -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1536, "height": 1024},
            accept_downloads=True,
        )
        page = await context.new_page()
        page.set_default_timeout(30_000)
        try:
            await wait_for_app(page)
            await assert_page_break_invariants(page)
            await assert_three_column_layout(page)
            await assert_image_gestures(page)
            await assert_second_page_mapping_and_layers(page)
            await assert_highlight(page)
            await assert_image_keyboard_and_resource_history(page)
            await assert_draft_history_boundary(page)
            await assert_missing_image_preflight(page)
            await assert_public_exam_theme(page)
            log(f"全部通过；布局截图：{OUT}")
        finally:
            await context.close()
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
