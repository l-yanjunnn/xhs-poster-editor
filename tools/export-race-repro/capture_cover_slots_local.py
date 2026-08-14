"""封面槽位本地目检截图。

用法：
    cd app && ./node_modules/.bin/vite preview --port 4173
    python3 tools/export-race-repro/capture_cover_slots_local.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/"
REPO = Path(__file__).resolve().parents[2]
SHOTS = REPO / "docs" / "screenshots" / "cover-slots-local"
SHOTS.mkdir(parents=True, exist_ok=True)


async def click_button_with_text(page, text: str) -> None:
    button = page.get_by_role("button", name=text, exact=False).first
    await button.click()
    await page.wait_for_timeout(400)


async def main() -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        await page.goto(URL, wait_until="domcontentloaded", timeout=120_000)
        await page.wait_for_selector(".page", timeout=60_000)
        await page.wait_for_timeout(2500)

        theme_trigger = page.locator(".inspector-card").get_by_role("combobox").first
        await theme_trigger.click()
        await page.get_by_role("option", name="公考·山水卷").click()
        await page.wait_for_timeout(1200)

        shots = [
            ("01-A-top.png", "左对齐叠排", "上"),
            ("02-B-middle.png", "居中海报", "中"),
            ("03-C-top.png", "小字在上大字在下", "上"),
            ("04-A-middle.png", "左对齐叠排", "中"),
            ("05-A-bottom.png", "左对齐叠排", "下"),
        ]
        for filename, layout, vertical in shots:
            await click_button_with_text(page, layout)
            await page.locator('[aria-label="垂直位置"]').get_by_role(
                "button", name=vertical, exact=True
            ).click()
            await page.wait_for_timeout(500)
            await page.screenshot(path=SHOTS / filename)
            await page.locator(".page").first.screenshot(
                path=SHOTS / filename.replace(".png", "-page.png")
            )
            print(f"wrote {filename}")

        await page.locator(".workspace-canvas-pages").evaluate(
            "el => { el.scrollTop = el.scrollHeight }"
        )
        await page.wait_for_timeout(400)
        await page.locator(".page").nth(1).screenshot(path=SHOTS / "06-inner-unchanged.png")
        print("wrote 06-inner-unchanged.png")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
