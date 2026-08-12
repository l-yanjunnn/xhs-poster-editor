"""v1.8.0 发版门禁：19 页长文双向滚动联动 + 页级对应精度 + 导入后静止。

用法：python3 tools/export-race-repro/test_v180_longdoc_local.py [URL]
默认 http://localhost:4173/（先 vite build && vite preview --port 4173）。
"""
import asyncio
import sys

from playwright.async_api import async_playwright, expect

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/"
EDITOR = ".editor-scroll-area"
CANVAS = ".workspace-canvas-panel"
FIXTURE_19 = "超限19页导出演示.md"

CENTER_PAGE_JS = """
(sel) => {
  const panel = document.querySelector(sel)
  const rect = panel.getBoundingClientRect()
  const heading = panel.querySelector('.workspace-canvas-heading')
  const offset = heading ? heading.getBoundingClientRect().height : 0
  const center = rect.top + offset + (rect.height - offset) / 2
  let best = null, bestDist = Infinity
  document.querySelectorAll('.page').forEach((page, index) => {
    const r = page.getBoundingClientRect()
    const dist = center < r.top ? r.top - center : center > r.bottom ? center - r.bottom : 0
    if (dist < bestDist) { bestDist = dist; best = index }
  })
  return best
}
"""

EDITOR_CENTER_PAGE_JS = """
(sel) => {
  const area = document.querySelector(sel)
  const rect = area.getBoundingClientRect()
  const center = rect.top + rect.height / 2
  const root = area.querySelector('.ProseMirror')
  let pageIndex = 0
  for (const child of root.children) {
    const r = child.getBoundingClientRect()
    if (r.top > center) break
    if (child.tagName === 'HR' && child.classList.contains('page-break')) pageIndex += 1
  }
  return pageIndex
}
"""


async def wheel_over(page, selector, delta, steps):
    box = await page.locator(selector).first.bounding_box()
    await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    for _ in range(steps):
        await page.mouse.wheel(0, delta)
        await page.wait_for_timeout(50)
    await page.wait_for_timeout(500)


async def pages_match(page, problems, label, tolerance=1):
    editor_page = await page.evaluate(EDITOR_CENTER_PAGE_JS, EDITOR)
    canvas_page = await page.evaluate(CENTER_PAGE_JS, CANVAS)
    print(f"{label}: 编辑区中心在第 {editor_page + 1} 页，画布中心在第 {canvas_page + 1} 页")
    if abs(editor_page - canvas_page) > tolerance:
        problems.append(f"{label}: 页级偏差 {abs(editor_page - canvas_page)} > {tolerance}")


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
        await page.wait_for_timeout(2000)

        # ---- 导入 19 页 fixture ----
        await page.get_by_role("button", name="导入文稿", exact=True).click()
        dialog = page.get_by_role("dialog")
        await dialog.locator("button").filter(has_text=FIXTURE_19).click()
        await dialog.get_by_role("heading", name="确认解析结果", exact=True).wait_for(
            timeout=30_000
        )
        await dialog.get_by_role("button", name="生成到新草稿", exact=True).click()
        await dialog.wait_for(state="hidden", timeout=60_000)
        await expect(page.locator(".page-preview-group")).to_have_count(
            19, timeout=60_000
        )
        await page.wait_for_timeout(2500)
        print("19 页 fixture 已生成")

        # ---- 导入（identity 变化）后：第一次人工滚动前保持静止 ----
        canvas_start = await page.eval_on_selector(CANVAS, "el => el.scrollTop")
        await page.wait_for_timeout(800)
        canvas_still = await page.eval_on_selector(CANVAS, "el => el.scrollTop")
        if abs(canvas_still - canvas_start) > 2:
            problems.append(
                f"导入后未静止：画布 {canvas_start:.0f} → {canvas_still:.0f}"
            )

        # ---- 编辑区 → 画布：中段与深处各校验一次页级对应 ----
        await wheel_over(page, EDITOR, 700, steps=8)
        await pages_match(page, problems, "编辑区中段")
        await wheel_over(page, EDITOR, 700, steps=10)
        await pages_match(page, problems, "编辑区深处")

        # ---- 画布 → 编辑区：反向接管 ----
        await wheel_over(page, CANVAS, -900, steps=10)
        await pages_match(page, problems, "画布反向中段")

        # ---- 快速交替不振荡 ----
        for _ in range(3):
            await wheel_over(page, EDITOR, 500, steps=2)
            await wheel_over(page, CANVAS, -500, steps=2)
        settled = await page.eval_on_selector(CANVAS, "el => el.scrollTop")
        await page.wait_for_timeout(700)
        settled2 = await page.eval_on_selector(CANVAS, "el => el.scrollTop")
        if abs(settled - settled2) > 2:
            problems.append(f"快速交替后振荡：{settled:.1f} → {settled2:.1f}")
        await pages_match(page, problems, "快速交替后")

        if console_errors:
            problems.append(
                f"console/page error {len(console_errors)} 条: {console_errors[:3]}"
            )
        await browser.close()

    print("\n========")
    if problems:
        print(f"❌ {len(problems)} 个问题:")
        for x in problems:
            print(" -", x)
        sys.exit(1)
    print("✅ 19 页长文联动门禁全部通过")


asyncio.run(main())
