"""v1.5.1 本地专项：全局历史快捷键、标题边界与 H1–H3 限制。

用法：
    cd app && ./node_modules/.bin/vite --host 127.0.0.1 --port 4174 --strictPort
    python3 tools/export-race-repro/test_v151_local.py [URL] [EXPECTED_VERSION] [OUT]

构建后只做视觉验收（preview 不暴露 dev hooks）：
    python3 tools/export-race-repro/test_v151_local.py URL v1.5.1 OUT visual-only

构建后生成公考封面建议内容区截图：
    python3 tools/export-race-repro/test_v151_local.py URL v1.5.1 OUT safe-area-only

每次启动全新 Chromium context，不读写用户日常浏览器的草稿。
"""

import asyncio
import sys
from pathlib import Path
from typing import Any, Dict, List

from playwright.async_api import BrowserContext, Locator, Page, async_playwright


URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4174/"
EXPECTED_VERSION = sys.argv[2] if len(sys.argv) > 2 else "v1.5.1"
OUT = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("/tmp/xhs-v151-rc")
MODE = sys.argv[4] if len(sys.argv) > 4 else "full"
VISUAL_ONLY = MODE == "visual-only"
SAFE_AREA_ONLY = MODE == "safe-area-only"
OUT.mkdir(parents=True, exist_ok=True)


def log(message: str) -> None:
    print(f"[v1.5.1] {message}", flush=True)


async def next_layout(page: Page) -> None:
    await page.evaluate(
        """
        () => new Promise((resolve) => requestAnimationFrame(
          () => requestAnimationFrame(resolve),
        ))
        """
    )


async def wait_for_app(page: Page, require_hooks: bool = True) -> None:
    await page.goto(URL, wait_until="domcontentloaded", timeout=60_000)
    await page.wait_for_selector(".page", timeout=30_000)
    if require_hooks:
        await page.wait_for_function("window.__editor && window.__test")
    await page.wait_for_function(
        "!document.querySelector('.workspace-blocking-layer')",
        timeout=30_000,
    )
    version = (await page.locator(".topbar-version").text_content()) or ""
    assert version == EXPECTED_VERSION, version


async def set_html(page: Page, html: str) -> None:
    await page.evaluate("(value) => window.__editor.commands.setContent(value)", html)
    await next_layout(page)


async def set_json(page: Page, document: Dict[str, Any]) -> None:
    await page.evaluate("(value) => window.__editor.commands.setContent(value)", document)
    await next_layout(page)


async def editor_text(page: Page) -> str:
    return await page.evaluate("window.__editor.getText()")


async def editor_json(page: Page) -> Dict[str, Any]:
    return await page.evaluate("window.__editor.getJSON()")


async def focus_end(page: Page) -> None:
    await page.evaluate("window.__editor.commands.focus('end')")


async def synthetic_shortcut(
    page: Page,
    selector: str,
    *,
    key: str = "z",
    meta: bool = True,
    control: bool = False,
    shift: bool = False,
    alt: bool = False,
    composing: bool = False,
) -> bool:
    return await page.evaluate(
        """
        ([selector, init]) => {
          const target = document.querySelector(selector)
          if (!target) throw new Error(`找不到快捷键目标：${selector}`)
          const event = new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: init.key,
            metaKey: init.meta,
            ctrlKey: init.control,
            shiftKey: init.shift,
            altKey: init.alt,
            isComposing: init.composing,
          })
          target.dispatchEvent(event)
          return event.defaultPrevented
        }
        """,
        [
            selector,
            {
                "key": key,
                "meta": meta,
                "control": control,
                "shift": shift,
                "alt": alt,
                "composing": composing,
            },
        ],
    )


async def root_blocks(page: Page, count: int) -> List[Dict[str, Any]]:
    return await page.evaluate(
        """
        (count) => window.__editor.getJSON().content.slice(0, count).map((node) => ({
          type: node.type,
          level: node.attrs?.level ?? null,
          text: (node.content ?? []).map((child) => child.text ?? '').join(''),
        }))
        """,
        count,
    )


async def text_ranges(page: Page) -> Dict[str, Dict[str, int]]:
    return await page.evaluate(
        """
        () => {
          const ranges = {}
          window.__editor.state.doc.descendants((node, position) => {
            if (node.isText && node.text) {
              ranges[node.text] = { from: position, to: position + node.nodeSize }
            }
            return true
          })
          return ranges
        }
        """
    )


