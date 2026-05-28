"""Verify the export bug: trigger zip export, unzip, check each PNG for blank pages.

A blank page produced by html2canvas race condition will be either:
- mostly transparent (no bg image rendered)
- or just bg+overlay without content (no text/logo)

We detect by sampling: count of unique colors, presence of dark pixels (text).
"""
import asyncio
import io
import shutil
import struct
import sys
import zipfile
from pathlib import Path

from playwright.async_api import async_playwright

OUT = Path("/tmp/export_bug_out")
OUT.mkdir(exist_ok=True)


def png_size(path: Path):
    with open(path, "rb") as f:
        head = f.read(24)
    # PNG IHDR width/height at offset 16
    w, h = struct.unpack(">II", head[16:24])
    return w, h


def analyze_png(path: Path):
    """Quick heuristic: load via PIL if available, otherwise just size."""
    try:
        from PIL import Image
    except Exception:
        return {"size": png_size(path), "pil": None}
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    # sample 100 evenly-spaced pixels
    samples = []
    for y in range(5, h, max(h // 10, 1)):
        for x in range(5, w, max(w // 10, 1)):
            samples.append(img.getpixel((x, y)))
            if len(samples) >= 100:
                break
        if len(samples) >= 100:
            break
    # count "dark" pixels (text-like): any RGB channel < 100 and alpha > 128
    dark = sum(1 for r, g, b, a in samples if a > 128 and min(r, g, b) < 100)
    unique = len(set(samples))
    # transparent ratio
    transparent = sum(1 for *_, a in samples if a < 64)
    return {
        "size": (w, h),
        "samples": len(samples),
        "dark": dark,
        "unique_colors": unique,
        "transparent": transparent,
    }


async def run_once(round_idx: int):
    print(f"\n=== Round {round_idx} ===")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(accept_downloads=True)
        page = await ctx.new_page()
        await page.goto("http://localhost:4173", wait_until="networkidle")
        # ensure fonts/images settled
        await page.wait_for_timeout(2000)

        # click export button
        await page.get_by_role("button", name="导出 PNG").click()
        # wait for dialog input
        await page.wait_for_selector('input[type="text"]', timeout=5000)
        # set filename
        await page.fill('input[type="text"]', f"bugtest-r{round_idx}")
        # click confirm button (导出 in dialog)
        # the dialog has another "导出" button — pick the one inside dialog
        async with page.expect_download(timeout=60000) as dl_info:
            # second 导出 button is the confirm
            buttons = await page.get_by_role("button", name="导出").all()
            await buttons[-1].click()
        download = await dl_info.value
        zip_path = OUT / f"r{round_idx}.zip"
        await download.save_as(str(zip_path))
        print(f"saved zip: {zip_path} ({zip_path.stat().st_size} bytes)")
        await browser.close()

    extract_dir = OUT / f"r{round_idx}"
    if extract_dir.exists():
        shutil.rmtree(extract_dir)
    extract_dir.mkdir()
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(extract_dir)

    results = []
    for png in sorted(extract_dir.glob("*.png")):
        info = analyze_png(png)
        results.append((png.name, png.stat().st_size, info))
        marker = ""
        if info.get("pil") is None and not info.get("samples"):
            marker = "(no PIL)"
        elif info.get("dark", 0) < 3:
            marker = "  ⚠️ BLANK (no dark pixels — no text rendered)"
        print(f"  {png.name}: {png.stat().st_size:>10,} bytes  {info}  {marker}")
    return results


async def main():
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    for i in range(1, rounds + 1):
        await run_once(i)


asyncio.run(main())
