"""封面槽位导出像素验证（本地 preview）。

验证三件事（v1.10.0 开发期确认，防回归）：
1. 版式 B 的分隔条 / 版式 C 的眉题竖条（CSS 伪元素）真实进入导出 PNG；
2. 版式 B 主/副标题在导出成品中水平居中（±8px）；
3. 版式 A 导出不受槽位 CSS 影响（标题仍从内容区左缘起排）。

用法：
    cd app && ./node_modules/.bin/vite preview --port 4173
    python3 tools/export-race-repro/test_cover_slots_export_local.py
"""
from __future__ import annotations

import asyncio
import io
import re
import sys
import zipfile
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/"
USE_PROXY = "workers.dev" in URL  # 与 test_prod_deep 同款：Cloudflare 入口必须走本机代理
REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "docs" / "screenshots" / "cover-slots-local"
PAPER_MIN_LUMA = 200  # 暖纸底非常亮；低于此值视作"有墨迹"
FAILURES: list[str] = []


def luma(px) -> float:
    r, g, b = px[0], px[1], px[2]
    return 0.299 * r + 0.587 * g + 0.114 * b


def check(cond: bool, message: str) -> None:
    tag = "PASS" if cond else "FAIL"
    print(f"[{tag}] {message}")
    if not cond:
        FAILURES.append(message)


def dark_columns(img: Image.Image, y0: int, y1: int) -> tuple[int, int]:
    """返回 [y0,y1) 行带内有墨迹的最小/最大 x。"""
    px = img.load()
    xs = [
        x
        for y in range(y0, y1, 4)
        for x in range(0, img.width, 2)
        if luma(px[x, y]) < PAPER_MIN_LUMA
    ]
    return (min(xs), max(xs)) if xs else (-1, -1)


async def export_first_png(page, name: str) -> Image.Image:
    export_button = page.get_by_role("button", name="导出 PNG")
    await export_button.wait_for()
    await page.wait_for_function(
        "!document.querySelector('.topbar-export')?.disabled", timeout=30_000
    )
    await export_button.click()
    dlg = page.get_by_role("dialog")
    await dlg.get_by_label("文档主题", exact=True).fill(name)
    await dlg.locator("button").filter(has_text=re.compile(r"兼容 ZIP")).first.click()
    await dlg.get_by_label("ZIP 默认名称", exact=True).fill(f"{name}.zip")
    page_count = await page.locator(".page").count()
    async with page.expect_download(timeout=120_000) as dl_info:
        await dlg.get_by_role(
            "button", name=f"导出全部 {page_count} 张", exact=True
        ).last.click()
    dl = await dl_info.value
    path = OUT / f"export-{name}.zip"
    await dl.save_as(path)
    await dlg.wait_for(state="hidden")
    with zipfile.ZipFile(path) as archive:
        first = sorted(
            (m for m in archive.namelist() if m.lower().endswith(".png")),
            key=lambda m: int(re.match(r"^(\d+)_", Path(m).name).group(1)),
        )[0]
        img = Image.open(io.BytesIO(archive.read(first))).convert("RGB")
    path.unlink()  # ZIP 只是载体，留 PNG 判定即可（避免仓库塞大文件）
    return img


async def slot_rects(page):
    """画布首图的 h1/副标题/分隔条几何（1080 坐标系）。"""
    return await page.evaluate(
        """() => {
            const pg = document.querySelector('.page');
            const pr = pg.getBoundingClientRect();
            const s = pr.width / 1080;
            const h1 = pg.querySelector('.content > h1');
            const p = h1.nextElementSibling;
            const box = (el) => {
                const r = el.getBoundingClientRect();
                return {x: (r.left - pr.left) / s, y: (r.top - pr.top) / s,
                        w: r.width / s, h: r.height / s};
            };
            return {h1: box(h1), p: box(p)};
        }"""
    )


async def apply(page, layout: str, vertical: str) -> None:
    await page.get_by_role("button", name=layout, exact=False).first.click()
    await page.locator('[aria-label="垂直位置"]').get_by_role(
        "button", name=vertical, exact=True
    ).click()
    await page.wait_for_timeout(800)


async def main() -> None:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            proxy={"server": "http://127.0.0.1:7897"} if USE_PROXY else None,
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900}, accept_downloads=True
        )
        # headless 下 showSaveFilePicker 会静默挂起；置空让应用回退经典下载
        await context.add_init_script(
            "Object.defineProperty(window, 'showSaveFilePicker', "
            "{ configurable: true, value: undefined })"
        )
        page = await context.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=120_000)
        await page.wait_for_selector(".page", timeout=60_000)
        await page.wait_for_timeout(2500)
        trigger = page.locator(".inspector-card").get_by_role("combobox").first
        await trigger.click()
        await page.get_by_role("option", name="公考·山水卷").click()
        await page.wait_for_timeout(1200)

        # --- 版式 B · 中 ---
        await apply(page, "居中海报", "中")
        rects = await slot_rects(page)
        img = await export_first_png(page, "slots-B")
        check(img.size == (2160, 3600), f"B 导出尺寸 {img.size}")
        h1 = rects["h1"]
        bar_y = int((h1["y"] + h1["h"] + 34 + 1.5) * 2)
        bar = luma(img.load()[1080, bar_y])
        check(bar < PAPER_MIN_LUMA, f"B 分隔条在 (1080,{bar_y}) 有墨迹 luma={bar:.0f}")
        gap = luma(img.load()[900, bar_y])
        check(gap >= PAPER_MIN_LUMA, f"B 分隔条外侧 (900,{bar_y}) 是纸底 luma={gap:.0f}")
        for label, r in (("主标题", h1), ("副标题", rects["p"])):
            x0, x1 = dark_columns(img, int(r["y"] * 2), int((r["y"] + r["h"]) * 2))
            mid = (x0 + x1) / 2
            check(abs(mid - 1080) <= 8, f"B {label}居中 中点={mid:.0f} (目标 1080±8)")

        # --- 版式 C · 上 ---
        await apply(page, "小字在上大字在下", "上")
        rects = await slot_rects(page)
        img = await export_first_png(page, "slots-C")
        p = rects["p"]
        bar_x = int((p["x"] - 20 + 3) * 2)
        bar_y = int((p["y"] + p["h"] / 2) * 2)
        bar = luma(img.load()[bar_x, bar_y])
        check(bar < PAPER_MIN_LUMA, f"C 眉题竖条在 ({bar_x},{bar_y}) 有墨迹 luma={bar:.0f}")
        x0, _ = dark_columns(img, int(p["y"] * 2), int((p["y"] + p["h"]) * 2))
        check(
            x0 >= int((p["x"] - 20) * 2) - 4,
            f"C 眉题带最左墨迹 x={x0}（竖条起点 {int((p['x'] - 20) * 2)}）",
        )

        # --- 版式 A · 上（回归：不受槽位 CSS 影响） ---
        await apply(page, "左对齐叠排", "上")
        rects = await slot_rects(page)
        img = await export_first_png(page, "slots-A")
        h1 = rects["h1"]
        x0, _ = dark_columns(img, int(h1["y"] * 2), int((h1["y"] + h1["h"]) * 2))
        check(abs(x0 - 240) <= 12, f"A 主标题左缘 x={x0}（内容区左缘 240±12）")

        await browser.close()

    if FAILURES:
        print(f"\n{len(FAILURES)} 项失败")
        sys.exit(1)
    print("\n封面槽位导出像素验证全部通过")


asyncio.run(main())