async def select_positions(page: Page, anchor: int, head: int) -> None:
    await page.evaluate(
        """
        ([anchor, head]) => {
          const editor = window.__editor
          const SelectionClass = editor.state.selection.constructor
          const selection = SelectionClass.create(editor.state.doc, anchor, head)
          editor.view.dispatch(editor.state.tr.setSelection(selection))
          editor.commands.focus()
        }
        """,
        [anchor, head],
    )


def signature(*items: tuple[str, Any]) -> List[Dict[str, Any]]:
    return [{"type": node_type, "level": level} for node_type, level in items]


def compact_blocks(blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [{"type": item["type"], "level": item["level"]} for item in blocks]


async def assert_history_focus_matrix(
    page: Page,
    context: BrowserContext,
) -> None:
    log("检查编辑器内单次 undo/redo")
    assert await page.get_by_role("button", name="撤销", exact=True).is_disabled()
    failed_default = await synthetic_shortcut(
        page, 'button[role="switch"][title*="裁切参考"]'
    )
    assert failed_default is False

    await set_html(page, "<p>BASE</p>")
    await asyncio.sleep(0.65)
    await focus_end(page)
    await page.keyboard.type("A")
    await asyncio.sleep(0.65)
    await page.keyboard.type("B")
    assert await editor_text(page) == "BASEAB"
    await page.keyboard.press("Meta+z")
    assert await editor_text(page) == "BASEA"
    await page.keyboard.press("Meta+Shift+z")
    assert await editor_text(page) == "BASEAB"

    log("检查顶栏与空画布失焦后的全局历史")
    await asyncio.sleep(0.65)
    await focus_end(page)
    await page.keyboard.type("C")
    crop = page.get_by_role("switch", name="裁切参考")
    await crop.click()
    await page.keyboard.press("Meta+z")
    assert await editor_text(page) == "BASEAB"
    await page.keyboard.press("Control+y")
    assert await editor_text(page) == "BASEABC"

    await asyncio.sleep(0.65)
    await focus_end(page)
    await page.keyboard.type("D")
    await page.locator(".workspace-canvas-heading").click()
    await page.keyboard.press("Meta+z")
    assert await editor_text(page) == "BASEABC"
    await page.keyboard.press("Meta+Shift+z")
    assert await editor_text(page) == "BASEABCD"

    log("检查点击画布图片后的全局撤销")
    await set_json(
        page,
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "CANVAS"}],
                },
                {
                    "type": "image",
                    "attrs": {
                        "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200'%3E%3Crect width='400' height='200' fill='%237B3B8B'/%3E%3C/svg%3E",
                        "assetId": None,
                        "imageId": "v151-image",
                        "width": "50%",
                        "height": None,
                        "align": "center",
                    },
                },
                {"type": "paragraph"},
            ],
        },
    )
    await asyncio.sleep(0.65)
    ranges = await text_ranges(page)
    await select_positions(page, ranges["CANVAS"]["to"], ranges["CANVAS"]["to"])
    await page.keyboard.type("X")
    await page.locator('.page img[data-image-id="v151-image"]').click()
    await page.keyboard.press("Meta+z")
    assert "X" not in await editor_text(page)
    await page.keyboard.press("Meta+Shift+z")
    assert "X" in await editor_text(page)

    log("检查 input/textarea/contenteditable 自有历史")
    await page.evaluate("window.__editor.commands.setTextSelection(1)")
    await page.evaluate("window.__editor.commands.blur()")
    color_input = page.get_by_role("textbox", name="主标题颜色")
    await color_input.wait_for()
    before_input = await editor_json(page)
    await color_input.fill("#123456")
    await page.keyboard.press("Meta+z")
    assert await editor_json(page) == before_input
    assert (
        await synthetic_shortcut(
            page,
            'input[aria-label="主标题颜色"]',
        )
        is False
    )

    editable_results = await page.evaluate(
        """
        () => {
          const before = JSON.stringify(window.__editor.getJSON())
          const host = document.createElement('div')
          host.style.position = 'fixed'
          host.style.left = '-10000px'
          const textarea = document.createElement('textarea')
          const editable = document.createElement('div')
          editable.contentEditable = 'true'
          const child = document.createElement('span')
          editable.append(child)
          host.append(textarea, editable)
          document.body.append(host)
          const fire = (target) => {
            const event = new KeyboardEvent('keydown', {
              bubbles: true,
              cancelable: true,
              key: 'z',
              metaKey: true,
            })
            target.dispatchEvent(event)
            return event.defaultPrevented
          }
          const result = {
            textarea: fire(textarea),
            contenteditable: fire(child),
            unchanged: JSON.stringify(window.__editor.getJSON()) === before,
          }
          host.remove()
          return result
        }
        """
    )
    assert editable_results == {
        "textarea": False,
        "contenteditable": False,
        "unchanged": True,
    }

    log("检查导出 Dialog 与 Radix listbox 不撤销后台文档")
    before_dialog = await editor_json(page)
    await page.get_by_role("button", name="导出 PNG", exact=True).click()
    dialog = page.get_by_role("dialog")
    await dialog.wait_for()
    await next_layout(page)
    filename = dialog.get_by_role("textbox")
    synthetic_dialog_default = await synthetic_shortcut(
        page, '[role="dialog"] input[type="text"]'
    )
    assert synthetic_dialog_default is False
    assert await editor_json(page) == before_dialog
    original_filename = await filename.input_value()
    await filename.press("End")
    await filename.type("-dialog")
    await filename.press("Meta+z")
    after_dialog = await editor_json(page)
    assert after_dialog == before_dialog, (before_dialog, after_dialog)
    assert await filename.input_value() == original_filename
    dialog_default = await page.evaluate(
        """
        () => {
          const target = document.querySelector('[role="dialog"] button')
          const event = new KeyboardEvent('keydown', {
            bubbles: true, cancelable: true, key: 'z', metaKey: true,
          })
          target.dispatchEvent(event)
          return event.defaultPrevented
        }
        """
    )
    assert dialog_default is False
    await page.keyboard.press("Escape")
    await dialog.wait_for(state="hidden")

    await page.get_by_role("combobox", name="段落样式").click()
    option = page.get_by_role("option", name="H2 · 二级标题")
    await option.wait_for()
    popup_before = await editor_json(page)
    popup_default = await page.evaluate(
        """
        () => {
          const target = document.querySelector('[role="option"]')
          const event = new KeyboardEvent('keydown', {
            bubbles: true, cancelable: true, key: 'z', metaKey: true,
          })
          target.dispatchEvent(event)
          return event.defaultPrevented
        }
        """
    )
    assert popup_default is False
    assert await editor_json(page) == popup_before
    await page.keyboard.press("Escape")

    log("检查组合输入、画布手势与只读标签页")
    ime_before = await editor_json(page)
    ime_default = await synthetic_shortcut(
        page,
        'button[role="switch"][title*="裁切参考"]',
        composing=True,
    )
    assert ime_default is False
    assert await editor_json(page) == ime_before

    await set_html(page, "<p>IME_BASE</p>")
    await focus_end(page)
    await page.evaluate(
        """
        () => {
          window.__v151ImeKey = null
          const capture = (event) => {
            if (event.key.toLowerCase() !== 'z') return
            const record = {
              isComposing: event.isComposing,
              inEditor: event.target.closest?.('.ProseMirror') !== null,
            }
            window.removeEventListener('keydown', capture, true)
            setTimeout(() => {
              record.defaultPrevented = event.defaultPrevented
              window.__v151ImeKey = record
            }, 0)
          }
          window.addEventListener('keydown', capture, true)
        }
        """
    )
    cdp = await context.new_cdp_session(page)
    await cdp.send(
        "Input.imeSetComposition",
        {"text": "测", "selectionStart": 1, "selectionEnd": 1},
    )
    await page.keyboard.press("Meta+z")
    await page.wait_for_function("window.__v151ImeKey !== null")
    ime_key = await page.evaluate("window.__v151ImeKey")
    assert ime_key == {
        "isComposing": True,
        "inEditor": True,
        "defaultPrevented": False,
    }, ime_key
    await cdp.send(
        "Input.imeSetComposition",
        {"text": "", "selectionStart": 0, "selectionEnd": 0},
    )
    await cdp.detach()

    await set_json(
        page,
        {
            "type": "doc",
            "content": [
                {
                    "type": "image",
                    "attrs": {
                        "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200'%3E%3Crect width='400' height='200' fill='%232E74E6'/%3E%3C/svg%3E",
                        "assetId": None,
                        "imageId": "gesture-image",
                        "width": "50%",
                        "height": None,
                        "align": "center",
                    },
                },
                {"type": "paragraph"},
            ],
        },
    )
    await page.locator('.page img[data-image-id="gesture-image"]').click()
    handle = page.locator(".image-resize-handle").first
    box = await handle.bounding_box()
    assert box is not None
    await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    await page.mouse.down()
    pointerdown_before = await editor_json(page)
    pointerdown_default = await synthetic_shortcut(page, "body")
    assert pointerdown_default is False
    assert await editor_json(page) == pointerdown_before
    await page.mouse.move(box["x"] + 20, box["y"] + 10, steps=3)
    await page.wait_for_function(
        "document.querySelector('button[title=\"请先结束当前图片拖动\"]')?.disabled"
    )
    gesture_before = await editor_json(page)
    gesture_default = await synthetic_shortcut(page, "body")
    assert gesture_default is False
    assert await editor_json(page) == gesture_before
    await page.keyboard.press("Escape")
    await page.mouse.up()

    second = await context.new_page()
    second.set_default_timeout(30_000)
    await second.goto(URL, wait_until="domcontentloaded", timeout=60_000)
    await second.wait_for_function("window.__editor")
    await second.get_by_text("另一个标签页正在编辑", exact=True).wait_for(
        timeout=15_000
    )
    await second.evaluate(
        "window.__editor.commands.setContent('<p>READ_ONLY_MEMORY</p>')"
    )
    locked_before = await second.evaluate("window.__editor.getJSON()")
    locked_default = await synthetic_shortcut(second, "body")
    assert locked_default is False
    assert await second.evaluate("window.__editor.getJSON()") == locked_before
    await second.close()


