"""Hit a production URL, export multiple rounds, dump PNG sizes.

Usage: python3 test_prod.py [URL] [ROUNDS] [EXPECTED_VERSION]
"""
import asyncio
import shutil
import sys
import zipfile
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image

OUT = Path("/tmp/prod_test")
if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()
URL = (
    sys.argv[1]
    if len(sys.argv) > 1
    else "https://xhs-poster-editor.l-yanjunnn.workers.dev/"
)
ROUNDS = int(sys.argv[2]) if len(sys.argv) > 2 else 5
EXPECTED_VERSION = sys.argv[3] if len(sys.argv) > 3 else "v1.5.0"
USE_PROXY = "workers.dev" in URL


async def run_round(round_idx: int):
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            proxy={"server": "http://127.0.0.1:7897"} if USE_PROXY else None,
        )
        ctx = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            accept_downloads=True,
        )
        page = await ctx.new_page()
        # capture JS hash to know which version
        await page.goto(
            URL,
            wait_until="commit",
            timeout=120000,
        )
        await page.wait_for_load_state("domcontentloaded", timeout=120000)
        # find JS hash
        js_hash = await page.evaluate("""() => {
          const s = Array.from(document.scripts).find(s => s.src.includes('index-'))
          return s ? s.src.match(/index-([A-Za-z0-9]+)\\.js/)?.[1] : null
        }""")
        await page.wait_for_timeout(8000)  # let fonts/images load
        version = (await page.locator(".topbar-version").text_content()) or ""
        assert version == EXPECTED_VERSION, f"unexpected version: {version}"
        await page.get_by_role("button", name="导出 PNG").click()
        await page.wait_for_selector('input[type="text"]', timeout=10000)
        await page.fill('input[type="text"]', f"prod-r{round_idx}")
        async with page.expect_download(timeout=120000) as dl_info:
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
    print(f"\n=== Round {round_idx} (js hash={js_hash}) ===")
    for png in sorted(extract_dir.glob("*.png")):
        im = Image.open(png)
        sz = png.stat().st_size
        # is the PNG size correct (2160x3600 = 9:15)?
        ok = im.size == (2160, 3600)
        marker = "" if ok else f"  ⚠️ WRONG SIZE (got {im.size}, expect (2160, 3600))"
        print(f"  {png.name}: file={sz:>10,}  px={im.size}{marker}")


async def main():
    print(f"Target: {URL}, rounds={ROUNDS}")
    for i in range(1, ROUNDS + 1):
        await run_round(i)


asyncio.run(main())
