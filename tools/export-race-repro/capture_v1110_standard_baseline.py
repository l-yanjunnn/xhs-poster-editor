"""Capture the immutable v1.10.2 standard-spacing visual baseline.

Run this before implementing v1.11.0 cover subtitle spacing:

    cd app
    ./node_modules/.bin/vite preview --host 127.0.0.1 --port 4173 --strictPort
    cd ..
    python3 tools/export-race-repro/capture_v1110_standard_baseline.py

The script intentionally knows nothing about the future spacing control. It records
the existing computed spacing, sealed snapshot, preview screenshot, and exported
2160 x 3600 first page for each cover layout. The output directory is write-once so
rerunning cannot silently replace the historical baseline.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path

from PIL import Image
from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError, async_playwright


URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173/"
REPO = Path(__file__).resolve().parents[2]
OUT = (
    REPO
    / "docs"
    / "screenshots"
    / "v1.11.0"
    / "standard-baseline-v1.10.2-real-fixture"
)
FIXTURE = "「看起来」高分和「实际高分」是两件事情"
LAYOUTS = (
    ("stack-left", "左对齐叠排"),
    ("poster-center", "居中海报"),
    ("kicker-above", "小字在上大字在下"),
)


async def wait_for_sealed(page: Page) -> None:
    await page.wait_for_function(
        """() => {
          const first = document.querySelector('.page');
          return first?.dataset.layoutSnapshotPhase === 'sealed'
            && ['ready', 'ready-with-warnings'].includes(first.dataset.layoutState || '');
        }""",
        timeout=60_000,
    )


async def select_layout(page: Page, accessible_name: str) -> None:
    await page.get_by_role("button", name=accessible_name, exact=False).first.click()
    await page.locator('[aria-label="垂直位置"]').get_by_role(
        "button", name="中", exact=True
    ).click()
    await wait_for_sealed(page)


async def replace_cover_subtitle(page: Page) -> None:
    subtitle = page.locator(
        ".tiptap-editor .ProseMirror > h1:first-of-type + p"
    ).first
    await subtitle.evaluate(
        """(element) => {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(element);
          selection.removeAllRanges();
          selection.addRange(range);
        }"""
    )
    await page.keyboard.insert_text(FIXTURE)
    await page.wait_for_function(
        """(fixture) => document.querySelector(
          '.tiptap-editor .ProseMirror > h1:first-of-type + p'
        )?.textContent === fixture""",
        arg=FIXTURE,
        timeout=10_000,
    )
    await wait_for_sealed(page)


async def export_first_page(page: Page, slug: str) -> bytes:
    export_button = page.get_by_role("button", name="导出 PNG")
    await page.wait_for_function(
        "!document.querySelector('.topbar-export')?.disabled", timeout=30_000
    )
    await export_button.click()
    dialog = page.get_by_role("dialog")
    await dialog.get_by_label("文档主题", exact=True).fill(f"v1110-standard-{slug}")
    await dialog.locator("button").filter(has_text=re.compile(r"兼容 ZIP")).first.click()
    await dialog.get_by_label("ZIP 默认名称", exact=True).fill(f"{slug}.zip")
    page_count = await page.locator(".page").count()
    export_all = dialog.get_by_role(
        "button", name=f"导出全部 {page_count} 张", exact=True
    ).last
    try:
        async with page.expect_download(timeout=15_000) as download_info:
            await export_all.click()
    except PlaywrightTimeoutError:
        force_export = page.get_by_role(
            "button", name="按当前预览强制导出", exact=True
        )
        if not await force_export.is_visible():
            raise
        async with page.expect_download(timeout=120_000) as download_info:
            await force_export.click()
    download = await download_info.value
    with tempfile.TemporaryDirectory(prefix="xhs-v1110-standard-") as temp_dir:
        zip_path = Path(temp_dir) / f"{slug}.zip"
        await download.save_as(zip_path)
        with zipfile.ZipFile(zip_path) as archive:
            png_names = sorted(
                (name for name in archive.namelist() if name.lower().endswith(".png")),
                key=lambda name: int(re.match(r"^(\d+)_", Path(name).name).group(1)),
            )
            first_page = archive.read(png_names[0])
    await dialog.wait_for(state="hidden")
    return first_page


async def main() -> None:
    if OUT.exists() and any(OUT.iterdir()):
        raise RuntimeError(f"Refusing to overwrite baseline directory: {OUT}")
    OUT.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, object] = {
        "sourceVersion": "1.10.2",
        "sourceCommit": "e74a815ca7eca268f9589498a92c03529020cc5e",
        "theme": "公考·山水卷",
        "vertical": "middle",
        "viewport": {"width": 1440, "height": 900},
        "layouts": {},
    }

    async with async_playwright() as playwright:
        # Use the installed stable Chrome so a Python Playwright package update cannot
        # invalidate the baseline run merely because its matching cached shell is absent.
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900}, accept_downloads=True
        )
        await context.add_init_script(
            "Object.defineProperty(window, 'showSaveFilePicker', "
            "{ configurable: true, value: undefined })"
        )
        page = await context.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=120_000)
        await page.wait_for_selector(".page", timeout=60_000)
        await wait_for_sealed(page)
        version = (await page.locator(".topbar-version").inner_text()).strip()
        if version != "v1.10.2":
            raise AssertionError(f"Expected v1.10.2, got {version}")
        bundle = await page.locator('script[type="module"][src]').get_attribute("src")
        if not bundle or not bundle.endswith("/assets/index-Bdq1zB4M.js"):
            raise AssertionError(f"Unexpected v1.10.2 bundle: {bundle}")

        theme_trigger = page.locator(".inspector-card").get_by_role("combobox").first
        await theme_trigger.click()
        await page.get_by_role("option", name="公考·山水卷").click()
        await wait_for_sealed(page)
        await replace_cover_subtitle(page)
        manifest["fixture"] = FIXTURE
        manifest["versionLabel"] = version
        manifest["bundle"] = bundle

        for slug, accessible_name in LAYOUTS:
            await select_layout(page, accessible_name)
            geometry = await page.evaluate(
                """() => {
                  const page = document.querySelector('.page');
                  const h1 = page?.querySelector('.content > h1:first-of-type');
                  const subtitle = h1?.nextElementSibling;
                  if (!(page instanceof HTMLElement) || !(subtitle instanceof HTMLElement)) {
                    throw new Error('Cover subtitle not found');
                  }
                  const pageRect = page.getBoundingClientRect();
                  const rect = subtitle.getBoundingClientRect();
                  const scale = pageRect.width / 1080;
                  const atoms = Array.from(
                    subtitle.querySelectorAll(':scope > .dtl-atom')
                  ).map((atom) => ({
                    line: Number(atom.dataset.layoutLine),
                    text: atom.textContent,
                    x: Number(atom.dataset.layoutX),
                    advance: Number(atom.dataset.layoutAdvance),
                    gap: Number(atom.dataset.layoutGap),
                  }));
                  const lines = Array.from(subtitle.querySelectorAll('.dtl-line')).map((line) => {
                    const lineRect = line.getBoundingClientRect();
                    const lineIndex = Number(line.dataset.layoutLine);
                    return {
                      line: lineIndex,
                      x: (lineRect.left - pageRect.left) / scale,
                      y: (lineRect.top - pageRect.top) / scale,
                      width: lineRect.width / scale,
                      text: atoms
                        .filter((atom) => atom.line === lineIndex)
                        .map((atom) => atom.text)
                        .join(''),
                    };
                  });

                  // The sealed block deliberately resets CSS letter-spacing to zero;
                  // probe the same selector without deterministic materialization to
                  // record the v1.10.2 source value that was baked into atom geometry.
                  const probe = document.createElement('div');
                  probe.className = page.className;
                  for (const [key, value] of Object.entries(page.dataset)) {
                    if (value !== undefined) probe.dataset[key] = value;
                  }
                  probe.style.cssText = [
                    'position:fixed', 'left:-10000px', 'top:0',
                    'width:1080px', 'height:1800px', 'visibility:hidden'
                  ].join(';');
                  const probeContent = document.createElement('div');
                  probeContent.className = 'content';
                  const probeH1 = document.createElement('h1');
                  probeH1.textContent = '基线标题';
                  const probeSubtitle = document.createElement('p');
                  probeSubtitle.textContent = subtitle.textContent;
                  probeContent.append(probeH1, probeSubtitle);
                  probe.append(probeContent);
                  document.body.append(probe);
                  const sourceStyle = getComputedStyle(probeSubtitle);
                  const sourceLetterSpacing = sourceStyle.letterSpacing;
                  const sourceFontSize = sourceStyle.fontSize;
                  probe.remove();

                  return {
                    text: subtitle.textContent,
                    sourceLetterSpacing,
                    sourceFontSize,
                    materializedLetterSpacing: getComputedStyle(subtitle).letterSpacing,
                    rect: {
                      x: (rect.left - pageRect.left) / scale,
                      y: (rect.top - pageRect.top) / scale,
                      width: rect.width / scale,
                      height: rect.height / scale,
                    },
                    lines,
                    atoms,
                    snapshotId: page.dataset.layoutSnapshot,
                    layoutState: page.dataset.layoutState,
                    layoutPhase: page.dataset.layoutSnapshotPhase,
                  };
                }"""
            )
            preview_path = OUT / f"standard-{slug}-preview.png"
            await page.locator(".page").first.screenshot(path=preview_path)

            png_bytes = await export_first_page(page, slug)
            png_path = OUT / f"standard-{slug}-2160x3600.png"
            png_path.write_bytes(png_bytes)
            with Image.open(io.BytesIO(png_bytes)) as image:
                size = image.size
            if size != (2160, 3600):
                raise AssertionError(f"Unexpected PNG size for {slug}: {size}")

            manifest["layouts"][slug] = {
                **geometry,
                "preview": preview_path.name,
                "previewSha256": hashlib.sha256(preview_path.read_bytes()).hexdigest(),
                "png": png_path.name,
                "pngSha256": hashlib.sha256(png_bytes).hexdigest(),
                "pngSize": list(size),
            }
            print(
                f"captured {slug}: {geometry['sourceLetterSpacing']} / "
                f"{geometry['snapshotId']}"
            )

        await browser.close()

    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"baseline written to {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
