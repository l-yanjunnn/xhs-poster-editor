"""v1.5.1 生产 UI 冒烟：全局历史、标题边界与 Cover/Inner 建议内容区。

只使用生产页面公开 DOM 和用户可见交互，不依赖 dev-only 的
``window.__editor`` / ``window.__test``。每次运行使用全新 Chromium context。

用法：
    python3 tools/export-race-repro/test_v151_prod.py [URL] [EXPECTED_VERSION]
"""

import asyncio
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import Page, async_playwright


URL = (
    sys.argv[1]
    if len(sys.argv) > 1
    else "https://xhs-poster-editor.l-yanjunnn.workers.dev/"
)
EXPECTED_VERSION = sys.argv[2] if len(sys.argv) > 2 else "v1.5.1"
USE_PROXY = "workers.dev" in URL
HOST = re.sub(r"[^A-Za-z0-9.-]+", "-", urlparse(URL).netloc)
OUT = Path("/tmp/xhs-v151-prod") / HOST
OUT.mkdir(parents=True, exist_ok=True)


def log(message: str) -> None:
    print(f"[v1.5.1 prod] {message}", flush=True)


async def next_layout(page: Page) -> None:
    await page.evaluate(
        """
        () => new Promise((resolve) => requestAnimationFrame(
          () => requestAnimationFrame(resolve),
        ))
        """
    )


async def wait_for_editor_text(page: Page, expected: str) -> None:
    await page.wait_for_function(
        "([selector, value]) => document.querySelector(selector)?.innerText === value",
        arg=[".ProseMirror", expected],
    )


async def append_history_step(page: Page, token: str) -> tuple[str, str]:
    editor = page.locator(".ProseMirror")
    await editor.locator("p").last.click()
    await page.keyboard.press("End")
    before = await editor.inner_text()
    await page.wait_for_timeout(700)
    await page.keyboard.insert_text(token)
    after = await editor.inner_text()
    assert token in after and after != before, (before[-80:], after[-80:])
    await page.wait_for_timeout(700)
    return before, after


async def assert_history_and_input(page: Page) -> None:
    log("检查顶栏/画布失焦后的 undo/redo")
    before_topbar, after_topbar = await append_history_step(page, "V151A")
    await page.get_by_role("switch", name="裁切参考", exact=True).click()
    await page.keyboard.press("Meta+z")
    await wait_for_editor_text(page, before_topbar)
    await page.keyboard.press("Control+y")
    await wait_for_editor_text(page, after_topbar)

    before_canvas, after_canvas = await append_history_step(page, "V151B")
    await page.locator(".page-preview-group .page").first.click(position={"x": 12, "y": 12})
    await page.keyboard.press("Meta+z")
    await wait_for_editor_text(page, before_canvas)
    await page.keyboard.press("Meta+Shift+z")
    await wait_for_editor_text(page, after_canvas)

    log("检查普通 input 不被全局历史抢走")
    await page.get_by_role("button", name="导出 PNG", exact=True).click()
    dialog = page.get_by_role("dialog")
    filename = dialog.get_by_role("textbox")
    await filename.fill("v151-input-history")
    prevented = await filename.evaluate(
        """
        (input) => {
          const event = new KeyboardEvent('keydown', {
            key: 'z', metaKey: true, bubbles: true, cancelable: true,
          })
          input.dispatchEvent(event)
          return event.defaultPrevented
        }
        """
    )
    assert prevented is False
    await page.keyboard.press("Meta+z")
    await wait_for_editor_text(page, after_canvas)
    await page.keyboard.press("Escape")
    await dialog.wait_for(state="hidden")


