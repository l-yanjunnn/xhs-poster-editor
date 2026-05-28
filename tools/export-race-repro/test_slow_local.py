"""Test local preview with simulated slow network on image fetches.
This is the closest local repro to the prod-via-proxy bug."""
import asyncio
import shutil
import zipfile
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image

OUT = Path("/tmp/slow_local")
if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()


async def slow_route(route):
    # add jittery 800ms delay to all builtin-assets fetches (simulate Cloudflare CDN latency)
    if "builtin-assets" in route.request.url:
        await asyncio.sleep(0.8)
    await route.continue_()


async def run_round(round_idx: int):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            accept_downloads=True,
        )
        page = await ctx.new_page()
        await page.route("**/*", slow_route)
        await page.goto("http://localhost:4173/", wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        await page.get_by_role("button", name="导出 PNG").click()
        await page.wait_for_selector('input[type="text"]', timeout=10000)
        await page.fill('input[type="text"]', f"slow-r{round_idx}")
        async with page.expect_download(timeout=180000) as dl_info:
            buttons = await page.get_by_role("button", name="导出").all()
            await buttons[-1].click()
        download = await dl_info.value
        zip_path = OUT / f"r{round_idx}.zip"
        await download.save_as(str(zip_path))
        await browser.close()
    extract_dir = OUT / f"r{round_idx}"
    extract_dir.mkdir()
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(extract_dir)
    print(f"\n=== Round {round_idx} ===")
    bad = 0
    for png in sorted(extract_dir.glob("*.png")):
        im = Image.open(png)
        sz = png.stat().st_size
        ok = im.size == (2160, 3840)
        if not ok:
            bad += 1
        marker = "" if ok else f"  ⚠️ WRONG SIZE (got {im.size}, expect (2160, 3840))"
        print(f"  {png.name}: file={sz:>10,}  px={im.size}{marker}")
    return bad


async def main():
    total_bad = 0
    for i in range(1, 6):
        total_bad += await run_round(i)
    print(f"\n=== Summary: {total_bad} bad PNGs across 5 rounds (25 PNGs total) ===")


asyncio.run(main())
