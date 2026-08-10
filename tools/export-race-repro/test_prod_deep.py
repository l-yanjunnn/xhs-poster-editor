"""v1.2.0+ 发版标准深度回归：三主题导出像素校验 + 用户字体导出验证。

用法：
    python3 tools/export-race-repro/test_prod_deep.py [URL]
    URL 默认 Cloudflare prod；测大陆通道传 http://xhsposter.tshzchen.cn

前提：系统 proxy 127.0.0.1:7897（测大陆通道时脚本自动直连不走代理）
"""
import asyncio
import io
import sys
import zipfile
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://xhs-poster-editor.l-yanjunnn.workers.dev/"
USE_PROXY = "workers.dev" in URL  # 大陆通道直连
FONT_FILE = "/System/Library/Fonts/Supplemental/Comic Sans MS.ttf"
OUT = Path("/tmp/prod_deep_test")
OUT.mkdir(exist_ok=True)

# 三内置主题的四角期望色（RGB）；导出 canvas 2160x3840、四角 alpha 必须 255
THEMES = {
    "雅致": (237, 238, 237),
    "极简白": (255, 255, 255),
    "深夜黑": (10, 10, 10),
}


def check_png(data: bytes, expect_rgb, tag: str) -> list[str]:
    problems = []
    img = Image.open(io.BytesIO(data)).convert("RGBA")
    if img.size != (2160, 3840):
        problems.append(f"{tag}: 尺寸 {img.size} ≠ 2160x3840")
        return problems
    w, h = img.size
    for x, y in [(5, 5), (w - 6, 5), (5, h - 6), (w - 6, h - 6)]:
        r, g, b, a = img.getpixel((x, y))
        if a != 255:
            problems.append(f"{tag}: 角({x},{y}) alpha={a} 透明 → CSS 未应用")
        elif expect_rgb and max(abs(r - expect_rgb[0]), abs(g - expect_rgb[1]), abs(b - expect_rgb[2])) > 12:
            problems.append(f"{tag}: 角({x},{y}) 色 {(r,g,b)} ≠ 期望 {expect_rgb}")
    return problems


def dark_pixels(data: bytes) -> int:
    img = Image.open(io.BytesIO(data)).convert("L").resize((540, 960))
    return sum(1 for p in img.getdata() if p < 120)


async def pick_select(page, group_label: str, option_text: str):
    """按 Group label 定位 Radix Select 并选择选项"""
    group = page.locator(f'div:has(> span:text-is("{group_label}"))').last
    await group.get_by_role("combobox").click()
    await page.get_by_role("option", name=option_text, exact=False).first.click()
    await page.wait_for_timeout(400)


async def export_current(page, name: str) -> bytes:
    """点导出 → 弹窗填名 → 收下载。单页返回 PNG bytes；zip 返回第一页"""
    await page.get_by_role("button", name="导出 PNG").click()
    dlg = page.get_by_role("dialog")
    await dlg.get_by_placeholder("输入文件名").fill(name)
    async with page.expect_download(timeout=120_000) as dl_info:
        await dlg.get_by_role("button", name="导出", exact=True).click()
    dl = await dl_info.value
    path = OUT / f"{name}{Path(dl.suggested_filename).suffix}"
    await dl.save_as(path)
    await page.wait_for_timeout(300)
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as z:
            return z.read(sorted(z.namelist())[0])
    return path.read_bytes()


async def main():
    problems: list[str] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            proxy={"server": "http://127.0.0.1:7897"} if USE_PROXY else None,
        )
        page = await (await browser.new_context(
            viewport={"width": 1440, "height": 900}, accept_downloads=True,
        )).new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=120_000)
        await page.wait_for_selector(".page", timeout=60_000)
        await page.wait_for_timeout(3000)

        info = await page.locator(".text-xs", has_text="预览缩放").text_content()
        print(f"页面版本信息: {info}")

        # ---- 内容换成单页拉丁 H1（Comic Sans 无中文字形，且单页导出直接出 PNG）----
        editor = page.locator(".tiptap-editor .ProseMirror, .ProseMirror").first
        await editor.click()
        await page.keyboard.press("Meta+a")
        await page.keyboard.type("Export Deep Test ABC 123")
        await page.keyboard.press("Meta+a")
        await page.get_by_role("button", name="H1", exact=True).first.click()
        await page.wait_for_timeout(500)

        # ---- 1) 三主题导出像素校验 ----
        for theme, rgb in THEMES.items():
            await pick_select(page, "主题", theme)
            png = await export_current(page, f"theme-{theme}")
            probs = check_png(png, rgb, f"主题[{theme}]")
            problems += probs
            print(f"主题[{theme}]: {'OK' if not probs else probs}")

        # ---- 2) 用户字体导出验证（雅致主题下对比默认字体）----
        await pick_select(page, "主题", "雅致")
        base_png = await export_current(page, "font-baseline")
        base_ink = dark_pixels(base_png)

        # 上传字体：H1 Group 内 ⚙ 打开字体库 → file input
        h1_group = page.locator('div:has(> span:text-is("H1"))').last
        await h1_group.get_by_text("⚙").click()
        file_input = page.get_by_role("dialog").locator('input[type="file"]')
        await file_input.set_input_files(FONT_FILE)
        await page.wait_for_timeout(1500)
        await page.keyboard.press("Escape")
        await pick_select(page, "H1", "Comic Sans")

        font_png = await export_current(page, "font-user")
        font_ink = dark_pixels(font_png)
        diff_ok = abs(font_ink - base_ink) > base_ink * 0.15
        print(f"用户字体: baseline_ink={base_ink} userfont_ink={font_ink} → {'生效 OK' if diff_ok else '⚠️ 差异过小，疑似未生效'}")
        if not diff_ok:
            problems.append("用户字体导出未生效（与默认字体像素差异过小）")
        problems += check_png(font_png, THEMES["雅致"], "用户字体")

        await browser.close()

    print("\n========")
    if problems:
        print(f"❌ {len(problems)} 个问题:")
        for x in problems:
            print(" -", x)
        sys.exit(1)
    print(f"✅ 全部通过（PNG 落盘 {OUT}/ 可人工复核）")


asyncio.run(main())
