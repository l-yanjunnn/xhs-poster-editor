"""v1.5.0+ 发版标准深度回归：三主题导出像素校验 + 用户字体导出验证。

用法：
    python3 tools/export-race-repro/test_prod_deep.py [URL] [EXPECTED_VERSION]
    URL 默认 Cloudflare prod；测大陆通道传 https://xhsposter.tshzchen.cn

前提：系统 proxy 127.0.0.1:7897（测大陆通道时脚本自动直连不走代理）
"""
import asyncio
import io
import re
import sys
import zipfile
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://xhs-poster-editor.l-yanjunnn.workers.dev/"
EXPECTED_VERSION = sys.argv[2] if len(sys.argv) > 2 else "v1.7.0"
USE_PROXY = "workers.dev" in URL  # 大陆通道直连
FONT_FILE = "/System/Library/Fonts/Supplemental/Comic Sans MS.ttf"
OUT = Path("/tmp/prod_deep_test")
OUT.mkdir(exist_ok=True)

# 三内置主题的四角期望色（RGB）；导出 canvas 2160x3600、四角 alpha 必须 255
THEMES = {
    "雅致": (237, 238, 237),
    "极简白": (255, 255, 255),
    "深夜黑": (10, 10, 10),
}


def check_png(data: bytes, expect_rgb, tag: str) -> list[str]:
    problems = []
    img = Image.open(io.BytesIO(data)).convert("RGBA")
    if img.size != (2160, 3600):
        problems.append(f"{tag}: 尺寸 {img.size} ≠ 2160x3600")
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
    img = Image.open(io.BytesIO(data)).convert("L").resize((540, 900))
    return sum(1 for p in img.getdata() if p < 120)


async def pick_select(page, group_label: str, option_text: str):
    """按 Group label 定位 Radix Select 并选择选项"""
    group = page.get_by_role("group", name=group_label, exact=True).last
    await group.get_by_role("combobox").click()
    await page.get_by_role("option", name=option_text, exact=False).first.click()
    await page.wait_for_timeout(400)


async def pick_font(page, field_label: str, option_text: str):
    field = page.locator(".font-field").filter(has_text=field_label).first
    await field.get_by_role("combobox").click()
    await page.get_by_role("option", name=option_text, exact=False).first.click()
    await page.wait_for_timeout(400)


async def export_current(page, name: str) -> bytes:
    """点导出 → 显式选兼容 ZIP → 收下载，返回第一页 PNG bytes。"""
    export_button = page.get_by_role("button", name="导出 PNG")
    await export_button.wait_for()
    await page.wait_for_function(
        "!document.querySelector('.topbar-export')?.disabled",
        timeout=30_000,
    )
    await export_button.click()
    dlg = page.get_by_role("dialog")
    await dlg.get_by_label("文档主题", exact=True).fill(name)
    await dlg.locator("button").filter(has_text=re.compile(r"兼容 ZIP")).first.click()
    await dlg.get_by_label("ZIP 默认名称", exact=True).fill(f"{name}.zip")
    page_count = await page.locator(".page").count()
    async with page.expect_download(timeout=120_000) as dl_info:
        await dlg.get_by_role(
            "button",
            name=f"导出全部 {page_count} 张",
            exact=True,
        ).last.click()
        # 新版导出门禁会把可绕过的资源/排版 warning 留在同一弹窗内，
        # 旧脚本若不处理只会空等 download 超时。生产深回归允许按当前
        # 预览继续，但硬阻断仍必须失败。
        for _ in range(40):
            if not await dlg.is_visible():
                break
            blocking = dlg.get_by_text(
                re.compile(
                    r"字体或排版预检未通过，已阻止导出|"
                    r"字体或确定性排版存在硬阻断问题",
                ),
                exact=False,
            )
            if await blocking.count() and await blocking.first.is_visible():
                detail = await dlg.inner_text()
                raise AssertionError(f"{name}: 导出存在硬阻断：{detail}")
            warning_action = dlg.get_by_role(
                "button",
                name=re.compile(r"^(仍然导出|按当前预览强制导出)$"),
            )
            if await warning_action.count() and await warning_action.first.is_visible():
                detail = await dlg.inner_text()
                print(f"{name}: 处理可绕过的导出 warning：{detail}", flush=True)
                await warning_action.first.click()
                break
            await asyncio.sleep(0.5)
    dl = await dl_info.value
    path = OUT / f"{name}{Path(dl.suggested_filename).suffix}"
    await dl.save_as(path)
    await dlg.wait_for(state="hidden")
    assert path.suffix.lower() == ".zip", dl.suggested_filename
    with zipfile.ZipFile(path) as archive:
        members = sorted(
            (
                item for item in archive.namelist()
                if item.lower().endswith(".png")
            ),
            key=lambda item: int(
                re.match(r"^(\d+)_", Path(item).name).group(1)
            ),
        )
        assert members, archive.namelist()
        return archive.read(members[0])


async def main():
    problems: list[str] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            proxy={
                "server": "http://127.0.0.1:7897",
                # 雅致主题的 LXGW WenKai 来自 jsDelivr；本机可直连该
                # 域名，旁路可避开代理对大字体分片的 HTTP/2 黑洞。
                "bypass": "cdn.jsdelivr.net",
            }
            if USE_PROXY
            else None,
            args=["--disable-http2"] if USE_PROXY else ["--no-proxy-server"],
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900}, accept_downloads=True,
        )
        await context.add_init_script(
            "Object.defineProperty(window, 'showSaveFilePicker', "
            "{ configurable: true, value: undefined })"
        )
        page = await context.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=120_000)
        await page.wait_for_selector(".page", timeout=60_000)
        await page.wait_for_timeout(3000)

        version = (await page.locator(".topbar-version").text_content()) or ""
        js_hash = await page.evaluate(
            """() => {
              const script = [...document.scripts].find((item) => item.src.includes('index-'))
              return script?.src.match(/index-([A-Za-z0-9_-]+)\\.js/)?.[1] ?? null
            }"""
        )
        print(f"页面版本信息: {version}, js={js_hash}")
        if version != EXPECTED_VERSION:
            problems.append(f"线上版本 {version} ≠ {EXPECTED_VERSION}")

        # ---- 内容换成单页拉丁 H1（Comic Sans 无中文字形）----
        editor = page.locator(".tiptap-editor .ProseMirror, .ProseMirror").first
        await editor.click()
        await page.keyboard.press("Meta+a")
        await page.keyboard.type("Export Deep Test ABC 123")
        await page.keyboard.press("Meta+a")
        await page.get_by_role("combobox", name="段落样式").click()
        await page.get_by_role("option", name="H1 · 一级标题", exact=True).click()
        await page.wait_for_timeout(500)
        await page.wait_for_function("document.querySelectorAll('.page').length === 1")
        await page.locator(".page").click(position={"x": 12, "y": 12})

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

        # 上传字体：右侧页面检查器 → 字体库 → file input
        await page.get_by_role("button", name="字体库", exact=True).click()
        file_input = page.get_by_role("dialog").locator('input[type="file"]')
        await file_input.set_input_files(FONT_FILE)
        await page.wait_for_timeout(1500)
        await page.keyboard.press("Escape")
        await page.locator(".inspector-details summary").click()
        await pick_font(page, "H1 全局样式", "Comic Sans")

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