async def choose_block(page: Page, label: str) -> None:
    await page.get_by_role("combobox", name="段落样式").click()
    await page.get_by_role("option", name=label).click()
    await next_layout(page)


async def assert_heading_matrix(page: Page) -> None:
    log("检查 Radix 下拉的段落空端点")
    await set_html(page, "<p>甲一</p><p>乙二</p>")
    ranges = await text_ranges(page)
    await select_positions(page, ranges["甲一"]["to"], ranges["乙二"]["from"] + 1)
    await choose_block(page, "H2 · 二级标题")
    assert compact_blocks(await root_blocks(page, 2)) == signature(
        ("paragraph", None), ("heading", 2)
    )

    log("检查反向选区与原生标题快捷键")
    await set_html(page, "<p>甲一</p><p>乙二</p>")
    ranges = await text_ranges(page)
    await select_positions(page, ranges["乙二"]["from"] + 1, ranges["甲一"]["to"])
    await page.keyboard.press("Meta+Alt+1")
    assert compact_blocks(await root_blocks(page, 2)) == signature(
        ("paragraph", None), ("heading", 1)
    )

    log("检查两个空端点之间只改中段")
    await set_html(page, "<p>甲一</p><p>乙二</p><p>丙三</p>")
    ranges = await text_ranges(page)
    await select_positions(page, ranges["甲一"]["to"], ranges["丙三"]["from"])
    await page.keyboard.press("Meta+Alt+3")
    assert compact_blocks(await root_blocks(page, 3)) == signature(
        ("paragraph", None), ("heading", 3), ("paragraph", None)
    )

    log("检查真正跨段选区保留两段语义")
    await set_html(page, "<p>甲一</p><p>乙二</p>")
    ranges = await text_ranges(page)
    await select_positions(
        page, ranges["甲一"]["from"] + 1, ranges["乙二"]["from"] + 1
    )
    await page.keyboard.press("Meta+Alt+2")
    assert compact_blocks(await root_blocks(page, 2)) == signature(
        ("heading", 2), ("heading", 2)
    )

    log("检查标题转回正文的同一边界规则")
    await set_html(page, "<h2>甲一</h2><h2>乙二</h2>")
    ranges = await text_ranges(page)
    await select_positions(page, ranges["甲一"]["to"], ranges["乙二"]["from"] + 1)
    await page.keyboard.press("Meta+Alt+0")
    assert compact_blocks(await root_blocks(page, 2)) == signature(
        ("heading", 2), ("paragraph", None)
    )

    log("检查 Shift+Enter 软换行与 Enter 分段")
    await set_html(page, "<p>第一行</p>")
    await focus_end(page)
    await page.keyboard.press("Shift+Enter")
    await page.keyboard.type("第二行")
    await page.keyboard.press("Meta+Alt+2")
    soft = await editor_json(page)
    assert soft["content"][0]["type"] == "heading"
    assert soft["content"][0]["attrs"]["level"] == 2
    assert [item["type"] for item in soft["content"][0]["content"]] == [
        "text",
        "hardBreak",
        "text",
    ]

    await set_html(page, "<p>旧段</p>")
    await focus_end(page)
    await page.keyboard.press("Enter")
    await page.keyboard.type("新段")
    await page.keyboard.press("Meta+Alt+1")
    assert compact_blocks(await root_blocks(page, 2)) == signature(
        ("paragraph", None), ("heading", 1)
    )

    log("检查 H4–H6 快捷键与菜单隐藏入口")
    await set_html(page, "<p>仅支持三级标题</p>")
    await focus_end(page)
    for level in (4, 5, 6):
        await page.keyboard.press(f"Meta+Alt+{level}")
        assert compact_blocks(await root_blocks(page, 1)) == signature(
            ("paragraph", None)
        )

    trigger = page.get_by_role("combobox", name="段落样式")
    await trigger.click()
    option_names = await page.get_by_role("option").all_text_contents()
    assert any("一级标题" in name for name in option_names)
    assert any("二级标题" in name for name in option_names)
    assert any("三级标题" in name for name in option_names)
    assert not any("H4" in name or "H5" in name or "H6" in name for name in option_names)
    await page.keyboard.press("Escape")

    hint = page.get_by_text(
        "标题作用于整段；Enter 分段，Shift+Enter 只换行",
        exact=True,
    )
    await hint.wait_for()


