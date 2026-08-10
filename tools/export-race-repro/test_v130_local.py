"""V1.3.0 本地候选版回归：画布、裁切参考、文字可靠性与草稿闭环。

用法：
    cd app && ./node_modules/.bin/vite --host 127.0.0.1 --port 5173
    python3 tools/export-race-repro/test_v130_local.py [URL]

脚本使用全新浏览器上下文，不读取或修改用户日常浏览器中的草稿。
"""

import asyncio
import base64
import re
import sys
from pathlib import Path

from PIL import Image
from playwright.async_api import Page, async_playwright


URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/"
OUT = Path("/tmp/xhs-v130-rc")
OUT.mkdir(parents=True, exist_ok=True)


async def wait_saved(page: Page) -> None:
    await page.locator('[role="status"]', has_text="已保存").wait_for(
        timeout=15_000
    )


async def wait_autosaved_after_change(page: Page) -> None:
    await page.locator('[role="status"]').filter(
        has_text=re.compile("待保存|保存中")
    ).wait_for(timeout=5_000)
    await wait_saved(page)


async def pick_select(page: Page, group_label: str, option_text: str) -> None:
    group = page.locator(f'div:has(> span:text-is("{group_label}"))').last
    await group.get_by_role("combobox").click()
    await page.get_by_role("option", name=option_text, exact=False).first.click()


async def select_editor_text(page: Page, text: str) -> None:
    found = await page.evaluate(
        """
        (needle) => {
          const editor = window.__editor
          let selection = null
          editor.state.doc.descendants((node, pos) => {
            if (selection || !node.isText) return !selection
            const index = node.text.indexOf(needle)
            if (index >= 0) {
              selection = { from: pos + index, to: pos + index + needle.length }
              return false
            }
            return true
          })
          if (!selection) throw new Error(`找不到待选文字：${needle}`)
          editor.commands.setTextSelection(selection)
          editor.commands.focus()
          return selection
        }
        """,
        text,
    )
    assert found, f"无法选中文字：{text}"


