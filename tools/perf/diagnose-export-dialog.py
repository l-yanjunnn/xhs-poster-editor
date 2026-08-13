"""一次性诊断：导出 Dialog 点击后到底处于什么状态（不计时，只观察）。"""
import asyncio
import functools
import sys

from playwright.async_api import async_playwright

print = functools.partial(print, flush=True)
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4175/"


async def dump_buttons(dialog, tag):
    buttons = dialog.get_by_role("button")
    n = await buttons.count()
    out = []
    for i in range(n):
        b = buttons.nth(i)
        try:
            text = (await b.inner_text()).replace("\n", " | ")[:60]
            pressed = await b.get_attribute("aria-pressed")
            out.append(f"[{text}] pressed={pressed}")
        except Exception:
            pass
    print(f"--- {tag}: {n} buttons ---")
    for line in out:
        print("  ", line)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(accept_downloads=True)
        await context.add_init_script(
            "Object.defineProperty(window, 'showSaveFilePicker',"
            " { configurable: true, writable: true, value: undefined })"
        )
        page = await context.new_page()
        page.on("console", lambda m: print("console:", m.type, m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: print("pageerror:", str(e)[:200]))
        await page.goto(URL, wait_until="domcontentloaded", timeout=60_000)
        await page.wait_for_selector(".page", timeout=60_000)
        await page.wait_for_timeout(3000)
        caps = await page.evaluate(
            "() => ({dir: typeof window.showDirectoryPicker, save: typeof window.showSaveFilePicker})"
        )
        print("picker capabilities:", caps)

        await page.get_by_role("button", name="导出 PNG", exact=True).click()
        dialog = page.get_by_role("dialog")
        await dialog.get_by_role("heading", name="导出 PNG", exact=True).wait_for()
        await page.wait_for_timeout(500)
        await dump_buttons(dialog, "初始状态")

        zip_choice = dialog.locator("button").filter(has_text="兼容 ZIP")
        print("兼容 ZIP 匹配数:", await zip_choice.count())
        if await zip_choice.count() >= 1:
            await zip_choice.first.click()
            await page.wait_for_timeout(300)
        await dump_buttons(dialog, "选 ZIP 后")

        page_count = await page.locator(".page").count()
        export_button = dialog.get_by_role(
            "button", name=f"导出全部 {page_count} 张", exact=True
        )
        print("导出按钮数:", await export_button.count())
        got_download = []
        page.on("download", lambda d: got_download.append(d.suggested_filename))
        await export_button.click()
        for i in range(30):  # 观察 300 秒；只盯 footer/progress/error 尾部状态
            await page.wait_for_timeout(10_000)
            try:
                body = (await dialog.inner_text(timeout=2_000)).replace("\n", " | ")
            except Exception as e:
                body = f"<dialog 不可读: {e}>"
            print(f"t+{(i+1)*10}s dialog 尾部: …{body[-400:]}")
            if got_download:
                print("download 事件:", got_download)
                break
        await browser.close()


asyncio.run(main())