async def assert_visual_layout(page: Page) -> None:
    viewports = [(1280, 800), (1440, 900), (1536, 1024)]
    for width, height in viewports:
        await page.set_viewport_size({"width": width, "height": height})
        await next_layout(page)
        geometry = await page.evaluate(
            """
            () => {
              const panel = document.querySelector('.workspace-editor-panel')
              const hint = document.querySelector('.editor-panel-heading span')
              const toolbar = document.querySelector('.editor-toolbar-frame')
              const panelRect = panel.getBoundingClientRect()
              const hintRect = hint.getBoundingClientRect()
              return {
                hintInside:
                  hintRect.left >= panelRect.left - 1 &&
                  hintRect.right <= panelRect.right + 1 &&
                  hintRect.top >= panelRect.top - 1,
                toolbarFits: toolbar.scrollWidth <= toolbar.clientWidth,
                pageOverflow: document.documentElement.scrollWidth <= window.innerWidth,
              }
            }
            """
        )
        assert geometry == {
            "hintInside": True,
            "toolbarFits": True,
            "pageOverflow": True,
        }, (width, height, geometry)
        await page.screenshot(
            path=OUT / f"xhs-editor-v1.5.1-local-{width}x{height}-v1.png",
            full_page=True,
        )

    await page.set_viewport_size({"width": 1536, "height": 1024})
    await page.get_by_role("combobox", name="段落样式").click()
    await page.get_by_role("option", name="H1 · 一级标题").wait_for()
    await page.screenshot(
        path=OUT / "xhs-editor-v1.5.1-local-heading-menu-v1.png",
        full_page=True,
    )
    await page.keyboard.press("Escape")


