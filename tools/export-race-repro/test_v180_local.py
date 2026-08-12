"""v1.8.0 滚动联动本地回归：双向定位、主控权交替、开关独立、打字不跳动。

用法：
    cd app && ../tools/export-race-repro/run 不存在——直接：
    ./node_modules/.bin/vite build && ./node_modules/.bin/vite preview --port 4173 &
    python3 tools/export-race-repro/test_v180_local.py [URL]
    （脚本默认自行连接 http://localhost:4173/）

截图输出 docs/screenshots/v1.8.0/（供用户目检）。
"""
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/"
REPO = Path(__file__).resolve().parents[2]
SHOTS = REPO / "docs" / "screenshots" / "v1.8.0"
SHOTS.mkdir(parents=True, exist_ok=True)

EDITOR = ".editor-scroll-area"
CANVAS = ".workspace-canvas-panel"


async def scroll_top(page, selector):
    return await page.eval_on_selector(selector, "el => el.scrollTop")


async def wheel_over(page, selector, delta, steps=6):
    box = await page.locator(selector).first.bounding_box()
    await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    for _ in range(steps):
        await page.mouse.wheel(0, delta)
        await page.wait_for_timeout(60)
    await page.wait_for_timeout(400)


async def main():
    problems = []
    console_errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        page.on(
            "console",
            lambda m: console_errors.append(m.text) if m.type == "error" else None,
        )
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        await page.goto(URL, wait_until="domcontentloaded")
        await page.wait_for_selector(".page")
        await page.wait_for_timeout(2500)  # 字体/确定性排版就绪

        page_count = await page.locator(".page").count()
        print(f"页面就绪：{page_count} 页（默认教程）")

        # ---- 1) 编辑区 → 画布：滚到底，画布应跟到末页附近 ----
        await wheel_over(page, EDITOR, 600, steps=10)
        editor_bottom = await scroll_top(page, EDITOR)
        canvas_follow = await scroll_top(page, CANVAS)
        canvas_max = await page.eval_on_selector(
            CANVAS, "el => el.scrollHeight - el.clientHeight"
        )
        print(f"编辑区滚到 {editor_bottom:.0f} → 画布跟随至 {canvas_follow:.0f}/{canvas_max:.0f}")
        if canvas_follow < canvas_max * 0.6:
            problems.append(f"画布未跟随编辑区滚动（{canvas_follow:.0f}/{canvas_max:.0f}）")
        await page.screenshot(path=SHOTS / "01-editor-drives-canvas.png")

        # 稳定性：静置 600ms 不得振荡
        settled = await scroll_top(page, CANVAS)
        await page.wait_for_timeout(600)
        settled2 = await scroll_top(page, CANVAS)
        if abs(settled - settled2) > 2:
            problems.append(f"静置期振荡：{settled:.1f} → {settled2:.1f}")

        # ---- 2) 画布 → 编辑区：反向接管，滚回顶部 ----
        await wheel_over(page, CANVAS, -600, steps=12)
        canvas_top = await scroll_top(page, CANVAS)
        editor_follow = await scroll_top(page, EDITOR)
        print(f"画布滚回 {canvas_top:.0f} → 编辑区跟随至 {editor_follow:.0f}")
        if editor_follow > editor_bottom * 0.4:
            problems.append(f"编辑区未跟随画布反向滚动（仍在 {editor_follow:.0f}）")
        await page.screenshot(path=SHOTS / "02-canvas-drives-editor.png")

        # ---- 3) 打字不跳动：无人工滚动时输入文字，画布不得移动 ----
        canvas_before = await scroll_top(page, CANVAS)
        editor_el = page.locator(".tiptap-editor .ProseMirror, .ProseMirror").first
        await editor_el.click(position={"x": 40, "y": 20})
        await page.keyboard.type("联动回归测试字样")
        await page.wait_for_timeout(500)
        canvas_after = await scroll_top(page, CANVAS)
        if abs(canvas_after - canvas_before) > 2:
            problems.append(
                f"打字导致画布跳动：{canvas_before:.1f} → {canvas_after:.1f}"
            )
        for _ in range(len("联动回归测试字样")):
            await page.keyboard.press("Backspace")
        await page.wait_for_timeout(300)

        # ---- 4) 开关关闭：两栏完全独立 ----
        switch = page.get_by_role("switch", name="滚动联动")
        await switch.click()
        state = await switch.get_attribute("aria-checked")
        if state != "false":
            problems.append(f"开关点击后 aria-checked={state}")
        canvas_hold = await scroll_top(page, CANVAS)
        await wheel_over(page, EDITOR, 600, steps=8)
        canvas_moved = await scroll_top(page, CANVAS)
        if abs(canvas_moved - canvas_hold) > 2:
            problems.append(
                f"关闭开关后画布仍被联动：{canvas_hold:.1f} → {canvas_moved:.1f}"
            )
        await page.screenshot(path=SHOTS / "03-switch-off-independent.png")

        # ---- 5) 重新开启：下一次人工滚动恢复联动 ----
        await switch.click()
        await wheel_over(page, EDITOR, -600, steps=10)
        canvas_resume = await scroll_top(page, CANVAS)
        if canvas_resume > canvas_max * 0.3:
            problems.append(f"重新开启后画布未恢复联动（{canvas_resume:.0f}）")
        await page.screenshot(path=SHOTS / "04-switch-on-resumed.png")

        if console_errors:
            problems.append(f"console/page error {len(console_errors)} 条: {console_errors[:3]}")

        await browser.close()

    print("\n========")
    if problems:
        print(f"❌ {len(problems)} 个问题:")
        for x in problems:
            print(" -", x)
        sys.exit(1)
    print(f"✅ 全部通过；截图在 {SHOTS}/")


asyncio.run(main())