async def render_first_page(page: Page, include_png: bool) -> dict:
    return await page.evaluate(
        """
        async (includePng) => {
          const canvas = await window.__test.pageToPngCanvas(
            document.querySelector('.page'),
          )
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
          const bytes = new Uint8Array(await blob.arrayBuffer())
          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
          const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
          return {
            width: canvas.width,
            height: canvas.height,
            hash,
            dataUrl: includePng ? canvas.toDataURL('image/png') : null,
          }
        }
        """,
        include_png,
    )


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1920, "height": 1200})
        page = await context.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=60_000)
        await page.wait_for_selector(".page", timeout=30_000)
        await page.wait_for_function("window.__editor && window.__test")
        await wait_saved(page)

        info = (await page.locator("div", has_text="预览缩放 40%").last.text_content()) or ""
        assert "1080 × 1800（9:15）" in info, info
        assert "2160 × 3600" in info, info
        assert "v1.3.0" in info, info
        assert await page.locator(".page").count() == 5

        # 首图裁切参考仅出现在第一页，几何必须是中心 3:4（上下各 180px）。
        await page.get_by_role("button", name="裁切参考", exact=True).click()
        crop_geometry = await page.evaluate(
            """
            () => {
              const pages = [...document.querySelectorAll('.page')]
              const first = pages[0]
              const top = first.querySelector('.cover-crop-mask--top')
              const bottom = first.querySelector('.cover-crop-mask--bottom')
              return {
                overlays: pages.map((item) => item.querySelectorAll('.cover-crop-preview').length),
                topHeight: parseFloat(getComputedStyle(top).height),
                bottomHeight: parseFloat(getComputedStyle(bottom).height),
                previewOnly: first.querySelectorAll('[data-preview-only]').length,
                contentFits: pages.map((item) => {
                  const pageRect = item.getBoundingClientRect()
                  const contentRect = item.querySelector('.content').getBoundingClientRect()
                  return contentRect.bottom <= pageRect.bottom
                }),
              }
            }
            """
        )
        assert crop_geometry["overlays"] == [1, 0, 0, 0, 0], crop_geometry
        assert crop_geometry["topHeight"] == 180, crop_geometry
        assert crop_geometry["bottomHeight"] == 180, crop_geometry
        assert crop_geometry["previewOnly"] >= 3, crop_geometry
        assert all(crop_geometry["contentFits"]), crop_geometry
        await page.screenshot(path=OUT / "01-v130-main-crop.png")

        # 裁切遮罩/参考线不能进入导出；开关参考线前后 PNG 必须逐字节一致。
        with_guides = await render_first_page(page, include_png=True)
        assert (with_guides["width"], with_guides["height"]) == (2160, 3600)
        encoded = with_guides["dataUrl"].split(",", 1)[1]
        export_path = OUT / "02-v130-export-9x15.png"
        export_path.write_bytes(base64.b64decode(encoded))
        with Image.open(export_path) as image:
            assert image.size == (2160, 3600)
            image.crop((0, 360, 2160, 3240)).save(
                OUT / "03-v130-platform-cover-3x4.png"
            )

        await page.get_by_role("button", name="裁切参考", exact=True).click()
        without_guides = await render_first_page(page, include_png=False)
        assert with_guides["hash"] == without_guides["hash"], {
            "with": with_guides["hash"],
            "without": without_guides["hash"],
        }

        # H1 会按当前字体/字号/宽度实测；虽然不满 12 字，只要容不下也不能强制 nowrap。
        h1_too_wide = "关键短语完整机构名称测试"
        await page.evaluate(
            "(text) => window.__editor.commands.setContent(`<h1>${text}</h1>`)",
            h1_too_wide,
        )
        await select_editor_text(page, h1_too_wide)
        no_wrap_button = page.get_by_role("button", name="短语不拆", exact=True)
        assert await no_wrap_button.is_disabled()
        assert "H1 宽度容不下" in (await no_wrap_button.get_attribute("title"))

        # 两个相邻 mark 会被 ProseMirror 合并；第二次应用必须按合并后的总长拦截。
        first_phrase = "第一段关键短语刚好十二字"
        second_phrase = "第二段关键短语也有十二字"
        assert len(first_phrase) == 12 and len(second_phrase) == 12
        await page.evaluate(
            "([first, second]) => window.__editor.commands.setContent(`<p>${first}${second}</p>`)",
            [first_phrase, second_phrase],
        )
        await select_editor_text(page, first_phrase)
        assert not await no_wrap_button.is_disabled()
        await no_wrap_button.click()
        await select_editor_text(page, second_phrase)
        assert await no_wrap_button.is_disabled()
        assert "合并后超过" in (await no_wrap_button.get_attribute("title"))
        marked_text = await page.locator(".page .nowrap-phrase").all_text_contents()
        assert marked_text == [first_phrase], marked_text

        # 真实粘贴路径：只清中文粗体边界异常空白，英文空格保留。
        pasted = await page.evaluate(
            """
            () => {
              const target = document.querySelector('.ProseMirror')
              window.__editor.commands.clearContent()
              target.focus()
              const transfer = new DataTransfer()
              transfer.setData(
                'text/html',
                '<p><strong>2025年10月</strong> 的一天，鲁师傅 <strong>经营</strong> 了三家门店。<strong>Hello</strong> world</p>',
              )
              transfer.setData(
                'text/plain',
                '2025年10月 的一天，鲁师傅 经营 了三家门店。Hello world',
              )
              target.dispatchEvent(
                new ClipboardEvent('paste', {
                  bubbles: true,
                  cancelable: true,
                  clipboardData: transfer,
                }),
              )
              return window.__editor.getHTML()
            }
            """
        )
        assert "</strong>的一天" in pasted, pasted
        assert "鲁师傅<strong>经营</strong>了" in pasted, pasted
        assert "<strong>Hello</strong> world" in pasted, pasted

        # 「短语不拆」仅给显式选中的短语加 mark，并在画布里保持同一行。
        phrase = "广合县市场监督管理局"
        await page.evaluate(
            """
            (phrase) => window.__editor.commands.setContent(
              `<p>这是用于靠近行尾的较长前缀文字${phrase}发布通知。</p>`
            )
            """,
            phrase,
        )
        await select_editor_text(page, phrase)
        no_wrap_button = page.get_by_role("button", name="短语不拆", exact=True)
        assert not await no_wrap_button.is_disabled()
        await no_wrap_button.click()
        await page.locator(".page .nowrap-phrase").wait_for()
        no_wrap_layout = await page.evaluate(
            """
            () => {
              const phrase = document.querySelector('.page .nowrap-phrase')
              const text = phrase.firstChild
              const tops = []
              for (let index = 0; index < text.length; index += 1) {
                const range = document.createRange()
                range.setStart(text, index)
                range.setEnd(text, index + 1)
                tops.push(Math.round(range.getBoundingClientRect().top * 10) / 10)
              }
              const phraseRect = phrase.getBoundingClientRect()
              const contentRect = phrase.closest('.content').getBoundingClientRect()
              return {
                uniqueTops: [...new Set(tops)],
                insideContent:
                  phraseRect.left >= contentRect.left - 1 &&
                  phraseRect.right <= contentRect.right + 1,
                serialized: window.__editor.getHTML(),
              }
            }
            """
        )
        assert len(no_wrap_layout["uniqueTops"]) == 1, no_wrap_layout
        assert no_wrap_layout["insideContent"], no_wrap_layout
        assert 'data-no-wrap-phrase=""' in no_wrap_layout["serialized"]
        await wait_autosaved_after_change(page)

        too_long = "关键短语完整机构名称测试长"
        await page.evaluate(
            """
            (text) => {
              const editor = window.__editor
              editor.commands.setTextSelection(editor.state.doc.content.size)
              editor.commands.insertContent(`<p>${text}</p>`)
            }
            """,
            too_long,
        )
        await select_editor_text(page, too_long)
        assert await no_wrap_button.is_disabled()
        await page.screenshot(path=OUT / "04-v130-no-wrap.png")

        # 样式和完整 Tiptap JSON 自动保存；另存后的两份草稿互不覆盖。
        await pick_select(page, "字号", "较大 44px")
        await wait_autosaved_after_change(page)
        await page.get_by_role("button", name="草稿", exact=True).click()
        dialog = page.get_by_role("dialog")
        await dialog.get_by_placeholder("例如：行政执法卷第一题").fill(
            "V1.3 排版回归稿"
        )
        await dialog.get_by_role("button", name="另存为", exact=True).click()
        await dialog.get_by_text("V1.3 排版回归稿", exact=True).first.wait_for()
        assert await dialog.locator("article").count() == 2
        await page.screenshot(path=OUT / "05-v130-drafts.png")
        await page.keyboard.press("Escape")

        await page.evaluate(
            """
            () => window.__editor.commands.setContent('<h1>另存后的独立修改</h1><p>第二份草稿</p>')
            """
        )
        await wait_autosaved_after_change(page)

        await page.get_by_role("button", name="草稿", exact=True).click()
        original = dialog.locator("article", has_text="未命名草稿")
        await original.get_by_role("button", name="打开", exact=True).click()
        await page.wait_for_function(
            "window.__editor.getHTML().includes('data-no-wrap-phrase')"
        )

        await page.get_by_role("button", name="草稿", exact=True).click()
        copied = dialog.locator("article", has_text="V1.3 排版回归稿")
        await copied.get_by_role("button", name="打开", exact=True).click()
        await page.wait_for_function(
            "window.__editor.getText().includes('另存后的独立修改')"
        )

        # 删除非活动草稿需要二次确认，不影响当前草稿。
        await page.get_by_role("button", name="草稿", exact=True).click()
        original = dialog.locator("article", has_text="未命名草稿")
        await original.get_by_role("button", name="删除", exact=True).click()
        await original.get_by_role("button", name="确认", exact=True).click()
        await original.wait_for(state="detached")
        assert await dialog.locator("article").count() == 1
        await page.keyboard.press("Escape")

        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_function("window.__editor")
        await wait_saved(page)
        assert await page.evaluate(
            "window.__editor.getText().includes('另存后的独立修改')"
        )
        body_size = await page.evaluate(
            "getComputedStyle(document.documentElement).getPropertyValue('--fs-body').trim()"
        )
        assert body_size == "44px", body_size
        await page.get_by_role("button", name="草稿", exact=True).click()
        assert await dialog.get_by_text("V1.3 排版回归稿", exact=True).count() >= 1
        await page.keyboard.press("Escape")

        # nowrap 是文档不变量：setContent/历史内容不能绕过 12 字和 H1 实宽限制。
        await page.evaluate(
            """
            () => window.__editor.commands.setContent({
              type: 'doc',
              content: [{
                type: 'paragraph',
                content: [{
                  type: 'text',
                  text: '这是一段超过十二个字符的不安全不拆行内容',
                  marks: [{ type: 'noWrapPhrase' }],
                }],
              }],
            })
            """
        )
        await page.wait_for_function(
            "document.querySelectorAll('.page .nowrap-phrase').length === 0"
        )

        await pick_select(page, "字号", "小 32px")
        await pick_select(page, "H1 宽度", "100% 全宽")
        safe_at_first = "第一段关键短语刚好十二字"
        await page.evaluate(
            "(text) => window.__editor.commands.setContent(`<h1>${text}</h1>`)",
            safe_at_first,
        )
        await select_editor_text(page, safe_at_first)
        assert not await no_wrap_button.is_disabled()
        await no_wrap_button.click()
        assert await page.locator(".page h1 .nowrap-phrase").count() == 1

        await pick_select(page, "字号", "大 48px")
        await pick_select(page, "H1 宽度", "50%")
        await page.wait_for_function(
            "document.querySelectorAll('.page h1 .nowrap-phrase').length === 0"
        )
        await page.get_by_role("button", name="撤销", exact=True).click()
        await page.wait_for_timeout(50)
        assert await page.locator(".page h1 .nowrap-phrase").count() == 0

        # 全局 H1 不加粗时，局部 strong 仍必须明确为 700，不能继承成 400。
        h1_group = page.locator('div:has(> span:text-is("H1"))').last
        h1_global_bold = h1_group.get_by_role("button", name="B", exact=True)
        if await h1_global_bold.get_attribute("aria-pressed") == "true":
            await h1_global_bold.click()
        await page.evaluate(
            "() => window.__editor.commands.setContent('<h1>局部加粗测试</h1>')"
        )
        await select_editor_text(page, "局部")
        await page.get_by_role("button", name="加粗", exact=True).click()
        weights = await page.evaluate(
            """
            () => ({
              heading: getComputedStyle(document.querySelector('.page h1')).fontWeight,
              strong: getComputedStyle(document.querySelector('.page h1 strong')).fontWeight,
            })
            """
        )
        assert weights == {"heading": "400", "strong": "700"}, weights

        # 正文不再使用两端对齐，避免 nowrap/粗体附近被拉出截图中的异常大空洞。
        await page.evaluate(
            """
            () => window.__editor.commands.setContent(
              '<p>鲁师傅在<strong>2025年10月</strong>的一天收到市场监督管理局通知。</p>'
            )
            """
        )
        text_align = await page.evaluate(
            "getComputedStyle(document.querySelector('.page .content p')).textAlign"
        )
        assert text_align in ("start", "left"), text_align
        await page.screenshot(path=OUT / "06-v130-typography.png")

        # 900ms 防抖尚未触发就关页，也要靠同步恢复日志保住最后一次输入。
        await page.evaluate(
            """
            () => window.__editor.commands.setContent(
              '<h1>IMMEDIATE_CLOSE_RECOVERY</h1><p>关闭前最后输入</p>'
            )
            """
        )
        await page.close()
        page = await context.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=60_000)
        await page.wait_for_function("window.__editor")
        await wait_saved(page)
        assert await page.evaluate(
            "window.__editor.getText().includes('IMMEDIATE_CLOSE_RECOVERY')"
        )

        # 样式同样走最后机会快照；确认渲染完成后立刻关页，不等待 900ms。
        await pick_select(page, "字号", "较小 36px")
        await page.wait_for_function(
            "getComputedStyle(document.documentElement).getPropertyValue('--fs-body').trim() === '36px'"
        )
        await page.close()
        page = await context.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=60_000)
        await page.wait_for_function("window.__editor")
        await wait_saved(page)
        body_size = await page.evaluate(
            "getComputedStyle(document.documentElement).getPropertyValue('--fs-body').trim()"
        )
        assert body_size == "36px", body_size

        # 第二个标签页必须只读；第一标签页关闭后，它读取最新 IDB 再接管写权限。
        await page.evaluate(
            """
            () => window.__editor.commands.setContent(
              '<h1>LEASE_OWNER_LATEST</h1><p>唯一写入者保存的最新版</p>'
            )
            """
        )
        await wait_autosaved_after_change(page)
        second_page = await context.new_page()
        await second_page.goto(URL, wait_until="domcontentloaded", timeout=60_000)
        await second_page.get_by_text("另一个标签页正在编辑", exact=True).wait_for(
            timeout=15_000
        )
        assert await second_page.locator("[inert]").count() == 1
        await second_page.screenshot(path=OUT / "07-v130-single-writer.png")
        await page.close()
        await second_page.wait_for_function(
            """
            () => window.__editor &&
              window.__editor.getText().includes('LEASE_OWNER_LATEST') &&
              !document.body.innerText.includes('另一个标签页正在编辑')
            """,
            timeout=20_000,
        )
        await wait_saved(second_page)

        # 并发冷启动也只能有一个赢家。Web Locks 的仲裁是浏览器原子的，
        # 不允许两个页面像 localStorage read→set 那样短暂同时进入可写态。
        await second_page.close()
        racing_a = await context.new_page()
        racing_b = await context.new_page()
        await asyncio.gather(
            racing_a.goto(URL, wait_until="domcontentloaded", timeout=60_000),
            racing_b.goto(URL, wait_until="domcontentloaded", timeout=60_000),
        )
        ready_or_conflict = """
          () => document.body.innerText.includes('另一个标签页正在编辑') ||
            [...document.querySelectorAll('[role="status"]')].some(
              (item) => item.textContent.includes('已保存')
            )
        """
        await asyncio.gather(
            racing_a.wait_for_function(ready_or_conflict, timeout=20_000),
            racing_b.wait_for_function(ready_or_conflict, timeout=20_000),
        )
        read_lock_ui = """
          () => ({
            conflict: document.body.innerText.includes('另一个标签页正在编辑'),
            inert: document.querySelector('[inert]') !== null,
          })
        """
        racing_states = []
        for _ in range(200):
            racing_states = await asyncio.gather(
                racing_a.evaluate(read_lock_ui),
                racing_b.evaluate(read_lock_ui),
            )
            if (
                sum(state["conflict"] for state in racing_states) == 1
                and sum(not state["inert"] for state in racing_states) == 1
            ):
                break
            await asyncio.sleep(0.1)
        assert sum(state["conflict"] for state in racing_states) == 1, racing_states
        assert sum(not state["inert"] for state in racing_states) == 1, racing_states
        lock_query = await racing_a.evaluate(
            """
            async () => {
              const state = await navigator.locks.query()
              return state.held.filter(
                (lock) => lock.name === 'xhs-poster-editor-single-writer-v1'
              ).length
            }
            """
        )
        assert lock_query == 1, lock_query
        await racing_a.close()
        await racing_b.close()

        await browser.close()

    print(f"✅ V1.3.0 本地候选版回归通过，验收图：{OUT}/")


if __name__ == "__main__":
    asyncio.run(main())