async def replace_block_text(page: Page, selector: str, value: str) -> None:
    await page.locator(selector).first.click()
    await page.evaluate(
        """
        (selector) => {
          const block = document.querySelector(selector)
          const selection = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(block)
          selection.removeAllRanges()
          selection.addRange(range)
        }
        """,
        selector,
    )
    await page.keyboard.insert_text(value)
    await next_layout(page)


async def assert_safe_area_visual(page: Page) -> None:
    await page.get_by_role("button", name="主题库", exact=True).click()
    dialog = page.get_by_role("dialog")
    card = dialog.locator('[data-theme-id="builtin-public-exam-landscape"]')
    await card.wait_for()
    await card.get_by_role("button", name="应用", exact=True).click()
    await dialog.wait_for(state="hidden")
    await page.wait_for_function(
        """
        () => {
          const pages = [...document.querySelectorAll(
            '.page.theme-public-exam-landscape',
          )]
          return pages.length >= 2 && pages.slice(0, 2).every((item) => {
            const image = item.querySelector('img.bg')
            return image && image.complete && image.naturalWidth > 0
          })
        }
        """
    )

    await replace_block_text(
        page,
        ".ProseMirror h1",
        "申论高分写作与材料分析完整方法",
    )
    await replace_block_text(
        page,
        ".ProseMirror h1 + p",
        "从材料阅读到规范表达，一套适合公考复习的完整步骤",
    )

    layout_switch = page.get_by_role("switch", name="排版参考", exact=True)
    if await layout_switch.get_attribute("aria-checked") != "true":
        await layout_switch.click()
    crop_switch = page.get_by_role("switch", name="裁切参考", exact=True)
    if await crop_switch.get_attribute("aria-checked") == "true":
        await crop_switch.click()
    await next_layout(page)

    geometry = await page.evaluate(
        """
        () => [...document.querySelectorAll('.page-preview-group')]
          .slice(0, 2)
          .map((group) => {
            const page = group.querySelector('.page')
            const style = getComputedStyle(page)
            const line = (selector, property) => Number.parseFloat(
              group.querySelector(selector).style[property],
            )
            return {
              guides: group.querySelectorAll('.layout-guide').length,
              x: line('.layout-guide--left', 'left'),
              center: line('.layout-guide--center', 'left'),
              right: line('.layout-guide--right', 'right'),
              top: line('.layout-guide--top', 'top'),
              bottom: line('.layout-guide--bottom', 'bottom'),
              padding: [
                style.getPropertyValue('--page-padding-x').trim(),
                style.getPropertyValue('--page-padding-top').trim(),
                style.getPropertyValue('--page-padding-bottom').trim(),
              ],
              label: group.querySelector('.layout-guide-label').textContent.trim(),
              hint: group.querySelector('.layout-guide-hint').textContent.trim(),
            }
          })
        """
    )
    expected_hint = (
        "重要文字尽量放在线内；背景图片可以铺满整页。参考线不会导出。"
    )
    assert geometry == [
        {
            "guides": 5,
            "x": 120,
            "center": 540,
            "right": 120,
            "top": 300,
            "bottom": 300,
            "padding": ["120px", "300px", "300px"],
            "label": "建议内容区",
            "hint": expected_hint,
        },
        {
            "guides": 5,
            "x": 96,
            "center": 540,
            "right": 96,
            "top": 180,
            "bottom": 300,
            "padding": ["96px", "180px", "300px"],
            "label": "建议内容区",
            "hint": expected_hint,
        },
    ], geometry

    await page.set_viewport_size({"width": 1536, "height": 1024})
    await page.locator(".workspace-canvas-pages").evaluate(
        "(item) => { item.scrollTop = 0 }"
    )
    await next_layout(page)
    await page.screenshot(
        path=OUT / "xhs-editor-v1.5.1-local-safe-area-1536x1024-v1.png",
        full_page=True,
    )
    groups = page.locator(".page-preview-group")
    await groups.nth(0).screenshot(
        path=OUT / "xhs-editor-v1.5.1-local-safe-area-cover-v1.png",
    )
    await groups.nth(1).scroll_into_view_if_needed()
    await next_layout(page)
    await groups.nth(1).screenshot(
        path=OUT / "xhs-editor-v1.5.1-local-safe-area-inner-v1.png",
    )


async def main() -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1536, "height": 1024},
        )
        page = await context.new_page()
        page.set_default_timeout(30_000)
        try:
            await wait_for_app(
                page,
                require_hooks=not (VISUAL_ONLY or SAFE_AREA_ONLY),
            )
            if SAFE_AREA_ONLY:
                await assert_safe_area_visual(page)
            elif not VISUAL_ONLY:
                await assert_history_focus_matrix(page, context)
                # A real CDP IME composition can leave Chromium's native editing
                # session alive after the composition text is cleared. Reloading
                # mirrors a fresh user scenario and keeps the heading matrix from
                # inheriting browser-internal composition or modifier state.
                await wait_for_app(page, require_hooks=True)
                await assert_heading_matrix(page)
            if not SAFE_AREA_ONLY:
                await assert_visual_layout(page)
            log(f"全部通过；截图：{OUT}")
        finally:
            await context.close()
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