async def select_paragraph_boundary(page: Page) -> tuple[str, str]:
    result = await page.evaluate(
        """
        () => {
          const root = document.querySelector('.ProseMirror')
          const blocks = [...root.children]
          const index = blocks.findIndex((item, position) => (
            item.tagName === 'P' && blocks[position + 1]?.tagName === 'P'
            && item.textContent.trim() && blocks[position + 1].textContent.trim()
          ))
          if (index < 0) throw new Error('找不到相邻正文段落')
          const first = blocks[index]
          const second = blocks[index + 1]
          const walker = document.createTreeWalker(second, NodeFilter.SHOW_TEXT)
          const text = walker.nextNode()
          if (!text?.data.length) throw new Error('第二段没有文本节点')

          root.focus()
          const range = document.createRange()
          range.setStart(first, first.childNodes.length)
          range.setEnd(text, Math.min(1, text.data.length))
          const selection = window.getSelection()
          selection.removeAllRanges()
          selection.addRange(range)
          return [first.textContent.trim(), second.textContent.trim()]
        }
        """
    )
    return result[0], result[1]


async def assert_heading_boundary(page: Page) -> None:
    log("检查 H1–H3 菜单、整段提示和段落末端边界")
    first_text, second_text = await select_paragraph_boundary(page)
    trigger = page.get_by_role("combobox", name="段落样式")
    await trigger.click()
    option_names = await page.get_by_role("option").all_text_contents()
    assert any("一级标题" in item for item in option_names)
    assert any("二级标题" in item for item in option_names)
    assert any("三级标题" in item for item in option_names)
    assert not any("H4" in item or "H5" in item or "H6" in item for item in option_names)
    await page.get_by_role("option", name="H2 · 二级标题").click()
    await next_layout(page)

    tags = await page.evaluate(
        """
        ([firstText, secondText]) => {
          const blocks = [...document.querySelector('.ProseMirror').children]
          const tag = (text) => blocks.find(
            (item) => item.textContent.trim() === text,
          )?.tagName ?? null
          return [tag(firstText), tag(secondText)]
        }
        """,
        [first_text, second_text],
    )
    assert tags == ["P", "H2"], tags

    target = page.locator(".ProseMirror h2").filter(has_text=second_text).first
    await target.click()
    for level in (4, 5, 6):
        await page.keyboard.press(f"Meta+Alt+{level}")
    assert await page.locator(".ProseMirror h4, .ProseMirror h5, .ProseMirror h6").count() == 0
    await page.get_by_text(
        "标题作用于整段；Enter 分段，Shift+Enter 只换行",
        exact=True,
    ).wait_for()


async def assert_safe_area(page: Page) -> None:
    log("检查公考 Cover/Inner 独立建议内容区")
    await page.get_by_role("button", name="主题库", exact=True).click()
    dialog = page.get_by_role("dialog")
    card = dialog.locator('[data-theme-id="builtin-public-exam-landscape"]')
    await card.get_by_role("button", name="应用", exact=True).click()
    await dialog.wait_for(state="hidden")

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
    hint = "重要文字尽量放在线内；背景图片可以铺满整页。参考线不会导出。"
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
            "hint": hint,
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
            "hint": hint,
        },
    ], geometry


async def main() -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
            proxy={"server": "http://127.0.0.1:7897"} if USE_PROXY else None,
        )
        context = await browser.new_context(viewport={"width": 1536, "height": 1024})
        page = await context.new_page()
        page.set_default_timeout(30_000)
        try:
            await page.goto(URL, wait_until="domcontentloaded", timeout=120_000)
            await page.wait_for_selector(".page", timeout=30_000)
            await page.wait_for_function(
                "!document.querySelector('.workspace-blocking-layer')",
                timeout=30_000,
            )
            version = (await page.locator(".topbar-version").text_content()) or ""
            assert version == EXPECTED_VERSION, version
            assert not await page.evaluate("Boolean(window.__editor || window.__test)")

            await assert_history_and_input(page)
            await assert_heading_boundary(page)
            await assert_safe_area(page)
            await page.screenshot(path=OUT / "v151-prod-smoke.png", full_page=True)
            log(f"全部通过；截图：{OUT / 'v151-prod-smoke.png'}")
        finally:
            await context.close()
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
